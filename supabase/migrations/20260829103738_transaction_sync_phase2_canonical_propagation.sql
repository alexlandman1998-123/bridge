begin;

create table if not exists public.transaction_sync_action_catalog (
  action_key text primary key,
  owner_role text not null,
  canonical_event_type text not null,
  affected_lane text not null,
  source_table text not null default '',
  default_visibility text not null check (default_visibility in ('internal', 'professional_shared', 'client_visible')),
  client_safe_projection_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.transaction_sync_action_catalog
  (action_key, owner_role, canonical_event_type, affected_lane, default_visibility, client_safe_projection_required)
values
  ('BUYER_TRANSACTION_PROFILE_UPDATED','buyer','BuyerTransactionProfileUpdated','transaction_participants','professional_shared',false),
  ('BUYER_ONBOARDING_COMPLETED','buyer','BuyerOnboardingCompleted','sales_otp','client_visible',true),
  ('BUYER_DOCUMENT_UPLOADED','buyer','BuyerDocumentUploaded','sales_otp','professional_shared',false),
  ('BUYER_OTP_SIGNED','buyer','BuyerOtpSigned','sales_otp','client_visible',true),
  ('SELLER_TRANSACTION_PROFILE_UPDATED','seller','SellerTransactionProfileUpdated','transaction_participants','professional_shared',false),
  ('SELLER_ONBOARDING_COMPLETED','seller','SellerOnboardingCompleted','sales_otp','client_visible',true),
  ('SELLER_DOCUMENT_UPLOADED','seller','SellerDocumentUploaded','sales_otp','professional_shared',false),
  ('AGENT_TRANSACTION_UPDATED','agent','AgentTransactionUpdated','transaction_participants','professional_shared',false),
  ('AGENT_ROLEPLAYER_ASSIGNED','agent','AgentRoleplayerAssigned','transaction_participants','client_visible',true),
  ('AGENT_CLIENT_UPDATE_PUBLISHED','agent','AgentClientUpdatePublished','transaction_participants','client_visible',true),
  ('AGENT_OVERRIDE_APPLIED','agent','AgentWorkflowOverrideApplied','sales_otp','internal',false),
  ('ORIGINATOR_PROGRESS_UPDATED','bond_originator','BondOriginatorProgressUpdated','finance','professional_shared',false),
  ('ORIGINATOR_DOCUMENT_REQUESTED','bond_originator','BondOriginatorDocumentRequested','finance','client_visible',true),
  ('ORIGINATOR_BANK_APPLICATION_SUBMITTED','bond_originator','BondOriginatorBankApplicationSubmitted','finance','client_visible',true),
  ('ORIGINATOR_BANK_OUTCOME_RECORDED','bond_originator','BondOriginatorBankOutcomeRecorded','finance','professional_shared',false),
  ('ORIGINATOR_OFFER_PUBLISHED','bond_originator','BondOriginatorOfferPublished','finance','client_visible',true),
  ('ORIGINATOR_GRANT_RECORDED','bond_originator','BondOriginatorGrantRecorded','finance','professional_shared',false),
  ('TRANSFER_ATTORNEY_STAGE_UPDATED','transfer_attorney','TransferAttorneyStageUpdated','transfer','professional_shared',false),
  ('TRANSFER_ATTORNEY_COMMENT_ADDED','transfer_attorney','TransferAttorneyCommentAdded','transfer','internal',false),
  ('TRANSFER_ATTORNEY_DOCUMENT_REVIEWED','transfer_attorney','TransferAttorneyDocumentReviewed','transfer','professional_shared',false),
  ('TRANSFER_ATTORNEY_LODGEMENT_CONFIRMED','transfer_attorney','TransferAttorneyLodgementConfirmed','transfer','client_visible',true),
  ('BOND_ATTORNEY_STAGE_UPDATED','bond_attorney','BondAttorneyStageUpdated','bond_registration','professional_shared',false),
  ('BOND_ATTORNEY_GUARANTEE_UPDATED','bond_attorney','BondAttorneyGuaranteeUpdated','bond_registration','professional_shared',false),
  ('BOND_ATTORNEY_COMMENT_ADDED','bond_attorney','BondAttorneyCommentAdded','bond_registration','internal',false),
  ('CANCELLATION_ATTORNEY_STAGE_UPDATED','cancellation_attorney','CancellationAttorneyStageUpdated','seller_bond_cancellation','professional_shared',false),
  ('CANCELLATION_ATTORNEY_GUARANTEE_UPDATED','cancellation_attorney','CancellationAttorneyGuaranteeUpdated','seller_bond_cancellation','professional_shared',false),
  ('CANCELLATION_ATTORNEY_COMMENT_ADDED','cancellation_attorney','CancellationAttorneyCommentAdded','seller_bond_cancellation','internal',false),
  ('TRANSFER_REGISTRATION_CONFIRMED','transfer_attorney','TransferRegistrationConfirmed','registration','client_visible',true),
  ('SYSTEM_EVIDENCE_RECONCILED','system','SystemWorkflowEvidenceReconciled','sales_otp','internal',false)
on conflict (action_key) do update set
  owner_role = excluded.owner_role,
  canonical_event_type = excluded.canonical_event_type,
  affected_lane = excluded.affected_lane,
  default_visibility = excluded.default_visibility,
  client_safe_projection_required = excluded.client_safe_projection_required,
  updated_at = now();

update public.transaction_sync_action_catalog set source_table = case
  when action_key in ('BUYER_TRANSACTION_PROFILE_UPDATED','SELLER_TRANSACTION_PROFILE_UPDATED','AGENT_ROLEPLAYER_ASSIGNED') then 'transaction_participants'
  when action_key in ('BUYER_ONBOARDING_COMPLETED','SELLER_ONBOARDING_COMPLETED') then 'transaction_onboarding'
  when action_key in ('BUYER_DOCUMENT_UPLOADED','SELLER_DOCUMENT_UPLOADED','TRANSFER_ATTORNEY_DOCUMENT_REVIEWED') then 'documents'
  when action_key = 'BUYER_OTP_SIGNED' then 'document_packets'
  when action_key = 'AGENT_TRANSACTION_UPDATED' then 'transactions'
  when action_key = 'AGENT_CLIENT_UPDATE_PUBLISHED' then 'transaction_events'
  when action_key = 'AGENT_OVERRIDE_APPLIED' then 'transaction_workflow_events'
  when action_key = 'ORIGINATOR_PROGRESS_UPDATED' then 'transaction_bond_originator_progress_events'
  when action_key = 'ORIGINATOR_DOCUMENT_REQUESTED' then 'transaction_bond_originator_document_requests'
  when action_key = 'ORIGINATOR_BANK_APPLICATION_SUBMITTED' then 'transaction_bond_applications'
  when action_key = 'ORIGINATOR_BANK_OUTCOME_RECORDED' then 'transaction_bond_bank_outcomes'
  when action_key = 'ORIGINATOR_OFFER_PUBLISHED' then 'transaction_bond_originator_bank_offer_captures'
  when action_key = 'ORIGINATOR_GRANT_RECORDED' then 'transaction_bond_originator_grant_captures'
  when action_key in ('TRANSFER_ATTORNEY_STAGE_UPDATED','BOND_ATTORNEY_STAGE_UPDATED','CANCELLATION_ATTORNEY_STAGE_UPDATED') then 'transaction_subprocesses'
  when action_key in ('TRANSFER_ATTORNEY_COMMENT_ADDED','BOND_ATTORNEY_COMMENT_ADDED','CANCELLATION_ATTORNEY_COMMENT_ADDED') then 'transaction_attorney_lane_updates'
  when action_key in ('TRANSFER_ATTORNEY_LODGEMENT_CONFIRMED','BOND_ATTORNEY_GUARANTEE_UPDATED','CANCELLATION_ATTORNEY_GUARANTEE_UPDATED','TRANSFER_REGISTRATION_CONFIRMED') then 'transaction_subprocess_steps'
  when action_key = 'SYSTEM_EVIDENCE_RECONCILED' then 'transaction_workflow_evidence'
  else source_table
end;

create table if not exists public.transaction_sync_command_receipts (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  action_key text not null references public.transaction_sync_action_catalog(action_key),
  idempotency_key text not null,
  source_table text not null,
  source_record_id text not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text not null,
  visibility text not null check (visibility in ('internal', 'professional_shared', 'client_visible')),
  audience_json jsonb not null default '[]'::jsonb,
  canonical_event_id uuid references public.transaction_events(id) on delete set null,
  transaction_version bigint,
  status text not null default 'accepted' check (status in ('accepted', 'projected', 'failed')),
  outputs_json jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint transaction_sync_command_receipts_idempotency_check
    check (char_length(idempotency_key) between 16 and 160 and idempotency_key ~ '^[A-Za-z0-9._:-]+$'),
  unique (transaction_id, idempotency_key)
);

create index if not exists transaction_sync_command_receipts_transaction_idx
  on public.transaction_sync_command_receipts (transaction_id, created_at desc);

create table if not exists public.transaction_activity_projections (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  command_receipt_id uuid not null unique references public.transaction_sync_command_receipts(id) on delete cascade,
  canonical_event_id uuid not null references public.transaction_events(id) on delete cascade,
  canonical_event_type text not null,
  lane_key text not null,
  visibility text not null check (visibility in ('internal', 'professional_shared', 'client_visible')),
  audience_json jsonb not null default '[]'::jsonb,
  title text not null,
  description text not null,
  payload_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists transaction_activity_projections_transaction_idx
  on public.transaction_activity_projections (transaction_id, occurred_at desc);

create table if not exists public.transaction_refresh_signals (
  transaction_id uuid primary key references public.transactions(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  command_receipt_id uuid references public.transaction_sync_command_receipts(id) on delete set null,
  canonical_event_id uuid references public.transaction_events(id) on delete set null,
  changed_at timestamptz not null default now()
);

create table if not exists public.transaction_sync_projection_queue (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  command_receipt_id uuid not null unique references public.transaction_sync_command_receipts(id) on delete cascade,
  projection_type text not null default 'activity_and_refresh',
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  available_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transaction_sync_action_catalog enable row level security;
alter table public.transaction_sync_command_receipts enable row level security;
alter table public.transaction_activity_projections enable row level security;
alter table public.transaction_refresh_signals enable row level security;
alter table public.transaction_sync_projection_queue enable row level security;

create policy transaction_sync_action_catalog_read
  on public.transaction_sync_action_catalog for select to authenticated using (true);

create policy transaction_sync_command_receipts_read
  on public.transaction_sync_command_receipts for select to authenticated
  using (
    public.bridge_can_access_transaction_spine(transaction_id)
    and exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid())
        and lower(coalesce(profile.role, '')) in (
          'developer','platform_admin','internal_admin','admin','agent','bond_originator',
          'attorney','conveyancer','transfer_attorney','bond_attorney','cancellation_attorney'
        )
    )
  );

create policy transaction_activity_projections_professional_read
  on public.transaction_activity_projections for select to authenticated
  using (
    public.bridge_can_access_transaction_spine(transaction_id)
    and exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid())
        and lower(coalesce(profile.role, '')) in (
          'developer','platform_admin','internal_admin','admin','agent','bond_originator',
          'attorney','conveyancer','transfer_attorney','bond_attorney','cancellation_attorney'
        )
    )
    and (visibility <> 'internal' or public.bridge_transaction_scope_is_internal_user()
      or exists (
        select 1 from public.profiles profile
        where profile.id = (select auth.uid())
          and lower(coalesce(profile.role, '')) in ('attorney','conveyancer','transfer_attorney','bond_attorney','cancellation_attorney')
      ))
  );

