begin;

-- A Phase 2 confirmation is not a supplier request. It freezes the package,
-- selling price and stated purpose for later, deliberately controlled execution.
create table public.knowledge_factory_report_purchase_intents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  property_id bigint not null check (property_id > 0),
  product_id text not null check (product_id in ('basic_owner_lookup', 'full_canvassing_report')),
  product_name text not null check (length(btrim(product_name)) between 3 and 120),
  included_fields jsonb not null check (jsonb_typeof(included_fields) = 'array'),
  customer_price_cents integer not null check (customer_price_cents between 0 and 100000),
  request_purpose text not null check (length(btrim(request_purpose)) between 10 and 500),
  status text not null default 'confirmed_pending_execution' check (status in ('confirmed_pending_execution', 'executed', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  executed_at timestamptz,
  report_request_id uuid references public.knowledge_factory_report_requests(id) on delete set null,
  constraint knowledge_factory_report_purchase_intents_execution_check check (
    (status = 'executed' and executed_at is not null and report_request_id is not null)
    or (status <> 'executed' and executed_at is null and report_request_id is null)
  )
);

create index knowledge_factory_report_purchase_intents_org_created_idx
  on public.knowledge_factory_report_purchase_intents (organisation_id, created_at desc);
create index knowledge_factory_report_purchase_intents_actor_created_idx
  on public.knowledge_factory_report_purchase_intents (actor_id, created_at desc);

alter table public.knowledge_factory_report_purchase_intents enable row level security;
revoke all on public.knowledge_factory_report_purchase_intents from anon, authenticated;
grant select on public.knowledge_factory_report_purchase_intents to authenticated;

create policy knowledge_factory_report_purchase_intents_read
on public.knowledge_factory_report_purchase_intents for select to authenticated
using (
  actor_id = (select auth.uid())
  or public.knowledge_factory_is_active_member(
    organisation_id,
    array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin']
  )
);

comment on table public.knowledge_factory_report_purchase_intents is 'Phase 2 confirmation record. It contains no supplier response, ownership result, financial result or credentials and does not itself trigger supplier execution.';

commit;
