# Admin Portal Phase 1 Operating Metrics

Date: 2026-08-05

## Purpose

This document defines the operating metrics for the rebuilt Arch9 admin portal. These definitions are the product contract for the new dashboard and support console.

The portal should answer five questions quickly:

- How active is the marketplace?
- How much near-term revenue is in motion?
- How much revenue has been recognized this month?
- Which organisations, agents, listings, and transactions need attention?
- What support work should be handled today?

## Metric Principles

- Count only records the business would defend in a meeting.
- Prefer canonical dates and statuses over broad fallbacks.
- Do not mix Arch9 revenue, agency commission, gross commission, and property transaction value.
- If a metric cannot be calculated confidently, show `0` plus a warning, not an invented estimate.
- Dashboard metrics should be calculated in Supabase and returned through RPC contracts.

## Revenue Decision

For the V1 admin dashboard, `revenue` means **Arch9 operating revenue**.

It does not mean:

- property sale value
- agency gross commission
- agent commission
- referral partner commission unless Arch9 earns it
- projected revenue invented from average fees

Supporting finance fields can still be shown later as drilldowns:

- gross commission
- agency commission
- agent commission
- referral revenue
- subscription revenue
- property transaction value

## Core Dashboard Metrics

### Active Organisations

Definition:

Count organisations that are enabled and operational.

Include when:

- organisation status is active-like, or status is missing and the row is not archived/deleted
- organisation has active users, active listings, active transactions, or recent activity in the selected period

Exclude when:

- status is `inactive`, `archived`, `deleted`, `suspended`, `disabled`
- organisation is a test/demo account unless explicitly included by an admin filter

Primary sources:

- `organisations`
- `organisation_users`
- `profiles`
- `private_listings`
- `transactions`

Display:

- KPI count
- change vs previous equivalent period
- top active organisations table

### Active Agents

Definition:

Count agent users who are currently participating in the platform.

Include when:

- role resolves to agent-like role, and
- user/profile is active, and
- at least one of these is true in the selected period:
  - assigned to an active listing
  - assigned to an active transaction
  - created or updated a lead/listing/transaction
  - has a recent login/activity signal

Exclude when:

- status is `inactive`, `archived`, `deleted`, `suspended`, `disabled`
- user only exists as an invited-but-not-accepted record
- user belongs only to test/demo organisations

Primary sources:

- `profiles`
- `organisation_users`
- `private_listings`
- `transactions`
- `audit_logs` or activity tables where available

Display:

- KPI count
- active by organisation
- inactive agents with live work assigned

### Active Listings

Definition:

Count listings that are live enough to create buyer/transaction opportunity.

Include when:

- listing is published, live, marketed, active, reserved, or under offer
- listing is not closed or withdrawn

Exclude when:

- status is `draft`, `not_published`, `inactive`, `archived`, `withdrawn`, `sold`, `registered`, `deleted`
- listing is missing an organisation/owner unless intentionally surfaced in support

Primary sources:

- `private_listings`
- `listing_publication_data`
- `partner_share_resources` only for later distribution drilldowns

Display:

- KPI count
- by organisation
- listings missing price, agent, publication status, or seller onboarding

### Seller Signed And Buyer Signed Pipeline

Definition:

Count transactions where both sides have reached a signed state, but registration has not happened.

Include when:

- seller signed signal is present, and
- buyer signed/OTP signed signal is present, and
- transaction is not registered, cancelled, lost, archived, or deleted

Preferred seller signed signals:

- `seller_signed_at`
- `seller_signature_at`
- `seller_otp_signed_at`
- `mandate_signed_at`
- canonical legal/signing event once available

Preferred buyer signed signals:

- `buyer_signed_at`
- `buyer_signature_at`
- `buyer_otp_signed_at`
- `otp_signed_date`
- `offer_signed_at`
- canonical legal/signing event once available

Primary sources:

- `transactions`
- legal document/signing tables once canonicalized
- transaction workflow events

Display:

- KPI count
- pipeline table
- age since last signature
- days stalled

### Pipeline Revenue

Definition:

Expected Arch9 operating revenue from seller-signed and buyer-signed transactions that are not registered yet.

Include when:

- transaction qualifies for Seller Signed And Buyer Signed Pipeline, and
- a real Arch9 revenue amount or platform fee can be read

Preferred amount fields:

- `arch9_revenue_amount`
- `platform_fee_amount`
- `platform_fee`
- `transaction_fee`
- `fee_amount`
- `revenue_amount`

