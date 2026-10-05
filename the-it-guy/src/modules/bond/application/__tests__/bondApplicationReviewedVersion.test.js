import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sealBondReviewedVersion, assertBondReviewedVersionIntegrity, compareBondReviewedVersions, buildBondReviewedRevision, buildBondDocumentChangeRegister } from '../submission/bondApplicationReviewedVersion.js'
import { buildBondApplicationSubmissionSnapshot } from '../submission/buildBondApplicationSubmissionSnapshot.js'

function snapshot() {
  return {
    transaction: { id: 'transaction-1', reference: 'BOND-001' }, submissionVersion: 1,
    createdAt: '2026-10-03T18:00:00Z', property: { address: 'Sample property' },
    finance: { requestedBondAmount: 1000000 }, selectedBanks: ['bank-1'],
    participants: [{ participantKey: 'primary:1', answers: { income: 50000 } }, { participantKey: 'co:1', answers: { income: 30000 } }],
    signerManifest: [{ participantKey: 'primary:1', status: 'signed' }, { participantKey: 'co:1', status: 'signed' }],
    declarations: [{ key: 'authority', version: '1', text: 'I authorise Bank 1', accepted: true, acceptedAt: '2026-10-03T18:01:00Z' }],
    signatureEvidence: { dataUrl: 'fixture', confirmed: true },
    documentManifest: [{ requirementKey: 'payslip', documents: [{ id: 'doc-1', filePath: 'payslip.pdf', status: 'uploaded' }] }],
  }
}

test('seals numbered, referenced content without retaining aliases to the draft', async () => {
  const original = snapshot()
  const sealed = await sealBondReviewedVersion(original)
  original.participants[0].answers.income = 1
  assert.equal(sealed.participants[0].answers.income, 50000)
  assert.equal(sealed.reviewedVersion.reference, 'BOND-001-V1')
  assert.match(sealed.reviewedVersion.contentHash, /^[a-f0-9]{64}$/)
  assert.equal(await assertBondReviewedVersionIntegrity(sealed), true)
})

test('all material changes require fresh signatures, including permissions and bank selection', async () => {
  const sealed = await sealBondReviewedVersion(snapshot())
  for (const change of [
    (candidate) => { candidate.finance.requestedBondAmount = 2000000 },
    (candidate) => { candidate.participants[1].answers.income = 10000 },
    (candidate) => { candidate.selectedBanks.push('bank-2') },
    (candidate) => { candidate.declarations[0].text = 'New authority' },
    (candidate) => { candidate.declarations[0].accepted = false },
  ]) {
    const candidate = structuredClone(sealed)
    change(candidate)
    assert.equal((await compareBondReviewedVersions(sealed, candidate)).requiresFreshSignatures, true)
    await assert.rejects(assertBondReviewedVersionIntegrity(candidate), /changed/)
  }
})

test('signature events, source refresh and document review do not change signed content', async () => {
  const sealed = await sealBondReviewedVersion(snapshot())
  const candidate = structuredClone(sealed)
  candidate.signatureEvidence = { dataUrl: 'new fixture' }
  candidate.source = { sourceRevision: 99 }
  candidate.declarations[0].acceptedAt = '2026-10-03T19:00:00Z'
  candidate.signerManifest[0].status = 'pending'
  candidate.documentManifest[0].documents[0].status = 'approved'
  const result = await compareBondReviewedVersions(sealed, candidate)
  assert.equal(result.requiresFreshSignatures, false)
  assert.equal(result.requiresDocumentReview, true)
  // Even non-material baseline changes must never overwrite the stored snapshot.
  await assert.rejects(assertBondReviewedVersionIntegrity(candidate), /changed/)
  assert.equal(await assertBondReviewedVersionIntegrity(sealed), true)
})

