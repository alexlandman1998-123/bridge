import assert from 'node:assert/strict'

import {
  CONTROLLED_BOND_ORIGINATOR_HANDOFF_VERSION,
  buildControlledBondOriginatorHandoffIdentity,
  hashBondApplicationSnapshot,
  prepareControlledBondOriginatorHandoff,
  recordControlledBondOriginatorHandoffReceipt,
} from '../../application/index.js'

const snapshot = {
  snapshotSchemaVersion: '3',
  submissionVersion: 1,
  transaction: { id: 'transaction-phase-6', reference: 'TX-P6' },
  property: { developmentName: 'Example Estate', unitNumber: 'A1' },
  finance: { purchasePrice: '2000000', depositAmount: '200000', requestedBondAmount: '1800000' },
  application: { applicantStructure: 'sole', selectedBankIds: ['bank-1'] },
  participants: [{
    participantKey: 'primary_applicant:1',
    role: 'primary_applicant',
    answers: {
      personal: { first_name: 'Nomsa', surname: 'Dlamini', identity_number: '9001010000000' },
      contact: { email: 'nomsa@example.test', phone: '+27110000000' },
      employment: { occupation_status: 'permanent_employee', employer_name: 'Example Employer' },
      expenses: { gross_salary: '50000' },
    },
    declarations: [{ declarationKey: 'privacy_consent', version: '1', acceptedAt: '2026-08-28T09:00:00Z' }],
  }],
  documentManifest: [{
    participantKey: 'primary_applicant:1',
    participantRole: 'primary_applicant',
    requirementKey: 'primary_applicant:1:identity',
    canonicalDocumentType: 'buyer_id_document',
    matchedDocumentId: 'document-1',
  }],
  signerManifest: [{ participantKey: 'primary_applicant:1', participantRole: 'primary_applicant', status: 'completed' }],
  source: { reviewContextHash: 'review-phase-6' },
  versions: { flowVersion: 'phase-7-v1' },
}
const snapshotHash = await hashBondApplicationSnapshot(snapshot)
const submission = {
  id: 'submission-phase-6',
  transaction_id: 'transaction-phase-6',
  bond_application_id: 'application-phase-6',
  status: 'submitted',
  snapshot_json: snapshot,
  snapshot_hash: snapshotHash,
  source_application_revision: 3,
}
const normalizedApplication = { id: 'application-phase-6', revision: 3, activeSubmissionId: 'submission-phase-6', revisionStatus: 'none' }
const packManifest = { version: 'phase-5-v1', status: 'ready', ready: true, fingerprint: 'phase-5-v1:pack-fingerprint', transactionId: 'transaction-phase-6' }
const applicationState = { participantEntityCompleteness: { complete: true, blockingIssues: [] } }
const recipient = { id: 'originator-1', name: 'Example Home Loans' }

const identity = buildControlledBondOriginatorHandoffIdentity({ packManifest, submission, originatorRecipient: recipient, normalizedApplication })
assert.equal(CONTROLLED_BOND_ORIGINATOR_HANDOFF_VERSION, 'phase-6-v1')
assert.match(identity.idempotencyKey, /^phase-6-v1:/)
assert.equal(identity.applicationRevision, 3)

const prepared = await prepareControlledBondOriginatorHandoff({
  applicationState,
  packManifest,
  submission,
  normalizedApplication,
  originatorRecipient: recipient,
  generatedAt: '2026-08-28T10:00:00Z',
})
assert.equal(prepared.ok, true)
assert.equal(prepared.package.status, 'ready_for_originator')
assert.equal(prepared.package.idempotencyKey, identity.idempotencyKey)
assert.equal(prepared.package.controlledHandoff.packFingerprint, packManifest.fingerprint)
assert.equal(prepared.package.controlledHandoff.automaticBankSubmission, false)
assert.equal(prepared.package.controlledHandoff.networkDeliveryPerformed, false)

const repeated = await prepareControlledBondOriginatorHandoff({
  applicationState,
  packManifest,
  submission,
  normalizedApplication,
  originatorRecipient: recipient,
  existingPackage: prepared.package,
})
assert.equal(repeated.ok, true)
assert.equal(repeated.idempotent, true)

const staleSubmission = { ...submission, snapshot_hash: `changed-${snapshotHash}` }
const stale = await prepareControlledBondOriginatorHandoff({
  applicationState,
  packManifest: { ...packManifest, fingerprint: 'phase-5-v1:new-pack' },
  submission: staleSubmission,
  normalizedApplication: { ...normalizedApplication, revision: 4 },
  originatorRecipient: recipient,
  existingPackage: prepared.package,
})
assert.equal(stale.ok, false)
assert.ok(stale.issues.some((item) => item.code === 'stale_active_handoff_requires_supersession'))

const blocked = await prepareControlledBondOriginatorHandoff({
  applicationState,
  packManifest: { ...packManifest, ready: false, status: 'draft_with_blockers' },
  submission,
  normalizedApplication,
  originatorRecipient: {},
})
assert.equal(blocked.ok, false)
assert.ok(blocked.issues.some((item) => item.code === 'originator_pack_not_ready'))
assert.ok(blocked.issues.some((item) => item.code === 'originator_recipient_id_required'))

const receipt = recordControlledBondOriginatorHandoffReceipt({
  exportPackage: { ...prepared.package, id: 'package-phase-6' },
  packManifest,
  acceptedBy: 'originator-user-1',
  acceptedAt: '2026-08-28T10:05:00Z',
})
assert.equal(receipt.ok, true)
assert.equal(receipt.receipt.networkDeliveryPerformed, false)
assert.equal(receipt.receipt.automaticBankSubmission, false)
assert.equal(receipt.receipt.sensitivePayloadIncluded, false)

const repeatedReceipt = recordControlledBondOriginatorHandoffReceipt({
  exportPackage: { ...prepared.package, id: 'package-phase-6' },
  packManifest,
  existingReceipt: receipt.receipt,
})
assert.equal(repeatedReceipt.idempotent, true)
assert.deepEqual(repeatedReceipt.receipt, receipt.receipt)

console.log('Phase 6 controlled bond originator handoff passed')
