begin;

alter table public.private_listing_seller_onboarding
  add column if not exists seller_portal_recovery_token_hash text,
  add column if not exists seller_portal_recovery_created_at timestamptz,
  add column if not exists seller_portal_recovery_expires_at timestamptz,
  add column if not exists seller_portal_recovery_consumed_at timestamptz,
  add column if not exists seller_portal_recovery_last_requested_at timestamptz,
  add column if not exists seller_portal_recovery_window_started_at timestamptz,
  add column if not exists seller_portal_recovery_request_count integer not null default 0;

create index if not exists private_listing_seller_onboarding_recovery_hash_idx
  on public.private_listing_seller_onboarding (seller_portal_recovery_token_hash)
  where seller_portal_recovery_token_hash is not null;

comment on column public.private_listing_seller_onboarding.seller_portal_recovery_token_hash is
  'SHA-256 hash of the current one-time password recovery token. Plaintext recovery tokens are never persisted.';
comment on column public.private_listing_seller_onboarding.seller_portal_recovery_expires_at is
  'Password recovery expiry. Recovery links default to 30 minutes and do not affect stable portal access.';

alter function public.bridge_resolve_private_listing_seller_portal_token(text)
  rename to bridge_resolve_private_listing_seller_portal_token_phase4;
revoke all on function public.bridge_resolve_private_listing_seller_portal_token_phase4(text) from public, anon, authenticated;

