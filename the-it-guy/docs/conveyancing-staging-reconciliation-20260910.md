# Staging reconciliation — 10 September 2026

## Result

The previously failing authenticated attorney workflow read now passes on Arch9
Staging (`vaszuxjeoajeuhlcnzzf`). Production was not modified or deployed.

Verified live, through the application service with initialization disabled:

- Transfer: 22 existing step rows, 15 completed, reported progress 56%.
- Bond: 17 step rows, 4 completed, reported progress 24%.
- Cancellation: 19 step rows, 5 completed, reported progress 26%.
- Transfer instruction remains completed. No task outcome was changed in this pass.
- Seller entity type remains missing in the demo; it was not inferred or fabricated.

The different row counts and progress denominator are observations of this existing
demo, not certification of scenario applicability. Full scenario tests remain due.

## Corrections

1. Added missing structured-confirmation storage and professional journey reader.
2. Reconciled 27 current transfer catalogue definitions and phase/task ordering.
   Live comparison against application definitions reports zero mismatches across
   all 63 current transfer/bond/cancellation tasks. Legacy catalogue keys remain.
3. Preserved OTP/finance commercial facts and active-plan metadata that the tax
   reader replacement otherwise removed.
4. Restored the atomic lane-update command through a forward migration.
5. Added a positive professional-assignment/membership check. General transaction
   access includes clients and is insufficient for the professional reader.
6. Applied legacy tax-decision reconciliation: absent decisions remain explicitly
   unconfirmed; existing decisions and workflow outcomes are retained.

## Applied staging manifest

| Version | Migration |
| --- | --- |
| 20260909144454 | attorney_task_confirmation_state |
| 20260910080011 | transfer_tax_decision_phase2_reconciliation |
| 20260910080705 | transfer_tax_conditional_workflow_phase3 |
| 20260910092527 | shared_journey_safe_tax_milestones |
| 20260910094209 | transfer_tax_cross_role_safe_reader_phase7 |
| 20260910153146 | reconcile_attorney_journey_catalogue |
| 20260910153517 | reconcile_shared_journey_reader_contract |
| 20260910154025 | reconcile_attorney_lane_update_command |
| 20260910154340 | restrict_professional_journey_audience |

Each migration was executed successfully before its tool-generated ledger version
was reconciled to the local version. Updates matched the exact returned version and
name, checked for collisions and failed if the source row was absent. A final query
verified all nine versions. No unapplied migration was marked as applied.

The historical `20260909213009` file was restored to its committed contents; its
catalogue insert omits required phase fields and must not be replayed blindly on a
fresh database. The forward catalogue and command migrations replace those effects
on staging. Its historical ledger entry was not invented. This is a targeted
conveyancing reconciliation, not certification of the entire repository's migration
history or a licence to run a broad `db push`.

## Verification

- `node scripts/shared-matter-journey-atomic.test.mjs`: PASS, including catalogue
  parity, save/reload, outcomes, rollback, revisions, authorization and retry.
- `node scripts/shared-journey-reconciliation.test.mjs`: PASS, including real SQL
  readers, cash/bond/hybrid facts, reopening, active plan, redaction and denial.
- `node scripts/professional-journey-access.test.mjs`: PASS for buyer/seller denial,
  assigned professionals, removed participants, organisation access and cross-matter
  denial. These are isolated PostgreSQL permission fixtures, not live role sessions.
- Four focused tax-migration/privacy tests: PASS.
- `node scripts/attorney-mvp-staging-read-check.mjs`: live PASS after all changes.
- Live grants deny anonymous professional reads, direct private reader execution,
  and direct authenticated confirmation inserts.
- `git diff --check`: PASS.

Security advisors were run. The project still has broader notices, including
[security-definer views](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view)
and intentional deny-by-default private tables
([RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)).
No project-wide clean security result is claimed. The pre-change reader definitions,
ACLs and catalogue were captured in `staging-journey-reconciliation-schema-baseline.json`;
this is a schema recovery reference, not a full database backup.

## Still required before release

### Remote cross-role access and API verification

