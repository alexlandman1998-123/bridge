begin;
set local lock_timeout = '5s';

-- Old evidence retains its original API version; it cannot approve v1 prices.
alter table public.knowledge_factory_cost_validations
  add column if not exists supplier_api_version text not null default 'v0_1'
    check (supplier_api_version in ('v0_1', 'v1')),
  add column if not exists supplier_query_sha256 text
    check (supplier_query_sha256 is null or supplier_query_sha256 ~ '^[0-9a-f]{64}$');
create index if not exists knowledge_factory_cost_validations_v1_recipe_idx
  on public.knowledge_factory_cost_validations
    (organisation_id, recipe_id, supplier_query_sha256, created_at desc)
  where supplier_api_version = 'v1' and outcome = 'validated';
comment on column public.knowledge_factory_cost_validations.supplier_api_version is
  'Supplier API version used for this cost check; v0_1 evidence cannot approve v1 pricing.';
comment on column public.knowledge_factory_cost_validations.supplier_query_sha256 is
  'SHA-256 of the canonical server-owned query excluding operation name; prevents stale costs being reused.';
commit;
