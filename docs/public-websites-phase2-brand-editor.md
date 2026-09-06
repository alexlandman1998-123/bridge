# Public Websites — Phase 2 Brand Editor

**Status:** implemented and verified for Kingstons Real Estate in isolated staging; production untouched

**Implemented:** 6 September 2026

## Outcome

An organisation administrator can edit the identity of an existing website draft in Website Studio and see the result immediately in a compact live preview. Saving changes the website revision only; it does not modify the source organisation, document or email branding.

## Editable website values

- company display name;
- light-background and dark-background logos, by controlled workspace upload;
- primary, secondary and accent colours;
- contact email and phone;
- WhatsApp number; and
- company website URL.

The editor can reset every value from the organisation's current branding. Reset is explicit and also changes the website draft only.

## Public template rendering

The first `property-standard-v1` template now reads the published revision's light/dark logo, colours and contact values. Its shared header and footer are used by the home page, managed content pages, property search and property detail routes. Draft changes do not appear on a public site until that revision is published.

## Security and consistency

- `website-brand-publication` verifies the caller's JWT, then the service-only `website_commit_draft_brand` command independently verifies active organisation-admin membership.
- The command updates only a revision with `status = 'draft'` that belongs to the supplied site, and locks it during the write.
- Input is an allow-listed JSON object. Values must be text; colours must be six-digit hex values; company website URLs must use HTTPS; email and field lengths are validated.
- Arbitrary external logo URLs are no longer accepted. A logo must resolve to an approved Storage object owned by the same Supabase project.
- Before save, reset, initial creation or publication, the server downloads the source logo, validates its type and 10 MB limit, hashes it and writes an immutable public copy below `organisations/{organisation}/websites/{site}/branding/{variant}/{sha256}.{extension}`.
- `website_brand_assets` records the source, fingerprint, exact public URL, tenant, variant and cleanup state. Browser roles have no direct write access to this ledger or the commit command.
- Failed multi-logo copies are compensated. Replaced objects are retained while any draft, published or archived revision references them, then retired and removed when no revision needs them.
- Publication readiness rejects any draft logo that is not registered as an active durable website asset. The publisher can automatically repair a legacy draft during the publish action.
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

## Staging evidence

Migration `20260906090949_public_websites_durable_brand_assets.sql` and the `website-brand-publication` Edge Function are deployed to `Arch9 Staging` only. The pgTAP contract passes all 17 checks.

Kingstons Real Estate passed the live staging flow as its principal actor:

1. existing organisation identity values were copied and registered without manual storage repair;
2. light and dark logos were written to immutable website-owned paths and return HTTP 200;
3. revision 5 was published with the original Kingstons identity and all three organisation colours;
4. the protected homepage and About page return HTTP 200 and contain the exact durable logo paths;
5. a temporary replacement logo was saved to a later draft without changing the live revision;
6. reset restored the organisation branding, retired and deleted the unused website object, and the test draft was discarded; and
7. an administrator from another organisation received HTTP 403 for a Kingstons brand mutation.

Production deployment remains a separate release decision and has not been performed.
