# Legal Document Generator - Phase 4 Controlled Launch

Phase 4 adds the enforceable go-live boundary around OTP and SalesMandate generation.

## Runtime controls

- The app blocks generation before invoking an Edge Function when the selected template is not published, active, and independently approved.
- `generate-otp` and `generate-mandate` repeat the check server-side using the database template row.
- Edge Functions require an authenticated caller and reject approved-template ID/source substitutions.
- Edge Functions also require `LEGAL_DOCUMENT_PILOT_ENABLED=true` and an organisation ID listed in `LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS`.
- `forceGenerate` does not bypass legal approval.
- Approval, source-mismatch, start, completion, and failure outcomes use structured logs without signer personal data.

## Recording genuine approval

### Phase C1 mandate source recovery

C1 is the guarded recovery path when a published mandate route points to a missing storage object. It validates a local candidate as a real Word DOCX package, resolves every frozen template sharing the exact bucket/path, and refuses project, path, template-set, or SHA-256 confirmation drift. It never overwrites a different existing object.

Check live source integrity:

```bash
npm run verify:legal-documents:phase-c1
```

Inspect a proposed recovery without writing:

```bash
npm run restore:legal-documents:phase-c1 -- \
  --candidate=<approved-local-mandate.docx> \
  --target-bucket=documents \
  --target-path=templates/mandates/seller-mandate-v1.docx
```

Apply only after confirming the exact dry-run evidence:

```bash
LEGAL_DOCUMENT_PHASE_C1_WRITE=true npm run restore:legal-documents:phase-c1 -- \
  --candidate=<approved-local-mandate.docx> \
  --target-bucket=documents \
  --target-path=templates/mandates/seller-mandate-v1.docx \
  --confirm-project-ref=<exact-project-ref> \
  --confirm-bucket=documents \
  --confirm-path=templates/mandates/seller-mandate-v1.docx \
  --confirm-template-ids=<exact-comma-separated-template-ids> \
  --confirm-sha256=<candidate-sha256> \
  --applied-by=<accountable-operator> \
  --reference=<change-ticket-or-evidence-reference> \
  --apply
```

After C1 reports `READY_FOR_B1_REFREEZE`, regenerate B1 and repeat B2/B3. Source recovery deliberately makes prior content fingerprints and approvals stale; it does not carry them forward.

The consolidated A2 gate runs C1 independently, so an absent or corrupted mandate source remains a release blocker even if older review evidence exists.

### Phase C2 canonical render assurance

C2 proves that the live recovered DOCX is merge-compatible with the application—not merely a readable ZIP file. It renders the exact source with the same `docxtemplater` version used by `generate-mandate` across four representative seller structures: single individual, married individual, company, and trust. It blocks unknown template tokens, malformed merge syntax, unresolved values, unreadable output, and scenario-specific render failures.

```bash
npm run verify:legal-documents:phase-c2
```

C2 is read-only and produces only temporary local render artifacts, which are deleted after inspection. `READY_FOR_B1_REFREEZE` means the live source passed every canonical scenario; it does not approve legal wording. A2 runs C2 independently, and B1/B2/B3 still remain mandatory afterward.

### Phase C3 controlled review-cycle restart

C3 converts a C1/C2-validated source change into a clean legal-review cycle. It regenerates the B1 manifest, atomically invalidates runtime approval metadata for the entire frozen batch, records an audit event for every template, and rebuilds the B2 decision register as pending against the new content digests. The entire batch is reset because B3 approvals are bound to the global B1 manifest digest.

Deploy `202607170017_legal_document_review_cycle_restart_c3.sql`, then inspect the dry run:

```bash
npm run restart:legal-documents:phase-c3
```

Apply only using the exact values returned by that dry run:

```bash
LEGAL_DOCUMENT_PHASE_C3_WRITE=true npm run restart:legal-documents:phase-c3 -- \
  --confirm-project-ref=<exact-project-ref> \
  --confirm-previous-manifest-digest=<current-B1-digest> \
  --confirm-next-manifest-digest=<new-B1-digest> \
  --confirm-template-ids=<exact-comma-separated-template-ids> \
  --restarted-by=<accountable-operator> \
  --reference=<change-ticket-or-evidence-reference> \
  --apply

npm run verify:legal-documents:phase-c3
```

`READY_FOR_B2` confirms that the current B1 evidence, B2 register, runtime cycle binding, and restart audit agree. Counsel must then complete B2 again, followed by B3. C3 never carries an earlier legal decision onto changed source bytes.

### Phase D1 generated-draft provenance

D1 makes a successful generated draft traceable to the exact approved legal evidence and render inputs. Every new persisted OTP or mandate draft records the template/version, B1 content digest, B2 counsel-evidence digest, B1 manifest digest, approval timestamp, section hash, placeholder hash, generation-payload hash, and combined render fingerprint. Generation fails before the packet version is created when that package is incomplete. Preview-only renders remain available but do not satisfy D1.

After C3, B2, and B3 are complete, generate one controlled OTP draft and one controlled mandate draft through the normal user workflow, then run:

```bash
npm run verify:legal-documents:phase-d1
```

`READY_FOR_D2` requires both drafts to be generated after their current legal approval, use the packet's exact template, contain no unresolved placeholders, point to a persisted artifact, and carry matching legal/render provenance. Older drafts must be regenerated; D1 does not retrofit evidence onto historical versions.

### Phase D2 persisted draft-artifact assurance

D2 binds each newly generated draft version to the exact bytes produced by the Edge Function. The generator calculates SHA-256 before returning, together with the storage bucket/path, file name, media type, and byte length. Packet generation refuses to create a successful version without this evidence.

After D1 passes, verify that the stored bytes remain readable and unchanged:

```bash
npm run verify:legal-documents:phase-d2
```

The verifier downloads both controlled artifacts, compares their current size and digest, and validates the DOCX or PDF container. `READY_FOR_D3` requires exact matches. Historical versions without D2 evidence must be regenerated; stored files are never silently trusted or retrofitted.

### Phase D3 draft-version lineage

D3 gives every generation attempt a UUID shared by the generation-start event, render provenance, packet version, completion event, and packet source context. It proves that retries and regeneration produce an ordered, auditable version chain rather than orphaned files or ambiguous “successful” drafts.

```bash
npm run verify:legal-documents:phase-d3
```

`READY_FOR_E1` requires unique contiguous version numbers, the selected D2 artifact to be the packet's latest/current version, matching packet lineage pointers, and both start and completion events for the same generation attempt. Controlled drafts generated before D3 must be regenerated.

### Phase E1 accountable draft review

E1 turns the workspace's draft approval into version-specific evidence. Approval records the authenticated reviewer UUID and role, approval timestamp/reference, packet and version numbers, D2 artifact digest/path, render fingerprint, and D3 generation-attempt ID. An editable but unrendered draft cannot be approved as though its older artifact had been reviewed.

Deploy `202607170018_legal_draft_review_gate_e1.sql`. Review and approve both controlled drafts through the normal workspace, then run:

```bash
npm run verify:legal-documents:phase-e1
```

The signing API checks E1 before creating links, and the database trigger independently rejects signing-token issuance when the approval is absent, stale, or bound to another version. `READY_FOR_E2` also requires a matching `draft_approved` audit event for each controlled draft.

### Phase E2 immutable approved-draft lock

E2 locks the exact E1-approved current version to its D2 artifact bytes and D3 generation attempt. After lock, neither the version's rendered content/provenance nor the packet's current-version pointer can change, and no superseding version may be generated. Final signing-result fields remain available for the normal signature lifecycle.

Deploy `202607170019_legal_draft_immutable_lock_e2.sql`. Lock both controlled drafts through the normal workspace, then run:

```bash
npm run verify:legal-documents:phase-e2
```

The application and database independently require this lock before signing-token issuance. `READY_FOR_E3` also requires the version-bound `document_locked` audit event. Any later content change requires an explicit future unlock/revision phase; E2 never silently rewrites a locked draft.

### Phase E3 exact-version signing envelope

E3 verifies that the locked OTP or mandate has real recipient names and deliverable email addresses, unique signing order, and at least one required signature field for every configured signer. Every signer and field must belong to the exact E2-locked packet version; field page and geometry must be valid and duplicate placements are rejected.

Deploy `202607170020_legal_signing_envelope_assurance_e3.sql`. Prepare signer fields for both locked controlled drafts, then run:

```bash
npm run verify:legal-documents:phase-e3
```

The signing API and database independently reject token issuance for an incomplete envelope. Once the first token is issued, signer identity/order and signing-field ownership/placement are immutable while normal viewed, signed, completion and signature-asset updates remain available. `READY_FOR_E4` requires complete database evidence and matching preparation audit events.

### Phase E4 secure signing dispatch

E4 requires cryptographically secure unique 256-bit signing tokens, expiry between one hour and seven days, rotation after token consumption, and a version-bound dispatch reference. It removes the insecure random fallback and prevents weak, duplicated, expired or unbounded tokens at database level.

Deploy `202607170021_secure_legal_signing_dispatch_e4.sql`, dispatch both controlled envelopes through the normal workspace, then run:

```bash
npm run verify:legal-documents:phase-e4
```

OTP packet signers now receive their exact packet signing links through provider-confirmed emails instead of merely advancing document state. Mandate and OTP dispatches require matching link-generation and email-delivery evidence. `READY_FOR_F1` means the controlled documents have passed the full E1–E4 review, lock, envelope and dispatch chain.

