begin;

-- Attorney document actions finish their essential writes before acknowledging
-- success. Storage is uploaded first; no browser-owned follow-up is required.
alter table public.documents add column if not exists notes text;
alter table public.documents add column if not exists attorney_persistence_version integer not null default 0;

create schema if not exists journey_private;
create table journey_private.attorney_document_receipts (
  actor_id uuid not null,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  command_id uuid not null,
  action text not null check (action in ('request', 'review')),
  fingerprint text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, transaction_id, command_id)
);
alter table journey_private.attorney_document_receipts enable row level security;
revoke all on journey_private.attorney_document_receipts from public, anon, authenticated;

create function journey_private.assert_attorney_document_access(p_transaction_id uuid, p_lane text default null)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
       select 1 from unnest(array['transfer_attorney', 'bond_attorney', 'cancellation_attorney']) lane
       where (p_lane is null or lane = p_lane)
         and public.bridge_can_mutate_attorney_lane(p_transaction_id, lane, 'documents')
     ) then
    raise exception 'You do not have permission to manage documents for this attorney matter.' using errcode = '42501';
  end if;
  -- All three actions lock a matter in the same order before touching a request
  -- or requirement; a review cannot race a replacement in another attorney lane.
  perform pg_advisory_xact_lock(hashtextextended('attorney-documents:' || p_transaction_id::text, 0));
end;
$$;
revoke all on function journey_private.assert_attorney_document_access(uuid, text) from public, anon, authenticated;

