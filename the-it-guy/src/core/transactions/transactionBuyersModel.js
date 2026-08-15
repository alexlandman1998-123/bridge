export const TRANSACTION_BUYERS_MODEL_VERSION = 'transaction_buyers_phase1_v1'

export const TRANSACTION_BUYER_ROLES = Object.freeze({
  primary: 'primary_buyer',
  additional: 'additional_buyer',
})

export const TRANSACTION_BUYER_PROFILE_STATUSES = Object.freeze({
  draft: 'draft',
  invited: 'invited',
  inProgress: 'in_progress',
  captured: 'captured',
  completed: 'completed',
  inactive: 'inactive',
})

export const TRANSACTION_BUYER_ONBOARDING_STATUSES = Object.freeze({
  notStarted: 'not_started',
  sent: 'sent',
  inProgress: 'in_progress',
  completed: 'completed',
  manuallyCaptured: 'manually_captured',
  blocked: 'blocked',
})

export const TRANSACTION_BUYER_PORTAL_STATUSES = Object.freeze({
  notSent: 'not_sent',
  ready: 'ready',
  sent: 'sent',
  active: 'active',
  blocked: 'blocked',
  revoked: 'revoked',
})

const BUYER_ROLE_VALUES = new Set([
  'buyer',
  'client',
  'purchaser',
  'primary_buyer',
  'additional_buyer',
  'co_buyer',
])

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function bool(value) {
  if (value === true || value === false) return value
  const normalized = lower(value)
  if (['true', 'yes', '1', 'primary'].includes(normalized)) return true
  if (['false', 'no', '0', 'secondary', 'additional'].includes(normalized)) return false
  return false
}

function fullName(record = {}) {
  const direct = firstText(
    record.name,
    record.fullName,
    record.full_name,
    record.displayName,
    record.display_name,
    record.participantName,
    record.buyerName,
    record.buyer_name,
    record.clientName,
    record.client_name,
    record.contactName,
    record.contact_name,
  )
  if (direct) return direct
  return [record.firstName || record.first_name, record.lastName || record.last_name]
    .map(text)
    .filter(Boolean)
    .join(' ')
}

function email(record = {}) {
  return lower(
    firstText(
      record.email,
      record.participantEmail,
      record.participant_email,
      record.buyerEmail,
      record.buyer_email,
      record.clientEmail,
      record.client_email,
    ),
  )
}

function phone(record = {}) {
  return firstText(
    record.phone,
    record.mobile,
    record.participantPhone,
    record.participant_phone,
    record.buyerPhone,
    record.buyer_phone,
    record.clientPhone,
    record.client_phone,
  )
}

function statusValue(value, fallback) {
  return lower(value) || fallback
}

function buyerRole(record = {}, isPrimary = false) {
  const rawRole = lower(record.buyerPartyRole || record.buyer_party_role || record.partyRole || record.party_role)
  if (rawRole === TRANSACTION_BUYER_ROLES.primary || rawRole === TRANSACTION_BUYER_ROLES.additional) return rawRole
  return isPrimary ? TRANSACTION_BUYER_ROLES.primary : TRANSACTION_BUYER_ROLES.additional
}

function buyerSource(record = {}, fallback = '') {
  return lower(
    firstText(
      record.source,
      record.buyerSource,
      record.buyer_source,
      record.selectionSource,
      record.selection_source,
      fallback,
    ),
  )
}

function participantLooksLikeBuyer(record = {}) {
  const role = lower(record.transactionRole || record.transaction_role || record.roleType || record.role_type || record.role || record.type)
  return BUYER_ROLE_VALUES.has(role)
}

