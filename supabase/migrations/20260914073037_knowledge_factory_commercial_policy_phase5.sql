begin;

-- Commercial controls are organisation-level policy, not supplier pricing.
-- A supplier quote remains the source of truth; these limits only stop an
-- unexpected credit commitment before it is submitted.
create table public.knowledge_factory_commercial_policies (
  organisation_id uuid primary key references public.organisations(id) on delete restrict,
  package_code text not null default 'canvassing_core' check (package_code in ('canvassing_core')),
  allowed_report_types text[] not null default array['property_summary', 'municipal_valuation']::text[] check (
    allowed_report_types <@ array['property_summary', 'municipal_valuation']::text[]
    and cardinality(allowed_report_types) > 0
  ),
  per_report_credit_cap integer not null default 100000 check (per_report_credit_cap > 0),
  monthly_credit_cap integer not null default 5000000 check (monthly_credit_cap > 0),
  rollout_stage text not null default 'uat' check (rollout_stage in ('uat', 'production')),
  production_approved_by uuid references auth.users(id) on delete set null,
  production_approved_at timestamptz,
  supplier_contract_version text not null default 'v0_1' check (length(btrim(supplier_contract_version)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_factory_commercial_policies_production_approval_check check (
    (rollout_stage = 'uat' and production_approved_by is null and production_approved_at is null)
    or (rollout_stage = 'production' and production_approved_by is not null and production_approved_at is not null)
  )
);

-- Existing enabled UAT organisations remain UAT. No migration can silently
-- make an organisation production-active.
insert into public.knowledge_factory_commercial_policies (organisation_id)
select organisation_id from public.knowledge_factory_organisation_access
on conflict (organisation_id) do nothing;

alter table public.knowledge_factory_commercial_policies enable row level security;
revoke all on public.knowledge_factory_commercial_policies from anon, authenticated;
grant select on public.knowledge_factory_commercial_policies to authenticated;

create policy knowledge_factory_commercial_policies_admin_read
on public.knowledge_factory_commercial_policies for select to authenticated
using (public.knowledge_factory_is_active_member(
  organisation_id,
  array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin']
));

comment on table public.knowledge_factory_commercial_policies is 'Organisation-level Knowledge Factory package scope and credit caps. Supplier quotes remain authoritative; no supplier credentials or price promises are stored here.';

commit;
