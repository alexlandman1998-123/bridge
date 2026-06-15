begin;
create extension if not exists "pgcrypto";
create or replace function public.bridge_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
do $$
begin
  if to_regclass('public.document_requirement_rules') is not null
     and not exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'document_requirement_rules'
         and column_name = 'document_definition_key'
     )
  then
    raise exception
      'public.document_requirement_rules already exists with a legacy schema. Resolve the legacy table before applying the canonical document system migration.';
  end if;
end $$;
create table if not exists public.document_packs (
  key text primary key,
  display_label text not null,
  description text,
  applies_to_context text[] not null default '{}'::text[],
  default_visible_to_roles text[] not null default '{}'::text[],
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.document_definitions (
  key text primary key,
  display_label text not null,
  description text,
  category text not null,
  pack_key text not null references public.document_packs(key) on update cascade on delete restrict,
  applies_to_context text[] not null default '{}'::text[],
  default_requirement_level text not null,
  default_visibility text[] not null default '{}'::text[],
  default_upload_roles text[] not null default '{}'::text[],
  review_required boolean not null default false,
  validity_period_days integer,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_definitions_requirement_level_check check (
    default_requirement_level in ('blocker', 'required', 'recommended', 'optional', 'not_applicable')
  ),
  constraint document_definitions_validity_period_check check (
    validity_period_days is null or validity_period_days > 0
  )
);
create table if not exists public.document_requirement_rules (
  id uuid primary key default gen_random_uuid(),
  document_definition_key text not null references public.document_definitions(key) on update cascade on delete cascade,
  pack_key text not null references public.document_packs(key) on update cascade on delete restrict,
  context_type text not null,
  condition_json jsonb not null default '{}'::jsonb,
  requirement_level text,
  stage_gates text[] not null default '{}'::text[],
  requested_from_role text,
  visible_to_roles text[],
  uploadable_by_roles text[],
  reviewer_role text,
  priority integer not null default 100,
  resolver_key text,
  is_active boolean not null default true,
  effective_from timestamptz,
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_requirement_rules_requirement_level_check check (
    requirement_level is null
    or requirement_level in ('blocker', 'required', 'recommended', 'optional', 'not_applicable')
  ),
  constraint document_requirement_rules_effective_window_check check (
    effective_to is null or effective_from is null or effective_to > effective_from
  )
);
do $$
begin
  if to_regclass('public.document_requirement_rules') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'document_requirement_rules'
        and column_name = 'purchaser_type'
    ) then
      alter table public.document_requirement_rules
        alter column purchaser_type drop not null;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'document_requirement_rules'
        and column_name = 'template_key'
    ) then
      alter table public.document_requirement_rules
        alter column template_key drop not null;
    end if;
  end if;
end $$;
create table if not exists public.document_requirement_instances (
  id uuid primary key default gen_random_uuid(),
  document_definition_key text not null references public.document_definitions(key) on update cascade on delete restrict,
  context_type text not null,
  context_id uuid not null,
  transaction_id uuid,
  listing_id uuid,
  pack_key text not null references public.document_packs(key) on update cascade on delete restrict,
  requirement_level text not null,
  status text not null default 'pending',
  stage_gates text[] not null default '{}'::text[],
  requested_from_role text,
  requested_from_contact_id uuid,
  visible_to_roles text[] not null default '{}'::text[],
  uploadable_by_roles text[] not null default '{}'::text[],
  reviewer_role text,
  satisfied_by_document_id uuid,
  satisfied_by_packet_id uuid,
  satisfied_by_packet_version_id uuid,
  rejection_reason text,
  waiver_reason text,
  expiry_date timestamptz,
  rule_id uuid references public.document_requirement_rules(id) on update cascade on delete set null,
  resolver_version text,
  source_system text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_requirement_instances_requirement_level_check check (
    requirement_level in ('blocker', 'required', 'recommended', 'optional', 'not_applicable')
  ),
  constraint document_requirement_instances_status_check check (
    status in (
      'pending',
      'requested',
      'uploaded',
      'under_review',
      'approved',
      'rejected',
      'waived',
      'expired',
      'completed',
      'not_applicable'
    )
  )
);
create table if not exists public.document_requirement_reviews (
  id uuid primary key default gen_random_uuid(),
  requirement_instance_id uuid not null references public.document_requirement_instances(id) on delete cascade,
  document_id uuid,
  review_status text not null,
  reviewer_role text,
  reviewer_user_id uuid,
  review_notes text,
  rejection_reason text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint document_requirement_reviews_status_check check (
    review_status in ('pending', 'approved', 'rejected', 'needs_reupload')
  )
);
create table if not exists public.document_requirement_events (
  id uuid primary key default gen_random_uuid(),
  requirement_instance_id uuid not null references public.document_requirement_instances(id) on delete cascade,
  event_type text not null,
  actor_role text,
  actor_user_id uuid,
  message text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint document_requirement_events_type_check check (
    event_type in (
      'created',
      'requested',
      'uploaded',
      'review_started',
      'approved',
      'rejected',
      'waived',
      'expired',
      'completed',
      'reminder_sent',
      'visibility_changed'
    )
  )
);
create index if not exists document_packs_active_sort_idx
  on public.document_packs (is_active, sort_order);
create index if not exists document_definitions_pack_sort_idx
  on public.document_definitions (pack_key, sort_order);
create index if not exists document_definitions_category_idx
  on public.document_definitions (category);
create index if not exists document_definitions_active_idx
  on public.document_definitions (is_active);
create index if not exists document_requirement_rules_context_active_idx
  on public.document_requirement_rules (context_type, is_active);
create index if not exists document_requirement_rules_definition_idx
  on public.document_requirement_rules (document_definition_key);
create index if not exists document_requirement_rules_condition_gin_idx
  on public.document_requirement_rules using gin (condition_json);
