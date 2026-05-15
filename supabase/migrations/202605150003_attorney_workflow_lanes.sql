alter table if exists public.transaction_subprocesses
  add column if not exists attorney_role text,
  add column if not exists attorney_assignment_id uuid references public.transaction_attorney_assignments(id) on delete set null,
  add column if not exists current_stage text,
  add column if not exists lane_status text not null default 'not_started',
  add column if not exists due_date date,
  add column if not exists completed_at timestamptz,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists lane_metadata jsonb not null default '{}'::jsonb;

alter table if exists public.transaction_subprocess_steps
  add column if not exists visibility_scope text not null default 'internal',
  add column if not exists completed_by uuid references auth.users(id) on delete set null,
  add column if not exists step_metadata jsonb not null default '{}'::jsonb;

alter table if exists public.transaction_subprocesses drop constraint if exists transaction_subprocesses_process_type_check;
alter table if exists public.transaction_subprocesses
  add constraint transaction_subprocesses_process_type_check
  check (process_type in ('finance', 'attorney', 'transfer', 'bond', 'cancellation'));

alter table if exists public.transaction_subprocesses drop constraint if exists transaction_subprocesses_owner_type_check;
alter table if exists public.transaction_subprocesses
  add constraint transaction_subprocesses_owner_type_check
  check (owner_type in ('bond_originator', 'attorney', 'internal'));

alter table if exists public.transaction_subprocesses drop constraint if exists transaction_subprocesses_status_check;
alter table if exists public.transaction_subprocesses
  add constraint transaction_subprocesses_status_check
  check (status in ('not_started', 'in_progress', 'completed', 'blocked', 'not_required'));

alter table if exists public.transaction_subprocesses drop constraint if exists transaction_subprocesses_lane_status_check;
alter table if exists public.transaction_subprocesses
  add constraint transaction_subprocesses_lane_status_check
  check (lane_status in ('not_started', 'in_progress', 'blocked', 'completed', 'not_required'));

alter table if exists public.transaction_subprocesses drop constraint if exists transaction_subprocesses_attorney_role_check;
alter table if exists public.transaction_subprocesses
  add constraint transaction_subprocesses_attorney_role_check
  check (
    attorney_role is null
    or attorney_role in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney')
  );

alter table if exists public.transaction_subprocess_steps drop constraint if exists transaction_subprocess_steps_status_check;
alter table if exists public.transaction_subprocess_steps
  add constraint transaction_subprocess_steps_status_check
  check (status in ('not_started', 'in_progress', 'completed', 'blocked'));

alter table if exists public.transaction_subprocess_steps drop constraint if exists transaction_subprocess_steps_visibility_scope_check;
alter table if exists public.transaction_subprocess_steps
  add constraint transaction_subprocess_steps_visibility_scope_check
  check (visibility_scope in ('internal', 'professional_shared', 'client_visible', 'shared_role_players', 'internal_only'));

create table if not exists public.transaction_attorney_lane_history (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  subprocess_id uuid references public.transaction_subprocesses(id) on delete cascade,
  lane_key text not null,
  attorney_role text not null,
  previous_stage text,
  new_stage text not null,
  previous_status text,
  new_status text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  note text,
  visibility text not null default 'internal',
  source text not null default 'attorney_workspace',
  metadata jsonb not null default '{}'::jsonb
);

alter table if exists public.transaction_attorney_lane_history drop constraint if exists transaction_attorney_lane_history_lane_key_check;
alter table if exists public.transaction_attorney_lane_history
  add constraint transaction_attorney_lane_history_lane_key_check
  check (lane_key in ('transfer', 'bond', 'cancellation'));

