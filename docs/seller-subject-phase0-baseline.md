# Seller subject Phase 0 baseline

This baseline deliberately makes no user-facing routing or persistence change. It identifies the current ownership readers before the seller-lead workflow is moved onto the listing-side ownership model.

## Current sources

| Surface | Current source | Current behaviour | Phase 1 direction |
| --- | --- | --- | --- |
| Listing seller setup | `src/lib/listingSellerProfileBuilderModel.js` | Structured listing-side ownership route and canonical seller facts | Reuse this route selector and record model for seller leads |
| Seller onboarding | `src/pages/SellerOnboarding.jsx` and `src/lib/sellerOnboardingFlowContract.js` | Resolves a branch from form, listing, and canonical facts | Accept the seller lead's canonical subject as the route authority |
| Seller lead profile | `src/pages/agency/AgencyPipelinePage.jsx` | Compatibility projection combines lead, listing, and onboarding data | Replace with the shared seller-subject projection |
| FICA/documents/mandate | Seller requirement engine, mandate readiness/data mapper, signing rules | Read canonical facts where present, with compatibility fallbacks | Consume the same shared projection |

## Guardrails discovered

- An unresolved seller lead profile can currently be rendered as an individual by the compatibility resolver. This must become `ownership setup required`; it must not be silently inferred.
- The listing-side builder currently has no power-of-attorney branch, while onboarding supports one. Phase 1 must close that model gap before the selector is reused by seller leads.
- A primary contact is not always the legal owner. The future shared subject must represent legal owner, primary contact, and required signers separately.

## Baseline fixtures

`src/lib/__fixtures__/sellerSubjectOwnershipFixtures.js` captures the ownership routes used to protect the existing onboarding and listing routing behaviour. The associated test intentionally verifies only routes that are supported by both surfaces; the documented gaps remain visible work for the next phase.
