begin;
alter table if exists public.transaction_role_players
  add column if not exists partner_relationship_id uuid,
  add column if not exists organisation_id uuid,
  add column if not exists status text not null default 'selected',
  add column if not exists assignment_status text not null default 'selected',
  add column if not exists activation_trigger text,
  add column if not exists activated_at timestamptz,
  add column if not exists notified_at timestamptz,
  add column if not exists assigned_by uuid,
  add column if not exists user_id uuid,
  add column if not exists legal_role text,
  add column if not exists removed_at timestamptz;
alter table if exists public.transaction_role_players
  drop constraint if exists transaction_role_players_role_type_check;
alter table if exists public.transaction_role_players
  add constraint transaction_role_players_role_type_check
  check (role_type in ('bond_originator', 'bond_attorney', 'transfer_attorney', 'developer_contact', 'agent'));
alter table if exists public.transaction_role_players
  drop constraint if exists transaction_role_players_selection_source_check;
alter table if exists public.transaction_role_players
  add constraint transaction_role_players_selection_source_check
  check (selection_source in ('agency_preferred', 'buyer_appointed', 'manual', 'connected_partner', 'preferred_partner', 'recently_used'));
alter table if exists public.transaction_role_players
  drop constraint if exists transaction_role_players_status_check;
alter table if exists public.transaction_role_players
  add constraint transaction_role_players_status_check
  check (status in ('selected', 'active', 'removed', 'declined', 'rejected'));
alter table if exists public.transaction_role_players
  drop constraint if exists transaction_role_players_assignment_status_check;
alter table if exists public.transaction_role_players
  add constraint transaction_role_players_assignment_status_check
  check (assignment_status in ('selected', 'active', 'removed', 'declined', 'rejected'));
create index if not exists transaction_role_players_transaction_role_active_idx
  on public.transaction_role_players (transaction_id, role_type)
  where removed_at is null;
create index if not exists transaction_role_players_email_idx
  on public.transaction_role_players (lower(email_address))
  where email_address is not null;
create or replace function public.bridge_can_manage_transaction_role_players(target_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() is not null
    and (
      exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and lower(coalesce(p.role, '')) in ('developer', 'internal_admin', 'admin', 'super_admin')
      )
      or exists (
        select 1
        from public.transactions t
        where t.id = target_transaction_id
          and (
            t.owner_user_id = auth.uid()
            or lower(coalesce(t.assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
            or lower(coalesce(t.assigned_attorney_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
            or lower(coalesce(t.assigned_bond_originator_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
      )
      or exists (
        select 1
        from public.transaction_participants tp
        where tp.transaction_id = target_transaction_id
          and coalesce(tp.status, 'active') = 'active'
          and tp.removed_at is null
          and (
            tp.user_id = auth.uid()
            or lower(coalesce(tp.participant_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
      )
    ),
    false
  );
$$;
grant execute on function public.bridge_can_manage_transaction_role_players(uuid) to authenticated;
grant select, insert, update, delete on public.transaction_role_players to authenticated;
alter table if exists public.transaction_role_players enable row level security;
drop policy if exists transaction_role_players_select_assignment_access on public.transaction_role_players;
create policy transaction_role_players_select_assignment_access
on public.transaction_role_players
for select
to authenticated
using (
  public.bridge_can_manage_transaction_role_players(transaction_id)
  or user_id = auth.uid()
  or lower(coalesce(email_address, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
);
drop policy if exists transaction_role_players_insert_assignment_access on public.transaction_role_players;
create policy transaction_role_players_insert_assignment_access
on public.transaction_role_players
for insert
to authenticated
with check (
  public.bridge_can_manage_transaction_role_players(transaction_id)
);
drop policy if exists transaction_role_players_update_assignment_access on public.transaction_role_players;
create policy transaction_role_players_update_assignment_access
on public.transaction_role_players
for update
to authenticated
using (
  public.bridge_can_manage_transaction_role_players(transaction_id)
)
with check (
  public.bridge_can_manage_transaction_role_players(transaction_id)
);
drop policy if exists transaction_role_players_delete_assignment_access on public.transaction_role_players;
create policy transaction_role_players_delete_assignment_access
on public.transaction_role_players
for delete
to authenticated
using (
  public.bridge_can_manage_transaction_role_players(transaction_id)
);
commit;
