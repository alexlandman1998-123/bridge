# Unified Partner Directory — Phase 2

Date: 2026-07-20

Status: Implemented in source; not deployed

## Outcome

The standard `/partners` workspace now presents one **Partners** directory instead of separate Third parties and Connections views.

The primary navigation is:

- Partners
- Invites
- Discover

Partner records display role tags and one clear state:

- Connected
- Invite pending
- External contact
- Inactive

Users can search across organisation and contact details, filter by role, and filter by state. Connected organisations retain their profile action. Saved external/default records retain edit, activation, and removal actions.

## Backend compatibility

`partnerDirectoryService.js` first calls the Phase 1 RPC:

```text
bridge_list_organisation_partner_directory
```

If the RPC is not present, it creates the same read-model shape in memory from the existing relationship, preferred-partner, and invitation payloads. This allows Phase 2 to be released independently of the Phase 1 database migration without returning to separate UI concepts.

The fallback uses the same directory identity priority:

1. Platform organisation ID.
2. Saved external-partner ID.
3. Invitation ID when no safe match exists.

An exact normalized outgoing invitation email can decorate a saved external contact in the UI. It does not persist or claim an organisation identity.

## Additional UI changes

- Quick Create now says **Partner**, not Third Party.
- The add/edit modal now uses Partner terminology.
- Empty states, success messages, confirmation text, and loading text use Partner terminology.
- Existing deep links using `?tab=connected` resolve to the unified Partners presentation in the simplified workspace.
- Bond-partner and organisation-profile variants retain their existing detailed relationship views.

## Verification

- Unified directory compatibility tests passed.
- Unified Phase 2 UI contract passed.
- Existing partner-directory Phase 5 and Phase 6 contracts passed after terminology expectations were updated.
- Production Vite build passed.
- Dev-server browser smoke check passed for content, error-overlay, and console-error checks.
- The isolated browser had no authenticated application session and therefore redirected `/partners` to `/auth`; signed-in visual acceptance remains a staging/deployment check.
