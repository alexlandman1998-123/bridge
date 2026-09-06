# API-split Phase 4: document-domain extraction

The first document-domain function, `generateOtpDocumentFromTemplate`, now lives in `src/domains/documents/api.js`. `src/lib/api.js` re-exports the same function, so callers retain their public contract.

`updateDocumentClientVisibility` has also moved its database write and schema fallback into the document domain. The legacy facade injects its configured client and transaction-event recorder, preserving the existing public function and audit event.

This deliberately starts with the retired legacy OTP renderer because its input and error contract are deterministic. The next document extraction must add an equivalent behaviour test before moving any upload, signing, canonical-requirement, or audit-event workflow.

Verify with:

```sh
node scripts/api-split-phase4-documents.test.mjs
node scripts/api-split-phase1-inventory.test.mjs
node scripts/api-split-phase2-boundaries.test.mjs
```
