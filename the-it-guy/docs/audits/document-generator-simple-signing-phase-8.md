# Document Generator Simple Signing Phase 8

## Scope

Phase 8 is the operational go/no-go handover for the simplified signer UI.

It consumes a redacted Phase 7 live observation report and returns one fail-closed decision: `keep_live` or `rollback_or_investigate_signer_route`.

## Handover Gate

Run the full production observation and handover gate from the app package:

```bash
npm run verify:document-generator-simple-signing:production
```

That command refreshes Phase 7 using `SIMPLE_SIGNING_PHASE7_CONTROLLED_TOKEN` and then writes the Phase 8 handover decision.

For local contract verification without a production token, run:

```bash
npm run test:document-generator-simple-signing-phase8
```

## Runtime Boundary

Phase 8 does not sign documents, does not invoke `signer-signing-action`, does not save signature assets, does not apply fields, does not complete signing, does not send email, does not invoke final-artifact access, does not generate final artifacts, and does not mutate customer data.

The handover decision is based only on the Phase 7 observation report. That report must redact the controlled token, prove the production release manifest was reachable, prove the simple signing shell rendered, prove the required regions were visible, prove old signer UI surfaces were absent, and prove no forbidden production calls occurred.

## Decision

The only passing decision is `keep_live`.

Any missing, stale, blocked, mutating, or non-redacted Phase 7 observation returns `rollback_or_investigate_signer_route`. Preserve the Phase 7 report, do not keep retrying with customer tokens, and use the named blocker to decide whether the issue is a frontend signer-route regression or an operational observation problem.

This is not a document-generator backend release and it does not broaden the generated-document scope beyond mandate and OTP.

## Rollback

If Phase 8 returns `rollback_or_investigate_signer_route`, rollback remains to redeploy the previous production frontend artifact. No database rollback, Edge Function rollback, email-provider rollback, or storage rollback is expected for this phase.

## Acceptance

Phase 8 is ready when the manifest binds the handover inputs, the guard proves Phase 7 is the required pre-handover gate, the decision script fails closed, and the production verification command is available for operators.
