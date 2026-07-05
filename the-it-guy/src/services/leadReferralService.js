import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const STORAGE_KEY = 'arch9.leadReferrals.v1'
const REFERRAL_SELECT_FIELDS = [
  'id',
  'source_organisation_id',
  'source_lead_id',
  'source_lead_type',
  'referral_type',
  'related_listing_id',
  'source_branch_id',
  'source_agent_id',
  'source_agent_email',
  'source_agent_name',
  'target_organisation_id',
  'target_branch_id',
  'target_agent_id',
  'target_agent_email',
  'target_agent_name',
  'target_company_name',
  'recipient_scope',
  'status',
  'commission_split_percentage',
  'commission_split_basis',
  'converted_transaction_id',
  'converted_deal_id',
  'converted_at',
  'gross_commission_amount',
  'referral_commission_amount',
  'commission_status',
  'commission_due_at',
  'commission_paid_at',
  'commission_payment_reference',
  'operational_priority',
  'next_follow_up_at',
  'last_follow_up_at',
  'follow_up_status',
  'lost_reason',
  'lost_at',
  'agreement_status',
  'agreement_text',
  'protection_period_days',
  'accepted_at',
  'accepted_by_user_id',
  'accepted_by_email',
  'declined_at',
  'declined_by_user_id',
  'declined_by_email',
  'decline_reason',
  'agreement_locked_at',
  'invite_token',
  'invite_expires_at',
  'notes',
  'created_at',
  'updated_at',
]
const REFERRAL_LEDGER_SELECT = `
  ${REFERRAL_SELECT_FIELDS.join(', ')},
  referral_clients (
    id,
    referral_id,
    source_organisation_id,
    source_lead_id,
    client_type,
    client_name,
    client_email,
    client_phone,
    client_context,
    client_status,
    metadata,
    created_at,
    updated_at
  ),
  referral_agreements (
    id,
    referral_id,
    version,
    status,
    commission_split_percentage,
    commission_split_basis,
    agreement_text,
    sent_at,
    accepted_at,
    declined_at,
    accepted_by_email,
    protection_period_days,
    accepted_by_user_id,
    declined_by_user_id,
    declined_by_email,
    decline_reason,
    locked_at,
    created_by,
    created_at,
    updated_at
  ),
  referral_status_events (
    id,
    referral_id,
    from_status,
    to_status,
    event_type,
    event_note,
    actor_id,
    actor_email,
    metadata,
    created_at
  ),
  referral_invites (
    id,
    referral_id,
    token,
    email,
    status,
    expires_at,
    first_sent_at,
    last_sent_at,
    accepted_at,
    accepted_by_user_id,
    declined_at,
    declined_by_user_id,
    decline_reason,
    metadata,
    created_at,
    updated_at
  ),
  referral_commission_events (
    id,
    referral_id,
    transaction_id,
    deal_id,
    event_type,
    gross_commission_amount,
    referral_commission_amount,
    commission_split_percentage,
    commission_status,
    payment_reference,
    event_note,
    actor_id,
    actor_email,
    metadata,
    created_at
  )
`

const COMMISSION_STATUSES = Object.freeze([
  'not_applicable',
  'pending',
  'due',
  'paid',
  'waived',
  'disputed',
])

export const REFERRAL_STATUSES = Object.freeze([
  'draft',
  'sent',
  'received',
  'accepted',
  'declined',
  'needs_review',
  'contacted',
  'working',
  'converted',
  'lost',
  'commission_due',
  'paid',
  'cancelled',
])

export const REFERRAL_TYPES = Object.freeze({
  clientReferral: 'client_referral',
  buyerIntroduction: 'buyer_introduction',
  listingCollaboration: 'listing_collaboration',
  externalReferral: 'external_referral',
})

export const REFERRAL_TYPE_LABELS = Object.freeze({
  [REFERRAL_TYPES.clientReferral]: 'Client referral',
  [REFERRAL_TYPES.buyerIntroduction]: 'Buyer introduction',
  [REFERRAL_TYPES.listingCollaboration]: 'Listing collaboration',
  [REFERRAL_TYPES.externalReferral]: 'External referral',
})

const DEFAULT_PROTECTION_PERIOD_DAYS = 30

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeLeadType(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'seller') return 'seller'
  return 'buyer'
}

function normalizeReferralType(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'buyer_intro' || normalized === 'buyer-introduction') return REFERRAL_TYPES.buyerIntroduction
  if (normalized === 'buyer_introduction') return REFERRAL_TYPES.buyerIntroduction
  if (normalized === 'listing_collab' || normalized === 'listing-collaboration') return REFERRAL_TYPES.listingCollaboration
  if (normalized === 'listing_collaboration') return REFERRAL_TYPES.listingCollaboration
  if (normalized === 'external' || normalized === 'external-referral') return REFERRAL_TYPES.externalReferral
  if (normalized === 'external_referral') return REFERRAL_TYPES.externalReferral
  return REFERRAL_TYPES.clientReferral
}

function normalizeProtectionPeriodDays(value = '', fallback = DEFAULT_PROTECTION_PERIOD_DAYS) {
  const number = Number.parseInt(value, 10)
  if (!Number.isFinite(number)) return fallback
  return Math.min(3650, Math.max(1, number))
}

function normalizeRecipientScope(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'internal') return 'internal'
  if (normalized === 'external_arch9') return 'external_arch9'
  if (normalized === 'external_invite') return 'external_invite'
  return 'external_invite'
}

function normalizeReferralStatus(value = '', fallback = 'sent') {
  const normalized = normalizeText(value).toLowerCase()
  return REFERRAL_STATUSES.includes(normalized) ? normalized : fallback
}

function normalizeAgreementStatus(value = '', fallback = 'pending') {
  const normalized = normalizeText(value).toLowerCase()
  if (['pending', 'sent', 'accepted', 'declined', 'superseded'].includes(normalized)) return normalized
  return fallback
}

function normalizeClientStatus(value = '', fallback = 'referred') {
  const normalized = normalizeText(value).toLowerCase()
  if (['referred', 'accepted', 'contacted', 'working', 'converted', 'lost', 'archived'].includes(normalized)) return normalized
  return fallback
}

function normalizeCommissionStatus(value = '', fallback = 'not_applicable') {
  const normalized = normalizeText(value).toLowerCase()
  return COMMISSION_STATUSES.includes(normalized) ? normalized : fallback
}

function normalizeOperationalPriority(value = '', fallback = 'normal') {
  const normalized = normalizeText(value).toLowerCase()
  if (['low', 'normal', 'high', 'urgent'].includes(normalized)) return normalized
  return fallback
}

function normalizeFollowUpStatus(value = '', fallback = 'open') {
  const normalized = normalizeText(value).toLowerCase()
  if (['open', 'due', 'done', 'paused'].includes(normalized)) return normalized
  return fallback
}

function normalizeMoney(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function getReferralTypeLabel(value = '') {
  const referralType = normalizeReferralType(value)
  return REFERRAL_TYPE_LABELS[referralType] || REFERRAL_TYPE_LABELS[REFERRAL_TYPES.clientReferral]
}

export function getDefaultReferralCommissionSplit(input = {}) {
  const referralType = normalizeReferralType(input.referralType || input.type)
  const recipientScopeInput = normalizeText(input.recipientScope)
  const recipientScope = recipientScopeInput ? normalizeRecipientScope(recipientScopeInput) : ''
  const sourceBranchId = normalizeText(input.sourceBranchId || input.source_branch_id)
  const targetBranchId = normalizeText(input.targetBranchId || input.target_branch_id)

  if (referralType === REFERRAL_TYPES.buyerIntroduction || referralType === REFERRAL_TYPES.listingCollaboration) {
    return 50
  }

  if (referralType === REFERRAL_TYPES.externalReferral || recipientScope === 'external_invite' || recipientScope === 'external_arch9') {
    return 20
  }

  if (sourceBranchId && targetBranchId && sourceBranchId !== targetBranchId) {
    return 15
  }

  return 10
}

export function resolveReferralCommissionSplit(input = {}) {
  const explicitSplit = normalizeMoney(input.commissionSplitPercentage ?? input.proposedCommissionPercentage)
  return explicitSplit ?? getDefaultReferralCommissionSplit(input)
}

function createUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const seed = `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`.padEnd(32, '0').slice(0, 32)
  return `${seed.slice(0, 8)}-${seed.slice(8, 12)}-4${seed.slice(13, 16)}-8${seed.slice(17, 20)}-${seed.slice(20, 32)}`
}

function safeLocalRows() {
  if (typeof window === 'undefined' || !window.localStorage) return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLocalRows(rows = []) {
  if (typeof window === 'undefined' || !window.localStorage) return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(rows) ? rows : []))
}

function firstRelated(row = {}, key = '') {
  const value = row?.[key]
  if (Array.isArray(value)) return value[0] || null
  return value && typeof value === 'object' ? value : null
}

function relatedList(row = {}, key = '') {
  const value = row?.[key]
  if (Array.isArray(value)) return value
  return value && typeof value === 'object' ? [value] : []
}

function sortNewestFirst(rows = []) {
  return [...rows].sort((a, b) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime())
}

function mapClientRow(row = {}) {
  if (!row || typeof row !== 'object') return null
  return {
    id: normalizeText(row.id),
    referralId: normalizeText(row.referral_id || row.referralId),
    sourceOrganisationId: normalizeText(row.source_organisation_id || row.sourceOrganisationId),
    sourceLeadId: normalizeText(row.source_lead_id || row.sourceLeadId),
    clientType: normalizeLeadType(row.client_type || row.clientType),
    clientName: normalizeText(row.client_name || row.clientName),
    clientEmail: normalizeEmail(row.client_email || row.clientEmail),
    clientPhone: normalizeText(row.client_phone || row.clientPhone),
    clientContext: normalizeText(row.client_context || row.clientContext),
    clientStatus: normalizeClientStatus(row.client_status || row.clientStatus),
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString(),
  }
}

