# Public websites pilot closeout — Phase 6 hypercare

Phase 6 is implemented as a fail-closed 7–14 day production observation and acceptance gate. It is deliberately **not started** while Kingstons remains on the protected Vercel dark launch and its client domain is unlinked.

## What is now in place

- A production hypercare window bound to the exact production release, site and custom hostname.
- A database start gate requiring immutable named Phase 5 client approval, the exact active dark launch, and an active, primary, non-Vercel custom domain.
- One immutable observation per calendar day covering routes, desktop, mobile, listing sync, durable media, runtime errors and website-to-CRM lead reconciliation.
- A production incident register with immutable incident details and explicit resolution evidence.
- An immutable lifecycle ledger for start, observations, incidents, fixes and final acceptance.
- Privacy-safe structured lead logs that expose correlation IDs and outcomes without contact details, messages, IP addresses or fingerprints.
- Vercel Web Analytics and Speed Insights instrumentation.
- The existing `website_rollback_production_release` pause/rollback command remains the emergency switch.
- A protected manual workflow for status, start, daily observation, incident handling and final acceptance.

Phase 6 does not add a domain to Vercel, promote a deployment, alter DNS or nameservers, touch email records, schedule a pre-live job, or submit a test lead.

## Current state

`BLOCKED_PRE_LIVE` is the correct state until Phase 5 has genuinely activated the Kingstons custom domain. This is not a failed Phase 6 implementation: it prevents the 7-day clock from being started against a preview URL.

The Phase 6 schema is deployed to staging and production. Its production start gate was exercised after deployment and correctly refused to create a window: there is no active custom-domain release and no active primary custom domain. The Kingstons observation clock remains stopped.

## Activation sequence after Phase 5

1. Confirm the exact production release is `active`, with its client custom domain `active` and `is_primary = true`.
2. Reconfirm the deployed Phase 6 migration, its pgTAP contract and database security advisors.
3. Run the protected workflow with `start`. The database records the start, earliest acceptance at +7 days, and target closeout at +14 days.
4. Each day, inspect Vercel runtime logs and Speed Insights, complete mobile and desktop browser journeys, verify all public listing routes and durable media, and reconcile every website submission with its CRM lead and contact.
5. Record the signed daily evidence using `observe`. Any non-zero runtime error, tenant leak, lost lead, broken listing or serious regression makes that day fail.
6. Record incidents immediately. For a serious issue, use the existing rollback command first, then record and resolve the incident with the actual fix.
7. After at least seven full days and seven passing daily observations, resolve every incident and record named client production acceptance.

## Daily evidence contract

Start from [public-websites-pilot-closeout-phase6-observation.example.json](./public-websites-pilot-closeout-phase6-observation.example.json). Attach exact URLs, timestamps and monitoring references; do not place enquiry names, emails, phone numbers, messages or IPs in the artifact.

The zero-tolerance counters are:

- `runtimeErrorCount`
- `tenantLeakCount`
- `lostLeadCount`
- `brokenListingCount`
- `seriousRegressionCount`

`allLeadsInCrm` is true only when every non-duplicate website submission since production activation has both a routed CRM lead and contact. Notification failure is separately visible in the status report and must be investigated.

## Acceptance gate

Final acceptance is refused unless:

- seven full days have elapsed;
- at least seven distinct daily observations passed and none failed;
- all incidents are resolved;
- the exact production release and primary custom domain remain active; and
- a named Kingstons approver, role and approval reference are supplied using [public-websites-pilot-closeout-phase6-acceptance.example.json](./public-websites-pilot-closeout-phase6-acceptance.example.json).

The recommended target is 14 stable days. Seven days is the hard technical minimum; use the full 14 days if traffic is too low to exercise leads and listing changes credibly.
