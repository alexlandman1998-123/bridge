# Attorney coordination Phase 5 — delegation management UX

Phase 5 makes controlled delegation usable from the shared attorney matter instead of requiring an administrator or direct database call.

The responsible bond or cancellation attorney, or an authorised manager in that responsible firm, can:

- see the currently active delegation, capability scope and expiry;
- grant selected workflow, document, internal-note or shared-update actions to the matter's assigned transfer attorney;
- provide a mandatory reason and expiry, with the Phase 3 maximum of 30 days enforced by both client validation and the database;
- revoke access immediately with a mandatory reason.

The delegate sees an “acting on behalf” banner and only receives controls for the capabilities in the active grant. The responsible firm and lane do not change, and the transfer attorney cannot delegate to themselves, expand the grant or revoke it.

Run `npm run test:attorney-coordination-phase5`. Staging acceptance still requires two real sessions: the responsible lane attorney grants/revokes while the transfer attorney verifies controls appear and disappear without a refresh race or cross-lane leakage.
