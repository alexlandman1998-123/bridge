-- Buyer Onboarding Phase 6: migration/backfill audit only.
-- This script performs no writes. Review the bucketed output before creating
-- any environment-specific backfill migration.

with legacy_buyer_onboarding_candidates as (
  select
    l.lead_id,
    l.organisation_id,
    l.converted_transaction_id,
    l.lead_category,
    l.stage,
    l.status,
    l.updated_at,
    coalesce(
      l.raw_enquiry_payload -> 'buyerOnboarding',
      l.raw_enquiry_payload -> 'buyer_onboarding'
    ) as buyer_onboarding_snapshot
  from leads l
  where l.raw_enquiry_payload is not null
    and l.raw_enquiry_payload ?| array['buyerOnboarding', 'buyer_onboarding']
),
classified as (
  select
    c.*,
    ofd.id as onboarding_form_data_id,
    ton.id as transaction_onboarding_id,
    ton.status as transaction_onboarding_status,
    lower(concat_ws(
      ' ',
      c.buyer_onboarding_snapshot ->> 'source',
      c.buyer_onboarding_snapshot ->> 'source_type',
      c.buyer_onboarding_snapshot ->> 'sourceType',
      c.buyer_onboarding_snapshot ->> 'emailType',
      c.buyer_onboarding_snapshot ->> 'email_type',
      c.buyer_onboarding_snapshot ->> 'type',
      c.buyer_onboarding_snapshot ->> 'kind',
      c.buyer_onboarding_snapshot ->> 'intent',
      c.buyer_onboarding_snapshot ->> 'flow',
      c.buyer_onboarding_snapshot ->> 'workflow',
      c.buyer_onboarding_snapshot ->> 'mode',
      c.buyer_onboarding_snapshot ->> 'link',
      c.buyer_onboarding_snapshot ->> 'url',
      c.buyer_onboarding_snapshot ->> 'offerLink',
      c.buyer_onboarding_snapshot ->> 'offer_link',
      c.buyer_onboarding_snapshot ->> 'onboardingLink',
      c.buyer_onboarding_snapshot ->> 'onboarding_link',
      c.buyer_onboarding_snapshot ->> 'onboardingUrl',
      c.buyer_onboarding_snapshot ->> 'onboarding_url',
      c.buyer_onboarding_snapshot ->> 'portalUrl',
      c.buyer_onboarding_snapshot ->> 'portal_url',
      c.buyer_onboarding_snapshot #>> '{formData,source}',
      c.buyer_onboarding_snapshot #>> '{formData,emailType}',
      c.buyer_onboarding_snapshot #>> '{formData,email_type}',
      c.buyer_onboarding_snapshot #>> '{formData,link}',
      c.buyer_onboarding_snapshot #>> '{formData,url}',
      c.buyer_onboarding_snapshot #>> '{formData,offerLink}',
      c.buyer_onboarding_snapshot #>> '{formData,offer_link}',
      c.buyer_onboarding_snapshot #>> '{formData,onboardingLink}',
      c.buyer_onboarding_snapshot #>> '{formData,onboarding_link}',
      c.buyer_onboarding_snapshot #>> '{form_data,source}',
      c.buyer_onboarding_snapshot #>> '{form_data,email_type}',
      c.buyer_onboarding_snapshot #>> '{form_data,link}',
      c.buyer_onboarding_snapshot #>> '{form_data,url}',
      c.buyer_onboarding_snapshot #>> '{form_data,offer_link}',
      c.buyer_onboarding_snapshot #>> '{form_data,onboarding_link}'
    )) as guardrail_signal,
    (
      c.buyer_onboarding_snapshot ?| array[
        'offerId',
        'offer_id',
        'canonicalOfferId',
        'canonical_offer_id',
        'offerLink',
        'offer_link',
        'lastOfferLink',
        'last_offer_link',
        'offerPortalSessionId',
        'offer_portal_session_id',
        'offerSessionToken',
        'offer_session_token',
        'sellerReviewLink',
        'seller_review_link'
      ]
      or coalesce(c.buyer_onboarding_snapshot -> 'formData', '{}'::jsonb) ?| array['offerLink', 'offer_link', 'offerId', 'offer_id']
      or coalesce(c.buyer_onboarding_snapshot -> 'form_data', '{}'::jsonb) ?| array['offerLink', 'offer_link', 'offerId', 'offer_id']
    ) as has_offer_artifact_key
  from legacy_buyer_onboarding_candidates c
  left join onboarding_form_data ofd
    on ofd.transaction_id = c.converted_transaction_id
  left join transaction_onboarding ton
    on ton.transaction_id = c.converted_transaction_id
   and ton.is_active = true
),
bucketed as (
  select
    *,
    (
      guardrail_signal like '%client_onboarding%'
      or guardrail_signal like '%buyer_onboarding%'
      or guardrail_signal like '%buyer onboarding%'
      or guardrail_signal like '%/client/onboarding/%'
    ) as has_true_buyer_onboarding_signal,
    (
      guardrail_signal like '%buyer_offer_link%'
      or guardrail_signal like '%canonical_buyer_offer_link%'
      or guardrail_signal like '%offer_portal%'
      or guardrail_signal like '%offer portal%'
      or guardrail_signal like '%offer_session%'
      or guardrail_signal like '%/offers/%'
      or has_offer_artifact_key
    ) as has_offer_flow_signal
  from classified
),
final_buckets as (
  select
    *,
    case
      when onboarding_form_data_id is not null then 'already_canonical_skip'
      when has_offer_flow_signal and not has_true_buyer_onboarding_signal then 'offer_artifact_skip'
      when has_true_buyer_onboarding_signal then 'true_buyer_onboarding_candidate'
      else 'ambiguous_manual_review'
    end as backfill_bucket
  from bucketed
)
select
  backfill_bucket,
  count(*) as lead_count,
  count(*) filter (where converted_transaction_id is not null) as linked_transaction_count,
  count(*) filter (where transaction_onboarding_id is not null) as has_transaction_onboarding_count
from final_buckets
group by backfill_bucket
order by backfill_bucket;

-- Detail review query. Uncomment when you need row-level inspection.
-- select
--   backfill_bucket,
--   lead_id,
--   organisation_id,
--   converted_transaction_id,
--   stage,
--   status,
--   transaction_onboarding_status,
--   guardrail_signal,
--   buyer_onboarding_snapshot
-- from final_buckets
-- order by backfill_bucket, updated_at desc
-- limit 250;
