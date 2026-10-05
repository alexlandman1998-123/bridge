begin;

-- External Word/firm drafting uses ordinary private files, never legal packets.
alter table public.documents
  add column attorney_version_root_id uuid references public.documents(id) on delete restrict,
  add column attorney_version_previous_id uuid references public.documents(id) on delete restrict,
  add column attorney_version_number integer,
  add column attorney_version_kind text,
  add column attorney_version_document_type text,
  add column attorney_target_requirement_id uuid references public.document_requirement_instances(id) on delete restrict,
  add column attorney_target_request_id uuid references public.document_requests(id) on delete restrict,
  add constraint documents_attorney_version_shape check (
    (attorney_version_root_id is null and attorney_version_previous_id is null and attorney_version_number is null
      and attorney_version_kind is null and attorney_version_document_type is null
      and attorney_target_requirement_id is null and attorney_target_request_id is null)
    or (attorney_version_root_id is not null and attorney_version_number is not null and attorney_version_number > 0
      and attorney_version_kind is not null and attorney_version_kind in ('draft', 'final', 'signed', 'evidence')
      and (attorney_version_number = 1 or attorney_version_previous_id is not null))
  ),
  add constraint documents_attorney_working_copy check (
    attorney_version_kind not in ('draft', 'final') or (
      visibility_scope is not distinct from 'internal' and is_client_visible is false
      and canonical_requirement_instance_id is null and document_type is not distinct from 'attorney_working_copy'
    )
  );
create unique index documents_attorney_version_idx on public.documents(attorney_version_root_id, attorney_version_number)
  where attorney_version_root_id is not null;
create index documents_attorney_previous_version_idx on public.documents(attorney_version_previous_id)
  where attorney_version_previous_id is not null;
create index documents_attorney_target_requirement_idx on public.documents(attorney_target_requirement_id)
  where attorney_target_requirement_id is not null;
create index documents_attorney_target_request_idx on public.documents(attorney_target_request_id)
  where attorney_target_request_id is not null;

create function journey_private.protect_attorney_document_version()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.attorney_version_root_id is not null then
      raise exception 'Document versions must be retained. Upload a new version instead.' using errcode = '22023';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.attorney_version_root_id is not null and current_user in ('anon', 'authenticated') then
      raise exception 'Use the attorney version save action.' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.attorney_version_root_id is not null and
    (to_jsonb(new) - array['status','review_status','updated_at','uploaded_at'])
      is distinct from (to_jsonb(old) - array['status','review_status','updated_at','uploaded_at']) then
    raise exception 'Saved document versions cannot be overwritten. Upload a new version instead.' using errcode = '22023';
  end if;
  if old.attorney_version_root_id is null and new.attorney_version_root_id is not null
     and current_user in ('anon', 'authenticated') then
    raise exception 'Use the attorney version save action.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function journey_private.protect_attorney_document_version() from public, anon, authenticated;
create trigger trg_protect_attorney_document_version before insert or update or delete on public.documents
for each row execute function journey_private.protect_attorney_document_version();

create function journey_private.prevent_working_copy_request_evidence()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.requested_document_id is not null and exists (
    select 1 from public.documents where id = new.requested_document_id and attorney_version_kind in ('draft','final')
  ) then
    raise exception 'A working copy cannot fulfil a document request. Upload the signed or received evidence.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function journey_private.prevent_working_copy_request_evidence() from public, anon, authenticated;
create trigger trg_prevent_working_copy_request_evidence before insert or update of requested_document_id on public.document_requests
for each row execute function journey_private.prevent_working_copy_request_evidence();

create function journey_private.prevent_working_copy_requirement_evidence()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.satisfied_by_document_id is not null and exists (
    select 1 from public.documents where id = new.satisfied_by_document_id and attorney_version_kind in ('draft','final')
  ) then
    raise exception 'A working copy cannot supply checklist evidence. Upload the signed or received evidence.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function journey_private.prevent_working_copy_requirement_evidence() from public, anon, authenticated;
