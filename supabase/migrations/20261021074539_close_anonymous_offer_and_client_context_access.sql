begin;

-- The public key identifies the application, not the visitor. A filter in a
-- browser query is not an access control: require the supplied link credential.
alter policy offers_public_token_select on public.offers
  to anon, authenticated
  using (
    offer_token = nullif(btrim(public.bridge_request_header('x-bridge-offer-token')), '')
    and status in ('draft', 'sent_to_buyer', 'buyer_viewed', 'submitted', 'agent_review', 'changes_requested', 'countered')
    and (expiry_date is null or expiry_date >= current_date)
  );

-- Public link clients have no persisted user session. Signed-in staff retain
-- the existing organisation-member policies and restrictive transaction scope.
alter policy offers_public_token_update on public.offers
  to anon
  using (
    offer_token = nullif(btrim(public.bridge_request_header('x-bridge-offer-token')), '')
    and status in ('draft', 'sent_to_buyer', 'buyer_viewed', 'changes_requested', 'countered')
    and (expiry_date is null or expiry_date >= current_date)
  )
  with check (
    offer_token = nullif(btrim(public.bridge_request_header('x-bridge-offer-token')), '')
    and status in ('buyer_viewed', 'submitted', 'agent_review')
    and (expiry_date is null or expiry_date >= current_date)
  );

-- Possession of a buyer link must never allow changing ownership, identity,
-- the credential itself, or an agent/seller decision.
revoke update on public.offers from anon;
grant update (
  status, buyer_viewed_at, buyer_submitted_at, submitted_at, updated_at,
  offer_amount, deposit_amount, finance_type, cash_component, bond_component,
  conditions_json
) on public.offers to anon;

alter policy client_portal_contexts_token_select on public.client_portal_contexts
  to anon, authenticated
  using (
    (transaction_id is not null and public.bridge_has_client_portal_token_transaction_access(transaction_id))
    or (
      context_type = 'selling'
      and status in ('active', 'pending')
      and seller_workspace_token = nullif(btrim(public.bridge_client_portal_request_token()), '')
    )
  );

-- Removing the old NULL-transaction bypass must preserve staff reads of
-- pre-transaction seller contexts, subject to the existing transaction fence.
drop policy if exists client_portal_contexts_member_select on public.client_portal_contexts;
create policy client_portal_contexts_member_select on public.client_portal_contexts
  for select to authenticated
  using (public.bridge_is_active_member(organisation_id));

-- Materialized views cannot enforce per-organisation RLS. The existing scoped
-- SECURITY DEFINER report RPCs remain the authenticated access path.
revoke all on public.commercial_data_quality_rollups,
  public.commercial_market_area_rollups from public, anon, authenticated;
grant select on public.commercial_data_quality_rollups,
  public.commercial_market_area_rollups to service_role;
revoke execute on function public.bridge_get_commercial_data_quality_rollup(uuid),
  public.bridge_get_commercial_market_area_rollups(uuid) from public, anon;
grant execute on function public.bridge_get_commercial_data_quality_rollup(uuid),
  public.bridge_get_commercial_market_area_rollups(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
