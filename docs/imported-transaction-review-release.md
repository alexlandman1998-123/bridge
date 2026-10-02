# Imported transaction review release evidence

Prepared 1 October 2026.

> Superseded release scope: Commercial terms & Funding has since been added as
> a fifth section. The old preview and two-migration dry run below are historical
> evidence for the four-section version. A fresh release must also review and
> apply `20261001195834_imported_transaction_funding_review.sql` and
> `20261001201355_imported_transaction_funding_validation.sql`, repeat the
> applicable checks/dry run and build a new preview before production approval.
> Extension verification passed: the actual three migrations in PGlite, an
> existing four-section upgrade, 21 focused UI/service tests, full `check:app`
> (lint, established tests, build), and a synthetic browser funding confirmation.
> Cash-and-bond values persisted; the 390-pixel layout had no horizontal overflow
> and no browser page errors. The fixture cannot execute the real downstream
> document-sync RPCs; its refresh warning is expected, while service tests cover
> refresh success/failure. Live document-sync verification remains a release check.
> No migration or production publication was performed for this extension.

Prepared evidence below: Owner: primary Arch9 transaction workspace (`the-it-guy/`).

## Release state

Verification completed locally. Preview build completed successfully on Vercel:
https://bridge-jghso14xj-alexs-projects-f5496a21.vercel.app

**This task has not changed production. The two review migrations are not applied.**
The preview uses the existing project's preview configuration; a review against
live data requires the database migrations. Local browser verification below
uses synthetic data and the real migration SQL instead.

## Verified behavior

- Review details opens from Deal Setup for imported transactions.
- Correcting the buyer name persists through the actual save/get PostgreSQL
  functions and updates the displayed transaction name.
- Confirming Buyer, Seller, Property and Attorney produces Reviewed and the
  transaction appears under Reviewed imports.
- Replacing the source storage object invalidates all four confirmations and
  returns the transaction to Needs review without deleting its review history.
- Without a source PDF, a valid buyer draft saves and survives reload;
  confirmation and attestation remain unavailable. Missing primary links are
  explained with the existing Manage buyer links action.
- Browser storage assertion retained sale date `2024-04-03`, stage `Transfer`
  and the assigned attorney email after the corrections.
- Desktop PDF comparison renders. Mobile at 390 × 844 has no horizontal
  overflow (document width = viewport width = 390). A fresh browser session
  reported no page errors through list → Deal Setup → Review details.

Screenshots are local ignored verification output:
`the-it-guy/output/playwright/imported-review-desktop.png` and
`the-it-guy/output/playwright/imported-review-mobile.png`.

## Checks

| Check | Result |
| --- | --- |
| `npm run check:app` in isolated release checkout | PASS on refreshed production baseline: lint, existing app tests and production build; 557 existing lint warnings, zero errors |
| `node scripts/transaction-detail-review.test.mjs` | PASS: actual migrations in PGlite; access boundaries, private fields, atomic saves, stale snapshots, sources, history and aggregate statuses |
| `node scripts/canonical-document-required-role.test.mjs` | PASS: canonical required document role mapping |
| Five focused Vitest files listed below | PASS: 26 tests |
| Synthetic browser story | PASS: confirmations, filters, drafts, invalidation, preserved historical fields and responsive layout |
| `npm run supabase:guard` | PASS |
| `npm run supabase:push:lock-recovery` | RECOVERY_LOCKED; recovery evidence and live backup check passed |
| `supabase db push --linked --dry-run --skip-vault` | Exactly the two migrations below; no seeds or roles |
| Live SQL dependency check | Required transaction/read/edit permission functions exist; review RPCs do not yet exist |
| Live Supabase security advisory baseline | Read before release; existing unrelated findings recorded, no new schema deployed |

Focused Vitest files:

```text
src/components/__tests__/AgentTransactionsTable.importReview.test.jsx
src/services/__tests__/importedDealReviewStatusService.test.js
src/components/transaction/__tests__/TransactionDetailReviewPanel.test.jsx
src/services/__tests__/transactionDetailReviewService.test.js
src/components/transaction/__tests__/DealSetupPanel.test.jsx
```