With explicit user approval, provisioned staging-only access using
`scripts/provision-journey-staging-access.mjs --apply`. The designated demo matter
had no listing: created a demo, inactive/internal listing and seller onboarding
record, linked that listing to the demo transaction, and activated its seller
password/session using the existing portal RPC. Created an active buyer link.
Created tagged `journey.agent.staging@example.test` and
`journey.developer.staging@example.test` Auth/profile records. Linked the agent to
the existing unassigned demo agent participant and added the developer participant;
no existing assigned user was replaced. No invitations or emails were sent.
Secrets and portal tokens are not logged. Production was not touched.

`--apply --verify-changes` passed live authenticated reads as attorney, agent,
developer, buyer token and seller session against this same matter. All task
outcomes match. Reopen and complete were committed through the attorney atomic
RPC, reread by all five role sessions and compared. Original completed outcome
restored in the cleanup path. Shared verification notes appeared to all five;
the private note appeared only to the author attorney. Buyer access to the
professional-only reader was denied. Test notes/history are intentionally retained.

This closes the missing-session and same-matter API parity checks, not the
separate cross-role browser rendering/live-refresh acceptance. The script does
not claim browser verification or document request/upload/approval coverage.

### Legacy manifest reconciliation implemented

Applied `20260910160902_reconcile_legacy_matter_task_manifest` and
`20260910161552_allow_operator_task_catalogue_read` to staging only. Their executed
ledger entries were matched to the CLI-generated local versions after success.
The invoker RPC is operator-only, locks the matter, rejects a changed source
profile, validates catalogue keys and lane sets, seeds exact missing keys, retains
all historical rows, stores the mapping review in the routing profile and signals
a refresh atomically. It does not migrate ambiguous alias completion into new work.

`scripts/reconcile-staging-matter-manifest.mjs --matter=<uuid>` previews a single
staging matter; `--apply` explicitly applies it. It refuses a non-staging URL.
Only MAT-1198 was reconciled: 12 new pending rows, 27 retired mappings retained for
review. All prior rows compared exactly equal immediately after reconciliation.
No missing seller facts were invented; the plan remains provisional.

Read paths now honor the persisted active manifest rather than regenerate it.
Task writes target the exact key instead of an unordered alias lookup. Background
workflow refresh no longer unmounts a hydrated workbench.

Verified against staging: Work and shared reader have identical IDs/outcomes for
transfer (22 tasks), bond (17) and cancellation (19). Browser header and Work phase
counts agree. Reopened Instruction Received: header and Work changed from 5/5 to
4/5 and persisted on reload. Completed it again: database and reloaded header show
5/5. Original completed outcome restored; verification notes remain in history.
Buyer/seller notification checkbox was left unchecked. Separate client and other
professional browser sessions were not tested.

Passing checks: legacy reconciliation SQL (preservation, new pending work,
idempotency, stale-profile/unknown-key rejection, restricted grants), shared reader
SQL, atomic commands, professional access, 11 focused node tests, loading/JSX
checks and the live staging service parity check. Security advisors were run;
broader existing findings remain. Production is unchanged.

### Browser follow-up (local application against staging)

The authenticated attorney browser test on MAT-1198 exposed two client reader
defects: the rollup defaulted to the buyer audience, and phase-local redacted
`task_1` identifiers were rejected as lane-wide duplicates. The local application
now selects the reader by workspace role and namespaces redacted task identifiers
by phase. Reloading the matter displays the journey instead of “unavailable”.
Eleven focused baseline, linked-lane and outcome tests pass; `git diff --check`
passes. These application changes have not been deployed.

At that earlier checkpoint the header displayed legacy persisted tasks
(FICA 7/7; financial preparation 9/9), while Work applies the current definitions
(FICA 2/2; financial preparation 5/10). Reload reproduces the difference.
The reader uses persisted rows for a non-active plan, while `mapLaneRow` and the
work view model apply current definitions. Legacy-plan reconciliation must resolve
that difference without converting old outcomes into unverified new work.
No task outcomes were mutated during this browser check. Completion/reopen and
same-matter cross-role acceptance were not performed or claimed.

