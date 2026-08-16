import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEVELOPER_LEAD_PHASE19_CONTRACT,
  DEVELOPER_SALE_ALIGNMENT_FIELDS,
  DEVELOPER_SALE_LEAD_LIFECYCLE,
  DEVELOPER_SALE_MODULE_SURFACES,
  DEVELOPER_SALE_SELLING_MODELS,
  assertDeveloperSaleLifecycleCanAdvance,
  buildDeveloperSaleLeadAlignmentProfile,
} from '../src/core/developerLeads/developerLeadAlignmentContract.js'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const alignmentSource = readFileSync(resolve(appRoot, 'src/core/developerLeads/developerLeadAlignmentContract.js'), 'utf8')
const agentListingsSource = readFileSync(resolve(appRoot, 'src/pages/AgentListings.jsx'), 'utf8')
const agentWizardSource = readFileSync(resolve(appRoot, 'src/components/AgentNewDealWizard.jsx'), 'utf8')
const developerLeadsPageSource = readFileSync(resolve(appRoot, 'src/pages/DeveloperLeadsPage.jsx'), 'utf8')
const developerLeadServiceSource = readFileSync(resolve(appRoot, 'src/services/developerLeadService.js'), 'utf8')
const developerLeadConversionSource = readFileSync(resolve(appRoot, 'src/services/developerLeadConversionService.js'), 'utf8')
const appSource = readFileSync(resolve(appRoot, 'src/App.jsx'), 'utf8')
const rolesSource = readFileSync(resolve(appRoot, 'src/lib/roles.js'), 'utf8')
const docsSource = readFileSync(resolve(appRoot, 'docs/developer-leads-phase19-agent-developer-alignment.md'), 'utf8')

const scripts = packageJson.scripts || {}

assert.equal(
  scripts['test:developer-module-phase19'],
  'node scripts/developer-leads-phase19-agent-developer-alignment.test.mjs',
)
assert.match(scripts['verify:developer-module'] || '', /test:developer-module-phase19/)

assert.equal(DEVELOPER_LEAD_PHASE19_CONTRACT, 'developer-leads-phase19-agent-developer-alignment-v1')

for (const key of [
  'developer_direct',
  'developer_assigned_agent',
  'agency_introduced',
]) {
  assert.ok(DEVELOPER_SALE_SELLING_MODELS.some((model) => model.key === key), `${key} selling model should be declared`)
}

for (const key of [
  'agency_captured',
  'protected_lead_shared',
  'handover_requested',
  'buyer_details_released',
  'qualified',
  'reserved',
  'converted_to_transaction',
  'buyer_onboarding_sent',
]) {
  assert.ok(DEVELOPER_SALE_LEAD_LIFECYCLE.some((stage) => stage.key === key), `${key} lifecycle stage should be declared`)
}

for (const field of [
  'developerOrgId',
  'sourceAgencyOrgId',
  'sourceAgentUserId',
  'assignedAgentId',
  'primaryDevelopmentId',
  'preferredUnitId',
  'visibilityState',
  'leadOwner',
  'ownershipModel',
  'sellingModel',
  'reservationState',
  'leadStatus',
  'convertedTransactionId',
]) {
  assert.ok(DEVELOPER_SALE_ALIGNMENT_FIELDS.includes(field), `${field} should be part of the shared alignment field contract`)
}

assert.equal(DEVELOPER_SALE_MODULE_SURFACES.developer.leadsPath, '/developer/leads')
assert.equal(DEVELOPER_SALE_MODULE_SURFACES.agent.developmentsPath, '/listings/developments')
assert.equal(DEVELOPER_SALE_MODULE_SURFACES.agent.ownsProtectedLeadCapture, true)
assert.equal(DEVELOPER_SALE_MODULE_SURFACES.developer.ownsLeadConversion, true)

const developerDirect = buildDeveloperSaleLeadAlignmentProfile({
  developerLeadId: 'lead-direct',
  developerOrgId: 'developer-org',
  leadOwner: 'developer',
  ownershipModel: 'developer_direct',
  sellingModel: 'developer_led',
  visibilityState: 'full',
  leadStatus: 'new',
  primaryDevelopmentId: 'development-1',
  preferredUnitId: 'unit-1',
  buyerFullName: 'Developer Buyer',
  buyerEmail: 'buyer@example.test',
})
assert.equal(developerDirect.contract, DEVELOPER_LEAD_PHASE19_CONTRACT)
assert.equal(developerDirect.aligned, true)
assert.equal(developerDirect.sellingModel.key, 'developer_direct')
assert.equal(developerDirect.lifecycleStage, 'developer_captured')
assert.equal(developerDirect.canMoveToTransaction, false)

const agencyProtected = buildDeveloperSaleLeadAlignmentProfile({
  developerLeadId: 'lead-agency',
  developerOrgId: 'developer-org',
  sourceAgencyOrgId: 'agency-org',
  sourceAgentUserId: 'agent-user',
  assignedAgentId: 'agent-user',
  leadOwner: 'agency',
  ownershipModel: 'agency_introduced',
  sellingModel: 'agent_led',
  visibilityState: 'limited',
  leadStatus: 'new',
  primaryDevelopmentId: 'development-1',
  preferredUnitId: 'unit-1',
  protectedSummary: '2-bed buyer, R2m-R2.3m budget',
  buyerFullName: 'Hidden Buyer',
  buyerEmail: 'hidden@example.test',
})
assert.equal(agencyProtected.aligned, true)
assert.equal(agencyProtected.sellingModel.key, 'agency_introduced')
assert.equal(agencyProtected.lifecycleStage, 'protected_lead_shared')
assert.equal(agencyProtected.accessProfile.requiresHandoverBeforePrivateDetails, true)
assert.deepEqual(agencyProtected.redactedFields, [
  'buyerFullName',
  'buyerEmail',
  'buyerPhone',
  'buyerIdNumber',
  'privateNotes',
  'rawPayload',
])
assert.equal(agencyProtected.canMoveToTransaction, false)

