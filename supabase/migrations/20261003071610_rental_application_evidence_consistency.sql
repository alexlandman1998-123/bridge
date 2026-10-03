-- Keep application collection and approval on the same current evidence contract.
begin;
create or replace function public.rental_primary_needs_income(data jsonb)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(nullif(data #>> '{income,monthlyIncome}','')::numeric,0)>0
 or coalesce(nullif(data #>> '{income,otherIncome}','')::numeric,0)>0
 or not exists(select 1 from jsonb_array_elements(coalesce(data->'people','[]')) p where
 (p->>'role'='guarantor' or p->>'contributesToAffordability'='true') and
 (coalesce(nullif(p->>'monthlyIncome','')::numeric,0)>0 or coalesce(nullif(p->>'otherIncome','')::numeric,0)>0));
$$;
create or replace function public.rental_evidence_identity(data jsonb, keys text[])
returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(k,coalesce(data->>k,'')),'{}') from unnest(keys) k;
$$;
create or replace function public.rental_invalidate_document_assignments(previous jsonb, next_data jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare affected text[]:=array[]::text[]; stale jsonb; links jsonb; person jsonb; current_person jsonb;
identity_keys text[]:=array['firstName','lastName','identityType','identityNumber','nationality','dateOfBirth','role','authorityBasis'];
begin
 if coalesce(previous,'{}')='{}'::jsonb then return next_data; end if;
 if coalesce(previous->'identity','{}')<>'{}'::jsonb and public.rental_evidence_identity(previous->'identity',identity_keys)<>public.rental_evidence_identity(next_data->'identity',identity_keys) then affected:=array_append(affected,'primary'); end if;
 if coalesce(previous->'entity','{}')<>'{}'::jsonb and public.rental_evidence_identity(previous->'entity',array['type','legalName','registrationNumber','primaryContactRole'])<>public.rental_evidence_identity(next_data->'entity',array['type','legalName','registrationNumber','primaryContactRole']) then
 affected:=affected||array['primary','entity'];
 for person in select value from jsonb_array_elements(coalesce(previous->'people','[]')) loop affected:=array_append(affected,person->>'id'); end loop;
 end if;
 for person in select value from jsonb_array_elements(coalesce(previous->'people','[]')) loop
 select value into current_person from jsonb_array_elements(coalesce(next_data->'people','[]')) where value->>'id'=person->>'id';
 if current_person is null or public.rental_evidence_identity(person,identity_keys)<>public.rental_evidence_identity(current_person,identity_keys) then affected:=array_append(affected,person->>'id'); if person->>'role' in ('authorised_signatory','trustee') or current_person->>'role' in ('authorised_signatory','trustee') then affected:=array_append(affected,'entity'); end if; end if;
 end loop;
 for person in select value from jsonb_array_elements(coalesce(next_data->'people','[]')) loop
 if person->>'role' in ('authorised_signatory','trustee') and not exists(select 1 from jsonb_array_elements(coalesce(previous->'people','[]')) p where p->>'id'=person->>'id') then affected:=array_append(affected,'entity'); end if;
 end loop;
 select coalesce(jsonb_agg(distinct jsonb_build_object('subjectId',subject_id)),'[]') into stale from (
 select value->>'subjectId' subject_id from jsonb_array_elements(coalesce(previous->'documentInvalidations','[]'))
 union select unnest(affected)) subjects;
 select coalesce(jsonb_agg(case when l->>'subjectId'=any(affected) or exists(select 1 from jsonb_array_elements(coalesce(previous->'documentLinks','[]')) p where p->>'documentId'=l->>'documentId' and p->>'invalidated'='true') then l||'{"invalidated":true}'::jsonb else l end),'[]') into links from jsonb_array_elements(coalesce(next_data->'documentLinks','[]')) l;
 select links||coalesce(jsonb_agg(p||'{"invalidated":true}'::jsonb),'[]') into links from jsonb_array_elements(coalesce(previous->'documentLinks','[]')) p where (p->>'invalidated'='true' or p->>'subjectId'=any(affected)) and not exists(select 1 from jsonb_array_elements(links) l where l->>'documentId'=p->>'documentId');
 if links<>'[]'::jsonb or next_data ? 'documentLinks' then next_data:=jsonb_set(next_data,'{documentLinks}',links); end if;
 if stale<>'[]'::jsonb then next_data:=jsonb_set(next_data,'{documentInvalidations}',stale); else next_data:=next_data-'documentInvalidations'; end if;
 return next_data;
end; $$;
revoke execute on function public.rental_primary_needs_income(jsonb), public.rental_evidence_identity(jsonb,text[]), public.rental_invalidate_document_assignments(jsonb,jsonb) from public,anon;
grant execute on function public.rental_primary_needs_income(jsonb), public.rental_evidence_identity(jsonb,text[]), public.rental_invalidate_document_assignments(jsonb,jsonb) to authenticated;
create or replace function public.rental_review_subjects(data jsonb, check_kind text)
returns table(subject_id text) language sql immutable set search_path = '' as $$
  select case when data #>> '{entity,type}' in ('company','close_corporation','trust') and check_kind not in ('identity','fica') then 'entity' else 'primary' end
  where data #>> '{entity,type}' in ('company','close_corporation','trust') or check_kind not in ('affordability','employment') or public.rental_primary_needs_income(data)
  union all
  select person->>'id' from jsonb_array_elements(coalesce(data->'people','[]'::jsonb)) person
  where check_kind in ('identity','fica') or (check_kind = 'reference' and person->>'role' in ('co_tenant','guarantor'))
    or (check_kind in ('affordability','employment') and (person->>'role' = 'guarantor' or person->>'contributesToAffordability' = 'true'));
$$;
create or replace function public.rental_review_document_slots(data jsonb)
returns table(subject_id text, purpose text) language sql immutable set search_path = '' as $$
  select 'primary','identity' union all select case when data #>> '{entity,type}' in ('company','close_corporation','trust') then 'entity' else 'primary' end,'proof_of_income' where data #>> '{entity,type}' in ('company','close_corporation','trust') or public.rental_primary_needs_income(data)
  union all select 'entity', kind from unnest(array['registration','authority']) kind where data #>> '{entity,type}' in ('company','close_corporation','trust')
  union all select person->>'id', kind from jsonb_array_elements(coalesce(data->'people','[]'::jsonb)) person cross join unnest(array['identity','signed_consent']) kind
  union all select person->>'id','proof_of_income' from jsonb_array_elements(coalesce(data->'people','[]'::jsonb)) person where person->>'role' = 'guarantor' or person->>'contributesToAffordability' = 'true';
$$;
revoke execute on function public.rental_review_subjects(jsonb,text), public.rental_review_document_slots(jsonb) from public, anon;
grant execute on function public.rental_review_subjects(jsonb,text), public.rental_review_document_slots(jsonb) to authenticated;

create or replace function public.rental_current_document_status(p_application_id uuid, data jsonb, subject text, purpose text)
returns text language sql stable set search_path='' as $$
select d.status from public.rental_application_documents d where d.application_id=p_application_id and (
        exists(select 1 from jsonb_array_elements(coalesce(data->'documentLinks','[]'::jsonb)) l where l->>'documentId'=d.id::text and l->>'subjectId'=subject and l->>'purpose'=purpose and l->>'invalidated' is distinct from 'true')
        or (subject='primary' and not exists(select 1 from jsonb_array_elements(coalesce(data->'documentInvalidations','[]')) i where i->>'subjectId'='primary') and d.document_type=purpose and not exists(select 1 from jsonb_array_elements(coalesce(data->'documentLinks','[]'::jsonb)) l where l->>'documentId'=d.id::text))) order by d.uploaded_at desc nulls last,d.created_at desc,d.id desc limit 1;
$$;
revoke execute on function public.rental_current_document_status(uuid,jsonb,text,text) from public,anon;
grant execute on function public.rental_current_document_status(uuid,jsonb,text,text) to authenticated;
create or replace function public.rental_application_review_integrity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare slot record; doc_status text; kind text; subject record; result jsonb;
begin
  if old.status='draft' and new.status not in ('draft','submitted') then raise exception 'Draft applications must be submitted before review'; end if;
  if old.status in ('approved','declined','withdrawn') then raise exception 'Final applications are locked'; end if;
  if old.status in ('submitted','under_review') and (new.submitted_at is distinct from old.submitted_at or new.submitted_snapshot_json is distinct from old.submitted_snapshot_json or new.organisation_id is distinct from old.organisation_id or new.vacancy_id is distinct from old.vacancy_id or new.unit_id is distinct from old.unit_id or new.applicant_party_id is distinct from old.applicant_party_id or new.lead_id is distinct from old.lead_id) then raise exception 'Submitted snapshot and application links are locked'; end if;
  if old.status in ('submitted','under_review') and (new.application_data - 'review' - 'onboarding') is distinct from (old.application_data - 'review' - 'onboarding') then raise exception 'Submitted answers are locked; request corrections first'; end if;
  if old.status in ('submitted','under_review') and (new.status='draft' or new.application_data->'review' is distinct from old.application_data->'review') and current_setting('app.rental_review_command',true) is distinct from 'on' then raise exception 'Review changes require a reviewer command'; end if;
  if old.status='draft' then new.application_data:=public.rental_invalidate_document_assignments(old.application_data,new.application_data); end if;
  if old.status='draft' and new.status='submitted' then
    if auth.uid() is not null then raise exception 'Applicant submission requires the onboarding endpoint'; end if;
    if new.application_data->>'schemaVersion'='arch9_rental_application_fields_v2' then
      for subject in select value person from jsonb_array_elements(coalesce(new.application_data->'people','[]')) loop
        if nullif(btrim(subject.person->>'identityNumber'),'') is null or (nullif(btrim(subject.person->>'email'),'') is null and nullif(btrim(subject.person->>'phone'),'') is null) then raise exception 'Additional person identity and contact are required'; end if;
      end loop;
      for slot in select * from public.rental_review_document_slots(new.application_data) loop
        doc_status:=public.rental_current_document_status(new.id,new.application_data,slot.subject_id,slot.purpose);
        if doc_status is null or doc_status not in ('uploaded','accepted') then raise exception 'Current required document missing: % / %',slot.subject_id,slot.purpose; end if;
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
revoke execute on function public.rental_application_review_integrity() from public, anon, authenticated;
create or replace view public.rental_application_review_summaries with (security_invoker=true) as
select a.id,a.organisation_id,a.vacancy_id,a.unit_id,a.status,a.version,a.application_data,a.submitted_at,a.updated_at,
coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'type',d.document_type,'status',d.status,'name',d.file_name,'uploaded_at',d.uploaded_at,'created_at',d.created_at,'review_note',d.review_note,'reviewed_at',d.reviewed_at,'reviewed_by',d.reviewed_by) order by d.created_at desc) from public.rental_application_documents d where d.application_id=a.id),'[]'::jsonb) documents,
coalesce((select jsonb_agg(jsonb_build_object('type',c.consent_type,'version',c.wording_version,'accepted_at',c.accepted_at,'source',c.source,'evidence',c.evidence_json) order by c.accepted_at desc) from public.rental_application_consents c where c.application_id=a.id),'[]'::jsonb) consents,
a.lead_id,a.submitted_snapshot_json
from public.rental_applications a;
revoke all on public.rental_application_review_summaries from anon;
grant select on public.rental_application_review_summaries to authenticated;

commit;
