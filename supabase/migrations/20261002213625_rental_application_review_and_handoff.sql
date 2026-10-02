begin;
-- Evidence is reviewed through a scoped, version-checked command, never a browser upsert.
alter table public.rental_application_events drop constraint rental_application_events_event_type_check;
alter table public.rental_application_events add constraint rental_application_events_event_type_check check (event_type in ('rental_application_approved','rental_application_declined','rental_application_withdrawn','review_started','document_reviewed','screening_reviewed','landlord_response_recorded','changes_requested','tenancy_prepared'));

create or replace function public.rental_review_subjects(data jsonb, check_kind text)
returns table(subject_id text) language sql immutable set search_path = '' as $$
  select case when data #>> '{entity,type}' in ('company','close_corporation','trust') and check_kind not in ('identity','fica') then 'entity' else 'primary' end
  union all
  select person->>'id' from jsonb_array_elements(coalesce(data->'people','[]'::jsonb)) person
  where check_kind in ('identity','fica') or (check_kind = 'reference' and person->>'role' in ('co_tenant','guarantor'))
    or (check_kind in ('affordability','employment') and (person->>'role' = 'guarantor' or person->>'contributesToAffordability' = 'true'));
$$;
create or replace function public.rental_review_document_slots(data jsonb)
returns table(subject_id text, purpose text) language sql immutable set search_path = '' as $$
  select 'primary','identity' union all select 'primary','proof_of_income'
  union all select 'entity', kind from unnest(array['registration','authority']) kind where data #>> '{entity,type}' in ('company','close_corporation','trust')
  union all select person->>'id', kind from jsonb_array_elements(coalesce(data->'people','[]'::jsonb)) person cross join unnest(array['identity','signed_consent']) kind
  union all select person->>'id','proof_of_income' from jsonb_array_elements(coalesce(data->'people','[]'::jsonb)) person where person->>'role' = 'guarantor' or person->>'contributesToAffordability' = 'true';
$$;
revoke execute on function public.rental_review_subjects(jsonb,text), public.rental_review_document_slots(jsonb) from public, anon;
grant execute on function public.rental_review_subjects(jsonb,text), public.rental_review_document_slots(jsonb) to authenticated;

