import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  LAUNCH_BLOCKER_GATES,
  evaluateSmokeReport,
  parseSmokeReport,
} from './agent-bond-attorney-launch-gate.mjs'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = path.resolve(PROJECT_ROOT, '..')

const passingReport = {
  runId: 'tx-prop-test',
  pass: true,
  created: [
    { key: 'cash', transactionId: 'cash-tx' },
    { key: 'bond', transactionId: 'bond-tx' },
    { key: 'hybrid', transactionId: 'hybrid-tx' },
  ],
  audit: { pass: true, rowsFound: 12 },
  workflowSchema: { pass: true, missing: [] },
  partnerRoutingFixture: {
    relationshipId: 'relationship-id',
    routingRuleId: 'routing-rule-id',
  },
  partnerRouting: {
    pass: true,
    expectedRoutedDeals: 2,
    totalEvents: 2,
    bondOriginatorEvents: [
      { routingRuleId: 'routing-rule-id', fallbackUsed: false },
      { routingRuleId: 'routing-rule-id', fallbackUsed: false },
    ],
    fallbackCount: 0,
    missingRuleCount: 0,
    wrongTargetCount: 0,
  },
  acceptance: {
    cashNoBondApplication: true,
    bondHasBondApplication: true,
    hybridHasBondApplication: true,
    allRecordsShareTransactionId: true,
    noDuplicateDownstreamRecords: true,
    unrelatedRoleplayerBlocked: true,
    unrelatedRoleplayerTransactionBlocked: true,
    assignedBondOriginatorCanSeeApplication: true,
    securityAuditEventsPersisted: true,
    workflowReadinessSchemaReady: true,
    partnerRoutingResolvedWithoutFallback: true,
    rlsChecked: true,
  },
}

const passingEvaluation = evaluateSmokeReport(passingReport)
assert.equal(passingEvaluation.pass, true, 'passing smoke report should satisfy every launch gate')
assert.equal(passingEvaluation.checks.length, LAUNCH_BLOCKER_GATES.length)

const fallbackReport = structuredClone(passingReport)
fallbackReport.pass = false
fallbackReport.partnerRouting.pass = false
fallbackReport.partnerRouting.fallbackCount = 1
fallbackReport.acceptance.partnerRoutingResolvedWithoutFallback = false
const fallbackEvaluation = evaluateSmokeReport(fallbackReport)
assert.equal(fallbackEvaluation.pass, false, 'manual partner routing fallback must block launch')
assert.ok(
  fallbackEvaluation.failures.some((failure) => failure.key === 'partner_routing_no_fallback'),
  'fallback failures should name the partner routing gate',
)

const auditReport = structuredClone(passingReport)
auditReport.pass = false
auditReport.audit.rowsFound = 0
auditReport.acceptance.securityAuditEventsPersisted = false
const auditEvaluation = evaluateSmokeReport(auditReport)
assert.equal(auditEvaluation.pass, false, 'missing audit persistence must block launch')
assert.ok(
  auditEvaluation.failures.some((failure) => failure.key === 'security_audit_events'),
  'audit failures should name the security audit gate',
)

const parsedReport = parseSmokeReport(`vite log before report\n${JSON.stringify(passingReport, null, 2)}\n`)
assert.equal(parsedReport.runId, passingReport.runId, 'gate should parse the final smoke JSON report with preceding logs')

const packageSource = fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')
assert.match(
  packageSource,
  /"verify:agent-bond-attorney-launch": "node scripts\/agent-bond-attorney-launch-gate\.mjs"/,
  'package scripts should expose the Phase 4 launch gate',
)
assert.match(
  packageSource,
  /"test:agent-bond-attorney-launch-gate": "node scripts\/agent-bond-attorney-launch-gate\.test\.mjs"/,
  'package scripts should expose the launch gate regression test',
)

const smokeSource = fs.readFileSync(path.join(PROJECT_ROOT, 'scripts/transaction-propagation-smoke.mjs'), 'utf8')
assert.match(smokeSource, /partnerRoutingResolvedWithoutFallback/, 'smoke should expose the partner routing launch acceptance flag')
assert.match(smokeSource, /verifyPartnerRouting/, 'smoke should verify partner routing events explicitly')
assert.match(smokeSource, /attorneyFirmId: selection\.firmId/, 'smoke idempotency reruns should preserve attorney firm ids')

const apiSource = fs.readFileSync(path.join(PROJECT_ROOT, 'src/lib/api.js'), 'utf8')
assert.match(apiSource, /normalizeTransactionRoleplayerDbStatus/, 'API should normalize DB-safe roleplayer assignment statuses')
assert.match(apiSource, /firmId: selection\.firmId \|\| null/, 'roleplayer propagation should preserve attorney firm ids')
assert.match(apiSource, /Only use organisationId as firmId when the by-id lookup above confirms it/, 'API should not substitute partner organisation ids as attorney firm ids')

const relationshipMigration = fs.readFileSync(
  path.join(REPO_ROOT, 'supabase/migrations/202607090010_partner_routing_relationship_resolution.sql'),
  'utf8',
)
assert.match(relationshipMigration, /relationship_id uuid references public\.organisation_partners/, 'routing rules should persist relationship_id')
assert.match(relationshipMigration, /'bond_originator'/, 'bond originator staff should be visible through partner people RPC')

const sourceMigration = fs.readFileSync(
  path.join(REPO_ROOT, 'supabase/migrations/202607090012_transaction_roleplayer_partner_routing_source.sql'),
  'utf8',
)
assert.match(sourceMigration, /'partner_routing_rule'/, 'transaction roleplayers should accept partner routing rule selection source')
assert.match(sourceMigration, /'routing_rule'/, 'transaction roleplayers should accept routing rule selection source')

const connectionMigration = fs.readFileSync(
  path.join(REPO_ROOT, 'supabase/migrations/202607090013_partner_connection_allowed_attorney_bond_originator.sql'),
  'utf8',
)
assert.match(connectionMigration, /when 'attorney_firm'[\s\S]*'bond_originator'/, 'attorney firms should be allowed to connect to bond originators')
assert.match(connectionMigration, /when 'bond_originator'[\s\S]*'attorney_firm'/, 'bond originators should be allowed to connect to attorney firms')

console.log('agent bond attorney launch gate tests passed')
