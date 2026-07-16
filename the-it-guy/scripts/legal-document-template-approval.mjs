import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const WRITE_FLAG = 'LEGAL_TEMPLATE_APPROVAL_WRITE'

function envFile(file) {
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')]
  }))
}

function arg(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

const env = { ...envFile('.env'), ...envFile('.env.staging.local'), ...process.env }
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
const templateId = arg('template-id')
const reference = arg('reference')
const approvedAt = arg('approved-at')
const approvedBy = arg('approved-by')
const revokeReason = arg('revoke-reason')
const projectRef = new URL(url).hostname.split('.')[0]
const apply = process.argv.includes('--apply')
const revoke = process.argv.includes('--revoke')

assert.ok(templateId, '--template-id is required.')
assert.ok(url && env.SUPABASE_SERVICE_ROLE_KEY, 'Supabase URL and service role key are required.')
assert.ok(!apply || env[WRITE_FLAG] === 'true', `${WRITE_FLAG}=true is required for writes.`)
assert.ok(!apply || arg('confirm-project-ref') === projectRef, '--confirm-project-ref must exactly match the target project.')
if (revoke) assert.ok(revokeReason, '--revoke-reason is required when revoking approval.')
else {
  assert.ok(reference, '--reference is required and must come from independent counsel approval.')
  assert.ok(approvedBy, '--approved-by is required.')
  assert.ok(approvedAt && Number.isFinite(Date.parse(approvedAt)), '--approved-at must be a valid independently supplied timestamp.')
  assert.ok(Date.parse(approvedAt) <= Date.now() + 5 * 60 * 1000, '--approved-at cannot be in the future.')
}

const require = createRequire(path.resolve('package.json'))
const { createClient } = require('@supabase/supabase-js')
const client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const existing = await client.from('document_packet_templates').select('id, packet_type, template_key, template_label, status, is_active, metadata_json, updated_at').eq('id', templateId).maybeSingle()
assert.ifError(existing.error)
assert.ok(existing.data, 'Template not found.')
const metadata = existing.data.metadata_json && typeof existing.data.metadata_json === 'object' ? existing.data.metadata_json : {}
const recordedAt = new Date().toISOString()
const history = Array.isArray(metadata.legal_approval_history) ? metadata.legal_approval_history : []
const action = revoke ? 'revoked' : 'approved'
const nextMetadata = {
  ...metadata,
  legal_review_status: action,
  legal_approved_at: revoke ? metadata.legal_approved_at || null : new Date(approvedAt).toISOString(),
  legal_approval_reference: revoke ? metadata.legal_approval_reference || null : reference,
  legal_approved_by: revoke ? metadata.legal_approved_by || null : approvedBy,
  legal_revoked_at: revoke ? recordedAt : null,
  legal_revocation_reason: revoke ? revokeReason : null,
  legal_approval_history: [...history, { action, reference: revoke ? metadata.legal_approval_reference || null : reference, approvedBy: revoke ? metadata.legal_approved_by || null : approvedBy, approvedAt: revoke ? metadata.legal_approved_at || null : new Date(approvedAt).toISOString(), reason: revoke ? revokeReason : null, recordedAt }],
}

if (apply) {
  const update = await client.from('document_packet_templates').update({ metadata_json: nextMetadata }).eq('id', templateId).select('id, packet_type, template_key, metadata_json, updated_at').single()
  assert.ifError(update.error)
}

console.log(JSON.stringify({
  mode: apply ? 'applied' : 'dry-run',
  action,
  target: { projectRef, templateId, packetType: existing.data.packet_type, templateKey: existing.data.template_key },
  approval: { status: action, approvedAt: nextMetadata.legal_approved_at, reference: nextMetadata.legal_approval_reference, approvedBy: nextMetadata.legal_approved_by, revokedAt: nextMetadata.legal_revoked_at },
  mutatedData: apply,
}, null, 2))
