// @vitest-environment node
import { expect, it } from 'vitest'
import { assessBondBankSubmission } from '../submission/bondBankSubmissionAssessment.js'
import { getBondSubmissionReleaseGate } from '../../../../../server/services/bond/bondSubmissionReleaseGate.js'
const fixture = (joint = false) => {
  const signers = [{ participantKey: 'primary:1', fullName: 'Primary Buyer' }, ...(joint ? [{ participantKey: 'co:1', fullName: 'Joint Buyer' }] : [])]
  const plan = { ready: true, issues: [], rows: [], snapshot: { selectedBanks: ['fixture-bank'], signerManifest: signers, participants: signers }, submission: { id: 'sub', metadata: { signingMethod: 'wet_ink_upload', signatureChecks: { versionMatches: true, allPagesPresent: true, noAlterations: true, signers: signers.map(s => ({ participantKey: s.participantKey, signaturePresent: true, identityChecked: true, signedDate: '2026-10-03' })) } } } }
  return { plan, reviewContext: { contextHash: 'hash', review: { current: true, submission_id: 'sub', context_hash: 'hash' } }, releaseGate: { version: 'FIXTURE-ONLY', ready: true, methods: { wet_ink_upload: true }, blockers: [] } }
}
it('requires complete information, approved documents, every signature, current consultant review and release evidence', () => {
  const input = fixture(true)
  expect(assessBondBankSubmission(input).ready).toBe(true)
  input.plan.rows.push({ title: 'Income proof', status: 'Awaiting review', outstanding: true })
  expect(assessBondBankSubmission(input).ready).toBe(false)
  input.plan.rows = []
  input.plan.submission.metadata.signatureChecks.signers.pop()
  expect(assessBondBankSubmission(input).issues.some(i => i.code === 'applicant_signature_unverified')).toBe(true)
})
it('invalidates review after changes and never treats optional marketing or documents as required', () => {
  const input = fixture()
  input.plan.rows.push({ title: 'Optional extra', outstanding: true, blocking: false })
  expect(assessBondBankSubmission(input).ready).toBe(true)
  input.reviewContext.review.current = false
  expect(assessBondBankSubmission(input)).toMatchObject({ ready: false, applicationComplete: false })
  input.reviewContext.review.current = true; input.reviewContext.review.submission_id = 'old'
  expect(assessBondBankSubmission(input).ready).toBe(false)
})
it('keeps a complete reviewed application blocked when approvals or the live pilot are missing', () => {
  const input = fixture()
  input.releaseGate = getBondSubmissionReleaseGate()
  expect(assessBondBankSubmission(input)).toMatchObject({ ready: false, applicationComplete: true, status: 'release_blocked' })
  expect(input.releaseGate.methods.online).toBe(false)
  expect(input.releaseGate.methods.wet_ink_upload).toBe(false)
})
it('fails closed for missing gates, mismatched review hashes, incomplete signer manifests and unsigned evidence', () => {
  const input = fixture()
  expect(assessBondBankSubmission({ ...input, releaseGate: undefined }).ready).toBe(false)
  input.reviewContext.contextHash = 'changed'
  expect(assessBondBankSubmission(input).ready).toBe(false)
  input.plan.snapshot.signerManifest = []
  expect(assessBondBankSubmission(input).issues.some(i => i.code === 'signer_manifest_incomplete')).toBe(true)
})
it('rejects unconnected online signing and nonboolean signature confirmations', () => {
  const input = fixture()
  input.plan.submission.metadata.signingMethod = 'online'
  input.releaseGate.methods.online = true
  expect(assessBondBankSubmission(input).ready).toBe(false)
  input.plan.submission.metadata.signingMethod = 'wet_ink_upload'
  input.plan.submission.metadata.signatureChecks.signers[0].signaturePresent = 'false'
  expect(assessBondBankSubmission(input).ready).toBe(false)
})
it('blocks unverified completeness and pending external statement receipt even if ordinary uploads exist', () => {
  const input = fixture()
  input.plan.ready = false
  expect(assessBondBankSubmission(input).ready).toBe(false)
  input.plan.ready = true
  input.plan.rows = [{ title: 'Bank statements', external: true, outstanding: true, status: 'Secure handoff not connected' }]
  expect(assessBondBankSubmission(input).ready).toBe(false)
})

import handler from '../../../../../api/public/bond-submission-release.js'
import { fetchBondSubmissionReleaseGate } from '../../../../services/bondSubmissionPackService.js'
it('ignores browser approval flags and keeps the server release endpoint read-only', () => {
  const res = { setHeader() {}, status(code) { this.code = code; return this }, json(body) { this.body = body; return body } }
  handler({ method: 'GET', query: { approved: true }, body: { ready: true } }, res)
  expect(res.body.ready).toBe(false)
  handler({ method: 'POST', body: { ready: true } }, res)
  expect(res.code).toBe(405)
})
it('keeps bank submission blocked when the release endpoint is unavailable or invalid', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response('not-json')
    expect(await fetchBondSubmissionReleaseGate()).toMatchObject({ ready: false, blockers: [{ code: 'release_assessment_unavailable' }] })
    globalThis.fetch = async () => new Response('{}', { status: 503 })
    expect((await fetchBondSubmissionReleaseGate()).ready).toBe(false)
  } finally { globalThis.fetch = original }
})
