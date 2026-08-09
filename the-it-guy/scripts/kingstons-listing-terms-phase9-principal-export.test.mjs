import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const agencyPage = await readFile('src/pages/agency/AgencyPipelinePage.jsx', 'utf8')

assert.match(
  agencyPage,
  /function buildKingstonsPrincipalExceptionReportCsv/,
  'Phase 9 should add a dedicated CSV builder for the Kingstons principal exception report.',
)

assert.match(
  agencyPage,
  /function downloadKingstonsPrincipalExceptionReportCsv/,
  'Phase 9 should add a browser download helper for the principal report CSV.',
)

assert.match(
  agencyPage,
  /kingstons-seller-workflow-exceptions-/,
  'Phase 9 CSV exports should use a Kingstons seller workflow filename.',
)

assert.match(
  agencyPage,
  /Allocation Checked/,
  'Phase 9 CSV exports should include allocation verification evidence from Phase 8.',
)

assert.match(
  agencyPage,
  /Attorney Pipeline/,
  'Phase 9 CSV exports should preserve attorney pipeline status in exported rows.',
)

assert.match(
  agencyPage,
  /No open Kingstons seller workflow exceptions/,
  'Phase 9 CSV exports should still produce a useful clear-state summary row.',
)

assert.match(
  agencyPage,
  /onExportCsv=\{handleDownloadKingstonsPrincipalExceptionReport\}/,
  'Phase 9 should wire the export action into the principal report card.',
)

assert.match(
  agencyPage,
  /disabled=\{report\.allocationsLoading\}/,
  'Phase 9 should avoid exporting while allocation verification is still loading.',
)

console.log('Kingstons listing terms Phase 9 principal export checks passed.')
