import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEVELOPER_LEAD_PHASE24_CONTRACT,
  buildAgencyDeveloperLeadConversionReceiptQueue,
  summarizeAgencyDeveloperLeadConversionReceiptQueue,
} from '../src/core/developerLeads/developerLeadAgencyConversionReceiptQueue.js'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const queueSource = readFileSync(resolve(appRoot, 'src/core/developerLeads/developerLeadAgencyConversionReceiptQueue.js'), 'utf8')
const agentListingsSource = readFileSync(resolve(appRoot, 'src/pages/AgentListings.jsx'), 'utf8')
const serviceSource = readFileSync(resolve(appRoot, 'src/services/developerLeadService.js'), 'utf8')
const docsSource = readFileSync(resolve(appRoot, 'docs/developer-leads-phase24-agency-conversion-receipts.md'), 'utf8')
const phase5Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase5-release-readiness.test.mjs'), 'utf8')
const phase6Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase6-post-rollout-monitoring.mjs'), 'utf8')

const scripts = packageJson.scripts || {}

assert.equal(
  scripts['test:developer-module-phase24'],
  'node scripts/developer-leads-phase24-agency-conversion-receipts.test.mjs',
)
assert.match(scripts['verify:developer-module'] || '', /test:developer-module-phase24/)
assert.equal(DEVELOPER_LEAD_PHASE24_CONTRACT, 'developer-leads-phase24-agency-conversion-receipts-v1')

const sampleLeads = [
  {
    developerLeadId: 'lead-converted',
    developerOrgId: 'developer-1',
    sourceAgencyOrgId: 'agency-1',
    sourceAgentUserId: 'agent-1',
    primaryDevelopmentId: 'development-1',
    preferredUnitId: 'unit-1',
    leadOwner: 'agency',
    ownershipModel: 'agency_introduced',
    visibilityState: 'handed_over',
    leadStatus: 'converted',
    convertedTransactionId: '00000000-0000-4000-8000-00000000abcd',
    convertedAt: '2026-08-16T06:00:00.000Z',
    buyerFullName: 'Converted Buyer',
    buyerEmail: 'converted@example.test',
    protectedSummary: '2-bed buyer, R2m budget',
  },
  {
    developerLeadId: 'lead-released',
    developerOrgId: 'developer-1',
    sourceAgencyOrgId: 'agency-1',
    leadOwner: 'agency',
    visibilityState: 'handed_over',
    leadStatus: 'qualified',
    buyerFullName: 'Released Buyer',
    buyerEmail: 'released@example.test',
  },
  {
    developerLeadId: 'lead-protected',
    developerOrgId: 'developer-1',
    sourceAgencyOrgId: 'agency-1',
    leadOwner: 'agency',
    visibilityState: 'limited',
    leadStatus: 'new',
    protectedSummary: 'Protected buyer',
  },
  {
    developerLeadId: 'lead-developer-owned',
    developerOrgId: 'developer-1',
    leadOwner: 'developer',
    visibilityState: 'full',
    leadStatus: 'converted',
    convertedTransactionId: 'developer-owned-transaction',
  },
]

const queue = buildAgencyDeveloperLeadConversionReceiptQueue(sampleLeads)
assert.equal(queue.contract, DEVELOPER_LEAD_PHASE24_CONTRACT)
assert.equal(queue.totalAgencyFed, 3)
assert.equal(queue.convertedCount, 1)
assert.equal(queue.releasedAwaitingConversionCount, 1)
assert.equal(queue.protectedOrPendingCount, 1)
assert.equal(queue.cards.length, 1)
assert.equal(queue.cards[0].developerLeadId, 'lead-converted')
assert.equal(queue.cards[0].receiptStatus, 'transaction_created')
assert.equal(queue.cards[0].transactionReceipt, 'Transaction ...0000abcd')
assert.equal(queue.cards[0].agencyCanOpenTransaction, false)
assert.equal(queue.cards[0].onboardingLinkVisible, false)
assert.equal(queue.cards.some((card) => card.developerLeadId === 'lead-developer-owned'), false)

const summary = summarizeAgencyDeveloperLeadConversionReceiptQueue(sampleLeads)
assert.equal(summary.contract, DEVELOPER_LEAD_PHASE24_CONTRACT)
assert.equal(summary.status, 'attention')
assert.match(summary.detail, /without transaction workspace access/)

for (const token of [
  'DEVELOPER_LEAD_PHASE24_CONTRACT',
  'developer-leads-phase24-agency-conversion-receipts-v1',
  'buildAgencyDeveloperLeadConversionReceiptQueue',
  'summarizeAgencyDeveloperLeadConversionReceiptQueue',
  'agencyCanOpenTransaction: false',
  'onboardingLinkVisible: false',
]) {
  assert.match(queueSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

for (const token of [
  'AgencyDeveloperLeadConversionReceiptPanel',
  'buildAgencyDeveloperLeadConversionReceiptQueue(agencyDeveloperLeads)',
  'summarizeAgencyDeveloperLeadConversionReceiptQueue(agencyDeveloperLeads)',
  'Developer Conversion Receipts',
  'Converted agency buyer leads',
  'Receipt only',
  'data-contract={DEVELOPER_LEAD_PHASE24_CONTRACT}',
]) {
  assert.doesNotMatch(agentListingsSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

for (const token of [
  'converted_transaction_id',
  'converted_at',
  'listAgencyIntroducedDeveloperLeadsForAgency',
  'maskForDeveloper: false',
]) {
  assert.match(serviceSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

assert.doesNotMatch(queueSource, /createTransactionFromWizard|recordBuyerOnboardingSent|invokeEdgeFunction|send-email|service_role/i)
assert.doesNotMatch(agentListingsSource, /convertDeveloperLeadToTransactionAndSendOnboarding|recordBuyerOnboardingSent|client_onboarding/i)
assert.doesNotMatch(serviceSource, /service_role|sb_secret_|security\s+definer/i)

assert.match(docsSource, /Developer Leads Phase 24 Agency Conversion Receipts/)
assert.match(docsSource, /source agency a safe conversion receipt/)
assert.match(docsSource, /does not create transactions/)
assert.match(docsSource, /expose onboarding/)
assert.match(docsSource, /bypass RLS/)
assert.doesNotMatch(docsSource, /service_role|sb_secret_|access_token/i)

assert.match(phase5Source, /test:developer-module-phase24/)
assert.match(phase6Source, /test:developer-module-phase24/)

console.log(JSON.stringify({
  version: 'developer_leads_phase24_agency_conversion_receipts_v1',
  ready: true,
  coveredSurfaces: [
    'agency conversion receipt queue',
    'agent portal development service boundary',
    'receipt-only transaction visibility boundary',
    'developer-module verification chain',
  ],
}, null, 2))