create or replace function public.rental_record_application_review(p_application_id uuid, p_expected_version integer, p_command text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.rental_applications%rowtype; data jsonb; event_kind text; next_status text; kind text; subject text; outcome text; note text; results jsonb; item jsonb; expiry date; aggregate_status text;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  select * into a from public.rental_applications where id=p_application_id for update;
  if not found or not exists(select 1 from public.rental_vacancies v join public.rental_properties p on p.id=v.property_id where v.id=a.vacancy_id and public.rental_branch_access(p.organisation_id,p.branch_id)) then raise exception 'Application unavailable in your current scope'; end if;
  if a.version <> p_expected_version then raise exception 'This application changed. Refresh and try again.' using errcode='40001'; end if;
  if a.status not in ('submitted','under_review') then raise exception 'Only submitted applications can be reviewed'; end if;
  data := a.application_data; next_status := 'under_review';
  perform set_config('app.rental_review_command','on',true);
  if p_command='start_review' then event_kind:='review_started';
  elsif p_command='review_document' then
    if p_payload->>'status' is null or p_payload->>'status' not in ('accepted','rejected') or nullif(btrim(p_payload->>'note'),'') is null then raise exception 'Choose an outcome and record a document review note'; end if;
    update public.rental_application_documents set status=p_payload->>'status',review_note=p_payload->>'note',reviewed_by=auth.uid(),reviewed_at=now() where id=(p_payload->>'documentId')::uuid and application_id=a.id and status in ('uploaded','accepted','rejected');
    if not found then raise exception 'Uploaded document unavailable'; end if;
    event_kind:='document_reviewed';
  elsif p_command='screening' then
    kind:=p_payload->>'checkType'; subject:=p_payload->>'subjectId'; outcome:=p_payload->>'status'; note:=nullif(btrim(p_payload->>'evidenceNote'),''); expiry:=nullif(p_payload->>'expiresAt','')::date;
    if kind is null or subject is null or outcome is null or kind not in ('identity','fica','affordability','employment','reference') or outcome not in ('not_started','in_progress','passed','needs_review','failed','expired') or note is null then raise exception 'Choose a screening outcome and record evidence'; end if;
    if not exists(select 1 from public.rental_review_subjects(data,kind) s where s.subject_id=subject) then raise exception 'Screening subject does not match this application'; end if;
    if outcome='passed' and expiry < current_date then raise exception 'Expired evidence cannot pass screening'; end if;
    select result_json into results from public.rental_application_screening_checks where application_id=a.id and check_type=kind;
    results:=coalesce(results,'{}'::jsonb);
    item:=jsonb_build_object('status',outcome,'evidenceNote',note,'expiresAt',expiry,'reviewedBy',auth.uid(),'reviewedAt',now(),'submissionAt',a.submitted_at);
    results:=jsonb_set(results,'{subjects}',coalesce(results->'subjects','{}'::jsonb)||jsonb_build_object(subject,item),true);
    aggregate_status:=case when not exists(select 1 from public.rental_review_subjects(data,kind) s where coalesce(results #>> array['subjects',s.subject_id,'status'],'') <> 'passed' or nullif(results #>> array['subjects',s.subject_id,'expiresAt'],'')::date < current_date) then 'passed' else 'in_progress' end;
    insert into public.rental_application_screening_checks(application_id,organisation_id,check_type,status,result_json,evidence_note,expires_at,reviewed_by,reviewed_at) values(a.id,a.organisation_id,kind,aggregate_status,results,note,expiry,auth.uid(),now())
    on conflict(application_id,check_type) do update set status=excluded.status,result_json=excluded.result_json,evidence_note=excluded.evidence_note,expires_at=excluded.expires_at,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at;
    event_kind:='screening_reviewed';
  elsif p_command='landlord_response' then
    if p_payload->>'outcome' is null or p_payload->>'channel' is null or p_payload->>'outcome' not in ('approved','declined','needs_info') or p_payload->>'channel' not in ('phone','email','meeting','written') or nullif(btrim(p_payload->>'name'),'') is null or nullif(btrim(p_payload->>'note'),'') is null then raise exception 'Record the landlord, response, channel and evidence'; end if;
    data:=jsonb_set(data,'{review}',coalesce(data->'review','{}'::jsonb)||jsonb_build_object('landlordDecision',jsonb_build_object('outcome',p_payload->>'outcome','channel',p_payload->>'channel','name',p_payload->>'name','note',p_payload->>'note','recordedAt',now(),'recordedBy',auth.uid(),'submissionAt',a.submitted_at)),true);
    event_kind:='landlord_response_recorded';
  elsif p_command='request_changes' then
    if nullif(btrim(p_payload->>'message'),'') is null then raise exception 'Explain which corrections the applicant should make'; end if;
    data:=jsonb_set(data,'{review}',jsonb_build_object('requestedChanges',p_payload->>'message','requestedAt',now(),'requestedBy',auth.uid()),true);
    update public.rental_application_screening_checks set status='not_started',result_json='{}',reviewed_by=null,reviewed_at=null,evidence_note=null,expires_at=null where application_id=a.id;
    update public.rental_application_documents set status='uploaded',review_note=null,reviewed_by=null,reviewed_at=null where application_id=a.id and status in ('accepted','rejected');
    next_status:='draft'; event_kind:='changes_requested';
  else raise exception 'Unknown review command'; end if;
  update public.rental_applications set application_data=data,status=next_status,version=version+1 where id=a.id;
  insert into public.rental_application_events(application_id,organisation_id,event_type,aggregate_version,payload_json,occurred_by) values(a.id,a.organisation_id,event_kind,a.version+1,p_payload,auth.uid());
  perform set_config('app.rental_review_command','off',true);
  return jsonb_build_object('id',a.id,'version',a.version+1,'status',next_status);
end; $$;
revoke execute on function public.rental_record_application_review(uuid,integer,text,jsonb) from public, anon;
grant execute on function public.rental_record_application_review(uuid,integer,text,jsonb) to authenticated;
revoke insert,update on public.rental_application_screening_checks from authenticated;
revoke update on public.rental_application_documents from authenticated;
-- Applicant declarations can only be captured by the token-authenticated server endpoint.
revoke insert,update,delete on public.rental_application_consents from authenticated;

create or replace function public.rental_application_review_integrity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare slot record; doc_status text; kind text; subject record; result jsonb;
begin
  if old.status='draft' and new.status not in ('draft','submitted') then raise exception 'Draft applications must be submitted before review'; end if;
  if old.status in ('approved','declined','withdrawn') then raise exception 'Final applications are locked'; end if;
  if old.status in ('submitted','under_review') and (new.submitted_at is distinct from old.submitted_at or new.submitted_snapshot_json is distinct from old.submitted_snapshot_json or new.organisation_id is distinct from old.organisation_id or new.vacancy_id is distinct from old.vacancy_id or new.unit_id is distinct from old.unit_id or new.applicant_party_id is distinct from old.applicant_party_id or new.lead_id is distinct from old.lead_id) then raise exception 'Submitted snapshot and application links are locked'; end if;
  if old.status in ('submitted','under_review') and (new.application_data - 'review' - 'onboarding') is distinct from (old.application_data - 'review' - 'onboarding') then raise exception 'Submitted answers are locked; request corrections first'; end if;
  if old.status in ('submitted','under_review') and (new.status='draft' or new.application_data->'review' is distinct from old.application_data->'review') and current_setting('app.rental_review_command',true) is distinct from 'on' then raise exception 'Review changes require a reviewer command'; end if;
  if old.status='draft' and new.status='submitted' then
    if auth.uid() is not null then raise exception 'Applicant submission requires the onboarding endpoint'; end if;
    new.application_data:=new.application_data-'review';
    new.submitted_snapshot_json:=new.application_data;
  end if;
  if new.status in ('approved','declined','withdrawn') and old.status not in ('submitted','under_review') then raise exception 'Submit the application before deciding'; end if;
  if new.status='approved' then
    if old.status not in ('submitted','under_review') or new.submitted_at is null then raise exception 'Submit the application before approval'; end if;
    for slot in select * from public.rental_review_document_slots(new.application_data) loop
      select d.status into doc_status from public.rental_application_documents d where d.application_id=new.id and (
        exists(select 1 from jsonb_array_elements(coalesce(new.application_data->'documentLinks','[]'::jsonb)) l where l->>'documentId'=d.id::text and l->>'subjectId'=slot.subject_id and l->>'purpose'=slot.purpose)
        or (slot.subject_id='primary' and d.document_type=slot.purpose and not exists(select 1 from jsonb_array_elements(coalesce(new.application_data->'documentLinks','[]'::jsonb)) l where l->>'documentId'=d.id::text))) order by d.uploaded_at desc nulls last,d.created_at desc limit 1;
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
revoke execute on function public.rental_application_review_integrity() from public, anon, authenticated;
create trigger trg_rental_application_review_integrity before update on public.rental_applications for each row execute function public.rental_application_review_integrity();

create or replace function public.rental_application_draft_intake_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status <> 'draft' then raise exception 'New applications must begin as drafts'; end if;
  return new;
end; $$;
revoke execute on function public.rental_application_draft_intake_guard() from public, anon, authenticated;
create trigger trg_rental_application_draft_intake_guard before insert on public.rental_applications for each row execute function public.rental_application_draft_intake_guard();

create or replace function public.rental_application_document_intake_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'uploaded' or not exists(select 1 from public.rental_applications where id=new.application_id and status='draft') then raise exception 'Evidence uploads require a draft application'; end if;
  return new;
end; $$;
revoke execute on function public.rental_application_document_intake_guard() from public, anon, authenticated;
create trigger trg_rental_application_document_intake_guard before insert on public.rental_application_documents for each row execute function public.rental_application_document_intake_guard();

create or replace view public.rental_application_review_summaries with (security_invoker=true) as
select a.id,a.organisation_id,a.vacancy_id,a.unit_id,a.status,a.version,a.application_data,a.submitted_at,a.updated_at,
coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'type',d.document_type,'status',d.status,'name',d.file_name,'uploaded_at',d.uploaded_at,'review_note',d.review_note,'reviewed_at',d.reviewed_at,'reviewed_by',d.reviewed_by) order by d.created_at desc) from public.rental_application_documents d where d.application_id=a.id),'[]'::jsonb) documents,
coalesce((select jsonb_agg(jsonb_build_object('type',c.consent_type,'version',c.wording_version,'accepted_at',c.accepted_at,'source',c.source,'evidence',c.evidence_json) order by c.accepted_at desc) from public.rental_application_consents c where c.application_id=a.id),'[]'::jsonb) consents,
a.lead_id,a.submitted_snapshot_json
from public.rental_applications a;
revoke all on public.rental_application_review_summaries from anon;
grant select on public.rental_application_review_summaries to authenticated;

