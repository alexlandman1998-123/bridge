-- Phase 3 query execution optimization.
--
-- These helpers are referenced by many permissive RLS policies. Normal
-- authenticated application requests do not include portal-token headers, but
-- the previous SQL implementations still queried the token tables once per
-- candidate row. Return before touching those tables when the relevant header
-- is absent. Existing portal-token behavior and function privileges are
-- preserved by CREATE OR REPLACE.

create or replace function public.bridge_has_client_portal_token_transaction_access(
  target_transaction_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  request_token text := public.bridge_client_portal_request_token();
begin
  if coalesce(request_token, '') = '' then
    return false;
  end if;

  return exists (
    select 1
    from public.client_portal_links cpl
    where cpl.transaction_id = target_transaction_id
      and cpl.is_active is true
      and cpl.token = request_token
  );
end;
$function$;

create or replace function public.bridge_has_onboarding_token_transaction_access(
  target_transaction_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  request_token text := public.bridge_onboarding_request_token();
begin
  if coalesce(request_token, '') = '' then
    return false;
  end if;

  return exists (
    select 1
    from public.transaction_onboarding onboarding
    where onboarding.transaction_id = target_transaction_id
      and onboarding.is_active is true
      and onboarding.token = request_token
  );
end;
$function$;

create or replace function public.bridge_has_status_token_transaction_access(
  target_transaction_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  request_token text := public.bridge_status_request_token();
begin
  if coalesce(request_token, '') = '' then
    return false;
  end if;

  return exists (
    select 1
    from public.transaction_status_links link
    where link.transaction_id = target_transaction_id
      and link.is_active is true
      and link.token = request_token
  );
end;
$function$;

-- Brand lookups are among the highest-volume request families. These two
-- policies previously entered transaction/development RLS subplans even when
-- no onboarding token header existed. The scalar subquery becomes an initPlan,
-- so Postgres can skip the correlated access checks entirely for normal app
-- requests while retaining the existing token-scoped predicate.
alter policy organisations_select_onboarding_token_brand_scope
on public.organisations
using (
  (select public.bridge_onboarding_request_token()) <> ''
  and exists (
    select 1
    from public.transactions tx
    left join public.developments dev on dev.id = tx.development_id
    where public.bridge_has_onboarding_token_transaction_access(tx.id)
      and (
        tx.organisation_id = organisations.id
        or (
          tx.organisation_id is null
          and dev.organisation_id = organisations.id
        )
      )
  )
);

alter policy organisation_branding_select_onboarding_token_brand_scope
on public.organisation_branding
using (
  (select public.bridge_onboarding_request_token()) <> ''
  and exists (
    select 1
    from public.transactions tx
    left join public.developments dev on dev.id = tx.development_id
    where public.bridge_has_onboarding_token_transaction_access(tx.id)
      and (
        tx.organisation_id = organisation_branding.organisation_id
        or (
          tx.organisation_id is null
          and dev.organisation_id = organisation_branding.organisation_id
        )
      )
  )
);
