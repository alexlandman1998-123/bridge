# Legal Document Generator - Phase 3 Launch Hardening

Phase 3 converts the technically complete OTP signing flow into a controlled release candidate.

## Implemented

- Required signature assets are downloaded from controlled storage during OTP finalisation.
- PNG and JPEG signature marks are decoded and embedded visibly on the final signature page.
- Transparent PNG marks are composited onto a white background for stable PDF rendering.
- Every embedded asset receives a SHA-256 fingerprint in the PDF and packet audit event.
- Finalisation fails closed with `SIGNATURE_ASSET_EMBED_FAILED`; audit-only PDFs are not accepted.
- Structured start, completion, embedding-failure, and finalisation-failure logs include request, packet, duration, evidence mode, embedded count, and output size without signer PII.
- The read-only Phase 3 launch gate verifies templates, legal approval metadata, completed visual signature evidence, readable PDF storage, and partial acceptance packets.

## Release Gate

Run:

```bash
npm run verify:legal-documents:phase3-launch-readiness
```

`GO` requires both OTP and at least one SalesMandate template to contain independently supplied legal approval metadata:

- `legal_review_status: approved`
- `legal_approved_at: <ISO timestamp>`
- `legal_approval_reference: <counsel or approval reference>`

The engineering workflow must not manufacture these values. Until counsel supplies them, the gate intentionally returns `NO_GO`.

Production deployment and domain promotion are explicitly outside this implementation and require a separate go-live instruction.
