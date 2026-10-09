# Database Release Runbook

## Temporary direct-production pilot (26 September–26 December 2026)

The requester has chosen direct production releases at any hour during this early, no-live-user pilot. This section temporarily supersedes the staging prerequisite and broad-push freeze below when a production push is explicitly requested in the current task. It does not authorize unrelated future changes or destructive database resets. Review the policy by 26 December 2026; do not automatically reinstate the old staging gate without discussing it with the requester.

For each requested release:

1. Confirm the linked project is the intended production project, run `npm run supabase:guard` and `npm run supabase:push:lock-recovery`, and stop if target or recovery checks fail.
2. Run the narrow app checks for the changed product. Inspect the exact pending migration set with `npx supabase db push --linked --dry-run --skip-vault`; use `--include-all` in the dry run only if older-version files require it. Do not push a surprising or unreviewed migration list.
3. When the user has approved that release, use the Phase 0 guard's explicit override for the exact reviewed push. Keep `--skip-vault`; do not include seed data or custom roles. Apply migrations before dependent application code.
4. Verify migration history, key new objects/RPCs, and an available security advisor check. Then deploy the corresponding application commit and verify the deployment and live route. If a step fails, stop and report the partial state; do not conceal it or continue blindly.

The historical reconciliation process remains below for later cleanup and for teams that choose the staged route. Staging drift alone is not a reason to hold an explicitly requested direct-production pilot release.

## Seller document migration and historical record checks

Run `npm run audit:migration-history` from the repository root for a read-only
comparison of versions, names and recorded SQL. It checks matching timestamps
as well as missing files; a recorded version alone does not prove matching SQL.
`--strict` returns a failure for unresolved history differences. Reports contain
statement indexes and counts, never SQL text or credentials. Empty recorded SQL
means unavailable evidence, not proof that schema changes are missing.

When direct CLI database access is unavailable, supply `--remote-ledger=<file>`
and `--remote-statements=<file>` with read-only exports. The ledger must include
`version`, `name` and `sql_hash` from
`md5(array_to_string(statements, E'\n\n'))`; statement archives are used only
when their hashes match that ledger. Keep the capture time and target identity
with the evidence. Check effective current function bodies and access controls
before deciding whether any historical difference requires a forward correction.
Never repair the ledger or replay an old migration merely because its name differs.

Run `npm run check:migrations:local` for the complete clean migration replay and
atomic transaction probes. It requires a local Docker engine and at least 10 GiB
free on the host filesystem, creates a temporary project with
separate ports and an internal network, disables scheduled jobs, and excludes
production configuration and seeds. It removes its own stack after success or
failure. A missing engine or failed replay is a failed check, never acceptance.
`npm run test:migration-audit` verifies the history comparison and replay safety
guards with synthetic commands; that test does not replace a real replay.

The primary app's `scripts/sql/seller-mvp-acceptance-audit.sql` runs in a read-only
transaction and classifies historical seller candidates. It identifies unfinished
capture, canonical conflicts, rentals outside seller-sale scope, and approved or
signed copies that must be preserved. Its output is an agent review queue, not
repair instructions. Resolve facts through the existing canonical seller save
after the agent confirms them; review unsigned replacements separately. Preserve
frozen copies, signatures and historical requirements. Live repairs require
explicit approval for their exact records and proposed changes.

Mandate wording renewal does not require a JSON backfill or a rehash of old
documents. The read-only seller audit flags legacy mandates, incomplete revised
contracts and unknown capture versions for review, and recognises frozen copies
in version history. Keep the old HTML, terms, version IDs/digests, signer matrix
and evidence. Prepare a separate replacement only after confirming the actual
instructions and approvals. The focused signing journey verifies preservation
when the existing forward correction is reapplied around sent, partially signed
and reviewed records; it is a PostgreSQL fixture check, not a full-chain replay.

For a future wording release, archive the exact old approved runtime entry and
retain its agency approvals and version-specific reconstruction renderer before
replacing the active entry. The browser and Edge Function must ship the same
register and renderer. Archive entries verify existing copies and requests;
creating a new request still requires the currently approved wording.

