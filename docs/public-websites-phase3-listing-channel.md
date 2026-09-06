# Public Websites — Phase 3 Listing Channel

**Status:** implemented and verified in isolated staging for the Kingstons Real Estate pilot

**Implemented:** 5 September 2026

**Durable media pipeline verified:** 6 September 2026

## Outcome

The CRM listing detail now has an explicit Agency Website channel with Publish, Update and Unpublish controls. The CRM remains the listing source of truth, and the agency website is a controlled distribution destination rather than a second listing editor.

## Publication model

Publishing or updating performs three deliberate steps:

1. save the current listing and canonical `listing_publication_data` projection; and
2. invoke the authenticated `website-listing-publication` function, which copies project-owned private images and floor plans into immutable, content-addressed paths in the public `listing-media` bucket; and
3. atomically register the durable assets and create or refresh one `website_listing_publications` record containing an allow-listed public snapshot and ordered supported media.

Unpublishing changes only the website-channel state, retires its public media ledger entries and asks Storage to remove the website-owned copies. It does not delete or archive the CRM listing, its private source media, or another portal channel. Failed Storage cleanup is returned as a pending count and can be retried safely.

The public website serves a listing only when all three conditions remain true:

- the hostname resolves to the listing's organisation website;
- the website-channel record has `status = 'published'`; and
- the canonical listing projection still has `status = 'Published'` and belongs to the same organisation.

This gives Update a real synchronization boundary: CRM edits do not leak into the live agency website until Update is selected. If the canonical projection is withdrawn or archived, the listing stops rendering even if a stale channel row remains.

## Readiness requirements

The database rejects publication unless the organisation website is published and has an active domain, and the listing has:

- a Published canonical projection;
- a public title;
- a property and transaction type;
- a positive asking price;
- a suburb; and
- at least one HTTPS image whose source is in an approved bucket owned by the same Supabase project.

Every image and floor plan must have an active `website_listing_media_assets` entry before the database accepts the public snapshot. Cross-project and arbitrary external image URLs are rejected instead of being fetched server-side. Public object paths include organisation, website, listing and source-media UUIDs plus a SHA-256 content fingerprint; uploads never overwrite an existing CDN object.

The public snapshot excludes internal notes, seller/contact data, documents, workflow data and unsupported media types.

## Security

- The readiness RPC requires `auth.uid()` and verifies active membership of the listing's organisation.
- The channel table has RLS enabled and grants no direct access to `anon` or `authenticated` clients.
- The media ledger has RLS enabled, denies direct browser writes and grants its registration command only to `service_role`.
- The server-only public website role receives read-only access to the public snapshots.
- The Edge Function verifies the caller with `auth.getUser`, and the registration command independently checks the actor's active organisation membership.
- The legacy browser-callable mutation is removed; only the service role can register media and commit publication, so direct clients cannot bypass copy or cleanup.
- The `SECURITY DEFINER` functions use an empty `search_path`, fully qualified objects, allow-listed actions, and explicit execute revocation from `PUBLIC` and `anon`.
- One unique row per listing prevents duplicate public entries across repeated publication requests.

## Verification

```bash
npm --prefix the-it-guy run test:public-websites-phase3
npm --prefix the-it-guy run build
npm --prefix apps/websites run typecheck
npm --prefix apps/websites run build
supabase test db
deno test supabase/functions/_shared/websiteListingMedia.test.ts
```

The pgTAP tests are included at `supabase/tests/public_websites_phase3_listing_channel_rls_test.sql` and `supabase/tests/public_websites_durable_listing_media_test.sql`. They require a running local Supabase stack or controlled execution against non-production.

The staging smoke test passed publish, no-op republish, update, unpublish and republish with nine images. A reversible source-image replacement produced a new content-addressed path, removed the superseded object, and restored the original path with no cleanup backlog. A forced ninth-image failure removed the eight objects copied earlier in that attempt before the listing was restored. A cross-tenant authenticated user was denied before media access, and direct browser calls cannot reach either the removed legacy command or the service-only commit.

## Deployment gate

Apply the Phase 1–3 migrations to non-production Supabase, then verify with two test organisations that:

1. organisation A cannot inspect or mutate organisation B's channel state;
2. incomplete, Draft and cross-organisation projections cannot be published;
3. Publish produces exactly one public result and a repeat does not duplicate it;
4. editing the CRM listing does not alter the public snapshot until Update is selected;
5. Update changes the existing public result without changing its identity;
6. Unpublish removes the public result without deleting the CRM listing;
7. source signed URLs never appear in the public snapshot;
8. replacing or removing source media retires and removes obsolete website-owned objects;
9. cross-project, arbitrary external, oversized and unsupported media fail closed; and
10. the public URL returns not found after the canonical projection is no longer Published.

Phase 4 should start only after this database-backed smoke test passes in non-production.
