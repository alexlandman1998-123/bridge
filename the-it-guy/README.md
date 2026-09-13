# bridge.

High-end React + Vite + Supabase transaction workspace for Samlin Construction.

## Retired document generator

The legacy mandate/OTP generator, template workspace, packet signing endpoints,
and background generation jobs are permanently retired. Seller onboarding must
not create a mandate packet. Signed mandates and OTPs use the normal listing or
transaction document upload paths; the onboarding defects/compliance form remains
independent. Existing document records and final-file access are preserved.

Run `node --test scripts/document-generator-retirement.test.mjs` from this package
to check the retirement boundary and independent upload behavior. Server handler
changes require an explicit deployment before they affect an existing environment.

## Current Workflow Layer

- Multi-development SaaS layout
- `Dashboard -> Developments -> Development Detail (Cards/Pipeline) -> Unit Detail`
- Global `+ New Transaction` 3-step wizard (Deal Setup -> Finance Details -> Transaction Status)
- Dynamic finance capture for `cash`, `bond`, and `hybrid`
- Auto buyer link/create + transaction save + unit status update
- External transaction portal links for:
  - client / buyer
  - tuckers
  - bond originator
  With token-based upload access at `/external/:accessToken`
- Progress timeline (full + compact)
- Notes/activity feed
- Right sidebar document checklist + uploaded files
- Lightweight admin create flows:
  - Add Development
  - Add Unit
- Development-level supporting document setup (requirements drive checklist + 3/4 style progress)
- Reports page with print styling
  - report type selector: `Overview Report` and `Unit View Report`
  - live filters for development/scope/finance/stage/risk
  - preview and export current selected report mode to PDF
- Executive Mobile Snapshot module:
  - dashboard link generation per user/token
  - shareable mobile route at `/snapshot/:token`
  - read-only portfolio metrics, development cards, alerts, recent movement
- Controlled Client Portal module:
  - token route at `/client/:token` with dedicated mobile-friendly experience
  - client-safe progress + documents view
  - client issue/snag submissions
  - optional alteration requests (feature toggle)
  - optional service reviews gated by stage + feature toggle
  - internal unit detail integration for issues/alterations/reviews + status updates

## Routes

- `/dashboard`
- `/developments`
- `/developments/:developmentId`
- `/units`
- `/units/:unitId`
- `/transactions`
- `/documents`
- `/reports`
- `/external/:accessToken`
- `/snapshot/:token`
- `/client/:token`
- `/client/:token/issues`
- `/client/:token/alterations`
- `/client/:token/review`

## Setup

1. Install dependencies:

```bash
npm i
```

2. Configure environment variables:

```bash
cp .env.example .env
```