### Phase F1 exact signer-session integrity

F1 validates the public signing runtime rather than trusting the dispatch record. Every token resolution and signing action must resolve to the packet's current E2-locked version, matching organisation and generated artifact. Signers only receive fields for their own role and email.

Deploy `202607170022_legal_signer_session_integrity_f1.sql` and the updated `resolve-signer-token` and `signer-signing-action` functions. Open one controlled signer link for both OTP and mandate, without completing a real production signature, then run:

```bash
npm run verify:legal-documents:phase-f1
```

F1 no longer falls back to a different version's preview and never creates missing fields during a signing session. Field completion is restricted to the active signer and their signature-asset namespace; signer completion is blocked until all their required fields are complete. `READY_FOR_F2` requires matching signer-view evidence for the exact version.

### Phase F2 exact completion and final signed artifact

F2 prevents a packet from becoming completed merely because every signer clicked Finish. Both OTP and mandate finalisers require the explicitly supplied current E2-locked version, every configured signer to be signed, and every required signature or initial field to be complete with its own stored asset. Finalisation fails when a field targets a page outside the produced PDF.

Deploy `202607170023_legal_final_signed_assurance_f2.sql` together with the updated `generate-final-signed-otp`, `generate-final-signed-document`, and `signer-signing-action` functions. Complete the controlled OTP and mandate through their signer links, then run:

```bash
npm run verify:legal-documents:phase-f2
```

Each final PDF is recorded once with immutable SHA-256, byte length, media type, storage location, signer-evidence digest and field-evidence digest. The verifier downloads the stored bytes, confirms the PDF container and digest, and requires exact-version view, completion and final-generation events. `READY_FOR_F3` means both controlled final signed artifacts passed byte-level read-back assurance. Existing pre-F2 artifacts must be regenerated through a new governed packet version; F2 never retrofits or replaces legal evidence.

### Phase F3 final-document delivery and portal publication

F3 distributes the exact immutable F2 PDF to every configured signer. Delivery is recorded per signer and per attempt with the recipient role, exact artifact SHA-256/path, provider message ID, timestamp and failure code. Successful recipients are not emailed twice when finalisation or delivery is retried; failed recipients remain retryable.

Deploy `202607170024_legal_final_delivery_assurance_f3.sql`, `dispatch-final-signed-document`, and the updated finalisers and `send-email` function. Existing-artifact finalisation is now the safe retry path for incomplete F3 delivery. Then run:

```bash
npm run verify:legal-documents:phase-f3
```

The dispatcher also verifies that the F2 object can produce a fresh signed URL and records its publication to the correct application surface: seller portal for mandates and client portal for OTPs. `READY_FOR_G1` requires provider-confirmed delivery to every signer, matching artifact evidence, verified portal publication and an exact-version completion event. Email failures never roll back or replace the signed legal artifact.

### Phase G1 end-to-end lifecycle certification

G1 certifies the controlled OTP and mandate as one coherent launch pair instead of accepting unrelated phase fixtures. Both documents must belong to the same pilot organisation, remain on their exact current version, and preserve the same generation attempt and approved draft artifact through review and lock. Generation, approval, lock, dispatch, signer view, completion, finalisation, portal publication and final delivery must all be present in chronological order on that version.

After both controlled journeys report `READY_FOR_G1`, run:

```bash
npm run verify:legal-documents:phase-g1
```

The verifier is read-only and exposes no signer personal data. It fails closed on a missing OTP/mandate pair, organisation drift, packet/version substitution, draft or final artifact drift, incomplete signer delivery, missing lifecycle milestones, or impossible event ordering. `READY_FOR_G2` means the full governed journey is internally coherent; it does not replace later browser usability and operational rollout checks.

### Phase G2 completed-workspace browser usability

G2 opens the exact G1-certified OTP and mandate in the authenticated legal-document workspace on desktop and mobile. It verifies that a low-context user sees the correct document name, an unmistakable finalized and immutable state, a type-correct download action, a usable final-PDF action, accessible names on visible controls, no horizontal mobile overflow, no page crashes, and no application HTTP 5xx responses.

```bash
npm run verify:legal-documents:phase-g2
```

The G2 verifier is read-only and restricted to canonical staging. It requires a real staging browser actor through `LEGAL_DOCUMENT_G2_EMAIL` and `LEGAL_DOCUMENT_G2_PASSWORD`, or the existing canonical browser credentials. Screenshots are written beneath `test-results/legal-document-phase-g2`; no application data is changed. `READY_FOR_G3` means both finalized workspaces are understandable and usable at desktop and phone widths. G2 does not click generation, signing, resend, or finalisation controls.

### Phase G3 operational go-live boundary

G3 requires the usable G2 journey to be observable and supportable before it can reach A2 release approval. The watchdog now verifies the current completed version has immutable F2 evidence, provider-confirmed F3 delivery to every signer, and publication on the correct portal in addition to the existing generation, stale-signing, and final-file checks.

Record real ownership and environment references in `config/legal-document-g3-operations.json`; do not invent names, channels, or monitoring evidence. Then run:

```bash
npm run verify:legal-documents:phase-g3
```

G3 requires a fresh healthy watchdog snapshot, healthy 24-hour monitoring, a clean non-mutating reconciliation run, an accountable operations owner, a first-line support owner, an incident escalation reference, a deployed monitoring reference, and valid support and rollback runbooks. `READY_FOR_G4` means the controlled service is usable, monitored, recoverable, and owned.

### Phase G4 recovery and rollback rehearsal

G4 proves the documented recovery controls work against the exact governed target set before A2 approval. It runs the A3 runtime kill switch and template-approval rollback operators in dry-run mode, confirms that neither mutates data, and binds them to the B1 manifest project and template IDs. It also verifies both finalisers can retry F3 delivery from the existing immutable artifact while preserving concurrency claims, provider idempotency, successful-recipient skipping, and signed-artifact immutability.

```bash
npm run verify:legal-documents:phase-g4
```

The report includes a SHA-256 digest of the project, template target set, two recovery dry runs, and delivery-retry contract. `READY_FOR_H1` means the complete technical journey has a rehearsed stop, rollback, and retry path.

### Phase H1 tenant and finalisation authority boundary

H1 closes the cross-tenant privilege boundary before release. Both final-signed generators now independently authenticate the caller even though they use service-role access internally. Service-to-service completion remains permitted; an interactive caller must be an active packet-organisation member and either an organisation administrator, the assigned agent, or the packet creator. The authenticated caller identity replaces any client-supplied `finalisedBy` value.

```bash
npm run verify:legal-documents:phase-h1
```

The verifier uses a managed staging user with no membership in the controlled organisation. It proves that the user cannot read the exact OTP or mandate packet, version, signer, field, event, F2 evidence, F3 delivery, or portal-publication rows and cannot download either signed artifact. It also safely probes deployed function contracts without finalising a packet, and requires the dispatcher and watchdog to reject the unrelated credential. `READY_FOR_H2` means the controlled lifecycle and signed bytes are tenant-isolated. No remote data is changed.

### Phase H2 same-tenant least-privilege boundary

H2 removes the earlier demo-era policy that allowed every active organisation member to read, modify, or delete every legal-document packet and its signing rows. Packet access is now limited to an organisation administrator, the assigned agent, or the packet creator. Existing transfer-attorney read access remains a separate additive policy; H2 does not grant attorneys mutation authority.

Deploy `202607170025_legal_packet_least_privilege_h2.sql` and the H2 finalisers, then configure `H2_UNASSIGNED_EMAIL` and `H2_UNASSIGNED_PASSWORD` for an active member of the controlled organisation who is not an administrator, assigned agent, or packet creator:

```bash
npm run verify:legal-documents:phase-h2
```

The verifier confirms the actor has the intended organisation membership but no authority over either controlled packet. It then proves packet, version, signer, field, event, final-evidence, final-delivery, publication, and signed-artifact access is denied. Exact-packet finalisation probes use a deliberately nonexistent version ID, so even an incorrectly authorised deployment cannot regenerate or redeliver a document. `READY_FOR_H3` means ordinary same-tenant membership no longer grants legal-document authority. No remote data is changed.

### Phase H3 authority continuity and membership revocation

H3 proves the least-privilege boundary is usable in both directions. An active administrator, assigned agent, or packet creator must retain complete access to the exact controlled packet, version, signer, field, and event records. An authenticated user whose organisation membership is inactive or revoked must have no packet authority even if their account can still sign in.

Deploy the H3 finalisers, configure `H3_AUTHORISED_EMAIL`/`H3_AUTHORISED_PASSWORD` and `H3_REVOKED_EMAIL`/`H3_REVOKED_PASSWORD`, then run:

```bash
npm run verify:legal-documents:phase-h3
```

The positive and revoked finaliser probes use each controlled packet with a deliberately nonexistent version UUID. The authorised request must reach the safe `NO_GENERATED_VERSION` boundary, while the revoked request must fail earlier with `FINALISATION_FORBIDDEN`. The verifier never invokes a real version, creates a signing link, sends email, or changes membership. `READY_FOR_H4` means H2 preserves legitimate document work and immediately respects membership revocation.

### Phase H4 anonymous and public signer surface

H4 closes the remaining unauthenticated surface before A2. It verifies that anonymous callers cannot read the controlled packet, version, signer, field, event, F2 evidence, F3 delivery, or publication rows; cannot download either signed artifact; and cannot use a persisted public final-document URL. Anonymous credentials must also be rejected by both finalisers, the delivery dispatcher, and the watchdog.

