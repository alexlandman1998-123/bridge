import { invokeEdgeFunction, isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { createInvite, INVITE_TYPES } from './inviteService'

export const TRANSACTION_PARTNER_INVITATION_ROLES = Object.freeze({
  transferAttorney: 'transfer_attorney',
  bondAttorney: 'bond_attorney',
  cancellationAttorney: 'cancellation_attorney',
  bondOriginator: 'bond_originator',
  developer: 'developer',
  other: 'other',
})

export const TRANSACTION_PARTNER_ROLE_LABELS = Object.freeze({
  transfer_attorney: 'Transfer Attorney',
  bond_attorney: 'Bond Attorney',
  cancellation_attorney: 'Cancellation Attorney',
  bond_originator: 'Bond Originator',
  developer: 'Developer',
  other: 'Transaction Partner',
})

const ROLE_PLAYER_ROLE_TYPE = Object.freeze({
  transfer_attorney: 'transfer_attorney',
  bond_attorney: 'bond_attorney',
  cancellation_attorney: 'cancellation_attorney',
  bond_originator: 'bond_originator',
  developer: 'developer_contact',
  other: 'other',
})

const PARTICIPANT_ROLE_SHAPE = Object.freeze({
  transfer_attorney: { roleType: 'attorney', legalRole: 'transfer', transactionRole: 'transfer_attorney' },
  bond_attorney: { roleType: 'attorney', legalRole: 'bond', transactionRole: 'bond_attorney' },
  cancellation_attorney: { roleType: 'attorney', legalRole: 'cancellation', transactionRole: 'cancellation_attorney' },
  bond_originator: { roleType: 'bond_originator', legalRole: 'none', transactionRole: 'bond_originator' },
  developer: { roleType: 'developer', legalRole: 'none', transactionRole: 'developer_contact' },
  other: { roleType: 'external_collaborator', legalRole: 'none', transactionRole: 'external_collaborator' },
})

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const FALLBACK_TRANSACTION_INVITE_ORIGIN = 'https://app.arch9.co.za'
const PROSPECT_STATUS_LABELS = Object.freeze({
  invited: 'Pending',
  joined: 'Joined',
  declined: 'Declined',
  inactive: 'Inactive',
})

const INVITATION_STATUS_LABELS = Object.freeze({
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
})

const ATTORNEY_WORKFLOW_INVITATION_ROLES = new Set(['transfer_attorney', 'bond_attorney', 'cancellation_attorney'])
const CANONICAL_TRANSACTION_INVITE_ROLES = new Set(['transfer_attorney', 'bond_originator'])
const INVITATION_EXPIRY_SOON_MS = 3 * 24 * 60 * 60 * 1000

function normalizeText(value) {
  return String(value || '').trim()
}

function sanitizePostgrestSearchTerm(value) {
  return normalizeText(value).replace(/[%,()]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function normalizeTransactionPartnerInvitationRole(value) {
  const normalized = normalizeText(value).toLowerCase()
  const compact = normalized.replace(/[\s-]+/g, '_')
  if (normalized === 'attorney' || normalized === 'conveyancer' || normalized === 'transfer') return 'transfer_attorney'
  if (compact === 'bond_attorney' || compact === 'bond_registration_attorney' || compact === 'registration_attorney') return 'bond_attorney'
  if (compact === 'cancellation_attorney' || compact === 'bond_cancellation_attorney' || compact === 'cancellation') return 'cancellation_attorney'
  if (compact === 'bond' || compact === 'originator' || compact === 'bondoriginator' || compact === 'bond_originator') return 'bond_originator'
  if (compact === 'developer_contact') return 'developer'
  if (Object.values(TRANSACTION_PARTNER_INVITATION_ROLES).includes(compact)) return compact
  return 'other'
}

export function getTransactionPartnerRoleLabel(roleType) {
  return TRANSACTION_PARTNER_ROLE_LABELS[normalizeTransactionPartnerInvitationRole(roleType)] || TRANSACTION_PARTNER_ROLE_LABELS.other
}

export function normalizePartnerProspectRole(value) {
  const roleType = normalizeTransactionPartnerInvitationRole(value)
  if (roleType === 'transfer_attorney' || roleType === 'bond_attorney' || roleType === 'cancellation_attorney') return 'attorney'
  if (roleType === 'bond_originator') return 'bond_originator'
  if (roleType === 'developer') return 'developer'
  return 'other'
}

function toCamelProspect(row = {}) {
  const status = normalizeText(row.status).toLowerCase() || 'invited'
  const invitationCount = Number(row.invitation_count || row.invitationCount || 0)
  const acceptedCount = Number(row.accepted_invitation_count || row.acceptedInvitationCount || 0)
  return {
    id: row.id || '',
    roleType: normalizePartnerProspectRole(row.role_type || row.roleType),
    transactionRoleType: normalizeTransactionPartnerInvitationRole(row.role_type || row.roleType),
    companyName: normalizeText(row.company_name || row.companyName),
    contactName: normalizeText(row.contact_name || row.contactName),
    email: normalizeText(row.email).toLowerCase(),
    phone: normalizeText(row.phone),
    status,
    statusLabel: PROSPECT_STATUS_LABELS[status] || 'Pending',
    bridgeUserId: row.bridge_user_id || row.bridgeUserId || null,
    joinedAt: row.joined_at || row.joinedAt || null,
    firstInvitedAt: row.first_invited_at || row.firstInvitedAt || null,
    lastInvitedAt: row.last_invited_at || row.lastInvitedAt || row.last_invitation_date || row.lastInvitationDate || null,
    invitationCount,
    acceptedInvitationCount: acceptedCount,
    declinedInvitationCount: Number(row.declined_invitation_count || row.declinedInvitationCount || 0),
    transactionCount: Number(row.transaction_count || row.transactionCount || 0),
    lastTransactionDate: row.last_transaction_date || row.lastTransactionDate || null,
    firstSeenDate: row.first_seen_date || row.firstSeenDate || row.created_at || row.createdAt || null,
    possibleDuplicateOf: row.possible_duplicate_of || row.possibleDuplicateOf || null,
    duplicateReviewStatus: row.duplicate_review_status || row.duplicateReviewStatus || 'none',
    acceptanceRate: invitationCount > 0 ? Math.round((acceptedCount / invitationCount) * 100) : 0,
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  }
}

export function normalizePartnerProspect(row = {}) {
  return toCamelProspect(row)
}

export function normalizeTransactionPartnerInvitation(row = {}) {
  const roleType = normalizeTransactionPartnerInvitationRole(row.role_type || row.roleType)
  const storedStatus = normalizeText(row.status).toLowerCase() || 'pending'
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  const lastEmailDelivery = metadata.lastEmailDelivery || metadata.last_email_delivery || null
  const emailDeliveryCount = Number(metadata.emailDeliveryCount || metadata.email_delivery_count || 0)
  const linkCopyCount = Number(metadata.linkCopyCount || metadata.link_copy_count || 0)
  const invitationToken = normalizeText(row.invitation_token || row.invitationToken)
  const canonicalInviteToken = normalizeText(metadata.canonicalInviteToken || metadata.canonical_invite_token)
  const canonicalInviteUrl = normalizeText(metadata.canonicalInviteUrl || metadata.canonical_invite_url) || canonicalInvitationUrlForToken(canonicalInviteToken)
  const expiresAt = row.expires_at || row.expiresAt || null
  const expiryTime = expiresAt ? new Date(expiresAt).getTime() : NaN
  const msUntilExpiry = Number.isNaN(expiryTime) ? null : expiryTime - Date.now()
  const isExpired = storedStatus === 'expired' || (storedStatus === 'pending' && msUntilExpiry !== null && msUntilExpiry <= 0)
  const status = isExpired ? 'expired' : storedStatus
  return {
    id: row.id || '',
    transactionId: row.transaction_id || row.transactionId || '',
    partnerProspectId: row.partner_prospect_id || row.partnerProspectId || null,
    roleType,
    roleLabel: getTransactionPartnerRoleLabel(roleType),
    companyName: normalizeText(row.company_name || row.companyName),
    contactName: normalizeText(row.contact_name || row.contactName),
    email: normalizeText(row.email).toLowerCase(),
    phone: normalizeText(row.phone),
    status,
    storedStatus,
    statusLabel: INVITATION_STATUS_LABELS[status] || 'Pending',
    isExpired,
    expiresSoon: status === 'pending' && msUntilExpiry !== null && msUntilExpiry > 0 && msUntilExpiry <= INVITATION_EXPIRY_SOON_MS,
    daysUntilExpiry: msUntilExpiry === null ? null : Math.max(0, Math.ceil(msUntilExpiry / (24 * 60 * 60 * 1000))),
    invitationToken,
    canonicalInviteToken,
    canonicalInviteUrl,
    invitationLink: isExpired ? '' : canonicalInviteUrl || invitationUrlForToken(invitationToken),
    expiresAt,
    viewedAt: row.viewed_at || row.viewedAt || null,
    declinedAt: row.declined_at || row.declinedAt || null,
    acceptedAt: row.accepted_at || row.acceptedAt || null,
    acceptedUserId: row.accepted_user_id || row.acceptedUserId || null,
    resentAt: row.resent_at || row.resentAt || null,
    metadata,
    lastEmailDelivery,
    emailDeliveryCount,
    lastLinkCopiedAt: metadata.lastLinkCopiedAt || metadata.last_link_copied_at || null,
    linkCopyCount,
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  }
}

export function normalizeTransactionPartnerInvitationDraft(input = {}) {
  const roleType = normalizeTransactionPartnerInvitationRole(input.roleType || input.role_type)
  const companyName = normalizeText(input.companyName || input.company_name)
  const contactName = normalizeText(input.contactName || input.contact_name)
  const email = normalizeText(input.email).toLowerCase()
  const phone = normalizeText(input.phone)

  return {
    roleType,
    companyName,
    contactName,
    email,
    phone,
  }
}

export function validateTransactionPartnerInvitationDraft(input = {}) {
  const draft = normalizeTransactionPartnerInvitationDraft(input)
  const errors = {}
  if (!draft.companyName) errors.companyName = 'Company name is required.'
  if (!draft.contactName) errors.contactName = 'Contact name is required.'
  if (!draft.email) errors.email = 'Email address is required.'
  if (draft.email && !EMAIL_PATTERN.test(draft.email)) errors.email = 'Enter a valid email address.'
  return { valid: Object.keys(errors).length === 0, errors, draft }
}

function filterProspectRows(rows = [], { roleType = '', query = '', limit = 20 } = {}) {
  const normalizedRole = roleType ? normalizePartnerProspectRole(roleType) : ''
  const needle = normalizeText(query).toLowerCase()
  return rows
    .map(toCamelProspect)
    .filter((row) => !normalizedRole || row.roleType === normalizedRole)
    .filter((row) => {
      if (!needle) return true
      return [row.companyName, row.contactName, row.email, row.phone].some((value) => String(value || '').toLowerCase().includes(needle))
    })
    .sort((left, right) => {
      if (left.status === 'joined' && right.status !== 'joined') return -1
      if (right.status === 'joined' && left.status !== 'joined') return 1
      if (right.transactionCount !== left.transactionCount) return right.transactionCount - left.transactionCount
      return String(left.companyName).localeCompare(String(right.companyName))
    })
    .slice(0, limit)
}

export function filterPartnerProspectsForSearch(rows = [], options = {}) {
  return filterProspectRows(rows, options)
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured for partner invitations.')
  }
  return supabase
}

function getOrigin() {
  if (typeof window === 'undefined') return ''
  return window.location.origin
}

function getConfiguredInviteOrigin() {
  const env = import.meta.env || {}
  const explicitOrigin = normalizeText(env.VITE_APP_URL || env.VITE_APP_ORIGIN || env.VITE_PUBLIC_APP_URL)
  if (explicitOrigin) return explicitOrigin.replace(/\/+$/, '')

  const currentOrigin = normalizeText(getOrigin())
  if (!currentOrigin) return FALLBACK_TRANSACTION_INVITE_ORIGIN

  try {
    const hostname = new URL(currentOrigin).hostname.toLowerCase()
    const shouldForceAppArch9 =
      hostname === 'admin.arch9.co.za' ||
      hostname === 'www.arch9.co.za' ||
      hostname.endsWith('bridgenine.co.za') ||
      hostname.endsWith('bridge9.app')

    if (shouldForceAppArch9) return FALLBACK_TRANSACTION_INVITE_ORIGIN
  } catch {
    return currentOrigin.replace(/\/+$/, '')
  }

  return currentOrigin.replace(/\/+$/, '')
}

function invitationUrlForToken(token) {
  const origin = getConfiguredInviteOrigin()
  return token ? `${origin}/transaction-invite/${token}` : ''
}

function canonicalInvitationUrlForToken(token) {
  const origin = getConfiguredInviteOrigin()
  return token ? `${origin}/invite/${token}` : ''
}

export function buildTransactionPartnerInvitationLink(token) {
  return invitationUrlForToken(token)
}

function joinLabel(parts = []) {
  return parts.map(normalizeText).filter(Boolean).join(', ')
}

function fallbackTransactionReference(transactionId) {
  const compactId = normalizeText(transactionId).replace(/-/g, '').slice(0, 8).toUpperCase()
  return compactId ? `TX-${compactId}` : 'Property Transaction'
}

function buildInvitationAcceptanceError(result = {}) {
  const code = normalizeText(result.code || result.reason)
  const messages = {
    not_authenticated: 'Please sign in or create your Arch9 password before accepting this invitation.',
    invalid_token: 'This invitation link is not valid.',
    invitation_not_found: 'This invitation is no longer available.',
    invitation_accepted: 'This invitation has already been accepted.',
    invitation_declined: 'This invitation has already been declined.',
    invitation_expired: 'This invitation has expired.',
    email_mismatch: 'This invitation is locked to a different email address.',
  }
  const error = new Error(messages[code] || 'Unable to accept this invitation.')
  error.code = code || 'acceptance_failed'
  error.details = result
  return error
}

function buildInvitationResendError(result = {}) {
  const code = normalizeText(result.code || result.reason)
  const messages = {
    invitation_not_found: 'This invitation is no longer available.',
    not_authorized: 'You do not have permission to resend this invitation.',
    invitation_already_accepted: 'This invitation has already been accepted.',
  }
  const error = new Error(messages[code] || 'Unable to resend this invitation.')
  error.code = code || 'resend_failed'
  error.details = result
  return error
}

async function maybeFetchSingle(client, table, select, column, value) {
  if (!normalizeText(value)) return null
  try {
    const result = await client.from(table).select(select).eq(column, value).maybeSingle()
    if (result.error) return null
    return result.data || null
  } catch {
    return null
  }
}

async function getTransactionPartnerInvitationEmailContext(client, transactionId) {
  const context = {
    invitedByOrganisation: 'Arch9',
    transactionReference: fallbackTransactionReference(transactionId),
    propertyLabel: 'Property transaction',
    buyerLabel: '',
  }

  const transaction = await maybeFetchSingle(client, 'transactions', '*', 'id', transactionId)
  if (!transaction) return context

  const organisation = await maybeFetchSingle(client, 'organisations', 'id, name, display_name', 'id', transaction.organisation_id)
  const unit = await maybeFetchSingle(client, 'units', '*', 'id', transaction.unit_id)
  const development = await maybeFetchSingle(
    client,
    'developments',
    '*',
    'id',
    transaction.development_id || unit?.development_id,
  )
  const buyer = await maybeFetchSingle(client, 'buyers', '*', 'id', transaction.buyer_id)

  const unitLabel = unit ? joinLabel([development?.name || development?.development_name, unit.unit_number ? `Unit ${unit.unit_number}` : '']) : ''
  const addressLabel = joinLabel([
    transaction.property_address_line_1,
    transaction.property_address_line_2,
    transaction.suburb,
    transaction.city,
    transaction.province,
  ])

  return {
    invitedByOrganisation: normalizeText(organisation?.display_name || organisation?.name) || context.invitedByOrganisation,
    transactionReference:
      normalizeText(transaction.transaction_reference || transaction.matter_number || transaction.reference) ||
      context.transactionReference,
    propertyLabel:
      unitLabel ||
      addressLabel ||
      normalizeText(transaction.property_description || transaction.title || development?.name || development?.development_name) ||
      context.propertyLabel,
    buyerLabel: normalizeText(buyer?.name || buyer?.full_name || buyer?.email),
  }
}

async function getCurrentUserId(client) {
  const result = await client.auth.getUser()
  return result?.data?.user?.id || null
}

async function logInvitationEvent(client, { transactionId, eventType, userId, invitation, metadata = {} }) {
  if (!transactionId) return null
  const payload = {
    transaction_id: transactionId,
    event_type: eventType,
    event_data: {
      invitationId: invitation?.id || null,
      roleType: invitation?.role_type || invitation?.roleType || null,
      companyName: invitation?.company_name || invitation?.companyName || null,
      contactName: invitation?.contact_name || invitation?.contactName || null,
      email: invitation?.email || null,
      ...metadata,
    },
    created_by: userId || null,
    created_by_role: 'agent',
  }

  const result = await client.from('transaction_events').insert(payload)
  if (result.error) {
    const message = String(result.error.message || '').toLowerCase()
    if (message.includes('transaction_events') || result.error.code === '42P01' || result.error.code === '42501') return null
    throw result.error
  }
  return result.data || null
}

async function upsertPendingRolePlayer(client, { transactionId, invitation, actorUserId }) {
  const roleType = normalizeTransactionPartnerInvitationRole(invitation.role_type || invitation.roleType)
  const rolePlayerRoleType = ROLE_PLAYER_ROLE_TYPE[roleType] || 'other'
  const email = normalizeText(invitation.email).toLowerCase()
  const nowIso = new Date().toISOString()
  const payload = {
    transaction_id: transactionId,
    role_type: rolePlayerRoleType,
    selection_source: 'invited_partner',
    partner_name: invitation.company_name || invitation.companyName || null,
    contact_person: invitation.contact_name || invitation.contactName || null,
    email_address: email || null,
    phone_number: invitation.phone || null,
    status: 'pending',
    assignment_status: 'pending_acceptance',
    assigned_by: actorUserId || null,
    transaction_partner_invitation_id: invitation.id || null,
    partner_prospect_id: invitation.partner_prospect_id || invitation.partnerProspectId || null,
    removed_at: null,
    snapshot_json: {
      source: 'transaction_partner_invitation',
      invitationId: invitation.id || null,
      partnerProspectId: invitation.partner_prospect_id || invitation.partnerProspectId || null,
      roleType,
      pendingAcceptance: true,
    },
    updated_at: nowIso,
  }

  let existing = await client
    .from('transaction_role_players')
    .select('id')
    .eq('transaction_id', transactionId)
    .eq('role_type', rolePlayerRoleType)
    .limit(1)

  if (existing.error && existing.error.code === '42P01') return null
  if (existing.error) throw existing.error

  const existingId = existing.data?.[0]?.id || null
  const query = existingId
    ? client.from('transaction_role_players').update(payload).eq('id', existingId).select('id').maybeSingle()
    : client.from('transaction_role_players').insert({ ...payload, created_at: nowIso }).select('id').maybeSingle()

  const result = await query
  if (result.error) {
    const fallback = { ...payload }
    for (const key of Object.keys(fallback)) {
      if (String(result.error.message || '').includes(key)) delete fallback[key]
    }
    const fallbackQuery = existingId
      ? client.from('transaction_role_players').update(fallback).eq('id', existingId).select('id').maybeSingle()
      : client.from('transaction_role_players').insert({ ...fallback, created_at: nowIso }).select('id').maybeSingle()
    const fallbackResult = await fallbackQuery
    if (fallbackResult.error && fallbackResult.error.code !== '42P01') throw fallbackResult.error
    return fallbackResult.data || null
  }
  return result.data || null
}

async function upsertInvitedParticipant(client, { transactionId, invitation, actorUserId }) {
  const roleType = normalizeTransactionPartnerInvitationRole(invitation.role_type || invitation.roleType)
  const shape = PARTICIPANT_ROLE_SHAPE[roleType] || PARTICIPANT_ROLE_SHAPE.other
  const email = normalizeText(invitation.email).toLowerCase()
  const nowIso = new Date().toISOString()
  const payload = {
    transaction_id: transactionId,
    role_type: shape.roleType,
    legal_role: shape.legalRole,
    transaction_role: shape.transactionRole,
    status: 'invited',
    user_id: null,
    participant_name: invitation.contact_name || invitation.contactName || invitation.company_name || invitation.companyName || null,
    participant_email: email || null,
    invited_by_user_id: actorUserId || null,
    invited_at: nowIso,
    accepted_at: null,
    removed_at: null,
    visibility_scope: 'shared',
    is_internal: false,
    participant_scope: 'transaction',
    assignment_source: 'partner_invitation',
    transaction_partner_invitation_id: invitation.id || null,
    partner_prospect_id: invitation.partner_prospect_id || invitation.partnerProspectId || null,
    can_view: true,
    can_comment: true,
    can_upload_documents: true,
    can_edit_finance_workflow: roleType === 'bond_originator',
    can_edit_attorney_workflow: ATTORNEY_WORKFLOW_INVITATION_ROLES.has(roleType),
    can_edit_core_transaction: false,
    updated_at: nowIso,
  }

  const result = await client
    .from('transaction_participants')
    .upsert(payload, { onConflict: 'transaction_id,role_type,legal_role' })
    .select('id')

  if (result.error) {
    if (result.error.code === '42P01') return null
    const fallback = { ...payload }
    for (const key of Object.keys(fallback)) {
      if (String(result.error.message || '').includes(key)) delete fallback[key]
    }
    const fallbackResult = await client
      .from('transaction_participants')
      .upsert(fallback, { onConflict: fallback.legal_role ? 'transaction_id,role_type,legal_role' : 'transaction_id,role_type' })
      .select('id')
    if (fallbackResult.error && fallbackResult.error.code !== '42P01') throw fallbackResult.error
    return fallbackResult.data?.[0] || null
  }

  return result.data?.[0] || null
}

function compactDeliveryResult(emailResult = {}, deliveryKind = 'initial') {
  const sent = emailResult?.sent === true || emailResult?.ok === true
  const providerResponse = emailResult?.providerResponse || emailResult?.provider_response || null
  const providerMessageId = providerResponse?.id || providerResponse?.messageId || providerResponse?.message_id || null
  const error = emailResult?.error
  return {
    deliveryKind,
    sent,
    ok: sent,
    provider: normalizeText(emailResult?.provider) || null,
    providerMessageId,
    reason: normalizeText(emailResult?.reason) || null,
    error: error ? normalizeText(error.message || error.name || error.code || error) : null,
    status: emailResult?.status || error?.status || null,
  }
}

async function recordInvitationDelivery(client, { invitationId, emailResult, deliveryKind = 'initial' } = {}) {
  const safeInvitationId = normalizeText(invitationId)
  if (!safeInvitationId) return null
  try {
    const payload = compactDeliveryResult(emailResult, deliveryKind)
    const result = await client.rpc('bridge_record_transaction_partner_invitation_delivery', {
      p_invitation_id: safeInvitationId,
      p_delivery_event: payload.sent ? `${deliveryKind}_email_sent` : `${deliveryKind}_email_failed`,
      p_delivery: payload,
    })
    if (result.error) {
      const message = String(result.error.message || '').toLowerCase()
      if (result.error.code === '42883' || message.includes('bridge_record_transaction_partner_invitation_delivery')) return null
      throw result.error
    }
    return result.data || null
  } catch {
    return null
  }
}

function getCanonicalTargetTransactionRole(roleType) {
  const normalized = normalizeTransactionPartnerInvitationRole(roleType)
  if (normalized === 'transfer_attorney') return 'attorney'
  if (normalized === 'bond_originator') return 'bond_originator'
  return normalized
}

function shouldCreateCanonicalTransactionInvite(roleType) {
  return CANONICAL_TRANSACTION_INVITE_ROLES.has(normalizeTransactionPartnerInvitationRole(roleType))
}

async function findExistingCanonicalPartnerInvite(client, { transactionId, invitation, roleType }) {
  const invitationId = normalizeText(invitation.id || invitation.invitation_id)
  const email = normalizeText(invitation.email).toLowerCase()
  if (!transactionId || !invitationId || !email) return null

  try {
    const result = await client
      .from('invites')
      .select('id, token, invite_type, status, target_transaction_id, target_transaction_role, email, metadata, created_at')
      .eq('target_transaction_id', transactionId)
      .eq('email', email)
      .eq('invite_type', INVITE_TYPES.transaction)
      .in('status', ['pending'])
      .contains('metadata', { transaction_partner_invitation_id: invitationId })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (result.error) return null
    if (!result.data?.token) return null
    return {
      inviteId: result.data.id,
      token: result.data.token,
      inviteType: result.data.invite_type,
      targetTransactionRole: result.data.target_transaction_role || getCanonicalTargetTransactionRole(roleType),
      inviteUrl: canonicalInvitationUrlForToken(result.data.token),
      reused: true,
    }
  } catch {
    return null
  }
}

async function persistCanonicalPartnerInviteReference(client, { invitationId, canonicalInvite }) {
  if (!normalizeText(invitationId) || !canonicalInvite?.token) return null
  try {
    const existing = await client
      .from('transaction_partner_invitations')
      .select('metadata')
      .eq('id', invitationId)
      .maybeSingle()
    const existingMetadata = existing.data?.metadata && typeof existing.data.metadata === 'object' ? existing.data.metadata : {}
    const result = await client
      .from('transaction_partner_invitations')
      .update({
        metadata: {
          ...existingMetadata,
          canonicalInviteId: canonicalInvite.inviteId || null,
          canonicalInviteToken: canonicalInvite.token,
          canonicalInviteType: canonicalInvite.inviteType || INVITE_TYPES.transaction,
          canonicalInviteUrl: canonicalInvite.inviteUrl,
          canonicalInviteUpdatedAt: new Date().toISOString(),
        },
      })
      .eq('id', invitationId)
      .select('id')
      .maybeSingle()
    if (result.error) return null
    return result.data || null
  } catch {
    return null
  }
}

async function ensureCanonicalTransactionPartnerInvite({ client, transactionId, invitation, roleType, actorUserId, metadata = {} }) {
  const normalizedRoleType = normalizeTransactionPartnerInvitationRole(roleType)
  if (!shouldCreateCanonicalTransactionInvite(normalizedRoleType)) return null

  const invitationId = normalizeText(invitation.id || invitation.invitation_id)
  const email = normalizeText(invitation.email).toLowerCase()
  if (!transactionId || !invitationId || !email) return null

  const existing = await findExistingCanonicalPartnerInvite(client, { transactionId, invitation, roleType: normalizedRoleType })
  if (existing) {
    await persistCanonicalPartnerInviteReference(client, { invitationId, canonicalInvite: existing })
    return existing
  }

  const payload = {
    invite_type: INVITE_TYPES.transaction,
    target_transaction_id: transactionId,
    target_transaction_role: getCanonicalTargetTransactionRole(normalizedRoleType),
    email,
    phone: invitation.phone || null,
    expires_at: invitation.expires_at || invitation.expiresAt || null,
    metadata: {
      source: 'transaction_partner_invitations',
      transaction_partner_invitation_id: invitationId,
      partner_prospect_id: invitation.partner_prospect_id || invitation.partnerProspectId || null,
      transaction_partner_role_type: normalizedRoleType,
      professional_role: normalizedRoleType,
      company_name: invitation.company_name || invitation.companyName || '',
      contact_name: invitation.contact_name || invitation.contactName || '',
      invited_by_user_id: actorUserId || null,
      ...metadata,
    },
  }

  try {
    const result = await createInvite(payload)
    const canonicalInvite = {
      inviteId: result.invite_id || result.id || null,
      token: result.token || '',
      inviteType: result.invite_type || INVITE_TYPES.transaction,
      targetTransactionRole: payload.target_transaction_role,
      inviteUrl: canonicalInvitationUrlForToken(result.token),
      reused: Boolean(result.idempotent),
    }
    await persistCanonicalPartnerInviteReference(client, { invitationId, canonicalInvite })
    return canonicalInvite
  } catch (error) {
    return {
      error,
      failed: true,
      message: error?.message || 'Unable to create canonical transaction invite.',
    }
  }
}

async function sendInvitationEmail({ transactionId, invitation, invitationUrl, deliveryKind = 'initial' }) {
  const email = normalizeText(invitation.email).toLowerCase()
  if (!email) return { sent: false, reason: 'missing_email' }
  const emailContext = await getTransactionPartnerInvitationEmailContext(supabase, transactionId)

  const { data, error } = await invokeEdgeFunction('send-email', {
    body: {
      type: 'transaction_partner_invitation',
      transactionId,
      transactionReference: emailContext.transactionReference,
      propertyLabel: emailContext.propertyLabel,
      buyerLabel: emailContext.buyerLabel,
      to: email,
      roleType: invitation.role_type || invitation.roleType,
      roleLabel: getTransactionPartnerRoleLabel(invitation.role_type || invitation.roleType),
      companyName: invitation.company_name || invitation.companyName,
      contactName: invitation.contact_name || invitation.contactName,
      invitedByOrganisation: emailContext.invitedByOrganisation,
      partnerProspectId: invitation.partner_prospect_id || invitation.partnerProspectId || null,
      reusedProspect: Boolean(invitation.partner_prospect_id || invitation.partnerProspectId),
      deliveryKind,
      invitationLink: invitationUrl,
    },
  })
  if (error) return { sent: false, error }
  return data || { sent: true }
}

export async function createTransactionPartnerInvitation(input = {}) {
  const client = requireClient()
  const transactionId = normalizeText(input.transactionId || input.transaction_id)
  if (!transactionId) throw new Error('Transaction is required.')

  const validation = validateTransactionPartnerInvitationDraft(input)
  if (!validation.valid) {
    const firstError = Object.values(validation.errors)[0] || 'Invitation details are incomplete.'
    throw new Error(firstError)
  }

  const actorUserId = input.invitedByUserId || input.invited_by_user_id || (await getCurrentUserId(client))
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const insertPayload = {
    transaction_id: transactionId,
    partner_prospect_id: input.partnerProspectId || input.partner_prospect_id || null,
    role_type: validation.draft.roleType,
    company_name: validation.draft.companyName,
    contact_name: validation.draft.contactName,
    email: validation.draft.email,
    phone: validation.draft.phone || null,
    status: 'pending',
    invited_by_user_id: actorUserId || null,
    invitation_token: token,
    expires_at: expiresAt,
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
  }

  const result = await client
    .from('transaction_partner_invitations')
    .insert(insertPayload)
    .select('id, transaction_id, partner_prospect_id, role_type, company_name, contact_name, email, phone, status, invitation_token, expires_at, created_at')
    .single()

  if (result.error) {
    if (result.error.code === '42P01') {
      throw new Error('Transaction partner invitations are not set up yet. Run the Phase 1 migration and refresh.')
    }
    throw result.error
  }

  let invitation = result.data
  let partnerProspect = null
  try {
    const prospectResult = await client.rpc('bridge_upsert_partner_prospect_for_invitation', {
      p_transaction_id: transactionId,
      p_invitation_id: invitation.id,
      p_role_type: validation.draft.roleType,
      p_company_name: validation.draft.companyName,
      p_contact_name: validation.draft.contactName,
      p_email: validation.draft.email,
      p_phone: validation.draft.phone || null,
      p_actor_user_id: actorUserId || null,
    })
    if (prospectResult.error) throw prospectResult.error
    partnerProspect = normalizePartnerProspect(prospectResult.data?.prospect || {})
    invitation = {
      ...invitation,
      partner_prospect_id: partnerProspect.id || invitation.partner_prospect_id || null,
    }
  } catch (prospectError) {
    const message = String(prospectError?.message || '').toLowerCase()
    if (!message.includes('bridge_upsert_partner_prospect_for_invitation') && prospectError?.code !== '42883') {
      throw prospectError
    }
  }
  await upsertPendingRolePlayer(client, { transactionId, invitation, actorUserId })
  await upsertInvitedParticipant(client, { transactionId, invitation, actorUserId })
  await logInvitationEvent(client, {
    transactionId,
    eventType: 'Invitation Sent',
    userId: actorUserId,
    invitation,
  })

  const canonicalInvite = await ensureCanonicalTransactionPartnerInvite({
    client,
    transactionId,
    invitation,
    roleType: validation.draft.roleType,
    actorUserId,
    metadata: {
      delivery_source: input.metadata?.source || 'transaction_partner_invitation',
    },
  })
  const legacyInvitationUrl = invitationUrlForToken(invitation.invitation_token || token)
  const invitationUrl = canonicalInvite?.inviteUrl || legacyInvitationUrl
  const emailResult = await sendInvitationEmail({ transactionId, invitation, invitationUrl })
  const deliveryResult = await recordInvitationDelivery(client, {
    invitationId: invitation.id,
    emailResult,
    deliveryKind: 'initial',
  })

  return {
    invitation,
    partnerProspect,
    canonicalInvite,
    legacyInvitationUrl,
    invitationUrl,
    emailResult,
    deliveryResult,
  }
}

export async function searchPartnerProspects(options = {}) {
  const client = requireClient()
  const roleType = normalizePartnerProspectRole(options.roleType || options.role_type)
  const query = sanitizePostgrestSearchTerm(options.query)
  const limit = Math.max(1, Math.min(Number(options.limit || 12), 50))

  let builder = client
    .from('partner_prospects')
    .select('id, role_type, company_name, contact_name, email, phone, status, bridge_user_id, joined_at, first_invited_at, last_invited_at, last_invitation_date, invitation_count, accepted_invitation_count, declined_invitation_count, transaction_count, last_transaction_date, first_seen_date, possible_duplicate_of, duplicate_review_status, created_at, updated_at')
    .eq('role_type', roleType)
    .order('transaction_count', { ascending: false })
    .order('company_name', { ascending: true })
    .limit(limit)

  if (query) {
    builder = builder.or(`company_name.ilike.%${query}%,contact_name.ilike.%${query}%,email.ilike.%${query}%`)
  }

  const result = await builder
  if (result.error) {
    if (result.error.code === '42P01') return []
    throw result.error
  }
  return filterProspectRows(result.data || [], { roleType, query, limit })
}

export async function listPartnerProspects(options = {}) {
  const client = requireClient()
  const roleType = options.roleType || options.role_type ? normalizePartnerProspectRole(options.roleType || options.role_type) : ''
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 500))

  let builder = client
    .from('partner_prospects')
    .select('id, role_type, company_name, contact_name, email, phone, status, bridge_user_id, joined_at, first_invited_at, last_invited_at, last_invitation_date, invitation_count, accepted_invitation_count, declined_invitation_count, transaction_count, last_transaction_date, first_seen_date, possible_duplicate_of, duplicate_review_status, created_at, updated_at')
    .order('transaction_count', { ascending: false })
    .order('company_name', { ascending: true })
    .limit(limit)

  if (roleType) builder = builder.eq('role_type', roleType)

  const result = await builder
  if (result.error) {
    if (result.error.code === '42P01') return []
    throw result.error
  }
  return filterProspectRows(result.data || [], { roleType, limit })
}

