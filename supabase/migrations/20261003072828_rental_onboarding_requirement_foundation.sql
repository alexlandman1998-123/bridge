begin;
-- Internal trigger helpers cannot be invoked through the public Data API.
create schema if not exists rental_private;
revoke all on schema rental_private from public, anon, authenticated;

create table public.rental_onboarding_checklists (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  application_id uuid unique references public.rental_applications(id) on delete cascade,
  landlord_lead_id uuid unique references public.leads(lead_id) on delete cascade,
  mode text not null check (mode in ('active','preview')),
  rule_version text not null,
  discovery_revision integer not null default 1 check (discovery_revision > 0),
  discovery_json jsonb not null,
  updated_at timestamptz not null default now(),
  check (num_nonnulls(application_id,landlord_lead_id)=1)
);
create index rental_onboarding_checklists_org_idx on public.rental_onboarding_checklists(organisation_id);
create table public.rental_onboarding_requirements (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.rental_onboarding_checklists(id) on delete cascade,
  subject_id text not null check (btrim(subject_id)<>''),
  scope_key text not null check (btrim(scope_key)<>''),
  purpose text not null check (btrim(purpose)<>''),
  required boolean not null,
  active boolean not null default true,
  generation integer not null default 1 check (generation>0),
  discovery_revision integer not null,
  fingerprint_json jsonb not null,
  current_document_id uuid references public.rental_application_documents(id),
  requested_at timestamptz,
  expires_at timestamptz,
  unique(checklist_id,scope_key,subject_id,purpose)
);
create index rental_onboarding_requirements_document_idx on public.rental_onboarding_requirements(current_document_id) where current_document_id is not null;
create table public.rental_onboarding_checklist_revisions (
  checklist_id uuid not null references public.rental_onboarding_checklists(id) on delete cascade,
  discovery_revision integer not null,
  rule_version text not null,
  discovery_json jsonb not null,
  requirements_json jsonb not null,
  recorded_at timestamptz not null default now(),
  primary key(checklist_id,discovery_revision)
);
create table public.rental_onboarding_evidence_assignments (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references public.rental_onboarding_requirements(id) on delete cascade,
  generation integer not null,
  document_id uuid not null references public.rental_application_documents(id),
  discovery_revision integer not null,
  source text not null check (source in ('agent','applicant','legacy')),
  assigned_at timestamptz not null default now(),
  unique(requirement_id,generation,document_id)
);
create index rental_onboarding_assignments_document_idx on public.rental_onboarding_evidence_assignments(document_id);

create function rental_private.pick(data jsonb, keys text[]) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(k,coalesce(nullif(data->k,'null'::jsonb),'""'::jsonb)),'{}') from unnest(keys) k;
$$;
create function rental_private.tenant_definitions(data jsonb)
returns table(subject_id text,scope_key text,purpose text,required boolean,fingerprint jsonb)
language plpgsql immutable set search_path='' as $$
declare slot record; person jsonb; identity_keys text[]:=array['firstName','lastName','name','identityType','identityNumber','idNumber','nationality','dateOfBirth','role','capacity'];
begin
 for slot in select s.subject_id,s.purpose,true required from public.rental_review_document_slots(data) s
 union all select 'primary',p,false from unnest(array['bank_statement','reference']) p loop
  subject_id:=slot.subject_id; scope_key:='application'; purpose:=slot.purpose; required:=slot.required;
  if subject_id='primary' then person:=data->'identity';
  elsif subject_id='entity' then person:=data->'entity';
  else select value into person from jsonb_array_elements(coalesce(data->'people','[]')) where value->>'id'=subject_id;
  end if;
  fingerprint:=rental_private.pick(person,identity_keys);
  if subject_id='entity' then fingerprint:=rental_private.pick(data->'entity',array['type','legalName','registrationNumber','primaryContactRole']); end if;
  if purpose='authority' then fingerprint:=fingerprint||jsonb_build_object('signatories',coalesce((select jsonb_agg(jsonb_build_object('id',p->>'id')||rental_private.pick(p,identity_keys||array['authorityBasis']) order by p->>'id') from jsonb_array_elements(coalesce(data->'people','[]')) p where p->>'role' in ('authorised_signatory','trustee')),'[]'));
  end if;
  return next;
 end loop;
