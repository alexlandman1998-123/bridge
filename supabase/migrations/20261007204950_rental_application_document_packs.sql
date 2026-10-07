begin;
alter table public.rental_applications add column document_policy_json jsonb not null default '{"version":3}'::jsonb;
alter table public.rental_applications alter column document_policy_json set default '{"version":4,"extendedRequired":false}'::jsonb;
create function rental_private.protect_document_policy() returns trigger language plpgsql set search_path='' as $$ begin
 if tg_op='INSERT' then new.document_policy_json:='{"version":4,"extendedRequired":false}';
 elsif new.document_policy_json is distinct from old.document_policy_json then raise exception 'Document policy snapshot is protected'; end if; return new; end; $$;
create trigger rental_document_policy before insert or update on public.rental_applications for each row execute function rental_private.protect_document_policy();
alter table public.rental_application_documents add column if not exists intake_bundle_id uuid not null default gen_random_uuid();
alter table public.rental_application_access_tokens add column if not exists subject_id text, add column subject_generation integer;
create table public.rental_application_person_permissions (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references public.rental_applications(id), organisation_id uuid not null references public.organisations(id), subject_id text not null, requirement_id uuid not null references public.rental_onboarding_requirements(id), generation integer not null, submission_at timestamptz not null, accepted_at timestamptz not null default now(), wording_version text not null, evidence_json jsonb not null,
 unique(application_id,subject_id,requirement_id,generation,submission_at)
);
alter table public.rental_application_person_permissions enable row level security;
revoke all on public.rental_application_person_permissions from public,anon,authenticated;
grant select on public.rental_application_person_permissions to authenticated;
grant all on public.rental_application_person_permissions to service_role;
create policy rental_person_permission_read on public.rental_application_person_permissions for select to authenticated using(exists(select 1 from public.rental_applications a join public.rental_vacancies v on v.id=a.vacancy_id join public.rental_properties p on p.id=v.property_id where a.id=application_id and public.rental_branch_access(p.organisation_id,p.branch_id)));
alter function rental_private.tenant_definitions(jsonb) rename to tenant_definitions_v3;
create function rental_private.tenant_definitions(data jsonb) returns table(subject_id text,scope_key text,purpose text,required boolean,fingerprint jsonb) language plpgsql immutable set search_path='' as $$
declare person jsonb; policy jsonb:=data->'_documentPolicy';
begin
 return query select * from rental_private.tenant_definitions_v3(data);
 if policy->>'version' is distinct from '4' then return; end if;
 scope_key:='application'; required:=coalesce((policy->>'extendedRequired')::boolean,false);
 subject_id:='primary'; purpose:='address'; fingerprint:=coalesce(data->'identity','{}')||jsonb_build_object('address',data#>>'{rentalHistory,currentAddress}'); return next;
 for person in select value from jsonb_array_elements(coalesce(data->'people','[]')) loop
  subject_id:=person->>'id'; if subject_id is null or subject_id in ('primary','entity') then continue; end if;
  purpose:='address'; fingerprint:=person; return next;
  if person->>'role' in ('authorised_signatory','trustee') then purpose:='authority'; fingerprint:=person; required:=true; return next; required:=coalesce((policy->>'extendedRequired')::boolean,false); end if;
 end loop;
 if data#>>'{entity,type}' in ('company','close_corporation','trust') then
  subject_id:='entity'; fingerprint:=coalesce(data->'entity','{}')||jsonb_build_object('people',data->'people'); purpose:='address'; return next;
  purpose:='beneficial_ownership'; return next;
  if data#>>'{entity,type}'='trust' then purpose:='trust_authority'; required:=true; return next; end if;
 end if;
end; $$;
revoke all on function rental_private.tenant_definitions(jsonb),rental_private.protect_document_policy() from public,anon,authenticated;
create or replace function rental_private.sync_checklist(p_org uuid,p_application uuid,p_landlord uuid,p_discovery jsonb,p_application_data jsonb default '{}')
returns void language plpgsql set search_path='' as $$
declare context public.rental_onboarding_checklists%rowtype; item record; requirement public.rental_onboarding_requirements%rowtype; candidate uuid; revision_changed boolean; rule_changed boolean:=false; seen uuid[]:=array[]::uuid[]; rule text; mode_value text; source_value text;
begin
 rule:=case when p_application is not null then case when (select document_policy_json->>'version' from public.rental_applications where id=p_application)='4' then 'rental_application_evidence_v4' else 'rental_application_evidence_v1' end else 'rental_landlord_collection_v1' end;
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
 select * from rental_private.tenant_definitions(p_discovery || jsonb_build_object('_documentPolicy',(select document_policy_json from public.rental_applications where id=p_application))) where p_application is not null
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
    or (d.intake_requirement_id is null and item.subject_id='primary' and d.document_type=item.purpose and not exists(select 1 from jsonb_array_elements(coalesce(p_application_data->'documentInvalidations','[]')) i where i->>'subjectId'='primary') and not exists(select 1 from jsonb_array_elements(coalesce(p_application_data->'documentLinks','[]')) l where l->>'documentId'=d.id::text)))
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


