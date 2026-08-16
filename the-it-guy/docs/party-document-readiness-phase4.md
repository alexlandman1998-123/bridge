# Party Document Readiness - Phase 4

Date: 2026-08-15

Purpose: prevent transaction parties and document gates from being simplified
too early after accepted-offer conversion.

## Implemented Guardrails

- Additional buyers, buyer spouses, seller spouses, foreign buyers, company
  directors, company signatories, trustees, and entity signatories are preserved
  as distinct participant requirements.
- The persisted participant bootstrap still creates only the rows the current
  transaction participant table can safely represent.
- Special parties remain visible in `transaction_participant_requirements`
  instead of being collapsed into a single `buyer_id` or seller participant.
- Transaction routing profiles expose special-party flags for multi-buyer,
  spouse-consent, foreign-buyer, and seller-spouse scenarios.
- Document bootstrap now creates dedicated FICA, consent, authority, director,
  trustee, proof-of-funds, bond-preapproval, and cancellation evidence
  requirements for those scenarios.
- Transaction document roster completion requires upload evidence for FICA,
  authority, proof-of-funds, title, bond, director, trustee, and spouse-consent
  requirements. A verified status alone is not enough.

## Release Check

Run:

```bash
node scripts/party-document-readiness-phase4.test.mjs
node scripts/mvp-document-roster.test.mjs
node src/core/transactions/__tests__/mvpTransactionParticipantBootstrap.test.js
node src/core/transactions/__tests__/mvpTransactionDocumentBootstrap.test.js
```

Phase 4 does not change the transaction participant table shape. A later schema
phase can promote requirement-only special parties into first-class participant
rows once participant identity supports multiple buyer/seller-side client roles.