`.env`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_KEY=your-anon-key
```

3. Run schema:

- `sql/schema.sql`

4. Run seed:

- `sql/seed.sql`

5. Configure Supabase Storage bucket:

- bucket: `documents`
- storage policies on `storage.objects` for `documents` bucket:
  - `SELECT` for `anon, authenticated`
  - `INSERT` for `anon, authenticated`

6. Start app:

```bash
npm run dev
```

## Lead Pilot Environment Readiness

Run the Phase 2 pilot environment gate from the app package:

```bash
npm run test:lead-pilot-environment
```

If the unrelated-user RLS probe has not been configured on this machine yet, create the managed staging fixture once:

```bash
node scripts/lead-pilot-environment-readiness.mjs --persist-isolation-env
```

Run the Phase 3 pilot smoke-test preflight without creating leads or sending email:

```bash
node scripts/lead-pilot-smoke.mjs --source Website
node scripts/lead-pilot-smoke.mjs --source Property24
node scripts/lead-pilot-smoke.mjs --source PrivateProperty
node scripts/lead-pilot-smoke.mjs --source Facebook
node scripts/lead-pilot-smoke.mjs --outbound-email --to pilot@arch9.co.za
```

Run live smoke tests only when ready to create staging pilot records or send to an internal/test recipient:

```bash
node scripts/lead-pilot-smoke.mjs --source Website --delivery=email --live
node scripts/lead-pilot-smoke.mjs --source Property24 --delivery=email --live
node scripts/lead-pilot-smoke.mjs --source Website --delivery=email --review-case=unmatched --live
node scripts/lead-pilot-smoke.mjs --outbound-email --to pilot@arch9.co.za --live
```

### Lead Pilot Launch Monitor

Phase 5 is the daily launch monitor for a small pilot cohort. Configure the cohort in `.env.staging.local` before enabling real forwarding:

```bash
LEAD_PILOT_ORGANISATION_ID=<pilot organisation uuid>
LEAD_PILOT_AGENT_USER_IDS=<agent uuid 1>,<agent uuid 2>
LEAD_PILOT_AGENT_EMAILS=<optional profile email 1>,<optional profile email 2>
LEAD_PILOT_SOURCES=Website,Property24
LEAD_PILOT_MAX_AGENTS=3
```

Run the read-only monitor from the app package:

```bash
npm run report:lead-pilot-launch
```

Use this after Phase 4 live smoke tests and during week one of the pilot. The report checks active pilot aliases, cohort size, inbound count, processed count, unmatched/review items, parse failures, created leads, duplicate matches, linked-lead assignment, outbound email events, and stale pending rows.

Continue the pilot only when leads are captured, assigned, readable, and reviewable. Pause source forwarding when the report shows dropped leads, misassigned leads, stale pending rows, hidden linked records, failed outbound sends, or open parse failures over the configured threshold.

### Lead Pilot Rollout Decision

Phase 6 turns the Phase 5 monitor evidence into an expansion decision:

```bash
npm run report:lead-pilot-rollout
```

The rollout decision runs the live Phase 5 monitor over the configured lookback window by default. It returns one of:

- `APPROVE_EXPANSION`
- `APPROVE_WITH_CONTROLS`
- `EXTEND_PILOT`
- `PAUSE_FORWARDING`

Use saved Phase 5 JSON reports instead of live staging reads when preparing a launch packet:

```bash
node scripts/lead-pilot-rollout-decision.mjs --input ./phase5-day-1.json --input ./phase5-day-2.json
```

If the live outbound email generator was already proven by Phase 4 but communication-event telemetry does not yet show outbound lead email rows, include that proof explicitly:

```bash
node scripts/lead-pilot-rollout-decision.mjs --outbound-smoke-passed
```

Approve the next wave only when Phase 6 approves expansion or approves with controls. Keep the pilot contained when it returns `EXTEND_PILOT`; pause forwarding when it returns `PAUSE_FORWARDING`.

## Demo Flow

1. Click `+ New Transaction` in the top header.
2. Complete:
   - Step 1: Deal Setup
   - Step 2: Finance Details (dynamic by finance type)
   - Step 3: Transaction Status
3. Save using:
   - `Save Transaction`
   - `Save & Open Unit`

## Schema Notes

The schema includes:

- `developments`
  - includes `planned_units` for early setup capacity
- `units`
- `buyers`
- `transactions`
- `transaction_finance_details`
- `transaction_external_access` (tokenized external upload links by role/email, linked to buyers)
- `snapshot_links` (one active mobile snapshot token per user/owner key)
- `development_settings` (client module feature toggles per development)
- `client_portal_links` (tokenized client portal access)
- `client_issues` (structured snag/unit issue tracking)
- `alteration_requests` (controlled variation request workflow)
- `service_reviews` (post-completion client feedback)
- `notes`
- `transaction_notes` view
- `documents`
  - includes `is_client_visible` flag for client-safe document exposure
  - includes external upload metadata (`uploaded_by_role`, `uploaded_by_email`, `external_access_id`)
- `document_requirements` (required checklist by development/global)

## Legacy DB Upgrade

`sql/schema.sql` is idempotent. For older projects, rerun:

1. `sql/schema.sql`
2. `sql/seed.sql`

## WhatsApp campaigns

The primary app's Marketing → WhatsApp page uses persisted campaign and consent
records, with template definitions fetched from the selected sender's Meta WABA.
It supports saved drafts, explicit recipient selection (up to 500), search and
status/date filters, personalisation, review, sending and per-recipient results.
CRM names and phone numbers can be copied into WhatsApp contacts; CRM/email
subscription status never supplies WhatsApp consent.

Meta fields come from the connected account: Phone Number ID for the sending
endpoint, template name, exact language code, approval status, category and
components. This version supports marketing/utility templates with positional or
named text values, text/image/video/document headers, static phone/quick-reply
buttons and dynamic URL suffixes. Create/submit templates in WhatsApp Manager;
unsupported formats (including authentication, carousel, location and Flow
buttons) are visibly unavailable. Media uses public HTTPS links; Meta validates
media format, availability and size. Campaign name and consent evidence are
Arch9 fields, not Meta template fields. Tokens remain server-side.

Before enabling this in an environment, apply the new `whatsapp_campaigns`
migration and deploy `whatsapp-campaigns` and the updated `whatsapp-webhook`
function, then deploy the app. Use the repository's Supabase guard first and
obtain explicit approval for that environment. No migration or deployment is
performed by the checks below. Existing sender connections need a valid WABA ID,
Phone Number ID and token with `whatsapp_business_management` (template reads)
and `whatsapp_business_messaging` (sending) access. Configure the existing
`WHATSAPP_WEBHOOK_APP_SECRET` and verification token, subscribe the app to WABA
message webhooks, and set `WHATSAPP_GRAPH_VERSION` if overriding the existing
integration's v23.0 default. Production sender configuration remains in the
existing administrative integration; the campaign UI never collects tokens.

Sending runs in resumable batches of five while the campaign page remains open.
Closing it leaves unclaimed recipients queued; use **Send remaining** in results.
Each recipient is atomically claimed before the Meta request. An interrupted or
ambiguous attempt is marked unconfirmed and is never automatically resent.
Approval is rechecked before each batch and consent before each individual claim.
Delivery/read callbacks are monotonic and correlated using message IDs or
`biz_opaque_callback_data`; read counts include only actual read callbacks.
Signed STOP, unsubscribe and opt-out replies revoke permission. Other replies
are not presented as a shared inbox. Scheduling and shared reply handling are
outside this version. Read receipts can be unavailable, and acceptance by Meta
is not delivery. A real sender/template/recipient smoke test is still required
after an explicitly approved deployment.

Focused local verification:

```bash
node --test scripts/whatsapp-campaigns.test.mjs
./node_modules/.bin/vitest run src/components/marketing/__tests__/WhatsAppCampaigns.test.jsx
```

The Node tests use isolated PostgreSQL (PGlite), not a connected database. The
component tests mock network operations; they never send WhatsApp messages.

References checked during implementation:
[Meta's template-message API example](https://www.postman.com/meta/whatsapp-business-platform/request/o65u5m5/send-message-template-text),
[Meta's template components example](https://www.postman.com/meta/whatsapp-business-platform/request/ep5w4rc/create-template-w-document-header-text-body-a-phone-number-button-and-a-url-button),
and [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/).
