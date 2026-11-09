// onboarding owns these operations and their existing recovery behavior.
import { logTransactionEventIfPossible } from '../transactions/eventActions.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { normalizeNullableText, requireClient, isMissingColumnError, normalizeTextValue } from '../../lib/api/shared/readHelpers.js'
import { invokeEdgeFunction } from '../../lib/supabaseClient'
import { OTP_DOCUMENT_TYPES } from '../../core/transactions/salesWorkflow'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { resolveTransactionWhatsAppContactsWithClient } from '../transactions/contactSupport.js'
import { normalizeReservationStatus } from '../documents/uploadAutomation.js'
import { resolveLatestOtpDocumentForTransaction, PHASE0_LEGACY_OTP_SIGNING_DISABLED, updateOtpDocumentWorkflowState } from '../clientPortal/signingApi.js'
import { getOrCreateClientPortalLink } from '../clientPortal/accessApi.js'

export function resolveClientAppBaseUrl() {
  const envCandidates = [
    import.meta?.env?.VITE_CLIENT_APP_URL,
    import.meta?.env?.VITE_PUBLIC_APP_URL,
    import.meta?.env?.VITE_APP_BASE_URL,
    import.meta?.env?.VITE_SITE_URL,
  ]

  for (const candidate of envCandidates) {
    const normalized = normalizeTextValue(candidate)
    if (normalized) {
      return normalized.replace(/\/+$/, '')
    }
  }

  if (typeof window !== 'undefined' && normalizeTextValue(window?.location?.origin)) {
    return normalizeTextValue(window.location.origin).replace(/\/+$/, '')
  }

  return ''
}

function buildOtpSigningLinkFromPortalToken(token) {
  const normalizedToken = normalizeTextValue(token)
  if (!normalizedToken) {
    return ''
  }

  const appBaseUrl = resolveClientAppBaseUrl()
  const path = `/client/${normalizedToken}/otp-signing`
  return appBaseUrl ? `${appBaseUrl}${path}` : path
}

function formatSouthAfricanWhatsAppNumberForPayload(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  let digits = raw.replace(/\D+/g, '')
  if (!digits) return ''

  if (digits.startsWith('00')) {
    digits = digits.slice(2)
  }

  if (digits.startsWith('270')) {
    digits = `27${digits.slice(3)}`
  } else if (digits.startsWith('0')) {
    digits = `27${digits.slice(1)}`
  } else if (digits.startsWith('7') && digits.length === 9) {
    digits = `27${digits}`
  }

  if (!/^27\d{9}$/.test(digits)) {
    return ''
  }

  return digits
}

