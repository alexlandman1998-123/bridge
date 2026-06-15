begin;
alter table if exists public.transaction_required_documents
  drop constraint if exists transaction_required_documents_status_check;
alter table if exists public.transaction_required_documents
  add constraint transaction_required_documents_status_check check (
    status in (
      'missing',
      'requested',
      'uploaded',
      'under_review',
      'accepted',
      'approved',
      'rejected',
      'reupload_required',
      'waived',
      'completed',
      'not_required'
    )
  );
create or replace function public.bridge_review_canonical_requirement(
  p_requirement_instance_id uuid,
  p_document_id uuid default null,
  p_action text default 'approve',
  p_reason text default null,
  p_actor_role text default null,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_requirement public.document_requirement_instances%rowtype;
  v_definition public.document_definitions%rowtype;
  v_transaction public.transactions%rowtype;
  v_actor_role text := lower(trim(coalesce(p_actor_role, '')));
  v_profile_role text;
  v_action text := lower(trim(coalesce(p_action, 'approve')));
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_document_id uuid;
  v_previous_status text;
  v_next_status text;
  v_review_status text;
  v_event_type text;
  v_review_id uuid;
  v_event_id uuid;
  v_has_transaction_access boolean := false;
  v_can_review boolean := false;
  v_can_waive boolean := false;
  v_legacy_document_keys text[];
begin
  if v_auth_user_id is null then
    raise exception 'Authentication is required to review a canonical requirement.'
      using errcode = '28000';
  end if;

  if p_actor_user_id is not null and p_actor_user_id <> v_auth_user_id then
    raise exception 'Actor user does not match the authenticated user.'
      using errcode = '42501';
  end if;

  if v_actor_role = 'attorney' then
    v_actor_role := 'transferring_attorney';
  elsif v_actor_role = 'client' then
    v_actor_role := 'buyer';
  end if;

  if v_action not in ('approve', 'reject', 'waive') then
    raise exception 'Unsupported canonical review action: %', p_action
      using errcode = '22023';
  end if;

  if v_action in ('reject', 'waive') and v_reason is null then
    raise exception 'A reason is required for this canonical review action.'
      using errcode = '23502';
  end if;

  select *
    into v_requirement
  from public.document_requirement_instances
  where id = p_requirement_instance_id;

  if not found then
    raise exception 'Canonical requirement % was not found.', p_requirement_instance_id
      using errcode = 'P0002';
  end if;

  select *
    into v_definition
  from public.document_definitions
  where key = v_requirement.document_definition_key;

  select *
    into v_transaction
  from public.transactions
  where id = v_requirement.transaction_id;

  if v_requirement.transaction_id is not null and not found then
    raise exception 'Canonical requirement transaction was not found.'
      using errcode = 'P0002';
  end if;

  select role
    into v_profile_role
  from public.profiles
  where id = v_auth_user_id;

  v_profile_role := lower(trim(coalesce(v_profile_role, '')));
  v_can_review :=
    coalesce(v_profile_role, '') in ('agent', 'agency_admin', 'developer', 'attorney', 'transferring_attorney', 'bond_attorney', 'cancellation_attorney', 'bond_originator', 'admin', 'internal_admin')
    or v_actor_role in ('agent', 'agency_admin', 'developer', 'transferring_attorney', 'bond_attorney', 'cancellation_attorney', 'bond_originator', 'admin', 'internal_admin')
    or lower(coalesce(v_requirement.reviewer_role, '')) = v_actor_role;

  v_can_waive :=
    coalesce(v_profile_role, '') in ('agent', 'agency_admin', 'developer', 'attorney', 'transferring_attorney', 'admin', 'internal_admin')
    or v_actor_role in ('agent', 'agency_admin', 'developer', 'transferring_attorney', 'admin', 'internal_admin');

  if v_action = 'waive' and not v_can_waive then
    raise exception 'Authenticated user cannot waive this canonical requirement.'
      using errcode = '42501';
  elsif v_action <> 'waive' and not v_can_review then
    raise exception 'Authenticated user cannot review this canonical requirement.'
      using errcode = '42501';
  end if;

  v_has_transaction_access := v_requirement.transaction_id is null;
  if not v_has_transaction_access then
    v_has_transaction_access :=
      public.bridge_is_org_admin(v_transaction.organisation_id)
      or v_transaction.owner_user_id = v_auth_user_id
      or exists (
        select 1
        from public.transaction_attorney_assignments taa
        where taa.transaction_id = v_requirement.transaction_id
          and coalesce(taa.status, taa.assignment_status, '') = 'active'
          and (
            taa.primary_attorney_id = v_auth_user_id
            or taa.attorney_user_id = v_auth_user_id
            or taa.secretary_id = v_auth_user_id
            or taa.admin_handler_id = v_auth_user_id
            or exists (
              select 1
              from public.attorney_firm_members afm
              where afm.firm_id = coalesce(taa.firm_id, taa.attorney_firm_id)
                and afm.user_id = v_auth_user_id
                and coalesce(afm.status, '') = 'active'
            )
          )
      )
      or exists (
        select 1
        from public.transaction_participants tp
        where tp.transaction_id = v_requirement.transaction_id
          and tp.user_id = v_auth_user_id
          and coalesce(tp.status, 'active') = 'active'
          and coalesce(tp.can_view, true) is true
      );
  end if;

  if not v_has_transaction_access then
    raise exception 'Authenticated user cannot access this transaction.'
      using errcode = '42501';
  end if;

  v_document_id := coalesce(p_document_id, v_requirement.satisfied_by_document_id);
  if v_action in ('approve', 'reject') and v_document_id is null then
    raise exception 'A linked document is required for this review action.'
      using errcode = '23502';
  end if;

  if v_document_id is not null and not exists (
    select 1
    from public.documents d
    where d.id = v_document_id
      and (
        v_requirement.transaction_id is null
        or d.transaction_id = v_requirement.transaction_id
      )
      and (
        d.canonical_requirement_instance_id is null
        or d.canonical_requirement_instance_id = p_requirement_instance_id
      )
  ) then
    raise exception 'Linked document does not match this canonical requirement.'
      using errcode = '42501';
  end if;

  v_previous_status := coalesce(v_requirement.status, 'pending');
  v_next_status := case
    when v_action = 'approve' then 'approved'
    when v_action = 'reject' then 'rejected'
    when v_action = 'waive' then 'waived'
    else v_previous_status
  end;
  v_review_status := case
    when v_action = 'approve' then 'approved'
    when v_action = 'reject' then 'needs_reupload'
    else null
  end;
  v_event_type := case
    when v_action = 'approve' then 'approved'
    when v_action = 'reject' then 'needs_reupload'
    when v_action = 'waive' then 'waived'
    else 'status_changed'
  end;

  v_legacy_document_keys := array_remove(array[
    v_requirement.document_definition_key,
    case v_requirement.document_definition_key
      when 'signed_otp' then 'otp'
      when 'generated_otp' then 'generated_otp'
      when 'grant_letter' then 'grant_signed'
      when 'seller_id_document' then 'id_document'
      when 'buyer_id_document' then 'id_document'
      when 'seller_proof_of_address' then 'proof_of_address'
      when 'buyer_proof_of_address' then 'proof_of_address'
      when 'signed_transfer_documents' then 'signed_transfer_pack'
      when 'settlement_figure' then 'settlement_figures'
      else null
    end
  ], null);

  if v_review_status is not null then
    insert into public.document_requirement_reviews (
      requirement_instance_id,
      document_id,
      review_status,
      reviewer_role,
      reviewer_user_id,
      review_notes,
      rejection_reason,
      reviewed_at
    )
    values (
      p_requirement_instance_id,
      v_document_id,
      v_review_status,
      nullif(v_actor_role, ''),
      v_auth_user_id,
      case when v_action = 'approve' then v_reason else null end,
      case when v_action = 'reject' then v_reason else null end,
      now()
    )
    returning id into v_review_id;
  end if;

  update public.document_requirement_instances
  set status = v_next_status,
      rejection_reason = case when v_action = 'reject' then v_reason else null end,
      waiver_reason = case when v_action = 'waive' then v_reason else waiver_reason end,
      satisfied_by_document_id = case when v_document_id is not null then v_document_id else satisfied_by_document_id end,
      source_system = 'internal_browser_review',
      updated_at = now()
  where id = p_requirement_instance_id
  returning * into v_requirement;

  if v_document_id is not null then
    update public.documents
    set status = v_next_status,
        review_status = case when v_action = 'reject' then 'rejected' else v_next_status end,
        canonical_requirement_instance_id = coalesce(canonical_requirement_instance_id, p_requirement_instance_id)
    where id = v_document_id;
  end if;

  update public.transaction_required_documents
  set is_uploaded = case when v_action = 'waive' then false else true end,
      uploaded_document_id = case when v_document_id is not null then v_document_id else uploaded_document_id end,
      canonical_requirement_instance_id = coalesce(canonical_requirement_instance_id, p_requirement_instance_id),
      status = case
        when v_action = 'approve' then 'approved'
        when v_action = 'reject' then 'rejected'
        when v_action = 'waive' then 'waived'
        else status
      end,
      verified_at = case when v_action = 'approve' then now() else verified_at end,
      rejected_at = case when v_action = 'reject' then now() else null end,
      notes = case
        when v_action in ('reject', 'waive') then v_reason
        when v_action = 'approve' then null
        else notes
      end,
      updated_at = now()
  where transaction_id = v_requirement.transaction_id
    and (
      canonical_requirement_instance_id = p_requirement_instance_id
      or document_key = any(v_legacy_document_keys)
    );

  insert into public.document_requirement_events (
    requirement_instance_id,
    event_type,
    actor_role,
    actor_user_id,
    message,
    metadata_json
  )
  values (
    p_requirement_instance_id,
    v_event_type,
    nullif(v_actor_role, ''),
    v_auth_user_id,
    case
      when v_action = 'approve' then 'Browser review approved canonical requirement.'
      when v_action = 'reject' then 'Browser review rejected canonical requirement and requested re-upload.'
      when v_action = 'waive' then 'Browser review waived canonical requirement.'
      else 'Browser review updated canonical requirement.'
    end,
    jsonb_build_object(
      'source', 'internal_browser_review',
      'document_id', v_document_id,
      'review_id', v_review_id,
      'previous_status', v_previous_status,
      'new_status', v_next_status,
      'review_action', v_action,
      'reason', v_reason,
      'document_definition_key', v_requirement.document_definition_key,
      'review_required', coalesce(v_definition.review_required, false)
    )
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'requirementInstanceId', p_requirement_instance_id,
    'documentId', v_document_id,
    'previousStatus', v_previous_status,
    'newStatus', v_next_status,
    'reviewStatus', v_review_status,
    'reviewId', v_review_id,
    'eventId', v_event_id
  );
end;
$$;
revoke all on function public.bridge_review_canonical_requirement(uuid, uuid, text, text, text, uuid) from public;
revoke all on function public.bridge_review_canonical_requirement(uuid, uuid, text, text, text, uuid) from anon;
grant execute on function public.bridge_review_canonical_requirement(uuid, uuid, text, text, text, uuid) to authenticated;
grant execute on function public.bridge_review_canonical_requirement(uuid, uuid, text, text, text, uuid) to service_role;
comment on function public.bridge_review_canonical_requirement(uuid, uuid, text, text, text, uuid) is
  'Scoped browser review helper for canonical document approve/reject/waive lifecycle actions without granting broad canonical table writes.';
notify pgrst, 'reload schema';
commit;
