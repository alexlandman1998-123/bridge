# Supabase Phase 7 Developer and Referral Network Report

Generated: 2026-07-15
Branch: `codex/db-phase0-reconciliation`
Project: `isdowlnollckzvltkasn`

## Outcome

Phase 7 is deployed, live-verified, recorded in the Supabase migration ledger, committed, and pushed. The batch enables developer partner relationships and agreements, authenticated partner-workspace invite binding, developer-sourced preferred partner defaults, the complete lead-referral ledger, external referral invite responses, internal terms responses, commission events, and CRM activity signals.

The migration audit moved from 343 matched / 19 local-only rows to 353 matched / 11 local-only rows, with no split or remote-only versions.

## Deployment correction

The Phase 7 audit found that the six-table referral foundation existed only at `the-it-guy/sql/20260704_lead_referrals.sql`. It was never placed in `supabase/migrations`, while the four historical referral migrations only used guarded `alter table if exists` and conditional function creation. Applying those four files alone would therefore have succeeded without creating the referral feature.

`202607140024_phase7_referral_foundation.sql` promotes the canonical foundation into migration history before the four historical enhancement migrations run. It also removes a hard foreign-key dependency on the deployment-optional `crm_deals` table while retaining the cross-module UUID fields.

## Applied migrations

- `202606290016` — developer partner relationships and agreements
- `202606290017` — developer partner invitation links
- `202606290018` — developer partner preferred defaults
- `202607050002` — referral MVP schema extensions
- `202607050003` — authenticated referral terms responses
- `202607050004` — external referral invite lookup and response
- `202607050005` — referral-to-lead activity signals
- `202607080004` — authenticated developer partner workspace binding
- `202607140024` — promoted referral foundation
- `202607140025` — developer/referral security reconciliation

All ten versions were recorded as applied after live verification.

## Security reconciliation

- Direct anonymous access is revoked from all three developer-partner tables and all six referral tables.
- Authenticated table access remains RLS-scoped to related organisations, agents, referrals, and partner workspaces.
- Anonymous users can inspect a valid bearer-token invitation and respond to an external referral invite.
- Anonymous users cannot prepare or accept developer partner invitations, respond to internal referral terms, or execute trigger helpers.
- Developer partner acceptance requires authentication and administration rights over the partner workspace being bound.
- Developer organisation ownership is immutable after relationship creation.
- A bound partner organisation cannot be replaced or removed.
- pgcrypto lookup is explicitly aligned with Supabase's `extensions` schema, fixing the historical `digest()` runtime failure.

## Verification evidence

The complete 3,006-line sequence passed against the linked project inside a rollback-only transaction before deployment. Post-deployment checks confirmed:

- 3 developer-partner tables, all with RLS, and 9 policies
- 6 referral tables, all with RLS, and 13 policies
- all developer/referral lifecycle and identity triggers
- all referral MVP, agreement, decline, branch, listing, and protection-period fields
- all preferred-partner routing fields
- legacy three-argument developer invite acceptance removed
- anonymous developer invite acceptance denied
- authenticated internal terms responses enabled
- anonymous external referral invite lookup and response enabled only through token-scoped RPCs
- invalid developer and referral tokens fail closed
- zero production developer relationships and referrals before deployment, so no existing user rows were transformed

A live rollback-only behavior fixture additionally proved that accepting an external referral synchronizes the referral, client, agreement, invite, and status-event records atomically. It also proved the developer and partner organisation identity guards reject ownership reassignment. The transaction rolled back and left no fixture data.

## Automated checks

- Supabase migration safety check: passed with 364 unique migration files
- Developer/referral reconciliation static guard: passed
- Developer partner invite binding contract: passed
- Full Phase 7 rollback-only SQL verification: passed
- Live post-deployment SQL verification: passed
- Live rollback-only referral/identity behavior smoke: passed
- Production application build: passed

## Remaining migration backlog

The remaining 11 pure local-only versions are intentionally outside Phase 7:

- notification automation: 6
- bond/finance: 2
- workspace platform: 1
- in-progress legal-document work: 2

There are no split ledger rows and no remote-only rows.
