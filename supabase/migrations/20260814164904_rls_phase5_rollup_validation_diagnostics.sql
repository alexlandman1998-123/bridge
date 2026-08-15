begin;
-- Phase 5 covers the internal diagnostic validation table classified in
-- docs/supabase-rls-phase-0-policy-classification.md.

create or replace function public.bridge_can_read_transaction_rollup_validation()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.system_role, p.role, '')) in (
          'admin',
          'super_admin',
          'platform_admin',
          'internal_admin',
          'developer',
          'executive',
          'executive_level',
          'founder',
          'hq_staff'
        )
    )
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) in (
      'admin',
      'super_admin',
      'platform_admin',
      'internal_admin',
      'developer',
      'executive',
      'executive_level',
      'founder',
      'hq_staff'
    ),
    false
  )
$$;
revoke all on function public.bridge_can_read_transaction_rollup_validation()
  from public, anon;
grant execute on function public.bridge_can_read_transaction_rollup_validation()
  to authenticated, service_role;
alter table if exists public.transaction_rollup_validation enable row level security;
revoke all on table public.transaction_rollup_validation from public, anon, authenticated;
grant select on table public.transaction_rollup_validation to authenticated;
grant all on table public.transaction_rollup_validation to service_role;
drop policy if exists transaction_rollup_validation_platform_diagnostics_select
  on public.transaction_rollup_validation;
create policy transaction_rollup_validation_platform_diagnostics_select
  on public.transaction_rollup_validation
  for select
  to authenticated
  using (public.bridge_can_read_transaction_rollup_validation());
comment on table public.transaction_rollup_validation is
  'Internal transaction rollup diagnostic snapshots. Platform/HQ diagnostics may read; writes remain service-role owned; direct browser mutation is disabled.';
notify pgrst, 'reload schema';
commit;
