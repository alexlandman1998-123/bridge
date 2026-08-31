# Agent Module Production Audit

Date: 31 August 2026 (SAST)

Production target: `https://app.arch9.co.za`

## Executive verdict

The Agent module is broadly navigable and its principal read-only workflows render, but it is not currently reasonable to call it fully healthy. The most important user-facing risks are:

1. The global header search is a visible no-op.
2. Clients, reports, listings, transaction details, and lead details are too slow, with long-tail waits of 20–40 seconds in production telemetry.
3. Agent lead/client hydration still probes columns that do not exist, waits for Postgres to reject the query, and then retries or returns an empty fallback.
4. The daily document-request cron is failing in production because its phase-16 script is not packaged into the Vercel function.
5. Notifications contain repeated low-context document reminders (`Unit -`), and the desktop “View all notifications” action routes users into the mobile module.
6. Marketing navigation exposes eight named capabilities that all lead to the same “Coming soon” page.
7. The normal build succeeds, but lint fails with four errors; current delivery gates can therefore ship known defects.

No destructive or externally visible production actions were performed. The audit opened screens, filters, menus, detail views, and forms, but did not send invitations or messages, upload documents, submit irreversible records, mark notifications read, archive/delete, or make payments.

## Production screen results

Meaningful-ready time was measured from direct navigation until the screen's useful data or empty state appeared. These are observed production times, not synthetic lab timings.

| Screen | Observed ready time | Result |
|---|---:|---|
| Clients | 13.27 s | Renders, but unacceptably slow |
| Reports | 7.48 s | Renders, slow |
| Transaction detail | ~7.5 s | Renders; telemetry confirms severe long tail |
| Canvassing | 6.63 s | Renders empty state, slow |
| Listings | 6.57 s | Renders 10 listings, slow |
| Client profile | ~5.25 s | Renders |
| Calendar | 4.74 s | Renders empty state |
| Dashboard | 3.19 s | Renders |
| Partners | 3.18 s | Renders empty state |
| Leads | 3.04 s | Renders buyer and seller leads |
| Transactions | 3.02 s | Renders five deals |

Organisation pages for Branches, Agents, Partners, and Commission rendered successfully. The sampled branch “View” and transaction “Open” actions worked.

Settings pages for Profile, Security, Organisation, Business Lines, Branding, Communications, Activity, Billing, Lead Capture, and Syndication rendered. Roles and Users were still showing `Loading users...` after five seconds, and Property24 remained in `Syncing...` / `Checking...` after 5.7 seconds. These are unresolved slow-state findings, not proven permanent failures.

## Control and button audit

### Confirmed working

- Header Create menu opens and exposes Lead, Prospect, Client, Listing, Transaction, Third Party, Appointment, and Viewing.
- Lead and Prospect type selectors open.
- Client routes to Clients.
- Transaction opens the Create Transaction dialog.
- Dashboard “View all” routes to Transactions.
- Dashboard “View Calendar” and “Manage Appointments” route to Calendar.
- Leads Buyer/Seller tabs and Kanban/table controls work.
- Add Seller Lead opens the expected form.
- Transaction “Open” and Branch “View” navigate to usable detail screens.
- Notification drawer and its All / Action required / Documents tabs open.

### Confirmed broken or misleading

| Control | Finding | User impact |
|---|---|---|
| Global header search | Accepts text but has no change, submit, keyboard, or command-palette handler | Users type and nothing happens |
| Desktop “View all notifications” | Routes to `/mobile/notifications` | Unexpected module/context switch |
| Marketing navigation | Eight menu entries all load one “Coming soon” placeholder | Capabilities look available but are not usable |
| Repeated missing-document notifications | Nine similar reminders include `Unit -` and weak context | Noise, low trust, difficult actioning |

The Create menu's first open took roughly 2.2 seconds because it is lazy-loaded. That is functional but visibly sluggish for a primary action.

## Production telemetry

Thirty-day, duration-capped production telemetry shows:

| Flow | Median | p95 | Worst sampled |
|---|---:|---:|---:|
| Dashboard principal summary | 4.46 s | 20.14 s | 90.13 s |
| Transaction detail dataset ready | 6.40 s | 40.08 s | 96.94 s |
| Transaction detail core ready | 3.47 s | 23.50 s | — |
| Lead detail first data | 4.11 s | 13.49 s | — |
| Lead detail background settled | 16.43 s | 33.08 s | — |
| Leads background settled | 2.91 s | 20.80 s | 45.95 s |
| Lead Capture bridge boot | 1.89 s | 13.33 s | — |

The strongest recent event clusters were:

- 109 `workspace_branding_image_failed` events on Dashboard.
- 101 transaction-detail performance-budget breaches.
- 82 lead-detail performance-budget breaches.
- 72 slow Dashboard route transitions.
- 51 Leads performance-budget breaches.
- 29 Dashboard performance failures.
- Recent lead background-hydration failures and document-upload failures.

Clients, Listings, and Reports do not have sufficiently complete “data ready” instrumentation. Route-transition telemetry is also contaminated by implausible minute/day outliers and often measures the router call rather than usable content. The manual 13.27-second Clients result is therefore more representative than its bridge-boot metric.

## Database, RLS, and schema drift

Recent Postgres errors include:

