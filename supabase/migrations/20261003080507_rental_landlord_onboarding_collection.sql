begin;
create table public.rental_landlord_onboarding (
 lead_id uuid primary key references public.leads(lead_id), organisation_id uuid not null references public.organisations(id),
 version integer not null default 0, status text not null default 'draft' check(status in ('draft','submitted')),
 declaration_json jsonb, updated_at timestamptz not null default now()
);
create table public.rental_landlord_onboarding_documents (
 id uuid primary key, lead_id uuid not null references public.leads(lead_id), organisation_id uuid not null references public.organisations(id),
 requirement_id uuid not null references public.rental_onboarding_requirements(id), generation integer not null, discovery_revision integer not null,
 storage_path text unique not null, file_name text not null, mime_type text not null, file_size_bytes integer not null check(file_size_bytes between 1 and 8388608),
 source text not null check(source in ('agent','landlord')), status text not null default 'uploaded' check(status in ('uploaded','accepted','rejected')),
 uploaded_at timestamptz not null default now(), review_note text, reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
 completed_signed boolean not null default false
);
create index rental_landlord_documents_requirement_idx on public.rental_landlord_onboarding_documents(requirement_id,generation,uploaded_at desc,id desc);
create index rental_landlord_documents_lead_idx on public.rental_landlord_onboarding_documents(lead_id);
create table public.rental_landlord_onboarding_access (
 id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.leads(lead_id), organisation_id uuid not null references public.organisations(id),
 token_hash text unique not null, expires_at timestamptz not null, revoked_at timestamptz, created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create index rental_landlord_access_lead_idx on public.rental_landlord_onboarding_access(lead_id);
create table public.rental_landlord_onboarding_events (
 id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.leads(lead_id), version integer not null,
 command text not null, source text not null, actor_id uuid references auth.users(id), payload_json jsonb not null, recorded_at timestamptz not null default now(), unique(lead_id,version)
);
alter table public.rental_onboarding_requirements add column current_landlord_document_id uuid references public.rental_landlord_onboarding_documents(id);
create index rental_requirements_landlord_document_idx on public.rental_onboarding_requirements(current_landlord_document_id) where current_landlord_document_id is not null;
-- Preserve the existing view's column order and append landlord evidence metadata.
create or replace view public.rental_onboarding_requirement_summaries with(security_invoker=true) as
select r.id,r.checklist_id,r.subject_id,r.scope_key,r.purpose,r.required,r.active,r.generation,r.discovery_revision,r.fingerprint_json,r.current_document_id,r.requested_at,r.expires_at,
 c.organisation_id,c.application_id,c.landlord_lead_id,c.mode,c.rule_version,
 case when not r.active then 'superseded' when r.expires_at<=now() then 'expired'
 when coalesce(d.status,l.status)='accepted' then 'accepted' when coalesce(d.status,l.status)='rejected' then 'rejected'
 when coalesce(d.status,l.status)='uploaded' then 'received' when r.requested_at is not null then 'requested' else 'missing' end state,
 r.current_landlord_document_id
from public.rental_onboarding_requirements r join public.rental_onboarding_checklists c on c.id=r.checklist_id
left join public.rental_application_documents d on d.id=r.current_document_id
left join public.rental_landlord_onboarding_documents l on l.id=r.current_landlord_document_id;
create or replace function rental_private.landlord_definitions(data jsonb)
returns table(subject_id text,scope_key text,purpose text,required boolean,fingerprint jsonb)
language plpgsql immutable set search_path='' as $$
declare profile jsonb:=coalesce(data->'profile','{}'); person jsonb; property jsonb; legal jsonb; rights jsonb;
identity_keys text[]:=array['firstName','lastName','name','identityType','identityNumber','idNumber','nationality','dateOfBirth','role','capacity'];
begin
 if coalesce(profile->>'type','') not in ('individual','multiple_owners','company','close_corporation','trust') then return; end if;
 legal:=rental_private.pick(profile,array['type','name','idNumber','registrationNumber','country','nationality']); required:=true; scope_key:='identity'; fingerprint:=legal;
 if profile->>'type' in ('company','close_corporation','trust') then
  subject_id:='entity'; purpose:=case when profile->>'type'='trust' then 'trust_founding' else 'entity_registration' end; return next;
  if profile->>'type'='trust' then purpose:='trust_authority'; return next; end if;
  purpose:='beneficial_ownership'; return next;
  subject_id:='signatory'; purpose:='identity'; fingerprint:=rental_private.pick(profile,array['authorisedSignatoryName','authorisedSignatoryCapacity','authorisedSignatoryIdNumber','authorisedSignatoryNationality']); return next;
 else subject_id:='primary'; purpose:='identity'; return next; purpose:='address'; fingerprint:=legal||jsonb_build_object('residentialAddress',coalesce(profile->>'residentialAddress','')); return next;
 end if;
 for person in select value from jsonb_array_elements(coalesce(profile->'people','[]')) loop
  if coalesce(person->>'id','')='' or person->>'id' in ('primary','entity','signatory') then continue; end if;
  subject_id:=person->>'id'; purpose:='identity'; fingerprint:=rental_private.pick(person,identity_keys); return next;
  purpose:='address'; fingerprint:=fingerprint||jsonb_build_object('residentialAddress',coalesce(person->>'residentialAddress','')); return next;
 end loop;
 for property in select value from jsonb_array_elements(coalesce(data->'portfolio','[]')) loop
  if coalesce(property->>'id','')='' then continue; end if;
  scope_key:='property:'||(property->>'id');
  rights:=legal||jsonb_build_object('propertyId',coalesce(property->>'canonicalPropertyId',''),'ownershipType',coalesce(property->>'ownershipType',''),'address',coalesce(property->>'address',''),'unitNumber',coalesce(property->>'unitNumber',''),'complexName',coalesce(property->>'complexName',''));
  subject_id:='property'; purpose:='property_disclosure'; fingerprint:=rights; return next;
  subject_id:='entity'; purpose:='right_to_let'; return next;
  purpose:='signed_mandate'; fingerprint:=rights||jsonb_build_object('signedAt',coalesce(property->>'mandateSignedAt',''),'startsOn',coalesce(property->>'mandateStartDate',''),'endsOn',coalesce(property->>'mandateEndDate','')); return next;
  if profile->>'type' in ('company','close_corporation','trust') then
   purpose:='signing_authority'; fingerprint:=rights||jsonb_build_object('authorityBasis',coalesce(profile->>'authorityBasis',''),'signatory',coalesce(profile->>'authorisedSignatoryName',''),'signatoryId',coalesce(profile->>'authorisedSignatoryIdNumber',''),'capacity',coalesce(profile->>'authorisedSignatoryCapacity','')); return next;
  end if;
  if profile->>'type'='multiple_owners' then
   purpose:='co_owner_authority'; fingerprint:=rights||jsonb_build_object('owners',coalesce((select jsonb_agg(jsonb_build_object('id',p->>'id')||rental_private.pick(p,identity_keys) order by p->>'id') from jsonb_array_elements(coalesce(profile->'people','[]')) p),'[]')); return next;
  end if;
 end loop;
end; $$;

create or replace function rental_private.sync_checklist(p_org uuid,p_application uuid,p_landlord uuid,p_discovery jsonb,p_application_data jsonb default '{}')
returns void language plpgsql set search_path='' as $$
declare context public.rental_onboarding_checklists%rowtype; item record; requirement public.rental_onboarding_requirements%rowtype; candidate uuid; revision_changed boolean; rule_changed boolean:=false; seen uuid[]:=array[]::uuid[]; rule text; mode_value text; source_value text;
begin
 rule:=case when p_application is not null then 'rental_application_evidence_v1' else 'rental_landlord_collection_v1' end;
 mode_value:=case when p_application is not null then 'active' else 'preview' end;
 select * into context from public.rental_onboarding_checklists where application_id=p_application or landlord_lead_id=p_landlord for update;
 if not found then
  insert into public.rental_onboarding_checklists(organisation_id,application_id,landlord_lead_id,mode,rule_version,discovery_json) values(p_org,p_application,p_landlord,mode_value,rule,p_discovery) returning * into context;
  revision_changed:=true;
 else
  if context.organisation_id<>p_org then raise exception 'Checklist organisation cannot change'; end if;
  rule_changed:=context.rule_version<>rule;
  revision_changed:=context.discovery_json is distinct from p_discovery or context.rule_version<>rule;
  if revision_changed then
   update public.rental_onboarding_checklists set discovery_revision=discovery_revision+1,discovery_json=p_discovery,rule_version=rule,updated_at=now() where id=context.id returning * into context;
  end if;
 end if;
 for item in select distinct on (subject_id,scope_key,purpose) * from (
 select * from rental_private.tenant_definitions(p_discovery) where p_application is not null
 union all select * from rental_private.landlord_definitions(p_discovery) where p_landlord is not null
 ) definitions order by subject_id,scope_key,purpose,fingerprint::text loop
  select * into requirement from public.rental_onboarding_requirements where checklist_id=context.id and scope_key=item.scope_key and subject_id=item.subject_id and purpose=item.purpose;
  if not found then
   insert into public.rental_onboarding_requirements(checklist_id,subject_id,scope_key,purpose,required,discovery_revision,fingerprint_json) values(context.id,item.subject_id,item.scope_key,item.purpose,item.required,context.discovery_revision,item.fingerprint) returning * into requirement;
  else
   update public.rental_onboarding_requirements set generation=generation+case when rule_changed or not active or fingerprint_json is distinct from item.fingerprint then 1 else 0 end,
   expires_at=case when rule_changed or not active or fingerprint_json is distinct from item.fingerprint then null else expires_at end,
   requested_at=case when rule_changed or not active or fingerprint_json is distinct from item.fingerprint then null else requested_at end,
   current_landlord_document_id=case when rule_changed or not active or fingerprint_json is distinct from item.fingerprint then null else current_landlord_document_id end,
   active=true,required=item.required,fingerprint_json=item.fingerprint,discovery_revision=context.discovery_revision where id=requirement.id returning * into requirement;
  end if;
  seen:=array_append(seen,requirement.id); candidate:=null;
  if p_application is not null then
   select d.id into candidate from public.rental_application_documents d where d.application_id=p_application and d.organisation_id=p_org and (
    exists(select 1 from jsonb_array_elements(coalesce(p_application_data->'documentLinks','[]')) l where l->>'documentId'=d.id::text and l->>'subjectId'=item.subject_id and l->>'purpose'=item.purpose and l->>'invalidated' is distinct from 'true')
    or (item.subject_id='primary' and d.document_type=item.purpose and not exists(select 1 from jsonb_array_elements(coalesce(p_application_data->'documentInvalidations','[]')) i where i->>'subjectId'='primary') and not exists(select 1 from jsonb_array_elements(coalesce(p_application_data->'documentLinks','[]')) l where l->>'documentId'=d.id::text)))
   order by d.uploaded_at desc nulls last,d.created_at desc,d.id desc limit 1;
   if exists(select 1 from public.rental_onboarding_evidence_assignments a where a.requirement_id=requirement.id and a.document_id=candidate and a.generation<>requirement.generation)
   and not exists(select 1 from public.rental_onboarding_evidence_assignments a where a.requirement_id=requirement.id and a.document_id=candidate and a.generation=requirement.generation) then candidate:=null; end if;
   if candidate is not null then
    select coalesce((select l->>'source' from jsonb_array_elements(coalesce(p_application_data->'documentLinks','[]')) l where l->>'documentId'=candidate::text limit 1),'legacy') into source_value;
    if source_value not in ('agent','applicant','legacy') then source_value:='legacy'; end if;
    insert into public.rental_onboarding_evidence_assignments(requirement_id,generation,document_id,discovery_revision,source) values(requirement.id,requirement.generation,candidate,context.discovery_revision,source_value) on conflict do nothing;
   end if;
  end if;
  update public.rental_onboarding_requirements set expires_at=case when current_document_id is distinct from candidate then null else expires_at end,current_document_id=candidate where id=requirement.id;
 end loop;
 update public.rental_onboarding_requirements set active=false,current_document_id=null,current_landlord_document_id=null,expires_at=null,requested_at=null,discovery_revision=context.discovery_revision where checklist_id=context.id and not(id=any(seen)) and active;
 if revision_changed then
  insert into public.rental_onboarding_checklist_revisions(checklist_id,discovery_revision,rule_version,discovery_json,requirements_json)
  select context.id,context.discovery_revision,rule,p_discovery,coalesce(jsonb_agg(to_jsonb(r) order by r.scope_key,r.subject_id,r.purpose),'[]') from public.rental_onboarding_requirements r where r.checklist_id=context.id;
 end if;
end; $$;

create function rental_private.landlord_discovery(payload jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('profile',coalesce(m->'landlordProfile','{}'), 'portfolio',coalesce(m->'landlordPortfolio','[]'))
 from (select coalesce(payload->'rentalCrm',payload->'rental_crm',payload,'{}') m) s;
$$;
create function rental_private.landlord_collection_reconcile(p_lead uuid) returns void language plpgsql security definer set search_path='' as $$
declare r record; candidate uuid;
begin
 for r in select req.* from public.rental_onboarding_requirements req join public.rental_onboarding_checklists c on c.id=req.checklist_id where c.landlord_lead_id=p_lead loop
  candidate:=null;
  if r.active then select d.id into candidate from public.rental_landlord_onboarding_documents d where d.lead_id=p_lead and d.requirement_id=r.id and d.generation=r.generation order by d.uploaded_at desc,d.id desc limit 1; end if;
  update public.rental_onboarding_requirements set current_landlord_document_id=candidate,expires_at=case when current_landlord_document_id is distinct from candidate then null else expires_at end where id=r.id;
 end loop;
end; $$;
create function rental_private.landlord_discovery_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.rental_landlord_onboarding where lead_id=old.lead_id)
 and rental_private.landlord_discovery(old.raw_enquiry_payload) is distinct from rental_private.landlord_discovery(new.raw_enquiry_payload)
 and current_setting('app.rental_landlord_onboarding',true) is distinct from 'on' then raise exception 'Save landlord discovery through versioned onboarding'; end if;
 return new;
end; $$;
create trigger trg_rental_landlord_discovery_guard before update of raw_enquiry_payload on public.leads for each row execute function rental_private.landlord_discovery_guard();
create function rental_private.landlord_collection_saved() returns trigger language plpgsql security definer set search_path='' as $$
begin perform rental_private.landlord_collection_reconcile(new.lead_id); return new; end; $$;
create trigger trg_rental_landlord_zz_collection_saved after update of raw_enquiry_payload on public.leads for each row execute function rental_private.landlord_collection_saved();
-- Only server-authorised endpoints call this function. The locked lead is checked
-- against the authorised scope and saved discovery before privileged writes.
create function public.rental_landlord_onboarding_command(p_lead_id uuid,p_expected_version integer,p_command text,p_payload jsonb,p_scope jsonb,p_source text,p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.leads; s public.rental_landlord_onboarding; m jsonb; discovery jsonb; r record; doc record; parent_key text; k text;
begin
 select * into l from public.leads where lead_id=p_lead_id for update;
 if not found or l.organisation_id::text is distinct from p_scope->>'organisation_id' then raise exception 'Landlord unavailable in this scope'; end if;
 foreach k in array array['branch_id','assigned_agent_id','assigned_user_id'] loop
  if p_scope ? k and (to_jsonb(l)->k) is distinct from p_scope->k then raise exception 'Landlord scope changed; reopen onboarding'; end if;
 end loop;
 if p_source not in ('agent','landlord') or (p_source='agent' and p_actor is null) then raise exception 'Authorised actor required'; end if;
 m:=coalesce(l.raw_enquiry_payload->'rentalCrm',l.raw_enquiry_payload->'rental_crm',l.raw_enquiry_payload,'{}');
 if m->>'role' is distinct from 'landlord' then raise exception 'Choose a landlord lead'; end if;
 insert into public.rental_landlord_onboarding(lead_id,organisation_id) values(l.lead_id,l.organisation_id) on conflict do nothing;
 select * into s from public.rental_landlord_onboarding where lead_id=l.lead_id for update;
 -- A committed completion receipt is idempotent even if its acknowledgement was lost.
 if p_command='complete_upload' and exists(select 1 from public.rental_landlord_onboarding_documents where id::text=p_payload->>'id' and lead_id=l.lead_id and storage_path=p_payload->>'storagePath') then return jsonb_build_object('version',s.version,'status',s.status,'documentId',p_payload->>'id'); end if;
 if s.version<>p_expected_version then raise exception 'Landlord onboarding changed; reopen before saving'; end if;
 if p_payload ? 'expectedDiscovery' and rental_private.landlord_discovery(l.raw_enquiry_payload) is distinct from p_payload->'expectedDiscovery' then raise exception 'Landlord discovery changed; your edits are retained'; end if;
 if s.status='submitted' and p_command in ('save','complete_upload','submit') then raise exception 'Submitted onboarding is locked; request corrections first'; end if;
 perform set_config('app.rental_landlord_onboarding','on',true);
 if p_command='save' then
  if p_payload ? 'profile' then m:=jsonb_set(m,'{landlordProfile}',p_payload->'profile'); end if;
  if p_payload ? 'portfolio' then m:=jsonb_set(m,'{landlordPortfolio}',p_payload->'portfolio'); end if;
 elsif p_command='complete_upload' then
  select req.* into r from public.rental_onboarding_requirements req join public.rental_onboarding_checklists c on c.id=req.checklist_id
   where c.landlord_lead_id=l.lead_id and c.organisation_id=l.organisation_id and req.active and req.id::text=p_payload->>'requirementId' and req.generation::text=p_payload->>'generation';
  if not found then raise exception 'The saved evidence requirement changed'; end if;
  if p_payload->>'storagePath' not like l.organisation_id::text||'/'||l.lead_id::text||'/%' then raise exception 'Evidence path outside landlord scope'; end if;
  insert into public.rental_landlord_onboarding_documents(id,lead_id,organisation_id,requirement_id,generation,discovery_revision,storage_path,file_name,mime_type,file_size_bytes,source)
  values((p_payload->>'id')::uuid,l.lead_id,l.organisation_id,r.id,r.generation,r.discovery_revision,p_payload->>'storagePath',p_payload->>'fileName',p_payload->>'mimeType',(p_payload->>'fileSize')::integer,p_source);
 elsif p_command='review_document' then
  if p_source<>'agent' or nullif(btrim(p_payload->>'note'),'') is null or p_payload->>'status' not in ('accepted','rejected') then raise exception 'Agent review and note required'; end if;
  select d.* into doc from public.rental_landlord_onboarding_documents d join public.rental_onboarding_requirements req on req.current_landlord_document_id=d.id where d.lead_id=l.lead_id and d.id::text=p_payload->>'documentId' and req.active and req.generation=d.generation for update of d;
  if not found then raise exception 'Only current evidence can be reviewed'; end if;
  if p_payload->>'status'='accepted' and exists(select 1 from public.rental_onboarding_requirements where id=doc.requirement_id and purpose='property_disclosure') and p_payload->>'completedSigned' is distinct from 'true' then raise exception 'Confirm the prescribed disclosure is completed and signed'; end if;
  update public.rental_landlord_onboarding_documents set status=p_payload->>'status',review_note=p_payload->>'note',reviewed_by=p_actor,reviewed_at=now(),completed_signed=coalesce((p_payload->>'completedSigned')::boolean,false) where id=doc.id;
 elsif p_command='submit' then
  if p_source<>'landlord' or p_payload->>'declarationAccepted' is distinct from 'true' then raise exception 'Landlord declaration required'; end if;
  update public.rental_landlord_onboarding set status='submitted',declaration_json=jsonb_build_object('accepted',true,'wordingVersion','landlord_details_v1','at',now(),'discovery',rental_private.landlord_discovery(l.raw_enquiry_payload)) where lead_id=l.lead_id;
  m:=m-'landlordRequestedChanges';
 elsif p_command='request_changes' then
  if p_source<>'agent' or nullif(btrim(p_payload->>'message'),'') is null then raise exception 'Agent correction message required'; end if;
  update public.rental_landlord_onboarding set status='draft',declaration_json=null where lead_id=l.lead_id;
  m:=jsonb_set(m,'{landlordRequestedChanges}',to_jsonb(p_payload->>'message'));
 else raise exception 'Unsupported landlord onboarding command'; end if;
 parent_key:=case when l.raw_enquiry_payload ? 'rentalCrm' then 'rentalCrm' when l.raw_enquiry_payload ? 'rental_crm' then 'rental_crm' else null end;
 update public.leads set raw_enquiry_payload=case when parent_key is null then m else jsonb_set(l.raw_enquiry_payload,array[parent_key],m) end where lead_id=l.lead_id;
 perform set_config('app.rental_landlord_onboarding','off',true);
 update public.rental_landlord_onboarding set version=version+1,updated_at=now() where lead_id=l.lead_id returning * into s;
 insert into public.rental_landlord_onboarding_events(lead_id,version,command,source,actor_id,payload_json) values(l.lead_id,s.version,p_command,p_source,p_actor,
  case when p_command='submit' then s.declaration_json else p_payload - 'storagePath' - 'expectedDiscovery' - 'profile' - 'portfolio' end);
 return jsonb_build_object('version',s.version,'status',s.status,'documentId',p_payload->>'id');
end; $$;
revoke all on function public.rental_landlord_onboarding_command(uuid,integer,text,jsonb,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.rental_landlord_onboarding_command(uuid,integer,text,jsonb,jsonb,text,uuid) to service_role;
-- Hold the same parent lock as writes while reading discovery, state and evidence.
create function public.rental_landlord_onboarding_snapshot(p_lead_id uuid,p_scope jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.leads; k text;
begin
 select * into l from public.leads where lead_id=p_lead_id for share;
 if not found or l.organisation_id::text is distinct from p_scope->>'organisation_id' then raise exception 'Landlord unavailable in this scope'; end if;
 foreach k in array array['branch_id','assigned_agent_id','assigned_user_id'] loop
  if p_scope ? k and (to_jsonb(l)->k) is distinct from p_scope->k then raise exception 'Landlord scope changed; reopen onboarding'; end if;
 end loop;
 if coalesce(l.raw_enquiry_payload->'rentalCrm',l.raw_enquiry_payload->'rental_crm',l.raw_enquiry_payload)->>'role' is distinct from 'landlord' then raise exception 'Choose a landlord lead'; end if;
 return jsonb_build_object('payload',l.raw_enquiry_payload,
  'version',coalesce((select version from public.rental_landlord_onboarding where lead_id=l.lead_id),0),
  'status',coalesce((select status from public.rental_landlord_onboarding where lead_id=l.lead_id),'draft'),
  'requirements',coalesce((select jsonb_agg(to_jsonb(r)) from public.rental_onboarding_requirement_summaries r where landlord_lead_id=l.lead_id and organisation_id=l.organisation_id),'[]'),
  'accessLinks',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'expiresAt',a.expires_at,'revokedAt',a.revoked_at)) from public.rental_landlord_onboarding_access a where lead_id=l.lead_id),'[]'),
  'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'file_name',d.file_name,'status',d.status,'review_note',d.review_note,'completed_signed',d.completed_signed,'requirement_id',d.requirement_id,'generation',d.generation)) from public.rental_landlord_onboarding_documents d where lead_id=l.lead_id and organisation_id=l.organisation_id),'[]'));
end; $$;
revoke all on function public.rental_landlord_onboarding_snapshot(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.rental_landlord_onboarding_snapshot(uuid,jsonb) to service_role;
create function rental_private.landlord_mandate_disclosure_gate() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.mandate_status<>'active' then return new; end if;
 perform 1 from public.leads where lead_id::text=new.metadata_json->>'leadId' for update;
 if tg_op='UPDATE' and old.mandate_status='active' and old.organisation_id=new.organisation_id and old.property_id=new.property_id and old.metadata_json is not distinct from new.metadata_json then return new; end if;
 if not exists(select 1 from public.rental_onboarding_requirements r join public.rental_onboarding_checklists c on c.id=r.checklist_id
 join public.rental_landlord_onboarding_documents d on d.id=r.current_landlord_document_id
 cross join lateral jsonb_array_elements(coalesce(c.discovery_json->'portfolio','[]')) p
 where c.organisation_id=new.organisation_id and c.landlord_lead_id::text=new.metadata_json->>'leadId'
 and p->>'canonicalPropertyId'=new.property_id::text and r.scope_key='property:'||(p->>'id') and r.purpose='property_disclosure' and r.active
 and d.generation=r.generation and d.status='accepted' and d.completed_signed and d.reviewed_by is not null and (r.expires_at is null or r.expires_at>now())) then
 raise exception 'Accept the current completed and signed prescribed disclosure for this property before accepting the mandate'; end if;
 return new;
end; $$;
create trigger trg_rental_mandate_disclosure_gate before insert or update on public.rental_property_mandates for each row execute function rental_private.landlord_mandate_disclosure_gate();
revoke all on function rental_private.landlord_discovery(jsonb),rental_private.landlord_collection_reconcile(uuid),rental_private.landlord_discovery_guard(),rental_private.landlord_collection_saved(),rental_private.landlord_mandate_disclosure_gate() from public,anon,authenticated;
alter table public.rental_landlord_onboarding enable row level security;
alter table public.rental_landlord_onboarding_documents enable row level security;
alter table public.rental_landlord_onboarding_access enable row level security;
alter table public.rental_landlord_onboarding_events enable row level security;
revoke all on public.rental_landlord_onboarding,public.rental_landlord_onboarding_documents,public.rental_landlord_onboarding_access,public.rental_landlord_onboarding_events from anon,authenticated;
grant select on public.rental_landlord_onboarding,public.rental_landlord_onboarding_documents,public.rental_landlord_onboarding_events to authenticated;
grant all on public.rental_landlord_onboarding,public.rental_landlord_onboarding_documents,public.rental_landlord_onboarding_access,public.rental_landlord_onboarding_events to service_role;
create policy rental_landlord_onboarding_read on public.rental_landlord_onboarding for select to authenticated using(exists(select 1 from public.leads l where l.lead_id=rental_landlord_onboarding.lead_id and l.organisation_id=rental_landlord_onboarding.organisation_id and public.rental_branch_access(l.organisation_id,l.branch_id)));
create policy rental_landlord_documents_read on public.rental_landlord_onboarding_documents for select to authenticated using(exists(select 1 from public.rental_landlord_onboarding s where s.lead_id=rental_landlord_onboarding_documents.lead_id));
create policy rental_landlord_events_read on public.rental_landlord_onboarding_events for select to authenticated using(exists(select 1 from public.rental_landlord_onboarding s where s.lead_id=rental_landlord_onboarding_events.lead_id));
-- Files are served only by short-lived URLs after endpoint scope checks.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('rental-landlord-onboarding','rental-landlord-onboarding',false,8388608,array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
commit;
