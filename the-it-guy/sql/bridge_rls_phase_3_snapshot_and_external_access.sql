begin;

-- Bridge RLS Phase 3: snapshot and external access
--
-- Purpose:
-- - tighten token-based external workspace access
-- - add token-aware policies for transaction_external_access
-- - add the safe first step for snapshot token access
--
-- Important:
-- - this file assumes the frontend will send:
--   - x-bridge-external-access-token
--   - x-bridge-snapshot-token
-- - external workspace can be fully scoped with SQL
-- - executive snapshot cannot be fully tightened yet without an app/RPC change,
--   because fetchExecutiveSnapshotByToken currently calls fetchDashboardOverview()
--   without an owner-scoped query contract

-- ---------------------------------------------------------------------------
-- Request-header helpers
-- ---------------------------------------------------------------------------

create or replace function public.bridge_external_access_request_token()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.bridge_request_header('x-bridge-external-access-token')
$$;

create or replace function public.bridge_snapshot_request_token()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.bridge_request_header('x-bridge-snapshot-token')
$$;

create or replace function public.bridge_external_access_request_link()
returns public.transaction_external_access
language sql
stable
security definer
set search_path = public
as $$
  select tea.*
  from public.transaction_external_access tea
  where tea.access_token = public.bridge_external_access_request_token()
    and tea.revoked = false
    and (tea.expires_at is null or tea.expires_at >= now())
  limit 1
$$;

create or replace function public.bridge_has_external_access_token()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.transaction_external_access tea
    where tea.access_token = public.bridge_external_access_request_token()
      and tea.revoked = false
      and (tea.expires_at is null or tea.expires_at >= now())
  )
$$;

create or replace function public.bridge_external_workspace_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((public.bridge_external_access_request_link()).role, '')
$$;

create or replace function public.bridge_external_workspace_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce((public.bridge_external_access_request_link()).email, ''))
$$;

create or replace function public.bridge_external_workspace_primary_transaction_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select (public.bridge_external_access_request_link()).transaction_id
$$;

create or replace function public.bridge_external_role_candidates()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when public.bridge_external_workspace_role() = 'attorney' then array['attorney', 'tuckers']
      else array[public.bridge_external_workspace_role()]
    end
$$;

create or replace function public.bridge_has_external_workspace_transaction_access(target_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when public.bridge_has_external_access_token() = false then false
      when public.bridge_external_workspace_role() = 'client' then false
      else exists (
        select 1
        from public.transaction_external_access tea
        where tea.transaction_id = target_transaction_id
          and lower(coalesce(tea.email, '')) = public.bridge_external_workspace_email()
          and tea.role = any(public.bridge_external_role_candidates())
          and tea.revoked = false
          and (tea.expires_at is null or tea.expires_at >= now())
      )
      or public.bridge_external_workspace_primary_transaction_id() = target_transaction_id
    end
$$;

create or replace function public.bridge_has_external_workspace_unit_access(target_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.transactions t
    where t.unit_id = target_unit_id
      and public.bridge_has_external_workspace_transaction_access(t.id)
  )
$$;

create or replace function public.bridge_has_external_workspace_buyer_access(target_buyer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.transactions t
    where t.buyer_id = target_buyer_id
      and public.bridge_has_external_workspace_transaction_access(t.id)
  )
$$;

create or replace function public.bridge_has_snapshot_token()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.snapshot_links sl
    where sl.token = public.bridge_snapshot_request_token()
      and sl.is_active = true
  )
$$;

-- ---------------------------------------------------------------------------
-- External access link table
-- ---------------------------------------------------------------------------

drop policy if exists transaction_external_access_select_external_token_scoped on transaction_external_access;
create policy transaction_external_access_select_external_token_scoped on transaction_external_access
for select to anon, authenticated
using (
  access_token = public.bridge_external_access_request_token()
  or public.bridge_has_external_workspace_transaction_access(transaction_id)
);