function mapAgreementRow(row = {}) {
  if (!row || typeof row !== 'object') return null
  return {
    id: normalizeText(row.id),
    referralId: normalizeText(row.referral_id || row.referralId),
    version: Number(row.version || 1) || 1,
    status: normalizeAgreementStatus(row.status),
    commissionSplitPercentage: row.commission_split_percentage ?? row.commissionSplitPercentage ?? null,
    commissionSplitBasis: normalizeText(row.commission_split_basis || row.commissionSplitBasis) || 'gross_commission',
    agreementText: normalizeText(row.agreement_text || row.agreementText),
    sentAt: row.sent_at || row.sentAt || null,
    acceptedAt: row.accepted_at || row.acceptedAt || null,
    declinedAt: row.declined_at || row.declinedAt || null,
    protectionPeriodDays: normalizeProtectionPeriodDays(row.protection_period_days ?? row.protectionPeriodDays),
    acceptedByUserId: normalizeText(row.accepted_by_user_id || row.acceptedByUserId),
    acceptedByEmail: normalizeEmail(row.accepted_by_email || row.acceptedByEmail),
    declinedByUserId: normalizeText(row.declined_by_user_id || row.declinedByUserId),
    declinedByEmail: normalizeEmail(row.declined_by_email || row.declinedByEmail),
    declineReason: normalizeText(row.decline_reason || row.declineReason),
    lockedAt: row.locked_at || row.lockedAt || null,
    createdBy: normalizeText(row.created_by || row.createdBy),
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString(),
  }
}

function mapStatusEventRow(row = {}) {
  if (!row || typeof row !== 'object') return null
  return {
    id: normalizeText(row.id),
    referralId: normalizeText(row.referral_id || row.referralId),
    fromStatus: normalizeReferralStatus(row.from_status || row.fromStatus, ''),
    toStatus: normalizeReferralStatus(row.to_status || row.toStatus),
    eventType: normalizeText(row.event_type || row.eventType) || 'status_change',
    eventNote: normalizeText(row.event_note || row.eventNote),
    actorId: normalizeText(row.actor_id || row.actorId),
    actorEmail: normalizeEmail(row.actor_email || row.actorEmail),
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
  }
}

function mapInviteRow(row = {}) {
  if (!row || typeof row !== 'object') return null
  return {
    id: normalizeText(row.id),
    referralId: normalizeText(row.referral_id || row.referralId),
    token: normalizeText(row.token || row.inviteToken),
    email: normalizeEmail(row.email),
    status: normalizeText(row.status) || 'pending',
    expiresAt: row.expires_at || row.expiresAt || null,
    firstSentAt: row.first_sent_at || row.firstSentAt || null,
    lastSentAt: row.last_sent_at || row.lastSentAt || null,
    acceptedAt: row.accepted_at || row.acceptedAt || null,
    acceptedByUserId: normalizeText(row.accepted_by_user_id || row.acceptedByUserId),
    declinedAt: row.declined_at || row.declinedAt || null,
    declinedByUserId: normalizeText(row.declined_by_user_id || row.declinedByUserId),
    declineReason: normalizeText(row.decline_reason || row.declineReason),
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString(),
  }
}

function mapCommissionEventRow(row = {}) {
  if (!row || typeof row !== 'object') return null
  return {
    id: normalizeText(row.id),
    referralId: normalizeText(row.referral_id || row.referralId),
    transactionId: normalizeText(row.transaction_id || row.transactionId),
    dealId: normalizeText(row.deal_id || row.dealId),
    eventType: normalizeText(row.event_type || row.eventType) || 'conversion_recorded',
    grossCommissionAmount: normalizeMoney(row.gross_commission_amount ?? row.grossCommissionAmount),
    referralCommissionAmount: normalizeMoney(row.referral_commission_amount ?? row.referralCommissionAmount),
    commissionSplitPercentage: normalizeMoney(row.commission_split_percentage ?? row.commissionSplitPercentage),
    commissionStatus: normalizeCommissionStatus(row.commission_status || row.commissionStatus, 'pending'),
    paymentReference: normalizeText(row.payment_reference || row.paymentReference),
    eventNote: normalizeText(row.event_note || row.eventNote),
    actorId: normalizeText(row.actor_id || row.actorId),
    actorEmail: normalizeEmail(row.actor_email || row.actorEmail),
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
  }
}

function mapReferralRow(row = {}) {
  const client = mapClientRow(firstRelated(row, 'referral_clients') || row.client)
  const agreements = [
    ...relatedList(row, 'referral_agreements'),
    ...relatedList(row, 'agreements'),
    row.latestAgreement,
  ].map(mapAgreementRow).filter(Boolean)
  const events = sortNewestFirst([
    ...relatedList(row, 'referral_status_events'),
    ...relatedList(row, 'events'),
    row.latestEvent,
  ].map(mapStatusEventRow).filter(Boolean))
  const invite = mapInviteRow(firstRelated(row, 'referral_invites') || row.invite)
  const commissionEvents = sortNewestFirst([
    ...relatedList(row, 'referral_commission_events'),
    ...relatedList(row, 'commissionEvents'),
    row.latestCommissionEvent,
  ].map(mapCommissionEventRow).filter(Boolean))
  const latestAgreement = sortNewestFirst(agreements)[0] || null
  return {
    id: normalizeText(row.id),
    sourceOrganisationId: normalizeText(row.source_organisation_id || row.sourceOrganisationId),
    sourceLeadId: normalizeText(row.source_lead_id || row.sourceLeadId),
    sourceLeadType: normalizeLeadType(row.source_lead_type || row.sourceLeadType || client?.clientType),
    referralType: normalizeReferralType(row.referral_type || row.referralType),
    referralTypeLabel: getReferralTypeLabel(row.referral_type || row.referralType),
    relatedListingId: normalizeText(row.related_listing_id || row.relatedListingId),
    sourceBranchId: normalizeText(row.source_branch_id || row.sourceBranchId),
    sourceAgentId: normalizeText(row.source_agent_id || row.sourceAgentId),
    sourceAgentEmail: normalizeEmail(row.source_agent_email || row.sourceAgentEmail),
    sourceAgentName: normalizeText(row.source_agent_name || row.sourceAgentName),
    targetOrganisationId: normalizeText(row.target_organisation_id || row.targetOrganisationId),
    targetBranchId: normalizeText(row.target_branch_id || row.targetBranchId),
    targetAgentId: normalizeText(row.target_agent_id || row.targetAgentId),
    targetAgentEmail: normalizeEmail(row.target_agent_email || row.targetAgentEmail),
    targetAgentName: normalizeText(row.target_agent_name || row.targetAgentName),
    targetCompanyName: normalizeText(row.target_company_name || row.targetCompanyName),
    recipientScope: normalizeRecipientScope(row.recipient_scope || row.recipientScope),
    status: normalizeReferralStatus(row.status),
    commissionSplitPercentage: latestAgreement?.commissionSplitPercentage ?? row.commission_split_percentage ?? row.commissionSplitPercentage ?? null,
    commissionSplitBasis: latestAgreement?.commissionSplitBasis || normalizeText(row.commission_split_basis || row.commissionSplitBasis) || 'gross_commission',
    convertedTransactionId: normalizeText(row.converted_transaction_id || row.convertedTransactionId),
    convertedDealId: normalizeText(row.converted_deal_id || row.convertedDealId),
    convertedAt: row.converted_at || row.convertedAt || null,
    grossCommissionAmount: normalizeMoney(row.gross_commission_amount ?? row.grossCommissionAmount),
    referralCommissionAmount: normalizeMoney(row.referral_commission_amount ?? row.referralCommissionAmount),
    commissionStatus: normalizeCommissionStatus(row.commission_status || row.commissionStatus),
    commissionDueAt: row.commission_due_at || row.commissionDueAt || null,
    commissionPaidAt: row.commission_paid_at || row.commissionPaidAt || null,
    commissionPaymentReference: normalizeText(row.commission_payment_reference || row.commissionPaymentReference),
    operationalPriority: normalizeOperationalPriority(row.operational_priority || row.operationalPriority),
    nextFollowUpAt: row.next_follow_up_at || row.nextFollowUpAt || null,
    lastFollowUpAt: row.last_follow_up_at || row.lastFollowUpAt || null,
    followUpStatus: normalizeFollowUpStatus(row.follow_up_status || row.followUpStatus),
    lostReason: normalizeText(row.lost_reason || row.lostReason),
    lostAt: row.lost_at || row.lostAt || null,
    agreementStatus: latestAgreement?.status || normalizeAgreementStatus(row.agreement_status || row.agreementStatus),
    agreementText: latestAgreement?.agreementText || normalizeText(row.agreement_text || row.agreementText),
    protectionPeriodDays: latestAgreement?.protectionPeriodDays || normalizeProtectionPeriodDays(row.protection_period_days ?? row.protectionPeriodDays),
    acceptedAt: row.accepted_at || row.acceptedAt || latestAgreement?.acceptedAt || null,
    acceptedByUserId: normalizeText(row.accepted_by_user_id || row.acceptedByUserId || latestAgreement?.acceptedByUserId),
    acceptedByEmail: normalizeEmail(row.accepted_by_email || row.acceptedByEmail || latestAgreement?.acceptedByEmail),
    declinedAt: row.declined_at || row.declinedAt || latestAgreement?.declinedAt || null,
    declinedByUserId: normalizeText(row.declined_by_user_id || row.declinedByUserId || latestAgreement?.declinedByUserId),
    declinedByEmail: normalizeEmail(row.declined_by_email || row.declinedByEmail || latestAgreement?.declinedByEmail),
    declineReason: normalizeText(row.decline_reason || row.declineReason || latestAgreement?.declineReason),
    agreementLockedAt: row.agreement_locked_at || row.agreementLockedAt || latestAgreement?.lockedAt || null,
    inviteToken: invite?.token || normalizeText(row.invite_token || row.inviteToken),
    inviteExpiresAt: invite?.expiresAt || row.invite_expires_at || row.inviteExpiresAt || null,
    inviteLink: buildReferralInviteLink(invite?.token || row.invite_token || row.inviteToken),
    client,
    agreements,
    latestAgreement,
    events,
    latestEvent: events[0] || null,
    commissionEvents,
    latestCommissionEvent: commissionEvents[0] || null,
    invite,
    clientName: client?.clientName || normalizeText(row.clientName || row.client_name),
    clientEmail: client?.clientEmail || normalizeEmail(row.clientEmail || row.client_email),
    clientPhone: client?.clientPhone || normalizeText(row.clientPhone || row.client_phone),
    clientContext: client?.clientContext || normalizeText(row.clientContext || row.client_context),
    notes: normalizeText(row.notes),
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString(),
  }
}