## Exact production scope pending approval

Target Supabase project: `isdowlnollckzvltkasn` (production).
Target Vercel project: `bridge`, `prj_rbfXykMU6mU1eECbc0lJS9sPspmp`.
Production domain: `app.arch9.co.za`.

| Migration | SHA-256 |
| --- | --- |
| 20261001185738_imported_transaction_detail_review.sql | `3dae12009e1abcf9d2017c46187ec69e8132910b5a21ea9cfc4a327d598d7368` |
| 20261001191425_imported_transaction_review_status.sql | `1b9042436ad4b45e9ad9e20196af95fd6481b0f58abb812f626ecda3f06df0c7` |

Apply these append-only migrations, then publish the verified application source.
No bulk transaction update, automatic confirmation, buyer relinking, inferred
historical date, email or portal invitation is included.

The existing import evidence identifies the current workbook records without
rewriting them. They appear as Needs review. A source PDF and correct buyer links
still have to be recovered/checked by an authorised editor before confirmation.
The previous read-only organisation inventory found 16 corroborated imports,
15 missing buyer participant links and no linked source PDFs for those 16 imports.
This describes the audited snapshot, not an automatic repair or a new live audit.

## Preserving existing releases

Release checkout:
`/Users/alexanderlandman/.codex/worktrees/import-review-release/the-it-guy`.
The ordinary working tree contains unrelated ongoing work. The isolated checkout
preserves already-deployed primary-app source using the Vercel source manifest
and verified SHA-1 content hashes, then overlays only this review feature.
Six migrations missing from its old Git baseline were copied only to match
versions already applied remotely; the dry run does not replay them.
No unrelated working-tree change has been reverted, staged or committed.

Production baseline inspected initially:
`dpl_3vDTbwPAjMydNpNswTjvAg22DAV1`.
The final alias check found a newer READY release:
`dpl_5NFi2UXfxtRX77moeh7Qex3k3VEq`
(`bridge-hyuwlajvh-alexs-projects-f5496a21.vercel.app`).
Its only primary source change was `src/pages/agency/AgencyBranchWorkspacePage.jsx`,
with no overlap with review feature files. That exact source was hash-verified
and preserved in the release checkout. The preview predates this preservation;
use a fresh deploy from the release checkout for production, not preview promotion.
Recheck the production alias before publishing: if another release has moved it,
refresh the preservation baseline and verify again before proceeding.

## Release sequence after explicit production approval

Follow `docs/database-release-runbook.md`, including the direct-production pilot
checklist. Re-run the guard, recovery lock and exact linked dry run against the
named project immediately before applying. Stop if the dry run lists anything
other than the two reviewed migrations. Use the documented freeze override only
for this reviewed push; keep Vault sync, seeds and roles outside scope.

After applying, verify both migration versions and the three authorised public
RPCs. Check anonymous denial, authorisation and private-table privileges; fetch
security advisors again. Deploy the preserved app source to the named production
project, then verify the alias and authenticated imported list/Deal Setup reads.
Do not change a customer's transaction merely to smoke-test the release. A live
write test needs an explicitly approved disposable record or user-guided edit.

## Recovery

The restricted endpoints are:

```text
public.bridge_get_transaction_detail_review(uuid)
public.bridge_save_transaction_detail_review(uuid,text,jsonb,jsonb,bigint,boolean,uuid)
public.bridge_get_imported_transaction_review_status(uuid[])
```

Application recovery: roll back to the verified prior production deployment
(above, or the refreshed baseline immediately before release).

If the new database endpoints must be disabled, an approved recovery can revoke
EXECUTE from authenticated on the three public review functions. Preserve
`transactions.deal_review_details`, `deal_review_private` tables, corrected
transaction fields and history. Do not drop data or replay the migrations.
Any schema/data recovery is a separate explicitly approved remote write.
Re-enabling endpoints requires reviewing the issue and restoring the original
restricted grants. App rollback alone leaves the additive schema intact.