alter table if exists public.transaction_attorney_lane_history drop constraint if exists transaction_attorney_lane_history_attorney_role_check;
alter table if exists public.transaction_attorney_lane_history
  add constraint transaction_attorney_lane_history_attorney_role_check
  check (attorney_role in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney'));

alter table if exists public.transaction_attorney_lane_history drop constraint if exists transaction_attorney_lane_history_visibility_check;
alter table if exists public.transaction_attorney_lane_history
  add constraint transaction_attorney_lane_history_visibility_check
  check (visibility in ('internal', 'professional_shared', 'client_visible'));

create table if not exists public.transaction_attorney_lane_updates (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  subprocess_id uuid references public.transaction_subprocesses(id) on delete cascade,
  lane_key text not null,
  attorney_role text not null,
  update_type text not null default 'internal_note',
  visibility text not null default 'internal',
  message text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  related_document_id uuid,
  related_signing_packet_id uuid,
  client_recipients text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb
);

alter table if exists public.transaction_attorney_lane_updates
  add column if not exists related_document_id uuid,
  add column if not exists related_signing_packet_id uuid,
  add column if not exists client_recipients text[] not null default '{}'::text[];

alter table if exists public.transaction_attorney_lane_updates drop constraint if exists transaction_attorney_lane_updates_lane_key_check;
alter table if exists public.transaction_attorney_lane_updates
  add constraint transaction_attorney_lane_updates_lane_key_check
  check (lane_key in ('transfer', 'bond', 'cancellation'));

alter table if exists public.transaction_attorney_lane_updates drop constraint if exists transaction_attorney_lane_updates_attorney_role_check;
alter table if exists public.transaction_attorney_lane_updates
  add constraint transaction_attorney_lane_updates_attorney_role_check
  check (attorney_role in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney'));

alter table if exists public.transaction_attorney_lane_updates drop constraint if exists transaction_attorney_lane_updates_visibility_check;
alter table if exists public.transaction_attorney_lane_updates
  add constraint transaction_attorney_lane_updates_visibility_check
  check (visibility in ('internal', 'professional_shared', 'client_visible'));

alter table if exists public.transaction_attorney_lane_updates drop constraint if exists transaction_attorney_lane_updates_update_type_check;
alter table if exists public.transaction_attorney_lane_updates
  add constraint transaction_attorney_lane_updates_update_type_check
  check (length(trim(update_type)) > 0);

alter table if exists public.document_requests
  add column if not exists lane_key text,
  add column if not exists attorney_role text,
  add column if not exists requested_from text,
  add column if not exists requested_by uuid references auth.users(id) on delete set null,
  add column if not exists review_status text not null default 'pending_review',
  add column if not exists requirement_id text,
  add column if not exists rejection_reason text;

alter table if exists public.documents
  add column if not exists lane_key text,
  add column if not exists attorney_role text,
  add column if not exists review_status text;

create table if not exists public.attorney_workflow_blockers (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  title text not null,
  description text,
  lane_key text not null default 'transfer',
  attorney_role text not null default 'transfer_attorney',
  severity text not null default 'medium',
  owner text not null default 'attorney',
  visibility text not null default 'internal',
  due_date date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);

alter table if exists public.attorney_workflow_blockers drop constraint if exists attorney_workflow_blockers_lane_key_check;
alter table if exists public.attorney_workflow_blockers
  add constraint attorney_workflow_blockers_lane_key_check
  check (lane_key in ('transfer', 'bond', 'cancellation'));

alter table if exists public.attorney_workflow_blockers drop constraint if exists attorney_workflow_blockers_attorney_role_check;
alter table if exists public.attorney_workflow_blockers
  add constraint attorney_workflow_blockers_attorney_role_check
  check (attorney_role in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney'));

alter table if exists public.attorney_workflow_blockers drop constraint if exists attorney_workflow_blockers_severity_check;
alter table if exists public.attorney_workflow_blockers
  add constraint attorney_workflow_blockers_severity_check
  check (severity in ('low', 'medium', 'high', 'critical'));

alter table if exists public.attorney_workflow_blockers drop constraint if exists attorney_workflow_blockers_visibility_check;
alter table if exists public.attorney_workflow_blockers
  add constraint attorney_workflow_blockers_visibility_check
  check (visibility in ('internal', 'professional_shared', 'client_visible'));

alter table if exists public.transaction_events
  add column if not exists visibility_scope text not null default 'internal';

alter table if exists public.transaction_events drop constraint if exists transaction_events_event_type_check;
alter table if exists public.transaction_events
  add constraint transaction_events_event_type_check
  check (
    event_type in (
      'TransactionCreated',
      'TransactionUpdated',
      'TransactionStageChanged',
      'DocumentUploaded',
      'DocumentVisibilityChanged',
      'CommentAdded',
      'ParticipantAssigned',
      'WorkflowStepUpdated',
      'StatusLinkCreated',
      'AttorneyLaneCreated',
      'AttorneyLaneStageUpdated',
      'AttorneyLaneBlocked',
      'AttorneyLaneCompleted',
      'AttorneyLaneNoteAdded',
      'AttorneyLaneSharedUpdateAdded',
      'AttorneyLaneClientVisibleUpdatePublished',
      'AttorneyLaneDocumentRequested',
      'AttorneyLaneDocumentUploaded',
      'AttorneyLaneSigningPacketCreated',
      'AttorneyLaneSigningCompleted',
      'AttorneyDocumentRequirementsGenerated',
      'AttorneyDocumentUploaded',
      'AttorneyDocumentApproved',
      'AttorneyDocumentRejected',
      'AttorneyDocumentCompleted',
      'AttorneySigningRequirementCreated',
      'AttorneyReadinessRecalculated',
      'AttorneyManualBlockerAdded',
      'AttorneyManualBlockerResolved',
      'AttorneyManualBlockerReopened',
      'AttorneyMatterMarkedAtRisk',
      'AttorneyReadyForLodgement',
      'AttorneyCriticalBlockerCreated',
      'AttorneyUnauthorizedAccessAttempt'
    )
  );

create index if not exists transaction_subprocesses_attorney_role_idx
  on public.transaction_subprocesses (transaction_id, attorney_role);

create index if not exists transaction_attorney_lane_history_transaction_idx
  on public.transaction_attorney_lane_history (transaction_id, changed_at desc);

create index if not exists transaction_attorney_lane_updates_transaction_idx
  on public.transaction_attorney_lane_updates (transaction_id, created_at desc);

create index if not exists document_requests_lane_idx
  on public.document_requests (transaction_id, lane_key, attorney_role);

create index if not exists documents_lane_idx
  on public.documents (transaction_id, lane_key, attorney_role);

create index if not exists attorney_workflow_blockers_transaction_idx
  on public.attorney_workflow_blockers (transaction_id, resolved_at, severity);

alter table if exists public.transaction_attorney_lane_history enable row level security;
alter table if exists public.transaction_attorney_lane_updates enable row level security;
alter table if exists public.attorney_workflow_blockers enable row level security;

drop policy if exists transaction_attorney_lane_history_demo_all on public.transaction_attorney_lane_history;
drop policy if exists transaction_attorney_lane_history_select on public.transaction_attorney_lane_history;
create policy transaction_attorney_lane_history_select
  on public.transaction_attorney_lane_history
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.transaction_attorney_assignments taa
      where taa.transaction_id = transaction_attorney_lane_history.transaction_id
        and coalesce(taa.assignment_status, taa.status, 'active') <> 'removed'
        and (
          taa.attorney_user_id = auth.uid()
          or taa.primary_attorney_id = auth.uid()
          or taa.secretary_id = auth.uid()
          or taa.admin_handler_id = auth.uid()
          or public.attorney_user_is_firm_lead(coalesce(taa.attorney_firm_id, taa.firm_id))
        )
    )
    or (
      transaction_attorney_lane_history.visibility in ('professional_shared', 'client_visible')
      and exists (
        select 1
        from public.transaction_participants tp
        where tp.transaction_id = transaction_attorney_lane_history.transaction_id
          and tp.user_id = auth.uid()
          and coalesce(tp.status, 'active') = 'active'
          and tp.removed_at is null
      )
    )
    or exists (
      select 1
      from public.transactions t
      where t.id = transaction_attorney_lane_history.transaction_id
        and (
          t.owner_user_id = auth.uid()
          or public.bridge_is_org_admin(t.organisation_id)
        )
    )
  );

drop policy if exists transaction_attorney_lane_history_write on public.transaction_attorney_lane_history;
create policy transaction_attorney_lane_history_write
  on public.transaction_attorney_lane_history
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.transaction_attorney_assignments taa
      where taa.transaction_id = transaction_attorney_lane_history.transaction_id
        and taa.attorney_role = transaction_attorney_lane_history.attorney_role
        and coalesce(taa.assignment_status, taa.status, 'active') = 'active'
        and (
          taa.attorney_user_id = auth.uid()
          or taa.primary_attorney_id = auth.uid()
          or public.attorney_user_is_firm_lead(coalesce(taa.attorney_firm_id, taa.firm_id))
        )
    )
  );