function toDatabasePayload(referral = {}) {
  return {
    id: normalizeText(referral.id) || createUuid(),
    source_organisation_id: normalizeText(referral.sourceOrganisationId),
    source_lead_id: normalizeText(referral.sourceLeadId) || null,
    source_lead_type: normalizeLeadType(referral.sourceLeadType),
    referral_type: normalizeReferralType(referral.referralType),
    related_listing_id: normalizeText(referral.relatedListingId) || null,
    source_branch_id: normalizeText(referral.sourceBranchId) || null,
    source_agent_id: normalizeText(referral.sourceAgentId) || null,
    source_agent_email: normalizeEmail(referral.sourceAgentEmail) || null,
    source_agent_name: normalizeText(referral.sourceAgentName) || null,
    target_organisation_id: normalizeText(referral.targetOrganisationId) || null,
    target_branch_id: normalizeText(referral.targetBranchId) || null,
    target_agent_id: normalizeText(referral.targetAgentId) || null,
    target_agent_email: normalizeEmail(referral.targetAgentEmail) || null,
    target_agent_name: normalizeText(referral.targetAgentName) || null,
    target_company_name: normalizeText(referral.targetCompanyName) || null,
    recipient_scope: normalizeRecipientScope(referral.recipientScope),
    status: normalizeReferralStatus(referral.status),
    commission_split_percentage: referral.commissionSplitPercentage === '' || referral.commissionSplitPercentage == null
      ? null
      : Number(referral.commissionSplitPercentage),
    commission_split_basis: normalizeText(referral.commissionSplitBasis) || 'gross_commission',
    converted_transaction_id: normalizeText(referral.convertedTransactionId) || null,
    converted_deal_id: normalizeText(referral.convertedDealId) || null,
    converted_at: referral.convertedAt || null,
    gross_commission_amount: normalizeMoney(referral.grossCommissionAmount),
    referral_commission_amount: normalizeMoney(referral.referralCommissionAmount),
    commission_status: normalizeCommissionStatus(referral.commissionStatus),
    commission_due_at: referral.commissionDueAt || null,
    commission_paid_at: referral.commissionPaidAt || null,
    commission_payment_reference: normalizeText(referral.commissionPaymentReference) || null,
    operational_priority: normalizeOperationalPriority(referral.operationalPriority),
    next_follow_up_at: referral.nextFollowUpAt || null,
    last_follow_up_at: referral.lastFollowUpAt || null,
    follow_up_status: normalizeFollowUpStatus(referral.followUpStatus),
    lost_reason: normalizeText(referral.lostReason) || null,
    lost_at: referral.lostAt || null,
    agreement_status: normalizeAgreementStatus(referral.agreementStatus),
    agreement_text: normalizeText(referral.agreementText) || null,
    protection_period_days: normalizeProtectionPeriodDays(referral.protectionPeriodDays),
    accepted_at: referral.acceptedAt || null,
    accepted_by_user_id: normalizeText(referral.acceptedByUserId) || null,
    accepted_by_email: normalizeEmail(referral.acceptedByEmail) || null,
    declined_at: referral.declinedAt || null,
    declined_by_user_id: normalizeText(referral.declinedByUserId) || null,
    declined_by_email: normalizeEmail(referral.declinedByEmail) || null,
    decline_reason: normalizeText(referral.declineReason) || null,
    agreement_locked_at: referral.agreementLockedAt || null,
    invite_token: normalizeText(referral.inviteToken) || null,
    invite_expires_at: referral.inviteExpiresAt || null,
    notes: normalizeText(referral.notes) || null,
    updated_at: new Date().toISOString(),
  }
}

function buildInviteToken() {
  return `ref_${createUuid().replace(/-/g, '')}`
}

export function buildReferralInviteLink(token = '') {
  const safeToken = normalizeText(token)
  if (!safeToken) return ''
  const path = `/referrals/invite/${encodeURIComponent(safeToken)}`
  if (typeof window === 'undefined' || !window.location?.origin) return path
  return `${window.location.origin}${path}`
}

function buildClientSnapshot(input = {}, referral = {}) {
  return {
    id: normalizeText(input.clientId) || createUuid(),
    referralId: referral.id,
    sourceOrganisationId: referral.sourceOrganisationId,
    sourceLeadId: referral.sourceLeadId,
    clientType: referral.sourceLeadType,
    clientName: normalizeText(input.clientName || input.name) || 'Referral client',
    clientEmail: normalizeEmail(input.clientEmail || input.email),
    clientPhone: normalizeText(input.clientPhone || input.phone),
    clientContext: normalizeText(input.clientContext || input.propertyContext || input.clientNotes),
    clientStatus: 'referred',
    metadata: input.clientMetadata && typeof input.clientMetadata === 'object' ? input.clientMetadata : {},
    createdAt: referral.createdAt,
    updatedAt: referral.updatedAt,
  }
}

function buildAgreementSnapshot(referral = {}, actor = null) {
  return {
    id: createUuid(),
    referralId: referral.id,
    version: 1,
    status: normalizeAgreementStatus(referral.agreementStatus),
    commissionSplitPercentage: referral.commissionSplitPercentage === '' || referral.commissionSplitPercentage == null
      ? null
      : Number(referral.commissionSplitPercentage),
    commissionSplitBasis: referral.commissionSplitBasis || 'gross_commission',
    agreementText: referral.agreementText,
    protectionPeriodDays: normalizeProtectionPeriodDays(referral.protectionPeriodDays),
    sentAt: null,
    acceptedAt: null,
    declinedAt: null,
    acceptedByUserId: '',
    acceptedByEmail: '',
    declinedByUserId: '',
    declinedByEmail: '',
    declineReason: '',
    lockedAt: null,
    createdBy: normalizeText(actor?.id || actor?.userId),
    createdAt: referral.createdAt,
    updatedAt: referral.updatedAt,
  }
}

function buildInitialStatusEvent(referral = {}, actor = null) {
  return {
    id: createUuid(),
    referralId: referral.id,
    fromStatus: '',
    toStatus: referral.status,
    eventType: 'referral_created',
    eventNote: referral.recipientScope === 'external_invite'
      ? 'Referral created and external invite token generated.'
      : 'Referral created.',
    actorId: normalizeText(actor?.id || actor?.userId),
    actorEmail: normalizeEmail(actor?.email || referral.sourceAgentEmail),
    metadata: {
      recipientScope: referral.recipientScope,
      sourceLeadType: referral.sourceLeadType,
      referralType: referral.referralType,
      relatedListingId: referral.relatedListingId,
      protectionPeriodDays: referral.protectionPeriodDays,
    },
    createdAt: referral.createdAt,
  }
}

function buildReferralInvite(referral = {}) {
  if (referral.recipientScope !== 'external_invite' || !referral.inviteToken) return null
  return {
    id: createUuid(),
    referralId: referral.id,
    token: referral.inviteToken,
    email: referral.targetAgentEmail,
    status: 'pending',
    expiresAt: referral.inviteExpiresAt,
    firstSentAt: null,
    lastSentAt: null,
    acceptedAt: null,
    acceptedByUserId: '',
    declinedAt: null,
    declinedByUserId: '',
    declineReason: '',
    metadata: {
      targetAgentName: referral.targetAgentName,
      targetCompanyName: referral.targetCompanyName,
      referralType: referral.referralType,
      relatedListingId: referral.relatedListingId,
      protectionPeriodDays: referral.protectionPeriodDays,
    },
    createdAt: referral.createdAt,
    updatedAt: referral.updatedAt,
  }
}

function clientToDatabasePayload(client = {}) {
  return {
    id: client.id,
    referral_id: client.referralId,
    source_organisation_id: client.sourceOrganisationId,
    source_lead_id: client.sourceLeadId || null,
    client_type: client.clientType,
    client_name: client.clientName,
    client_email: client.clientEmail || null,
    client_phone: client.clientPhone || null,
    client_context: client.clientContext || null,
    client_status: client.clientStatus,
    metadata: client.metadata || {},
    created_at: client.createdAt,
    updated_at: client.updatedAt,
  }
}

function agreementToDatabasePayload(agreement = {}) {
  return {
    id: agreement.id,
    referral_id: agreement.referralId,
    version: agreement.version,
    status: agreement.status,
    commission_split_percentage: agreement.commissionSplitPercentage,
    commission_split_basis: agreement.commissionSplitBasis,
    agreement_text: agreement.agreementText,
    sent_at: agreement.sentAt,
    accepted_at: agreement.acceptedAt,
    declined_at: agreement.declinedAt,
    protection_period_days: normalizeProtectionPeriodDays(agreement.protectionPeriodDays),
    accepted_by_user_id: agreement.acceptedByUserId || null,
    accepted_by_email: agreement.acceptedByEmail || null,
    declined_by_user_id: agreement.declinedByUserId || null,
    declined_by_email: agreement.declinedByEmail || null,
    decline_reason: agreement.declineReason || null,
    locked_at: agreement.lockedAt || null,
    created_by: agreement.createdBy || null,
    created_at: agreement.createdAt,
    updated_at: agreement.updatedAt,
  }
}

function eventToDatabasePayload(event = {}) {
  return {
    id: event.id,
    referral_id: event.referralId,
    from_status: event.fromStatus || null,
    to_status: event.toStatus,
    event_type: event.eventType,
    event_note: event.eventNote || null,
    actor_id: event.actorId || null,
    actor_email: event.actorEmail || null,
    metadata: event.metadata || {},
    created_at: event.createdAt,
  }
}

function inviteToDatabasePayload(invite = {}) {
  return {
    id: invite.id,
    referral_id: invite.referralId,
    token: invite.token,
    email: invite.email,
    status: invite.status,
    expires_at: invite.expiresAt,
    first_sent_at: invite.firstSentAt,
    last_sent_at: invite.lastSentAt,
    accepted_at: invite.acceptedAt,
    accepted_by_user_id: invite.acceptedByUserId || null,
    declined_at: invite.declinedAt,
    declined_by_user_id: invite.declinedByUserId || null,
    decline_reason: invite.declineReason || null,
    metadata: invite.metadata || {},
    created_at: invite.createdAt,
    updated_at: invite.updatedAt,
  }
}

