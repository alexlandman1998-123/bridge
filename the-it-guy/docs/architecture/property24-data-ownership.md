# Property24 data ownership

Version: `arch9_property24_canonical_v1`

Arch9 owns business data. Property24 integration records store external identifiers and delivery state; they do not become editable copies of Arch9 profiles or listings.

| Data | Canonical owner | Property24 integration use |
|---|---|---|
| Agent name, email, telephone, job title and photo | Arch9 agent profile (`profiles`, resolved through the organisation membership) | Read when creating or updating the Property24 agent |
| Property24 agent ID and source reference | `property24_agent_mappings` / identifier-only mapping settings during compatibility rollout | Resolve the Property24 contact agent for a listing |
| Property24 agency ID, environment and enabled state | `property24_accounts` | Server-side organisation connection lookup |
| Listing content, media and assigned agent | Arch9 listing and listing media records | Build the Property24 listing payload |
| External status, timestamps and errors | Property24 sync/mapping records | Reconciliation, retry and audit evidence |
| Original migration values | Read-only migration evidence | Traceability only; never an editable source |

## Agent rules

- Property24 agent creation accepts an Arch9 user or membership identifier, not browser-supplied profile fields.
- The server verifies that the agent belongs to the organisation and loads their canonical profile.
- Missing or invalid email/telephone data must be fixed on the Arch9 Agent Profile.
- Agent photos are read from the profile avatar, restricted to approved Arch9/Supabase storage origins, normalised to an 800×800 JPEG, uploaded through Property24's profile-picture endpoint and verified by hash after upload.
- Property24 agent creation is duplicate-safe by source reference or email. Existing matches are updated from the canonical profile instead of being created again.
- Agent profile sync updates name, email, telephone, job title and photo from Arch9, then re-fetches Property24 to verify the result.
- Agent deactivation is an offboarding operation, not a profile edit: active listings must first be reassigned through the canonical listing assignment flow. A fresh server check blocks deactivation while any active listing still points at the agent.
- Once ownership is clear, Arch9 synchronises the mapped Property24 agent to `Inactive`, verifies that contact fields and the profile photo were preserved, marks only the mapping lifecycle state inactive, and then deactivates the Arch9 organisation membership. If membership deactivation fails, the Property24 status is restored to `Active` when possible.
- Settings may display Property24-returned profile values during a live sync, but persisted settings retain identifiers and sync metadata only.

## Listing rules

- Sale lifecycle values are `Active`, `Pending`, `Sold`, and `Withdrawn`.
- Rental lifecycle values are `Active`, `Pending`, `Rented`, and `Withdrawn`.
- A listing's Property24 contact agent is derived from the Arch9 assignment and its active Property24 mapping.
- Changing a listing's Property24 contact agent means reassigning the Arch9 listing; request-level agent overrides are rejected when a canonical mapping exists.
- A request cannot override the organisation's saved Property24 agency ID.
- Rental writes use the dedicated rental endpoint and require both `PROPERTY24_SYNDICATION_ENABLED=true` and the narrower `PROPERTY24_RENTAL_LIVE_PUBLISH_ENABLED=true` server switch. Preview remains read-only when the rental switch is off.

## Reconciliation rules

- An organisation administrator can run listing reconciliation from Property24 settings after the organisation connection is enabled.
- The server derives the agency ID and environment from the organisation's canonical connection. Browser-supplied agency or environment overrides are not accepted.
- Local sync rows are restricted through the organisation's `private_listings` ownership before comparison, even when multiple organisations have used the same external agency ID.
- Reconciliation is report-only. It may read listing summaries, recent updates and portal visibility from Property24, but it never publishes, updates, imports, reassigns or changes status.
- Status drift, missing records, unexpected external records, visibility drift and unmatched updates are presented as review items. Any corrective action must use the relevant canonical Arch9 listing workflow.

## ExDev vetting rules

- Phase 6 vetting-pack generation is available only for an enabled ExDev connection and an authenticated organisation administrator.
- The pack runs Property24 read endpoints, then combines their safe summaries with organisation-scoped listing sync, retry/idempotency and reconciliation evidence.
- Database evidence is restricted through the organisation's `private_listings` ownership. Another organisation's records are excluded even when an external agency ID has been reused.
- The browser receives a redacted evidence model and rendered Markdown only. Credentials, authorization headers, raw request payloads, signed image URLs and image bytes are never included.
- Pack generation performs no Property24 write and no database mutation. Manual ExDev create, update and status evidence must be produced through the existing explicit workflows.

## Production cutover rules

- Production activation is an organisation-scoped server state machine: `blocked` → `approved` → `pilot` → `live`, with `paused` available as a reversible safety state. Browser state and browser-supplied flags cannot bypass it.
- ExDev approval stores the Phase 6 pack status, generation time, redacted summary and SHA-256 digest. Starting a pilot requires that stored evidence, a saved production connection, production-specific credentials, an authenticated production read and the global server publishing switch.
- ExDev and production credentials use separate server-only variables. No `VITE_` credential is permitted, and a test base URL cannot satisfy a production credential check.
- Production writes require both the global server switch and an enabled organisation production connection whose cutover gate is `pilot` or `live`. Enabling a production connection directly is rejected until the gate permits it.
- A pilot is limited to three manually selected listings. There is no bulk-publish action. Five production write attempts per minute are rate-limited, and three failures in fifteen minutes open the safety circuit.
- Promotion to `live` requires one to three tracked pilot listings, all visible on Property24, no recent failed writes and an `OK` production reconciliation with portal checks.
- Pausing disables the production account. It blocks normal production writes while still allowing an explicit withdrawal/removal status update as the safe rollback path; rollback never deletes Arch9 listing or sync records.
- Every approval, pilot, promotion, pause and resume decision requires an authenticated principal/admin, a reason, the previous and next state, and redacted evidence in the append-only cutover event log.

## Compatibility rollout

The Phase 0 backfill copies existing `organisation_settings.settings_json.property24` connection values into `property24_accounts`, then removes the duplicated connection-owned fields. Identifier-only mapping settings remain readable for compatibility. Phase 1 writes every created, automatically matched or manually selected agent link to `property24_agent_mappings`; contact snapshots are not written by the synchronisation path.
