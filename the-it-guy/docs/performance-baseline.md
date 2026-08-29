# Performance Baseline

Phase 0 diagnostic artifact. This file records cold and warm route timings, milestones, request counts, and build output.

Generated: 2026-08-29T16:17:13.607Z
Dist: `dist`

## How to update

```bash
npm run baseline:performance
```

Phase 0 guardrails compare future builds to this baseline and enforce hotspot chunk ceilings:

```bash
npm run test:performance-budget
npm run test:performance-phase0
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
| script | 547 | 23.36 MB | 6.15 MB |
| style | 4 | 1.31 MB | 171.8 KB |
| image | 28 | 1.65 MB | 1.59 MB |
| font | 0 | 0 B | 0 B |
| html | 1 | 2.1 KB | 663 B |
| json | 1 | 26.1 KB | 8.4 KB |
| other | 0 | 0 B | 0 B |
| all | 581 | 26.35 MB | 7.91 MB |

## Initial HTML resources

| Relation | Asset | Raw | Gzip | Heavy flag |
| --- | --- | --- | --- | --- |
| modulepreload | `assets/vendor-runtime-p6VWrWG8.js` | 1.3 KB | 756 B |  |
| modulepreload | `assets/vendor-react-BX1-Nza-.js` | 225.2 KB | 72.2 KB |  |
| modulepreload | `assets/vendor-supabase-DTqiiTOY.js` | 168.0 KB | 44.7 KB |  |
| stylesheet | `assets/index-Se_02_Cw.css` | 1.13 MB | 137.6 KB |  |
| script | `assets/index-CYD-xQDg.js` | 431.7 KB | 104.5 KB |  |

## Largest build assets

| Kind | Asset | Raw | Gzip |
| --- | --- | --- | --- |
| script | `assets/api-BafbzJ2b.js` | 1.29 MB | 300.3 KB |
| script | `assets/pdf.worker.min-iDqQPrd3.mjs` | 1.18 MB | 356.2 KB |
| style | `assets/index-Se_02_Cw.css` | 1.13 MB | 137.6 KB |
| script | `assets/AttorneyTransactionDetail-DiM3XyN8.js` | 993.7 KB | 239.7 KB |
| script | `assets/AgencyPipelinePage-Cf4kDx7S.js` | 930.2 KB | 234.2 KB |
| script | `assets/ClientPortal-Ci3INTT9.js` | 763.5 KB | 181.8 KB |
| script | `assets/html2pdf-C5y4hFf5.js` | 751.8 KB | 226.4 KB |
| script | `assets/index-CYD-xQDg.js` | 431.7 KB | 104.5 KB |
| script | `assets/packetService-Cg7s5B-m.js` | 427.3 KB | 98.4 KB |
| script | `assets/AgentListingDetail-B2tP_FoO.js` | 425.9 KB | 100.9 KB |
| script | `assets/xlsx-CNerDvZX.js` | 419.1 KB | 139.6 KB |
| script | `assets/vendor-pdf-BOwjOaQL.js` | 405.0 KB | 120.3 KB |
| script | `assets/LegalDocumentWorkspacePage-CvFbh_ew.js` | 401.6 KB | 106.9 KB |
| script | `assets/vendor-html2canvas-CVApvLAy.js` | 393.8 KB | 93.0 KB |
| script | `assets/SettingsSigningTemplatesPage-Ct0sBPDe.js` | 379.8 KB | 87.3 KB |
| script | `assets/vendor-jspdf-DmhUUlb9.js` | 370.2 KB | 119.9 KB |
| image | `brand/homeseekers/logo.png` | 369.7 KB | 351.7 KB |
| script | `assets/UnitDetail-IUJlUkon.js` | 307.4 KB | 72.6 KB |
| image | `brand/kingstons-logo-form.png` | 270.2 KB | 266.3 KB |
| script | `assets/AgentListings-CG5_td8h.js` | 262.8 KB | 61.9 KB |

## Browser route cold-loads

Not captured in this run. Use `npm run baseline:performance:browser` while preview is running.

