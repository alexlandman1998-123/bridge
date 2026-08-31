begin;

-- A buyer portal belongs to a transaction. Development and unit are optional
-- context because a private-property sale has neither.
alter table public.client_portal_links
  alter column development_id drop not null,
  alter column unit_id drop not null,
  alter column transaction_id set not null;

alter table public.client_portal_links
  drop constraint if exists client_portal_links_context_shape_check;
alter table public.client_portal_links
  add constraint client_portal_links_context_shape_check
  check ((development_id is null) = (unit_id is null)) not valid;
alter table public.client_portal_links
  validate constraint client_portal_links_context_shape_check;

-- Inserts and updates must copy their context from the canonical transaction.
-- Keeping this in a security-definer function makes the RLS check independent
-- of whichever transaction SELECT policy happens to be visible to the caller.
create or replace function public.bridge_client_portal_link_matches_transaction(
  p_transaction_id uuid,
  p_development_id uuid,
  p_unit_id uuid,
  p_buyer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.transactions transaction_row
    where transaction_row.id = p_transaction_id
      and transaction_row.development_id is not distinct from p_development_id
      and transaction_row.unit_id is not distinct from p_unit_id
      and transaction_row.buyer_id is not distinct from p_buyer_id
  );
$$;

revoke all on function public.bridge_client_portal_link_matches_transaction(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.bridge_client_portal_link_matches_transaction(uuid, uuid, uuid, uuid)
  to authenticated;

-- Replace both historical policy variants. Organisation membership authorises
-- maintenance, while the canonical transaction validates every stored ID.
drop policy if exists client_portal_links_insert_transaction_spine_scope
  on public.client_portal_links;
drop policy if exists client_portal_links_select_transaction_spine_scope
  on public.client_portal_links;
drop policy if exists client_portal_links_update_transaction_spine_scope
  on public.client_portal_links;
drop policy if exists client_portal_links_org_member_maintenance
  on public.client_portal_links;

create policy client_portal_links_org_member_maintenance
  on public.client_portal_links
  for all
  to authenticated
  using (public.bridge_can_access_transaction_org_member(transaction_id))
  with check (
    public.bridge_can_access_transaction_org_member(transaction_id)
    and public.bridge_client_portal_link_matches_transaction(
      transaction_id,
      development_id,
      unit_id,
      buyer_id
    )
  );

-- A bearer token grants access only when the link still resolves to the same
-- canonical transaction context. This protects every downstream policy that
-- delegates to this helper.
create or replace function public.bridge_has_client_portal_token_transaction_access(
  target_transaction_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.client_portal_links link
    join public.transactions transaction_row
      on transaction_row.id = link.transaction_id
    where link.transaction_id = target_transaction_id
      and link.is_active is true
      and link.token = public.bridge_client_portal_request_token()
      and transaction_row.development_id is not distinct from link.development_id
      and transaction_row.unit_id is not distinct from link.unit_id
      and transaction_row.buyer_id is not distinct from link.buyer_id
  );
$$;

revoke all on function public.bridge_has_client_portal_token_transaction_access(uuid)
  from public, anon, authenticated;
grant execute on function public.bridge_has_client_portal_token_transaction_access(uuid)
  to anon, authenticated;

create or replace function public.bridge_buyer_onboarding_portal_access()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_onboarding_token text := nullif(trim(coalesce(public.bridge_onboarding_request_token(), '')), '');
  v_onboarding public.transaction_onboarding%rowtype;
  v_transaction public.transactions%rowtype;
  v_link public.client_portal_links%rowtype;
  v_portal_enabled boolean := true;
begin
  if v_onboarding_token is null then
    raise exception 'A valid buyer onboarding token is required.' using errcode = '42501';
  end if;

  select *
    into v_onboarding
  from public.transaction_onboarding onboarding
  where onboarding.token = v_onboarding_token
    and onboarding.is_active is true
  order by onboarding.updated_at desc nulls last
  limit 1
  for update;

  if not found then
    raise exception 'Buyer onboarding link is invalid or inactive.' using errcode = '42501';
  end if;

  select *
    into v_transaction
  from public.transactions transaction_row
  where transaction_row.id = v_onboarding.transaction_id
  for update;

  if not found then
    raise exception 'This buyer onboarding link is not connected to a transaction.' using errcode = '22023';
  end if;

  if v_transaction.buyer_id is null then
    raise exception 'This buyer onboarding link is not connected to a buyer.' using errcode = '22023';
  end if;

  if (v_transaction.development_id is null) <> (v_transaction.unit_id is null) then
    raise exception 'This buyer onboarding link has incomplete development context.' using errcode = '22023';
  end if;

  -- Private-property sales have no development settings and are enabled by the
  -- transaction itself. Development sales continue to respect their opt-out.
  if v_transaction.development_id is not null then
    select coalesce(settings.client_portal_enabled, true)
      into v_portal_enabled
    from public.development_settings settings
    where settings.development_id = v_transaction.development_id;
  end if;

  if not coalesce(v_portal_enabled, true) then
    return jsonb_build_object(
      'available', false,
      'reason', 'client_portal_disabled',
      'transactionId', v_transaction.id
    );
  end if;

  perform pg_advisory_xact_lock(hashtext(v_transaction.id::text));

  select *
    into v_link
  from public.client_portal_links link
  where link.transaction_id = v_transaction.id
    and link.is_active is true
  order by link.updated_at desc nulls last
  limit 1;

  if not found then
    insert into public.client_portal_links (
      development_id,
      unit_id,
      transaction_id,
      buyer_id,
      token,
      is_active
    )
    values (
      v_transaction.development_id,
      v_transaction.unit_id,
      v_transaction.id,
      v_transaction.buyer_id,
      'clp' || replace(extensions.gen_random_uuid()::text, '-', ''),
      true
    )
    on conflict (transaction_id) where is_active do nothing
    returning * into v_link;

    if v_link.id is null then
      select *
        into v_link
      from public.client_portal_links link
      where link.transaction_id = v_transaction.id
        and link.is_active is true
      order by link.updated_at desc nulls last
      limit 1;
    end if;
  end if;

  if v_link.id is null then
    raise exception 'Unable to prepare buyer portal access.' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'available', true,
    'id', v_link.id,
    'developmentId', v_link.development_id,
    'unitId', v_link.unit_id,
    'transactionId', v_link.transaction_id,
    'buyerId', v_link.buyer_id,
    'token', v_link.token,
    'isActive', v_link.is_active,
    'createdAt', v_link.created_at,
    'updatedAt', v_link.updated_at,
    'path', '/client/' || v_link.token
  );
