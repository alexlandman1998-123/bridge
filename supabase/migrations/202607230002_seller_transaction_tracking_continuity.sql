begin;

-- A seller portal starts at the listing, while the sale itself advances on
-- transactions. Keep the two records linked without allowing an onboarding
-- refresh to erase the transaction handoff.
create or replace function public.bridge_sync_seller_portal_transaction_context(
  p_transaction_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_transaction record;
  v_transaction record;
  v_onboarding record;
  v_listing_json jsonb := '{}'::jsonb;
  v_listing_id uuid;
  v_resolved_transaction_id uuid;
  v_seller_lead_id uuid;
  v_seller_lead_text text;
  v_client_email text;
  v_updated_count integer := 0;
begin
  if p_transaction_id is null
    or to_regclass('public.transactions') is null
    or to_regclass('public.private_listing_seller_onboarding') is null
    or to_regclass('public.client_portal_contexts') is null then
    return false;
  end if;

  select
    tx.id,
    tx.organisation_id,
    to_jsonb(tx) as row_json
  into v_requested_transaction
  from public.transactions tx
  where tx.id = p_transaction_id;

  if not found then
    return false;
  end if;

  begin
    v_listing_id := nullif(trim(coalesce(
      v_requested_transaction.row_json ->> 'listing_id',
      v_requested_transaction.row_json ->> 'private_listing_id',
      ''
    )), '')::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  if v_listing_id is null then
    return false;
  end if;

  -- Never let an update to an older transaction steal a seller context from
  -- the newest transaction attached to the same private listing.
  if to_regprocedure('public.bridge_resolve_private_listing_transaction_id(uuid)') is not null then
    v_resolved_transaction_id := public.bridge_resolve_private_listing_transaction_id(v_listing_id);
  end if;
  v_resolved_transaction_id := coalesce(v_resolved_transaction_id, p_transaction_id);

  select
    tx.id,
    tx.organisation_id,
    to_jsonb(tx) as row_json
  into v_transaction
  from public.transactions tx
  where tx.id = v_resolved_transaction_id;

  if not found then
    return false;
  end if;

  select
    onboarding.token,
    onboarding.form_data
  into v_onboarding
  from public.private_listing_seller_onboarding onboarding
  where onboarding.private_listing_id = v_listing_id
  order by onboarding.updated_at desc nulls last, onboarding.created_at desc nulls last
  limit 1;

  if not found or nullif(trim(coalesce(v_onboarding.token, '')), '') is null then
    return false;
  end if;

  if to_regclass('public.private_listings') is not null then
    select to_jsonb(listing)
      into v_listing_json
    from public.private_listings listing
    where listing.id = v_listing_id;
  end if;

  v_seller_lead_text := nullif(trim(coalesce(
    v_listing_json ->> 'seller_lead_id',
    v_listing_json ->> 'originating_crm_lead_id',
    ''
  )), '');
  if v_seller_lead_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_seller_lead_id := v_seller_lead_text::uuid;
  end if;

  v_client_email := lower(nullif(trim(coalesce(
    v_onboarding.form_data ->> 'sellerEmail',
    v_onboarding.form_data ->> 'email',
    v_onboarding.form_data ->> 'contactEmail',
    ''
  )), ''));

  update public.client_portal_contexts portal_context
     set organisation_id = coalesce(v_transaction.organisation_id, portal_context.organisation_id),
         client_email = coalesce(v_client_email, portal_context.client_email),
         context_type = 'selling',
         transaction_id = v_transaction.id,
         seller_lead_id = coalesce(v_seller_lead_id, portal_context.seller_lead_id),
         listing_id = v_listing_id::text,
         status = case
           when lower(coalesce(portal_context.status, '')) in ('revoked', 'cancelled', 'archived') then portal_context.status
           else 'active'
         end,
         updated_at = now()
   where portal_context.seller_workspace_token = v_onboarding.token
      or (
        lower(coalesce(portal_context.context_type, '')) = 'selling'
        and portal_context.listing_id = v_listing_id::text
      );
  get diagnostics v_updated_count = row_count;

  if v_updated_count = 0 then
    insert into public.client_portal_contexts (
      organisation_id,
      client_email,
      context_type,
      transaction_id,
      seller_lead_id,
      listing_id,
      seller_workspace_token,
      status,
      updated_at
    )
    values (
      v_transaction.organisation_id,
      v_client_email,
      'selling',
      v_transaction.id,
      v_seller_lead_id,
      v_listing_id::text,
      v_onboarding.token,
      'active',
      now()
    );
  end if;

  return true;
exception
  when undefined_table or undefined_column then
    return false;
end;
$$;

create or replace function public.bridge_sync_seller_portal_transaction_context_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.bridge_sync_seller_portal_transaction_context(new.id);
  return new;
end;
$$;

drop trigger if exists trg_sync_seller_portal_transaction_context on public.transactions;
create trigger trg_sync_seller_portal_transaction_context
after insert or update of listing_id on public.transactions
for each row
when (new.listing_id is not null)
execute function public.bridge_sync_seller_portal_transaction_context_trigger();

-- Seller onboarding can create its portal context after a transaction already
-- exists. Catch that ordering as well, without recursively reprocessing the
-- context update performed by the synchroniser above.
create or replace function public.bridge_sync_seller_portal_transaction_context_from_portal_context_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing_id uuid;
  v_transaction_id uuid;
begin
  if pg_trigger_depth() > 1
    or lower(coalesce(new.context_type, '')) <> 'selling' then
    return new;
  end if;

  begin
    v_listing_id := nullif(trim(coalesce(new.listing_id, '')), '')::uuid;
  exception
    when invalid_text_representation then
      return new;
  end;

  if v_listing_id is null
    or to_regprocedure('public.bridge_resolve_private_listing_transaction_id(uuid)') is null then
    return new;
  end if;

  v_transaction_id := public.bridge_resolve_private_listing_transaction_id(v_listing_id);
  if v_transaction_id is not null then
    perform public.bridge_sync_seller_portal_transaction_context(v_transaction_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_seller_portal_transaction_context_from_portal_context on public.client_portal_contexts;
create trigger trg_sync_seller_portal_transaction_context_from_portal_context
after insert or update of listing_id, seller_workspace_token, context_type on public.client_portal_contexts
for each row
execute function public.bridge_sync_seller_portal_transaction_context_from_portal_context_trigger();

-- Repair current seller workspaces as well as future transaction creation.
do $$
declare
  v_transaction_id uuid;
begin
  for v_transaction_id in
    select tx.id
    from public.transactions tx
    where nullif(trim(coalesce(to_jsonb(tx) ->> 'listing_id', to_jsonb(tx) ->> 'private_listing_id', '')), '') is not null
  loop
    perform public.bridge_sync_seller_portal_transaction_context(v_transaction_id);
  end loop;
end;
$$;

-- The authenticated seller-token RPC is the only safe way for a seller
-- workspace to read its transaction. Keep its existing password/final-file
-- fence, then append a deliberately small tracking projection.
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
  v_listing_id uuid;
  v_transaction_id uuid;
  v_transaction jsonb := null;
begin
  select * into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(p_token);
  if not found or not v_resolution.token_valid then
    return null;
  end if;

  v_result := public.bridge_private_listing_seller_portal_payload_phase1(
    v_resolution.legacy_token,
    p_access_token,
    p_require_access
  );
  if v_result is null then
    return null;
  end if;

  if jsonb_typeof(v_result -> 'onboarding') = 'object' then
    v_result := jsonb_set(
      v_result,
      '{onboarding}',
      (v_result -> 'onboarding') - 'seller_portal_invite_token_hash',
      true
    );
  end if;

  -- Do not resolve or disclose a transaction until the Phase 1 password / 
  -- access check has granted the seller portal session.
  if coalesce(v_result ->> 'authRequired', 'false') <> 'true' then
    begin
      v_listing_id := nullif(trim(coalesce(v_result -> 'listing' ->> 'id', '')), '')::uuid;
    exception
      when invalid_text_representation then
        v_listing_id := null;
    end;

    if v_listing_id is not null
      and to_regprocedure('public.bridge_resolve_private_listing_transaction_id(uuid)') is not null then
      v_transaction_id := public.bridge_resolve_private_listing_transaction_id(v_listing_id);
    end if;

    if v_transaction_id is not null then
      select jsonb_strip_nulls(jsonb_build_object(
        'id', tx.id,
        'listing_id', tx.listing_id,
        'stage', tx.stage,
        'current_main_stage', tx.current_main_stage,
        'lifecycle_state', tx.lifecycle_state,
        'attorney', tx.attorney,
        'assigned_attorney_email', tx.assigned_attorney_email,
        'bond_originator', tx.bond_originator,
        'assigned_bond_originator_email', tx.assigned_bond_originator_email,
        'assigned_agent', tx.assigned_agent,
        'assigned_agent_email', tx.assigned_agent_email,
        'created_at', tx.created_at,
        'updated_at', tx.updated_at,
        'completed_at', tx.completed_at,
        'registered_at', tx.registered_at,
        'registration_date', tx.registration_date
      ))
      into v_transaction
      from public.transactions tx
      where tx.id = v_transaction_id;
    end if;
  end if;

  v_result := v_result || jsonb_build_object(
    'transaction', v_transaction,
    'tokenKind', v_resolution.token_kind,
    'stablePortalToken', v_resolution.stable_portal_token,
    'stablePortalPath', '/client/' || v_resolution.stable_portal_token || '/selling',
    'portalAccess', coalesce(v_result -> 'portalAccess', '{}'::jsonb) || jsonb_build_object(
      'tokenKind', v_resolution.token_kind,
      'stablePortalToken', v_resolution.stable_portal_token,
      'stablePortalPath', '/client/' || v_resolution.stable_portal_token || '/selling'
    )
  );

  return public.bridge_sanitize_seller_portal_final_artifact_payload_phase4(v_result);
end;
$$;

revoke all on function public.bridge_sync_seller_portal_transaction_context(uuid) from public;
revoke all on function public.bridge_sync_seller_portal_transaction_context_trigger() from public;
revoke all on function public.bridge_sync_seller_portal_transaction_context_from_portal_context_trigger() from public;
revoke all on function public.bridge_private_listing_seller_portal_payload(text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.bridge_private_listing_seller_portal_payload(text, text, boolean)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
