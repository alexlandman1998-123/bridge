# Native business campaign Facebook posts

This is a local implementation for the primary Arch9 workspace. The new migration
and Edge Function changes have not been applied/deployed. No real Graph publish,
customer contact, provider read or remote database write was performed. Local
checks use isolated PostgreSQL and an injected mock Graph boundary. The existing
Meta console approval remains external release work.

Saved business campaigns with Social enabled can prepare an organic Facebook
Page post from their exact saved Social title/body. Supported families include
seller and buyer acquisition, preparation, buyer-demand searches, agent profiles,
approved testimonials, handovers, referrals, client check-ins and market updates.
Review requests have no Social channel. This path does not generate copy or infer
performance, sales, revenue or delivery.

The post can be plain text or include one chosen public HTTPS destination already
saved in the campaign's public source or playbook response. Arbitrary unsaved URL
or caption input, photos, Instagram, paid ads and automatic scheduling are outside
this path. The existing downloadable pack remains available for manual assets.
The preview displays text literally, including any markup characters.

## Review and publication

The actor must have current active staff membership, RLS access to the saved
campaign and owner/manager permission to publish. Campaign-specific permissions
must be saved, a buyer-demand brief must remain current and a market report needs
its source/date. Handover campaigns recheck the permitted completed transaction.
These checks establish permission/provenance, not independent truth of manually
reviewed public statements.

The same shared contact-provenance validator as the builder rejects older drafts
without provenance, unconfirmed contacts or changed source/override wording. At
preview and publication, an RLS-scoped loader checks current confirmed agency/
agent setup or the selected agent's active public card, including removed values.
Explicit campaign-only overrides remain valid only against the exact reviewed raw
source. The saved agency name must remain current as well.

The server creates an immutable preview tied to the exact saved campaign revision,
actor, organisation and connected Page. A stable request UUID recovers the same
preview if its response is lost; reusing it for different content is rejected.
The Page must still have posting scope and a content-creation task.

Only the separate **Publish now** action sends to Graph. It rechecks current
campaign access, revision, saved content and Page capability. A service-only claim
locks the campaign, checks its revision/channel/membership again and moves the
preview from `draft` to `publishing` once. It then posts to the selected Page's
`/feed`, immediately, with the reviewed message and optional saved link.

Only a provider-confirmed post ID produces `published`, a public Facebook URL and
publication time. A definitive provider rejection is `failed`. An interrupted or
ambiguous result is `unknown` (or remains `publishing` if storage is unavailable).
None of these submitted states automatically retry Graph. Check the Page before
creating another post after an uncertain result. Editing a campaign does not edit
an existing public Facebook post.

The dedicated `meta_campaign_posts` table associates native results with the
campaign and revision. It is service-only; authenticated clients cannot read or
write it directly, claim publication or obtain Page tokens. History is projected
through the authenticated Edge Function after campaign access checks. Email and
WhatsApp activity IDs are not overloaded for Facebook.

## Source and activation

- `supabase/migrations/20261025210451_campaign_facebook_posts.sql`: service-only
  storage, immutable preview/status protection and atomic publication claim.
- `supabase/functions/_shared/campaignFacebookPost.js`: bounded public projection.
- `supabase/functions/_shared/campaignFacebookContacts.js`: current actor-scoped
  public contact routing and shared provenance validation.
- `supabase/functions/meta-integrations/handler.js`: preview, history and explicit
  publish actions, using the existing scoped connection/token/Graph boundary.
- `supabase/functions/meta-integrations/index.ts`: actor RLS campaign loader and
  completed-handover validation.
- `the-it-guy/src/components/marketing/CampaignFacebookPostPanel.jsx`: exact
  preview, separate Publish now and actual post history.
- `the-it-guy/scripts/campaign-facebook-posts.test.mjs`: actual migration and
  handler query checks with mocked Graph.
- `the-it-guy/src/components/marketing/__tests__/CampaignFacebookPostPanel.test.jsx`:
  UI confirmation, stale-context, plain-text and interrupted-response checks.

Run the focused Node check and UI check serially on this limited-memory machine:

```sh
cd the-it-guy
node --test --test-concurrency=1 scripts/campaign-facebook-posts.test.mjs
npx vitest run src/components/marketing/__tests__/CampaignFacebookPostPanel.test.jsx --maxWorkers=1
```

Before deployment: review the exact migration and Edge changes, verify the target
schema and current Meta App Review/Page permission state, and follow the repository
release procedure after explicit approval. Do not apply unrelated pending
migrations. Real publication is a separate intentional action after those checks.
Before-copies are in `output/campaign-business-20261025/before/`.
