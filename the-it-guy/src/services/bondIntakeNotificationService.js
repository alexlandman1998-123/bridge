import { getBondApplicationProgress, getBondIntakeSummary } from '../core/transactions/bondIntakeSelectors'
import { isBondFinanceType } from '../core/transactions/financeType'
import { invokeEdgeFunction, supabase } from '../lib/supabaseClient'

export const BOND_NOTIFICATION_EVENTS = Object.freeze({
  BOND_INTAKE_STARTED: 'BOND_INTAKE_STARTED',
  BOND_INTAKE_RECEIVED: 'BOND_INTAKE_RECEIVED',
  BOND_OTP_READY: 'BOND_OTP_READY',
  BOND_APPLICATION_STARTED: 'BOND_APPLICATION_STARTED',
  BOND_APPLICATION_SUBMITTED: 'BOND_APPLICATION_SUBMITTED',
  BOND_DOCUMENTS_COMPLETE: 'BOND_DOCUMENTS_COMPLETE',
  BOND_APPLICATION_READY_FOR_REVIEW: 'BOND_APPLICATION_READY_FOR_REVIEW',
  BOND_APPLICATION_ACCEPTED: 'BOND_APPLICATION_ACCEPTED',
  BOND_APPLICATION_ASSIGNED: 'BOND_APPLICATION_ASSIGNED',
  BOND_APPLICATION_DECLINED: 'BOND_APPLICATION_DECLINED',
  BUYER_BOND_ORIGINATOR_INTRO: 'BUYER_BOND_ORIGINATOR_INTRO',
})

const EVENT_KEYS = Object.freeze({
  [BOND_NOTIFICATION_EVENTS.BOND_INTAKE_STARTED]: 'bond_intake_started',
  [BOND_NOTIFICATION_EVENTS.BOND_INTAKE_RECEIVED]: 'bond_intake_received',
  [BOND_NOTIFICATION_EVENTS.BOND_OTP_READY]: 'bond_otp_ready',
  [BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_STARTED]: 'bond_application_started',
  [BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_SUBMITTED]: 'bond_application_submitted',
  [BOND_NOTIFICATION_EVENTS.BOND_DOCUMENTS_COMPLETE]: 'bond_documents_complete',
  [BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_READY_FOR_REVIEW]: 'bond_application_ready_for_review',
  [BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_ACCEPTED]: 'bond_application_accepted',
  [BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_ASSIGNED]: 'bond_application_assigned',
  [BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_DECLINED]: 'bond_application_declined',
  [BOND_NOTIFICATION_EVENTS.BUYER_BOND_ORIGINATOR_INTRO]: 'buyer_bond_intro_email_sent',
})

const MANAGER_ROLE_KEYS = new Set(['owner', 'principal', 'director', 'manager', 'hq_manager', 'regional_manager', 'branch_manager', 'team_lead', 'admin'])
const HQ_MANAGER_ROLE_KEYS = new Set(['owner', 'principal', 'director', 'manager', 'hq_manager', 'admin'])
const REGIONAL_MANAGER_ROLE_KEYS = new Set(['regional_manager', 'hq_manager', 'director', 'owner', 'manager'])
const BRANCH_MANAGER_ROLE_KEYS = new Set(['branch_manager', 'team_lead', 'manager', 'owner', 'hq_manager'])
const ACTIVE_STATUSES = new Set(['', 'active', 'approved', 'assigned', 'current', 'in_progress', 'pending', 'notified'])
const EMAIL_EVENTS = new Set([
  BOND_NOTIFICATION_EVENTS.BOND_INTAKE_STARTED,
  BOND_NOTIFICATION_EVENTS.BOND_INTAKE_RECEIVED,
  BOND_NOTIFICATION_EVENTS.BOND_OTP_READY,
  BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_SUBMITTED,
  BOND_NOTIFICATION_EVENTS.BOND_DOCUMENTS_COMPLETE,
  BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_READY_FOR_REVIEW,
  BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_ACCEPTED,
  BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_ASSIGNED,
  BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_DECLINED,
  BOND_NOTIFICATION_EVENTS.BUYER_BOND_ORIGINATOR_INTRO,
])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeRoleKey(value) {
  return normalizeLower(value).replace(/[\s-]+/g, '_')
}

function normalizeEmail(value) {
  return normalizeLower(value)
}

function readBoolean(value, fallback = false) {
  const normalized = normalizeLower(value)
  if (!normalized) return fallback
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)
}

function notificationsEnabled(options = {}) {
  if (typeof options.enabled === 'boolean') return options.enabled
  const envValue = import.meta.env?.VITE_ENABLE_BOND_INTAKE_NOTIFICATIONS
  return readBoolean(envValue, true)
}

function emailsEnabled(options = {}) {
  if (typeof options.emailEnabled === 'boolean') return options.emailEnabled
  const viteValue = import.meta.env?.VITE_BOND_INTAKE_EMAILS_ENABLED
  const legacyValue = import.meta.env?.BOND_INTAKE_EMAILS_ENABLED
  return readBoolean(viteValue || legacyValue, false)
}

function isMissingTableError(error, table = '') {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeLower(error?.message || error?.details || error?.hint)
  return code === '42P01' || code === 'PGRST205' || message.includes('relation does not exist') || (table && message.includes(table) && message.includes('schema cache'))
}

function isMissingColumnError(error, column = '') {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeLower(error?.message || error?.details || error?.hint)
  return (code === '42703' || code === 'PGRST204') && (!column || message.includes(normalizeLower(column)))
}

function isPermissionDeniedError(error) {
  const code = normalizeText(error?.code)
  const message = normalizeLower(error?.message || error?.details || error?.hint)
  return code === '42501' || message.includes('permission denied') || message.includes('row-level security')
}

function getClient(options = {}) {
  const client = options.client || supabase
  if (!client) {
    throw new Error('Supabase is not configured.')
  }
  return client
}

function compactObject(payload = {}) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
}

function getTransactionId(transaction = {}, explicitId = '') {
  const id = normalizeText(explicitId || transaction?.id || transaction?.transaction_id || transaction?.transactionId)
  if (!id) {
    throw new Error('Transaction is required for bond notification.')
  }
  return id
}

