# Performance Baseline

Phase 0 diagnostic artifact. This file records the current platform performance baseline and does not enforce budgets.

Generated: 2026-08-08T16:59:28.283Z
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
| `npm run build` | 1m 7s | 2026-08-08T16:59:27.508Z |

## Build output summary

| Kind | Files | Raw | Gzip |
| --- | --- | --- | --- |
| script | 438 | 21.09 MB | 5.50 MB |
| style | 3 | 1.21 MB | 157.8 KB |
| image | 23 | 1.24 MB | 1.19 MB |
| font | 0 | 0 B | 0 B |
| html | 1 | 2.1 KB | 661 B |
| json | 1 | 20.6 KB | 6.8 KB |
| other | 0 | 0 B | 0 B |
| all | 466 | 23.56 MB | 6.85 MB |

## Initial HTML resources

| Relation | Asset | Raw | Gzip | Heavy flag |
| --- | --- | --- | --- | --- |
| modulepreload | `assets/vendor-runtime-p6VWrWG8.js` | 1.3 KB | 756 B |  |
| modulepreload | `assets/vendor-react-BX1-Nza-.js` | 225.2 KB | 72.2 KB |  |
| modulepreload | `assets/vendor-supabase-DTqiiTOY.js` | 168.0 KB | 44.7 KB |  |
| stylesheet | `assets/index-PYzcEdnO.css` | 1.06 MB | 129.4 KB |  |
| script | `assets/index-BmJP7e5C.js` | 387.1 KB | 93.1 KB |  |

## Largest build assets

| Kind | Asset | Raw | Gzip |
| --- | --- | --- | --- |
| script | `assets/api-oop7W7tG.js` | 1.71 MB | 401.2 KB |
| script | `assets/pdf.worker.min-iDqQPrd3.mjs` | 1.18 MB | 356.2 KB |
| style | `assets/index-PYzcEdnO.css` | 1.06 MB | 129.4 KB |
| script | `assets/Pipeline-CKv16MFH.js` | 865.3 KB | 206.2 KB |
| script | `assets/ClientPortal-CzEy_Dak.js` | 848.0 KB | 195.3 KB |
| script | `assets/AttorneyTransactionDetail-bxxEkX17.js` | 830.7 KB | 193.0 KB |
| script | `assets/html2pdf-C5y4hFf5.js` | 751.8 KB | 226.4 KB |
| script | `assets/packetService-BlvMlrhm.js` | 433.1 KB | 100.4 KB |
| script | `assets/privateListingService-DApVzYjD.js` | 428.2 KB | 103.5 KB |
| script | `assets/xlsx-CNerDvZX.js` | 419.1 KB | 139.6 KB |
| script | `assets/vendor-pdf-BOwjOaQL.js` | 405.0 KB | 120.3 KB |
| script | `assets/vendor-html2canvas-CVApvLAy.js` | 393.8 KB | 93.0 KB |
| script | `assets/index-BmJP7e5C.js` | 387.1 KB | 93.1 KB |
| script | `assets/SettingsSigningTemplatesPage-BA-0E6iL.js` | 376.0 KB | 86.2 KB |
| script | `assets/AgentListingDetail-BRgRfgPK.js` | 372.4 KB | 89.5 KB |
| script | `assets/vendor-jspdf-DmhUUlb9.js` | 370.2 KB | 119.9 KB |
| script | `assets/Dashboard-C6BbmnTv.js` | 349.1 KB | 85.4 KB |
| script | `assets/UnitDetail-PD76TTo2.js` | 316.0 KB | 72.2 KB |
| script | `assets/LegalDocumentWorkspace-DH3VBEpv.js` | 273.8 KB | 73.0 KB |
| image | `brand/kingstons-logo-form.png` | 270.2 KB | 266.3 KB |

## Browser route cold-loads

Not captured in this run. Use `npm run baseline:performance:browser` while preview is running.

