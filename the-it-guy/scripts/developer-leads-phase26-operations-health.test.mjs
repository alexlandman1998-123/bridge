import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEVELOPER_LEAD_PHASE26_CONTRACT,
  buildDeveloperLeadOperationsHealth,
  summarizeDeveloperLeadOperationsHealth,
} from '../src/core/developerLeads/developerLeadOperationsHealth.js'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const healthSource = readFileSync(resolve(appRoot, 'src/core/developerLeads/developerLeadOperationsHealth.js'), 'utf8')
const developerLeadsPageSource = readFileSync(resolve(appRoot, 'src/pages/DeveloperLeadsPage.jsx'), 'utf8')
const docsSource = readFileSync(resolve(appRoot, 'docs/developer-leads-phase26-operations-health.md'), 'utf8')
const phase5Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase5-release-readiness.test.mjs'), 'utf8')
const phase6Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase6-post-rollout-monitoring.mjs'), 'utf8')

const scripts = packageJson.scripts || {}

assert.equal(
  scripts['test:developer-module-phase26'],
  'node scripts/developer-leads-phase26-operations-health.test.mjs',
)
assert.match(scripts['verify:developer-module'] || '', /test:developer-module-phase26/)
assert.equal(DEVELOPER_LEAD_PHASE26_CONTRACT, 'developer-leads-phase26-operations-health-v1')

const checkedAt = '2026-08-16T12:00:00.000Z'
const sampleLeads = [
  {
    developerLeadId: 'developer-unassigned-stale',
    buyerFullName: 'Developer Buyer',
    buyerEmail: 'developer@example.com',
    leadOwner: 'developer',
    leadStatus: 'qualified',
    visibilityState: 'full',
    primaryDevelopmentId: 'development-1',
    preferredUnitId: 'unit-1',
    updatedAt: '2026-08-13T12:00:00.000Z',
  },
  {
    developerLeadId: 'developer-missing-development',
    buyerFullName: 'Missing Development Buyer',
    buyerEmail: 'missing@example.com',
    leadOwner: 'developer',
    leadStatus: 'qualified',
    visibilityState: 'full',
    assignedAgentId: 'agent-1',
    preferredUnitId: 'unit-2',
    updatedAt: '2026-08-16T08:00:00.000Z',
  },
  {
    developerLeadId: 'agency-protected',
    leadOwner: 'agency',
    ownershipModel: 'agency_introduced',
    accessProfile: {
      agencyFed: true,
      requiresHandoverBeforePrivateDetails: true,
    },
    protectedSummary: 'Protected buyer in the north block',
    leadStatus: 'qualified',
    visibilityState: 'limited',
    primaryDevelopmentId: 'development-2',
    preferredUnitId: 'unit-3',
    updatedAt: '2026-08-15T09:00:00.000Z',
  },
  {
    developerLeadId: 'agency-handover-pending',
    leadOwner: 'agency',
    ownershipModel: 'agency_introduced',
    accessProfile: {
      agencyFed: true,
    },
    protectedSummary: 'Pending agency handover',
    leadStatus: 'qualified',
    visibilityState: 'consent_pending',
    primaryDevelopmentId: 'development-2',
    preferredUnitId: 'unit-4',
    handoverRequestedAt: '2026-08-14T12:00:00.000Z',
    updatedAt: '2026-08-14T12:00:00.000Z',
  },
  {
    developerLeadId: 'agency-released-blocked',
    buyerFullName: 'Released Buyer',
    buyerEmail: 'released@example.com',
    leadOwner: 'agency',
    ownershipModel: 'agency_introduced',
    accessProfile: {
      agencyFed: true,
    },
    leadStatus: 'qualified',
    visibilityState: 'handed_over',
    primaryDevelopmentId: 'development-3',
    handoverAcceptedAt: '2026-08-15T12:00:00.000Z',
    updatedAt: '2026-08-15T12:00:00.000Z',
  },
  {
    developerLeadId: 'developer-contact-blocked',
    buyerFullName: 'Contact Blocked Buyer',
    leadOwner: 'developer',
    leadStatus: 'qualified',
    visibilityState: 'full',
    assignedAgentId: 'agent-1',
    primaryDevelopmentId: 'development-1',
    preferredUnitId: 'unit-6',
    updatedAt: '2026-08-16T09:00:00.000Z',
  },
  {
    developerLeadId: 'converted-ignore',
    buyerFullName: 'Converted Buyer',
    buyerEmail: 'converted@example.com',
    leadOwner: 'developer',
    leadStatus: 'converted',
    convertedTransactionId: 'transaction-1',
    primaryDevelopmentId: 'development-1',
    preferredUnitId: 'unit-5',
  },
]