export async function listTransactionPartnerInvitations(transactionId) {
  const client = requireClient()
  const safeTransactionId = normalizeText(transactionId)
  if (!safeTransactionId) return []

  await expireStaleTransactionPartnerInvitations(safeTransactionId)

  const result = await client
    .from('transaction_partner_invitations')
    .select('id, transaction_id, partner_prospect_id, role_type, company_name, contact_name, email, phone, status, invitation_token, expires_at, viewed_at, declined_at, accepted_at, accepted_user_id, resent_at, metadata, created_at, updated_at')
    .eq('transaction_id', safeTransactionId)
    .order('created_at', { ascending: false })

  if (result.error) {
    if (result.error.code === '42P01' || result.error.code === '42501') return []
    throw result.error
  }
  return (result.data || []).map(normalizeTransactionPartnerInvitation)
}

export async function expireStaleTransactionPartnerInvitations(transactionId) {
  const client = requireClient()
  const safeTransactionId = normalizeText(transactionId)
  if (!safeTransactionId) return null

  try {
    const result = await client.rpc('bridge_expire_stale_transaction_partner_invitations', {
      p_transaction_id: safeTransactionId,
    })
    if (result.error) {
      const message = String(result.error.message || '').toLowerCase()
      if (result.error.code === '42883' || message.includes('bridge_expire_stale_transaction_partner_invitations')) return null
      throw result.error
    }
    return result.data || null
  } catch (error) {
    const message = String(error?.message || '').toLowerCase()
    if (message.includes('bridge_expire_stale_transaction_partner_invitations')) return null
    throw error
  }
}