create index if not exists document_requirement_instances_context_idx
  on public.document_requirement_instances (context_type, context_id);
create index if not exists document_requirement_instances_transaction_idx
  on public.document_requirement_instances (transaction_id);
create index if not exists document_requirement_instances_listing_idx
  on public.document_requirement_instances (listing_id);
create index if not exists document_requirement_instances_pack_idx
  on public.document_requirement_instances (pack_key);
create index if not exists document_requirement_instances_status_idx
  on public.document_requirement_instances (status);
create index if not exists document_requirement_instances_level_idx
  on public.document_requirement_instances (requirement_level);
create index if not exists document_requirement_instances_stage_gates_gin_idx
  on public.document_requirement_instances using gin (stage_gates);
create index if not exists document_requirement_instances_visible_roles_gin_idx
  on public.document_requirement_instances using gin (visible_to_roles);
create index if not exists document_requirement_instances_upload_roles_gin_idx
  on public.document_requirement_instances using gin (uploadable_by_roles);
create unique index if not exists document_requirement_instances_active_unique_idx
  on public.document_requirement_instances (
    context_type,
    context_id,
    document_definition_key,
    coalesce(requested_from_role, ''),
    coalesce(requested_from_contact_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status <> 'not_applicable';
create index if not exists document_requirement_reviews_instance_idx
  on public.document_requirement_reviews (requirement_instance_id);
create index if not exists document_requirement_reviews_document_idx
  on public.document_requirement_reviews (document_id);
create index if not exists document_requirement_reviews_status_idx
  on public.document_requirement_reviews (review_status);
create index if not exists document_requirement_events_instance_created_idx
  on public.document_requirement_events (requirement_instance_id, created_at);
create index if not exists document_requirement_events_type_created_idx
  on public.document_requirement_events (event_type, created_at);
drop trigger if exists document_packs_set_updated_at on public.document_packs;
create trigger document_packs_set_updated_at
before update on public.document_packs
for each row
execute function public.bridge_set_updated_at();
drop trigger if exists document_definitions_set_updated_at on public.document_definitions;
create trigger document_definitions_set_updated_at
before update on public.document_definitions
for each row
execute function public.bridge_set_updated_at();
drop trigger if exists document_requirement_rules_set_updated_at on public.document_requirement_rules;
create trigger document_requirement_rules_set_updated_at
before update on public.document_requirement_rules
for each row
execute function public.bridge_set_updated_at();
drop trigger if exists document_requirement_instances_set_updated_at on public.document_requirement_instances;
create trigger document_requirement_instances_set_updated_at
before update on public.document_requirement_instances
for each row
execute function public.bridge_set_updated_at();
comment on table public.document_packs is 'Canonical Bridge 9 document pack definitions for grouping requirement instances.';
comment on table public.document_definitions is 'Canonical reusable document type definitions. A definition is not a contextual requirement.';
comment on table public.document_requirement_rules is 'Canonical conditional rule metadata used by future resolvers to create requirement instances.';
comment on table public.document_requirement_instances is 'Future canonical source of truth for contextual document requirements.';
comment on table public.document_requirement_reviews is 'Review records for documents uploaded against canonical requirement instances.';
comment on table public.document_requirement_events is 'Audit trail for canonical document requirement lifecycle events.';
insert into public.document_packs (
  key,
  display_label,
  description,
  applies_to_context,
  default_visible_to_roles,
  sort_order
)
values
  ('seller_identity_fica', 'Seller Identity & FICA Pack', 'Seller identity, address, tax, and compliance documents required for mandate and transfer readiness.', array['seller_onboarding', 'private_listing', 'transaction'], array['seller', 'agent', 'agency_admin', 'transferring_attorney'], 10),
  ('seller_authority', 'Seller Authority Pack', 'Documents proving the seller or representative has authority to sell the property.', array['seller_onboarding', 'private_listing', 'transaction'], array['seller', 'agent', 'agency_admin', 'transferring_attorney'], 20),
  ('property_ownership', 'Property Ownership Pack', 'Documents proving the property identity, ownership record, municipal status, and title information.', array['private_listing', 'transaction'], array['seller', 'agent', 'agency_admin', 'transferring_attorney'], 30),
  ('property_finance_existing_bond', 'Property Finance / Existing Bond Pack', 'Existing bond, cancellation, settlement, and bondholder documents for seller-side transfer readiness.', array['private_listing', 'transaction'], array['seller', 'agent', 'agency_admin', 'transferring_attorney', 'cancellation_attorney'], 40),
  ('property_compliance', 'Property Compliance Pack', 'Property compliance certificates, disclosure documents, and installation-related compliance documents.', array['private_listing', 'transaction'], array['seller', 'agent', 'agency_admin', 'transferring_attorney'], 50),
  ('sectional_title_body_corporate', 'Sectional Title / Body Corporate Pack', 'Sectional title and body corporate documents used for listing, offer, and transfer readiness.', array['private_listing', 'transaction'], array['seller', 'agent', 'agency_admin', 'transferring_attorney'], 60),
  ('estate_hoa', 'Estate / HOA Pack', 'Estate and homeowners association documents used for listing, offer, and transfer readiness.', array['private_listing', 'transaction'], array['seller', 'agent', 'agency_admin', 'transferring_attorney'], 70),
  ('tenant_occupancy', 'Tenant / Occupancy Pack', 'Tenant, lease, rental, deposit, and occupation documents for occupied properties.', array['private_listing', 'transaction'], array['seller', 'agent', 'agency_admin', 'transferring_attorney'], 80),
  ('marketing_assets', 'Marketing Asset Pack', 'Listing media, plans, and property feature documents used to prepare and market the listing.', array['private_listing'], array['seller', 'agent', 'agency_admin'], 90),
  ('attorney_transfer_readiness', 'Attorney / Transfer Readiness Pack', 'Transfer instruction, clearance, guarantee, lodgement, and registration documents.', array['transaction', 'attorney_matter'], array['agent', 'agency_admin', 'transferring_attorney', 'bond_attorney', 'cancellation_attorney'], 100),
  ('buyer_identity_fica', 'Buyer Identity & FICA Pack', 'Buyer identity, address, marital, entity, and compliance documents.', array['buyer_onboarding', 'transaction'], array['buyer', 'agent', 'agency_admin', 'transferring_attorney'], 110),
  ('buyer_finance', 'Buyer Finance Pack', 'Buyer finance, proof of funds, and bond approval documents.', array['buyer_onboarding', 'transaction'], array['buyer', 'agent', 'agency_admin', 'bond_originator', 'transferring_attorney'], 120),
  ('bond_originator', 'Bond Originator Pack', 'Bond application, submission, bank feedback, and bond instruction documents.', array['transaction', 'bond_matter'], array['buyer', 'agent', 'agency_admin', 'bond_originator', 'bond_attorney'], 130),
  ('attorney_generated_documents', 'Attorney Generated Documents Pack', 'Generated and signed legal document packet artifacts such as OTPs, mandates, addenda, and signed transfer documents.', array['private_listing', 'transaction', 'attorney_matter'], array['seller', 'buyer', 'agent', 'agency_admin', 'transferring_attorney', 'bond_attorney', 'cancellation_attorney'], 140)
on conflict (key) do update
set
  display_label = excluded.display_label,
  description = excluded.description,
  applies_to_context = excluded.applies_to_context,
  default_visible_to_roles = excluded.default_visible_to_roles,
  sort_order = excluded.sort_order,
  is_active = true;
insert into public.document_definitions (
  key,
  display_label,
  description,
  category,
  pack_key,
  applies_to_context,
  default_requirement_level,
  default_visibility,
  default_upload_roles,
  review_required,
  validity_period_days,
  sort_order,
  metadata_json
)
values
  ('seller_id_document', 'Seller ID Document', 'Identity document for the seller or selling owner.', 'seller_identity_fica', 'seller_identity_fica', array['seller_onboarding', 'private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 10, '{}'::jsonb),
  ('seller_proof_of_address', 'Seller Proof of Address', 'Recent proof of residential address for the seller.', 'seller_identity_fica', 'seller_identity_fica', array['seller_onboarding', 'private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 20, '{}'::jsonb),
  ('seller_tax_number', 'Seller Tax Number', 'Seller income tax number or SARS reference where required.', 'seller_identity_fica', 'seller_identity_fica', array['seller_onboarding', 'private_listing', 'transaction'], 'recommended', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 30, '{}'::jsonb),
  ('seller_company_registration', 'Seller Company Registration', 'Company registration or CIPC documents for a company seller.', 'seller_identity_fica', 'seller_identity_fica', array['seller_onboarding', 'private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 40, '{}'::jsonb),
  ('seller_trust_deed', 'Seller Trust Deed', 'Trust deed for a trust seller.', 'seller_identity_fica', 'seller_identity_fica', array['seller_onboarding', 'private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 50, '{}'::jsonb),
  ('seller_letters_of_authority', 'Seller Letters of Authority', 'Letters of authority for trustees or authorised representatives.', 'seller_identity_fica', 'seller_identity_fica', array['seller_onboarding', 'private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 60, '{}'::jsonb),
  ('seller_executor_authority', 'Seller Executor Authority', 'Letter of executorship or authority for a deceased estate seller.', 'seller_identity_fica', 'seller_identity_fica', array['seller_onboarding', 'private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 70, '{}'::jsonb),
  ('seller_spouse_consent', 'Seller Spouse Consent', 'Spouse consent where the seller''s marital regime requires it.', 'seller_identity_fica', 'seller_identity_fica', array['seller_onboarding', 'private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 80, '{}'::jsonb),
  ('seller_marriage_certificate', 'Seller Marriage Certificate', 'Marriage certificate where marital status or regime requires it.', 'seller_identity_fica', 'seller_identity_fica', array['seller_onboarding', 'private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 90, '{}'::jsonb),
  ('seller_anc', 'Seller Antenuptial Contract', 'Antenuptial contract where the seller is married out of community of property.', 'seller_identity_fica', 'seller_identity_fica', array['seller_onboarding', 'private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 100, '{}'::jsonb),
  ('seller_divorce_order', 'Seller Divorce Order', 'Divorce order where prior marital status affects authority to sell.', 'seller_identity_fica', 'seller_identity_fica', array['seller_onboarding', 'private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 110, '{}'::jsonb),

  ('signed_mandate', 'Signed Mandate', 'Signed mandate confirming authority to market and sell the property.', 'seller_authority', 'seller_authority', array['private_listing', 'transaction'], 'blocker', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 10, '{}'::jsonb),
  ('company_resolution_to_sell', 'Company Resolution to Sell', 'Company resolution authorising the sale of the property.', 'seller_authority', 'seller_authority', array['seller_onboarding', 'private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 20, '{}'::jsonb),
  ('trust_resolution_to_sell', 'Trust Resolution to Sell', 'Trustee resolution authorising the sale of the property.', 'seller_authority', 'seller_authority', array['seller_onboarding', 'private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 30, '{}'::jsonb),
  ('power_of_attorney', 'Power of Attorney', 'Power of attorney authorising a representative to act for the seller.', 'seller_authority', 'seller_authority', array['seller_onboarding', 'private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 40, '{}'::jsonb),

  ('title_deed_copy', 'Title Deed Copy', 'Copy of the property title deed.', 'property_ownership', 'property_ownership', array['private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent', 'transferring_attorney'], true, null, 10, '{}'::jsonb),
  ('deed_office_copy', 'Deeds Office Copy', 'Deeds office copy or official property record.', 'property_ownership', 'property_ownership', array['private_listing', 'transaction'], 'recommended', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['agent', 'transferring_attorney'], true, null, 20, '{}'::jsonb),
  ('sg_diagram', 'SG Diagram', 'Surveyor-General diagram where available or required.', 'property_ownership', 'property_ownership', array['private_listing', 'transaction'], 'recommended', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent', 'transferring_attorney'], true, null, 30, '{}'::jsonb),
  ('erf_diagram', 'Erf Diagram', 'Erf or site diagram for the property.', 'property_ownership', 'property_ownership', array['private_listing', 'transaction'], 'recommended', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 40, '{}'::jsonb),
  ('zoning_certificate', 'Zoning Certificate', 'Zoning certificate or zoning confirmation for the property.', 'property_ownership', 'property_ownership', array['private_listing', 'transaction'], 'recommended', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent', 'transferring_attorney'], true, null, 50, '{}'::jsonb),
  ('rates_account', 'Rates Account', 'Latest municipal rates account.', 'property_ownership', 'property_ownership', array['private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 60, '{}'::jsonb),
  ('rates_clearance_certificate', 'Rates Clearance Certificate', 'Rates clearance certificate issued for transfer.', 'property_ownership', 'property_ownership', array['transaction', 'attorney_matter'], 'blocker', array['agent', 'agency_admin', 'transferring_attorney'], array['transferring_attorney'], true, null, 70, '{}'::jsonb),
  ('occupation_certificate', 'Occupation Certificate', 'Occupation certificate where applicable to the property.', 'property_ownership', 'property_ownership', array['private_listing', 'transaction'], 'recommended', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent', 'transferring_attorney'], true, null, 80, '{}'::jsonb),

  ('bond_statement', 'Bond Statement', 'Latest existing bond statement for the property.', 'property_finance_existing_bond', 'property_finance_existing_bond', array['private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney', 'cancellation_attorney'], array['seller', 'agent'], true, null, 10, '{}'::jsonb),
  ('bond_bank_details', 'Bond Bank Details', 'Bank or bondholder details for the existing bond.', 'property_finance_existing_bond', 'property_finance_existing_bond', array['private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney', 'cancellation_attorney'], array['seller', 'agent'], true, null, 20, '{}'::jsonb),
  ('bond_cancellation_notice', 'Bond Cancellation Notice', 'Notice or instruction for cancellation of the existing bond.', 'property_finance_existing_bond', 'property_finance_existing_bond', array['transaction', 'attorney_matter'], 'blocker', array['agent', 'agency_admin', 'transferring_attorney', 'cancellation_attorney'], array['seller', 'agent', 'cancellation_attorney'], true, null, 30, '{}'::jsonb),
  ('bond_cancellation_attorney_details', 'Bond Cancellation Attorney Details', 'Details of the cancellation attorney or firm handling the bond cancellation.', 'property_finance_existing_bond', 'property_finance_existing_bond', array['transaction', 'attorney_matter'], 'required', array['agent', 'agency_admin', 'transferring_attorney', 'cancellation_attorney'], array['agent', 'cancellation_attorney'], true, null, 40, '{}'::jsonb),
  ('settlement_figure', 'Settlement Figure', 'Settlement figure for the existing bond.', 'property_finance_existing_bond', 'property_finance_existing_bond', array['transaction', 'attorney_matter'], 'required', array['agent', 'agency_admin', 'transferring_attorney', 'cancellation_attorney'], array['cancellation_attorney'], true, null, 50, '{}'::jsonb),

  ('electrical_compliance_certificate', 'Electrical Compliance Certificate', 'Electrical compliance certificate for transfer readiness.', 'property_compliance', 'property_compliance', array['private_listing', 'transaction'], 'blocker', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent', 'transferring_attorney'], true, null, 10, '{}'::jsonb),
  ('gas_compliance_certificate', 'Gas Compliance Certificate', 'Gas compliance certificate where the property has a gas installation.', 'property_compliance', 'property_compliance', array['private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent', 'transferring_attorney'], true, null, 20, '{}'::jsonb),
  ('electric_fence_certificate', 'Electric Fence Certificate', 'Electric fence compliance certificate where applicable.', 'property_compliance', 'property_compliance', array['private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent', 'transferring_attorney'], true, null, 30, '{}'::jsonb),
  ('plumbing_certificate', 'Plumbing Certificate', 'Plumbing compliance certificate where applicable.', 'property_compliance', 'property_compliance', array['private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent', 'transferring_attorney'], true, null, 40, '{}'::jsonb),
  ('beetle_certificate', 'Beetle Certificate', 'Beetle or wood-borer certificate where applicable.', 'property_compliance', 'property_compliance', array['private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent', 'transferring_attorney'], true, null, 50, '{}'::jsonb),
  ('solar_compliance_documents', 'Solar Compliance Documents', 'Compliance and installation documents for solar systems where applicable.', 'property_compliance', 'property_compliance', array['private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent', 'transferring_attorney'], true, null, 60, '{}'::jsonb),
  ('approved_building_plans', 'Approved Building Plans', 'Approved building plans for the property where available or required.', 'property_compliance', 'property_compliance', array['private_listing', 'transaction'], 'recommended', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 70, '{}'::jsonb),
  ('property_condition_disclosure', 'Property Condition Disclosure', 'Property defects disclosure or condition declaration.', 'property_compliance', 'property_compliance', array['private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'buyer', 'transferring_attorney'], array['seller', 'agent'], true, null, 80, '{}'::jsonb),

  ('levy_statement', 'Levy Statement', 'Latest levy statement for sectional title or managed property.', 'sectional_title_body_corporate', 'sectional_title_body_corporate', array['private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 10, '{}'::jsonb),
  ('levy_clearance_certificate', 'Levy Clearance Certificate', 'Levy clearance certificate required for transfer where applicable.', 'sectional_title_body_corporate', 'sectional_title_body_corporate', array['transaction', 'attorney_matter'], 'blocker', array['agent', 'agency_admin', 'transferring_attorney'], array['transferring_attorney'], true, null, 20, '{}'::jsonb),
  ('body_corporate_details', 'Body Corporate Details', 'Body corporate managing agent and contact details.', 'sectional_title_body_corporate', 'sectional_title_body_corporate', array['private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 30, '{}'::jsonb),
  ('body_corporate_rules', 'Body Corporate Rules', 'Conduct and management rules for the body corporate.', 'sectional_title_body_corporate', 'sectional_title_body_corporate', array['private_listing', 'transaction'], 'recommended', array['seller', 'agent', 'agency_admin', 'buyer', 'transferring_attorney'], array['seller', 'agent'], true, null, 40, '{}'::jsonb),
  ('body_corporate_insurance_schedule', 'Body Corporate Insurance Schedule', 'Current body corporate insurance schedule where available.', 'sectional_title_body_corporate', 'sectional_title_body_corporate', array['private_listing', 'transaction'], 'recommended', array['seller', 'agent', 'agency_admin', 'buyer', 'transferring_attorney'], array['seller', 'agent'], true, null, 50, '{}'::jsonb),

  ('hoa_levy_statement', 'HOA Levy Statement', 'Latest homeowners association levy statement.', 'estate_hoa', 'estate_hoa', array['private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 10, '{}'::jsonb),
  ('hoa_clearance_certificate', 'HOA Clearance Certificate', 'HOA clearance certificate for transfer where applicable.', 'estate_hoa', 'estate_hoa', array['transaction', 'attorney_matter'], 'blocker', array['agent', 'agency_admin', 'transferring_attorney'], array['transferring_attorney'], true, null, 20, '{}'::jsonb),
  ('hoa_details', 'HOA Details', 'Homeowners association contact and account details.', 'estate_hoa', 'estate_hoa', array['private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 30, '{}'::jsonb),
  ('estate_conduct_rules', 'Estate Conduct Rules', 'Estate rules, conduct rules, or architectural guidelines.', 'estate_hoa', 'estate_hoa', array['private_listing', 'transaction'], 'recommended', array['seller', 'agent', 'agency_admin', 'buyer', 'transferring_attorney'], array['seller', 'agent'], true, null, 40, '{}'::jsonb),

  ('lease_agreement', 'Lease Agreement', 'Current lease agreement for tenant-occupied property.', 'tenant_occupancy', 'tenant_occupancy', array['private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'buyer', 'transferring_attorney'], array['seller', 'agent'], true, null, 10, '{}'::jsonb),
  ('tenant_details', 'Tenant Details', 'Tenant contact, occupation, and access details.', 'tenant_occupancy', 'tenant_occupancy', array['private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 20, '{}'::jsonb),
  ('rental_schedule', 'Rental Schedule', 'Rental schedule or current rental summary.', 'tenant_occupancy', 'tenant_occupancy', array['private_listing', 'transaction'], 'recommended', array['seller', 'agent', 'agency_admin', 'buyer', 'transferring_attorney'], array['seller', 'agent'], true, null, 30, '{}'::jsonb),
  ('deposit_details', 'Deposit Details', 'Tenant deposit details and holding information.', 'tenant_occupancy', 'tenant_occupancy', array['transaction'], 'recommended', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 40, '{}'::jsonb),
  ('notice_period_details', 'Notice Period Details', 'Lease notice period, termination, and occupation timing details.', 'tenant_occupancy', 'tenant_occupancy', array['private_listing', 'transaction'], 'recommended', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], true, null, 50, '{}'::jsonb),

  ('floor_plan', 'Floor Plan', 'Marketing floor plan or architectural floor layout.', 'marketing_assets', 'marketing_assets', array['private_listing'], 'recommended', array['seller', 'agent', 'agency_admin', 'buyer'], array['seller', 'agent'], false, null, 10, '{}'::jsonb),
  ('property_photos', 'Property Photos', 'Property photography for marketing and listing publication.', 'marketing_assets', 'marketing_assets', array['private_listing'], 'recommended', array['seller', 'agent', 'agency_admin', 'buyer'], array['seller', 'agent'], false, null, 20, '{}'::jsonb),
  ('video_walkthrough', 'Video Walkthrough', 'Video walkthrough asset for the property listing.', 'marketing_assets', 'marketing_assets', array['private_listing'], 'optional', array['seller', 'agent', 'agency_admin', 'buyer'], array['seller', 'agent'], false, null, 30, '{}'::jsonb),
  ('matterport_virtual_tour', 'Matterport Virtual Tour', 'Matterport or virtual tour asset for the property listing.', 'marketing_assets', 'marketing_assets', array['private_listing'], 'optional', array['seller', 'agent', 'agency_admin', 'buyer'], array['seller', 'agent'], false, null, 40, '{}'::jsonb),
  ('property_features_sheet', 'Property Features Sheet', 'Structured feature sheet used for listing preparation and marketing.', 'marketing_assets', 'marketing_assets', array['private_listing'], 'recommended', array['seller', 'agent', 'agency_admin'], array['seller', 'agent'], false, null, 50, '{}'::jsonb),

  ('signed_otp', 'Signed OTP', 'Signed offer to purchase or sale agreement.', 'attorney_transfer_readiness', 'attorney_transfer_readiness', array['transaction', 'attorney_matter'], 'blocker', array['buyer', 'seller', 'agent', 'agency_admin', 'transferring_attorney'], array['buyer', 'seller', 'agent', 'transferring_attorney'], true, null, 10, '{}'::jsonb),
  ('transfer_instruction_letter', 'Transfer Instruction Letter', 'Instruction letter issued to the transferring attorney.', 'attorney_transfer_readiness', 'attorney_transfer_readiness', array['transaction', 'attorney_matter'], 'blocker', array['agent', 'agency_admin', 'transferring_attorney'], array['agent', 'transferring_attorney'], true, null, 20, '{}'::jsonb),
  ('transfer_documents', 'Transfer Documents', 'Transfer documentation prepared or requested by the transferring attorney.', 'attorney_transfer_readiness', 'attorney_transfer_readiness', array['transaction', 'attorney_matter'], 'required', array['buyer', 'seller', 'agent', 'agency_admin', 'transferring_attorney'], array['buyer', 'seller', 'transferring_attorney'], true, null, 30, '{}'::jsonb),
  ('guarantees', 'Guarantees', 'Financial guarantees required for transfer.', 'attorney_transfer_readiness', 'attorney_transfer_readiness', array['transaction', 'attorney_matter'], 'blocker', array['agent', 'agency_admin', 'transferring_attorney', 'bond_attorney', 'bond_originator'], array['bond_attorney', 'bond_originator', 'transferring_attorney'], true, null, 40, '{}'::jsonb),
  ('lodgement_confirmation', 'Lodgement Confirmation', 'Confirmation that the matter has been lodged.', 'attorney_transfer_readiness', 'attorney_transfer_readiness', array['transaction', 'attorney_matter'], 'required', array['agent', 'agency_admin', 'transferring_attorney'], array['transferring_attorney'], true, null, 50, '{}'::jsonb),
  ('registration_confirmation', 'Registration Confirmation', 'Confirmation that registration has taken place.', 'attorney_transfer_readiness', 'attorney_transfer_readiness', array['transaction', 'attorney_matter'], 'required', array['buyer', 'seller', 'agent', 'agency_admin', 'transferring_attorney'], array['transferring_attorney'], true, null, 60, '{}'::jsonb),

  ('buyer_id_document', 'Buyer ID Document', 'Identity document for the buyer or purchasing party.', 'buyer_identity_fica', 'buyer_identity_fica', array['buyer_onboarding', 'transaction'], 'required', array['buyer', 'agent', 'agency_admin', 'transferring_attorney', 'bond_originator'], array['buyer', 'agent'], true, null, 10, '{}'::jsonb),
  ('buyer_proof_of_address', 'Buyer Proof of Address', 'Recent proof of residential address for the buyer.', 'buyer_identity_fica', 'buyer_identity_fica', array['buyer_onboarding', 'transaction'], 'required', array['buyer', 'agent', 'agency_admin', 'transferring_attorney', 'bond_originator'], array['buyer', 'agent'], true, null, 20, '{}'::jsonb),
  ('buyer_marriage_certificate', 'Buyer Marriage Certificate', 'Marriage certificate where buyer marital status or regime requires it.', 'buyer_identity_fica', 'buyer_identity_fica', array['buyer_onboarding', 'transaction'], 'required', array['buyer', 'agent', 'agency_admin', 'transferring_attorney'], array['buyer', 'agent'], true, null, 30, '{}'::jsonb),
  ('buyer_anc', 'Buyer Antenuptial Contract', 'Antenuptial contract where buyer marital regime requires it.', 'buyer_identity_fica', 'buyer_identity_fica', array['buyer_onboarding', 'transaction'], 'required', array['buyer', 'agent', 'agency_admin', 'transferring_attorney'], array['buyer', 'agent'], true, null, 40, '{}'::jsonb),
  ('buyer_company_registration', 'Buyer Company Registration', 'Company registration documents for a company purchaser.', 'buyer_identity_fica', 'buyer_identity_fica', array['buyer_onboarding', 'transaction'], 'required', array['buyer', 'agent', 'agency_admin', 'transferring_attorney', 'bond_originator'], array['buyer', 'agent'], true, null, 50, '{}'::jsonb),
  ('buyer_trust_deed', 'Buyer Trust Deed', 'Trust deed for a trust purchaser.', 'buyer_identity_fica', 'buyer_identity_fica', array['buyer_onboarding', 'transaction'], 'required', array['buyer', 'agent', 'agency_admin', 'transferring_attorney', 'bond_originator'], array['buyer', 'agent'], true, null, 60, '{}'::jsonb),

  ('proof_of_funds', 'Proof of Funds', 'Proof that the buyer has available funds for the purchase or deposit.', 'buyer_finance', 'buyer_finance', array['buyer_onboarding', 'transaction'], 'blocker', array['buyer', 'agent', 'agency_admin', 'transferring_attorney'], array['buyer', 'agent'], true, null, 10, '{}'::jsonb),
  ('bond_preapproval', 'Bond Pre-approval', 'Bond pre-approval or affordability confirmation.', 'buyer_finance', 'buyer_finance', array['buyer_onboarding', 'transaction'], 'recommended', array['buyer', 'agent', 'agency_admin', 'bond_originator'], array['buyer', 'bond_originator', 'agent'], true, null, 20, '{}'::jsonb),
  ('bond_approval', 'Bond Approval', 'Final bond approval or bond grant confirmation.', 'buyer_finance', 'buyer_finance', array['transaction'], 'blocker', array['buyer', 'agent', 'agency_admin', 'bond_originator', 'transferring_attorney'], array['buyer', 'bond_originator', 'agent'], true, null, 30, '{}'::jsonb),
  ('grant_letter', 'Grant Letter', 'Bank grant letter confirming bond approval terms.', 'buyer_finance', 'buyer_finance', array['transaction'], 'required', array['buyer', 'agent', 'agency_admin', 'bond_originator', 'transferring_attorney'], array['bond_originator', 'buyer'], true, null, 40, '{}'::jsonb),
  ('bank_statements', 'Bank Statements', 'Buyer bank statements for finance or proof of funds review.', 'buyer_finance', 'buyer_finance', array['buyer_onboarding', 'transaction'], 'required', array['buyer', 'agent', 'agency_admin', 'bond_originator'], array['buyer'], true, null, 50, '{}'::jsonb),
  ('payslips', 'Payslips', 'Buyer payslips for bond application or affordability review.', 'buyer_finance', 'buyer_finance', array['buyer_onboarding', 'transaction'], 'required', array['buyer', 'agent', 'agency_admin', 'bond_originator'], array['buyer'], true, null, 60, '{}'::jsonb),

  ('bond_application_form', 'Bond Application Form', 'Completed bond application form.', 'bond_originator', 'bond_originator', array['transaction', 'bond_matter'], 'required', array['buyer', 'agent', 'agency_admin', 'bond_originator'], array['buyer', 'bond_originator'], true, null, 10, '{}'::jsonb),
  ('affordability_assessment', 'Affordability Assessment', 'Affordability assessment prepared for the bond application.', 'bond_originator', 'bond_originator', array['transaction', 'bond_matter'], 'required', array['agent', 'agency_admin', 'bond_originator'], array['bond_originator'], true, null, 20, '{}'::jsonb),
  ('bank_submission_confirmation', 'Bank Submission Confirmation', 'Confirmation that the bond application was submitted to a bank.', 'bond_originator', 'bond_originator', array['transaction', 'bond_matter'], 'required', array['agent', 'agency_admin', 'bond_originator'], array['bond_originator'], true, null, 30, '{}'::jsonb),
  ('bank_feedback', 'Bank Feedback', 'Feedback from bank review of a bond application.', 'bond_originator', 'bond_originator', array['transaction', 'bond_matter'], 'required', array['buyer', 'agent', 'agency_admin', 'bond_originator'], array['bond_originator'], true, null, 40, '{}'::jsonb),
  ('bond_instruction_to_attorneys', 'Bond Instruction to Attorneys', 'Instruction from the bond originator or bank to bond attorneys.', 'bond_originator', 'bond_originator', array['transaction', 'bond_matter'], 'blocker', array['agent', 'agency_admin', 'bond_originator', 'bond_attorney', 'transferring_attorney'], array['bond_originator', 'bond_attorney'], true, null, 50, '{}'::jsonb),

  ('generated_otp', 'Generated OTP', 'System-generated offer to purchase document.', 'attorney_generated_documents', 'attorney_generated_documents', array['transaction'], 'required', array['buyer', 'seller', 'agent', 'agency_admin', 'transferring_attorney'], array['agent', 'transferring_attorney'], false, null, 10, '{}'::jsonb),
  ('generated_mandate', 'Generated Mandate', 'System-generated mandate document.', 'attorney_generated_documents', 'attorney_generated_documents', array['private_listing', 'transaction'], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['agent'], false, null, 20, '{}'::jsonb),
  ('signed_addendum', 'Signed Addendum', 'Signed addendum to a mandate, OTP, or transfer document.', 'attorney_generated_documents', 'attorney_generated_documents', array['transaction', 'attorney_matter'], 'required', array['buyer', 'seller', 'agent', 'agency_admin', 'transferring_attorney'], array['buyer', 'seller', 'agent', 'transferring_attorney'], true, null, 30, '{}'::jsonb),
  ('signed_transfer_documents', 'Signed Transfer Documents', 'Signed transfer documents prepared by the transferring attorney.', 'attorney_generated_documents', 'attorney_generated_documents', array['transaction', 'attorney_matter'], 'blocker', array['buyer', 'seller', 'agent', 'agency_admin', 'transferring_attorney'], array['buyer', 'seller', 'transferring_attorney'], true, null, 40, '{}'::jsonb),
  ('signed_packet_version', 'Signed Packet Version', 'Final signed version of a generated document packet.', 'attorney_generated_documents', 'attorney_generated_documents', array['private_listing', 'transaction', 'attorney_matter'], 'required', array['buyer', 'seller', 'agent', 'agency_admin', 'transferring_attorney', 'bond_attorney', 'cancellation_attorney'], array['buyer', 'seller', 'agent', 'transferring_attorney'], false, null, 50, '{}'::jsonb)
on conflict (key) do update
set
  display_label = excluded.display_label,
  description = excluded.description,
  category = excluded.category,
  pack_key = excluded.pack_key,
  applies_to_context = excluded.applies_to_context,
  default_requirement_level = excluded.default_requirement_level,
  default_visibility = excluded.default_visibility,
  default_upload_roles = excluded.default_upload_roles,
  review_required = excluded.review_required,
  validity_period_days = excluded.validity_period_days,
  sort_order = excluded.sort_order,
  is_active = true,
  metadata_json = excluded.metadata_json;
insert into public.document_requirement_rules (
  id,
  document_definition_key,
  pack_key,
  context_type,
  condition_json,
  requirement_level,
  stage_gates,
  requested_from_role,
  visible_to_roles,
  uploadable_by_roles,
  reviewer_role,
  priority,
  resolver_key
)
values
  ('00000000-0000-4000-8000-000000000001'::uuid, 'seller_id_document', 'seller_identity_fica', 'seller_onboarding', '{"all":[{"fact":"seller.legal_type","operator":"exists"}]}'::jsonb, 'required', array['mandate_ready', 'listing_ready'], 'seller', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], 'agent', 10, 'canonical_document_rules_v1'),
  ('00000000-0000-4000-8000-000000000002'::uuid, 'seller_id_document', 'seller_identity_fica', 'private_listing', '{"all":[{"fact":"seller.legal_type","operator":"exists"}]}'::jsonb, 'required', array['mandate_ready', 'listing_ready'], 'seller', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], 'agent', 20, 'canonical_document_rules_v1'),
  ('00000000-0000-4000-8000-000000000003'::uuid, 'signed_mandate', 'seller_authority', 'private_listing', '{"all":[{"fact":"context.type","operator":"eq","value":"private_listing"}]}'::jsonb, 'blocker', array['mandate_ready', 'listing_ready', 'attorney_instruction_ready'], 'seller', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], 'agent', 30, 'canonical_document_rules_v1'),
  ('00000000-0000-4000-8000-000000000004'::uuid, 'title_deed_copy', 'property_ownership', 'private_listing', '{"all":[{"fact":"context.type","operator":"eq","value":"private_listing"}]}'::jsonb, 'required', array['listing_ready', 'attorney_instruction_ready'], 'seller', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent', 'transferring_attorney'], 'agent', 40, 'canonical_document_rules_v1'),
  ('00000000-0000-4000-8000-000000000005'::uuid, 'title_deed_copy', 'property_ownership', 'transaction', '{"all":[{"fact":"context.type","operator":"eq","value":"transaction"}]}'::jsonb, 'required', array['attorney_instruction_ready', 'lodgement_ready'], 'seller', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent', 'transferring_attorney'], 'transferring_attorney', 50, 'canonical_document_rules_v1'),
  ('00000000-0000-4000-8000-000000000006'::uuid, 'bond_statement', 'property_finance_existing_bond', 'private_listing', '{"all":[{"fact":"seller.existing_bond","operator":"eq","value":true}]}'::jsonb, 'required', array['listing_ready', 'attorney_instruction_ready'], 'seller', array['seller', 'agent', 'agency_admin', 'transferring_attorney', 'cancellation_attorney'], array['seller', 'agent'], 'agent', 60, 'canonical_document_rules_v1'),
  ('00000000-0000-4000-8000-000000000007'::uuid, 'levy_statement', 'sectional_title_body_corporate', 'private_listing', '{"all":[{"fact":"property.sectional_title","operator":"eq","value":true}]}'::jsonb, 'required', array['listing_ready', 'attorney_instruction_ready'], 'seller', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], 'agent', 70, 'canonical_document_rules_v1'),
  ('00000000-0000-4000-8000-000000000008'::uuid, 'hoa_levy_statement', 'estate_hoa', 'private_listing', '{"all":[{"fact":"property.hoa","operator":"eq","value":true}]}'::jsonb, 'required', array['listing_ready', 'attorney_instruction_ready'], 'seller', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], 'agent', 80, 'canonical_document_rules_v1'),
  ('00000000-0000-4000-8000-000000000009'::uuid, 'lease_agreement', 'tenant_occupancy', 'private_listing', '{"all":[{"fact":"occupancy.status","operator":"eq","value":"tenant_occupied"}]}'::jsonb, 'required', array['listing_ready', 'otp_ready', 'attorney_instruction_ready'], 'seller', array['seller', 'agent', 'agency_admin', 'buyer', 'transferring_attorney'], array['seller', 'agent'], 'agent', 90, 'canonical_document_rules_v1'),
  ('00000000-0000-4000-8000-000000000010'::uuid, 'electrical_compliance_certificate', 'property_compliance', 'transaction', '{"all":[{"fact":"context.type","operator":"eq","value":"transaction"}]}'::jsonb, 'blocker', array['lodgement_ready'], 'seller', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent', 'transferring_attorney'], 'transferring_attorney', 100, 'canonical_document_rules_v1'),
  ('00000000-0000-4000-8000-000000000011'::uuid, 'buyer_id_document', 'buyer_identity_fica', 'buyer_onboarding', '{"all":[{"fact":"buyer.legal_type","operator":"exists"}]}'::jsonb, 'required', array['otp_ready', 'attorney_instruction_ready'], 'buyer', array['buyer', 'agent', 'agency_admin', 'transferring_attorney'], array['buyer', 'agent'], 'agent', 110, 'canonical_document_rules_v1'),
  ('00000000-0000-4000-8000-000000000012'::uuid, 'buyer_id_document', 'buyer_identity_fica', 'transaction', '{"all":[{"fact":"buyer.legal_type","operator":"exists"}]}'::jsonb, 'required', array['otp_ready', 'attorney_instruction_ready'], 'buyer', array['buyer', 'agent', 'agency_admin', 'transferring_attorney'], array['buyer', 'agent'], 'agent', 120, 'canonical_document_rules_v1'),
  ('00000000-0000-4000-8000-000000000013'::uuid, 'proof_of_funds', 'buyer_finance', 'transaction', '{"all":[{"fact":"purchase.finance_type","operator":"in","value":["cash","hybrid"]}]}'::jsonb, 'blocker', array['otp_ready', 'finance_ready', 'attorney_instruction_ready'], 'buyer', array['buyer', 'agent', 'agency_admin', 'transferring_attorney'], array['buyer', 'agent'], 'agent', 130, 'canonical_document_rules_v1'),
  ('00000000-0000-4000-8000-000000000014'::uuid, 'bond_approval', 'buyer_finance', 'transaction', '{"all":[{"fact":"purchase.finance_type","operator":"in","value":["bond","hybrid"]}]}'::jsonb, 'blocker', array['finance_ready', 'attorney_instruction_ready'], 'buyer', array['buyer', 'agent', 'agency_admin', 'bond_originator', 'transferring_attorney'], array['buyer', 'bond_originator', 'agent'], 'bond_originator', 140, 'canonical_document_rules_v1')
on conflict (id) do update
set
  document_definition_key = excluded.document_definition_key,
  pack_key = excluded.pack_key,
  context_type = excluded.context_type,
  condition_json = excluded.condition_json,
  requirement_level = excluded.requirement_level,
  stage_gates = excluded.stage_gates,
  requested_from_role = excluded.requested_from_role,
  visible_to_roles = excluded.visible_to_roles,
  uploadable_by_roles = excluded.uploadable_by_roles,
  reviewer_role = excluded.reviewer_role,
  priority = excluded.priority,
  resolver_key = excluded.resolver_key,
  is_active = true;
notify pgrst, 'reload schema';
commit;
