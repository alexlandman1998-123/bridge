# Arch9 Email Campaigns — Content studio

The primary workspace has a guided Details step and a visual Content workspace. The Email Campaign landing page is unchanged.

## Composition and persistence

- Campaign name, subject, preview, actual consent category and verified sender appear together with a live checklist and inbox preview. Missing required fields block progression and explain why.
- Draft saves are debounced and serialized. The saved campaign ID is retained in the URL; draft details also expose **Continue editing**. Changes made during a save are persisted in the next save.
- The version-1 document in `email_campaigns.content_json` stores global defaults and Header, Text, Image, Button, Property listing, Divider, Social links and Footer blocks. Rich text is restricted to supported markup.
- The canvas supports selection, insertion, drag reordering, keyboard-operable move buttons, duplication, deletion, undo/redo and mobile preview. Footer content is restored by document normalization and cannot be removed from the visual editor.
- Listings come from the existing organisation-scoped listing service. Selected card data is copied into the document; an empty public URL must be corrected before Review. Images can be chosen from listing media, the campaign image library, or supplied as permanent public URLs.
- Templates retain their structured document. Replacing content requires confirmation. Legacy HTML templates open in Advanced HTML, which preserves the visual version for returning later.
- Database-triggered, append-only revisions store saved campaign state; the history dialog can restore a version. The existing sending-time immutability guard protects content and listing snapshots.

## Delivery

`supabase/functions/_shared/emailDocument.js` provides the renderer for the editor, test function and worker. It produces table-based HTML, validates URLs, escapes content, and supplies merge-field fallbacks. The worker inserts each recipient’s unsubscribe URL, retains the existing consent/suppression checks and rewrites tracking links without losing query parameters. Test sends use the rendered document and a workspace-scoped preview recipient; they have a `[TEST]` subject and create no campaign recipient or analytics rows.

Sender setup adds a pending identity. An administrator must configure and verify the domain in Resend before verification refresh can make it eligible. Browser CORS handling is included on the test and sender-verification functions.

## Release requirements

Apply `supabase/migrations/20260913133840_email_visual_builder.sql` before releasing the UI: it permits incomplete draft subjects and adds revision storage. Deploy `email-campaign-test`, `email-campaign-worker`, and `email-sender-verification` with the shared renderer. These actions require explicit approval and the applicable environment guard. Production release was approved on 13 September 2026. The release also applies `20260913135936_email_revision_permissions.sql` to override broad production default grants, and `20260913140416_email_campaign_worker_schedule.sql` to schedule the worker once a minute. `20260913140752_email_campaign_scheduler_auth.sql` provisions a dedicated key in Vault; the worker validates it against a server-side SHA-256 verifier. `20260913140613_email_campaign_default_categories.sql` seeds the existing default category definitions without changing contact consent. Worker authorization fails closed and job/recipient claims are atomic. Unsubscribe links point directly to the deployed function. The unsubscribe, preference and tracking dependencies are deployed with the three updated functions. The scheduler completed a live empty run with HTTP 200; unauthenticated requests return 401. Draft saves and two revision captures were verified in a rolled-back authenticated database transaction. No real test email has been sent; the workspace still needs a verified sender and a consenting audience.

Verify the deployed flow with an approved internal test recipient before enabling production use. Image cropping remains outside this release. The campaign image hosting foundation described below adds uploads alongside existing listing media and public URLs.

## Campaign image hosting foundation (9 October 2026)

The primary workspace's Content step includes **Campaign images** in Advanced HTML and in the visual editor's header/image inspector. Members of the agency can upload JPG, PNG, GIF or WebP images up to 5 MB, copy a permanent image link, or select an uploaded image for a visual block. The library shows the latest 100 completed images. Older URLs remain available. The next section describes the HTML/package import built on this foundation.

`20261009113022_email_campaign_image_assets.sql` creates the public `email-campaign-images` bucket and the agency-scoped `email_campaign_assets` registry. The browser first reserves a unique path through `email_campaign_reserve_asset`, uploads without overwriting, then confirms the stored object through `email_campaign_list_assets`. The list returns only files with matching Storage MIME type and byte count. Interrupted responses are checked against the receipt before reporting success; refreshing the library recovers completed uploads. Failed reservations remain hidden and no automatic deletion is attempted.

