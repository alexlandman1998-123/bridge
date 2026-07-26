# Document Generator Simple Signing Phase 6

## Scope

Phase 6 records the production promotion boundary for the simplified signer UI.

The production target is `https://app.arch9.co.za`, backed by Supabase project `isdowlnollckzvltkasn`, with the signer route remaining `/sign/:token`.

## Promotion Gate

Promotion may proceed only from a clean, committed source tree after:

- `npm run test:document-generator-simple-signing-phase5` passes;
- Phase 4 browser evidence includes mandate and OTP signer portal coverage;
- the production artifact is built from the committed Phase 6 source.

This phase does not deploy the app. Deployment remains a separate operator action.

## Runtime Boundary

Phase 6 is frontend-only for the simplified signing route. It requires no database migrations, no Edge Function changes, no storage changes, and no document generator changes.

It does not send real customer emails, does not alter email dispatch, does not generate final artifacts, does not change completion truth, and does not change signing token authority.

The signer portal continues to use the existing runtime APIs:

- `resolveExternalSignerSession`
- `saveSignerAsset`
- `applySignerField`
- `completeSignerSigning`
- `resolveSignerFinalSignedArtifactAccess`

## Rollback

If production signer route behavior regresses after promotion, rollback is to redeploy the previous production frontend artifact. No database rollback or Edge Function rollback is expected for this phase because Phase 6 introduces neither.

## Acceptance

Phase 6 is ready when the manifest binds the production target, the guard confirms Phase 5 is the required pre-promotion gate, old signer UI surfaces remain absent, no backend promotion is required, and the rollback path is explicit.
