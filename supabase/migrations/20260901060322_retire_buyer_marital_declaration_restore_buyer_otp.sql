-- Buyer marital status is structured onboarding data, not an uploadable document.
update public.document_definitions
set is_active = false,
    updated_at = now(),
    metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
      'retired_at', now(),
      'retired_reason', 'structured_onboarding_field_not_document'
    )
where key = 'buyer_marital_status_details'
  and is_active is distinct from false;

update public.document_requirement_instances
set status = 'not_applicable',
    updated_at = now(),
    source_system = 'buyer_document_policy_20260901'
where document_definition_key = 'buyer_marital_status_details'
  and status not in ('not_applicable', 'cancelled');

update public.transaction_required_documents
set is_required = false,
    enabled = false,
    status = 'not_required',
    notes = concat_ws(
      E'\n',
      nullif(notes, ''),
      'Retired 2026-09-01: marital status is captured as structured onboarding data, not as a document upload.'
    ),
    updated_at = now()
where lower(coalesce(document_key, '')) in ('buyer_marital_status_details', 'marital_status_details')
  and lower(coalesce(status, '')) in ('', 'missing', 'required', 'requested', 'pending');

-- A signed OTP can be supplied by the buyer or by the transaction team on the
-- buyer's behalf. Keep one canonical requirement and expose that requirement to
-- the buyer portal instead of creating a second client-specific OTP row.
update public.document_definitions
set default_visibility = array(
      select distinct role_name
      from unnest(coalesce(default_visibility, '{}'::text[]) || array['buyer']) as role_name
    ),
    default_upload_roles = array(
      select distinct role_name
      from unnest(coalesce(default_upload_roles, '{}'::text[]) || array['buyer', 'agent']) as role_name
    ),
    updated_at = now(),
    metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
      'buyer_portal_upload_enabled', true,
      'buyer_portal_upload_enabled_at', now()
    )
where key = 'signed_otp';

update public.document_requirement_instances
set requested_from_role = 'buyer',
    visible_to_roles = array(
      select distinct role_name
      from unnest(coalesce(visible_to_roles, '{}'::text[]) || array['buyer']) as role_name
    ),
    uploadable_by_roles = array(
      select distinct role_name
      from unnest(coalesce(uploadable_by_roles, '{}'::text[]) || array['buyer', 'agent']) as role_name
    ),
    updated_at = now()
where document_definition_key = 'signed_otp'
  and status not in ('not_applicable', 'cancelled');
