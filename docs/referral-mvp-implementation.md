# Arch9 Referral MVP Implementation

Last updated: 2026-07-05

## Summary

The simple referral agreement MVP now uses the existing lead referral infrastructure instead of creating a new canonical referral module. It supports:

- Internal client referrals between agents.
- Cross-branch and external Arch9 referrals where the recipient can be resolved.
- Buyer introductions and listing collaboration as referral types.
- External email invite referrals through `/referrals/invite/:token`.
- Plain-English agreement snapshots with proposed commission split and protection period.
- Recipient accept, decline and needs-review responses.
- Conversion, commission due and paid tracking through referral commission events.
- CRM lead activity signals for new referral lifecycle events.

The implementation is intentionally limited to "create referral -> propose terms -> recipient accepts or declines -> agreement is locked -> commission can be tracked."

## Implemented

### Schema And Migrations

Added guarded Supabase migrations:

- `supabase/migrations/202607050002_referral_mvp_phase1_schema.sql`
- `supabase/migrations/202607050003_referral_mvp_phase3_terms_response_rpc.sql`
- `supabase/migrations/202607050004_referral_mvp_phase6_external_invite_response.sql`
- `supabase/migrations/202607050005_referral_mvp_phase9_activity_signals.sql`

Mirrored the referral MVP schema and RPC changes into:

- `the-it-guy/sql/20260704_lead_referrals.sql`

### Service Layer

Updated `the-it-guy/src/services/leadReferralService.js` to support:

- Referral types:
  - `client_referral`
  - `buyer_introduction`
  - `listing_collaboration`
  - `external_referral`
- Default commission splits:
  - Same branch: 10%
  - Cross-branch: 15%
  - External: 20%
  - Buyer introduction or listing collaboration: 50%
- Agreement text generation.
- Agreement and invite mapping for accepted, declined and locked agreement fields.
- Internal terms responses through `respondToLeadReferralTerms`.
- External invite responses through `respondToLeadReferralInvite`.
- Decline reason validation for internal and external responses.
- Conversion and commission event recording.
- Paid commission recording.

### UI

Updated `the-it-guy/src/pages/AgentLeadsPage.jsx`:

- Referrals Given form captures referral type, client, recipient scope, receiving agent/email, related listing, company, commission split, protection period and notes.
- The form previews the generated agreement text before creation.
- Referrals Received cards show terms context and expose accept, discuss and decline actions.
- Decline requires a reason.
- Received cards show locked accepted/declined state after response.
- Referral ledger views show type, listing reference, protection period, commission split and agreement status.
- Existing referral finance controls support conversion and mark-paid workflows.

Updated `the-it-guy/src/pages/ReferralInvitePage.jsx`:

- Public invite page displays referral type, client, lead type, referring agent, recipient, commission split, protection period, related listing, agreement status, client context, notes and agreement text.
- External invite recipients can accept or decline.
- Decline requires a reason.
- Accepted and declined final states are shown clearly.

### Routing

The external referral invite page is available at:

- `/referrals/invite/:token`

This route is already allowed through the setup/auth gating paths in `the-it-guy/src/App.jsx`.

## Tables Used

### `lead_referrals`

Primary referral ledger row. Stores source/target organisation, source lead, source/target agent, referral type, recipient scope, status, commission summary, agreement summary, invite token and lifecycle timestamps.

### `referral_clients`

Snapshot of the referred buyer or seller client. Keeps the referral independent from later lead edits.

### `referral_agreements`

Versioned agreement snapshot. Stores exact agreement text, commission split, commission basis, protection period, acceptance or decline fields and lock timestamp.

### `referral_status_events`

Append-only referral lifecycle event stream for creation, acceptance, decline, needs review, conversion, commission due, paid, follow-up and loss events.

### `referral_invites`

External invite token records. Stores invite email, token status, expiry, accepted/declined timestamps and decline reason.

### `referral_commission_events`

Commission event ledger. Stores conversion, commission due and commission paid events with gross commission, referral commission, split percentage, payment reference and actor metadata.

### `lead_activities`

