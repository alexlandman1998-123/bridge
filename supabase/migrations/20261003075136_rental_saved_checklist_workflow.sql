-- Consume the saved requirement ledger in application workflows; no bulk backfill.
begin;
create or replace view public.rental_application_review_summaries with (security_invoker=true) as
select a.id,a.organisation_id,a.vacancy_id,a.unit_id,a.status,a.version,a.application_data,a.submitted_at,a.updated_at,
coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'type',d.document_type,'status',d.status,'name',d.file_name,'uploaded_at',d.uploaded_at,'created_at',d.created_at,'review_note',d.review_note,'reviewed_at',d.reviewed_at,'reviewed_by',d.reviewed_by) order by d.created_at desc) from public.rental_application_documents d where d.application_id=a.id),'[]'::jsonb) documents,
coalesce((select jsonb_agg(jsonb_build_object('type',c.consent_type,'version',c.wording_version,'accepted_at',c.accepted_at,'source',c.source,'evidence',c.evidence_json) order by c.accepted_at desc) from public.rental_application_consents c where c.application_id=a.id),'[]'::jsonb) consents,
a.lead_id,a.submitted_snapshot_json,
coalesce((select jsonb_agg(to_jsonb(r) - 'fingerprint_json' order by r.scope_key,r.subject_id,r.purpose) from public.rental_onboarding_requirement_summaries r where r.application_id=a.id),'[]'::jsonb) requirements
from public.rental_applications a;
revoke all on public.rental_application_review_summaries from anon;
grant select on public.rental_application_review_summaries to authenticated;

create function rental_private.application_checklist_gate() returns trigger
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
 if old.status='draft' and new.status='submitted' then state_required:=array['received','accepted'];
 elsif new.status='approved' and old.status is distinct from new.status then state_required:=array['accepted'];
 else return new; end if;
 if not exists(select 1 from public.rental_onboarding_requirement_summaries s where s.application_id=new.id and s.active and s.required and s.mode='active') then raise exception 'Save the draft to prepare its document checklist'; end if;
 for r in select * from public.rental_onboarding_requirement_summaries s where s.application_id=new.id and s.active and s.required and s.mode='active' loop
  if not(r.state=any(state_required)) then raise exception 'Current saved evidence required: % / % (%)',r.subject_id,r.purpose,r.state; end if;
 end loop;
 return new;
end; $$;
revoke all on function rental_private.application_checklist_gate() from public,anon,authenticated;
create trigger trg_rental_application_zz_checklist_gate after update on public.rental_applications for each row execute function rental_private.application_checklist_gate();
grant select on public.rental_onboarding_requirement_summaries,public.rental_onboarding_requirements,public.rental_onboarding_checklists to service_role;
commit;
