begin;

create extension if not exists pgcrypto with schema extensions;

alter table public.private_listing_seller_onboarding
  add column if not exists seller_portal_token text,
  add column if not exists seller_portal_invite_token_hash text,
  add column if not exists seller_portal_invite_created_at timestamptz,
  add column if not exists seller_portal_invite_expires_at timestamptz,
  add column if not exists seller_portal_invite_consumed_at timestamptz,
  add column if not exists seller_portal_invite_generation integer not null default 0;

update public.private_listing_seller_onboarding
set seller_portal_token = 'seller-portal-' || encode(gen_random_bytes(24), 'hex'),
    updated_at = now()
where nullif(trim(seller_portal_token), '') is null;

alter table public.private_listing_seller_onboarding
  alter column seller_portal_token set not null;

create unique index if not exists private_listing_seller_onboarding_portal_token_uidx
  on public.private_listing_seller_onboarding (seller_portal_token);

create index if not exists private_listing_seller_onboarding_invite_hash_idx
  on public.private_listing_seller_onboarding (seller_portal_invite_token_hash)
  where seller_portal_invite_token_hash is not null;

comment on column public.private_listing_seller_onboarding.seller_portal_token is
  'Stable opaque seller portal identifier. It is independent from onboarding and invitation expiry.';
comment on column public.private_listing_seller_onboarding.seller_portal_invite_token_hash is
  'SHA-256 hash of the current one-time seller portal invitation token. The plaintext token is never persisted.';
comment on column public.private_listing_seller_onboarding.seller_portal_invite_expires_at is
  'Expiry for the current one-time invitation. Stable portal access is unaffected.';

