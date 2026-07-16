import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
function envFile(file) { if (!fs.existsSync(file)) return {}; return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')] })) }
function arg(name) { return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || '' }
const env = { ...envFile('.env'), ...envFile('.env.staging.local'), ...process.env }
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
const incidentId = arg('incident-id'); const owner = arg('owner'); const note = arg('note'); const apply = process.argv.includes('--apply')
assert.ok(incidentId && owner && note, '--incident-id, --owner, and --note are required.')
assert.ok(url && env.SUPABASE_SERVICE_ROLE_KEY, 'Supabase configuration is required.')
assert.ok(!apply || (arg('confirm-project-ref') === new URL(url).hostname.split('.')[0] && process.env.LEGAL_DOCUMENT_INCIDENT_WRITE === 'true'), 'Apply requires exact project confirmation and LEGAL_DOCUMENT_INCIDENT_WRITE=true.')
const require = createRequire(path.resolve('package.json')); const { createClient } = require('@supabase/supabase-js'); const client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const incident = await client.from('system_health_snapshots').select('id, status, summary, created_at').eq('id', incidentId).maybeSingle(); assert.ifError(incident.error); assert.ok(incident.data?.summary?.kind === 'legal_document_watchdog_v1', 'Incident must be a legal-document watchdog snapshot.')
assert.equal(incident.data.status, 'critical', 'Only a critical watchdog snapshot can be acknowledged as an incident.')
const summary = { kind: 'legal_document_incident_acknowledgement_v1', incidentId, owner, note, incidentStatus: incident.data.status, acknowledgedAt: new Date().toISOString() }
if (apply) { const write = await client.from('system_health_snapshots').insert({ status: 'warning', summary, created_by: null }).select('id').single(); assert.ifError(write.error) }
console.log(JSON.stringify({ phase: 5, mode: apply ? 'applied' : 'dry-run', acknowledgement: summary, mutatedData: apply }, null, 2))