The forward migration `20261004121736_seller_document_review_runtime_reconciliation.sql`
restores missing review actions, the review queue, manual reminder support and
exact-requirement completion guards found during that audit. It leaves the
current upload/signing RPCs and frozen copies in place, and does not backfill
historical requirements or start automatic reminders. Verify this migration
with `npm --prefix the-it-guy run test:seller-existing-record-audit`, which also
executes the correction against a PostgreSQL fixture with the current physical
signing version guard. Its live application requires a separately approved,
scoped release; unrelated pending migrations remain excluded.

Returned physical signing files from the seller portal also require
`20261004181626_seller_portal_signed_upload_version_binding.sql` before releasing
the matching portal upload code. This adds a separate version-bound command
around the existing token/session and Document Trust upload path. It records the
opened version ID/digest, rejects stale copies atomically, and leaves approval
to the existing staff review. It changes no historical rows or existing RPC
signature. The connected `test:seller-document-journey` check executes this SQL
locally, including stale-version/session rejection, rollback, Storage cleanup
and physical review. It does not replace complete migration replay, hosted
Storage/session acceptance or an approved target-specific database release.

## Seller document action update

The seller workspace's **Generate and download**, **Generate and send for online
signature**, and **Upload existing** actions require the matching app, complete
`seller-portal-document-signing` bundle and
`20261009150000_seller_existing_signed_evidence.sql`. Apply that additive update
before exposing Upload existing. Verify the existing canonical seller save,
portal signing foundation, physical-version review, review runtime and
version-bound portal upload prerequisites in the target catalog. Do not infer
their presence from a migration timestamp alone.

The new update records independent signed uploads without attaching an unrelated
generated version. Approval still requires a recorded signature review; generated
returns still require their exact reviewed version. Both upload and online request
creation lock the same listing/document key to prevent conflicting actions. No
historical records are backfilled. Capture the target's pre-change review-trigger
definition and relevant app/function bundles before any approved release.

Run the primary app's `test:seller-document-journey`,
`test:seller-reviewed-document-versions`, `test:listing-seller-canonical-update`
and `check:seller-document-release`. Export a fresh candidate and pending decision
only after the complete journey; partial reruns cannot satisfy the release check.
The candidate now includes all three scoped seller migrations and the onboarding,
consent, agent disclosure and three-action workflow source and checks. The local
journey must include unsigned agent capture and review of all three independent
signed uploads as well as the existing generated and online routes.

For a live canary, use an authorised disposable listing in each affected agency.
Check save/reopen and POPI consent, agent-assisted disclosure followed by seller
signature, generated downloads, real invitation delivery, every required signer,
an existing signed upload, review and reopened completion. Check failed/expired
links and preserving signed history. Full generated mandates retain the exact
contracting-agency schedule, authority, disclosure and FFC approval requirements.
Local synthetic approval fixtures must never populate those registers.

Recover by restoring the captured app/function bundles and pausing new online
requests with the existing feature switches under the approved recovery plan.
Retain the additive evidence column, guards and all uploaded/signed/review records.
The older seller-runtime rollback is not a rollback of this update; do not execute
it for this change. Complete target-specific recovery, full migration replay,
hosted acceptance and delivery verification before declaring the release ready.

## Current safety state

Outside the temporary pilot above, broad linked-database pushes remain frozen while historical migration drift exists. Do not override the Phase 0 guard and do not use `--include-all`.

Before every release, run:

```bash
npm run supabase:phase5
```

The report must show zero duplicate local timestamps. A migration that appears local-only is not automatically safe to apply: it may already be live, partially live, or genuinely absent.

## Releasing a new database change during reconciliation

1. Generate a unique migration filename with `npx supabase migration new <name>`.
2. Confirm no duplicate version exists before writing SQL.
3. Make the migration forward-only, idempotent where practical, and transaction-wrapped.
4. Identify every referenced table, column, function, constraint, policy, trigger, and extension in the linked live catalog.
5. Capture pre-change definitions for anything replaced or dropped.
6. Prepare a scoped rollback that preserves user data.
7. Apply only the reviewed migration file with `npx supabase db query --linked --file <file>`.
8. Run live object, RLS, trigger, RPC-visibility, and rollback-only behavior checks.
9. Only after those checks pass, record that exact version with `npx supabase migration repair --linked --status applied <version>`.
10. Rerun `npm run supabase:phase5` and confirm the migration is matched.
11. Deploy frontend code that depends on the new schema only after database verification.

For token-scoped Storage policy changes, deploy the client header support before enforcing the policy, then smoke-test a real seller session and an anonymous buyer portal token for upload, signed download, and rejected cross-scope access.