function rawBuyerCandidates(transaction = {}) {
  const explicit = [
    transaction.buyers,
    transaction.transactionBuyers,
    transaction.transaction_buyers,
    transaction.buyerParties,
    transaction.buyer_parties,
    transaction.buyerParticipants,
    transaction.buyer_participants,
  ].find(Array.isArray)

  const candidates = explicit ? [...explicit] : []
  const participants = [
    transaction.participants,
    transaction.transactionParticipants,
    transaction.transaction_participants,
  ].find(Array.isArray)
  if (participants) {
    candidates.push(...participants.filter(participantLooksLikeBuyer))
  }

  const nestedBuyer = transaction.buyer && typeof transaction.buyer === 'object'
    ? transaction.buyer
    : null
  const hasLegacyBuyer =
    nestedBuyer ||
    transaction.buyer_id ||
    transaction.buyerId ||
    transaction.buyer_name ||
    transaction.buyerName ||
    transaction.buyer_email ||
    transaction.buyerEmail

  if (hasLegacyBuyer && candidates.length === 0) {
    candidates.push({
      ...(nestedBuyer || {}),
      id: firstText(nestedBuyer?.id, transaction.buyer_id, transaction.buyerId),
      buyerId: firstText(nestedBuyer?.buyerId, transaction.buyer_id, transaction.buyerId),
      name: fullName(nestedBuyer || {}) || firstText(transaction.buyer_name, transaction.buyerName),
      email: email(nestedBuyer || {}) || firstText(transaction.buyer_email, transaction.buyerEmail),
      phone: phone(nestedBuyer || {}) || firstText(transaction.buyer_phone, transaction.buyerPhone),
      isPrimaryBuyer: true,
      buyerPartyRole: TRANSACTION_BUYER_ROLES.primary,
      source: 'legacy_transaction_buyer',
    })
  }

  return candidates
}

function buyerIdentity(record = {}, normalized = {}) {
  return firstText(
    normalized.participantId,
    normalized.buyerId,
    normalized.email ? `email:${normalized.email}` : '',
    normalized.name && normalized.phone ? `name-phone:${lower(normalized.name)}:${lower(normalized.phone)}` : '',
  )
}

export function normalizeTransactionBuyer(record = {}, options = {}) {
  const isPrimary = bool(
    record.isPrimaryBuyer ??
      record.is_primary_buyer ??
      record.primaryBuyer ??
      record.primary_buyer ??
      record.isPrimary ??
      record.is_primary,
  ) || text(options.primaryBuyerId) === firstText(record.participantId, record.participant_id, record.id)

  const normalized = {
    modelVersion: TRANSACTION_BUYERS_MODEL_VERSION,
    participantId: firstText(record.participantId, record.participant_id, record.id),
    buyerId: firstText(record.buyerId, record.buyer_id, record.buyerPartyId, record.buyer_party_id, record.clientId, record.client_id),
    transactionId: firstText(record.transactionId, record.transaction_id, options.transactionId),
    name: fullName(record),
    email: email(record),
    phone: phone(record),
    role: buyerRole(record, isPrimary),
    isPrimary,
    position: Number.isFinite(Number(record.position ?? record.buyerPartyPosition ?? record.buyer_party_position))
      ? Number(record.position ?? record.buyerPartyPosition ?? record.buyer_party_position)
      : Number(options.index || 0),
    profileStatus: statusValue(record.profileStatus || record.profile_status || record.buyerProfileStatus || record.buyer_profile_status, TRANSACTION_BUYER_PROFILE_STATUSES.draft),
    onboardingStatus: statusValue(record.onboardingStatus || record.onboarding_status || record.buyerOnboardingStatus || record.buyer_onboarding_status, TRANSACTION_BUYER_ONBOARDING_STATUSES.notStarted),
    portalInviteStatus: statusValue(record.portalInviteStatus || record.portal_invite_status || record.buyerPortalInviteStatus || record.buyer_portal_invite_status, TRANSACTION_BUYER_PORTAL_STATUSES.notSent),
    manualCaptureStatus: statusValue(record.manualCaptureStatus || record.manual_capture_status || record.buyerManualCaptureStatus || record.buyer_manual_capture_status, TRANSACTION_BUYER_ONBOARDING_STATUSES.notStarted),
    onboardingCompletedAt: firstText(record.onboardingCompletedAt, record.onboarding_completed_at, record.buyerOnboardingCompletedAt, record.buyer_onboarding_completed_at),
    manualCaptureCompletedAt: firstText(record.manualCaptureCompletedAt, record.manual_capture_completed_at, record.buyerManualCaptureCompletedAt, record.buyer_manual_capture_completed_at),
    portalInvitedAt: firstText(record.portalInvitedAt, record.portal_invited_at, record.buyerPortalInvitedAt, record.buyer_portal_invited_at),
    source: buyerSource(record, options.source),
    active: !['inactive', 'removed', 'archived', 'deleted'].includes(lower(record.status || record.participantStatus || record.participant_status)),
    metadata: (record.metadata || record.buyerMetadata || record.buyer_metadata) &&
      typeof (record.metadata || record.buyerMetadata || record.buyer_metadata) === 'object'
      ? { ...(record.metadata || record.buyerMetadata || record.buyer_metadata) }
      : {},
  }

  return Object.freeze({
    ...normalized,
    identityKey: buyerIdentity(record, normalized),
  })
}