drop policy if exists transaction_external_access_update_external_token_scoped on transaction_external_access;
create policy transaction_external_access_update_external_token_scoped on transaction_external_access
for update to anon, authenticated
using (
  access_token = public.bridge_external_access_request_token()
  or public.bridge_has_external_workspace_transaction_access(transaction_id)
)
with check (
  access_token = public.bridge_external_access_request_token()
  or public.bridge_has_external_workspace_transaction_access(transaction_id)
);

-- ---------------------------------------------------------------------------
-- External workspace transaction context
-- ---------------------------------------------------------------------------

drop policy if exists transactions_select_external_token_scoped on transactions;
create policy transactions_select_external_token_scoped on transactions
for select to anon, authenticated
using (public.bridge_has_external_workspace_transaction_access(id));

drop policy if exists transactions_update_external_token_scoped on transactions;
create policy transactions_update_external_token_scoped on transactions
for update to anon, authenticated
using (public.bridge_has_external_workspace_transaction_access(id))
with check (public.bridge_has_external_workspace_transaction_access(id));

drop policy if exists units_select_external_token_scoped on units;
create policy units_select_external_token_scoped on units
for select to anon, authenticated
using (public.bridge_has_external_workspace_unit_access(id));

drop policy if exists units_update_external_token_scoped on units;
create policy units_update_external_token_scoped on units
for update to anon, authenticated
using (public.bridge_has_external_workspace_unit_access(id))
with check (public.bridge_has_external_workspace_unit_access(id));

drop policy if exists developments_select_external_token_scoped on developments;
create policy developments_select_external_token_scoped on developments
for select to anon, authenticated
using (
  exists (
    select 1
    from public.transactions t
    where t.development_id = developments.id
      and public.bridge_has_external_workspace_transaction_access(t.id)
  )
);

drop policy if exists buyers_select_external_token_scoped on buyers;
create policy buyers_select_external_token_scoped on buyers
for select to anon, authenticated
using (public.bridge_has_external_workspace_buyer_access(id));

-- ---------------------------------------------------------------------------
-- External workspace subprocess / discussion / docs
-- ---------------------------------------------------------------------------

drop policy if exists transaction_subprocesses_select_external_token_scoped on transaction_subprocesses;
create policy transaction_subprocesses_select_external_token_scoped on transaction_subprocesses
for select to anon, authenticated
using (public.bridge_has_external_workspace_transaction_access(transaction_id));

drop policy if exists transaction_subprocesses_modify_external_token_scoped on transaction_subprocesses;
create policy transaction_subprocesses_modify_external_token_scoped on transaction_subprocesses
for all to anon, authenticated
using (public.bridge_has_external_workspace_transaction_access(transaction_id))
with check (public.bridge_has_external_workspace_transaction_access(transaction_id));

drop policy if exists transaction_subprocess_steps_select_external_token_scoped on transaction_subprocess_steps;
create policy transaction_subprocess_steps_select_external_token_scoped on transaction_subprocess_steps
for select to anon, authenticated
using (
  exists (
    select 1
    from public.transaction_subprocesses tsp
    where tsp.id = transaction_subprocess_steps.subprocess_id
      and public.bridge_has_external_workspace_transaction_access(tsp.transaction_id)
  )
);

drop policy if exists transaction_subprocess_steps_modify_external_token_scoped on transaction_subprocess_steps;
create policy transaction_subprocess_steps_modify_external_token_scoped on transaction_subprocess_steps
for all to anon, authenticated
using (
  exists (
    select 1
    from public.transaction_subprocesses tsp
    where tsp.id = transaction_subprocess_steps.subprocess_id
      and public.bridge_has_external_workspace_transaction_access(tsp.transaction_id)
  )
)
with check (
  exists (
    select 1
    from public.transaction_subprocesses tsp
    where tsp.id = transaction_subprocess_steps.subprocess_id
      and public.bridge_has_external_workspace_transaction_access(tsp.transaction_id)
  )
);

