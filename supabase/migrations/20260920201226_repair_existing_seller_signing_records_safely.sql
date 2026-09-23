-- Repair legacy seller-signing records without rewriting signed evidence.
-- The database produces a deterministic plan first. Only service-role code can
-- start a repair, and only when the caller confirms the exact plan digest.

create table if not exists public.private_listing_seller_document_repair_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  signing_session_id uuid not null references public.private_listing_mandate_signing_sessions(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  reason text not null,
  status text not null default 'running'
    check (status in ('running', 'completed', 'manual_review', 'failed')),
  plan_digest text not null check (plan_digest ~ '^[0-9a-f]{64}$'),
  plan jsonb not null,
  result jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists private_listing_seller_document_repair_running_idx
  on public.private_listing_seller_document_repair_runs (signing_session_id)
  where status = 'running';
create index if not exists private_listing_seller_document_repair_listing_idx
  on public.private_listing_seller_document_repair_runs (private_listing_id, created_at desc);

alter table public.private_listing_seller_document_repair_runs enable row level security;
revoke all on table public.private_listing_seller_document_repair_runs
  from public, anon, authenticated;
grant select, insert, update on table public.private_listing_seller_document_repair_runs
  to service_role;

create or replace function public.bridge_plan_listing_seller_document_repair(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.private_listing_mandate_signing_sessions%rowtype;
  v_document public.private_listing_documents%rowtype;
  v_document_key text;
  v_document_type text;
  v_expected_path text;
  v_document_count integer;
  v_documents jsonb := '{}'::jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_manual_reasons jsonb := '[]'::jsonb;
  v_plan jsonb;
  v_plan_digest text;
  v_branding jsonb;
  v_pack_branding jsonb;
begin
  select * into v_session
  from public.private_listing_mandate_signing_sessions
  where id = p_session_id;

  if not found then
    raise exception 'The seller signing session was not found.';
  end if;

  v_branding := coalesce(v_session.branding_snapshot, '{}'::jsonb);
  v_pack_branding := coalesce(v_session.signing_pack_snapshot->'branding', '{}'::jsonb);

  if v_session.status <> 'signed' then
    v_manual_reasons := v_manual_reasons || jsonb_build_array('session_not_signed');
  end if;
  if nullif(trim(coalesce(v_session.signed_name, '')), '') is null
    or nullif(trim(coalesce(v_session.signature, '')), '') is null
    or v_session.signed_at is null then
    v_manual_reasons := v_manual_reasons || jsonb_build_array('signature_evidence_incomplete');
  end if;
  if jsonb_typeof(coalesce(v_session.signing_pack_snapshot, '{}'::jsonb)) <> 'object'
    or v_session.signing_pack_snapshot = '{}'::jsonb
    or nullif(trim(coalesce(v_session.signing_pack_digest, '')), '') is null then
    v_manual_reasons := v_manual_reasons || jsonb_build_array('frozen_signing_pack_missing');
  end if;
  if v_branding->>'contract' <> 'arch9-seller-signing-branding-snapshot-v1'
    or coalesce(v_session.branding_digest, '') !~ '^[0-9a-f]{64}$'
    or lower(coalesce(v_branding->>'digest', '')) <> lower(coalesce(v_session.branding_digest, '')) then
    v_manual_reasons := v_manual_reasons || jsonb_build_array('frozen_branding_lineage_missing_or_invalid');
  elsif v_pack_branding is distinct from v_branding then
    v_manual_reasons := v_manual_reasons || jsonb_build_array('signing_pack_branding_mismatch');
  end if;
  if jsonb_typeof(coalesce(v_session.selected_documents, '[]'::jsonb)) <> 'array' then
    v_manual_reasons := v_manual_reasons || jsonb_build_array('selected_documents_missing');
  elsif jsonb_array_length(coalesce(v_session.selected_documents, '[]'::jsonb)) = 0 then
    v_manual_reasons := v_manual_reasons || jsonb_build_array('selected_documents_missing');
  else
    for v_document_key in
      select value from jsonb_array_elements_text(v_session.selected_documents)
    loop
      v_document := null;
      if v_document_key not in ('disclosure', 'fica', 'mandate') then
        v_manual_reasons := v_manual_reasons || jsonb_build_array('unsupported_document:' || v_document_key);
        continue;
      end if;
      v_document_type := case v_document_key
        when 'disclosure' then 'signed_disclosure_form'
        when 'fica' then 'signed_fica_declaration'
        else 'signed_mandate'
      end;
      v_expected_path := 'seller-signing/' || v_session.private_listing_id::text || '/' || v_session.id::text || '/signed-' || v_document_key || '.pdf';

      select count(*) into v_document_count
      from public.private_listing_documents
      where signing_session_id = v_session.id
        and document_type = v_document_type;

      select * into v_document
      from public.private_listing_documents
      where signing_session_id = v_session.id
        and document_type = v_document_type
      order by (nullif(trim(storage_path), '') is not null) desc, uploaded_at desc, id
      limit 1;

      if not (coalesce(v_session.document_progress, '{}'::jsonb) ? v_document_key) then
        v_manual_reasons := v_manual_reasons || jsonb_build_array('signed_progress_missing:' || v_document_key);
      end if;
      if v_document_count > 1 then
        v_manual_reasons := v_manual_reasons || jsonb_build_array('ambiguous_duplicate_rows:' || v_document_key);
      elsif v_document_count = 0 then
        v_actions := v_actions || jsonb_build_array(jsonb_build_object(
          'documentKey', v_document_key,
          'action', 'recreate_missing_row_and_render_pdf',
          'expectedStoragePath', v_expected_path
        ));
      elsif nullif(trim(v_document.storage_path), '') is null then
        v_actions := v_actions || jsonb_build_array(jsonb_build_object(
          'documentKey', v_document_key,
          'action', 'render_and_attach_missing_pdf',
          'documentId', v_document.id,
          'expectedStoragePath', v_expected_path
        ));
      elsif v_document.storage_path <> v_expected_path then
        v_manual_reasons := v_manual_reasons || jsonb_build_array('conflicting_storage_path:' || v_document_key);
      else
        v_actions := v_actions || jsonb_build_array(jsonb_build_object(
          'documentKey', v_document_key,
          'action', 'verify_immutable_pdf',
          'documentId', v_document.id,
          'expectedStoragePath', v_expected_path
        ));
      end if;

      v_documents := v_documents || jsonb_build_object(v_document_key, jsonb_build_object(
        'documentType', v_document_type,
        'rowCount', v_document_count,
        'documentId', case when v_document_count > 0 then v_document.id else null end,
        'storagePath', case when v_document_count > 0 then nullif(trim(v_document.storage_path), '') else null end,
        'expectedStoragePath', v_expected_path,
        'progressRecorded', coalesce(v_session.document_progress, '{}'::jsonb) ? v_document_key
      ));
    end loop;
  end if;

  v_plan := jsonb_build_object(
    'contract', 'arch9-seller-document-repair-plan-v1',
    'sessionId', v_session.id,
    'listingId', v_session.private_listing_id,
    'organisationId', v_session.organisation_id,
    'sessionStatus', v_session.status,
    'signingPackDigest', v_session.signing_pack_digest,
    'brandingDigest', v_session.branding_digest,
    'selectedDocuments', coalesce(v_session.selected_documents, '[]'::jsonb),
    'documents', v_documents,
    'actions', v_actions,
    'manualReviewReasons', v_manual_reasons,
    'automaticRepairAllowed', jsonb_array_length(v_manual_reasons) = 0,
    'preservesSignedRows', true,
    'deletesDocuments', false
  );
  v_plan_digest := encode(extensions.digest(v_plan::text, 'sha256'), 'hex');
  return v_plan || jsonb_build_object('planDigest', v_plan_digest);
end;
$$;

create or replace function public.bridge_start_listing_seller_document_repair(
  p_session_id uuid,
  p_expected_plan_digest text,
  p_reason text,
  p_requested_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.private_listing_mandate_signing_sessions%rowtype;
  v_plan jsonb;
  v_run public.private_listing_seller_document_repair_runs%rowtype;
begin
  if char_length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Provide an audit reason of at least 10 characters.';
  end if;

  select * into v_session
  from public.private_listing_mandate_signing_sessions
  where id = p_session_id
  for update;
  if not found then raise exception 'The seller signing session was not found.'; end if;

  v_plan := public.bridge_plan_listing_seller_document_repair(p_session_id);
  if lower(trim(coalesce(p_expected_plan_digest, ''))) <> v_plan->>'planDigest' then
    raise exception 'The repair plan changed. Run a fresh dry-run before applying it.';
  end if;
  if coalesce((v_plan->>'automaticRepairAllowed')::boolean, false) is not true then
    raise exception 'This record requires manual review and cannot be repaired automatically.';
  end if;

  select * into v_run
  from public.private_listing_seller_document_repair_runs
  where signing_session_id = p_session_id
    and status = 'running'
  limit 1;
  if found then
    if v_run.plan_digest <> v_plan->>'planDigest' then
      raise exception 'Another repair is already running with a different plan.';
    end if;
    return jsonb_build_object('repairRunId', v_run.id, 'status', v_run.status, 'idempotentReplay', true, 'plan', v_run.plan);
  end if;

  insert into public.private_listing_seller_document_repair_runs (
    organisation_id, private_listing_id, signing_session_id, requested_by,
    reason, status, plan_digest, plan
  ) values (
    v_session.organisation_id, v_session.private_listing_id, v_session.id,
    p_requested_by, trim(p_reason), 'running', v_plan->>'planDigest', v_plan
  ) returning * into v_run;

  insert into public.private_listing_activity (
    private_listing_id, activity_type, activity_title, activity_description,
    visibility, metadata
  ) values (
    v_session.private_listing_id,
    'seller_document_repair_started',
    'Signed seller document repair started',
    'A checksum-bound repair started for existing signed seller documents.',
    'internal',
    jsonb_build_object(
      'repairRunId', v_run.id,
      'signingSessionId', v_session.id,
      'planDigest', v_run.plan_digest,
      'reason', v_run.reason,
      'requestedBy', p_requested_by
    )
  );

  return jsonb_build_object('repairRunId', v_run.id, 'status', v_run.status, 'idempotentReplay', false, 'plan', v_run.plan);
end;
$$;

create or replace function public.bridge_prepare_listing_seller_document_repair_rows(
  p_repair_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_run public.private_listing_seller_document_repair_runs%rowtype;
  v_session public.private_listing_mandate_signing_sessions%rowtype;
  v_requirement public.private_listing_document_requirements%rowtype;
  v_document_key text;
  v_document_type text;
  v_title text;
  v_document_id uuid;
  v_prepared jsonb := '{}'::jsonb;
begin
  select * into v_run
  from public.private_listing_seller_document_repair_runs
  where id = p_repair_run_id
  for update;
  if not found or v_run.status <> 'running' then
    raise exception 'The seller document repair run is not active.';
  end if;

  select * into v_session
  from public.private_listing_mandate_signing_sessions
  where id = v_run.signing_session_id
  for update;
  if not found or v_session.status <> 'signed' then
    raise exception 'The signed seller session is no longer repairable.';
  end if;
  if (public.bridge_plan_listing_seller_document_repair(v_session.id)->>'planDigest') <> v_run.plan_digest then
    raise exception 'The signed record changed after the repair plan was approved.';
  end if;

  for v_document_key in
    select value from jsonb_array_elements_text(v_session.selected_documents)
  loop
    v_requirement := null;
    v_document_id := null;
    if not (coalesce(v_session.document_progress, '{}'::jsonb) ? v_document_key) then
      raise exception 'Signed progress is missing for the % document.', v_document_key;
    end if;
    v_document_type := case v_document_key
      when 'disclosure' then 'signed_disclosure_form'
      when 'fica' then 'signed_fica_declaration'
      else 'signed_mandate'
    end;
    v_title := case v_document_key
      when 'disclosure' then 'Property condition disclosure'
      when 'fica' then 'Seller FICA declaration'
      else 'Signed mandate'
    end;

    select id into v_document_id
    from public.private_listing_documents
    where signing_session_id = v_session.id and document_type = v_document_type
    limit 1;

    if v_document_id is null then
      select * into v_requirement
      from public.private_listing_document_requirements
      where private_listing_id = v_session.private_listing_id
        and coalesce(status, 'required') not in ('not_applicable', 'cancelled')
        and lower(requirement_key) like case
          when v_document_key = 'disclosure' then '%disclosure%'
          else '%' || v_document_key || '%'
        end
      order by created_at asc
      limit 1;

      insert into public.private_listing_documents (
        private_listing_id, requirement_id, document_type, category,
        document_name, generated_file_name, signing_session_id, status,
        visibility, uploaded_at
      ) values (
        v_session.private_listing_id, v_requirement.id, v_document_type, v_title,
        'signed-' || v_document_key || '.pdf', 'signed-' || v_document_key || '.pdf',
        v_session.id, 'completed', 'seller_visible', v_session.signed_at
      )
      on conflict (signing_session_id, document_type)
        where signing_session_id is not null
      do nothing
      returning id into v_document_id;

      if v_document_id is null then
        select id into v_document_id
        from public.private_listing_documents
        where signing_session_id = v_session.id and document_type = v_document_type
        limit 1;
      end if;
    end if;

    if v_requirement.id is not null then
      update public.private_listing_document_requirements
      set status = 'completed', updated_at = now()
      where id = v_requirement.id and status is distinct from 'completed';
    end if;
    v_prepared := v_prepared || jsonb_build_object(v_document_key, v_document_id);
  end loop;

  return jsonb_build_object('repairRunId', v_run.id, 'preparedDocuments', v_prepared);
end;
$$;

create or replace function public.bridge_finish_listing_seller_document_repair(
  p_repair_run_id uuid,
  p_status text,
  p_result jsonb default '{}'::jsonb,
  p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.private_listing_seller_document_repair_runs%rowtype;
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  if v_status not in ('completed', 'manual_review', 'failed') then
    raise exception 'The repair result status is invalid.';
  end if;

  update public.private_listing_seller_document_repair_runs
  set status = v_status,
      result = coalesce(p_result, '{}'::jsonb),
      error_message = nullif(trim(coalesce(p_error_message, '')), ''),
      completed_at = now(),
      updated_at = now()
  where id = p_repair_run_id and status = 'running'
  returning * into v_run;

  if not found then
    select * into v_run
    from public.private_listing_seller_document_repair_runs
    where id = p_repair_run_id;
    if not found then raise exception 'The seller document repair run was not found.'; end if;
    return jsonb_build_object('repairRunId', v_run.id, 'status', v_run.status, 'idempotentReplay', true, 'result', v_run.result);
  end if;

  insert into public.private_listing_activity (
    private_listing_id, activity_type, activity_title, activity_description,
    visibility, metadata
  ) values (
    v_run.private_listing_id,
    case when v_status = 'completed' then 'seller_document_repair_completed' else 'seller_document_repair_attention_required' end,
    case when v_status = 'completed' then 'Signed seller document repair completed' else 'Signed seller document repair needs attention' end,
    case when v_status = 'completed'
      then 'Missing signed seller PDF artefacts were restored without replacing signed evidence.'
      else 'The signed seller document repair stopped without replacing signed evidence.'
    end,
    'internal',
    jsonb_build_object(
      'repairRunId', v_run.id,
      'signingSessionId', v_run.signing_session_id,
      'planDigest', v_run.plan_digest,
      'status', v_status,
      'error', v_run.error_message,
      'result', v_run.result
    )
  );

  return jsonb_build_object('repairRunId', v_run.id, 'status', v_run.status, 'idempotentReplay', false, 'result', v_run.result);
end;
$$;

revoke all on function public.bridge_plan_listing_seller_document_repair(uuid)
  from public, anon, authenticated;
revoke all on function public.bridge_start_listing_seller_document_repair(uuid, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.bridge_prepare_listing_seller_document_repair_rows(uuid)
  from public, anon, authenticated;
revoke all on function public.bridge_finish_listing_seller_document_repair(uuid, text, jsonb, text)
  from public, anon, authenticated;

grant execute on function public.bridge_plan_listing_seller_document_repair(uuid)
  to service_role;
grant execute on function public.bridge_start_listing_seller_document_repair(uuid, text, text, uuid)
  to service_role;
grant execute on function public.bridge_prepare_listing_seller_document_repair_rows(uuid)
  to service_role;
grant execute on function public.bridge_finish_listing_seller_document_repair(uuid, text, jsonb, text)
  to service_role;

comment on table public.private_listing_seller_document_repair_runs is
  'Audited, digest-bound repair runs for existing signed seller records. Signed rows are never deleted or overwritten.';
comment on function public.bridge_plan_listing_seller_document_repair(uuid) is
  'Read-only deterministic repair plan. Ambiguous duplicates, missing signature evidence, and branding mismatches require manual review.';