create or replace function public.bridge_resolve_private_listing_seller_portal_token(p_token text)
returns table (
  onboarding_id uuid,
  legacy_token text,
  stable_portal_token text,
  token_kind text,
  token_valid boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_token_hash text := case when v_token is null then null else encode(digest(v_token, 'sha256'), 'hex') end;
begin
  return query
  select resolved.onboarding_id, resolved.legacy_token, resolved.stable_portal_token, resolved.token_kind, resolved.token_valid
  from public.bridge_resolve_private_listing_seller_portal_token_phase4(v_token) resolved;
  if found then return; end if;

  return query
  select
    onboarding.id,
    onboarding.token,
    onboarding.seller_portal_token,
    'recovery'::text,
    onboarding.seller_portal_recovery_consumed_at is null
      and onboarding.seller_portal_recovery_expires_at is not null
      and onboarding.seller_portal_recovery_expires_at > now()
  from public.private_listing_seller_onboarding onboarding
  where onboarding.seller_portal_recovery_token_hash = v_token_hash
  limit 1;
end;
$$;

revoke all on function public.bridge_resolve_private_listing_seller_portal_token(text) from public, anon, authenticated;

create or replace function public.bridge_request_private_listing_seller_portal_recovery(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_resolution record;
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_recovery_token text := 'seller-recovery-' || encode(gen_random_bytes(32), 'hex');
  v_recovery_hash text := encode(digest(v_recovery_token, 'sha256'), 'hex');
  v_expires_at timestamptz := now() + interval '30 minutes';
  v_email text;
  v_seller_name text;
  v_window_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role is required to request seller portal recovery.';
  end if;

  select * into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(p_token);
  if not found or not v_resolution.token_valid or v_resolution.token_kind not in ('stable', 'legacy') then
    return jsonb_build_object('ok', true, 'deliveryRequired', false, 'reason', 'unavailable');
  end if;

  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where id = v_resolution.onboarding_id
  for update;
  select * into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id;

  v_email := lower(nullif(trim(coalesce(
    v_onboarding.form_data ->> 'sellerEmail',
    v_onboarding.form_data ->> 'email',
    v_onboarding.form_data ->> 'contactEmail',
    ''
  )), ''));
  v_seller_name := nullif(trim(coalesce(
    v_onboarding.form_data ->> 'sellerName',
    v_onboarding.form_data ->> 'fullName',
    concat_ws(' ', v_onboarding.form_data ->> 'sellerFirstName', v_onboarding.form_data ->> 'sellerSurname'),
    'Seller'
  )), '');

  if not found
    or not public.bridge_private_listing_seller_portal_link_is_active(to_jsonb(v_onboarding), to_jsonb(v_listing))
    or v_onboarding.seller_portal_password_hash is null
    or v_email is null
  then
    return jsonb_build_object('ok', true, 'deliveryRequired', false, 'reason', 'unavailable');
  end if;

  if v_onboarding.seller_portal_recovery_last_requested_at is not null
    and v_onboarding.seller_portal_recovery_last_requested_at > now() - interval '2 minutes'
  then
    return jsonb_build_object('ok', true, 'deliveryRequired', false, 'reason', 'cooldown');
  end if;

  v_window_count := case
    when v_onboarding.seller_portal_recovery_window_started_at is null
      or v_onboarding.seller_portal_recovery_window_started_at <= now() - interval '1 hour'
    then 0
    else coalesce(v_onboarding.seller_portal_recovery_request_count, 0)
  end;
  if v_window_count >= 3 then
    return jsonb_build_object('ok', true, 'deliveryRequired', false, 'reason', 'rate_limited');
  end if;

  update public.private_listing_seller_onboarding
  set seller_portal_recovery_token_hash = v_recovery_hash,
      seller_portal_recovery_created_at = now(),
      seller_portal_recovery_expires_at = v_expires_at,
      seller_portal_recovery_consumed_at = null,
      seller_portal_recovery_last_requested_at = now(),
      seller_portal_recovery_window_started_at = case
        when seller_portal_recovery_window_started_at is null
          or seller_portal_recovery_window_started_at <= now() - interval '1 hour'
        then now()
        else seller_portal_recovery_window_started_at
      end,
      seller_portal_recovery_request_count = v_window_count + 1,
      updated_at = now()
  where id = v_onboarding.id;

  perform public.bridge_log_client_portal_access_event(
    v_resolution.stable_portal_token,
    'password_recovery_requested',
    'success',
    v_listing.id,
    'recovery_email_queued'
  );

  return jsonb_build_object(
    'ok', true,
    'deliveryRequired', true,
    'recoveryToken', v_recovery_token,
    'expiresAt', v_expires_at,
    'sellerEmail', v_email,
    'sellerName', coalesce(v_seller_name, 'Seller'),
    'propertyTitle', nullif(trim(coalesce(v_listing.title, v_listing.formatted_address, v_listing.address_line_1, 'your property')), ''),
    'listingId', v_listing.id,
    'organisationId', v_listing.organisation_id,
    'stablePortalToken', v_onboarding.seller_portal_token
  );
end;
$$;

create or replace function public.bridge_complete_private_listing_seller_portal_recovery(
  p_token text,
  p_password text
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
  v_access_token text := encode(gen_random_bytes(32), 'hex');
  v_access_hash text := encode(digest(v_access_token, 'sha256'), 'hex');
  v_access_expires_at timestamptz := now() + interval '12 hours';
begin
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'Password must be at least 8 characters.';
  end if;

  select * into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(p_token);
  if not found or not v_resolution.token_valid or v_resolution.token_kind <> 'recovery' then
    raise exception 'This password recovery link is invalid, expired, or already used.';
  end if;

  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where id = v_resolution.onboarding_id
  for update;
  select * into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id;
  if not found or not public.bridge_private_listing_seller_portal_link_is_active(to_jsonb(v_onboarding), to_jsonb(v_listing)) then
    raise exception 'This seller portal is inactive.';
  end if;

  update public.private_listing_seller_onboarding
  set seller_portal_password_hash = crypt(p_password, gen_salt('bf')),
      seller_portal_password_set_at = now(),
      seller_portal_last_login_at = now(),
      seller_portal_access_token_hash = v_access_hash,
      seller_portal_access_token_expires_at = v_access_expires_at,
      seller_portal_failed_login_count = 0,
      seller_portal_last_failed_login_at = null,
      seller_portal_locked_until = null,
      seller_portal_recovery_consumed_at = now(),
      updated_at = now()
  where id = v_onboarding.id;

  update public.private_listing_seller_portal_security_alerts
  set status = 'resolved',
      resolved_at = now(),
      updated_at = now(),
      details = details || jsonb_build_object('resolution', 'password_recovery_completed')
  where onboarding_id = v_onboarding.id
    and status = 'open';

  perform public.bridge_log_client_portal_access_event(
    p_token,
    'password_recovery_completed',
    'success',
    v_listing.id,
    'password_and_session_rotated'
  );

  return jsonb_build_object(
    'ok', true,
    'accessToken', v_access_token,
    'expiresAt', v_access_expires_at,
    'passwordSet', true,
    'recoveryConsumed', true,
    'stablePortalToken', v_onboarding.seller_portal_token,
    'stablePortalPath', '/client/' || v_onboarding.seller_portal_token || '/selling'
  );
end;
$$;

alter function public.bridge_private_listing_seller_portal_diagnostics(text)
  rename to bridge_private_listing_seller_portal_diagnostics_phase4;
revoke all on function public.bridge_private_listing_seller_portal_diagnostics_phase4(text) from public, anon, authenticated;

create or replace function public.bridge_private_listing_seller_portal_diagnostics(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_resolution record;
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_result jsonb;
  v_recovery_status text;
begin
  v_result := public.bridge_private_listing_seller_portal_diagnostics_phase4(p_token);
  select * into v_resolution from public.bridge_resolve_private_listing_seller_portal_token(p_token);
  if not found then return v_result; end if;
  select * into v_onboarding from public.private_listing_seller_onboarding where id = v_resolution.onboarding_id;
  v_recovery_status := case
    when v_onboarding.seller_portal_recovery_token_hash is null then 'not_requested'
    when v_onboarding.seller_portal_recovery_consumed_at is not null then 'consumed'
    when v_onboarding.seller_portal_recovery_expires_at <= now() then 'expired'
    else 'pending'
  end;
  return v_result || jsonb_build_object(
    'recovery', jsonb_build_object(
      'status', v_recovery_status,
      'createdAt', v_onboarding.seller_portal_recovery_created_at,
      'expiresAt', v_onboarding.seller_portal_recovery_expires_at,
      'consumedAt', v_onboarding.seller_portal_recovery_consumed_at,
      'lastRequestedAt', v_onboarding.seller_portal_recovery_last_requested_at
    )
  );
end;
$$;

grant execute on function public.bridge_request_private_listing_seller_portal_recovery(text) to service_role;
grant execute on function public.bridge_complete_private_listing_seller_portal_recovery(text, text) to anon, authenticated;
grant execute on function public.bridge_private_listing_seller_portal_diagnostics(text) to authenticated;
grant execute on function public.bridge_log_client_portal_access_event(text, text, text, uuid, text) to service_role;

notify pgrst, 'reload schema';

commit;
