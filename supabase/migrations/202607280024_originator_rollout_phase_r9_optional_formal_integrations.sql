create table if not exists public.transaction_bond_originator_formal_integrations (
  id uuid primary key default gen_random_uuid(),
  formal_integration_version text not null default 'phase-r9-optional-formal-integrations-v1',
  status text not null default 'blocked',
  multi_originator_rollout_id uuid references public.transaction_bond_originator_multi_originator_rollouts(id) on delete set null,
  destination_key text not null,
  destination_label text,
  recipient_profile_key text,
  adapter_version text,
  contract_evidence_json jsonb not null default '{}'::jsonb,
  readiness_report_json jsonb not null default '{}'::jsonb,
  activation_plan_json jsonb not null default '{}'::jsonb,
  sandbox_activated_by uuid references public.profiles(id) on delete set null,
  sandbox_activated_at timestamptz,
  paused_by uuid references public.profiles(id) on delete set null,
  paused_at timestamptz,
  pause_reason text,
  retired_by uuid references public.profiles(id) on delete set null,
  retired_at timestamptz,
  idempotency_key text,
  sandbox_only boolean not null default true check (sandbox_only = true),
  production_live_delivery_enabled boolean not null default false check (production_live_delivery_enabled = false),
  sensitive_payload_included boolean not null default false check (sensitive_payload_included = false),
  raw_schema_stored boolean not null default false check (raw_schema_stored = false),
  credentials_stored boolean not null default false check (credentials_stored = false),
  no_automatic_bank_submission boolean not null default true check (no_automatic_bank_submission = true),
  live_delivery_enabled boolean not null default false check (live_delivery_enabled = false),
  bank_workflow_unchanged boolean not null default true check (bank_workflow_unchanged = true),
  offer_workflow_unchanged boolean not null default true check (offer_workflow_unchanged = true),
  grant_workflow_unchanged boolean not null default true check (grant_workflow_unchanged = true),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint transaction_bond_originator_formal_integrations_version_check check (
    formal_integration_version = 'phase-r9-optional-formal-integrations-v1'
  ),
  constraint transaction_bond_originator_formal_integrations_status_check check (
    status in ('blocked', 'ready_for_sandbox', 'sandbox_active', 'paused', 'retired')
  ),
  constraint transaction_bond_originator_formal_integrations_destination_check check (
    nullif(trim(destination_key), '') is not null
  ),
  constraint transaction_bond_originator_formal_integrations_boundary_check check (
    sandbox_only = true
    and production_live_delivery_enabled = false
    and sensitive_payload_included = false
    and raw_schema_stored = false
    and credentials_stored = false
    and no_automatic_bank_submission = true
    and live_delivery_enabled = false
    and bank_workflow_unchanged = true
    and offer_workflow_unchanged = true
    and grant_workflow_unchanged = true
  )
);

create unique index if not exists transaction_bond_originator_formal_integrations_idempotency_idx
  on public.transaction_bond_originator_formal_integrations (destination_key, idempotency_key)
  where idempotency_key is not null;

create index if not exists transaction_bond_originator_formal_integrations_destination_status_idx
  on public.transaction_bond_originator_formal_integrations (destination_key, status, created_at desc);

create index if not exists transaction_bond_originator_formal_integrations_rollout_idx
  on public.transaction_bond_originator_formal_integrations (multi_originator_rollout_id, status, created_at desc)
  where multi_originator_rollout_id is not null;

alter table public.transaction_bond_originator_formal_integrations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_originator_formal_integrations'
      and policyname = 'bond_originator_formal_integrations_service_write'
  ) then
    create policy bond_originator_formal_integrations_service_write
      on public.transaction_bond_originator_formal_integrations
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_originator_formal_integrations'
      and policyname = 'bond_originator_formal_integrations_authorized_read'
  ) then
    create policy bond_originator_formal_integrations_authorized_read
      on public.transaction_bond_originator_formal_integrations
      for select
      using (
        auth.role() = 'service_role'
        or exists (
          select 1
          from public.transaction_bond_originator_workspace_assignments assignment
          where assignment.multi_originator_rollout_id = transaction_bond_originator_formal_integrations.multi_originator_rollout_id
            and public.bridge_can_access_transaction_spine(assignment.transaction_id)
        )
      );
  end if;
end $$;

