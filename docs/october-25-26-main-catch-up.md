# October 25–26 source catch-up — 26 October 2026

This source catch-up starts from remote main `7b2bdd2350253792104e7ec85324a0adf19d7c3a`,
reconciles the already-serving primary app source from
`cbd92ad1450aef26ffd7cce42bbc10bb620a4a25`, and integrates the October 25–26
Campaigns, shared Inbox, mobile marketing, calendar and listing work. The original
active checkout is preserved separately. The independent public websites and
Only Realty checkout are outside the recent source scope.

## What was reconciled

The primary app/API includes business campaign creation, reviewed AI assistance,
response links and CRM follow-up, Facebook business publishing, audiences,
playbooks and mobile navigation. Inbox includes mailbox permissions, signatures,
receiving/sending queues, provider connectors, private files and the separate
Node mail worker. Calendar combines appointment and dated marketing metadata;
listing galleries retain their compact layout and keyboard access.

The merge preserves live Instagram listing publishing, WhatsApp ownership,
background campaign controls and automations, fresh relisting checks, session
handling, signed-document evidence and saved-file downloads. Older local copies
that would remove those protections were not copied over production source.

An integration test exposed competing lead-selection effects that could keep
selecting and clearing a hidden CRM lead on Calendar. Only the filtered lead list
now controls ordinary selection, Calendar does not select a background lead, and
clearing an already-empty buyer form does not allocate another state object.
The local preview spending guard now covers property, business and CRM AI calls.

Two missing already-applied SQL source files were restored to Git's history.
The existing staged removal of three environment files and one generated test
result is carried forward without reading or changing environment values.
New Inbox function imports are pinned and have per-function dependency locks.

## Verification

- 804 Vitest cases passed across the 77 affected component/model files, including
  all ten actual CRM calendar cases after the reproduced loop was fixed.
- 168 serial Node cases passed across 25 affected API, SQL-fixture and mail-worker
  files. The Inbox fixture exercises all five new Inbox migrations, tenant and
  mailbox access, signatures, queue snapshots, retries and revocation.
- The existing root Campaigns foundation check and recovery-lock checks passed.
- Fourteen Inbox Edge handler cases passed with no network permission.
- All thirteen affected Edge entrypoints passed full `deno check` on canonical
  repository source. This replaces the generated-wrapper typing limitation of
  the earlier captured release bundles; it does not claim those bundles changed.
- The App/API/worker closure audit resolved 2,719 source modules with no missing
  relative imports, named exports, parse errors or declared package resolution.
- Scoped lint covered 210 changed/new app/API JavaScript files: zero errors,
  138 warnings (137 on unchanged lines and one existing Campaigns effect warning).
- The production migration dry run selected exactly nineteen files: the original
  fourteen Campaigns migrations plus five shared Inbox migrations. No seeds,
  custom roles or Vault changes were selected. Original fourteen SQL hashes match.
- A compatible staged cloud candidate passed its production build and twelve
  hosted identity/asset/intake checks. The final combined commit's cloud build
  and HTTP results are recorded separately in the task's release evidence.

Detailed check logs, exact source/migration hashes and deployment identifiers are
in `output/reconcile-main-20261026/` in the original task workspace. No complete
local production build was run on the limited-memory Mac. No paid AI call,
customer message, social publication, mailbox connection or production migration
was performed by these checks. Fixture checks are not live-provider acceptance.

## Production activation remains pending

The owner previously chose **“Prepare everything; leave paid recovery pending.”**
No paid recovery project has been created, and no recovery exception is inferred.
The actual recovery guard is `RECOVERY_LOCK_BLOCKED`: an identified-backup restore
has not been demonstrated. The July live clone is not backup-restore proof.
Follow the [database release runbook](database-release-runbook.md); its direct
production pilot keeps the target/recovery gate and does not require staging
reconciliation first. The nineteen SQL files and dependent runtime must remain
unactivated while this requirement is unmet.

Both connected Vercel projects automatically follow `main`. Their project-level
`vercel.json` files now set `git.deploymentEnabled.main=false` so pushing reviewed
source cannot automatically activate schema-dependent code or publish an
unrelated admin version. Manual verified deployments remain available. Review and
remove that hold only when the release prerequisites are satisfied; see
[Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration).

The Inbox Node worker still needs its hosted runtime and server credentials; a UI
or Edge deployment does not start it. Its implementation, pinned package/lockfile,
Dockerfile, offline tests and operational requirements are in
[the Inbox worker guide](../the-it-guy/server/inbox/README.md). Real provider,
mailbox and sending acceptance remains outstanding. Paid AI also needs reviewed
server credentials, model/rates and an agency budget; browser sign-in does not
supply these. Existing account state must not be represented as verified delivery.
