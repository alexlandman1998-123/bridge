# Performance Baseline

Phase 0 diagnostic artifact. This file records the current platform performance baseline and does not enforce budgets.

Generated: 2026-07-12T19:01:01.976Z
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
| `npm run build` | 1m 25s | 2026-07-12T19:01:01.518Z |

## Build output summary

| Kind | Files | Raw | Gzip |
| --- | --- | --- | --- |
| script | 402 | 17.22 MB | 4.49 MB |
| style | 3 | 1.05 MB | 138.7 KB |
| image | 12 | 1.32 MB | 1.29 MB |
| font | 0 | 0 B | 0 B |
| html | 1 | 2.0 KB | 605 B |
| json | 0 | 0 B | 0 B |
| other | 0 | 0 B | 0 B |
| all | 418 | 19.59 MB | 5.92 MB |

## Initial HTML resources

| Relation | Asset | Raw | Gzip | Heavy flag |
| --- | --- | --- | --- | --- |
| modulepreload | `assets/vendor-runtime-p6VWrWG8.js` | 1.3 KB | 756 B |  |
| modulepreload | `assets/vendor-react-Zo6OaaGg.js` | 226.1 KB | 72.6 KB |  |
| modulepreload | `assets/vendor-supabase-BZbLB7ko.js` | 190.2 KB | 50.5 KB |  |
| stylesheet | `assets/index-tWIoMA-i.css` | 922.7 KB | 110.3 KB |  |
| script | `assets/index-D76l0RNr.js` | 314.7 KB | 75.5 KB |  |

## Largest build assets

| Kind | Asset | Raw | Gzip |
| --- | --- | --- | --- |
| script | `assets/api-DHa7nsaa.js` | 1.23 MB | 286.3 KB |
| script | `assets/pdf.worker.min-iDqQPrd3.mjs` | 1.18 MB | 356.2 KB |
| style | `assets/index-tWIoMA-i.css` | 922.7 KB | 110.3 KB |
| script | `assets/ClientPortal-uKMxGdDL.js` | 539.5 KB | 122.4 KB |
| image | `brand/kingstons-logo-form.png` | 529.5 KB | 525.2 KB |
| script | `assets/AttorneyTransactionDetail-B7ZY0pTT.js` | 515.7 KB | 120.2 KB |
| script | `assets/AgentLeadsPage-eQpsxxT6.js` | 499.5 KB | 117.0 KB |
| script | `assets/Pipeline-B1I5p12M.js` | 458.4 KB | 106.6 KB |
| image | `brand/kingstons-logo-cover.png` | 441.5 KB | 436.3 KB |
| script | `assets/xlsx-CNerDvZX.js` | 419.1 KB | 139.6 KB |
| script | `assets/vendor-pdf-BOwjOaQL.js` | 405.0 KB | 120.3 KB |
| script | `assets/vendor-jspdf-CY4VsHhy.js` | 370.2 KB | 119.9 KB |
| script | `assets/SettingsSigningTemplatesPage-Bf6h3Y2K.js` | 329.4 KB | 75.6 KB |
| script | `assets/UnitDetail-D118jVGb.js` | 315.8 KB | 71.0 KB |
| script | `assets/index-D76l0RNr.js` | 314.7 KB | 75.5 KB |
| script | `assets/Dashboard-Cp_p1Qpu.js` | 285.3 KB | 69.4 KB |
| script | `assets/AgentListingDetail-Da8c_vjh.js` | 280.0 KB | 64.4 KB |
| image | `arch9-launch-preview.png` | 257.6 KB | 255.3 KB |
| script | `assets/privateListingService-Bhne0uoZ.js` | 243.7 KB | 57.8 KB |
| script | `assets/Agents-vTSy86b8.js` | 242.6 KB | 58.9 KB |

## Browser route cold-loads

Not captured in this run. Use `npm run baseline:performance:browser` while preview is running.

