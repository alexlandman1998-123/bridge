begin;

create table if not exists public.commission_levels (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  agent_percentage numeric(6,3) not null check (agent_percentage >= 0 and agent_percentage <= 100),
  agency_percentage numeric(6,3) not null check (agency_percentage >= 0 and agency_percentage <= 100),
  monthly_target numeric(14,2) check (monthly_target is null or monthly_target >= 0),
  annual_target numeric(14,2) check (annual_target is null or annual_target >= 0),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commission_levels_split_total_check
    check (round((agent_percentage + agency_percentage)::numeric, 3) = 100.000),
  constraint commission_levels_unique_name unique (organisation_id, name)
);

create index if not exists commission_levels_org_active_idx
  on public.commission_levels (organisation_id, is_active, is_default, name);

create table if not exists public.commission_targets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid null,
  user_id uuid null references auth.users(id) on delete set null,
  target_type text not null default 'company' check (target_type in ('company', 'branch', 'agent')),
  period text not null default 'monthly' check (period in ('monthly')),
  target_amount numeric(14,2) not null check (target_amount >= 0),
  start_month date not null default date_trunc('month', now())::date,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commission_targets_scope_check
    check (
      (target_type = 'company' and branch_id is null and user_id is null)
      or (target_type = 'branch' and branch_id is not null and user_id is null)
      or (target_type = 'agent' and user_id is not null)
    )
);

create index if not exists commission_targets_org_active_idx
  on public.commission_targets (organisation_id, target_type, is_active, start_month desc);

create unique index if not exists commission_targets_active_company_unique_idx
  on public.commission_targets (organisation_id, target_type)
  where target_type = 'company' and is_active = true;

create unique index if not exists commission_targets_active_branch_unique_idx
  on public.commission_targets (organisation_id, branch_id, target_type)
  where target_type = 'branch' and is_active = true;

create unique index if not exists commission_targets_active_agent_unique_idx
  on public.commission_targets (organisation_id, user_id, target_type)
  where target_type = 'agent' and is_active = true;

create table if not exists public.referral_commission_rules (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  referral_type text not null default 'custom',
  percentage numeric(6,3) check (percentage is null or percentage >= 0 and percentage <= 100),
  basis text not null default 'gross_commission' check (basis in ('gross_commission', 'agent_commission', 'fixed_fee')),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referral_commission_rules_unique_type unique (organisation_id, referral_type)
);

create index if not exists referral_commission_rules_org_active_idx
  on public.referral_commission_rules (organisation_id, is_active, referral_type);

alter table if exists public.organisation_user_commission_profiles
  add column if not exists commission_level_id uuid references public.commission_levels(id) on delete set null;

do $$
begin
  if to_regclass('public.organisation_user_commission_profiles') is not null then
    execute 'create index if not exists organisation_user_commission_profiles_level_idx
      on public.organisation_user_commission_profiles (organisation_id, commission_level_id)
      where commission_level_id is not null and is_active = true';
  end if;
end;
$$;

create table if not exists public.commission_settings_audit (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  setting_type text not null,
  record_id uuid,
  action text not null,
  previous_value jsonb,
  new_value jsonb,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists commission_settings_audit_org_changed_idx
  on public.commission_settings_audit (organisation_id, changed_at desc);

create or replace function public.bridge_log_commission_settings_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_record_id uuid;
begin
  v_org_id := coalesce(new.organisation_id, old.organisation_id);
  v_record_id := coalesce(new.id, old.id);

  if v_org_id is null then
    return coalesce(new, old);
  end if;

  insert into public.commission_settings_audit (
    organisation_id,
    setting_type,
    record_id,
    action,
    previous_value,
    new_value,
    changed_by
  )
  values (
    v_org_id,
    tg_table_name,
    v_record_id,
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    auth.uid()
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists commission_levels_audit on public.commission_levels;
create trigger commission_levels_audit
after insert or update or delete on public.commission_levels
for each row execute function public.bridge_log_commission_settings_change();

drop trigger if exists commission_targets_audit on public.commission_targets;
create trigger commission_targets_audit
after insert or update or delete on public.commission_targets
for each row execute function public.bridge_log_commission_settings_change();

drop trigger if exists referral_commission_rules_audit on public.referral_commission_rules;
create trigger referral_commission_rules_audit
after insert or update or delete on public.referral_commission_rules
for each row execute function public.bridge_log_commission_settings_change();

do $$
begin
  if to_regclass('public.organisation_commission_structures') is not null then
    execute 'drop trigger if exists organisation_commission_structures_audit on public.organisation_commission_structures';
    execute 'create trigger organisation_commission_structures_audit
      after insert or update or delete on public.organisation_commission_structures
      for each row execute function public.bridge_log_commission_settings_change()';
  end if;

  if to_regclass('public.organisation_user_commission_profiles') is not null then
    execute 'drop trigger if exists organisation_user_commission_profiles_audit on public.organisation_user_commission_profiles';
    execute 'create trigger organisation_user_commission_profiles_audit
      after insert or update or delete on public.organisation_user_commission_profiles
      for each row execute function public.bridge_log_commission_settings_change()';
  end if;
end;
$$;

alter table public.commission_levels enable row level security;
alter table public.commission_targets enable row level security;
alter table public.referral_commission_rules enable row level security;
alter table public.commission_settings_audit enable row level security;

drop policy if exists commission_levels_member_select on public.commission_levels;
create policy commission_levels_member_select on public.commission_levels
for select to authenticated
using (public.bridge_is_active_member(organisation_id));

drop policy if exists commission_levels_admin_write on public.commission_levels;
create policy commission_levels_admin_write on public.commission_levels
for all to authenticated
using (public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_org_admin(organisation_id));

drop policy if exists commission_targets_member_select on public.commission_targets;
create policy commission_targets_member_select on public.commission_targets
for select to authenticated
using (public.bridge_is_active_member(organisation_id));

drop policy if exists commission_targets_admin_write on public.commission_targets;
create policy commission_targets_admin_write on public.commission_targets
for all to authenticated
using (public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_org_admin(organisation_id));

drop policy if exists referral_commission_rules_member_select on public.referral_commission_rules;
create policy referral_commission_rules_member_select on public.referral_commission_rules
for select to authenticated
using (public.bridge_is_active_member(organisation_id));

drop policy if exists referral_commission_rules_admin_write on public.referral_commission_rules;
create policy referral_commission_rules_admin_write on public.referral_commission_rules
for all to authenticated
using (public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_org_admin(organisation_id));

drop policy if exists commission_settings_audit_admin_select on public.commission_settings_audit;
create policy commission_settings_audit_admin_select on public.commission_settings_audit
for select to authenticated
using (public.bridge_is_org_admin(organisation_id));

drop policy if exists commission_settings_audit_insert on public.commission_settings_audit;
create policy commission_settings_audit_insert on public.commission_settings_audit
for insert to authenticated
with check (public.bridge_is_org_admin(organisation_id));

grant select, insert, update, delete on table public.commission_levels to authenticated;
grant select, insert, update, delete on table public.commission_targets to authenticated;
grant select, insert, update, delete on table public.referral_commission_rules to authenticated;
grant select, insert on table public.commission_settings_audit to authenticated;
grant execute on function public.bridge_log_commission_settings_change() to authenticated;

commit;