create function public.bridge_save_attorney_document(p_document jsonb, p_document_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_transaction uuid := (p_document->>'transaction_id')::uuid;
  v_lane text := p_document->>'lane_key';
  v_role text := case v_lane when 'transfer' then 'transfer_attorney' when 'bond' then 'bond_attorney'
    when 'cancellation' then 'cancellation_attorney' end;
  v_key text := nullif(p_document->>'upload_idempotency_key', '');
  v_requirement uuid := nullif(p_document->>'canonical_requirement_instance_id', '')::uuid;
  v_request public.document_requests%rowtype;
  v_document public.documents%rowtype;
  v_duplicate boolean := false;
  v_profile public.profiles%rowtype;
  v_canonical_status text;
begin
  if v_role is null or v_key is null then
    raise exception 'An attorney lane and upload retry key are required.' using errcode = '22023';
  end if;
  perform journey_private.assert_attorney_document_access(v_transaction, v_role);
  select * into v_profile from public.profiles where id = auth.uid();
  -- Serialize retries, including a response lost after the first commit.
  perform pg_advisory_xact_lock(hashtextextended(v_transaction::text || ':' || v_key, 0));
  if p_document_request_id is not null then
    select * into v_request from public.document_requests where id = p_document_request_id for update;
    if not found or v_request.transaction_id is distinct from v_transaction or v_request.status = 'cancelled' then
      raise exception 'The document request is not active in this matter.' using errcode = '42501';
    end if;
    if v_request.canonical_requirement_instance_id is not null then
      if v_requirement is not null and v_requirement <> v_request.canonical_requirement_instance_id then
        raise exception 'The document does not match its requested requirement.' using errcode = '22023';
      end if;
      v_requirement := v_request.canonical_requirement_instance_id;
    end if;
  end if;
  if v_requirement is not null then
    perform 1 from public.document_requirement_instances
      where id = v_requirement and transaction_id = v_transaction and context_type = 'transaction' for update;
    if not found then
      raise exception 'The document requirement belongs to a different matter.' using errcode = '42501';
    end if;
  end if;
  if nullif(p_document->>'related_entity_id', '') is not null then
    if p_document->>'related_entity_type' is distinct from 'transaction_participant' or not exists (
      select 1 from public.transaction_participants where id = (p_document->>'related_entity_id')::uuid
        and transaction_id = v_transaction
    ) then
      raise exception 'The document participant belongs to a different matter.' using errcode = '42501';
    end if;
  end if;

  select * into v_document from public.documents
    where transaction_id = v_transaction and upload_idempotency_key = v_key for update;
  v_duplicate := found;
  if v_duplicate then
    if v_document.uploaded_by_user_id is distinct from auth.uid()
       or v_document.lane_key is distinct from v_lane
       or v_document.canonical_requirement_instance_id is distinct from v_requirement then
      raise exception 'The upload retry key belongs to a different document action.' using errcode = '22023';
    end if;
    if v_document.attorney_persistence_version = 1 then
      return jsonb_build_object('document', to_jsonb(v_document), 'deduplicated', true);
    end if;
  else
    if p_document->>'file_path' not like 'transaction-' || v_transaction::text || '/%'
       or not exists (
         select 1 from storage.objects object join storage.buckets bucket on bucket.id = object.bucket_id
         where object.name = p_document->>'file_path' and object.bucket_id = p_document->>'file_bucket'
           and not bucket.public
           and coalesce(to_jsonb(object)->>'owner_id', to_jsonb(object)->>'owner') = auth.uid()::text
       ) then
      raise exception 'A saved private storage file owned by this user is required.' using errcode = '42501';
    end if;
    insert into public.documents (
      transaction_id, name, file_path, category, document_type, visibility_scope, client_recipient_role,
      uploaded_by_user_id, uploaded_by_role, uploaded_by_email, stage_key, is_client_visible,
      uploaded_by_party, bucket_key, source, file_bucket, finance_lane, related_entity_type,
      related_entity_id, lane_key, attorney_role, canonical_requirement_instance_id, upload_idempotency_key, notes
    ) values (
      v_transaction, p_document->>'name', p_document->>'file_path', p_document->>'category',
      p_document->>'document_type', p_document->>'visibility_scope', p_document->>'client_recipient_role',
      auth.uid(), v_profile.role, v_profile.email, p_document->>'stage_key',
      coalesce((p_document->>'is_client_visible')::boolean, false), p_document->>'uploaded_by_party',
      p_document->>'bucket_key', 'attorney_workspace', p_document->>'file_bucket', p_document->>'finance_lane',
      p_document->>'related_entity_type', nullif(p_document->>'related_entity_id', '')::uuid,
      v_lane, v_role, v_requirement, v_key, nullif(p_document->>'notes', '')
    ) returning * into v_document;
  end if;

  if v_requirement is not null then
    perform public.bridge_link_document_to_canonical_requirement(v_document.id, v_requirement,
      case v_role when 'transfer_attorney' then 'transferring_attorney' else v_role end, auth.uid(),
      jsonb_build_object('source', 'attorney_document_save', 'laneKey', v_lane));
  end if;
  if p_document_request_id is not null then
    if v_requirement is not null then
      select status into v_canonical_status from public.document_requirement_instances where id = v_requirement;
    end if;
    -- The existing linked-request trigger also projects canonical review state.
    update public.document_requests set requested_document_id = v_document.id,
      status = case when v_requirement is not null then
        case when v_canonical_status in ('approved', 'completed', 'waived') then 'completed' else 'uploaded' end
        when coalesce(requires_review, true) then 'uploaded' else 'completed' end,
      rejected_reason = null,
      completed_at = case when v_requirement is not null then
        case when v_canonical_status in ('approved', 'completed', 'waived') then now() else null end
        when coalesce(requires_review, true) then null else now() end, updated_at = now()
    where id = p_document_request_id;
  end if;
  insert into public.transaction_events(transaction_id, event_type, created_by, created_by_role, visibility_scope, event_data)
    values (v_transaction, 'DocumentUploaded', auth.uid(), v_profile.role, 'internal',
      jsonb_build_object('source', 'attorney_document_save', 'documentId', v_document.id,
        'documentName', v_document.name, 'requestId', p_document_request_id, 'laneKey', v_lane,
        'canonicalRequirementInstanceId', v_requirement, 'visibilityScope', v_document.visibility_scope));
  update public.documents set attorney_persistence_version = 1 where id = v_document.id returning * into v_document;
  return jsonb_build_object('document', to_jsonb(v_document), 'deduplicated', v_duplicate);
end;
$$;
revoke all on function public.bridge_save_attorney_document(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.bridge_save_attorney_document(jsonb, uuid) to authenticated;

create function public.bridge_request_attorney_documents(
  p_transaction_id uuid, p_requests jsonb, p_command_id uuid,
  p_group_title text default null, p_group_description text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_fingerprint text := md5(jsonb_build_array(p_requests, p_group_title, p_group_description)::text);
  v_receipt journey_private.attorney_document_receipts%rowtype;
  v_group uuid;
  v_input jsonb;
  v_request public.document_requests%rowtype;
  v_result jsonb := '[]'::jsonb;
  v_profile_role text;
begin
  perform journey_private.assert_attorney_document_access(p_transaction_id);
  if p_command_id is null or p_requests is null or jsonb_typeof(p_requests) <> 'array'
     or jsonb_array_length(p_requests) not between 1 and 50 then
    raise exception 'A retry key and between 1 and 50 document requests are required.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_transaction_id::text || ':' || p_command_id::text, 0));
  select * into v_receipt from journey_private.attorney_document_receipts
    where actor_id = auth.uid() and transaction_id = p_transaction_id and command_id = p_command_id;
  if found then
    if v_receipt.action <> 'request' or v_receipt.fingerprint <> v_fingerprint then
      raise exception 'The retry key belongs to a different document action.' using errcode = '22023';
    end if;
    return v_receipt.result;
  end if;
  select role into v_profile_role from public.profiles where id = auth.uid();
  if jsonb_array_length(p_requests) > 1 or p_group_title is not null then
    insert into public.document_request_groups(transaction_id, title, description, created_by, created_by_role)
      values (p_transaction_id, coalesce(p_group_title, 'Document Request Pack'), p_group_description, auth.uid(), v_profile_role)
      returning id into v_group;
  end if;
  for v_input in select value from jsonb_array_elements(p_requests) loop
    if nullif(trim(v_input->>'title'), '') is null then
      raise exception 'A document request title is required.' using errcode = '22023';
    end if;
    if nullif(v_input->>'canonical_requirement_instance_id', '') is not null and not exists (
      select 1 from public.document_requirement_instances where id = (v_input->>'canonical_requirement_instance_id')::uuid
        and transaction_id = p_transaction_id and context_type = 'transaction'
    ) then
      raise exception 'The requested requirement belongs to a different matter.' using errcode = '42501';
    end if;
    insert into public.document_requests (
      transaction_id, request_type, category, document_type, title, description, notes, priority, due_date,
      requested_from, assigned_to_role, visibility_scope, assigned_to_user_id, request_group_id,
      canonical_requirement_instance_id, status, requires_review, created_by, created_by_role
    ) values (
      p_transaction_id, v_input->>'request_type', v_input->>'category', v_input->>'document_type',
      v_input->>'title', v_input->>'description', v_input->>'notes', v_input->>'priority',
      nullif(v_input->>'due_date', '')::date, v_input->>'requested_from', v_input->>'assigned_to_role',
      v_input->>'visibility_scope', nullif(v_input->>'assigned_to_user_id', '')::uuid, v_group,
      nullif(v_input->>'canonical_requirement_instance_id', '')::uuid, 'requested',
      coalesce((v_input->>'requires_review')::boolean, true), auth.uid(), v_profile_role
    ) returning * into v_request;
    v_result := v_result || jsonb_build_array(to_jsonb(v_request));
  end loop;
  insert into public.transaction_events(transaction_id, event_type, created_by, created_by_role, visibility_scope, event_data)
    values (p_transaction_id, 'TransactionUpdated', auth.uid(), v_profile_role, 'internal',
      jsonb_build_object('source', 'additional_document_requested', 'count', jsonb_array_length(v_result),
        'requestGroupId', v_group, 'requestIds', (select jsonb_agg(value->>'id') from jsonb_array_elements(v_result))));
  insert into journey_private.attorney_document_receipts(actor_id, transaction_id, command_id, action, fingerprint, result)
    values (auth.uid(), p_transaction_id, p_command_id, 'request', v_fingerprint, v_result);
  return v_result;
end;
$$;
revoke all on function public.bridge_request_attorney_documents(uuid, jsonb, uuid, text, text) from public, anon, authenticated;
grant execute on function public.bridge_request_attorney_documents(uuid, jsonb, uuid, text, text) to authenticated;

create function public.bridge_review_attorney_document(
  p_requirement_instance_id uuid, p_document_id uuid, p_action text, p_reason text,
  p_actor_role text, p_command_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_requirement public.document_requirement_instances%rowtype;
  v_receipt journey_private.attorney_document_receipts%rowtype;
  v_fingerprint text := md5(jsonb_build_array(p_requirement_instance_id, p_document_id, p_action, p_reason, p_actor_role)::text);
  v_result jsonb;
begin
  select * into v_requirement from public.document_requirement_instances where id = p_requirement_instance_id;
  perform journey_private.assert_attorney_document_access(v_requirement.transaction_id);
  if p_command_id is null then raise exception 'A document review retry key is required.' using errcode = '22023'; end if;
  if p_action in ('approve', 'reject') and p_document_id is null then
    raise exception 'Choose the uploaded document before reviewing it.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || v_requirement.transaction_id::text || ':' || p_command_id::text, 0));
  select * into v_receipt from journey_private.attorney_document_receipts
    where actor_id = auth.uid() and transaction_id = v_requirement.transaction_id and command_id = p_command_id;
  if found then
    if v_receipt.action <> 'review' or v_receipt.fingerprint <> v_fingerprint then
      raise exception 'The retry key belongs to a different document action.' using errcode = '22023';
    end if;
    return v_receipt.result;
  end if;
  select * into v_requirement from public.document_requirement_instances where id = p_requirement_instance_id for update;
  if p_document_id is not null and p_document_id is distinct from v_requirement.satisfied_by_document_id then
    raise exception 'This document has been replaced. Refresh the matter before reviewing it.' using errcode = '22023';
  end if;
  -- Preserve the existing reviewer, lane, waiver and authenticated-actor checks.
  v_result := public.bridge_review_canonical_requirement(p_requirement_instance_id, p_document_id,
    p_action, p_reason, p_actor_role, auth.uid());
  insert into public.transaction_events(transaction_id, event_type, created_by, created_by_role, visibility_scope, event_data)
    values (v_requirement.transaction_id, 'TransactionUpdated', auth.uid(), p_actor_role, 'internal',
      jsonb_build_object('source', 'canonical_document_review', 'documentId', p_document_id,
        'requirementInstanceId', p_requirement_instance_id, 'reviewAction', p_action));
  insert into journey_private.attorney_document_receipts(actor_id, transaction_id, command_id, action, fingerprint, result)
    values (auth.uid(), v_requirement.transaction_id, p_command_id, 'review', v_fingerprint, v_result);
  return v_result;
end;
$$;
revoke all on function public.bridge_review_attorney_document(uuid, uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.bridge_review_attorney_document(uuid, uuid, text, text, text, uuid) to authenticated;

-- Every document mutation invalidates the same matter snapshot used by the
-- existing realtime/poll/reconnect readers, including changes from other roles.
create function journey_private.emit_document_refresh()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_transaction uuid;
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
    return null;
  end if;
  v_transaction := case when tg_op = 'DELETE' then old.transaction_id else new.transaction_id end;
  if v_transaction is not null and exists(select 1 from public.transactions where id = v_transaction) then
    insert into public.transaction_refresh_signals(transaction_id, version, command_receipt_id, canonical_event_id, changed_at)
      values (v_transaction, 1, null, null, now()) on conflict(transaction_id) do update
      set version = public.transaction_refresh_signals.version + 1, command_receipt_id = null,
          canonical_event_id = null, changed_at = excluded.changed_at;
  end if;
  return null;
end;
$$;
revoke all on function journey_private.emit_document_refresh() from public, anon, authenticated;
create trigger attorney_document_refresh after insert or update or delete on public.documents
  for each row execute function journey_private.emit_document_refresh();
create trigger attorney_document_request_refresh after insert or update or delete on public.document_requests
  for each row execute function journey_private.emit_document_refresh();
create trigger attorney_document_requirement_refresh after insert or update or delete on public.document_requirement_instances
  for each row execute function journey_private.emit_document_refresh();

notify pgrst, 'reload schema';
commit;
