# Buyer Process Global Diagnostic

This diagnostic is for the global buyer process only. It must not rely on Kingstons buyer OTP behaviour, Kingstons seller-pack routing, or organisation-name autodetection.

The smoke scope covers:

- inbound website, portal, and email lead intake; failed or unmatched intake review
- buyer lead assignment, follow-up routing, and requirements capture
- send buyer onboarding
- public buyer onboarding plus offer submission
- manual uploads for OTP and offer evidence
- no buyer OTP generation action in the global buyer process
- buyer documents and offer evidence reaching the lead pipeline
- agent-assisted buyer document upload and canonical document storage
- buyer portal document requests, submitted files, and unavailable-state handling
- accepted offer conversion into a transaction
- roleplayer handoff triggers for transfer attorney, bond originator, and transaction operations
- listing-to-transaction routing propagation
- Buyer Process Handoff visibility in the transaction workspace
- the release-readiness evidence gate for the global/Kingstons buyer split
- the release decision gate for go/no-go approval after redacted evidence
- the controlled smoke observation gate after a Phase 7 go decision

The diagnostic is non-mutating unless an individual child check explicitly opts into live verification through its own environment flags.

Run the local buyer journey diagnostic from `the-it-guy/`:

```bash
npm run test:buyer-process-global-diagnostic
```

This checks the code contracts across intake, routing, onboarding, documents,
conversion, and portal presentation. It does not prove that a real email was
delivered, a file reached storage, or a buyer could complete a live portal session.

## Controlled buyer lead journey

After the local diagnostic passes, an authorised operator can use one isolated
test buyer and one test listing in the chosen environment. Keep only opaque lead,
transaction, and document references in the observation record. The existing
Phase 8 controlled smoke covers the global/Kingstons process split and its
release gates; use that separate gate when the pilot includes those paths.

Record these observations in order:

1. Submit a test enquiry through the chosen inbound source. Confirm one intake
   receipt, one buyer lead, its source/listing context, and assigned agent or
   visible review queue. Check duplicate delivery does not create a second lead.
2. Confirm the acknowledgement and agent notification outcomes, follow-up task,
   and activity timeline. A skipped or failed send must remain visible to staff.
3. Send the buyer onboarding link through the controlled route. Complete the
   public form as the test buyer and confirm the same lead changes to submitted.
4. Request a buyer document. Confirm the buyer sees the request, submits a test
   file, and the agent sees the same canonical document and requirement state.
   Check a missing or failed document read never appears as “Ready.” Record
   separately whether the signed onboarding FICA declaration is filed as a
   canonical document; that filing policy remains an open Phase 3 decision.
5. Accept a test offer and convert the lead. Confirm the transaction retains the
   originating lead and buyer, staged files reconcile once, and unmatched files
   remain explicitly outstanding until reviewed.
6. Open the buyer portal at desktop and phone widths. Confirm journey, document
   request/submission, and next action agree with the agent workspace. Sign out
   or expire the test token and confirm private data is no longer accessible.

Stop the pilot on an incorrect recipient, duplicate lead or document, hidden
notification failure, premature requirement completion, missing transaction
linkage, false portal all-clear, or cross-organisation data exposure. Record the
first failing step and close out the controlled test records through the normal
operator process. No local diagnostic result should be reported as a passed live
journey without these observations.

For controlled release evidence, use:

```bash
npm run verify:buyer-process-release-readiness -- --evidence=private-evidence/buyer-process-phase6-release-readiness.json
```

For the guarded go/no-go release decision, use:

```bash
npm run verify:buyer-process-release-decision -- --phase6-evidence=private-evidence/buyer-process-phase6-release-readiness.json --decision=private-evidence/buyer-process-phase7-release-decision.json
```

For the guarded controlled smoke observation, use:

```bash
npm run verify:buyer-process-controlled-smoke -- --phase6-evidence=private-evidence/buyer-process-phase6-release-readiness.json --decision=private-evidence/buyer-process-phase7-release-decision.json --observation=private-evidence/buyer-process-phase8-controlled-smoke.json
```