end; $$;
create function rental_private.landlord_definitions(data jsonb)
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
  subject_id:='signatory'; purpose:='identity'; fingerprint:=rental_private.pick(profile,array['authorisedSignatoryName','authorisedSignatoryCapacity']); return next;
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
  rights:=legal||jsonb_build_object('propertyId',coalesce(property->>'canonicalPropertyId',''),'ownershipType',coalesce(property->>'ownershipType',''));
  subject_id:='property'; purpose:='property_disclosure'; fingerprint:=rights; return next;
  subject_id:='entity'; purpose:='right_to_let'; return next;
  purpose:='signed_mandate'; fingerprint:=rights||jsonb_build_object('mandateId',coalesce(property->>'mandateId',''),'startsOn',coalesce(property->>'mandateStartDate',''),'endsOn',coalesce(property->>'mandateEndDate','')); return next;
  if profile->>'type' in ('company','close_corporation','trust') then
   purpose:='signing_authority'; fingerprint:=rights||jsonb_build_object('authorityBasis',coalesce(profile->>'authorityBasis',''),'signatory',coalesce(profile->>'authorisedSignatoryName','')); return next;
  end if;
  if profile->>'type'='multiple_owners' then
   purpose:='co_owner_authority'; fingerprint:=rights||jsonb_build_object('owners',coalesce((select jsonb_agg(jsonb_build_object('id',p->>'id')||rental_private.pick(p,identity_keys) order by p->>'id') from jsonb_array_elements(coalesce(profile->'people','[]')) p),'[]')); return next;
  end if;
 end loop;
end; $$;

-- Called only by parent-row triggers: discovery and evidence reconciliation share
-- the existing save transaction/version guard. No client can supply its own rules.
create function rental_private.sync_checklist(p_org uuid,p_application uuid,p_landlord uuid,p_discovery jsonb,p_application_data jsonb default '{}')
returns void language plpgsql set search_path='' as $$
declare context public.rental_onboarding_checklists%rowtype; item record; requirement public.rental_onboarding_requirements%rowtype; candidate uuid; revision_changed boolean; rule_changed boolean:=false; seen uuid[]:=array[]::uuid[]; rule text; mode_value text; source_value text;
begin
 rule:=case when p_application is not null then 'rental_application_evidence_v1' else 'rental_landlord_preview_v1' end;
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
 update public.rental_onboarding_requirements set active=false,current_document_id=null,expires_at=null,requested_at=null,discovery_revision=context.discovery_revision where checklist_id=context.id and not(id=any(seen)) and active;
 if revision_changed then
  insert into public.rental_onboarding_checklist_revisions(checklist_id,discovery_revision,rule_version,discovery_json,requirements_json)
  select context.id,context.discovery_revision,rule,p_discovery,coalesce(jsonb_agg(to_jsonb(r) order by r.scope_key,r.subject_id,r.purpose),'[]') from public.rental_onboarding_requirements r where r.checklist_id=context.id;
 end if;
end; $$;

create function rental_private.application_checklist_saved() returns trigger
language plpgsql security definer set search_path='' as $$
declare discovery jsonb;
begin
 if not exists(select 1 from public.rental_vacancies v join public.rental_properties p on p.id=v.property_id where v.id=new.vacancy_id and p.organisation_id=new.organisation_id) then raise exception 'Checklist organisation cannot change or differ from its property'; end if;
 select coalesce(jsonb_object_agg(key,value),'{}') into discovery from jsonb_each(new.application_data) where key in ('entity','identity','contacts','people','property','household','employment','income','rentalHistory','references','schemaVersion');
 perform rental_private.sync_checklist(new.organisation_id,new.id,null,discovery,new.application_data);
 return new;
