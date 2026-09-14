# Arch9 Email Campaigns — Content studio

The primary workspace has a guided Details step and a visual Content workspace. The Email Campaign landing page is unchanged.

## Composition and persistence

- Campaign name, subject, preview, actual consent category and verified sender appear together with a live checklist and inbox preview. Missing required fields block progression and explain why.
- Draft saves are debounced and serialized. The saved campaign ID is retained in the URL; draft details also expose **Continue editing**. Changes made during a save are persisted in the next save.
- The version-1 document in `email_campaigns.content_json` stores global defaults and Header, Text, Image, Button, Property listing, Divider, Social links and Footer blocks. Rich text is restricted to supported markup.
- The canvas supports selection, insertion, drag reordering, keyboard-operable move buttons, duplication, deletion, undo/redo and mobile preview. Footer content is restored by document normalization and cannot be removed from the visual editor.
- Listings come from the existing organisation-scoped listing service. Selected card data is copied into the document; an empty public URL must be corrected before Review. Images can be chosen from listing media or supplied as permanent public URLs. No new image-storage bucket is introduced.
- Templates retain their structured document. Replacing content requires confirmation. Legacy HTML templates open in Advanced HTML, which preserves the visual version for returning later.
- Database-triggered, append-only revisions store saved campaign state; the history dialog can restore a version. The existing sending-time immutability guard protects content and listing snapshots.

## Delivery

`supabase/functions/_shared/emailDocument.js` provides the renderer for the editor, test function and worker. It produces table-based HTML, validates URLs, escapes content, and supplies merge-field fallbacks. The worker inserts each recipient’s unsubscribe URL, retains the existing consent/suppression checks and rewrites tracking links without losing query parameters. Test sends use the rendered document and a workspace-scoped preview recipient; they have a `[TEST]` subject and create no campaign recipient or analytics rows.

Sender setup adds a pending identity. An administrator must configure and verify the domain in Resend before verification refresh can make it eligible. Browser CORS handling is included on the test and sender-verification functions.

## Release requirements

Apply `supabase/migrations/20260913133840_email_visual_builder.sql` before releasing the UI: it permits incomplete draft subjects and adds revision storage. Deploy `email-campaign-test`, `email-campaign-worker`, and `email-sender-verification` with the shared renderer. These actions require explicit approval and the applicable environment guard. Production release was approved on 13 September 2026. The release also applies `20260913135936_email_revision_permissions.sql` to override broad production default grants, and `20260913140416_email_campaign_worker_schedule.sql` to schedule the worker once a minute. `20260913140752_email_campaign_scheduler_auth.sql` provisions a dedicated key in Vault; the worker validates it against a server-side SHA-256 verifier. `20260913140613_email_campaign_default_categories.sql` seeds the existing default category definitions without changing contact consent. Worker authorization fails closed and job/recipient claims are atomic. Unsubscribe links point directly to the deployed function. The unsubscribe, preference and tracking dependencies are deployed with the three updated functions. The scheduler completed a live empty run with HTTP 200; unauthenticated requests return 401. Draft saves and two revision captures were verified in a rolled-back authenticated database transaction. No real test email has been sent; the workspace still needs a verified sender and a consenting audience.

Verify the deployed flow with an approved internal test recipient before enabling production use. Image cropping and a general asset uploader remain outside this release; image selection uses existing listing media or permanent public URLs.

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