end;
$$;

revoke all on function public.bridge_buyer_onboarding_portal_access()
  from public, anon, authenticated;
grant execute on function public.bridge_buyer_onboarding_portal_access()
  to anon, authenticated;

-- Existing private buyer journeys should not wait for another onboarding save
-- before the handoff becomes available.
insert into public.client_portal_links (
  development_id,
  unit_id,
  transaction_id,
  buyer_id,
  token,
  is_active
)
select
  transaction_row.development_id,
  transaction_row.unit_id,
  transaction_row.id,
  transaction_row.buyer_id,
  'clp' || replace(extensions.gen_random_uuid()::text, '-', ''),
  true
from public.transaction_onboarding onboarding
join public.transactions transaction_row
  on transaction_row.id = onboarding.transaction_id
left join public.development_settings settings
  on settings.development_id = transaction_row.development_id
where onboarding.is_active is true
  and transaction_row.buyer_id is not null
  and (
    (
      transaction_row.development_id is null
      and transaction_row.unit_id is null
    )
    or (
      transaction_row.development_id is not null
      and transaction_row.unit_id is not null
      and coalesce(settings.client_portal_enabled, true) is true
    )
  )
  and not exists (
    select 1
    from public.client_portal_links link
    where link.transaction_id = transaction_row.id
      and link.is_active is true
  )
on conflict do nothing;

notify pgrst, 'reload schema';

commit;
