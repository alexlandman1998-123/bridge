import assert from 'node:assert/strict'
import fs from 'node:fs'
import { sha256, stableJson } from './legal-document-review-fingerprint.mjs'

const manifest = JSON.parse(fs.readFileSync('config/legal-document-review-manifest.json', 'utf8'))
const fingerprint = fs.readFileSync('scripts/legal-document-review-fingerprint.mjs', 'utf8')
const freeze = fs.readFileSync('scripts/legal-document-phase-b1-freeze.mjs', 'utf8')
const verify = fs.readFileSync('scripts/legal-document-phase-b1-verify.mjs', 'utf8')
const approval = fs.readFileSync('scripts/legal-document-template-approval.mjs', 'utf8')
const runtimeApproval = fs.readFileSync('src/core/documents/legalTemplateApproval.js', 'utf8')
const a2 = fs.readFileSync('scripts/legal-document-phase-a2-readiness.mjs', 'utf8')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))

assert.equal(stableJson({ z: 1, a: { d: 2, c: 3 } }), '{"a":{"c":3,"d":2},"z":1}')
assert.equal(sha256('bridge9'), 'b6756ed8cc22e0c850948a01648a45a501ef1880893dd56809979400a2c02d90')
assert.equal(manifest.phase, 'B1')
assert.equal(manifest.status, 'frozen_for_counsel_review')
assert.equal(manifest.digestAlgorithm, 'sha256')
assert.ok(manifest.candidateOrganisationIds.length)
assert.ok(manifest.templates.length >= 3)
assert.equal(new Set(manifest.templates.map((row) => row.templateId)).size, manifest.templates.length)
for (const row of manifest.templates) {
  assert.match(row.contentDigest, /^sha256:[0-9a-f]{64}$/)
  assert.match(row.sectionsSha256, /^[0-9a-f]{64}$/)
  if (row.sourceAvailable) assert.match(row.sourceSha256, /^[0-9a-f]{64}$/)
}
assert.match(fingerprint, /EXCLUDED_METADATA_KEYS/)
assert.match(fingerprint, /legal_approval_content_digest/)
assert.doesNotMatch(freeze, /writeFileSync|\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
assert.doesNotMatch(verify, /writeFileSync|\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
assert.match(verify, /B1_TEMPLATE_CONTENT_DRIFT/)
assert.match(verify, /B1_MANIFEST_DIGEST_MISMATCH/)
assert.match(verify, /B1_UNREVIEWED_ROUTABLE_TEMPLATE/)
assert.match(verify, /B1_TEMPLATE_SOURCE_UNREADABLE/)
assert.match(approval, /confirm-content-digest/)
assert.match(approval, /manifestEntry\.sourceAvailable/)
assert.match(runtimeApproval, /LEGAL_APPROVAL_CONTENT_DIGEST_MISSING/)
assert.match(a2, /legal-document-phase-b1-verify\.mjs/)
assert.ok(pkg.scripts['test:legal-documents-phase-b1'])
assert.ok(pkg.scripts['freeze:legal-documents:phase-b1'])
assert.ok(pkg.scripts['verify:legal-documents:phase-b1'])

console.log('Legal document Phase B1 immutable review-freeze contract passed')
