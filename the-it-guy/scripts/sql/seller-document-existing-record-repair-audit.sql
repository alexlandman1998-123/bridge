-- Read-only seller document repair audit.
-- Run only after the repair migration is installed. This does not create a
-- repair run, render PDFs, update requirements, or modify signed evidence.

with signed_sessions as (
  select
    session.id,
    session.private_listing_id,
    session.organisation_id,
    session.signer_email,
    session.signed_at,
    public.bridge_plan_listing_seller_document_repair(session.id) as plan
  from public.private_listing_mandate_signing_sessions session
  where session.status = 'signed'
), classified as (
  select
    id as signing_session_id,
    private_listing_id,
    organisation_id,
    signer_email,
    signed_at,
    plan->>'planDigest' as plan_digest,
    coalesce((plan->>'automaticRepairAllowed')::boolean, false) as automatic_repair_allowed,
    plan->'actions' as proposed_actions,
    plan->'manualReviewReasons' as manual_review_reasons
  from signed_sessions
)
select
  case when automatic_repair_allowed then 'automatic_repair_candidate' else 'manual_review_required' end as repair_bucket,
  count(*) over (
    partition by case when automatic_repair_allowed then 'automatic_repair_candidate' else 'manual_review_required' end
  ) as sessions_in_bucket,
  signing_session_id,
  private_listing_id,
  organisation_id,
  signer_email,
  signed_at,
  plan_digest,
  proposed_actions,
  manual_review_reasons
from classified
order by repair_bucket, signed_at, signing_session_id;
