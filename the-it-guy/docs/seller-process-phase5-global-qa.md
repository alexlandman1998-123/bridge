# Seller Process Phase 5 Global QA

Date: 2026-08-10

## Purpose

Phase 5 is the repeatable non-mutating QA pack for the global seller process up
to listing creation and seller portal continuity. It verifies the global process
without enabling or blending the Kingstons process.

The global and Kingstons must not mix. A Kingstons name, email domain, or test
agent email alone is not enough to activate the Kingstons profile. Only explicit
organisation/profile configuration can do that.

## Automated Gate

Run:

```bash
npm run test:seller-process-global-qa-phase5
```

This runs the focused contract and smoke checks for:

- send onboarding link
- seller onboarding submitted state
- GAS, COC, solar, beetle, plumbing, water and related conditional documents
- generate mandate
- send and sign mandate
- signed mandate handoff into listing creation
- listing relationship and document continuity
- document tab population in the seller portal
- agent upload on behalf of the seller
- seller portal progress and document-centre stability
- production build

## Manual QA Checklist

Use a global seller lead that is not configured with the Kingstons profile.

1. Send the seller onboarding link from the lead workspace.
2. Open the link and submit seller onboarding with all compliance toggles off.
   Confirm GAS compliance, seller COCs, solar, beetle, plumbing and water
   documents do not appear.
3. Submit another global onboarding scenario with the relevant compliance
   toggles on. Confirm only the selected conditional documents appear under
   Property documents, not Sales documents.
4. Generate the mandate from the submitted onboarding.
5. Send and sign mandate. Confirm the selected lead updates without a full
   pipeline reload and the signed packet remains canonical.
6. Create or open the listing from the signed mandate. Confirm there is one
   linked listing for the seller lead.
7. Open the document tab. Confirm the signed mandate, generated disclosure, and
   conditional seller documents are present in the correct categories.
8. Upload a required document as the agent on behalf of the seller. Confirm the
   requirement changes to uploaded and remains linked to the listing.
9. Open the seller portal. Confirm the document centre mirrors the correct
   submitted onboarding documents and does not show Kingstons-only documents.

## Stop Conditions

Stop and do not continue tomorrow's QA if any of these occur:

- a global lead shows Kingstons valuation or seller-pack stages
- Kingstons activates from name/email instead of explicit profile or org config
- a conditional COC document appears when its onboarding condition is false
- seller declaration, defects, CGT, acquisition, alteration or occupation
  documents appear under Sales documents
- mandate send/signing requires a full pipeline reload to recover state
- the listing document tab and seller portal document centre disagree
- an agent upload saves on the lead but fails to link to the listing document
