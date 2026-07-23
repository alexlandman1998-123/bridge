# Legal Document Generator - Phase 3 Launch Hardening

Phase 3 converts the technically complete OTP signing flow into a controlled release candidate.

## Canonical path

Phase 0 and Phase 2 retired `generate-final-signed-otp`: it reconstructed an
OTP instead of finalising the reviewed document. Phase 3 applies only to
`generate-final-signed-document`, which overlays evidence on the exact
D1/D2/D3-certified PDF and records the generic
`final_signed_document_generated` event. The retired endpoint must remain
unavailable.

## Implemented

- Required signature assets are downloaded from controlled storage during OTP finalisation.
- PNG and JPEG signature marks are decoded and embedded visibly on the final signature page.
- Transparent PNG marks are composited onto a white background for stable PDF rendering.
- Every embedded asset receives a SHA-256 fingerprint in the PDF and packet audit event.
- Finalisation fails closed with `SIGNATURE_ASSET_EMBED_FAILED`; audit-only PDFs are not accepted.
- Structured start, completion, embedding-failure, and finalisation-failure logs include request, packet, duration, evidence mode, embedded count, and output size without signer PII.
- The Phase 3 evidence is also persisted on the immutable F2 final-artifact
  record; the matching canonical finalisation event cannot later be edited or
  deleted.
- The supporting `documents` row remains internal until the F2 transaction
  succeeds. A rejected or ambiguous F2 call never exposes an unsigned/partial
  final document; an ambiguous F2 result is retained privately for retry and
  reconciliation rather than risk deleting a still-committing artifact.
- The watchdog treats a private `final_signed_pending` document older than ten
  minutes as a publication/reconciliation alert, so retained ambiguity cannot
  silently accumulate.
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

Deploy the canonical finaliser before migration
`202607220006_phase3_visual_signature_evidence.sql`: the previous F2 function
ignores the additional payload fields, while the new migration intentionally
rejects any finalisation that lacks them.
