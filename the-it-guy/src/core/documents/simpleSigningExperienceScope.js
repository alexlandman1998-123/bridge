const CONTRACT = 'arch9-simple-signing-experience-scope-v1'
const PHASE = 'document-generator-simple-signing-ui-phase-0'

export const SIMPLE_SIGNING_DOCUMENT_TYPES = [
  {
    packetType: 'mandate',
    title: 'Mandate',
    defaultFileName: 'Mandate_Seller.pdf',
    supportedSignerRoles: ['agent', 'seller', 'seller_representative', 'seller_trustee', 'co_signer'],
  },
  {
    packetType: 'otp',
    title: 'Offer to Purchase',
    defaultFileName: 'Offer_To_Purchase.pdf',
    supportedSignerRoles: ['purchaser_1', 'purchaser_2', 'buyer', 'buyer_representative', 'buyer_trustee', 'seller', 'developer_authorised_signatory', 'contractor_authorised_signatory', 'agent'],
  },
]

export const SIMPLE_SIGNING_STATES = [
  {
    id: 'review',
    step: 1,
    label: 'Review',
    primaryAction: 'view_document',
    summary: 'The signer can open and read the generated document before completing required fields.',
  },
  {
    id: 'sign',
    step: 2,
    label: 'Sign',
    primaryAction: 'continue_to_next_field',
    summary: 'The signer has required fields to complete in the generated document.',
  },
  {
    id: 'finish',
    step: 3,
    label: 'Finish',
    primaryAction: 'finish_signing',
    summary: 'All required fields are complete and the signer can submit the signing session.',
  },
  {
    id: 'completed',
    step: 3,
    label: 'Completed',
    primaryAction: 'open_completed_pdf',
    summary: 'The signer has completed their part and may wait for everyone else or open the completed PDF when available.',
  },
  {
    id: 'blocked',
    step: 0,
    label: 'Needs help',
    primaryAction: 'contact_support',
    summary: 'The signing link is expired, declined, unavailable, or otherwise blocked.',
  },
]

const BLOCKED_STATUSES = new Set(['declined', 'expired', 'cancelled', 'canceled', 'revoked', 'voided'])
const REVIEW_STATUSES = new Set(['pending', 'sent', 'invited', 'delivered'])
const SIGN_STATUSES = new Set(['viewed', 'opened', 'in_progress', 'partially_signed', 'partially_completed'])

function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function resolveSimpleSigningState({
  signerStatus = '',
  requiredFields = 0,
  completedFields = 0,
  hasSessionError = false,
  completion = null,
} = {}) {
  const status = key(signerStatus)
  const required = Math.max(0, number(requiredFields))
  const completed = Math.max(0, number(completedFields))
  if (completion || status === 'signed') return 'completed'
  if (hasSessionError || BLOCKED_STATUSES.has(status)) return 'blocked'
  if (required > 0 && completed >= required) return 'finish'
  if (completed > 0 || SIGN_STATUSES.has(status)) return 'sign'
  if (REVIEW_STATUSES.has(status) || required > 0) return 'review'
  return 'review'
}

export function getSimpleSigningDocumentType(packetType = '') {
  const normalized = key(packetType)
  return SIMPLE_SIGNING_DOCUMENT_TYPES.find((documentType) => documentType.packetType === normalized) || null
}

export function buildSimpleSigningExperienceScope() {
  return {
    contract: CONTRACT,
    phase: PHASE,
    status: 'scope_locked',
    mutatedData: false,
    coveredDocumentTypes: SIMPLE_SIGNING_DOCUMENT_TYPES,
    signingStates: SIMPLE_SIGNING_STATES,
    stateTransitions: [
      ['review', 'sign'],
      ['sign', 'finish'],
      ['finish', 'completed'],
      ['review', 'blocked'],
      ['sign', 'blocked'],
      ['finish', 'blocked'],
    ],
    reusableSurfaces: [
      'SignerPortal active signing session',
      'SignerPortal completed signing session',
      'generated mandate packet',
      'generated OTP packet',
    ],
    backendBoundaries: {
      changesEmailDispatch: false,
      changesFinalArtifactGeneration: false,
      changesFinalCompletionTruth: false,
      changesSigningTokenAuthority: false,
      changesStorageAccess: false,
    },
    requiredPhase1AdapterInputs: [
      'packet.packet_type',
      'packet.title',
      'signer.signer_role',
      'signer.status',
      'version.version_number',
      'fields.required',
      'fields.status',
      'documentPreviewUrl or fallbackPreviewHtml',
      'completion.finalArtifact.ready',
    ],
  }
}

export { CONTRACT as SIMPLE_SIGNING_EXPERIENCE_SCOPE_CONTRACT, PHASE as SIMPLE_SIGNING_EXPERIENCE_PHASE }