create or replace view public.rental_onboarding_requirement_summaries with(security_invoker=true) as
select r.id,r.checklist_id,r.subject_id,r.scope_key,r.purpose,r.required,r.active,r.generation,r.discovery_revision,r.fingerprint_json,r.current_document_id,r.requested_at,r.expires_at,
 c.organisation_id,c.application_id,c.landlord_lead_id,c.mode,c.rule_version,
 case when not r.active then 'superseded' when r.expires_at<=now() then 'expired'
 when r.purpose='signed_consent' and exists(select 1 from public.rental_application_person_permissions pp join public.rental_applications pa on pa.id=pp.application_id where pp.requirement_id=r.id and pp.generation=r.generation and pp.submission_at=pa.submitted_at) then 'accepted'
 when coalesce(pack.status,d.status,l.status)='accepted' then 'accepted' when coalesce(pack.status,d.status,l.status)='rejected' then 'rejected'
 when coalesce(pack.status,d.status,l.status)='uploaded' then 'received' when r.requested_at is not null then 'requested' else 'missing' end state,
 r.current_landlord_document_id
from public.rental_onboarding_requirements r join public.rental_onboarding_checklists c on c.id=r.checklist_id
left join public.rental_application_documents d on d.id=r.current_document_id
left join public.rental_landlord_onboarding_documents l on l.id=r.current_landlord_document_id
left join lateral(select case when bool_or(b.status='rejected') then 'rejected' when bool_and(b.status='accepted') then 'accepted' else 'uploaded' end status from public.rental_application_documents b join public.rental_onboarding_evidence_assignments e on e.document_id=b.id where e.requirement_id=r.id and e.generation=r.generation and b.intake_bundle_id=d.intake_bundle_id) pack on true;
create or replace function public.rental_current_document_status(p_application_id uuid, data jsonb, subject text, purpose text)
returns text language sql stable set search_path='' as $$
select coalesce((select 'accepted' from public.rental_application_person_permissions pp join public.rental_applications pa on pa.id=pp.application_id join public.rental_onboarding_requirements rr on rr.id=pp.requirement_id where purpose='signed_consent' and pp.application_id=p_application_id and pp.subject_id=subject and pp.submission_at=pa.submitted_at and rr.active and rr.generation=pp.generation limit 1),(select d.status from public.rental_application_documents d where d.application_id=p_application_id and (
        exists(select 1 from jsonb_array_elements(coalesce(data->'documentLinks','[]'::jsonb)) l where l->>'documentId'=d.id::text and l->>'subjectId'=subject and l->>'purpose'=purpose and l->>'invalidated' is distinct from 'true')
        or (d.intake_requirement_id is null and subject='primary' and not exists(select 1 from jsonb_array_elements(coalesce(data->'documentInvalidations','[]')) i where i->>'subjectId'='primary') and d.document_type=purpose and not exists(select 1 from jsonb_array_elements(coalesce(data->'documentLinks','[]'::jsonb)) l where l->>'documentId'=d.id::text))) order by d.uploaded_at desc nulls last,d.created_at desc,d.id desc limit 1));