export async function sendOtpToClient({
  transactionId,
  otpDocumentId = null,
  forceResend = false,
  source = 'otp_send_to_client',
} = {}) {
  // This legacy client flow minted an OTP portal link and marked the document
  // sent without a canonical packet, server-attested delivery, or E4 dispatch.
  throw new Error(PHASE0_LEGACY_OTP_SIGNING_DISABLED)

  const normalizedTransactionId = normalizeNullableText(transactionId)
  if (!normalizedTransactionId) {
    throw new Error('Transaction is required.')
  }

  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)
  const nowIso = new Date().toISOString()

  let transactionQuery = await client
    .from('transactions')
    .select('id, buyer_id, development_id, unit_id, reservation_required, reservation_status, transaction_reference')
    .eq('id', normalizedTransactionId)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'reservation_required') ||
      isMissingColumnError(transactionQuery.error, 'reservation_status') ||
      isMissingColumnError(transactionQuery.error, 'transaction_reference'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select('id, buyer_id, development_id, unit_id')
      .eq('id', normalizedTransactionId)
      .maybeSingle()
  }

  if (transactionQuery.error) {
    throw transactionQuery.error
  }

  const transaction = transactionQuery.data
  if (!transaction?.id) {
    throw new Error('Transaction not found.')
  }

  const reservationRequired = Boolean(transaction.reservation_required)
  const reservationStatus = normalizeReservationStatus(transaction.reservation_status, {
    required: reservationRequired,
  })
  if (reservationRequired && !['paid', 'verified'].includes(reservationStatus)) {
    throw new Error('Reservation deposit must be paid before sending OTP to the client.')
  }

  const portalLink = await getOrCreateClientPortalLink({
    developmentId: transaction.development_id,
    unitId: transaction.unit_id,
    transactionId: transaction.id,
    buyerId: transaction.buyer_id || null,
  })
  const signingLink = buildOtpSigningLinkFromPortalToken(portalLink?.token)

  const { data: sendResult, error: sendError } = await invokeEdgeFunction('send-email', {
    client,
    body: {
      type: 'otp_sent_to_client',
      transactionId: transaction.id,
      resend: Boolean(forceResend),
      signingLink,
      source,
      actorRole: normalizeRoleType(actorProfile.role || 'developer'),
      actorUserId: actorProfile.userId || null,
    },
  })

  if (sendError) {
    throw sendError
  }

  if (sendResult?.ok === false) {
    throw new Error(sendResult?.error || sendResult?.message || 'Unable to send OTP to client right now.')
  }

  if (sendResult?.sent === false) {
    return {
      ok: true,
      sent: false,
      reason: sendResult?.reason || 'not_sent',
      transactionId: transaction.id,
      signingLink: sendResult?.signingLink || signingLink,
      email: sendResult?.recipientEmail || '',
      otpDocument: null,
      otpStatusUpdated: false,
      whatsappPayload: null,
    }
  }

  let resolvedDocumentId = normalizeNullableText(otpDocumentId)
  if (!resolvedDocumentId) {
    const latestOtpDocument = await resolveLatestOtpDocumentForTransaction(client, transaction.id)
    resolvedDocumentId = normalizeNullableText(latestOtpDocument?.id)
  }

  let updatedOtpDocument = null
  if (resolvedDocumentId) {
    updatedOtpDocument = await updateOtpDocumentWorkflowState({
      documentId: resolvedDocumentId,
      workflowState: OTP_DOCUMENT_TYPES.sentToClient,
      isClientVisible: true,
    })
  }

  let whatsappPayload = null
  try {
    const contacts = await resolveTransactionWhatsAppContactsWithClient(client, transaction.id)
    const clientName = normalizeTextValue(contacts?.client?.name || 'Client')
    const clientPhone = formatSouthAfricanWhatsAppNumberForPayload(contacts?.client?.phone)
    const developmentName = normalizeTextValue(contacts?.developmentName)
    const unitReference = normalizeTextValue(contacts?.unitReference)
    const propertyLine = [developmentName, unitReference].filter(Boolean).join(' - ')
    const message = [
      `Hi ${clientName},`,
      '',
      `Your Offer to Purchase (OTP)${propertyLine ? ` for ${propertyLine}` : ''} is ready for review and signature.`,
      'Open your secure signing link:',
      sendResult?.signingLink || signingLink,
      '',
      'If you have any questions, please contact your Arch9 transaction team.',
      '',
      '- Arch9',
    ]
      .filter(Boolean)
      .join('\n')

    if (clientPhone) {
      whatsappPayload = {
        role: 'client',
        to: clientPhone,
        message,
        transactionId: transaction.id,
        type: 'otp_sent_to_client',
        sendDeferred: true,
      }
    }
  } catch (contactError) {
    console.warn('[OTP Send] Unable to prepare WhatsApp payload.', contactError)
  }

  await logTransactionEventIfPossible(client, {
    transactionId: transaction.id,
    eventType: 'TransactionUpdated',
    createdBy: actorProfile.userId || null,
    createdByRole: normalizeRoleType(actorProfile.role || 'developer'),
    eventData: {
      source: 'otp_send_flow',
      action: forceResend ? 'otp_resent_to_client' : 'otp_sent_to_client',
      signingLink: sendResult?.signingLink || signingLink || null,
      recipientEmail: sendResult?.recipientEmail || null,
      emailId: sendResult?.emailId || null,
      documentId: resolvedDocumentId,
      sentAt: sendResult?.emailSentAt || nowIso,
      whatsappPrepared: Boolean(whatsappPayload),
    },
  })

  return {
    ok: true,
    sent: true,
    reason: sendResult?.reason || (forceResend ? 'resent' : 'sent'),
    transactionId: transaction.id,
    signingLink: sendResult?.signingLink || signingLink,
    email: sendResult?.recipientEmail || '',
    emailId: sendResult?.emailId || null,
    otpDocument: updatedOtpDocument,
    otpStatusUpdated: Boolean(updatedOtpDocument?.id),
    whatsappPayload,
  }
}
