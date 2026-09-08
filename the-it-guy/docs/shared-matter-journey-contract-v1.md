# Shared matter journey contract v1

Status: implemented as an additive, pure contract. Not yet wired into production consumers.

## Authority and identity

One matter has a shared legal journey containing the applicable transfer, bond-registration and cancellation lanes. Each lane has phases and tasks. Inputs must come from the resolved workflow plan and persisted task outcomes; this contract does not invent applicability or infer completion from events, documents or stage position.

Task identity is the encoded tuple `(transactionId, laneKey, taskKey)`. It survives label changes, phase moves, plan revisions and reopening. Database row IDs remain persistence references, not cross-screen task identities. Multiple tasks with the same key in one lane are rejected; distinct lanes have distinct identities.

`schemaVersion` identifies the payload format. `revision` is the authoritative matter watermark, `planRevision` identifies the applicable plan and task `revision` identifies its saved version. Consumers must not substitute timestamps or generate independent versions. Later integration must obtain a coherent snapshot and reject older revisions. This module validates values but does not implement concurrency control.

## Outcomes

| Status | Counts complete | In applicable denominator |
| --- | --- | --- |
| not_started | No | Yes |
| in_progress | No | Yes |
| waiting | No | Yes |
| blocked | No | Yes |
| completed | Yes | Yes |
| completed_externally | Yes | Yes |
| not_applicable | No | No |

Reopening is an audited action returning the same task to `not_started`, not an eighth status or a new task. Preserve the prior event history and require the existing reason/note policy. N/A and external completion do not claim evidence has been received or legally approved. Outstanding evidence is independent of the task outcome.

Completion is operational progress, not certification of legal compliance or readiness for lodgement. Working ahead must not implicitly complete earlier tasks.

## Progress scopes

Phase, lane and aggregate legal progress use the existing completion-only outcome helper. Aggregate legal progress is completed applicable tasks divided by all applicable legal tasks, not an average of rounded lane percentages. Empty or all-N/A scopes have `percent: null` (not applicable/unavailable), not fabricated 0% or 100%.

`overallJourney` is a separately sourced transaction-level percentage, with its source and revision. It is never calculated from legal progress in this contract. Existing transaction milestones also include non-legal work. UIs must label scope explicitly; legal task completion is not full transaction completion.

## Audience projection

Attorneys, agents, developers, buyers and sellers receive identical task identities, outcome statuses and shared progress for the authorised matter. Clients receive explicitly supplied client-safe labels. Missing client labels fail validation rather than falling back to internal text.

The projection uses a whitelist. It excludes comments, reasons, evidence counts, document URLs and arbitrary metadata. Personal data and private evidence require separate recipient-authorised projections. Audience selection is presentation, not an access grant: server-side matter and recipient authorisation must run first. This contract must not be exposed directly as a public API.

Routine task-status publication is distinct from optional notifications and discussion. A future event envelope should include event ID, matter/task ID, previous and new outcome, committed matter revision, actor reference and occurrence time. Publication and notification channels consume that committed event, not UI guesses. Private note bodies never enter the routine shared status payload.

## Later phases

Phase 2 supplies plan/phase/task adapters and safe label definitions. Phase 3 provides atomic writes, monotonic revisions and audit events. Phase 4 migrates every reader to the same snapshot. Subsequent phases implement token-authorised refresh, explicit conversation audiences and existing-matter reconciliation.

No migrations, live-data writes, portal behaviour changes or automatic publication are introduced by this phase.

Verification: `node scripts/shared-matter-journey-contract.test.mjs`.
