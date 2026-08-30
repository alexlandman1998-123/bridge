import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pageSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const loaderSource = await readFile(new URL('../src/pages/agency/agencyLeadWorkspaceLoader.js', import.meta.url), 'utf8')
const baselineSource = await readFile(new URL('../src/services/observability/buyerLeadsPerformanceBaseline.js', import.meta.url), 'utf8')

for (const checkpoint of [
  'workspace_chunk_loaded',
  'core_lead_ready',
  'overview_first_rendered',
  'journey_first_rendered',
  'journey_enrichment_complete',
  'assignment_menu_opened',
]) {
  assert.match(baselineSource, new RegExp(checkpoint), `missing Phase 0 checkpoint: ${checkpoint}`)
  assert.match(pageSource, new RegExp(`['"]${checkpoint}['"]`), `workspace does not record Phase 0 checkpoint: ${checkpoint}`)
}

assert.match(loaderSource, /beginBuyerLeadWorkspaceChunkLoad\(\)/, 'workspace chunk load start is not measured')
assert.match(loaderSource, /completeBuyerLeadWorkspaceChunkLoad\(\)/, 'workspace chunk completion is not measured')

// Stable selectors are the automated contracts for the three reported surfaces.
assert.match(pageSource, /data-testid="buyer-qualification-edit"/, 'Buyer Qualification edit contract is missing')
assert.match(pageSource, /data-testid="buyer-assignment-trigger"/, 'Assigned To interaction contract is missing')
assert.match(pageSource, /data-testid="buyer-journey-overview"/, 'Buyer Journey render contract is missing')
assert.match(pageSource, /aria-label="Reassign buyer lead"/, 'Assigned To menu contract is missing')

assert.doesNotMatch(baselineSource, /leadId\s*[,}:]/, 'performance baseline must not persist lead identifiers')

console.log('buyer lead overview Phase 0 observability contracts passed')