drop policy if exists transaction_comments_select_external_token_scoped on transaction_comments;
create policy transaction_comments_select_external_token_scoped on transaction_comments
for select to anon, authenticated
using (public.bridge_has_external_workspace_transaction_access(transaction_id));

drop policy if exists transaction_comments_insert_external_token_scoped on transaction_comments;
create policy transaction_comments_insert_external_token_scoped on transaction_comments
for insert to anon, authenticated
with check (public.bridge_has_external_workspace_transaction_access(transaction_id));

drop policy if exists transaction_events_select_external_token_scoped on transaction_events;
create policy transaction_events_select_external_token_scoped on transaction_events
for select to anon, authenticated
using (public.bridge_has_external_workspace_transaction_access(transaction_id));

drop policy if exists transaction_events_insert_external_token_scoped on transaction_events;
create policy transaction_events_insert_external_token_scoped on transaction_events
for insert to anon, authenticated
with check (public.bridge_has_external_workspace_transaction_access(transaction_id));

drop policy if exists documents_select_external_token_scoped on documents;
create policy documents_select_external_token_scoped on documents
for select to anon, authenticated
using (public.bridge_has_external_workspace_transaction_access(transaction_id));

drop policy if exists documents_insert_external_token_scoped on documents;
create policy documents_insert_external_token_scoped on documents
for insert to anon, authenticated
with check (public.bridge_has_external_workspace_transaction_access(transaction_id));

drop policy if exists documents_update_external_token_scoped on documents;
create policy documents_update_external_token_scoped on documents
for update to anon, authenticated
using (public.bridge_has_external_workspace_transaction_access(transaction_id))
with check (public.bridge_has_external_workspace_transaction_access(transaction_id));

drop policy if exists transaction_required_documents_select_external_token_scoped on transaction_required_documents;
create policy transaction_required_documents_select_external_token_scoped on transaction_required_documents
for select to anon, authenticated
using (public.bridge_has_external_workspace_transaction_access(transaction_id));

drop policy if exists transaction_required_documents_modify_external_token_scoped on transaction_required_documents;
create policy transaction_required_documents_modify_external_token_scoped on transaction_required_documents
for all to anon, authenticated
using (public.bridge_has_external_workspace_transaction_access(transaction_id))
with check (public.bridge_has_external_workspace_transaction_access(transaction_id));

drop policy if exists transaction_handover_select_external_token_scoped on transaction_handover;
create policy transaction_handover_select_external_token_scoped on transaction_handover
for select to anon, authenticated
using (public.bridge_has_external_workspace_transaction_access(transaction_id));

drop policy if exists transaction_handover_modify_external_token_scoped on transaction_handover;
create policy transaction_handover_modify_external_token_scoped on transaction_handover
for all to anon, authenticated
using (public.bridge_has_external_workspace_transaction_access(transaction_id))
with check (public.bridge_has_external_workspace_transaction_access(transaction_id));

-- ---------------------------------------------------------------------------
-- Snapshot links
-- ---------------------------------------------------------------------------

drop policy if exists snapshot_links_select_token_scoped on snapshot_links;
create policy snapshot_links_select_token_scoped on snapshot_links
for select to anon, authenticated
using (
  is_active = true
  and token = public.bridge_snapshot_request_token()
);

-- ---------------------------------------------------------------------------
-- Snapshot hardening note
-- ---------------------------------------------------------------------------

-- This pack intentionally does not tighten developments/transactions/units/etc.
-- for executive snapshot reads via snapshot token alone.
--
-- Reason:
-- fetchExecutiveSnapshotByToken() currently resolves the token and then calls
-- fetchDashboardOverview(), which uses broad dashboard queries without an
-- owner-scoped contract tied to snapshot_links.owner_key.
--
-- The safe follow-up is:
-- 1) app change: use an x-bridge-snapshot-token scoped client
-- 2) replace fetchDashboardOverview() in snapshot flow with an owner-aware
--    RPC or filtered query contract
-- 3) then add table/RPC policies for snapshot-token reads

commit;
