begin;

-- A request can exist before a portal invitation. When it names a transaction
-- requirement, keep its upload and review lifecycle on that exact instance.
create or replace function public.bridge_sync_linked_document_request_phase4()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_requirement public.document_requirement_instances%rowtype;
  v_document public.documents%rowtype;
  v_role text;
  v_review_required boolean;
  v_status text;
  v_uploaded_changed boolean;
begin
  if new.canonical_requirement_instance_id is null then
    return new;
  end if;

  select * into v_requirement
  from public.document_requirement_instances
  where id = new.canonical_requirement_instance_id
  for update;
  if not found or v_requirement.context_type <> 'transaction'
     or v_requirement.transaction_id is distinct from new.transaction_id then
    raise exception 'Document request and requirement must belong to the same transaction.' using errcode = '42501';
  end if;

  v_role := lower(coalesce(nullif(new.requested_from, ''), new.assigned_to_role, ''));
  if v_requirement.requested_from_role is not null
     and not (
       v_role = lower(v_requirement.requested_from_role)
       or (v_role = 'developer' and lower(v_requirement.requested_from_role) = 'seller')
       or (v_role = 'attorney' and lower(v_requirement.requested_from_role) = 'transferring_attorney')
     ) then
    raise exception 'Document request audience does not match its requirement.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' and new.status = 'requested'
     and v_requirement.status in ('uploaded', 'under_review', 'approved', 'completed', 'waived', 'not_applicable') then
    raise exception 'This transaction requirement is already satisfied or under review.' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' then
    v_uploaded_changed := new.requested_document_id is not null;
  else
    v_uploaded_changed := new.requested_document_id is not null
      and (new.requested_document_id is distinct from old.requested_document_id
        or new.canonical_requirement_instance_id is distinct from old.canonical_requirement_instance_id);
  end if;
  if v_uploaded_changed then
    select * into v_document from public.documents where id = new.requested_document_id;
    if not found or v_document.transaction_id is distinct from new.transaction_id
       or (v_document.canonical_requirement_instance_id is not null
           and v_document.canonical_requirement_instance_id <> new.canonical_requirement_instance_id) then
      raise exception 'Uploaded document does not match its transaction requirement.' using errcode = '42501';
    end if;

    update public.documents
    set canonical_requirement_instance_id = new.canonical_requirement_instance_id
    where id = v_document.id and canonical_requirement_instance_id is null;

    if v_requirement.satisfied_by_document_id is distinct from v_document.id then
      select coalesce(review_required, false) into v_review_required
      from public.document_definitions where key = v_requirement.document_definition_key;
      v_status := case
        when v_review_required or coalesce(new.requires_review, true) then 'under_review'
        else 'completed'
      end;
      update public.document_requirement_instances
      set status = v_status, satisfied_by_document_id = v_document.id,
          rejection_reason = null, source_system = 'linked_document_request_upload', updated_at = now()
      where id = v_requirement.id;
      update public.transaction_required_documents
      set is_uploaded = true, uploaded_document_id = v_document.id,
          status = case when v_status = 'completed' then 'approved' else 'under_review' end,
          uploaded_at = now(), updated_at = now()
      where canonical_requirement_instance_id = v_requirement.id;
      insert into public.document_requirement_events
        (requirement_instance_id, event_type, actor_role, actor_user_id, message, metadata_json)
      values
        (v_requirement.id, 'uploaded', nullif(v_role, ''), auth.uid(),
         'Linked document request upload satisfied the transaction requirement.',
         jsonb_build_object('request_id', new.id, 'document_id', v_document.id, 'source', 'linked_document_request_upload'));
    end if;
  elsif new.status = 'requested' and v_requirement.status in ('pending', 'rejected', 'expired') then
    update public.document_requirement_instances
    set status = 'requested', rejection_reason = null, updated_at = now()
    where id = v_requirement.id;
    update public.transaction_required_documents
    set status = 'requested', updated_at = now()
    where canonical_requirement_instance_id = v_requirement.id
      and status in ('missing', 'rejected', 'reupload_required');
    insert into public.document_requirement_events
      (requirement_instance_id, event_type, actor_role, actor_user_id, message, metadata_json)
    values
      (v_requirement.id, 'requested', nullif(v_role, ''), auth.uid(),
       'Transaction document requested through a linked workspace request.',
       jsonb_build_object('request_id', new.id, 'source', 'linked_document_request'));
  end if;
  return new;
end;
$function$;

revoke all on function public.bridge_sync_linked_document_request_phase4() from public, anon, authenticated;
drop trigger if exists trg_bridge_sync_linked_document_request_phase4 on public.document_requests;
create trigger trg_bridge_sync_linked_document_request_phase4
after insert or update of canonical_requirement_instance_id, requested_document_id, status
on public.document_requests
for each row execute function public.bridge_sync_linked_document_request_phase4();

create or replace function public.bridge_guard_linked_request_review_phase4()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_canonical_status text;
begin
  if new.canonical_requirement_instance_id is null or new.status is not distinct from old.status
     or new.status not in ('completed', 'rejected')
     or new.requested_document_id is distinct from old.requested_document_id then
    return new;
  end if;
  select status into v_canonical_status
  from public.document_requirement_instances
  where id = new.canonical_requirement_instance_id and transaction_id = new.transaction_id;
  if (new.status = 'completed' and v_canonical_status not in ('approved', 'completed', 'waived'))
     or (new.status = 'rejected' and v_canonical_status <> 'rejected') then
    raise exception 'Review the linked canonical requirement instead of changing only the request.' using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke all on function public.bridge_guard_linked_request_review_phase4() from public, anon, authenticated;