function isUuidLike(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function looksLikeRawOrganisationId(value = '') {
  const normalized = normalizeLower(value)
  return !normalized || isUuidLike(normalized) || /^organisation-[0-9a-f-]+/.test(normalized)
}

function displayNameFromParts(...parts) {
  return parts.map(normalizeText).filter(Boolean).join(' ')
}

function safeDisplayName(candidates = [], fallback = '') {
  const value = candidates.map(normalizeText).find((item) => item && !looksLikeRawOrganisationId(item))
  return value || fallback
}

function makeRecipient(input = {}, fallbackRole = 'bond_originator') {
  const email = normalizeEmail(input.email || input.email_address || input.participant_email || input.assignedEmail || input.assigned_email)
  const userId = normalizeText(input.userId || input.user_id || input.id || input.profile_id || input.profileId)
  const name = safeDisplayName([
    input.name,
    input.fullName,
    input.full_name,
    input.displayName,
    input.display_name,
    input.participant_name,
    input.contact_person,
    input.contactPerson,
    displayNameFromParts(input.first_name, input.last_name),
    input.partner_name,
    input.partnerName,
    email,
  ], email || 'Recipient')
  const roleType = normalizeRoleKey(input.roleType || input.role_type || input.role || fallbackRole)
  if (!email && !userId) return null
  return {
    key: userId || email,
    userId: userId || null,
    email: email || null,
    name,
    roleType,
    phone: normalizeText(input.phone || input.phone_number || input.phoneNumber || input.mobile || input.mobile_number || input.mobileNumber),
    title: normalizeText(input.title || input.job_title || input.jobTitle || input.role_title || input.roleTitle),
    source: normalizeText(input.source) || null,
  }
}

function dedupeRecipients(recipients = []) {
  const byKey = new Map()
  for (const recipient of recipients.filter(Boolean)) {
    const key = recipient.userId || recipient.email
    if (!key) continue
    if (!byKey.has(key)) byKey.set(key, recipient)
  }
  return [...byKey.values()]
}

function getRolePlayers(transaction = {}) {
  if (Array.isArray(transaction.rolePlayers)) return transaction.rolePlayers
  if (Array.isArray(transaction.transactionRolePlayers)) return transaction.transactionRolePlayers
  if (Array.isArray(transaction.transaction_role_players)) return transaction.transaction_role_players
  return []
}

function getParticipants(transaction = {}) {
  if (Array.isArray(transaction.participants)) return transaction.participants
  if (Array.isArray(transaction.transactionParticipants)) return transaction.transactionParticipants
  if (Array.isArray(transaction.transaction_participants)) return transaction.transaction_participants
  return []
}

function isActiveRow(row = {}) {
  const status = normalizeRoleKey(row.assignment_status || row.assignmentStatus || row.status || row.participant_status || row.participantStatus)
  return ACTIVE_STATUSES.has(status) && !row.removed_at && !row.removedAt
}

function roleMatches(row = {}, roles = []) {
  const normalizedRoles = roles.map(normalizeRoleKey)
  const role = normalizeRoleKey(row.role_type || row.roleType || row.participant_role || row.participantRole || row.role)
  return normalizedRoles.includes(role)
}

function isAffirmative(value) {
  const normalized = normalizeLower(value)
  return ['1', 'true', 'yes', 'y', 'on', 'enabled'].includes(normalized)
}

function isBondAssistanceRequested(formData = {}) {
  const form = formData?.form_data && typeof formData.form_data === 'object' ? formData.form_data : formData
  return [
    form?.bond_help_requested,
    form?.bondHelpRequested,
    form?.needs_bond_assistance,
    form?.needsBondAssistance,
    form?.ooba_assist_requested,
    form?.oobaAssistRequested,
    form?.finance?.bond_help_requested,
    form?.finance?.bondHelpRequested,
    form?.finance?.needs_bond_assistance,
    form?.finance?.needsBondAssistance,
  ].some(isAffirmative)
}

async function resolveProfilesByEmail(client, emails = []) {
  const normalizedEmails = [...new Set(emails.map(normalizeEmail).filter(Boolean))]
  if (!normalizedEmails.length) return {}
  const query = await client.from('profiles').select('id, email, full_name, first_name, last_name').in('email', normalizedEmails)
  if (query.error) {
    if (isMissingTableError(query.error, 'profiles') || isPermissionDeniedError(query.error)) return {}
    throw query.error
  }
  return (query.data || []).reduce((accumulator, row) => {
    const email = normalizeEmail(row.email)
    if (email) accumulator[email] = row
    return accumulator
  }, {})
}

async function fetchTransactionIfNeeded(client, transaction = {}) {
  if (transaction && (transaction.id || transaction.transaction_id) && Object.keys(transaction).length > 1) {
    return transaction
  }
  const transactionId = getTransactionId(transaction)
  const query = await client.from('transactions').select('*').eq('id', transactionId).maybeSingle()
  if (query.error) {
    if (isMissingTableError(query.error, 'transactions') || isPermissionDeniedError(query.error)) return transaction
    throw query.error
  }
  return query.data || transaction
}

async function fetchBuyer(client, transaction = {}) {
  if (transaction.buyer && typeof transaction.buyer === 'object') return transaction.buyer
  const buyerId = normalizeText(transaction.buyer_id || transaction.buyerId)
  if (!buyerId) {
    return makeRecipient({
      email: transaction.buyer_email || transaction.buyerEmail || transaction.client_email || transaction.clientEmail,
      name: transaction.buyer_name || transaction.buyerName || transaction.client_name || transaction.clientName,
      role: 'client',
    }, 'client')
  }
  const query = await client.from('buyers').select('id, name, email, phone').eq('id', buyerId).maybeSingle()
  if (query.error) {
    if (isMissingTableError(query.error, 'buyers') || isPermissionDeniedError(query.error)) return null
    throw query.error
  }
  return makeRecipient({ ...query.data, id: null, source: 'buyers' }, 'client')
}

async function fetchRolePlayers(client, transaction = {}) {
  const existing = getRolePlayers(transaction)
  if (existing.length) return existing
  const transactionId = normalizeText(transaction.id || transaction.transaction_id)
  if (!transactionId) return []
  let query = await client
    .from('transaction_role_players')
    .select('id, transaction_id, role_type, partner_name, contact_person, email_address, phone_number, preferred_partner_id, partner_relationship_id, organisation_id, snapshot_json, status, assignment_status, activated_at, selection_source')
    .eq('transaction_id', transactionId)
  if (
    query.error &&
    (isMissingColumnError(query.error, 'partner_relationship_id') ||
      isMissingColumnError(query.error, 'organisation_id') ||
      isMissingColumnError(query.error, 'assignment_status') ||
      isMissingColumnError(query.error, 'activated_at'))
  ) {
    query = await client
      .from('transaction_role_players')
      .select('id, transaction_id, role_type, partner_name, contact_person, email_address, phone_number, preferred_partner_id, snapshot_json, status, selection_source')
      .eq('transaction_id', transactionId)
  }
  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_role_players') || isPermissionDeniedError(query.error)) return []
    throw query.error
  }
  return query.data || []
}

async function fetchParticipants(client, transaction = {}) {
  const existing = getParticipants(transaction)
  if (existing.length) return existing
  const transactionId = normalizeText(transaction.id || transaction.transaction_id)
  if (!transactionId) return []
  const query = await client
    .from('transaction_participants')
    .select('id, transaction_id, user_id, role_type, participant_name, participant_email, status, removed_at')
    .eq('transaction_id', transactionId)
  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_participants') || isPermissionDeniedError(query.error)) return []
    throw query.error
  }
  return query.data || []
}

async function fetchDefaultBondPartner(client, transaction = {}) {
  const organisationId = normalizeText(transaction.organisation_id || transaction.organisationId || transaction.agency_organisation_id || transaction.agencyOrganisationId)
  if (!organisationId) return null
  const query = await client
    .from('organisation_preferred_partners')
    .select('id, partner_type, company_name, contact_person, email_address, is_active, is_preferred_default')
    .eq('organisation_id', organisationId)
    .eq('partner_type', 'bond_originator')
    .eq('is_active', true)
    .order('is_preferred_default', { ascending: false })
    .limit(1)
  if (query.error) {
    if (isMissingTableError(query.error, 'organisation_preferred_partners') || isPermissionDeniedError(query.error)) return null
    throw query.error
  }
  const row = Array.isArray(query.data) ? query.data[0] : query.data
  return row ? makeRecipient({ ...row, name: row.contact_person || row.company_name, email: row.email_address, source: 'default_preferred_partner' }, 'bond_originator') : null
}

function getRolePlayerSnapshot(row = {}) {
  const snapshot = row.snapshot_json || row.snapshotJson || row.snapshot || {}
  return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {}
}

