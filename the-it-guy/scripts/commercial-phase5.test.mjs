import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

async function read(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8')
}

const workflowSource = await read('../src/modules/commercial/commercialWorkflow.js')
for (const marker of [
  'REQUIREMENT_LIFECYCLE',
  'VACANCY_LIFECYCLE',
  'DEAL_LIFECYCLE',
  'HOT_LIFECYCLE',
  'LEASE_LIFECYCLE',
  'normalizeCommercialLifecycleStage',
  'buildCommercialConversionMetrics',
  'hot_draft',
  'lease_pending',
  'pending_signature',
]) {
  assert.match(workflowSource, new RegExp(marker), `commercial workflow module should include ${marker}`)
}

const migrationSource = await read('../../supabase/migrations/202606080003_commercial_workflow_engine.sql')
for (const marker of [
  'commercial_deals',
  'add column if not exists vacancy_id uuid references public.commercial_vacancies',
  'commercial_heads_of_terms',
  'add column if not exists sent_at',
  'add column if not exists signed_at',
  'commercial_leases',
  'add column if not exists heads_of_terms_id uuid references public.commercial_heads_of_terms',
]) {
  assert.match(migrationSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Phase 5 migration should include ${marker}`)
}

const apiSource = await read('../src/modules/commercial/services/commercialApi.js')
for (const marker of [
  'COMMERCIAL_LEASING_WORKFLOW_COLUMNS',
  'createDealFromRequirement',
  'updateHeadsOfTermsStatus',
  'createLeaseFromHeadsOfTerms',
  'lease_created_from_hot',
  'heads_of_terms_status_changed',
  "stage: 'converted'",
  'lease_pending',
  'normalizeCommercialLifecycleStage',
]) {
  assert.match(apiSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `commercial API should include ${marker}`)
}

const intelligenceSource = await read('../src/modules/commercial/services/commercialIntelligenceApi.js')
for (const marker of [
  'scoreRequirementVacancyMatch',
  'buildRequirementVacancyMatches',
  'matchPercentage',
  'area',
  'GLA',
  'budget',
  'availability',
]) {
  assert.match(intelligenceSource, new RegExp(marker), `commercial matching should include ${marker}`)
}

const hotPanelSource = await read('../src/modules/commercial/components/CommercialHeadsOfTermsPanel.jsx')
for (const marker of [
  'HOT_PROGRESS',
  'createLeaseFromHeadsOfTerms',
  'Create Lease',
  'Ready for lease creation',
  'vacancy_id: deal.vacancy_id',
  'signed_at',
]) {
  assert.match(hotPanelSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `HOT panel should include ${marker}`)
}

const recordDrawerSource = await read('../src/modules/commercial/components/CommercialRecordDrawer.jsx')
for (const marker of [
  'MatchingPanel',
  'Suggested Vacancies',
  'Matching Requirements',
  'buildRequirementVacancyMatches',
  'Simple weighted fit',
]) {
  assert.match(recordDrawerSource, new RegExp(marker), `record drawer should include ${marker}`)
}

const dashboardApiSource = await read('../src/modules/commercial/services/commercialDashboardApi.js')
for (const marker of [
  'buildCommercialConversionMetrics',
  'conversionMetrics',
  'normalizeCommercialLifecycleStage',
  'hot_draft',
  'hot_accepted',
]) {
  assert.match(dashboardApiSource, new RegExp(marker), `dashboard API should include ${marker}`)
}

const dashboardSource = await read('../src/modules/commercial/pages/CommercialDashboard.jsx')
for (const marker of [
  'ConversionMetricsCard',
  'Requirement to Deal',
  'Deal to HOT',
  'HOT to Signed',
  'Signed to Lease',
  'Lease to Active',
]) {
  assert.match(dashboardSource, new RegExp(marker), `dashboard should include ${marker}`)
}

const requirementsPipelineSource = await read('../src/modules/commercial/pages/CommercialRequirementsPipelinePage.jsx')
assert.match(requirementsPipelineSource, /normalizeCommercialLifecycleStage\('requirements'/, 'requirements pipeline should normalize lifecycle stages')

const dealsPipelineSource = await read('../src/modules/commercial/pages/CommercialDealsPipelinePage.jsx')
assert.match(dealsPipelineSource, /normalizeCommercialLifecycleStage\('deals'/, 'deals pipeline should normalize lifecycle stages')

console.log('commercial Phase 5 workflow tests passed')