```bash
npm run verify:legal-documents:phase-h4
```

The verifier additionally submits a fresh random 256-bit fake token to both public signing functions. Both functions must return the generic `INVALID_SIGNING_TOKEN` response without packet, version, signer, or personal data. No real signing token is read or exercised. `READY_FOR_I1` means the H1–H4 tenant, least-privilege, revocation, and anonymous boundaries have all passed without changing remote data.

### Phase I1 concurrent packet-version persistence

I1 removes the client-side “read max version, add one, insert, then update packet” race. Packet version allocation, version insertion, current-version pointer update, and the `version_created` event now run in one database transaction under a per-packet row lock. A unique `(packet_id, version_number)` index independently prevents duplicate version numbers.

Deploy `202607170029_legal_generation_concurrency_i1.sql`, then run:

```bash
npm run verify:legal-documents:phase-i1
```

The verifier sends concurrent dry-run reservations against the exact controlled OTP and mandate. Every response must return the same next version for its packet under the `i1-v1` contract, p95 must remain within three seconds, and packet, version, event, and current-version counts must be identical before and after. `READY_FOR_I2` means concurrent users cannot corrupt version lineage at the persistence boundary. No document is rendered and no remote data is changed.

### Phase I2 concurrent renderer capacity and isolation

I2 adds a service-role-only `capacityProbe` mode to `generate-otp` and `generate-mandate`. It runs the exact approval, source download, data mapping, DOCX/native rendering, and output hashing path, then returns before the first storage upload or database insert. Responses expose only media type, byte length, SHA-256, duration, and the `i2-v1` contract.

Deploy both updated generators, then run:

```bash
npm run verify:legal-documents:phase-i2
```

The verifier first proves ordinary anonymous credentials cannot invoke capacity mode. It then renders the controlled OTP and mandate concurrently using their exact governed inputs. Identical inputs must produce identical digests, p95 must stay within 30 seconds, and packet pointers, versions, events, documents, and storage-object counts must be unchanged. `READY_FOR_I3` means concurrent rendering is isolated, bounded, and non-persisting under the rollout baseline.

### Phase I3 generation backpressure and duplicate-click protection

I3 prevents rapid clicks, multiple tabs, or concurrent users from rendering the same packet simultaneously. Before the generation event or renderer call, the application must claim a packet-scoped lease bound to its D3 generation-attempt UUID. A second attempt receives `GENERATION_ALREADY_IN_PROGRESS`. Successful I1 version insertion removes the exact lease in the same transaction; failed OTP renders release it explicitly, and abandoned attempts expire automatically.

Deploy `202607170030_legal_generation_backpressure_i3.sql`, then run:

```bash
npm run verify:legal-documents:phase-i3
```

The verifier runs two waves of concurrent transaction-scoped advisory-lock probes against the controlled OTP and mandate. Exactly one request per packet may hold the generation slot in each wave, all others must be rejected promptly, anonymous callers must have no diagnostic access, and persistent lease counts must remain unchanged. `READY_FOR_J1` means overload is rejected before expensive rendering without leaving certification data behind.

### Phase J1 user-facing generation recovery

J1 gives low-context users a consistent recovery path when mandate or OTP generation fails. The workspace, packet panel, seller-lead pipeline, transaction unit view, and document builder now translate duplicate requests, timeouts, missing information, expired sessions, access problems, template problems, rendering errors, and storage failures into safe packet-specific wording with one explicit next step. Raw provider and database messages remain in diagnostics, and every generation entry point releases its busy state in `finally` so a user cannot be trapped behind a permanent spinner.

```bash
npm run test:legal-documents-phase-j1
npm run verify:legal-documents:phase-j1
```

The verifier is read-only. It checks both packet types across the recovery matrix, confirms all five generation surfaces use the shared contract, proves loading-state release coverage, and chains the I3 backpressure result. `READY_FOR_J2` means generation failures are understandable and recoverable without exposing backend details.

### Phase J2 ambiguous-result reconciliation

J2 prevents a duplicate click or timeout from immediately becoming another generation attempt. Before generation, each surface snapshots the existing generated version IDs and highest version number. If the result is ambiguous, the UI polls packet state read-only and accepts success only when a newer generated version appears. An older draft can never be mistaken for the result of the current click. Confirmed results are adopted automatically; unresolved results fall back to J1 guidance. The agency-pipeline and unit feeder pages suppress premature errors while the legal workspace performs this check.

```bash
npm run test:legal-documents-phase-j2
npm run verify:legal-documents:phase-j2
```

The verifier performs deterministic duplicate, timeout, stale-version, non-ambiguous failure, and transient-read scenarios without writing data. `READY_FOR_J3` means ambiguous generation outcomes reconcile safely before the user is offered another attempt.

### Phase J3 controlled retry and escalation

J3 replaces generic retry behaviour with a failure-specific action. Validation opens information review, duplicate and timeout results refresh status, expired authentication returns to sign-in, and access or template problems produce an administrator reference. Rendering and storage failures permit one deliberate retry. If the same failure repeats for the same packet, Arch9 stops recommending regeneration and produces a stable, sanitised support reference instead. This prevents low-context users from creating retry loops or repeatedly resetting a packet that requires intervention.

```bash
npm run test:legal-documents-phase-j3
npm run verify:legal-documents:phase-j3
```

The verifier is read-only and checks action routing, the one-retry ceiling, repeat-failure escalation, support-reference sanitisation, and coverage across the workspace, packet panel, and document builder. `READY_FOR_J4` means users receive the correct recovery control and repeated technical failures are escalated safely.

### Phase J4 durable support handoff

J4 makes J3 support and administrator references discoverable. Copying a handoff reference, or reaching automatic repeat-failure escalation, records a `legal_generation_support_handoff` packet event with a strict `j4-v1` payload: reference, failure class, packet type, UI surface, retry count, and escalation type. Raw exceptions, provider details, entered document data, and email addresses are never accepted into this payload. Each reference is recorded once per open surface. Event-write denial, an unavailable diagnostic writer, or an unsaved packet never prevents the user from copying the reference.

```bash
npm run test:legal-documents-phase-j4
npm run verify:legal-documents:phase-j4
```

The verifier is non-mutating and uses an injected event writer to prove the payload contract, denial handling, write-failure handling, unsaved-packet handling, surface coverage, and deduplication. `READY_FOR_K1` means escalated generation failures have a safe, durable, support-searchable handoff.

### Phase K1 administrator support triage feed

K1 exposes J4 handoffs in Operations Center as a read-only, organisation-scoped feed. Active organisation-administrator membership is checked before querying, and existing database RLS remains authoritative. Operators can search visually by the copyable reference and see the document label, packet status, OTP or mandate type, sanitised failure class, retry count, escalation type, source surface, and timestamp. The read model revalidates the `j4-v1` contract and drops malformed, unsafe, or non-handoff events rather than rendering arbitrary metadata.

```bash
npm run test:legal-documents-phase-k1
npm run verify:legal-documents:phase-k1
```

The verifier is non-mutating and checks the admin boundary, organisation scope, event and packet query filters, payload whitelist, malformed-event rejection, summary counts, and Operations Center coverage. `READY_FOR_K2` means authorised operators can find a user’s support reference without direct database access or sensitive diagnostic exposure.

### Phase K2 support case acknowledgement and resolution

K2 gives each K1 handoff an append-only lifecycle: Open, Acknowledged, then Resolved. Organisation administrators acknowledge ownership before choosing one of six controlled resolution categories. The original J4 handoff is never edited, free-text resolution notes are not accepted, and both lifecycle events use a sanitised `k2-v1` payload. A database expression index permits only one acknowledgement and one resolution per packet/reference; concurrent duplicates return an unchanged result. Resolution before acknowledgement is rejected.

Deploy `202607170031_legal_generation_support_triage_k2.sql`, then run:

```bash
npm run test:legal-documents-phase-k2
npm run verify:legal-documents:phase-k2
```

The verifier is non-mutating and checks lifecycle folding, invalid-resolution rejection, append-only persistence, administrator access, transition ordering, database uniqueness, idempotent duplicate handling, and Operations Center actions. `READY_FOR_K3` means support handoffs can be owned and closed without losing or rewriting the original incident evidence.

### Phase K3 support SLA and queue priority

K3 derives an operational SLA from immutable case timestamps without writing background state. Open handoffs must be acknowledged within 30 minutes; acknowledged handoffs must be resolved within four hours. The read model emits response due, response overdue, resolution due, resolution overdue, or complete, together with the exact due time, age, owner, and next action. Operations Center places response-overdue cases first, followed by resolution-overdue, due work, and completed cases, and shows aggregate overdue totals.

```bash
npm run test:legal-documents-phase-k3
npm run verify:legal-documents:phase-k3
```

The verifier is non-mutating and tests 29/31-minute response boundaries, 239/241-minute resolution boundaries, completed-case exclusion, aggregate counts, queue ordering, and UI visibility. `READY_FOR_L1` means the legal-generation support queue has deterministic ownership deadlines and overdue work cannot be hidden by newer low-priority cases.

### Phase L1 consolidated launch certification

L1 returns to the full mandate-and-OTP rollout question and replaces scattered phase interpretation with one read-only certificate. It independently evaluates activation health, accountable legal approval, deterministic governed-source rendering, generation capacity and backpressure, and the complete lifecycle, recovery, and support chain. It also requires explicit controlled coverage for both OTP and mandate. Every failed terminal verifier contributes its original blocker code, detail, domain, and workable solution to one deduplicated report.

