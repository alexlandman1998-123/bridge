begin;

-- Quote-only UAT evidence for the five fixed canvassing recipes. Supplier
-- payloads and personal/financial data are deliberately never retained here.
create table public.knowledge_factory_cost_validations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  property_id bigint not null check (property_id > 0),
  recipe_id text not null check (recipe_id in (
    'snapshot_core',
    'snapshot_valuation',
    'owner_current_transfer',
    'transaction_history_recent',
    'finance_current_bonds'
  )),
  request_purpose text not null check (length(btrim(request_purpose)) between 10 and 500),
  field_cost integer check (field_cost is null or field_cost >= 0),
  type_cost integer check (type_cost is null or type_cost >= 0),
  price_surcharge integer check (price_surcharge is null or price_surcharge >= 0),
  credits_consumed integer check (credits_consumed is null or credits_consumed >= 0),
  vendor_request_id text,
  outcome text not null default 'validated' check (outcome in ('validated', 'failed')),
  error_code text,
  created_at timestamptz not null default now()
);

create index knowledge_factory_cost_validations_organisation_created_idx
  on public.knowledge_factory_cost_validations (organisation_id, created_at desc);
create unique index knowledge_factory_cost_validations_recipe_once_idx
  on public.knowledge_factory_cost_validations (organisation_id, property_id, recipe_id)
  where outcome = 'validated';

alter table public.knowledge_factory_cost_validations enable row level security;
revoke all on public.knowledge_factory_cost_validations from anon, authenticated;
grant select on public.knowledge_factory_cost_validations to authenticated;

create policy knowledge_factory_cost_validations_admin_read
on public.knowledge_factory_cost_validations for select to authenticated
using (public.knowledge_factory_is_active_member(
  organisation_id,
  array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin']
));

comment on table public.knowledge_factory_cost_validations is 'Quote-only evidence for the five fixed canvassing cost recipes. No supplier result payload, owner identity, seller identity, bond detail or credentials are stored.';

commit;
