begin;

-- Buyer portal document metadata is written only through this RPC. Storage is
-- uploaded first; every database mutation below is one PostgreSQL transaction.
create or replace function public.bridge_upload_buyer_portal_document(
  p_transaction_id uuid,
  p_file_path text,
  p_file_bucket text,
  p_document_name text,
  p_category text default 'Client Portal',
  p_document_type text default null,
  p_required_document_key text default null,
  p_requirement_instance_id uuid default null,
  p_document_request_id uuid default null,
  p_bucket_key text default null,
  p_finance_lane text default null,
  p_related_entity_type text default null,
  p_related_entity_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_token text := nullif(trim(coalesce(public.bridge_client_portal_request_token(), '')), '');
  v_link public.client_portal_links%rowtype;
  v_requirement public.document_requirement_instances%rowtype;
  v_document public.documents%rowtype;
  v_requirement_instance_id uuid := p_requirement_instance_id;
  v_required_key text;
  v_document_type text;
  v_document_name text;
  v_category text;
  v_bucket_key text;
  v_finance_lane text;
  v_related_entity_type text;
  v_buyer_email text;
  v_previous_status text;
  v_next_status text;
  v_review_required boolean := false;
  v_request_updated boolean := false;
begin
  if p_transaction_id is null or v_request_token is null then
    raise exception 'A valid buyer portal transaction and token are required.' using errcode = '42501';
  end if;

  select link.*
    into v_link
  from public.client_portal_links link
  join public.transactions transaction_row
    on transaction_row.id = link.transaction_id
  where link.transaction_id = p_transaction_id
    and link.is_active is true
    and link.token = v_request_token
    and link.buyer_id is not null
    and transaction_row.development_id is not distinct from link.development_id
    and transaction_row.unit_id is not distinct from link.unit_id
    and transaction_row.buyer_id is not distinct from link.buyer_id
  limit 1;

  if not found then
    raise exception 'Buyer portal token cannot upload to this transaction.' using errcode = '42501';
  end if;

  if coalesce(trim(p_file_bucket), '') <> 'documents' then
    raise exception 'Buyer portal documents must use the documents bucket.' using errcode = '22023';
  end if;

  if coalesce(trim(p_file_path), '') = ''
     or length(trim(p_file_path)) > 1024
     or trim(p_file_path) not like 'client-portal/' || p_transaction_id::text || '/%'
     or trim(p_file_path) ~ '(^|/)[.]{1,2}(/|$)' then
    raise exception 'The uploaded object path is outside this buyer portal transaction.' using errcode = '22023';
  end if;

  v_document_name := left(trim(regexp_replace(coalesce(p_document_name, ''), '[[:cntrl:]]', '', 'g')), 255);
  if v_document_name = '' then
    raise exception 'A document name is required.' using errcode = '22023';
  end if;

  v_category := left(trim(regexp_replace(coalesce(p_category, 'Client Portal'), '[[:cntrl:]]', '', 'g')), 120);
  if v_category = '' then
    v_category := 'Client Portal';
  end if;

  v_document_type := lower(regexp_replace(trim(coalesce(p_document_type, '')), '[^a-zA-Z0-9]+', '_', 'g'));
  v_document_type := left(trim(both '_' from v_document_type), 120);
  if v_document_type = '' then
    v_document_type := 'client_portal_document';
  end if;

  v_required_key := lower(regexp_replace(
    trim(coalesce(nullif(trim(p_required_document_key), ''), p_document_type, '')),
    '[^a-zA-Z0-9]+',
    '_',
    'g'
  ));
  v_required_key := left(trim(both '_' from v_required_key), 160);
  if v_requirement_instance_id is null and v_required_key <> '' then
    select required_document.canonical_requirement_instance_id
      into v_requirement_instance_id
    from public.transaction_required_documents required_document
    where required_document.transaction_id = p_transaction_id
      and required_document.enabled is true
      and required_document.canonical_requirement_instance_id is not null
      and lower(trim(required_document.document_key)) = v_required_key
    order by required_document.sort_order, required_document.created_at
    limit 1;
  end if;

  if v_requirement_instance_id is null and v_required_key <> '' then
    select requirement.id
      into v_requirement_instance_id
    from public.document_requirement_instances requirement
    where requirement.transaction_id = p_transaction_id
      and requirement.document_definition_key = v_required_key
      and requirement.status <> 'not_applicable'
    order by requirement.created_at
    limit 1;
  end if;

  if v_requirement_instance_id is null then
    raise exception 'A canonical buyer document requirement is required for this upload.' using errcode = '22023';
  end if;

  select requirement.*
    into v_requirement
  from public.document_requirement_instances requirement
  where requirement.id = v_requirement_instance_id
  for update of requirement;

  if not found or v_requirement.transaction_id is distinct from p_transaction_id then
    raise exception 'Canonical requirement does not belong to this transaction.' using errcode = '42501';
  end if;

  select coalesce(definition.review_required, false)
    into v_review_required
  from public.document_definitions definition
  where definition.key = v_requirement.document_definition_key;

  if v_requirement.status = 'not_applicable'
     or not (coalesce(v_requirement.uploadable_by_roles, '{}'::text[]) @> array['buyer']::text[]) then
    raise exception 'This canonical requirement does not accept buyer uploads.' using errcode = '42501';
  end if;

  select lower(nullif(trim(buyer.email), ''))
    into v_buyer_email
  from public.buyers buyer
  where buyer.id = v_link.buyer_id;

  v_bucket_key := nullif(left(trim(regexp_replace(coalesce(p_bucket_key, ''), '[[:cntrl:]]', '', 'g')), 80), '');
  v_finance_lane := nullif(left(trim(regexp_replace(coalesce(p_finance_lane, ''), '[[:cntrl:]]', '', 'g')), 80), '');
  v_related_entity_type := nullif(
    left(trim(regexp_replace(coalesce(p_related_entity_type, ''), '[^a-zA-Z0-9_:-]+', '_', 'g')), 120),
    ''
  );

  insert into public.documents (
    transaction_id,
    name,
    file_name,
    file_path,
    category,
    document_type,
    status,
    visibility_scope,
    is_client_visible,
    uploaded_by_role,
    uploaded_by_email,
    uploaded_by_party,
    bucket_key,
    source,
    file_bucket,
    finance_lane,
    related_entity_type,
    related_entity_id,
    canonical_requirement_instance_id,
    uploaded_at
  )
  values (
    p_transaction_id,
    v_document_name,
    v_document_name,
    trim(p_file_path),
    v_category,
    v_document_type,
    'uploaded',
    'shared',
    true,
    'client',
    v_buyer_email,
    'buyer',
    v_bucket_key,
    'client_portal_atomic_upload',
    'documents',
    v_finance_lane,
    v_related_entity_type,
    p_related_entity_id,
    v_requirement_instance_id,
    now()
  )
  returning * into v_document;

  v_previous_status := coalesce(v_requirement.status, 'pending');
  v_next_status := case when v_review_required then 'under_review' else 'uploaded' end;
  if v_previous_status in ('approved', 'completed', 'waived') then
    v_next_status := v_previous_status;
  end if;

  update public.document_requirement_instances
  set status = v_next_status,
      satisfied_by_document_id = v_document.id,
      rejection_reason = null,
      source_system = 'client_portal_atomic_upload',
      updated_at = now()
  where id = v_requirement_instance_id;

  update public.transaction_required_documents
  set is_uploaded = true,
      uploaded_document_id = v_document.id,
      canonical_requirement_instance_id = coalesce(canonical_requirement_instance_id, v_requirement_instance_id),
      status = case
        when v_next_status = 'under_review' then 'under_review'
        when v_next_status in ('approved', 'completed') then 'approved'
        else 'uploaded'
      end,
      uploaded_at = coalesce(uploaded_at, now()),
      rejected_at = null,
      rejected_note = null,
      updated_at = now()
  where transaction_id = p_transaction_id
    and (
      canonical_requirement_instance_id = v_requirement_instance_id
      or lower(trim(document_key)) in (v_required_key, v_requirement.document_definition_key)
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
    v_requirement_instance_id,
    'uploaded',
    'buyer',
    null,
    'Buyer portal upload linked to canonical requirement.',
    jsonb_build_object(
      'document_id', v_document.id,
      'previous_status', v_previous_status,
      'new_status', v_next_status,
      'source', 'client_portal_atomic_upload'
    )
  );

  if p_document_request_id is not null then
    update public.document_requests
    set status = case when coalesce(requires_review, true) then 'uploaded' else 'completed' end,
        requested_document_id = v_document.id,
        completed_at = case when coalesce(requires_review, true) then null else now() end,
        rejected_reason = null,
        updated_at = now()
    where id = p_document_request_id
      and transaction_id = p_transaction_id;
    v_request_updated := found;
    if not v_request_updated then
      raise exception 'Document request does not belong to this transaction.' using errcode = '42501';
    end if;
  end if;

  -- Event type and payload shape are intentionally server-owned. Caller input
  -- is represented only by the sanitized values persisted on the document.
  insert into public.transaction_events (
    transaction_id,
    event_type,
    event_data,
    created_by,
    created_by_role,
    visibility_scope
  )
  values (
    p_transaction_id,
    'DocumentUploaded',
    jsonb_build_object(
      'documentId', v_document.id,
      'documentName', v_document_name,
      'category', v_category,
      'documentType', v_document_type,
      'canonicalRequirementInstanceId', v_requirement_instance_id,
      'visibilityScope', 'shared',
      'source', 'client_portal_atomic_upload'
    ),
    null,
    'client',
    'internal'
  );

  return to_jsonb(v_document)
    || jsonb_build_object(
      'canonicalRequirementInstanceId', v_requirement_instance_id,
      'requirementStatus', v_next_status,
      'documentRequestUpdated', v_request_updated
    );
end;
$$;

revoke all on function public.bridge_upload_buyer_portal_document(
  uuid, text, text, text, text, text, text, uuid, uuid, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.bridge_upload_buyer_portal_document(
  uuid, text, text, text, text, text, text, uuid, uuid, text, text, text, uuid
) to anon, authenticated, service_role;

comment on function public.bridge_upload_buyer_portal_document(
  uuid, text, text, text, text, text, text, uuid, uuid, text, text, text, uuid
) is 'Token-scoped atomic buyer portal document, canonical requirement, request, and audit-event write.';

-- Remove direct buyer-portal table mutation. Onboarding retains its distinct
-- bearer capability; buyer portal writes now have to pass through the RPC.
create or replace function public.bridge_onboarding_document_row_can_write(
  p_transaction_id uuid,
  p_file_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.bridge_has_onboarding_token_transaction_access(p_transaction_id)
    and coalesce((storage.foldername(p_file_path))[1], '') = 'onboarding'
    and coalesce((storage.foldername(p_file_path))[2], '') = p_transaction_id::text
    and coalesce((storage.foldername(p_file_path))[3], '') <> ''
    and coalesce(storage.filename(p_file_path), '') <> '';
$$;

revoke all on function public.bridge_onboarding_document_row_can_write(uuid, text)
  from public, anon, authenticated;
grant execute on function public.bridge_onboarding_document_row_can_write(uuid, text)
  to anon, authenticated;

drop policy if exists documents_insert_token_scoped on public.documents;
drop policy if exists documents_update_token_scoped on public.documents;
drop policy if exists documents_insert_onboarding_token_scoped on public.documents;
drop policy if exists documents_update_onboarding_token_scoped on public.documents;

create policy documents_insert_onboarding_token_scoped
  on public.documents
  for insert
  to anon, authenticated
  with check (public.bridge_onboarding_document_row_can_write(transaction_id, file_path));

create policy documents_update_onboarding_token_scoped
  on public.documents
  for update
  to anon, authenticated
  using (public.bridge_onboarding_document_row_can_write(transaction_id, file_path))
  with check (public.bridge_onboarding_document_row_can_write(transaction_id, file_path));

-- Compensation may delete only an object which belongs to the request token's
-- transaction and has no committed documents row.
create or replace function public.bridge_storage_buyer_portal_can_delete_orphan(
  p_bucket_id text,
  p_name text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_bucket_id = 'documents'
    and public.bridge_storage_buyer_portal_can_write(p_name)
    and not exists (
      select 1
      from public.documents document
      where document.file_path = p_name
        and coalesce(document.file_bucket, 'documents') = p_bucket_id
    );
$$;

revoke all on function public.bridge_storage_buyer_portal_can_delete_orphan(text, text)
  from public, anon, authenticated;
grant execute on function public.bridge_storage_buyer_portal_can_delete_orphan(text, text)
  to anon, authenticated;

drop policy if exists documents_buyer_portal_orphan_delete on storage.objects;
create policy documents_buyer_portal_orphan_delete
  on storage.objects
  for delete
  to anon, authenticated
  using (public.bridge_storage_buyer_portal_can_delete_orphan(bucket_id, name));

notify pgrst, 'reload schema';

commit;
