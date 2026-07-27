begin;

create or replace function public.bridge_private_listing_seller_portal_core_payload_phase1(
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
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_transaction_id uuid;
  v_transaction jsonb := 'null'::jsonb;
  v_access_token text := nullif(trim(coalesce(p_access_token, '')), '');
  v_access_hash text := case when v_access_token is null then null else encode(digest(v_access_token, 'sha256'), 'hex') end;
  v_access_granted boolean := false;
  v_session_expired boolean := false;
begin
  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where token = nullif(trim(p_token), '')
  limit 1;

  if not found then
    perform public.bridge_log_client_portal_access_event(p_token, 'core_payload', 'failure', null, 'token_invalid');
    return null;
  end if;

  select * into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id
  limit 1;

  if not found or not public.bridge_private_listing_seller_portal_link_is_active(to_jsonb(v_onboarding), to_jsonb(v_listing)) then
    perform public.bridge_log_client_portal_access_event(p_token, 'core_payload', 'failure', v_onboarding.private_listing_id, 'portal_inactive');
    return null;
  end if;

  v_session_expired := v_access_token is not null and (
    v_onboarding.seller_portal_access_token_hash is distinct from v_access_hash
    or v_onboarding.seller_portal_access_token_expires_at is null
    or v_onboarding.seller_portal_access_token_expires_at <= now()
  );
  v_access_granted :=
    (not p_require_access and v_onboarding.seller_portal_password_hash is null)
    or (
      v_access_hash is not null
      and v_onboarding.seller_portal_access_token_hash = v_access_hash
      and v_onboarding.seller_portal_access_token_expires_at > now()
    );

  if p_require_access and not v_access_granted then
    perform public.bridge_log_client_portal_access_event(
      p_token,
      'core_payload',
      'challenge',
      v_listing.id,
      case when v_session_expired then 'session_expired' else 'authentication_required' end
    );
    return jsonb_build_object(
      'authRequired', true,
      'sessionExpired', v_session_expired,
      'reason', case when v_session_expired then 'session_expired' else 'authentication_required' end,
      'passwordSet', v_onboarding.seller_portal_password_hash is not null,
      'passwordRequired', v_onboarding.seller_portal_password_hash is null,
      'sellerEmail', lower(nullif(trim(coalesce(
        v_onboarding.form_data ->> 'sellerEmail',
        v_onboarding.form_data ->> 'email',
        v_onboarding.form_data ->> 'contactEmail',
        ''
      )), '')),
      'propertyTitle', nullif(trim(coalesce(v_listing.title, v_listing.formatted_address, v_listing.address_line_1, 'your property')), ''),
      'token', v_onboarding.token
    );
  end if;

  perform public.bridge_log_client_portal_access_event(p_token, 'core_payload', 'success', v_listing.id, 'access_granted');

  begin
    if to_regprocedure('public.bridge_resolve_private_listing_transaction_id(uuid)') is not null
      and to_regclass('public.transactions') is not null then
      v_transaction_id := public.bridge_resolve_private_listing_transaction_id(v_listing.id);
      if v_transaction_id is not null then
        select to_jsonb(tx)
          into v_transaction
        from public.transactions tx
        where tx.id = v_transaction_id
        limit 1;
      end if;
    end if;
  exception
    when undefined_column or undefined_table then
      v_transaction := 'null'::jsonb;
  end;

  return jsonb_build_object(
    'listing', to_jsonb(v_listing),
    'onboarding', to_jsonb(v_onboarding) - 'seller_portal_password_hash' - 'seller_portal_access_token_hash' - 'seller_portal_invite_token_hash',
    'transaction', v_transaction,
    'requirements', '[]'::jsonb,
    'documents', '[]'::jsonb,
    'appointments', '[]'::jsonb,
    'mandatePacket', 'null'::jsonb,
    'corePayload', true,
    'portalAccess', jsonb_build_object(
      'passwordSet', v_onboarding.seller_portal_password_hash is not null,
      'accessGranted', true,
      'expiresAt', v_onboarding.seller_portal_access_token_expires_at,
      'portalLinkExpiresAt', v_onboarding.seller_portal_link_expires_at
    )
  );
end;
$$;

revoke all on function public.bridge_private_listing_seller_portal_core_payload_phase1(text, text, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.bridge_private_listing_seller_portal_core_payload(
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

  v_result := public.bridge_private_listing_seller_portal_core_payload_phase1(
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

revoke all on function public.bridge_private_listing_seller_portal_core_payload(text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.bridge_private_listing_seller_portal_core_payload(text, text, boolean)
  to anon, authenticated;

comment on function public.bridge_private_listing_seller_portal_core_payload(text, text, boolean) is
  'Fast seller portal first-entry payload. Resolves token, access state, listing, onboarding, and transaction context only; optional documents, appointments, mandate artifacts, media, activity, and notifications hydrate after first paint.';

notify pgrst, 'reload schema';

commit;
