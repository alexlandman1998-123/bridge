# Launch readiness — Phase 0 baseline

Captured: 2026-09-05  
Baseline commit: `08c5adc33c39` on `main`

## Environment map

| Environment | Supabase project ref | Configuration source | Runtime policy |
| --- | --- | --- | --- |
| Staging | `vaszuxjeoajeuhlcnzzf` | `.env.staging.local` | Default target for readiness checks |
| Production | `isdowlnollckzvltkasn` | `.env.production.local` | Requires `--allow-production-read-only` |

The runtime readiness runner accepts `--environment=staging` or `--environment=production` only. It rejects any project ref that does not match the selected environment and never loads staging and production environment files together.

## Repository baseline

- Local migration files: 855
- Latest migration: `20260903130012_development_marketing_invite_delivery_phase5.sql`
- Working tree: 16 pre-existing modified files at capture time. They are intentionally excluded from this Phase 0 change.

## Change-control rule

Do not combine unrelated agent, branch, organisation, invite, or branding work with readiness remediation. Each later phase must start from a recorded commit and rerun the applicable readiness checks before merging.

## Phase 1 — harness alignment (completed 2026-09-05)

The readiness harness now tests the released contracts rather than superseded UI implementation details:

- Residential branch principal claims are created inline through the canonical invite service.
- Agent lead workspaces resolve their route, workspace, and canonical organisation contexts in priority order.
- Branding uses public storage URLs first and signs only when a public URL is unavailable.
- Cached sidebar branding remains visible while an image load event is pending.
- Opening a fully hydrated lead workspace is read-only; it must not patch the CRM lead merely by rendering.

Verified commands:

- `node scripts/workspace-user-invites.test.mjs`
- `node scripts/agent-invite-onboarding-readiness.test.mjs`
- `node scripts/agent-lead-workspace-org-scope.test.mjs`
- `node scripts/organisation-bootstrap-branding-phase4.test.mjs`
- `node scripts/workspace-branding-hydration.test.mjs`
- `node scripts/agency-lead-workspace-hydration-smoke.mjs`

## Phase 2 — participant data-scope contract (completed 2026-09-05)

Agent participant queries now select their parent transaction with an inner join and filter `transaction.organisation_id` to the active organisation. If PostgREST reports a stale or missing relationship cache, the compatibility path reads only candidate participant IDs and batch-validates them against `transactions.organisation_id` before returning access.

Verified commands:

- `node scripts/agent-dashboard-query-scope-phase3.test.mjs`
- `node scripts/agent-leads-workspace.test.mjs`

This protects both the primary query and relationship-cache fallback from returning a transaction belonging to another organisation. No schema migration or production data mutation was required.

## Phase 3 — organisation and branding hydration (completed 2026-09-05)

Organisation branding hydration now preserves independent last-good branding for each user/workspace pair, avoiding a blank logo when returning to a previously used workspace without ever reusing another workspace's brand. Storage-backed branding also distinguishes existing signed URLs from public URLs: private assets are re-signed, rather than being downgraded to a constructed public URL.

Verified commands:

- `node --test src/context/__tests__/organisationBrandingCache.test.js`
- `node scripts/organisation-bootstrap-branding-phase4.test.mjs`
- `node scripts/workspace-branding-hydration.test.mjs`
- `node scripts/workspace-branding-observability.test.mjs`

No schema migration or production data mutation was required.

## Phase 4 — staging live RLS and data gate (completed 2026-09-05)

The approved staging target (`vaszuxjeoajeuhlcnzzf`) passed the live read-only runtime gate: all required tables and RPCs are exposed, the internal probe user can read its authorised organisation data, and an unrelated authenticated user sees no rows in the protected Agency tables.

The isolation verifier now has an explicit ephemeral-fixture mode. It creates a uniquely namespaced unrelated staging user, confirms that it has no organisation membership, runs the probes, and deletes the user during cleanup. The ordinary package test is dry-run only; a live staging proof requires the explicit verification command.

Verified command:

- `npm run verify:agency-runtime-isolation:staging`

No production system was contacted. The temporary staging auth user created for this proof was removed.

## Phase 5 — browser launch journeys (completed 2026-09-05)

The local browser smoke suite now exercises the rendered, authenticated agency flows that were most likely to regress at launch:

- Organisation and branch invite actions can continue when no sales commission structure exists; commission assignment is explicitly optional and each action is disabled only while its request is submitting.
- The organisation branding route renders the compact brand-health header, Identity and Colours & Typography cards, and version history control.
- Retired branding surfaces do not render: live preview, onboarding links, public intake and intake performance, email/portal preview, document/app icons, and public branding.

Verified command:

- `npm run test:agency-browser-smoke`
- `npm run test:agent-invite-commission-readiness`

The suite runs against a local development server with an isolated fake Supabase endpoint. It does not create or modify production or staging records.

## Phase 6 — production release gate (implemented 2026-09-05)

Production certification is now an explicit, read-only gate. It requires both a production-read-only acknowledgement and a separate production-readiness confirmation, then requires an immutable `--release-ref` matching the checked-out full commit SHA and a clean working tree. Only after those local conditions pass does it invoke the production runtime readiness probe against the approved production Supabase project (`isdowlnollckzvltkasn`).

The production probe signs in configured existing probe users and performs schema/RLS reads only. It does not create an unrelated-user fixture, write data, deploy, or alter production configuration. A `READY` report is evidence for a human deployment decision, not an automated deployment.

Verification commands:

- `npm run test:agency-production-release-gate`
- `npm run verify:agency-production-release-gate -- --release-ref=<full-current-commit-sha>`