$$;
create function public.rental_record_person_permission(p_application_id uuid,p_expected_version integer,p_subject_id text,p_requirement_id uuid,p_generation integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.rental_applications%rowtype; result jsonb;
begin
 select * into a from public.rental_applications where id=p_application_id for update;
 if not found or a.status not in ('submitted','under_review') then raise exception 'Document collection is closed'; end if;
 if p_expected_version is null or a.version<>p_expected_version then raise exception 'This application changed. Refresh and try again'; end if;
 if not exists(select 1 from jsonb_array_elements(coalesce(a.application_data->'people','[]')) p where p->>'id'=p_subject_id) or not exists(select 1 from public.rental_onboarding_requirements r join public.rental_onboarding_checklists c on c.id=r.checklist_id where r.id=p_requirement_id and c.application_id=a.id and r.subject_id=p_subject_id and r.purpose='signed_consent' and r.active and r.generation=p_generation) then raise exception 'The person or requirement changed'; end if;
 insert into public.rental_application_person_permissions(application_id,organisation_id,subject_id,requirement_id,generation,submission_at,wording_version,evidence_json) values(a.id,a.organisation_id,p_subject_id,p_requirement_id,p_generation,a.submitted_at,'rental-person-permission-v1',jsonb_build_object('privacy',true,'identityVerification',true,'screening',true,'ownInformation',true,'person', (select p from jsonb_array_elements(a.application_data->'people') p where p->>'id'=p_subject_id))) on conflict(application_id,subject_id,requirement_id,generation,submission_at) do nothing;
 return jsonb_build_object('recorded',true);
end; $$;
revoke all on function public.rental_record_person_permission(uuid,integer,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.rental_record_person_permission(uuid,integer,text,uuid,integer) to service_role;
create or replace view public.rental_application_review_summaries with (security_invoker=true) as
select a.id,a.organisation_id,a.vacancy_id,a.unit_id,a.status,a.version,a.application_data,a.submitted_at,a.updated_at,
coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'intake_bundle_id',d.intake_bundle_id,'type',d.document_type,'status',d.status,'name',d.file_name,'uploaded_at',d.uploaded_at,'created_at',d.created_at,'review_note',d.review_note,'reviewed_at',d.reviewed_at,'reviewed_by',d.reviewed_by) order by d.created_at desc) from public.rental_application_documents d where d.application_id=a.id),'[]'::jsonb) documents,
coalesce((select jsonb_agg(jsonb_build_object('type',c.consent_type,'version',c.wording_version,'accepted_at',c.accepted_at,'source',c.source,'evidence',c.evidence_json) order by c.accepted_at desc) from public.rental_application_consents c where c.application_id=a.id),'[]'::jsonb) consents,
a.lead_id,a.submitted_snapshot_json,
coalesce((select jsonb_agg(to_jsonb(r) - 'fingerprint_json' order by r.scope_key,r.subject_id,r.purpose) from public.rental_onboarding_requirement_summaries r where r.application_id=a.id),'[]'::jsonb) requirements
from public.rental_applications a;
revoke all on public.rental_application_review_summaries from anon;
grant select on public.rental_application_review_summaries to authenticated;

create function rental_private.validate_person_link() returns trigger language plpgsql set search_path='' as $$ begin
 if new.subject_id is not null and not exists(select 1 from public.rental_applications a,jsonb_array_elements(coalesce(a.application_data->'people','[]')) p where a.id=new.application_id and a.status in ('submitted','under_review') and p->>'id'=new.subject_id) then raise exception 'This person is unavailable for document collection'; end if;
 if new.subject_id is not null then select r.generation into new.subject_generation from public.rental_onboarding_requirements r join public.rental_onboarding_checklists c on c.id=r.checklist_id where c.application_id=new.application_id and r.subject_id=new.subject_id and r.purpose='signed_consent' and r.active; if new.subject_generation is null then raise exception 'Save the person’s checklist before creating a link'; end if; end if; return new; end; $$;
