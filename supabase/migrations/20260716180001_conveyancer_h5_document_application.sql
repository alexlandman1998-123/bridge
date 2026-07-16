begin;

create table if not exists public.conveyancer_document_review_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  artifact_id uuid not null,
  reviewed_artifact_id uuid not null,
  source_signing_record_id uuid,
  reviewed_signing_record_id uuid,
  idempotency_key text not null check (length(trim(idempotency_key)) > 0),
  decision text not null check (decision in ('approved', 'rejected')),
  reason text not null check (length(trim(reason)) >= 3),
  expected_fingerprint text not null check (length(trim(expected_fingerprint)) >= 8),
  review_fingerprint text not null check (length(trim(review_fingerprint)) >= 8),
  reviewed_by uuid not null,
  reviewed_at timestamptz not null,
  contract_version text not null default 'conveyancer_document_application_h5_v1',
  created_at timestamptz not null default now(),
  unique (attorney_firm_id, idempotency_key),
  foreign key (artifact_id, organisation_id, attorney_firm_id, transaction_id)
    references public.conveyancer_document_artifacts(id, organisation_id, attorney_firm_id, transaction_id) on delete restrict,
  foreign key (reviewed_artifact_id, organisation_id, attorney_firm_id, transaction_id)
    references public.conveyancer_document_artifacts(id, organisation_id, attorney_firm_id, transaction_id) on delete restrict
);

create index if not exists conveyancer_document_review_events_scope_idx
  on public.conveyancer_document_review_events(organisation_id, attorney_firm_id, transaction_id, reviewed_at desc);

alter table public.conveyancer_document_review_events enable row level security;
drop policy if exists conveyancer_document_review_events_select_scoped on public.conveyancer_document_review_events;
create policy conveyancer_document_review_events_select_scoped on public.conveyancer_document_review_events
  for select to authenticated
  using (public.bridge_conveyancer_can_access_record(organisation_id, attorney_firm_id, transaction_id));
revoke all on public.conveyancer_document_review_events from anon, authenticated, service_role;
grant select on public.conveyancer_document_review_events to authenticated, service_role;

drop trigger if exists conveyancer_document_review_events_immutable on public.conveyancer_document_review_events;
create trigger conveyancer_document_review_events_immutable
  before update or delete on public.conveyancer_document_review_events
  for each row execute function public.bridge_conveyancer_reject_mutation();
drop trigger if exists conveyancer_document_review_events_audit on public.conveyancer_document_review_events;
create trigger conveyancer_document_review_events_audit
  after insert on public.conveyancer_document_review_events
  for each row execute function public.bridge_conveyancer_capture_insert_audit();

create or replace function public.bridge_validate_conveyancer_document_job_h5()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_event public.conveyancer_signing_provider_events%rowtype;
begin
  if new.operation = 'finalise_signed_pack' and new.adapter = 'manual' then
    select * into v_event
    from public.conveyancer_signing_provider_events event
    where (event.id::text = (new.command_payload -> 'source' ->> 'providerEventId')
      or event.provider_event_id = (new.command_payload -> 'source' ->> 'providerEventId'))
      and event.organisation_id = new.organisation_id
      and event.attorney_firm_id = new.attorney_firm_id
      and event.transaction_id = new.transaction_id
      and event.signature_verified
    limit 1;
    if not found
      or v_event.object_bucket is null
      or v_event.object_path is null
      or v_event.object_bucket <> (new.command_payload -> 'artifact' ->> 'bucket')
      or v_event.object_path <> (new.command_payload -> 'artifact' ->> 'path') then
      raise exception 'H5 signed-pack object binding is invalid.' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists conveyancer_document_jobs_h5_binding on public.conveyancer_document_jobs;
create trigger conveyancer_document_jobs_h5_binding
  before insert on public.conveyancer_document_jobs
  for each row execute function public.bridge_validate_conveyancer_document_job_h5();

