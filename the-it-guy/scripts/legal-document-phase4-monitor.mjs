import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

function envFile(file) {
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')]
  }))
}

const env = { ...envFile('.env'), ...envFile('.env.staging.local'), ...process.env }
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
assert.ok(url && env.SUPABASE_SERVICE_ROLE_KEY, 'Supabase URL and service role key are required.')
const config = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8'))
const require = createRequire(path.resolve('package.json'))
const { createClient } = require('@supabase/supabase-js')
const client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const now = Date.now()
const since = new Date(now - 24 * 60 * 60 * 1000).toISOString()
const staleBefore = new Date(now - Number(config.limits.staleSigningHours || 2) * 60 * 60 * 1000).toISOString()
const pendingDocumentBefore = new Date(now - 10 * 60 * 1000).toISOString()

const finalSignedEventTypes = ['final_signed_document_generated', 'final_signed_otp_generated']
const [eventsResult, packetsResult, pendingDocumentsResult] = await Promise.all([
  client.from('document_packet_events').select('id, event_type, created_at, packet_id').gte('created_at', since).in('event_type', ['generation_started', 'version_generated', 'generation_failed', ...finalSignedEventTypes, 'legal_template_approval_blocked']),
  client.from('document_packets').select('id, packet_type, status, organisation_id, updated_at').in('packet_type', ['otp', 'mandate']).in('status', ['sent', 'partially_signed']).lt('updated_at', staleBefore),
  client.from('documents').select('id, updated_at').eq('stage_key', 'final_signed_pending').eq('is_client_visible', false).lt('updated_at', pendingDocumentBefore),
])
assert.ifError(eventsResult.error)
assert.ifError(packetsResult.error)
assert.ifError(pendingDocumentsResult.error)
const events = eventsResult.data || []
const stalePackets = packetsResult.data || []
const pendingDocuments = pendingDocumentsResult.data || []
const count = (type) => events.filter((row) => row.event_type === type).length
const countAny = (types) => events.filter((row) => types.includes(row.event_type)).length
const failures = count('generation_failed')
const latestSuccessfulGenerationAt = events.filter((row) => row.event_type === 'version_generated').map((row) => Date.parse(row.created_at)).filter(Number.isFinite).sort((a, b) => b - a)[0] || 0
const unresolvedFailures = events.filter((row) => row.event_type === 'generation_failed' && Date.parse(row.created_at) > latestSuccessfulGenerationAt)
const blockers = []
if (unresolvedFailures.length > Number(config.limits.maxGenerationFailures24h || 0)) blockers.push({ code: 'GENERATION_FAILURE_BUDGET_EXCEEDED', count: unresolvedFailures.length })
if (stalePackets.length > Number(config.limits.maxStaleSigningPackets || 0)) blockers.push({ code: 'STALE_SIGNING_PACKET_BUDGET_EXCEEDED', count: stalePackets.length })
if (pendingDocuments.length) blockers.push({ code: 'FINAL_DOCUMENT_PUBLICATION_PENDING', count: pendingDocuments.length })

console.log(JSON.stringify({
  phase: 4,
  status: blockers.length ? 'ALERT' : 'HEALTHY',
  windowHours: 24,
  metrics: {
    generationStarted: count('generation_started'),
    generationCompleted: count('version_generated'),
    generationFailed: failures,
    unresolvedGenerationFailures: unresolvedFailures.length,
    finalSignedGenerated: countAny(finalSignedEventTypes),
    canonicalFinalSignedGenerated: count('final_signed_document_generated'),
    legalApprovalBlocked: count('legal_template_approval_blocked'),
    staleSigningPackets: stalePackets.length,
    pendingFinalDocumentPublications: pendingDocuments.length,
  },
  blockers,
  stalePacketIds: stalePackets.map((row) => row.id),
  pendingFinalDocumentIds: pendingDocuments.map((row) => row.id),
  checkedAt: new Date().toISOString(),
  mutatedData: false,
}, null, 2))
if (blockers.length) process.exitCode = 1
