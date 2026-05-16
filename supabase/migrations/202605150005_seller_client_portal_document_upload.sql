begin;

create or replace function public.bridge_private_listing_seller_portal_payload(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_requirements jsonb := '[]'::jsonb;
  v_documents jsonb := '[]'::jsonb;
begin
  select *
    into v_onboarding
  from public.private_listing_seller_onboarding
  where token = nullif(trim(p_token), '')
    and (token_expires_at is null or token_expires_at > now())
  limit 1;

  if not found then
    return null;
  end if;

  select *
    into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id
  limit 1;

  if not found then
    return null;
  end if;

  if to_regclass('public.private_listing_document_requirements') is not null then
    select coalesce(jsonb_agg(to_jsonb(req) order by req.created_at asc), '[]'::jsonb)
      into v_requirements
    from public.private_listing_document_requirements req
    where req.private_listing_id = v_listing.id;
  end if;

  if to_regclass('public.private_listing_documents') is not null then
    select coalesce(jsonb_agg(to_jsonb(doc) order by doc.uploaded_at desc), '[]'::jsonb)
      into v_documents
    from public.private_listing_documents doc
    where doc.private_listing_id = v_listing.id;
  end if;

  return jsonb_build_object(
    'listing', to_jsonb(v_listing),
    'onboarding', to_jsonb(v_onboarding),
    'requirements', v_requirements,
    'documents', v_documents
  );
end;
$$;

create or replace function public.bridge_upload_private_listing_seller_document(
  p_token text,
  p_requirement_key text,
  p_document_name text,
  p_storage_path text,
  p_file_url text default null,
  p_document_type text default null
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

  select *
    into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id
  limit 1;

  if not found then
    raise exception 'Private listing not found.';
  end if;

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
    uploaded_at
  )
  values (
    v_listing.id,
    case when v_requirement.id is not null then v_requirement.id else null end,
    nullif(trim(coalesce(p_document_type, v_requirement_key, 'seller_document')), ''),
    coalesce(nullif(trim(coalesce(p_document_name, '')), ''), 'Seller document'),
    trim(p_storage_path),
    nullif(trim(coalesce(p_file_url, '')), ''),
    null,
    'uploaded',
    'seller_visible',
    now()
  )
  returning * into v_document;

  if v_requirement.id is not null then
    update public.private_listing_document_requirements
       set status = 'uploaded',
           updated_at = now()
     where id = v_requirement.id
     returning * into v_requirement;
  end if;

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
        'source', 'client_portal_selling'
      )
    );
  end if;

  return jsonb_build_object(
    'document', to_jsonb(v_document),
    'requirement', case when v_requirement.id is not null then to_jsonb(v_requirement) else null end,
    'listing', to_jsonb(v_listing),
    'onboarding', to_jsonb(v_onboarding)
  );
end;
$$;

grant execute on function public.bridge_private_listing_seller_portal_payload(text) to anon, authenticated;
grant execute on function public.bridge_upload_private_listing_seller_document(text, text, text, text, text, text) to anon, authenticated;

commit;
