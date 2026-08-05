import assert from 'node:assert/strict'
import {
  INFORMATION_SHEET_DOCUMENT_KEY,
  buildOnboardingInformationSheetCapture,
} from '../documentCaptureEvidence.js'

const sourceBackedCapture = buildOnboardingInformationSheetCapture({
  transaction: {
    id: 'tx-1',
  },
  onboarding: {
    id: 'onboarding-1',
  },
  formData: {
    purchaser_type: 'individual',
    finance_type: 'bond',
    full_name: 'Buyer Example',
    empty_value: '',
  },
  existingRequirement: {
    id: 'requirement-1',
    document_key: INFORMATION_SHEET_DOCUMENT_KEY,
    is_uploaded: true,
    uploaded_document_id: null,
  },
  capturedAt: '2026-08-05T10:00:00.000Z',
})

assert.equal(sourceBackedCapture.documentKey, INFORMATION_SHEET_DOCUMENT_KEY)
assert.equal(sourceBackedCapture.captureKind, 'source_backed_form')
assert.equal(sourceBackedCapture.status, 'completed')
assert.equal(sourceBackedCapture.isUploaded, false)
assert.equal(sourceBackedCapture.uploadedDocumentId, null)
assert.equal(sourceBackedCapture.requirementPatch.is_uploaded, false)
assert.equal(sourceBackedCapture.requirementPatch.status, 'completed')
assert.equal(sourceBackedCapture.requirementPatch.uploaded_document_id, null)
assert.equal(sourceBackedCapture.requirementPatch.uploaded_at, null)
assert.match(sourceBackedCapture.requirementPatch.notes, /No uploaded file artifact/i)
assert.equal(sourceBackedCapture.workflowEvidence.evidenceType, 'onboarding')
assert.equal(sourceBackedCapture.workflowEvidence.evidenceKey, INFORMATION_SHEET_DOCUMENT_KEY)
assert.equal(sourceBackedCapture.event.data.formFieldCount, 3)

const uploadedArtifactCapture = buildOnboardingInformationSheetCapture({
  transaction: {
    id: 'tx-2',
  },
  onboarding: {
    id: 'onboarding-2',
  },
  existingRequirement: {
    id: 'requirement-2',
    document_key: INFORMATION_SHEET_DOCUMENT_KEY,
    is_uploaded: true,
    uploaded_document_id: 'document-1',
    uploaded_at: '2026-08-04T09:00:00.000Z',
  },
  capturedAt: '2026-08-05T10:00:00.000Z',
})

assert.equal(uploadedArtifactCapture.captureKind, 'uploaded_artifact')
assert.equal(uploadedArtifactCapture.isUploaded, true)
assert.equal(uploadedArtifactCapture.uploadedDocumentId, 'document-1')
assert.equal(uploadedArtifactCapture.uploadedAt, '2026-08-04T09:00:00.000Z')
assert.equal(uploadedArtifactCapture.requirementPatch.is_uploaded, true)
assert.equal(uploadedArtifactCapture.requirementPatch.status, 'uploaded')
assert.equal(uploadedArtifactCapture.requirementPatch.uploaded_document_id, 'document-1')
assert.equal(uploadedArtifactCapture.workflowEvidence.evidenceType, 'document')
assert.equal(uploadedArtifactCapture.workflowEvidence.evidenceId, 'document-1')

console.log('document capture evidence tests passed')
