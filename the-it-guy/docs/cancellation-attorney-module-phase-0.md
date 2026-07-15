# Cancellation attorney module - Phase 0 scope lock

Phase 0 turns the cancellation-attorney audit into a controlled baseline. It does not add runtime generation, integrations, migrations, production writes or legal wording changes.

The executable source is `src/core/transactions/cancellationAttorneyModulePhase0.js`.

## Responsibility boundary

The cancellation attorney is appointed by the existing lending bank and owns the seller existing-bond cancellation from lender instruction through cancellation registration, settlement proof and close-out.

The module may help with existing-bond intake, cancellation bank and account references, 90-day notice status, cancellation figures, guarantee requirements, bank cancellation documents, seller signing, simultaneous lodgement readiness, registration evidence, settlement reconciliation and close-out.

The cancellation lane does not own transfer document preparation, buyer bond approval, new bond registration, rates or levy clearance, Deeds Office or bank portal decisions, approved legal wording without firm or bank template governance, or payment execution by an external bank.

## First pilot scope

The first pilot is deliberately narrow:

- Single existing-lender cancellation instruction.
- Individual seller.
- Freehold residential resale.
- Ordinary home-loan account reference.
- Manual cancellation figures capture.
- Manual guarantee and registration evidence upload.
- Manual settlement proof capture.

Held for later phases: company, trust or deceased-estate sellers; sectional-title or HOA-specific cancellation dependencies; commercial or VAT transactions; multiple existing bonds or substituted security; development-sale cancellation packs; automated lender or Deeds Office integrations; and final discharge/cancellation instruments without approved firm and bank templates.

## Document generator boundary

Phase 0 separates cancellation documents into three categories:

| Category | Phase | Examples | Rule |
| --- | --- | --- | --- |
| Generate now | Phase 4 | Instruction acknowledgement, seller existing-bond info request, figures request cover, notice/penalty summary, guarantee request cover, guarantee acceptance or variance note, lodgement checklist, registration notification, settlement close-out report | Operational drafts only, firm-approved wording, always reviewable |
| Template controlled | Phase 7 | Bank cancellation documents, seller cancellation consent, bond discharge/cancellation instrument, seller authority resolution | No generic fallback; requires governed firm and/or bank-approved templates |
| Ingest only | Phases 3, 5, 6, 8 and 9 | Lender instruction, bond statement, cancellation figures, guarantee letter, registration evidence, proof of settlement | Store and use as evidence; never synthesize external bank, guarantee, payment or registry outcomes |

This is the important Phase 0 truth: Bridge can make the cancellation conveyancer's work easier immediately with operational drafting and evidence structure, but it must not pretend to originate lender instructions, cancellation figures, guarantee acceptance, Deeds outcomes, settlement payments or final legal instruments before governance exists.

## Baseline data contract

Phase 1 and Phase 2 should work from the Phase 0 data contract:

- Seller existing-bond status.
- Cancellation bank.
- Bond account/reference number.
- Lender instruction reference and receipt date.
- 90-day notice status and notice date.
- Cancellation figures amount and expiry date.
- Daily interest and penalty/notice risk.
- Required guarantee amount.
- Guarantee beneficiary and wording requirements.
- Guarantee reference and acceptance status.
- Seller cancellation signing requirement.
- Signed cancellation document status.
- Lodgement reference and date.
- Cancellation registration reference and date.
- Settlement amount and payment reference.
- Close-out status.

Every generated draft or readiness decision should know which fact supplied it, whether that fact was verified, and when a later change invalidates the draft.

## Baseline metrics

The pilot should measure:

- Time from lender appointment to acceptance.
- Time from instruction to figures request.
- Time from figures request to figures received.
- Figures expiry-risk count.
- Penalty/notice-risk count.
- Guarantee request-to-receipt time.
- Guarantee variance and rework counts.
- Seller cancellation signing rework count.
- Days waiting for transfer or bond handoff.
- Lodgement delay due to cancellation.
- Cancellation lodgement rejection count.
- Time from registration to settlement proof.
- Time from settlement to close-out.

## Release blockers

Phase 0 leaves these blockers explicit:

- Cancellation lane usability is not simplified.
- Cancellation data contract is missing.
- Cancellation Pack Workspace missing.
- Cancellation operational generator missing.
- Cancellation figures register missing.
- Guarantee coordination workspace missing.
- Cancellation document/signing workspace missing.
- Cancellation lodgement and registration evidence is not packet-bound.
- Settlement close-out packet missing.
- Cancellation release certification missing.

These blockers are not failures of Phase 0. They are the controlled inputs for Phases 1 to 10.

## Current audit note

The platform already has a 19-stage cancellation workflow, seven cancellation document requirements and one seller-signing requirement. The richer document resolver knows more cancellation requirements than the stage-level document list exposes, so Phase 1 should make that mismatch visible in the cancellation cockpit instead of leaving it to conveyancer memory.

## Acceptance check

Run:

```bash
npm run test:cancellation-attorney-module-phase0
```

Phase 0 is complete when the cancellation stage contract, cancellation document requirements, responsibility boundary, pilot scope, document-generator categories, baseline metrics and release blockers pass locally.
