begin;

-- This helper is called by many RLS predicates, including nested profile and
-- development policies. Do not query the transaction graph without a bearer.
-- Keep the existing link/transaction identity checks exactly as before.
create or replace function public.bridge_has_client_portal_token_transaction_access(target_transaction_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  request_token text := public.bridge_client_portal_request_token();
begin
  if target_transaction_id is null or coalesce(request_token, '') = '' then
    return false;
  end if;
  return exists (
    select 1
    from public.client_portal_links link
    join public.transactions transaction_row on transaction_row.id = link.transaction_id
    where link.transaction_id = target_transaction_id
      and link.is_active is true
      and link.token = request_token
      and transaction_row.development_id is not distinct from link.development_id
      and transaction_row.unit_id is not distinct from link.unit_id
      and transaction_row.buyer_id is not distinct from link.buyer_id
  );
end;
$$;

-- Anonymous visitors cannot satisfy auth.uid() ownership or platform-admin
-- checks. Excluding that role avoids expanding the profiles RLS graph merely
-- to conclude that a request with no user cannot see metrics.
alter policy "Platform admins view performance metrics" on public.performance_metrics to authenticated;
alter policy "Users can create own performance metrics" on public.performance_metrics to authenticated;
alter policy "Users can view own performance metric inserts" on public.performance_metrics to authenticated;
alter policy "Platform admins view telemetry" on public.telemetry_events to authenticated;
alter policy "Users can create own telemetry" on public.telemetry_events to authenticated;
alter policy "Users can view own telemetry inserts" on public.telemetry_events to authenticated;

-- Start branding lookups from the exact supplied link, rather than evaluating
-- the entire protected transaction/development graph once per branding row.
-- CASE also guarantees no graph lookup for an absent credential.
alter policy organisation_branding_select_client_portal_brand_scope on public.organisation_branding
  using (case when nullif(public.bridge_client_portal_request_token(), '') is null then false else exists (
    select 1
    from public.client_portal_links link
    join public.transactions tx on tx.id = link.transaction_id
    left join public.developments dev on dev.id = tx.development_id
    where link.token = (select public.bridge_client_portal_request_token())
      and link.is_active is true
      and public.bridge_has_client_portal_token_transaction_access(tx.id)
      and (tx.organisation_id = organisation_branding.organisation_id
        or dev.organisation_id = organisation_branding.organisation_id)
  ) end);

alter policy organisation_branding_select_onboarding_token_brand_scope on public.organisation_branding
  using (case when nullif(public.bridge_onboarding_request_token(), '') is null then false else exists (
    select 1
    from public.transaction_onboarding onboarding
    join public.transactions tx on tx.id = onboarding.transaction_id
    left join public.developments dev on dev.id = tx.development_id
    where onboarding.token = (select public.bridge_onboarding_request_token())
      and onboarding.is_active is true
      and public.bridge_has_onboarding_token_transaction_access(tx.id)
      and (tx.organisation_id = organisation_branding.organisation_id
        or (tx.organisation_id is null and dev.organisation_id = organisation_branding.organisation_id))
  ) end);

-- Resolve whether a live link exists once per request, before scanning the
-- requirements/workflow tables. The existing per-row policies still enforce
-- which transaction the credential can read or change. A wrong token must be
-- as cheap to reject as an absent token, not a per-row protected-graph scan.
do $policies$
declare
  target_table text;
  credential_check text := $predicate$(select (
    exists (select 1 from public.client_portal_links link
      where link.is_active is true
        and link.token = nullif(public.bridge_client_portal_request_token(), ''))
    or exists (select 1 from public.transaction_onboarding onboarding
      where onboarding.is_active is true
        and onboarding.token = nullif(public.bridge_onboarding_request_token(), ''))
    or exists (select 1 from public.transaction_status_links status_link
      where status_link.is_active is true
        and status_link.token = nullif(public.bridge_status_request_token(), ''))
    or (nullif(public.bridge_external_access_request_token(), '') is not null
      and public.bridge_has_external_access_token())
  ))$predicate$;
begin
  foreach target_table in array array['transaction_required_documents', 'transaction_subprocess_steps'] loop
    execute format('drop policy if exists anonymous_link_credential_required on public.%I', target_table);
    execute format('create policy anonymous_link_credential_required on public.%I as restrictive for all to anon using (%s) with check (%s)',
      target_table, credential_check, credential_check);
  end loop;
end;
$policies$;

notify pgrst, 'reload schema';
commit;