export async function recordTransactionPartnerInvitationLinkCopied(invitationId) {
  const client = requireClient()
  const safeInvitationId = normalizeText(invitationId)
  if (!safeInvitationId) return null

  try {
    const result = await client.rpc('bridge_record_transaction_partner_invitation_action', {
      p_invitation_id: safeInvitationId,
      p_action: 'link_copied',
      p_metadata: { source: 'transaction_detail_partner_invites_card' },
    })
    if (result.error) {
      const message = String(result.error.message || '').toLowerCase()
      if (result.error.code === '42883' || message.includes('bridge_record_transaction_partner_invitation_action')) return null
      throw result.error
    }
    return result.data || null
  } catch (error) {
    const message = String(error?.message || '').toLowerCase()
    if (message.includes('bridge_record_transaction_partner_invitation_action')) return null
    throw error
  }
}

export async function applyPartnerProspectToTransaction({ transactionId, partnerProspectId, roleType } = {}) {
  const client = requireClient()
  const safeTransactionId = normalizeText(transactionId)
  const safeProspectId = normalizeText(partnerProspectId)
  if (!safeTransactionId) throw new Error('Transaction is required.')
  if (!safeProspectId) throw new Error('Partner prospect is required.')

  const result = await client.rpc('bridge_use_partner_prospect_on_transaction', {
    p_transaction_id: safeTransactionId,
    p_partner_prospect_id: safeProspectId,
    p_role_type: normalizeTransactionPartnerInvitationRole(roleType),
  })
  if (result.error) throw result.error
  if (!result.data?.success) throw new Error(result.data?.code || 'Unable to use this partner prospect.')
  return result.data
}