```bash
npm run test:legal-documents-phase-l1
npm run verify:legal-documents:phase-l1
```

`READY_FOR_L2` means both controlled document journeys have passed all five rollout domains. `NO_GO` is accompanied by the concrete blocker and solution list; the verifier never changes templates, packets, signing records, support cases, configuration, or staging data.

### Phase L2 dependency-aware remediation plan

L2 turns the current L1 certificate into an executable recovery sequence instead of presenting operators with an unordered wall of symptoms. Each action has an accountable owner role, affected document type, execution mode, exact steps, verification commands, acceptance criteria, originating blocker codes, and explicit dependencies. Known downstream symptoms are grouped behind their root prerequisite: platform targeting, governed-source recovery, counsel approval, renderer capacity, parallel controlled OTP and mandate journeys, support lifecycle proof, and final L1 recertification.

```bash
npm run test:legal-documents-phase-l2
npm run verify:legal-documents:phase-l2
```

`REMEDIATION_PLAN_READY` means every current L1 blocker has a workable, dependency-ordered action; it does not claim that those actions have already been performed. `READY_FOR_L3` is emitted only when L1 already has zero blockers. Unknown future blocker codes receive an explicit manual-remediation action instead of disappearing from the plan. L2 is read-only and never performs activation, source repair, approval, controlled generation, or support mutations itself.

### Phase L3 remediation execution gate

L3 prevents the complete L2 runbook from being mistaken for permission to perform every action at once. It recomputes L2 from live L1 evidence, resolves the remaining dependency graph, and exposes only the earliest dependency-satisfied wave as `nextActions`. Every later action is marked held with either its unresolved action IDs or `L3_EARLIER_WAVE_ACTIVE`. The current action carries its owner, document scope, execution mode, originating blockers, exact steps, commands, acceptance condition, and whether deliberate human authorisation is required.

```bash
npm run test:legal-documents-phase-l3
npm run verify:legal-documents:phase-l3
```

`EXECUTION_WAVE_READY` means the reported wave may be deliberately performed by its accountable owner; L3 itself performs none of its commands. `EXECUTION_BLOCKED` catches incomplete plans and dependency cycles. `READY_FOR_L4` is emitted only when L2 is already launch-ready with no remediation actions remaining. The gate is read-only and never activates a cohort, modifies a source, records a legal decision, generates a packet, or changes support state.

### Phase M1 fail-closed production release authority

M1 is the boundary between “the remediation machinery exists” and “this exact rollout may be authorised.” It rebuilds the complete L3 chain and requires L1 certification, an exhausted L3 action graph, explicit OTP and mandate journey coverage, an active and approved cohort, identical configured/approved/activated allowlists, read-only evidence, and evidence no older than 15 minutes. Operators must explicitly supply both `LEGAL_DOCUMENT_RELEASE_ENVIRONMENT` and `LEGAL_DOCUMENT_RELEASE_PROJECT_REF`; loaded environment files alone never select a release target.

```bash
npm run test:legal-documents-phase-m1
LEGAL_DOCUMENT_RELEASE_ENVIRONMENT=production \
LEGAL_DOCUMENT_RELEASE_PROJECT_REF=YOUR_CONFIRMED_PROJECT_REF \
npm run verify:legal-documents:phase-m1
```

`READY_FOR_M2` is the only authorised outcome. `RELEASE_HOLD` includes a solution for every failed condition and must not be treated as partial approval. M1 is read-only: it neither widens the cohort nor changes runtime secrets, templates, approvals, packets, or support records.

### Phase M2 guarded release receipt

M2 converts a fresh `READY_FOR_M2` decision into a short-lived, tamper-evident release receipt. The receipt binds the exact environment, project, sorted organisation cohort, source M1 evidence digest, accountable issuer, release reference, issue time, and expiry time. Issuance is a dry run unless `--apply` and `LEGAL_DOCUMENT_PHASE_M2_WRITE=true` are both supplied, and every target component must be repeated as an exact confirmation. An unexpired receipt is never overwritten.

```bash
npm run test:legal-documents-phase-m2
npm run issue:legal-documents:phase-m2 -- \
  --issued-by=ACCOUNTABLE_RELEASE_OWNER \
  --reference=RELEASE_REFERENCE \
  --confirm-environment=production \
  --confirm-project-ref=CONFIRMED_PROJECT_REF \
  --confirm-organisation-ids=CONFIRMED_COMMA_SEPARATED_IDS
npm run verify:legal-documents:phase-m2
```

The issuer inherits M1's required `LEGAL_DOCUMENT_RELEASE_ENVIRONMENT` and `LEGAL_DOCUMENT_RELEASE_PROJECT_REF`. Applying a receipt additionally requires the write flag and `--apply`. `READY_FOR_M3` means the current M1 decision is still authorised and the committed receipt is unexpired, target-matched, accountable, and digest-valid. Receipt issuance does not activate or widen the cohort and does not modify runtime secrets or application data.

### Phase M3 one-time release claim

M3 prevents an M2 receipt from becoming reusable ambient authority. An accountable release operator claims the exact receipt once, binding its digest and target to an execution/change reference while preserving the receipt expiry. The claim is itself digest-protected. Any current or historical claim for the same receipt digest blocks replay, even after expiry.

```bash
npm run test:legal-documents-phase-m3
npm run claim:legal-documents:phase-m3 -- \
  --claimed-by=ACCOUNTABLE_RELEASE_OPERATOR \
  --execution-reference=DEPLOYMENT_OR_CHANGE_REFERENCE \
  --confirm-environment=production \
  --confirm-project-ref=CONFIRMED_PROJECT_REF \
  --confirm-organisation-ids=CONFIRMED_COMMA_SEPARATED_IDS
npm run verify:legal-documents:phase-m3
```

Claiming is a dry run unless `LEGAL_DOCUMENT_PHASE_M3_WRITE=true` and `--apply` are supplied. `READY_FOR_M4` means M2 remains valid and the one-time claim is unexpired, accountable, target-bound, receipt-bound, and digest-valid. M3 records execution authority only; it does not deploy code, activate or widen a cohort, or mutate runtime and application data.

### Phase N1 launch-window preflight

N1 independently reconciles the one-time M3 claim with the live rollout boundary immediately before execution. It requires A3 to be healthy, the runtime pilot secret digests to match, the complete release gate to be `GO`, and the claimed environment, project, and cohort to match the governed, activated, and runtime values exactly. Runtime evidence expires after five minutes. The explicit rollback strategy and guarded A3 deactivation operator must also be present.

```bash
npm run test:legal-documents-phase-n1
npm run verify:legal-documents:phase-n1
```

`READY_FOR_N2` opens the launch window for the exact claimed target only. `NO_GO` keeps it closed and returns a solution for every mismatch. N1 is read-only and does not consume the claim, deploy code, change secrets, activate or widen a cohort, or alter application data.

### Phase N2 rollout safety envelope

N2 constrains the open N1 window to an explicit blast radius and stop policy. The claimed cohort must remain within `maxOrganisations`; initial-rollout generation failures and stale signing packets both have zero tolerance; stale signing detection must occur within two hours; monitoring, reconciliation, rollback, and guarded deactivation controls must exist; and at least two whole minutes of claim life must remain. OTP and mandate are mandatory canaries, with one successful journey of each required before cohort continuation.

```bash
npm run test:legal-documents-phase-n2
npm run verify:legal-documents:phase-n2
```

`READY_FOR_N3` describes the exact target, required canaries, claim lifetime, and four automatic stop conditions. `NO_GO` leaves rollout closed with a solution for every unsafe policy or control. N2 is read-only and does not deploy, generate canaries, consume authority, or change configuration and application data.

### Phase N3 dual-canary acceptance

N3 proves the first real rollout journeys rather than accepting a manually checked box. After N2 opens the safety envelope, it selects the latest completed OTP and mandate from the exact cohort whose completion began after the M3 claim. It loads the exact current versions, signers, lifecycle events, final-artifact evidence, per-recipient deliveries, and portal publications, then applies the existing G1 end-to-end coherence contract. Both distinct packets must be generated after claim time and finally delivered before claim expiry.

```bash
npm run test:legal-documents-phase-n3
npm run verify:legal-documents:phase-n3
```

`READY_FOR_N4` requires one passing OTP and one passing mandate with distinct packet/version identities, target-cohort membership, valid final-artifact digests, coherent lifecycle evidence, and claim-window delivery. Any failed canary keeps rollout halted under N2's stop policy. N3 is read-only and never creates, signs, delivers, or modifies the canary documents.

### Phase N4 post-canary continuation gate

N4 makes the first continuation decision after both canaries. It scopes generation failures and stale signing packets to the claimed cohort and release window, rechecks target alignment, requires a healthy no-blocker watchdog snapshot created after the claim and within five minutes, confirms the accepted canary pair is still present, and refuses continuation after claim expiry.

```bash
npm run test:legal-documents-phase-n4
npm run verify:legal-documents:phase-n4
```

There are only two decisions. `READY_FOR_O1` / `CONTINUE_CONTROLLED_COHORT` permits activity inside the existing cohort and N2 limits. `HALT_AND_DEACTIVATE` requires the guarded A3 deactivation operator and a recorded incident/change reference; N4 deliberately does not perform that write itself. The gate is read-only and never expands the cohort or modifies runtime and application data.

