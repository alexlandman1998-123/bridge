import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  captureLegalDocumentGenerationBaseline,
  findReconciledLegalDocumentVersion,
  isAmbiguousLegalDocumentGenerationFailure,
  reconcileLegalDocumentGenerationFailure,
} from '../src/core/documents/legalDocumentGenerationReconciliation.js'
import { assessLegalDocumentGenerationReconciliationReadiness } from '../src/core/documents/legalDocumentGenerationReconciliationReadiness.js'

const oldVersion = { id: 'old', version_number: 3, render_status: 'generated' }
const newVersion = { id: 'new', version_number: 4, render_status: 'generated' }
const baseline = captureLegalDocumentGenerationBaseline({ versions: [oldVersion] })
assert.deepEqual(baseline, { generatedVersionIds: ['old'], maxVersionNumber: 3 })
assert.equal(findReconciledLegalDocumentVersion({ versions: [oldVersion] }, baseline), null)
assert.equal(findReconciledLegalDocumentVersion({ versions: [newVersion, oldVersion] }, baseline)?.id, 'new')
assert.equal(isAmbiguousLegalDocumentGenerationFailure({ code: 'GENERATION_ALREADY_IN_PROGRESS' }), true)
assert.equal(isAmbiguousLegalDocumentGenerationFailure(new Error('Draft generation is taking too long.')), true)
assert.equal(isAmbiguousLegalDocumentGenerationFailure({ code: 'PDF_RENDER_FAILED' }), false)

let loads = 0
const recovered = await reconcileLegalDocumentGenerationFailure({
  error: { code: 'GENERATION_TIMEOUT' },
  baseline,
  delaysMs: [0, 1],
  wait: async () => {},
  loadStatus: async () => ({ versions: ++loads === 1 ? [oldVersion] : [newVersion, oldVersion] }),
})
assert.equal(recovered.confirmed, true)
assert.equal(recovered.version.id, 'new')
assert.equal(recovered.checks, 2)

const unresolved = await reconcileLegalDocumentGenerationFailure({ error: { code: 'GENERATION_ALREADY_IN_PROGRESS' }, baseline, delaysMs: [0, 1], wait: async () => {}, loadStatus: async () => ({ versions: [oldVersion] }) })
assert.equal(unresolved.attempted, true)
assert.equal(unresolved.confirmed, false)
let nonAmbiguousLoads = 0
const skipped = await reconcileLegalDocumentGenerationFailure({ error: { code: 'PDF_RENDER_FAILED' }, baseline, loadStatus: async () => { nonAmbiguousLoads += 1 } })
assert.equal(skipped.attempted, false)
assert.equal(nonAmbiguousLoads, 0)

const sourceFiles = {
  workspace: 'src/components/documents/LegalDocumentWorkspace.jsx',
  packet_panel: 'src/components/documents/DocumentPacketWorkflowPanel.jsx',
  document_builder: 'src/pages/settings/SettingsSigningTemplatesPage.jsx',
}
for (const file of Object.values(sourceFiles)) {
  const source = fs.readFileSync(file, 'utf8')
  assert.match(source, /captureLegalDocumentGenerationBaseline/)
  assert.match(source, /reconcileLegalDocumentGenerationFailure/)
  assert.match(source, /reconciliation\.confirmed/)
}
for (const file of ['src/pages/agency/AgencyPipelinePage.jsx', 'src/pages/UnitDetail.jsx']) {
  assert.match(fs.readFileSync(file, 'utf8'), /isAmbiguousLegalDocumentGenerationFailure/)
}
const packetService = fs.readFileSync('src/core/documents/packetService.js', 'utf8')
assert.match(packetService, /error\.packetId = packet\.id/)
assert.match(fs.readFileSync(sourceFiles.packet_panel, 'utf8'), /error\?\.packetId/)
const scenarios = ['new_version', 'old_version_rejected', 'duplicate', 'plain_timeout', 'non_ambiguous_skipped'].map((name) => ({ name, passed: true }))
const fixture = { j1: { status: 'READY_FOR_J2' }, scenarios, surfaces: Object.keys(sourceFiles), feederSuppressionCovered: true }
assert.equal(assessLegalDocumentGenerationReconciliationReadiness(fixture).ready, true)
assert.ok(assessLegalDocumentGenerationReconciliationReadiness({ ...fixture, j1: { status: 'NO_GO' } }).reasons.includes('J2_J1_NOT_READY'))
assert.ok(assessLegalDocumentGenerationReconciliationReadiness({ ...fixture, surfaces: ['workspace'] }).reasons.includes('J2_RECOVERY_SURFACE_UNCOVERED'))
console.log('Legal document J2 generation reconciliation contract passed.')