These assets are intentionally append-only: browser clients cannot change or delete their registry rows, overwrite or move the files, or delete them. Restrictive Storage policies retain those boundaries even when another permissive policy exists. This protects draft, scheduled, sent and archived campaign references, template reuse and revision restores without relying on client-side reference tracking. Replacing an image means uploading a new asset and selecting its new URL. Public image bytes require no recipient login; library listings and upload reservations require agency membership. No service-role credential is used in the browser.

Retention is indefinite in this phase, including unused completed uploads. There is no storage billing or automated cleanup. Platform operators with privileged Storage access can still remove objects; an eventual retention tool must preserve campaign/template/revision references. Existing listing or external image URLs are not copied into this bucket and do not acquire these guarantees.

The migration is prepared locally, not applied to a hosted database. Before release, explicitly approve the target environment, run the applicable Supabase guard and release runbook, and apply only this migration before the updated app. The image library alone needs no Edge Function changes; the phase-3 delivery checks below do. After an approved release, upload an agency-owned sample, confirm its public URL loads without a session, confirm a second agency cannot list or manage it, and perform an approved inbox test. Keep the previous app for rollback and preserve the bucket and registry; do not delete uploaded assets when rolling back.

Focused local verification from `the-it-guy/`:

```sh
npx vitest run src/services/__tests__/emailCampaignAssetService.test.js src/components/marketing/__tests__/emailCampaignAssets.test.js src/components/marketing/__tests__/EmailCampaignImages.test.jsx src/components/marketing/__tests__/EmailCampaignBuilder.test.jsx src/components/marketing/__tests__/emailDocument.test.js src/components/marketing/__tests__/emailRevisions.test.js src/pages/__tests__/EmailWorkspaceNavigation.test.jsx
```

The database tests execute the migration in isolated PGlite, with deliberately broad legacy Storage policies and default table grants. They check tenant isolation, anonymous denial, path reservation, MIME/size eligibility and immutable storage/registry behavior. Service/UI tests mock the provider; they check file validation, permanent URLs, interrupted uploads, workspace switches and selection in the visual editor. These checks perform no hosted writes and send no email.

## Designer email import (phase 2, 9 October 2026)

The primary workspace's Content toolbar now offers **Upload email** in both visual and Advanced HTML modes. Select a ZIP containing exactly one UTF-8 HTML email and its images, or select the HTML file and images together. A review dialog shows a sandboxed local preview, each required image path, and any missing or ambiguous file. Users can choose a replacement for each path before confirming **Host images and replace email**. Reading and previewing the package performs no hosted upload and leaves the existing email intact. Preview images use inline bytes because the opaque sandbox cannot read the parent page's blob URLs; image validation and a 70 MB preview expansion cap prevent oversized replacements or repeated references from exhausting the browser.

The importer resolves nested folders, relative paths, encoded filenames and unique basename matches for separately selected files. It replaces image `src`, `srcset`, HTML background attributes, CSS `url()` references in inline/style-block CSS, and Outlook conditional VML image references. It uses parse5 source locations to edit only URLs; it does not serialize and reconstruct the designer's document. Existing HTTPS/HTTP image URLs remain external and protocol-relative image references become HTTPS. Links, table layout and conditional comments are preserved. External images are not fetched or copied to Arch9.

All supplied images are checked before uploading begins. Only referenced local files are hosted, repeated references reuse one upload, and all files must receive confirmed permanent public URLs before the draft is replaced. An upload failure retains the review and leaves the draft intact; retrying the same import reuses confirmed uploads for that agency. Closing the dialog or changing agency prevents further uploads and discards the pending replacement. An upload already in progress can finish and remain in the append-only library. The imported document stores `importedEmail` source/asset metadata alongside `advancedHtml`, so ordinary draft, template and revision persistence retain it. Undo restores the prior content.

Limits are 25 MB per ZIP, 750 KB for HTML, 5 MB per image, 50 MB of expanded supported files and 200 ZIP entries including folders. ZIP paths cannot escape the package. SVG, embedded/CID images, dynamic image paths and local/imported stylesheets require a corrected export. Missing/unsupported local resources also block Review and test sends in the editor after manual HTML edits. Phase 3 adds the server-side checks described below. The HTML lives in the campaign document; this phase does not publish a separate public web version of the email.