drop policy if exists transaction_attorney_lane_updates_demo_all on public.transaction_attorney_lane_updates;
drop policy if exists transaction_attorney_lane_updates_select on public.transaction_attorney_lane_updates;
create policy transaction_attorney_lane_updates_select
  on public.transaction_attorney_lane_updates
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.transaction_attorney_assignments taa
      where taa.transaction_id = transaction_attorney_lane_updates.transaction_id
        and coalesce(taa.assignment_status, taa.status, 'active') <> 'removed'
        and (
          taa.attorney_user_id = auth.uid()
          or taa.primary_attorney_id = auth.uid()
          or taa.secretary_id = auth.uid()
          or taa.admin_handler_id = auth.uid()
          or public.attorney_user_is_firm_lead(coalesce(taa.attorney_firm_id, taa.firm_id))
        )
    )
    or (
      transaction_attorney_lane_updates.visibility in ('professional_shared', 'client_visible')
      and exists (
        select 1
        from public.transaction_participants tp
        where tp.transaction_id = transaction_attorney_lane_updates.transaction_id
          and tp.user_id = auth.uid()
          and coalesce(tp.status, 'active') = 'active'
          and tp.removed_at is null
      )
    )
    or exists (
      select 1
      from public.transactions t
      where t.id = transaction_attorney_lane_updates.transaction_id
        and (
          t.owner_user_id = auth.uid()
          or public.bridge_is_org_admin(t.organisation_id)
        )
    )
  );

