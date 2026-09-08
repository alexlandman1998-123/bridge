# Phase 7: existing-matter reconciliation

Implemented locally; migration is not applied and no remote matters have been repaired.

## Scope

Audit saved active plans, confirmed profile fingerprints/revisions, catalog task mappings,
saved lanes/tasks, outcome history, lane/matter projections and refresh revisions. Reports
contain IDs, issue codes and derived counts—not buyer details, notes or document contents.
Treat reports as confidential operational records nevertheless.

Three decisions:

- `clean`: no repair needed.
- `repairable`: only derived lane/matter projections or refresh revisions are stale.
- `manual_review`: missing/invalid plans, profile changes, missing/duplicate task rows,
  unknown mappings/outcomes, conflicting events, excluded worked history or terminal matters.

Review takes precedence over repair. Unstarted excluded history is retained and informational.
An active saved plan remains authoritative; this is not legal certification of its applicability.
Missing plans/mappings require review using the existing profile/plan workflow; this tool does
not invent a replacement plan, merge duplicate matters or infer that work was completed.

## Audit first

After deployment of the preceding journey migrations and
`20260908160229_shared_matter_journey_reconciliation.sql`, use an authorised professional
session. Supply `SUPABASE_ANON_KEY` and `RECONCILIATION_ACCESS_TOKEN` securely in the process
environment. The latter is the user's access token, never a service-role key. Do not commit
credentials or audit reports. The tool does not log credentials.

From the application directory:

```sh
node scripts/reconcile-shared-matters.mjs audit https://PROJECT.supabase.co MATTER_UUID
```

Capture the emitted JSON using your secure operational tooling as `audit.json`. Review its
issues and proposed counts/stages. Maximum 100 explicit IDs per audit; no automatic database
enumeration and no writes in audit mode.

## Selected repair

Only a scoped attorney/conveyancer with workflow authority for every planned lane can repair.
The report is bound to its project origin and each selected matter has a stable command ID.

```sh
node scripts/reconcile-shared-matters.mjs repair https://PROJECT.supabase.co audit.json REBUILD_DERIVED_JOURNEY_ONLY MATTER_UUID
```

Maximum 10 explicitly selected repairable matters. Each matter commits separately; receipts
are emitted immediately, and execution stops on failure. Keep the original report and receipts.
After an uncertain network response retry with the **same report/command ID**, not a new command.
After a stale-fingerprint rejection run a fresh audit and review again.

The RPC locks the matter/lanes/tasks, rechecks the fingerprint and permissions, rebuilds lane
and canonical matter projections, advances the refresh revision, and requires a clean post-audit.
Failure rolls back the entire matter repair. Successful retries return the original receipt.
No task status, plan, evidence, private note, completed timestamp or audience is rewritten;
no milestone event, email, notification or client conversation is fabricated.

## Validation

Run `scripts/shared-matter-reconciliation.test.mjs` with `PGLITE_MODULE` pointing at PGlite,
and `node scripts/shared-matter-reconciliation-service.test.mjs`.
Tests cover repair, task preservation, clean no-op rejection, stale reports, idempotency,
manual-review cases, access restrictions and full rollback on refresh failure.
These are isolated fixtures, not proof that production records are reconciled. Perform a
read-only target-environment audit before selecting any production repairs; cross-role live
acceptance remains the next release gate.
