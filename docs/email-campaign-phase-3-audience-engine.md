# Arch9 Email Campaigns — Phase 3: Audience engine

Phase 3 adds repeatable, compliance-first targeting.

## Included

- `email_saved_audiences`: organisation-scoped reusable filter definitions, not stored recipient copies.
- Audience filters for contact role, area, tag and explicit manual contact selection.
- An exact recipient preview RPC that requires an organisation membership and calculates against the current marketing-consent, category subscription, valid-address and suppression records.
- Dispatch applies the same filter clauses again while creating the immutable recipient snapshot.

## Safety properties

Saved audience filters cannot include a bypass flag. A saved segment that used to contain a recipient does not make that recipient sendable if they later unsubscribe, hard-bounce, lose category consent or become invalid. Manual selection also resolves through the same checks.

Consent-aware preview and dispatch explicitly check membership, stored audience access and source visibility. CRM membership reads use invoker RLS. Personal audience references are checked again inside privileged email selection; a saved definition never grants access to otherwise private client facts.

## Client-system Stage 1 repair — 5 November 2026

The primary Arch9 app now preserves saved email audience definitions exactly.
Legacy branch, staff, explicit contact lists, empty/all definitions, mixed legacy
and structured restrictions and nested groups remain usable for previews,
renaming and duplication. Definitions the current editor cannot represent have
filter editing locked with an explanation. Supported flat AND/OR definitions
remain editable. This does not consolidate the separate CRM audience library.

`20261105181651_client_audience_feed_repair.sql` prepares the shared database repair:

- Valid non-demo agency CRM addresses project correctly; normalized duplicates
  produce one marketing contact with lineage for every contributing contact.
  The most recently updated contact supplies deterministic metadata.
- Contact/lead statement triggers refresh affected organisations automatically.
  Removed, invalid, demo or legal-only sources invalidate their old CRM marketing
  address; they do not delete recipient history or grant marketing consent.
  Existing tags, preferences, category subscriptions and suppressions are retained.
  First-tag rows for other visible sources (such as prospects) stay usable and
  are not retired by the contact feed.
- CRM projection reads and recipient selection retain permanent-client source
  permissions. Browser edits cannot disguise a CRM projection as a manual contact.
- Missing/moved source links stop hiding otherwise permitted client profiles.
  Existing private sources still restrict the profile. Deleted/moved links are
  archived privately. A service-only repair supports a dry run before cleanup.
- Membership preview uses the exact stored filter and the caller's row permissions;
  send eligibility additionally requires consent, subscription and no suppression.

Focused checks (serial; one worker; 1024 MB Node heap):

```sh
# From the primary app directory:
NODE_OPTIONS=--max-old-space-size=1024 node --test --test-concurrency=1 scripts/client-audience-feed.test.mjs scripts/client-identity.test.mjs scripts/client-activity.test.mjs scripts/client-attribution.test.mjs scripts/client-campaign.test.mjs scripts/marketing-audiences.test.mjs
NODE_OPTIONS=--max-old-space-size=1024 npx vitest run src/components/clients/ClientAudiences.test.jsx src/services/__tests__/clientAudienceMemberships.test.js --maxWorkers=1
```

The feed check applies actual migrations to isolated PGlite, with synthetic CRM
sources and memberships. It exercises duplicate/valid/invalid addresses,
automatic refresh, cross-organisation moves, deletions, source privacy, exact
legacy restrictions, preview/recipient agreement, tags and consent preservation.
It schedules only an isolated local fixture campaign; it does not call Resend.
Existing identity/activity/campaign checks cover their established behavior.

## Release boundary

Stage 1 is implemented locally. No remote migration, source-link cleanup, CRM
backfill, deployment or message delivery is implied by passing these checks.
The migration installs functions/policies/triggers without bulk-changing existing
client data. An approved release must follow `docs/database-release-runbook.md`,
identify its target and recovery evidence, check the exact migration dry-run scope,
and include the preceding email delivery/sender/isolation/readiness changes.

For each reviewed agency, first inspect the service-only
`email_campaign_repair_client_links(organisation_id, false)` count. Applying that
repair (`true`) and calling `email_campaign_refresh_contact_projection(organisation_id)`
are separate live writes requiring explicit approval. Verify profile visibility,
projected counts, saved audience membership and consent-aware eligibility after
release before enabling campaigns. Do not infer consent from a CRM address.
## Client-system Stage 2: shared identity and tags

`20261105183145_shared_client_identity_tags.sql` and the primary app connect shared
client tags to agency and developer-company client profiles. Tags no longer need
an email address. The checked API reads retained alias tags, saves a shared set
with an expected tag revision, and updates existing email metadata for compatibility.
Reviewed merges combine the person's tags and alias memberships; consent remains
attached to each actual destination. Shared CRM audience tag matching supports
phone-only clients and uses the same ZA phone normalization as client identity.
Legacy email-only matching/dispatch reads shared tags through a checked helper.
The two audience definition libraries remain separate until Stage 3.

