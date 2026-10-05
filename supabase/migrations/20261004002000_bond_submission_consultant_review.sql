-- Append-only consultant review evidence. This does not approve a signing
-- method, connect a provider, or change the application's submission status.
create table public.bond_submission_consultant_reviews (
 id uuid primary key default gen_random_uuid(),
 transaction_id uuid not null references public.transactions(id),
 submission_id uuid not null references public.transaction_bond_application_submissions(id),
 context_hash text not null check(context_hash ~ '^[a-f0-9]{64}$'),
 reviewed_by uuid not null,
 reviewed_at timestamptz not null default now(),
 checks_json jsonb not null,
 unique(submission_id,context_hash,reviewed_by)
);
alter table public.bond_submission_consultant_reviews enable row level security;
revoke all on public.bond_submission_consultant_reviews from anon,authenticated;
create function public.bridge_bond_submission_review_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Consultant review evidence is immutable.' using errcode='23514'; end $$;
create trigger bond_submission_review_immutable before update or delete on public.bond_submission_consultant_reviews for each row execute function public.bridge_bond_submission_review_immutable();

create function public.bridge_bond_submission_review_context(p_transaction uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.bond_applications; s public.transaction_bond_application_submissions; h text; r public.bond_submission_consultant_reviews;
begin
 select * into a from public.bond_applications where transaction_id=p_transaction;
 if a.id is null or not public.bridge_bond_wet_ink_consultant(a.id) then raise exception 'This application review is not accessible.' using errcode='42501'; end if;
 select * into s from public.transaction_bond_application_submissions where id=a.active_submission_id and transaction_id=p_transaction;
 if s.id is null or s.status not in ('signed','submitted') or s.signed_document_id is null then raise exception 'An accepted signed application is required.' using errcode='23514'; end if;
 h:=encode(extensions.digest(public.bridge_bond_wet_ink_canonical(jsonb_build_object(
  'submission',to_jsonb(s),'application',to_jsonb(a),
  'sections',coalesce((select jsonb_agg(to_jsonb(sec) order by sec.id) from public.bond_application_sections sec where sec.bond_application_id=a.id),'[]'),
  'documents',coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from public.documents d where d.transaction_id=p_transaction),'[]'),
  'requirements',coalesce((select jsonb_agg(to_jsonb(req) order by req.id) from public.transaction_required_documents req where req.transaction_id=p_transaction),'[]'),
  'bondRequirements',coalesce((select jsonb_agg(to_jsonb(req) order by req.id) from public.bond_application_document_requirements req where req.bond_application_id=a.id),'[]')
 )),'sha256'),'hex');
 select * into r from public.bond_submission_consultant_reviews where submission_id=s.id and reviewed_by=auth.uid() order by reviewed_at desc,id desc limit 1;
 return jsonb_build_object('submissionId',s.id,'contextHash',h,'review',case when r.id is not null then to_jsonb(r)||jsonb_build_object('current',r.context_hash=h) else null end);
end $$;

create function public.bridge_record_bond_submission_review(p_transaction uuid,p_submission uuid,p_context_hash text,p_checks jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb; r public.bond_submission_consultant_reviews;
begin
 -- Lock the application against simultaneous version/revision changes. Later
 -- document mutations automatically invalidate the stored context hash.
 perform public.bridge_bond_submission_review_context(p_transaction);
 perform 1 from public.bond_applications where transaction_id=p_transaction for update;
 c:=public.bridge_bond_submission_review_context(p_transaction);
 if c->>'submissionId' is distinct from p_submission::text or c->>'contextHash' is distinct from p_context_hash then raise exception 'Application or documents changed. Refresh before reviewing.' using errcode='40001'; end if;
 if p_checks->'applicationChecked' is distinct from 'true'::jsonb or p_checks->'documentsChecked' is distinct from 'true'::jsonb or p_checks->'signaturesChecked' is distinct from 'true'::jsonb or p_checks->'bankFormsChecked' is distinct from 'true'::jsonb then raise exception 'Complete every consultant review check.' using errcode='23514'; end if;
 insert into public.bond_submission_consultant_reviews(transaction_id,submission_id,context_hash,reviewed_by,checks_json)
 values(p_transaction,p_submission,p_context_hash,auth.uid(),jsonb_build_object('applicationChecked',true,'documentsChecked',true,'signaturesChecked',true,'bankFormsChecked',true))
 on conflict(submission_id,context_hash,reviewed_by) do nothing;
 select * into r from public.bond_submission_consultant_reviews where submission_id=p_submission and context_hash=p_context_hash and reviewed_by=auth.uid();
 return to_jsonb(r);
end $$;
revoke all on function public.bridge_bond_submission_review_immutable(),public.bridge_bond_submission_review_context(uuid),public.bridge_record_bond_submission_review(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.bridge_bond_submission_review_context(uuid),public.bridge_record_bond_submission_review(uuid,uuid,text,jsonb) to authenticated;

-- New fixed-version signing must not inherit an older workflow's ready flag.
-- This is deliberately release-gated until real approvals and pilot evidence
-- are connected through a reviewed server/database change.
create function public.bridge_bond_reviewed_release_pending(p_application uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bond_applications a join public.transaction_bond_application_submissions s on s.id=a.active_submission_id
 where a.id=p_application and s.snapshot_json->'reviewedVersion'->>'format'='bond-reviewed-version-v1')
$$;
create function public.bridge_bond_reviewed_readiness_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if public.bridge_bond_reviewed_release_pending(new.bond_application_id) and new.status='ready' then
  new.status:='blocked';
  new.blockers:=coalesce(new.blockers,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('key','signing_release_pending','message','Permissions, integrations and the live signing pilot must be approved before bank submission.'));
 end if;
 return new;
end $$;
create trigger bond_reviewed_readiness_guard before insert or update on public.bond_application_submission_readiness_assessments for each row execute function public.bridge_bond_reviewed_readiness_guard();
create function public.bridge_bond_reviewed_external_submission_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if public.bridge_bond_reviewed_release_pending(new.bond_application_id) then raise exception 'The fixed-version signing release is pending approval and live pilot verification.' using errcode='23514'; end if;
 return new;
end $$;
create trigger bond_reviewed_external_submission_guard before insert or update on public.bond_application_external_submission_records for each row execute function public.bridge_bond_reviewed_external_submission_guard();
revoke all on function public.bridge_bond_reviewed_release_pending(uuid),public.bridge_bond_reviewed_readiness_guard(),public.bridge_bond_reviewed_external_submission_guard() from public,anon,authenticated;
