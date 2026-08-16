import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEVELOPER_LEAD_PHASE21_CONTRACT,
  buildProtectedDeveloperLeadQueue,
  summarizeProtectedDeveloperLeadQueue,
} from '../src/core/developerLeads/developerLeadProtectedIntakeQueue.js'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const queueSource = readFileSync(resolve(appRoot, 'src/core/developerLeads/developerLeadProtectedIntakeQueue.js'), 'utf8')
const developerLeadsPageSource = readFileSync(resolve(appRoot, 'src/pages/DeveloperLeadsPage.jsx'), 'utf8')
const developerLeadServiceSource = readFileSync(resolve(appRoot, 'src/services/developerLeadService.js'), 'utf8')
const docsSource = readFileSync(resolve(appRoot, 'docs/developer-leads-phase21-protected-intake-queue.md'), 'utf8')
const phase5Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase5-release-readiness.test.mjs'), 'utf8')
const phase6Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase6-post-rollout-monitoring.mjs'), 'utf8')

const scripts = packageJson.scripts || {}

assert.equal(
  scripts['test:developer-module-phase21'],
  'node scripts/developer-leads-phase21-protected-intake-queue.test.mjs',
)
assert.match(scripts['verify:developer-module'] || '', /test:developer-module-phase21/)
assert.equal(DEVELOPER_LEAD_PHASE21_CONTRACT, 'developer-leads-phase21-protected-intake-queue-v1')

const sampleLeads = [
  {
    developerLeadId: 'lead-protected',
    sourceAgencyOrgId: 'agency-1',
    sourceAgentUserId: 'agent-1',
    assignedAgentId: 'agent-1',
    primaryDevelopmentId: 'development-1',
    preferredUnitId: 'unit-1',
    leadOwner: 'agency',
    ownershipModel: 'agency_introduced',
    sellingModel: 'agent_led',
    visibilityState: 'limited',
    leadStatus: 'new',
    reservationState: 'none',
    protectedSummary: '2-bed buyer looking at north-facing stock',
    unitTypeInterest: '2-bed',
    budgetMin: 2000000,
    budgetMax: 2300000,
    buyerFullName: 'Private Buyer',
    buyerEmail: 'private@example.test',
    buyerPhone: '0820000000',
    privateNotes: 'Do not reveal',
    accessProfile: {
      agencyFed: true,
      requiresHandoverBeforePrivateDetails: true,
    },
  },
  {
    developerLeadId: 'lead-requested',
    sourceAgencyOrgId: 'agency-1',
    primaryDevelopmentId: 'development-1',
    leadOwner: 'agency',
    visibilityState: 'consent_pending',
    leadStatus: 'new',
    protectedSummary: '3-bed buyer with cash deposit',
    accessProfile: {
      agencyFed: true,
      requiresHandoverBeforePrivateDetails: true,
    },
  },
  {
    developerLeadId: 'lead-released',
    leadOwner: 'agency',
    visibilityState: 'handed_over',
    buyerFullName: 'Released Buyer',
    accessProfile: {
      agencyFed: true,
      requiresHandoverBeforePrivateDetails: false,
    },
  },
]

const protectedQueue = buildProtectedDeveloperLeadQueue(sampleLeads)

assert.equal(protectedQueue.contract, DEVELOPER_LEAD_PHASE21_CONTRACT)
assert.equal(protectedQueue.totalAgencyFed, 3)
assert.equal(protectedQueue.protectedCount, 2)
assert.equal(protectedQueue.handoverReadyCount, 1)
assert.equal(protectedQueue.handoverRequestedCount, 1)
assert.equal(protectedQueue.releasedCount, 1)
assert.equal(protectedQueue.privacyLeaks, 0)
assert.equal(protectedQueue.ready, true)
assert.equal(protectedQueue.cards[0].buyerFullName, undefined)
assert.equal(protectedQueue.cards[0].buyerEmail, undefined)
assert.equal(protectedQueue.cards[0].buyerPhone, undefined)
assert.equal(protectedQueue.cards[0].privateNotes, undefined)
assert.equal(protectedQueue.cards[0].canConvert, false)
assert.equal(protectedQueue.cards[0].handoverAction, 'request_handover')
assert.equal(protectedQueue.cards[1].handoverAction, 'await_agency_release')
assert.equal(protectedQueue.cards[1].canRequestHandover, false)

const summary = summarizeProtectedDeveloperLeadQueue(sampleLeads)
assert.equal(summary.contract, DEVELOPER_LEAD_PHASE21_CONTRACT)
assert.equal(summary.status, 'attention')
assert.match(summary.label, /protected agency lead/)

for (const token of [
  'DEVELOPER_LEAD_PHASE21_CONTRACT',
  'developer-leads-phase21-protected-intake-queue-v1',
  'buildProtectedDeveloperLeadQueue',
  'summarizeProtectedDeveloperLeadQueue',
  'HIDDEN_BUYER_FIELDS',
  'canConvert: false',
  "handoverAction: requested ? 'await_agency_release' : 'request_handover'",
]) {
  assert.match(queueSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

for (const token of [
  'DEVELOPER_LEAD_PHASE21_CONTRACT',
  'ProtectedDeveloperLeadQueuePanel',
  'buildProtectedDeveloperLeadQueue(leads)',
  'summarizeProtectedDeveloperLeadQueue(leads)',
  'Protected Intake Queue',
  'Agency-submitted buyer leads',
  'Buyer identity and contact details are hidden.',
  'Request Handover',
  'Awaiting Agency',
  'data-contract={DEVELOPER_LEAD_PHASE21_CONTRACT}',
]) {
  assert.match(developerLeadsPageSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

assert.match(developerLeadsPageSource, /requestAgencyLeadHandover/)
assert.match(developerLeadsPageSource, /handoverSubmittingId === card\.developerLeadId/)
assert.doesNotMatch(queueSource, /createTransactionFromWizard|recordBuyerOnboardingSent|invokeEdgeFunction|send-email/)
assert.doesNotMatch(queueSource, /service_role|sb_secret_|security\s+definer/i)

assert.match(developerLeadServiceSource, /requestAgencyLeadHandover/)
assert.match(developerLeadServiceSource, /visibility_state: 'consent_pending'/)
assert.match(developerLeadServiceSource, /lead_owner', 'agency'/)

assert.match(docsSource, /Developer Leads Phase 21 Protected Intake Queue/)
assert.match(docsSource, /Protected Intake Queue/)
assert.match(docsSource, /does not expose buyer name, email, phone/)
assert.match(docsSource, /does not convert leads/)
assert.match(docsSource, /No Phase 21 code adds privileged database functions/)
assert.doesNotMatch(docsSource, /service_role|sb_secret_|access_token/i)

assert.match(phase5Source, /test:developer-module-phase21/)
assert.match(phase6Source, /test:developer-module-phase21/)

console.log(JSON.stringify({
  version: 'developer_leads_phase21_protected_intake_queue_v1',
  ready: true,
  coveredSurfaces: [
    'developer protected agency lead queue',
    'handover request action visibility',
    'buyer private-detail redaction',
    'conversion locked until handover',
    'developer-module verification chain',
  ],
}, null, 2))
