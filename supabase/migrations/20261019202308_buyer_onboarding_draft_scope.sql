-- Onboarding must be able to collect facts before a transaction can be finalised.
-- This predicate admits missing facts only for an unsubmitted onboarding draft.
-- It never substitutes answers or admits an explicitly unsupported legal route.
create or replace function public.bridge_mvp_transaction_scope_ready(p_payload jsonb)
returns boolean
language sql immutable
set search_path = ''
as $scope$
with context as (
  select coalesce(p_payload->'routing_profile_json', '{}'::jsonb) profile,
    nullif(btrim(p_payload->>'accepted_offer_id'), '') is null
    and lower(btrim(coalesce(p_payload->>'creation_mode', p_payload->>'creationMode', ''))) = 'onboarding_capture'
    and lower(btrim(coalesce(p_payload->>'stage', ''))) = 'buyer onboarding pending'
    and lower(btrim(coalesce(p_payload->>'onboarding_status', ''))) in
      ('awaiting_client_onboarding', 'agent_assisted_pending', 'hard_copy_pending') draft
), facts as (
  select draft,
    lower(btrim(coalesce(profile->>'transactionType', ''))) transaction_type,
    lower(btrim(coalesce(profile->>'financeType', ''))) finance_type,
    lower(btrim(coalesce(profile->>'propertyTenure', ''))) tenure,
    lower(btrim(coalesce(profile->>'buyerEntityType', ''))) buyer_type,
    lower(btrim(coalesce(profile->>'sellerEntityType', ''))) seller_type
  from context
)
select coalesce(
  (transaction_type in ('resale', 'private_sale', 'development_sale') or (draft and transaction_type in ('', 'unknown')))
  and (finance_type in ('cash', 'bond', 'hybrid') or (draft and finance_type in ('', 'unknown')))
  and (tenure in ('freehold', 'sectional_title', 'estate_hoa') or (draft and tenure in ('', 'unknown')))
  and (buyer_type in ('individual', 'company', 'trust') or (draft and buyer_type in ('', 'unknown')))
  and (seller_type in ('individual', 'company', 'trust', 'developer') or (draft and seller_type in ('', 'unknown')))
  and not (seller_type = 'developer' and transaction_type not in ('development_sale', '', 'unknown')),
false) from facts;
$scope$;

-- Only the existing privileged command uses this pure predicate. No new public RPC.
revoke all on function public.bridge_mvp_transaction_scope_ready(jsonb) from public, anon, authenticated, service_role;

-- Preserve the installed command, including newer source-handoff checks. Fail
-- closed if its exact scope guard is no longer the reviewed implementation.
do $patch$
declare
  definition text := pg_get_functiondef('public.bridge_create_mvp_transaction(jsonb)'::regprocedure);
  old_guard text := $old$  if v_transaction_type not in ('resale', 'private_sale', 'development_sale')
    or v_finance_type not in ('cash', 'bond', 'hybrid')
    or v_property_tenure not in ('freehold', 'sectional_title', 'estate_hoa')
    or v_buyer_entity_type not in ('individual', 'company', 'trust')
    or v_seller_entity_type not in ('individual', 'company', 'trust', 'developer')
    or (v_seller_entity_type = 'developer' and v_transaction_type <> 'development_sale') then$old$;
  new_guard text := '  if not public.bridge_mvp_transaction_scope_ready(v_payload) then';
begin
  if strpos(definition, new_guard) > 0 then return; end if;
  if strpos(definition, old_guard) = 0 then
    raise exception 'Buyer onboarding scope correction requires review: installed transaction scope guard differs.';
  end if;
  execute replace(definition, old_guard, new_guard);
end;
$patch$;
