import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const manifest = JSON.parse(fs.readFileSync('config/legal-document-review-manifest.json', 'utf8'))
const review = JSON.parse(fs.readFileSync('config/legal-document-counsel-review.json', 'utf8'))
const b1Run = spawnSync(process.execPath, ['scripts/legal-document-phase-b1-verify.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024 })
let b1 = null
try { b1 = JSON.parse(b1Run.stdout) } catch {}
const blockers = [...(b1?.blockers || [{ code: 'B2_B1_VERIFICATION_UNAVAILABLE' }])]
if (review.projectRef !== manifest.projectRef) blockers.push({ code: 'B2_PROJECT_REF_MISMATCH' })
if (review.b1ManifestDigest !== manifest.manifestDigest) blockers.push({ code: 'B2_MANIFEST_DIGEST_MISMATCH' })
const reviews = new Map((review.reviews || []).map((row) => [row.templateId, row]))
const manifestIds = new Set((manifest.templates || []).map((row) => row.templateId))

for (const template of manifest.templates || []) {
  const decision = reviews.get(template.templateId)
  if (!decision) {
    blockers.push({ code: 'B2_REVIEW_RECORD_MISSING', templateId: template.templateId })
    continue
  }
  if (decision.contentDigest !== template.contentDigest) blockers.push({ code: 'B2_REVIEW_DIGEST_MISMATCH', templateId: template.templateId })
  if (decision.decision === 'pending') blockers.push({ code: 'B2_COUNSEL_REVIEW_PENDING', templateId: template.templateId })
  if (decision.decision === 'changes_requested') blockers.push({ code: 'B2_COUNSEL_CHANGES_REQUESTED', templateId: template.templateId })
  if (decision.decision === 'rejected') blockers.push({ code: 'B2_COUNSEL_REJECTED', templateId: template.templateId })
  if (decision.decision === 'approved' && (!decision.reviewedBy || !decision.reviewedAt || !Number.isFinite(Date.parse(decision.reviewedAt)) || !decision.reviewReference)) blockers.push({ code: 'B2_COUNSEL_EVIDENCE_INCOMPLETE', templateId: template.templateId })
}
for (const templateId of reviews.keys()) if (!manifestIds.has(templateId)) blockers.push({ code: 'B2_REVIEW_TEMPLATE_NOT_IN_MANIFEST', templateId })

const solutionByCode = {
  B1_TEMPLATE_SOURCE_UNREADABLE: 'Restore or deliberately replace the exact template source and regenerate B1 before counsel review.',
  B2_COUNSEL_REVIEW_PENDING: 'Have counsel review the exact frozen source and record an accountable decision against its digest.',
  B2_COUNSEL_CHANGES_REQUESTED: 'Revise the template, publish a new version, regenerate B1, and restart B2 review.',
  B2_COUNSEL_REJECTED: 'Do not approve or activate this template; replace it and restart B1/B2.',
  B2_REVIEW_DIGEST_MISMATCH: 'Discard the stale review record and repeat review against the current B1 digest.',
  B2_COUNSEL_EVIDENCE_INCOMPLETE: 'Record counsel identity, actual review timestamp, and review evidence reference.',
}
const uniqueBlockers = [...new Map(blockers.map((item) => [`${item.code}:${item.templateId || ''}`, item])).values()]
console.log(JSON.stringify({
  phase: 'B2',
  status: uniqueBlockers.length ? 'NO_GO' : 'READY_FOR_B3',
  blockerCount: uniqueBlockers.length,
  blockers: uniqueBlockers.map((item) => ({ ...item, solution: solutionByCode[item.code] || 'Resolve the B2 evidence mismatch and rerun verification.' })),
  b1Status: b1?.status || 'UNAVAILABLE',
  reviewStatus: review.status,
  decisions: (review.reviews || []).map((row) => ({ templateId: row.templateId, packetType: row.packetType, contentDigest: row.contentDigest, decision: row.decision, reviewedBy: row.reviewedBy, reviewedAt: row.reviewedAt, reviewReference: row.reviewReference })),
  checkedAt: new Date().toISOString(),
  mutatedData: false,
}, null, 2))
if (uniqueBlockers.length) process.exitCode = 1