### Phase O1 durable cohort-continuation record

O1 preserves a successful N4 decision beyond the short-lived M3 claim window. The record binds the exact claim and receipt digests, release target, accepted OTP and mandate packet/version/artifact identities, healthy watchdog snapshot, N4 decision time, accountable operator, and continuation/change reference. It must be recorded after N4 and before claim expiry, and one claim can produce only one continuation record.

```bash
npm run test:legal-documents-phase-o1
npm run record:legal-documents:phase-o1 -- \
  --recorded-by=ACCOUNTABLE_CONTINUATION_OPERATOR \
  --reference=CONTINUATION_OR_CHANGE_REFERENCE \
  --confirm-environment=production \
  --confirm-project-ref=CONFIRMED_PROJECT_REF \
  --confirm-organisation-ids=CONFIRMED_COMMA_SEPARATED_IDS
npm run verify:legal-documents:phase-o1
```

Recording is a dry run unless `LEGAL_DOCUMENT_PHASE_O1_WRITE=true` and `--apply` are supplied. `READY_FOR_O2` means the durable record is accountable, claim/receipt/target/canary/watchdog-bound, correctly timed, and digest-valid. O1 records continuation authority only; it does not expand the cohort or change runtime and application data.

### Phase O2 controlled-cohort soak gate

O2 requires the continued cohort to remain healthy for 24 hours before any further rollout decision. It scopes evidence to the O1 target and record time, requires zero generation failures and stale signing packets, at least one additional completed OTP and mandate, no target drift, and at least two healthy blocker-free watchdog snapshots with the latest no older than 15 minutes.

```bash
npm run test:legal-documents-phase-o2
npm run verify:legal-documents:phase-o2
```

`SOAK_IN_PROGRESS` means the cohort remains deliberately constrained while time or document activity accumulates. `HALT_AND_DEACTIVATE` means a safety condition failed. `READY_FOR_O3` / `SOAK_ACCEPTED` is emitted only after the complete observation period and health evidence pass. O2 is read-only and never expands or deactivates the cohort itself.

### Phase O3 single-organisation expansion proposal

O3 proposes the next controlled tranche after O2 soak acceptance. It uses an expansion-safe candidate read model rather than weakening A1's deliberate “pilot disabled” prelaunch guard. New candidates must be active agencies with sufficient active agents, usable published OTP and mandate templates, and a preferred transfer attorney. The current configured cohort must still match O1, the total must remain within `maxOrganisations`, and at most one organisation is added per proposal.

```bash
npm run test:legal-documents-phase-o3
npm run verify:legal-documents:phase-o3
```

`EXPANSION_WAITING` means no additional candidate is ready. `EXPANSION_BLOCKED` means current state or policy is unsafe. `READY_FOR_P1` emits a read-only one-organisation proposal that explicitly requires fresh A2 approval, L1 certification, M1 authority, M2 receipt, and M3 claim; it never modifies the allowlist or expands runtime access itself.

### Phase P1 accountable expansion approval

P1 records human approval of the exact O3 tranche without applying it. The approval binds the O1 continuation digest, current cohort, one added organisation, proposed cohort, maximum limit, candidate readiness evidence, target, source proposal time, accountable approver, and approval/change reference. Exact current/proposed/added IDs and the environment/project must be confirmed at invocation.

```bash
npm run test:legal-documents-phase-p1
npm run approve:legal-documents:phase-p1 -- \
  --approved-by=ACCOUNTABLE_EXPANSION_APPROVER \
  --reference=EXPANSION_APPROVAL_REFERENCE \
  --confirm-environment=production \
  --confirm-project-ref=CONFIRMED_PROJECT_REF \
  --confirm-current-organisation-ids=CURRENT_IDS \
  --confirm-proposed-organisation-ids=PROPOSED_IDS \
  --confirm-added-organisation-id=ADDED_ID
npm run verify:legal-documents:phase-p1
```

Approval is a dry run unless `LEGAL_DOCUMENT_PHASE_P1_WRITE=true` and `--apply` are supplied. `READY_FOR_P2` means the approval is accountable, continuation/proposal/candidate-bound, single-organisation, within limit, current-state matched, and digest-valid. P1 never modifies the effective allowlist or runtime secrets.

### Phase P2 pending expansion change set

P2 stages the approved before/after cohort as a separate digest-protected change set while deliberately leaving `legal-document-pilot.json` and runtime secrets on the current O1 cohort. The pending record binds the exact P1 approval digest, target, current cohort, one added organisation, proposed cohort, limit, accountable staging operator, and change reference. This creates a reviewable input for fresh certification without exposing the candidate early.

```bash
npm run test:legal-documents-phase-p2
npm run stage:legal-documents:phase-p2 -- \
  --staged-by=ACCOUNTABLE_STAGING_OPERATOR \
  --reference=STAGING_OR_CHANGE_REFERENCE \
  --confirm-approval-digest=APPROVAL_DIGEST \
  --confirm-current-organisation-ids=CURRENT_IDS \
  --confirm-proposed-organisation-ids=PROPOSED_IDS \
  --confirm-added-organisation-id=ADDED_ID
npm run verify:legal-documents:phase-p2
```

Staging is a dry run unless `LEGAL_DOCUMENT_PHASE_P2_WRITE=true` and `--apply` are supplied. `READY_FOR_P3` means the change set is approval-bound, accountable, single-organisation, within limit, correctly timed, digest-valid, and the effective allowlist is still unchanged. P2 never changes runtime access.

### Phase P3 expanded-cohort certification

P3 performs a fresh, read-only certification of the exact P2 proposed cohort before any expansion authority is renewed. It requires the effective allowlist to remain on the current cohort, rechecks live agency, active-agent, OTP-template, mandate-template, and preferred-transfer-attorney readiness for the added organisation, and reruns consolidated L1 terminal certification. All P2, cohort, and L1 evidence must be read-only, post-staging, and no older than 15 minutes.

```bash
npm run test:legal-documents-phase-p3
npm run verify:legal-documents:phase-p3
```

`READY_FOR_FRESH_AUTHORITY` emits a digest-bound certificate containing the P2 change-set digest, exact current/added/proposed cohort, release target, added-organisation evidence, and OTP/mandate terminal coverage. `NO_GO` supplies a solution for every failed boundary. P3 never edits `legal-document-pilot.json`, runtime secrets, or application data; expanded-cohort activation and fresh M1, M2, and M3 authority must still be performed deliberately.

### Phase Q1 accountable expansion activation plan

Q1 converts a fresh P3 certificate into a short-lived, accountable activation plan without changing the effective allowlist or runtime secrets. The plan embeds and verifies the P3 certificate, binds the exact P2 pending digest, promotes the proposed cohort only as the future activation target, and expires with P3's 15-minute evidence window.

```bash
npm run test:legal-documents-phase-q1
npm run plan:legal-documents:phase-q1 -- \
  --planned-by=ACCOUNTABLE_ACTIVATION_PLANNER \
  --reference=ACTIVATION_OR_CHANGE_REFERENCE \
  --confirm-certification-digest=P3_CERTIFICATION_DIGEST \
  --confirm-environment=production \
  --confirm-project-ref=CONFIRMED_PROJECT_REF \
  --confirm-current-organisation-ids=CURRENT_IDS \
  --confirm-proposed-organisation-ids=PROPOSED_IDS \
  --confirm-added-organisation-id=ADDED_ID
npm run verify:legal-documents:phase-q1
```

Planning is a dry run unless `LEGAL_DOCUMENT_PHASE_Q1_WRITE=true` and `--apply` are supplied. `READY_FOR_Q2` requires a current P3 decision, valid embedded certificate and plan digests, exact target binding, accountable evidence, an unexpired window, and proof that neither the effective allowlist nor runtime secrets changed. Q1 records intent only; Q2 performs the guarded activation.

### Phase Q2 guarded expanded-cohort activation

Q2 is the first phase that exposes the certified organisation. It requires a live `READY_FOR_Q2` plan, the currently active cohort to match Q1 everywhere, and the P1 approval to remain bound through P2. The operator updates the runtime allowlist first, verifies Supabase secret digests, then atomically prepares the governed pilot and activation receipt. If secret verification or local persistence fails, it restores the previous active cohort.

```bash
npm run test:legal-documents-phase-q2
npm run activate:legal-documents:phase-q2 -- \
  --activated-by=ACCOUNTABLE_ACTIVATION_OPERATOR \
  --reference=ACTIVATION_OR_CHANGE_REFERENCE \
  --confirm-plan-digest=Q1_PLAN_DIGEST \
  --confirm-environment=production \
  --confirm-project-ref=CONFIRMED_PROJECT_REF \
  --confirm-current-organisation-ids=CURRENT_IDS \
  --confirm-proposed-organisation-ids=PROPOSED_IDS \
  --confirm-added-organisation-id=ADDED_ID
npm run verify:legal-documents:phase-q2
```

Activation is a dry run unless `LEGAL_DOCUMENT_PHASE_Q2_WRITE=true` and `--apply` are supplied. `READY_FOR_Q3` requires the effective, release-approved, repository-activated, and runtime-secret cohorts to match exactly; it also preserves the original P1 approver rather than substituting the Q2 operator. Q2 writes a digest-bound activation receipt for Q3 and fresh M1/M2/M3 authority.

### Phase Q3 post-activation verification

