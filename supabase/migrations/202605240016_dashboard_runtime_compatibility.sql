begin;
-- Dashboard and workspace boot compatibility columns.
-- These are additive only and keep production schemas aligned with the fields
-- read by the deterministic workspace/dashboard services.
alter table if exists public.attorney_firm_members
  add column if not exists branch_id uuid,
  add column if not exists primary_branch_id uuid,
  add column if not exists branch_scope text not null default 'own';
alter table if exists public.attorney_firm_members
  drop constraint if exists attorney_firm_members_branch_scope_check;
alter table if exists public.attorney_firm_members
  add constraint attorney_firm_members_branch_scope_check
  check (branch_scope in ('own', 'assigned_branch', 'all_branches'));
create index if not exists attorney_firm_members_branch_id_idx
  on public.attorney_firm_members (branch_id);
create index if not exists attorney_firm_members_primary_branch_idx
  on public.attorney_firm_members (primary_branch_id);
alter table if exists public.transactions
  add column if not exists assigned_branch_id uuid,
  add column if not exists assigned_user_id uuid,
  add column if not exists assigned_agent_id uuid,
  add column if not exists owner_user_id uuid,
  add column if not exists created_by uuid,
  add column if not exists lifecycle_state text,
  add column if not exists is_active boolean not null default true,
  add column if not exists deleted_at timestamptz;
create index if not exists transactions_organisation_assigned_user_idx
  on public.transactions (organisation_id, assigned_user_id);
create index if not exists transactions_organisation_owner_user_idx
  on public.transactions (organisation_id, owner_user_id);
create index if not exists transactions_organisation_active_updated_idx
  on public.transactions (organisation_id, is_active, updated_at desc);
alter table if exists public.leads
  add column if not exists branch_id uuid,
  add column if not exists assigned_user_id uuid,
  add column if not exists assigned_agent_id uuid,
  add column if not exists created_by uuid,
  add column if not exists converted_transaction_id uuid,
  add column if not exists converted_at timestamptz,
  add column if not exists estimated_value numeric,
  add column if not exists seller_onboarding_status text not null default 'not_started',
  add column if not exists mandate_packet_id uuid,
  add column if not exists listing_id uuid;
alter table if exists public.leads
  drop constraint if exists leads_seller_onboarding_status_check;
alter table if exists public.leads
  add constraint leads_seller_onboarding_status_check
  check (seller_onboarding_status in ('not_started', 'sent', 'in_progress', 'completed', 'rejected'));
create index if not exists leads_organisation_assigned_user_idx
  on public.leads (organisation_id, assigned_user_id);
create index if not exists leads_organisation_assigned_agent_idx
  on public.leads (organisation_id, assigned_agent_id);
create index if not exists leads_organisation_created_at_idx
  on public.leads (organisation_id, created_at desc);
-- Observability inserts use `.select('id')` after insert. RLS needs a matching
-- own-row select policy so normal authenticated users do not receive 403s.
do $$
begin
  if to_regclass('public.telemetry_events') is not null and not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'telemetry_events'
      and policyname = 'Users can view own telemetry inserts'
  ) then
    create policy "Users can view own telemetry inserts"
      on public.telemetry_events for select
      using (auth.uid() = user_id);
  end if;

  if to_regclass('public.performance_metrics') is not null and not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'performance_metrics'
      and policyname = 'Users can view own performance metric inserts'
  ) then
    create policy "Users can view own performance metric inserts"
      on public.performance_metrics for select
      using (auth.uid() = user_id);
  end if;
end $$;
commit;
