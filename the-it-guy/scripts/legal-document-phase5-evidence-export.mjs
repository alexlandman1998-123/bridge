import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const WATCHDOG_CONTRACT = 'phase5-f2-f3-f4-v2'

function envFile(file) {
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')]
  }))
}

function arg(name) { return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || '' }
function text(value) { return typeof value === 'string' ? value.trim() : '' }
function record(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {} }
function digest(value) { return createHash('sha256').update(value).digest('hex') }
function writeJson(file, value) { const content = `${JSON.stringify(value, null, 2)}\n`; fs.writeFileSync(file, content); return digest(content) }

const env = { ...envFile('.env'), ...envFile('.env.staging.local'), ...process.env }
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
assert.ok(url && env.SUPABASE_SERVICE_ROLE_KEY, 'Supabase configuration is required.')
const projectRef = new URL(url).hostname.split('.')[0]
assert.equal(arg('confirm-project-ref'), projectRef, '--confirm-project-ref must match the target project before exporting evidence.')
const privateEvidenceRoot = path.resolve('private-evidence')
const outputDir = path.resolve(arg('output-dir') || path.join('private-evidence', 'legal-document-phase5'))
assert.ok(outputDir === privateEvidenceRoot || outputDir.startsWith(`${privateEvidenceRoot}${path.sep}`), 'Evidence output must stay under ignored private-evidence/.')
const require = createRequire(path.resolve('package.json'))
const { createClient } = require('@supabase/supabase-js')
const client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
const [snapshots, packets, templates] = await Promise.all([
  client.from('system_health_snapshots').select('status, summary, created_at').gte('created_at', since).contains('summary', { kind: 'legal_document_watchdog_v1' }).order('created_at', { ascending: false }),
  client.from('document_packets').select('packet_type, status').in('packet_type', ['otp', 'mandate']).gte('updated_at', since),
  client.from('document_packet_templates').select('packet_type, template_key, status, is_active, metadata_json').in('packet_type', ['otp', 'mandate']).eq('status', 'published').neq('is_active', false),
])
assert.ifError(snapshots.error)
assert.ifError(packets.error)
assert.ifError(templates.error)
const statusCounts = (packets.data || []).reduce((acc, row) => { const key = `${row.packet_type}:${row.status}`; acc[key] = (acc[key] || 0) + 1; return acc }, {})
const watchdogSnapshots = (snapshots.data || []).map((row) => {
  const summary = record(row.summary)
  const scope = record(summary.scope)
  return {
    status: row.status,
    createdAt: row.created_at,
    contract: text(summary.contract) || null,
    windowHours: Number(summary.windowHours) || null,
    scope: { mode: text(scope.mode) || null, organisationCount: Number(scope.organisationCount) || 0, storageReadback: text(scope.storageReadback) || null },
    metricCounts: record(summary.metrics),
    blockerCodes: Array.isArray(summary.blockers) ? summary.blockers.map((blocker) => text(record(blocker).code)).filter(Boolean) : [],
  }
})
const report = {
  version: 'legal_document_phase5_evidence_v2',
  contract: WATCHDOG_CONTRACT,
  projectRef,
  windowStart: since,
  generatedAt: new Date().toISOString(),
  watchdogSnapshots,
  packetStatusCounts: statusCounts,
  templates: (templates.data || []).map((row) => ({
    packetType: row.packet_type,
    key: row.template_key,
    published: row.status === 'published' && row.is_active !== false,
    legalReviewStatus: row.metadata_json?.legal_review_status || null,
    legalApprovalRecorded: Boolean(row.metadata_json?.legal_approved_at && row.metadata_json?.legal_approval_reference),
    phase4ReleaseRecorded: row.metadata_json?.legal_phase4_b3_release_contract === 'phase4-b3-integrity-v1',
  })),
  privacy: { packetIds: 'omitted', documentIds: 'omitted', incidentNotes: 'omitted', approvalReferences: 'omitted' },
  mutatedRemoteData: false,
}
fs.mkdirSync(outputDir, { recursive: true })
const jsonPath = path.join(outputDir, 'legal-document-phase5-evidence.json')
const mdPath = path.join(outputDir, 'legal-document-phase5-summary.md')
const manifestPath = path.join(outputDir, 'legal-document-phase5-manifest.json')
const jsonSha256 = writeJson(jsonPath, report)
const markdown = `# Legal Document Phase 5 Evidence\n\n- Generated: ${report.generatedAt}\n- Project: ${report.projectRef}\n- Watchdog snapshots: ${report.watchdogSnapshots.length}\n- Current-contract snapshots: ${report.watchdogSnapshots.filter((row) => row.contract === WATCHDOG_CONTRACT).length}\n- Healthy snapshots: ${report.watchdogSnapshots.filter((row) => row.status === 'healthy').length}\n- Critical snapshots: ${report.watchdogSnapshots.filter((row) => row.status === 'critical').length}\n- Published templates: ${report.templates.length}\n- Privacy: packet/document IDs, incident notes, and approval references are intentionally omitted.\n`
fs.writeFileSync(mdPath, markdown)
const markdownSha256 = digest(markdown)
writeJson(manifestPath, { version: 1, projectRef, generatedAt: report.generatedAt, files: [{ name: path.basename(jsonPath), sha256: jsonSha256 }, { name: path.basename(mdPath), sha256: markdownSha256 }] })
console.log(JSON.stringify({ phase: 5, status: 'exported', artifacts: { jsonPath, markdownPath: mdPath, manifestPath }, snapshotCount: report.watchdogSnapshots.length, mutatedRemoteData: false }, null, 2))