Live UI edit/save/reload/complete/reopen and document tests; valid separate
developer/agent, buyer and seller sessions; full scenario acceptance; isolated
release candidate and reviewed production migration manifest. No commit or push
was performed. Prior Phase 7/8 blocker reports are historical; the missing-reader
and catalogue-parity blockers recorded there are now resolved on staging.

### 11 September — client browser acceptance and remaining gates

Used the local Vite staging build on port 4177, not production. The buyer's
initial page timed out: the actual core service took 17.4 seconds, exceeding
the UI's 7-second deadline. Extended that bounded startup deadline to 30 seconds;
deferred attorney update decoration to full hydration. Added the lightweight
token-authorised legal read to core hydration and independent live refresh so
legal tasks are not held behind the slower full portal read. Legal-only results
are explicitly marked to avoid manufacturing commercial milestones from absent
OTP/finance inputs. The existing detailed journey component renders the tasks;
it was not receiving a snapshot before full hydration completed.

Seller sign-in exposed `TransactionJourneyTracker is not defined`; restored its
missing import. Browser retests show buyer and seller legal journeys with the
same phase/task counts as attorney Work. Buyer observed a reopen to 4/22 without
reload; seller's opened journey also showed 4/22. After restoring completion,
both already-open client pages changed to 5/22 without reload. Reloading both
preserved 5/22. Both displayed the shared verification note and neither displayed
the private verification note. The demo instruction task is restored to completed,
and the live attorney service parity check passes all three lanes. No invitations
or client email notifications were sent. Verification events remain in history.

Both tagged professional test accounts authenticate, but browser onboarding asks
for profile/workspace setup (Agent Setup / Developer Setup). Their matter-scoped
API reads passed previously; browser acceptance is NOT passed. No organisation
membership or broader permissions were granted merely to bypass this gate.

Remaining findings: attorney overview Next Action still says Record Attorney
Instruction despite its completed outcome; legacy high-level stage/education copy
needs reconciliation. Three seeded demo document storage objects returned 400
during signed URL resolution, so document-open acceptance is not passed. Full
portal hydration is still slow and emits participant-requirement permission
warnings; this change decouples legal freshness, not a blanket performance fix.

Passing: `client-journey-initial-load.test.mjs` (including JSX transform),
`shared-journey-reconciliation.test.mjs`, `transaction-loading-transition.test.mjs`,
live `attorney-mvp-staging-read-check.mjs`, and `git diff --check`.
`staging-buyer-browser-boundary-check.mjs` is a read-only timing diagnostic.
The older `pipeline-seller-portal-stability.test.mjs` fails before these assertions
on an unrelated lead-workspace source-pattern check; it is not reported as passing.
Security advisors were retrieved; broader existing project findings remain.
No production deployment, migration, commit or push was performed in this pass.

### 11 September — Phase 1 professional staging access

Added `scripts/complete-journey-staging-workspaces.mjs` (preview by default,
explicit staging-only apply). Completed the two tagged fixture profiles and
created separate hidden demo workspaces with minimal memberships, agency branch
and settings. Neither user joined the matter owner's organisation; the fixture
matter participant rows were asserted unchanged. Both pass the application's
onboarding validator as their authenticated user. No mail or production writes.

Agent dashboard testing found an ambiguous participant-to-transaction PostgREST
embed. Both API implementations now name
`transaction_participants_transaction_id_fkey` explicitly, retaining their
organisation filter. The dashboard browser retest no longer shows that error.

Both professional browsers open MAT-1198. Developer Conveyancing shows transfer
5/22, bond 4/17 and cancellation 5/19, including after reload. Agent Conveyancing
shows the same percentages; its transfer detail shows 5/22 and the matching six
phase counts. Its interface is a read-only summary, not the developer's detailed
task DOM. The five-role API comparison passes identical saved matter outcomes;
buyer access to the professional reader remains denied. The live attorney
reader check also passes all three lanes.

