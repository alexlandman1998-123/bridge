import assert from 'node:assert/strict'
import { isBondCorrectionResubmission } from '../submission/bondApplicationCorrection.js'
import { createEmptyBondApplicationState } from '../bondApplicationState.js'
import { buildNormalizedBondApplicationFromState, saveNormalizedBondApplicationSection } from '../participants/bondApplicationParticipantDomain.js'

const application = { activeChangeRequestId: 'correction', revisionBaseSubmissionId: 'signed-1', transactionId: 'transaction', revision: 3 }
const signed = { id: 'signed-1', transaction_id: 'transaction', source_application_revision: 2, status: 'submitted' }
assert.equal(isBondCorrectionResubmission(application, signed), true)
for (const patch of [{ activeChangeRequestId: null }, { revision: 2 }, { revisionBaseSubmissionId: 'other' }, { transactionId: 'other' }]) {
  assert.equal(isBondCorrectionResubmission({ ...application, ...patch }, signed), false)
}
assert.equal(isBondCorrectionResubmission(application, { ...signed, status: 'awaiting_signature' }), false)
const normalized = buildNormalizedBondApplicationFromState({ applicationState: createEmptyBondApplicationState(), includeCoApplicant: true })
normalized.metadata.revisionStatus = 'revision_in_progress'
normalized.metadata.revisionEditScope = { allSections: true }
const [primary, coApplicant] = normalized.participants
const privateCoApplicant = structuredClone(normalized.participantSections[coApplicant.participantKey])
const saved = saveNormalizedBondApplicationSection({ normalizedApplication: normalized, participantKey: primary.participantKey, sectionKey: 'personal_contact', answers: { first_name: 'Corrected' } })
assert.equal(saved.ok, true)
assert.equal(saved.normalizedApplication.revision, normalized.revision + 1)
assert.deepEqual(saved.normalizedApplication.participantSections[coApplicant.participantKey], privateCoApplicant)
assert.notDeepEqual(saved.normalizedApplication.participantSections[primary.participantKey], normalized.participantSections[primary.participantKey])
console.log('Application correction: explicit base version, transaction isolation, revision advancement and participant answer preservation passed')
