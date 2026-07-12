begin;

create extension if not exists pgcrypto;

alter table if exists public.private_listing_seller_onboarding
  add column if not exists seller_portal_password_hash text,
  add column if not exists seller_portal_password_set_at timestamptz,
  add column if not exists seller_portal_last_login_at timestamptz,
  add column if not exists seller_portal_access_token_hash text,
  add column if not exists seller_portal_access_token_expires_at timestamptz;

create or replace function public.bridge_private_listing_seller_portal_access_state(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_token text := nullif(trim(coalesce(p_token, '')), '');
begin
  if v_token is null then
    return jsonb_build_object('valid', false, 'reason', 'token_missing');
  end if;

  select *
    into v_onboarding
  from public.private_listing_seller_onboarding
  where token = v_token
    and (token_expires_at is null or token_expires_at > now())
  limit 1;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'token_invalid');
  end if;

  select *
    into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id
  limit 1;

  return jsonb_build_object(
    'valid', true,
    'passwordSet', v_onboarding.seller_portal_password_hash is not null,
    'passwordRequired', v_onboarding.seller_portal_password_hash is null,
    'sellerEmail', lower(nullif(trim(coalesce(
      v_onboarding.form_data ->> 'sellerEmail',
      v_onboarding.form_data ->> 'email',
      v_onboarding.form_data ->> 'contactEmail',
      ''
    )), '')),
    'propertyTitle', nullif(trim(coalesce(
      v_listing.title,
      v_listing.formatted_address,
      v_listing.address_line_1,
      'your property'
    )), ''),
    'accessTokenExpiresAt', v_onboarding.seller_portal_access_token_expires_at,
    'passwordSetAt', v_onboarding.seller_portal_password_set_at,
    'lastLoginAt', v_onboarding.seller_portal_last_login_at
  );
end;
$$;