function getSelectedBondRolePlayer(rolePlayers = []) {
  return (rolePlayers || []).find((row) => {
    if (!roleMatches(row, ['bond_originator'])) return false
    const status = normalizeRoleKey(row.assignment_status || row.assignmentStatus || row.status)
    return !['removed', 'declined', 'rejected'].includes(status)
  }) || null
}

async function fetchPartnerRelationship(client, relationshipId = '') {
  const id = normalizeText(relationshipId)
  if (!id) return null
  const query = await client
    .from('organisation_partners')
    .select('id, organisation_id, partner_organisation_id, partner_type, scope_type, scope_id, scope_name, preferred, status, relationship_status')
    .eq('id', id)
    .maybeSingle()
  if (query.error) {
    if (isMissingTableError(query.error, 'organisation_partners') || isPermissionDeniedError(query.error)) return null
    if (isMissingColumnError(query.error)) return null
    throw query.error
  }
  return query.data || null
}

function resolveBondPartnerScope(transaction = {}, rolePlayer = {}, relationship = null) {
  const snapshot = getRolePlayerSnapshot(rolePlayer)
  const scopeType = normalizeRoleKey(snapshot.scopeType || snapshot.scope_type || relationship?.scope_type || relationship?.scopeType || '')
  const scopeId = normalizeText(snapshot.scopeId || snapshot.scope_id || relationship?.scope_id || relationship?.scopeId || '')
  const bondWorkspaceId = normalizeText(
    transaction.bond_workspace_id ||
      transaction.bondWorkspaceId ||
      rolePlayer.organisation_id ||
      rolePlayer.organisationId ||
      snapshot.organisationId ||
      snapshot.organisation_id ||
      relationship?.partner_organisation_id ||
      relationship?.partnerOrganisationId,
  )
  return {
    bondWorkspaceId,
    scopeType: scopeType || (scopeId ? 'organisation' : ''),
    scopeId,
    scopeName: normalizeText(snapshot.scopeLabel || snapshot.scope_label || relationship?.scope_name || relationship?.scopeName),
  }
}

function getMembershipRole(row = {}) {
  return normalizeRoleKey(row.workspace_role || row.organisation_role || row.role)
}

function membershipMatchesUnit(row = {}, unitId = '') {
  const id = normalizeText(unitId)
  if (!id) return false
  return [
    row.workspace_unit_id,
    row.workspaceUnitId,
    row.branch_id,
    row.branchId,
    row.primary_branch_id,
    row.primaryBranchId,
    row.team_id,
    row.teamId,
  ].some((value) => normalizeText(value) === id)
}

function membershipMatchesRegion(row = {}, regionId = '') {
  const id = normalizeText(regionId)
  if (!id) return false
  return normalizeText(row.region_id || row.regionId) === id
}

function mapManagerRecipient(row = {}) {
  return makeRecipient({ ...row, id: row.user_id || row.id, role: getMembershipRole(row) || 'manager', source: 'organisation_users' }, 'bond_originator')
}

function chooseManagersForScope(rows = [], scope = {}) {
  const scopeType = normalizeRoleKey(scope.scopeType)
  const scopeId = normalizeText(scope.scopeId)
  const activeRows = rows.filter((row) => ['active', 'approved'].includes(normalizeRoleKey(row.status)))
  const byRole = (roleSet) => activeRows.filter((row) => roleSet.has(getMembershipRole(row)))

  if (['branch', 'team'].includes(scopeType) && scopeId) {
    const branchManagers = byRole(BRANCH_MANAGER_ROLE_KEYS).filter((row) => membershipMatchesUnit(row, scopeId))
    if (branchManagers.length) return branchManagers
    const unitRegionId = normalizeText(activeRows.find((row) => membershipMatchesUnit(row, scopeId))?.region_id)
    if (unitRegionId) {
      const regionalFallback = byRole(REGIONAL_MANAGER_ROLE_KEYS).filter((row) => membershipMatchesRegion(row, unitRegionId))
      if (regionalFallback.length) return regionalFallback
    }
  }

  if (scopeType === 'region' && scopeId) {
    const regionalManagers = byRole(REGIONAL_MANAGER_ROLE_KEYS).filter((row) => membershipMatchesRegion(row, scopeId))
    if (regionalManagers.length) return regionalManagers
  }

  const hqManagers = byRole(HQ_MANAGER_ROLE_KEYS)
  if (hqManagers.length) return hqManagers
  return byRole(MANAGER_ROLE_KEYS)
}

async function fetchManagers(client, transaction = {}, rolePlayers = []) {
  const selectedBondRolePlayer = getSelectedBondRolePlayer(rolePlayers)
  const relationship = await fetchPartnerRelationship(
    client,
    selectedBondRolePlayer?.partner_relationship_id ||
      selectedBondRolePlayer?.partnerRelationshipId ||
      getRolePlayerSnapshot(selectedBondRolePlayer || {}).partnerRelationshipId,
  )
  const scope = resolveBondPartnerScope(transaction, selectedBondRolePlayer || {}, relationship)
  const organisationId = normalizeText(scope.bondWorkspaceId || transaction.bond_workspace_id || transaction.bondWorkspaceId || transaction.organisation_id || transaction.organisationId)
  if (!organisationId) return []
  let query = await client
    .from('organisation_users')
    .select('id, organisation_id, user_id, first_name, last_name, email, role, workspace_role, organisation_role, status, region_id, workspace_unit_id, branch_id, primary_branch_id, scope_level')
    .eq('organisation_id', organisationId)
    .in('status', ['active', 'approved'])
  if (
    query.error &&
    (isMissingColumnError(query.error, 'region_id') ||
      isMissingColumnError(query.error, 'workspace_unit_id') ||
      isMissingColumnError(query.error, 'branch_id') ||
      isMissingColumnError(query.error, 'primary_branch_id') ||
      isMissingColumnError(query.error, 'scope_level'))
  ) {
    query = await client
      .from('organisation_users')
      .select('id, organisation_id, user_id, first_name, last_name, email, role, workspace_role, organisation_role, status')
      .eq('organisation_id', organisationId)
      .in('status', ['active', 'approved'])
  }
  if (query.error) {
    if (isMissingTableError(query.error, 'organisation_users') || isPermissionDeniedError(query.error)) return []
    throw query.error
  }
  return chooseManagersForScope(query.data || [], scope)
    .map(mapManagerRecipient)
    .filter(Boolean)
}

