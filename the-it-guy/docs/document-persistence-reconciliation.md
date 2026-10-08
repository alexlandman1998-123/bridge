# Historical document reconciliation

The primary transaction workspace owns this check. It covers buyer, seller,
agent, attorney, developer, commercial, rental, recruitment, FIC and partner
document stores, plus template, packet, signature and generation history.
The public website and admin console have no independent document store to repair.

## Read-only inventory

From the repository root:

```sh
node the-it-guy/scripts/document-persistence-reconciliation.mjs \
  --project=isdowlnollckzvltkasn \
  --export-sql=tmp/document-persistence-audit.sql
```

Run the exported SQL against the explicitly identified project using the connected
Supabase SQL tool or an authorised database session. It uses a read-only
transaction, a 30-second statement timeout and one uncapped snapshot, with no
REST pagination limit. Save the returned `snapshot` object as JSON in a local
evidence directory. No service key, signed URL token, document body or inline
signature is included. Treat paths and IDs as internal operational evidence.

```sh
node the-it-guy/scripts/document-persistence-reconciliation.mjs \
  --project=isdowlnollckzvltkasn \
  --snapshot=tmp/document-persistence-snapshot.json \
  --output=tmp/document-persistence-review
```

This writes `reconciliation.json`, `reviewed-repairs.sql` and
`rollback-repairs.sql`. The command has no apply mode and rejects unknown flags.
Missing store coverage fails the audit. Empty stores and missing checklist
placeholders remain visible in the inventory without being labelled lost uploads.
Branding and website routes are excluded from document findings. History and
JSON references are checked before placing an object in the unmatched review queue.

The report distinguishes missing objects, uploaded rows without storage metadata,
missing document/requirement records, wrong transaction/listing links and
conflicting canonical backlinks. Unmatched objects are review candidates;
their absence from the indexed stores does not prove an interrupted upload.
Storage catalog presence also does not prove readable file bytes or role access.

## Repairs and review

The only generated repair restores a development attachment's durable bucket
and path from its own recorded Supabase URL. The exact object must exist, its
path must contain that development's ID, ownership must resolve to an agency,
and there must be one unambiguous metadata record with no conflicting bucket.
This changes only `storage_bucket` and `storage_path`; approval, signatures,
visibility, file bytes and original URL remain intact.

Each packet contains the original references, full row/object fingerprints,
development/agency IDs and proposed values. The SQL locks records in a stable
order, verifies ownership and fingerprints, aborts the entire batch on drift,
and allows a harmless repeat. Lock waits are limited to three seconds. Rollback
restores the exact previous references and refuses subsequent evidence changes.

Before any live repair, obtain explicit approval for the exact packet and follow
the target/recovery checks in `../../docs/database-release-runbook.md`, including
`npm run supabase:guard`. Do not push unrelated migrations. These metadata repairs
require no schema migration or browser release. Execute only the reviewed SQL on
the named target, retain its result and packet digest, then rerun the inventory.
Confirm each repaired attachment can reopen and download through its owning UI.

Other findings require evidence review:

- Missing files: restore only a verified original or recovery copy; never
  regenerate a historical signed document as a substitute.
- Unmatched uploads: confirm the exact owner, participant, destination and
  intended requirement through the existing owning workflow. Do not bulk-delete
  objects or invent metadata from filenames.
- Conflicting links: confirm actual generated/signed content and the intended
  participant. The existing confirmed-remediation RPC refuses conflicting links;
  do not overwrite them through that command. Prepare a separately reviewed,
  evidence-specific correction with recovery and drift checks.

## Checks

```sh
npm --prefix the-it-guy run test:storage-upload-fallback-hardening
npm --prefix the-it-guy run test:document-trust-phase61
cd the-it-guy
node --test scripts/document-persistence-reconciliation.test.mjs
```

The reconciliation tests execute the actual inventory, repair and rollback SQL
in PostgreSQL fixtures, including cross-transaction evidence, ownership drift,
lost files, duplicate history, retry and all-or-nothing repair failure. They do
not replace hosted Storage, authenticated user journeys or verified original files.

## Ongoing monitoring (Phase 6)

The primary workspace now has an hourly diagnostic route at
`/api/cron/document-persistence-monitor` and a same-origin upload outcome
collector at `/api/documents/telemetry`. Both remain disabled unless
`DOCUMENT_PERSISTENCE_MONITOR_ENABLED=true` is configured server-side. This task
has not applied the migration, enabled a hosted schedule or written live receipts.

The monitor reuses this uncapped, single-statement inventory for all 27 stores,
including document history and JSON references. A missing table, incomplete
snapshot, read error or stale evidence makes the run unavailable. It never
repairs, deletes or changes a customer's document. Review findings separately
through the reconciliation workflow above.