function commissionEventToDatabasePayload(event = {}) {
  return {
    id: event.id,
    referral_id: event.referralId,
    transaction_id: event.transactionId || null,
    deal_id: event.dealId || null,
    event_type: event.eventType,
    gross_commission_amount: normalizeMoney(event.grossCommissionAmount),
    referral_commission_amount: normalizeMoney(event.referralCommissionAmount),
    commission_split_percentage: normalizeMoney(event.commissionSplitPercentage),
    commission_status: normalizeCommissionStatus(event.commissionStatus, 'pending'),
    payment_reference: event.paymentReference || null,
    event_note: event.eventNote || null,
    actor_id: event.actorId || null,
    actor_email: event.actorEmail || null,
    metadata: event.metadata || {},
    created_at: event.createdAt,
  }
}

export function calculateReferralCommission({ grossCommissionAmount = 0, commissionSplitPercentage = 0 } = {}) {
  const gross = normalizeMoney(grossCommissionAmount) || 0
  const split = normalizeMoney(commissionSplitPercentage) || 0
  if (gross <= 0 || split <= 0) return 0
  return Math.round((gross * split / 100) * 100) / 100
}

export function buildReferralAgreementText(referral = {}) {
  const leadType = normalizeLeadType(referral.sourceLeadType)
  const referralType = normalizeReferralType(referral.referralType)
  const referralTypeLabel = getReferralTypeLabel(referralType)
  const split = referral.commissionSplitPercentage === null || referral.commissionSplitPercentage === undefined || referral.commissionSplitPercentage === ''
    ? 'to be confirmed'
    : `${Number(referral.commissionSplitPercentage)}%`
  const basis = normalizeText(referral.commissionSplitBasis).replace(/_/g, ' ') || 'gross commission'
  const sender = normalizeText(referral.sourceAgentName || referral.sourceAgentEmail) || 'Referring agent'
  const recipient = normalizeText(referral.targetAgentName || referral.targetAgentEmail) || 'Receiving agent'
  const company = normalizeText(referral.targetCompanyName)
  const clientName = normalizeText(referral.clientName)
  const protectionPeriodDays = normalizeProtectionPeriodDays(referral.protectionPeriodDays)
  const listingReference = normalizeText(referral.relatedListingLabel || referral.relatedListingAddress || referral.relatedListingId)
  return [
    'Arch9 Referral Agreement',
    '',
    `Referral type: ${referralTypeLabel}`,
    `Client: ${clientName || 'Referral client'}`,
    `Lead type: ${leadType === 'seller' ? 'Seller lead' : 'Buyer lead'}`,
    listingReference ? `Related listing: ${listingReference}` : '',
    `Referring party: ${sender}`,
    `Receiving party: ${recipient}${company ? ` (${company})` : ''}`,
    `Protection period: ${protectionPeriodDays} days`,
    `Proposed commission terms: ${split} of ${basis}`,
    '',
    `The receiving party agrees that this ${referralTypeLabel.toLowerCase()} was referred by ${sender}. If this referral results in a successful sale, lease, mandate, transaction or other commissionable event within the protection period, the receiving party agrees that ${split} of the applicable ${basis} will be allocated to the referring party, subject to company approval and final commission reconciliation.`,
  ].filter(Boolean).join('\n')
}

async function findExistingArch9Recipient(email = '', { organisationId = '' } = {}) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail || !isSupabaseConfigured || !supabase) return null
  const scopedOrganisationId = normalizeText(organisationId)

  const membershipQuery = supabase
    .from('organisation_users')
    .select('id, organisation_id, user_id, branch_id, primary_branch_id, first_name, last_name, email, status')
    .ilike('email', normalizedEmail)
    .eq('status', 'active')
    .limit(1)
  if (scopedOrganisationId) membershipQuery.eq('organisation_id', scopedOrganisationId)
  const membershipResult = await membershipQuery.maybeSingle()
  if (!membershipResult.error && membershipResult.data?.id) {
    const row = membershipResult.data
    return {
      organisationId: normalizeText(row.organisation_id),
      userId: normalizeText(row.user_id),
      branchId: normalizeText(row.primary_branch_id || row.branch_id),
      name: [row.first_name, row.last_name].map(normalizeText).filter(Boolean).join(' '),
      email: normalizedEmail,
    }
  }

  const profileResult = await supabase
    .from('profiles')
    .select('id, full_name, first_name, last_name, email')
    .ilike('email', normalizedEmail)
    .limit(1)
    .maybeSingle()
  if (!profileResult.error && profileResult.data?.id) {
    const row = profileResult.data
    return {
      organisationId: '',
      userId: normalizeText(row.id),
      name: normalizeText(row.full_name) || [row.first_name, row.last_name].map(normalizeText).filter(Boolean).join(' '),
      email: normalizedEmail,
    }
  }

  return null
}

async function queryReferralRows({ organisationId = '', leadId = '', direction = 'all', selectFields = REFERRAL_LEDGER_SELECT } = {}) {
  const workspaceId = normalizeText(organisationId)
  const scopedLeadId = normalizeText(leadId)
  const scopedDirection = normalizeText(direction).toLowerCase()
  const sourceQuery = supabase
    .from('lead_referrals')
    .select(selectFields)
    .eq('source_organisation_id', workspaceId)
    .order('created_at', { ascending: false })
  const targetQuery = supabase
    .from('lead_referrals')
    .select(selectFields)
    .eq('target_organisation_id', workspaceId)
    .order('created_at', { ascending: false })
  if (scopedLeadId) {
    sourceQuery.eq('source_lead_id', scopedLeadId)
    targetQuery.eq('source_lead_id', scopedLeadId)
  }
  const [sourceResult, targetResult] = await Promise.all([
    scopedDirection === 'received' ? Promise.resolve({ data: [] }) : sourceQuery,
    scopedDirection === 'given' ? Promise.resolve({ data: [] }) : targetQuery,
  ])
  if (sourceResult.error) throw sourceResult.error
  if (targetResult.error) throw targetResult.error
  return [...(sourceResult.data || []), ...(targetResult.data || [])]
}

export async function listLeadReferrals({ organisationId = '', leadId = '', direction = 'all' } = {}) {
  const workspaceId = normalizeText(organisationId)
  const scopedLeadId = normalizeText(leadId)
  const scopedDirection = normalizeText(direction).toLowerCase()
  if (!workspaceId) return []

  if (isSupabaseConfigured && supabase) {
    try {
      const rows = await queryReferralRows({ organisationId: workspaceId, leadId: scopedLeadId, direction: scopedDirection })
      const rowsById = new Map()
      rows.forEach((row) => {
        const mapped = mapReferralRow(row)
        if (mapped.id) rowsById.set(mapped.id, mapped)
      })
      return sortNewestFirst(Array.from(rowsById.values()))
    } catch (ledgerError) {
      try {
        const rows = await queryReferralRows({
          organisationId: workspaceId,
          leadId: scopedLeadId,
          direction: scopedDirection,
          selectFields: REFERRAL_SELECT_FIELDS.join(', '),
        })
        const rowsById = new Map()
        rows.forEach((row) => {
          const mapped = mapReferralRow(row)
          if (mapped.id) rowsById.set(mapped.id, mapped)
        })
        return sortNewestFirst(Array.from(rowsById.values()))
      } catch {
        console.warn('[leadReferralService] referral ledger query failed', ledgerError)
      }
    }
  }

  return safeLocalRows()
    .map(mapReferralRow)
    .filter((row) => {
      if (scopedLeadId && row.sourceLeadId !== scopedLeadId) return false
      if (scopedDirection === 'given') return row.sourceOrganisationId === workspaceId
      if (scopedDirection === 'received') return row.targetOrganisationId === workspaceId
      return row.sourceOrganisationId === workspaceId || row.targetOrganisationId === workspaceId
    })
}

async function persistReferralLedger(referral = {}) {
  const payload = toDatabasePayload(referral)
  payload.created_at = referral.createdAt
  const result = await supabase
    .from('lead_referrals')
    .insert(payload)
    .select(REFERRAL_SELECT_FIELDS.join(', '))
    .single()
  if (result.error) throw result.error

  const childWrites = [
    supabase.from('referral_clients').insert(clientToDatabasePayload(referral.client)),
    supabase.from('referral_agreements').insert(agreementToDatabasePayload(referral.latestAgreement)),
    supabase.from('referral_status_events').insert(eventToDatabasePayload(referral.latestEvent)),
  ]
  if (referral.invite) {
    childWrites.push(supabase.from('referral_invites').insert(inviteToDatabasePayload(referral.invite)))
  }
  const childResults = await Promise.all(childWrites)
  const childError = childResults.find((childResult) => childResult.error)?.error
  if (childError) throw childError

  return mapReferralRow({
    ...(result.data || {}),
    referral_clients: [clientToDatabasePayload(referral.client)],
    referral_agreements: [agreementToDatabasePayload(referral.latestAgreement)],
    referral_status_events: [eventToDatabasePayload(referral.latestEvent)],
    referral_invites: referral.invite ? [inviteToDatabasePayload(referral.invite)] : [],
  })
}

