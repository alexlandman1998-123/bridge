begin;

-- Phase 1 covers only the internal sequence/control tables classified in
-- docs/supabase-rls-phase-0-policy-classification.md.

alter table if exists public.matter_number_sequences enable row level security;

revoke all on table public.matter_number_sequences from public, anon, authenticated;
grant all on table public.matter_number_sequences to service_role;

-- Matter numbers are assigned through the transaction insert trigger. Do not
-- expose the sequence mutators as browser-callable RPC endpoints.
revoke all on function public.next_matter_number(integer, text) from public, anon, authenticated;
revoke all on function public.assign_transaction_matter_number() from public, anon, authenticated;
grant execute on function public.next_matter_number(integer, text) to service_role;
grant execute on function public.assign_transaction_matter_number() to service_role;

comment on table public.matter_number_sequences is
  'Internal matter-number sequence state. Direct API access is intentionally blocked; mutation is owned by trigger/function paths.';

alter table if exists public.bond_rls_cutover_exclusions enable row level security;

revoke all on table public.bond_rls_cutover_exclusions from public, anon;
revoke delete on table public.bond_rls_cutover_exclusions from authenticated;
grant select, insert, update on table public.bond_rls_cutover_exclusions to authenticated;
grant all on table public.bond_rls_cutover_exclusions to service_role;

create or replace function public.bridge_can_manage_bond_rls_cutover_exclusion(
  target_transaction_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.bridge_is_org_admin(coalesce(t.bond_workspace_id, t.organisation_id)), false)
  from public.transactions t
  where t.id = target_transaction_id
  limit 1
$$;

revoke all on function public.bridge_can_manage_bond_rls_cutover_exclusion(uuid)
  from public, anon;
grant execute on function public.bridge_can_manage_bond_rls_cutover_exclusion(uuid)
  to authenticated, service_role;

drop policy if exists bond_rls_cutover_exclusions_admin_select
  on public.bond_rls_cutover_exclusions;
create policy bond_rls_cutover_exclusions_admin_select
  on public.bond_rls_cutover_exclusions
  for select
  to authenticated
  using (public.bridge_can_manage_bond_rls_cutover_exclusion(transaction_id));

drop policy if exists bond_rls_cutover_exclusions_admin_insert
  on public.bond_rls_cutover_exclusions;
create policy bond_rls_cutover_exclusions_admin_insert
  on public.bond_rls_cutover_exclusions
  for insert
  to authenticated
  with check (public.bridge_can_manage_bond_rls_cutover_exclusion(transaction_id));

drop policy if exists bond_rls_cutover_exclusions_admin_update
  on public.bond_rls_cutover_exclusions;
create policy bond_rls_cutover_exclusions_admin_update
  on public.bond_rls_cutover_exclusions
  for update
  to authenticated
  using (public.bridge_can_manage_bond_rls_cutover_exclusion(transaction_id))
  with check (public.bridge_can_manage_bond_rls_cutover_exclusion(transaction_id));

comment on table public.bond_rls_cutover_exclusions is
  'Internal bond RLS cutover control table. Browser access is restricted to administrators of the transaction workspace; hard delete remains disabled.';

notify pgrst, 'reload schema';

commit;
