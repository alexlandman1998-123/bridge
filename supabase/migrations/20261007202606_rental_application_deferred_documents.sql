-- Details may be submitted before collection is complete. Approval stays gated.
-- Submitted answers and the submission snapshot remain frozen; a scoped command
-- may append evidence links for the existing saved requirement only.
begin;
alter table public.rental_application_documents add column intake_requirement_id uuid references public.rental_onboarding_requirements(id), add column intake_generation integer;

create or replace function public.rental_application_document_intake_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare a public.rental_applications%rowtype; r record;
begin
 select * into a from public.rental_applications where id=new.application_id for update;
 if not found or a.organisation_id is distinct from new.organisation_id or a.status not in ('draft','submitted','under_review') or new.status is distinct from 'uploaded' then raise exception 'Evidence uploads require an open application in the same organisation'; end if;
 if new.intake_requirement_id is not null then
  select * into r from public.rental_onboarding_requirement_summaries where id=new.intake_requirement_id and application_id=a.id and active and scope_key='application' and mode='active' and generation=new.intake_generation;
  if not found or new.document_type is distinct from (case when r.purpose in ('identity','proof_of_income','bank_statement','reference') then r.purpose else 'other' end) then raise exception 'The saved evidence requirement changed. Refresh and upload again'; end if;
  if a.status<>'draft' and r.state='accepted' and (r.expires_at is null or r.expires_at>now()) then raise exception 'This document has already been accepted. Contact your agent for a correction'; end if;
 elsif a.status<>'draft' then raise exception 'Submitted evidence requires its saved requirement'; end if;
 return new;
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

create or replace function public.rental_current_document_status(p_application_id uuid, data jsonb, subject text, purpose text)
returns text language sql stable set search_path='' as $$
select d.status from public.rental_application_documents d where d.application_id=p_application_id and (
        exists(select 1 from jsonb_array_elements(coalesce(data->'documentLinks','[]'::jsonb)) l where l->>'documentId'=d.id::text and l->>'subjectId'=subject and l->>'purpose'=purpose and l->>'invalidated' is distinct from 'true')
        or (d.intake_requirement_id is null and subject='primary' and not exists(select 1 from jsonb_array_elements(coalesce(data->'documentInvalidations','[]')) i where i->>'subjectId'='primary') and d.document_type=purpose and not exists(select 1 from jsonb_array_elements(coalesce(data->'documentLinks','[]'::jsonb)) l where l->>'documentId'=d.id::text))) order by d.uploaded_at desc nulls last,d.created_at desc,d.id desc limit 1;