## Historical reconciliation

Process one product module at a time:

- All declared objects live: run module behavior tests, then repair ledger only.
- No objects live: dependency-check, apply the migration, verify, then repair ledger.
- Partially live: write a new corrective migration; do not replay the original blindly.
- Data-only/no-static-object migration: manually verify the intended data outcome.
- Split version: keep it out of normal batches until the split-row investigation is resolved.

### Reviewed split baseline

The 17 versions recorded in `docs/supabase-migration-phase-6-split-ledger-investigation-report.md` are reviewed CLI ordering artifacts caused by an applied minute-level migration sharing a filename prefix with an applied second-level migration. Both versions must retain their original filenames. Do not rename either file and do not run `migration repair` for these rows.

Phase 6 must report `SPLIT_BASELINE_READY`, and Phase 5 must report zero unreviewed split versions, before selecting a pure local-only module batch. A newly observed split version is not covered by this baseline and blocks its module until investigated.

After each module batch, regenerate the Phase 5 report and retain deployment evidence in `docs/`.

### Pure local-only application manifest

Phase 5 generates a conservative manifest for every pure local-only migration. Its actions mean:

- `repair_only_after_smoke`: all extracted objects are live; run behavior tests before recording only that version as applied.
- `corrective_migration_required`: the migration is partially live; do not replay it. Produce an idempotent corrective migration from the live diff.
- `apply_original_after_dependency_check`: extracted objects are absent; verify the stream prerequisites in staging before applying that file alone.
- `manual_data_review`: static catalog extraction is insufficient; verify the intended data outcome and idempotency manually.

The manifest is planning evidence, not deployment authorization. Process one dependency stream at a time and retain a checkpoint after every migration.

### Staging execution gate

Use `scripts/supabase-phase6-staging-execution.mjs` for manifest-driven staging work. It must target an explicit non-production `SUPABASE_STAGING_DB_URL`; never relink this working directory to staging. Apply SQL and record the ledger in separate invocations so verification evidence is reviewed between them. The runner intentionally refuses batch mutation, production targets, corrective/manual rows, and ledger recording without passing evidence.

### Production promotion gate

Before production promotion, run:

```bash
npm run supabase:push:lock-recovery
```

Complete `docs/supabase-production-recovery-evidence.json` only after PITR is enabled or an equivalent physical/managed backup restore has been tested, reviewed, and accepted. The evidence file must not contain credentials, database URLs, backup secrets, or exported production data. Production promotion remains blocked until the recovery lock reports `RECOVERY_LOCKED`.

Use `scripts/supabase-phase7-production-execution.mjs` only after the exact version has passed staging and its staging ledger is recorded. Production mutations require the fixed production project identity, an identity-matching database URL, explicit recovery confirmation, and a live CLI check proving PITR or at least one physical backup exists. The runner handles one exact version per invocation, enforces recorded stream dependencies, and separates SQL application from ledger recording.

Every production invocation requires reviewed staging evidence. Ledger recording additionally requires production evidence proving the target state and catalog, behavior, and rollback/no-residue checks. Corrective and manual-review rows remain outside this runner; `repair_only_after_smoke` can be ledger-recorded with evidence but can never replay SQL.

### Reconciliation closeout gate

Use `scripts/supabase-phase8-closeout.mjs` to prove steady-state readiness after production promotion. Add one reviewed row to `docs/supabase-phase-8-closeout-evidence.json` for each Phase 5 manifest version only after staging and production ledger recording, target-state verification, catalog and behavior checks, and rollback/no-residue checks all pass.

The live closeout verifies zero duplicate timestamps, zero missing manifest files, zero pure local-only or remote-only versions, zero divergent or unreviewed split versions, complete evidence, and production PITR or a physical backup. It never removes the Phase 0 guard. A passing result makes guard retirement eligible for a separate reviewed change.

## Target steady state

Once Phase 8 reports `READY_FOR_REVIEWED_PHASE0_FREEZE_RETIREMENT`:

1. Remove the Phase 0 broad-push freeze through a reviewed change.
2. Add CI that runs a migration-list/dry-run gate on every database-affecting pull request.
3. Apply migrations to staging first.
4. Require an approval gate before production.
5. Verify the production ledger before deploying dependent frontend code.
6. Enable PITR or confirm an equivalent managed backup policy for production.
