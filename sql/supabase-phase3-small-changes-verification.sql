select jsonb_pretty(jsonb_build_object(
  'profile_columns', (
    select coalesce(jsonb_agg(column_name order by column_name), '[]'::jsonb)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = any(array['bio','department','office','language','theme'])
  ),
  'development_seller_details', exists(
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'development_profiles'
      and column_name = 'seller_details'
  ),
  'attorney_branding_policies', (
    select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = any(array[
        'attorney_firm_branding_owner_select',
        'attorney_firm_branding_owner_insert',
        'attorney_firm_branding_owner_update',
        'attorney_firm_branding_owner_delete'
      ])
  ),
  'mandate_agency_placeholders_remaining', (
    select count(*)
    from public.document_template_sections section
    join public.document_packet_templates template on template.id = section.template_id
    where template.packet_type = 'mandate'
      and (
        'agency_name' = any(section.placeholder_keys)
        or section.legal_text like '%{{agency_name}}%'
        or section.metadata_json @> '{"required_placeholders":["agency_name"]}'::jsonb
      )
  ),
  'client_invite_indexes', (
    select count(*) from pg_indexes
    where schemaname = 'public'
      and indexname = any(array[
        'invites_pending_client_transaction_role_email_idx',
        'invites_pending_seller_listing_email_idx'
      ])
  ),
  'signer_role_constraints', (
    select count(*) from pg_constraint
    where conname = any(array[
      'document_packet_signers_signer_role_check',
      'document_signing_fields_signer_role_check'
    ])
  ),
  'bond_grant_columns', (
    select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'transaction_bond_instructions'
      and column_name = any(array[
        'grant_received','grant_received_at','grant_received_by','grant_document_id',
        'grant_signed','grant_signed_at','grant_signed_by','signed_grant_document_id',
        'grant_submitted','grant_submitted_at','grant_submitted_by'
      ])
  ),
  'bond_grant_indexes', (
    select count(*) from pg_indexes
    where schemaname = 'public'
      and indexname = any(array[
        'transaction_bond_instructions_grant_received_idx',
        'transaction_bond_instructions_grant_submitted_idx'
      ])
  ),
  'bond_constraints_with_grant_stage', (
    select count(*) from pg_constraint
    where conname = any(array[
      'transaction_finance_workflows_stage_check',
      'transaction_finance_workflow_events_to_stage_check',
      'transaction_finance_workflow_events_from_stage_check',
      'transaction_finance_workflow_events_type_check'
    ])
      and pg_get_constraintdef(oid, true) like '%grant_received%'
  )
)) as verification;
