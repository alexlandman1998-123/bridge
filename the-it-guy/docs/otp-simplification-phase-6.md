# OTP simplification — Phase 6

Phase 6 provides the controlled switch from the current live OTP version to the prepared canonical candidate. It does not deploy the migration or activate a candidate automatically.

## Activation requirements

The candidate can become live only when all of the following remain true at the instant of activation:

- the template is a single-master OTP owned by the caller's organisation;
- the requested candidate is still the template's current candidate;
- the current live version is published and the candidate is approved;
- the candidate was based on the current live version;
- the canonical document, runtime and asset contracts are supported;
- the stored DOCX hash matches the asset certified in Phase 5;
- all six Phase 5 reference transactions still pass; and
- a current attorney approval is bound to the exact same template fingerprint.

## Atomic live switch

The database locks the template, live version, candidate and approval in one transaction. It then:

1. supersedes the old published version;
2. publishes the approved candidate;
3. copies the candidate's DOCX storage identity to the generation route;
4. moves the live, candidate and previous-live pointers;
5. records the certification and attorney approval in rollout metadata; and
6. writes a security audit event.

If any check or write fails, the transaction rolls back and the existing live OTP remains unchanged. The previous live version is retained as the explicit rollback anchor.

Legacy section-based templates continue to use their existing publishing path. The Legal Templates activation action dispatches to this atomic operation only for `single_master_document` OTPs.

## Verification

```bash
npm run test:otp-canonical-template-phase6
npm run test:otp-canonical-template-phase5
npm run build
```
