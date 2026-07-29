do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.transaction_bond_application_export_packages'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%validation_failed%'
    and pg_get_constraintdef(oid) like '%delivered%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.transaction_bond_application_export_packages drop constraint %I', constraint_name);
  end if;

  alter table public.transaction_bond_application_export_packages
    add constraint transaction_bond_application_export_packages_status_phase8a_check check (
      status in (
        'draft',
        'validation_failed',
        'ready_for_review',
        'ready_for_originator',
        'accepted_by_originator',
        'approved',
        'delivering',
        'delivered',
        'downloaded',
        'delivery_failed',
        'partially_delivered',
        'cancelled',
        'superseded'
      )
    );
end $$;

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.transaction_bond_application_delivery_attempts'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%secure_export%'
    and pg_get_constraintdef(oid) like '%manual_confirmation%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.transaction_bond_application_delivery_attempts drop constraint %I', constraint_name);
  end if;

  alter table public.transaction_bond_application_delivery_attempts
    add constraint transaction_bond_application_delivery_attempts_method_phase8a_check check (
      delivery_method in (
        'secure_export',
        'manual_confirmation',
        'originator_package_download',
        'signed_application_download',
        'supporting_documents_download',
        'api',
        'sftp',
        'email'
      )
    );
end $$;

alter table public.transaction_bond_application_export_packages
  add column if not exists originator_recipient_id uuid,
  add column if not exists originator_recipient_name text,
  add column if not exists package_ready_at timestamptz,
  add column if not exists accepted_by uuid references public.profiles(id) on delete set null,
  add column if not exists accepted_at timestamptz,
  add column if not exists download_count integer not null default 0 check (download_count >= 0),
  add column if not exists last_downloaded_by uuid references public.profiles(id) on delete set null,
  add column if not exists last_downloaded_at timestamptz,
  add column if not exists document_bundle_manifest_json jsonb not null default '{}'::jsonb;

create index if not exists transaction_bond_application_export_packages_originator_intake_idx
  on public.transaction_bond_application_export_packages (transaction_id, status, package_ready_at desc)
  where destination_key = 'bond_originator_intake';

create index if not exists transaction_bond_application_export_packages_originator_recipient_idx
  on public.transaction_bond_application_export_packages (originator_recipient_id, status, package_ready_at desc)
  where originator_recipient_id is not null;

create or replace function public.bridge_prevent_bond_application_export_package_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.status in (
    'ready_for_originator',
    'accepted_by_originator',
    'approved',
    'delivering',
    'delivered',
    'downloaded',
    'partially_delivered',
    'superseded'
  ) then
    if old.submission_id is distinct from new.submission_id
      or old.transaction_id is distinct from new.transaction_id
      or old.bond_application_id is distinct from new.bond_application_id
      or old.destination_key is distinct from new.destination_key
      or old.destination_type is distinct from new.destination_type
      or old.adapter_version is distinct from new.adapter_version
      or old.package_version is distinct from new.package_version
      or old.source_snapshot_hash is distinct from new.source_snapshot_hash
      or old.source_submission_version is distinct from new.source_submission_version
      or old.source_application_revision is distinct from new.source_application_revision
      or old.canonical_schema_version is distinct from new.canonical_schema_version
      or old.canonical_hash is distinct from new.canonical_hash
      or old.payload_hash is distinct from new.payload_hash
      or old.destination_payload_json is distinct from new.destination_payload_json
      or old.serialized_payload_document_id is distinct from new.serialized_payload_document_id
      or old.validation_summary_json is distinct from new.validation_summary_json
      or old.mapping_manifest_json is distinct from new.mapping_manifest_json
      or old.document_manifest_json is distinct from new.document_manifest_json
      or old.document_bundle_manifest_json is distinct from new.document_bundle_manifest_json
    then
      raise exception 'Bond application export package source, mapping and payload fields are immutable after intake readiness or approval';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.bridge_record_bond_originator_intake_download(
  p_export_package_id uuid,
  p_downloaded_by uuid,
  p_downloaded_document_ids uuid[] default '{}'::uuid[],
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  package_record public.transaction_bond_application_export_packages%rowtype;
  existing_attempt_id uuid;
  attempt_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role is required to record bond originator package download';
  end if;

  select * into package_record
  from public.transaction_bond_application_export_packages
  where id = p_export_package_id
  for update;

  if not found then
    raise exception 'Bond originator intake package not found';
  end if;

  if package_record.destination_key <> 'bond_originator_intake' then
    raise exception 'Export package is not an originator intake package';
  end if;

  if package_record.status not in ('accepted_by_originator', 'downloaded') then
    raise exception 'Originator intake package must be accepted before download is recorded';
  end if;

  if p_idempotency_key is not null then
    select id into existing_attempt_id
    from public.transaction_bond_application_delivery_attempts
    where export_package_id = p_export_package_id
      and idempotency_key = p_idempotency_key
    limit 1;

    if existing_attempt_id is not null then
      return existing_attempt_id;
    end if;
  end if;

  insert into public.transaction_bond_application_delivery_attempts (
    export_package_id,
    transaction_id,
    destination_key,
    delivery_method,
    status,
    attempted_by,
    attempted_at,
    completed_at,
    idempotency_key,
    response_summary_json
  )
  values (
    p_export_package_id,
    package_record.transaction_id,
    package_record.destination_key,
    'originator_package_download',
    'confirmed',
    p_downloaded_by,
    now(),
    now(),
    p_idempotency_key,
    jsonb_build_object(
      'document_count', coalesce(array_length(p_downloaded_document_ids, 1), 0),
      'downloaded_document_ids', to_jsonb(p_downloaded_document_ids),
      'raw_response_stored', false,
      'bank_workflow_update_deferred', true
    )
  )
  returning id into attempt_id;

  update public.transaction_bond_application_export_packages
  set status = 'downloaded',
      download_count = coalesce(download_count, 0) + 1,
      last_downloaded_by = p_downloaded_by,
      last_downloaded_at = now()
  where id = p_export_package_id;

  return attempt_id;
end;
$$;

comment on column public.transaction_bond_application_export_packages.originator_recipient_id is
  'Optional Phase 8A bond-originator recipient reference. This is not a bank application row.';
comment on column public.transaction_bond_application_export_packages.document_bundle_manifest_json is
  'Phase 8A signed-application and supporting-document bundle manifest for originator download.';
comment on function public.bridge_record_bond_originator_intake_download(uuid, uuid, uuid[], text) is
  'Service-only Phase 8A audit helper for recording bond-originator intake package downloads without mutating bank workflow.';
