# Document Generator Simple Signing Phase 5

## Scope

Phase 5 is the simple signing release-readiness gate.

It does not add a new signer UI surface. It proves that the already wired simplified signer route is ready for a controlled release by requiring the Phase 0-4 contracts, the Phase 4 browser evidence, and a production build.

## Release Boundary

The release scope remains the generated document types already approved in Phase 0:

- `mandate`
- `otp`

The signer route remains `/sign/:token`, and the runtime source of truth remains the existing signer session, signer action, and final artifact resolver APIs.

## Safety Boundary

Phase 5 does not deploy the application, does not call production Supabase, does not send real customer emails, does not generate final artifacts, does not change completion truth, does not change token authority, and does not write storage.

This gate is not permission to send real customer emails by itself. It is a code and evidence readiness checkpoint for the simplified signer UI.

## Acceptance

Phase 5 is ready when:

- the Phase 0-4 configs and package scripts are present;
- Phase 4 writes a browser smoke report with mandate and OTP evidence;
- screenshots exist for the mobile mandate and desktop OTP checks;
- mocked signer action traces prove signature save, field apply, and completion paths;
- old signer role/action/mobile cards are absent from `SignerPortal`;
- `npm run build` passes before the Phase 5 guard completes.