const health = buildDeveloperLeadOperationsHealth(sampleLeads, { checkedAt })
assert.equal(health.contract, DEVELOPER_LEAD_PHASE26_CONTRACT)
assert.equal(health.totalLeads, 7)
assert.equal(health.activeLeads, 6)
assert.equal(health.agencyIntroducedCount, 3)
assert.equal(health.developerOwnedCount, 3)
assert.equal(health.unassignedCount, 1)
assert.equal(health.unallocatedDevelopmentCount, 1)
assert.equal(health.staleCount, 1)
assert.equal(health.protectedAwaitingRequestCount, 1)
assert.equal(health.handoverPendingCount, 1)
assert.equal(health.releasedAwaitingConversionCount, 1)
assert.equal(health.conversionBlockedCount, 3)
assert.equal(health.blockerCount, 3)
assert.equal(health.attentionCount, 3)
assert.equal(health.watchCount, 1)
assert.equal(health.status, 'blocked')

const alertTypes = health.alerts.map((alert) => alert.type)
for (const expectedType of [
  'unassigned_developer_lead',
  'development_unallocated',
  'stale_follow_up',
  'protected_handover_not_requested',
  'handover_sla_due',
  'released_conversion_due',
  'conversion_blocked',
]) {
  assert.ok(alertTypes.includes(expectedType), `Expected ${expectedType} alert`)
}

const releasedAlert = health.alerts.find((alert) => alert.type === 'released_conversion_due')
assert.equal(releasedAlert.severity, 'blocker')
assert.ok(releasedAlert.handoffBlockers.includes('unit_missing'))

const summary = summarizeDeveloperLeadOperationsHealth(sampleLeads, { checkedAt })
assert.equal(summary.contract, DEVELOPER_LEAD_PHASE26_CONTRACT)
assert.equal(summary.status, 'blocked')
assert.match(summary.label, /3 blockers/)
assert.match(summary.detail, /6 active leads/)

for (const token of [
  'DEVELOPER_LEAD_PHASE26_CONTRACT',
  'developer-leads-phase26-operations-health-v1',
  'buildDeveloperLeadOperationsHealth',
  'summarizeDeveloperLeadOperationsHealth',
  'stale_follow_up',
  'protected_handover_not_requested',
  'released_conversion_due',
  'conversion_blocked',
]) {
  assert.match(healthSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

for (const token of [
  'DEVELOPER_LEAD_PHASE26_CONTRACT',
  'DeveloperLeadOperationsHealthPanel',
  'buildDeveloperLeadOperationsHealth(leads)',
  'summarizeDeveloperLeadOperationsHealth(leads)',
  'Operations Health',
  'Lead follow-up exceptions',
  'data-contract={DEVELOPER_LEAD_PHASE26_CONTRACT}',
]) {
  assert.match(developerLeadsPageSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

assert.doesNotMatch(healthSource, /createTransactionFromWizard|recordBuyerOnboardingSent|invokeEdgeFunction|send-email|service_role/i)
assert.doesNotMatch(developerLeadsPageSource, /service_role|sb_secret_|security\s+definer/i)

assert.match(docsSource, /Developer Leads Phase 26 Operations Health/)
assert.match(docsSource, /operational exception list/)
assert.match(docsSource, /read-only model/)
assert.match(docsSource, /does not create transactions/)
assert.match(docsSource, /bypass RLS/)
assert.doesNotMatch(docsSource, /service_role|sb_secret_|access_token/i)

assert.match(phase5Source, /test:developer-module-phase26/)
assert.match(phase6Source, /test:developer-module-phase26/)

console.log(JSON.stringify({
  version: 'developer_leads_phase26_operations_health_v1',
  ready: true,
  coveredSurfaces: [
    'developer lead operations health',
    'handover and conversion exception list',
    'stale follow-up visibility',
    'developer-module verification chain',
  ],
}, null, 2))