Q3 independently accepts or rejects the live expanded cohort after Q2. It revalidates the Q2 receipt and runtime secrets, runs the complete A3 release gate, rechecks live readiness for every activated organisation, and requires the added organisation to retain an active agent, usable OTP and mandate templates, and a preferred transfer attorney. All evidence must be read-only, post-activation, and no older than 15 minutes.

```bash
npm run test:legal-documents-phase-q3
npm run verify:legal-documents:phase-q3
```

`READY_FOR_M1` emits a digest-bound verification tied to the exact Q2 activation receipt. `NO_GO` provides a concrete recovery or rollback solution for every failed boundary. M1 now detects expanded-cohort activation and requires this exact Q3 binding, preventing fresh release authority from bypassing post-activation acceptance. Q3 never mutates configuration, secrets, or application data.

### Phase R1 expanded-cohort release authority

R1 combines the exact Q3 post-activation verification with a fresh expansion-aware M1 decision. It requires both decisions to bind the same Q2 activation digest and the same environment, project, and expanded organisation cohort. Q3 runs first; when it is not ready, R1 deliberately skips the expensive M1 chain.

```bash
npm run test:legal-documents-phase-r1
LEGAL_DOCUMENT_RELEASE_ENVIRONMENT=production \
LEGAL_DOCUMENT_RELEASE_PROJECT_REF=CONFIRMED_PROJECT_REF \
npm run verify:legal-documents:phase-r1
```

`READY_FOR_R2` emits a digest-bound, read-only authority record containing the Q2 activation digest, Q3 verification digest, fresh M1 evidence digest, exact release target, and evidence window. `RELEASE_HOLD` supplies a concrete solution for every failed boundary. R1 does not issue a receipt, claim authority, or mutate configuration, secrets, or application data.

### Phase R2 expanded-cohort release receipt

R2 issues a durable, short-lived receipt for the exact R1 expanded-cohort authority. The receipt embeds the complete R1 authority, binds its activation, Q3, and M1 digests, preserves the exact release target, and expires at the end of R1's 15-minute evidence window. One authority can be issued only once, and an unexpired receipt cannot be overwritten.

```bash
npm run test:legal-documents-phase-r2
LEGAL_DOCUMENT_RELEASE_ENVIRONMENT=production \
LEGAL_DOCUMENT_RELEASE_PROJECT_REF=CONFIRMED_PROJECT_REF \
npm run issue:legal-documents:phase-r2 -- \
  --issued-by=ACCOUNTABLE_RELEASE_ISSUER \
  --reference=RELEASE_OR_CHANGE_REFERENCE \
  --confirm-authority-digest=R1_AUTHORITY_DIGEST \
  --confirm-activation-digest=Q2_ACTIVATION_DIGEST \
  --confirm-environment=production \
  --confirm-project-ref=CONFIRMED_PROJECT_REF \
  --confirm-organisation-ids=EXPANDED_COHORT_IDS
npm run verify:legal-documents:phase-r2
```

Issuance is a dry run unless `LEGAL_DOCUMENT_PHASE_R2_WRITE=true` and `--apply` are supplied. `READY_FOR_R3` requires the stored receipt, current R1 decision, Q2 activation, exact target, evidence ordering, and both embedded and outer digests to remain valid. R2 writes only its receipt state; it does not change runtime secrets, pilot configuration, or application data.

### Phase R3 one-time expanded-cohort claim

R3 claims the exact unexpired R2 receipt for one accountable rollout execution. The claim binds the R2 receipt, embedded R1 authority, Q2 activation, exact environment/project/cohort target, receipt expiry, claimant, and execution reference. Current and historical claims make each R2 receipt single-use.

```bash
npm run test:legal-documents-phase-r3
LEGAL_DOCUMENT_RELEASE_ENVIRONMENT=production \
LEGAL_DOCUMENT_RELEASE_PROJECT_REF=CONFIRMED_PROJECT_REF \
npm run claim:legal-documents:phase-r3 -- \
  --claimed-by=ACCOUNTABLE_EXECUTION_OPERATOR \
  --execution-reference=DEPLOYMENT_OR_CHANGE_REFERENCE \
  --confirm-receipt-digest=R2_RECEIPT_DIGEST \
  --confirm-activation-digest=Q2_ACTIVATION_DIGEST \
  --confirm-environment=production \
  --confirm-project-ref=CONFIRMED_PROJECT_REF \
  --confirm-organisation-ids=EXPANDED_COHORT_IDS
npm run verify:legal-documents:phase-r3
```

Claiming is a dry run unless `LEGAL_DOCUMENT_PHASE_R3_WRITE=true` and `--apply` are supplied. `READY_FOR_S1` requires the current R2 verifier, receipt, activation, target, time window, accountability, and claim digest to remain valid. R3 records execution authority only; it does not modify runtime secrets, pilot configuration, or application data.

### Phase S2 expanded-cohort rollout safety envelope

S2 constructs the fail-closed safety envelope after the S1 expanded launch-window preflight. The full activated cohort remains the blast-radius boundary, while the required OTP and mandate canaries are pinned specifically to the single organisation added by Q2. The R3 claim, Q2 activation digest, S1 target, organisation limit, monitoring, rollback, zero-failure policy, stale-signing policy, and remaining claim window must all pass.

```bash
npm run test:legal-documents-phase-s2
npm run verify:legal-documents:phase-s2
```

`READY_FOR_S3` requires S1 to report `READY_FOR_S2`, at least two whole claim minutes to remain, and every safety control to be available. Any generation failure in the added organisation, stale signing packet, target drift, or monitoring loss requires halt and deactivation. S2 is read-only and deliberately reports `NO_GO` until S1 is implemented and ready.

### Phase S3 added-organisation dual-canary acceptance

S3 accepts rollout only after one OTP and one mandate for the exact organisation added by Q2 complete the governed lifecycle through immutable final artifact, recipient delivery, and portal publication. Both packets and versions must be distinct, must be generated after the R3 claim, must finish before claim expiry, and must retain valid final-artifact SHA-256 evidence.

```bash
npm run test:legal-documents-phase-s3
npm run verify:legal-documents:phase-s3
```

`READY_FOR_S4` requires S2 to report `READY_FOR_S3`, exact S2/R3/Q2 activation binding, a readable lifecycle evidence store, and a successful added-organisation OTP/mandate pair. Any lifecycle reason, wrong organisation, identity collision, invalid artifact digest, or out-of-window milestone is a hard stop. S3 is read-only and performs no generation itself.

### Phase T1 durable expanded-cohort continuation record

T1 preserves a successful S4 continuation decision beyond the short-lived R3 claim window. The record binds the exact R3 claim, R2 receipt, R1 authority, Q2 activation, expanded release target, previous and added organisations, accepted added-organisation OTP and mandate packet/version/artifact identities, healthy watchdog snapshot, S4 decision time, accountable recorder, and continuation/change reference.

```bash
npm run test:legal-documents-phase-t1
npm run record:legal-documents:phase-t1 -- \
  --recorded-by=ACCOUNTABLE_CONTINUATION_OPERATOR \
  --reference=CONTINUATION_OR_CHANGE_REFERENCE \
  --confirm-activation-digest=Q2_ACTIVATION_DIGEST \
  --confirm-environment=production \
  --confirm-project-ref=CONFIRMED_PROJECT_REF \
  --confirm-organisation-ids=EXPANDED_COHORT_IDS \
  --confirm-added-organisation-id=ADDED_ID
npm run verify:legal-documents:phase-t1
```

Recording is a dry run unless `LEGAL_DOCUMENT_PHASE_T1_WRITE=true` and `--apply` are supplied. `READY_FOR_T2` requires accountable, digest-valid, claim/receipt/authority/activation-bound continuation evidence recorded after S4 and before claim expiry. One R3 claim can produce only one T1 record. T1 is fully implemented but remains fail-closed until S4 exists and reports `READY_FOR_T1`.

### Phase T2 expanded-cohort soak gate

T2 observes the continued expanded cohort for 24 hours after T1. It requires zero generation failures and stale signing packets across the entire cohort, at least one additional completed OTP and mandate specifically for the organisation added by Q2, exact continuation/config/runtime/activation alignment, and at least two healthy blocker-free watchdog snapshots with the latest no older than 15 minutes.

```bash
npm run test:legal-documents-phase-t2
npm run verify:legal-documents:phase-t2
```

`SOAK_IN_PROGRESS` means the cohort remains constrained while time or added-organisation activity accumulates. `HALT_AND_DEACTIVATE` means a safety, observability, target, or activation-binding condition failed. `READY_FOR_T3` / `EXPANDED_SOAK_ACCEPTED` is emitted only after the full observation period and all health evidence pass. T2 is read-only.

### Phase T3 next single-organisation expansion proposal

T3 proposes the next tranche only after T2 accepts the 24-hour expanded-cohort soak. It binds the current cohort to the exact T1 continuation and Q2 activation digests, requires configured and activated IDs to match, re-evaluates governed candidates against active-agency, active-agent, OTP-template, mandate-template, and preferred-transfer-attorney readiness, and selects at most one organisation.

```bash
npm run test:legal-documents-phase-t3
npm run verify:legal-documents:phase-t3
```

`READY_FOR_T4` emits a read-only proposal containing the T1 continuation digest, Q2 activation digest, current cohort, one added organisation, proposed cohort, and safety limit. `EXPANSION_WAITING` means no additional candidate is ready; `ROLLOUT_LIMIT_REACHED` means the five-organisation ceiling has been reached; unsafe drift reports `EXPANSION_BLOCKED`. T3 never modifies the allowlist or runtime access.