create trigger rental_person_link before insert or update of subject_id,application_id on public.rental_application_access_tokens for each row execute function rental_private.validate_person_link();
revoke all on function rental_private.validate_person_link() from public,anon,authenticated;
create or replace function public.rental_attach_submitted_document(p_application_id uuid,p_expected_version integer,p_document_id uuid,p_requirement_id uuid,p_generation integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.rental_applications%rowtype; r record; d public.rental_application_documents%rowtype; links jsonb; upload_source text; affected text[];
begin
 select * into a from public.rental_applications where id=p_application_id for update;
 if not found then raise exception 'Application unavailable'; end if;
 if auth.uid() is null then
  if auth.role() is distinct from 'service_role' then raise exception 'Authentication is required'; end if;
  upload_source:='applicant';
 else
  if not exists(select 1 from public.rental_vacancies v join public.rental_properties p on p.id=v.property_id where v.id=a.vacancy_id and public.rental_branch_access(p.organisation_id,p.branch_id)) then raise exception 'Application unavailable in your current scope'; end if;
  upload_source:='agent';
 end if;
 if a.status not in ('submitted','under_review') then raise exception 'Application is closed for document collection'; end if;
 if p_expected_version is null or a.version<>p_expected_version then raise exception 'This application changed. Refresh and try again.' using errcode='40001'; end if;
 select * into r from public.rental_onboarding_requirement_summaries where id=p_requirement_id and application_id=a.id and organisation_id=a.organisation_id and active and mode='active' and scope_key='application' and generation=p_generation;
 if not found then raise exception 'The saved evidence requirement changed. Refresh and upload again'; end if;
 if r.state='accepted' and (r.expires_at is null or r.expires_at>now()) then raise exception 'This document has already been accepted. Contact your agent for a correction'; end if;
 select * into d from public.rental_application_documents where id=p_document_id and application_id=a.id and organisation_id=a.organisation_id and status='uploaded';
 if not found or d.intake_requirement_id is distinct from r.id or d.intake_generation is distinct from r.generation or d.document_type is distinct from (case when r.purpose in ('identity','proof_of_income','bank_statement','reference') then r.purpose else 'other' end) or d.storage_path is null or d.storage_path not like a.organisation_id::text||'/'||a.id::text||'/%' then raise exception 'Document unavailable for this application'; end if;
 if exists(select 1 from public.rental_onboarding_evidence_assignments where document_id=d.id) then raise exception 'Document is already assigned'; end if;
 links:=coalesce(a.application_data->'documentLinks','[]')||jsonb_build_array(jsonb_build_object('documentId',d.id,'subjectId',r.subject_id,'purpose',r.purpose,'source',upload_source,'requirementId',r.id,'generation',r.generation));
 perform set_config('app.rental_evidence_command','on',true);
 update public.rental_applications set application_data=jsonb_set(application_data,'{documentLinks}',links),version=version+1 where id=a.id returning * into a;
 affected:=array[r.subject_id];
 if r.subject_id='entity' then affected:=array_append(affected,'primary');
 elsif r.subject_id='primary' and a.application_data#>>'{entity,type}' in ('company','close_corporation','trust') then affected:=array_append(affected,'entity'); end if;
 update public.rental_application_screening_checks set result_json=jsonb_set(coalesce(result_json,'{}'),'{subjects}',coalesce(result_json->'subjects','{}')-affected),status='not_started',reviewed_at=null,reviewed_by=null,evidence_note=null,expires_at=null where application_id=a.id and coalesce(result_json->'subjects','{}') ?| affected;
 perform set_config('app.rental_evidence_command','off',true);
 return to_jsonb(a);
end; $$;
revoke all on function public.rental_attach_submitted_document(uuid,integer,uuid,uuid,integer) from public,anon;
grant execute on function public.rental_attach_submitted_document(uuid,integer,uuid,uuid,integer) to authenticated,service_role;
commit;
