# Client portal launch — Phase 5E accessibility certification

## Outcome

Phase 5E provides a fail-closed WCAG 2.2 AA certification packet for buyer and seller portals. Source-level checks confirm the shared foundations expose focus, reduced-motion, status, active-navigation, and brand semantics. Human assistive-technology evidence remains mandatory.

## Required testing

Test the immutable Phase 5B candidate for both personas:

- Complete keyboard-only operation, including dialogs and focus return.
- VoiceOver with Safari and TalkBack with Chrome.
- Text, control, semantic-colour, and focus-indicator contrast.
- 44 px launch-contract touch targets and safe-area clearance.
- Browser zoom and mobile text scaling to 200%, including reflow at 320 CSS pixels.
- Reduced-motion behaviour.
- Loading, offline, validation, expired-link, unauthorised, and recovery announcements.

Record tester, timestamp, results, and an immutable evidence URL for every check. Evidence must use demo or sanitised records and must not expose portal tokens, client data, documents, contact details, or authentication material.

## Commands

```bash
npm run test:client-portal-launch-phase5e
npm run report:client-portal-launch-phase5e
npm run gate:client-portal-launch-phase5e
```

The gate returns non-zero until every buyer and seller check passes, all evidence is linked, and open critical/high accessibility defects are both zero. Only then may Phase 5's accessibility evidence be marked `passed`.
