# Bridge Frontend Performance Audit

Date: 2026-05-15

## Executive Summary

The Bridge frontend was loading nearly the entire platform through the main app entry. Agent, attorney, developer, client portal, signing, legal document, onboarding, reporting and dashboard pages were all imported eagerly from `src/App.jsx`, which produced a single large JavaScript payload on first boot.

This pass converted the app to route-level code splitting, moved heavyweight shell modals behind lazy imports, added polished skeleton fallbacks, and added a conservative Vite chunk strategy for heavy vendor libraries.

## Before

Baseline command:

```bash
npm run build
```

Baseline result:

- Build passed.
- Vite warned that chunks were larger than 500 kB.
- Main JS bundle: `dist/assets/index-zbGlA99b.js` — `5,585.22 kB`, gzip `1,351.89 kB`.
- CSS bundle: `dist/assets/index-SRfmpfPX.css` — `500.74 kB`, gzip `70.95 kB`.
- PDF worker emitted: `dist/assets/pdf.worker.min-iDqQPrd3.mjs` — `1,232.30 kB`.

Main issues found:

- `src/App.jsx` eagerly imported nearly every route page.
- The signing route imported `pdfjs-dist` through `src/pages/SignerPortal.jsx`, causing PDF tooling to be part of the application graph before a user needed signing.
- Transaction/legal document pages, dashboards, reports, client portal, onboarding and intelligence pages were all reachable from the initial app module.
- The new transaction wizard, agent deal wizard and development modal were imported and mounted from the app shell even when closed.
- Shared shell imports pulled in additional module logic before route intent was known.

## Changes Made

- Converted major route pages in `src/App.jsx` to `React.lazy`.
- Added a top-level `Suspense` fallback around routes.
- Added a nested `Suspense` fallback around authenticated route content so the shell stays visible during lazy route loads.
- Lazy-loaded `Sidebar`, `HeaderBar`, `CommandPalette`, `AddDevelopmentModal`, `AgentNewDealWizard`, `NewTransactionWizard` and mobile executive layout.
- Changed transaction/development modals so they only mount when opened.
- Moved agent demo seeding and attorney firm lookup behind dynamic imports where they are only used conditionally.
- Added reusable skeleton fallbacks directly in `src/App.jsx`:
  - `PageSkeleton`
  - `ModalSkeleton`
  - `SidebarSkeleton`
  - `HeaderSkeleton`
- Added Vite manual chunk hints in `vite.config.js` for:
  - React/router
  - Supabase
  - PDF tooling
  - Lucide icons
  - Motion
  - Radix/cmdk UI utilities

## After

Post-change command:

```bash
npm run build
```

Post-change result:

- Build passed.
- Main JS entry: `dist/assets/index-y1w3Bl-2.js` — `868.14 kB`, gzip `204.25 kB`.
- Main JS reduction: from `5,585.22 kB` to `868.14 kB`, about `84%` smaller minified.
- Gzip reduction: from `1,351.89 kB` to `204.25 kB`, about `85%` smaller gzip.
- PDF code split into `vendor-pdf-BOwjOaQL.js` — `414.76 kB`, gzip `123.20 kB`.
- Signing page split into `SignerPortal-Cn0G2DXh.js` — `24.26 kB`, gzip `7.84 kB`.
- Client portal split into `ClientPortal-DblXQe81.js` — `394.63 kB`, gzip `85.40 kB`.
- Dashboard split into `Dashboard-DAFscrgj.js` — `216.56 kB`, gzip `50.43 kB`.
- Pipeline split into `Pipeline-DOQckT0R.js` — `239.35 kB`, gzip `54.67 kB`.
- Legal document workspace split into `LegalDocumentWorkspace-CeiCfoMn.js` — `121.86 kB`, gzip `33.38 kB`.

Remaining build warnings:

- Existing CSS minify warning: `Expected identifier but found "-"` around generated CSS content containing `-: TZ.;`.
- Existing dynamic/static import warnings in attorney workflow services.
- Existing dynamic/static import warning for `agentDemoSeed.js` because other modules still statically import it.
- Vite still warns about the app entry being over 500 kB, but it is now much smaller and route-heavy modules are no longer part of the first payload.

## Verification

Production build:

- `npm run build` passed.

Lint:

- `npm run lint` failed on existing repository-wide lint debt: `126 problems (95 errors, 31 warnings)`.
- Touched files passed targeted lint:

```bash
npx eslint src/App.jsx vite.config.js
```

Browser smoke:

- Dev server started successfully on `http://127.0.0.1:5173`.
- Checked `/bridge`, `/auth`, and `/sign/fake-token` with Playwright.
- No browser console errors were captured on those routes.

## Recommended Next Steps

- Split `src/lib/api.js`; ESLint/Babel reports it exceeds 500 kB and it is still a major shared dependency.
- Fix the CSS syntax warning so CSS minification is clean.
- Remove static imports of `agentDemoSeed.js` from `src/core/transactions/attorneyMockData.js` and `src/lib/agentDataService.js` if those paths are not needed on first boot.
- Lazy-load chart/analytics panels inside individual dashboard pages below the fold.
- Lazy-load legal document preview internals inside the legal workspace when preview/editor modes are opened.
- Consider a dedicated bundle visualizer plugin later if dependency installs are allowed; this pass used Vite build output only.
