# Buyer portal Phase 3: canonical journey presentation

Phase 3 gives the buyer demo and the production buyer portal one journey vocabulary and one renderer without changing production workflow authority.

## Source-of-truth boundary

- Production continues to calculate transaction state with `buildClientJourney()` and passes those live steps into `buildBuyerJourneyPresentationModel()`.
- The demo passes `DEMO_JOURNEY_STAGES` into the same pure presentation model.
- The model performs no reads, writes, routing, or service calls. It only normalizes presentation state.
- Seller and mobile portal journeys remain on their existing components in this phase.

## Canonical contract

Every buyer journey step is exposed as exactly one of:

- `complete`
- `current`
- `upcoming`

Legacy workflow aliases such as `completed`, `active`, `blocked`, and `pending` are normalized at the boundary. At most one step can be current. Blocked/action-required metadata is retained for future interaction work.

The model also supplies the shared current and next stage labels, completed count, progress percentage, and helper copy. Both production and demo percentages are derived from their canonical stage set; production passes the workflow-derived result explicitly and the demo uses the model calculation directly.

## Shared surfaces

`BuyerPortalJourney` now renders:

- production overview journey;
- production Transfer Journey page;
- demo overview journey; and
- demo Transfer Journey page.

Overview uses the summary variant. The dedicated journey pages use the detailed variant with duration and next-milestone information when supplied by the source steps.

## Verification

Run:

```bash
node src/core/clientPortal/__tests__/buyerJourneyPresentationModel.test.js
node scripts/buyer-portal-phase3-canonical-journey.test.mjs
node scripts/buyer-portal-phase0-stability.test.mjs
node scripts/buyer-portal-phase1-shared-shell.test.mjs
node scripts/buyer-portal-phase2-shared-overview.test.mjs
npm run build
```
