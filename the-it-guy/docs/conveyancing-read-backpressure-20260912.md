# Concurrent-read investigation and acceptance

Candidate: `codex/conveyancing-release-20260911`, isolated checkout. Production unchanged.

## Causes addressed

- Portal live refresh used a small journey read followed by full portal hydration on every 15-second poll. It now reads the journey on polling and hydrates the full portal only when its revision changes or the 60-second reconciliation window expires.
- Repeated reports of the revision already being fetched could enqueue another refresh. The queue now deduplicates that revision and ignores periodic polls while busy. Genuine newer revisions still receive a subsequent read.
- Polling now waits a quiet interval after a completed read and backs off after failures. Explicit mutation/focus signals are not discarded as periodic polls.
- Portal and conversation initial loads no longer have a second immediate poll. Conversation reads are single-flight within their access scope; a post waits for an older read before requesting fresh messages.
- Attorney membership resolution reused its same-request lane access result instead of fetching it twice. Independent lane permission reads run together with deterministic lane ordering. Each lane still performs its own permission evaluation; denied results are not replaced with permissive defaults.
- A four-read transport cap was tested and **removed**: it did not cure statement timeouts and added client-side waiting. There is no retained shared Supabase transport change.

No database policies, grants, schema or timeout limits were changed. Access checks and revision guards remain in place.

## Evidence

- Staging build passed with Node heap increased for this large local bundle; default 2 GB heap exhausted during the first build attempt.
- Actual-hook deterministic test: initial-load dedupe, no overlapping/queued periodic reads during a 90-second request, cooldown, failure backoff, disposal all pass.
- Queue/portal reconciliation policy, workflow loader serialization, failure classification, seller recovery, high-level integration, loading transition and atomic journey regression checks pass.
- Storage lookup inspection used an existing index; no speculative index was added. The sampled live database was not waiting on locks. Aggregate query statistics alone do not establish the cause of every HTTP delay.
- First browser run was interrupted overnight: the developer check recorded 38,302,523 ms elapsed. It is not a valid uninterrupted acceptance result. Fixture cleanup restored `instruction_received` to completed with a null note. A subsequent setup attempt stopped on a network connection timeout before task mutations.
- Uninterrupted reruns inhibited idle sleep only for the test process lifetime and retained all five sessions concurrently. All processes and the preview server are now stopped.
- The first uninterrupted backpressure-only run passed completion and N/A across five roles, then failed attorney Work on reopen (the other four roles passed). Cleanup restored the original state. This prompted the targeted duplicate permission-read fix above; that candidate built successfully and passed permission/assignee boundary regression tests before the next run.
- The permission candidate again passed completion/N/A but failed attorney reopen on a subprocess-step statement timeout; the other four roles passed. Its cleanup succeeded. Network traces showed many independent table reads in flight, motivating the transport cap rather than increased SQL timeouts. Transport tests cover cap enforcement, aborting queued reads, header isolation, auth/write bypass and no replay.

Legacy missing Storage objects, buyer participant-requirement denial, seller financial-account RPC errors and unconfirmed scenario facts are distinct from journey acceptance and remain tracked in the loading release check.

## Final result — not accepted, not deployed

The retained backpressure + permission candidate passed 14/15 transfer checks: completion and N/A in all five roles; reopen in agent, developer, buyer and seller. Attorney reopen failed: `transaction_subprocess_steps` returned `57014`, and the Work navigation did not become available within 60 seconds. The matrix stopped there; bond/cancellation outcomes cannot be certified by this run. The later transport experiment failed earlier on agent/developer/seller N/A and was removed. Its generated JSON report is experimental evidence, not certification of the retained candidate.

An authenticated, rolled-back `EXPLAIN ANALYZE` of the sixth matter's task read returned 85 task rows in 652.902 ms without concurrent browser traffic (planning 83.541 ms). The lane bitmap heap scan took 491.990 ms; two correlated access subplans ran 85 times each. Existing indexes were used. Eight SELECT/ALL policies apply to the task table. This identifies repeated lane/task access evaluation as a remaining query hotspot, not proof that every HTTP delay has one cause. No RLS policy was weakened or modified.

The next fix should optimize that database read path while proving the exact same actor/matter/visibility boundary, then repeat live concurrent acceptance. Do not compensate by simply raising timeouts, granting wider access or certifying a sequential-only test.

Cleanup assertions completed after each mutation run. A final independent staging read confirmed step `9b086985-57f8-45b1-a929-30dd62bfcb0a` is `completed`, comment `null`, visibility `internal`. No original historical rows were removed. Production and the original worktree remain untouched.
