# Admin Portal Phase 3 Frontend Shell

Date: 2026-08-05

## Purpose

Phase 3 removes the legacy command-centre surface and replaces it with a small operating-console shell.

The active admin app now keeps only:

- Supabase auth
- admin/support access resolution
- date range control
- Dashboard
- Support
- Search
- Settings

Removed from the active portal:

- Growth
- Revenue
- Ecosystem
- Platform Health
- Legal Templates
- Roleplayers
- placeholder Users/Transactions views
- mobile-only alternate shell
- green explanatory sidebar
- legacy browser-side dashboard calculations

## Active Frontend Files

- `apps/admin/src/App.jsx`
- `apps/admin/src/styles/admin.css`
- `apps/admin/src/lib/adminAccess.js`
- `apps/admin/src/lib/supabaseClient.js`

The old `apps/admin/src/lib/adminData.js` adapter was removed. The replacement shell calls the Phase 2 RPCs directly:

- `arch9_admin_dashboard_snapshot`
- `arch9_admin_support_snapshot`

## Verification

The Vite production build passes:

```bash
npm run build
```

The dev server was started on:

```txt
http://127.0.0.1:5177/admin
```

Browser automation could not be run from this shell because `agent-browser` is not installed.