create or replace function public.bridge_resolve_private_listing_seller_portal_token(p_token text)
returns table (
  onboarding_id uuid,
  legacy_token text,
  stable_portal_token text,
  token_kind text,
  token_valid boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with input as (
    select
      nullif(trim(coalesce(p_token, '')), '') as token,
      case
        when nullif(trim(coalesce(p_token, '')), '') is null then null
        else encode(digest(trim(p_token), 'sha256'), 'hex')
      end as token_hash
  )
  select
    onboarding.id,
    onboarding.token,
    onboarding.seller_portal_token,
    case
      when onboarding.seller_portal_token = input.token then 'stable'
      when onboarding.token = input.token then 'legacy'
      else 'invite'
    end,
    case
      when onboarding.seller_portal_token = input.token then true
      when onboarding.token = input.token then true
      else onboarding.seller_portal_invite_consumed_at is null
        and onboarding.seller_portal_invite_expires_at is not null
        and onboarding.seller_portal_invite_expires_at > now()
    end
  from input
  join public.private_listing_seller_onboarding onboarding
    on onboarding.seller_portal_token = input.token
    or onboarding.token = input.token
    or onboarding.seller_portal_invite_token_hash = input.token_hash
  order by
    case
      when onboarding.seller_portal_token = input.token then 1
      when onboarding.token = input.token then 2
      else 3
    end
  limit 1;
$$;

revoke all on function public.bridge_resolve_private_listing_seller_portal_token(text) from public, anon, authenticated;

create or replace function public.bridge_issue_private_listing_seller_portal_invite(
  p_token text,
  p_ttl_hours integer default 72
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_resolution record;
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_invite_token text := 'seller-invite-' || encode(gen_random_bytes(32), 'hex');
  v_invite_hash text := encode(digest(v_invite_token, 'sha256'), 'hex');
  v_ttl_hours integer := greatest(1, least(coalesce(p_ttl_hours, 72), 168));
  v_expires_at timestamptz := now() + make_interval(hours => greatest(1, least(coalesce(p_ttl_hours, 72), 168)));
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Authentication is required to issue a seller portal invitation.';
  end if;

  select * into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(p_token);

  if not found or not v_resolution.token_valid or v_resolution.token_kind = 'invite' then
    raise exception 'Seller portal link is invalid or inactive.';
  end if;

  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where id = v_resolution.onboarding_id
  for update;

  select * into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id;

  if not found or not public.bridge_private_listing_seller_portal_link_is_active(to_jsonb(v_onboarding), to_jsonb(v_listing)) then
    raise exception 'Seller portal link is invalid or inactive.';
  end if;

  update public.private_listing_seller_onboarding
  set seller_portal_invite_token_hash = v_invite_hash,
      seller_portal_invite_created_at = now(),
      seller_portal_invite_expires_at = v_expires_at,
      seller_portal_invite_consumed_at = null,
      seller_portal_invite_generation = seller_portal_invite_generation + 1,
      updated_at = now()
  where id = v_onboarding.id;

  perform public.bridge_log_client_portal_access_event(
    v_invite_token,
    'invite_issued',
    'success',
    v_listing.id,
    'one_time_invite_created'
  );

  return jsonb_build_object(
    'ok', true,
    'inviteToken', v_invite_token,
    'inviteExpiresAt', v_expires_at,
    'ttlHours', v_ttl_hours,
    'stablePortalToken', v_onboarding.seller_portal_token,
    'listingId', v_listing.id
  );
end;
$$;

grant execute on function public.bridge_issue_private_listing_seller_portal_invite(text, integer) to authenticated;

alter function public.bridge_private_listing_seller_portal_access_state(text)
  rename to bridge_private_listing_seller_portal_access_state_phase1;
alter function public.bridge_set_private_listing_seller_portal_password(text, text)
  rename to bridge_set_private_listing_seller_portal_password_phase1;
alter function public.bridge_verify_private_listing_seller_portal_password(text, text)
  rename to bridge_verify_private_listing_seller_portal_password_phase1;
alter function public.bridge_reset_private_listing_seller_portal_password(text)
  rename to bridge_reset_private_listing_seller_portal_password_phase1;
alter function public.bridge_private_listing_seller_portal_payload(text, text, boolean)
  rename to bridge_private_listing_seller_portal_payload_phase1;
alter function public.bridge_upload_private_listing_seller_document(text, text, text, text, text, text, uuid, text, text)
  rename to bridge_upload_private_listing_seller_document_phase1;

revoke all on function public.bridge_private_listing_seller_portal_access_state_phase1(text) from public, anon, authenticated;
revoke all on function public.bridge_set_private_listing_seller_portal_password_phase1(text, text) from public, anon, authenticated;
revoke all on function public.bridge_verify_private_listing_seller_portal_password_phase1(text, text) from public, anon, authenticated;
revoke all on function public.bridge_reset_private_listing_seller_portal_password_phase1(text) from public, anon, authenticated;
revoke all on function public.bridge_private_listing_seller_portal_payload_phase1(text, text, boolean) from public, anon, authenticated;
revoke all on function public.bridge_upload_private_listing_seller_document_phase1(text, text, text, text, text, text, uuid, text, text) from public, anon, authenticated;

create or replace function public.bridge_private_listing_seller_portal_access_state(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_resolution record;
  v_result jsonb;
begin
  select * into v_resolution from public.bridge_resolve_private_listing_seller_portal_token(p_token);
  if not found then
    perform public.bridge_log_client_portal_access_event(p_token, 'access_state', 'failure', null, 'token_invalid');
    return jsonb_build_object('valid', false, 'reason', 'token_invalid');
  end if;
  if not v_resolution.token_valid then
    perform public.bridge_log_client_portal_access_event(p_token, 'access_state', 'failure', null, 'invite_expired_or_consumed');
    return jsonb_build_object(
      'valid', false,
      'reason', 'invite_expired_or_consumed',
      'tokenKind', v_resolution.token_kind,
      'stablePortalToken', v_resolution.stable_portal_token
    );
  end if;
  v_result := public.bridge_private_listing_seller_portal_access_state_phase1(v_resolution.legacy_token);
  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'tokenKind', v_resolution.token_kind,
    'stablePortalToken', v_resolution.stable_portal_token,
    'stablePortalPath', '/client/' || v_resolution.stable_portal_token || '/selling'
  );
end;
$$;

create or replace function public.bridge_set_private_listing_seller_portal_password(p_token text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_resolution record;
  v_result jsonb;
begin
  select * into v_resolution from public.bridge_resolve_private_listing_seller_portal_token(p_token);
  if not found or not v_resolution.token_valid then raise exception 'Seller portal invitation is invalid, expired, or already used.'; end if;
  v_result := public.bridge_set_private_listing_seller_portal_password_phase1(v_resolution.legacy_token, p_password);
  if v_resolution.token_kind = 'invite' then
    update public.private_listing_seller_onboarding
    set seller_portal_invite_consumed_at = now(), updated_at = now()
    where id = v_resolution.onboarding_id;
  end if;
  return v_result || jsonb_build_object(
    'tokenKind', v_resolution.token_kind,
    'stablePortalToken', v_resolution.stable_portal_token,
    'stablePortalPath', '/client/' || v_resolution.stable_portal_token || '/selling'
  );
end;
$$;

create or replace function public.bridge_verify_private_listing_seller_portal_password(p_token text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_resolution record;
  v_result jsonb;
begin
  select * into v_resolution from public.bridge_resolve_private_listing_seller_portal_token(p_token);
  if not found or not v_resolution.token_valid then raise exception 'Seller portal invitation is invalid, expired, or already used.'; end if;
  v_result := public.bridge_verify_private_listing_seller_portal_password_phase1(v_resolution.legacy_token, p_password);
  if v_resolution.token_kind = 'invite' then
    update public.private_listing_seller_onboarding
    set seller_portal_invite_consumed_at = now(), updated_at = now()
    where id = v_resolution.onboarding_id;
  end if;
  return v_result || jsonb_build_object(
    'tokenKind', v_resolution.token_kind,
    'stablePortalToken', v_resolution.stable_portal_token,
    'stablePortalPath', '/client/' || v_resolution.stable_portal_token || '/selling'
  );
end;
$$;

create or replace function public.bridge_reset_private_listing_seller_portal_password(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_resolution record;
  v_result jsonb;
begin
  select * into v_resolution from public.bridge_resolve_private_listing_seller_portal_token(p_token);
  if not found or not v_resolution.token_valid or v_resolution.token_kind = 'invite' then
    raise exception 'Seller portal link is invalid or inactive.';
  end if;
  v_result := public.bridge_reset_private_listing_seller_portal_password_phase1(v_resolution.legacy_token);
  return v_result || jsonb_build_object(
    'stablePortalToken', v_resolution.stable_portal_token,
    'stablePortalPath', '/client/' || v_resolution.stable_portal_token || '/selling'
  );
end;
$$;

create or replace function public.bridge_private_listing_seller_portal_payload(
  p_token text,
  p_access_token text default null,
  p_require_access boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_resolution record;
  v_result jsonb;
begin
  select * into v_resolution from public.bridge_resolve_private_listing_seller_portal_token(p_token);
  if not found or not v_resolution.token_valid then return null; end if;
  v_result := public.bridge_private_listing_seller_portal_payload_phase1(
    v_resolution.legacy_token,
    p_access_token,
    p_require_access
  );
  if v_result is null then return null; end if;
  if jsonb_typeof(v_result -> 'onboarding') = 'object' then
    v_result := jsonb_set(
      v_result,
      '{onboarding}',
      (v_result -> 'onboarding') - 'seller_portal_invite_token_hash',
      true
    );
  end if;
  return v_result || jsonb_build_object(
    'tokenKind', v_resolution.token_kind,
    'stablePortalToken', v_resolution.stable_portal_token,
    'stablePortalPath', '/client/' || v_resolution.stable_portal_token || '/selling',
    'portalAccess', coalesce(v_result -> 'portalAccess', '{}'::jsonb) || jsonb_build_object(
      'tokenKind', v_resolution.token_kind,
      'stablePortalToken', v_resolution.stable_portal_token,
      'stablePortalPath', '/client/' || v_resolution.stable_portal_token || '/selling'
    )
  );
end;
$$;

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
set search_path = public, extensions
as $$
declare
  v_resolution record;
  v_result jsonb;
begin
  select * into v_resolution from public.bridge_resolve_private_listing_seller_portal_token(p_token);
  if not found or not v_resolution.token_valid then raise exception 'Seller portal link is invalid or inactive.'; end if;
  v_result := public.bridge_upload_private_listing_seller_document_phase1(
    v_resolution.legacy_token,
    p_requirement_key,
    p_document_name,
    p_storage_path,
    p_file_url,
    p_document_type,
    p_canonical_requirement_instance_id,
    p_category,
    p_access_token
  );
  if jsonb_typeof(v_result -> 'onboarding') = 'object' then
    v_result := jsonb_set(
      v_result,
      '{onboarding}',
      (v_result -> 'onboarding') - 'seller_portal_invite_token_hash',
      true
    );
  end if;
  return v_result;
end;
$$;

grant execute on function public.bridge_private_listing_seller_portal_access_state(text) to anon, authenticated;
grant execute on function public.bridge_set_private_listing_seller_portal_password(text, text) to anon, authenticated;
grant execute on function public.bridge_verify_private_listing_seller_portal_password(text, text) to anon, authenticated;
grant execute on function public.bridge_reset_private_listing_seller_portal_password(text) to authenticated;
grant execute on function public.bridge_private_listing_seller_portal_payload(text, text, boolean) to anon, authenticated;
grant execute on function public.bridge_upload_private_listing_seller_document(text, text, text, text, text, text, uuid, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
