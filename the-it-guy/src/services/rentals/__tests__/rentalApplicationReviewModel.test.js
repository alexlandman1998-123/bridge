import { expect, it } from 'vitest'
import { rentalApplicationApprovalReadiness, rentalReviewSubjects, rentalReviewDocument, RENTAL_REVIEW_CHECKS } from '../rentalApplicationReviewModel.js'
import { rentalApplicationDocumentSlots } from '../rentalApplicationWizardModel.js'
const submittedAt = '2026-10-02T12:00:00.000Z'
function readyApplication(type = 'individual') {
  const data = { entity: { type, legalName: 'Tenant Entity' }, identity: { firstName: 'Alex' }, people: type === 'individual' ? [] : [{ id: 'co-1', firstName: 'Jo', role: 'co_tenant' }, { id: 'guarantor-1', firstName: 'Sam', role: 'guarantor' }], review: { landlordDecision: { outcome: 'approved', submissionAt: submittedAt, recordedBy: 'reviewer' } } }
  const documents = rentalApplicationDocumentSlots(data).filter((slot) => slot.required).map((slot, index) => ({ id: `doc-${index}`, type: slot.type, status: 'accepted', uploaded_at: submittedAt, slot }))
  data.documentLinks = documents.map((doc) => ({ documentId: doc.id, subjectId: doc.slot.subjectId, purpose: doc.slot.purpose }))
  const application = { data, status: 'under_review', submittedAt, documents, consents: ['privacy', 'credit_check', 'identity_verification'].map((type) => ({ type, source: 'applicant', evidence: { accepted: true, submitted_at: '2026-10-02T12:00:00+00:00' } })) }
  const checks = RENTAL_REVIEW_CHECKS.map((checkType) => ({ checkType, result: { subjects: Object.fromEntries(rentalReviewSubjects(data, checkType).map((subject) => [subject.id, { status: 'passed', reviewedBy: 'reviewer', evidenceNote: 'Original evidence checked', submissionAt: '2026-10-02T12:00:00+00:00', expiresAt: '2026-10-31' }])) } }))
  return { application, checks }
}
it('requires every applicable document, person and entity check for all applicant scenarios', () => {
  for (const type of ['individual','joint_individuals','company','close_corporation','trust']) {
    const { application, checks } = readyApplication(type)
    expect(rentalApplicationApprovalReadiness(application, checks, '2026-10-02').ready).toBe(true)
    application.documents[0].status = 'uploaded'
    expect(rentalApplicationApprovalReadiness(application, checks, '2026-10-02').blockers.join(' ')).toContain('Accept')
  }
})
it('blocks expired checks, missing evidence, stale consents and stale landlord approval', () => {
  const { application, checks } = readyApplication('joint_individuals')
  checks[0].result.subjects['guarantor-1'].expiresAt = '2026-10-01'
  checks[1].result.subjects.primary.evidenceNote = ''
  application.consents[0].evidence.submitted_at = '2026-10-01T12:00:00Z'
  application.data.review.landlordDecision.submissionAt = '2026-10-01T12:00:00Z'
  const { blockers } = rentalApplicationApprovalReadiness(application, checks, '2026-10-02')
  expect(blockers).toHaveLength(4)
  expect(blockers.join(' ')).toContain('Sam')
})
it('does not fall back to older accepted evidence when the latest document was rejected', () => {
  const { application, checks } = readyApplication()
  const slot = rentalApplicationDocumentSlots(application.data)[0]
  application.documents.unshift({ id: 'replacement', type: 'identity', status: 'rejected', uploaded_at: '2026-10-03T12:00:00Z' })
  application.data.documentLinks.push({ documentId: 'replacement', subjectId: 'primary', purpose: 'identity' })
  expect(rentalReviewDocument(slot, application).id).toBe('replacement')
  expect(rentalApplicationApprovalReadiness(application, checks, '2026-10-03').ready).toBe(false)
})
it('checks representatives for identity and FICA but only financial contributors for income', () => {
  const data = { entity: { type: 'company' }, people: [{ id: 'signer', role: 'authorised_signatory' }, { id: 'support', role: 'guarantor' }] }
  expect(rentalReviewSubjects(data, 'identity').map((item) => item.id)).toEqual(['primary','signer','support'])
  expect(rentalReviewSubjects(data, 'employment').map((item) => item.id)).toEqual(['entity','support'])
})
