import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const runJson = (script, timeout = 300_000) => {
  const result = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 })
  try { return JSON.parse(result.stdout) } catch { return null }
}
const c1 = runJson('scripts/legal-document-phase-c1-verify.mjs')
const c2 = runJson('scripts/legal-document-phase-c2-verify.mjs')
const blockers = []
if (c1?.status !== 'READY_FOR_B1_REFREEZE') blockers.push({ code: 'C3_C1_NOT_READY' })
if (c2?.status !== 'READY_FOR_B1_REFREEZE') blockers.push({ code: 'C3_C2_NOT_READY' })
let evidence = null

if (!blockers.length) {
  const b1 = runJson('scripts/legal-document-phase-b1-verify.mjs')
  const manifest = JSON.parse(fs.readFileSync('config/legal-document-review-manifest.json', 'utf8'))
  const review = JSON.parse(fs.readFileSync('config/legal-document-counsel-review.json', 'utf8'))
  const templateIds = manifest.templates.map((row) => row.templateId)
  if (b1?.status !== 'FROZEN') blockers.push({ code: 'C3_B1_NOT_CURRENT' })
  if (review.projectRef !== manifest.projectRef || review.b1ManifestDigest !== manifest.manifestDigest) blockers.push({ code: 'C3_B2_REGISTER_NOT_RESET' })
  const reviewById = new Map((review.reviews || []).map((row) => [row.templateId, row]))
  for (const template of manifest.templates) {
    const row = reviewById.get(template.templateId)
    if (!row || row.contentDigest !== template.contentDigest) blockers.push({ code: 'C3_B2_REGISTER_TEMPLATE_MISMATCH', templateId: template.templateId })
  }
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase URL and service role key are required for C3 verification.')
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const client = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const [templatesResult, auditsResult] = await Promise.all([
    client.from('document_packet_templates').select('id, metadata_json').in('id', templateIds),
    client.from('document_packet_template_audit').select('template_id, event_payload_json, created_at').in('template_id', templateIds).eq('event_type', 'legal_review_cycle_restarted').order('created_at', { ascending: false }),
  ])
  if (templatesResult.error) throw templatesResult.error
  if (auditsResult.error) throw auditsResult.error
  const runtimeById = new Map((templatesResult.data || []).map((row) => [row.id, row]))
  const audits = auditsResult.data || []
  for (const templateId of templateIds) {
    const runtime = runtimeById.get(templateId)
    if (runtime?.metadata_json?.legal_b1_manifest_digest !== manifest.manifestDigest) blockers.push({ code: 'C3_RUNTIME_CYCLE_BINDING_MISSING', templateId })
    if (!audits.some((row) => row.template_id === templateId && row.event_payload_json?.nextManifestDigest === manifest.manifestDigest)) blockers.push({ code: 'C3_RESTART_AUDIT_MISSING', templateId })
  }
  evidence = { manifestDigest: manifest.manifestDigest, templateIds, reviewStatus: review.status, auditCount: audits.length, b1Status: b1?.status || 'UNAVAILABLE' }
}

const solutionByCode = {
  C3_C1_NOT_READY: 'Complete C1 source recovery before restarting legal review.',
  C3_C2_NOT_READY: 'Pass all C2 canonical render scenarios before restarting legal review.',
  C3_B1_NOT_CURRENT: 'Run the guarded C3 restart so B1 is regenerated from the current source.',
  C3_B2_REGISTER_NOT_RESET: 'Reset B2 against the exact new B1 manifest through the C3 operator.',
  C3_B2_REGISTER_TEMPLATE_MISMATCH: 'Regenerate the B2 register from the exact current B1 template set.',
  C3_RUNTIME_CYCLE_BINDING_MISSING: 'Apply C3 so stale runtime approvals are invalidated and rebound to the new cycle.',
  C3_RESTART_AUDIT_MISSING: 'Apply C3 through its RPC so every template receives immutable restart evidence.',
}
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.templateId || ''}`, row])).values()]
console.log(JSON.stringify({ phase: 'C3', status: unique.length ? 'NO_GO' : 'READY_FOR_B2', blockerCount: unique.length, blockers: unique.map((row) => ({ ...row, solution: solutionByCode[row.code] })), c1Status: c1?.status || 'UNAVAILABLE', c2Status: c2?.status || 'UNAVAILABLE', evidence, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