test('revision preserves original and resets every signer and permission acceptance', async () => {
  const sealed = await sealBondReviewedVersion(snapshot())
  const original = JSON.stringify(sealed)
  const candidate = structuredClone(sealed)
  candidate.finance.requestedBondAmount = 1500000
  candidate.submissionVersion = 2
  candidate.createdAt = '2026-10-03T19:00:00Z'
  const revision = await buildBondReviewedRevision(sealed, candidate)
  assert.equal(revision.reviewedVersion.reference, 'BOND-001-V2')
  assert.equal(revision.signatureEvidence, null)
  assert.ok(revision.signerManifest.every((signer) => signer.status === 'pending'))
  assert.ok(revision.declarations.every((declaration) => declaration.accepted === false && declaration.acceptedAt === null))
  assert.equal(revision.source.previousReviewedContentHash, sealed.reviewedVersion.contentHash)
  assert.equal(await assertBondReviewedVersionIntegrity(revision), true)
  assert.equal(JSON.stringify(sealed), original)
})

test('cannot revise another transaction, skip a version or revise only document receipts', async () => {
  const sealed = await sealBondReviewedVersion(snapshot())
  const candidate = structuredClone(sealed)
  candidate.submissionVersion = 2
  candidate.documentManifest = []
  await assert.rejects(buildBondReviewedRevision(sealed, candidate), /Supporting-document/)
  candidate.finance.requestedBondAmount = 2
  candidate.submissionVersion = 3
  await assert.rejects(buildBondReviewedRevision(sealed, candidate), /advance/)
  candidate.transaction.id = 'another'
  await assert.rejects(buildBondReviewedRevision(sealed, candidate), /different transactions/)
})

test('document change register records later uploads and review changes separately', async () => {
  const sealed = await sealBondReviewedVersion(snapshot())
  const register = buildBondDocumentChangeRegister(sealed, { items: [{ requirement: { key: 'payslip' }, documents: [{ id: 'doc-1', file_path: 'payslip.pdf', review_status: 'approved' }, { id: 'doc-2', file_path: 'second.pdf', status: 'uploaded' }] }] })
  assert.deepEqual(register.changes.map((event) => event.type), ['review_status_changed', 'added_after_review'])
  assert.equal(register.requiresFreshSignatures, false)
  assert.equal(register.requiresDocumentReview, true)
  assert.equal(await assertBondReviewedVersionIntegrity(sealed), true)
})

test('snapshot builder copies caller-supplied participants and signers', () => {
  const participants = [{ answers: { income: 50000 } }]
  const signerManifest = [{ fullName: 'Sample Applicant' }]
  const built = buildBondApplicationSubmissionSnapshot({ participants, signerManifest })
  participants[0].answers.income = 1
  signerManifest[0].fullName = 'Changed'
  assert.equal(built.participants[0].answers.income, 50000)
  assert.equal(built.signerManifest[0].fullName, 'Sample Applicant')
})

test('resealing never blesses a modified frozen version or invalid numbering', async () => {
  const sealed = await sealBondReviewedVersion(snapshot())
  sealed.finance.requestedBondAmount = 5
  await assert.rejects(sealBondReviewedVersion(sealed), /changed/)
  await assert.rejects(sealBondReviewedVersion({ ...snapshot(), submissionVersion: 0 }), /numbered/)
})

test('joint schema freezes each permission and resets both applicants for a revision', async () => {
  const joint = snapshot()
  delete joint.transaction
  joint.application = { transactionId: 'transaction-1', revision: 1 }
  joint.participants.forEach((participant) => {
    participant.declarations = [{ key: 'authority', text: 'Fixture authority', accepted: true, acceptedAt: joint.createdAt }]
    participant.documents = []
  })
  const sealed = await sealBondReviewedVersion(joint)
  const candidate = structuredClone(sealed)
  candidate.application.revision++
  candidate.participants[0].documents = [{ id: 'later-file' }]
  assert.equal((await compareBondReviewedVersions(sealed, candidate)).requiresFreshSignatures, false)
  candidate.participants[1].declarations[0].text = 'Changed permission'
  candidate.submissionVersion = 2
  const revision = await buildBondReviewedRevision(sealed, candidate)
  assert.ok(revision.participants.every((participant) => participant.declarations[0].accepted === false))
  assert.equal(await assertBondReviewedVersionIntegrity(revision), true)
})