const agencyReleased = buildDeveloperSaleLeadAlignmentProfile({
  ...agencyProtected.accessProfile,
  developerLeadId: 'lead-agency',
  developerOrgId: 'developer-org',
  sourceAgencyOrgId: 'agency-org',
  sourceAgentUserId: 'agent-user',
  assignedAgentId: 'agent-user',
  leadOwner: 'agency',
  ownershipModel: 'agency_introduced',
  sellingModel: 'agent_led',
  visibilityState: 'handed_over',
  leadStatus: 'qualified',
  primaryDevelopmentId: 'development-1',
  preferredUnitId: 'unit-1',
  protectedSummary: '2-bed buyer, R2m-R2.3m budget',
  buyerFullName: 'Visible Buyer',
  buyerEmail: 'visible@example.test',
})
assert.equal(agencyReleased.lifecycleStage, 'qualified')
assert.equal(agencyReleased.accessProfile.canDeveloperSeePrivateDetails, true)
assert.equal(agencyReleased.canMoveToTransaction, true)

const converted = buildDeveloperSaleLeadAlignmentProfile({
  ...agencyReleased,
  convertedTransactionId: 'transaction-1',
  leadStatus: 'converted',
})
assert.equal(converted.lifecycleStage, 'converted_to_transaction')

const onboardingSent = buildDeveloperSaleLeadAlignmentProfile({
  ...agencyReleased,
  convertedTransactionId: 'transaction-1',
  leadStatus: 'converted',
  buyerOnboardingSentAt: '2026-08-16T08:00:00.000Z',
})
assert.equal(onboardingSent.lifecycleStage, 'buyer_onboarding_sent')

assert.equal(assertDeveloperSaleLifecycleCanAdvance('protected_lead_shared', 'handover_requested'), true)
assert.equal(assertDeveloperSaleLifecycleCanAdvance('buyer_details_released', 'protected_lead_shared'), false)

for (const token of [
  'DEVELOPER_LEAD_PHASE19_CONTRACT',
  'DEVELOPER_SALE_SELLING_MODELS',
  'DEVELOPER_SALE_LEAD_LIFECYCLE',
  'DEVELOPER_SALE_ALIGNMENT_FIELDS',
  'DEVELOPER_SALE_MODULE_SURFACES',
  'buildDeveloperSaleLeadAlignmentProfile',
  'assertDeveloperSaleLifecycleCanAdvance',
  'agency_protected_until_handover',
]) {
  assert.match(alignmentSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

assert.match(rolesSource, /developer_leads/)
assert.match(rolesSource, /to: '\/developer\/leads'/)
assert.match(rolesSource, /label: 'Listings'/)
assert.match(appSource, /path="\/developer\/leads"/)
assert.match(appSource, /path="\/listings\/:listingSection\?"/)
assert.match(agentListingsSource, /fetchAssignedDevelopmentIdsForRole/)
assert.match(agentListingsSource, /navigate\('\/listings\/developments'\)/)
assert.match(agentListingsSource, /Development Listings/)
assert.match(agentWizardSource, /transactionType: propertyMode === PROPERTY_MODE_DEVELOPMENT \? 'developer_sale'/)
assert.match(agentWizardSource, /developmentId: propertyMode === PROPERTY_MODE_DEVELOPMENT/)
assert.match(agentWizardSource, /unitId: propertyMode === PROPERTY_MODE_DEVELOPMENT/)
assert.match(agentWizardSource, /reservationRequired/)
assert.match(developerLeadsPageSource, /requestAgencyLeadHandover/)
assert.match(developerLeadsPageSource, /convertDeveloperLeadToTransactionAndSendOnboarding/)
assert.match(developerLeadServiceSource, /createAgencyIntroducedDeveloperLead/)
assert.match(developerLeadServiceSource, /visibility_state: 'limited'/)
assert.match(developerLeadServiceSource, /handover_source: 'agency'/)
assert.match(developerLeadConversionSource, /createTransactionFromWizard/)
assert.match(developerLeadConversionSource, /type: 'client_onboarding'/)

assert.match(docsSource, /Developer Leads Phase 19 Agent Developer Alignment/)
assert.match(docsSource, /Developer Direct/)
assert.match(docsSource, /Agency Introduced/)
assert.match(docsSource, /agency_captured/)
assert.match(docsSource, /buyer_onboarding_sent/)
assert.match(docsSource, /No Phase 19 code creates live records/)
assert.doesNotMatch(docsSource, /service_role|sb_secret_|access_token/i)

console.log(JSON.stringify({
  version: 'developer_leads_phase19_agent_developer_alignment_v1',
  ready: true,
  coveredSurfaces: [
    'shared developer-sale lead lifecycle',
    'developer direct and agent-led selling models',
    'agency protected lead privacy boundary',
    'shared agent/developer field contract',
    'agent development listings route',
    'developer leads conversion route',
  ],
}, null, 2))
