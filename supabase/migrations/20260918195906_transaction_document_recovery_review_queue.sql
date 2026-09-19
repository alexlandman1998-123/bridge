begin;

-- Read-only recovery queue for a single transaction. It deliberately exposes
-- only records that the caller can already access and never deletes storage or
-- invents a replacement document.
create or replace function public.bridge_get_transaction_document_recovery_review(
  p_transaction_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_missing_storage jsonb;
  v_orphan_storage jsonb;
begin
  if p_transaction_id is null
    or not public.bridge_can_access_transaction_org_member(p_transaction_id) then
    raise exception 'You do not have access to this transaction.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(row) order by row.created_at asc), '[]'::jsonb)
  into v_missing_storage
  from (
    select
      document.id as document_id,
      document.name as document_name,
      document.category,
      document.document_type,
      coalesce(nullif(document.file_bucket, ''), 'documents') as bucket_id,
      document.file_path,
      document.canonical_requirement_instance_id,
      document.created_at,
      'reupload_required'::text as recommended_action
    from public.documents document
    where document.transaction_id = p_transaction_id
      and nullif(btrim(document.file_path), '') is not null
      and not exists (
        select 1
        from storage.objects object
        where object.bucket_id = coalesce(nullif(document.file_bucket, ''), 'documents')
          and object.name = document.file_path
      )
  ) row;

  select coalesce(jsonb_agg(to_jsonb(row) order by row.created_at asc), '[]'::jsonb)
  into v_orphan_storage
  from (
    select
      object.bucket_id::text as bucket_id,
      object.name::text as file_path,
      object.created_at,
      'review_before_removal'::text as recommended_action
    from storage.objects object
    where object.bucket_id = 'documents'
      and object.name like ('transaction-' || p_transaction_id::text || '/%')
      and not exists (
        select 1
        from public.documents document
        where document.file_path = object.name
          and coalesce(nullif(document.file_bucket, ''), 'documents') = object.bucket_id
      )
  ) row;

  return jsonb_build_object(
    'version', 'transaction_document_recovery_review_v1',
    'transactionId', p_transaction_id,
    'documentsMissingStorage', v_missing_storage,
    'orphanStorageObjects', v_orphan_storage,
    'summary', jsonb_build_object(
      'documentsMissingStorageCount', jsonb_array_length(v_missing_storage),
      'orphanStorageObjectCount', jsonb_array_length(v_orphan_storage)
    ),
    'safety', jsonb_build_object(
      'readOnly', true,
      'automaticDeletion', false,
      'automaticReplacement', false
    )
  );
end;
$$;

-- Exact-ID repair for a document that still exists in storage but was not
-- linked to its canonical requirement. This refuses cross-transaction links
-- and delegates the state transition to the existing canonical linker.
create or replace function public.bridge_repair_transaction_document_link(
  p_transaction_id uuid,
  p_document_id uuid,
  p_requirement_instance_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_document public.documents%rowtype;
  v_requirement public.document_requirement_instances%rowtype;
  v_actor_role text;
begin
  if p_transaction_id is null
    or p_document_id is null
    or p_requirement_instance_id is null
    or not public.bridge_can_access_transaction_org_member(p_transaction_id) then
    raise exception 'You do not have access to this transaction.' using errcode = '42501';
  end if;

  select * into v_document
  from public.documents
  where id = p_document_id
    and transaction_id = p_transaction_id;

  if not found then
    raise exception 'Document does not belong to this transaction.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = coalesce(nullif(v_document.file_bucket, ''), 'documents')
      and object.name = v_document.file_path
  ) then
    raise exception 'The document file is missing from storage and must be re-uploaded.' using errcode = '22023';
  end if;

  select * into v_requirement
  from public.document_requirement_instances
  where id = p_requirement_instance_id
    and transaction_id = p_transaction_id;

  if not found then
    raise exception 'Canonical requirement does not belong to this transaction.' using errcode = '22023';
  end if;

  select lower(trim(coalesce(role, '')))
  into v_actor_role
  from public.profiles
  where id = auth.uid();

  return public.bridge_link_document_to_canonical_requirement(
    p_document_id,
    p_requirement_instance_id,
    nullif(v_actor_role, ''),
    auth.uid(),
    jsonb_build_object('source', 'transaction_document_recovery_repair_v1')
  );
end;
$$;

revoke all on function public.bridge_get_transaction_document_recovery_review(uuid) from public;
revoke all on function public.bridge_get_transaction_document_recovery_review(uuid) from anon;
grant execute on function public.bridge_get_transaction_document_recovery_review(uuid) to authenticated;

revoke all on function public.bridge_repair_transaction_document_link(uuid, uuid, uuid) from public;
revoke all on function public.bridge_repair_transaction_document_link(uuid, uuid, uuid) from anon;
grant execute on function public.bridge_repair_transaction_document_link(uuid, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
