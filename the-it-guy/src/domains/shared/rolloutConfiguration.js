// shared owns these operations and their existing recovery behavior.
import { logTransactionEventIfPossible } from '../transactions/eventActions.js'
import { normalizeNullableText, normalizeOptionalDate, isMissingTableError, isMissingColumnError, isMissingSchemaError, normalizeTextValue, normalizeOptionalNumber } from '../../lib/api/shared/readHelpers.js'
import { ensureDevelopmentSettings, DEFAULT_DEVELOPMENT_SETTINGS } from '../developments/configurationApi.js'
import { normalizeEmailAddress } from '../developments/profileNormalization.js'
import { getStageIndex, normalizeStageLabel } from '../../core/transactions/stageConfig'
import { ATTORNEY_FIRM_ROLE_VALUES } from '../../constants/attorneyRoleCatalog.js'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { normalizeFundingSourceStatus, normalizeFundingSourceType } from '../clientPortal/workspaceApi.js'
import { notifyRolesForTransaction } from '../bond/financeRead.js'
import { normalizeReservationStatus } from '../documents/uploadAutomation.js'
import { normalizeReservationPaymentDetails } from '../transactions/creationApi.js'

const CANONICAL_PILOT_BUILD_MARKER = 'CANONICAL_PILOT_BUILD_MARKER_20260525'

const CANONICAL_DOCUMENTS_SOURCE_OF_TRUTH_FLAG = 'VITE_CANONICAL_DOCUMENTS_SOURCE_OF_TRUTH'

const CANONICAL_PILOT_SOURCE_OF_TRUTH = import.meta.env?.VITE_CANONICAL_DOCUMENTS_SOURCE_OF_TRUTH || ''

const CANONICAL_PILOT_TRANSACTION_ALLOWLIST =
  import.meta.env?.VITE_CANONICAL_DOCUMENTS_PRIMARY_TRANSACTION_ALLOWLIST || ''

const CANONICAL_PILOT_DEPLOYMENT_MARKERS = [
  CANONICAL_DOCUMENTS_SOURCE_OF_TRUTH_FLAG,
  'canonical_primary',
  'canonical_requirement_instance_id',
  'bridge_link_document_to_canonical_requirement',
  'bridge_link_document_to_canonical_requirement_by_key',
  'bridge_upload_document_to_canonical_requirement',
  'bridge_review_canonical_requirement',
]

if (CANONICAL_PILOT_SOURCE_OF_TRUTH || CANONICAL_PILOT_TRANSACTION_ALLOWLIST) {
  console.info('Canonical document rollout:', {
    marker: CANONICAL_PILOT_BUILD_MARKER,
    sourceOfTruth: CANONICAL_PILOT_SOURCE_OF_TRUTH,
    transactionAllowlist: CANONICAL_PILOT_TRANSACTION_ALLOWLIST,
    markers: CANONICAL_PILOT_DEPLOYMENT_MARKERS,
  })
}

function _deriveStageFromSubprocesses(transaction, subprocesses = []) {
  const currentStage = normalizeStageLabel(transaction?.stage || 'Available')
  const currentIndex = getStageIndex(currentStage)
  let targetStage = currentStage

  const finance = subprocesses.find((item) => item.process_type === 'finance')
  const transfer =
    subprocesses.find((item) => item.process_type === 'transfer') ||
    subprocesses.find((item) => item.process_type === 'attorney')

  const financeFinalComplete = finance?.steps?.some(
    (step) =>
      ['ready_for_transfer', 'bond_instruction_sent_to_attorneys'].includes(step.step_key) &&
      step.status === 'completed',
  )

  if (financeFinalComplete && getStageIndex('Proceed to Attorneys') > currentIndex) {
    targetStage = 'Proceed to Attorneys'
  }

  const transferRegistrationComplete = transfer?.steps?.some(
    (step) => step.step_key === 'registration_confirmed' && step.status === 'completed',
  )
  const transferLodgementComplete = transfer?.steps?.some(
    (step) => step.step_key === 'lodgement_submitted' && step.status === 'completed',
  )
  const transferInProgress = transfer?.steps?.some(
    (step) =>
      [
        'guarantees_received',
        'buyer_signed_transfer_documents',
        'seller_signed_transfer_documents',
        'buyer_signed_documents',
        'seller_signed_documents',
      ].includes(step.step_key) && step.status === 'completed',
  )

  if (transferRegistrationComplete) {
    targetStage = 'Registered'
  } else if (transferLodgementComplete && getStageIndex('Transfer Lodged') > getStageIndex(targetStage)) {
    targetStage = 'Transfer Lodged'
  } else if (transferInProgress && getStageIndex('Transfer in Progress') > getStageIndex(targetStage)) {
    targetStage = 'Transfer in Progress'
  }

  return targetStage
}

