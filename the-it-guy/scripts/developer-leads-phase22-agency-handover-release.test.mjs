import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEVELOPER_LEAD_PHASE22_CONTRACT,
  buildAgencyDeveloperLeadHandoverReleaseQueue,
  summarizeAgencyDeveloperLeadHandoverReleaseQueue,
} from '../src/core/developerLeads/developerLeadAgencyHandoverReleaseQueue.js'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const queueSource = readFileSync(resolve(appRoot, 'src/core/developerLeads/developerLeadAgencyHandoverReleaseQueue.js'), 'utf8')
const agentListingsSource = readFileSync(resolve(appRoot, 'src/pages/AgentListings.jsx'), 'utf8')
const serviceSource = readFileSync(resolve(appRoot, 'src/services/developerLeadService.js'), 'utf8')
const docsSource = readFileSync(resolve(appRoot, 'docs/developer-leads-phase22-agency-handover-release.md'), 'utf8')
const phase5Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase5-release-readiness.test.mjs'), 'utf8')
const phase6Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase6-post-rollout-monitoring.mjs'), 'utf8')

const scripts = packageJson.scripts || {}

assert.equal(
  scripts['test:developer-module-phase22'],
  'node scripts/developer-leads-phase22-agency-handover-release.test.mjs',
)
assert.match(scripts['verify:developer-module'] || '', /test:developer-module-phase22/)
assert.equal(DEVELOPER_LEAD_PHASE22_CONTRACT, 'developer-leads-phase22-agency-handover-release-v1')

const sampleLeads = [
  {
    developerLeadId: 'lead-ready',
    developerOrgId: 'developer-1',
    sourceAgencyOrgId: 'agency-1',
    primaryDevelopmentId: 'development-1',
    preferredUnitId: 'unit-1',
    leadOwner: 'agency',
    ownershipModel: 'agency_introduced',
    visibilityState: 'consent_pending',
    leadStatus: 'new',
    buyerFullName: 'Agency Buyer',
    buyerEmail: 'buyer@example.test',
    protectedSummary: '2-bed buyer, R2m-R2.3m budget',
  },
  {
    developerLeadId: 'lead-blocked',
    developerOrgId: 'developer-1',
    sourceAgencyOrgId: 'agency-1',
    leadOwner: 'agency',
    ownershipModel: 'agency_introduced',
    visibilityState: 'consent_pending',
    buyerFullName: '',
    buyerEmail: '',
    buyerPhone: '',
  },
  {
    developerLeadId: 'lead-protected',
    developerOrgId: 'developer-1',
    sourceAgencyOrgId: 'agency-1',
    leadOwner: 'agency',
    visibilityState: 'limited',
    buyerFullName: 'Waiting Buyer',
    buyerEmail: 'waiting@example.test',
  },
  {
    developerLeadId: 'lead-released',
    developerOrgId: 'developer-1',
    sourceAgencyOrgId: 'agency-1',
    leadOwner: 'agency',
    visibilityState: 'handed_over',
    buyerFullName: 'Released Buyer',
    buyerEmail: 'released@example.test',
  },
]

const queue = buildAgencyDeveloperLeadHandoverReleaseQueue(sampleLeads)
assert.equal(queue.contract, DEVELOPER_LEAD_PHASE22_CONTRACT)
assert.equal(queue.totalAgencyFed, 4)
assert.equal(queue.requestedCount, 2)
assert.equal(queue.readyToReleaseCount, 1)
assert.equal(queue.blockedReleaseCount, 1)
assert.equal(queue.protectedCount, 1)
assert.equal(queue.releasedCount, 1)
assert.equal(queue.cards[0].canRelease, true)
assert.equal(queue.cards[0].releaseAction, 'release_buyer_details')
assert.equal(queue.cards[0].buyerFullName, 'Agency Buyer')
assert.equal(queue.cards[1].canRelease, false)
assert.match(queue.cards[1].releaseBlockers.join(' '), /Buyer full name is missing/)

const summary = summarizeAgencyDeveloperLeadHandoverReleaseQueue(sampleLeads)
assert.equal(summary.contract, DEVELOPER_LEAD_PHASE22_CONTRACT)
assert.equal(summary.status, 'blocked')
assert.match(summary.detail, /developer handover request/)

for (const token of [
  'DEVELOPER_LEAD_PHASE22_CONTRACT',
  'developer-leads-phase22-agency-handover-release-v1',
  'buildAgencyDeveloperLeadHandoverReleaseQueue',
  'summarizeAgencyDeveloperLeadHandoverReleaseQueue',
  "releaseAction: blockers.length === 0 ? 'release_buyer_details' : 'complete_private_details'",
]) {
  assert.match(queueSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

for (const token of [
  'DEVELOPER_LEAD_PHASE22_CONTRACT',
  'AgencyDeveloperLeadHandoverPanel',
  'listAgencyIntroducedDeveloperLeadsForAgency',
  'releaseAgencyDeveloperLeadHandover',
  'buildAgencyDeveloperLeadHandoverReleaseQueue(agencyDeveloperLeads)',
  'summarizeAgencyDeveloperLeadHandoverReleaseQueue(agencyDeveloperLeads)',
  'handleReleaseAgencyDeveloperLeadHandover',
  'Developer Handover Requests',
  'Release Buyer Details',
  'data-contract={DEVELOPER_LEAD_PHASE22_CONTRACT}',
]) {
  assert.match(agentListingsSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

for (const token of [
  'DEVELOPER_LEAD_PHASE22_CONTRACT',
  'listAgencyIntroducedDeveloperLeadsForAgency',
  'releaseAgencyDeveloperLeadHandover',
  "visibility_state: 'handed_over'",
  'handover_accepted_at',
  "activity_type: 'handover_completed'",
  "nextVisibilityState: 'handed_over'",
  "source_agency_org_id', agencyOrgId",
  "visibility_state', 'consent_pending'",
  'maskForDeveloper: false',
]) {
  assert.match(serviceSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

assert.doesNotMatch(queueSource, /createTransactionFromWizard|recordBuyerOnboardingSent|invokeEdgeFunction|send-email/)
assert.doesNotMatch(agentListingsSource, /convertDeveloperLeadToTransactionAndSendOnboarding/)
assert.doesNotMatch(serviceSource, /service_role|sb_secret_|security\s+definer/i)

assert.match(docsSource, /Developer Leads Phase 22 Agency Handover Release/)
assert.match(docsSource, /visibility_state = handed_over/)
assert.match(docsSource, /handover_completed/)
assert.match(docsSource, /does not create transactions/)
assert.match(docsSource, /bypass RLS/)
assert.doesNotMatch(docsSource, /service_role|sb_secret_|access_token/i)

assert.match(phase5Source, /test:developer-module-phase22/)
assert.match(phase6Source, /test:developer-module-phase22/)

console.log(JSON.stringify({
  version: 'developer_leads_phase22_agency_handover_release_v1',
  ready: true,
  coveredSurfaces: [
    'agency handover release queue',
    'agency-owned private buyer detail visibility',
    'handover release service action',
    'shared handover_completed activity',
    'developer-module verification chain',
  ],
}, null, 2))
