import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const pageSource = readFileSync('src/pages/LegalDocumentWorkspacePage.jsx', 'utf8')

assert.match(
  pageSource,
  /runCanonicalDocumentRequestRequirementRecalculation/,
  'Phase 12 UI should call the canonical recalculation API.',
)
assert.match(
  pageSource,
  /function DocumentRequestRecalculationPanel/,
  'Phase 12 UI should expose a dedicated recalculation panel.',
)
assert.match(
  pageSource,
  /dryRun:\s*true/,
  'Phase 12 dry-run action should explicitly run in dry-run mode.',
)
assert.match(
  pageSource,
  /commit:\s*true/,
  'Phase 12 commit action should require explicit commit mode.',
)
assert.match(
  pageSource,
  /Boolean\(documentRequestRecalculation\.dryRunResult\)/,
  'Phase 12 commit should be gated behind a previous dry-run result.',
)
assert.match(
  pageSource,
  /documentRequestDryRunStats\.failed === 0/,
  'Phase 12 commit should be disabled when the dry-run has failures.',
)
assert.match(
  pageSource,
  /await loadRouteContext\(\)/,
  'Phase 12 commit should refresh transaction context after writing rows.',
)
assert.match(
  pageSource,
  /developer[\s\S]*internal_admin[\s\S]*admin[\s\S]*platform_admin[\s\S]*attorney/,
  'Phase 12 panel should be limited to admin/attorney roles.',
)

console.log('document request canonical phase 12 admin UI contract tests passed')