The monitoring report has 27 upload areas from the acceptance inventory. It
records missing files/references, wrong transaction/requirement links, unconfirmed
saves, attempts stalled for 15 minutes, individual failures, permission denials,
access-link failures and follow-up warnings. Three failures and a failure rate of
at least 20% in the last hour also trigger a failure-rate alert. Retry outcomes
share their attempt identity; a recovered save replaces its previous failed
terminal outcome in the hourly total. Out-of-order start receipts cannot erase a
terminal outcome. Only correlated lifecycle events enter the central totals;
legacy uncorrelated step events stay local to avoid duplicate failure counts.

An upload area with no terminal outcome in the current hour is `not_observed`.
This includes modules that have not produced telemetry through the shared policy,
recovery or access helpers. Quiet areas and instrumentation gaps stay visible;
this is not a promise that every upload entry point emits a successful outcome.
The inventory covers every store even when outcome coverage is partial. Browser
outcomes are untrusted operational signals and never replace the Phase 5 hosted
acceptance evidence or prove actual bytes, actor access or tenant isolation.

Findings are compared with the previous complete run from the same project,
provided it is at most two hours old. Reports distinguish newly detected,
recurring and resolved findings. A failed or stale read cannot resolve previous
issues. Recent unmatched objects stay review-only because metadata saves can
still be in progress; no deletion or inferred owner is permitted.

Receipts contain random event/attempt IDs, fixed surface/stage/outcome labels and
an error category. They exclude filenames, paths, document bodies, portal tokens,
raw error messages and customer/transaction identifiers. The API requires the
configured HTTPS app origin and accepts at most 120 events per minute per
server-HMAC network key. The Vercel-controlled network header supplies that key;
a missing trusted header uses a shared budget. Origin and rate limits reduce
abuse but do not authenticate anonymous browser reports. Public and signed-in
clients cannot read or modify either monitoring table or call their database
functions. Service-only functions use invoker permissions; no RLS bypass is added.
Persistent finding reports retain an internal record ID and a fingerprint for
support, without a raw storage path. Treat these reports as private operations data.

The hourly schedule is `10 * * * *` UTC in the primary app's existing Vercel
configuration. The route checks `CRON_SECRET` and an exact
`DOCUMENT_PERSISTENCE_MONITOR_PROJECT_REF` matching the configured Supabase URL.
It stores one report per project/hour; it returns only counts/status and emits a
central server log. If reading or storing evidence fails, it returns HTTP 503
and attempts to retain an unavailable run. Monitor non-200 invocations as well as
the latest report: database outages can prevent even the failure receipt from
being stored. No email, Slack message or external alert destination is configured.

After an explicitly approved release of migration
`20261008201428_document_persistence_operational_monitoring.sql` and the primary
app/API, configure the existing server-only Supabase credentials, `ARCH9_APP_URL`,
`CRON_SECRET`, the exact project reference and the enable flag. Follow the database
release runbook and guard before applying only the reviewed migration. Verify an
authorised hosted upload and collector receipt, the hourly invocation, a denied
origin and a real operator read before calling monitoring active. Local browsing
does not send telemetry to hosted data. Pause by setting the enable flag false.

Diagnostic receipts have seven-day retention, pruned in batches of up to 10,000
per successful hourly run; reports retain 90 days. Failed runs retain history,
so a prolonged outage can delay retention. These deletes concern only monitoring
records and never touch Storage or document metadata. Keep the migration for
rollback; disable monitoring and restore the previous app/API release.

Operators can read the latest private report using an authorised SQL session:

```sql
select checked_at, status, report
from public.document_persistence_monitor_runs
where project_ref = '<explicit project reference>'
order by checked_at desc
limit 1;
```

For a read-only manual run using saved evidence:

```sh
node the-it-guy/scripts/document-persistence-reconciliation.mjs \
  --monitor --project=<explicit-project-ref> --export-sql=tmp/monitor-read.sql
```

After the migration is applied, this SQL returns the normal `snapshot` and an
`outcomes` summary in a read-only transaction. Save both JSON objects. Then run:

```sh
node the-it-guy/scripts/document-persistence-reconciliation.mjs \
  --monitor --project=<explicit-project-ref> \
  --snapshot=tmp/fresh-snapshot.json --outcomes=tmp/fresh-outcomes.json \
  --previous=tmp/previous-monitoring.json --output=tmp/document-monitoring
```

Omit `--previous` for the initial observation. The output is `monitoring.json`;
no repair packet is created in monitor mode. Stale, incomplete or mismatched
input is refused. Exit code 2 means issues or incomplete recent outcome coverage;
exit code 1 means the evidence could not be evaluated. Monitoring output is not a
hosted acceptance certificate.

Focused verification is the existing
`npm --prefix the-it-guy run test:storage-upload-fallback-hardening`, now extended
with receipt privacy/transport and actual PostgreSQL migration tests, plus
`node --test scripts/document-persistence-reconciliation.test.mjs` from the owning
package. Tests cover permissions, deduplication, rate budgets, retry ordering,
stalled uploads, history retention, coverage gaps and failed diagnostic reads.

Provider references used for the route configuration:
[Vercel cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs),
[Vercel cron timing](https://vercel.com/docs/cron-jobs), and
[Vercel-controlled request headers](https://vercel.com/docs/headers/request-headers).
