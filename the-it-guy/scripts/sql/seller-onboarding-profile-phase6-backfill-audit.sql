-- Seller Onboarding Profile Phase 6: migration/backfill audit only.
-- This script performs no writes. Review the bucketed output before creating
-- any environment-specific backfill migration.

with legacy_seller_onboarding_candidates as (
  select
    l.lead_id,
    l.organisation_id,
    l.lead_category,
    l.stage,
    l.status,
    l.updated_at,
    coalesce(
      l.raw_enquiry_payload -> 'sellerOnboarding',
      l.raw_enquiry_payload -> 'seller_onboarding'
    ) as seller_onboarding_snapshot
  from leads l
  where l.raw_enquiry_payload is not null
    and l.raw_enquiry_payload ?| array['sellerOnboarding', 'seller_onboarding']
),
classified as (
  select
    c.*,
    pso.id as private_listing_seller_onboarding_id,
    pso.status as canonical_seller_onboarding_status,
    lower(concat_ws(
      ' ',
      c.seller_onboarding_snapshot ->> 'source',
      c.seller_onboarding_snapshot ->> 'source_type',
      c.seller_onboarding_snapshot ->> 'sourceType',
      c.seller_onboarding_snapshot ->> 'emailType',
      c.seller_onboarding_snapshot ->> 'email_type',
      c.seller_onboarding_snapshot ->> 'type',
      c.seller_onboarding_snapshot ->> 'kind',
      c.seller_onboarding_snapshot ->> 'intent',
      c.seller_onboarding_snapshot ->> 'flow',
      c.seller_onboarding_snapshot ->> 'workflow',
      c.seller_onboarding_snapshot ->> 'mode',
      c.seller_onboarding_snapshot ->> 'status',
      c.seller_onboarding_snapshot ->> 'link',
      c.seller_onboarding_snapshot ->> 'url',
      c.seller_onboarding_snapshot ->> 'sellerOnboardingLink',
      c.seller_onboarding_snapshot ->> 'seller_onboarding_link',
      c.seller_onboarding_snapshot ->> 'onboardingLink',
      c.seller_onboarding_snapshot ->> 'onboarding_link',
      c.seller_onboarding_snapshot ->> 'onboardingUrl',
      c.seller_onboarding_snapshot ->> 'onboarding_url',
      c.seller_onboarding_snapshot ->> 'portalUrl',
      c.seller_onboarding_snapshot ->> 'portal_url',
      c.seller_onboarding_snapshot ->> 'sellerPortalLink',
      c.seller_onboarding_snapshot ->> 'seller_portal_link',
      c.seller_onboarding_snapshot #>> '{formData,source}',
      c.seller_onboarding_snapshot #>> '{formData,emailType}',
      c.seller_onboarding_snapshot #>> '{formData,email_type}',
      c.seller_onboarding_snapshot #>> '{formData,flow}',
      c.seller_onboarding_snapshot #>> '{formData,workflow}',
      c.seller_onboarding_snapshot #>> '{form_data,source}',
      c.seller_onboarding_snapshot #>> '{form_data,email_type}',
      c.seller_onboarding_snapshot #>> '{form_data,flow}',
      c.seller_onboarding_snapshot #>> '{form_data,workflow}'
    )) as guardrail_signal,
    (
      coalesce(jsonb_object_length(c.seller_onboarding_snapshot -> 'formData'), 0) > 0
      or coalesce(jsonb_object_length(c.seller_onboarding_snapshot -> 'form_data'), 0) > 0
    ) as has_form_data_payload,
    (
      lower(coalesce(c.seller_onboarding_snapshot ->> 'status', '')) in ('completed', 'complete', 'submitted', 'in_progress', 'in progress')
      or nullif(c.seller_onboarding_snapshot ->> 'submittedAt', '') is not null
      or nullif(c.seller_onboarding_snapshot ->> 'submitted_at', '') is not null
      or nullif(c.seller_onboarding_snapshot ->> 'completedAt', '') is not null
      or nullif(c.seller_onboarding_snapshot ->> 'completed_at', '') is not null
    ) as has_submission_or_progress_signal,
    (
      c.seller_onboarding_snapshot ?| array[
        'sellerOnboardingLink',
        'seller_onboarding_link',
        'lastSellerOnboardingLink',
        'last_seller_onboarding_link',
        'sellerPortalLink',
        'seller_portal_link',
        'sellerPortalToken',
        'seller_portal_token',
        'sellerPortalInviteToken',
        'seller_portal_invite_token',
        'sellerPortalInviteTokenHash',
        'seller_portal_invite_token_hash',
        'sellerPortalSessionId',
        'seller_portal_session_id'
      ]
      or coalesce(c.seller_onboarding_snapshot -> 'formData', '{}'::jsonb) ?| array[
        'sellerPortalToken',
        'seller_portal_token',
        'sellerPortalSessionId',
        'seller_portal_session_id'
      ]
      or coalesce(c.seller_onboarding_snapshot -> 'form_data', '{}'::jsonb) ?| array[
        'sellerPortalToken',
        'seller_portal_token',
        'sellerPortalSessionId',
        'seller_portal_session_id'
      ]
    ) as has_transport_artifact_key
  from legacy_seller_onboarding_candidates c
  left join private_listing_seller_onboarding pso
    on pso.token = c.seller_onboarding_snapshot ->> 'token'
    or pso.private_listing_id::text = c.seller_onboarding_snapshot ->> 'privateListingId'
    or pso.private_listing_id::text = c.seller_onboarding_snapshot ->> 'private_listing_id'
),
bucketed as (
  select
    *,
    (
      guardrail_signal like '%seller_onboarding_link%'
      or guardrail_signal like '%seller onboarding link%'
      or guardrail_signal like '%seller_portal%'
      or guardrail_signal like '%seller portal%'
      or guardrail_signal like '%portal_invite%'
      or guardrail_signal like '%invite_token%'
      or guardrail_signal like '%/seller/onboarding/%'
      or has_transport_artifact_key
    ) as has_transport_artifact_signal,
    (
      has_form_data_payload
      or has_submission_or_progress_signal
    ) as has_true_seller_onboarding_signal
  from classified
),
final_buckets as (
  select
    *,
    case
      when private_listing_seller_onboarding_id is not null then 'already_canonical_skip'
      when has_transport_artifact_signal and not has_true_seller_onboarding_signal then 'link_artifact_skip'
      when has_true_seller_onboarding_signal then 'true_seller_onboarding_candidate'
      else 'ambiguous_manual_review'
    end as backfill_bucket
  from bucketed
)
select
  backfill_bucket,
  count(*) as lead_count,
  count(*) filter (where private_listing_seller_onboarding_id is not null) as already_canonical_count,
  count(*) filter (where has_form_data_payload) as has_form_data_payload_count,
  count(*) filter (where has_transport_artifact_signal) as has_transport_artifact_signal_count
from final_buckets
group by backfill_bucket
order by backfill_bucket;

-- Detail review query. Uncomment when you need row-level inspection.
-- select
--   backfill_bucket,
--   lead_id,
--   organisation_id,
--   stage,
--   status,
--   canonical_seller_onboarding_status,
--   guardrail_signal,
--   seller_onboarding_snapshot
-- from final_buckets
-- order by backfill_bucket, updated_at desc
-- limit 250;
