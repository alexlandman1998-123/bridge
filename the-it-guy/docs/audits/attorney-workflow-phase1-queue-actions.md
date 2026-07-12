# Attorney Workflow Phase 1 Queue Actions

Implemented on 2026-07-12.

## Goal

Remove dead-end attorney queue actions before pilot. Every visible action in the Attorney Matters queue must either execute a real service command or route the user to the transaction workspace area where the action can be completed.

## Implemented

| Surface | Phase 1 behavior |
| --- | --- |
| Active matter row menu | Replaced inert Assign/Reassign/Generate/Request/Schedule/Archive buttons with routed transaction workspace links. |
| Incoming transfer row menu | Kept real Accept/Decline commands and routed follow-up, document, assignment, and client-message actions to the correct workspace tabs. |
| Hover quick actions | Replaced fake buttons with routed links for transfer, documents, generated documents, activity, and client-message work. |
| Bulk bar | Removed static fake bulk action arrays. The bar now only opens a selected matter or clears selection. |
| Link safety | Added a shared transaction href resolver and removed no-op hash fallbacks from queue actions. |
| Transaction detail | Added queue-action target handling so Matter queue links land on Documents, Roleplayers, Transfer, Activity, or Overview. |

## Route Contract

| Queue action | Transaction workspace target |
| --- | --- |
| Open matter/transfer | Overview |
| Manage assignment | Roleplayers |
| Request documents | Documents |
| Generated documents | Documents |
| Schedule signing | Transfer |
| Follow up OTP | Activity |
| Message client | Activity |
| Timeline/activity | Activity |

## Deferred

These remain later-phase work, not dead buttons:

- True multi-row bulk operations need their own bulk service contracts before being reintroduced.
- Direct appointment creation remains Phase 5.
- Direct email sending from the queue remains out of scope until communication templates/actions are wired to a service.
- Archive remains hidden from the queue until lifecycle/archive policy is explicitly scoped for attorney users.

## Verification

```bash
npm run verify:attorney-workflow-phase1-queue-actions
npm run test:attorney-incoming-matter-ui
```

## Phase 1 Acceptance

- [x] No visible Attorney Matters row action is a presentational-only button.
- [x] Incoming accept and decline still call service commands.
- [x] Document, assignment, signing, follow-up, and activity shortcuts route to transaction detail with explicit intent state.
- [x] Queue actions do not fall back to `#`; missing transaction targets render disabled instead of pretending to work.
- [x] Bulk action bar no longer renders fake action lists.
- [x] Transaction detail consumes the queue action target and opens the intended workspace tab.
- [x] Regression test exists: `npm run verify:attorney-workflow-phase1-queue-actions`.

Decision: GO TO PHASE 2 WITH QUEUE ACTIONS WIRED OR ROUTED.
