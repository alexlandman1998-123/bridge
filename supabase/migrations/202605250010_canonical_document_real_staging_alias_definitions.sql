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
  metadata_json
)
values
  (
    'information_sheet',
    'Information Sheet',
    'Structured buyer or transaction information sheet used by the internal and transfer workflow.',
    'attorney_transfer_readiness',
    'attorney_transfer_readiness',
    array['buyer_onboarding', 'transaction'],
    'required',
    array['buyer', 'agent', 'agency_admin', 'transferring_attorney'],
    array['buyer', 'agent'],
    true,
    null,
    5,
    '{"legacy_keys":["information_sheet"]}'::jsonb
  ),
  (
    'proof_of_income',
    'Proof of Income',
    'Income proof used for buyer finance, bond application, and affordability assessment.',
    'buyer_finance',
    'buyer_finance',
    array['buyer_onboarding', 'transaction'],
    'required',
    array['buyer', 'agent', 'agency_admin', 'bond_originator', 'transferring_attorney'],
    array['buyer', 'bond_originator'],
    true,
    null,
    55,
    '{"legacy_keys":["proof_of_income"]}'::jsonb
  ),
  (
    'reservation_deposit_proof',
    'Reservation Deposit Proof',
    'Proof of payment for a reservation, security, or holding deposit where applicable.',
    'buyer_finance',
    'buyer_finance',
    array['buyer_onboarding', 'transaction'],
    'required',
    array['buyer', 'agent', 'agency_admin', 'transferring_attorney'],
    array['buyer', 'agent'],
    true,
    null,
    15,
    '{"legacy_keys":["reservation_deposit_proof","reservation_deposit_pop"]}'::jsonb
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
  validity_period_days = excluded.validity_period_days,
  sort_order = excluded.sort_order,
  is_active = true,
  metadata_json = excluded.metadata_json;

notify pgrst, 'reload schema';

commit;
