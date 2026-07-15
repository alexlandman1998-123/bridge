# OTP Phase 4: governed runtime assembly

Phase 4 connects the onboarding answers to the generated OTP and verifies that the document contains exactly the clauses those answers require.

## Runtime contract

A template adopts Phase 4 through `metadata_json.otp_runtime_assembly_version`.

For an adopted template, Bridge performs this sequence before generation:

1. Build canonical South African legal deal facts from onboarding and transaction data.
2. Resolve the expected conditional clause-pack keys from those facts.
3. Evaluate every template section's visibility condition using the same generated placeholders.
4. Compare the expected packs with the packs that will actually render.
5. Confirm that every selected pack has attorney-approved, locked wording.
6. Confirm that a standard legal core and signing section will render.

Generation is blocked when:

- a required pack is missing;
- an inactive pack leaks into the document;
- a pack renders more than once;
- selected wording is not approved and locked;
- the captured facts conflict or do not support automated residential-resale assembly;
- the standard legal core is absent; or
- signing is absent.

These errors are legal-governance errors and cannot be bypassed with `forceGenerate`.

## Safe rollout

Legacy templates do not silently adopt Phase 4. They receive assembly warnings while remaining compatible. Saving a governed OTP through Legal Templates records the runtime contract version; the Phase 3 complete review-draft action also records it explicitly.

This allows the agency to prepare and approve a replacement template without changing the live legacy template.

## Audit trail and preview

The generation payload, validation summary and render provenance retain:

- the clause selection key;
- expected and rendered pack keys;
- the runtime contract version;
- readiness status; and
- blocker codes.

The scenario preview shows the same runtime verdict in plain language, including whether Phase 4 enforcement or legacy warning mode is active.

## Verification

```bash
npm run test:otp-runtime-phase4
npm run test:otp-governance-phase3
npm run test:otp-composition-phase2
npm run test:otp-legal-baseline
npm run build
```
