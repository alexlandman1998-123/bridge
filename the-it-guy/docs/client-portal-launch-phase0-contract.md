# Client portal launch — Phase 0 contract

## Outcome

Phase 0 freezes the launch definition for the buyer and seller portals. It does not claim the current implementation is launch-ready and does not change portal runtime behaviour.

The machine-readable authority is [`config/client-portal-launch-contract.json`](../config/client-portal-launch-contract.json). Later phases may extend the contract, but they must not remove a required capability, action, state, viewport, performance budget, or branding rule without explicit product approval.

## Product principles

1. Mobile and desktop require **capability parity**, not identical layouts.
2. A capability must use the same canonical data and status meaning on every viewport.
3. Mobile may prioritise and progressively disclose information, but it may not silently remove it.
4. Every primary task must work at 360 px without horizontal page scrolling.
5. Agency branding is configurable; success, warning, error, information, and focus colours remain system-controlled.
6. A portal link must always resolve to useful content or a clear recovery state.

## Information architecture

Primary navigation should remain intentionally small:

| Buyer | Seller |
| --- | --- |
| Overview | Overview |
| Journey | Journey |
| Documents | Documents |
| Finance | Offers |
| More | More |

`More` exposes Messages, Team, Appointments, Support, and any approved secondary features. Every required surface must be reachable in no more than two interactions. Navigation must show the active location and must not use a control with no resulting action.

## Capability parity matrix

| Surface | Buyer | Seller | Mobile and desktop contract |
| --- | --- | --- | --- |
| Overview | Required | Required | Property/listing summary, current stage, next action, progress, latest update, support entry |
| Journey | Required | Required | All stages, current position, dates, explanations, blockers and next step |
| Documents | Required | Required | Requirements, status, request reason, deadlines, review state, history, upload/replace/view/download/retry |
| Finance | Required | Not applicable | Application progress, bank submissions/responses, offers and required actions |
| Bond application | Required | Not applicable | Section progress, prefill, validation, saved state, readiness and submission |
| Offers | Not applicable | Required | List, status, commercial terms, conditions, comparison, decision and history |
| Appointments | Required | Required | Upcoming/past appointments, details, contact and location/call link |
| Messages | Required | Required | Real conversation, identities, timestamps, unread/delivery state, send and retry |
| Team | Required | Required | Main contact, role players, organisations, responsibilities and contact actions |
| Support | Required | Required | Agency contact, contextual help, recovery guidance and retry paths |

Messages and Team are distinct capabilities. One route may not substitute for the other.

## State contract

Every required surface must define and test:

| State | Required outcome |
| --- | --- |
| Loading | Stable skeleton or progress treatment; no indefinite unbounded spinner |
| Ready | Current canonical data and enabled actions |
| Empty | Plain-language explanation and next useful action |
| Error | Human-readable failure, safe retry and support path |
| Offline | Preserved readable state where possible and reconnection guidance |
| Expired link | Explanation and a safe way to request renewed access |
| Unauthorised | No data leakage; clear access recovery path |

## Responsive acceptance contract

The mandatory evidence viewports are 360×800, 390×844, 768×1024, and 1440×900.

- No primary task requires horizontal page scrolling.
- Wide timelines and steppers provide an obvious mobile interaction or responsive replacement.
- Interactive targets are at least 44×44 px.
- Fixed controls respect device safe areas and never cover page actions.
- Long agency names, people, addresses, currency values, and status labels do not break the layout.
- All mobile actions remain available on desktop, and all applicable desktop actions remain reachable on mobile.

## Performance contract

| Metric | Budget |
| --- | ---: |
| Useful content on a normal mobile connection | ≤ 1,500 ms |
| Core content on a throttled/slow mobile connection | ≤ 2,500 ms |
| Cached section navigation response | ≤ 100 ms |
| Cumulative layout shift | ≤ 0.10 |
| Route crashes | 0 |
| Dead controls | 0 |

Measurements must use production builds and representative portal fixtures. Local development timing is diagnostic evidence, not release evidence.

## Agency branding contract

Every portal theme supplies:

- Agency name
- Light and dark logo variants
- Primary, secondary, and accent colours
- Main support contact

Every theme must pass WCAG AA contrast for body text and controls. Missing or invalid assets must fall back cleanly. Agency colours may style identity and emphasis but may not redefine semantic success, warning, error, information, or focus states.

## Phase 0 baseline findings

The 30 August 2026 audit established the following blockers against this contract:

| Severity | Finding | Contract affected |
| --- | --- | --- |
| Critical | Seller portal crashes because `TransactionJourneyTracker` is referenced without an import | Runtime, all seller surfaces |
| High | Buyer mobile menu control has no action | Navigation, dead controls |
| High | Buyer Messages route renders Team | Messages parity |
| High | Buyer mobile overview omits applicable desktop capabilities | Overview parity |
| High | Finance and Bond Application use wide, partially off-screen mobile steppers | Responsive navigation |

These findings remain work for Phase 1. Phase 0 records the acceptance boundary; it does not waive or repair them.

## Evidence required in later phases

For every applicable matrix cell, record:

- Persona and fixture
- Route
- Viewport and device/browser
- Ready-state screenshot
- Loading, empty, and error evidence
- Actions exercised and their results
- Overflow, accessibility, console, request-failure, and performance results
- Agency theme fixture used
- Tester, date, build identifier, and outcome

## Release decision

The launch decision is `GO` only when every release gate in the machine-readable contract passes and no critical or high-severity defect remains. Missing evidence is a blocked gate, not an assumed pass.

## Validation

Run from `the-it-guy/`:

```bash
npm run test:client-portal-launch-phase0
```

The check validates the contract structure, complete buyer/seller matrix, navigation limits, responsive minimums, performance budgets, state coverage, and branding requirements.