## Reproduce browser verification

From `the-it-guy/`, run:

```bash
node scripts/transaction-detail-review-browser.mjs
```

Open `http://127.0.0.1:4189`. The fixture binds only to loopback and connects to
an in-memory PostgreSQL-compatible PGlite database. It uses the actual review
components/services and both migration files, with only transport/auth/storage
signing replaced. It loads no project credentials and writes no remote data.
The fixture wrapper is a verification tool and is not a production route.
Browser roles/storage behavior beyond this synthetic fixture remain subject to
post-release verification against the real Supabase service.


## MVP imported finance compatibility verification

The later compatibility change recognises explicit mixed-finance aliases,
displays them as Cash and bond and normalises only an explicit save. Unknown
values stay visibly unresolved, cannot complete the funding step and cannot
silently discard captured amounts. Document requirements do not infer a route
from uncertain scanned text. The review save retains the original expected
snapshot for conflict detection while sending the recognised canonical type.

Verification: 11 contract/document-requirement checks, 34 focused component and
service tests, the actual migration regression suite and the isolated production
build passed. Focused lint had zero errors and one existing seller effect warning.
No new migration is required for this compatibility change; no remote data or
production deployment was changed. Funding-total and completion validation
are covered by the subsequent change below.


## MVP commercial and funding completion verification

Deal basics and funding count as complete only when their saved values are valid.
Price must be positive, deposit must be explicit (0 is allowed), required funding
amounts must be positive and a bond needs a supported finance manager. Currency
values accept at most two decimal places; reconciliation uses exact cents.
Cash includes the deposit: Cash must equal the price, Cash and bond must sum to
the price, and Bond uses deposit plus bond equal to the price. The deposit may
not exceed the price or, for cash routes, the cash contribution. Draft saves
remain available, with issues displayed; unsaved edits do not count as complete.

The appended funding-validation migration enforces confirmation in the database
and excludes older invalid confirmations from both section and list completion.
It retains snapshots and history without updating customer transaction records.
The helper is private and authenticated users cannot execute it directly.

Verification: 12 contract/readiness checks, 31 focused component/service tests
and the actual four-migration regression suite passed, including direct RPC
rejection, legacy confirmation invalidation, permissions and preserved dates.
The isolated full `check:app` also passed (lint, established service tests and
production build); lint reported zero errors and 557 existing warnings. No
migration or production publication has been performed for this change.


## MVP setup and document status separation

Deal Setup progress now counts only the three saved setup steps (commercial
terms, buyers and funding). The documents card directs users to the Documents
tab for uploads/completion without adding a fourth setup step. Imported details
retain the separate five-section review badge and confirmation rules.

The readiness contract's `ready` and `blockers` describe setup validity only;
profile-based document requirements are returned separately as advisory issues.
Profile coverage does not assert transaction document completion. The progress
component no longer fetches document readiness, so document loading or errors
cannot interfere with setup progress. No migration or customer data update is
needed for this phase.

Verification: 15 contract/readiness/document-requirement checks and 32 focused
component/service tests passed. Focused lint had no errors and one existing
seller-effect dependency warning. The isolated full `check:app` also passed
(lint, established service tests and production build); full lint reported zero
errors and 557 existing warnings. No remote data or production deployment was
changed.


## Current import recovery preparation

A new read-only production inventory and local PDF discovery are documented in
`docs/imported-transaction-recovery.md`. The 16 imports still have no linked
sources/sale dates; 15 need buyer participant recovery. The local directory has
11 single filename candidates, two ambiguous matches and three missing filename
matches. Filename candidates are not verified originals. The audit CLI now
prepares a per-transaction recovery plan with file checksums and manual actions,
with stored-object availability distinguished from document metadata.

10 recovery/compatibility checks and focused lint passed. The updated SQL was
executed read-only against production, and the CLI ran against the actual local
PDF directory. Actual attachment, buyer-link recovery and detail confirmation
remain pending source verification, outstanding originals, review release and
explicit production-write approval. No remote writes were performed.