### Phase T4 next-expansion integrity handoff

T4 creates a short-lived, digest-bound handoff from the current T3 proposal before accountable approval. It binds the exact T1 continuation and Q2 activation digests, release target, unchanged current cohort, single added organisation, proposed cohort, readiness evidence, five-organisation ceiling, and T3 observation time. This closes the gap where candidate or cohort evidence could drift between proposal and approval.

```bash
npm run test:legal-documents-phase-t4
npm run verify:legal-documents:phase-t4
```

`READY_FOR_U1` requires a current `READY_FOR_T4` proposal, exact configured/T1/Q2 cohort alignment, blocker-free candidate evidence, a valid handoff digest, and an unexpired proposal window. The window defaults to 15 minutes and can be reduced or increased to at most 60 minutes with `LEGAL_DOCUMENT_PHASE_T4_MAX_PROPOSAL_AGE_MINUTES`. T4 is read-only and never changes the allowlist, activation, or application data.

### Phase U1 accountable next-expansion approval

U1 converts the short-lived T4 handoff into a durable, accountable decision without changing rollout access. The approval preserves the complete digest-valid T4 evidence and binds the exact T1 continuation, Q2 activation, release target, current cohort, single added organisation, proposed cohort, candidate readiness, and safety limit.

```bash
npm run test:legal-documents-phase-u1
npm run approve:legal-documents:phase-u1 -- \
  --approved-by=ACCOUNTABLE_EXPANSION_APPROVER \
  --reference=APPROVAL_OR_CHANGE_REFERENCE \
  --confirm-handoff-digest=T4_HANDOFF_DIGEST \
  --confirm-continuation-digest=T1_RECORD_DIGEST \
  --confirm-activation-digest=Q2_ACTIVATION_DIGEST \
  --confirm-environment=production \
  --confirm-project-ref=CONFIRMED_PROJECT_REF \
  --confirm-current-organisation-ids=CURRENT_COHORT_IDS \
  --confirm-proposed-organisation-ids=PROPOSED_COHORT_IDS \
  --confirm-added-organisation-id=ADDED_ID
npm run verify:legal-documents:phase-u1
```

Approval is a dry run unless `LEGAL_DOCUMENT_PHASE_U1_WRITE=true` and `--apply` are supplied. `READY_FOR_U2` requires an accountable approval made after handoff and before T4 expiry, valid handoff and approval digests, exact repository/T1/Q2 target alignment, and a healthy active current rollout. A T1/Q2/candidate combination can be approved only once. U1 writes only its approval record; it never changes the allowlist, activation, runtime secrets, or application data.

### Phase U2 pending next-expansion change set

U2 stages the U1-approved before/after cohort in a separate digest-protected record. The current cohort must remain identical across repository configuration, release preparation, runtime activation, T1, and Q2; the proposed organisation is deliberately not added to any effective allowlist. The pending record carries the U1 approval, T4 handoff, T1 continuation, and Q2 activation digests together with the exact target and single-organisation tranche.

```bash
npm run test:legal-documents-phase-u2
npm run stage:legal-documents:phase-u2 -- \
  --staged-by=ACCOUNTABLE_STAGING_OPERATOR \
  --reference=STAGING_OR_CHANGE_REFERENCE \
  --confirm-approval-digest=U1_APPROVAL_DIGEST \
  --confirm-handoff-digest=T4_HANDOFF_DIGEST \
  --confirm-continuation-digest=T1_RECORD_DIGEST \
  --confirm-activation-digest=Q2_ACTIVATION_DIGEST \
  --confirm-current-organisation-ids=CURRENT_COHORT_IDS \
  --confirm-proposed-organisation-ids=PROPOSED_COHORT_IDS \
  --confirm-added-organisation-id=ADDED_ID
npm run verify:legal-documents:phase-u2
```

Staging is a dry run unless `LEGAL_DOCUMENT_PHASE_U2_WRITE=true` and `--apply` are supplied. `READY_FOR_U3` requires a digest-valid, accountable, single-organisation change set staged after U1, exact target and evidence bindings, and proof that neither effective access nor runtime activation changed. One U1 approval can be staged only once. U2 writes only its pending record.

### Phase U3 fresh expanded-cohort certification

U3 performs a fresh, read-only certification of the exact U2 proposed cohort while the effective rollout remains on the current cohort. Unlike the prelaunch A1 checker, U3 is designed for an already-active pilot: it queries every proposed organisation directly and verifies active-agency status, active agents, published usable OTP and mandate templates, and a preferred transfer attorney. It also reruns consolidated L1 terminal certification and binds the complete U2/U1/T4/T1/Q2 digest chain.

```bash
npm run test:legal-documents-phase-u3
npm run verify:legal-documents:phase-u3
```

`READY_FOR_V1` emits a digest-bound certificate containing the exact current, added, and proposed cohorts, release target, readiness evidence for every proposed organisation, and OTP/mandate terminal coverage. U2, live readiness, and L1 evidence must be read-only, post-staging, and no older than 15 minutes; `LEGAL_DOCUMENT_PHASE_U3_MAX_EVIDENCE_AGE_MINUTES` may set a whole-number window from 1 to 60 minutes. U3 never changes the allowlist, runtime activation, secrets, or application data.

### Phase V1 accountable next-expansion activation plan

V1 converts the fresh U3 certificate into a short-lived, accountable activation plan without changing effective access. The plan embeds the complete U3 certificate and binds the U2 pending change set, U1 approval, T4 handoff, T1 continuation, Q2 activation, exact environment/project, current cohort, added organisation, proposed cohort, and readiness evidence. The proposed cohort exists only as the future activation target.

```bash
npm run test:legal-documents-phase-v1
npm run plan:legal-documents:phase-v1 -- \
  --planned-by=ACCOUNTABLE_ACTIVATION_PLANNER \
  --reference=ACTIVATION_OR_CHANGE_REFERENCE \
  --confirm-certification-digest=U3_CERTIFICATION_DIGEST \
  --confirm-pending-digest=U2_PENDING_DIGEST \
  --confirm-approval-digest=U1_APPROVAL_DIGEST \
  --confirm-activation-digest=Q2_ACTIVATION_DIGEST \
  --confirm-environment=production \
  --confirm-project-ref=CONFIRMED_PROJECT_REF \
  --confirm-current-organisation-ids=CURRENT_COHORT_IDS \
  --confirm-proposed-organisation-ids=PROPOSED_COHORT_IDS \
  --confirm-added-organisation-id=ADDED_ID
npm run verify:legal-documents:phase-v1
```

Planning is a dry run unless `LEGAL_DOCUMENT_PHASE_V1_WRITE=true` and `--apply` are supplied. `READY_FOR_V2` requires a current U3 decision, valid embedded certificate and plan digests, complete evidence bindings, an unexpired window, exact active-current/future-proposed targets, and proof that effective access, runtime activation, and secrets did not change. One U3 certificate can create only one plan. V1 writes only its plan record.

### Phase V2 guarded next-expansion activation

V2 is the first phase in this cycle that exposes the U3-certified organisation. It requires a live `READY_FOR_V2` plan, exact U1/U2/U3/T1/Q2 evidence bindings, and the current cohort to remain aligned across effective, release-approved, repository-activated, and runtime state. The operator updates the runtime allowlist first, verifies the returned secret digests, and then persists the expanded pilot plus a new V2 activation receipt. Any secret or persistence failure restores the previous cohort.

```bash
npm run test:legal-documents-phase-v2
npm run activate:legal-documents:phase-v2 -- \
  --activated-by=ACCOUNTABLE_ACTIVATION_OPERATOR \
  --reference=ACTIVATION_OR_CHANGE_REFERENCE \
  --confirm-plan-digest=V1_PLAN_DIGEST \
  --confirm-certification-digest=U3_CERTIFICATION_DIGEST \
  --confirm-previous-activation-digest=Q2_ACTIVATION_DIGEST \
  --confirm-environment=production \
  --confirm-project-ref=CONFIRMED_PROJECT_REF \
  --confirm-current-organisation-ids=CURRENT_COHORT_IDS \
  --confirm-proposed-organisation-ids=PROPOSED_COHORT_IDS \
  --confirm-added-organisation-id=ADDED_ID
npm run verify:legal-documents:phase-v2
```

Activation is a dry run unless `LEGAL_DOCUMENT_PHASE_V2_WRITE=true` and `--apply` are supplied. `READY_FOR_V3` requires the effective, release-approved, repository-activated, receipt, and runtime-secret cohorts to match the exact V1 target. V2 preserves the original U1 approver and binds the activation to the previous Q2 cohort. One V1 plan can be activated only once.

### Phase V3 post-activation verification

V3 independently accepts or rejects the live cohort after V2. It revalidates the V2 receipt digest and repository binding, reruns A3 runtime-secret and complete release-gate verification, and directly checks every activated organisation for active-agency status, active agents, usable published OTP and mandate templates, and a preferred transfer attorney. The direct readiness check is compatible with an active rollout and does not reuse the prelaunch-only A1 guard.

```bash
npm run test:legal-documents-phase-v3
npm run verify:legal-documents:phase-v3
```

`READY_FOR_V4` emits a digest-bound verification tied to the exact V2 activation and its complete V1/U3/U2/U1/T4/T1/Q2 chain. V2, A3, and cohort evidence must be read-only, generated after activation, and no older than 15 minutes; `LEGAL_DOCUMENT_PHASE_V3_MAX_EVIDENCE_AGE_MINUTES` may set a whole-number window from 1 through 60. V3 never changes configuration, secrets, or application data.

