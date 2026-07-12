# Bond Originator Phase 3 Launch Gate

Implemented on 2026-07-12.

## Goal

Create one release gate for the bond-originator module so external bank, buyer-document, grant, and attorney handoff delays remain visible and recoverable. This phase does not pretend external systems can be automated without integrations; it makes the platform-side safety net testable before release.

## Implemented

| Phase | Gate coverage |
| --- | --- |
| Phase 0 stuck-file sweep | Local fixture coverage for orphaned `READY_FOR_REVIEW` rows, accepted files still in intake, invalid workflow/application/quote statuses, stale bank feedback waits, stale additional-document waits, missing grant evidence, and instruction-sent files without attorney handoff evidence. |
| Phase 1 operational queue contract | Active bond files must resolve into a visible canonical queue or a deliberate terminal/irrelevant hidden state. External waits are explicit queue keys rather than stage-only assumptions. |
| Phase 2 diagnostics and dashboard surfacing | Diagnostics, remediation links, dashboard labels, HQ attention counts, and queue panel labels use the same canonical queue contract as operations. |
| Strict staging evidence | The read-only stuck-file sweep can be required with `--require-staging-sweep` before production release. |

## Canonical Active Queues

| Queue key | Practical wait |
| --- | --- |
| `new_applications` | Intake is ready for review or ready to start. |
| `awaiting_bank_feedback` | Application has been submitted or is under bank review without captured feedback. |
| `additional_documents_required` | Bank has requested additional documents and no buyer re-upload evidence is present yet. |
| `awaiting_buyer_reupload` | Additional documents are required and the buyer re-upload path is already active. |
| `awaiting_grant_document` | Bond is approved or grant-received stage is used but the grant document is not attached. |
| `awaiting_signed_grant` | Grant document exists but the buyer-signed grant is not attached/submitted. |
| `instruction_sent_awaiting_attorney_acceptance` | Instruction evidence exists but the bond attorney handoff/acceptance evidence is missing. |
| `active_review_required` | The file is bond-operationally relevant but does not fit a known canonical wait state and must be reviewed rather than hidden. |

## Commands

Local Phase 3 gate:

```bash
npm run verify:bond-originator-phase3-launch-gate
```

Static contract only:

```bash
node scripts/bond-originator-phase3-launch-gate.mjs --static-only
```

Strict staging sweep before release:

```bash
node scripts/bond-originator-phase3-launch-gate.mjs --require-staging-sweep
```

Strict staging sweep that also fails on warnings:

```bash
node scripts/bond-originator-phase3-launch-gate.mjs --require-staging-sweep --fail-sweep-on-warning
```

## Acceptance

- [x] Phase 0 stuck-file sweep is included in the aggregate gate.
- [x] Phase 1 operational queue contract tests are included in the aggregate gate.
- [x] Phase 2 diagnostics/dashboard tests are included in the aggregate gate.
- [x] Canonical external waits are locked by static checks across service and UI files.
- [x] Strict staging sweep is available as an explicit release mode.
- [x] Launch readiness documentation points to the Phase 3 gate and strict staging command.

## Remaining Release Control

The local gate proves the code contract. Production release should still run the strict read-only staging sweep against live staging data because external bank and attorney delays can only be detected automatically when the platform has current rows or integrations for those systems. Phase 4 owns the strict staging evidence and release metadata.

Decision: GO TO STAGING SWEEP BEFORE RELEASE.
