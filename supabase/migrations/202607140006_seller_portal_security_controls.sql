begin;

alter table public.private_listing_seller_onboarding
  add column if not exists seller_portal_failed_login_count integer not null default 0,
  add column if not exists seller_portal_last_failed_login_at timestamptz,
  add column if not exists seller_portal_locked_until timestamptz,
  add column if not exists seller_portal_revoked_at timestamptz,
  add column if not exists seller_portal_revoked_by uuid,
  add column if not exists seller_portal_revocation_reason text;

comment on column public.private_listing_seller_onboarding.seller_portal_failed_login_count is
  'Consecutive failed password attempts within the current lockout window.';
comment on column public.private_listing_seller_onboarding.seller_portal_locked_until is
  'Temporary password-authentication lock. Existing authenticated sessions remain valid.';
comment on column public.private_listing_seller_onboarding.seller_portal_revoked_at is
  'Operational audit timestamp for explicit seller portal revocation.';

alter function public.bridge_private_listing_seller_portal_access_state(text)
  rename to bridge_private_listing_seller_portal_access_state_phase2;
alter function public.bridge_verify_private_listing_seller_portal_password(text, text)
  rename to bridge_verify_private_listing_seller_portal_password_phase2;
alter function public.bridge_reset_private_listing_seller_portal_password(text)
  rename to bridge_reset_private_listing_seller_portal_password_phase2;

revoke all on function public.bridge_private_listing_seller_portal_access_state_phase2(text) from public, anon, authenticated;
revoke all on function public.bridge_verify_private_listing_seller_portal_password_phase2(text, text) from public, anon, authenticated;
revoke all on function public.bridge_reset_private_listing_seller_portal_password_phase2(text) from public, anon, authenticated;

create or replace function public.bridge_private_listing_seller_portal_access_state(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_resolution record;
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_result jsonb;
begin
  select * into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(p_token);

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'token_invalid');
  end if;

  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where id = v_resolution.onboarding_id;

  v_result := public.bridge_private_listing_seller_portal_access_state_phase2(p_token);

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'linkActive', coalesce(v_onboarding.seller_portal_link_active, true),
    'locked', v_onboarding.seller_portal_locked_until is not null and v_onboarding.seller_portal_locked_until > now(),
    'lockedUntil', v_onboarding.seller_portal_locked_until,
    'failedLoginCount', coalesce(v_onboarding.seller_portal_failed_login_count, 0),
    'revokedAt', v_onboarding.seller_portal_revoked_at,
    'revocationReason', v_onboarding.seller_portal_revocation_reason,
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
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_result jsonb;
  v_failed_count integer;
  v_locked_until timestamptz;