export async function getTransactionPartnerInvitationByToken(token) {
  const client = requireClient()
  const result = await client.rpc('bridge_get_transaction_partner_invitation', { p_token: normalizeText(token) })
  if (result.error) throw result.error
  return result.data || { ok: false, reason: 'not_found' }
}

export async function acceptTransactionPartnerInvitation({ token, profile = {} } = {}) {
  const client = requireClient()
  const result = await client.rpc('bridge_accept_transaction_partner_invitation', {
    p_token: normalizeText(token),
    p_profile: profile && typeof profile === 'object' ? profile : {},
  })
  if (result.error) throw result.error
  if (!result.data?.success) {
    throw buildInvitationAcceptanceError(result.data)
  }
  return result.data
}

export async function declineTransactionPartnerInvitation(token) {
  const client = requireClient()
  const result = await client.rpc('bridge_decline_transaction_partner_invitation', { p_token: normalizeText(token) })
  if (result.error) throw result.error
  if (!result.data?.success) throw new Error(result.data?.code || 'Unable to decline this invitation.')
  return result.data
}

export async function resendTransactionPartnerInvitation(invitationId) {
  const client = requireClient()
  const result = await client.rpc('bridge_resend_transaction_partner_invitation', { p_invitation_id: invitationId })
  if (result.error) throw result.error
  if (!result.data?.success) throw buildInvitationResendError(result.data)

  const invitation = result.data.invitation || {
    id: result.data.invitationId || invitationId,
    transaction_id: result.data.transactionId,
    transactionId: result.data.transactionId,
    role_type: result.data.roleType,
    roleType: result.data.roleType,
    company_name: result.data.companyName,
    companyName: result.data.companyName,
    contact_name: result.data.contactName,
    contactName: result.data.contactName,
    email: result.data.email,
    partner_prospect_id: result.data.partnerProspectId || null,
    partnerProspectId: result.data.partnerProspectId || null,
  }
  const transactionId = result.data.transactionId || invitation.transaction_id || invitation.transactionId
  const roleType = invitation.role_type || invitation.roleType
  const canonicalInvite = await ensureCanonicalTransactionPartnerInvite({
    client,
    transactionId,
    invitation,
    roleType,
    actorUserId: null,
    metadata: {
      delivery_source: 'transaction_partner_invitation_resend',
    },
  })
  const legacyInvitationUrl = invitationUrlForToken(result.data.token)
  const invitationUrl = canonicalInvite?.inviteUrl || legacyInvitationUrl
  const emailResult = await sendInvitationEmail({
    transactionId,
    invitation,
    invitationUrl,
    deliveryKind: 'resend',
  })
  const deliveryResult = await recordInvitationDelivery(client, {
    invitationId: result.data.invitationId || invitation.id || invitationId,
    emailResult,
    deliveryKind: 'resend',
  })

  return {
    ...result.data,
    canonicalInvite,
    legacyInvitationUrl,
    invitationUrl,
    emailResult,
    deliveryResult,
  }
}
