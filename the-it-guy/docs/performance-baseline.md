# Performance Baseline

Phase 0 diagnostic artifact. This file records the current platform performance baseline and does not enforce budgets.

Generated: 2026-07-26T07:05:10.560Z
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
| `npm run build` | 32.5 s | 2026-07-26T07:05:10.109Z |

## Build output summary

| Kind | Files | Raw | Gzip |
| --- | --- | --- | --- |
| script | 419 | 19.19 MB | 5.04 MB |
| style | 3 | 1.14 MB | 149.8 KB |
| image | 15 | 999.5 KB | 951.3 KB |
| font | 0 | 0 B | 0 B |
| html | 1 | 2.1 KB | 658 B |
| json | 1 | 19.6 KB | 6.4 KB |
| other | 0 | 0 B | 0 B |
| all | 439 | 21.33 MB | 6.12 MB |

## Initial HTML resources

| Relation | Asset | Raw | Gzip | Heavy flag |
| --- | --- | --- | --- | --- |
| modulepreload | `assets/vendor-runtime-p6VWrWG8.js` | 1.3 KB | 756 B |  |
| modulepreload | `assets/vendor-react-BX1-Nza-.js` | 225.2 KB | 72.2 KB |  |
| modulepreload | `assets/vendor-supabase-DTqiiTOY.js` | 168.0 KB | 44.7 KB |  |
| stylesheet | `assets/index-D6TId4mZ.css` | 1016.4 KB | 121.5 KB |  |
| script | `assets/index-BJINGO-K.js` | 351.5 KB | 84.6 KB |  |

## Largest build assets

| Kind | Asset | Raw | Gzip |
| --- | --- | --- | --- |
| script | `assets/api-C8rx9H5n.js` | 1.47 MB | 344.6 KB |
| script | `assets/pdf.worker.min-iDqQPrd3.mjs` | 1.18 MB | 356.2 KB |
| style | `assets/index-D6TId4mZ.css` | 1016.4 KB | 121.5 KB |
| script | `assets/AttorneyTransactionDetail-D7BcdIDP.js` | 761.9 KB | 174.0 KB |
| script | `assets/html2pdf-C5y4hFf5.js` | 751.8 KB | 226.4 KB |
| script | `assets/ClientPortal-CVI5bblC.js` | 723.2 KB | 163.0 KB |
| script | `assets/Pipeline-CQbGvso4.js` | 498.7 KB | 118.2 KB |
| script | `assets/xlsx-CNerDvZX.js` | 419.1 KB | 139.6 KB |
| script | `assets/vendor-pdf-BOwjOaQL.js` | 405.0 KB | 120.3 KB |
| script | `assets/vendor-html2canvas-CVApvLAy.js` | 393.8 KB | 93.0 KB |
| script | `assets/privateListingService-D9bG60mj.js` | 379.0 KB | 91.5 KB |
| script | `assets/vendor-jspdf-DmhUUlb9.js` | 370.2 KB | 119.9 KB |
| script | `assets/SettingsSigningTemplatesPage-CzKD-aKc.js` | 366.7 KB | 84.4 KB |
| script | `assets/index-BJINGO-K.js` | 351.5 KB | 84.6 KB |
| script | `assets/AgentListingDetail-4iPOXUqy.js` | 336.8 KB | 79.8 KB |
| script | `assets/UnitDetail-D-9GahjA.js` | 303.3 KB | 68.8 KB |
| script | `assets/Dashboard-DgNSPl0W.js` | 286.0 KB | 69.8 KB |
| image | `brand/kingstons-logo-form.png` | 270.2 KB | 266.3 KB |
| image | `arch9-launch-preview.png` | 257.6 KB | 255.3 KB |
| script | `assets/Agents-DCzav37G.js` | 240.7 KB | 58.7 KB |

## Browser route cold-loads

Not captured in this run. Use `npm run baseline:performance:browser` while preview is running.