export async function createLeadReferral(input = {}, { actor = null } = {}) {
  const sourceOrganisationId = normalizeText(input.sourceOrganisationId || input.organisationId)
  const targetEmail = normalizeEmail(input.targetAgentEmail || input.recipientEmail)
  if (!sourceOrganisationId) throw new Error('A source organisation is required before creating a referral.')
  if (!targetEmail) throw new Error('Recipient email is required before creating a referral.')

  const requestedScope = normalizeRecipientScope(input.recipientScope)
  const existingRecipient = await findExistingArch9Recipient(targetEmail, {
    organisationId: requestedScope === 'internal' ? sourceOrganisationId : '',
  }).catch(() => null)
  const recipientScope = requestedScope === 'internal'
    ? 'internal'
    : existingRecipient?.userId
      ? 'external_arch9'
      : 'external_invite'
  const nowIso = new Date().toISOString()
  const referral = {
    id: normalizeText(input.id) || createUuid(),
    sourceOrganisationId,
    sourceLeadId: normalizeText(input.sourceLeadId || input.leadId),
    sourceLeadType: normalizeLeadType(input.sourceLeadType || input.leadType),
    referralType: normalizeReferralType(input.referralType || input.type),
    relatedListingId: normalizeText(input.relatedListingId || input.listingId),
    relatedListingLabel: normalizeText(input.relatedListingLabel || input.relatedListingAddress || input.listingAddress),
    sourceBranchId: normalizeText(input.sourceBranchId || actor?.branchId || actor?.primaryBranchId),
    sourceAgentId: normalizeText(input.sourceAgentId || actor?.id || actor?.userId),
    sourceAgentEmail: normalizeEmail(input.sourceAgentEmail || actor?.email),
    sourceAgentName: normalizeText(input.sourceAgentName || actor?.name || actor?.fullName),
    targetOrganisationId: normalizeText(input.targetOrganisationId) || existingRecipient?.organisationId || (requestedScope === 'internal' ? sourceOrganisationId : ''),
    targetBranchId: normalizeText(input.targetBranchId || existingRecipient?.branchId),
    targetAgentId: normalizeText(input.targetAgentId) || existingRecipient?.userId || '',
    targetAgentEmail: targetEmail,
    targetAgentName: normalizeText(input.targetAgentName || existingRecipient?.name),
    targetCompanyName: normalizeText(input.targetCompanyName),
    recipientScope,
    status: 'sent',
    protectionPeriodDays: normalizeProtectionPeriodDays(input.protectionPeriodDays),
    commissionSplitPercentage: resolveReferralCommissionSplit({
      ...input,
      recipientScope,
      referralType: input.referralType || input.type,
      sourceBranchId: input.sourceBranchId || actor?.branchId || actor?.primaryBranchId,
      targetBranchId: input.targetBranchId || existingRecipient?.branchId,
    }),
    commissionSplitBasis: normalizeText(input.commissionSplitBasis) || 'gross_commission',
    agreementStatus: 'pending',
    inviteToken: recipientScope === 'external_invite' ? buildInviteToken() : '',
    inviteExpiresAt: recipientScope === 'external_invite' ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() : null,
    clientName: normalizeText(input.clientName || input.name),
    clientEmail: normalizeEmail(input.clientEmail || input.email),
    clientPhone: normalizeText(input.clientPhone || input.phone),
    clientContext: normalizeText(input.clientContext || input.propertyContext || input.clientNotes),
    notes: normalizeText(input.notes),
    createdAt: nowIso,
    updatedAt: nowIso,
  }
  referral.agreementText = normalizeText(input.agreementText) || buildReferralAgreementText(referral)
  referral.client = buildClientSnapshot(input, referral)
  referral.latestAgreement = buildAgreementSnapshot(referral, actor)
  referral.agreements = [referral.latestAgreement]
  referral.latestEvent = buildInitialStatusEvent(referral, actor)
  referral.events = [referral.latestEvent]
  referral.invite = buildReferralInvite(referral)
  referral.inviteLink = buildReferralInviteLink(referral.inviteToken)

  if (isSupabaseConfigured && supabase) {
    try {
      return await persistReferralLedger(referral)
    } catch (error) {
      console.warn('[leadReferralService] referral ledger persist failed; using local fallback', error)
    }
  }

  const rows = safeLocalRows()
  writeLocalRows([referral, ...rows.filter((row) => normalizeText(row.id) !== referral.id)])
  return mapReferralRow(referral)
}

function mapReferralInvitePayload(payload = {}) {
  const invite = mapInviteRow(payload.invite || {})
  const referral = mapReferralRow({
    ...(payload.referral || {}),
    client: payload.client || null,
    referral_clients: payload.client ? [payload.client] : [],
    referral_agreements: payload.agreement ? [payload.agreement] : [],
    referral_invites: payload.invite ? [payload.invite] : [],
  })
  return {
    ok: Boolean(payload.success),
    code: normalizeText(payload.code),
    responseStatus: normalizeText(payload.response_status || payload.responseStatus),
    invite,
    referral,
    client: referral.client,
    agreement: referral.latestAgreement,
    inviteLink: buildReferralInviteLink(invite?.token),
  }
}

function getLocalReferralInviteByToken(token = '') {
  const safeToken = normalizeText(token)
  if (!safeToken) return null
  const row = safeLocalRows().map(mapReferralRow).find((referral) => referral.inviteToken === safeToken || referral.invite?.token === safeToken)
  if (!row?.id) return null
  return {
    ok: true,
    code: '',
    invite: row.invite || {
      token: safeToken,
      email: row.targetAgentEmail,
      status: row.status === 'accepted' || row.status === 'declined' ? row.status : 'pending',
      expiresAt: row.inviteExpiresAt,
    },
    referral: row,
    client: row.client,
    agreement: row.latestAgreement,
    inviteLink: buildReferralInviteLink(safeToken),
  }
}

export async function getLeadReferralInviteByToken(token = '') {
  const safeToken = normalizeText(token)
  if (!safeToken) return { ok: false, code: 'missing_token' }

  if (isSupabaseConfigured && supabase) {
    const result = await supabase.rpc('bridge_lookup_referral_invite_by_token', { p_token: safeToken })
    if (!result.error && result.data) return mapReferralInvitePayload(result.data)
    if (result.error) console.warn('[leadReferralService] referral invite lookup failed', result.error)
  }

  const local = getLocalReferralInviteByToken(safeToken)
  return local || { ok: false, code: 'not_found' }
}

export async function respondToLeadReferralInvite(token = '', action = '', { actorEmail = '', actorName = '', declineReason = '' } = {}) {
  const safeToken = normalizeText(token)
  const normalizedAction = normalizeText(action).toLowerCase()
  const nextStatus = normalizedAction.startsWith('accept') ? 'accepted' : 'declined'
  const normalizedDeclineReason = normalizeText(declineReason)
  if (!safeToken) return { ok: false, code: 'missing_token' }
  if (!['accept', 'accepted', 'decline', 'declined'].includes(normalizedAction)) {
    return { ok: false, code: 'invalid_action' }
  }
  if (nextStatus === 'declined' && !normalizedDeclineReason) {
    return { ok: false, code: 'decline_reason_required' }
  }

  if (isSupabaseConfigured && supabase) {
    const result = await supabase.rpc('bridge_respond_referral_invite', {
      p_token: safeToken,
      p_action: normalizedAction,
      p_actor_email: normalizeEmail(actorEmail),
      p_actor_name: normalizeText(actorName),
      p_decline_reason: normalizedDeclineReason || null,
    })
    if (!result.error && result.data) return mapReferralInvitePayload(result.data)
    if (result.error) console.warn('[leadReferralService] referral invite response failed', result.error)
  }

  const rows = safeLocalRows()
  const normalizedActorEmail = normalizeEmail(actorEmail)
  let updatedReferral = null
  const nextRows = rows.map((row) => {
    const mapped = mapReferralRow(row)
    if (mapped.inviteToken !== safeToken && mapped.invite?.token !== safeToken) return row
    const nowIso = new Date().toISOString()
    const event = {
      id: createUuid(),
      referralId: mapped.id,
      fromStatus: mapped.status,
      toStatus: nextStatus,
      eventType: 'invite_response',
      eventNote: nextStatus === 'accepted' ? 'Referral invite accepted.' : 'Referral invite declined.',
      actorEmail: normalizedActorEmail || mapped.targetAgentEmail,
      metadata: { actorName: normalizeText(actorName), declineReason: normalizedDeclineReason || undefined },
      createdAt: nowIso,
    }
    updatedReferral = mapReferralRow({
      ...row,
      status: nextStatus,
      agreementStatus: nextStatus,
      acceptedAt: nextStatus === 'accepted' ? nowIso : mapped.acceptedAt,
      acceptedByEmail: nextStatus === 'accepted' ? normalizedActorEmail || mapped.targetAgentEmail : mapped.acceptedByEmail,
      declinedAt: nextStatus === 'declined' ? nowIso : mapped.declinedAt,
      declinedByEmail: nextStatus === 'declined' ? normalizedActorEmail || mapped.targetAgentEmail : mapped.declinedByEmail,
      declineReason: nextStatus === 'declined' ? normalizedDeclineReason : mapped.declineReason,
      agreementLockedAt: nextStatus === 'accepted' ? nowIso : mapped.agreementLockedAt,
      updatedAt: nowIso,
      invite: {
        ...(mapped.invite || {}),
        token: safeToken,
        email: mapped.targetAgentEmail,
        status: nextStatus,
        acceptedAt: nextStatus === 'accepted' ? nowIso : null,
        declinedAt: nextStatus === 'declined' ? nowIso : null,
        declineReason: nextStatus === 'declined' ? normalizedDeclineReason : '',
        updatedAt: nowIso,
      },
      client: mapped.client ? {
        ...mapped.client,
        clientStatus: nextStatus === 'accepted' ? 'accepted' : 'archived',
        updatedAt: nowIso,
      } : mapped.client,
      agreements: mapped.agreements?.length ? mapped.agreements.map((agreement, index) => index === 0 ? {
        ...agreement,
        status: nextStatus,
        acceptedAt: nextStatus === 'accepted' ? nowIso : agreement.acceptedAt,
        acceptedByEmail: nextStatus === 'accepted' ? normalizedActorEmail || mapped.targetAgentEmail : agreement.acceptedByEmail,
        declinedAt: nextStatus === 'declined' ? nowIso : agreement.declinedAt,
        declinedByEmail: nextStatus === 'declined' ? normalizedActorEmail || mapped.targetAgentEmail : agreement.declinedByEmail,
        declineReason: nextStatus === 'declined' ? normalizedDeclineReason : agreement.declineReason,
        lockedAt: nextStatus === 'accepted' ? nowIso : agreement.lockedAt,
        updatedAt: nowIso,
      } : agreement) : mapped.agreements,
      events: [event, ...(Array.isArray(mapped.events) ? mapped.events : [])],
    })
    return updatedReferral
  })
  writeLocalRows(nextRows)
  if (updatedReferral?.id) {
    return {
      ok: true,
      code: '',
      responseStatus: nextStatus,
      invite: updatedReferral.invite,
      referral: updatedReferral,
      client: updatedReferral.client,
      agreement: updatedReferral.latestAgreement,
      inviteLink: buildReferralInviteLink(safeToken),
    }
  }
  return { ok: false, code: 'not_found' }
}

