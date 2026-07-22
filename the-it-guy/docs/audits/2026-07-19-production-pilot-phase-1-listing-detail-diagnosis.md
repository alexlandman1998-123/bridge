# Production pilot phase 1 — listing-detail diagnosis

## Crash path addressed

The production error did not include a source stack trace. Source review identified an unguarded `item.id` lookup while the listing-detail route located the requested listing. A malformed `null` entry in its listing collection could therefore throw before the page's existing “Listing not found” recovery view rendered, escalating to the application-shell error boundary.

The route now normalises listing collections at their storage and detail-workspace boundaries, performs null-safe identity matching, and treats malformed route ids as a recoverable invalid-link state.

## Scope and limits

This protects the app from malformed local/runtime listing entries and bad URL encoding. It does not assert that the deployed asset set is current; that release-integrity issue remains a Phase 3 verification item.

## Verification

- `npm run test:private-listing-record-integrity`
- `npm run build`

## Phase 2 hardening

- The listing-detail route is isolated behind its own recovery boundary, with a direct **Back to Listings** path instead of taking down the application shell.
- The detail loader rejects a remote record whose identity does not match the requested listing id.
- Legacy `listingId` and `listing_id` records are normalised to a canonical `id` before the workspace uses them.

## Phase 3 deployment integrity

- Every build now emits `release-manifest.json` and a matching `arch9-release` HTML marker.
- The manifest verifies the entry path and listing-detail chunk (including its transitive imports) after build and against the deployed app.
- `index.html` and the manifest are non-cacheable; content-addressed `/assets/*` files are immutable.