One agent reload failed to load core data; a subsequent reload recovered. Thus
access provisioning is complete, but repeatable browser-load reliability is not
claimed as passed. Earlier workspace resolution timeout logs also remain;
diagnose this before release rather than widening access or masking failures.
The overview contradictions and document-object failures remain separate gates.

Passing: professional-participant-join regression guard, client-journey-initial-load,
shared-journey-reconciliation, transaction-loading-transition, live attorney read,
five-role staging parity, and git diff --check. Security advisors were retrieved;
existing project findings remain, not resolved by this account setup. No new
migration, production deployment, commit or push.

### 11 September — loading repair and Phase 2 overview alignment

The route-core reader was awaiting the full optional property/buyer/development
shell builder. It now builds a route-only shell from the authorised transaction
row; optional metadata continues through the existing background enrichment.
An optional relation failure no longer discards an accessible transaction.
The page now offers Retry matter on a core error. Scope reset is idempotent,
so preview/HMR identity changes cannot leave loading=true while the initial-load
guard suppresses a replacement request. Late core/enrichment results from a
previous matter scope are rejected.

Added a presentation-only legal overview summary using the same authorised
journey and revision as Conveyancing. Header stage and next action select the
first unfinished transfer task; completed/external/N/A outcomes are respected,
and reopening moves the focus back. Missing or mixed-revision journeys do not
fall back to legacy stage claims. Agent/developer actions open Conveyancing;
unrelated legacy recommendation reasons are suppressed for this summary.
Commercial OTP/finance milestones remain separate: legal completion is not
evidence that a commercial milestone has been confirmed.

Read-only staging check: nine cold-cache application route reads passed. Agent
timings were 2108/5405/5240 ms, developer 409/233/237 ms, attorney 250/216/229 ms.
All three authorised journey reads produced FICA & Authority and Review & Approve
Buyer FICA. The agent browser reload displayed those labels without the core
error, and Open Conveyancing reached the same task summary. Agent latency is
still material; this is not a general performance or production sign-off.

Passing: transaction-route-core-isolation, legal-overview-summary,
transaction-loading-transition (JSX compilation), client-journey-initial-load,
professional-participant-join, shared-journey-reconciliation,
staging-route-overview-read-check, and git diff --check. Security advisors were
retrieved; no auth policy, schema, stored task outcome, or production change.
Document/storage acceptance remains the next separate gate.

### 11 September — document/storage acceptance: FAILED

Scoped audit of MAT-1198 found three demo document rows with no corresponding
storage objects in any bucket: Signed Nedbank Bond Pack.pdf (uploaded), Building
Insurance Schedule - old.pdf (rejected), FNB Bond Statement.pdf (approved).
These are missing seeded files, not evidence of a signer URL typo. Existing
rows/outcomes were not changed and no substitute signed evidence was generated.

Removed the getSignedUrl public-address fallback in api.js. Failure to sign a
private object now returns null rather than manufacturing an unverified public
address. document-signed-url-failure.test.mjs verifies failed and successful
signing paths; git diff --check passes.

Ran staging-document-storage-acceptance.mjs with a temporary text fixture marked
STAGING STORAGE ACCEPTANCE — NOT LEGAL EVIDENCE, visibility internal, not client
visible, status uploaded. Attorney upload and byte-for-byte signed download
passed. Agent and developer could also select and download this internal file.
Buyer could select its metadata but could not download it. Anonymous access to
both was denied. The test intentionally exits nonzero on the visibility breach.
The temporary record and object were removed successfully; existing documents
and task outcomes were untouched. Seller/browser preview/approval acceptance
was not exercised after this failed access boundary and is NOT signed off.

Policy inspection explains the storage exposure: authenticated read delegates
to write, and transaction-path write checks transaction-spine access alone.
It does not enforce the document audience. The documents row policy also needs
review for buyer metadata visibility. Next gate: align document-row, object-read
and object-write authorization with the intended audience and participant
capabilities, then repeat positive and negative tests for all five roles. Do
not solve this by widening permissions or making the bucket public.

Security advisors retrieved. No policy/schema migration or production change.
