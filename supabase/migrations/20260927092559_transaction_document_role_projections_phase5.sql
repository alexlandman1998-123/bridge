begin;

-- One transaction register, projected by the caller's verified identity. The
-- browser never selects the protected canonical tables or chooses its role.
create or replace function public.bridge_transaction_document_projection(
  p_transaction_id uuid,
  p_seller_token text default null,
  p_seller_session text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_profile_role text;
  v_is_admin boolean := false;
  v_attorney_team boolean := false;
  v_actor jsonb;
  v_requirements jsonb;
  v_documents jsonb;
begin
  if p_transaction_id is null then
    raise exception 'A transaction is required.' using errcode = '22023';
  end if;

  if nullif(btrim(p_seller_token), '') is not null then
    -- This helper verifies the seller session and resolves its listing back to
    -- this exact transaction. A seller lead without a transaction stays in the
    -- listing document experience and never gets a synthetic matter register.
    v_actor := journey_private.conversation_actor(p_transaction_id, p_seller_token, p_seller_session);
    if v_actor->>'role' <> 'seller' then
      raise exception 'Seller matter access is required.' using errcode = '42501';
    end if;
    v_role := 'seller';
  else
    if nullif(public.bridge_client_portal_request_token(), '') is not null
      or auth.uid() is null
      or not coalesce(journey_private.can_read_professional_journey(p_transaction_id), false) then
      raise exception 'Professional matter access is required.' using errcode = '42501';
    end if;

    select lower(coalesce(p.role, '')) into v_profile_role
    from public.profiles p where p.id = auth.uid();
    select exists (
      select 1 from public.transaction_attorney_assignments assignment
      where assignment.transaction_id = p_transaction_id
        and coalesce(assignment.status, 'active') <> 'removed'
        and (
          public.bridge_attorney_matter_team_access(
            p_transaction_id, coalesce(assignment.attorney_firm_id, assignment.firm_id), 'view'
          )
          or auth.uid() in (
            assignment.assigned_user_id, assignment.attorney_user_id,
            assignment.primary_attorney_id, assignment.secretary_id, assignment.admin_handler_id
          )
        )
    ) into v_attorney_team;
    v_role := case
      when v_profile_role in ('attorney', 'conveyancer', 'legal_secretary', 'secretary',
        'admin_staff', 'candidate_attorney', 'conveyancing_secretary') and v_attorney_team
        then 'transfer_attorney'
      when v_profile_role in ('agent', 'agency_admin') then 'agent'
      when v_profile_role in ('developer') then 'developer'
      when v_profile_role in ('bond_originator') then 'bond_originator'
      when v_profile_role in ('internal_admin', 'admin', 'platform_admin')
        and public.bridge_transaction_scope_is_internal_user() then 'internal_admin'
      else null
    end;
    if v_role is null then
      raise exception 'Professional document access is required.' using errcode = '42501';
    end if;
    v_is_admin := v_role = 'internal_admin';
  end if;

  with visible_requirements as (
    select r.*
    from public.document_requirement_instances r
    where r.transaction_id = p_transaction_id
      and r.status <> 'not_applicable'
      and (
        v_is_admin
        or exists (
          select 1 from unnest(coalesce(r.visible_to_roles, '{}'::text[])) audience(role)
          where lower(audience.role) = v_role
            or (v_role = 'transfer_attorney' and lower(audience.role) in (
              'attorney', 'transferring_attorney', 'conveyancer', 'conveyancing_secretary',
              'bond_attorney', 'cancellation_attorney'))
            or (v_role = 'agent' and lower(audience.role) in ('agency', 'agency_admin'))
            or (v_role = 'seller' and lower(audience.role) in ('vendor', 'selling_client'))
            or (v_role = 'seller' and lower(audience.role) = 'client'
              and lower(coalesce(r.requested_from_role, '')) in ('seller', 'vendor', 'selling_client'))
        )
      )
  ), projected as (
    select r.*,
      d.display_label as definition_label, d.description as definition_description,
      d.default_requirement_level, d.default_visibility, d.default_upload_roles,
      p.display_label as pack_label, p.description as pack_description, p.sort_order as pack_sort_order,
      doc.id as document_id, doc.name as document_name, doc.file_name as document_file_name,
      doc.file_path as document_file_path, doc.file_bucket as document_file_bucket,
      doc.document_type as document_type, doc.category as document_category,
      doc.status as document_status, doc.review_status as document_review_status,
      doc.visibility_scope as document_visibility_scope,
      doc.is_client_visible as document_is_client_visible, doc.uploaded_at as document_uploaded_at
    from visible_requirements r
    join public.document_definitions d on d.key = r.document_definition_key
    join public.document_packs p on p.key = r.pack_key
    left join lateral (
      select file.* from public.documents file
      where file.transaction_id = p_transaction_id
        and (file.id = r.satisfied_by_document_id or file.canonical_requirement_instance_id = r.id)
        and (case when v_role = 'seller' then
          coalesce(file.is_client_visible, false)
          and lower(coalesce(file.visibility_scope, '')) in ('shared', 'client', 'client_visible')
          and lower(coalesce(file.client_recipient_role, '')) not in ('buyer')
        else document_security.can_read(file) end)
      order by (file.id = r.satisfied_by_document_id) desc,
        file.uploaded_at desc nulls last, file.created_at desc
      limit 1
    ) doc on true
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', q.id, 'context_type', q.context_type, 'context_id', q.context_id,
      'transaction_id', q.transaction_id, 'document_definition_key', q.document_definition_key,
      'pack_key', q.pack_key, 'requirement_level', q.requirement_level,
      'status', q.status, 'stage_gates', q.stage_gates,
      'requested_from_role', q.requested_from_role,
      'visible_to_roles', q.visible_to_roles, 'uploadable_by_roles', q.uploadable_by_roles,
      'satisfied_by_document_id', q.satisfied_by_document_id,
      'rejection_reason', q.rejection_reason, 'expiry_date', q.expiry_date,
      'document_definitions', jsonb_build_object(
        'key', q.document_definition_key, 'display_label', q.definition_label,
        'description', q.definition_description, 'pack_key', q.pack_key,
        'default_requirement_level', q.default_requirement_level,
        'default_visibility', q.default_visibility, 'default_upload_roles', q.default_upload_roles),
      'document_packs', jsonb_build_object(
        'key', q.pack_key, 'display_label', q.pack_label,
        'description', q.pack_description, 'sort_order', q.pack_sort_order)
    ) order by q.pack_sort_order, q.definition_label), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object(
      'id', q.document_id, 'name', q.document_name, 'file_name', q.document_file_name,
      'file_path', q.document_file_path, 'file_bucket', q.document_file_bucket,
      'document_type', q.document_type, 'category', q.document_category,
      'status', q.document_status, 'review_status', q.document_review_status,
      'visibility_scope', q.document_visibility_scope,
      'is_client_visible', q.document_is_client_visible,
      'uploaded_at', q.document_uploaded_at,
      'canonical_requirement_instance_id', q.id
    )) filter (where q.document_id is not null), '[]'::jsonb)
  into v_requirements, v_documents
  from projected q;

  return jsonb_build_object(
    'projectionVersion', 'phase5', 'role', v_role,
    'transactionId', p_transaction_id,
    'requirements', coalesce(v_requirements, '[]'::jsonb),
    'documents', coalesce(v_documents, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.bridge_transaction_document_projection(uuid, text, text) from public, anon, authenticated;
grant execute on function public.bridge_transaction_document_projection(uuid, text, text) to anon, authenticated;

comment on function public.bridge_transaction_document_projection(uuid, text, text) is
  'Phase 5 transaction document register projection. Professional identity or verified seller session determines visibility; never a caller-supplied role.';

notify pgrst, 'reload schema';
commit;
