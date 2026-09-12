begin;

-- Journey polling must not hydrate the complete seller portal merely to prove
-- a session and resolve its transaction. The full portal payload includes
-- onboarding, document, appointment and branding readers, which made the
-- lightweight journey RPC compete with unrelated work.
create or replace function journey_private.resolve_seller_portal_context(
  p_token text,
  p_access_token text
)
returns table (listing_id uuid, transaction_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resolution record;
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_access_hash text;
begin
  if nullif(btrim(p_token), '') is null
    or nullif(btrim(p_access_token), '') is null then
    raise exception 'Seller portal access is required.' using errcode = '42501';
  end if;

  select * into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(p_token);

  if not found or not coalesce(v_resolution.token_valid, false) then
    raise exception 'Seller portal access is required.' using errcode = '42501';
  end if;

  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where id = v_resolution.onboarding_id
  limit 1;

  select * into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id
  limit 1;

  if not found
    or not public.bridge_private_listing_seller_portal_link_is_active(
      to_jsonb(v_onboarding),
      to_jsonb(v_listing)
    ) then
    raise exception 'Seller portal access is required.' using errcode = '42501';
  end if;

  v_access_hash := encode(extensions.digest(btrim(p_access_token), 'sha256'), 'hex');
  if v_onboarding.seller_portal_access_token_hash is distinct from v_access_hash
    or v_onboarding.seller_portal_access_token_expires_at is null
    or v_onboarding.seller_portal_access_token_expires_at <= now() then
    raise exception 'Seller portal access is required.' using errcode = '42501';
  end if;

  listing_id := v_listing.id;
  transaction_id := public.bridge_resolve_private_listing_transaction_id(v_listing.id);
  return next;
end;
$$;

revoke all on function journey_private.resolve_seller_portal_context(text, text)
  from public, anon, authenticated, service_role;

create or replace function public.bridge_read_seller_shared_matter_journey(
  p_token text,
  p_access_token text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_context record;
begin
  select * into v_context
  from journey_private.resolve_seller_portal_context(p_token, p_access_token);

  if not found then
    raise exception 'Seller portal access is required.' using errcode = '42501';
  end if;

  if v_context.transaction_id is null then
    return null;
  end if;

  return journey_private.read_client_matter_journey(v_context.transaction_id);
end;
$$;

-- Conversation follows the same authenticated resolver. This prevents the
-- 15/30-second feed refresh from rehydrating documents and appointments.
create or replace function journey_private.conversation_actor(
  p_transaction_id uuid,
  p_seller_token text,
  p_seller_session text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context record;
  v_role text;
  v_name text;
  v_link uuid;
begin
  if nullif(p_seller_token, '') is not null then
    select * into v_context
    from journey_private.resolve_seller_portal_context(p_seller_token, p_seller_session);

    if not found or v_context.transaction_id is distinct from p_transaction_id then
      raise exception 'Matter access denied.' using errcode = '42501';
    end if;

    return jsonb_build_object(
      'key', 'seller:' || v_context.listing_id,
      'role', 'seller',
      'name', 'Seller',
      'professional', false
    );
  end if;

  if nullif(public.bridge_client_portal_request_token(), '') is not null then
    if not coalesce(public.bridge_has_client_portal_token_transaction_access(p_transaction_id), false) then
      raise exception 'Portal access required.' using errcode = '42501';
    end if;
    select id into v_link
    from public.client_portal_links
    where transaction_id = p_transaction_id
      and token = public.bridge_client_portal_request_token()
      and is_active is true
    limit 1;
    if v_link is null then
      raise exception 'Portal access required.' using errcode = '42501';
    end if;
    return jsonb_build_object('key', 'buyer:' || v_link, 'role', 'buyer', 'name', 'Buyer', 'professional', false);
  end if;

  if auth.uid() is null
    or not coalesce(public.bridge_can_access_transaction_spine(p_transaction_id), false) then
    raise exception 'Matter access denied.' using errcode = '42501';
  end if;

  select lower(p.role), coalesce(nullif(to_jsonb(p) ->> 'full_name', ''), initcap(p.role))
    into v_role, v_name
  from public.profiles p
  where p.id = auth.uid();

  if v_role is null or v_role not in (
    'attorney', 'conveyancer', 'agent', 'developer', 'bond_originator',
    'internal_admin', 'admin', 'agency_admin'
  ) then
    raise exception 'Professional matter access required.' using errcode = '42501';
  end if;

  return jsonb_build_object('key', 'user:' || auth.uid(), 'role', v_role, 'name', v_name, 'professional', true);
end;
$$;

revoke all on function public.bridge_read_seller_shared_matter_journey(text, text)
  from public;
grant execute on function public.bridge_read_seller_shared_matter_journey(text, text)
  to anon, authenticated;

revoke all on function journey_private.conversation_actor(uuid, text, text)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