create or replace function public.rental_convert_application_to_tenancy(p_application_id uuid, p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare application_row public.rental_applications%rowtype; unit_row public.rental_units%rowtype; v_tenancy_id uuid; lease_id uuid; occupation_date date; approved_data jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  select application.* into application_row from public.rental_applications application where application.id = p_application_id for update;
  if not found then raise exception 'Rental application not found'; end if;
  if not exists (select 1 from public.rental_vacancies vacancy join public.rental_properties property on property.id = vacancy.property_id where vacancy.id = application_row.vacancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'You are not authorized for this rental application'; end if;
  select tenancy.id into v_tenancy_id from public.rental_tenancies tenancy where tenancy.source_application_id = application_row.id;
  if v_tenancy_id is not null then
    select lease.id into lease_id from public.rental_leases lease where lease.tenancy_id = v_tenancy_id;
    return jsonb_build_object('tenancy_id', v_tenancy_id, 'lease_id', lease_id, 'idempotent', true);
  end if;
  if application_row.status <> 'approved' then raise exception 'Only an approved application can be converted to a tenancy'; end if;
  if application_row.version <> p_expected_version then raise exception 'This application changed. Refresh and try again.' using errcode = '40001'; end if;
  select unit.* into unit_row from public.rental_units unit where unit.id = application_row.unit_id for update;
  if not found or unit_row.organisation_id <> application_row.organisation_id then raise exception 'Rental unit does not match application'; end if;
  if unit_row.active_tenancy_id is not null or unit_row.status in ('lease_pending', 'occupied', 'notice_given', 'maintenance_hold') then raise exception 'This rental unit is not available for tenancy conversion'; end if;
  approved_data := coalesce(application_row.submitted_snapshot_json,application_row.application_data);
  occupation_date := nullif(coalesce(approved_data #>> '{household,intendedOccupationDate}', approved_data #>> '{rentalHistory,intendedOccupationDate}'), '')::date;
  insert into public.rental_tenancies(organisation_id, property_id, unit_id, source_application_id, intended_occupation_date, tenant_snapshot_json, created_by)
  select application_row.organisation_id, vacancy.property_id, application_row.unit_id, application_row.id, occupation_date,
    approved_data - 'review' - 'onboarding', auth.uid()
  from public.rental_vacancies vacancy where vacancy.id = application_row.vacancy_id returning id into v_tenancy_id;
  if application_row.applicant_party_id is not null then
    insert into public.rental_tenancy_parties(tenancy_id, organisation_id, party_id, role, is_primary) values (v_tenancy_id, application_row.organisation_id, application_row.applicant_party_id, 'tenant', true);
  end if;
  insert into public.rental_leases(tenancy_id, organisation_id, terms_json, source_application_id, created_by)
  select v_tenancy_id, application_row.organisation_id, jsonb_build_object('monthly_rent', coalesce(nullif(approved_data #>> '{property,monthlyRent}','')::numeric,vacancy.asking_rent), 'deposit_amount', coalesce(nullif(approved_data #>> '{property,depositAmount}','')::numeric,vacancy.deposit_amount), 'lease_term_months', coalesce(nullif(approved_data #>> '{household,leasePeriodMonths}','')::integer,vacancy.lease_term_months), 'intended_occupation_date', occupation_date), application_row.id, auth.uid()
  from public.rental_vacancies vacancy where vacancy.id = application_row.vacancy_id returning id into lease_id;
  perform set_config('app.rental_tenancy_command', 'on', true);
  update public.rental_units set status = 'lease_pending' where id = unit_row.id;
  perform set_config('app.rental_tenancy_command', 'off', true);
  insert into public.rental_application_events(application_id,organisation_id,event_type,aggregate_version,payload_json,occurred_by) values(application_row.id,application_row.organisation_id,'tenancy_prepared',application_row.version,jsonb_build_object('tenancyId',v_tenancy_id,'leaseId',lease_id),auth.uid());
  return jsonb_build_object('tenancy_id', v_tenancy_id, 'lease_id', lease_id, 'idempotent', false, 'tenant_party_reused', application_row.applicant_party_id is not null);
exception when unique_violation then
  select tenancy.id into v_tenancy_id from public.rental_tenancies tenancy where tenancy.source_application_id = p_application_id;
  if v_tenancy_id is not null then select lease.id into lease_id from public.rental_leases lease where lease.tenancy_id = v_tenancy_id; return jsonb_build_object('tenancy_id', v_tenancy_id, 'lease_id', lease_id, 'idempotent', true); end if;
  raise;
end; $$;

revoke execute on function public.rental_convert_application_to_tenancy(uuid, integer) from public, anon;
grant execute on function public.rental_convert_application_to_tenancy(uuid, integer) to authenticated;


commit;
