# Arch9 production release — 19 October 2026

The requester authorised all outstanding edits and migrations from 17–19 October 2026 for production. The candidate starts from remote main `7b2bdd2350253792104e7ec85324a0adf19d7c3a` and reconciles the active checkout without resetting, staging or committing that checkout. Previously released Meta ownership, consent, attribution, phone-app sync and listing-publication protections are retained. Generated output, environment files and the independent Only Realty checkout are excluded.

## Production database and functions

Target: Arch9 SaaS, `isdowlnollckzvltkasn`. Guard passed; no duplicate migration timestamps. Recovery is RECOVERY_LOCKED with eight physical backups and the accepted isolated restore rehearsal. Pre-change function definitions/ACLs and constraints are retained privately outside Git. No production restore was performed.

The reviewed linked dry run used `--include-all --skip-vault` solely because pending files precede already-applied migrations. No seeds or custom roles were included. All 15 migrations below applied successfully and all 15 history entries were verified. A fresh linked dry run reports zero pending migrations.

- `20261018083318_knowledge_factory_report_cost_approval_and_credit_ledger.sql`
- `20261019152345_rental_dashboard_active_portfolio.sql`
- `20261019165256_calendar_time_change_workflow.sql`
- `20261019172522_calendar_time_change_notifications.sql`
- `20261019174614_calendar_time_change_alignment.sql`
- `20261019175522_calendar_time_change_access_guards.sql`
- `20261019183254_transaction_historical_journey.sql`
- `20261019185816_knowledge_factory_seller_lead_filing.sql`
- `20261019191728_knowledge_factory_report_boundary_and_existing_seller.sql`
- `20261019192602_transaction_seller_manual_capture.sql`
- `20261019195213_transaction_buyer_capture_alignment.sql`
- `20261019200756_transaction_seller_onboarding_links.sql`
- `20261019204416_rental_application_first_version.sql`
- `20261019210931_buyer_document_upload_continuity.sql`
- `20261019212951_buyer_document_requirement_audience.sql`

Deployed and verified ACTIVE: `send-email` version 174, `buyer-viewing-preferences` version 35 and `calendar-appointment-delivery-worker` version 3. No delivery or provider-publication action was manually invoked for verification.

The security advisor count increased from 1,798 to 1,813 notices: five anonymous and ten authenticated SECURITY DEFINER RPC visibility notices for the new scoped APIs. No new mutable-search-path, materialized-view or authentication-configuration finding appeared. All ten relevant new public RPCs revoke default PUBLIC execution. Scoped token, membership, stale-revision and cross-context denial cases pass in the fixture checks; these notices are recorded, not claimed cleared.

## Validation

- Active checkout: full check:app passed (lint, established baseline, production build); website and admin checks/builds passed.
- Combined candidate: established baseline passed; complete lint identified three merge errors, all corrected and rechecked with scoped lint (zero remaining errors in those files). Existing warnings remain.
- Buyer document persistence, command SQL, historical journey, buyer manual/online capture, seller onboarding links and report filing fixtures passed.
- Calendar time-change fixtures passed, including original booking preservation, permission fences, expiry, token rotation, reminders and provider-copy continuity.
- Seller capture, buyer portal trust, document manager, audience builder and rental listing checks passed.
- WhatsApp campaign controls: all 16 tests passed after retaining background resume/pause/cancel behavior in the results redesign.
- Current Meta integration UI: 10 tests passed; current Meta ownership/consent/inbox/automation database checks passed.
- Rental portal snapshot/journey services: 17 tests passed; rental portal UI parity: 8 tests passed.
- Knowledge Factory report accounting/invoices: 20 tests passed.
- Edge delivery/rendering: 34 Deno tests passed using the configured import map.
- No changed environment files or literal privileged credentials were found in the release source.

The older buyer-process Phase 6 contract was aligned with the approved journey labels and retired OTP workspace. It and the current signed-OTP Documents/retired-tab routing check pass.

## Application release

Source: `17b4b3534` on `codex/production-outstanding-20261019`.
Operating Console: `dpl_2ZyVcLMBtxVVSSutfYfDrWhue3TT`, promoted to https://admin.arch9.co.za; authenticated dashboard loaded and live metrics rendered.
Primary workspace: `dpl_91ajhWWpKGNu8YW3rcMinDHJQAb1` is Ready and promoted to https://app.arch9.co.za. The custom domain resolves to that exact deployment. Vercel build, schema and operational packaging checks passed; entry gzip 131,177 bytes, global CSS gzip 157,596 bytes, legacy API gzip 329,102 bytes, within the unchanged budgets. The live sign-in screen rendered after the browser refreshed its prior app files. Authenticated Settings pages were not re-tested on production in this release.
Websites: 17–19 October source already matches remote main; no additional website release was necessary.

The failed initial app build and superseded unpromoted candidates were not assigned to app.arch9.co.za. The production recovery app deployment is `dpl_6jazyR1rR7pjiRe5YT8UDCRtMk5a`. Recover by promoting that retained app artifact and restoring the captured database definitions and rebuilding prior Edge Function code from the retained baseline source only through a separately reviewed, data-preserving correction. Do not remove additive schema, document evidence, receipts or uploaded bytes.

A live anonymous invalid seller-onboarding token was rejected with SQLSTATE 42501; no data was changed.

Hosted save/upload, legal signature and real outbound-delivery canaries were not repeated as part of this release. Deployment verification is not a new full end-to-end document-flow certification.
