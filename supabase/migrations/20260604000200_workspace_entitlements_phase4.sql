begin;

create table if not exists public.workspace_plan_catalog (
  plan_key text primary key,
  plan_name text not null,
  description text,
  billing_model text not null default 'subscription',
  monthly_amount integer,
  default_entitlements jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_plan_catalog_billing_model_check check (billing_model in ('trial', 'subscription', 'contract')),
  constraint workspace_plan_catalog_monthly_amount_check check (monthly_amount is null or monthly_amount >= 0)
);

create table if not exists public.workspace_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  plan_key text not null references public.workspace_plan_catalog(plan_key),
  plan_name text,
  description text,
  status text not null default 'trialing',
  billing_cycle text not null default 'monthly',
  monthly_amount integer,
  started_at timestamptz not null default now(),
  trial_ends_at timestamptz,
  current_period_starts_at timestamptz,
  current_period_ends_at timestamptz,
  external_customer_id text,
  external_subscription_id text,
  entitlements jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_subscriptions_organisation_unique unique (organisation_id),
  constraint workspace_subscriptions_status_check check (status in ('trialing', 'active', 'past_due', 'paused', 'canceled')),
  constraint workspace_subscriptions_billing_cycle_check check (billing_cycle in ('monthly', 'annual', 'contract', 'none')),
  constraint workspace_subscriptions_monthly_amount_check check (monthly_amount is null or monthly_amount >= 0)
);

create table if not exists public.workspace_entitlement_overrides (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  entitlement_key text not null,
  entitlement_value jsonb not null,
  reason text,
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_entitlement_overrides_unique_key unique (organisation_id, entitlement_key)
);

create index if not exists workspace_subscriptions_plan_idx
  on public.workspace_subscriptions (plan_key, status);

create index if not exists workspace_entitlement_overrides_org_idx
  on public.workspace_entitlement_overrides (organisation_id, expires_at);

insert into public.workspace_plan_catalog (
  plan_key,
  plan_name,
  description,
  billing_model,
  monthly_amount,
  default_entitlements,
  sort_order
)
values
  (
    'free_trial',
    'Free Trial',
    'Starter trial for validating the workspace before billing is activated.',
    'trial',
    0,
    jsonb_build_object(
      'maxUsers', 3,
      'maxBranches', 1,
      'monthlyBondApplications', 25,
      'reportingLevel', 'basic',
      'integrations', false,
      'customBranding', false,
      'apiAccess', false,
      'whiteLabel', false,
      'supportLevel', 'self_serve'
    ),
    10
  ),
  (
    'solo',
    'Solo',
    'For independent originators and single-operator professional workspaces.',
    'subscription',
    49000,
    jsonb_build_object(
      'maxUsers', 1,
      'maxBranches', 1,
      'monthlyBondApplications', 75,
      'reportingLevel', 'basic',
      'integrations', false,
      'customBranding', true,
      'apiAccess', false,
      'whiteLabel', false,
      'supportLevel', 'standard'
    ),
    20
  ),
  (
    'team',
    'Team',
    'For small originator teams with shared pipeline operations.',
    'subscription',
    149000,
    jsonb_build_object(
      'maxUsers', 8,
      'maxBranches', 2,
      'monthlyBondApplications', 250,
      'reportingLevel', 'advanced',
      'integrations', true,
      'customBranding', true,
      'apiAccess', false,
      'whiteLabel', false,
      'supportLevel', 'standard'
    ),
    30
  ),
  (
    'business',
    'Business',
    'For multi-branch organisations with managers, processors, and reporting needs.',
    'subscription',
    399000,
    jsonb_build_object(
      'maxUsers', 40,
      'maxBranches', 12,
      'monthlyBondApplications', 1200,
      'reportingLevel', 'advanced',
      'integrations', true,
      'customBranding', true,
      'apiAccess', true,
      'whiteLabel', false,
      'supportLevel', 'priority'
    ),
    40
  ),
  (
    'enterprise',
    'Enterprise',
    'For national originators with custom limits, integrations, and service levels.',
    'contract',
    null,
    jsonb_build_object(
      'maxUsers', null,
      'maxBranches', null,
      'monthlyBondApplications', null,
      'reportingLevel', 'enterprise',
      'integrations', true,
      'customBranding', true,
      'apiAccess', true,
      'whiteLabel', true,
      'supportLevel', 'dedicated'
    ),
    50
  )
on conflict (plan_key)
do update set
  plan_name = excluded.plan_name,
  description = excluded.description,
  billing_model = excluded.billing_model,
  monthly_amount = excluded.monthly_amount,
  default_entitlements = excluded.default_entitlements,
  active = true,
  sort_order = excluded.sort_order,
  updated_at = now();

create or replace function public.bridge_default_workspace_plan_key(workspace_type text, workspace_kind text)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when lower(coalesce(workspace_type, '')) = 'bond_originator'
      and lower(coalesce(workspace_kind, '')) = 'personal_originator' then 'solo'
    when lower(coalesce(workspace_type, '')) = 'bond_originator'
      and lower(coalesce(workspace_kind, '')) = 'bond_company' then 'team'
    else 'free_trial'
  end
$$;

create or replace function public.bridge_seed_workspace_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_key text;
  v_plan public.workspace_plan_catalog%rowtype;
  v_trial_ends_at timestamptz;
