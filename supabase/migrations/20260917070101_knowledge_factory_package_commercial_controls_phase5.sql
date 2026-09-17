begin;

-- Phase 5 keeps package execution inside a deliberate UAT commercial envelope.
-- The API, rather than the browser, enforces these limits before it can make a
-- supplier request. A policy is intentionally not created automatically: a
-- principal must choose the limits for each organisation before package reports
-- can be executed.
create table public.knowledge_factory_package_commercial_policies (
  organisation_id uuid primary key references public.organisations(id) on delete restrict,
  allowed_product_ids text[] not null default array['basic_owner_lookup', 'full_canvassing_report']::text[] check (
    cardinality(allowed_product_ids) > 0
    and allowed_product_ids <@ array['basic_owner_lookup', 'full_canvassing_report']::text[]
  ),
  per_report_credit_cap integer not null default 100000 check (per_report_credit_cap > 0),
  monthly_credit_cap integer not null default 1000000 check (monthly_credit_cap > 0),
  monthly_report_cap integer not null default 100 check (monthly_report_cap > 0),
  daily_report_cap_per_user integer not null default 10 check (daily_report_cap_per_user > 0),
  rollout_stage text not null default 'controlled_uat' check (rollout_stage in ('controlled_uat', 'pilot', 'suspended')),
  supplier_credits_per_cent integer not null default 40 check (supplier_credits_per_cent > 0),
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index knowledge_factory_package_commercial_policies_stage_idx
  on public.knowledge_factory_package_commercial_policies (rollout_stage);

alter table public.knowledge_factory_audit_log
  drop constraint knowledge_factory_audit_log_operation_check,
  add constraint knowledge_factory_audit_log_operation_check check (operation in (
    'map_properties',
    'property_summary',
    'property_report',
    'fica_kyc',
    'credit_check',
    'commercial_policy'
  ));

alter table public.knowledge_factory_package_commercial_policies enable row level security;
revoke all on public.knowledge_factory_package_commercial_policies from anon, authenticated;
grant select on public.knowledge_factory_package_commercial_policies to authenticated;

create policy knowledge_factory_package_commercial_policies_admin_read
on public.knowledge_factory_package_commercial_policies for select to authenticated
using (public.knowledge_factory_is_active_member(
  organisation_id,
  array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin']
));

comment on table public.knowledge_factory_package_commercial_policies is 'Phase 5 server-enforced commercial controls for fixed Knowledge Factory canvassing report packages. No browser role has write access.';

commit;
