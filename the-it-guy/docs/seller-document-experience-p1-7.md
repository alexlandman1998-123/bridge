# Seller document experience — P1-7

P1-7 makes the P0 automation legible and truthful in the seller portal and agent listing workspace.

## Non-negotiable status semantics

- **Action needed**: required, requested, rejected, or expired. Rejections show the reason and request a corrected upload.
- **Received**: uploaded or under review. Receipt is not completion.
- **Approved**: approved, completed, verified, or signed. Only this bucket advances assurance completion.
- **Transfer handoff**: shown only when transaction or promotion evidence exists. A failed or pending promotion is not described as attorney-ready.

The dashboard percentage is the approved percentage. A separate received percentage shows collection progress without overstating legal or operational readiness.

## Automatic sequence presentation

Every applicable requirement is assigned to its earliest operational stage:

1. Before mandate
2. Before listing
3. Before accepting an offer
4. Transfer handoff
5. Before lodgement

The seller sees the next concrete action, due/overdue state, rejection reason, and review state. The agent sees the same requirement identities plus seller-action, review-queue, rejection, and handoff counts.

Requirements and uploads are linked by canonical requirement ID first and exact requirement key second. If both sides provide conflicting requirement IDs, a matching filename, category, or key cannot silently satisfy the wrong requirement.

## Verification

```bash
npm run test:seller-document-experience-p1-7
npm run verify:seller-document-automation
```

P1-7 is application/read-model work and adds no database migration. It consumes the request, assurance, operations, and continuity evidence introduced by P0-1 through P0-6.
