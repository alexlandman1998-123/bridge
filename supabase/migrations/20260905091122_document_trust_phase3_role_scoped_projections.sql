begin;

-- Phase 3: the buyer portal receives a server-authorised projection, not a
-- direct read of operational canonical tables. The bearer token determines the
-- transaction; callers cannot choose a transaction or a role.
create or replace function public.bridge_client_portal_canonical_document_projection()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_token text := nullif(trim(coalesce(public.bridge_client_portal_request_token(), '')), '');
  v_link public.client_portal_links%rowtype;
  v_requirements jsonb := '[]'::jsonb;
  v_documents jsonb := '[]'::jsonb;
begin
  if v_token is null then
    raise exception 'A valid buyer portal token is required.' using errcode = '42501';
  end if;

  select link.*
  into v_link
  from public.client_portal_links link
  join public.transactions transaction_row on transaction_row.id = link.transaction_id
  where link.token = v_token
    and link.is_active is true
    and link.buyer_id is not null
    and transaction_row.development_id is not distinct from link.development_id
    and transaction_row.unit_id is not distinct from link.unit_id
    and transaction_row.buyer_id is not distinct from link.buyer_id
  order by link.updated_at desc nulls last, link.created_at desc nulls last
  limit 1;

  if not found then
    raise exception 'Buyer portal link is invalid or inactive.' using errcode = '42501';
  end if;

  with visible_requirements as (
    select requirement.*
    from public.document_requirement_instances requirement
    where requirement.transaction_id = v_link.transaction_id
      and requirement.status <> 'not_applicable'
      and (
        'buyer' = any(coalesce(requirement.visible_to_roles, '{}'::text[]))
        or (
          'client' = any(coalesce(requirement.visible_to_roles, '{}'::text[]))
          and lower(coalesce(requirement.requested_from_role, '')) in ('buyer', 'client', 'purchaser')
        )
      )
  ), projected as (
    select
      requirement.*,
      definition.key as definition_key,
      definition.display_label as definition_display_label,
      definition.description as definition_description,
      definition.pack_key as definition_pack_key,
      definition.default_requirement_level as definition_requirement_level,
      definition.default_visibility as definition_visibility,
      definition.default_upload_roles as definition_upload_roles,
      pack.key as pack_key_value,
      pack.display_label as pack_display_label,
      pack.description as pack_description,
      pack.sort_order as pack_sort_order,
      document.id as document_id,
      document.name as document_name,
      document.file_name as document_file_name,
      document.file_path as document_file_path,
      document.file_bucket as document_file_bucket,
      document.document_type as document_type,
      document.category as document_category,
      document.status as document_status,
      document.visibility_scope as document_visibility_scope,
      document.is_client_visible as document_is_client_visible,
      document.uploaded_at as document_uploaded_at
    from visible_requirements requirement
    join public.document_definitions definition on definition.key = requirement.document_definition_key
    join public.document_packs pack on pack.key = requirement.pack_key
    left join lateral (
      select document_row.*
      from public.documents document_row
      where document_row.transaction_id = v_link.transaction_id
        and (
          document_row.id = requirement.satisfied_by_document_id
          or document_row.canonical_requirement_instance_id = requirement.id
        )
        and coalesce(document_row.is_client_visible, false) is true
        and coalesce(lower(document_row.visibility_scope), 'shared') not in ('internal', 'private')
      order by (document_row.id = requirement.satisfied_by_document_id) desc,
        document_row.uploaded_at desc nulls last,
        document_row.created_at desc
      limit 1
    ) document on true
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', projected.id,
      'context_type', projected.context_type,
      'context_id', projected.context_id,
      'transaction_id', projected.transaction_id,
      'listing_id', projected.listing_id,
      'document_definition_key', projected.document_definition_key,
      'pack_key', projected.pack_key,
      'requirement_level', projected.requirement_level,
      'status', projected.status,
      'stage_gates', projected.stage_gates,
      'requested_from_role', projected.requested_from_role,
      'visible_to_roles', projected.visible_to_roles,
      'uploadable_by_roles', projected.uploadable_by_roles,
      'reviewer_role', projected.reviewer_role,
      'satisfied_by_document_id', projected.satisfied_by_document_id,
      'rejection_reason', projected.rejection_reason,
      'waiver_reason', projected.waiver_reason,
      'expiry_date', projected.expiry_date,
      'document_definitions', jsonb_build_object(
        'key', projected.definition_key,
        'display_label', projected.definition_display_label,
        'description', projected.definition_description,
        'pack_key', projected.definition_pack_key,
        'default_requirement_level', projected.definition_requirement_level,
        'default_visibility', projected.definition_visibility,
        'default_upload_roles', projected.definition_upload_roles
      ),
      'document_packs', jsonb_build_object(
        'key', projected.pack_key_value,
        'display_label', projected.pack_display_label,
        'description', projected.pack_description,
        'sort_order', projected.pack_sort_order
      )
    ) order by projected.pack_sort_order, projected.definition_display_label), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object(
      'id', projected.document_id,
      'name', projected.document_name,
      'file_name', projected.document_file_name,
      'file_path', projected.document_file_path,
      'file_bucket', projected.document_file_bucket,
      'document_type', projected.document_type,
      'category', projected.document_category,
      'status', projected.document_status,
      'visibility_scope', projected.document_visibility_scope,
      'is_client_visible', projected.document_is_client_visible,
      'uploaded_at', projected.document_uploaded_at,
      'canonical_requirement_instance_id', projected.id
    )) filter (where projected.document_id is not null), '[]'::jsonb)
  into v_requirements, v_documents
  from projected;

  return jsonb_build_object(
    'projectionVersion', 'phase3',
    'role', 'buyer',
    'transactionId', v_link.transaction_id,
    'requirements', coalesce(v_requirements, '[]'::jsonb),
    'documents', coalesce(v_documents, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.bridge_client_portal_canonical_document_projection() from public;
grant execute on function public.bridge_client_portal_canonical_document_projection() to anon, authenticated;

comment on function public.bridge_client_portal_canonical_document_projection() is
  'Phase 3 buyer-token-scoped canonical document projection. Returns only buyer-visible requirements and client-visible exact canonical document links.';

notify pgrst, 'reload schema';

commit;
