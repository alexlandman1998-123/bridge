# Document Generator Simple Signing Phase 7

## Scope

Phase 7 is the post-promotion live observation gate for the simplified signer UI.

The production target remains `https://app.arch9.co.za`, backed by Supabase project `isdowlnollckzvltkasn`, with the signer route remaining `/sign/:token`.

## Observation Gate

Run the non-mutating production observer only after `npm run test:document-generator-simple-signing-phase6` passes and the frontend has been promoted:

```bash
node --env-file-if-exists=.env.production.local scripts/document-generator-simple-signing-phase7-live-observation.mjs --live --write
```

The live observer requires `SIMPLE_SIGNING_PHASE7_CONTROLLED_TOKEN` or `--token=<controlled-token>`. The token must be a controlled signer token, not a normal customer token supplied for support troubleshooting.

The report writes to `test-results/document-generator-simple-signing-phase7/live-observation-report.json` by default and redacts the token as `/sign/[redacted-token]`.

## Runtime Boundary

Phase 7 is read-only observation. It opens the production signer route and allows only the normal `resolve-signer-token` read needed to render the page.

It does not invoke `signer-signing-action`, does not save signature assets, does not apply signature fields, does not complete signing, does not send real customer emails, does not invoke `dispatch-final-signed-document`, does not invoke `resolve-final-signed-document-access`, does not generate final artifacts, and does not change completion truth or signing-token authority.

## What It Verifies

The observer verifies that the production release manifest is reachable, the simplified shell renders on production, the progress, document, action, help, and secure footer regions are visible, the old multi-card signer UI regions are absent, and the page has no material horizontal overflow.

This verifies the shared signer route used by generated mandate and OTP documents. It is not a new document-generator backend test and it does not broaden the generated-document scope beyond mandate and OTP.

## Rollback

If Phase 7 blocks after promotion, rollback remains to redeploy the previous production frontend artifact. No database rollback, Edge Function rollback, email-provider rollback, or storage rollback is expected for this phase.

## Acceptance

Phase 7 is ready when the manifest binds the live observation target, the guard proves Phase 6 is still the required gate, the live observer is token-redacting and read-only, and the rollback path remains explicit.
