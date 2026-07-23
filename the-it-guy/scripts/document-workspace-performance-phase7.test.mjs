import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const servicePath = path.join(root, 'src', 'services', 'documentWorkspacePerformanceService.js')
const packagePath = path.join(root, 'package.json')

const serviceSource = fs.readFileSync(servicePath, 'utf8')
const pkg = fs.readFileSync(packagePath, 'utf8')

for (const token of [
  'DOCUMENT_WORKSPACE_PERFORMANCE_CONTRACT',
  'document-workspace-performance-phase7-v1',
  "DOCUMENT_WORKSPACE_PERFORMANCE_PACKET_TYPES = Object.freeze(['otp', 'mandate'])",
  'fetchDocumentWorkspacePerformanceSnapshot',
  "from('performance_metrics')",
  ".ilike('metric_name', `${DOCUMENT_WORKSPACE_PERFORMANCE_METRIC_PREFIX}%`)",
  'buildDocumentWorkspacePerformanceSnapshot',
  'summarizeDocumentWorkspacePerformanceRows',
]) {
  assert.ok(serviceSource.includes(token), `Phase 7 service should include ${token}`)
}

const {
  DOCUMENT_WORKSPACE_PERFORMANCE_CONTRACT,
  buildDocumentWorkspacePerformanceSnapshot,
  normalizeDocumentWorkspacePerformanceRow,
  resolveDocumentWorkspacePerformancePhase,
  summarizeDocumentWorkspacePerformanceRows,
} = await import('../src/services/documentWorkspacePerformanceService.js')

assert.equal(resolveDocumentWorkspacePerformancePhase('legal_document.generation.total'), 'generation')
assert.equal(resolveDocumentWorkspacePerformancePhase('legal_document.signing.email_delivery'), 'signing')

const rows = [
  {
    id: 'm1',
    metric_name: 'legal_document.generation.total',
    duration_ms: 70000,
    created_at: '2026-07-22T08:00:00.000Z',
    metadata: { packetType: 'mandate', packetId: 'packet-mandate-1', performanceBudgetMs: 65000 },
  },
  {
    id: 'm2',
    metric_name: 'legal_document.generation.render_save',
    duration_ms: 35000,
    created_at: '2026-07-22T08:01:00.000Z',
    metadata: { packetType: 'mandate', packetId: 'packet-mandate-1', performanceBudgetMs: 45000 },
  },
  {
    id: 'o1',
    metric_name: 'legal_document.signing.email_delivery',
    duration_ms: 12500,
    created_at: '2026-07-22T08:02:00.000Z',
    metadata: { packetType: 'otp', packetId: 'packet-otp-1', targetSignerRole: 'buyer', performanceBudgetMs: 10000 },
  },
  {
    id: 'o2',
    metric_name: 'legal_document.signing.total',
    duration_ms: 9000,
    created_at: '2026-07-22T08:03:00.000Z',
    metadata: { packetType: 'otp', packetId: 'packet-otp-1', performanceBudgetMs: 15000 },
  },
]

const normalized = normalizeDocumentWorkspacePerformanceRow(rows[0])
assert.equal(normalized.packetType, 'mandate')
assert.equal(normalized.phase, 'generation')
assert.equal(normalized.breached, true)
assert.equal(normalized.overBudgetMs, 5000)

const summary = summarizeDocumentWorkspacePerformanceRows(rows)
assert.equal(summary.sampleCount, 4)
assert.equal(summary.breachCount, 2)
assert.equal(summary.breachRate, 0.5)
assert.equal(summary.slowestMetricName, 'legal_document.generation.total')

const snapshot = buildDocumentWorkspacePerformanceSnapshot(rows, { generatedAt: '2026-07-22T09:00:00.000Z' })
assert.equal(snapshot.contract, DOCUMENT_WORKSPACE_PERFORMANCE_CONTRACT)
assert.equal(snapshot.summary.sampleCount, 4)
assert.equal(snapshot.byPacketType.mandate.sampleCount, 2)
assert.equal(snapshot.byPacketType.mandate.phases.generation.breachCount, 1)
assert.equal(snapshot.byPacketType.otp.sampleCount, 2)
assert.equal(snapshot.byPacketType.otp.phases.signing.breachCount, 1)
assert.equal(snapshot.breaches[0].metricName, 'legal_document.generation.total')
assert.equal(snapshot.breaches[1].metricName, 'legal_document.signing.email_delivery')

assert.ok(
  pkg.includes('"test:document-workspace-performance-phase7": "node scripts/document-workspace-performance-phase7.test.mjs"'),
  'Phase 7 package script is missing.',
)

console.log('document workspace performance phase 7 checks passed')
