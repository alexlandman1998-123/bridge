import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentLaunchCertification, LEGAL_DOCUMENT_L1_DOMAIN_REQUIREMENTS } from '../src/core/documents/legalDocumentLaunchCertification.js'

const domains = {
  activation: { status: 'HEALTHY', blockers: [] },
  approval: { status: 'READY_FOR_RELEASE_GATES', blockers: [] },
  rendering: { status: 'READY_FOR_B1_REFREEZE', blockers: [] },
  capacity: { status: 'READY_FOR_J1', blockers: [] },
  lifecycle: { status: 'READY_FOR_L1', blockers: [] },
}
assert.deepEqual(LEGAL_DOCUMENT_L1_DOMAIN_REQUIREMENTS, { activation: 'HEALTHY', approval: 'READY_FOR_RELEASE_GATES', rendering: 'READY_FOR_B1_REFREEZE', capacity: 'READY_FOR_J1', lifecycle: 'READY_FOR_L1' })
assert.equal(assessLegalDocumentLaunchCertification({ domains, coverage: { otp: true, mandate: true } }).ready, true)
const approvalBlocked = assessLegalDocumentLaunchCertification({ domains: { ...domains, approval: { status: 'NO_GO', blockers: [{ code: 'B3_APPROVAL_AUDIT_MISSING', detail: 'otp', solution: 'Apply approval through B3.' }] } }, coverage: { otp: true, mandate: true } })
assert.deepEqual(approvalBlocked.blockers[0], { domain: 'approval', code: 'B3_APPROVAL_AUDIT_MISSING', detail: 'otp', solution: 'Apply approval through B3.' })
const uncovered = assessLegalDocumentLaunchCertification({ domains, coverage: { otp: false, mandate: false } })
assert.ok(uncovered.blockers.some((row) => row.code === 'L1_OTP_JOURNEY_UNPROVEN'))
assert.ok(uncovered.blockers.some((row) => row.code === 'L1_MANDATE_JOURNEY_UNPROVEN'))
const unavailable = assessLegalDocumentLaunchCertification({ domains: {}, coverage: { otp: true, mandate: true } })
assert.equal(unavailable.domainResults.length, 5)
assert.ok(unavailable.blockers.every((row) => row.solution))
const verifier = fs.readFileSync('scripts/legal-document-phase-l1-launch-certification.mjs', 'utf8')
for (const script of ['legal-document-phase-a3-verify.mjs', 'legal-document-phase-b3-verify.mjs', 'legal-document-phase-c2-verify.mjs', 'legal-document-phase-i3-backpressure.mjs', 'legal-document-phase-k3-support-sla.mjs']) assert.ok(verifier.includes(script))
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-l1', 'verify:legal-documents:phase-l1']) assert.ok(pkg.scripts?.[name])
console.log('Legal document L1 consolidated launch certification passed.')