drop policy if exists transaction_attorney_lane_updates_write on public.transaction_attorney_lane_updates;
create policy transaction_attorney_lane_updates_write
  on public.transaction_attorney_lane_updates
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.transaction_attorney_assignments taa
      where taa.transaction_id = transaction_attorney_lane_updates.transaction_id
        and taa.attorney_role = transaction_attorney_lane_updates.attorney_role
        and coalesce(taa.assignment_status, taa.status, 'active') = 'active'
        and (
          taa.attorney_user_id = auth.uid()
          or taa.primary_attorney_id = auth.uid()
          or public.attorney_user_is_firm_lead(coalesce(taa.attorney_firm_id, taa.firm_id))
        )
    )
  );

grant select, insert on public.transaction_attorney_lane_history to authenticated;
grant select, insert on public.transaction_attorney_lane_updates to authenticated;

drop policy if exists attorney_workflow_blockers_select on public.attorney_workflow_blockers;
create policy attorney_workflow_blockers_select
  on public.attorney_workflow_blockers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.transaction_attorney_assignments taa
      where taa.transaction_id = attorney_workflow_blockers.transaction_id
        and coalesce(taa.assignment_status, taa.status, 'active') <> 'removed'
        and (
          taa.attorney_user_id = auth.uid()
          or taa.primary_attorney_id = auth.uid()
          or taa.secretary_id = auth.uid()
          or taa.admin_handler_id = auth.uid()
          or public.attorney_user_is_firm_lead(coalesce(taa.attorney_firm_id, taa.firm_id))
        )
    )
    or (
      attorney_workflow_blockers.visibility in ('professional_shared', 'client_visible')
      and exists (
        select 1
        from public.transaction_participants tp
        where tp.transaction_id = attorney_workflow_blockers.transaction_id
          and tp.user_id = auth.uid()
          and coalesce(tp.status, 'active') = 'active'
          and tp.removed_at is null
      )
    )
  );

drop policy if exists attorney_workflow_blockers_write on public.attorney_workflow_blockers;
create policy attorney_workflow_blockers_write
  on public.attorney_workflow_blockers
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.transaction_attorney_assignments taa
      where taa.transaction_id = attorney_workflow_blockers.transaction_id
        and taa.attorney_role = attorney_workflow_blockers.attorney_role
        and coalesce(taa.assignment_status, taa.status, 'active') = 'active'
        and (
          taa.attorney_user_id = auth.uid()
          or taa.primary_attorney_id = auth.uid()
          or public.attorney_user_is_firm_lead(coalesce(taa.attorney_firm_id, taa.firm_id))
        )
    )
  )
  with check (
    exists (
      select 1
      from public.transaction_attorney_assignments taa
      where taa.transaction_id = attorney_workflow_blockers.transaction_id
        and taa.attorney_role = attorney_workflow_blockers.attorney_role
        and coalesce(taa.assignment_status, taa.status, 'active') = 'active'
        and (
          taa.attorney_user_id = auth.uid()
          or taa.primary_attorney_id = auth.uid()
          or public.attorney_user_is_firm_lead(coalesce(taa.attorney_firm_id, taa.firm_id))
        )
    )
  );

grant select, insert, update on public.attorney_workflow_blockers to authenticated;
