# OTP simplification — Phase 5

Phase 5 certifies the prepared single-document OTP against six reference transactions before it can become a rollout candidate. It does not alter or activate the current live OTP.

## What is certified

1. An individual cash purchase.
2. Married joint purchasers using bond finance.
3. A company purchaser using bond finance.
4. A trust purchaser using cash.
5. A linked-property sale with early occupation.
6. An exceptional condition using attorney-approved wording.

These cases prove the practical distinctions that matter in the current form: purchaser identity, marital position, finance, linked-sale and occupation details, and the two attorney-controlled legal-text regions. Company and trust classifications never select marital wording.

Every case uses the same 15-page canonical DOCX and the same 118-token Phase 4 runtime binder. Phase 5 is therefore a certification of data placement, not a second clause-building system.

## Stale-result protection

The saved certification is bound to the document model, canonical contract, runtime binder, asset version, storage identity, and SHA-256 hashes of the DOCX and field manifest. Replacing or relocating the candidate invalidates the saved result and requires the matrix to run again.

Legacy section-and-clause-pack templates retain their existing reference matrix. Only `single_master_document` OTPs use this simplified certification.

## Verification

```bash
npm run test:otp-canonical-template-phase5
npm run test:otp-canonical-template-phase4
npm run build
```
