import assert from 'node:assert/strict'
import fs from 'node:fs'

const manifest = JSON.parse(fs.readFileSync('config/legal-document-review-manifest.json', 'utf8'))
const review = JSON.parse(fs.readFileSync('config/legal-document-counsel-review.json', 'utf8'))
const dossier = fs.readFileSync('scripts/legal-document-phase-b2-review-dossier.mjs', 'utf8')
const record = fs.readFileSync('scripts/legal-document-phase-b2-record-decision.mjs', 'utf8')
const verify = fs.readFileSync('scripts/legal-document-phase-b2-verify.mjs', 'utf8')
const approval = fs.readFileSync('scripts/legal-document-template-approval.mjs', 'utf8')
const runtimeApproval = fs.readFileSync('src/core/documents/legalTemplateApproval.js', 'utf8')
const a2 = fs.readFileSync('scripts/legal-document-phase-a2-readiness.mjs', 'utf8')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))

assert.equal(review.phase, 'B2')
assert.equal(review.projectRef, manifest.projectRef)
assert.equal(review.b1ManifestDigest, manifest.manifestDigest)
assert.deepEqual(new Set(review.reviews.map((row) => row.templateId)), new Set(manifest.templates.map((row) => row.templateId)))
for (const item of review.reviews) {
  const frozen = manifest.templates.find((row) => row.templateId === item.templateId)
  assert.equal(item.contentDigest, frozen.contentDigest)
  assert.ok(['pending', 'approved', 'changes_requested', 'rejected'].includes(item.decision))
}
assert.match(dossier, /Do not approve a section-only fingerprint/)
assert.doesNotMatch(dossier, /writeFileSync|\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
assert.match(record, /LEGAL_DOCUMENT_COUNSEL_REVIEW_WRITE/)
assert.match(record, /confirm-content-digest/)
assert.match(record, /confirm-project-ref/)
assert.match(record, /manifestEntry\.sourceAvailable/)
assert.match(verify, /B2_COUNSEL_REVIEW_PENDING/)
assert.match(verify, /B2_COUNSEL_CHANGES_REQUESTED/)
assert.match(verify, /READY_FOR_B3/)
assert.match(approval, /reviewEntry\?\.decision/)
assert.match(approval, /legal_counsel_review_evidence_digest/)
assert.match(runtimeApproval, /LEGAL_COUNSEL_REVIEW_EVIDENCE_MISSING/)
assert.match(a2, /legal-document-phase-b2-verify\.mjs/)
for (const name of ['test:legal-documents-phase-b2', 'prepare:legal-documents:phase-b2', 'record:legal-documents:phase-b2', 'verify:legal-documents:phase-b2']) assert.ok(pkg.scripts[name], `Missing package script ${name}`)

console.log('Legal document Phase B2 accountable counsel-review contract passed')
