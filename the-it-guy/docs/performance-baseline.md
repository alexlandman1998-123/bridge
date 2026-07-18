# Performance Baseline

Phase 0 diagnostic artifact. This file records the current platform performance baseline and does not enforce budgets.

Generated: 2026-07-18T20:41:52.221Z
Dist: `dist`

## How to update

```bash
npm run baseline:performance
```

Phase 1 guardrails compare future builds to this baseline:

```bash
npm run test:performance-budget
npm run build:guarded
```

For route cold-load measurements, run the preview server after the baseline build completes:

```bash
npm run preview -- --host 127.0.0.1 --port 4173
npm run baseline:performance:browser
```

## Build command

| Command | Duration | Completed |
| --- | --- | --- |
| `npm run build` | 1m 24s | 2026-07-18T20:41:51.244Z |

## Build output summary

| Kind | Files | Raw | Gzip |
| --- | --- | --- | --- |
| script | 422 | 19.28 MB | 5.06 MB |
| style | 3 | 1.12 MB | 147.7 KB |
| image | 14 | 998.7 KB | 950.9 KB |
| font | 0 | 0 B | 0 B |
| html | 1 | 2.0 KB | 604 B |
| json | 0 | 0 B | 0 B |
| other | 0 | 0 B | 0 B |
| all | 440 | 21.37 MB | 6.13 MB |

## Initial HTML resources

| Relation | Asset | Raw | Gzip | Heavy flag |
| --- | --- | --- | --- | --- |
| modulepreload | `assets/vendor-runtime-p6VWrWG8.js` | 1.3 KB | 756 B |  |
| modulepreload | `assets/vendor-react-Zo6OaaGg.js` | 226.1 KB | 72.6 KB |  |
| modulepreload | `assets/vendor-supabase-BZbLB7ko.js` | 190.2 KB | 50.5 KB |  |
| stylesheet | `assets/index-CheGYUJr.css` | 992.0 KB | 119.3 KB |  |
| script | `assets/index-BkW-EnRi.js` | 339.4 KB | 81.0 KB |  |

## Largest build assets

| Kind | Asset | Raw | Gzip |
| --- | --- | --- | --- |
| script | `assets/api-CbYMUk3A.js` | 1.31 MB | 306.3 KB |
| script | `assets/pdf.worker.min-iDqQPrd3.mjs` | 1.18 MB | 356.2 KB |
| style | `assets/index-CheGYUJr.css` | 992.0 KB | 119.3 KB |
| script | `assets/html2pdf-C5y4hFf5.js` | 751.8 KB | 226.4 KB |
| script | `assets/AttorneyTransactionDetail-C8_o14YD.js` | 623.1 KB | 144.2 KB |
| script | `assets/ClientPortal-W_9K18G4.js` | 619.3 KB | 141.2 KB |
| script | `assets/AgentLeadsPage-BE3aEEmI.js` | 545.6 KB | 128.5 KB |
| script | `assets/Pipeline-CefZ33iv.js` | 457.5 KB | 106.5 KB |
| script | `assets/xlsx-CNerDvZX.js` | 419.1 KB | 139.6 KB |
| script | `assets/vendor-pdf-BOwjOaQL.js` | 405.0 KB | 120.3 KB |
| script | `assets/vendor-html2canvas-CVApvLAy.js` | 393.8 KB | 93.0 KB |
| script | `assets/vendor-jspdf-D9P5_7Lw.js` | 370.2 KB | 119.9 KB |
| script | `assets/SettingsSigningTemplatesPage-7phQ5Tvc.js` | 363.8 KB | 83.6 KB |
| script | `assets/index-BkW-EnRi.js` | 339.4 KB | 81.0 KB |
| script | `assets/privateListingService-BpagpokW.js` | 324.9 KB | 78.2 KB |
| script | `assets/UnitDetail-BHk5S2Gu.js` | 316.9 KB | 71.4 KB |
| script | `assets/AgentListingDetail-D6-nYbbP.js` | 310.5 KB | 72.3 KB |
| script | `assets/Dashboard-9K-CtimF.js` | 285.5 KB | 69.5 KB |
| image | `brand/kingstons-logo-form.png` | 270.2 KB | 266.3 KB |
| image | `arch9-launch-preview.png` | 257.6 KB | 255.3 KB |

## Browser route cold-loads

Not captured in this run. Use `npm run baseline:performance:browser` while preview is running.

