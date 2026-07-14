set local request.jwt.claim.role = 'authenticated';

do $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_onboarding_id uuid;
  v_stable_token text;
  v_result jsonb;
  v_diagnostics jsonb;
  v_attempt integer;
  v_open_alert_count integer;
  v_resolved_alert_count integer;
begin
  select onboarding.* into v_onboarding
  from public.private_listing_seller_onboarding onboarding
  join public.private_listings listing on listing.id = onboarding.private_listing_id
  where public.bridge_private_listing_seller_portal_link_is_active(to_jsonb(onboarding), to_jsonb(listing))
  order by onboarding.created_at asc
  limit 1;

  if not found then
    raise notice 'No active seller portal fixture exists; Phase 4 behavior assertions skipped.';
    return;
  end if;

  v_onboarding_id := v_onboarding.id;
  v_stable_token := v_onboarding.seller_portal_token;
  update public.private_listing_seller_onboarding
  set seller_portal_password_hash = crypt('Phase4-test-password', gen_salt('bf')),
      seller_portal_link_active = true,
      seller_portal_failed_login_count = 0,
      seller_portal_last_failed_login_at = null,
      seller_portal_locked_until = null
  where id = v_onboarding_id;

  delete from public.private_listing_seller_portal_security_alerts
  where onboarding_id = v_onboarding_id;

  for v_attempt in 1..5 loop
    v_result := public.bridge_verify_private_listing_seller_portal_password(v_stable_token, 'incorrect-password');
  end loop;

  select count(*) into v_open_alert_count
  from public.private_listing_seller_portal_security_alerts
  where onboarding_id = v_onboarding_id
    and alert_type = 'temporary_lockout'
    and status = 'open';
  if v_open_alert_count <> 1 then
    raise exception 'Lockout monitoring did not create exactly one open alert.';
  end if;

  v_result := public.bridge_verify_private_listing_seller_portal_password(v_stable_token, 'incorrect-password');
  select count(*) into v_open_alert_count
  from public.private_listing_seller_portal_security_alerts
  where onboarding_id = v_onboarding_id
    and alert_type = 'temporary_lockout'
    and status = 'open';
  if v_open_alert_count <> 1 then
    raise exception 'Repeated attempts during lockout duplicated the open alert.';
  end if;

  v_diagnostics := public.bridge_private_listing_seller_portal_diagnostics(v_stable_token);
  if v_diagnostics ->> 'health' <> 'locked' or jsonb_array_length(v_diagnostics -> 'openAlerts') <> 1 then
    raise exception 'Diagnostics did not expose the active lockout.';
  end if;
  if v_diagnostics::text like '%token_hash%' or v_diagnostics::text like '%password_hash%' then
    raise exception 'Diagnostics exposed a protected hash field.';
  end if;

  update public.private_listing_seller_onboarding
  set seller_portal_locked_until = now() - interval '1 second'
  where id = v_onboarding_id;
  v_result := public.bridge_verify_private_listing_seller_portal_password(v_stable_token, 'Phase4-test-password');
  if not coalesce((v_result ->> 'ok')::boolean, false) then
    raise exception 'Successful recovery failed after lockout expiry.';
  end if;

  select count(*) into v_resolved_alert_count
  from public.private_listing_seller_portal_security_alerts
  where onboarding_id = v_onboarding_id
    and alert_type = 'temporary_lockout'
    and status = 'resolved';
  if v_resolved_alert_count <> 1 then
    raise exception 'Successful recovery did not resolve the lockout alert.';
  end if;

  v_diagnostics := public.bridge_private_listing_seller_portal_diagnostics(v_stable_token);
  if v_diagnostics ->> 'health' <> 'healthy' or jsonb_array_length(v_diagnostics -> 'openAlerts') <> 0 then
    raise exception 'Diagnostics did not recover to healthy after successful authentication.';
  end if;
end;
$$;
