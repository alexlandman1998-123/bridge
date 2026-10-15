begin;

-- Shared capture and completion rules. No existing journey is rewritten here.
create function rental_private.landlord_profile_type(p jsonb) returns text
language sql immutable set search_path='' as $$
 select case when v in ('individual','multiple_owners','company','close_corporation','trust') then v else '' end
 from (select case when p->>'type' in ('foreign_owner','other_entity') then p->>'legalStructure' else p->>'type' end v) x;
$$;
create function rental_private.landlord_profile_representative(p jsonb) returns boolean
language sql immutable set search_path='' as $$
 select rental_private.landlord_profile_type(p) in ('company','close_corporation','trust') or p->>'hasRepresentative'='yes'
 or (coalesce(btrim(p->>'hasRepresentative'),'')='' and coalesce(btrim(p->>'authorisedSignatoryName'),'')<>'');
$$;
create function rental_private.landlord_profile_field_visible(k text,p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare t text:=rental_private.landlord_profile_type(p);
begin
 if k='legalStructure' then return p->>'type' in ('foreign_owner','other_entity'); end if;
 if k='otherEntityDescription' then return p->>'type'='other_entity'; end if;
 if k in ('idNumber','nationality','maritalStatus') then return t='individual'; end if;
 if k='maritalRegime' then return t='individual' and lower(btrim(p->>'maritalStatus'))='married'; end if;
 if k in ('spouseName','spouseIdNumber') then return t='individual' and lower(btrim(p->>'maritalStatus'))='married' and p->>'maritalRegime'='in_community'; end if;
 if k in ('registrationNumber','tradingName') then return t in ('company','close_corporation','trust'); end if;
 if k='vatNumber' then return p->>'vatRegistered'='yes' or (coalesce(btrim(p->>'vatRegistered'),'')='' and coalesce(btrim(p->>'vatNumber'),'')<>''); end if;
 if k='hasRepresentative' then return t<>'' and t not in ('company','close_corporation','trust'); end if;
 if k like 'authorisedSignatory%' or k in ('authorityBasis','resolutionDate') then return rental_private.landlord_profile_representative(p); end if;
 return true;
end; $$;
create function rental_private.landlord_profile_errors(p jsonb,p_phase text default 'draft') returns text[]
language plpgsql immutable set search_path='' as $$
declare errors text[]:=array[]::text[]; t text:=rental_private.landlord_profile_type(p); submit boolean:=p_phase='submission'; f jsonb; k text; label text; v text; person jsonb; people jsonb; count_people integer; share numeric; total numeric:=0; missing_share boolean:=false; dt date;
begin
 if coalesce(p->>'type','') not in ('individual','multiple_owners','company','close_corporation','trust','foreign_owner','other_entity') then errors:=array_append(errors,'Choose a supported landlord type.'); end if;
 if coalesce(btrim(p->>'name'),'')='' then errors:=array_append(errors,'Landlord or entity name is required.'); end if;
 if coalesce(btrim(p->>'email'),'')='' and coalesce(btrim(p->>'phone'),'')='' then errors:=array_append(errors,'Add a landlord email or phone number.'); end if;
 for f in select value from jsonb_array_elements($fields$[["legalStructure","Legal structure",[["individual","Individual"],["company","Company"],["trust","Trust"],["close_corporation","Close corporation"],["multiple_owners","Multiple owners"],["unresolved","Needs agent review"]]],["otherEntityDescription","Describe the entity or ownership arrangement"],["name","Full name / entity name"],["email","Email","email"],["phone","Phone","tel"],["residentialAddress","Residential / registered address"],["idNumber","ID / passport number"],["nationality","Nationality"],["taxNumber","Tax number"],["maritalStatus","Marital status",[["single","Single"],["married","Married"],["divorced","Divorced"],["widowed","Widowed"],["other","Other / prefer not to say"]]],["maritalRegime","Marital regime",[["in_community","In community of property"],["out_of_community","Out of community of property"],["foreign","Foreign marriage regime"],["unknown","To be confirmed"]]],["spouseName","Spouse name"],["spouseIdNumber","Spouse ID / passport number"],["registrationNumber","Company / trust registration number"],["tradingName","Trading name"],["country","Country of registration / residence"],["vatRegistered","VAT registered?",[["yes","Yes"],["no","No"]]],["vatNumber","VAT number"],["hasRepresentative","Someone else authorised to sign?",[["yes","Yes"],["no","No"]]],["authorisedSignatoryName","Authorised signatory"],["authorisedSignatoryCapacity","Signing capacity"],["authorisedSignatoryIdNumber","Signatory ID / passport number"],["authorisedSignatoryNationality","Signatory nationality"],["authorisedSignatoryEmail","Signatory email","email"],["authorisedSignatoryPhone","Signatory phone","tel"],["authorityBasis","Authority / resolution reference"],["resolutionDate","Resolution date","date"],["notes","Notes","textarea"]]$fields$::jsonb) loop
  k:=f->>0; label:=lower(f->>1); v:=coalesce(btrim(p->>k),'');
  if not coalesce(rental_private.landlord_profile_field_visible(k,p),false) then continue; end if;
  if f->>2='email' and v<>'' and v !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then errors:=array_append(errors,'Enter a valid '||label||'.'); end if;
  if f->>2='date' and v<>'' then
   dt:=null;
   begin if v ~ '^\d{4}-\d{2}-\d{2}$' then dt:=v::date; end if; exception when others then dt:=null; end;
   if dt is null or to_char(dt,'YYYY-MM-DD')<>v then errors:=array_append(errors,'Enter a valid '||label||'.'); end if;
  end if;
  if jsonb_typeof(f->2)='array' and v<>'' and (submit or k not in ('maritalStatus','maritalRegime')) and not exists(select 1 from jsonb_array_elements(f->2) o where o->>0=v) then errors:=array_append(errors,'Choose a valid '||label||'.'); end if;
 end loop;
 if p->'people' is not null and p->'people'<>'null'::jsonb and jsonb_typeof(p->'people')<>'array' then errors:=array_append(errors,'Choose a valid list of relevant people.'); end if;
 people:=case when jsonb_typeof(p->'people')='array' then p->'people' else '[]'::jsonb end; count_people:=jsonb_array_length(people);
 for person in select value from jsonb_array_elements(people) loop
  v:=coalesce(btrim(person->>'email'),'');
  if v<>'' and v !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then errors:=array_append(errors,'Enter a valid email for each person.'); end if;
  v:=coalesce(btrim(person->>'ownershipShare'),''); share:=null;
  if v<>'' then begin share:=v::numeric; exception when others then share:=null; end; end if;
  if t in ('multiple_owners','company','close_corporation') and v<>'' and (share is null or share='NaN'::numeric or share<0 or share>100) then errors:=array_append(errors,'Ownership shares must be between 0 and 100%.'); end if;
  if person->'signingAuthority' is not null and person->'signingAuthority'<>'null'::jsonb and jsonb_typeof(person->'signingAuthority')<>'boolean' then errors:=array_append(errors,'Choose whether each person is authorised to sign.'); end if;
 end loop;
 if submit then
  if t='' then errors:=array_append(errors,'Choose the underlying legal structure, or ask your agent to resolve it before submission.'); end if;
  if p->>'type'='foreign_owner' and coalesce(btrim(p->>'country'),'')='' then errors:=array_append(errors,'Enter the foreign owner’s country of registration or residence.'); end if;
  if p->>'type'='other_entity' and coalesce(btrim(p->>'otherEntityDescription'),'')='' then errors:=array_append(errors,'Describe the other entity or ownership arrangement.'); end if;
  if coalesce(btrim(p->>'residentialAddress'),'')='' then errors:=array_append(errors,'Enter the landlord’s residential or registered address.'); end if;
  if t='individual' and coalesce(btrim(p->>'idNumber'),'')='' then errors:=array_append(errors,'Enter the landlord’s ID or passport number.'); end if;
  if t='individual' and lower(btrim(p->>'maritalStatus'))='married' then
   if coalesce(btrim(p->>'maritalRegime'),'') in ('','unknown') then errors:=array_append(errors,'Confirm the marital regime before submission.'); end if;
   if p->>'maritalRegime'='in_community' and (coalesce(btrim(p->>'spouseName'),'')='' or coalesce(btrim(p->>'spouseIdNumber'),'')='') then errors:=array_append(errors,'Complete the spouse name and ID or passport number.'); end if;
  end if;
  if p->>'vatRegistered'='yes' and coalesce(btrim(p->>'vatNumber'),'')='' then errors:=array_append(errors,'Enter the VAT number, or confirm the landlord is not VAT registered.'); end if;
  if t in ('company','close_corporation','trust') and coalesce(btrim(p->>'registrationNumber'),'')='' then errors:=array_append(errors,'Enter the entity or trust registration number.'); end if;
  if coalesce(rental_private.landlord_profile_representative(p),false) then
   if exists(select 1 from unnest(array['authorisedSignatoryName','authorisedSignatoryCapacity','authorisedSignatoryIdNumber','authorityBasis']) x where coalesce(btrim(p->>x),'')='') then errors:=array_append(errors,'Complete the signatory name, capacity, ID or passport and authority reference.'); end if;
   if coalesce(btrim(p->>'authorisedSignatoryEmail'),'')='' and coalesce(btrim(p->>'authorisedSignatoryPhone'),'')='' then errors:=array_append(errors,'Add a signatory email or phone number.'); end if;
  end if;
  if t in ('company','close_corporation','trust') and count_people=0 then errors:=array_append(errors,'Record the relevant directors, members or trustees and ownership/control parties.'); end if;
  if t='multiple_owners' and count_people<2 then errors:=array_append(errors,'Record each owner, including the primary owner (at least two owners).'); end if;
  for person in select value from jsonb_array_elements(people) loop
   if exists(select 1 from unnest(array['name','idNumber','residentialAddress']) x where coalesce(btrim(person->>x),'')='') or (coalesce(btrim(person->>'role'),'')='' and coalesce(btrim(person->>'capacity'),'')='') then errors:=array_append(errors,'Complete each person’s name, role, ID or passport and residential address, or remove their card.'); end if;
   if t='multiple_owners' then
    v:=coalesce(btrim(person->>'ownershipShare'),'');
    if v='' then missing_share:=true; else begin total:=total+v::numeric; exception when others then total:='NaN'::numeric; end; end if;
   end if;
  end loop;
  if t='multiple_owners' and count_people>=2 then
   if missing_share then errors:=array_append(errors,'Enter each owner’s ownership share.'); elsif total<>'NaN'::numeric and abs(total-100)>0.001 then errors:=array_append(errors,'The owners’ shares must total 100%.'); end if;
   if not exists(select 1 from jsonb_array_elements(people) x where x->'signingAuthority'='true'::jsonb) and not coalesce(rental_private.landlord_profile_representative(p),false) then errors:=array_append(errors,'Confirm an authorised signer for the multiple owners.'); end if;
  end if;
 end if;
 return coalesce((select array_agg(e order by first_position) from (select e,min(n) first_position from unnest(errors) with ordinality x(e,n) group by e) unique_errors),array[]::text[]);
end; $$;

-- Reuse the existing document matrix; resolve classification before evaluating
-- it, and fingerprint ownership/control changes so evidence is reviewed again.
alter function rental_private.landlord_definitions(jsonb) rename to landlord_definitions_before_shared_rules;
create function rental_private.landlord_definitions(data jsonb)
returns table(subject_id text,scope_key text,purpose text,required boolean,fingerprint jsonb)
language plpgsql immutable set search_path='' as $$
declare p jsonb:=coalesce(data->'profile','{}'); t text:=rental_private.landlord_profile_type(p); canonical jsonb; people jsonb; owners jsonb; legal jsonb; rights jsonb; property jsonb; row record;
identity_keys text[]:=array['firstName','lastName','name','identityType','identityNumber','idNumber','nationality','dateOfBirth','role','capacity'];
begin
 if t='' then return; end if;
 people:=coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(p->'people','[]')) x where coalesce(btrim(x->>'name'),'')<>'' and coalesce(x->>'id','')<>'' and x->>'id' not in ('primary','entity','signatory')),'[]');
 canonical:=p||jsonb_build_object('type',t,'people',people,'idNumber',case when t='individual' then coalesce(p->>'idNumber','') else '' end,'nationality',case when t='individual' then coalesce(p->>'nationality','') else '' end,'registrationNumber',case when t in ('company','close_corporation','trust') then coalesce(p->>'registrationNumber','') else '' end);
 legal:=rental_private.pick(canonical,array['type','name','idNumber','registrationNumber','country','nationality']);
 if p->>'type' in ('foreign_owner','other_entity') then legal:=legal||rental_private.pick(p,array['type','legalStructure','otherEntityDescription']); end if;
 owners:=coalesce((select jsonb_agg(jsonb_build_object('id',x->>'id')||rental_private.pick(x,identity_keys)||jsonb_build_object('ownershipShare',case when t in ('multiple_owners','company','close_corporation') then coalesce(x->'ownershipShare','""'::jsonb) else '""'::jsonb end,'signingAuthority',coalesce(x->'signingAuthority'='true'::jsonb,false)) order by x->>'id') from jsonb_array_elements(people) x),'[]');
 for row in select * from rental_private.landlord_definitions_before_shared_rules(jsonb_set(data,'{profile}',canonical)) loop
  if t='multiple_owners' and row.subject_id='primary' and row.scope_key='identity' then continue; end if;
  subject_id:=row.subject_id; scope_key:=row.scope_key; purpose:=row.purpose; required:=row.required; fingerprint:=row.fingerprint;
  if fingerprint ? 'type' then fingerprint:=fingerprint||legal; end if;
  if purpose='beneficial_ownership' then fingerprint:=fingerprint||jsonb_build_object('people',owners); end if;
  if purpose='co_owner_authority' then fingerprint:=fingerprint||jsonb_build_object('owners',owners); end if;
  return next;
 end loop;
 if t not in ('company','close_corporation','trust') and rental_private.landlord_profile_representative(p) then
  subject_id:='signatory'; scope_key:='identity'; purpose:='identity'; required:=true; fingerprint:=rental_private.pick(p,array['authorisedSignatoryName','authorisedSignatoryCapacity','authorisedSignatoryIdNumber','authorisedSignatoryNationality']); return next;
  for property in select value from jsonb_array_elements(coalesce(data->'portfolio','[]')) loop
   if coalesce(property->>'id','')='' then continue; end if;
   rights:=legal||jsonb_build_object('propertyId',coalesce(property->>'canonicalPropertyId',''),'ownershipType',coalesce(property->>'ownershipType',''),'address',coalesce(property->>'address',''),'unitNumber',coalesce(property->>'unitNumber',''),'complexName',coalesce(property->>'complexName',''));
   subject_id:='entity'; scope_key:='property:'||(property->>'id'); purpose:='signing_authority'; fingerprint:=rights||jsonb_build_object('authorityBasis',coalesce(p->>'authorityBasis',''),'signatory',coalesce(p->>'authorisedSignatoryName',''),'signatoryId',coalesce(p->>'authorisedSignatoryIdNumber',''),'capacity',coalesce(p->>'authorisedSignatoryCapacity','')); return next;
  end loop;
 end if;
