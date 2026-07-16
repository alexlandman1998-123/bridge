begin;

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
  metadata_json,
  is_active
)
values (
  'alteration_approvals',
  'Alteration Approvals / Consents',
  'Municipal, body corporate, or other approvals and consents for alterations to the property where applicable.',
  'property_compliance',
  'property_compliance',
  array['private_listing', 'transaction'],
  'recommended',
  array['seller', 'agent', 'agency_admin', 'transferring_attorney'],
  array['seller', 'agent', 'transferring_attorney'],
  true,
  null,
  80,
  jsonb_build_object(
    'legacy_requirement_keys', jsonb_build_array('alteration_approvals'),
    'launch_mapping_version', 'canonical_document_phase1_launch_mappings_v1'
  ),
  true
)
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
  sort_order = excluded.sort_order,
  metadata_json = coalesce(public.document_definitions.metadata_json, '{}'::jsonb) || excluded.metadata_json,
  is_active = true;

update public.document_definitions
set metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
  'legacy_requirement_keys', jsonb_build_array('income_tax_number', 'seller_income_tax_number', 'seller_tax_certificate'),
  'launch_mapping_version', 'canonical_document_phase1_launch_mappings_v1'
)
where key = 'seller_tax_number';

notify pgrst, 'reload schema';

commit;
