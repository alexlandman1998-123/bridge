-- The information sheet was retired from the product, but legacy requirement
-- projections continued to expose it in buyer/developer/agent workspaces.
-- Preserve any historical uploads while making the requirement non-actionable.
update public.document_definitions
set is_active = false,
    metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
      'retired_at', '2026-08-31T00:00:00Z',
      'retired_reason', 'Removed from the buyer document journey'
    ),
    updated_at = now()
where key = 'information_sheet'
  and is_active is distinct from false;

update public.document_requirement_instances
set requirement_level = 'not_applicable',
    status = case
      when satisfied_by_document_id is not null then 'completed'
      else 'not_applicable'
    end,
    updated_at = now()
where document_definition_key = 'information_sheet'
  and (
    requirement_level is distinct from 'not_applicable'
    or status not in ('completed', 'not_applicable')
  );

update public.transaction_required_documents
set enabled = false,
    is_required = false,
    status = case
      when uploaded_document_id is not null or is_uploaded is true then 'completed'
      else 'not_required'
    end,
    updated_at = now()
where document_key = 'information_sheet'
  and (
    enabled is distinct from false
    or is_required is distinct from false
    or status not in ('completed', 'not_required')
  );
