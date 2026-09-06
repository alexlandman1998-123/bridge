# Public Websites — Phase 2 Brand Editor

**Status:** implemented locally; migration deployment and environment smoke test pending

**Implemented:** 5 September 2026

## Outcome

An organisation administrator can edit the identity of an existing website draft in Website Studio and see the result immediately in a compact live preview. Saving changes the website revision only; it does not modify the source organisation, document or email branding.

## Editable website values

- company display name;
- light-background and dark-background logos, by upload or HTTPS URL;
- primary, secondary and accent colours;
- contact email and phone;
- WhatsApp number; and
- company website URL.

The editor can reset every value from the organisation's current branding. Reset is explicit and also changes the website draft only.

## Public template rendering

The first `property-standard-v1` template now reads the published revision's light/dark logo, colours and contact values. Its shared header and footer are used by the home page, managed content pages, property search and property detail routes. Draft changes do not appear on a public site until that revision is published.

## Security and consistency

- `website_update_draft_brand(uuid, uuid, jsonb, boolean)` requires an authenticated caller and verifies `bridge_is_org_admin` against the site's organisation.
- The function updates only a revision with `status = 'draft'` that belongs to the supplied site, and locks it during the write.
- Input is an allow-listed JSON object. Values must be text; colours must be six-digit hex values; logo and website URLs must use HTTPS; email and field lengths are validated.
- The privileged function pins an empty `search_path`, fully qualifies database objects, and is not executable by `PUBLIC` or `anon`.
- Logo upload uses the existing organisation-scoped branding bucket rules. The website stores the resulting asset URL in its draft revision.
- The public renderer continues to resolve only `published` sites and `published` revisions.

## Verification

Run the Phase 1 and Phase 2 contract checks:

```bash
npm --prefix the-it-guy run test:public-websites-phase1
npm --prefix the-it-guy run test:public-websites-phase2
```

Run both application checks:

```bash
npm --prefix the-it-guy run build
npm --prefix apps/websites run typecheck
npm --prefix apps/websites run build
```

## Deployment gate

Apply the Phase 1 and Phase 2 migrations to a non-production Supabase environment, then verify with an organisation administrator that:

1. existing organisation identity values are present when the website is created;
2. both logo uploads render in the Website Studio preview;
3. save persists after a full browser refresh;
4. reset restores current organisation branding without changing the organisation branding row;
5. an invalid colour, HTTP URL, unsupported field and non-administrator request are rejected;
6. the public website remains unchanged while the edited revision is a draft; and
7. after publishing, the shared header/footer and all public routes render the saved identity.

Phase 3 can proceed in parallel locally, but deployment should not advance beyond non-production until this database-backed smoke test passes.
