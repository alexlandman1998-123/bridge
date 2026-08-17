import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const agentListingsSource = readFileSync(resolve(appRoot, 'src/pages/AgentListings.jsx'), 'utf8')
const developerLeadServiceSource = readFileSync(resolve(appRoot, 'src/services/developerLeadService.js'), 'utf8')
const apiSource = readFileSync(resolve(appRoot, 'src/lib/api.js'), 'utf8')
const docsSource = readFileSync(resolve(appRoot, 'docs/developer-leads-phase20-agent-capture.md'), 'utf8')
const phase5Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase5-release-readiness.test.mjs'), 'utf8')
const phase6Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase6-post-rollout-monitoring.mjs'), 'utf8')

const scripts = packageJson.scripts || {}

assert.equal(
  scripts['test:developer-module-phase20'],
  'node scripts/developer-leads-phase20-agent-capture.test.mjs',
)
assert.match(scripts['verify:developer-module'] || '', /test:developer-module-phase20/)

for (const token of [
  'DEVELOPER_LEAD_PHASE20_CONTRACT',
  'developer-leads-phase20-agent-capture-v1',
  'createAgencyIntroducedDeveloperLead',
  'fetchUnitsForTransactionSetup',
  'developerLeadModalOpen',
  'buildInitialDeveloperLeadCaptureForm',
  'openDeveloperLeadCaptureModal',
  'handleSubmitDeveloperLead',
  'Submit Buyer Lead',
  'Submit Protected Lead',
  'Protected developer lead',
  'protectedSummaryContainsBuyerDetails',
  'createAgencyIntroducedDeveloperLead({',
  "leadSource: 'agent_portal_development'",
  "leadStatus: 'new'",
  "sourceSurface: '/listings/developments'",
  "window.dispatchEvent(new Event('itg:developer-leads-changed'))",
  'data-contract={DEVELOPER_LEAD_PHASE20_CONTRACT}',
]) {
  assert.match(agentListingsSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

for (const token of [
  "ownership_model: 'agency_introduced'",
  "lead_owner: 'agency'",
  "selling_model: 'agent_led'",
  "visibility_state: 'limited'",
  "handover_source: 'agency'",
  "source: 'developer_leads_phase12_agency_fed'",
]) {
  assert.match(developerLeadServiceSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

assert.match(apiSource, /select\(normalizedOrganisationId \? 'id, organisation_id, name, planned_units' : 'id, name, planned_units'\)/)
assert.match(apiSource, /isMissingColumnError\(scopedQuery\.error, 'organisation_id'\)/)
assert.match(apiSource, /isMissingColumnError\(error, 'organisation_id'\)/)

assert.doesNotMatch(agentListingsSource, /convertDeveloperLeadToTransactionAndSendOnboarding/)
assert.doesNotMatch(agentListingsSource, /recordBuyerOnboardingSent/)
assert.doesNotMatch(agentListingsSource, /type:\s*'client_onboarding'/)
assert.doesNotMatch(agentListingsSource, /service_role|sb_secret_|security\s+definer/i)

assert.match(docsSource, /Developer Leads Phase 20 Agent Capture/)
assert.match(docsSource, /Submit Buyer Lead/)
assert.match(docsSource, /createAgencyIntroducedDeveloperLead/)
assert.match(docsSource, /limited/)
assert.match(docsSource, /No Phase 20 code adds privileged database functions/)
assert.doesNotMatch(docsSource, /service_role|sb_secret_|access_token/i)

assert.match(phase5Source, /test:developer-module-phase20/)
assert.match(phase6Source, /test:developer-module-phase20/)

console.log(JSON.stringify({
  version: 'developer_leads_phase20_agent_capture_v1',
  ready: true,
  coveredSurfaces: [
    'agent development lead capture action',
    'protected summary privacy guard',
    'target developer workspace id propagation',
    'preferred unit loading',
    'agency-introduced developer lead service call',
    'non-converting agent capture boundary',
  ],
}, null, 2))
