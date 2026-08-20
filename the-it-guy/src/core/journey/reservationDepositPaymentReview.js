import {
  JOURNEY_ENTITY_TYPES,
  JOURNEY_NOTIFICATION_MODES,
  JOURNEY_STAGE_ACTIONS,
} from './journeyStagePolicy.js'
import { serializeJourneyStageOverrideForDatabase } from './journeyStageOverrideContract.js'

export const RESERVATION_DEPOSIT_STAGE_KEY = 'reservation_deposit_paid'
export const RESERVATION_DEPOSIT_PROOF_DOCUMENT_KEY = 'reservation_deposit_proof'
export const RESERVATION_DEPOSIT_MARK_PAID_SOURCE = 'reservation_deposit_mark_paid'

const RESERVATION_STATUSES = Object.freeze(['not_required', 'pending', 'paid', 'verified', 'rejected'])
const PAID_REVIEW_STATUSES = Object.freeze(['paid', 'uploaded', 'pending_review', 'under_review'])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeUuid(value) {
  const text = normalizeText(value)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : ''
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function normalizeAmount(value) {
  if (value === null || value === undefined || value === '') return null
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : null
}

function resolveNowIso(now = new Date()) {
  const parsed = now instanceof Date ? now : new Date(now)
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}

export function normalizeReservationDepositStatus(value, { required = false } = {}) {
  const normalized = normalizeText(value).toLowerCase()
  if (!required) return 'not_required'
  if (RESERVATION_STATUSES.includes(normalized)) return normalized
  if (normalized === 'complete' || normalized === 'completed') return 'paid'
  if (PAID_REVIEW_STATUSES.includes(normalized)) return 'paid'
  return 'pending'
}

export function normalizeReservationDepositPaidDate(value, { now = new Date() } = {}) {
  const text = normalizeText(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  if (text) {
    const parsed = new Date(text)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  }
  return resolveNowIso(now).slice(0, 10)
}

export function resolveReservationDepositPaymentReviewState(transaction = {}) {
  const required = Boolean(transaction?.reservation_required ?? transaction?.reservationRequired)
  const status = normalizeReservationDepositStatus(transaction?.reservation_status ?? transaction?.reservationStatus, {
    required,
  })
  const proofDocumentId = normalizeUuid(transaction?.reservation_proof_document ?? transaction?.reservationProofDocument)
  const paidDate = normalizeText(transaction?.reservation_paid_date ?? transaction?.reservationPaidDate)

  return {
    required,
    status,
    paidDate,
    proofDocumentId: proofDocumentId || '',
    paid: required && ['paid', 'verified'].includes(status),
    verified: required && status === 'verified',
    canMarkPaid: required && status !== 'verified',
    requiresReview: required && ['paid', 'uploaded', 'pending_review', 'under_review'].includes(status),
    blocksProgression: required && status !== 'verified',
  }
}

export function buildReservationDepositMarkPaidTransactionPatch({
  paidDate = '',
  proofDocumentId = '',
  proofUploadedAt = '',
  now = new Date(),
} = {}) {
  const nowIso = resolveNowIso(now)
  const normalizedProofDocumentId = normalizeUuid(proofDocumentId)
  const patch = {
    reservation_status: 'paid',
    reservation_paid_date: normalizeReservationDepositPaidDate(paidDate, { now }),
    reservation_reviewed_at: null,
    reservation_reviewed_by: null,
    reservation_review_notes: null,
    updated_at: nowIso,
  }

  if (normalizedProofDocumentId) {
    patch.reservation_proof_document = normalizedProofDocumentId
    patch.reservation_proof_uploaded_at = normalizeText(proofUploadedAt) || nowIso
  }

  return patch
}

export function buildReservationDepositMarkPaidOverrideRow({
  transaction = {},
  organisationId = '',
  transactionId = '',
  reason = '',
  amount = null,
  reference = '',
  paidDate = '',
  proofDocumentId = '',
  proofUploadedAt = '',
  actorUserId = '',
  source = RESERVATION_DEPOSIT_MARK_PAID_SOURCE,
  metadata = {},
  now = new Date(),
} = {}) {
  const resolvedOrganisationId = normalizeUuid(organisationId || transaction?.organisation_id || transaction?.organisationId)
  const resolvedTransactionId = normalizeUuid(transactionId || transaction?.id || transaction?.transaction_id)
  const resolvedPaidDate = normalizeReservationDepositPaidDate(paidDate, { now })
  const resolvedProofDocumentId = normalizeUuid(proofDocumentId)
  const resolvedSource = normalizeText(source) || RESERVATION_DEPOSIT_MARK_PAID_SOURCE
  const priorState = resolveReservationDepositPaymentReviewState(transaction)

  return serializeJourneyStageOverrideForDatabase({
    organisationId: resolvedOrganisationId,
    entityType: JOURNEY_ENTITY_TYPES.transaction,
    entityId: resolvedTransactionId,
    stageKey: RESERVATION_DEPOSIT_STAGE_KEY,
    actionType: JOURNEY_STAGE_ACTIONS.markPaid,
    reason,
    actorUserId,
    notificationMode: JOURNEY_NOTIFICATION_MODES.internalOnly,
    metadata: {
      ...normalizeObject(metadata),
      source: resolvedSource,
      amount: normalizeAmount(amount ?? transaction?.reservation_amount ?? transaction?.reservationAmount),
      reference: normalizeText(reference),
      paidDate: resolvedPaidDate,
      proofDocumentId: resolvedProofDocumentId || null,
      proofUploadedAt: normalizeText(proofUploadedAt) || null,
      previousReservationStatus: priorState.status,
      previousReservationPaidDate: priorState.paidDate || null,
      verificationRequired: true,
    },
  })
}
