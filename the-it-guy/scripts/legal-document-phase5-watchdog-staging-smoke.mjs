import assert from 'node:assert/strict'
import fs from 'node:fs'

function envFile(file) {
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')]
  }))
}
const env = { ...envFile('.env'), ...envFile('.env.staging.local'), ...process.env }
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
assert.ok(url.includes('isdowlnollckzvltkasn'), 'Refusing watchdog smoke outside canonical staging.')
assert.ok(env.SUPABASE_SERVICE_ROLE_KEY, 'Staging service role key is required.')
assert.ok(process.argv.includes('--persist') && process.argv.includes('--confirm-staging') && process.env.LEGAL_DOCUMENT_WATCHDOG_STAGING_WRITE === 'true', 'Watchdog smoke requires --persist, --confirm-staging, and LEGAL_DOCUMENT_WATCHDOG_STAGING_WRITE=true.')
const unauthorized = await fetch(`${url.replace(/\/$/, '')}/functions/v1/legal-document-watchdog`, { method: 'POST', headers: { Authorization: 'Bearer invalid-watchdog-credential', 'Content-Type': 'application/json' }, body: '{}' })
const unauthorizedBody = await unauthorized.json().catch(() => ({}))
assert.equal(unauthorized.status, 401, 'Watchdog must reject an invalid credential.')
assert.equal(unauthorizedBody.errorCode, 'WATCHDOG_AUTH_REQUIRED')
const response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/legal-document-watchdog`, { method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' }, body: '{}' })
const result = await response.json().catch(() => ({}))
assert.equal(response.status, 200, `Watchdog invocation failed (${response.status}).`)
assert.equal(result.success, true)
assert.ok(result.snapshot?.id, 'Watchdog health snapshot did not persist.')
assert.equal(result.summary?.kind, 'legal_document_watchdog_v1')
console.log(JSON.stringify({ phase: 5, environment: 'staging', status: 'passed', authorization: { invalidCredentialRejected: true }, snapshot: result.snapshot, health: result.snapshot.status, metrics: result.summary.metrics, blockers: result.summary.blockers, mutatedData: true }, null, 2))
