import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEVELOPER_LEAD_PHASE23_CONTRACT,
  buildReleasedDeveloperLeadConversionQueue,
  summarizeReleasedDeveloperLeadConversionQueue,
} from '../src/core/developerLeads/developerLeadReleasedConversionQueue.js'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const queueSource = readFileSync(resolve(appRoot, 'src/core/developerLeads/developerLeadReleasedConversionQueue.js'), 'utf8')
const developerLeadsPageSource = readFileSync(resolve(appRoot, 'src/pages/DeveloperLeadsPage.jsx'), 'utf8')
const conversionServiceSource = readFileSync(resolve(appRoot, 'src/services/developerLeadConversionService.js'), 'utf8')
const docsSource = readFileSync(resolve(appRoot, 'docs/developer-leads-phase23-released-conversion-queue.md'), 'utf8')
const phase5Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase5-release-readiness.test.mjs'), 'utf8')
const phase6Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase6-post-rollout-monitoring.mjs'), 'utf8')

const scripts = packageJson.scripts || {}

assert.equal(
  scripts['test:developer-module-phase23'],
  'node scripts/developer-leads-phase23-released-conversion-queue.test.mjs',
)
assert.match(scripts['verify:developer-module'] || '', /test:developer-module-phase23/)
assert.equal(DEVELOPER_LEAD_PHASE23_CONTRACT, 'developer-leads-phase23-released-conversion-queue-v1')

const sampleLeads = [
  {
    developerLeadId: 'lead-ready',
    developerOrgId: 'developer-1',
    sourceAgencyOrgId: 'agency-1',
    sourceAgentUserId: 'agent-1',
    leadOwner: 'agency',
    ownershipModel: 'agency_introduced',
    visibilityState: 'handed_over',
    leadStatus: 'qualified',
    buyerFullName: 'Released Buyer',
    buyerEmail: 'released@example.test',
    primaryDevelopmentId: 'development-1',
    preferredUnitId: 'unit-1',
  },
  {
    developerLeadId: 'lead-blocked',
    developerOrgId: 'developer-1',
    sourceAgencyOrgId: 'agency-1',
    leadOwner: 'agency',
    visibilityState: 'handed_over',
    leadStatus: 'new',
    buyerFullName: 'Needs Unit',
    buyerPhone: '+27000000000',
    primaryDevelopmentId: 'development-1',
  },
  {
    developerLeadId: 'lead-protected',
    developerOrgId: 'developer-1',
    sourceAgencyOrgId: 'agency-1',
    leadOwner: 'agency',
    visibilityState: 'limited',
    leadStatus: 'qualified',
    buyerFullName: 'Hidden Buyer',
    buyerEmail: 'hidden@example.test',
  },
  {
    developerLeadId: 'lead-converted',
    developerOrgId: 'developer-1',
    sourceAgencyOrgId: 'agency-1',
    leadOwner: 'agency',
    visibilityState: 'handed_over',
    leadStatus: 'converted',
    convertedTransactionId: 'transaction-1',
    buyerFullName: 'Converted Buyer',
    buyerEmail: 'converted@example.test',
  },
]

const queue = buildReleasedDeveloperLeadConversionQueue(sampleLeads)
assert.equal(queue.contract, DEVELOPER_LEAD_PHASE23_CONTRACT)
assert.equal(queue.totalReleased, 3)
assert.equal(queue.activeReleasedCount, 2)
assert.equal(queue.convertedCount, 1)
assert.equal(queue.readyToConvertCount, 1)
assert.equal(queue.blockedCount, 1)
assert.equal(queue.cards.length, 2)
assert.equal(queue.cards[0].canConvert, true)
assert.equal(queue.cards[0].canSendBuyerOnboarding, true)
assert.equal(queue.cards[0].buyerEmail, 'released@example.test')
assert.equal(queue.cards[0].lead.developerLeadId, 'lead-ready')
assert.equal(queue.cards[1].canConvert, false)
assert.match(queue.cards[1].nextAction, /Mark the lead as qualified or reserved|Select a preferred unit/)
assert.equal(queue.cards.some((card) => card.developerLeadId === 'lead-protected'), false)

const summary = summarizeReleasedDeveloperLeadConversionQueue(sampleLeads)
assert.equal(summary.contract, DEVELOPER_LEAD_PHASE23_CONTRACT)
assert.equal(summary.status, 'blocked')
assert.match(summary.detail, /released agency lead/)

for (const token of [
  'DEVELOPER_LEAD_PHASE23_CONTRACT',
  'developer-leads-phase23-released-conversion-queue-v1',
  'buildReleasedDeveloperLeadConversionQueue',
  'summarizeReleasedDeveloperLeadConversionQueue',
  'buildDeveloperLeadTransactionHandoff',
  "visibilityState) === 'handed_over'",
]) {
  assert.match(queueSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

for (const token of [
  'DEVELOPER_LEAD_PHASE23_CONTRACT',
  'ReleasedDeveloperLeadConversionPanel',
  'buildReleasedDeveloperLeadConversionQueue(leads)',
  'summarizeReleasedDeveloperLeadConversionQueue(leads)',
  'Released Buyer Conversion',
  'Convert & Send',
  'data-contract={DEVELOPER_LEAD_PHASE23_CONTRACT}',
  'convertDeveloperLeadToTransactionAndSendOnboarding',
  'handleConvertLead',
]) {
  assert.match(developerLeadsPageSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

for (const token of [
  'createTransactionFromWizard',
  'recordBuyerOnboardingSent',
  'sendBuyerOnboarding = true',
]) {
  assert.match(conversionServiceSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

assert.doesNotMatch(queueSource, /createTransactionFromWizard|recordBuyerOnboardingSent|invokeEdgeFunction|send-email|service_role/i)
assert.doesNotMatch(developerLeadsPageSource, /service_role|sb_secret_|security\s+definer/i)

assert.match(docsSource, /Developer Leads Phase 23 Released Conversion Queue/)
assert.match(docsSource, /visibility_state = handed_over/)
assert.match(docsSource, /existing Phase 18/)
assert.match(docsSource, /does not create new Supabase tables/)
assert.match(docsSource, /bypass RLS/)
assert.doesNotMatch(docsSource, /service_role|sb_secret_|access_token/i)

assert.match(phase5Source, /test:developer-module-phase23/)
assert.match(phase6Source, /test:developer-module-phase23/)

console.log(JSON.stringify({
  version: 'developer_leads_phase23_released_conversion_queue_v1',
  ready: true,
  coveredSurfaces: [
    'released agency lead conversion queue',
    'developer-side handoff readiness after agency release',
    'existing convert and buyer onboarding action',
    'developer-module verification chain',
  ],
}, null, 2))
