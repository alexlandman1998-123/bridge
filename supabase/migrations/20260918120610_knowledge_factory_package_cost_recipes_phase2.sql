begin;

-- Phase 2 validates the complete customer-facing package query, not a sum of
-- smaller diagnostic queries. That ensures the commercial guard uses the cost
-- of precisely what a future report execution will request.
alter table public.knowledge_factory_cost_validations
  drop constraint if exists knowledge_factory_cost_validations_recipe_id_check,
  add constraint knowledge_factory_cost_validations_recipe_id_check check (recipe_id in (
    'snapshot_core',
    'snapshot_valuation',
    'owner_current_transfer',
    'transaction_history_recent',
    'finance_current_bonds',
    'package_basic_v1',
    'package_full_v1'
  ));

alter table public.knowledge_factory_report_products
  add column cost_validation_recipe_id text not null default 'package_basic_v1'
    check (cost_validation_recipe_id in ('package_basic_v1', 'package_full_v1'));

update public.knowledge_factory_report_products
set
  cost_validation_recipe_id = case product_id
    when 'basic_owner_lookup' then 'package_basic_v1'
    when 'full_canvassing_report' then 'package_full_v1'
    else cost_validation_recipe_id
  end,
  status = 'draft',
  updated_at = now();

comment on column public.knowledge_factory_report_products.cost_validation_recipe_id is
  'Server-owned complete package query used for supplier cost-only validation before a product can be enabled.';

commit;