Fallback:

- If only gross commission or agency commission exists, do not mix it into Arch9 revenue silently.
- Return the transaction with `revenueMissing: true` and include it in a support/attention warning.

Exclude:

- gross property sale value
- gross commission unless explicitly shown as a separate non-revenue column
- estimated revenue based on average fees

Display:

- KPI amount
- pipeline count
- table of pipeline transactions with missing-revenue warnings

### Registered Revenue This Month

Definition:

Recognized Arch9 operating revenue from transactions registered during the current calendar month.

Date window:

- from the first day of the current month at 00:00 local business time
- through now, or through the selected range end if a historical range is selected

Include when:

- transaction is registered, and
- registration date falls inside the month/range, and
- real Arch9 revenue amount is present

Preferred registration fields:

- `registration_date`
- `registered_at`
- `date_registered`
- `transfer_registered_at`

Preferred amount fields:

- `arch9_revenue_amount`
- `platform_fee_amount`
- `platform_fee`
- `transaction_fee`
- `fee_amount`
- `revenue_amount`

Exclude:

- transactions created this month but registered earlier/later
- non-registered transactions
- gross commission unless shown separately
- subscriptions unless the dashboard adds a separate subscription revenue KPI

Display:

- KPI amount
- registered count
- registered transactions table

### Registered Transactions This Month

Definition:

Count transactions registered in the current month/range.

Include when:

- status or stage indicates registered, or a registration timestamp exists
- registration timestamp falls inside the selected month/range

Exclude:

- completed non-registration workflows
- cancelled/lost/archived transactions

Display:

- KPI count
- recent registrations table

### Stalled Transactions

Definition:

Open transactions that have not moved recently.

Include when:

- transaction is active/open, and
- not registered/cancelled/lost/archived/deleted, and
- last activity is older than 14 days

Priority:

- `medium`: no activity for 14-29 days
- `high`: no activity for 30+ days

Primary sources:

- `transactions`
- transaction workflow events
- audit/activity logs where available

Display:

- attention count
- support queue rows
- organisation, owner, stage, days stale, suggested action

## Support Console Metrics

### Open Support Items

Definition:

All unresolved support tickets plus operational exceptions generated from platform data.

Include:

- support tickets not closed/resolved
- stalled transactions
- listings missing required operational fields
- users with accepted invites but no access/profile
- organisations with onboarding/setup gaps

Primary sources:

- `support_tickets`
- `transactions`
- `private_listings`
- `profiles`
- `organisation_users`
- invite tables

### Urgent Support Items

Definition:

Open support items that are marked urgent/critical/high or operationally high risk.

Include:

- ticket priority `urgent`, `critical`, `high`, `p0`, `p1`
- transactions stale for 30+ days
- signed pipeline transactions missing revenue values
- active listings without an owner/agent

Display:

- count
- work queue sorted by priority and last activity

## Dashboard V1 Layout Contract

The first screen should show:

- Active Organisations
- Active Agents
- Active Listings
- Pipeline Revenue
- Registered Revenue This Month
- Seller + Buyer Signed Pipeline Count
- Registered Transactions This Month
- Stalled Transactions

Below the KPI strip:

- Pipeline table
- Registered this month table
- Attention queue
- Support summary

## Phase 2 Contract Alignment

The Phase 2 RPCs should expose these names:

- `kpis.activeOrganisations`
- `kpis.activeAgents`
- `kpis.activeListings`
- `kpis.pipelineRevenue`
- `kpis.registeredRevenueThisMonth`
- `kpis.sellerSignedBuyerSigned`
- `kpis.registeredThisMonth`
- `kpis.stalledTransactions`
- `pipeline[]`
- `registered[]`
- `attention[]`
- `warnings[]`

Known tightening needed after this Phase 1 definition:

- Remove gross/agency commission fallbacks from `pipelineRevenue` and `registeredRevenueThisMonth` unless a separate field labels them clearly.
- Add `revenueMissing` warnings for signed/registered transactions with no Arch9 operating revenue amount.
- Base active agents on activity signals, not profile role alone.
- Add demo/test organisation filtering once the canonical flag is confirmed.

## Open Decisions

- Confirm the canonical Arch9 revenue field for transactions.
- Confirm whether subscription revenue belongs on the main dashboard or a later finance drilldown.
- Confirm the canonical signing event fields for seller and buyer.
- Confirm the canonical local business timezone for month boundaries.
- Confirm how test/demo organisations are flagged.
