# bridge.

High-end React + Vite + Supabase transaction workspace for Samlin Construction.

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
