export const TRANSACTION_BUYER_DELIVERY_VERSION = 'transaction_buyer_delivery_phase4_v1'

export const TRANSACTION_BUYER_DELIVERY_ACTIONS = Object.freeze({
  sendOnboarding: 'send_onboarding',
  sendPortalLink: 'send_portal_link',
})

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

export function normalizeTransactionBuyerDeliveryTarget(input = {}) {
  const decision = input.decision && typeof input.decision === 'object' ? input.decision : null
  const buyer = input.buyer && typeof input.buyer === 'object'
    ? input.buyer
    : decision?.buyer && typeof decision.buyer === 'object'
      ? decision.buyer
      : input

  const participantId = firstText(
    input.participantId,
    input.participant_id,
    decision?.participantId,
    buyer?.participantId,
    buyer?.participant_id,
  )
  const buyerPartyId = firstText(
    input.buyerPartyId,
    input.buyer_party_id,
    input.buyerId,
    input.buyer_id,
    decision?.buyerId,
    buyer?.buyerId,
    buyer?.buyer_id,
    buyer?.buyerPartyId,
    buyer?.buyer_party_id,
  )
  const email = lower(firstText(
    input.email,
    input.buyerEmail,
    input.buyer_email,
    decision?.email,
    buyer?.email,
    buyer?.participantEmail,
    buyer?.participant_email,
  ))
  const name = firstText(
    input.name,
    input.buyerName,
    input.buyer_name,
    decision?.buyer?.name,
    buyer?.name,
    buyer?.participantName,
    buyer?.participant_name,
  )
  const targetId = firstText(input.targetId, input.target_id, decision?.targetId, participantId, buyerPartyId, email)

  return Object.freeze({
    version: TRANSACTION_BUYER_DELIVERY_VERSION,
    targetId,
    participantId,
    buyerPartyId,
    email,
    name,
    isPrimary: Boolean(input.isPrimary ?? decision?.isPrimary ?? buyer?.isPrimary ?? buyer?.is_primary),
    hasTarget: Boolean(participantId || buyerPartyId || email),
  })
}

export function buildTransactionBuyerDeliveryPayload({
  transactionId = '',
  target = {},
  decision = null,
  resend = false,
  source = 'agent_transaction_workspace',
  deliveryMode = '',
  skipEmail = false,
  action = TRANSACTION_BUYER_DELIVERY_ACTIONS.sendOnboarding,
} = {}) {
  const normalizedTarget = normalizeTransactionBuyerDeliveryTarget({ ...(target || {}), decision })
  const normalizedAction = Object.values(TRANSACTION_BUYER_DELIVERY_ACTIONS).includes(action)
    ? action
    : TRANSACTION_BUYER_DELIVERY_ACTIONS.sendOnboarding

  return Object.freeze({
    type: 'client_onboarding',
    transactionId: text(transactionId),
    resend: Boolean(resend),
    source: text(source) || 'agent_transaction_workspace',
    ...(deliveryMode ? { deliveryMode } : {}),
    ...(skipEmail ? { skipEmail: true } : {}),
    buyerDeliveryAction: normalizedAction,
    buyerDeliveryVersion: TRANSACTION_BUYER_DELIVERY_VERSION,
    buyerTargetId: normalizedTarget.targetId || null,
    buyerParticipantId: normalizedTarget.participantId || null,
    buyerPartyId: normalizedTarget.buyerPartyId || null,
    buyerEmail: normalizedTarget.email || null,
    buyerName: normalizedTarget.name || null,
  })
}

