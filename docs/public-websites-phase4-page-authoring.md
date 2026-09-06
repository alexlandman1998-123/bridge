# Public Websites — Phase 4 Page Authoring

**Status:** implemented locally; migration deployment and environment smoke test pending

**Implemented:** 5 September 2026

## Outcome

Website Studio now provides structured draft editing for the Home, About, Contact and Valuation pages and for the first-release campaign format. The public template reads the published Home page instead of hard-coded homepage copy, so the same draft → publish boundary governs branding and page content.

## Authoring model

Organisation administrators can edit:

- page title, search title, search description and optional HTTPS social image;
- hero, story, property collection, benefits, FAQ, enquiry and call-to-action sections;
- section order and visibility within the standard pages;
- benefit and FAQ items; and
- the campaign name, URL and content inside the single approved campaign structure.

Home retains a visible hero, property collection and general enquiry form. Contact and Valuation retain their required enquiry forms. The CRM journey is derived from the page type rather than being chosen by the editor.

Campaigns use one fixed layout: hero → property collection → campaign enquiry form. They can be created, edited and deleted only inside the current draft. Home, About, Contact and Valuation routes are fixed and cannot be added, renamed or deleted.

## Publication behaviour

- Page edits write only to a `draft` website revision.
- Saving a page never changes the current public revision.
- Publishing the draft atomically promotes the edited Home, standard and campaign pages using the existing website publication workflow.
- Hidden sections are omitted by the public renderer.
- The Home route loads its structured published page and preserves the mobile property-search journey.
- Page SEO metadata and optional social image are applied by the public Next.js application.

## Security and validation

- `website_save_draft_page` and `website_delete_draft_campaign` require authentication and verify organisation-administrator ownership.
- Both commands pin an empty `search_path`, fully qualify database objects and are not executable by `PUBLIC` or `anon`.
- Direct `INSERT`, `UPDATE` and `DELETE` privileges on `website_pages` are revoked from `authenticated`; browser writes must use the guarded commands.
- The database validates the block catalogue, type-specific fields, field lengths, local CTA destinations, HTTPS social images, item limits, required visible sections and page-specific CRM form purpose.
- Public content remains rendered as React text and structured links; arbitrary HTML, CSS and JavaScript are not accepted.

## Verification

```bash
npm --prefix the-it-guy run test:public-websites-phase4
npm --prefix the-it-guy run build
npm --prefix apps/websites run typecheck
npm --prefix apps/websites run build
supabase test db
```

The pgTAP privilege test is included at `supabase/tests/public_websites_phase4_page_authoring_rls_test.sql`. It requires a running local Supabase stack.

## Deployment gate

Apply the Phase 1–4 migrations to non-production Supabase, then verify with an organisation administrator that:

1. each standard page loads its seeded draft content and persists edits after refresh;
2. a second tenant cannot read or edit the first tenant's pages;
3. non-administrators and anonymous callers cannot use either mutation command;
4. unsafe CTA paths, HTTP social images, unknown fields and invalid block shapes are rejected;
5. standard routes cannot be renamed or deleted;
6. a campaign always retains the approved three-section layout and duplicate slugs are rejected;
7. saved draft copy does not appear on the live site before publication;
8. publishing changes the Home and standard routes together; and
9. the published Home search, page CTAs, hidden sections and campaign route work at 320px, 375px and 768px.

Phase 5 adds durable CRM lead routing, attribution, abuse protection and notification fallback. It must preserve the page and campaign identifiers now supplied by every structured lead-form block.
