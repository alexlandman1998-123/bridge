import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const manifest = JSON.parse(fs.readFileSync('config/legal-document-review-manifest.json', 'utf8'))
const review = JSON.parse(fs.readFileSync('config/legal-document-counsel-review.json', 'utf8'))
const digest = (row) => `sha256:${createHash('sha256').update(JSON.stringify({ templateId: row.templateId, contentDigest: row.contentDigest, decision: row.decision, reviewedBy: row.reviewedBy, reviewedAt: row.reviewedAt, reviewReference: row.reviewReference })).digest('hex')}`
const PHASE4_B3_RELEASE_CONTRACT = 'phase4-b3-integrity-v1'
const b2Run = spawnSync(process.execPath, ['scripts/legal-document-phase-b2-verify.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 180_000, maxBuffer: 10 * 1024 * 1024 })
let b2 = null
try { b2 = JSON.parse(b2Run.stdout) } catch {}
const blockers = [...(b2?.blockers || [{ code: 'B3_B2_VERIFICATION_UNAVAILABLE' }])]
const templateIds = manifest.templates.map((row) => row.templateId)
let auditRows = []
let provenanceRows = []
const reviewById = new Map(review.reviews.map((row) => [row.templateId, row]))

if (b2?.status === 'READY_FOR_B3') {
  const env = { ...process.env }
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase URL and service role key are required.')
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const [templatesResult, auditsResult, provenanceResult] = await Promise.all([
    client.from('document_packet_templates').select('id, packet_type, status, is_active, metadata_json').in('id', templateIds),
    client.from('document_packet_template_audit').select('id, template_id, event_type, actor_role, event_payload_json, created_at').in('template_id', templateIds).eq('event_type', 'legal_counsel_approval_applied').order('created_at', { ascending: false }),
    client.from('document_packet_template_release_provenance_phase4').select('template_id, audit_event_id, content_digest, review_evidence_digest, b1_manifest_digest, review_reference, reviewed_by, reviewed_at, b3_applied_at, b3_applied_by, b3_application_reference, release_contract').in('template_id', templateIds).eq('release_contract', PHASE4_B3_RELEASE_CONTRACT),
  ])
  if (templatesResult.error) throw templatesResult.error
  if (auditsResult.error) throw auditsResult.error
  if (provenanceResult.error) throw provenanceResult.error
  auditRows = auditsResult.data || []
  provenanceRows = provenanceResult.data || []
  const templateById = new Map((templatesResult.data || []).map((row) => [row.id, row]))
  const iso = (value) => {
    const parsed = Date.parse(value || '')
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
  }
  for (const frozen of manifest.templates) {
    const template = templateById.get(frozen.templateId)
    const decision = reviewById.get(frozen.templateId)
    const metadata = template?.metadata_json || {}
    if (!template) blockers.push({ code: 'B3_TEMPLATE_MISSING', templateId: frozen.templateId })
    else if (metadata.legal_review_status !== 'approved'
      || metadata.legal_approval_content_digest !== frozen.contentDigest
      || metadata.legal_counsel_review_evidence_digest !== (decision ? digest(decision) : null)
      || metadata.legal_b1_manifest_digest !== manifest.manifestDigest
      || metadata.legal_phase4_b3_release_contract !== PHASE4_B3_RELEASE_CONTRACT
      || !iso(metadata.legal_b3_applied_at)
      || !metadata.legal_b3_applied_by
      || !metadata.legal_b3_application_reference
      || metadata.legal_approved_by !== decision?.reviewedBy
      || metadata.legal_approval_reference !== decision?.reviewReference
      || iso(metadata.legal_approved_at) !== iso(decision?.reviewedAt)) blockers.push({ code: 'B3_RUNTIME_APPROVAL_MISSING_OR_STALE', templateId: frozen.templateId })
    const matchingAudit = auditRows.some((row) => {
      const payload = row.event_payload_json || {}
      const matchingProvenance = provenanceRows.some((provenance) => (
        provenance.template_id === frozen.templateId
        && provenance.audit_event_id === row.id
        && provenance.content_digest === frozen.contentDigest
        && provenance.review_evidence_digest === (decision ? digest(decision) : null)
        && provenance.b1_manifest_digest === manifest.manifestDigest
        && provenance.review_reference === decision?.reviewReference
        && provenance.reviewed_by === decision?.reviewedBy
        && iso(provenance.reviewed_at) === iso(decision?.reviewedAt)
        && provenance.b3_applied_by === metadata.legal_b3_applied_by
        && provenance.b3_application_reference === metadata.legal_b3_application_reference
        && provenance.release_contract === PHASE4_B3_RELEASE_CONTRACT
        && iso(provenance.b3_applied_at) === iso(metadata.legal_b3_applied_at)
      ))
      return matchingProvenance
        && row.template_id === frozen.templateId
        && payload.contentDigest === frozen.contentDigest
        && payload.reviewEvidenceDigest === (decision ? digest(decision) : null)
        && payload.b1ManifestDigest === manifest.manifestDigest
        && payload.reviewReference === decision?.reviewReference
        && payload.reviewedBy === decision?.reviewedBy
        && iso(payload.reviewedAt) === iso(decision?.reviewedAt)
        && payload.b3AppliedBy === metadata.legal_b3_applied_by
        && payload.b3ApplicationReference === metadata.legal_b3_application_reference
        && payload.phase4B3ReleaseContract === PHASE4_B3_RELEASE_CONTRACT
        && row.actor_role === 'service_role'
        && iso(row.created_at) === iso(metadata.legal_b3_applied_at)
    })
    if (!matchingAudit) blockers.push({ code: 'B3_APPROVAL_AUDIT_MISSING', templateId: frozen.templateId })
  }
}

const solutionByCode = {
  B3_B2_VERIFICATION_UNAVAILABLE: 'Restore B2 verification before applying runtime approvals.',
  B3_RUNTIME_APPROVAL_MISSING_OR_STALE: 'After B2 is approved, run the guarded atomic B3 batch operator.',
  B3_APPROVAL_AUDIT_MISSING: 'Apply approvals through the B3 RPC so each template receives explicit audit evidence.',
}
const uniqueBlockers = [...new Map(blockers.map((item) => [`${item.code}:${item.templateId || ''}`, item])).values()]
console.log(JSON.stringify({ phase: 'B3', status: uniqueBlockers.length ? 'NO_GO' : 'READY_FOR_RELEASE_GATES', blockerCount: uniqueBlockers.length, blockers: uniqueBlockers.map((item) => ({ ...item, solution: solutionByCode[item.code] || item.solution || 'Resolve the upstream B2/B3 evidence blocker.' })), b2Status: b2?.status || 'UNAVAILABLE', templateIds, auditCount: auditRows.length, protectedProvenanceCount: provenanceRows.length, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (uniqueBlockers.length) process.exitCode = 1
