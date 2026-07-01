begin;

alter table if exists public.documents
  add column if not exists source text,
  add column if not exists source_document_id uuid,
  add column if not exists uploaded_by_party text,
  add column if not exists file_bucket text,
  add column if not exists related_entity_type text,
  add column if not exists related_entity_id uuid,
  add column if not exists canonical_requirement_instance_id uuid;

alter table if exists public.private_listing_documents
  add column if not exists pending_transaction_promotion boolean not null default false,
  add column if not exists promoted_transaction_id uuid,
  add column if not exists promoted_document_id uuid,
  add column if not exists canonical_requirement_instance_id uuid;

create unique index if not exists documents_transaction_source_document_unique_idx
  on public.documents(transaction_id, source, source_document_id);

create index if not exists private_listing_documents_pending_promotion_idx
  on public.private_listing_documents(private_listing_id, pending_transaction_promotion)
  where pending_transaction_promotion = true;

create or replace function public.bridge_resolve_private_listing_transaction_id(p_private_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction_id uuid;
  v_column text;
begin
  if p_private_listing_id is null or to_regclass('public.transactions') is null then
    return null;
  end if;

  foreach v_column in array array['private_listing_id', 'listing_id']
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'transactions'
        and column_name = v_column
    ) then
      execute format(
        'select id from public.transactions where %I = $1 order by created_at desc nulls last, id limit 1',
        v_column
      )
      using p_private_listing_id
      into v_transaction_id;

      if v_transaction_id is not null then
        return v_transaction_id;
      end if;
    end if;
  end loop;

  return null;
end;
$$;

create or replace function public.bridge_promote_private_listing_document_row(p_private_listing_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.private_listing_documents%rowtype;
  v_transaction_id uuid;
  v_shared_document public.documents%rowtype;
begin
  if p_private_listing_document_id is null then
    return jsonb_build_object('promoted', false, 'reason', 'missing_document_id');
  end if;

  select *
    into v_document
  from public.private_listing_documents
  where id = p_private_listing_document_id
  limit 1;

  if not found then
    return jsonb_build_object('promoted', false, 'reason', 'private_listing_document_not_found');
  end if;

  v_transaction_id := public.bridge_resolve_private_listing_transaction_id(v_document.private_listing_id);

  if v_transaction_id is null then
    update public.private_listing_documents
       set pending_transaction_promotion = true
     where id = v_document.id;

    return jsonb_build_object(
      'promoted', false,
      'pending_transaction_promotion', true,
      'private_listing_document_id', v_document.id
    );
  end if;

  insert into public.documents (
    transaction_id,
    name,
    file_path,
    category,
    document_type,
    status,
    visibility_scope,
    is_client_visible,
    uploaded_by_role,
    uploaded_by_party,
    bucket_key,
    source,
    source_document_id,
    file_bucket,
    related_entity_type,
    related_entity_id,
    canonical_requirement_instance_id,
    created_at,
    updated_at
  )
  values (
    v_transaction_id,
    coalesce(nullif(trim(v_document.document_name), ''), 'Seller document'),
    coalesce(nullif(trim(v_document.storage_path), ''), nullif(trim(v_document.file_url), '')),
    coalesce(nullif(trim(v_document.document_type), ''), 'Seller Document'),
    coalesce(nullif(trim(v_document.document_type), ''), 'seller_document'),
    'uploaded',
    'internal',
    true,
    'seller',
    'seller',
    'private-listing-documents',
    'seller_portal',
    v_document.id,
    'private-listing-documents',
    'private_listing',
    v_document.private_listing_id,
    v_document.canonical_requirement_instance_id,
    coalesce(v_document.uploaded_at, now()),
    now()
  )
  on conflict (transaction_id, source, source_document_id) do update
     set name = excluded.name,
         file_path = excluded.file_path,
         category = excluded.category,
         document_type = excluded.document_type,
         status = excluded.status,
         visibility_scope = excluded.visibility_scope,
         is_client_visible = excluded.is_client_visible,
         uploaded_by_role = excluded.uploaded_by_role,
         uploaded_by_party = excluded.uploaded_by_party,
         bucket_key = excluded.bucket_key,
         file_bucket = excluded.file_bucket,
         related_entity_type = excluded.related_entity_type,
         related_entity_id = excluded.related_entity_id,
         canonical_requirement_instance_id = excluded.canonical_requirement_instance_id,
         updated_at = now()
  returning * into v_shared_document;

  update public.private_listing_documents
     set pending_transaction_promotion = false,
         promoted_transaction_id = v_transaction_id,
         promoted_document_id = v_shared_document.id
   where id = v_document.id;

  if to_regclass('public.transaction_required_documents') is not null then
    update public.transaction_required_documents
       set status = 'uploaded',
           uploaded_document_id = coalesce(uploaded_document_id, v_shared_document.id),
           updated_at = now()
     where transaction_id = v_transaction_id
       and (
         requirement_key = v_document.document_type
         or document_type = v_document.document_type
         or id = v_document.canonical_requirement_instance_id
       );
  end if;

  if to_regclass('public.document_requests') is not null then
    update public.document_requests
       set status = 'uploaded',
           document_id = coalesce(document_id, v_shared_document.id),
           updated_at = now()
     where transaction_id = v_transaction_id
       and (
         document_type = v_document.document_type
         or document_key = v_document.document_type
         or canonical_requirement_instance_id = v_document.canonical_requirement_instance_id
       );
  end if;

  if to_regclass('public.transaction_notifications') is not null then
    insert into public.transaction_notifications (
      transaction_id,
      notification_type,
      title,
      message,
      created_at
    )
    values (
      v_transaction_id,
      'seller_document_uploaded',
      'Seller document uploaded',
      coalesce(nullif(trim(v_document.document_name), ''), 'A seller document was uploaded from the seller portal.'),
      now()
    )
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'promoted', true,
    'pending_transaction_promotion', false,
    'transaction_id', v_transaction_id,
    'private_listing_document_id', v_document.id,
    'shared_document', to_jsonb(v_shared_document)
  );
