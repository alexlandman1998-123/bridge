# Public Websites — Phase 6 Publication Safety

**Status:** implemented locally; non-production migration and acceptance evidence pending

**Implemented:** 5 September 2026

## Outcome

Phase 6 closes the source-level release-safety gap between an editable website draft and the live agency website. A published site now points to one exact revision. Public pages, branding and navigation are resolved from that revision only, so saving or previewing a draft cannot leak content into the live site.

Recovery is immutable. Restoring an archived revision creates and publishes a new copy instead of changing historical rows back to published. Every draft creation, discard, publication and rollback is recorded in a tenant-scoped publication history with the actor, source and destination revisions, timestamp and reviewed-content fingerprint.

## Delivered controls

- `website_sites.published_revision_id` is the single public-content pointer.
- Composite foreign keys prevent a site or page from referencing another site's revision.
- Publication evidence is bound to the same site and organisation and exposes no update or delete grant through the API.
- Deferred invariant triggers require the published site, revision status and pointer to agree at transaction commit.
- Migration guards stop deployment if legacy pages have no revision or legacy publication state is inconsistent.
- The publish command locks the site and draft, runs release-readiness checks, archives the exact current revision and moves the pointer atomically.
- The readiness command checks organisation-admin ownership, brand identity and colours, navigation, all four standard pages, every structured content block and an active domain.
- The content fingerprint identifies exactly what passed the publication gate.
- Draft creation clones the pointer revision, not whichever row happens to have the newest timestamp.
- Draft discard is explicit and cannot remove the first unpublished site revision.
- Direct browser mutation privileges are removed from sites, domains, revisions, pages and publication evidence. Authenticated users reach guarded administrator commands only.
- Privileged functions use an empty `search_path`, fully qualified relations and explicit execution grants.

## CRM workflow

Website Studio now shows whether the current draft is ready to publish and lists actionable blockers. Publication is disabled until the server-side gate passes. An administrator confirms publication or draft discard before it runs.

When no draft exists, the administrator can select a specific archived recovery point. The interface makes clear that recovery publishes a new copy and retains both the selected history and the previously live revision. Recent publication events are visible in the workspace for support and audit work.

## Public isolation

The public application rejects a host unless its active domain resolves to a published site with a non-null exact revision pointer. It verifies that the revision belongs to that site and is published. Standard and campaign page queries then include both `website_site_id` and the exact `revision_id`; they never select public content by "latest" timestamp or status alone.

Listing publication remains independent. Restoring website content does not publish, unpublish or rewrite CRM listing-channel state.

## Verification

Run the source contracts and builds:

```bash
npm --prefix the-it-guy run test:public-websites-phase6
npm --prefix the-it-guy run test:public-websites-phase5
npm --prefix the-it-guy run test:public-websites-phase4
npm --prefix the-it-guy run test:public-websites-phase3
npm --prefix the-it-guy run test:public-websites-phase2
npm --prefix the-it-guy run test:public-websites-phase1
npm --prefix the-it-guy run build
npm --prefix apps/websites run typecheck
npm --prefix apps/websites run build
```

With the local Supabase stack running:

```bash
supabase db reset
supabase test db
supabase db lint --level warning
```

The Phase 6 pgTAP suite verifies schema controls, RLS, direct-mutation denial and guarded command grants.

## Non-production release gate

Phase 6 is not operationally complete until the migrations are applied to a non-production Supabase environment and the following evidence is recorded against two test organisations:

1. Publish organisation A, create and edit its next draft, and confirm every public A route still renders the pinned prior revision.
2. Confirm host B cannot resolve or request A's pages, revision ids, properties or publication history.
3. Publish A's draft and confirm branding plus all standard and campaign pages switch together.
4. Attempt publication with each gate deliberately broken: missing standard page, invalid content block, incomplete colours and inactive domain. Confirm no public pointer changes.
5. Restore a selected archived revision. Confirm a new revision number becomes live, the selected archived row remains archived and the prior live revision remains recoverable.
6. Force a failed publish transaction and confirm site, revision and public output remain on the prior version.
7. Publish, update and unpublish one CRM listing; confirm the public property result changes without altering the website content revision.
8. Submit a lead before and after publication; confirm CRM idempotency and attribution still identify the exact published page.
9. Run database lint/advisor checks and verify no new RLS or function-search-path warnings.
10. Repeat the public navigation, search, property and enquiry journeys at 320px, 375px and 768px, plus current iOS Safari and Android Chrome.

## Release position

Phases 0–7 are implemented at source level. The Phase 7 one-agency controls, deployment workflow and evidence gate are defined in `public-websites-phase7-staging-pilot.md`; live staging activation is still pending. This is not yet a production release. Phase 8 begins only after the protected pilot evidence reports `PASS`.