end; $$;
create trigger trg_rental_application_checklist_saved after insert or update on public.rental_applications for each row execute function rental_private.application_checklist_saved();
create function rental_private.landlord_checklist_saved() returns trigger
language plpgsql security definer set search_path='' as $$
declare metadata jsonb; discovery jsonb;
begin
 metadata:=coalesce(new.raw_enquiry_payload->'rentalCrm',new.raw_enquiry_payload->'rental_crm',new.raw_enquiry_payload,'{}');
 if metadata->>'role'='landlord' and (metadata->>'arch9RentalLead'='true' or metadata->>'classification'='rental' or metadata->>'leadType'='rental') then
  discovery:=jsonb_build_object('profile',coalesce(metadata->'landlordProfile','{}'),'portfolio',coalesce(metadata->'landlordPortfolio','[]'));
  perform rental_private.sync_checklist(new.organisation_id,null,new.lead_id,discovery);
 elsif exists(select 1 from public.rental_onboarding_checklists where landlord_lead_id=new.lead_id) then
  perform rental_private.sync_checklist(new.organisation_id,null,new.lead_id,'{}');
 end if;
 return new;
end; $$;
create trigger trg_rental_landlord_checklist_saved after insert or update of raw_enquiry_payload,organisation_id on public.leads for each row execute function rental_private.landlord_checklist_saved();
revoke all on function rental_private.pick(jsonb,text[]),rental_private.tenant_definitions(jsonb),rental_private.landlord_definitions(jsonb),rental_private.sync_checklist(uuid,uuid,uuid,jsonb,jsonb),rental_private.application_checklist_saved(),rental_private.landlord_checklist_saved() from public,anon,authenticated;

alter table public.rental_onboarding_checklists enable row level security;
alter table public.rental_onboarding_requirements enable row level security;
alter table public.rental_onboarding_checklist_revisions enable row level security;
alter table public.rental_onboarding_evidence_assignments enable row level security;
revoke all on public.rental_onboarding_checklists,public.rental_onboarding_requirements,public.rental_onboarding_checklist_revisions,public.rental_onboarding_evidence_assignments from anon,authenticated;
grant select on public.rental_onboarding_checklists,public.rental_onboarding_requirements,public.rental_onboarding_checklist_revisions,public.rental_onboarding_evidence_assignments to authenticated;
create policy rental_onboarding_checklists_read on public.rental_onboarding_checklists for select to authenticated using (
 exists(select 1 from public.rental_applications a join public.rental_vacancies v on v.id=a.vacancy_id join public.rental_properties p on p.id=v.property_id where a.id=application_id and a.organisation_id=rental_onboarding_checklists.organisation_id and a.organisation_id=p.organisation_id and public.rental_branch_access(p.organisation_id,p.branch_id))
 or exists(select 1 from public.leads l where l.lead_id=landlord_lead_id and l.organisation_id=rental_onboarding_checklists.organisation_id and public.rental_branch_access(l.organisation_id,l.branch_id))
);
create policy rental_onboarding_requirements_read on public.rental_onboarding_requirements for select to authenticated using(exists(select 1 from public.rental_onboarding_checklists c where c.id=checklist_id));
create policy rental_onboarding_revisions_read on public.rental_onboarding_checklist_revisions for select to authenticated using(exists(select 1 from public.rental_onboarding_checklists c where c.id=checklist_id));
create policy rental_onboarding_assignments_read on public.rental_onboarding_evidence_assignments for select to authenticated using(exists(select 1 from public.rental_onboarding_requirements r where r.id=requirement_id));
create view public.rental_onboarding_requirement_summaries with (security_invoker=true) as
select r.*,c.organisation_id,c.application_id,c.landlord_lead_id,c.mode,c.rule_version,
case when not r.active then 'superseded' when r.expires_at<=now() then 'expired'
 when d.status='accepted' then 'accepted' when d.status='rejected' then 'rejected'
 when d.status='uploaded' then 'received' when r.requested_at is not null then 'requested' else 'missing' end state
from public.rental_onboarding_requirements r join public.rental_onboarding_checklists c on c.id=r.checklist_id left join public.rental_application_documents d on d.id=r.current_document_id;
revoke all on public.rental_onboarding_requirement_summaries from anon,authenticated;
grant select on public.rental_onboarding_requirement_summaries to authenticated;
commit;
