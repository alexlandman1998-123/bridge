# Document Generator Simple Signing Phase 4

## Scope

Phase 4 adds browser-level smoke coverage for the wired simplified signer route.

The smoke starts a local Vite server, opens `/sign/:token` in Playwright, and intercepts the same Supabase Edge Function URLs used by the real signer portal. This validates the routed UI, model, shell, capture modal, signer action handlers, and finish confirmation without touching live signing data.

## Coverage

The browser smoke covers both generated document types in this simple signing rollout:

- `mandate` seller signing on a mobile viewport
- `otp` purchaser signing on a desktop viewport

The mobile mandate scenario walks the full simplified path from sign state to signature capture, mocked asset save, mocked field apply, finish state, commit confirmation, mocked completion, and completed state.

The OTP scenario verifies the same routed shell and document copy for a purchaser document type without mandate-only assumptions.

## Safety Boundary

The smoke uses mocked Edge Function responses. It does not call production Supabase, does not send real emails, does not generate final artifacts, does not change completion truth, does not change token authority, and does not write storage.

Screenshots are written to `test-results/document-generator-simple-signing-phase4/` as local evidence only.

## Acceptance

Phase 4 is ready when the browser smoke proves the simplified shell is visible on the real signer route, old signer UI cards are absent, mobile and desktop layouts avoid horizontal overflow, signature capture reaches the existing signing action handlers, and the Phase 0-4 test script passes.
