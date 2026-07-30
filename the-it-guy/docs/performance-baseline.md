# Performance Baseline

Phase 0 diagnostic artifact. This file records the current platform performance baseline and does not enforce budgets.

Generated: 2026-07-30T07:42:10.456Z
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
| `npm run build` | 1m 5s | 2026-07-30T07:42:09.951Z |

## Build output summary

| Kind | Files | Raw | Gzip |
| --- | --- | --- | --- |
| script | 429 | 19.80 MB | 5.19 MB |
| style | 3 | 1.18 MB | 153.8 KB |
| image | 22 | 1.19 MB | 1.14 MB |
| font | 0 | 0 B | 0 B |
| html | 1 | 2.1 KB | 655 B |
| json | 1 | 20.1 KB | 6.6 KB |
| other | 0 | 0 B | 0 B |
| all | 456 | 22.19 MB | 6.48 MB |

## Initial HTML resources

| Relation | Asset | Raw | Gzip | Heavy flag |
| --- | --- | --- | --- | --- |
| modulepreload | `assets/vendor-runtime-p6VWrWG8.js` | 1.3 KB | 756 B |  |
| modulepreload | `assets/vendor-react-BX1-Nza-.js` | 225.2 KB | 72.2 KB |  |
| modulepreload | `assets/vendor-supabase-DTqiiTOY.js` | 168.0 KB | 44.7 KB |  |
| stylesheet | `assets/index-CQIliRR5.css` | 1.03 MB | 125.4 KB |  |
| script | `assets/index-DeY4pPP1.js` | 359.1 KB | 86.3 KB |  |

## Largest build assets

| Kind | Asset | Raw | Gzip |
| --- | --- | --- | --- |
| script | `assets/api-VJC3NFO9.js` | 1.65 MB | 385.5 KB |
| script | `assets/pdf.worker.min-iDqQPrd3.mjs` | 1.18 MB | 356.2 KB |
| style | `assets/index-CQIliRR5.css` | 1.03 MB | 125.4 KB |
| script | `assets/ClientPortal-DAtNkci4.js` | 832.2 KB | 191.7 KB |
| script | `assets/AttorneyTransactionDetail-DjdIEY0T.js` | 769.4 KB | 175.1 KB |
| script | `assets/html2pdf-C5y4hFf5.js` | 751.8 KB | 226.4 KB |
| script | `assets/Pipeline-Bwv3BQaK.js` | 576.3 KB | 137.6 KB |
| script | `assets/xlsx-CNerDvZX.js` | 419.1 KB | 139.6 KB |
| script | `assets/vendor-pdf-BOwjOaQL.js` | 405.0 KB | 120.3 KB |
| script | `assets/privateListingService-BatF0ogh.js` | 399.5 KB | 96.4 KB |
| script | `assets/vendor-html2canvas-CVApvLAy.js` | 393.8 KB | 93.0 KB |
| script | `assets/vendor-jspdf-DmhUUlb9.js` | 370.2 KB | 119.9 KB |
| script | `assets/SettingsSigningTemplatesPage-Bi8EMYeq.js` | 366.9 KB | 84.4 KB |
| script | `assets/index-DeY4pPP1.js` | 359.1 KB | 86.3 KB |
| script | `assets/AgentListingDetail-D7dL8Gga.js` | 353.0 KB | 84.7 KB |
| script | `assets/UnitDetail-CLL7NpBM.js` | 303.4 KB | 68.8 KB |
| script | `assets/Dashboard-BzM7SWl3.js` | 286.1 KB | 69.8 KB |
| image | `brand/kingstons-logo-form.png` | 270.2 KB | 266.3 KB |
| image | `arch9-launch-preview.png` | 257.6 KB | 255.3 KB |
| script | `assets/Agents-P-LDzdpC.js` | 240.8 KB | 58.8 KB |

## Browser route cold-loads

Not captured in this run. Use `npm run baseline:performance:browser` while preview is running.

