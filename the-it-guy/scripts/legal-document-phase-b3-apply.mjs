import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const WRITE_FLAG = 'LEGAL_DOCUMENT_PHASE_B3_WRITE'
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
const normalizeIds = (value) => [...new Set((Array.isArray(value) ? value : String(value || '').split(',')).map((item) => String(item).trim()).filter(Boolean))].sort()
const reviewEvidenceDigest = (row) => `sha256:${createHash('sha256').update(JSON.stringify({ templateId: row.templateId, contentDigest: row.contentDigest, decision: row.decision, reviewedBy: row.reviewedBy, reviewedAt: row.reviewedAt, reviewReference: row.reviewReference })).digest('hex')}`
const apply = process.argv.includes('--apply')
const manifest = JSON.parse(fs.readFileSync('config/legal-document-review-manifest.json', 'utf8'))
const review = JSON.parse(fs.readFileSync('config/legal-document-counsel-review.json', 'utf8'))
const templateIds = normalizeIds(manifest.templates.map((row) => row.templateId))
const b2Run = spawnSync(process.execPath, ['scripts/legal-document-phase-b2-verify.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 180_000, maxBuffer: 10 * 1024 * 1024 })
let b2 = null
try { b2 = JSON.parse(b2Run.stdout) } catch {}
const appliedBy = arg('applied-by')
const applicationReference = arg('reference')
const blockers = []
if (b2?.status !== 'READY_FOR_B3') blockers.push({ code: 'B3_B2_NOT_READY', detail: 'B2 must report READY_FOR_B3 before runtime approval is recorded.' })
if (apply && process.env[WRITE_FLAG] !== 'true') blockers.push({ code: 'B3_WRITE_FLAG_MISSING' })
if (apply && arg('confirm-project-ref') !== manifest.projectRef) blockers.push({ code: 'B3_PROJECT_CONFIRMATION_MISMATCH' })
if (apply && arg('confirm-b1-manifest-digest') !== manifest.manifestDigest) blockers.push({ code: 'B3_MANIFEST_CONFIRMATION_MISMATCH' })
if (apply && normalizeIds(arg('confirm-template-ids')).join(',') !== templateIds.join(',')) blockers.push({ code: 'B3_TEMPLATE_CONFIRMATION_MISMATCH' })
if (apply && !appliedBy) blockers.push({ code: 'B3_OPERATOR_MISSING' })
if (apply && !applicationReference) blockers.push({ code: 'B3_APPLICATION_REFERENCE_MISSING' })

const reviewById = new Map(review.reviews.map((row) => [row.templateId, row]))
const approvals = manifest.templates.map((template) => {
  const decision = reviewById.get(template.templateId) || {}
  return {
    templateId: template.templateId,
    packetType: template.packetType,
    decision: decision.decision || null,
    contentDigest: template.contentDigest,
    reviewedBy: decision.reviewedBy || null,
    reviewedAt: decision.reviewedAt || null,
    reviewReference: decision.reviewReference || null,
    reviewEvidenceDigest: decision.templateId ? reviewEvidenceDigest(decision) : null,
  }
})
const report = { phase: 'B3', mode: apply ? 'apply' : 'dry-run', status: blockers.length ? 'BLOCKED' : apply ? 'READY_TO_APPLY' : 'DRY_RUN_READY', projectRef: manifest.projectRef, b1ManifestDigest: manifest.manifestDigest, templateIds, approvals, b2Status: b2?.status || 'UNAVAILABLE', blockers, mutatedData: false }

if (!apply || blockers.length) {
  console.log(JSON.stringify(report, null, 2))
  if (blockers.length) process.exitCode = 1
} else {
  const env = { ...process.env }
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase URL and service role key are required.')
  if (new URL(url).hostname.split('.')[0] !== manifest.projectRef) throw new Error('Runtime Supabase project does not match the B1/B2 evidence project.')
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const result = await client.rpc('bridge_apply_legal_document_counsel_approvals', {
    p_b1_manifest_digest: manifest.manifestDigest,
    p_approvals: approvals,
    p_applied_by: appliedBy,
    p_application_reference: applicationReference,
  })
  if (result.error) throw result.error
  console.log(JSON.stringify({ ...report, status: 'APPLIED', result: result.data, mutatedData: true }, null, 2))
}
