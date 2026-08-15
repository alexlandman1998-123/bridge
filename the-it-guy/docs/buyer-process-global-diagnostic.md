# Buyer Process Global Diagnostic

This diagnostic is for the global buyer process only. It must not rely on Kingstons buyer OTP behaviour, Kingstons seller-pack routing, or organisation-name autodetection.

The smoke scope covers:

- send buyer onboarding
- public buyer onboarding plus offer submission
- manual uploads for OTP and offer evidence
- no buyer OTP generation action in the global buyer process
- buyer documents and offer evidence reaching the lead pipeline
- accepted offer conversion into a transaction
- roleplayer handoff triggers for transfer attorney, bond originator, and transaction operations
- listing-to-transaction routing propagation
- Buyer Process Handoff visibility in the transaction workspace
- the release-readiness evidence gate for the global/Kingstons buyer split
- the release decision gate for go/no-go approval after redacted evidence
- the controlled smoke observation gate after a Phase 7 go decision

The diagnostic is non-mutating unless an individual child check explicitly opts into live verification through its own environment flags.

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
