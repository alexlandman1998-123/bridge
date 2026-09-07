# Kingdom Real Estate — Phase 6 publication control

## Purpose

Define the controlled, reversible path for publishing Kingdom Real Estate's first Arch9 website revision. This is a content-publication control only; it does not authorise a client-domain launch.

## Current controlled state

| Check | State |
| --- | --- |
| Website site | `0160e45a-2268-4875-91d7-275c43f574d0` |
| Draft revision | Revision 1 (`8e290784-5c3d-4d77-9c64-7240581eae91`) |
| Template | Home Seekers v1 |
| Core pages | Home, About, Contact and Valuation validated |
| Managed preview hostname | `kingdom-real-estate-13c6b79f.sites.arch9.co.za` |
| Client custom domains | None |
| Public revision | None — the website remains a draft |

## Publication controls

- Only an organisation administrator may create, publish, discard or restore a revision.
- The publish action checks branding, colour values, navigation, the four core pages, page-block validation and an active managed preview hostname.
- Publishing uses an atomic pointer to one exact revision. It does not infer a revision from timestamps.
- A publication event records the actor, source revision, resulting revision and content fingerprint.
- Publishing a later revision archives the prior published revision; it is never edited in place.
- Recovery creates and publishes a new copy of an archived revision, preserving the entire revision history.
- Listing channel publication is independent: only explicitly published CRM listings can appear on the public website.

## Kingdom release sequence

1. Review the draft using the managed preview hostname and verify desktop/mobile pages, contact details, listings and form journeys.
2. In Website Studio, confirm that the publication-check panel has no blockers and record its content fingerprint in the approval note.
3. Obtain Kingdom's approval of the exact revision. Do not treat staging review as authorisation to change DNS.
4. An authorised Kingdom administrator selects **Publish reviewed draft**. This only makes the managed preview revision available.
5. Confirm the publication-history entry and perform one controlled enquiry test only after the revision is published.
6. If a critical issue is found, use **Restore selected revision**. This produces a new published copy from the selected historical revision and keeps the audit trail intact.

## Explicit non-actions

- Do not connect `kingdomrealestate.co.za` or `www.kingdomrealestate.co.za` in this phase.
- Do not change nameservers, MX, SPF, DKIM, DMARC or any email routing record.
- Do not redirect the existing Kingdom website.
- Do not publish CRM listings that have not passed Kingdom's normal listing-publication requirements.

## Exit criteria for Phase 6

Phase 6 is complete when the draft is structurally ready, publication and rollback controls are verified, and the agency has a documented preview-release checklist. The next phase is the controlled staging pilot; a client-domain launch remains a separate approval.