async function fetchBondOrganisationContact(client, transaction = {}, rolePlayers = []) {
  const selectedBondRolePlayer = getSelectedBondRolePlayer(rolePlayers)
  const relationship = await fetchPartnerRelationship(
    client,
    selectedBondRolePlayer?.partner_relationship_id ||
      selectedBondRolePlayer?.partnerRelationshipId ||
      getRolePlayerSnapshot(selectedBondRolePlayer || {}).partnerRelationshipId,
  )
  const scope = resolveBondPartnerScope(transaction, selectedBondRolePlayer || {}, relationship)
  const organisationId = normalizeText(scope.bondWorkspaceId || transaction.bond_workspace_id || transaction.bondWorkspaceId)
  const rolePlayerSnapshot = getRolePlayerSnapshot(selectedBondRolePlayer || {})
  const fallback = makeRecipient({
    email: selectedBondRolePlayer?.email_address || rolePlayerSnapshot.email || transaction.assigned_bond_originator_email,
    name:
      selectedBondRolePlayer?.partner_name ||
      selectedBondRolePlayer?.contact_person ||
      rolePlayerSnapshot.companyName ||
      transaction.bond_originator ||
      'Bond originator',
    role: 'bond_originator',
    source: 'transaction_role_players',
  }, 'bond_originator')

  if (!organisationId) {
    return {
      recipient: fallback,
      organisationName: fallback?.name || 'Bond originator',
      scope,
    }
  }

  const query = await client
    .from('organisations')
    .select('id, name, display_name, company_email, support_email, email, company_phone, support_phone, phone')
    .eq('id', organisationId)
    .maybeSingle()
  if (query.error) {
    if (isMissingTableError(query.error, 'organisations') || isPermissionDeniedError(query.error) || isMissingColumnError(query.error)) {
      return {
        recipient: fallback,
        organisationName: fallback?.name || 'Bond originator',
        scope,
      }
    }
    throw query.error
  }

  const organisation = query.data || {}
  const organisationName = safeDisplayName([
    organisation.display_name,
    organisation.name,
    selectedBondRolePlayer?.partner_name,
    rolePlayerSnapshot.companyName,
    transaction.bond_originator,
  ], fallback?.name || 'Bond originator')

  return {
    recipient: makeRecipient({
      email: organisation.company_email || organisation.support_email || organisation.email || fallback?.email,
      name: organisationName,
      role: 'bond_originator',
      source: 'organisations',
    }, 'bond_originator'),
    organisationName,
    phone: normalizeText(organisation.company_phone || organisation.support_phone || organisation.phone),
    scope,
  }
}

function recipientFromParticipant(row = {}, fallbackRole = 'agent') {
  return makeRecipient({
    userId: row.user_id,
    email: row.participant_email,
    name: row.participant_name,
    role: row.role_type,
    source: 'transaction_participants',
  }, fallbackRole)
}

function recipientFromRolePlayer(row = {}, fallbackRole = 'bond_originator') {
  const snapshot = row.snapshot_json || row.snapshotJson || {}
  return makeRecipient({
    userId: snapshot.assigned_user_id || snapshot.accepted_by || row.user_id,
    email: row.email_address || snapshot.assigned_user_email || snapshot.accepted_by_email,
    name: row.contact_person || snapshot.assigned_user_name || snapshot.accepted_by_name || row.partner_name,
    phone: row.phone_number || row.phoneNumber || snapshot.assigned_user_phone || snapshot.phone,
    role: row.role_type || fallbackRole,
    source: 'transaction_role_players',
  }, fallbackRole)
}

export async function resolveBondNotificationRecipients(transactionInput = {}, options = {}) {
  const client = getClient(options)
  const transaction = await fetchTransactionIfNeeded(client, transactionInput)
  const [fetchedBuyer, rolePlayers, participants, defaultBondPartner] = await Promise.all([
    fetchBuyer(client, transaction),
    fetchRolePlayers(client, transaction),
    fetchParticipants(client, transaction),
    fetchDefaultBondPartner(client, transaction),
  ])
  const [managers, organisationContact] = await Promise.all([
    fetchManagers(client, transaction, rolePlayers),
    fetchBondOrganisationContact(client, transaction, rolePlayers),
  ])

  const agentParticipant = participants.find((row) => isActiveRow(row) && roleMatches(row, ['agent', 'listing_agent']))
  const principalParticipant = participants.find((row) => isActiveRow(row) && roleMatches(row, ['principal', 'developer', 'manager']))
  const bondParticipant = participants.find((row) => isActiveRow(row) && roleMatches(row, ['bond_originator', 'consultant']))
  const bondRolePlayer = rolePlayers.find((row) => isActiveRow(row) && roleMatches(row, ['bond_originator']))

  const emailsToResolve = [
    transaction.assigned_agent_email,
    transaction.assignedAgentEmail,
    transaction.assigned_bond_originator_email,
    transaction.assignedBondOriginatorEmail,
    fetchedBuyer?.email,
    agentParticipant?.participant_email,
    bondParticipant?.participant_email,
    bondRolePlayer?.email_address,
  ].map(normalizeEmail).filter(Boolean)
  const profilesByEmail = await resolveProfilesByEmail(client, emailsToResolve)
  const buyerEmail = normalizeEmail(fetchedBuyer?.email)
  const buyer = fetchedBuyer
    ? {
        ...fetchedBuyer,
        userId: fetchedBuyer.userId || fetchedBuyer.user_id || profilesByEmail[buyerEmail]?.id || null,
      }
    : null

  const agentEmail = normalizeEmail(transaction.assigned_agent_email || transaction.assignedAgentEmail || agentParticipant?.participant_email)
  const agent = agentParticipant
    ? recipientFromParticipant({ ...agentParticipant, user_id: agentParticipant.user_id || profilesByEmail[normalizeEmail(agentParticipant.participant_email)]?.id }, 'agent')
    : makeRecipient({
        userId: profilesByEmail[agentEmail]?.id,
        email: agentEmail,
        name: transaction.assigned_agent || transaction.assignedAgent || profilesByEmail[agentEmail]?.full_name,
        role: 'agent',
        source: 'transactions',
      }, 'agent')

  const principal = principalParticipant
    ? recipientFromParticipant(principalParticipant, principalParticipant.role_type || 'principal')
    : makeRecipient({
        userId: transaction.owner_user_id || transaction.ownerUserId,
        name: transaction.owner_name || transaction.ownerName || 'Principal',
        role: 'principal',
        source: 'transactions',
      }, 'principal')

  const preferredOriginator = bondRolePlayer
    ? recipientFromRolePlayer(
        {
          ...bondRolePlayer,
          user_id: bondRolePlayer.user_id || profilesByEmail[normalizeEmail(bondRolePlayer.email_address)]?.id,
        },
        'bond_originator',
      )
    : defaultBondPartner

  const assignedOriginatorEmail = normalizeEmail(transaction.assigned_bond_originator_email || transaction.assignedBondOriginatorEmail || bondParticipant?.participant_email)
  const assignedOriginator = bondParticipant
    ? recipientFromParticipant({ ...bondParticipant, user_id: bondParticipant.user_id || profilesByEmail[normalizeEmail(bondParticipant.participant_email)]?.id }, 'bond_originator')
    : makeRecipient({
        userId: transaction.primary_bond_consultant_user_id || transaction.primaryBondConsultantUserId || profilesByEmail[assignedOriginatorEmail]?.id,
        email: assignedOriginatorEmail,
        name: transaction.bond_originator || transaction.bondOriginator || profilesByEmail[assignedOriginatorEmail]?.full_name,
        role: 'bond_originator',
        source: 'transactions',
      }, 'bond_originator')

  return {
    buyer,
    agent,
    principal,
    preferredOriginator,
    assignedOriginator,
    assignedConsultant: assignedOriginator,
    managers: dedupeRecipients(managers),
    organisationContact,
  }
}

function buyerName(transaction = {}, recipients = {}) {
  return safeDisplayName([
    recipients.buyer?.name,
    transaction.buyer_name,
    transaction.buyerName,
    transaction.client_name,
    transaction.clientName,
  ], 'the buyer')
}

function propertyLabel(transaction = {}, metadata = {}) {
  const unit = normalizeText(transaction.unit_number || transaction.unitNumber || metadata.unitLabel)
  const development = normalizeText(transaction.development_name || transaction.developmentName || metadata.developmentName)
  const address = normalizeText(transaction.property_address_line_1 || transaction.propertyAddressLine1 || transaction.property_description || metadata.propertyLabel)
  if (unit && development) return `Unit ${unit}, ${development}`
  if (unit) return `Unit ${unit}`
  return address || development || 'the property'
}

