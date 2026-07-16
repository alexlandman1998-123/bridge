# Legal Document Generator - Phase 4 Controlled Launch

Phase 4 adds the enforceable go-live boundary around OTP and SalesMandate generation.

## Runtime controls

- The app blocks generation before invoking an Edge Function when the selected template is not published, active, and independently approved.
- `generate-otp` and `generate-mandate` repeat the check server-side using the database template row.
- Edge Functions require an authenticated caller and reject approved-template ID/source substitutions.
- Edge Functions also require `LEGAL_DOCUMENT_PILOT_ENABLED=true` and an organisation ID listed in `LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS`.
- `forceGenerate` does not bypass legal approval.
- Approval, source-mismatch, start, completion, and failure outcomes use structured logs without signer personal data.

## Recording genuine approval

The approval operator is dry-run by default. Counsel supplies the reference, approval time, and approver identity. Engineering must not invent these values.

```bash
npm run approve:legal-document-template -- \
  --template-id=<uuid> \
  --reference=<counsel-reference> \
  --approved-at=<ISO-timestamp> \
  --approved-by=<identity>
```

Apply only with `LEGAL_TEMPLATE_APPROVAL_WRITE=true`, `--apply`, and `--confirm-project-ref=<exact-ref>`.

## Pilot release

The production pilot is deliberately disabled in `config/legal-document-pilot.json`. After both approvals are recorded, add no more than five explicitly approved organisation IDs and set `enabled` to `true`. Then run:

```bash
npm run verify:legal-documents:phase4-release
```

`GO` requires the Phase 3 artifact gate, healthy 24-hour monitoring, legal approvals, an enabled bounded cohort, and no stale signing packets.

## Monitoring and rollback

```bash
npm run verify:legal-documents:phase4-monitor
npm run rollback:legal-documents:phase4 -- --template-ids=<otp-id>,<mandate-id> --reason=<incident>
```

Rollback is dry-run by default. Applying it requires `LEGAL_DOCUMENT_ROLLBACK_WRITE=true`, `--apply`, and exact project confirmation. It revokes template approval, which makes both client and Edge generation fail closed immediately while preserving existing signed artifacts.

## Production boundary

Production deployment is permitted only after the Phase 4 gate reports `GO`. After promotion, perform one controlled OTP and one controlled SalesMandate flow, scan runtime errors, and keep the pilot within the configured cohort.
