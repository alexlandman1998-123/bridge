# Performance Baseline

Phase 0 diagnostic artifact. This file records the current platform performance baseline and does not enforce budgets.

Generated: 2026-08-17T20:17:04.392Z
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
| `npm run build` | 1m 59s | 2026-08-17T20:17:03.591Z |

## Build output summary

| Kind | Files | Raw | Gzip |
| --- | --- | --- | --- |
| script | 466 | 22.16 MB | 5.78 MB |
| style | 3 | 1.24 MB | 160.2 KB |
| image | 23 | 1.24 MB | 1.19 MB |
| font | 0 | 0 B | 0 B |
| html | 1 | 2.1 KB | 666 B |
| json | 1 | 22.0 KB | 7.2 KB |
| other | 0 | 0 B | 0 B |
| all | 494 | 24.65 MB | 7.13 MB |

## Initial HTML resources

| Relation | Asset | Raw | Gzip | Heavy flag |
| --- | --- | --- | --- | --- |
| modulepreload | `assets/vendor-runtime-p6VWrWG8.js` | 1.3 KB | 756 B |  |
| modulepreload | `assets/vendor-react-BX1-Nza-.js` | 225.2 KB | 72.2 KB |  |
| modulepreload | `assets/vendor-supabase-DTqiiTOY.js` | 168.0 KB | 44.7 KB |  |
| stylesheet | `assets/index--3c3gpy1.css` | 1.08 MB | 131.0 KB |  |
| script | `assets/index-CXeVLQZo.js` | 396.2 KB | 95.9 KB |  |

## Largest build assets

| Kind | Asset | Raw | Gzip |
| --- | --- | --- | --- |
| script | `assets/api-sh8FXafM.js` | 1.68 MB | 389.8 KB |
| script | `assets/pdf.worker.min-iDqQPrd3.mjs` | 1.18 MB | 356.2 KB |
| style | `assets/index--3c3gpy1.css` | 1.08 MB | 131.0 KB |
| script | `assets/Pipeline-BFoj4OwD.js` | 1.03 MB | 261.7 KB |
| script | `assets/AttorneyTransactionDetail-DUEKeuOc.js` | 1.00 MB | 239.9 KB |
| script | `assets/ClientPortal-B_SDipOZ.js` | 884.7 KB | 205.1 KB |
| script | `assets/html2pdf-C5y4hFf5.js` | 751.8 KB | 226.4 KB |
| script | `assets/packetService-Xcuwzf3S.js` | 427.3 KB | 98.4 KB |
| script | `assets/xlsx-CNerDvZX.js` | 419.1 KB | 139.6 KB |
| script | `assets/vendor-pdf-BOwjOaQL.js` | 405.0 KB | 120.3 KB |
| script | `assets/AgentListingDetail-bXms6c71.js` | 400.9 KB | 95.3 KB |
| script | `assets/index-CXeVLQZo.js` | 396.2 KB | 95.9 KB |
| script | `assets/vendor-html2canvas-CVApvLAy.js` | 393.8 KB | 93.0 KB |
| script | `assets/SettingsSigningTemplatesPage-BAco6Wgv.js` | 379.6 KB | 87.2 KB |
| script | `assets/vendor-jspdf-DmhUUlb9.js` | 370.2 KB | 119.9 KB |
| script | `assets/Dashboard-DkEf3FNL.js` | 361.3 KB | 89.1 KB |
| script | `assets/UnitDetail-BJYz4O14.js` | 325.4 KB | 75.7 KB |
| script | `assets/privateListingService-hEd1e9Xn.js` | 307.5 KB | 77.0 KB |
| script | `assets/DevelopmentDetail-B7b7-XCX.js` | 279.5 KB | 61.0 KB |
| script | `assets/LegalDocumentWorkspace-BhUCSOET.js` | 274.4 KB | 73.3 KB |

## Browser route cold-loads

Not captured in this run. Use `npm run baseline:performance:browser` while preview is running.

