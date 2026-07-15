# Bond attorney module - Phase 0 scope lock

Phase 0 turns the bond-attorney audit into a controlled baseline. It does not add runtime generation, integrations, migrations, production writes or legal wording changes.

The executable source is `src/core/transactions/bondAttorneyModulePhase0.js`.

## Responsibility boundary

The bond attorney is appointed by the new lending bank and owns the bank-compliant bond matter from instruction acceptance through bank close-out. The module may help with instruction intake, bank references, bank conditions, bond signing, bank submission, approval to lodge, guarantees, simultaneous lodgement, registration evidence and close-out.

The bond lane does not own transfer document preparation, seller transfer FICA, rates or levy clearance, existing-bond cancellation figures, Deeds Office or bank portal decisions, or approved legal wording without firm and bank template governance.

## First pilot scope

The first pilot is deliberately narrow:

- Single new bank instruction.
- Individual buyer.
- Freehold residential resale.
- Standard bond amount and bank reference capture.
- Standard bank conditions.
- Manual bank portal and registration evidence upload.

Held for later phases: company or trust buyers, sectional title or HOA conditions, commercial or VAT matters, multiple or substituted bonds, development-sale bond packs, automated bank or Deeds Office integrations, and final mortgage-bond instrument generation without approved firm and bank templates.

## Document generator boundary

Phase 0 separates bond documents into three categories:

| Category | Phase | Examples | Rule |
| --- | --- | --- | --- |
| Generate now | Phase 4 | Instruction acknowledgement, FICA request pack, bank-condition schedule, signing appointment pack, guarantee schedule, lodgement checklist, registration notification, close-out report | Operational drafts only, firm-approved wording, always reviewable |
| Template controlled | Phase 7 | Power of attorney to pass mortgage bond, entity resolutions, mortgage bond draft, banking mandate or debit-order declaration | No generic fallback; requires governed firm and/or bank-approved templates |
| Ingest only | Phases 3 and 8 | Bank instruction, grant letter, approval to lodge, registration evidence | Store and use as evidence; never synthesize external approval |

This is the important Phase 0 truth: Bridge can make the conveyancer's work easier immediately with operational drafting and evidence structure, but it must not pretend to originate bank instructions, lender approvals, Deeds outcomes or final legal instruments before governance exists.

## Baseline data contract

Phase 1 and Phase 2 should work from the Phase 0 data contract:

- Bank name and bank reference.
- Approved bond amount.
- Mortgagor identity and capacity.
- Mortgagee identity.
- Property legal description.
- Title deed or Deeds Office reference.
- Buyer marital or entity authority.
- Bank conditions.
- Guarantee values and expiry.
- Signing method and signed-pack status.
- Bank submission and approval-to-lodge references.
- Lodgement reference and registration date.

Every generated draft or readiness decision should know which fact supplied it, whether that fact was verified, and when a later change invalidates the draft.

## Baseline metrics

The pilot should measure:

- Time from instruction to acceptance.
- Time from instruction to first missing-info request.
- Open bank-condition count and SLA breaches.
- Draft-pack rework count.
- Buyer signing reschedule count.
- Bank submission rejection count.
- Guarantee wording rework count.
- Days waiting for transfer or cancellation handoff.
- Lodgement rejection count.
- Time from registration to bank close-out.

## Release blockers

Phase 0 leaves these blockers explicit:

- Bond Pack Workspace missing.
- Bond operational generator missing.
- Bank conditions are not yet structured.
- Signing workspace missing.
- Legal instrument templates are not approved.
- Lodgement and registration evidence is not packet-bound.
- Bank and Deeds integrations are absent.

These blockers are not failures of Phase 0. They are the controlled inputs for Phases 1 to 10.

## Acceptance check

Run:

```bash
npm run test:bond-attorney-module-phase0
```

Phase 0 is complete when the bond stage contract, bond document requirements, responsibility boundary, pilot scope, document-generator categories, baseline metrics and release blockers pass locally.