drop trigger if exists trg_bridge_guard_linked_request_review_phase4 on public.document_requests;
create trigger trg_bridge_guard_linked_request_review_phase4
before update of status on public.document_requests
for each row execute function public.bridge_guard_linked_request_review_phase4();

-- Every role-specific view of a linked request follows the canonical review.
create or replace function public.bridge_project_requirement_to_request_phase4()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_request_status text;
begin
  if new.context_type <> 'transaction' or new.transaction_id is null
     or (new.status is not distinct from old.status
         and new.satisfied_by_document_id is not distinct from old.satisfied_by_document_id) then
    return new;
  end if;
  v_request_status := case
    when new.status in ('approved', 'completed', 'waived') then 'completed'
    when new.status = 'rejected' then 'rejected'
    when new.status in ('uploaded', 'under_review') then 'uploaded'
    when new.status in ('pending', 'requested', 'expired') then 'requested'
    else null
  end;
  if v_request_status is not null then
    update public.document_requests
    set status = v_request_status,
        requested_document_id = coalesce(new.satisfied_by_document_id, requested_document_id),
        completed_at = case when v_request_status = 'completed' then now() else null end,
        rejected_reason = case when v_request_status = 'rejected' then new.rejection_reason else null end,
        updated_at = now()
    where canonical_requirement_instance_id = new.id
      and transaction_id = new.transaction_id
      and status <> 'cancelled'
      and (status is distinct from v_request_status
        or (new.satisfied_by_document_id is not null and requested_document_id is distinct from new.satisfied_by_document_id));
  end if;
  return new;
end;
$function$;

revoke all on function public.bridge_project_requirement_to_request_phase4() from public, anon, authenticated;
drop trigger if exists trg_bridge_project_requirement_to_request_phase4 on public.document_requirement_instances;
create trigger trg_bridge_project_requirement_to_request_phase4
after update of status, satisfied_by_document_id on public.document_requirement_instances
for each row execute function public.bridge_project_requirement_to_request_phase4();

-- Guard existing browser RPCs: a replacement is not automatically approved,
-- and generic legacy keys such as id_document may not update the other party.
do $block$
declare
  v_definition text;
  v_old text := 'canonical_requirement_instance_id = p_requirement_instance_id
      or document_key = any(v_legacy_document_keys)';
begin
  select pg_get_functiondef('public.bridge_link_document_to_canonical_requirement(uuid,uuid,text,uuid,jsonb)'::regprocedure)
  into v_definition;
  if position(v_old in v_definition) = 0
     or position('if v_previous_status in (''approved'', ''completed'', ''waived'', ''not_applicable'') then' in v_definition) = 0 then
    raise exception 'Unexpected canonical upload RPC body; review before applying phase 4.';
  end if;
  v_definition := replace(v_definition, v_old, 'canonical_requirement_instance_id = p_requirement_instance_id');
  v_definition := replace(v_definition,
    'if v_previous_status in (''approved'', ''completed'', ''waived'', ''not_applicable'') then',
    'if v_previous_status in (''waived'', ''not_applicable'') or (v_previous_status in (''approved'', ''completed'') and v_requirement.satisfied_by_document_id = p_document_id) then');
  execute v_definition;

  select pg_get_functiondef('public.bridge_review_canonical_requirement_pre_attorney_scope(uuid,uuid,text,text,text,uuid)'::regprocedure)
  into v_definition;
  if position(v_old in v_definition) = 0 then
    raise exception 'Unexpected canonical review RPC body; review before applying phase 4.';
  end if;
  execute replace(v_definition, v_old, 'canonical_requirement_instance_id = p_requirement_instance_id');

  select pg_get_functiondef('public.bridge_satisfy_new_transaction_seller_request_p0_6()'::regprocedure)
  into v_definition;
  if position('and document.source = ''seller_portal''' in v_definition) = 0
     or position('or public.bridge_normalize_seller_document_key_p0_4(document.document_type) = v_key' in v_definition) = 0
     or position('or public.bridge_normalize_seller_document_key_p0_4(document.category) = v_key' in v_definition) = 0 then
    raise exception 'Unexpected seller request matching function; review before applying phase 4.';
  end if;
  v_definition := replace(v_definition,
    'and document.source = ''seller_portal''',
    'and document.source = ''seller_portal''
    and lower(coalesce(new.requested_from, new.assigned_to_role, '''')) in (''seller'', ''developer'', ''buyer_and_seller'')');
  v_definition := replace(v_definition,
    'or public.bridge_normalize_seller_document_key_p0_4(document.document_type) = v_key',
    'or (new.canonical_requirement_instance_id is null and public.bridge_normalize_seller_document_key_p0_4(document.document_type) = v_key)');
  v_definition := replace(v_definition,
    'or public.bridge_normalize_seller_document_key_p0_4(document.category) = v_key',
    'or (new.canonical_requirement_instance_id is null and public.bridge_normalize_seller_document_key_p0_4(document.category) = v_key)');
  execute v_definition;
end;
$block$;

commit;
