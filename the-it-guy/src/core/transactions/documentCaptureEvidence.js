export const DOCUMENT_CAPTURE_EVIDENCE_VERSION = 'arch9_document_capture_evidence_v1'
export const INFORMATION_SHEET_DOCUMENT_KEY = 'information_sheet'

function text(value) {
  return String(value ?? '').trim()
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function countCapturedFormFields(value) {
  if (!value || typeof value !== 'object') return 0
  return Object.entries(value).filter(([, fieldValue]) => {
    if (fieldValue === null || fieldValue === undefined) return false
    if (typeof fieldValue === 'string') return Boolean(fieldValue.trim())
    if (Array.isArray(fieldValue)) return fieldValue.length > 0
    if (typeof fieldValue === 'object') return Object.keys(fieldValue).length > 0
    return true
  }).length
}

function hasUploadedArtifact(requirement = {}) {
  return Boolean(
    firstText(
      requirement.uploaded_document_id,
      requirement.uploadedDocumentId,
      requirement.document_id,
      requirement.documentId,
    ),
  )
}

export function buildOnboardingInformationSheetCapture({
  transaction = {},
  onboarding = {},
  formData = {},
  existingRequirement = null,
  capturedAt = '',
  source = 'buyer_onboarding_completed',
} = {}) {
  const transactionId = firstText(transaction.id, transaction.transactionId, onboarding.transaction_id, onboarding.transactionId)
  const onboardingId = firstText(onboarding.id, onboarding.onboardingId)
  const resolvedCapturedAt = firstText(capturedAt, onboarding.submitted_at, onboarding.submittedAt, new Date().toISOString())
  const requirementId = existingRequirement ? firstText(existingRequirement.id, existingRequirement.requirementId) : ''
  const uploadedDocumentId = existingRequirement
    ? firstText(
        existingRequirement.uploaded_document_id,
        existingRequirement.uploadedDocumentId,
        existingRequirement.document_id,
        existingRequirement.documentId,
      )
    : ''
  const uploadedAt = existingRequirement
    ? firstText(existingRequirement.uploaded_at, existingRequirement.uploadedAt, resolvedCapturedAt)
    : ''

  if (existingRequirement && hasUploadedArtifact(existingRequirement)) {
    return {
      version: DOCUMENT_CAPTURE_EVIDENCE_VERSION,
      documentKey: INFORMATION_SHEET_DOCUMENT_KEY,
      captureKind: 'uploaded_artifact',
      status: 'uploaded',
      isUploaded: true,
      uploadedDocumentId,
      uploadedAt,
      capturedAt: resolvedCapturedAt,
      requirementId: requirementId || null,
      requirementPatch: {
        is_uploaded: true,
        status: 'uploaded',
        uploaded_document_id: uploadedDocumentId,
        uploaded_at: uploadedAt,
        updated_at: resolvedCapturedAt,
      },
      workflowEvidence: {
        evidenceType: 'document',
        evidenceId: uploadedDocumentId,
        evidenceKey: INFORMATION_SHEET_DOCUMENT_KEY,
        status: 'completed',
        source,
      },
      event: {
        type: 'TransactionUpdated',
        data: {
          source,
          captureKind: 'uploaded_artifact',
          documentKey: INFORMATION_SHEET_DOCUMENT_KEY,
          uploadedDocumentId,
          requirementId: requirementId || null,
        },
      },
    }
  }

  const notes = 'Satisfied from submitted buyer onboarding form data. No uploaded file artifact exists for this requirement.'

  return {
    version: DOCUMENT_CAPTURE_EVIDENCE_VERSION,
    documentKey: INFORMATION_SHEET_DOCUMENT_KEY,
    captureKind: 'source_backed_form',
    status: 'completed',
    isUploaded: false,
    uploadedDocumentId: null,
    uploadedAt: null,
    capturedAt: resolvedCapturedAt,
    requirementId: requirementId || null,
    requirementPatch: {
      is_uploaded: false,
      status: 'completed',
      uploaded_document_id: null,
      uploaded_at: null,
      notes,
      updated_at: resolvedCapturedAt,
    },
    workflowEvidence: {
      evidenceType: 'onboarding',
      evidenceId: onboardingId || INFORMATION_SHEET_DOCUMENT_KEY,
      evidenceKey: INFORMATION_SHEET_DOCUMENT_KEY,
      status: 'completed',
      source,
    },
    event: {
      type: 'TransactionUpdated',
      data: {
        source,
        captureKind: 'source_backed_form',
        documentKey: INFORMATION_SHEET_DOCUMENT_KEY,
        requirementId: requirementId || null,
        transactionId: transactionId || null,
        onboardingId: onboardingId || null,
        capturedAt: resolvedCapturedAt,
        formFieldCount: countCapturedFormFields(formData),
        uploadedDocumentId: null,
      },
    },
  }
}
