begin;
set local lock_timeout = '5s';
-- Allow a fresh API/query cost check without overwriting historical evidence.
create unique index if not exists knowledge_factory_cost_validations_versioned_once_idx
  on public.knowledge_factory_cost_validations
    (organisation_id, property_id, recipe_id, supplier_api_version, (coalesce(supplier_query_sha256, '')))
  where outcome = 'validated';
drop index if exists public.knowledge_factory_cost_validations_recipe_once_idx;
commit;
