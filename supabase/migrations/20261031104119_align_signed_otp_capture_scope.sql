begin;

-- The creation command verifies the saved signed-OTP evidence before setting
-- this capture state. Missing later routing facts may remain pending review;
-- explicit unsupported facts still fail the same residential launch boundary.
create or replace function public.bridge_mvp_transaction_scope_ready(p_payload jsonb)
returns boolean language sql immutable set search_path = '' as $function$
with context as (
  select coalesce(p_payload->'routing_profile_json', '{}'::jsonb) profile,
    nullif(btrim(p_payload->>'accepted_offer_id'), '') is null and (
      (lower(btrim(coalesce(p_payload->>'creation_mode', p_payload->>'creationMode', ''))) = 'onboarding_capture'
        and lower(btrim(coalesce(p_payload->>'stage', ''))) = 'buyer onboarding pending'
        and lower(btrim(coalesce(p_payload->>'onboarding_status', ''))) in
          ('awaiting_client_onboarding', 'agent_assisted_pending', 'hard_copy_pending'))
      or (lower(btrim(coalesce(p_payload->>'creation_mode', p_payload->>'creationMode', ''))) = 'signed_otp_capture'
        and lower(btrim(coalesce(p_payload->>'stage', ''))) = 'otp signed'
        and lower(btrim(coalesce(p_payload->>'onboarding_status', ''))) = 'signed_otp_uploaded_for_review')
    ) draft
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
  and (finance_type in ('cash', 'bond', 'hybrid', 'combination') or (draft and finance_type in ('', 'unknown')))
  and (tenure in ('freehold', 'sectional_title', 'estate_hoa') or (draft and tenure in ('', 'unknown')))
  and (buyer_type in ('individual', 'company', 'trust') or (draft and buyer_type in ('', 'unknown')))
  and (seller_type in ('individual', 'company', 'trust', 'developer') or (draft and seller_type in ('', 'unknown')))
  and not (seller_type = 'developer' and transaction_type not in ('development_sale', '', 'unknown')),
false) from facts;
$function$;

commit;