function resolveEventKey(eventType, metadata = {}) {
  if (metadata.eventKey) return normalizeText(metadata.eventKey)
  if (eventType === BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_ASSIGNED) {
    const assigneeId = normalizeText(metadata.assignee?.id || metadata.assignee?.userId || metadata.assigneeId || metadata.assignedConsultantId)
    return `${EVENT_KEYS[eventType]}:${assigneeId || 'unassigned'}`
  }
  return EVENT_KEYS[eventType] || normalizeLower(eventType)
}

function buildEventCopy(eventType, { transaction = {}, recipients = {}, metadata = {} } = {}) {
  const buyer = buyerName(transaction, recipients)
  const property = propertyLabel(transaction, metadata)
  const actorName = safeDisplayName([metadata.actorName, metadata.actor?.name], 'Bridge')
  const assigneeName = safeDisplayName([metadata.assignee?.name, metadata.assigneeName, recipients.assignedConsultant?.name], 'the assigned consultant')
  const consultantName = safeDisplayName([metadata.consultantName, metadata.assignedConsultantName], 'your bond originator')
  const organisationName = normalizeText(metadata.organisationName || metadata.bondOrganisationName)
  const reason = normalizeText(metadata.reason || metadata.declineReason)

  const copy = {
    [BOND_NOTIFICATION_EVENTS.BOND_INTAKE_STARTED]: {
      title: 'New bond application started',
      subject: 'New Bond Application Added To Pipeline',
      message: `A new bond application has been added to your pipeline for ${buyer} at ${property}.`,
      activity: `Buyer selected Bond finance. Bond originator pipeline application created.`,
    },
    [BOND_NOTIFICATION_EVENTS.BOND_INTAKE_RECEIVED]: {
      title: 'New bond intake received',
      subject: 'New bond intake received',
      message: 'A new bond transaction has been added to your pipeline. OTP signature is still outstanding.',
      activity: 'Bond intake received. OTP signature is still outstanding.',
    },
    [BOND_NOTIFICATION_EVENTS.BOND_OTP_READY]: {
      title: 'OTP signed - bond process can begin',
      subject: `OTP signed - bond process can begin: ${buyer}`,
      message: `The OTP for ${buyer} at ${property} has been fully signed and the bond process can now begin.`,
      activity: 'OTP fully signed. Bond process can begin.',
    },
    [BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_STARTED]: {
      title: 'Buyer started bond application',
      subject: `Buyer started bond application: ${buyer}`,
      message: `${buyer} has started the digital bond application for ${property}.`,
      activity: 'Buyer started digital bond application.',
    },
    [BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_SUBMITTED]: {
      title: 'Bond application submitted',
      subject: `Bond application submitted: ${buyer}`,
      message: `${buyer}'s bond application has been submitted and is ready for document review.`,
      activity: 'Buyer submitted digital bond application.',
    },
    [BOND_NOTIFICATION_EVENTS.BOND_DOCUMENTS_COMPLETE]: {
      title: 'Bond documents complete',
      subject: `Documents complete for ${buyer}`,
      message: `Required bond finance documents for ${buyer} are complete.`,
      activity: 'Bond finance documents completed.',
    },
    [BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_READY_FOR_REVIEW]: {
      title: 'Bond application ready for review',
      subject: `Bond application ready for review: ${buyer}`,
      message: `${buyer}'s bond application for ${property} is complete and ready for review.`,
      activity: 'Bond application and required documents are ready for review.',
    },
    [BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_ACCEPTED]: {
      title: 'Bond application accepted',
      subject: `Bond application accepted: ${buyer}`,
      buyerSubject: 'Your bond application has been accepted',
      message: `Bond originator accepted the application for ${buyer}.`,
      buyerMessage: 'Your bond application has been accepted. The bond team will continue processing the application.',
      activity: `Bond application accepted by ${actorName}.`,
    },
    [BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_ASSIGNED]: {
      title: 'Bond application assigned to you',
      subject: `Bond application assigned: ${buyer}`,
      message: `Bond application for ${buyer} has been assigned to ${assigneeName}.`,
      activity: `Bond application assigned to ${assigneeName}.`,
    },
    [BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_DECLINED]: {
      title: 'Bond application declined',
      subject: `Bond application declined: ${buyer}`,
      message: `Bond application declined${reason ? `: ${reason}` : '.'}`,
      activity: `Bond application declined${reason ? `: ${reason}` : '.'}`,
    },
    [BOND_NOTIFICATION_EVENTS.BUYER_BOND_ORIGINATOR_INTRO]: {
      title: 'Bond originator introduced',
      subject: organisationName ? `Meet Your Bond Originator - ${organisationName}` : 'Meet Your Bond Originator',
      message: `${consultantName} has been introduced to ${buyer} as the bond originator for ${property}.`,
      activity: `Introduction email sent to buyer. ${consultantName} introduced as Bond Originator.`,
    },
  }
  return copy[eventType] || copy[BOND_NOTIFICATION_EVENTS.BOND_INTAKE_STARTED]
}

function selectRecipientsForEvent(eventType, resolved = {}, metadata = {}) {
  const assignee = makeRecipient(metadata.assignee || {}, 'bond_originator')
  switch (eventType) {
    case BOND_NOTIFICATION_EVENTS.BOND_INTAKE_RECEIVED:
    case BOND_NOTIFICATION_EVENTS.BOND_INTAKE_STARTED:
      return dedupeRecipients([...resolved.managers, resolved.assignedOriginator, resolved.preferredOriginator])
    case BOND_NOTIFICATION_EVENTS.BOND_OTP_READY:
      return dedupeRecipients([resolved.assignedOriginator, resolved.preferredOriginator, ...resolved.managers])
    case BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_STARTED:
      return dedupeRecipients([resolved.preferredOriginator, resolved.assignedOriginator, resolved.agent])
    case BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_SUBMITTED:
      return dedupeRecipients([resolved.assignedOriginator, resolved.preferredOriginator, resolved.agent, resolved.principal])
    case BOND_NOTIFICATION_EVENTS.BOND_DOCUMENTS_COMPLETE:
      return dedupeRecipients([resolved.assignedConsultant, resolved.assignedOriginator, resolved.preferredOriginator])
    case BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_READY_FOR_REVIEW:
      return dedupeRecipients([resolved.assignedConsultant, resolved.assignedOriginator, resolved.preferredOriginator, ...resolved.managers])
    case BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_ACCEPTED:
      return dedupeRecipients([resolved.buyer, resolved.agent, resolved.principal])
    case BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_ASSIGNED:
      return dedupeRecipients([assignee, resolved.assignedConsultant, ...resolved.managers])
    case BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_DECLINED:
      return dedupeRecipients([resolved.agent, resolved.principal])
    case BOND_NOTIFICATION_EVENTS.BUYER_BOND_ORIGINATOR_INTRO:
      return dedupeRecipients([resolved.buyer])
    default:
      return []
  }
}

async function eventAlreadyExists(client, { transactionId, eventType, eventKey }) {
  const query = await client
    .from('transaction_events')
    .select('id, event_type, event_data, created_at')
    .eq('transaction_id', transactionId)
    .eq('event_type', eventType)
    .limit(50)

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_events') || isPermissionDeniedError(query.error)) return false
    if (isMissingColumnError(query.error, 'event_data')) return false
    throw query.error
  }

  return (query.data || []).some((row) => {
    const eventData = row.event_data || row.eventData || {}
    return normalizeText(eventData.event_key || eventData.eventKey) === eventKey
  })
}

