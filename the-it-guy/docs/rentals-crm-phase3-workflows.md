# Rentals CRM Phase 3 — Role-Specific Workflows

Phase 3 replaces the temporary generic rental lead path with two explicit, forward-only workflows. A lead may advance only one approved stage at a time.

## Landlord acquisition

`New → Contacted → Appraisal scheduled → Appraisal completed → Mandate pending → Mandate signed → Listing ready`

`Listing ready` is a hand-off to the listing workflow; it does not itself create a listing or a legally binding mandate.

## Tenant placement

`New → Contacted → Qualified → Viewing scheduled → Viewing completed → Application pending → Application submitted → Screening pending → FICA pending → FICA complete → Placement ready`

`Placement ready` is a hand-off to application/placement operations. This phase does not assert a screening result, compliance outcome, or tenancy creation.

## Existing leads

The v1 `viewing` and `application` states remain readable. On a tenant lead they are interpreted as `Viewing scheduled` and `Application pending`; on a landlord lead as `Appraisal scheduled` and `Mandate pending`. New transitions write v2 stages only.

Run the focused contract test with:

```sh
node src/services/rentals/__tests__/rentalLeadPipelineModel.test.js
```
