begin;

-- Deal Setup owns the commercial facts of a transaction. Keep the attorney
-- routing profile aligned with those facts, but retain legal-only decisions
-- (seller matters, matter confirmation and other attorney configuration).
create or replace function public.bridge_sync_deal_setup_attorney_handoff(
  p_transaction_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_transaction public.transactions%rowtype;
  v_profile jsonb;
  v_requires_bond_attorney boolean;
begin
  if p_transaction_id is null then
    raise exception 'Transaction id is required.' using errcode = '22023';
  end if;

  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not (
    public.bridge_can_access_transaction_spine(p_transaction_id)
    or public.bridge_can_access_transaction_org_member(p_transaction_id)
  ) then
    raise exception 'You do not have access to this transaction.' using errcode = '42501';
  end if;

  select * into v_transaction
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Transaction not found.' using errcode = 'P0002';
  end if;

  v_requires_bond_attorney := lower(coalesce(v_transaction.finance_type, ''))
    in ('bond', 'hybrid', 'combination');

  -- Clear only Deal Setup-owned aliases and any materialised plan. A fresh
  -- plan is derived from the updated canonical values on the attorney side.
  v_profile := coalesce(v_transaction.routing_profile_json, '{}'::jsonb)
    - 'financeType'
    - 'finance_type'
    - 'transactionType'
    - 'transaction_type'
    - 'buyerEntityType'
    - 'buyer_entity_type'
    - 'purchaserType'
    - 'purchaser_type'
    - 'requiresBondAttorney'
    - 'workflowPlan';

  v_profile := v_profile
    || jsonb_strip_nulls(jsonb_build_object(
      'financeType', nullif(trim(v_transaction.finance_type), ''),
      'transactionType', nullif(trim(v_transaction.transaction_type), ''),
      'buyerEntityType', nullif(trim(v_transaction.purchaser_type), ''),
      'purchaserType', nullif(trim(v_transaction.purchaser_type), '')
    ))
    || jsonb_build_object(
      'requiresBondAttorney', v_requires_bond_attorney,
      'dealSetupSync', jsonb_build_object(
        'version', 'deal_setup_attorney_handoff_v1',
        'syncedAt', now(),
        'syncedBy', v_actor_id
      )
    );

  update public.transactions
  set routing_profile_json = v_profile,
      updated_at = now()
  where id = p_transaction_id;

  return jsonb_build_object(
    'transactionId', p_transaction_id,
    'financeType', v_transaction.finance_type,
    'transactionType', v_transaction.transaction_type,
    'purchaserType', v_transaction.purchaser_type,
    'requiresBondAttorney', v_requires_bond_attorney,
    'routingProfileRefreshed', true,
    'workflowPlanInvalidated', true
  );
end;
$$;

revoke all on function public.bridge_sync_deal_setup_attorney_handoff(uuid) from public, anon;
grant execute on function public.bridge_sync_deal_setup_attorney_handoff(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