function normalizeReferralResponseAction(action = '') {
  const normalizedAction = normalizeText(action).toLowerCase()
  if (['accept', 'accepted'].includes(normalizedAction)) return 'accepted'
  if (['decline', 'declined', 'reject', 'rejected'].includes(normalizedAction)) return 'declined'
  if (['review', 'needs_review', 'manual_discussion', 'dispute', 'disputed'].includes(normalizedAction)) return 'needs_review'
  return ''
}

function getReferralResponseErrorMessage(code = '') {
  const normalizedCode = normalizeText(code)
  if (normalizedCode === 'forbidden') return 'You do not have permission to respond to this referral.'
  if (normalizedCode === 'not_found') return 'Referral not found.'
  if (normalizedCode === 'unauthenticated') return 'Sign in before responding to referral terms.'
  if (normalizedCode === 'decline_reason_required') return 'Capture a decline reason before declining referral terms.'
  if (normalizedCode === 'already_accepted') return 'These referral terms have already been accepted.'
  if (normalizedCode === 'already_declined') return 'These referral terms have already been declined.'
  if (normalizedCode === 'status_locked') return 'This referral can no longer be changed from this status.'
  if (normalizedCode === 'invalid_action') return 'Choose accept, decline, or needs review before saving.'
  return 'Unable to update referral terms.'
}

function buildReferralResponseEvent(referral = {}, {
  nextStatus = '',
  note = '',
  metadata = {},
  actor = null,
  nowIso = new Date().toISOString(),
} = {}) {
  const status = normalizeReferralStatus(nextStatus, '')
  return {
    id: createUuid(),
    referralId: referral.id,
    fromStatus: referral.status,
    toStatus: status,
    eventType: status === 'needs_review' ? 'terms_needs_review' : 'terms_response',
    eventNote: note || (
      status === 'accepted'
        ? 'Referral terms accepted.'
        : status === 'declined'
          ? 'Referral terms declined.'
          : 'Referral terms marked for manual discussion.'
    ),
    actorId: normalizeText(actor?.id || actor?.userId),
    actorEmail: normalizeEmail(actor?.email),
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
    createdAt: nowIso,
  }
}

export async function respondToLeadReferralTerms(
  referralId = '',
  action = '',
  { declineReason = '', note = '', metadata = {} } = {},
  { actor = null } = {},
) {
  const normalizedReferralId = normalizeText(referralId)
  const nextStatus = normalizeReferralResponseAction(action)
  if (!normalizedReferralId) throw new Error('Referral id is required before responding to terms.')
  if (!nextStatus) throw new Error('Choose accept, decline, or needs review before saving.')

  const normalizedDeclineReason = normalizeText(declineReason)
  if (nextStatus === 'declined' && !normalizedDeclineReason) {
    throw new Error('Capture a decline reason before declining referral terms.')
  }

  const nowIso = new Date().toISOString()
  const actorId = normalizeText(actor?.id || actor?.userId)
  const actorEmail = normalizeEmail(actor?.email)
  const eventMetadata = {
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
    responseAction: nextStatus,
    declineReason: normalizedDeclineReason || undefined,
  }

  if (isSupabaseConfigured && supabase) {
    const rpcResult = await supabase.rpc('bridge_respond_referral_terms', {
      p_referral_id: normalizedReferralId,
      p_action: nextStatus,
      p_decline_reason: normalizedDeclineReason || null,
      p_event_note: normalizeText(note) || null,
      p_metadata: eventMetadata,
    })
    if (!rpcResult.error && rpcResult.data) {
      if (rpcResult.data.success === false) {
        throw new Error(getReferralResponseErrorMessage(rpcResult.data.code))
      }
      const mappedPayload = mapReferralInvitePayload(rpcResult.data)
      if (mappedPayload.referral?.id) return mappedPayload.referral
    } else if (rpcResult.error) {
      console.warn('[leadReferralService] referral terms RPC failed; using direct update fallback', rpcResult.error)
    }

    const currentResult = await supabase
      .from('lead_referrals')
      .select(REFERRAL_LEDGER_SELECT)
      .eq('id', normalizedReferralId)
      .maybeSingle()
    if (currentResult.error) throw currentResult.error
    const currentReferral = mapReferralRow(currentResult.data || {})
    if (!currentReferral.id) throw new Error('Referral not found.')

    const agreementStatus = nextStatus === 'needs_review' ? currentReferral.agreementStatus || 'pending' : nextStatus
    const updatePayload = {
      status: nextStatus,
      agreement_status: agreementStatus,
      updated_at: nowIso,
    }
    if (nextStatus === 'accepted') {
      updatePayload.accepted_at = nowIso
      updatePayload.accepted_by_user_id = actorId || null
      updatePayload.accepted_by_email = actorEmail || currentReferral.targetAgentEmail || null
      updatePayload.agreement_locked_at = nowIso
      updatePayload.decline_reason = null
    } else if (nextStatus === 'declined') {
      updatePayload.declined_at = nowIso
      updatePayload.declined_by_user_id = actorId || null
      updatePayload.declined_by_email = actorEmail || currentReferral.targetAgentEmail || null
      updatePayload.decline_reason = normalizedDeclineReason
    }

    const updateResult = await supabase
      .from('lead_referrals')
      .update(updatePayload)
      .eq('id', normalizedReferralId)
      .select(REFERRAL_SELECT_FIELDS.join(', '))
      .single()
    if (updateResult.error) throw updateResult.error

    const latestAgreement = currentReferral.latestAgreement
    if (latestAgreement?.id) {
      const agreementPayload = {
        status: agreementStatus,
        updated_at: nowIso,
      }
      if (nextStatus === 'accepted') {
        agreementPayload.accepted_at = nowIso
        agreementPayload.accepted_by_user_id = actorId || null
        agreementPayload.accepted_by_email = actorEmail || currentReferral.targetAgentEmail || null
        agreementPayload.locked_at = nowIso
        agreementPayload.decline_reason = null
      } else if (nextStatus === 'declined') {
        agreementPayload.declined_at = nowIso
        agreementPayload.declined_by_user_id = actorId || null
        agreementPayload.declined_by_email = actorEmail || currentReferral.targetAgentEmail || null
        agreementPayload.decline_reason = normalizedDeclineReason
      }
      const agreementResult = await supabase
        .from('referral_agreements')
        .update(agreementPayload)
        .eq('id', latestAgreement.id)
      if (agreementResult.error) throw agreementResult.error
    }

    const clientStatus = nextStatus === 'accepted'
      ? 'accepted'
      : nextStatus === 'declined'
        ? 'archived'
        : 'referred'
    const event = buildReferralResponseEvent(currentReferral, {
      nextStatus,
      note,
      metadata: eventMetadata,
      actor,
      nowIso,
    })
    const [clientResult, eventResult] = await Promise.all([
      supabase.from('referral_clients').update({ client_status: clientStatus, updated_at: nowIso }).eq('referral_id', normalizedReferralId),
      supabase.from('referral_status_events').insert(eventToDatabasePayload(event)),
    ])
    if (clientResult.error) throw clientResult.error
    if (eventResult.error) throw eventResult.error

    const refreshedResult = await supabase
      .from('lead_referrals')
      .select(REFERRAL_LEDGER_SELECT)
      .eq('id', normalizedReferralId)
      .maybeSingle()
    if (!refreshedResult.error && refreshedResult.data) return mapReferralRow(refreshedResult.data)
    return mapReferralRow({ ...(updateResult.data || {}), referral_status_events: [eventToDatabasePayload(event)] })
  }

  const rows = safeLocalRows()
  let updatedReferral = null
  const nextRows = rows.map((row) => {
    const mapped = mapReferralRow(row)
    if (mapped.id !== normalizedReferralId) return row
    const agreementStatus = nextStatus === 'needs_review' ? mapped.agreementStatus || 'pending' : nextStatus
    const event = buildReferralResponseEvent(mapped, {
      nextStatus,
      note,
      metadata: eventMetadata,
      actor,
      nowIso,
    })
    const responseFields = nextStatus === 'accepted'
      ? {
          acceptedAt: nowIso,
          acceptedByUserId: actorId,
          acceptedByEmail: actorEmail || mapped.targetAgentEmail,
          agreementLockedAt: nowIso,
          declineReason: '',
        }
      : nextStatus === 'declined'
        ? {
            declinedAt: nowIso,
            declinedByUserId: actorId,
            declinedByEmail: actorEmail || mapped.targetAgentEmail,
            declineReason: normalizedDeclineReason,
          }
        : {}
    updatedReferral = mapReferralRow({
      ...row,
      status: nextStatus,
      agreementStatus,
      ...responseFields,
      updatedAt: nowIso,
      client: mapped.client ? {
        ...mapped.client,
        clientStatus: nextStatus === 'accepted' ? 'accepted' : nextStatus === 'declined' ? 'archived' : 'referred',
        updatedAt: nowIso,
      } : mapped.client,
      agreements: mapped.agreements?.length ? mapped.agreements.map((agreement, index) => index === 0 ? {
        ...agreement,
        status: agreementStatus,
        acceptedAt: nextStatus === 'accepted' ? nowIso : agreement.acceptedAt,
        acceptedByUserId: nextStatus === 'accepted' ? actorId : agreement.acceptedByUserId,
        acceptedByEmail: nextStatus === 'accepted' ? actorEmail || mapped.targetAgentEmail : agreement.acceptedByEmail,
        declinedAt: nextStatus === 'declined' ? nowIso : agreement.declinedAt,
        declinedByUserId: nextStatus === 'declined' ? actorId : agreement.declinedByUserId,
        declinedByEmail: nextStatus === 'declined' ? actorEmail || mapped.targetAgentEmail : agreement.declinedByEmail,
        declineReason: nextStatus === 'declined' ? normalizedDeclineReason : agreement.declineReason,
        lockedAt: nextStatus === 'accepted' ? nowIso : agreement.lockedAt,
        updatedAt: nowIso,
      } : agreement) : mapped.agreements,
      events: [event, ...(Array.isArray(mapped.events) ? mapped.events : [])],
    })
    return updatedReferral
  })
  writeLocalRows(nextRows)
  if (updatedReferral?.id) return updatedReferral
  throw new Error('Referral not found.')
}

