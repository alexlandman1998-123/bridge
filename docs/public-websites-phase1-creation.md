# Public Websites — Phase 1 Website Creation

**Status:** implemented locally; migration deployment pending

**Implemented:** 5 September 2026

## Outcome

An organisation administrator can create the organisation's first `property-standard-v1` website from Website Studio. One authenticated database command creates the complete starting state atomically and is safe to retry.

## Creation result

The command creates:

- one draft `website_sites` record owned by the selected organisation;
- one active, platform-managed preview hostname under `sites.propdata.co.za`;
- draft revision 1;
- website-specific brand values copied from `organisation_branding` with organisation fallbacks;
- default SEO values and navigation;
- Home, About, Contact and Valuation pages with structured starter content; and
- a Website Studio setup action that refreshes into the existing control centre after creation.

Copied brand values include the display name, light/dark logo URLs, primary/secondary/accent colours, email, phone, website and WhatsApp number where present. These values belong to the website revision after creation; later website edits do not mutate organisation, document or email branding.

## Security and consistency

- `website_create_site(uuid)` requires an authenticated caller and verifies `bridge_is_org_admin` for the target organisation.
- The function pins an empty `search_path` and fully qualifies database objects.
- Execute permission is revoked from `PUBLIC` and `anon` and granted explicitly to `authenticated`.
- The organisation row is locked while creating the site, preventing concurrent duplicate setup.
- The existing organisation-site uniqueness constraint remains the final concurrency guard.
- A retry returns the existing site rather than creating new pages or domains.
- No service-role credential is introduced into the CRM browser application.

## Verification

Local contract verification:

```bash
npm --prefix the-it-guy run test:public-websites-phase1
```

Application build verification:

```bash
npm --prefix the-it-guy run build
```

## Deployment gate

The migration must be applied to the chosen non-production Supabase environment before the setup action can be exercised. After deployment, use a test organisation administrator to verify:

1. the first call returns `created: true`;
2. a repeat call returns `created: false` with the same site id;
3. a non-administrator receives an authorisation error;
4. the brand JSON matches the organisation branding at creation time;
5. four standard pages and exactly one preview domain exist; and
6. no partial records remain when a deliberately invalid setup is rolled back.

Phase 2 starts after this database-backed smoke test passes.
