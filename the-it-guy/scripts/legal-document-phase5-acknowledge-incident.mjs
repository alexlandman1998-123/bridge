import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
function envFile(file) { if (!fs.existsSync(file)) return {}; return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')] })) }
function arg(name) { return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || '' }
const env = { ...envFile('.env'), ...envFile('.env.staging.local'), ...process.env }
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
const incidentId = arg('incident-id'); const owner = arg('owner').trim(); const note = arg('note').trim(); const actorId = arg('actor-id'); const apply = process.argv.includes('--apply')
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
assert.ok(incidentId && owner && note, '--incident-id, --owner, and --note are required.')
assert.match(incidentId, uuidPattern, '--incident-id must be a UUID.')
assert.ok(owner.length <= 160, '--owner must contain at most 160 characters.')
assert.ok(note.length <= 2000, '--note must contain at most 2000 characters.')
assert.ok(!apply || actorId, '--actor-id is required for --apply so the acknowledgement has an accountable actor.')
if (actorId) assert.match(actorId, uuidPattern, '--actor-id must be a UUID.')
assert.ok(url && env.SUPABASE_SERVICE_ROLE_KEY, 'Supabase configuration is required.')
assert.ok(!apply || (arg('confirm-project-ref') === new URL(url).hostname.split('.')[0] && process.env.LEGAL_DOCUMENT_INCIDENT_WRITE === 'true'), 'Apply requires exact project confirmation and LEGAL_DOCUMENT_INCIDENT_WRITE=true.')
const require = createRequire(path.resolve('package.json')); const { createClient } = require('@supabase/supabase-js'); const client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const incident = await client.from('system_health_snapshots').select('id, status, summary, created_at').eq('id', incidentId).maybeSingle(); assert.ifError(incident.error); assert.ok(incident.data?.summary?.kind === 'legal_document_watchdog_v1', 'Incident must be a legal-document watchdog snapshot.')
assert.equal(incident.data.status, 'critical', 'Only a critical watchdog snapshot can be acknowledged as an incident.')
const acknowledgement = { kind: 'legal_document_incident_acknowledgement_v1', incidentId, owner, note, incidentStatus: incident.data.status, actorId: actorId || null }
if (apply) {
  const write = await client.rpc('bridge_acknowledge_legal_document_incident_phase5', {
    p_incident_snapshot_id: incidentId,
    p_owner: owner,
    p_note: note,
    p_actor_id: actorId,
  })
  assert.ifError(write.error)
  assert.ok(write.data && typeof write.data === 'object', 'Phase 5 acknowledgement RPC returned no durable acknowledgement record.')
  acknowledgement.rpcResult = write.data
}
console.log(JSON.stringify({ phase: 5, mode: apply ? 'applied' : 'dry-run', acknowledgement, mutatedData: apply }, null, 2))
