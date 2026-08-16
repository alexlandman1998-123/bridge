import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEVELOPER_LEAD_PHASE16_CONTRACT,
  buildDeveloperLeadLaunchReadiness,
} from '../src/core/developerLeads/developerLeadLaunchReadiness.js'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const readinessSource = readFileSync(resolve(appRoot, 'src/core/developerLeads/developerLeadLaunchReadiness.js'), 'utf8')
const pageSource = readFileSync(resolve(appRoot, 'src/pages/DeveloperLeadsPage.jsx'), 'utf8')
const serviceSource = readFileSync(resolve(appRoot, 'src/services/developerLeadService.js'), 'utf8')
const docsSource = readFileSync(resolve(appRoot, 'docs/developer-leads-phase16-launch-readiness.md'), 'utf8')
const phase5Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase5-release-readiness.test.mjs'), 'utf8')
const phase6Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase6-post-rollout-monitoring.mjs'), 'utf8')

const scripts = packageJson.scripts || {}

assert.equal(
  scripts['test:developer-module-phase16'],
  'node scripts/developer-leads-phase16-launch-readiness.test.mjs',
)
assert.match(scripts['verify:developer-module'] || '', /test:developer-module-phase16/)

const protectedAgencyLead = {
  developerLeadId: 'agency-1',
  leadOwner: 'agency',
  visibilityState: 'limited',
  protectedSummary: '2 bed buyer, R2m-R2.3m budget',
  buyerFullName: null,
  buyerEmail: null,
  buyerPhone: null,
  privateNotes: null,
  accessProfile: {
    agencyFed: true,
    requiresHandoverBeforePrivateDetails: true,
  },
}

const developerLead = {
  developerLeadId: 'developer-1',
  leadOwner: 'developer',
  visibilityState: 'full',
  buyerFullName: 'Visible Buyer',
  leadStatus: 'qualified',
  accessProfile: {
    agencyFed: false,
    requiresHandoverBeforePrivateDetails: false,
  },
}

const readiness = buildDeveloperLeadLaunchReadiness({
  leads: [developerLead, protectedAgencyLead],
  schemaAvailable: true,
  conversionBridgeEnabled: false,
  buyerOnboardingSendEnabled: false,
})

assert.equal(readiness.contract, DEVELOPER_LEAD_PHASE16_CONTRACT)
assert.equal(readiness.status, 'pending')
assert.equal(readiness.summary.total, 2)
assert.equal(readiness.summary.developerFed, 1)
assert.equal(readiness.summary.agencyFed, 1)
assert.equal(readiness.summary.protectedAgency, 1)
assert.equal(readiness.summary.pending, 2)
assert.equal(readiness.checks.find((check) => check.key === 'agency_privacy_boundary')?.status, 'ready')
assert.equal(readiness.checks.find((check) => check.key === 'lead_to_transaction_bridge')?.status, 'pending')
assert.equal(readiness.checks.find((check) => check.key === 'buyer_onboarding_send')?.status, 'pending')

const handoverReadiness = buildDeveloperLeadLaunchReadiness({
  leads: [{ ...protectedAgencyLead, visibilityState: 'consent_pending' }],
})
assert.equal(handoverReadiness.status, 'pending')
assert.equal(handoverReadiness.summary.handoverPending, 1)
assert.equal(handoverReadiness.checks.find((check) => check.key === 'agency_handover_queue')?.status, 'attention')

const blockedReadiness = buildDeveloperLeadLaunchReadiness({
  leads: [{ ...protectedAgencyLead, buyerEmail: 'leaked@example.test' }],
})
assert.equal(blockedReadiness.status, 'blocked')
assert.equal(blockedReadiness.summary.blocked, 1)
assert.equal(blockedReadiness.checks.find((check) => check.key === 'agency_privacy_boundary')?.status, 'blocked')

const readyReadiness = buildDeveloperLeadLaunchReadiness({
  leads: [{ ...developerLead, leadStatus: 'converted', convertedTransactionId: 'transaction-1' }],
  conversionBridgeEnabled: true,
  buyerOnboardingSendEnabled: true,
})
assert.equal(readyReadiness.status, 'ready')
assert.equal(readyReadiness.summary.converted, 1)

for (const token of [
  'DEVELOPER_LEAD_PHASE16_CONTRACT',
  'buildDeveloperLeadLaunchReadiness',
  'Lead-to-transaction bridge',
  'Buyer onboarding send',
]) {
  assert.match(readinessSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

for (const token of [
  'DEVELOPER_LEAD_PHASE16_CONTRACT',
  'buildDeveloperLeadLaunchReadiness',
  'DeveloperLeadReadinessPanel',
  'Launch Readiness',
  'conversionBridgeEnabled: true',
  'buyerOnboardingSendEnabled: true',
]) {
  assert.match(pageSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

assert.equal(/recordBuyerOnboardingSent|createTransactionFromWizard|send.*onboarding/i.test(serviceSource), false, 'Phase 16 readiness must not send onboarding or convert transactions')
assert.match(docsSource, /Developer Leads Phase 16 Launch Readiness/)
assert.match(docsSource, /Developer lead transaction-handoff readiness is available from Phase 17/)
assert.match(docsSource, /Buyer onboarding send from developer leads is available from Phase 18/)
assert.match(phase5Source, /test:developer-module-phase16/)
assert.match(phase6Source, /test:developer-module-phase16/)

console.log(JSON.stringify({
  version: 'developer_leads_phase16_launch_readiness_v1',
  ready: true,
  coveredSurfaces: [
    'launch readiness contract',
    'agency privacy leak detection',
    'handover queue attention state',
    'lead conversion pending boundary',
    'buyer onboarding pending boundary',
  ],
}, null, 2))