async function insertActivityEvent(client, { transactionId, eventType, eventKey, copy, actor = {}, metadata = {}, recipients = [], intakeSummary = null }) {
  const payload = compactObject({
    transaction_id: transactionId,
    event_type: eventType,
    event_data: {
      event_key: eventKey,
      message: copy.activity,
      title: copy.title,
      notification_message: copy.message,
      source: 'bond_originator_intake',
      metadata,
      recipient_count: recipients.length,
      intake_status: intakeSummary?.intakeStatus || null,
    },
    created_by: actor.id || actor.userId || null,
    created_by_role: actor.roleType || actor.role || null,
  })

  let result = await client
    .from('transaction_events')
    .insert(payload)
    .select('id, transaction_id, event_type, event_data, created_at')
    .single()

  if (result.error && (isMissingColumnError(result.error, 'created_by') || isMissingColumnError(result.error, 'created_by_role') || isMissingColumnError(result.error, 'event_data'))) {
    const fallback = { ...payload }
    delete fallback.created_by
    delete fallback.created_by_role
    if (isMissingColumnError(result.error, 'event_data')) delete fallback.event_data
    result = await client.from('transaction_events').insert(fallback).select('id, transaction_id, event_type, created_at').single()
  }

  if (result.error) {
    if (isMissingTableError(result.error, 'transaction_events') || isPermissionDeniedError(result.error)) return null
    throw result.error
  }
  return result.data || null
}

async function createNotification(client, { transactionId, recipient, eventType, eventKey, copy, metadata = {} }) {
  if (!recipient?.userId) return null
  const isBuyer = normalizeRoleKey(recipient.roleType) === 'client' || normalizeRoleKey(recipient.roleType) === 'buyer'
  const notificationType =
    eventType === BOND_NOTIFICATION_EVENTS.BOND_INTAKE_RECEIVED
      ? 'bond_intake_received'
      : eventType === BOND_NOTIFICATION_EVENTS.BOND_INTAKE_STARTED
        ? 'bond_application_pipeline_added'
        : eventType === BOND_NOTIFICATION_EVENTS.BOND_OTP_READY
          ? 'bond_otp_ready'
          : eventType === BOND_NOTIFICATION_EVENTS.BUYER_BOND_ORIGINATOR_INTRO
            ? 'buyer_intro_email_sent'
            : eventType === BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_ASSIGNED
              ? 'bond_application_assigned'
              : eventType === BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_READY_FOR_REVIEW
                ? 'bond_application_ready_for_review'
                : eventType === BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_SUBMITTED
                  ? 'bond_application_created'
                  : 'readiness_updated'
  const payload = compactObject({
    transaction_id: transactionId,
    user_id: recipient.userId,
    role_type: recipient.roleType || 'bond_originator',
    notification_type: notificationType,
    title: copy.title,
    message: isBuyer && copy.buyerMessage ? copy.buyerMessage : copy.message,
    is_read: false,
    read_at: null,
    dedupe_key: `${eventKey}:${recipient.userId}`,
    event_type: eventType,
    event_data: {
      event_key: eventKey,
      source: 'bond_originator_intake',
      ...metadata,
    },
  })

  const existing = await client
    .from('transaction_notifications')
    .select('id, transaction_id, user_id, dedupe_key, created_at')
    .eq('user_id', recipient.userId)
    .eq('dedupe_key', payload.dedupe_key)
    .limit(1)
    .maybeSingle()

  if (existing.error) {
    if (isMissingTableError(existing.error, 'transaction_notifications') || isMissingColumnError(existing.error, 'dedupe_key') || isPermissionDeniedError(existing.error)) return null
    throw existing.error
  }
  if (existing.data) return existing.data

  let result = await client
    .from('transaction_notifications')
    .insert(payload)
    .select('id, transaction_id, user_id, role_type, notification_type, title, message, dedupe_key, event_type, event_data, created_at')
    .single()

  if (result.error && (isMissingColumnError(result.error, 'event_data') || isMissingColumnError(result.error, 'event_type') || isMissingColumnError(result.error, 'dedupe_key'))) {
    const fallback = { ...payload }
    delete fallback.event_data
    delete fallback.event_type
    delete fallback.dedupe_key
    result = await client.from('transaction_notifications').insert(fallback).select('id, transaction_id, user_id, role_type, notification_type, title, message, created_at').single()
  }

  if (result.error) {
    if (isMissingTableError(result.error, 'transaction_notifications') || isPermissionDeniedError(result.error)) return null
    throw result.error
  }
  return result.data || null
}

async function sendEmailIfAllowed({ eventType, transactionId, recipient, copy, metadata = {}, emailEnabled = false, client = null, invokeEmailFunction = invokeEdgeFunction }) {
  const role = normalizeRoleKey(recipient?.roleType)
  const eventAllowsRecipientEmail =
    eventType === BOND_NOTIFICATION_EVENTS.BUYER_BOND_ORIGINATOR_INTRO
      ? ['client', 'buyer'].includes(role)
      : ![BOND_NOTIFICATION_EVENTS.BOND_INTAKE_STARTED, BOND_NOTIFICATION_EVENTS.BOND_INTAKE_RECEIVED].includes(eventType) ||
        ['bond_originator', 'consultant', 'branch_manager', 'regional_manager', 'hq_manager', 'manager', 'owner', 'principal', 'director', 'admin'].includes(role)

  if (!emailEnabled || !EMAIL_EVENTS.has(eventType) || !recipient?.email || !eventAllowsRecipientEmail) {
    return { sent: false, suppressed: true }
  }
  const isBuyer = normalizeRoleKey(recipient.roleType) === 'client' || normalizeRoleKey(recipient.roleType) === 'buyer'
  const result = await invokeEmailFunction('send-email', {
    client,
    body: {
      type: eventType === BOND_NOTIFICATION_EVENTS.BUYER_BOND_ORIGINATOR_INTRO ? 'bond_originator_buyer_intro' : 'bond_intake_notification',
      transactionId,
      to: recipient.email,
      recipientName: recipient.name,
      subject: isBuyer && copy.buyerSubject ? copy.buyerSubject : copy.subject,
      title: copy.title,
      message: isBuyer && copy.buyerMessage ? copy.buyerMessage : copy.message,
      metadata,
    },
  })
  return {
    sent: !result?.error,
    error: result?.error || null,
  }
}

function formatFinanceType(value = '') {
  const normalized = normalizeLower(value)
  if (normalized === 'combination' || normalized === 'hybrid') return 'Hybrid'
  if (normalized === 'bond') return 'Bond'
  if (normalized === 'cash') return 'Cash'
  return normalizeText(value) || 'Not specified'
}

