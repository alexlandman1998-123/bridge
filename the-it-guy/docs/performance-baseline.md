# Performance Baseline

Phase 0 diagnostic artifact. This file records the current platform performance baseline and does not enforce budgets.

Generated: 2026-07-31T11:26:46.014Z
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
| `npm run build` | 1m 28s | 2026-07-31T11:26:45.148Z |

## Build output summary

| Kind | Files | Raw | Gzip |
| --- | --- | --- | --- |
| script | 429 | 20.03 MB | 5.24 MB |
| style | 3 | 1.19 MB | 154.6 KB |
| image | 23 | 1.24 MB | 1.19 MB |
| font | 0 | 0 B | 0 B |
| html | 1 | 2.1 KB | 666 B |
| json | 1 | 20.1 KB | 6.6 KB |
| other | 0 | 0 B | 0 B |
| all | 457 | 22.48 MB | 6.59 MB |

## Initial HTML resources

| Relation | Asset | Raw | Gzip | Heavy flag |
| --- | --- | --- | --- | --- |
| modulepreload | `assets/vendor-runtime-p6VWrWG8.js` | 1.3 KB | 756 B |  |
| modulepreload | `assets/vendor-react-BX1-Nza-.js` | 225.2 KB | 72.2 KB |  |
| modulepreload | `assets/vendor-supabase-DTqiiTOY.js` | 168.0 KB | 44.7 KB |  |
| stylesheet | `assets/index-CUKCNnXy.css` | 1.04 MB | 126.2 KB |  |
| script | `assets/index-DFtWaYZI.js` | 359.4 KB | 86.4 KB |  |

## Largest build assets

| Kind | Asset | Raw | Gzip |
| --- | --- | --- | --- |
| script | `assets/api-DFQET0mg.js` | 1.65 MB | 385.9 KB |
| script | `assets/pdf.worker.min-iDqQPrd3.mjs` | 1.18 MB | 356.2 KB |
| style | `assets/index-CUKCNnXy.css` | 1.04 MB | 126.2 KB |
| script | `assets/ClientPortal-Dd0GhVAu.js` | 834.3 KB | 192.3 KB |
| script | `assets/AttorneyTransactionDetail-Cu6M4Yxe.js` | 789.8 KB | 181.1 KB |
| script | `assets/html2pdf-C5y4hFf5.js` | 751.8 KB | 226.4 KB |
| script | `assets/Pipeline-DHXMCbEh.js` | 623.1 KB | 147.0 KB |
| script | `assets/xlsx-CNerDvZX.js` | 419.1 KB | 139.6 KB |
| script | `assets/vendor-pdf-BOwjOaQL.js` | 405.0 KB | 120.3 KB |
| script | `assets/privateListingService-pxh77qjl.js` | 404.1 KB | 97.5 KB |
| script | `assets/vendor-html2canvas-CVApvLAy.js` | 393.8 KB | 93.0 KB |
| script | `assets/vendor-jspdf-DmhUUlb9.js` | 370.2 KB | 119.9 KB |
| script | `assets/SettingsSigningTemplatesPage-C5bzcAAv.js` | 369.5 KB | 85.3 KB |
| script | `assets/index-DFtWaYZI.js` | 359.4 KB | 86.4 KB |
| script | `assets/AgentListingDetail-D_qERGbK.js` | 353.0 KB | 84.7 KB |
| script | `assets/Dashboard-BScjwRbK.js` | 348.8 KB | 85.2 KB |
| script | `assets/UnitDetail-vsvFNGkX.js` | 303.4 KB | 68.8 KB |
| image | `brand/kingstons-logo-form.png` | 270.2 KB | 266.3 KB |
| image | `arch9-launch-preview.png` | 257.6 KB | 255.3 KB |
| script | `assets/LegalDocumentWorkspace-DDQlmBxh.js` | 247.7 KB | 67.1 KB |

## Browser route cold-loads

Not captured in this run. Use `npm run baseline:performance:browser` while preview is running.