Existing CRM activity stream. New `referral_status_events` are mirrored into lead activities by `bridge_referral_status_event_to_lead_activity`, giving the referring agent and source lead a visible activity signal for creation, acceptance, decline, needs review, conversion, commission due, paid, follow-up and lost events.

## Columns Added Or Extended

### `lead_referrals`

- `referral_type`
- `related_listing_id`
- `source_branch_id`
- `target_branch_id`
- `protection_period_days`
- `accepted_at`
- `accepted_by_user_id`
- `accepted_by_email`
- `declined_at`
- `declined_by_user_id`
- `declined_by_email`
- `decline_reason`
- `agreement_locked_at`

Status constraint now includes:

- `draft`
- `sent`
- `received`
- `accepted`
- `declined`
- `needs_review`
- `contacted`
- `working`
- `converted`
- `lost`
- `commission_due`
- `paid`
- `cancelled`

### `referral_agreements`

- `protection_period_days`
- `accepted_by_user_id`
- `declined_by_user_id`
- `declined_by_email`
- `decline_reason`
- `locked_at`

### `referral_invites`

- `declined_at`
- `declined_by_user_id`
- `decline_reason`

## RPCs Added Or Updated

### `bridge_respond_referral_terms`

Handles authenticated internal referral responses:

- Accept
- Decline
- Needs review or manual discussion

It updates `lead_referrals`, latest `referral_agreements`, `referral_clients` and inserts `referral_status_events`.

### `bridge_lookup_referral_invite_by_token`

Loads the external invite page payload for a token, including invite, referral, client and latest agreement data.

### `bridge_respond_referral_invite`

Handles public invite accept/decline responses. It now accepts `p_decline_reason`, requires a reason for declines, writes acceptance/decline audit fields and inserts `referral_status_events`.

### `bridge_referral_status_event_to_lead_activity`

Trigger function that mirrors new `referral_status_events` into `lead_activities` when the source referral has a persisted organisation and source lead. It is best-effort and does not block the referral status event if CRM activity insert fails.

## Current Workflow

1. Referring agent creates a referral from Referrals Given.
2. The system snapshots the client, proposed agreement text, commission split and protection period.
3. Internal recipients see the referral in Referrals Received.
4. External invite recipients open `/referrals/invite/:token`.
5. Recipient accepts, declines or requests manual discussion.
6. Acceptance locks the agreement snapshot and changes the referral to `accepted`.
7. Decline records `declined_at`, declined actor details and required decline reason.
8. Conversion can be recorded later.
9. Converted referrals can move to `commission_due`.
10. Principal/admin workflow can mark commission as paid through the existing referral finance action.
11. Each new referral status event is mirrored into the source lead CRM activity feed when possible.

## Still Needs To Be Built Later

- Automatic external referral email sending.
- Dedicated in-app notification delivery for referral creation, acceptance, decline and needs review.
- Optional lead assignment to the receiving agent when terms are accepted.
- IP address and user-agent capture for acceptance audit.
- Principal/branch-manager override UI for disputed or needs-review referrals.
- Dedicated branch-manager cross-branch referral dashboard.
- Structured agency-to-agency referral entities instead of email/company text only.
- First-class co-listing, joint mandate and multi-agent collaboration models.
- Full commission payout engine with approvals, deductions, VAT/tax treatment and settlement exports.
- Canonical Referral & Collaboration module that can unify lead referrals, listing collaboration, partner routing and transaction partner referrals.
- Automated regression tests for the public invite page and received-referral response actions.

## Known Limitations

- This is not a legal e-signature system.
- Agreement text is plain text and generated at referral creation time.
- No negotiation flow exists; recipients can accept, decline or request manual discussion only.
- External invite delivery still depends on manually sharing the generated invite link unless email sending is wired separately.
- Referral status events are mirrored into CRM lead activity only for new events after the Phase 9 migration is applied; there is no backfill for older events.
- Referral activity signals are not yet a dedicated in-app notification inbox or email notification stream.
- Partner routing and bond/attorney recommendations still do not create lead referral ledger records.
- Listing collaboration is represented as referral type and related listing reference, not as shared ownership or joint mandate records.
- Deployment must apply the added Supabase migrations before relying on the new RPC signatures in production.
