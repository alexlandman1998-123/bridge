# Conveyancer manual evidence register — G3

G3 makes the A–F conveyancing workflows operable before external providers are integrated. Bank, SARS, municipality, levy, trust and Deeds evidence can be captured manually and later supplied through integrations without creating two legal-evidence models.

## Delivered

- A canonical evidence vocabulary covering attorney and bank instructions, bond approvals, cancellation figures, guarantees, transfer duty, municipal and levy clearance, signing, trust, payment, Deeds and provider-exception evidence.
- Immutable evidence entries bound to the G1 organisation, firm, branch, team, matter, lane, actor, policy and authority contracts.
- G2 information-resource classifications for every evidence entry.
- Manual document upload and integrated-source capture using the same evidence envelope.
- Issuing organisation, external reference, effective, received and expiry dates.
- Type-specific evidence quality, completeness, required-field and date checks.
- Captured, under-review, accepted, rejected, superseded, withdrawn and expired lifecycle states.
- Independent authorised human review before acceptance.
- Explicit replacement and supersession lineage.
- Exact-document and issuer/reference duplicate detection with human resolution rather than automatic merging.
- A prioritised attorney-review queue for expired, incomplete and reviewable evidence.
- OCR and AI extraction proposals that cannot accept or approve evidence.
- A source-neutral approved evidence projection and equivalence key.
- Common G1 audit events for evidence lifecycle decisions.

## Manual/integration equivalence

The source describes how evidence arrived; it does not change what approved evidence means. Manual uploads and provider events retain their source provenance, pass through the same quality and independent-review controls, and project to the same canonical contract after acceptance.

An integration may propose or capture evidence. It cannot accept its own evidence, approve legal work, change a provider outcome or bypass attorney review.

## Boundary

G3 is the executable evidence domain contract. It does not upload files, persist records, install RLS, call OCR, contact providers or mutate A–F workflow readiness. Those layers consume the G3 result and remain subject to G1 authority and G2 database enforcement.

Run G1–G3 together:

```sh
npm run test:conveyancer-practice-g3
```

G3 adds no database migration.