create or replace function public.bridge_review_conveyancer_document_artifact_h5(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_org uuid; v_firm uuid; v_transaction uuid; v_artifact_id uuid;
  v_source public.conveyancer_document_artifacts%rowtype;
  v_reviewed_artifact uuid; v_source_signing public.conveyancer_signing_records%rowtype; v_reviewed_signing uuid;
  v_existing public.conveyancer_document_review_events%rowtype;
  v_decision text := lower(trim(coalesce(payload ->> 'decision', '')));
  v_status text; v_signing_status text;
  v_reason text := trim(coalesce(payload ->> 'reason', ''));
  v_expected text := trim(coalesce(payload ->> 'expectedFingerprint', ''));
  v_review_fingerprint text := trim(coalesce(payload ->> 'reviewFingerprint', ''));
  v_key text := trim(coalesce(payload ->> 'idempotencyKey', ''));
  v_reviewed_at timestamptz;
  v_role text;
begin
  if v_user is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  begin
    v_org := (payload ->> 'organisationId')::uuid;
    v_firm := (payload ->> 'attorneyFirmId')::uuid;
    v_transaction := (payload ->> 'transactionId')::uuid;
    v_artifact_id := (payload ->> 'artifactId')::uuid;
    v_reviewed_at := (payload ->> 'reviewedAt')::timestamptz;
  exception when invalid_text_representation or datetime_field_overflow then
    raise exception 'H5 review identity or time is invalid.' using errcode = '22023';
  end;
  if coalesce(payload ->> 'version', '') <> 'conveyancer_document_application_h5_v1'
    or v_key = '' or v_decision not in ('approve', 'reject') or length(v_reason) < 3
    or length(v_expected) < 8 or length(v_review_fingerprint) < 8 or octet_length(payload::text) > 16384 then
    raise exception 'H5 review contract is invalid.' using errcode = '22023';
  end if;
  if not public.bridge_conveyancer_can_access_record(v_org, v_firm, v_transaction) then
    raise exception 'H5 matter access denied.' using errcode = '42501';
  end if;
  select role into v_role from public.attorney_firm_members where firm_id = v_firm and user_id = v_user and status = 'active';
  if v_role not in ('firm_admin', 'director_partner', 'transfer_attorney') then
    raise exception 'H5 attorney review authority is required.' using errcode = '42501';
  end if;
  select * into v_existing from public.conveyancer_document_review_events where attorney_firm_id = v_firm and idempotency_key = v_key;
  if found then
    if v_existing.artifact_id <> v_artifact_id or v_existing.review_fingerprint <> v_review_fingerprint then
      raise exception 'H5 review idempotency conflict.' using errcode = '23505';
    end if;
    return jsonb_build_object('ok', true, 'duplicate', true, 'reviewId', v_existing.id, 'artifactId', v_existing.reviewed_artifact_id, 'decision', v_existing.decision);
  end if;
  select * into v_source from public.conveyancer_document_artifacts
  where id = v_artifact_id and organisation_id = v_org and attorney_firm_id = v_firm and transaction_id = v_transaction
  for update;
  if not found or v_source.fingerprint <> v_expected or v_source.lifecycle_status not in ('under_review', 'signed') then
    raise exception 'H5 review source binding is invalid or stale.' using errcode = '22023';
  end if;
  if exists(select 1 from public.conveyancer_document_artifacts where record_id = v_source.record_id and revision > v_source.revision) then
    raise exception 'H5 review source is not the latest revision.' using errcode = '40001';
  end if;
  v_status := case when v_decision = 'approve' then 'approved' else 'rejected' end;
  insert into public.conveyancer_document_artifacts(
    record_id, revision, organisation_id, attorney_firm_id, transaction_id, document_type, lifecycle_status,
    template_reference, object_bucket, object_path, content_hash, mime_type, source_phase, contract_version,
    fingerprint, classification, retention_policy, retention_until, legal_hold, payload, created_by
  ) values (
    v_source.record_id, v_source.revision + 1, v_org, v_firm, v_transaction, v_source.document_type, v_status,
    v_source.template_reference, v_source.object_bucket, v_source.object_path, v_source.content_hash, v_source.mime_type,
    'H5', 'conveyancer_document_application_h5_v1', v_review_fingerprint, v_source.classification,
    v_source.retention_policy, v_source.retention_until, v_source.legal_hold,
    v_source.payload || jsonb_build_object('reviewedFromArtifactId', v_source.id, 'reviewDecision', v_status, 'reviewReason', v_reason, 'reviewedAt', v_reviewed_at), v_user
  ) returning id into v_reviewed_artifact;
  select * into v_source_signing from public.conveyancer_signing_records
  where organisation_id = v_org and attorney_firm_id = v_firm and transaction_id = v_transaction
    and signed_pack_artifact_id = v_source.id and signing_status in ('signed_pack_received', 'under_review')
  order by revision desc limit 1 for update;
  if found then
    v_signing_status := case when v_decision = 'approve' then 'accepted' else 'rejected' end;
    insert into public.conveyancer_signing_records(
      record_id, revision, organisation_id, attorney_firm_id, transaction_id, signing_status,
      signing_provider_reference, signed_pack_artifact_id, source_phase, contract_version, fingerprint,
      classification, retention_policy, retention_until, legal_hold, payload, created_by
    ) values (
      v_source_signing.record_id, v_source_signing.revision + 1, v_org, v_firm, v_transaction, v_signing_status,
      v_source_signing.signing_provider_reference, v_reviewed_artifact, 'H5', 'conveyancer_document_application_h5_v1',
      v_review_fingerprint, v_source_signing.classification, v_source_signing.retention_policy,
      v_source_signing.retention_until, v_source_signing.legal_hold,
      v_source_signing.payload || jsonb_build_object('reviewedFromSigningRecordId', v_source_signing.id, 'reviewDecision', v_signing_status), v_user
    ) returning id into v_reviewed_signing;
  end if;
  insert into public.conveyancer_document_review_events(
    organisation_id, attorney_firm_id, transaction_id, artifact_id, reviewed_artifact_id,
    source_signing_record_id, reviewed_signing_record_id, idempotency_key, decision, reason,
    expected_fingerprint, review_fingerprint, reviewed_by, reviewed_at
  ) values (
    v_org, v_firm, v_transaction, v_source.id, v_reviewed_artifact,
    v_source_signing.id, v_reviewed_signing, v_key, v_status, v_reason,
    v_expected, v_review_fingerprint, v_user, v_reviewed_at
  ) returning * into v_existing;
  return jsonb_build_object('ok', true, 'duplicate', false, 'reviewId', v_existing.id, 'artifactId', v_reviewed_artifact, 'signingRecordId', v_reviewed_signing, 'decision', v_status);
end $$;

revoke all on function public.bridge_review_conveyancer_document_artifact_h5(jsonb) from public, anon;
grant execute on function public.bridge_review_conveyancer_document_artifact_h5(jsonb) to authenticated;
revoke all on function public.bridge_validate_conveyancer_document_job_h5() from public, anon, authenticated;

comment on table public.conveyancer_document_review_events is 'H5 immutable human decisions binding stored document evidence to accepted or rejected revisions.';
comment on function public.bridge_review_conveyancer_document_artifact_h5(jsonb) is 'H5 guarded attorney review; never overwrites legal document or signing evidence.';

commit;
