# Buyer portal Phase 6: canonical team and support

Phase 6 gives the production buyer portal and buyer demo one presentation model for transaction contacts and support routing. It adopts the demo's clearer team hierarchy without introducing a second messaging backend.

## Data boundary

- Production agent, developer, operations, bond-originator, attorney-firm, attorney, and secretary records remain sourced from the live portal payload.
- Attorney role-player records are flattened at the presentation boundary; the shared UI does not know the production role-player schema.
- Demo contacts continue to come from `TRANSACTION_TEAM`, normalized through the same model.
- The shared model and UI contain no service, Supabase, storage, or demo-fixture imports.

## Contact routing

The canonical model resolves a main contact, the currently active contact, specialist contacts, and topic routes for:

- general purchase questions;
- bond applications and bank offers;
- transfer, signing, and registration;
- documents and signing arrangements.

A topic route is only rendered when the resolved contact has a real email address or phone number.

## Shared surfaces

- Production desktop Team route.
- Production mobile Team section receives the same normalized contacts.
- Demo desktop Your Team route.
- Demo mobile Team route.
- Demo Messages route now acts as a support/contact surface instead of implying a separate persisted inbox.

Production overview comments remain the persisted in-portal communication mechanism. Existing `mailto:` and `tel:` actions remain direct contact adapters.

## Verification

```bash
node --test src/core/clientPortal/__tests__/buyerTeamPresentationModel.test.js
node scripts/buyer-portal-phase6-canonical-team.test.mjs
node scripts/buyer-portal-phase0-stability.test.mjs
node scripts/buyer-portal-phase1-shared-shell.test.mjs
node scripts/buyer-portal-phase2-shared-overview.test.mjs
node scripts/buyer-portal-phase3-canonical-journey.test.mjs
node scripts/buyer-portal-phase4-canonical-documents.test.mjs
node scripts/buyer-portal-phase5-canonical-finance.test.mjs
npm run build
```
