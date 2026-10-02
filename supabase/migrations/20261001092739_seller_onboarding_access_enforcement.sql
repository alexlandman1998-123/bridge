-- Close direct-table onboarding exposure without changing listing permissions.
begin;

alter table public.private_listing_seller_onboarding enable row level security;
revoke all on public.private_listing_seller_onboarding from public, anon, authenticated;
grant select, insert, update, delete on public.private_listing_seller_onboarding to authenticated;

-- Permissive policies combine with OR. Remove every previous policy on this
-- one table so a historical USING (true) cannot survive alongside the fence.
do $$
declare policy_record record;
begin
  for policy_record in select policyname from pg_policies
    where schemaname = 'public' and tablename = 'private_listing_seller_onboarding'
  loop
    execute format('drop policy %I on public.private_listing_seller_onboarding', policy_record.policyname);
  end loop;
end;
$$;

create policy private_listing_seller_onboarding_member_access
on public.private_listing_seller_onboarding for all to authenticated
using (public.bridge_can_access_private_listing(private_listing_id))
with check (public.bridge_can_access_private_listing(private_listing_id));

-- A narrow read replaces browser table hydration. The onboarding capability
-- never accepts an arbitrary listing ID, or a password-protected portal token.
create or replace function public.bridge_get_private_listing_seller_onboarding_form(p_token text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select to_jsonb(o) - array[
    'seller_portal_password_hash', 'seller_portal_access_token_hash',
    'seller_portal_invite_token_hash', 'seller_portal_recovery_token_hash'
  ]
  from public.private_listing_seller_onboarding o
  join public.private_listings l on l.id = o.private_listing_id
  where o.token = nullif(btrim(p_token), '')
    and (o.token_expires_at is null or o.token_expires_at > now())
    and public.bridge_private_listing_seller_portal_link_is_active(to_jsonb(o), to_jsonb(l))
  limit 1;
$$;
revoke all on function public.bridge_get_private_listing_seller_onboarding_form(text) from public;
grant execute on function public.bridge_get_private_listing_seller_onboarding_form(text) to anon, authenticated;

-- Stable workspace links retain their separate lifecycle; only legacy
-- onboarding capabilities obey token_expires_at here.
create or replace function public.bridge_resolve_private_listing_seller_portal_token(p_token text)
returns table (
  onboarding_id uuid,
  legacy_token text,
  stable_portal_token text,
  token_kind text,
  token_valid boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with input as (
    select
      nullif(trim(coalesce(p_token, '')), '') as token,
      case
        when nullif(trim(coalesce(p_token, '')), '') is null then null
        else encode(digest(trim(p_token), 'sha256'), 'hex')
      end as token_hash
  )
  select
    onboarding.id,
    onboarding.token,
    onboarding.seller_portal_token,
    case
      when onboarding.seller_portal_token = input.token then 'stable'
      when onboarding.token = input.token then 'legacy'
      else 'invite'
    end,
    case
      when onboarding.seller_portal_token = input.token then true
      when onboarding.token = input.token then onboarding.token_expires_at is null or onboarding.token_expires_at > now()
      else onboarding.seller_portal_invite_consumed_at is null
        and onboarding.seller_portal_invite_expires_at is not null
        and onboarding.seller_portal_invite_expires_at > now()
    end
  from input
  join public.private_listing_seller_onboarding onboarding
    on onboarding.seller_portal_token = input.token
    or onboarding.token = input.token
    or onboarding.seller_portal_invite_token_hash = input.token_hash
  order by
    case
      when onboarding.seller_portal_token = input.token then 1
      when onboarding.token = input.token then 2
      else 3
    end
  limit 1;
$$;

revoke all on function public.bridge_resolve_private_listing_seller_portal_token(text) from public, anon, authenticated;

create or replace function public.bridge_update_private_listing_seller_onboarding_progress(
  p_token text,
  p_status text default 'in_progress',
  p_form_data jsonb default '{}'::jsonb,
  p_seller_type text default null,
  p_ownership_structure text default null,
  p_marital_regime text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_status text := coalesce(nullif(trim(lower(p_status)), ''), 'in_progress');
  v_form_data jsonb := case when jsonb_typeof(p_form_data) = 'object' then p_form_data else '{}'::jsonb end;
  v_facts jsonb;
  v_readiness jsonb;
begin
  if v_status not in ('not_started', 'sent', 'in_progress', 'completed', 'rejected') then
    v_status := 'in_progress';
  end if;

  select *
    into v_onboarding
  from public.private_listing_seller_onboarding
  where token = nullif(trim(p_token), '')
    and (token_expires_at is null or token_expires_at > now())
  limit 1 for update;

  if not found then
    return null;
  end if;

  -- Persist the draft's canonical fields inside the token-scoped transaction.
  -- Anonymous browsers must never project these through direct table writes.
  v_facts := coalesce(v_form_data->'canonicalSellerFacts', v_form_data->'canonical_seller_facts');
  v_readiness := coalesce(v_form_data->'canonicalSellerFactReadiness', v_form_data->'canonical_seller_fact_readiness');

  update public.private_listing_seller_onboarding
     set status = v_status,
         form_data = coalesce(form_data, '{}'::jsonb) || v_form_data,
         canonical_facts_json = coalesce(v_facts, canonical_facts_json),
         canonical_fact_readiness_json = coalesce(v_readiness, canonical_fact_readiness_json),
         canonical_facts_updated_at = case when v_facts is not null then now() else canonical_facts_updated_at end,
         seller_type = coalesce(nullif(trim(p_seller_type), ''), seller_type),
         ownership_structure = coalesce(nullif(trim(p_ownership_structure), ''), ownership_structure),
         marital_regime = coalesce(nullif(trim(p_marital_regime), ''), marital_regime),
         updated_at = now()
   where id = v_onboarding.id
   returning * into v_onboarding;

  update public.private_listings
     set seller_canonical_facts_json = coalesce(v_facts, seller_canonical_facts_json),
         seller_canonical_fact_readiness_json = coalesce(v_readiness, seller_canonical_fact_readiness_json),
         seller_canonical_facts_updated_at = case when v_facts is not null then now() else seller_canonical_facts_updated_at end,
         listing_status = case
           when v_status in ('sent', 'in_progress') and listing_status = 'seller_lead' then 'onboarding_sent'
           else listing_status
         end,
         seller_onboarding_status = case
           when v_status in ('sent', 'in_progress') then v_status
           else seller_onboarding_status
         end,
         updated_at = case
           when v_status in ('sent', 'in_progress') then now()
           else updated_at
         end
   where id = v_onboarding.private_listing_id
   returning * into v_listing;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'listing', to_jsonb(v_listing),
    'onboarding', to_jsonb(v_onboarding) - 'seller_portal_password_hash' - 'seller_portal_access_token_hash' - 'seller_portal_invite_token_hash' - 'seller_portal_recovery_token_hash',
    'transaction', 'null'::jsonb,
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
$func$;

revoke all on function public.bridge_update_private_listing_seller_onboarding_progress(text, text, jsonb, text, text, text) from public;

grant execute on function public.bridge_update_private_listing_seller_onboarding_progress(text, text, jsonb, text, text, text) to anon, authenticated;


notify pgrst, 'reload schema';
commit;