function buildApplicationLink(transactionId = '', metadata = {}) {
  const explicit = normalizeText(metadata.applicationLink || metadata.applicationUrl)
  if (explicit) return explicit
  const path = normalizeText(metadata.applicationPath) || `/bond/applications/${transactionId}`
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path.startsWith('/') ? path : `/${path}`}`
  }
  return path
}

function chooseBuyerIntroConsultant(recipients = {}) {
  return (
    recipients.assignedConsultant ||
    recipients.assignedOriginator ||
    recipients.preferredOriginator ||
    (Array.isArray(recipients.managers) ? recipients.managers[0] : null) ||
    recipients.organisationContact?.recipient ||
    null
  )
}

function enrichNotificationMetadata({ transaction = {}, metadata = {}, recipients = {}, intakeSummary = null } = {}) {
  const buyer = buyerName(transaction, recipients)
  const property = propertyLabel(transaction, metadata)
  const introConsultant = chooseBuyerIntroConsultant(recipients)
  const organisationName = normalizeText(
    metadata.organisationName ||
      metadata.bondOrganisationName ||
      recipients.organisationContact?.organisationName ||
      transaction.bond_originator ||
      transaction.bondOriginator,
  )
  const financeType =
    transaction?.finance_type ||
    transaction?.financeType ||
    metadata?.financeType ||
    metadata?.onboardingFormData?.purchase_finance_type ||
    metadata?.onboardingFormData?.finance?.purchase_finance_type
  const documentStatus =
    metadata.documentStatus ||
    (intakeSummary?.documentReadiness?.isComplete
      ? 'Buyer onboarding completed'
      : intakeSummary?.documentReadiness?.missingCount
        ? `${intakeSummary.documentReadiness.missingCount} document item${intakeSummary.documentReadiness.missingCount === 1 ? '' : 's'} outstanding`
        : 'Buyer onboarding completed')

  return {
    ...metadata,
    buyerName: metadata.buyerName || buyer,
    propertyLabel: metadata.propertyLabel || property,
    developmentName: metadata.developmentName || transaction.development_name || transaction.developmentName || '',
    agentName: metadata.agentName || transaction.assigned_agent || transaction.assignedAgent || '',
    agencyName: metadata.agencyName || transaction.agency_name || transaction.agencyName || '',
    financeType: formatFinanceType(financeType),
    documentStatus,
    assignedConsultantName: metadata.assignedConsultantName || recipients.assignedConsultant?.name || recipients.assignedOriginator?.name || '',
    consultantName: metadata.consultantName || introConsultant?.name || organisationName || '',
    consultantEmail: metadata.consultantEmail || introConsultant?.email || recipients.organisationContact?.recipient?.email || '',
    consultantPhone: metadata.consultantPhone || introConsultant?.phone || recipients.organisationContact?.phone || '',
    consultantTitle: metadata.consultantTitle || introConsultant?.title || '',
    consultantBranch: metadata.consultantBranch || recipients.organisationContact?.scope?.scopeName || '',
    organisationName,
    applicationLink: buildApplicationLink(transaction.id || transaction.transaction_id, metadata),
    timestamp: metadata.timestamp || new Date().toISOString(),
  }
}

async function insertSupplementaryIntakeEvents(client, { transactionId, actor = {}, metadata = {}, recipients = [] } = {}) {
  const roles = new Set((recipients || []).map((recipient) => normalizeRoleKey(recipient.roleType)))
  const events = [
    { eventType: 'application_added_to_pipeline', eventKey: 'application_added_to_pipeline', message: 'Bond application added to the originator pipeline.' },
  ]
  if ([...roles].some((role) => ['branch_manager', 'regional_manager', 'hq_manager', 'manager', 'owner', 'principal', 'director', 'admin'].includes(role))) {
    events.push({ eventType: 'branch_manager_notified', eventKey: 'branch_manager_notified', message: 'Bond branch manager notified about the new pipeline application.' })
  }
  if ([...roles].some((role) => ['bond_originator', 'consultant'].includes(role))) {
    events.push({ eventType: 'consultant_notified', eventKey: 'consultant_notified', message: 'Assigned bond consultant/originator notified about the new pipeline application.' })
  }

  const inserted = []
  for (const item of events) {
    if (await eventAlreadyExists(client, { transactionId, eventType: item.eventType, eventKey: item.eventKey })) continue
    const event = await insertActivityEvent(client, {
      transactionId,
      eventType: item.eventType,
      eventKey: item.eventKey,
      copy: {
        title: item.message,
        message: item.message,
        activity: item.message,
      },
      actor,
      metadata,
      recipients,
    })
    if (event) inserted.push(event)
  }
  return inserted
}

async function insertBuyerIntroSupplementaryEvent(client, { transactionId, actor = {}, metadata = {}, recipients = [] } = {}) {
  const eventType = 'buyer_bond_originator_introduced'
  const eventKey = 'buyer_bond_originator_introduced'
  if (await eventAlreadyExists(client, { transactionId, eventType, eventKey })) return null
  const consultantName = normalizeText(metadata.consultantName || metadata.assignedConsultantName) || 'Bond Originator'
  return insertActivityEvent(client, {
    transactionId,
    eventType,
    eventKey,
    copy: {
      title: 'Bond originator introduced',
      message: `${consultantName} introduced as Bond Originator.`,
      activity: `${consultantName} introduced as Bond Originator.`,
    },
    actor,
    metadata,
    recipients,
  })
}

export function getBondApplicationMilestoneState({ transaction = {}, onboardingFormData = null } = {}) {
  const progress = getBondApplicationProgress({ transaction, onboardingFormData })
  return {
    started: progress.status === 'IN_PROGRESS' || progress.status === 'SUBMITTED',
    submitted: progress.status === 'SUBMITTED',
    progress,
  }
}

export async function notifyBondIntakeEvent({
  eventType,
  transaction,
  transactionId = '',
  intakeSummary = null,
  actor = {},
  recipients = null,
  metadata = {},
  client = null,
  enabled,
  emailEnabled,
  invokeEmailFunction,
} = {}) {
  if (!notificationsEnabled({ enabled })) {
    return { skipped: true, reason: 'notifications_disabled' }
  }

  const db = getClient({ client })
  const resolvedTransaction = await fetchTransactionIfNeeded(db, transaction || { id: transactionId })
  const id = getTransactionId(resolvedTransaction, transactionId)
  const effectiveEventType = BOND_NOTIFICATION_EVENTS[eventType] || eventType
  const eventKey = resolveEventKey(effectiveEventType, metadata)

  if (await eventAlreadyExists(db, { transactionId: id, eventType: effectiveEventType, eventKey })) {
    return { skipped: true, duplicate: true, eventType: effectiveEventType, eventKey }
  }

  const resolvedRecipients = recipients || await resolveBondNotificationRecipients(resolvedTransaction, { client: db })
  const selectedRecipients = Array.isArray(recipients)
    ? dedupeRecipients(recipients.map((recipient) => makeRecipient(recipient, recipient.roleType || 'bond_originator')))
    : selectRecipientsForEvent(effectiveEventType, resolvedRecipients, metadata)
  const summary = intakeSummary || getBondIntakeSummary({
    transaction: resolvedTransaction,
    onboardingFormData: metadata.onboardingFormData || null,
    documentRequests: metadata.documentRequests || [],
    documents: metadata.documents || [],
    rolePlayers: getRolePlayers(resolvedTransaction),
  })
  const deliveryMetadata = enrichNotificationMetadata({
    transaction: resolvedTransaction,
    metadata,
    recipients: Array.isArray(recipients) ? {} : resolvedRecipients,
    intakeSummary: summary,
  })
  const copy = buildEventCopy(effectiveEventType, {
    transaction: resolvedTransaction,
    recipients: Array.isArray(recipients) ? {} : resolvedRecipients,
    metadata: { ...deliveryMetadata, actor },
  })

  const activity = await insertActivityEvent(db, {
    transactionId: id,
    eventType: effectiveEventType,
    eventKey,
    copy,
    actor,
    metadata: deliveryMetadata,
    recipients: selectedRecipients,
    intakeSummary: summary,
  })

  const notifications = []
  const emailResults = []
  const allowEmail = emailsEnabled({ emailEnabled })
  for (const recipient of selectedRecipients) {
    const notification = await createNotification(db, {
      transactionId: id,
      recipient,
      eventType: effectiveEventType,
      eventKey,
      copy,
      metadata: deliveryMetadata,
    })
    if (notification) notifications.push(notification)
    const emailResult = await sendEmailIfAllowed({
      eventType: effectiveEventType,
      transactionId: id,
      recipient,
      copy,
      metadata: deliveryMetadata,
      emailEnabled: allowEmail,
      client: db,
      invokeEmailFunction: invokeEmailFunction || invokeEdgeFunction,
    })
    emailResults.push({ recipient: recipient.email || recipient.userId, ...emailResult })
  }

  const supplementaryActivities =
    [BOND_NOTIFICATION_EVENTS.BOND_INTAKE_STARTED, BOND_NOTIFICATION_EVENTS.BOND_INTAKE_RECEIVED].includes(effectiveEventType)
      ? await insertSupplementaryIntakeEvents(db, {
          transactionId: id,
          actor,
          metadata: deliveryMetadata,
          recipients: selectedRecipients,
        })
      : effectiveEventType === BOND_NOTIFICATION_EVENTS.BUYER_BOND_ORIGINATOR_INTRO
        ? [await insertBuyerIntroSupplementaryEvent(db, {
            transactionId: id,
            actor,
            metadata: deliveryMetadata,
            recipients: selectedRecipients,
          })].filter(Boolean)
      : []

  return {
    skipped: false,
    eventType: effectiveEventType,
    eventKey,
    activity,
    supplementaryActivities,
    notifications,
    emails: emailResults,
    emailSuppressed: !allowEmail,
    recipients: selectedRecipients,
  }
}

export async function notifyBondIntakeStartedForOnboarding({ transaction, formData = {}, actor = { roleType: 'client' }, metadata = {}, client = null, emailEnabled, invokeEmailFunction } = {}) {
  const financeType =
    transaction?.finance_type ||
    transaction?.financeType ||
    formData?.finance_type ||
    formData?.financeType ||
    formData?.finance?.finance_type ||
    formData?.finance?.financeType
  if (!isBondFinanceType(financeType) && !isBondAssistanceRequested(formData)) {
    return { skipped: true, reason: 'not_bond_finance' }
  }
  const started = await notifyBondIntakeEvent({
    eventType: BOND_NOTIFICATION_EVENTS.BOND_INTAKE_RECEIVED,
    transaction: {
      ...transaction,
      finance_type: isBondFinanceType(financeType) ? financeType : transaction?.finance_type || transaction?.financeType || 'bond',
    },
    actor,
    metadata: {
      ...metadata,
      formDataSource: 'client_onboarding_submitted',
      onboardingFormData: formData,
      applicationPath: metadata.originatorPath || metadata.bondApplicationPath || '/bond/applications',
    },
    client,
    emailEnabled,
    invokeEmailFunction,
  })
  const buyerIntro = await notifyBondIntakeEvent({
    eventType: BOND_NOTIFICATION_EVENTS.BUYER_BOND_ORIGINATOR_INTRO,
    transaction: {
      ...transaction,
      finance_type: isBondFinanceType(financeType) ? financeType : transaction?.finance_type || transaction?.financeType || 'bond',
    },
    actor,
    metadata: {
      ...metadata,
      formDataSource: 'client_onboarding_submitted',
      onboardingFormData: formData,
      applicationPath: metadata.applicationPath || metadata.portalPath || transaction?.buyerPortalPath || transaction?.buyer_portal_path || '/client-access',
    },
    client,
    emailEnabled,
    invokeEmailFunction,
  })
  return {
    ...started,
    buyerIntro,
  }
}

export async function checkAndNotifyBondOtpReady({
  transaction,
  transactionId = '',
  previousOtpReady = false,
  currentOtpReady = true,
  actor = {},
  metadata = {},
  client = null,
} = {}) {
  const db = getClient({ client })
  const resolvedTransaction = transaction || { id: transactionId }
  const id = getTransactionId(resolvedTransaction, transactionId)
  const financeType = resolvedTransaction?.finance_type || resolvedTransaction?.financeType || metadata.financeType

  if (!isBondFinanceType(financeType)) {
    return { skipped: true, reason: 'not_bond_finance' }
  }
  if (previousOtpReady || !currentOtpReady) {
    return { skipped: true, reason: 'otp_not_crossing_ready_threshold' }
  }

  return notifyBondIntakeEvent({
    eventType: BOND_NOTIFICATION_EVENTS.BOND_OTP_READY,
    transaction: resolvedTransaction,
    transactionId: id,
    actor,
    metadata: {
      ...metadata,
      source: metadata.source || 'otp_ready_check',
      applicationPath: metadata.applicationPath || `/bond/files/${id}`,
    },
    client: db,
  })
}

export async function checkAndNotifyBondApplicationReadyForReview({
  transaction,
  transactionId = '',
  previousReadyForReview = false,
  currentReadyForReview = false,
  actor = {},
  metadata = {},
  client = null,
} = {}) {
  const db = getClient({ client })
  const resolvedTransaction = transaction || { id: transactionId }
  const id = getTransactionId(resolvedTransaction, transactionId)
  const financeType = resolvedTransaction?.finance_type || resolvedTransaction?.financeType || metadata.financeType

  if (!isBondFinanceType(financeType)) {
    return { skipped: true, reason: 'not_bond_finance' }
  }
  if (previousReadyForReview || !currentReadyForReview) {
    return { skipped: true, reason: 'application_not_crossing_ready_for_review_threshold' }
  }

  return notifyBondIntakeEvent({
    eventType: BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_READY_FOR_REVIEW,
    transaction: resolvedTransaction,
    transactionId: id,
    actor,
    metadata: {
      ...metadata,
      source: metadata.source || 'ready_for_review_check',
      applicationPath: metadata.applicationPath || `/bond/files/${id}`,
    },
    client: db,
  })
}

export async function checkAndNotifyBondDocumentsComplete({
  transaction,
  transactionId = '',
  previousMissingCount = null,
  readiness = null,
  actor = {},
  metadata = {},
  client = null,
} = {}) {
  const db = getClient({ client })
  const resolvedTransaction = transaction || { id: transactionId }
  const id = getTransactionId(resolvedTransaction, transactionId)
  const missingCount = Number(readiness?.missingRequiredDocs ?? readiness?.missingCount ?? metadata.missingRequiredDocs ?? Number.NaN)
  const wasIncomplete = Number(previousMissingCount) > 0
  const isNowComplete = Number.isFinite(missingCount) ? missingCount === 0 : Boolean(readiness?.docsComplete || readiness?.isComplete)

  if (!wasIncomplete || !isNowComplete) {
    return { skipped: true, reason: 'documents_not_crossing_complete_threshold' }
  }

  return notifyBondIntakeEvent({
    eventType: BOND_NOTIFICATION_EVENTS.BOND_DOCUMENTS_COMPLETE,
    transaction: resolvedTransaction,
    transactionId: id,
    actor,
    metadata: {
      ...metadata,
      previousMissingCount,
      missingRequiredDocs: missingCount,
      source: metadata.source || 'document_completion_check',
    },
    client: db,
  })
}
