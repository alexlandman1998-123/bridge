# Phase 11: Supabase Public Intake Readiness

Date: 2026-07-29

## Scope

Assess whether the public buyer/seller intake feature can be safely treated as production-ready from the Supabase side. No production SQL was applied, no migration ledger was repaired, no PR labels were changed, and no PR was converted out of draft in this phase.

## Current Production Symptom

The UI is loading the public intake settings entry, but it reports that storage is not installed.

The production public intake API still returns a missing-schema style error:

```text
https://app.arch9.co.za/api/public/agency-intake?slug=test-agency
{"error":"PGRST205","message":"Agency public intake could not be loaded."}
```

Interpretation:

The Vercel code deployment is ahead of the production Supabase schema. Public intake code is present, but the backing tables are not installed in the linked production project.

## PR State

PR #7 remains the only open public intake PR:

- URL: `https://github.com/alexlandman1998-123/bridge/pull/7`
- Branch: `codex/agency-public-intake-pr`
- Head commit: `19c9e85da4f9b14f78bbb18f409185be9baec4b3`
- Base: `main`
- Draft: yes
- Labels: none
- GitHub merge state: blocked

Current checks:

- Passing: `Vercel Preview Comments`
- Passing: `Vercel - bridge`
- Passing: `Vercel - bridge-admin`
- Failing: `Supabase Phase 0 Guard / Verify broad migration commands remain blocked`
- Failing: `Supabase Phase 8 Closeout Gate / Verify reconciliation closeout remains fail-closed`
- Skipped: `Supabase Preview`

## Public Intake Migrations

PR #7 adds exactly three Supabase migrations:

- `supabase/migrations/202607290002_agency_public_intake_links_phase1.sql`
- `supabase/migrations/202607290003_agency_public_intake_submissions_phase2.sql`
- `supabase/migrations/202607290004_agency_public_intake_phase8_automation.sql`

Assessment:

- The migration order is correct: links first, submissions second, notification automation third.
- The files are focused on public intake objects and their notification automation.
- A broad `supabase db push` is not safe because production is behind many local migration versions, not only these three.

## Local Gate Repair

The local Phase 8 closeout gate was failing partly because Supabase evidence metadata pointed to a filename that does not exist in the repository:

```text
202607250001_seller_portal_payload_optional_enrichment_guard.sql
```

The actual tracked file is:

```text
202607250007_seller_portal_payload_optional_enrichment_guard.sql
```

The evidence metadata was corrected in:

- `docs/supabase-phase-5-application-manifest.json`
- `docs/supabase-push-phase-5-production-promotion.json`
- `docs/supabase-phase-8-closeout-evidence.json`
- `docs/supabase-ledger-drift-resolution.json`

After that metadata fix, these local checks pass:

```bash
node scripts/supabase-phase8-closeout.test.mjs
node scripts/supabase-phase0-guard.test.mjs
```

The local closeout plan also no longer reports missing manifest files:

- `missingManifestFiles`: `[]`
- `duplicateVersions`: `[]`
- closeout evidence rows complete: yes
- recovery evidence locked: yes

## Live Supabase Ledger State

Linked Supabase project:

```text
isdowlnollckzvltkasn
```

Live closeout verification remains blocked:

```bash
node scripts/supabase-phase8-closeout.mjs --verify-live --json
```

Result:

- `status`: `CLOSEOUT_BLOCKED`
- `pureRemoteOnly`: `[]`
- `divergent`: `[]`
- `unreviewedSplitVersions`: `[]`
- `pureLocalOnly`: 35 versions

The public intake versions are among the local-only migrations:

- `202607290002`
- `202607290003`
- `202607290004`

Interpretation:

Production's migration ledger is not diverged, but it is materially behind local. Applying every local-only migration would be a broad database change and should not be done as part of a focused public intake fix.

## Required Dependency Preflight

Before applying only the public intake migrations, verify these dependencies exist in production:

- `public.organisations`
- `public.organisation_branches`
- `public.organisation_users`
- `public.leads`
- `public.bridge_set_updated_at`
- `public.bridge_is_active_member`
- `public.bridge_is_org_admin`
- `public.notification_automation_definitions`
- `public.notification_events`

The read-only dependency query was attempted but did not complete locally; it hung after Supabase CLI login-role initialisation and was interrupted. This preflight is still required before any production SQL application.

## Label Decision

PR #7 currently has no labels.

The `database-reconciliation` label would allow the PR migration freeze path to proceed, but it should only be added after there is a reviewed, narrow Supabase application packet for the three public intake migrations. It should not be used just to silence the guard.

## Recommended Route

1. Commit and push the metadata filename correction so the Phase 8 closeout gate can re-run with accurate evidence.
2. Prepare a narrow production application packet for only:
   - `202607290002_agency_public_intake_links_phase1.sql`
   - `202607290003_agency_public_intake_submissions_phase2.sql`
   - `202607290004_agency_public_intake_phase8_automation.sql`
3. Run the required production dependency preflight.
4. Confirm backup/recovery posture immediately before applying SQL.
5. Apply exactly those three SQL files in order; do not run broad `supabase db push`.
6. Record the three migration versions in the production migration ledger if the application route does not do that automatically.
7. Reload PostgREST schema cache.
8. Verify:
   - public intake settings warning disappears
   - public intake performance warning disappears
   - `GET /api/public/agency-intake?slug=...` no longer returns `PGRST205`
   - seller intake submission creates the expected CRM lead
   - buyer intake submission creates the expected CRM lead and enquiry activity
9. Only then add the appropriate reconciliation label, convert PR #7 from draft, and re-run merge readiness.

## Phase 11 Decision

Public intake is code-deployed but not Supabase-ready.

The safe next move is a focused Supabase production application phase for the three public intake migrations, preceded by dependency and backup checks. The unsafe move is a broad migration push, because production is behind 35 local migration versions.