create or replace function public.bridge_touch_bond_originator_formal_integration()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_bond_originator_formal_integration on public.transaction_bond_originator_formal_integrations;
create trigger trg_touch_bond_originator_formal_integration
  before update on public.transaction_bond_originator_formal_integrations
  for each row execute function public.bridge_touch_bond_originator_formal_integration();

create or replace function public.bridge_create_bond_originator_formal_integration_readiness(
  p_multi_originator_rollout_id uuid,
  p_destination_key text,
  p_destination_label text,
  p_recipient_profile_key text,
  p_adapter_version text,
  p_contract_evidence_json jsonb,
  p_readiness_report_json jsonb,
  p_created_by uuid default auth.uid(),
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  rollout_record public.transaction_bond_originator_multi_originator_rollouts%rowtype;
  existing_integration_id uuid;
  integration_id uuid;
  missing_required text[];
begin
  if auth.role() <> 'service_role' and p_created_by is distinct from auth.uid() then
    raise exception 'Formal integration readiness must use the authenticated internal user';
  end if;

  select * into rollout_record
  from public.transaction_bond_originator_multi_originator_rollouts
  where id = p_multi_originator_rollout_id;

  if not found or rollout_record.status not in ('ready', 'active', 'completed') then
    raise exception 'A controlled R8 multi-originator rollout is required before optional formal integration readiness';
  end if;

  if nullif(trim(p_destination_key), '') is null then
    raise exception 'Formal integration destination key is required';
  end if;

  if p_idempotency_key is not null then
    select id into existing_integration_id
    from public.transaction_bond_originator_formal_integrations
    where destination_key = trim(p_destination_key)
      and idempotency_key = p_idempotency_key
    limit 1;

    if existing_integration_id is not null then
      return existing_integration_id;
    end if;
  end if;

  select array_agg(required_key) into missing_required
  from unnest(array[
    'approvedSchema',
    'enumMap',
    'validationRules',
    'transportPolicy',
    'credentialPolicy',
    'acknowledgementContract',
    'statusContract',
    'securityReview',
    'dataProcessingApproval',
    'sandboxTestPlan'
  ]) required_key
  where coalesce((p_contract_evidence_json ->> required_key)::boolean, false) <> true;

  insert into public.transaction_bond_originator_formal_integrations (
    formal_integration_version,
    status,
    multi_originator_rollout_id,
    destination_key,
    destination_label,
    recipient_profile_key,
    adapter_version,
    contract_evidence_json,
    readiness_report_json,
    activation_plan_json,
    idempotency_key,
    sandbox_only,
    production_live_delivery_enabled,
    sensitive_payload_included,
    raw_schema_stored,
    credentials_stored,
    no_automatic_bank_submission,
    live_delivery_enabled,
    bank_workflow_unchanged,
    offer_workflow_unchanged,
    grant_workflow_unchanged,
    created_by,
    metadata
  )
  values (
    'phase-r9-optional-formal-integrations-v1',
    case when coalesce(array_length(missing_required, 1), 0) = 0 then 'ready_for_sandbox' else 'blocked' end,
    p_multi_originator_rollout_id,
    trim(p_destination_key),
    nullif(trim(p_destination_label), ''),
    nullif(trim(p_recipient_profile_key), ''),
    nullif(trim(p_adapter_version), ''),
    coalesce(p_contract_evidence_json, '{}'::jsonb) - 'schemaJson' - 'credentials' - 'credentialValue' - 'payloadExample',
    coalesce(p_readiness_report_json, '{}'::jsonb) || jsonb_build_object(
      'formalIntegrationVersion', 'phase-r9-optional-formal-integrations-v1',
      'sandboxOnly', true,
      'productionLiveDelivery', false,
      'noAutomaticBankSubmission', true,
      'liveDeliveryEnabled', false,
      'bankWorkflowUnchanged', true
    ),
    '{}'::jsonb,
    p_idempotency_key,
    true,
    false,
    false,
    false,
    false,
    true,
    false,
    true,
    true,
    true,
    p_created_by,
    jsonb_build_object(
      'phase', 'R9',
      'optional_formal_integration', true,
      'missing_required_evidence', coalesce(to_jsonb(missing_required), '[]'::jsonb),
      'sandbox_only', true,
      'production_live_delivery_enabled', false,
      'no_automatic_bank_submission', true,
      'live_delivery_enabled', false,
      'bank_workflow_unchanged', true,
      'offer_workflow_unchanged', true,
      'grant_workflow_unchanged', true
    )
  )
  returning id into integration_id;

  return integration_id;
end;
$$;

create or replace function public.bridge_activate_bond_originator_formal_integration_sandbox(
  p_formal_integration_id uuid,
  p_activated_by uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  activated_integration_id uuid;
begin
  if auth.role() <> 'service_role' and p_activated_by is distinct from auth.uid() then
    raise exception 'Formal integration sandbox activation must use the authenticated internal user';
  end if;

  update public.transaction_bond_originator_formal_integrations
  set status = 'sandbox_active',
      sandbox_activated_by = p_activated_by,
      sandbox_activated_at = now(),
      activation_plan_json = activation_plan_json || jsonb_build_object(
        'mode', 'sandbox_only',
        'production_live_delivery_enabled', false,
        'no_automatic_bank_submission', true,
        'live_delivery_enabled', false,
        'bank_workflow_unchanged', true
      )
  where id = p_formal_integration_id
    and status = 'ready_for_sandbox'
  returning id into activated_integration_id;

  if activated_integration_id is null then
    raise exception 'Formal integration must be ready_for_sandbox before sandbox activation';
  end if;

  return activated_integration_id;
end;
$$;

create or replace function public.bridge_bond_originator_formal_integration_view(p_formal_integration_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  integration_record public.transaction_bond_originator_formal_integrations%rowtype;
begin
  select * into integration_record
  from public.transaction_bond_originator_formal_integrations
  where id = p_formal_integration_id;

  if not found then
    raise exception 'R9 formal integration not found';
  end if;

  if auth.role() <> 'service_role'
    and not exists (
      select 1
      from public.transaction_bond_originator_workspace_assignments assignment
      where assignment.multi_originator_rollout_id = integration_record.multi_originator_rollout_id
        and public.bridge_can_access_transaction_spine(assignment.transaction_id)
    )
  then
    raise exception 'Not authorized to view formal integration readiness';
  end if;

  return jsonb_build_object(
    'formalIntegrationVersion', 'phase-r9-optional-formal-integrations-v1',
    'integrationId', integration_record.id,
    'status', integration_record.status,
    'destinationKey', integration_record.destination_key,
    'destinationLabel', integration_record.destination_label,
    'recipientProfileKey', integration_record.recipient_profile_key,
    'adapterVersion', integration_record.adapter_version,
    'sandboxOnly', true,
    'productionLiveDelivery', false,
    'actions', jsonb_build_object(
      'canActivateSandbox', integration_record.status = 'ready_for_sandbox',
      'canRunSandboxValidation', integration_record.status = 'sandbox_active',
      'canGenerateProductionPayload', false,
      'canEnableLiveDelivery', false,
      'canAutoSubmitToBank', false,
      'canMutateBankWorkflow', false
    ),
    'integrationBoundary', jsonb_build_object(
      'arch9FacilitatesOnly', true,
      'originatorProcessesExternally', true,
      'sandboxOnly', true,
      'productionLiveDelivery', false,
      'noAutomaticBankSubmission', true,
      'liveDeliveryEnabled', false,
      'bankWorkflowUnchanged', true,
      'offerWorkflowUnchanged', true,
      'grantWorkflowUnchanged', true
    ),
    'payloadsExcluded', true,
    'tokensExcluded', true,
    'credentialsExcluded', true,
    'rawSchemasExcluded', true,
    'publicDocumentUrlsExcluded', true
  );
end;
$$;

comment on table public.transaction_bond_originator_formal_integrations is
  'Phase R9 optional formal integration readiness. Stores sanitized contract evidence and sandbox status only; no raw schemas, credentials, payloads, live delivery, automatic bank submission or workflow mutation.';

comment on function public.bridge_create_bond_originator_formal_integration_readiness(uuid, text, text, text, text, jsonb, jsonb, uuid, text) is
  'Creates sanitized Phase R9 formal integration readiness evidence. Requires R8 rollout; strips raw schema and credential fields; no_automatic_bank_submission = true, live_delivery_enabled = false and bank_workflow_unchanged = true.';

comment on function public.bridge_activate_bond_originator_formal_integration_sandbox(uuid, uuid) is
  'Activates a Phase R9 sandbox-only integration state. Production live delivery and automatic bank submission remain disabled.';

comment on function public.bridge_bond_originator_formal_integration_view(uuid) is
  'Returns metadata-only Phase R9 formal integration status. It excludes payloads, tokens, credentials, raw schemas, public URLs and document storage paths.';