create trigger trg_prevent_working_copy_requirement_evidence before insert or update of satisfied_by_document_id on public.document_requirement_instances
for each row execute function journey_private.prevent_working_copy_requirement_evidence();

create function public.bridge_save_attorney_document_version(p_document jsonb, p_document_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_transaction uuid := (p_document->>'transaction_id')::uuid;
  v_lane text := p_document->>'lane_key';
  v_role text := case v_lane when 'transfer' then 'transfer_attorney' when 'bond' then 'bond_attorney'
    when 'cancellation' then 'cancellation_attorney' end;
  v_kind text := p_document->>'attorney_version_kind';
  v_previous_id uuid := nullif(p_document->>'attorney_version_previous_id','')::uuid;
  v_requirement uuid := nullif(p_document->>'canonical_requirement_instance_id','')::uuid;
  v_request uuid := p_document_request_id;
  v_type text := nullif(trim(p_document->>'document_type'),'');
  v_root uuid;
  v_number integer := 1;
  v_previous public.documents%rowtype;
  v_existing public.documents%rowtype;
  v_request_row public.document_requests%rowtype;
  v_result jsonb;
  v_id uuid;
  v_payload jsonb := p_document;
begin
  if v_role is null or v_kind is null or v_kind not in ('draft','final','signed','evidence') then
    raise exception 'Select an attorney lane and document version type.' using errcode = '22023';
  end if;
  perform journey_private.assert_attorney_document_access(v_transaction, v_role);
  if nullif(p_document->>'upload_idempotency_key','') is null or v_type is null then
    raise exception 'A document type and upload retry key are required.' using errcode = '22023';
  end if;
  if v_request is not null then
    select * into v_request_row from public.document_requests where id = v_request for update;
    if not found or v_request_row.transaction_id is distinct from v_transaction or v_request_row.status = 'cancelled' then
      raise exception 'The document request is not active in this matter.' using errcode = '42501';
    end if;
    if v_request_row.canonical_requirement_instance_id is not null then
      if v_requirement is not null and v_requirement <> v_request_row.canonical_requirement_instance_id then
        raise exception 'The document does not match its requested requirement.' using errcode = '22023';
      end if;
      v_requirement := v_request_row.canonical_requirement_instance_id;
    end if;
  end if;
  if v_requirement is not null then
    perform 1 from public.document_requirement_instances
      where id = v_requirement and transaction_id = v_transaction and context_type = 'transaction' for update;
    if not found then
      raise exception 'The document requirement belongs to a different matter.' using errcode = '42501';
    end if;
  end if;
  -- Recover a committed retry before rejecting its now superseded predecessor.
  select * into v_existing from public.documents
    where transaction_id = v_transaction and upload_idempotency_key = p_document->>'upload_idempotency_key' for update;
  if found then
    if v_existing.uploaded_by_user_id is distinct from auth.uid()
       or v_existing.lane_key is distinct from v_lane or v_existing.attorney_version_kind is distinct from v_kind
       or v_existing.attorney_version_previous_id is distinct from v_previous_id
       or v_existing.attorney_target_requirement_id is distinct from v_requirement
       or v_existing.attorney_target_request_id is distinct from v_request then
      raise exception 'The retry key belongs to a different document version.' using errcode = '22023';
    end if;
    return jsonb_build_object('document', to_jsonb(v_existing), 'deduplicated', true);
  end if;
  if v_previous_id is not null then
    select * into v_previous from public.documents where id = v_previous_id for update;
    if not found or v_previous.transaction_id is distinct from v_transaction
       or (v_previous.lane_key is not null and v_previous.lane_key <> v_lane)
       or v_previous.stage_key = 'final_signed' or v_previous.source = 'generated' then
      raise exception 'The previous version is not available in this attorney lane.' using errcode = '42501';
    end if;
    if coalesce(v_previous.attorney_target_requirement_id, v_previous.canonical_requirement_instance_id) is distinct from v_requirement
       or (v_previous.attorney_version_root_id is not null and v_previous.attorney_target_request_id is distinct from v_request)
       or (v_previous.attorney_version_root_id is not null and v_previous.attorney_version_document_type is distinct from v_type)
       or v_previous.related_entity_type is distinct from nullif(p_document->>'related_entity_type','')
       or v_previous.related_entity_id is distinct from nullif(p_document->>'related_entity_id','')::uuid then
      raise exception 'A new version must retain its requirement, request and participant.' using errcode = '22023';
    end if;
    v_root := coalesce(v_previous.attorney_version_root_id, v_previous.id);
    if exists (select 1 from public.documents where attorney_version_root_id = v_root
      and attorney_version_number > coalesce(v_previous.attorney_version_number, 1)) then
      raise exception 'A newer version has been saved. Refresh the matter before uploading another revision.' using errcode = '22023';
    end if;
    v_number := coalesce(v_previous.attorney_version_number, 1) + 1;
    if v_previous.attorney_version_root_id is null then
      update public.documents set attorney_version_root_id = id, attorney_version_number = 1,
        attorney_version_kind = 'evidence', attorney_version_document_type = document_type,
        attorney_target_requirement_id = v_requirement, attorney_target_request_id = v_request where id = v_previous.id;
    end if;
  end if;
  if v_kind in ('draft','final') then
    -- Never link unsigned drafting to evidence. Keep its intended target solely
    -- in version metadata, separate from the canonical fulfilment pointer.
    v_payload := v_payload || jsonb_build_object('canonical_requirement_instance_id', null,
      'document_type','attorney_working_copy','category','Internal Working Documents',
      'visibility_scope','internal','is_client_visible',false,'client_recipient_role',null);
  elsif v_requirement is not null then
    -- Every changed evidence file needs a fresh review; an earlier approval may
    -- remain in history but must not be inherited by the new file.
    update public.document_requirement_instances set status = 'pending', rejection_reason = null, updated_at = now()
      where id = v_requirement
        and status in ('approved','completed','uploaded','under_review','rejected','expired');
    v_payload := v_payload || jsonb_build_object('canonical_requirement_instance_id',v_requirement);
  end if;
  v_result := public.bridge_save_attorney_document(v_payload, case when v_kind in ('draft','final') then null else v_request end);
  v_id := (v_result->'document'->>'id')::uuid;
  if v_kind in ('signed','evidence') and v_requirement is not null then
    -- Signed drafting always needs inspection of the actual uploaded copy.
    -- Other evidence keeps its existing definition's review policy.
    if v_kind = 'signed' then
      update public.document_requirement_instances set status = 'under_review', updated_at = now()
        where id = v_requirement and status = 'uploaded';
    end if;
    update public.transaction_required_documents set verified_at = null, rejected_at = null, uploaded_at = now(),
      status = case when v_kind = 'signed' and status = 'uploaded' then 'under_review' else status end
      where canonical_requirement_instance_id = v_requirement;
    update public.documents set review_status = 'under_review' where id = v_id and exists (
      select 1 from public.document_requirement_instances where id = v_requirement and status = 'under_review'
    );
  end if;
  update public.documents set attorney_version_root_id = coalesce(v_root,v_id), attorney_version_previous_id = v_previous_id,
    attorney_version_number = v_number, attorney_version_kind = v_kind, attorney_version_document_type = v_type,
    attorney_target_requirement_id = v_requirement, attorney_target_request_id = v_request where id = v_id
    returning * into v_existing;
  return jsonb_build_object('document', to_jsonb(v_existing), 'deduplicated', false);
end;
$$;
revoke all on function public.bridge_save_attorney_document_version(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.bridge_save_attorney_document_version(jsonb, uuid) to authenticated;

commit;
