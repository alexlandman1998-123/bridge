begin;

-- Use the existing Storage audience policy's professional-only scope for
-- requested files. Ordinary shared files retain their established meaning.
alter table public.documents drop constraint if exists documents_visibility_scope_check;
alter table public.documents add constraint documents_visibility_scope_check check (
  visibility_scope in ('internal', 'internal_only', 'admin_only', 'shared', 'client',
    'client_visible', 'professional_shared', 'shared_role_players')
);

-- Additional requests have their own review lifecycle. A checklist-linked
-- request still uses the existing canonical reviewer and requirement guards.
create function public.bridge_review_attorney_document_request(
  p_request_id uuid, p_document_id uuid, p_action text, p_reason text, p_command_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_request public.document_requests%rowtype;
  v_document public.documents%rowtype;
  v_requirement public.document_requirement_instances%rowtype;
  v_receipt journey_private.attorney_document_receipts%rowtype;
  v_profile_role text;
  v_lane_role text;
  v_actor_role text;
  v_fingerprint text := md5(jsonb_build_array('request_review', p_request_id, p_document_id, p_action, p_reason)::text);
  v_result jsonb;
begin
  select * into v_request from public.document_requests where id = p_request_id;
  perform journey_private.assert_attorney_document_access(v_request.transaction_id);
  select role into v_profile_role from public.profiles where id = auth.uid();
  if coalesce(v_profile_role, '') not in ('attorney', 'conveyancer') or not exists (
    select 1 from public.transaction_attorney_assignments assignment
    join public.attorney_firm_members member
      on member.firm_id = coalesce(assignment.attorney_firm_id, assignment.firm_id)
      and member.user_id = auth.uid() and member.status = 'active'
    where assignment.transaction_id = v_request.transaction_id
      and coalesce(assignment.assignment_status, assignment.status) = 'active'
      and coalesce(assignment.can_manage_documents, true)
      and coalesce(member.professional_role, member.role) in (
        'firm_admin', 'director_partner', 'attorney_conveyancer',
        'transfer_attorney', 'bond_attorney', 'cancellation_attorney'
      )
  ) then
    raise exception 'Document review requires an authorised attorney in the assigned firm.' using errcode = '42501';
  end if;
  if p_command_id is null or p_document_id is null or p_action is null or p_action not in ('approve', 'reject') then
    raise exception 'Choose an uploaded document and an approval or correction action.' using errcode = '22023';
  end if;
  if p_action = 'reject' and nullif(trim(p_reason), '') is null then
    raise exception 'Explain the correction required before returning the document.' using errcode = '22023';
  end if;
  select * into v_document from public.documents where id = p_document_id;
  v_lane_role := case v_document.lane_key when 'bond' then 'bond_attorney'
    when 'cancellation' then 'cancellation_attorney' when 'transfer' then 'transfer_attorney' end;
  if v_request.canonical_requirement_instance_id is not null then
    select * into v_requirement from public.document_requirement_instances where id = v_request.canonical_requirement_instance_id;
    v_lane_role := case v_requirement.reviewer_role when 'bond_attorney' then 'bond_attorney'
      when 'cancellation_attorney' then 'cancellation_attorney' when 'transferring_attorney' then 'transfer_attorney'
      else v_lane_role end;
  end if;
  perform journey_private.assert_attorney_document_access(v_request.transaction_id, v_lane_role);
  select * into v_receipt from journey_private.attorney_document_receipts
    where actor_id = auth.uid() and transaction_id = v_request.transaction_id and command_id = p_command_id;
  if found then
    if v_receipt.action <> 'review' or v_receipt.fingerprint <> v_fingerprint then
      raise exception 'The retry key belongs to a different document action.' using errcode = '22023';
    end if;
    return v_receipt.result;
  end if;
  select * into v_request from public.document_requests where id = p_request_id for update;
  if v_request.canonical_requirement_instance_id is not null then
    select * into v_requirement from public.document_requirement_instances
      where id = v_request.canonical_requirement_instance_id for update;
  end if;
  select * into v_document from public.documents where id = p_document_id for update;
  if not found or v_document.transaction_id is distinct from v_request.transaction_id
    or v_request.requested_document_id is distinct from p_document_id
    or v_request.status in ('requested', 'cancelled') then
    raise exception 'This file is no longer the received document for this request. Refresh the matter.' using errcode = '22023';
  end if;
  if v_document.canonical_requirement_instance_id is distinct from v_request.canonical_requirement_instance_id then
    raise exception 'The received file does not match this request requirement.' using errcode = '42501';
  end if;
  if p_action = 'approve' and v_request.status not in ('uploaded', 'under_review') then
    raise exception 'Receive the corrected document before approving this request.' using errcode = '22023';
  end if;
  if v_request.canonical_requirement_instance_id is not null then
    if v_requirement.satisfied_by_document_id is distinct from p_document_id then
      raise exception 'This document has been replaced. Refresh the matter before reviewing it.' using errcode = '22023';
    end if;
  end if;
  v_actor_role := case v_lane_role when 'bond_attorney' then 'bond_attorney'
    when 'cancellation_attorney' then 'cancellation_attorney' else 'transferring_attorney' end;
  if v_request.canonical_requirement_instance_id is not null then
    perform public.bridge_review_canonical_requirement(v_request.canonical_requirement_instance_id,
      p_document_id, p_action, p_reason, v_actor_role, auth.uid());
  else
    -- Approving an additional file does not create or satisfy a legal checklist
    -- requirement. Only its exact request is completed.
    update public.document_requests set
      status = case when p_action = 'approve' then 'completed' else 'rejected' end,
      rejected_reason = case when p_action = 'reject' then trim(p_reason) else null end,
      completed_at = case when p_action = 'approve' then now() else null end,
      updated_at = now()
    where id = p_request_id;
    update public.documents set review_status = case when p_action = 'approve' then 'approved' else 'rejected' end
      where id = p_document_id;
  end if;
  select * into v_request from public.document_requests where id = p_request_id;
  insert into public.transaction_events(transaction_id, event_type, created_by, created_by_role, visibility_scope, event_data)
    values (v_request.transaction_id, 'TransactionUpdated', auth.uid(), v_actor_role, 'internal',
      jsonb_build_object('source', 'attorney_document_request_review', 'requestId', p_request_id,
        'documentId', p_document_id, 'reviewAction', p_action, 'reviewNote', nullif(trim(p_reason), ''),
        'canonicalRequirementInstanceId', v_request.canonical_requirement_instance_id));
  v_result := jsonb_build_object('ok', true, 'request', to_jsonb(v_request));
  insert into journey_private.attorney_document_receipts(actor_id, transaction_id, command_id, action, fingerprint, result)
    values (auth.uid(), v_request.transaction_id, p_command_id, 'review', v_fingerprint, v_result);
  return v_result;
end;
$$;
revoke all on function public.bridge_review_attorney_document_request(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.bridge_review_attorney_document_request(uuid, uuid, text, text, uuid) to authenticated;

create function journey_private.prevent_duplicate_attorney_requirement_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.canonical_requirement_instance_id is null or new.status <> 'requested' then return new; end if;
  -- The requirement lock also serializes concurrent inserts from other roles.
  perform 1 from public.document_requirement_instances where id = new.canonical_requirement_instance_id for update;
  if exists (
    select 1 from public.document_requests where transaction_id = new.transaction_id
      and canonical_requirement_instance_id = new.canonical_requirement_instance_id
      and status in ('requested', 'uploaded', 'under_review', 'rejected')
  ) then
    raise exception 'This requirement already has an open document request. Use the existing request.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function journey_private.prevent_duplicate_attorney_requirement_request() from public, anon, authenticated;
create trigger attorney_requirement_request_duplicate_guard before insert on public.document_requests
  for each row execute function journey_private.prevent_duplicate_attorney_requirement_request();

notify pgrst, 'reload schema';
commit;
