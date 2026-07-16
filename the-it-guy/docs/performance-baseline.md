# Performance Baseline

Phase 0 diagnostic artifact. This file records the current platform performance baseline and does not enforce budgets.

Generated: 2026-07-16T13:26:27.672Z
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
| `npm run build` | 1m 11s | 2026-07-16T13:26:27.019Z |

## Build output summary

| Kind | Files | Raw | Gzip |
| --- | --- | --- | --- |
| script | 421 | 18.60 MB | 4.85 MB |
| style | 3 | 1.14 MB | 148.4 KB |
| image | 14 | 998.7 KB | 950.9 KB |
| font | 0 | 0 B | 0 B |
| html | 1 | 2.0 KB | 605 B |
| json | 0 | 0 B | 0 B |
| other | 0 | 0 B | 0 B |
| all | 439 | 20.72 MB | 5.92 MB |

## Initial HTML resources

| Relation | Asset | Raw | Gzip | Heavy flag |
| --- | --- | --- | --- | --- |
| modulepreload | `assets/vendor-runtime-p6VWrWG8.js` | 1.3 KB | 756 B |  |
| modulepreload | `assets/vendor-react-Zo6OaaGg.js` | 226.1 KB | 72.6 KB |  |
| modulepreload | `assets/vendor-supabase-BZbLB7ko.js` | 190.2 KB | 50.5 KB |  |
| stylesheet | `assets/index-ROYF66aI.css` | 1015.6 KB | 120.0 KB |  |
| script | `assets/index-fPE9rhkU.js` | 326.8 KB | 78.4 KB |  |

## Largest build assets

| Kind | Asset | Raw | Gzip |
| --- | --- | --- | --- |
| script | `assets/api-CmP5Qdfm.js` | 1.39 MB | 326.0 KB |
| script | `assets/pdf.worker.min-iDqQPrd3.mjs` | 1.18 MB | 356.2 KB |
| style | `assets/index-ROYF66aI.css` | 1015.6 KB | 120.0 KB |
| script | `assets/AttorneyTransactionDetail-I2zNyi_q.js` | 756.2 KB | 181.3 KB |
| script | `assets/ClientPortal-eEmJowd-.js` | 592.1 KB | 136.0 KB |
| script | `assets/AgentLeadsPage-Bjwo09yk.js` | 545.5 KB | 128.5 KB |
| script | `assets/Pipeline-DOMboHi4.js` | 457.4 KB | 106.5 KB |
| script | `assets/xlsx-CNerDvZX.js` | 419.1 KB | 139.6 KB |
| script | `assets/vendor-pdf-BOwjOaQL.js` | 405.0 KB | 120.3 KB |
| script | `assets/SettingsSigningTemplatesPage-BM1AwQ6L.js` | 400.2 KB | 93.3 KB |
| script | `assets/vendor-jspdf-CY4VsHhy.js` | 370.2 KB | 119.9 KB |
| script | `assets/index-fPE9rhkU.js` | 326.8 KB | 78.4 KB |
| script | `assets/UnitDetail-CKOiKpLC.js` | 316.8 KB | 71.3 KB |
| script | `assets/privateListingService-DwMaAJfn.js` | 304.3 KB | 72.8 KB |
| script | `assets/AgentListingDetail-Cf_xk-Zj.js` | 297.5 KB | 68.4 KB |
| script | `assets/Dashboard-vzcqzVC8.js` | 285.4 KB | 69.5 KB |
| image | `brand/kingstons-logo-form.png` | 270.2 KB | 266.3 KB |
| image | `arch9-launch-preview.png` | 257.6 KB | 255.3 KB |
| script | `assets/Agents-D_cz7MRc.js` | 231.8 KB | 56.8 KB |
| image | `brand/kingstons-logo-cover.png` | 226.5 KB | 222.4 KB |

## Browser route cold-loads

Not captured in this run. Use `npm run baseline:performance:browser` while preview is running.