### Phase V4 post-activation integrity handoff

V4 seals the current V3 verification into a short-lived, digest-bound handoff for fresh release authority. It preserves the full V3 evidence, rebinds every V2-through-Q2 source digest, and rechecks the effective, release-approved, repository-activated, receipt-bound cohort and target. Runtime and readiness assurances must remain complete for every activated organisation.

```bash
npm run test:legal-documents-phase-v4
npm run verify:legal-documents:phase-v4
```

`READY_FOR_W1` requires a current `READY_FOR_V4` verification, exact V2 receipt and repository binding, complete runtime and cohort assurance, valid V3/V4 digests, and an unexpired handoff. The window defaults to 15 minutes and can be configured from 1 through 60 minutes with `LEGAL_DOCUMENT_PHASE_V4_MAX_VERIFICATION_AGE_MINUTES`. V4 is read-only and never changes configuration, secrets, or application data.

### Phase B1 immutable review freeze

B1 freezes every OTP and mandate template routable to the pilot cohort before counsel review. The manifest records the exact template ID, version, organisation scope, storage object digest, structured-section digest, and combined content digest. Approval metadata and volatile render-validation timestamps are excluded from the content fingerprint.

```bash
npm run freeze:legal-documents:phase-b1
npm run verify:legal-documents:phase-b1
```

Review the generated output before deliberately updating `config/legal-document-review-manifest.json` through source control. A2 now fails when a frozen template changes, disappears, becomes unreadable, or when a new routable template has not been included in the review set.

Current B1 evidence confirms the OTP source is readable. Both routable mandate records point to `documents/templates/mandates/seller-mandate-v1.docx`, which is currently absent. Restore the exact previously reviewed object, or publish a new version and regenerate the manifest; do not approve the section-only fingerprint as if the missing DOCX had been reviewed.

### Phase B2 accountable counsel review

B2 turns the frozen B1 manifest into an accountable legal decision register. It does not infer or manufacture approval. First generate the review dossier:

```bash
npm run prepare:legal-documents:phase-b2
```

For each readable frozen template, counsel reviews the exact source and supplies a decision, identity, timestamp, evidence reference, and confirmation of the B1 content digest. The recorder is dry-run by default:

```bash
npm run record:legal-documents:phase-b2 -- \
  --template-id=<uuid> \
  --decision=<approved|changes_requested|rejected> \
  --reviewed-by=<accountable-counsel> \
  --reviewed-at=<ISO-timestamp> \
  --reference=<legal-review-evidence-reference> \
  --confirm-content-digest=<sha256:digest-from-b1-manifest>
```

Apply only with `LEGAL_DOCUMENT_COUNSEL_REVIEW_WRITE=true`, `--apply`, and `--confirm-project-ref=<exact-ref>`. Then run:

```bash
npm run verify:legal-documents:phase-b2
```

`READY_FOR_B3` requires B1 to be fully frozen and readable, an `approved` decision for every routable template, exact digest matches, and complete accountable review evidence. A request for changes or rejection blocks runtime approval and requires a new template version followed by a fresh B1/B2 cycle.

The approval operator is dry-run by default. Its reference, approval time, and approver identity must exactly match the approved B2 decision. Engineering must not invent or substitute these values. Applied approval also requires the operator to confirm the exact B1 content digest.

```bash
npm run approve:legal-document-template -- \
  --template-id=<uuid> \
  --reference=<counsel-reference> \
  --approved-at=<ISO-timestamp> \
  --approved-by=<identity> \
  --confirm-content-digest=<sha256:digest-from-b1-manifest>
```

Apply only with `LEGAL_TEMPLATE_APPROVAL_WRITE=true`, `--apply`, and `--confirm-project-ref=<exact-ref>`.

### Phase B3 atomic runtime promotion

B3 promotes the complete B2 decision set into enforceable runtime approval metadata as one database transaction. It locks every target template, requires every route to remain active and published, binds the approval to the exact B1 content and B2 evidence digests, and writes an explicit audit event. A failure on any template rolls back the entire batch.

Deploy `202607170016_legal_document_counsel_approval_b3.sql` before applying. The operator is a non-mutating dry run by default:

```bash
npm run apply:legal-documents:phase-b3
```

Once B2 reports `READY_FOR_B3`, apply the exact frozen set with accountable operator evidence:

```bash
LEGAL_DOCUMENT_PHASE_B3_WRITE=true npm run apply:legal-documents:phase-b3 -- \
  --confirm-project-ref=<exact-project-ref> \
  --confirm-b1-manifest-digest=<exact-B1-manifest-digest> \
  --confirm-template-ids=<comma-separated-frozen-template-ids> \
  --applied-by=<accountable-operator> \
  --reference=<change-ticket-or-evidence-reference> \
  --apply

npm run verify:legal-documents:phase-b3
```

`READY_FOR_RELEASE_GATES` requires exact runtime metadata and an explicit B3 audit event for every frozen template. A2 includes this verifier, so counsel decisions that have not been promoted cannot reach A3.

## Pilot release

The production pilot is deliberately disabled in `config/legal-document-pilot.json`. Phase A1 records proposed organisations under `cohortPreparation.candidateOrganisationIds`; candidates are not production-approved merely because they appear there. The effective `organisationIds` allowlist remains empty until every candidate passes active-agent, OTP/mandate-template, and preferred transfer-attorney checks.

Run the read-only A1 check against canonical staging:

```bash
npm run verify:legal-documents:phase4-cohort
```

The initial candidate is Kingstons Real Estate (`ec19d0a6-bcba-4eef-aa72-9972de88204d`). It has active agents and usable OTP/mandate routes. At the time A1 was prepared, it did not have a preferred transfer attorney: Young Law was connected as `approved`, and Tuckers was onboarded separately but not connected to the agency. Choose the intended firm and mark that accepted relationship preferred before copying the candidate UUID into `organisationIds`.

## Phase A2 release preparation

A2 is a read-only, fail-closed release decision. It checks A1 cohort readiness, independent legal approval for every published template route available to the cohort, the completed controlled OTP and final signed artifact, the negative approval-lock smoke, and 24-hour monitoring. It also requires an accountable approver, timestamp, evidence reference, and exact agreement between `releasePreparation.organisationIds` and the effective `organisationIds` allowlist.

```bash
npm run verify:legal-documents:phase-a2
```

Do not invent approval metadata. After A1 reports `READY`, counsel has approved every routable OTP and mandate template, and all technical checks pass:

1. Copy only `readyOrganisationIds` into both `releasePreparation.organisationIds` and `organisationIds`.
2. Record the real `approvedBy`, `approvedAt`, and `approvalReference` values.
3. Set `releasePreparation.status` to `approved` through review.
4. Keep `enabled=false` throughout A2.

The production release boundary now executes A2 automatically. A3 may set `enabled=true` only after A2 reports `READY_FOR_A3`. Then run:

```bash
npm run verify:legal-documents:phase4-release
```

## Phase A3 controlled activation

A3 changes the two Supabase Edge runtime secrets only after a fresh A2 pass. It is dry-run by default and requires the exact approved cohort, target project, accountable activator, release reference, write flag, and explicit `--apply`. Secret values are verified by digest after the change. If verification or the repository config update fails, the activation command restores the runtime kill switch.

Dry-run:

```bash
npm run activate:legal-documents:phase-a3 -- \
  --project-ref=<exact-project-ref>
```

Apply only after the dry-run has no blockers:

```bash
LEGAL_DOCUMENT_PHASE_A3_WRITE=true npm run activate:legal-documents:phase-a3 -- \
  --project-ref=<exact-project-ref> \
  --confirm-project-ref=<exact-project-ref> \
  --confirm-organisation-ids=<approved-uuid-list> \
  --activated-by=<accountable-person> \
  --reference=<release-ticket-or-evidence-reference> \
  --apply
```

Immediately verify runtime secrets and the complete release gate:

```bash
npm run verify:legal-documents:phase-a3
```

Emergency runtime deactivation is independent of template revocation and should be the first incident action:

```bash
LEGAL_DOCUMENT_PHASE_A3_WRITE=true npm run deactivate:legal-documents:phase-a3 -- \
  --project-ref=<exact-project-ref> \
  --confirm-project-ref=<exact-project-ref> \
  --reason=<incident-reason> \
  --deactivated-by=<accountable-person> \
  --reference=<incident-ticket> \
  --apply
```

If legal approval itself is compromised, follow runtime deactivation with the template-approval rollback below.

`GO` requires the Phase 3 artifact gate, healthy 24-hour monitoring, legal approvals, an enabled bounded cohort, and no stale signing packets.

## Monitoring and rollback

```bash
npm run verify:legal-documents:phase4-monitor
npm run rollback:legal-documents:phase4 -- --template-ids=<otp-id>,<mandate-id> --reason=<incident>
```

Rollback is dry-run by default. Applying it requires `LEGAL_DOCUMENT_ROLLBACK_WRITE=true`, `--apply`, and exact project confirmation. It revokes template approval, which makes both client and Edge generation fail closed immediately while preserving existing signed artifacts.

## Production boundary

Production deployment is permitted only after the Phase 4 gate reports `GO`. After promotion, perform one controlled OTP and one controlled SalesMandate flow, scan runtime errors, and keep the pilot within the configured cohort.