begin
  v_plan_key := public.bridge_default_workspace_plan_key(new.type, new.workspace_kind);

  select * into v_plan
  from public.workspace_plan_catalog
  where plan_key = v_plan_key
    and active = true;

  if not found then
    return new;
  end if;

  v_trial_ends_at := case when v_plan.billing_model in ('trial', 'subscription') then now() + interval '14 days' else null end;

  insert into public.workspace_subscriptions (
    organisation_id,
    plan_key,
    plan_name,
    description,
    status,
    billing_cycle,
    monthly_amount,
    trial_ends_at,
    current_period_starts_at,
    current_period_ends_at,
    entitlements,
    metadata
  )
  values (
    new.id,
    v_plan.plan_key,
    v_plan.plan_name,
    v_plan.description,
    case when v_plan.billing_model = 'contract' then 'active' else 'trialing' end,
    case when v_plan.billing_model = 'contract' then 'contract' when v_plan.billing_model = 'trial' then 'none' else 'monthly' end,
    v_plan.monthly_amount,
    v_trial_ends_at,
    now(),
    case when v_plan.billing_model in ('trial', 'subscription') then v_trial_ends_at else null end,
    v_plan.default_entitlements,
    jsonb_build_object(
      'source', 'bridge_seed_workspace_subscription',
      'workspaceType', new.type,
      'workspaceKind', new.workspace_kind
    )
  )
  on conflict (organisation_id)
  do update set
    plan_key = excluded.plan_key,
    plan_name = excluded.plan_name,
    description = excluded.description,
    status = excluded.status,
    billing_cycle = excluded.billing_cycle,
    monthly_amount = excluded.monthly_amount,
    trial_ends_at = excluded.trial_ends_at,
    current_period_starts_at = excluded.current_period_starts_at,
    current_period_ends_at = excluded.current_period_ends_at,
    entitlements = excluded.entitlements,
    metadata = excluded.metadata,
    updated_at = now()
  where coalesce(public.workspace_subscriptions.metadata->>'source', '') in (
    '',
    'bridge_seed_workspace_subscription',
    'phase4_existing_workspace_backfill'
  );

  return new;
end;
$$;

drop trigger if exists organisations_seed_workspace_subscription on public.organisations;
create trigger organisations_seed_workspace_subscription
after insert or update of type, workspace_kind on public.organisations
for each row
execute function public.bridge_seed_workspace_subscription();

insert into public.workspace_subscriptions (
  organisation_id,
  plan_key,
  plan_name,
  description,
  status,
  billing_cycle,
  monthly_amount,
  trial_ends_at,
  current_period_starts_at,
  current_period_ends_at,
  entitlements,
  metadata
)
select
  org.id,
  plan.plan_key,
  plan.plan_name,
  plan.description,
  case when plan.billing_model = 'contract' then 'active' else 'trialing' end,
  case when plan.billing_model = 'contract' then 'contract' when plan.billing_model = 'trial' then 'none' else 'monthly' end,
  plan.monthly_amount,
  case when plan.billing_model in ('trial', 'subscription') then now() + interval '14 days' else null end,
  now(),
  case when plan.billing_model in ('trial', 'subscription') then now() + interval '14 days' else null end,
  plan.default_entitlements,
  jsonb_build_object(
    'source', 'phase4_existing_workspace_backfill',
    'workspaceType', org.type,
    'workspaceKind', org.workspace_kind
  )
from public.organisations org
join public.workspace_plan_catalog plan
  on plan.plan_key = public.bridge_default_workspace_plan_key(org.type, org.workspace_kind)
where plan.active = true
on conflict (organisation_id)
do nothing;

alter table public.workspace_plan_catalog enable row level security;
alter table public.workspace_subscriptions enable row level security;
alter table public.workspace_entitlement_overrides enable row level security;

drop policy if exists workspace_plan_catalog_select_authenticated on public.workspace_plan_catalog;
create policy workspace_plan_catalog_select_authenticated
  on public.workspace_plan_catalog for select
  to authenticated
  using (active = true);

drop policy if exists workspace_subscriptions_select_members on public.workspace_subscriptions;
create policy workspace_subscriptions_select_members
  on public.workspace_subscriptions for select
  to authenticated
  using (
    exists (
      select 1
      from public.organisation_users ou
      where ou.organisation_id = workspace_subscriptions.organisation_id
        and ou.user_id = auth.uid()
        and coalesce(ou.status, 'active') = 'active'
    )
  );

drop policy if exists workspace_entitlement_overrides_select_members on public.workspace_entitlement_overrides;
create policy workspace_entitlement_overrides_select_members
  on public.workspace_entitlement_overrides for select
  to authenticated
  using (
    exists (
      select 1
      from public.organisation_users ou
      where ou.organisation_id = workspace_entitlement_overrides.organisation_id
        and ou.user_id = auth.uid()
        and coalesce(ou.status, 'active') = 'active'
    )
  );

grant select on public.workspace_plan_catalog to authenticated;
grant select on public.workspace_subscriptions to authenticated;
grant select on public.workspace_entitlement_overrides to authenticated;
grant execute on function public.bridge_default_workspace_plan_key(text, text) to authenticated;

commit;