end; $$;

-- Keep the existing locking, version, scope, declaration and consistency guards.
alter function public.rental_landlord_onboarding_command(uuid,integer,text,jsonb,jsonb,text,uuid) rename to rental_landlord_onboarding_command_before_shared_rules;
revoke all on function public.rental_landlord_onboarding_command_before_shared_rules(uuid,integer,text,jsonb,jsonb,text,uuid) from public,anon,authenticated,service_role;
create function public.rental_landlord_onboarding_command(p_lead_id uuid,p_expected_version integer,p_command text,p_payload jsonb,p_scope jsonb,p_source text,p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.leads; discovery jsonb; errors text[];
begin
 perform pg_advisory_xact_lock(hashtextextended(p_scope->>'organisation_id',0));
 select * into l from public.leads where lead_id=p_lead_id for update;
 if not found or l.organisation_id::text is distinct from p_scope->>'organisation_id' then raise exception 'Landlord unavailable in this scope'; end if;
 discovery:=rental_private.landlord_discovery(l.raw_enquiry_payload);
 if p_command='save' and p_payload ? 'profile' then
  errors:=rental_private.landlord_profile_errors(coalesce(discovery->'profile','{}')||(p_payload->'profile'),'draft');
 elsif p_command='submit' then
  errors:=rental_private.landlord_profile_errors(discovery->'profile','submission');
  if jsonb_array_length(coalesce(discovery->'portfolio','[]'))=0 or exists(select 1 from jsonb_array_elements(coalesce(discovery->'portfolio','[]')) x where coalesce(btrim(x->>'address'),'')='') then errors:=array_append(errors,'Confirm the address of each property.'); end if;
 end if;
 if coalesce(cardinality(errors),0)>0 then raise exception '%',errors[1]; end if;
 return public.rental_landlord_onboarding_command_before_shared_rules(p_lead_id,p_expected_version,p_command,p_payload,p_scope,p_source,p_actor);
end; $$;
revoke all on function public.rental_landlord_onboarding_command(uuid,integer,text,jsonb,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.rental_landlord_onboarding_command(uuid,integer,text,jsonb,jsonb,text,uuid) to service_role;

-- Compare the resolved legal structure without erasing foreign/other classification.
create or replace function rental_private.sync_landlord_client_profiles(p_client_id uuid,p_source text,p_actor uuid,p_exclude_lead uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare client public.agency_client_profiles; l public.leads; m jsonb; p jsonb; s public.rental_landlord_onboarding; phone_key text; previous_marker text;
begin
  select * into client from public.agency_client_profiles where id=p_client_id;
  if (select count(distinct coalesce(nullif(rental_private.landlord_profile_type(coalesce(lead.raw_enquiry_payload->'rentalCrm',lead.raw_enquiry_payload->'rental_crm',lead.raw_enquiry_payload)->'landlordProfile'),''),coalesce(coalesce(lead.raw_enquiry_payload->'rentalCrm',lead.raw_enquiry_payload->'rental_crm',lead.raw_enquiry_payload)#>>'{landlordProfile,type}','individual')))
      from public.leads lead join public.agency_client_links link on link.source_kind='lead' and link.source_id=lead.lead_id and link.organisation_id=lead.organisation_id
      where link.client_id=p_client_id and coalesce(lead.raw_enquiry_payload->'rentalCrm',lead.raw_enquiry_payload->'rental_crm',lead.raw_enquiry_payload)->>'role'='landlord')>1 then
    raise exception 'Linked landlord profiles use different ownership types; review their Client connections before saving';
  end if;
  previous_marker:=current_setting('app.rental_landlord_client_projection',true);
  perform set_config('app.rental_landlord_client_projection','on',true);
  for l in select lead.* from public.leads lead join public.agency_client_links link on link.source_kind='lead' and link.source_id=lead.lead_id and link.organisation_id=lead.organisation_id
    where link.client_id=p_client_id and (p_exclude_lead is null or lead.lead_id<>p_exclude_lead) and coalesce(lead.raw_enquiry_payload->'rentalCrm',lead.raw_enquiry_payload->'rental_crm',lead.raw_enquiry_payload)->>'role'='landlord' order by lead.lead_id for update of lead loop
    m:=coalesce(l.raw_enquiry_payload->'rentalCrm',l.raw_enquiry_payload->'rental_crm',l.raw_enquiry_payload,'{}');
    p:=coalesce(m->'landlordProfile','{}');
    phone_key:=regexp_replace(coalesce(p->>'phone',''),'[^0-9]','','g');
    if phone_key ~ '^0[0-9]{9}$' then phone_key:='27'||substr(phone_key,2); end if;
    if (btrim(p->>'name'),nullif(lower(btrim(p->>'email')),''),nullif(phone_key,'')) is not distinct from (client.name,client.primary_email,client.primary_phone) then continue; end if;
    p:=p||jsonb_build_object('name',client.name,'email',coalesce(client.primary_email,''),'phone',coalesce(client.primary_phone,''));
    select * into s from public.rental_landlord_onboarding where lead_id=l.lead_id for update;
    perform public.rental_landlord_onboarding_command(l.lead_id,coalesce(s.version,0),'save',jsonb_build_object('profile',p,'expectedDiscovery',rental_private.landlord_discovery(l.raw_enquiry_payload)),jsonb_build_object('organisation_id',l.organisation_id,'branch_id',l.branch_id), p_source,p_actor);
  end loop;
  perform set_config('app.rental_landlord_client_projection',coalesce(previous_marker,''),true);
end; $$;
revoke all on function rental_private.sync_landlord_client_profiles(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;



-- All helpers remain private; only the versioned, scoped server command is callable.
revoke all on function rental_private.landlord_profile_type(jsonb),rental_private.landlord_profile_representative(jsonb),rental_private.landlord_profile_field_visible(text,jsonb),rental_private.landlord_profile_errors(jsonb,text),rental_private.landlord_definitions(jsonb),rental_private.landlord_definitions_before_shared_rules(jsonb) from public,anon,authenticated,service_role;
commit;
