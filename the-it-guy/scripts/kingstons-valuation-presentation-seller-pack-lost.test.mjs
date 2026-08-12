import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  definition: await readFile(new URL('../src/services/sellerProcessDefinitionService.js', import.meta.url), 'utf8'),
  panel: await readFile(new URL('../src/services/sellerProcessWorkspacePanelService.js', import.meta.url), 'utf8'),
  pipeline: await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8'),
}

for (const token of [
  "key: 'valuation_presented'",
  "label: 'Valuation Presented'",
  "requiredEvidenceKeys: Object.freeze(['valuation_presented'])",
  "appointmentType: 'valuation_presentation'",
  "acceptedStatuses: Object.freeze(['completed'])",
]) {
  assert.ok(files.definition.includes(token), `seller process definition should require completed valuation presentation: ${token}`)
}

for (const token of [
  "key: 'complete_valuation_presentation'",
  "label: 'Complete Valuation Presentation'",
  "pending: processNeedsEvidence('valuation_presented')",
  "key: 'mark_seller_lead_lost'",
  "label: 'Mark as Lost'",
]) {
  assert.ok(files.panel.includes(token), `seller process panel should expose presentation completion/lost actions: ${token}`)
}

for (const token of [
  'complete_valuation_presentation',
  'mark_seller_lead_lost',
  "stage: 'Valuation Presentation'",
  "status: 'Valuation Presentation Scheduled'",
  "stage: 'Seller Pack'",
  "status: 'Valuation Presented'",
  "activityType: completedKingstonsPresentation ? 'Valuation Presented' : 'Valuation Completed'",
  "openArchiveLeadModal(selectedLead.leadId)",
]) {
  assert.ok(files.pipeline.includes(token), `agency pipeline should route valuation presentation completion/lost state: ${token}`)
}

assert.doesNotMatch(
  files.pipeline,
  /filter\(\(stage\) => stage\.key !== 'valuation_presented'\)/,
  'Kingstons pipeline rail should show the Valuation Presented decision point.',
)

console.log('Kingstons valuation presentation seller-pack/lost contract passed.')