Developer source intake and reviewed identity controls use active membership,
organisation administration and existing source assignment/transaction access.
Agency permissions remain unchanged. Names/shared phones never auto-merge clients.
Shared-client metadata from a private source remains private to its authorised users.
Existing tag rows under merged redirects remain readable as part of the retained
profile; subsequent saves write the shared current set. Direct browser writes to
`agency_client_tags` are replaced by `client_tags_save` so stale whole-set saves
cannot overwrite another editor's work. Legacy email tag edits invalidate the
shared tag revision rather than silently winning a later replacement.

All Stage 2 changes are local. Release the migration and matching app together.
Explicitly approved releases refresh existing developer identities through the
service-only `client_identity_refresh(organisation_id)` before refreshing the
marketing projection. No source records are rewritten, no profiles are merged
by the backfill, and no messages or subscriptions are created. Existing exact
email matching can associate new sources with a retained identity. Read source
permissions, client counts, tag unions and destination consent after release.
Use the focused checks listed in the primary README and the Stage 2 receipt in
`output/client-system-stage2-20261105/`. Full live walkthrough, audience consolidation
and complete communication/team-awareness coverage remain later release work.


## Client-system Stage 3: one audience catalogue

`20261105185204_unified_client_audiences.sql` consolidates definitions in
`marketing_audiences`. Clients reuses the same library/editor as Campaigns, Email
and WhatsApp. The separate email-only panel is removed. Personal/shared permissions,
creator ownership, revision checks and per-channel reviewed recipient selection
remain in force. Membership cards call `client_audience_memberships` for the
permanent client, covering phone-only contacts and retained aliases with source
permissions intact. Positive membership does not imply consent to send. CRM definitions retain their
visible contact/lead membership; preserved email targeting includes marketing
contacts and uploads. Source records are not automatically added to existing
segments merely because the catalogues are consolidated.

Legacy email definitions are stored as exact `emailFilter` envelopes rather than
translated CRM rules. Their IDs, creators (including null), long legacy metadata,
creation/update timestamps and archived status are retained. Existing shared
visibility is retained. Their filters are protected in the common editor; names,
sharing, copies and archives are supported. They remain email-only, including
explicit branch/staff/marketing-contact restrictions and empty/all definitions.
WhatsApp reuse requires an explicitly reviewed CRM definition. No implicit field
mapping or widening of membership occurs.

The migration locks both tables while importing, fails on ID collisions and keeps
the original rows in a private archive. `email_saved_audiences` becomes a read-only
invoker view of the canonical catalogue. Compatibility saves write the canonical
table using revisions and default to personal visibility. Existing email draft
references resolve against the same IDs, with explicit personal/shared access even
inside privileged dispatch. Missing, archived, foreign, private or cyclic references
fail closed. New selections pin the criteria revision, so later filter edits require
reselection while membership remains live. Existing bare references stay compatible,
and the selector pins their resolved criteria during dispatch. Mixed saved references/custom filters are rejected; the email editor
requires a deliberate switch to custom filters. Preview and snapshot dispatch share
the same matcher, source guard, category consent and suppression checks.

Stage 3 is local only. Applying this migration imports stored definitions and is a
live data write requiring the approved release scope in the database runbook.
Inventory both libraries and stored references, review collisions/unsupported JSON,
preserve recovery evidence and ship the matching frontend together. Verify counts,
IDs, visibility and exact selections after release. The migration is transactional;
the retained archive is evidence, not a second writable library. No remote migration,
provider call, live backfill or deployment was performed during implementation.
See the primary README and `output/client-system-stage3-20261105/` for focused
verification receipts. The known intermittent attribution timestamp classification
and complete engagement/team-awareness ingestion remain Stage 4 follow-up work.


Client-system Stage 4 adds permitted Inbox email/WhatsApp engagements and structured
manual contact outcomes to the shared CRM audience recency calculation. Preview
and dispatch use the same matcher. Successful messages and completed contacts
activate the quiet period; failed sends, unanswered calls, notes and provider
opens/clicks do not. Source/client permissions are explicitly checked even in the
privileged email selector, and future dates do not hold someone in a quiet period.
The migration is `20261105192633_client_engagement_history.sql`; rollout and
service-only historical replay require explicit approval. See the primary app
README's “Inbox engagements and team awareness” for the capture/access boundaries.


Client-system Stage 5 corrects the existing email importer in
`20261105194348_client_audience_import_catalogue.sql`: it writes the unified
catalogue using an exact `emailFilter.contact_ids` definition rather than trying
to insert into the computed compatibility view. The public import signature and
receipt stay compatible. Permission checks, atomic rollback, duplicate-name
rejection and existing consent/opt-outs remain enforced. The combined client
engagement database check verifies import → catalogue → preview → dispatch
preparation in both agency and developer contexts. It makes no provider calls.
