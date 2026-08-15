# Buyer Process Phase 6 Release Readiness

Date: 2026-08-14

## Purpose

Phase 6 is the controlled release-readiness evidence gate for the refined buyer
process. The local contracts prove the stage model, onboarding/OTP split,
transaction setup actions, reporting, migration, and transaction handoff. Phase 6
records whether an authorised staging or production-shadow run proved the same
behaviour without mixing the global process and the Kingstons manual OTP process.

This phase is non-mutating by default. It does not send buyer onboarding links,
upload OTPs, allocate roleplayers, send bond applications, send transfer
instructions, open buyer portal links, or move a buyer to Transaction. It only
validates a redacted evidence file created by a manual run.

## Command

For local contract validation:

```bash
npm run test:buyer-process-release-readiness-phase6
```

For the guarded release gate after manual QA evidence has been collected:

```bash
npm run verify:buyer-process-release-readiness -- --evidence=private-evidence/buyer-process-phase6-release-readiness.json
```

The guarded command first reruns the global buyer diagnostic, then requires the
evidence file.

## Evidence Rules

Start from:

```text
docs/buyer-process-phase6-release-readiness.template.json
```

The evidence must be redacted. It must not contain emails, phone numbers,
onboarding tokens, buyer portal tokens, signed URLs, document bytes, raw buyer
profile facts, client names, property addresses, OTP file names from real
clients, provider logs, or roleplayer contact details.

Use opaque references only, for example `buyer-lead-ref-001`,
`transaction-ref-004`, `handoff-row-002`, or a ticket/reference digest.

The operator confirmation phrase must be exactly:

```text
BUYER_PROCESS_PHASE6_REDACTED_RELEASE_EVIDENCE
```

## Required Proof

The evidence must prove:

- global diagnostic passed against the same source state
- production build passed
- global buyer process uses Captured, Contacted, Qualification, Viewing,
  Transaction Setup, Offer, Transaction
- Kingstons buyer process uses Captured, Contacted, Qualification, Viewing,
  Offer, Transaction Setup, Transaction
- global buyer process has no buyer OTP generation action
- Kingstons buyer process remains manual OTP only
- signed OTP upload requires signed-by-all-parties confirmation
- signed OTP upload requires Arch9 terms confirmation
- Transaction Setup captures or receives buyer profile details
- bond originator handoff is queued or marked not required based on finance route
- transfer attorney instruction is queued or recorded
- global buyer onboarding link can be sent from Transaction Setup
- Kingstons buyer portal/instructions are recorded manually instead of link-first
- buyer cannot move to Transaction until signed OTP and Transaction Setup are
  complete
- transaction detail shows the Buyer Process Handoff panel
- converted buyer lead keeps a persisted converted transaction id
- offer-to-transaction scenario matrix still passes

## Stop Conditions

Stop the release run immediately if:

- a global buyer lead shows Kingstons manual OTP-only behaviour
- a Kingstons buyer lead exposes global onboarding as the primary path before
  signed OTP upload
- any global buyer surface exposes Generate OTP or OTP generation copy
- signed OTP upload saves without both confirmations
- Transaction Setup can be finalized without buyer profile and role-player
  handoff evidence
- Move to Transaction succeeds without signed OTP evidence
- the Buyer Process Handoff panel is missing from transaction detail
- converted lead evidence cannot be recovered after refresh
- evidence collection requires recording private buyer, seller, property,
  portal, OTP, or provider data
