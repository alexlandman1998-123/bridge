import assert from 'node:assert/strict'
import fs from 'node:fs'
import { inspectDocx } from './legal-document-phase-c1-source.mjs'

const restore = fs.readFileSync('scripts/legal-document-phase-c1-restore.mjs', 'utf8')
const verify = fs.readFileSync('scripts/legal-document-phase-c1-verify.mjs', 'utf8')
const helper = fs.readFileSync('scripts/legal-document-phase-c1-source.mjs', 'utf8')
const fingerprint = fs.readFileSync('scripts/legal-document-review-fingerprint.mjs', 'utf8')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))

const otp = inspectDocx(fs.readFileSync('assets/legal-templates/otp_default_v1.docx'))
assert.equal(otp.valid, true)
assert.ok(otp.byteLength > 100)
assert.match(otp.sha256, /^[0-9a-f]{64}$/)
assert.throws(() => inspectDocx(Buffer.from('not a docx')), /empty or truncated|valid DOCX/)

for (const guard of ['LEGAL_DOCUMENT_PHASE_C1_WRITE', 'confirm-project-ref', 'confirm-bucket', 'confirm-path', 'confirm-template-ids', 'confirm-sha256', 'applied-by', 'reference']) assert.match(restore, new RegExp(guard))
assert.match(restore, /upsert: false/)
assert.doesNotMatch(restore, /\.update\(|\.upsert\(|\.delete\(/)
assert.match(restore, /verified\.sha256 !== candidate\.sha256/)
assert.match(verify, /READY_FOR_B1_REFREEZE/)
assert.match(verify, /C1_SOURCE_MISSING/)
assert.match(helper, /word\/document\.xml/)
for (const key of ['legal_counsel_review_evidence_digest', 'legal_b1_manifest_digest', 'legal_b3_applied_at']) assert.match(fingerprint, new RegExp(key))
for (const name of ['test:legal-documents-phase-c1', 'restore:legal-documents:phase-c1', 'verify:legal-documents:phase-c1']) assert.ok(pkg.scripts?.[name], `Missing package script ${name}`)

console.log('Legal document C1 source-recovery contract passed.')