This phase needs the phase-1 image-hosting migration and the updated app, with no additional migration or Edge Function deployment. Hosted rollout and an approved real inbox test remain pending. The HTML parser is pinned to the already installed parse5 7.3.0; ZIP extraction uses the existing fflate dependency.

Focused import verification, from `the-it-guy/`:

```sh
npx vitest run src/services/__tests__/emailCampaignImportService.test.js src/components/marketing/__tests__/EmailCampaignImport.test.jsx src/components/marketing/__tests__/EmailCampaignBuilder.test.jsx
npm run test:email-campaign-landing
npm run build
```

Import tests cover nested ZIPs, CSS/Outlook/source preservation, missing and ambiguous files, invalid images, archive limits/path traversal, preview-before-upload, failed import retries, cancellation, asset metadata persistence, Undo, and blocked sends for unresolved paths. Browser verification uses an isolated local provider fixture; it does not verify hosted Storage or email delivery.

## Hosted-email delivery checks (phase 3, 9 October 2026)

The primary workspace now checks imported HTML during package review, manual editing, Review, test sending and campaign dispatch. **Check content and hosted images** checks the saved draft on the server; scheduling repeats that check. Results expire in the editor when the content, preview or sender changes. Scheduling through a direct database call can still create a queue entry, but the worker checks the current saved content before claiming recipients or contacting the email provider.

`_shared/emailContent.js` and `_shared/emailHtmlAssets.js` use the same pinned parse5 parser in the editor and Edge Functions. The versioned `content_json` document is authoritative; stale separately supplied `html` and import manifests cannot substitute for it. Validation includes Outlook conditional content and rejects executable markup/CSS, event handlers, interactive controls, linked stylesheets, unresolved local/CID/embedded resources, private or credential-bearing image addresses, signed/expiring image links, unsupported document versions, unclosed comments/style blocks and HTML over 750 KB measured as UTF-8 bytes. These checks reject unsafe exports without rewriting the designer's document. Normal tables, CSS and Outlook markup remain source-preserved.