export async function recordReferralConversion(referralId = '', input = {}, { actor = null } = {}) {
  const normalizedReferralId = normalizeText(referralId)
  if (!normalizedReferralId) throw new Error('Referral id is required before recording conversion.')

  const nowIso = new Date().toISOString()
  const grossCommissionAmount = normalizeMoney(input.grossCommissionAmount)
  const overrideSplit = normalizeMoney(input.commissionSplitPercentage)
  const note = normalizeText(input.note)
  const transactionId = normalizeText(input.transactionId || input.convertedTransactionId)
  const dealId = normalizeText(input.dealId || input.convertedDealId)
  const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {}

  if (isSupabaseConfigured && supabase) {
    const currentResult = await supabase
      .from('lead_referrals')
      .select(REFERRAL_SELECT_FIELDS.join(', '))
      .eq('id', normalizedReferralId)
      .maybeSingle()
    if (currentResult.error) throw currentResult.error
    const currentReferral = mapReferralRow(currentResult.data || {})
    const split = overrideSplit ?? normalizeMoney(currentReferral.commissionSplitPercentage) ?? 0
    const referralCommissionAmount = calculateReferralCommission({ grossCommissionAmount, commissionSplitPercentage: split })
    const commissionStatus = referralCommissionAmount > 0 ? 'due' : 'not_applicable'
    const nextStatus = referralCommissionAmount > 0 ? 'commission_due' : 'converted'
    const updatePayload = {
      converted_transaction_id: transactionId || null,
      converted_deal_id: dealId || null,
      converted_at: nowIso,
      gross_commission_amount: grossCommissionAmount,
      referral_commission_amount: referralCommissionAmount,
      commission_split_percentage: split || currentReferral.commissionSplitPercentage,
      commission_status: commissionStatus,
      commission_due_at: commissionStatus === 'due' ? nowIso : null,
      commission_paid_at: null,
      commission_payment_reference: null,
      status: nextStatus,
      updated_at: nowIso,
    }
    const updateResult = await supabase
      .from('lead_referrals')
      .update(updatePayload)
      .eq('id', normalizedReferralId)
      .select(REFERRAL_SELECT_FIELDS.join(', '))
      .single()
    if (updateResult.error) throw updateResult.error

    const commissionEvent = {
      id: createUuid(),
      referralId: normalizedReferralId,
      transactionId,
      dealId,
      eventType: referralCommissionAmount > 0 ? 'commission_due' : 'conversion_recorded',
      grossCommissionAmount,
      referralCommissionAmount,
      commissionSplitPercentage: split,
      commissionStatus,
      paymentReference: '',
      eventNote: note || 'Referral converted.',
      actorId: normalizeText(actor?.id || actor?.userId),
      actorEmail: normalizeEmail(actor?.email),
      metadata,
      createdAt: nowIso,
    }
    const statusEvent = {
      id: createUuid(),
      referralId: normalizedReferralId,
      fromStatus: currentReferral.status,
      toStatus: nextStatus,
      eventType: 'conversion_recorded',
      eventNote: note || 'Referral converted into a commission-tracked deal.',
      actorId: normalizeText(actor?.id || actor?.userId),
      actorEmail: normalizeEmail(actor?.email),
      metadata: {
        ...metadata,
        transactionId,
        dealId,
        grossCommissionAmount,
        referralCommissionAmount,
        commissionSplitPercentage: split,
      },
      createdAt: nowIso,
    }
    const [commissionEventResult, statusEventResult, clientResult] = await Promise.all([
      supabase.from('referral_commission_events').insert(commissionEventToDatabasePayload(commissionEvent)),
      supabase.from('referral_status_events').insert(eventToDatabasePayload(statusEvent)),
      supabase.from('referral_clients').update({ client_status: 'converted', updated_at: nowIso }).eq('referral_id', normalizedReferralId),
    ])
    if (commissionEventResult.error) throw commissionEventResult.error
    if (statusEventResult.error) throw statusEventResult.error
    if (clientResult.error) throw clientResult.error

    return mapReferralRow({
      ...(updateResult.data || {}),
      referral_commission_events: [commissionEventToDatabasePayload(commissionEvent)],
      referral_status_events: [eventToDatabasePayload(statusEvent)],
    })
  }

  const rows = safeLocalRows()
  let updatedReferral = null
  const nextRows = rows.map((row) => {
    const mapped = mapReferralRow(row)
    if (mapped.id !== normalizedReferralId) return row
    const split = overrideSplit ?? normalizeMoney(mapped.commissionSplitPercentage) ?? 0
    const referralCommissionAmount = calculateReferralCommission({ grossCommissionAmount, commissionSplitPercentage: split })
    const commissionStatus = referralCommissionAmount > 0 ? 'due' : 'not_applicable'
    const nextStatus = referralCommissionAmount > 0 ? 'commission_due' : 'converted'
    const commissionEvent = {
      id: createUuid(),
      referralId: normalizedReferralId,
      transactionId,
      dealId,
      eventType: referralCommissionAmount > 0 ? 'commission_due' : 'conversion_recorded',
      grossCommissionAmount,
      referralCommissionAmount,
      commissionSplitPercentage: split,
      commissionStatus,
      eventNote: note || 'Referral converted.',
      actorId: normalizeText(actor?.id || actor?.userId),
      actorEmail: normalizeEmail(actor?.email),
      metadata,
      createdAt: nowIso,
    }
    const statusEvent = {
      id: createUuid(),
      referralId: normalizedReferralId,
      fromStatus: mapped.status,
      toStatus: nextStatus,
      eventType: 'conversion_recorded',
      eventNote: note || 'Referral converted into a commission-tracked deal.',
      actorId: normalizeText(actor?.id || actor?.userId),
      actorEmail: normalizeEmail(actor?.email),
      metadata,
      createdAt: nowIso,
    }
    updatedReferral = mapReferralRow({
      ...row,
      status: nextStatus,
      convertedTransactionId: transactionId,
      convertedDealId: dealId,
      convertedAt: nowIso,
      grossCommissionAmount,
      referralCommissionAmount,
      commissionSplitPercentage: split,
      commissionStatus,
      commissionDueAt: commissionStatus === 'due' ? nowIso : null,
      commissionPaidAt: null,
      commissionPaymentReference: '',
      updatedAt: nowIso,
      client: mapped.client ? { ...mapped.client, clientStatus: 'converted', updatedAt: nowIso } : mapped.client,
      events: [statusEvent, ...(Array.isArray(mapped.events) ? mapped.events : [])],
      commissionEvents: [commissionEvent, ...(Array.isArray(mapped.commissionEvents) ? mapped.commissionEvents : [])],
    })
    return updatedReferral
  })
  writeLocalRows(nextRows)
  return updatedReferral || mapReferralRow({})
}