create policy transaction_activity_projections_client_read
  on public.transaction_activity_projections for select to anon, authenticated
  using (
    visibility = 'client_visible'
    and (
      (audience_json ? 'buyer' and public.bridge_has_onboarding_token_transaction_access(transaction_id))
      or (audience_json ? 'seller' and public.bridge_has_client_portal_token_transaction_access(transaction_id))
    )
  );

create policy transaction_refresh_signals_read
  on public.transaction_refresh_signals for select to anon, authenticated
  using (
    public.bridge_can_access_transaction_spine(transaction_id)
    or public.bridge_has_client_portal_token_transaction_access(transaction_id)
    or public.bridge_has_onboarding_token_transaction_access(transaction_id)
  );

create policy transaction_sync_projection_queue_read
  on public.transaction_sync_projection_queue for select to authenticated
  using (
    public.bridge_transaction_scope_is_internal_user()
    and public.bridge_can_access_transaction_spine(transaction_id)
  );

grant select on public.transaction_sync_action_catalog to authenticated;
grant select on public.transaction_sync_command_receipts to authenticated;
grant select on public.transaction_activity_projections to anon, authenticated;
grant select on public.transaction_refresh_signals to anon, authenticated;
grant select on public.transaction_sync_projection_queue to authenticated;

create or replace function public.bridge_commit_transaction_sync_command_phase2(
  p_transaction_id uuid,
  p_action_key text,
  p_idempotency_key text,
  p_source_table text,
  p_source_record_id text,
  p_visibility text default null,
  p_audience jsonb default '[]'::jsonb,
  p_professional_title text default null,
  p_professional_description text default null,
  p_client_title text default null,
  p_client_description text default null,
  p_event_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_is_service_role boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  v_catalog public.transaction_sync_action_catalog%rowtype;
  v_visibility text;
  v_receipt public.transaction_sync_command_receipts%rowtype;
  v_event public.transaction_events%rowtype;
  v_activity public.transaction_activity_projections%rowtype;
  v_version bigint;
  v_title text;
  v_description text;
  v_lane_ref text;
  v_rollup_ref text;
begin
  if p_transaction_id is null then raise exception 'Transaction id is required.' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_idempotency_key, ''))) not between 16 and 160
     or trim(p_idempotency_key) !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'A valid idempotency key is required.' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_source_table, '')), '') is null or nullif(trim(coalesce(p_source_record_id, '')), '') is null then
    raise exception 'A source table and source record id are required.' using errcode = '22023';
  end if;
  if not v_is_service_role and v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not v_is_service_role and not public.bridge_can_access_transaction_spine(p_transaction_id) then
    raise exception 'You do not have access to this transaction.' using errcode = '42501';
  end if;

  select * into v_catalog from public.transaction_sync_action_catalog where action_key = upper(trim(p_action_key));
  if v_catalog.action_key is null then raise exception 'Unknown transaction sync action.' using errcode = '22023'; end if;
  if trim(p_source_table) <> v_catalog.source_table then
    raise exception 'The source table does not match the action contract.' using errcode = '22023';
  end if;

  if v_is_service_role then
    v_actor_role := 'system';
  else
    select lower(coalesce(profile.role, '')) into v_actor_role from public.profiles profile where profile.id = v_actor_id;
  end if;
  if not v_is_service_role and not (
    v_actor_role = v_catalog.owner_role
    or (v_catalog.owner_role in ('transfer_attorney','bond_attorney','cancellation_attorney') and v_actor_role in ('attorney','conveyancer','transfer_attorney','bond_attorney','cancellation_attorney'))
    or (v_catalog.owner_role in ('buyer','seller') and v_actor_role in ('client','buyer','seller'))
    or (
      v_catalog.action_key = 'SYSTEM_EVIDENCE_RECONCILED'
      and trim(p_source_table) = 'transaction_workflow_evidence'
      and exists (
        select 1 from public.transaction_workflow_evidence evidence
        where evidence.transaction_id = p_transaction_id
          and evidence.id::text = trim(p_source_record_id)
      )
    )
    or v_actor_role in ('developer','platform_admin','internal_admin','admin')
  ) then
    raise exception 'This role cannot commit the requested transaction action.' using errcode = '42501';
  end if;

  v_visibility := coalesce(nullif(trim(p_visibility), ''), v_catalog.default_visibility);
  if v_visibility not in ('internal','professional_shared','client_visible') then
    raise exception 'Invalid transaction visibility.' using errcode = '22023';
  end if;
  if (case v_visibility when 'internal' then 0 when 'professional_shared' then 1 else 2 end)
     > (case v_catalog.default_visibility when 'internal' then 0 when 'professional_shared' then 1 else 2 end) then
    raise exception 'The requested visibility exceeds the action contract.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_audience, '[]'::jsonb)) <> 'array' then
    raise exception 'Audience must be a JSON array.' using errcode = '22023';
  end if;
  if v_visibility = 'client_visible' and (
    nullif(trim(coalesce(p_client_title, '')), '') is null
    or nullif(trim(coalesce(p_client_description, '')), '') is null
    or not (coalesce(p_audience, '[]'::jsonb) ?| array['buyer','seller'])
  ) then
    raise exception 'Client-visible activity requires safe copy and an explicit buyer or seller audience.' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_professional_title, '')), '') is null
     or nullif(trim(coalesce(p_professional_description, '')), '') is null then
    raise exception 'Professional activity copy is required.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_transaction_id::text || ':' || trim(p_idempotency_key), 0));
  select * into v_receipt from public.transaction_sync_command_receipts
    where transaction_id = p_transaction_id and idempotency_key = trim(p_idempotency_key);
  if v_receipt.id is not null then
    return jsonb_build_object('duplicate', true, 'receiptId', v_receipt.id, 'eventId', v_receipt.canonical_event_id,
      'transactionVersion', v_receipt.transaction_version, 'status', v_receipt.status, 'outputs', v_receipt.outputs_json);
  end if;

  select rollup.transaction_id::text into v_rollup_ref
    from public.transaction_rollups rollup where rollup.transaction_id = p_transaction_id;
  if v_rollup_ref is null then raise exception 'Canonical transaction rollup is required before Phase 2 commands.' using errcode = 'P0001'; end if;

  if v_catalog.affected_lane = 'transaction_participants' then
    v_lane_ref := 'transaction:' || p_transaction_id::text || ':participants';
  elsif v_catalog.affected_lane in ('sales_otp','registration') then
    select instance.id::text into v_lane_ref from public.transaction_workflow_instances instance
      where instance.transaction_id = p_transaction_id
        and instance.workflow_key = v_catalog.affected_lane
      limit 1;
  else
    select lane.id::text into v_lane_ref from public.transaction_subprocesses lane
      where lane.transaction_id = p_transaction_id
        and lane.process_type = case v_catalog.affected_lane
          when 'bond_registration' then 'bond'
          when 'seller_bond_cancellation' then 'cancellation'
          else v_catalog.affected_lane end
      limit 1;
  end if;
  if v_lane_ref is null then raise exception 'Canonical lane state is required before Phase 2 commands.' using errcode = 'P0001'; end if;

  insert into public.transaction_sync_command_receipts (
    transaction_id, action_key, idempotency_key, source_table, source_record_id,
    actor_id, actor_role, visibility, audience_json
  ) values (
    p_transaction_id, v_catalog.action_key, trim(p_idempotency_key), trim(p_source_table), trim(p_source_record_id),
    v_actor_id, coalesce(nullif(v_actor_role, ''), 'system'), v_visibility, coalesce(p_audience, '[]'::jsonb)
  ) returning * into v_receipt;

  insert into public.transaction_events (
    transaction_id, event_type, event_data, created_by, created_by_role, visibility_scope
  ) values (
    p_transaction_id, 'TransactionUpdated',
    jsonb_strip_nulls(coalesce(p_event_data, '{}'::jsonb) || jsonb_build_object(
      'canonicalEventType', v_catalog.canonical_event_type,
      'actionKey', v_catalog.action_key,
      'commandReceiptId', v_receipt.id,
      'idempotencyKey', trim(p_idempotency_key),
      'sourceTable', trim(p_source_table),
      'sourceRecordId', trim(p_source_record_id),
      'affectedLane', v_catalog.affected_lane
    )),
    v_actor_id,
    case
      when v_actor_role in ('transfer_attorney','bond_attorney','cancellation_attorney','conveyancer') then 'attorney'
      when v_actor_role in ('platform_admin','admin') then 'internal_admin'
      else coalesce(nullif(v_actor_role, ''), 'system')
    end,
    case when v_visibility = 'client_visible' then 'professional_shared' else v_visibility end
  ) returning * into v_event;

  v_title := case when v_visibility = 'client_visible' then trim(p_client_title) else trim(p_professional_title) end;
  v_description := case when v_visibility = 'client_visible' then trim(p_client_description) else trim(p_professional_description) end;
  insert into public.transaction_activity_projections (
    transaction_id, command_receipt_id, canonical_event_id, canonical_event_type,
    lane_key, visibility, audience_json, title, description, payload_json, occurred_at
  ) values (
    p_transaction_id, v_receipt.id, v_event.id, v_catalog.canonical_event_type,
    v_catalog.affected_lane, v_visibility, coalesce(p_audience, '[]'::jsonb),
    v_title, v_description,
    case when v_visibility = 'client_visible' then '{}'::jsonb else coalesce(p_event_data, '{}'::jsonb) end,
    v_event.created_at
  ) returning * into v_activity;

  insert into public.transaction_refresh_signals (
    transaction_id, version, command_receipt_id, canonical_event_id, changed_at
  ) values (p_transaction_id, 1, v_receipt.id, v_event.id, now())
  on conflict (transaction_id) do update set
    version = public.transaction_refresh_signals.version + 1,
    command_receipt_id = excluded.command_receipt_id,
    canonical_event_id = excluded.canonical_event_id,
    changed_at = excluded.changed_at
  returning version into v_version;

  insert into public.transaction_workflow_events (
    transaction_id, workflow_key, step_key, action_key, event_type, payload_json, source, created_by
  ) values (
    p_transaction_id, v_catalog.affected_lane, '', v_catalog.action_key,
    v_catalog.canonical_event_type,
    jsonb_build_object('commandReceiptId', v_receipt.id, 'canonicalEventId', v_event.id, 'transactionVersion', v_version),
    'transaction_sync_phase2', v_actor_id
  );

  insert into public.transaction_sync_projection_queue (
    transaction_id, command_receipt_id, status, attempt_count, completed_at, updated_at
  ) values (p_transaction_id, v_receipt.id, 'completed', 1, now(), now());

  update public.transaction_sync_command_receipts set
    canonical_event_id = v_event.id,
    transaction_version = v_version,
    status = 'projected',
    outputs_json = jsonb_build_object(
      'transaction_event', v_event.id,
      'lane_state', v_lane_ref,
      'transaction_rollup', v_rollup_ref,
      'activity_projection', v_activity.id,
      'refresh_signal', v_version,
      'audit_record', v_receipt.id
    ),
    completed_at = now()
  where id = v_receipt.id
  returning * into v_receipt;

  return jsonb_build_object('duplicate', false, 'receiptId', v_receipt.id, 'eventId', v_event.id,
    'activityProjectionId', v_activity.id, 'transactionVersion', v_version,
    'status', v_receipt.status, 'outputs', v_receipt.outputs_json);
end;
$$;

revoke all on function public.bridge_commit_transaction_sync_command_phase2(
  uuid,text,text,text,text,text,jsonb,text,text,text,text,jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.bridge_commit_transaction_sync_command_phase2(
  uuid,text,text,text,text,text,jsonb,text,text,text,text,jsonb
) to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transaction_refresh_signals'
     ) then
    alter publication supabase_realtime add table public.transaction_refresh_signals;
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
