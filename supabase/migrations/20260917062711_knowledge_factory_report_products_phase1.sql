begin;

-- Phase 1 stores the commercial definition of fixed canvassing report packages.
-- Field manifests are descriptive only: live GraphQL selections stay server-owned.
create table public.knowledge_factory_report_products (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  product_id text not null check (product_id in ('basic_owner_lookup', 'full_canvassing_report')),
  name text not null check (length(btrim(name)) between 3 and 120),
  description text not null check (length(btrim(description)) between 10 and 500),
  included_recipe_ids text[] not null check (
    cardinality(included_recipe_ids) > 0
    and included_recipe_ids <@ array[
      'snapshot_core',
      'snapshot_valuation',
      'owner_current_transfer',
      'transaction_history_recent',
      'finance_current_bonds'
    ]
  ),
  field_manifest jsonb not null default '[]'::jsonb check (jsonb_typeof(field_manifest) = 'array'),
  customer_price_cents integer not null check (customer_price_cents between 0 and 100000),
  status text not null default 'draft' check (status in ('draft', 'uat_validated', 'suspended')),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, product_id)
);

create index knowledge_factory_report_products_organisation_idx
  on public.knowledge_factory_report_products (organisation_id, updated_at desc);

alter table public.knowledge_factory_report_products enable row level security;
revoke all on public.knowledge_factory_report_products from anon, authenticated;
grant select on public.knowledge_factory_report_products to authenticated;

create policy knowledge_factory_report_products_admin_read
on public.knowledge_factory_report_products for select to authenticated
using (public.knowledge_factory_is_active_member(
  organisation_id,
  array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin']
));

comment on table public.knowledge_factory_report_products is 'Phase 1 commercial definitions for fixed canvassing reports. GraphQL field selection is never stored here or controlled by the browser.';

commit;
