import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEVELOPER_LEAD_PHASE17_CONTRACT,
  buildDeveloperLeadTransactionHandoff,
  summarizeDeveloperLeadTransactionHandoffs,
} from '../src/core/developerLeads/developerLeadTransactionHandoff.js'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const handoffSource = readFileSync(resolve(appRoot, 'src/core/developerLeads/developerLeadTransactionHandoff.js'), 'utf8')
const pageSource = readFileSync(resolve(appRoot, 'src/pages/DeveloperLeadsPage.jsx'), 'utf8')
const serviceSource = readFileSync(resolve(appRoot, 'src/services/developerLeadService.js'), 'utf8')
const phase5Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase5-release-readiness.test.mjs'), 'utf8')
const phase6Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase6-post-rollout-monitoring.mjs'), 'utf8')
const docsSource = readFileSync(resolve(appRoot, 'docs/developer-leads-phase17-transaction-handoff.md'), 'utf8')

const scripts = packageJson.scripts || {}

assert.equal(
  scripts['test:developer-module-phase17'],
  'node scripts/developer-leads-phase17-transaction-handoff.test.mjs',
)
assert.match(scripts['verify:developer-module'] || '', /test:developer-module-phase17/)

const readyLead = {
  developerLeadId: 'lead-1',
  developerOrgId: 'org-1',
  leadOwner: 'developer',
  leadStatus: 'qualified',
  visibilityState: 'full',
  reservationState: 'none',
  primaryDevelopmentId: 'development-1',
  preferredUnitId: 'unit-1',
  buyerFullName: 'Alex Buyer',
  buyerEmail: 'alex@example.test',
  buyerPhone: '',
  publicReference: 'DL-001',
  accessProfile: {
    agencyFed: false,
    requiresHandoverBeforePrivateDetails: false,
  },
}

const ready = buildDeveloperLeadTransactionHandoff(readyLead)
assert.equal(ready.contract, DEVELOPER_LEAD_PHASE17_CONTRACT)
assert.equal(ready.eligible, true)
assert.equal(ready.status, 'ready')
assert.equal(ready.handoff.status.stage, 'Reserved')
assert.equal(ready.handoff.status.mainStage, 'DEP')
assert.equal(ready.handoff.setup.transactionType, 'developer_sale')
assert.equal(ready.handoff.setup.developmentId, 'development-1')
assert.equal(ready.handoff.setup.unitId, 'unit-1')
assert.equal(ready.handoff.setup.buyerName, 'Alex Buyer')
assert.equal(ready.handoff.options.sourceContext.origin, 'developer_lead')
assert.equal(ready.handoff.options.sourceContext.developerLeadId, 'lead-1')

const missingEmail = buildDeveloperLeadTransactionHandoff({
  ...readyLead,
  buyerEmail: '',
  buyerPhone: '0820000000',
})
assert.equal(missingEmail.eligible, true)
assert.equal(missingEmail.status, 'attention')
assert.equal(missingEmail.warnings[0]?.code, 'buyer_email_missing')

const reservedLead = buildDeveloperLeadTransactionHandoff({
  ...readyLead,
  leadStatus: 'reserved',
  reservationState: 'reserved',
})
assert.equal(reservedLead.eligible, true)
assert.equal(reservedLead.handoff.status.stage, 'Deposit Paid')
assert.equal(reservedLead.handoff.status.mainStage, 'DEP')

const allowedTransactionStages = [
  'Available',
  'Reserved',
  'OTP Signed',
  'Deposit Paid',
  'Finance Pending',
  'Bond Approved / Proof of Funds',
  'Proceed to Attorneys',
  'Transfer in Progress',
  'Transfer Lodged',
  'Registered',
]
assert.ok(
  allowedTransactionStages.includes(ready.handoff.status.stage),
  'developer lead handoff must use a transactions_stage_check-compatible stage',
)
assert.notEqual(
  ready.handoff.status.stage,
  'Onboarding',
  'buyer onboarding is a lead status, not a valid transactions.stage value',
)

const blockedAgency = buildDeveloperLeadTransactionHandoff({
  ...readyLead,
  leadOwner: 'agency',
  visibilityState: 'limited',
  buyerFullName: null,
  buyerEmail: null,
  buyerPhone: null,
  accessProfile: {
    agencyFed: true,
    requiresHandoverBeforePrivateDetails: true,
  },
})
assert.equal(blockedAgency.eligible, false)
assert.ok(blockedAgency.blockers.some((blocker) => blocker.code === 'agency_handover_required'))
assert.ok(blockedAgency.blockers.some((blocker) => blocker.code === 'buyer_name_missing'))

const blockedNewLead = buildDeveloperLeadTransactionHandoff({
  ...readyLead,
  leadStatus: 'new',
  preferredUnitId: '',
})
assert.equal(blockedNewLead.status, 'blocked')
assert.ok(blockedNewLead.blockers.some((blocker) => blocker.code === 'lead_not_qualified'))
assert.ok(blockedNewLead.blockers.some((blocker) => blocker.code === 'unit_missing'))

const earlyCopyLead = buildDeveloperLeadTransactionHandoff({
  ...readyLead,
  leadStatus: 'new',
}, {
  allowEarlyLeadStatus: true,
})
assert.equal(earlyCopyLead.eligible, true)
assert.equal(earlyCopyLead.handoff.status.stage, 'Reserved')
assert.equal(earlyCopyLead.handoff.status.mainStage, 'DEP')

const summary = summarizeDeveloperLeadTransactionHandoffs([readyLead, blockedAgency, blockedNewLead])
assert.equal(summary.contract, DEVELOPER_LEAD_PHASE17_CONTRACT)
assert.equal(summary.total, 3)
assert.equal(summary.ready, 1)
assert.equal(summary.blocked, 2)

for (const token of [
  'DEVELOPER_LEAD_PHASE17_CONTRACT',
  'buildDeveloperLeadTransactionHandoff',
  'summarizeDeveloperLeadTransactionHandoffs',
  'agency_handover_required',
  'preferredUnitId',
  'developer_sale',
  'sourceContext',
  'resolveConversionDetailedStage',
  'allowEarlyLeadStatus',
  'EARLY_ONBOARDING_LINK_STATUSES',
  "'DEP'",
]) {
  assert.match(handoffSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

for (const token of [
  'DEVELOPER_LEAD_PHASE17_CONTRACT',
  'buildDeveloperLeadTransactionHandoff',
  'summarizeDeveloperLeadTransactionHandoffs',
  'Send Buyer Onboarding',
  'conversionBridgeEnabled: true',
  'data-contract={DEVELOPER_LEAD_PHASE17_CONTRACT}',
]) {
  assert.match(pageSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

assert.equal(
  /createTransactionFromWizard|recordBuyerOnboardingSent|invokeEdgeFunction\('send-email'/.test(serviceSource),
  false,
  'Phase 17 must not mutate transactions or send buyer onboarding from developerLeadService',
)
assert.match(docsSource, /Developer Leads Phase 17 Buyer Onboarding Handoff/)
assert.match(docsSource, /non-mutating handoff payload/)
assert.match(docsSource, /does not send the buyer onboarding email/)
assert.match(phase5Source, /test:developer-module-phase17/)
assert.match(phase6Source, /test:developer-module-phase17/)

console.log(JSON.stringify({
  version: 'developer_leads_phase17_transaction_handoff_v1',
  ready: true,
  coveredSurfaces: [
    'developer lead transaction eligibility',
    'agency handover blocker',
    'buyer contact readiness',
    'development and unit prerequisites',
    'transaction wizard handoff payload',
    'developer leads row-level handoff status',
  ],
}, null, 2))