Compatibility findings are warnings: flex/grid/positioned layouts, custom fonts, missing alternative text, responsive sources without reliable inbox support, WebP, HTTP images and HTML over 100 KB. They do not prevent sending. A browser preview and these heuristics do not certify inbox rendering. [Caniemail's flex support results](https://www.caniemail.com/features/css-display-flex/) and [WebP support results](https://www.caniemail.com/features/image-webp/) illustrate why a real test in the recipient inboxes remains necessary.

`_shared/emailCampaignContentCheck.ts` derives image references from actual HTML and checks agency ownership against `email_campaign_assets`. For the configured project's public `email-campaign-images` URLs, it confirms the registry receipt and performs unauthenticated public HEAD requests, requiring successful status and matching MIME type and byte count. Encoded bucket names cannot bypass ownership checks; transformed campaign-image URLs require the original library link so bytes can be confirmed. Redirects are refused, concurrency is capped at six and all requests share a ten-second deadline. It never fetches arbitrary external hosts; external images get an explicit availability/retention warning. A successful check confirms availability at that time, not future retention. The phase-1 append-only policies continue to protect hosted references from ordinary user edits/deletion.

The new authenticated `email-campaign-content-check` function reads a saved campaign through the user's existing database permissions and checks send permission. The test sender and worker independently enforce the shared checks before contacting Resend, including rechecking that the sender is verified and active. Existing worker authorization, agency approval, consent/suppression rechecks, daily limits, atomic claims, tracking and provider idempotency remain in place. Invalid queued content or a sender paused after scheduling fails the remaining queued recipients and the dispatch job; a campaign with earlier successful recipients becomes `partially_failed`.

Advanced/legacy HTML receives the agency/sender footer and each recipient's unsubscribe link inside the HTML body. The shared renderer generates a readable plain-text alternative from the same content; test sends use a test disclaimer instead of a personal unsubscribe link. Recipient merge values remain escaped. Final rendered/tracked HTML is checked again before sending. Accepted test requests are reported as accepted for delivery, rather than claiming inbox arrival.

This phase introduces no new database migration. Release requires the phase-1 image migration, the updated primary app and deployment of **email-campaign-content-check**, **email-campaign-test** and **email-campaign-worker** with their shared modules, per-function `deno.json` and dependency locks. The parser is pinned to 7.3.0 and the Supabase client to 2.49.9. Review existing drafts and pending campaigns before enabling the stricter worker: previously accepted unsafe HTML will now fail delivery. Hosted rollout still requires explicit approval of the target environment and the applicable guard/runbook. No hosted migration, deployment or real email delivery has been performed for this phase.

Focused local checks from `the-it-guy/`:

```sh
npx vitest run src/components/marketing/__tests__/emailContent.test.js src/services/__tests__/emailCampaignDelivery.test.js src/services/__tests__/emailCampaignContentService.test.js src/components/marketing/__tests__/EmailCampaignBuilder.test.jsx src/services/__tests__/emailCampaignImportService.test.js
npm run test:email-campaign-landing
npm run build
```

The delivery tests invoke the actual Edge handlers with isolated database/provider fixtures. They cover authentication and permissions, forged metadata, stale HTML, cross-agency images, missing/incomplete receipts, redirects, wrong MIME/size, unavailable images, direct test/queue bypasses, paused senders, consent changes, approval, footer placement, plaintext, tracking and idempotency. Each deployed function is also checked with its own Deno configuration and lock. Local browser verification uses a fixture with uploads, scheduling and delivery disabled. After an approved rollout, repeat agency isolation and public image checks, then send to an approved internal recipient and compare Gmail, Outlook and Apple Mail, including blocked images, links, unsubscribe and plain text.

Local verification on 9 October: 146 focused tests, the email landing check, existing campaign contract checks through phase 6 and all three Edge entrypoint type checks passed. Desktop/mobile fixture checks confirmed clear blocking errors, separate compatibility warnings, no mobile horizontal overflow and invalidation of an old server result after editing. Lint found no errors and one existing `AudienceStudio` warning. A full app build passed earlier in the implementation; final rebuilds were killed under concurrent build load, and a final isolated attempt hit Node's heap limit. Run a final full app build with sufficient memory before release.

## Sending-domain foundation

`20260914073546_email_sending_domains_phase1.sql` adds the organisation-scoped record that later domain onboarding uses. It stores the Resend domain ID, provider-generated DNS records, status, verification timestamps and provider error without exposing write access to browser clients. Sender identities can link only to a domain in the same organisation that matches the sender address. `20260914073806_email_sending_domain_guard_fix_phase1.sql` corrects that guard to derive the domain from the source email inside the trigger. Phase 1 does not create domains with Resend or expose a customer-facing setup screen; those are Phase 2 and Phase 3.

`email-sending-domain-create` is the Phase 2 server-only endpoint. It authenticates the current user, checks organisation send permission, reserves the canonical domain in Arch9 before calling Resend, then stores the provider ID and returned DNS records. It never returns provider credentials and rejects a domain already claimed by another organisation.

## Domain setup screen

Phase 3 adds the self-service domain flow to **Set up sender** in the campaign Details step. An authorised agency user can add a domain or dedicated sending subdomain, copy every provider-generated DNS record, refresh provider status and create a sender address linked to that exact domain. A sender remains pending until the refreshed domain is verified. `email-sender-verification` now retrieves each stored provider domain directly, saves its current status and DNS records, then updates the linked sender identities.

Phase 4 adds the provider verification command. After the DNS records are published, an authorised user can ask Arch9 to start Resend verification for one stored domain. The server-only endpoint immediately stores Resend's refreshed status and records, and keeps all matching sender identities pending until Resend returns `verified`.

## Local checks

From the primary app package:

```sh
npx vitest run src/components/marketing/__tests__
```

This covers rendering safety, merge fallbacks, listing snapshot stability, protected footer restoration, validation, in-flight draft edits, revision capture and history permissions. Existing campaign contract checks and the email landing check cover the integration boundaries; the existing Phase 7 check still refers to the previously removed `InsightsPanel` and is not a builder regression.