$$;
create or replace function public.rental_application_review_integrity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare slot record; doc_status text; kind text; subject record; result jsonb;
begin
  if old.status='draft' and new.status not in ('draft','submitted') then raise exception 'Draft applications must be submitted before review'; end if;
  if old.status in ('approved','declined','withdrawn') then raise exception 'Final applications are locked'; end if;
  if old.status in ('submitted','under_review') and (new.submitted_at is distinct from old.submitted_at or new.submitted_snapshot_json is distinct from old.submitted_snapshot_json or new.organisation_id is distinct from old.organisation_id or new.vacancy_id is distinct from old.vacancy_id or new.unit_id is distinct from old.unit_id or new.applicant_party_id is distinct from old.applicant_party_id or new.lead_id is distinct from old.lead_id) then raise exception 'Submitted snapshot and application links are locked'; end if;
  if old.status in ('submitted','under_review') and (case when current_setting('app.rental_evidence_command',true)='on' then new.application_data - 'documentLinks' else new.application_data end - 'review' - 'onboarding') is distinct from (case when current_setting('app.rental_evidence_command',true)='on' then old.application_data - 'documentLinks' else old.application_data end - 'review' - 'onboarding') then raise exception 'Submitted answers are locked; request corrections first'; end if;
  if old.status in ('submitted','under_review') and (new.status='draft' or new.application_data->'review' is distinct from old.application_data->'review') and current_setting('app.rental_review_command',true) is distinct from 'on' then raise exception 'Review changes require a reviewer command'; end if;
  if old.status='draft' then new.application_data:=public.rental_invalidate_document_assignments(old.application_data,new.application_data); end if;
  if old.status='draft' and new.status='submitted' then
    if auth.uid() is not null then raise exception 'Applicant submission requires the onboarding endpoint'; end if;
    if new.application_data->>'schemaVersion'='arch9_rental_application_fields_v2' then
      for subject in select value person from jsonb_array_elements(coalesce(new.application_data->'people','[]')) loop
        if nullif(btrim(subject.person->>'identityNumber'),'') is null or (nullif(btrim(subject.person->>'email'),'') is null and nullif(btrim(subject.person->>'phone'),'') is null) then raise exception 'Additional person identity and contact are required'; end if;
      end loop;

    end if;
    new.application_data:=new.application_data-'review';
    new.submitted_snapshot_json:=new.application_data;
  end if;
  if new.status in ('approved','declined','withdrawn') and old.status not in ('submitted','under_review') then raise exception 'Submit the application before deciding'; end if;
  if new.status='approved' then
    if old.status not in ('submitted','under_review') or new.submitted_at is null then raise exception 'Submit the application before approval'; end if;
    for slot in select * from public.rental_review_document_slots(new.application_data) loop
      doc_status:=public.rental_current_document_status(new.id,new.application_data,slot.subject_id,slot.purpose);
      if doc_status is distinct from 'accepted' then raise exception 'Required document needs acceptance: % / %',slot.subject_id,slot.purpose; end if;
    end loop;
    foreach kind in array array['privacy','credit_check','identity_verification'] loop
      if not exists(select 1 from public.rental_application_consents c where c.application_id=new.id and c.consent_type=kind and c.source='applicant' and c.evidence_json->>'accepted'='true' and (new.application_data->>'schemaVersion' is distinct from 'arch9_rental_application_fields_v2' or c.evidence_json->>'declarationAccepted'='true') and (c.evidence_json->>'submitted_at')::timestamptz=new.submitted_at) then raise exception 'Current applicant consent required: %',kind; end if;
    end loop;
    foreach kind in array array['identity','fica','affordability','employment','reference'] loop
      for subject in select * from public.rental_review_subjects(new.application_data,kind) loop
        select result_json #> array['subjects',subject.subject_id] into result from public.rental_application_screening_checks where application_id=new.id and check_type=kind;
        if result->>'status' is distinct from 'passed' or nullif(result->>'reviewedBy','') is null or nullif(btrim(result->>'evidenceNote'),'') is null or (result->>'submissionAt')::timestamptz is distinct from new.submitted_at or nullif(result->>'expiresAt','')::date < current_date then raise exception 'Current screening required: % / %',subject.subject_id,kind; end if;
      end loop;
    end loop;
    result:=new.application_data #> '{review,landlordDecision}';
    if result->>'outcome' is distinct from 'approved' or nullif(result->>'recordedBy','') is null or (result->>'submissionAt')::timestamptz is distinct from new.submitted_at then raise exception 'Record landlord approval for this submission'; end if;
  end if;
  return new;
end; $$;
create or replace function rental_private.application_checklist_gate() returns trigger
language plpgsql security definer set search_path='' as $$
declare link jsonb; r record; state_required text[];
begin
 -- Runs after checklist_saved. The parent row remains locked until all checks commit.
 for link in select value from jsonb_array_elements(coalesce(new.application_data->'documentLinks','[]')) loop
  if link->>'invalidated'='true' or (coalesce(old.application_data->'documentLinks','[]') @> jsonb_build_array(link)) then continue; end if;
  if link ? 'requirementId' or link ? 'generation' then
   if not exists(select 1 from public.rental_onboarding_requirement_summaries s
     where s.application_id=new.id and s.organisation_id=new.organisation_id and s.active and s.mode='active'
     and s.id::text=link->>'requirementId' and s.generation::text=link->>'generation'
     and s.scope_key='application' and s.subject_id=link->>'subjectId' and s.purpose=link->>'purpose'
     and s.current_document_id::text=link->>'documentId') then
    raise exception 'The saved evidence requirement changed; prepare a new upload';
   end if;
  end if;
 end loop;
 if old.status='draft' and new.status='submitted' then
  if not exists(select 1 from public.rental_onboarding_requirement_summaries s where s.application_id=new.id and s.active and s.required and s.mode='active') then raise exception 'Save the draft to prepare its document checklist'; end if;
  return new;
 elsif new.status='approved' and old.status is distinct from new.status then state_required:=array['accepted'];
 else return new; end if;
 if not exists(select 1 from public.rental_onboarding_requirement_summaries s where s.application_id=new.id and s.active and s.required and s.mode='active') then raise exception 'Save the draft to prepare its document checklist'; end if;
 for r in select * from public.rental_onboarding_requirement_summaries s where s.application_id=new.id and s.active and s.required and s.mode='active' loop
  if not(r.state=any(state_required)) then raise exception 'Current saved evidence required: % / % (%)',r.subject_id,r.purpose,r.state; end if;
 end loop;
 return new;
end; $$;

create function public.rental_attach_submitted_document(p_application_id uuid,p_expected_version integer,p_document_id uuid,p_requirement_id uuid,p_generation integer)
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
 if a.version<>p_expected_version then raise exception 'This application changed. Refresh and try again.' using errcode='40001'; end if;
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
