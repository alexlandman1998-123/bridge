import {
  getSimpleSigningDocumentType,
  resolveSimpleSigningState,
  SIMPLE_SIGNING_STATES,
} from './simpleSigningExperienceScope.js'

const CONTRACT = 'arch9-simple-signing-experience-model-v1'
const STEP_IDS = ['review', 'sign', 'finish']

function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function number(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function isFieldCompleted(field = null) {
  return key(field?.status || field?.state) === 'completed'
}

function fieldTypeLabel(value = '') {
  const normalized = key(value)
  if (normalized === 'initial') return 'Initial'
  if (normalized === 'signature') return 'Signature'
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Field'
}

function roleLabel(value = '') {
  const role = key(value)
  if (role.includes('seller')) return 'Seller'
  if (role.includes('buyer') || role.includes('purchaser')) return 'Buyer'
  if (role.includes('agent')) return 'Agent'
  if (role.includes('attorney') || role.includes('conveyancer')) return 'Attorney'
  if (role.includes('trustee')) return 'Trustee'
  if (role.includes('representative')) return 'Representative'
  return text(value).replace(/_/g, ' ') || 'Signer'
}

function documentTitle(packet = {}) {
  const packetType = key(packet.packet_type || packet.packetType || packet.type)
  const configured = getSimpleSigningDocumentType(packetType)
  return configured?.title || text(packet.title) || 'Document'
}

function documentFileName({ packet = {}, version = {}, completion = null } = {}) {
  const packetType = key(packet.packet_type || packet.packetType || packet.type)
  const configured = getSimpleSigningDocumentType(packetType)
  return text(
    completion?.finalArtifact?.fileName ||
      completion?.finalArtifact?.name ||
      version.final_signed_file_name ||
      version.rendered_file_name ||
      version.file_name ||
      packet.file_name ||
      configured?.defaultFileName,
  ) || 'Document.pdf'
}

function buildSteps(state) {
  const activeIndex = state === 'completed' ? 2 : Math.max(0, STEP_IDS.indexOf(state))
  return STEP_IDS.map((id, index) => {
    const scope = SIMPLE_SIGNING_STATES.find((item) => item.id === id)
    const completed = state === 'completed' || index < activeIndex
    return {
      id,
      step: index + 1,
      label: scope?.label || id,
      status: completed ? 'complete' : index === activeIndex ? 'current' : 'pending',
      isCurrent: index === activeIndex && state !== 'completed',
    }
  })
}

function buildPrimaryAction({ state, nextField, finalArtifactReady }) {
  const nextType = key(nextField?.field_type || nextField?.fieldType || nextField?.type)
  if (state === 'review') return { id: 'view_document', label: 'View document' }
  if (state === 'sign') {
    if (nextType === 'signature') return { id: 'next_field', label: 'Add my signature' }
    if (nextType === 'initial') return { id: 'next_field', label: 'Add my initials' }
    return { id: 'next_field', label: 'Continue to next field' }
  }
  if (state === 'finish') return { id: 'finish_signing', label: 'Finish signing' }
  if (state === 'completed' && finalArtifactReady) return { id: 'open_completed_pdf', label: 'Open completed PDF' }
  if (state === 'completed') return { id: 'close_page', label: 'Close page' }
  return { id: 'contact_support', label: 'Get help' }
}

function buildActionCard({ state, progress, nextField, finalArtifactReady }) {
  const primaryAction = buildPrimaryAction({ state, nextField, finalArtifactReady })
  if (state === 'completed') {
    return {
      tone: 'success',
      title: "You're all set",
      description: finalArtifactReady
        ? 'Your information has been saved and the completed PDF is available.'
        : "Your information has been saved. You can close this page and we'll notify you when everyone has signed.",
      primaryAction,
    }
  }
  if (state === 'finish') {
    return {
      tone: 'success',
      title: 'Ready to finish',
      description: 'All required fields are complete. Submit your signing securely.',
      primaryAction,
    }
  }
  if (state === 'sign') {
    return {
      tone: 'primary',
      title: nextField ? "It's your turn to sign" : 'Ready to sign',
      description: nextField
        ? `Complete the highlighted ${fieldTypeLabel(nextField.field_type || nextField.fieldType || nextField.type).toLowerCase()} field in the document.`
        : 'Please review the document and add your signature.',
      primaryAction,
    }
  }
  if (state === 'blocked') {
    return {
      tone: 'danger',
      title: 'This signing link needs help',
      description: 'Please contact your agent or attorney for a fresh secure link.',
      primaryAction,
    }
  }
  return {
    tone: 'neutral',
    title: 'Review your document',
    description: 'Please read the document before adding your signature.',
    primaryAction,
  }
}

function stateCopy(state) {
  if (state === 'sign') return 'Please complete the required fields in the document.'
  if (state === 'finish') return 'Please submit your signing to finish.'
  if (state === 'completed') return 'Your information has been saved.'
  if (state === 'blocked') return 'This signing link needs attention.'
  return 'Please read the document and add your signature.'
}

function currentStepLabel(state) {
  if (state === 'completed') return 'Step 3 of 3 · Finish'
  const step = SIMPLE_SIGNING_STATES.find((item) => item.id === state)
  return step?.step ? `Step ${step.step} of 3 · ${step.label}` : 'Signing needs help'
}

export function buildSimpleSigningExperienceModel({
  session = {},
  documentPreviewUrl = '',
  fallbackPreviewHtml = '',
  errorMessage = '',
} = {}) {
  const packet = session.packet || {}
  const signer = session.signer || {}
  const version = session.version || {}
  const completion = session.completion || null
  const fields = Array.isArray(session.fields) ? session.fields : []
  const requiredFields = fields.filter((field) => field?.required !== false)
  const completedFields = requiredFields.filter(isFieldCompleted)
  const remainingFields = requiredFields.filter((field) => !isFieldCompleted(field))
  const nextField = remainingFields[0] || null
  const finalArtifactReady = completion?.finalArtifact?.ready === true || Boolean(completion?.finalArtifact?.downloadUrl)
  const state = resolveSimpleSigningState({
    signerStatus: signer.status,
    requiredFields: requiredFields.length,
    completedFields: completedFields.length,
    hasSessionError: Boolean(errorMessage),
    completion,
  })
  const packetType = key(packet.packet_type || packet.packetType || packet.type)
  const title = documentTitle(packet)
  const progress = {
    requiredFieldCount: requiredFields.length,
    completedFieldCount: completedFields.length,
    remainingFieldCount: remainingFields.length,
    percent: requiredFields.length ? Math.round((completedFields.length / requiredFields.length) * 100) : 0,
    nextField: nextField
      ? {
          id: text(nextField.id),
          type: key(nextField.field_type || nextField.fieldType || nextField.type),
          typeLabel: fieldTypeLabel(nextField.field_type || nextField.fieldType || nextField.type),
          pageNumber: number(nextField.page_number || nextField.pageNumber, 1),
        }
      : null,
  }

  return {
    contract: CONTRACT,
    state,
    stateLabel: SIMPLE_SIGNING_STATES.find((item) => item.id === state)?.label || 'Review',
    currentStepLabel: currentStepLabel(state),
    mutatedData: false,
    document: {
      packetType,
      title,
      signerRoleLabel: roleLabel(signer.signer_role || signer.role),
      fileName: documentFileName({ packet, version, completion }),
      versionNumber: version.version_number || version.versionNumber || null,
      previewAvailable: Boolean(documentPreviewUrl || fallbackPreviewHtml),
      currentPage: progress.nextField?.pageNumber || 1,
      pageCount: number(session.pageCount || version.page_count || version.pageCount, 0) || null,
    },
    steps: buildSteps(state),
    progress,
    actionCard: buildActionCard({ state, progress, nextField, finalArtifactReady }),
    helpCard: {
      title: 'Need help?',
      description: 'If you have any questions or need assistance, contact your agent or attorney.',
    },
    secureFooter: {
      left: 'Your data is secure and encrypted',
      right: 'Powered by Arch9',
    },
    copy: {
      headline: `${title} · ${roleLabel(signer.signer_role || signer.role)}`,
      eyebrow: 'Secure document signing',
      instruction: stateCopy(state),
    },
  }
}

export { CONTRACT as SIMPLE_SIGNING_EXPERIENCE_MODEL_CONTRACT }
