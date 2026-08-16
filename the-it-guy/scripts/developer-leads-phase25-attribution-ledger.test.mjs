import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEVELOPER_LEAD_PHASE25_CONTRACT,
  buildDeveloperLeadAttributionLedger,
  summarizeDeveloperLeadAttributionLedger,
} from '../src/core/developerLeads/developerLeadAttributionLedger.js'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const ledgerSource = readFileSync(resolve(appRoot, 'src/core/developerLeads/developerLeadAttributionLedger.js'), 'utf8')
const developerLeadsPageSource = readFileSync(resolve(appRoot, 'src/pages/DeveloperLeadsPage.jsx'), 'utf8')
const docsSource = readFileSync(resolve(appRoot, 'docs/developer-leads-phase25-attribution-ledger.md'), 'utf8')
const phase5Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase5-release-readiness.test.mjs'), 'utf8')
const phase6Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase6-post-rollout-monitoring.mjs'), 'utf8')

const scripts = packageJson.scripts || {}

assert.equal(
  scripts['test:developer-module-phase25'],
  'node scripts/developer-leads-phase25-attribution-ledger.test.mjs',
)
assert.match(scripts['verify:developer-module'] || '', /test:developer-module-phase25/)
assert.equal(DEVELOPER_LEAD_PHASE25_CONTRACT, 'developer-leads-phase25-attribution-ledger-v1')

const sampleLeads = [
  {
    developerLeadId: 'agency-converted',
    developerOrgId: 'developer-1',
    sourceAgencyOrgId: 'agency-1',
    sourceAgentUserId: 'agent-1',
    primaryDevelopmentId: 'development-1',
    leadOwner: 'agency',
    ownershipModel: 'agency_introduced',
    visibilityState: 'handed_over',
    leadStatus: 'converted',
    convertedTransactionId: 'transaction-1',
    convertedAt: '2026-08-16T07:00:00.000Z',
  },
  {
    developerLeadId: 'agency-released',
    developerOrgId: 'developer-1',
    sourceAgencyOrgId: 'agency-1',
    sourceAgentUserId: 'agent-1',
    primaryDevelopmentId: 'development-1',
    leadOwner: 'agency',
    ownershipModel: 'agency_introduced',
    visibilityState: 'handed_over',
    leadStatus: 'qualified',
    updatedAt: '2026-08-15T07:00:00.000Z',
  },
  {
    developerLeadId: 'agency-protected',
    developerOrgId: 'developer-1',
    sourceAgencyOrgId: 'agency-2',
    sourceAgentUserId: 'agent-2',
    primaryDevelopmentId: 'development-2',
    leadOwner: 'agency',
    ownershipModel: 'agency_introduced',
    visibilityState: 'limited',
    leadStatus: 'new',
  },
  {
    developerLeadId: 'developer-assigned',
    developerOrgId: 'developer-1',
    assignedAgentId: 'developer-agent',
    primaryDevelopmentId: 'development-1',
    leadOwner: 'developer',
    visibilityState: 'full',
    leadStatus: 'reserved',
  },
  {
    developerLeadId: 'developer-direct-lost',
    developerOrgId: 'developer-1',
    primaryDevelopmentId: 'development-3',
    leadOwner: 'developer',
    visibilityState: 'full',
    leadStatus: 'lost',
  },
]

const ledger = buildDeveloperLeadAttributionLedger(sampleLeads)
assert.equal(ledger.contract, DEVELOPER_LEAD_PHASE25_CONTRACT)
assert.equal(ledger.totalLeads, 5)
assert.equal(ledger.ledgerRowCount, 4)
assert.equal(ledger.agencyIntroducedCount, 3)
assert.equal(ledger.developerOwnedCount, 2)
assert.equal(ledger.convertedCount, 1)
assert.equal(ledger.conversionRate, 0.2)

const primaryAgencyRow = ledger.rows.find((row) => row.sourceAgencyOrgId === 'agency-1')
assert.ok(primaryAgencyRow)
assert.equal(primaryAgencyRow.attributionType, 'agency_introduced')
assert.equal(primaryAgencyRow.creditedAgentId, 'agent-1')
assert.equal(primaryAgencyRow.primaryDevelopmentId, 'development-1')
assert.equal(primaryAgencyRow.totalLeads, 2)
assert.equal(primaryAgencyRow.releasedCount, 1)
assert.equal(primaryAgencyRow.convertedCount, 1)
assert.equal(primaryAgencyRow.qualifiedOrReservedCount, 1)
assert.equal(primaryAgencyRow.ledgerStatus, 'converted')
assert.equal(primaryAgencyRow.conversionRate, 0.5)

const protectedAgencyRow = ledger.rows.find((row) => row.sourceAgencyOrgId === 'agency-2')
assert.equal(protectedAgencyRow.protectedCount, 1)
assert.equal(protectedAgencyRow.ledgerStatus, 'protected')

const assignedRow = ledger.rows.find((row) => row.attributionType === 'developer_assigned')
assert.equal(assignedRow.creditedAgentId, 'developer-agent')
assert.equal(assignedRow.qualifiedOrReservedCount, 1)

const summary = summarizeDeveloperLeadAttributionLedger(sampleLeads)
assert.equal(summary.contract, DEVELOPER_LEAD_PHASE25_CONTRACT)
assert.equal(summary.status, 'attention')
assert.match(summary.detail, /1 of 5 developer leads converted/)

for (const token of [
  'DEVELOPER_LEAD_PHASE25_CONTRACT',
  'developer-leads-phase25-attribution-ledger-v1',
  'buildDeveloperLeadAttributionLedger',
  'summarizeDeveloperLeadAttributionLedger',
  'agency_introduced',
  'developer_assigned',
  'developer_direct',
  'conversionRate',
  'handoverRate',
]) {
  assert.match(ledgerSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

for (const token of [
  'DEVELOPER_LEAD_PHASE25_CONTRACT',
  'DeveloperLeadAttributionLedgerPanel',
  'buildDeveloperLeadAttributionLedger(leads)',
  'summarizeDeveloperLeadAttributionLedger(leads)',
  'Attribution Ledger',
  'Lead source and conversion ownership',
  'data-contract={DEVELOPER_LEAD_PHASE25_CONTRACT}',
]) {
  assert.match(developerLeadsPageSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

assert.doesNotMatch(ledgerSource, /createTransactionFromWizard|recordBuyerOnboardingSent|invokeEdgeFunction|send-email|service_role/i)
assert.doesNotMatch(developerLeadsPageSource, /service_role|sb_secret_|security\s+definer/i)

assert.match(docsSource, /Developer Leads Phase 25 Attribution Ledger/)
assert.match(docsSource, /source attribution ledger/)
assert.match(docsSource, /read-only model/)
assert.match(docsSource, /does not create transactions/)
assert.match(docsSource, /bypass RLS/)
assert.doesNotMatch(docsSource, /service_role|sb_secret_|access_token/i)

assert.match(phase5Source, /test:developer-module-phase25/)
assert.match(phase6Source, /test:developer-module-phase25/)

console.log(JSON.stringify({
  version: 'developer_leads_phase25_attribution_ledger_v1',
  ready: true,
  coveredSurfaces: [
    'developer lead source attribution ledger',
    'agency/developer ownership split',
    'credited agent and development grouping',
    'developer-module verification chain',
  ],
}, null, 2))