begin
  select * into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(p_token);

  if not found or not v_resolution.token_valid then
    return jsonb_build_object('ok', false, 'reason', 'token_invalid');
  end if;

  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where id = v_resolution.onboarding_id
  for update;

  select * into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id;

  if not found or not public.bridge_private_listing_seller_portal_link_is_active(to_jsonb(v_onboarding), to_jsonb(v_listing)) then
    return jsonb_build_object('ok', false, 'reason', 'portal_inactive');
  end if;

  if v_onboarding.seller_portal_locked_until is not null and v_onboarding.seller_portal_locked_until > now() then
    perform public.bridge_log_client_portal_access_event(p_token, 'password_verify', 'failure', v_listing.id, 'temporarily_locked');
    return jsonb_build_object(
      'ok', false,
      'reason', 'temporarily_locked',
      'locked', true,
      'lockedUntil', v_onboarding.seller_portal_locked_until,
      'attemptsRemaining', 0
    );
  end if;

  if v_onboarding.seller_portal_password_hash is null then
    return jsonb_build_object('ok', false, 'reason', 'password_not_set');
  end if;

  if crypt(coalesce(p_password, ''), v_onboarding.seller_portal_password_hash) <> v_onboarding.seller_portal_password_hash then
    v_failed_count := case
      when v_onboarding.seller_portal_last_failed_login_at is null
        or v_onboarding.seller_portal_last_failed_login_at < now() - interval '30 minutes'
      then 1
      else coalesce(v_onboarding.seller_portal_failed_login_count, 0) + 1
    end;
    v_locked_until := case when v_failed_count >= 5 then now() + interval '15 minutes' else null end;

    update public.private_listing_seller_onboarding
    set seller_portal_failed_login_count = v_failed_count,
        seller_portal_last_failed_login_at = now(),
        seller_portal_locked_until = v_locked_until,
        updated_at = now()
    where id = v_onboarding.id;

    perform public.bridge_log_client_portal_access_event(
      p_token,
      'password_verify',
      'failure',
      v_listing.id,
      case when v_locked_until is null then 'password_incorrect' else 'lockout_started' end
    );

    return jsonb_build_object(
      'ok', false,
      'reason', case when v_locked_until is null then 'password_incorrect' else 'temporarily_locked' end,
      'locked', v_locked_until is not null,
      'lockedUntil', v_locked_until,
      'attemptsRemaining', greatest(0, 5 - v_failed_count)
    );
  end if;

  v_result := public.bridge_verify_private_listing_seller_portal_password_phase2(p_token, p_password);

  update public.private_listing_seller_onboarding
  set seller_portal_failed_login_count = 0,
      seller_portal_last_failed_login_at = null,
      seller_portal_locked_until = null,
      updated_at = now()
  where id = v_onboarding.id;

  return v_result || jsonb_build_object(
    'locked', false,
    'attemptsRemaining', 5
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
  select * into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(p_token);
  if not found or not v_resolution.token_valid or v_resolution.token_kind = 'invite' then
    raise exception 'Seller portal link is invalid or inactive.';
  end if;

  v_result := public.bridge_reset_private_listing_seller_portal_password_phase2(p_token);

  update public.private_listing_seller_onboarding
  set seller_portal_failed_login_count = 0,
      seller_portal_last_failed_login_at = null,
      seller_portal_locked_until = null,
      updated_at = now()
  where id = v_resolution.onboarding_id;

  return v_result;
end;
$$;

create or replace function public.bridge_manage_private_listing_seller_portal(
  p_token text,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_resolution record;
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_reason text := left(nullif(trim(coalesce(p_reason, '')), ''), 240);
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Authentication is required to manage seller portal access.';
  end if;
  if v_action not in ('revoke', 'reactivate', 'revoke_sessions') then
    raise exception 'Unsupported seller portal management action.';
  end if;

  select * into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(p_token);
  if not found or v_resolution.token_kind = 'invite' then
    raise exception 'Seller portal link is invalid.';
  end if;

  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where id = v_resolution.onboarding_id
  for update;

  if v_action = 'revoke' then
    update public.private_listing_seller_onboarding
    set seller_portal_link_active = false,
        seller_portal_revoked_at = now(),
        seller_portal_revoked_by = auth.uid(),
        seller_portal_revocation_reason = coalesce(v_reason, 'Revoked by property representative'),
        seller_portal_access_token_hash = null,
        seller_portal_access_token_expires_at = null,
        seller_portal_invite_token_hash = null,
        seller_portal_invite_consumed_at = now(),
        updated_at = now()
    where id = v_onboarding.id;
  elsif v_action = 'reactivate' then
    update public.private_listing_seller_onboarding
    set seller_portal_link_active = true,
        seller_portal_revoked_at = null,
        seller_portal_revoked_by = null,
        seller_portal_revocation_reason = null,
        seller_portal_failed_login_count = 0,
        seller_portal_last_failed_login_at = null,
        seller_portal_locked_until = null,
        updated_at = now()
    where id = v_onboarding.id;
  else
    update public.private_listing_seller_onboarding
    set seller_portal_access_token_hash = null,
        seller_portal_access_token_expires_at = null,
        updated_at = now()
    where id = v_onboarding.id;
  end if;

  perform public.bridge_log_client_portal_access_event(
    v_resolution.stable_portal_token,
    'portal_' || v_action,
    'success',
    v_onboarding.private_listing_id,
    coalesce(v_reason, v_action)
  );

  select onboarding.* into v_onboarding
  from public.private_listing_seller_onboarding onboarding
  where onboarding.id = v_resolution.onboarding_id;

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'linkActive', coalesce(v_onboarding.seller_portal_link_active, true),
    'revokedAt', v_onboarding.seller_portal_revoked_at,
    'revocationReason', v_onboarding.seller_portal_revocation_reason,
    'stablePortalToken', v_onboarding.seller_portal_token,
    'stablePortalPath', '/client/' || v_onboarding.seller_portal_token || '/selling',
    'sessionsRevoked', v_action in ('revoke', 'revoke_sessions')
  );
end;
$$;

grant execute on function public.bridge_private_listing_seller_portal_access_state(text) to anon, authenticated;
grant execute on function public.bridge_verify_private_listing_seller_portal_password(text, text) to anon, authenticated;
grant execute on function public.bridge_reset_private_listing_seller_portal_password(text) to authenticated;
grant execute on function public.bridge_manage_private_listing_seller_portal(text, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
