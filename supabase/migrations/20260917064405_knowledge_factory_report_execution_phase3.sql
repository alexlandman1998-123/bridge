begin;

-- Phase 3 turns a previously confirmed package into one controlled supplier
-- execution. The personal/financial result is retained separately from the
-- generic report-request summary and is never exposed to the browser directly.
alter table public.knowledge_factory_report_purchase_intents
  drop constraint knowledge_factory_report_purchase_intents_status_check,
  drop constraint knowledge_factory_report_purchase_intents_execution_check;

alter table public.knowledge_factory_report_purchase_intents
  add constraint knowledge_factory_report_purchase_intents_status_check check (
    status in (
      'confirmed_pending_execution',
      'executing',
      'executed',
      'execution_failed',
      'cancelled',
      'expired'
    )
  ),
  add constraint knowledge_factory_report_purchase_intents_execution_check check (
    (status = 'executed' and executed_at is not null and report_request_id is not null)
    or (status <> 'executed' and executed_at is null and report_request_id is null)
  );

alter table public.knowledge_factory_report_requests
  drop constraint knowledge_factory_report_requests_types_check;

alter table public.knowledge_factory_report_requests
  add constraint knowledge_factory_report_requests_types_check check (
    requested_report_types <@ array[
      'property_summary',
      'municipal_valuation',
      'basic_owner_lookup',
      'full_canvassing_report'
    ]::text[]
    and cardinality(requested_report_types) > 0
  );

create table public.knowledge_factory_report_results (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  purchase_intent_id uuid not null unique references public.knowledge_factory_report_purchase_intents(id) on delete restrict,
  report_request_id uuid not null unique references public.knowledge_factory_report_requests(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  product_id text not null check (product_id in ('basic_owner_lookup', 'full_canvassing_report')),
  property_id bigint not null check (property_id > 0),
  report_data jsonb not null check (jsonb_typeof(report_data) = 'object'),
  field_cost integer check (field_cost is null or field_cost >= 0),
  type_cost integer check (type_cost is null or type_cost >= 0),
  price_surcharge integer check (price_surcharge is null or price_surcharge >= 0),
  credits_consumed integer check (credits_consumed is null or credits_consumed >= 0),
  vendor_request_id text,
  executed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index knowledge_factory_report_results_org_executed_idx
  on public.knowledge_factory_report_results (organisation_id, executed_at desc);
create index knowledge_factory_report_results_actor_executed_idx
  on public.knowledge_factory_report_results (actor_id, executed_at desc);

alter table public.knowledge_factory_report_results enable row level security;
revoke all on public.knowledge_factory_report_results from anon, authenticated;
grant select on public.knowledge_factory_report_results to authenticated;

create policy knowledge_factory_report_results_read
on public.knowledge_factory_report_results for select to authenticated
using (
  actor_id = (select auth.uid())
  or public.knowledge_factory_is_active_member(
    organisation_id,
    array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin']
  )
);

comment on table public.knowledge_factory_report_results is 'Phase 3 controlled supplier results. Personal ownership and finance data is stored only after an explicit report purchase intent and is accessible only to the requesting user or a principal-level administrator.';

commit;