export async function markReferralCommissionPaid(referralId = '', input = {}, { actor = null } = {}) {
  const normalizedReferralId = normalizeText(referralId)
  if (!normalizedReferralId) throw new Error('Referral id is required before marking commission paid.')
  const nowIso = input.paidAt || new Date().toISOString()
  const note = normalizeText(input.note)
  const paymentReference = normalizeText(input.paymentReference)

  if (isSupabaseConfigured && supabase) {
    const currentResult = await supabase
      .from('lead_referrals')
      .select(REFERRAL_SELECT_FIELDS.join(', '))
      .eq('id', normalizedReferralId)
      .maybeSingle()
    if (currentResult.error) throw currentResult.error
    const currentReferral = mapReferralRow(currentResult.data || {})
    const updateResult = await supabase
      .from('lead_referrals')
      .update({
        status: 'paid',
        commission_status: 'paid',
        commission_paid_at: nowIso,
        commission_payment_reference: paymentReference || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', normalizedReferralId)
      .select(REFERRAL_SELECT_FIELDS.join(', '))
      .single()
    if (updateResult.error) throw updateResult.error

    const commissionEvent = {
      id: createUuid(),
      referralId: normalizedReferralId,
      transactionId: currentReferral.convertedTransactionId,
      dealId: currentReferral.convertedDealId,
      eventType: 'commission_paid',
      grossCommissionAmount: currentReferral.grossCommissionAmount,
      referralCommissionAmount: currentReferral.referralCommissionAmount,
      commissionSplitPercentage: currentReferral.commissionSplitPercentage,
      commissionStatus: 'paid',
      paymentReference,
      eventNote: note || 'Referral commission marked as paid.',
      actorId: normalizeText(actor?.id || actor?.userId),
      actorEmail: normalizeEmail(actor?.email),
      metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
      createdAt: nowIso,
    }
    const statusEvent = {
      id: createUuid(),
      referralId: normalizedReferralId,
      fromStatus: currentReferral.status,
      toStatus: 'paid',
      eventType: 'commission_paid',
      eventNote: note || 'Referral commission marked as paid.',
      actorId: normalizeText(actor?.id || actor?.userId),
      actorEmail: normalizeEmail(actor?.email),
      metadata: { paymentReference },
      createdAt: nowIso,
    }
    const [commissionEventResult, statusEventResult] = await Promise.all([
      supabase.from('referral_commission_events').insert(commissionEventToDatabasePayload(commissionEvent)),
      supabase.from('referral_status_events').insert(eventToDatabasePayload(statusEvent)),
    ])
    if (commissionEventResult.error) throw commissionEventResult.error
    if (statusEventResult.error) throw statusEventResult.error

    return mapReferralRow({
      ...(updateResult.data || {}),
      referral_commission_events: [commissionEventToDatabasePayload(commissionEvent)],
      referral_status_events: [eventToDatabasePayload(statusEvent)],
    })
  }

  const rows = safeLocalRows()
  let updatedReferral = null
  const nextRows = rows.map((row) => {
    const mapped = mapReferralRow(row)
    if (mapped.id !== normalizedReferralId) return row
    const commissionEvent = {
      id: createUuid(),
      referralId: normalizedReferralId,
      transactionId: mapped.convertedTransactionId,
      dealId: mapped.convertedDealId,
      eventType: 'commission_paid',
      grossCommissionAmount: mapped.grossCommissionAmount,
      referralCommissionAmount: mapped.referralCommissionAmount,
      commissionSplitPercentage: mapped.commissionSplitPercentage,
      commissionStatus: 'paid',
      paymentReference,
      eventNote: note || 'Referral commission marked as paid.',
      actorId: normalizeText(actor?.id || actor?.userId),
      actorEmail: normalizeEmail(actor?.email),
      metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
      createdAt: nowIso,
    }
    const statusEvent = {
      id: createUuid(),
      referralId: normalizedReferralId,
      fromStatus: mapped.status,
      toStatus: 'paid',
      eventType: 'commission_paid',
      eventNote: note || 'Referral commission marked as paid.',
      actorId: normalizeText(actor?.id || actor?.userId),
      actorEmail: normalizeEmail(actor?.email),
      metadata: { paymentReference },
      createdAt: nowIso,
    }
    updatedReferral = mapReferralRow({
      ...row,
      status: 'paid',
      commissionStatus: 'paid',
      commissionPaidAt: nowIso,
      commissionPaymentReference: paymentReference,
      updatedAt: new Date().toISOString(),
      events: [statusEvent, ...(Array.isArray(mapped.events) ? mapped.events : [])],
      commissionEvents: [commissionEvent, ...(Array.isArray(mapped.commissionEvents) ? mapped.commissionEvents : [])],
    })
    return updatedReferral
  })
  writeLocalRows(nextRows)
  return updatedReferral || mapReferralRow({})
}

function buildOperationalStatusEvent(referral = {}, {
  toStatus = '',
  eventType = 'operational_update',
  note = '',
  metadata = {},
  actor = null,
  nowIso = new Date().toISOString(),
} = {}) {
  return {
    id: createUuid(),
    referralId: referral.id,
    fromStatus: referral.status,
    toStatus: toStatus || referral.status,
    eventType,
    eventNote: note,
    actorId: normalizeText(actor?.id || actor?.userId),
    actorEmail: normalizeEmail(actor?.email),
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
    createdAt: nowIso,
  }
}

async function updateReferralOperationalFields(referralId = '', updatePayload = {}, event = null) {
  const normalizedReferralId = normalizeText(referralId)
  if (isSupabaseConfigured && supabase) {
    const updateResult = await supabase
      .from('lead_referrals')
      .update(updatePayload)
      .eq('id', normalizedReferralId)
      .select(REFERRAL_SELECT_FIELDS.join(', '))
      .single()
    if (updateResult.error) throw updateResult.error
    if (event?.id) {
      const eventResult = await supabase.from('referral_status_events').insert(eventToDatabasePayload(event))
      if (eventResult.error) throw eventResult.error
    }
    return mapReferralRow({
      ...(updateResult.data || {}),
      referral_status_events: event?.id ? [eventToDatabasePayload(event)] : [],
    })
  }

  const rows = safeLocalRows()
  let updatedReferral = null
  const nextRows = rows.map((row) => {
    const mapped = mapReferralRow(row)
    if (mapped.id !== normalizedReferralId) return row
    updatedReferral = mapReferralRow({
      ...row,
      ...Object.fromEntries(Object.entries(updatePayload).map(([key, value]) => {
        const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
        return [camelKey, value]
      })),
      events: event?.id ? [event, ...(Array.isArray(mapped.events) ? mapped.events : [])] : mapped.events,
    })
    return updatedReferral
  })
  writeLocalRows(nextRows)
  return updatedReferral || mapReferralRow({})
}

export async function scheduleReferralFollowUp(referralId = '', input = {}, { actor = null } = {}) {
  const normalizedReferralId = normalizeText(referralId)
  if (!normalizedReferralId) throw new Error('Referral id is required before scheduling follow-up.')
  const nextFollowUpAt = input.nextFollowUpAt || null
  if (!nextFollowUpAt) throw new Error('Choose a follow-up date before saving.')
  const nowIso = new Date().toISOString()
  const currentRows = isSupabaseConfigured && supabase
    ? await supabase.from('lead_referrals').select(REFERRAL_SELECT_FIELDS.join(', ')).eq('id', normalizedReferralId).maybeSingle()
    : null
  if (currentRows?.error) throw currentRows.error
  const currentReferral = currentRows?.data ? mapReferralRow(currentRows.data) : safeLocalRows().map(mapReferralRow).find((row) => row.id === normalizedReferralId) || {}
  const priority = normalizeOperationalPriority(input.operationalPriority || currentReferral.operationalPriority)
  const event = buildOperationalStatusEvent(currentReferral, {
    eventType: 'follow_up_scheduled',
    note: normalizeText(input.note) || 'Referral follow-up scheduled.',
    metadata: { nextFollowUpAt, priority },
    actor,
    nowIso,
  })
  return updateReferralOperationalFields(normalizedReferralId, {
    operational_priority: priority,
    next_follow_up_at: nextFollowUpAt,
    follow_up_status: new Date(nextFollowUpAt).getTime() <= Date.now() ? 'due' : 'open',
    updated_at: nowIso,
  }, event)
}

export async function completeReferralFollowUp(referralId = '', input = {}, { actor = null } = {}) {
  const normalizedReferralId = normalizeText(referralId)
  if (!normalizedReferralId) throw new Error('Referral id is required before completing follow-up.')
  const nowIso = new Date().toISOString()
  const nextFollowUpAt = input.nextFollowUpAt || null
  const currentRows = isSupabaseConfigured && supabase
    ? await supabase.from('lead_referrals').select(REFERRAL_SELECT_FIELDS.join(', ')).eq('id', normalizedReferralId).maybeSingle()
    : null
  if (currentRows?.error) throw currentRows.error
  const currentReferral = currentRows?.data ? mapReferralRow(currentRows.data) : safeLocalRows().map(mapReferralRow).find((row) => row.id === normalizedReferralId) || {}
  const event = buildOperationalStatusEvent(currentReferral, {
    eventType: 'follow_up_completed',
    note: normalizeText(input.note) || 'Referral follow-up completed.',
    metadata: { nextFollowUpAt },
    actor,
    nowIso,
  })
  return updateReferralOperationalFields(normalizedReferralId, {
    last_follow_up_at: nowIso,
    next_follow_up_at: nextFollowUpAt,
    follow_up_status: nextFollowUpAt ? 'open' : 'done',
    updated_at: nowIso,
  }, event)
}

export async function markReferralLost(referralId = '', input = {}, { actor = null } = {}) {
  const normalizedReferralId = normalizeText(referralId)
  if (!normalizedReferralId) throw new Error('Referral id is required before marking lost.')
  const lostReason = normalizeText(input.lostReason || input.reason)
  if (!lostReason) throw new Error('Capture a lost reason before marking the referral lost.')
  const nowIso = new Date().toISOString()
  const currentRows = isSupabaseConfigured && supabase
    ? await supabase.from('lead_referrals').select(REFERRAL_SELECT_FIELDS.join(', ')).eq('id', normalizedReferralId).maybeSingle()
    : null
  if (currentRows?.error) throw currentRows.error
  const currentReferral = currentRows?.data ? mapReferralRow(currentRows.data) : safeLocalRows().map(mapReferralRow).find((row) => row.id === normalizedReferralId) || {}
  const event = buildOperationalStatusEvent(currentReferral, {
    toStatus: 'lost',
    eventType: 'referral_lost',
    note: normalizeText(input.note) || `Referral marked lost: ${lostReason}`,
    metadata: { lostReason },
    actor,
    nowIso,
  })
  const updated = await updateReferralOperationalFields(normalizedReferralId, {
    status: 'lost',
    lost_reason: lostReason,
    lost_at: nowIso,
    follow_up_status: 'done',
    next_follow_up_at: null,
    updated_at: nowIso,
  }, event)
  if (isSupabaseConfigured && supabase) {
    const clientResult = await supabase.from('referral_clients').update({ client_status: 'lost', updated_at: nowIso }).eq('referral_id', normalizedReferralId)
    if (clientResult.error) throw clientResult.error
  }
  return updated
}

export async function updateLeadReferralStatus(referralId = '', status = '', { note = '', metadata = {} } = {}, { actor = null } = {}) {
  const normalizedReferralId = normalizeText(referralId)
  const nextStatus = normalizeReferralStatus(status, '')
  if (!normalizedReferralId) throw new Error('Referral id is required before updating status.')
  if (!nextStatus) throw new Error('A valid referral status is required.')

  const nowIso = new Date().toISOString()
  if (isSupabaseConfigured && supabase) {
    const currentResult = await supabase
      .from('lead_referrals')
      .select(REFERRAL_SELECT_FIELDS.join(', '))
      .eq('id', normalizedReferralId)
      .maybeSingle()
    if (currentResult.error) throw currentResult.error
    const previousStatus = normalizeReferralStatus(currentResult.data?.status, '')
    const updateResult = await supabase
      .from('lead_referrals')
      .update({ status: nextStatus, updated_at: nowIso })
      .eq('id', normalizedReferralId)
      .select(REFERRAL_SELECT_FIELDS.join(', '))
      .single()
    if (updateResult.error) throw updateResult.error

    const event = {
      id: createUuid(),
      referralId: normalizedReferralId,
      fromStatus: previousStatus,
      toStatus: nextStatus,
      eventType: 'status_change',
      eventNote: note,
      actorId: normalizeText(actor?.id || actor?.userId),
      actorEmail: normalizeEmail(actor?.email),
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
      createdAt: nowIso,
    }
    const eventResult = await supabase.from('referral_status_events').insert(eventToDatabasePayload(event))
    if (eventResult.error) throw eventResult.error
    return mapReferralRow({ ...(updateResult.data || {}), referral_status_events: [eventToDatabasePayload(event)] })
  }

  const rows = safeLocalRows()
  const nextRows = rows.map((row) => {
    if (normalizeText(row.id) !== normalizedReferralId) return row
    const previousStatus = normalizeReferralStatus(row.status, '')
    const event = {
      id: createUuid(),
      referralId: normalizedReferralId,
      fromStatus: previousStatus,
      toStatus: nextStatus,
      eventType: 'status_change',
      eventNote: note,
      actorId: normalizeText(actor?.id || actor?.userId),
      actorEmail: normalizeEmail(actor?.email),
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
      createdAt: nowIso,
    }
    return {
      ...row,
      status: nextStatus,
      updatedAt: nowIso,
      events: [event, ...(Array.isArray(row.events) ? row.events : [])],
    }
  })
  writeLocalRows(nextRows)
  return mapReferralRow(nextRows.find((row) => normalizeText(row.id) === normalizedReferralId) || {})
}