export function resolveTransactionBuyers(transaction = {}) {
  const primaryBuyerParticipantId = firstText(
    transaction.primaryBuyerParticipantId,
    transaction.primary_buyer_participant_id,
  )
  const primaryBuyerId = firstText(
    transaction.primaryBuyerId,
    transaction.primary_buyer_id,
    transaction.buyer_id,
    transaction.buyerId,
  )

  const seen = new Set()
  const buyers = []
  rawBuyerCandidates(transaction).forEach((candidate, index) => {
    const buyer = normalizeTransactionBuyer(candidate, {
      index,
      primaryBuyerId: primaryBuyerParticipantId || primaryBuyerId,
      transactionId: firstText(transaction.id, transaction.transactionId, transaction.transaction_id),
      source: 'transaction_payload',
    })
    const key = buyer.identityKey || `buyer:${index}`
    if (seen.has(key)) return
    seen.add(key)
    buyers.push(buyer)
  })

  buyers.sort((left, right) => {
    if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1
    return left.position - right.position
  })

  const explicitPrimary = buyers.find((buyer) => buyer.isPrimary) || null
  const primaryBuyer = explicitPrimary || buyers[0] || null
  const normalizedBuyers = buyers.map((buyer, index) => Object.freeze({
    ...buyer,
    isPrimary: primaryBuyer ? buyer.identityKey === primaryBuyer.identityKey : index === 0,
    role: primaryBuyer && buyer.identityKey === primaryBuyer.identityKey
      ? TRANSACTION_BUYER_ROLES.primary
      : TRANSACTION_BUYER_ROLES.additional,
    position: index,
  }))

  return Object.freeze({
    modelVersion: TRANSACTION_BUYERS_MODEL_VERSION,
    transactionId: firstText(transaction.id, transaction.transactionId, transaction.transaction_id),
    buyers: Object.freeze(normalizedBuyers),
    primaryBuyer: normalizedBuyers.find((buyer) => buyer.isPrimary) || null,
    primaryBuyerId: normalizedBuyers.find((buyer) => buyer.isPrimary)?.buyerId || primaryBuyerId || null,
    primaryBuyerParticipantId: normalizedBuyers.find((buyer) => buyer.isPrimary)?.participantId || primaryBuyerParticipantId || null,
    hasMultipleBuyers: normalizedBuyers.filter((buyer) => buyer.active).length > 1,
    activeBuyerCount: normalizedBuyers.filter((buyer) => buyer.active).length,
    legacyBuyerId: firstText(transaction.buyer_id, transaction.buyerId) || null,
    legacyCompatible: true,
  })
}

export function buildTransactionBuyerParticipantRows(transaction = {}) {
  const model = resolveTransactionBuyers(transaction)
  return model.buyers.map((buyer) => ({
    id: buyer.participantId || undefined,
    transaction_id: model.transactionId || buyer.transactionId || null,
    buyer_party_id: buyer.buyerId || null,
    role_type: 'buyer',
    legal_role: 'none',
    transaction_role: 'buyer',
    participant_name: buyer.name || null,
    participant_email: buyer.email || null,
    participant_phone: buyer.phone || null,
    buyer_party_role: buyer.role,
    buyer_party_position: buyer.position,
    is_primary_buyer: buyer.isPrimary,
    buyer_profile_status: buyer.profileStatus,
    buyer_onboarding_status: buyer.onboardingStatus,
    buyer_manual_capture_status: buyer.manualCaptureStatus,
    buyer_portal_invite_status: buyer.portalInviteStatus,
    buyer_onboarding_completed_at: buyer.onboardingCompletedAt || null,
    buyer_manual_capture_completed_at: buyer.manualCaptureCompletedAt || null,
    buyer_portal_invited_at: buyer.portalInvitedAt || null,
    buyer_source: buyer.source || 'transaction_payload',
    buyer_metadata: {
      modelVersion: TRANSACTION_BUYERS_MODEL_VERSION,
      identityKey: buyer.identityKey,
      ...(buyer.metadata || {}),
    },
    status: buyer.active ? 'active' : 'inactive',
  }))
}
