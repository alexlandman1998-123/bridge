# Public website tenant boundaries

The public-websites product is a shared application. A client hostname resolves to one `website_sites` record and therefore one organisation. It is not acceptable for a server process, import, or malformed identifier to connect that site to another agency’s data.

## Boundary map

| Public surface | Primary scope | Database invariant |
| --- | --- | --- |
| Hostname, published revision, pages | website site + revision | Domain, revision, and page must resolve to the same site. |
| Listings and listing analytics | website site + organisation | A listing must belong to the organisation that owns the website site. |
| Website enquiries | hostname-resolved site + organisation | Receipt organisation, optional listing, and optional page must belong to that site. |
| Pre-approval requests | website site + organisation | The stored organisation and allocation rule must match the site’s organisation. |
| Blog posts, redirects, and media | website site + organisation + revision | Content organisation and revision must belong to the website site. |
| Blog listing cards | post organisation | The referenced listing must belong to the post’s organisation. |

`20260921115101_website_tenant_boundary_enforcement.sql` applies these invariants through `BEFORE INSERT OR UPDATE` triggers. They run for every writer, including service-role processes that bypass row-level security.

## Checks before promotion

Run these checks for any LWP or shared public-websites release candidate:

```bash
npm --prefix apps/websites run verify:tenant-boundaries
npm --prefix apps/websites run baseline:kingdom
```

After the migration is approved and applied to a non-production environment, query `public.website_tenant_boundary_violations`. It must return no rows before promotion. Applying the migration itself is intentionally not part of this phase; it requires a separately approved database rollout.