function buildReservationPaymentReference({
  referenceFormat = '',
  unitNumber = '',
  transactionId = '',
  buyerName = '',
} = {}) {
  const base = normalizeTextValue(referenceFormat) || 'RES-{unit}-{txn}'
  const compactTransactionId = String(transactionId || '')
    .replaceAll('-', '')
    .slice(0, 8)
    .toUpperCase()
  const compactBuyerName = String(buyerName || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 30)

  return base
    .replaceAll('{unit}', unitNumber ? String(unitNumber).trim() : 'UNIT')
    .replaceAll('{txn}', compactTransactionId || 'TXN')
    .replaceAll('{buyer}', compactBuyerName || 'BUYER')
}

async function _requestReservationDepositEmailIfPossible(
  client,
  {
    transactionId,
    actorRole = 'developer',
    actorUserId = null,
    forceResend = false,
    source = 'reservation_deposit_request',
  } = {},
) {
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  let transactionQuery = await client
    .from('transactions')
    .select(
      'id, development_id, unit_id, buyer_id, transaction_reference, reservation_required, reservation_amount, reservation_status, reservation_payment_details, reservation_requested_at, reservation_email_sent_at',
    )
    .eq('id', transactionId)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'transaction_reference') ||
      isMissingColumnError(transactionQuery.error, 'reservation_payment_details') ||
      isMissingColumnError(transactionQuery.error, 'reservation_requested_at') ||
      isMissingColumnError(transactionQuery.error, 'reservation_email_sent_at'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select('id, development_id, unit_id, buyer_id, reservation_required, reservation_amount, reservation_status')
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (transactionQuery.error) {
    throw transactionQuery.error
  }

  const transaction = transactionQuery.data
  if (!transaction) {
    throw new Error('Transaction not found.')
  }

  if (!transaction.reservation_required) {
    return {
      sent: false,
      reason: 'not_required',
      transactionId,
      buyerEmail: '',
      mailto: '',
    }
  }

  const reservationStatus = normalizeReservationStatus(transaction.reservation_status, {
    required: true,
  })
  if (!forceResend && reservationStatus === 'verified') {
    return {
      sent: false,
      reason: 'already_verified',
      transactionId,
      buyerEmail: '',
      mailto: '',
    }
  }

  const [buyerQuery, unitQuery, developmentQuery, settings] = await Promise.all([
    transaction.buyer_id
      ? client.from('buyers').select('id, name, email').eq('id', transaction.buyer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    transaction.unit_id
      ? client.from('units').select('id, unit_number').eq('id', transaction.unit_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    transaction.development_id
      ? client.from('developments').select('id, name').eq('id', transaction.development_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    transaction.development_id
      ? ensureDevelopmentSettings(client, transaction.development_id, {
          createIfMissing: false,
        })
      : Promise.resolve(DEFAULT_DEVELOPMENT_SETTINGS),
  ])

  if (buyerQuery.error) throw buyerQuery.error
  if (unitQuery.error && !isMissingSchemaError(unitQuery.error)) throw unitQuery.error
  if (developmentQuery.error && !isMissingSchemaError(developmentQuery.error)) throw developmentQuery.error

  const buyerName = normalizeTextValue(buyerQuery.data?.name || 'Client')
  const buyerEmail = normalizeEmailAddress(buyerQuery.data?.email)
  if (!buyerEmail) {
    return {
      sent: false,
      reason: 'missing_buyer_email',
      transactionId,
      buyerEmail: '',
      mailto: '',
    }
  }

  const fallbackDetails = normalizeReservationPaymentDetails(settings?.reservation_deposit_payment_details || {})
  const paymentDetails = normalizeReservationPaymentDetails(transaction.reservation_payment_details || fallbackDetails)
  const reservationAmount = normalizeOptionalNumber(
    transaction.reservation_amount ?? settings?.reservation_deposit_amount,
  )
  const paymentReference = buildReservationPaymentReference({
    referenceFormat: paymentDetails.payment_reference_format,
    unitNumber: normalizeTextValue(unitQuery.data?.unit_number),
    transactionId: transaction.id,
    buyerName,
  })

  const nowIso = new Date().toISOString()
  const today = nowIso.slice(0, 10)
  const nextReservationStatus = reservationStatus === 'verified' ? 'verified' : 'pending'
  const updatePayload = {
    reservation_status: nextReservationStatus,
    reservation_amount: reservationAmount,
    reservation_payment_details: paymentDetails,
    reservation_requested_at: transaction.reservation_requested_at || nowIso,
    reservation_email_sent_at: nowIso,
    updated_at: nowIso,
  }

  let updateResult = await client.from('transactions').update(updatePayload).eq('id', transaction.id)

  if (
    updateResult.error &&
    (isMissingColumnError(updateResult.error, 'reservation_payment_details') ||
      isMissingColumnError(updateResult.error, 'reservation_requested_at') ||
      isMissingColumnError(updateResult.error, 'reservation_email_sent_at'))
  ) {
    const fallbackPayload = {
      reservation_status: nextReservationStatus,
      reservation_amount: reservationAmount,
      updated_at: nowIso,
    }
    updateResult = await client.from('transactions').update(fallbackPayload).eq('id', transaction.id)
  }

  if (updateResult.error) {
    throw updateResult.error
  }

  const developmentLabel = normalizeTextValue(developmentQuery.data?.name || 'your development')
  const unitLabel = normalizeTextValue(unitQuery.data?.unit_number ? `Unit ${unitQuery.data.unit_number}` : '')
  const subject = `Reservation deposit required${unitLabel ? ` - ${unitLabel}` : ''}`
  const bodyLines = [
    `Hi ${buyerName || 'there'},`,
    '',
    `A reservation deposit is required for ${developmentLabel}${unitLabel ? ` (${unitLabel})` : ''}.`,
    reservationAmount !== null
      ? `Amount due: ${new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(reservationAmount)}`
      : '',
    paymentDetails.account_holder_name ? `Account holder: ${paymentDetails.account_holder_name}` : '',
    paymentDetails.bank_name ? `Bank: ${paymentDetails.bank_name}` : '',
    paymentDetails.account_number ? `Account number: ${paymentDetails.account_number}` : '',
    paymentDetails.branch_code ? `Branch code: ${paymentDetails.branch_code}` : '',
    paymentDetails.account_type ? `Account type: ${paymentDetails.account_type}` : '',
    `Reference: ${paymentReference}`,
    paymentDetails.payment_instructions ? `Instructions: ${paymentDetails.payment_instructions}` : '',
    '',
    'Please upload your reservation deposit proof of payment in the Documents section.',
    '',
    'If you need help, reply to this email and our team will assist you.',
  ].filter(Boolean)
  const mailto = `mailto:${buyerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`

  await logTransactionEventIfPossible(client, {
    transactionId: transaction.id,
    eventType: 'TransactionUpdated',
    createdBy: actorUserId || null,
    createdByRole: normalizeRoleType(actorRole),
    eventData: {
      source,
      reservationDeposit: {
        action: forceResend ? 'resent' : 'requested',
        requestedAt: transaction.reservation_requested_at || nowIso,
        emailSentAt: nowIso,
        amount: reservationAmount,
        paymentReference,
        recipient: buyerEmail,
      },
    },
  })

  await notifyRolesForTransaction(client, {
    transactionId: transaction.id,
    roleTypes: ['developer', 'agent', 'attorney'],
    title: forceResend ? 'Reservation deposit email resent' : 'Reservation deposit requested',
    message: `${buyerName || 'Client'} was sent reservation deposit payment instructions.`,
    notificationType: 'document_uploaded',
    eventType: 'TransactionUpdated',
    eventData: {
      source,
      reservationStatus: nextReservationStatus,
      reservationAmount,
      recipient: buyerEmail,
    },
    dedupePrefix: `${source}:${forceResend ? 'resend' : 'send'}:${today}`,
    excludeUserId: actorUserId || null,
  })

  return {
    sent: true,
    reason: forceResend ? 'resent' : 'sent',
    transactionId: transaction.id,
    buyerEmail,
    mailto,
    amount: reservationAmount,
    paymentReference,
    status: nextReservationStatus,
    emailSentAt: nowIso,
  }
}

async function replaceTransactionFundingSources(client, { transactionId, fundingSources = [] } = {}) {
  if (!transactionId) {
    return []
  }

  const deleteQuery = await client.from('transaction_funding_sources').delete().eq('transaction_id', transactionId)
  if (deleteQuery.error) {
    if (isMissingTableError(deleteQuery.error, 'transaction_funding_sources')) {
      return []
    }
    throw deleteQuery.error
  }

  if (!fundingSources.length) {
    return []
  }

  const rows = fundingSources.map((source) => ({
    transaction_id: transactionId,
    source_type: normalizeFundingSourceType(source.sourceType ?? source.source_type),
    amount: normalizeOptionalNumber(source.amount),
    expected_payment_date: normalizeOptionalDate(source.expectedPaymentDate ?? source.expected_payment_date),
    actual_payment_date: normalizeOptionalDate(source.actualPaymentDate ?? source.actual_payment_date),
    proof_document: normalizeNullableText(source.proofDocument ?? source.proof_document),
    status: normalizeFundingSourceStatus(source.status),
    notes: normalizeNullableText(source.notes),
  }))

  const insertQuery = await client
    .from('transaction_funding_sources')
    .insert(rows)
    .select(
      'id, transaction_id, source_type, amount, expected_payment_date, actual_payment_date, proof_document, status, notes, created_at, updated_at',
    )
    .order('created_at', { ascending: true })

  if (insertQuery.error) {
    if (isMissingTableError(insertQuery.error, 'transaction_funding_sources')) {
      return []
    }
    throw insertQuery.error
  }

  return (insertQuery.data || []).map((row) => ({
    id: row.id,
    transactionId: row.transaction_id,
    sourceType: row.source_type,
    amount: row.amount,
    expectedPaymentDate: row.expected_payment_date,
    actualPaymentDate: row.actual_payment_date,
    proofDocument: row.proof_document,
    status: normalizeFundingSourceStatus(row.status),
    notes: row.notes || '',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }))
}
