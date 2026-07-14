set local request.jwt.claim.role = 'authenticated';

do $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_resolution record;
  v_invite jsonb;
  v_invite_token text;
  v_stored_hash text;
begin
  select * into v_onboarding
  from public.private_listing_seller_onboarding
  order by created_at asc
  limit 1;

  if not found then
    raise notice 'No seller onboarding fixture exists; token behavior assertions skipped.';
    return;
  end if;

  if nullif(trim(v_onboarding.seller_portal_token), '') is null then
    raise exception 'Stable seller portal token was not backfilled.';
  end if;

  select * into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(v_onboarding.token);
  if not found or v_resolution.token_kind <> 'legacy' or not v_resolution.token_valid then
    raise exception 'Legacy seller portal token no longer resolves.';
  end if;

  select * into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(v_onboarding.seller_portal_token);
  if not found or v_resolution.token_kind <> 'stable' or not v_resolution.token_valid then
    raise exception 'Stable seller portal token does not resolve.';
  end if;

  v_invite := public.bridge_issue_private_listing_seller_portal_invite(v_onboarding.seller_portal_token, 72);
  v_invite_token := v_invite ->> 'inviteToken';
  if nullif(v_invite_token, '') is null then
    raise exception 'Invitation issuance did not return a token.';
  end if;

  select seller_portal_invite_token_hash into v_stored_hash
  from public.private_listing_seller_onboarding
  where id = v_onboarding.id;
  if v_stored_hash = v_invite_token or v_stored_hash <> encode(digest(v_invite_token, 'sha256'), 'hex') then
    raise exception 'Invitation token was not stored exclusively as a SHA-256 hash.';
  end if;

  select * into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(v_invite_token);
  if not found or v_resolution.token_kind <> 'invite' or not v_resolution.token_valid then
    raise exception 'Fresh invitation token does not resolve.';
  end if;

  update public.private_listing_seller_onboarding
  set seller_portal_invite_consumed_at = now()
  where id = v_onboarding.id;

  select * into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(v_invite_token);
  if not found or v_resolution.token_valid then
    raise exception 'Consumed invitation token still resolves as valid.';
  end if;
end;
$$;