create or replace function public.bridge_set_private_listing_seller_portal_password(
  p_token text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_password text := coalesce(p_password, '');
  v_access_token text := encode(gen_random_bytes(32), 'hex');
  v_access_hash text := encode(digest(v_access_token, 'sha256'), 'hex');
  v_expires_at timestamptz := now() + interval '12 hours';
begin
  if v_token is null then
    raise exception 'Seller portal token is required.';
  end if;

  if length(v_password) < 8 then
    raise exception 'Password must be at least 8 characters.';
  end if;

  select *
    into v_onboarding
  from public.private_listing_seller_onboarding
  where token = v_token
    and (token_expires_at is null or token_expires_at > now())
  limit 1
  for update;

  if not found then
    raise exception 'Seller portal link is invalid or inactive.';
  end if;

  if v_onboarding.seller_portal_password_hash is not null then
    raise exception 'Seller portal password has already been set.';
  end if;

  update public.private_listing_seller_onboarding
     set seller_portal_password_hash = crypt(v_password, gen_salt('bf')),
         seller_portal_password_set_at = now(),
         seller_portal_last_login_at = now(),
         seller_portal_access_token_hash = v_access_hash,
         seller_portal_access_token_expires_at = v_expires_at,
         updated_at = now()
   where id = v_onboarding.id
   returning * into v_onboarding;

  return jsonb_build_object(
    'ok', true,
    'accessToken', v_access_token,
    'expiresAt', v_expires_at,
    'passwordSet', true
  );
end;
$$;

create or replace function public.bridge_verify_private_listing_seller_portal_password(
  p_token text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_password text := coalesce(p_password, '');
  v_access_token text := encode(gen_random_bytes(32), 'hex');
  v_access_hash text := encode(digest(v_access_token, 'sha256'), 'hex');
  v_expires_at timestamptz := now() + interval '12 hours';
begin
  if v_token is null then
    raise exception 'Seller portal token is required.';
  end if;

  select *
    into v_onboarding
  from public.private_listing_seller_onboarding
  where token = v_token
    and (token_expires_at is null or token_expires_at > now())
  limit 1
  for update;

  if not found then
    raise exception 'Seller portal link is invalid or inactive.';
  end if;

  if v_onboarding.seller_portal_password_hash is null then
    raise exception 'Seller portal password has not been set.';
  end if;

  if crypt(v_password, v_onboarding.seller_portal_password_hash) <> v_onboarding.seller_portal_password_hash then
    raise exception 'Incorrect seller portal password.';
  end if;

  update public.private_listing_seller_onboarding
     set seller_portal_last_login_at = now(),
         seller_portal_access_token_hash = v_access_hash,
         seller_portal_access_token_expires_at = v_expires_at,
         updated_at = now()
   where id = v_onboarding.id;

  return jsonb_build_object(
    'ok', true,
    'accessToken', v_access_token,
    'expiresAt', v_expires_at,
    'passwordSet', true
  );
end;
$$;

create or replace function public.bridge_reset_private_listing_seller_portal_password(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_token text := nullif(trim(coalesce(p_token, '')), '');
begin
  if v_token is null then
    raise exception 'Seller portal token is required.';
  end if;

  select *
    into v_onboarding
  from public.private_listing_seller_onboarding
  where token = v_token
    and (token_expires_at is null or token_expires_at > now())
  limit 1
  for update;

  if not found then
    raise exception 'Seller portal link is invalid or inactive.';
  end if;

  update public.private_listing_seller_onboarding
     set seller_portal_password_hash = null,
         seller_portal_password_set_at = null,
         seller_portal_access_token_hash = null,
         seller_portal_access_token_expires_at = null,
         updated_at = now()
   where id = v_onboarding.id;

  return jsonb_build_object(
    'ok', true,
    'passwordSet', false,
    'passwordRequired', true
  );
end;
$$;

drop function if exists public.bridge_private_listing_seller_portal_payload(text);

create or replace function public.bridge_private_listing_seller_portal_payload(
  p_token text,
  p_access_token text default null,
  p_require_access boolean default false
)
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
  v_appointments jsonb := '[]'::jsonb;
  v_access_token text := nullif(trim(coalesce(p_access_token, '')), '');
  v_access_hash text := case when v_access_token is null then null else encode(digest(v_access_token, 'sha256'), 'hex') end;
  v_access_granted boolean := false;
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

  v_access_granted :=
    (not p_require_access and v_onboarding.seller_portal_password_hash is null)
    or (
      v_access_hash is not null
      and v_onboarding.seller_portal_access_token_hash = v_access_hash
      and v_onboarding.seller_portal_access_token_expires_at > now()
    );

  if p_require_access and not v_access_granted then
    return jsonb_build_object(
      'authRequired', true,
      'passwordSet', v_onboarding.seller_portal_password_hash is not null,
      'passwordRequired', v_onboarding.seller_portal_password_hash is null,
      'sellerEmail', lower(nullif(trim(coalesce(
        v_onboarding.form_data ->> 'sellerEmail',
        v_onboarding.form_data ->> 'email',
        v_onboarding.form_data ->> 'contactEmail',
        ''
      )), '')),
      'propertyTitle', nullif(trim(coalesce(
        v_listing.title,
        v_listing.formatted_address,
        v_listing.address_line_1,
        'your property'
      )), ''),
      'token', v_onboarding.token
    );
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

  if to_regclass('public.appointments') is not null then
    select coalesce(jsonb_agg(to_jsonb(appt) order by appt.date_time asc nulls last, appt.created_at desc), '[]'::jsonb)
      into v_appointments
    from public.appointments appt
    where appt.organisation_id = v_listing.organisation_id
      and coalesce(appt.status, '') not in ('cancelled', 'deleted')
      and coalesce(appt.visibility_scope, 'shared_role_players') not in ('internal', 'internal_only', 'admin_only')
      and (
        appt.listing_id = v_listing.id
        or appt.lead_id = v_listing.seller_lead_id
        or appt.related_entity_id = v_listing.id
        or appt.related_entity_id = v_listing.seller_lead_id
      );
  end if;

  return jsonb_build_object(
    'listing', to_jsonb(v_listing),
    'onboarding', to_jsonb(v_onboarding) - 'seller_portal_password_hash' - 'seller_portal_access_token_hash',
    'requirements', v_requirements,
    'documents', v_documents,
    'appointments', v_appointments,
    'portalAccess', jsonb_build_object(
      'passwordSet', v_onboarding.seller_portal_password_hash is not null,
      'accessGranted', true,
      'expiresAt', v_onboarding.seller_portal_access_token_expires_at
    )
  );
end;
$$;

drop function if exists public.bridge_upload_private_listing_seller_document(text, text, text, text, text, text);

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
    nullif(trim(coalesce(p_document_type, v_requirement_key, p_category, 'seller_document')), ''),
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
        'canonicalRequirementInstanceId', p_canonical_requirement_instance_id,
        'category', p_category,
        'source', 'client_portal_selling'
      )
    );
  end if;

  return jsonb_build_object(
    'document', to_jsonb(v_document),
    'requirement', case when v_requirement.id is not null then to_jsonb(v_requirement) else null end,
    'listing', to_jsonb(v_listing),
    'onboarding', to_jsonb(v_onboarding) - 'seller_portal_password_hash' - 'seller_portal_access_token_hash'
  );
end;
$$;

grant execute on function public.bridge_private_listing_seller_portal_access_state(text) to anon, authenticated;
grant execute on function public.bridge_set_private_listing_seller_portal_password(text, text) to anon, authenticated;
grant execute on function public.bridge_verify_private_listing_seller_portal_password(text, text) to anon, authenticated;
grant execute on function public.bridge_reset_private_listing_seller_portal_password(text) to authenticated;
grant execute on function public.bridge_private_listing_seller_portal_payload(text, text, boolean) to anon, authenticated;
grant execute on function public.bridge_upload_private_listing_seller_document(text, text, text, text, text, text, uuid, text, text) to anon, authenticated;

commit;
