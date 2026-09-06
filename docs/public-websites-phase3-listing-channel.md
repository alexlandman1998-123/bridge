# Public Websites — Phase 3 Listing Channel

**Status:** implemented locally; migration deployment and environment smoke test pending

**Implemented:** 5 September 2026

## Outcome

The CRM listing detail now has an explicit Agency Website channel with Publish, Update and Unpublish controls. The CRM remains the listing source of truth, and the agency website is a controlled distribution destination rather than a second listing editor.

## Publication model

Publishing or updating performs two deliberate steps:

1. save the current listing and canonical `listing_publication_data` projection; and
2. create or refresh one `website_listing_publications` record containing an allow-listed public snapshot and ordered supported media.

Unpublishing changes only the website-channel state. It does not delete or archive the CRM listing and does not withdraw another portal channel.

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
- at least one HTTPS image.

The public snapshot excludes internal notes, seller/contact data, documents, workflow data and unsupported media types.

## Security

- Both RPCs require `auth.uid()` and verify active membership of the listing's organisation.
- The channel table has RLS enabled and grants no direct access to `anon` or `authenticated` clients.
- The server-only public website role receives read-only access to the public snapshots.
- The `SECURITY DEFINER` functions use an empty `search_path`, fully qualified objects, allow-listed actions, and explicit execute revocation from `PUBLIC` and `anon`.
- One unique row per listing prevents duplicate public entries across repeated publication requests.

## Verification

```bash
npm --prefix the-it-guy run test:public-websites-phase3
npm --prefix the-it-guy run build
npm --prefix apps/websites run typecheck
npm --prefix apps/websites run build
supabase test db
```

The pgTAP test is included at `supabase/tests/public_websites_phase3_listing_channel_rls_test.sql`. It requires a running local Supabase stack.

## Deployment gate

Apply the Phase 1–3 migrations to non-production Supabase, then verify with two test organisations that:

1. organisation A cannot inspect or mutate organisation B's channel state;
2. incomplete, Draft and cross-organisation projections cannot be published;
3. Publish produces exactly one public result and a repeat does not duplicate it;
4. editing the CRM listing does not alter the public snapshot until Update is selected;
5. Update changes the existing public result without changing its identity;
6. Unpublish removes the public result without deleting the CRM listing;
7. unsupported or non-HTTPS media never appears publicly; and
8. the public URL returns not found after the canonical projection is no longer Published.

Phase 4 should start only after this database-backed smoke test passes in non-production.
