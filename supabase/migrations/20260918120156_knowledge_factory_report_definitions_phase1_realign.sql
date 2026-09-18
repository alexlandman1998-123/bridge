begin;

-- Phase 1 realignment: report products must describe the actual information
-- a customer is buying, rather than a loose list of supplier fields. The
-- browser never controls these definitions or the eventual GraphQL selection.
alter table public.knowledge_factory_report_products
  add column definition_version text not null default 'legacy-v1'
    check (length(btrim(definition_version)) between 3 and 80),
  add column report_sections jsonb not null default '[]'::jsonb
    check (jsonb_typeof(report_sections) = 'array'),
  add column excluded_field_manifest jsonb not null default '[]'::jsonb
    check (jsonb_typeof(excluded_field_manifest) = 'array');

-- Existing packages are deliberately returned to draft. Their previous UAT
-- evidence covered a narrower recipe and cannot validate the new full report.
update public.knowledge_factory_report_products
set
  definition_version = 'canvassing-v1',
  name = case product_id
    when 'basic_owner_lookup' then 'Basic property & owner lookup'
    when 'full_canvassing_report' then 'Full property intelligence report'
    else name
  end,
  description = case product_id
    when 'basic_owner_lookup' then
      'A focused property and current-owner lookup for a first canvassing contact.'
    when 'full_canvassing_report' then
      'A comprehensive property, valuation, ownership, transaction and finance-indicator report for a qualified canvassing opportunity.'
    else description
  end,
  included_recipe_ids = case product_id
    when 'basic_owner_lookup' then array['snapshot_core', 'owner_current_transfer']::text[]
    when 'full_canvassing_report' then array[
      'snapshot_core',
      'snapshot_valuation',
      'owner_current_transfer',
      'transaction_history_recent',
      'finance_current_bonds'
    ]::text[]
    else included_recipe_ids
  end,
  field_manifest = case product_id
    when 'basic_owner_lookup' then jsonb_build_array(
      'Property and parcel reference',
      'Mapped street address, suburb and town',
      'Property type and extent',
      'Current owner name, entity type and ownership share',
      'Report reference, requested purpose and generated date'
    )
    when 'full_canvassing_report' then jsonb_build_array(
      'Everything in Basic property & owner lookup',
      'Municipal valuation, date, municipality, zoning and reason',
      'Property, scheme, unit and deeds context where available',
      'Current ownership and ownership tenure',
      'Selected recent transfer timeline with dates and values',
      'Current finance indicator, current-bond count and registration dates',
      'Arch9 opportunity signals derived from the saved report data'
    )
    else field_manifest
  end,
  report_sections = case product_id
    when 'basic_owner_lookup' then jsonb_build_array(
      jsonb_build_object('key', 'property', 'title', 'Property identity'),
      jsonb_build_object('key', 'ownership', 'title', 'Current ownership'),
      jsonb_build_object('key', 'provenance', 'title', 'Report reference and purpose')
    )
    when 'full_canvassing_report' then jsonb_build_array(
      jsonb_build_object('key', 'property', 'title', 'Property identity'),
      jsonb_build_object('key', 'valuation', 'title', 'Municipal valuation and zoning'),
      jsonb_build_object('key', 'ownership', 'title', 'Current ownership and tenure'),
      jsonb_build_object('key', 'transactions', 'title', 'Selected transfer timeline'),
      jsonb_build_object('key', 'finance', 'title', 'Current finance indicator'),
      jsonb_build_object('key', 'signals', 'title', 'Canvassing opportunity signals'),
      jsonb_build_object('key', 'provenance', 'title', 'Report reference and purpose')
    )
    else report_sections
  end,
  excluded_field_manifest = case product_id
    when 'basic_owner_lookup' then jsonb_build_array(
      'Municipal valuation, zoning and historic transaction data',
      'Bond, lender and finance data',
      'FICA/KYC, credit, identity and contact data'
    )
    when 'full_canvassing_report' then jsonb_build_array(
      'Historic buyer and seller names',
      'Exact bond balance, bond holder, bond number and bond-owner identity',
      'FICA/KYC, credit, identity and contact data',
      'Comparable-sales data until it has been separately cost-validated'
    )
    else excluded_field_manifest
  end,
  status = 'draft',
  updated_at = now();

comment on column public.knowledge_factory_report_products.definition_version is
  'Version of the customer-facing report definition. A revised definition requires fresh UAT cost validation.';
comment on column public.knowledge_factory_report_products.report_sections is
  'Server-owned ordered sections for the eventual report renderer; not a client-controlled GraphQL selection.';
comment on column public.knowledge_factory_report_products.excluded_field_manifest is
  'Sensitive or unvalidated information deliberately excluded from the sold report package.';

commit;