- 12 attempts to read `private_listings.property_address`, which does not exist in the deployed schema.
- Three attempts to read `transactions.current_stage`, which does not exist.
- Attempts to read missing `transactions.status` and `transactions.reference`.
- One insert blocked by RLS on `telemetry_events`.
- One correctly enforced close-out guard where canonical commission allocations did not exist.

The Agent lead workspace explicitly selects `transactions.current_stage` and uses four `private_listings` projections that all include `property_address`. This is active schema drift, not merely dead legacy code. A user pays for the failed network/database round trips; some code paths then silently return an empty array, so data can look absent rather than errored.

The recent RLS error on `telemetry_events` also means error and performance telemetry can undercount the real problem rate. The Supabase advisor backlog contains many RLS-without-policy and unindexed-foreign-key notices, but those should not be bulk-fixed. They must be prioritized by client-facing query paths and verified with an authenticated/anonymous role matrix.

## Legacy software impact

### Actively affecting users or operations

- Phase-based cron coupling: Vercel invokes `scripts/document-request-canonical-phase16-automation.mjs`, but the script is absent from the deployed function bundle. The route has failed daily with HTTP 502 for the last seven days.
- Schema compatibility probes: current Agent reads still query retired/missing columns and recover only after errors.
- Legacy role/workspace reconciliation runs during authentication and repeatedly logs that workspace selections are ignored and membership roles must not overwrite profile roles.
- A “Legacy Lead Acknowledgement Fallback” remains exposed in Communications templates.
- Retired offer-route compatibility remains in the client communication journey catalogue, which itself warns that retired/current routes can create confusing call-to-action destinations.
- Repeated document reminders appear stale or duplicated, while the canonical document automation is failing.

### Performance and maintenance drag

- `package.json` contains 1,590 scripts, primarily phase-specific historical tasks.
- The production build emits 616 JavaScript chunks and approximately 23.8 MB of JavaScript in `dist`.
- The global CSS bundle is about 1.19 MB uncompressed (about 140 KB gzip).
- The core `api` route chunk is about 1.36 MB uncompressed.
- Several source files exceed Babel's 500 KB optimization threshold.
- Some modules are both statically and dynamically imported, preventing intended chunk separation.

Route splitting prevents every legacy screen from entering the initial Agent payload, so this is not all immediate download cost. The oversized global stylesheet, core runtime/API chunks, duplicated compatibility paths, and failed-first-query behavior do directly affect Agent startup and interaction latency.

### Mostly dormant compatibility

Old redirects and route aliases are not automatically harmful. They should remain until access logs show no legitimate traffic. Removing them in one sweep would create more user risk than benefit.

## Repository verification

- `npm test`: passed all nine configured service/repository suites.
- `npm run build`: passed in approximately 65 seconds.
- `npm run lint -- --quiet`: failed with four errors:
  - Component type created during render in `ListingWorkspaceShell.jsx`.
  - Undefined `normalizedProspectDemoSlug` in `onboardingDemoLinks.js`.
  - Duplicate `sellerProcessProfile` key in `AgentLeadsPage.jsx`.
  - Constant dead branch in `DevelopmentDetail.jsx`.

The configured `npm test` suite is narrow; it does not exercise most Agent screens or browser actions. A passing test command is therefore not evidence that the Agent module is end-to-end healthy.

## Client-safe remediation order

1. **Restore document automation safely.** Package the required script (or move the job into a deployable function), keep commit disabled for the first production dry run, then verify one pilot transaction and notification idempotency before widening scope.
2. **Repair active schema drift additively.** Replace missing-column projections with canonical deployed columns. Do not rename or drop columns during this step. Add contract tests against generated database types and verify Clients, lead detail, listing detail, and transaction detail using the same Agent role.
3. **Fix visible no-op controls.** Wire the global search to the existing command palette, or hide it until functional. Correct the notifications destination and remove/feature-flag unavailable Marketing submenu items.
4. **Cut the slow critical path.** Parallelize independent hydration, stop failed-first compatibility reads, cache stable workspace/branding data, and render usable core data before secondary panels. Set user-centric budgets: core list screens under 2.5 seconds p95 and detail core under 4 seconds p95.
5. **Resolve indefinite loading states.** Add explicit success, empty, error, timeout, and retry states to Roles, Users, and Property24. Re-test with Agent, Principal, and restricted roles.
6. **Make quality gates enforceable.** Fix the four lint errors and require test, lint, and build before production promotion. Add browser smoke tests for every Agent navigation item and high-value reversible control.
7. **Retire legacy by evidence.** Instrument legacy adapter/route use, observe it for at least one release cycle, migrate remaining callers, then remove one compatibility seam at a time. Keep a rollback switch for user-facing portals.

## Coverage and limitations

This was a production-safe audit, not destructive acceptance testing. It covered every primary Sales Agent navigation area, all exposed settings groups, the Create menu, representative list/detail actions, filters/tabs, notifications, production logs, database logs/advisors, code paths, tests, lint, and a production build.

It did not submit every form or press irreversible controls because doing so would create records, send communications, alter notification state, or delete/archive live data. The browser session also signed out during the long audit; source and auth logs confirm the app invoked logout, while the exact trigger (15-minute inactivity policy versus session mismatch handling) was not conclusively isolated. A final write-path acceptance pass should be run in an isolated UAT organisation with controlled recipients, seeded records, and rollback/cleanup procedures—not against unrestricted production data.
