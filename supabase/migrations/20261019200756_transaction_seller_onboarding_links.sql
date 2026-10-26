begin;
-- Seller-only capabilities for backfill transactions. No listing, CRM lead,
-- buyer onboarding, signatures or document evidence are created by this flow.
create table seller_save_private.capture_links(
 id uuid primary key default gen_random_uuid(),transaction_id uuid not null references public.transactions(id) on delete cascade,
 token_hash bytea not null unique,recipient_email text not null,primary_person_id uuid,
 created_by uuid not null,expires_at timestamptz not null,active boolean not null default true,
 created_at timestamptz not null default now()
);
create index transaction_seller_capture_links_active_idx on seller_save_private.capture_links(transaction_id) where active;
create table seller_save_private.link_commands(
 mutation_id uuid primary key,transaction_id uuid not null,actor_id uuid not null,
 request jsonb not null,receipt jsonb not null
);
alter table seller_save_private.capture_links enable row level security;
alter table seller_save_private.link_commands enable row level security;
revoke all on seller_save_private.capture_links,seller_save_private.link_commands from public,anon,authenticated,service_role;

-- Same revision and seller model as agent capture. This helper is private;
-- every public bearer entry point validates its scoped capability first.
create function seller_save_private.portal_capture_context(p_tx uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.transactions%rowtype; f public.onboarding_form_data%rowtype;
 p public.transaction_participants%rowtype; roster jsonb; primary_count int; primary_person jsonb;
begin
 select * into t from public.transactions where id=p_tx for update;
 if not found or t.listing_id is not null then raise exception using errcode='42501',message='This seller link is no longer available. Ask your agent for a new link.'; end if;
 select * into f from public.onboarding_form_data where transaction_id=p_tx for update;
 perform 1 from public.transaction_participants where transaction_id=p_tx and role_type='seller' order by id for update;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',participant_name,'email',participant_email,'phone',participant_phone,'updatedAt',updated_at,'removedAt',removed_at) order by id),'[]') into roster
 from public.transaction_participants where transaction_id=p_tx and role_type='seller';
 select count(*),jsonb_agg(person)->0 into primary_count,primary_person from jsonb_array_elements(coalesce(f.form_data#>'{__bridge_transaction_parties,seller,people}','[]')) person where person->>'primaryContact'='true';
 if primary_count=1 then select * into p from public.transaction_participants where id::text=primary_person->>'id' and transaction_id=p_tx and role_type='seller' and removed_at is null; end if;
 if p.id is null and primary_count=0 and (select count(*) from public.transaction_participants where transaction_id=p_tx and role_type='seller' and removed_at is null)=1 then
  select * into p from public.transaction_participants where transaction_id=p_tx and role_type='seller' and removed_at is null;
 end if;
 return jsonb_build_object('details',jsonb_build_object('name',coalesce(t.seller_name,''),'email',coalesce(t.seller_email,''),'phone',coalesce(t.seller_phone,'')),
 'nameEditable',t.seller_type in ('individual','foreign_individual','married_cop','married_anc'),'roster',roster,
 'profile',coalesce(f.form_data#>'{__bridge_transaction_parties,seller}','{}'),
 'revision',jsonb_build_object('transactionId',t.id,'transactionUpdatedAt',t.updated_at,'listingId',null,'onboardingId',null,'onboardingUpdatedAt',null,
 'formId',f.id,'formUpdatedAt',f.updated_at,'participantId',p.id,'participantUpdatedAt',p.updated_at,'sourceContactKey',null,'sellerRoster',encode(extensions.digest(roster::text,'sha256'),'hex')));
end $$;

create function seller_save_private.check_capture_link(p_token text,p_link_id uuid default null,p_tx uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l seller_save_private.capture_links%rowtype; c jsonb;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception using errcode='42501',message='Seller link is invalid or expired.'; end if;
 select * into l from seller_save_private.capture_links where token_hash=extensions.digest(p_token,'sha256');
 if not found or not l.active or l.expires_at<=clock_timestamp() or (p_link_id is not null and l.id<>p_link_id) or (p_tx is not null and l.transaction_id<>p_tx) then raise exception using errcode='42501',message='Seller link is invalid or expired.'; end if;
 c:=seller_save_private.portal_capture_context(l.transaction_id);
 select * into l from seller_save_private.capture_links where id=l.id for update;
 if not l.active or l.expires_at<=clock_timestamp() or lower(trim(c#>>'{details,email}'))<>l.recipient_email or (c#>>'{revision,participantId}')::uuid is distinct from l.primary_person_id then
  raise exception using errcode='42501',message='Seller contact details changed. Ask your agent for a new seller link.';
 end if;
 return jsonb_build_object('context',c,'linkId',l.id,'transactionId',l.transaction_id);
end $$;
create function seller_save_private.save_capture_core(p_tx uuid,p_revision jsonb,p_profile jsonb,p_mutation uuid,p_actor uuid,p_link uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare context jsonb; replay seller_save_private.transaction_receipts%rowtype;
 request jsonb:=jsonb_build_object('command',case when p_link is null then 'seller_capture_v1' else 'seller_self_capture_v1' end,'revision',p_revision,'profile',p_profile);
 receipt jsonb; profile jsonb; fields jsonb; form jsonb; snapshot jsonb;
 people jsonb; person jsonb; primary_person jsonb; total int; primary_count int;
 person_id uuid; primary_id uuid; name text; now_at timestamptz:=clock_timestamp();
 allowed_fields text[]:=ARRAY[
'sellerLegalType','seller_legal_type','legalType','sellerType','ownerEntityType','owner_entity_type',
'ownerStructureType','owner_structure_type','ownershipType','ownership_type','branch','fullName',
'sellerName','sellerFirstName','firstName','sellerSurname','lastName','primaryContactName',
'contactName','email','sellerEmail','phone','sellerPhone','mobile',
'alternativeNumber','alternative_number','alternatePhone','alternate_phone','alternativeContact','preferredContactMethod',
'idNumber','id_number','sellerIdNumber','dateOfBirth','date_of_birth','birthDate',
'nationality','residentialAddress','residential_address','residentialStreet','sellerResidentialAddress','physicalAddress',
'domiciliumAddress','domicilium_address','sellerTaxNumber','incomeTaxNumber','income_tax_number','taxNumber',
'tax_number','taxResident','tax_resident','saResident','sa_resident','vatRegistered',
'vatNumber','occupation','sourceOfFunds','source_of_funds','politicallyExposedPerson','politically_exposed_person',
'politicallyExposedDetails','politically_exposed_details','maritalStatus','maritalRegime','spouseInvolved','sellerOwnershipConfirmed',
'seller_ownership_confirmed','foreignOwnerCountry','foreign_owner_country','foreignPassportNumber','passportNumber','foreignRegistrationNumber',
'foreign_registration_number','foreignResidencyStatus','foreign_residency_status','residencyStatus','companyName','companyRegistrationNumber',
'companyRegisteredAddress','trustName','trustRegistrationNumber','trustRegisteredAddress','otherEntityName','otherEntityRegistrationNumber',
'companyAuthorityBasis','company_authority_basis','companyResolutionDate','company_resolution_date','trustAuthorityBasis','trust_authority_basis',
'trustBeneficiaryClass','deceasedEstateName','estateReferenceNumber','estateReference','executorAuthorityDetails','powerOfAttorneyAuthorityDetails',
'powerOfAttorneyReference','powerOfAttorneyPrincipalName','principalName','powerOfAttorneyPrincipalIdNumber','principalIdNumber','otherAuthorityDetails',
'multipleOwners','owners','companyDirectors','directors','companyBeneficialOwners','trustees',
'trustTrustees','trustFounders','trustBeneficiaries','beneficiaries','executors','executorIdNumber',
'powerOfAttorneyRepresentatives','powerOfAttorneyIdNumber','spouseName','spouseIdNumber','spouseEmail','spousePhone',
'spouseNationality','spouseAddress','spouseCapacity','authorisedSignatoryName','authorisedSignatoryIdNumber','authorisedSignatoryEmail',
'authorisedSignatoryPhone','authorisedSignatoryNationality','authorisedSignatoryAddress','authorisedSignatoryCapacity','authorisedTrusteeName','authorisedTrusteeIdNumber',
'authorisedTrusteeEmail','authorisedTrusteePhone','authorisedTrusteeNationality','authorisedTrusteeAddress','authorisedTrusteeCapacity','companyDirectorName',
'companyDirectorEmail','companyDirectorPhone','trusteeName','trusteeEmail','trusteePhone','executorName',
'executorEmail','executorPhone','powerOfAttorneyName','powerOfAttorneyEmail','powerOfAttorneyPhone','existingBond',
'hasExistingBond','bondStatus'
 ];
begin
 if p_actor is null or p_mutation is null or (p_link is null and auth.uid() is distinct from p_actor) then raise exception using errcode='42501',message='A signed-in seller editor and save reference are required.'; end if;
 context:=case when p_link is null then seller_save_private.capture_context(p_tx) else seller_save_private.portal_capture_context(p_tx) end;
 select * into replay from seller_save_private.transaction_receipts where mutation_id=p_mutation;
 if found then
   if replay.actor_id<>p_actor or replay.transaction_id<>p_tx or replay.request<>request then
     raise exception using errcode='PT409',message='This save reference belongs to a different change.';
   end if;
   return replay.receipt;
 end if;
 if context->'revision' is distinct from p_revision then raise exception using errcode='PT409',message='Someone else saved seller changes. Your entries remain in this form. Review the latest saved profile before saving again.'; end if;
 if octet_length(p_profile::text)>1048576 or jsonb_typeof(p_profile) is distinct from 'object' or jsonb_typeof(p_profile->'people') is distinct from 'array'
   or jsonb_typeof(p_profile->'profileFields') is distinct from 'object'
   or jsonb_typeof(p_profile->'name') is distinct from 'string'
   or jsonb_typeof(p_profile->'registrationNumber') is distinct from 'string'
   or jsonb_typeof(p_profile->'countryOfRegistration') is distinct from 'string'
   or not coalesce(p_profile->>'entityType'=any(array['unknown','individual','multiple_owners','company','close_corporation','trust','foreign_individual','foreign_company','foreign_trust','deceased_estate','other']),false)
   or exists(select 1 from jsonb_object_keys(p_profile) k where k not in ('entityType','name','registrationNumber','countryOfRegistration','profileFields','people')) then
     raise exception using errcode='22023',message='Invalid seller profile capture.';
 end if;
 if exists(select 1 from jsonb_object_keys(p_profile->'profileFields') k where not(k=any(allowed_fields))) then
   raise exception using errcode='22023',message='Only seller profile details can be captured here.';
 end if;
 people:=p_profile->'people'; total:=jsonb_array_length(people);
 if total<1 or total>100 or exists(select 1 from jsonb_array_elements(people) p where jsonb_typeof(p) is distinct from 'object'
   or coalesce(p->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or not coalesce(p->>'role'=any(array['owner','spouse','authorised_representative','director','member','trustee','executor','beneficial_owner','founder','beneficiary','surety','other']),false))
   or (select count(distinct p->>'id') from jsonb_array_elements(people) p)<>total then
   raise exception using errcode='22023',message='Seller people must have distinct transaction person references.';
 end if;
 if exists(select 1 from jsonb_array_elements(people) p, jsonb_each(p) field
   where field.key not in ('id','role','name','dateOfBirth','nationality','residentialAddress','incomeTaxNumber','saResident','taxResident','capacity','ownershipShare','authorityDetails',
     'sourceOnboardingId','sourcePersonId','sourceSlot','sourceLinkStatus','sourceKey','email','phone','identityNumber','maritalStatus','maritalRegime','spouseOfId','isOwner','signatory','primaryContact')
     or (field.key in ('isOwner','signatory','primaryContact') and jsonb_typeof(field.value)<>'boolean')
     or (field.key not in ('isOwner','signatory','primaryContact','saResident','taxResident') and jsonb_typeof(field.value)<>'string'))
   or exists(select 1 from jsonb_array_elements(people) p where nullif(p->>'spouseOfId','') is not null
     and not exists(select 1 from jsonb_array_elements(people) owner where owner->>'id'=p->>'spouseOfId')) then
   raise exception using errcode='22023',message='Invalid seller person details or spouse link.';
 end if;
 select count(*),jsonb_agg(p)->0 into primary_count,primary_person from jsonb_array_elements(people) p where p->>'primaryContact'='true';
 if primary_count<>1 then raise exception using errcode='22023',message='Choose one primary seller contact.'; end if;
 primary_id:=(primary_person->>'id')::uuid;
 if context#>>'{revision,participantId}' is not null and primary_id<>(context#>>'{revision,participantId}')::uuid then
   raise exception using errcode='PT409',message='Retain the identified primary seller contact.';
 end if;
 if context#>>'{revision,participantId}' is null and exists(select 1 from jsonb_array_elements(context->'roster') r where r->>'removedAt' is null)
   and not exists(select 1 from jsonb_array_elements(context->'roster') r where r->>'removedAt' is null and r->>'id'=primary_id::text) then
   raise exception using errcode='22023',message='Choose the primary contact from the existing sellers.';
 end if;
 -- No person may be borrowed from a different transaction or non-seller role.
 if exists(select 1 from jsonb_array_elements(people) p join public.transaction_participants tp on tp.id=(p->>'id')::uuid
   where tp.transaction_id<>p_tx or tp.role_type is distinct from 'seller' or tp.seller_source_onboarding_id is not null or tp.seller_source_contact_key is not null) then
   raise exception using errcode='42501',message='A seller person reference belongs to another source. Reload the profile.';
 end if;
 select form_data into form from public.onboarding_form_data where transaction_id=p_tx;
 form:=coalesce(form,'{}'); snapshot:=coalesce(form->'__bridge_transaction_parties','{}');
 if snapshot ? 'version' and snapshot->>'version'<>'transaction_party_profile_v1' then
   raise exception using errcode='PT409',message='The transaction party profile version needs review.';
 end if;
 fields:=coalesce(snapshot#>'{seller,profileFields}','{}') || (p_profile->'profileFields');
 -- These are draft answers. Incoming source/evidence flags never grant portal
 -- authority or turn an agent capture into submitted onboarding.
 select jsonb_agg(p || jsonb_build_object('sourceOnboardingId','','sourceKey','','sourcePersonId',p->>'id','sourceLinkStatus','captured') order by ord)
   into people from jsonb_array_elements(people) with ordinality rows(p,ord);
 profile:=p_profile || jsonb_build_object('profileFields',fields,'people',people);
 name:=coalesce(nullif(btrim(p_profile->>'name'),''),primary_person->>'name','');
 perform seller_save_private.authorise(p_tx);
 update public.transactions set seller_name=name,seller_email=nullif(primary_person->>'email',''),seller_phone=nullif(primary_person->>'phone',''),
   seller_type=case when p_profile->>'entityType'='unknown' then seller_type else p_profile->>'entityType' end,updated_at=now_at where id=p_tx;
 -- The role-slot index permits one seller participant. Other owners and
 -- representatives remain in the full profile, not in access/invitation rows.
 person:=primary_person; person_id:=primary_id;
 if exists(select 1 from public.transaction_participants where id=person_id) then
   update public.transaction_participants set participant_name=person->>'name',participant_email=nullif(person->>'email',''),
     participant_phone=nullif(person->>'phone',''),removed_at=null,updated_at=now_at where id=person_id and transaction_id=p_tx and role_type='seller';
 else
   insert into public.transaction_participants(id,transaction_id,role_type,transaction_role,legal_role,status,participant_name,participant_email,participant_phone,updated_at)
     values(person_id,p_tx,'seller','seller','none','active',person->>'name',nullif(person->>'email',''),nullif(person->>'phone',''),now_at);
 end if;
 snapshot:=snapshot || jsonb_build_object('version','transaction_party_profile_v1','seller',profile);
 form:=form || jsonb_build_object('__bridge_transaction_parties',snapshot,'seller_name',name,
   'seller_email',coalesce(primary_person->>'email',''),'seller_phone',coalesce(primary_person->>'phone',''),
   'seller_type',p_profile->>'entityType','__bridge_transaction_seller_capture',jsonb_build_object('source',case when p_link is null then 'agent_manual' else 'seller_link' end,'actorId',case when p_link is null then p_actor else null end,'linkId',p_link,'updatedAt',now_at));
 insert into public.onboarding_form_data(transaction_id,purchaser_type,form_data,updated_at)
   select p_tx,coalesce(purchaser_type,'individual'),form,now_at from public.transactions where id=p_tx
   on conflict(transaction_id) do update set form_data=excluded.form_data,updated_at=excluded.updated_at;
 delete from seller_save_private.authorised_commands where database_transaction=pg_current_xact_id() and transaction_id=p_tx;
 receipt:=(case when p_link is null then seller_save_private.capture_context(p_tx) else seller_save_private.portal_capture_context(p_tx) end) || jsonb_build_object('mutationId',p_mutation);
 insert into seller_save_private.transaction_receipts(mutation_id,actor_id,transaction_id,request,receipt) values(p_mutation,p_actor,p_tx,request,receipt);
 return receipt;
end $$;

-- Existing agent endpoint delegates to the same validated writer.
create or replace function seller_save_private.save_capture(p_tx uuid,p_revision jsonb,p_profile jsonb,p_mutation uuid) returns jsonb
language sql security definer set search_path='' as $$select seller_save_private.save_capture_core(p_tx,p_revision,p_profile,p_mutation,auth.uid(),null)$$;

create function public.bridge_prepare_transaction_seller_link(p_transaction_id uuid,p_revision jsonb,p_mutation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c jsonb; replay seller_save_private.link_commands%rowtype; request jsonb:=jsonb_build_object('revision',p_revision);
 raw_token text; link_id uuid; email text; receipt jsonb;
begin
 c:=seller_save_private.capture_context(p_transaction_id);
 if auth.uid() is null or p_mutation_id is null then raise exception using errcode='42501',message='A signed-in seller editor is required.'; end if;
 select * into replay from seller_save_private.link_commands where mutation_id=p_mutation_id;
 if found then
  if replay.actor_id<>auth.uid() or replay.transaction_id<>p_transaction_id or replay.request<>request then raise exception using errcode='PT409',message='This link reference belongs to another request.'; end if;
  perform seller_save_private.check_capture_link(replay.receipt->>'token',(replay.receipt->>'linkId')::uuid,p_transaction_id);
  return replay.receipt;
 end if;
 if c->'revision' is distinct from p_revision then raise exception using errcode='PT409',message='Seller details changed. Review the latest recipient before preparing a link.'; end if;
 email:=lower(trim(c#>>'{details,email}'));
 if email is null or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception using errcode='22023',message='Capture the primary seller email before preparing their link.'; end if;
 if c#>>'{revision,participantId}' is null and exists(select 1 from jsonb_array_elements(c->'roster') r where r->>'removedAt' is null) then raise exception using errcode='PT409',message='Choose and save the primary seller contact before sending their link.'; end if;
 update seller_save_private.capture_links set active=false where transaction_id=p_transaction_id and active;
 raw_token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into seller_save_private.capture_links(transaction_id,token_hash,recipient_email,primary_person_id,created_by,expires_at)
 values(p_transaction_id,extensions.digest(raw_token,'sha256'),email,(c#>>'{revision,participantId}')::uuid,auth.uid(),now()+interval '14 days') returning id into link_id;
 receipt:=jsonb_build_object('mutationId',p_mutation_id,'linkId',link_id,'transactionId',p_transaction_id,'token',raw_token,'email',email,'name',c#>>'{details,name}');
 insert into seller_save_private.link_commands values(p_mutation_id,p_transaction_id,auth.uid(),request,receipt);
 return receipt;
end $$;
create function public.bridge_get_transaction_seller_onboarding(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare access jsonb;
begin access:=seller_save_private.check_capture_link(p_token); return jsonb_set(access->'context','{roster}',coalesce((select jsonb_agg(value) from jsonb_array_elements(access#>'{context,roster}') where value->>'removedAt' is null),'[]')); end $$;
create function public.bridge_save_transaction_seller_onboarding(p_token text,p_revision jsonb,p_profile jsonb,p_mutation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare access jsonb; receipt jsonb; link_id uuid; tx uuid;
begin
 access:=seller_save_private.check_capture_link(p_token); link_id:=(access->>'linkId')::uuid; tx:=(access->>'transactionId')::uuid;
 receipt:=seller_save_private.save_capture_core(tx,p_revision,p_profile,p_mutation_id,link_id,link_id);
 -- A seller may correct their own email. Agent changes still revoke the old
 -- recipient binding, and an agent changing the primary person revokes access.
 update seller_save_private.capture_links set recipient_email=lower(trim(receipt#>>'{details,email}')),primary_person_id=(receipt#>>'{revision,participantId}')::uuid where id=link_id;
 return jsonb_set(receipt,'{roster}',coalesce((select jsonb_agg(value) from jsonb_array_elements(receipt->'roster') where value->>'removedAt' is null),'[]'));
end $$;
-- Service-only check immediately before dispatch. The browser cannot approve
-- an arbitrary recipient or substitute another transaction/URL token.
create function public.bridge_validate_transaction_seller_delivery(p_transaction_id uuid,p_link_id uuid,p_token text,p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare access jsonb;
begin
 access:=seller_save_private.check_capture_link(p_token,p_link_id,p_transaction_id);
 if lower(trim(p_email)) is distinct from lower(trim(access#>>'{context,details,email}')) then raise exception using errcode='42501',message='The reviewed seller recipient has changed.'; end if;
 return jsonb_build_object('valid',true);
end $$;
revoke all on function seller_save_private.portal_capture_context(uuid),seller_save_private.check_capture_link(text,uuid,uuid),seller_save_private.save_capture_core(uuid,jsonb,jsonb,uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.bridge_prepare_transaction_seller_link(uuid,jsonb,uuid),public.bridge_get_transaction_seller_onboarding(text),public.bridge_save_transaction_seller_onboarding(text,jsonb,jsonb,uuid),public.bridge_validate_transaction_seller_delivery(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.bridge_prepare_transaction_seller_link(uuid,jsonb,uuid) to authenticated;
grant execute on function public.bridge_get_transaction_seller_onboarding(text),public.bridge_save_transaction_seller_onboarding(text,jsonb,jsonb,uuid) to anon,authenticated;
grant execute on function public.bridge_validate_transaction_seller_delivery(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