end;
$$;

create or replace function public.bridge_promote_pending_private_listing_documents(p_private_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document record;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if p_private_listing_id is null then
    return jsonb_build_object('promotedCount', 0, 'results', v_results);
  end if;

  for v_document in
    select id
    from public.private_listing_documents
    where private_listing_id = p_private_listing_id
      and (
        coalesce(pending_transaction_promotion, false) = true
        or promoted_document_id is null
      )
    order by uploaded_at nulls last, created_at nulls last, id
  loop
    v_result := public.bridge_promote_private_listing_document_row(v_document.id);
    v_results := v_results || jsonb_build_array(v_result);
  end loop;

  return jsonb_build_object(
    'promotedCount', (
      select count(*)
      from jsonb_array_elements(v_results) item
      where coalesce((item ->> 'promoted')::boolean, false) = true
    ),
    'results', v_results
  );
end;
$$;

drop function if exists public.bridge_upload_private_listing_seller_document(text, text, text, text, text, text);
drop function if exists public.bridge_upload_private_listing_seller_document(text, text, text, text, text, text, uuid, text, text);

create or replace function public.bridge_upload_private_listing_seller_document(
  p_token text,
  p_requirement_key text,
  p_document_name text,
  p_storage_path text,
  p_file_url text default null,
  p_document_type text default null,
  p_canonical_requirement_instance_id uuid default null,
  p_category text default null,
  p_access_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_requirement public.private_listing_document_requirements%rowtype;
  v_document public.private_listing_documents%rowtype;
  v_requirement_key text := nullif(trim(coalesce(p_requirement_key, '')), '');
  v_access_token text := nullif(trim(coalesce(p_access_token, '')), '');
  v_access_hash text := case when v_access_token is null then null else encode(digest(v_access_token, 'sha256'), 'hex') end;
  v_promotion jsonb := '{}'::jsonb;
begin
  if nullif(trim(coalesce(p_storage_path, '')), '') is null then
    raise exception 'Document storage path is required.';
  end if;

  select *
    into v_onboarding
  from public.private_listing_seller_onboarding
  where token = nullif(trim(p_token), '')
    and (token_expires_at is null or token_expires_at > now())
  limit 1;

  if not found then
    raise exception 'Seller portal link is invalid or inactive.';
  end if;

  if v_onboarding.seller_portal_password_hash is not null and (
    v_access_hash is null
    or v_onboarding.seller_portal_access_token_hash is distinct from v_access_hash
    or v_onboarding.seller_portal_access_token_expires_at <= now()
  ) then
    raise exception 'Seller portal password is required.';
  end if;

  select *
    into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id
  limit 1;

  if not found then
    raise exception 'Private listing not found.';
  end if;

  perform public.bridge_promote_pending_private_listing_documents(v_listing.id);

  if v_requirement_key is not null then
    select *
      into v_requirement
    from public.private_listing_document_requirements
    where private_listing_id = v_listing.id
      and requirement_key = v_requirement_key
    limit 1;
  end if;

  insert into public.private_listing_documents (
    private_listing_id,
    requirement_id,
    document_type,
    document_name,
    storage_path,
    file_url,
    uploaded_by,
    status,
    visibility,
    uploaded_at,
    pending_transaction_promotion,
    canonical_requirement_instance_id
  )
  values (
    v_listing.id,
    case when v_requirement.id is not null then v_requirement.id else null end,
    nullif(trim(coalesce(p_document_type, v_requirement_key, p_category, 'seller_document')), ''),
    coalesce(nullif(trim(coalesce(p_document_name, '')), ''), 'Seller document'),
    trim(p_storage_path),
    nullif(trim(coalesce(p_file_url, '')), ''),
    null,
    'uploaded',
    'seller_visible',
    now(),
    true,
    p_canonical_requirement_instance_id
  )
  returning * into v_document;

  if v_requirement.id is not null then
    update public.private_listing_document_requirements
       set status = 'uploaded',
           updated_at = now()
     where id = v_requirement.id
     returning * into v_requirement;
  end if;

  v_promotion := public.bridge_promote_private_listing_document_row(v_document.id);

  if to_regclass('public.private_listing_activity') is not null then
    insert into public.private_listing_activity (
      private_listing_id,
      activity_type,
      activity_title,
      activity_description,
      performed_by,
      visibility,
      metadata
    )
    values (
      v_listing.id,
      'seller_document_uploaded',
      'Seller document uploaded',
      coalesce(nullif(trim(coalesce(p_document_name, '')), ''), 'A seller document was uploaded from the client portal.'),
      null,
      'internal',
      jsonb_build_object(
        'documentId', v_document.id,
        'requirementId', v_requirement.id,
        'requirementKey', v_requirement_key,
        'canonicalRequirementInstanceId', p_canonical_requirement_instance_id,
        'category', p_category,
        'promotion', v_promotion,
        'source', 'client_portal_selling'
      )
    );
  end if;

  select *
    into v_document
  from public.private_listing_documents
  where id = v_document.id;

  return jsonb_build_object(
    'document', to_jsonb(v_document),
    'requirement', case when v_requirement.id is not null then to_jsonb(v_requirement) else null end,
    'listing', to_jsonb(v_listing),
    'onboarding', to_jsonb(v_onboarding) - 'seller_portal_password_hash' - 'seller_portal_access_token_hash',
    'pending_transaction_promotion', coalesce((v_promotion ->> 'pending_transaction_promotion')::boolean, v_document.pending_transaction_promotion),
    'transaction_id', v_promotion ->> 'transaction_id',
    'shared_document', v_promotion -> 'shared_document'
  );
end;
$$;

grant execute on function public.bridge_resolve_private_listing_transaction_id(uuid) to authenticated, service_role;
grant execute on function public.bridge_promote_private_listing_document_row(uuid) to authenticated, service_role;
grant execute on function public.bridge_promote_pending_private_listing_documents(uuid) to authenticated, service_role;
grant execute on function public.bridge_upload_private_listing_seller_document(text, text, text, text, text, text, uuid, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
