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
function arg(name) { return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || '' }

const env = { ...envFile('.env'), ...envFile('.env.staging.local'), ...process.env }
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
const projectRef = new URL(url).hostname.split('.')[0]
const templateIds = arg('template-ids').split(',').map((value) => value.trim()).filter(Boolean)
const reason = arg('reason')
const apply = process.argv.includes('--apply')
assert.ok(templateIds.length, '--template-ids must explicitly list every template to lock.')
assert.ok(reason, '--reason is required.')
assert.ok(url && env.SUPABASE_SERVICE_ROLE_KEY, 'Supabase URL and service role key are required.')
assert.ok(!apply || env.LEGAL_DOCUMENT_ROLLBACK_WRITE === 'true', 'LEGAL_DOCUMENT_ROLLBACK_WRITE=true is required for rollback writes.')
assert.ok(!apply || arg('confirm-project-ref') === projectRef, '--confirm-project-ref must exactly match the target project.')

const require = createRequire(path.resolve('package.json'))
const { createClient } = require('@supabase/supabase-js')
const client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const templates = await client.from('document_packet_templates').select('id, packet_type, template_key, metadata_json').in('id', templateIds)
assert.ifError(templates.error)
assert.equal(templates.data?.length, templateIds.length, 'Every explicitly listed rollback template must exist.')
const revokedAt = new Date().toISOString()
for (const template of templates.data || []) {
  const metadata = template.metadata_json && typeof template.metadata_json === 'object' ? template.metadata_json : {}
  const history = Array.isArray(metadata.legal_approval_history) ? metadata.legal_approval_history : []
  const nextMetadata = { ...metadata, legal_review_status: 'revoked', legal_revoked_at: revokedAt, legal_revocation_reason: reason, legal_approval_history: [...history, { action: 'revoked', reason, recordedAt: revokedAt }] }
  if (apply) {
    const update = await client.from('document_packet_templates').update({ metadata_json: nextMetadata }).eq('id', template.id)
    assert.ifError(update.error)
  }
}
console.log(JSON.stringify({ phase: 4, mode: apply ? 'applied' : 'dry-run', strategy: 'revoke_template_approval', projectRef, templateIds, reason, mutatedData: apply, expectedEffect: 'OTP and SalesMandate generation fail closed immediately for the revoked templates.' }, null, 2))
