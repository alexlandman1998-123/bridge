set local request.jwt.claim.role = 'authenticated';

do $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_result jsonb;
  v_onboarding_id uuid;
  v_original_stable_token text;
  v_attempt integer;
begin
  select onboarding.* into v_onboarding
  from public.private_listing_seller_onboarding onboarding
  join public.private_listings listing on listing.id = onboarding.private_listing_id
  where public.bridge_private_listing_seller_portal_link_is_active(to_jsonb(onboarding), to_jsonb(listing))
  order by onboarding.created_at asc
  limit 1;

  if not found then
    raise notice 'No active seller portal fixture exists; Phase 3 behavior assertions skipped.';
    return;
  end if;

  v_original_stable_token := v_onboarding.seller_portal_token;
  v_onboarding_id := v_onboarding.id;
  update public.private_listing_seller_onboarding
  set seller_portal_password_hash = crypt('Phase3-test-password', gen_salt('bf')),
      seller_portal_link_active = true,
      seller_portal_failed_login_count = 0,
      seller_portal_last_failed_login_at = null,
      seller_portal_locked_until = null
  where id = v_onboarding_id;

  for v_attempt in 1..5 loop
    v_result := public.bridge_verify_private_listing_seller_portal_password(
      v_original_stable_token,
      'incorrect-password'
    );
  end loop;

  if v_result ->> 'reason' <> 'temporarily_locked' or not coalesce((v_result ->> 'locked')::boolean, false) then
    raise exception 'Five failed passwords did not start a temporary lockout.';
  end if;

  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where id = v_onboarding_id;
  if v_onboarding.seller_portal_failed_login_count <> 5 or v_onboarding.seller_portal_locked_until <= now() then
    raise exception 'Lockout counters were not persisted.';
  end if;

  v_result := public.bridge_verify_private_listing_seller_portal_password(
    v_original_stable_token,
    'Phase3-test-password'
  );
  if v_result ->> 'reason' <> 'temporarily_locked' then
    raise exception 'A correct password bypassed an active lockout.';
  end if;

  update public.private_listing_seller_onboarding
  set seller_portal_locked_until = now() - interval '1 second'
  where id = v_onboarding_id;
  v_result := public.bridge_verify_private_listing_seller_portal_password(
    v_original_stable_token,
    'Phase3-test-password'
  );
  if not coalesce((v_result ->> 'ok')::boolean, false) then
    raise exception 'Correct authentication did not recover after lockout expiry.';
  end if;

  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where id = v_onboarding_id;
  if v_onboarding.seller_portal_failed_login_count <> 0 or v_onboarding.seller_portal_locked_until is not null then
    raise exception 'Successful authentication did not clear failed-login state.';
  end if;

  v_result := public.bridge_manage_private_listing_seller_portal(v_original_stable_token, 'revoke', 'Phase 3 test');
  if coalesce((v_result ->> 'linkActive')::boolean, true) then
    raise exception 'Portal revocation did not disable the link.';
  end if;

  v_result := public.bridge_private_listing_seller_portal_access_state(v_original_stable_token);
  if coalesce((v_result ->> 'linkActive')::boolean, true) or v_result ->> 'revokedAt' is null then
    raise exception 'Revoked state is not visible to portal management.';
  end if;

  v_result := public.bridge_manage_private_listing_seller_portal(v_original_stable_token, 'reactivate', null);
  if not coalesce((v_result ->> 'linkActive')::boolean, false) then
    raise exception 'Portal reactivation did not restore link access.';
  end if;
  if v_result ->> 'stablePortalToken' <> v_original_stable_token then
    raise exception 'Portal management rotated the stable portal identifier.';
  end if;

  v_result := public.bridge_manage_private_listing_seller_portal(v_original_stable_token, 'revoke_sessions', null);
  if not coalesce((v_result ->> 'sessionsRevoked')::boolean, false) then
    raise exception 'Session revocation did not report success.';
  end if;
end;
$$;
