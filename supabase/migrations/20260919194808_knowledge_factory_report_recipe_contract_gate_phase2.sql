begin;

-- A priced package may only become UAT-ready once each supplier operation it
-- relies on has been proved through the Phase 1 contract register. This is a
-- scope gate only: it stores operation keys, never supplier result data.
alter table public.knowledge_factory_report_products
  add column required_contract_operations text[] not null default '{}'::text[]
    check (required_contract_operations <@ array[
      'property_by_id', 'owners', 'municipal_valuation', 'transfers',
      'bonds', 'recent_sales', 'avm', 'fica_kyc_contract'
    ]::text[]);

update public.knowledge_factory_report_products
set
  required_contract_operations = case product_id
    when 'basic_owner_lookup' then array['property_by_id', 'owners']::text[]
    when 'full_canvassing_report' then array['property_by_id', 'owners', 'municipal_valuation', 'transfers', 'bonds']::text[]
    else required_contract_operations
  end,
  status = 'draft',
  updated_at = now();

comment on column public.knowledge_factory_report_products.required_contract_operations is
  'Phase 1 UAT operation keys which must pass before this report product can be marked UAT-ready.';

commit;
