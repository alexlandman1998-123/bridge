# Client portal launch — Phase 1 stability

## Outcome

Phase 1 removes the launch-blocking defects recorded in the Phase 0 contract. It restores the routed seller portal, makes buyer mobile navigation operable, separates Messages from Team, and replaces narrow-screen horizontal progress controls with responsive alternatives.

This phase intentionally does not redesign the entire portal or change database, token, permissions, upload, notification, or production messaging contracts.

## Implemented

### Seller runtime

- `ClientPortal.jsx` now imports the transaction journey tracker used by `SellerProgressJourney`.
- The seller overview can render listing and sale progress without throwing `TransactionJourneyTracker is not defined`.

### Buyer mobile navigation

- The header menu button now opens an accessible modal navigation sheet.
- The bottom bar exposes Overview, Journey, Documents, Finance, and More.
- More opens all buyer portal destinations, including Bond Application, Messages, and Team.
- The active secondary destination is reflected by the More control.
- Menu and bottom-navigation touch targets meet the 44 px Phase 0 minimum.

### Buyer mobile Messages

- Messages no longer redirects to or renders the Team page.
- The mobile Messages screen has a conversation timeline, sender identity, timestamps, a compose field, disabled-empty state, and sent-state feedback.
- The demo send action is intentionally local simulation and does not claim production persistence.

### Finance and Bond Application

- Mobile Finance uses a compact vertical journey with explicit Done, Current, and Next labels.
- The Bond Application section navigator wraps into a responsive grid instead of hiding sections in a 500 px-wide horizontal rail.
- Desktop finance retains its existing horizontal presentation.

## Acceptance gates

| Gate | Required result |
| --- | --- |
| Seller overview | Loads on desktop and mobile without the Phase 0 reference error |
| Buyer header menu | Opens and closes; every portal destination is reachable |
| Buyer bottom navigation | Five clear destinations; secondary pages reachable through More |
| Messages | Distinct from Team and supports a local demo send interaction |
| Finance at 360 px | All progress stages readable without horizontal page scrolling |
| Bond Application at 360 px | Every form section directly visible and selectable |
| Runtime | No route-level error overlay or serious console error on affected routes |

## Validation

Run from `the-it-guy/`:

```bash
npm run test:client-portal-launch-phase0
npm run test:client-portal-launch-phase1
npm run test:seller-portal-ui-regression
npm run build
```

Browser evidence must cover:

- `/client/demo-seller-portal/selling` at 1440×900 and 390×844
- `/demo/mobile-check/buyer` menu interaction at 390×844
- `/demo/mobile-check/buyer/messages` compose/send at 390×844
- `/demo/mobile-check/buyer/finance` at 360×800
- `/demo/mobile-check/buyer/bond-application` at 360×800

## Remaining work

Phase 1 stabilises the known blockers. Full production buyer/seller capability parity, shared responsive component consolidation, agency theme certification, performance budgets, physical-device coverage, and controlled rollout remain governed by later phases.
