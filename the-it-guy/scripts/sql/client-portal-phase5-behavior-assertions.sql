do $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_onboarding_id uuid;
  v_stable_token text;
  v_request jsonb;
  v_second_request jsonb;
  v_complete jsonb;
  v_diagnostics jsonb;
  v_recovery_token text;
  v_stored_hash text;
  v_resolution record;
  v_reuse_rejected boolean := false;
begin
  select onboarding.* into v_onboarding
  from public.private_listing_seller_onboarding onboarding
  join public.private_listings listing on listing.id = onboarding.private_listing_id
  where public.bridge_private_listing_seller_portal_link_is_active(to_jsonb(onboarding), to_jsonb(listing))
  order by onboarding.created_at asc
  limit 1;

  if not found then
    raise notice 'No active seller portal fixture exists; Phase 5 behavior assertions skipped.';
    return;
  end if;

  v_onboarding_id := v_onboarding.id;
  v_stable_token := v_onboarding.seller_portal_token;
  update public.private_listing_seller_onboarding
  set seller_portal_password_hash = crypt('Phase5-old-password', gen_salt('bf')),
      seller_portal_link_active = true,
      seller_portal_recovery_token_hash = null,
      seller_portal_recovery_consumed_at = null,
      seller_portal_recovery_last_requested_at = null,
      seller_portal_recovery_window_started_at = null,
      seller_portal_recovery_request_count = 0,
      form_data = coalesce(form_data, '{}'::jsonb) || jsonb_build_object('sellerEmail', 'phase5-test@example.com')
  where id = v_onboarding_id;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  v_request := public.bridge_request_private_listing_seller_portal_recovery(v_stable_token);
  if not coalesce((v_request ->> 'deliveryRequired')::boolean, false) then
    raise exception 'Valid recovery request was not issued.';
  end if;
  v_recovery_token := v_request ->> 'recoveryToken';
  if nullif(v_recovery_token, '') is null then
    raise exception 'Recovery issuance did not return a token to the service role.';
  end if;

  select seller_portal_recovery_token_hash into v_stored_hash
  from public.private_listing_seller_onboarding
  where id = v_onboarding_id;
  if v_stored_hash = v_recovery_token or v_stored_hash <> encode(digest(v_recovery_token, 'sha256'), 'hex') then
    raise exception 'Recovery token was not stored exclusively as a SHA-256 hash.';
  end if;

  select * into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(v_recovery_token);
  if not found or v_resolution.token_kind <> 'recovery' or not v_resolution.token_valid then
    raise exception 'Fresh recovery token does not resolve.';
  end if;

  v_second_request := public.bridge_request_private_listing_seller_portal_recovery(v_stable_token);
  if coalesce((v_second_request ->> 'deliveryRequired')::boolean, false) or v_second_request ->> 'reason' <> 'cooldown' then
    raise exception 'Recovery resend cooldown was not enforced.';
  end if;

  perform set_config('request.jwt.claim.role', 'anon', true);
  v_complete := public.bridge_complete_private_listing_seller_portal_recovery(v_recovery_token, 'Phase5-new-password');
  if not coalesce((v_complete ->> 'ok')::boolean, false)
    or v_complete ->> 'stablePortalToken' <> v_stable_token
    or not coalesce((v_complete ->> 'recoveryConsumed')::boolean, false)
  then
    raise exception 'Password recovery did not complete or preserve the stable portal token.';
  end if;

  select * into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(v_recovery_token);
  if not found or v_resolution.token_valid then
    raise exception 'Consumed recovery token still resolves as valid.';
  end if;

  begin
    perform public.bridge_complete_private_listing_seller_portal_recovery(v_recovery_token, 'Phase5-another-password');
  exception when others then
    v_reuse_rejected := true;
  end;
  if not v_reuse_rejected then
    raise exception 'A recovery token could be reused.';
  end if;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_diagnostics := public.bridge_private_listing_seller_portal_diagnostics(v_stable_token);
  if v_diagnostics -> 'recovery' ->> 'status' <> 'consumed' then
    raise exception 'Diagnostics did not expose consumed recovery state.';
  end if;
end;
$$;
