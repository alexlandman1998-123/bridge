import { isMissingTableError } from './attorneyFirmServiceShared'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { BOND_ORGANISATION_LEVELS, resolveBondOrganisationScope } from './bondOrganisationScopeResolver'
import {
  BOND_ROUTING_RULE_TYPES,
  createRoutingRule,
  disableRoutingRule,
  updateRoutingRule,
} from './bondRoutingRulesService'

export const BOND_PARTNER_TYPES = Object.freeze({
  agency: 'agency',
  development: 'development',
  referralPartner: 'referral_partner',
  developer: 'developer',
  attorney: 'attorney',
  internalSource: 'internal_source',
})

export const BOND_PARTNER_STATUSES = Object.freeze({
  draft: 'draft',
  invited: 'invited',
  active: 'active',
  paused: 'paused',
  disabled: 'disabled',
})

export const BOND_PARTNER_INVITE_STATUSES = Object.freeze({
  pending: 'pending',
  accepted: 'accepted',
  expired: 'expired',
  cancelled: 'cancelled',
})

export const BOND_PARTNER_ACTIVITY_EVENTS = Object.freeze({
  created: 'PARTNER_CREATED',
  updated: 'PARTNER_UPDATED',
  invited: 'PARTNER_INVITED',
  inviteResent: 'PARTNER_INVITE_RESENT',
  accepted: 'PARTNER_ACCEPTED',
  paused: 'PARTNER_PAUSED',
  disabled: 'PARTNER_DISABLED',
  routingDefaultUpdated: 'PARTNER_ROUTING_DEFAULT_UPDATED',
})

const LOCAL_PARTNER_STORE = new Map()
const LOCAL_INVITE_STORE = new Map()
const LOCAL_ACTIVITY_STORE = new Map()
const LOCAL_NOTIFICATION_STORE = new Map()
let localPartnerSequence = 0
let localInviteSequence = 0

const VALID_PARTNER_TYPES = new Set(Object.values(BOND_PARTNER_TYPES))
const VALID_PARTNER_STATUSES = new Set(Object.values(BOND_PARTNER_STATUSES))
const ACTIVE_APPLICATION_TERMS = ['active', 'new', 'intake', 'pre', 'document', 'submit', 'feedback', 'bank', 'quote', 'instruction', 'in_progress']
const SUBMITTED_APPLICATION_TERMS = ['submitted', 'bank', 'feedback', 'quote', 'approved', 'declined', 'registered']
const APPROVED_APPLICATION_TERMS = ['approved', 'grant', 'accepted', 'registered']
const DECLINED_APPLICATION_TERMS = ['declined', 'rejected', 'lost']

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizePartnerType(value = '') {
  const normalized = normalizeLower(value).replaceAll('-', '_').replaceAll(' ', '_')
  return VALID_PARTNER_TYPES.has(normalized) ? normalized : BOND_PARTNER_TYPES.agency
}

function normalizeStatus(value = '', fallback = BOND_PARTNER_STATUSES.draft) {
  const normalized = normalizeLower(value)
  return VALID_PARTNER_STATUSES.has(normalized) ? normalized : fallback
}

function getWorkspaceKey(workspaceId = '', context = {}, options = {}) {
  return normalizeText(workspaceId || context.workspaceId || context.currentWorkspace?.id || context.currentMembership?.organisation_id || options.workspaceId || 'default')
}

function getActorUserId(context = {}) {
  return normalizeText(context.userId || context.user_id || context.profile?.id || context.user?.id || context.currentMembership?.user_id)
}

function isUuidLike(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(normalizeText(value))
}

function createLocalPartnerId(name = '') {
  const slug = normalizeLower(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'partner'
  localPartnerSequence += 1
  return `bond-partner-${slug}-${Date.now().toString(36)}-${localPartnerSequence}`
}

function createInviteToken(partnerId = '') {
  localInviteSequence += 1
  return `bond-partner-invite-${normalizeText(partnerId) || 'partner'}-${Date.now().toString(36)}-${localInviteSequence}`
}

function addDays(date = new Date(), days = 14) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next.toISOString()
}

function getSignal(row = {}) {
  return normalizeLower(`${row.status || ''} ${row.stage || ''} ${row.financeStageKey || ''} ${row.finance_stage_key || ''} ${row.financeStageLabel || ''} ${row.registrationStatus || ''}`)
}

function isActiveApplication(row = {}) {
  const signal = getSignal(row)
  if (row.active === false || row.is_active === false) return false
  if (['archived', 'cancelled', 'canceled', 'completed', 'registered', 'declined', 'lost'].some((term) => signal.includes(term))) return false
  if (!signal) return true
  return ACTIVE_APPLICATION_TERMS.some((term) => signal.includes(term))
}

function isSubmittedApplication(row = {}) {
  const signal = getSignal(row)
  return SUBMITTED_APPLICATION_TERMS.some((term) => signal.includes(term))
}

function isApprovedApplication(row = {}) {
  const signal = getSignal(row)
  return APPROVED_APPLICATION_TERMS.some((term) => signal.includes(term))
}

function isDeclinedApplication(row = {}) {
  const signal = getSignal(row)
  return DECLINED_APPLICATION_TERMS.some((term) => signal.includes(term))
}

function getApplicationPartnerId(row = {}) {
  return normalizeText(
    row.partnerId ||
      row.partner_id ||
      row.bondPartnerId ||
      row.bond_partner_id ||
      row.agencyId ||
      row.agency_id ||
      row.agencyOrganisationId ||
      row.agency_organisation_id ||
      row.developmentId ||
      row.development_id ||
      row.referralPartnerId ||
      row.referral_partner_id,
  )
}

function getApplicationPartnerName(row = {}) {
  return normalizeText(row.partnerName || row.partner_name || row.agencyName || row.agency_name || row.developmentName || row.development_name || row.referralPartnerName || row.referral_partner_name)
}

function getApplicationRegionId(row = {}) {
  return normalizeText(row.assignedRegionId || row.assigned_region_id || row.regionId || row.region_id)
}

function getApplicationBranchId(row = {}) {
  return normalizeText(row.assignedBranchId || row.assigned_branch_id || row.branchId || row.branch_id || row.workspaceUnitId || row.workspace_unit_id)
}

function getApplicationConsultantId(row = {}) {
  return normalizeText(row.assignedConsultantId || row.assigned_consultant_id || row.assignedUserId || row.assigned_user_id || row.owner_user_id)
}

function getDateValue(row = {}) {
  return normalizeText(row.lastActivityAt || row.updatedAt || row.updated_at || row.submittedAt || row.submitted_at || row.createdAt || row.created_at || row.transaction?.updated_at || row.transaction?.created_at)
}

function getLeadDays(row = {}) {
  const created = new Date(row.createdAt || row.created_at || row.transaction?.created_at || '')
  const updated = new Date(getDateValue(row))
  if (Number.isNaN(created.getTime()) || Number.isNaN(updated.getTime())) return 0
  return Math.max(1, Math.round((updated.getTime() - created.getTime()) / (24 * 60 * 60 * 1000)))
}

function average(values = []) {
  const safeValues = values.map(Number).filter((value) => Number.isFinite(value) && value > 0)
  if (!safeValues.length) return 0
  return Math.round((safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length) * 10) / 10
}

function percent(part = 0, total = 0) {
  return total ? Math.round((Number(part || 0) / Number(total || 0)) * 100) : 0
}

function getUserId(user = {}) {
  return normalizeText(user.id || user.user_id || user.userId)
}

function getConsultantName(user = {}) {
  return normalizeText(user.name || [user.firstName || user.first_name, user.lastName || user.last_name].map(normalizeText).filter(Boolean).join(' ') || user.email) || 'Consultant'
}

function getBranchId(branch = {}) {
  return normalizeText(branch.id || branch.branch_id || branch.branchId || branch.workspaceUnitId || branch.workspace_unit_id)
}

function getBranchRegionId(branch = {}) {
  return normalizeText(branch.regionId || branch.region_id)
}

function getConsultantBranchId(user = {}) {
  return normalizeText(user.branchId || user.branch_id || user.workspaceUnitId || user.workspace_unit_id || user.primaryBranchId || user.primary_branch_id)
}

function normalizePartner(row = {}, workspaceKey = '') {
  const id = normalizeText(row.id || row.partnerId || row.partner_id)
  const partnerType = normalizePartnerType(row.type || row.partnerType || row.partner_type)
  return {
    ...row,
    id,
    organisationId: normalizeText(row.organisationId || row.organisation_id || row.workspaceId || row.workspace_id || workspaceKey),
    organisation_id: normalizeText(row.organisation_id || row.organisationId || row.workspace_id || workspaceKey),
    name: normalizeText(row.name || row.partnerName || row.partner_name) || 'Partner',
    type: partnerType,
    partnerType,
    partner_type: partnerType,
    primaryContactName: normalizeText(row.primaryContactName || row.primary_contact_name),
    primary_contact_name: normalizeText(row.primary_contact_name || row.primaryContactName),
    primaryContactEmail: normalizeLower(row.primaryContactEmail || row.primary_contact_email),
    primary_contact_email: normalizeLower(row.primary_contact_email || row.primaryContactEmail),
    primaryContactNumber: normalizeText(row.primaryContactNumber || row.primary_contact_number),
    primary_contact_number: normalizeText(row.primary_contact_number || row.primaryContactNumber),
    defaultRegionId: normalizeText(row.defaultRegionId ?? row.default_region_id),
    default_region_id: normalizeText(row.default_region_id ?? row.defaultRegionId),
    defaultBranchId: normalizeText(row.defaultBranchId ?? row.default_branch_id),
    default_branch_id: normalizeText(row.default_branch_id ?? row.defaultBranchId),
    defaultConsultantId: normalizeText(row.defaultConsultantId ?? row.default_consultant_id),
    default_consultant_id: normalizeText(row.default_consultant_id ?? row.defaultConsultantId),
    routingRuleId: normalizeText(row.routingRuleId ?? row.routing_rule_id),
    routing_rule_id: normalizeText(row.routing_rule_id ?? row.routingRuleId),
    status: normalizeStatus(row.status),
    notes: normalizeText(row.notes || row.description),
    createdAt: normalizeText(row.createdAt || row.created_at),
    created_at: normalizeText(row.created_at || row.createdAt),
    updatedAt: normalizeText(row.updatedAt || row.updated_at),
    updated_at: normalizeText(row.updated_at || row.updatedAt),
  }
}

function normalizeInvite(row = {}, workspaceKey = '') {
  return {
    ...row,
    id: normalizeText(row.id || row.inviteId || row.invite_id),
    organisationId: normalizeText(row.organisationId || row.organisation_id || workspaceKey),
    organisation_id: normalizeText(row.organisation_id || row.organisationId || workspaceKey),
    partnerId: normalizeText(row.partnerId || row.partner_id),
    partner_id: normalizeText(row.partner_id || row.partnerId),
    invitedEmail: normalizeLower(row.invitedEmail || row.invited_email),
    invited_email: normalizeLower(row.invited_email || row.invitedEmail),
    invitedBy: normalizeText(row.invitedBy || row.invited_by),
    invited_by: normalizeText(row.invited_by || row.invitedBy),
    status: normalizeLower(row.status) || BOND_PARTNER_INVITE_STATUSES.pending,
    token: normalizeText(row.token),
    sentAt: normalizeText(row.sentAt || row.sent_at),
    sent_at: normalizeText(row.sent_at || row.sentAt),
    acceptedAt: normalizeText(row.acceptedAt || row.accepted_at),
    accepted_at: normalizeText(row.accepted_at || row.acceptedAt),
    expiresAt: normalizeText(row.expiresAt || row.expires_at),
    expires_at: normalizeText(row.expires_at || row.expiresAt),
    createdAt: normalizeText(row.createdAt || row.created_at),
    created_at: normalizeText(row.created_at || row.createdAt),
  }
}

function getLocalPartners(workspaceKey = '') {
  return [...(LOCAL_PARTNER_STORE.get(normalizeText(workspaceKey)) || [])]
}

function setLocalPartners(workspaceKey = '', rows = []) {
  LOCAL_PARTNER_STORE.set(normalizeText(workspaceKey), rows.map((row) => normalizePartner(row, workspaceKey)))
}

function getLocalInvites(workspaceKey = '') {
  return [...(LOCAL_INVITE_STORE.get(normalizeText(workspaceKey)) || [])]
}

function setLocalInvites(workspaceKey = '', rows = []) {
  LOCAL_INVITE_STORE.set(normalizeText(workspaceKey), rows.map((row) => normalizeInvite(row, workspaceKey)))
}

function getLocalActivity(workspaceKey = '') {
  return [...(LOCAL_ACTIVITY_STORE.get(normalizeText(workspaceKey)) || [])]
}

function setLocalActivity(workspaceKey = '', rows = []) {
  LOCAL_ACTIVITY_STORE.set(normalizeText(workspaceKey), rows)
}

function getLocalNotifications(workspaceKey = '') {
  return [...(LOCAL_NOTIFICATION_STORE.get(normalizeText(workspaceKey)) || [])]
}

function setLocalNotifications(workspaceKey = '', rows = []) {
  LOCAL_NOTIFICATION_STORE.set(normalizeText(workspaceKey), rows)
}

function getData(options = {}, workspaceKey = '') {
  return {
    partners: (normalizeArray(options.partners).length ? normalizeArray(options.partners) : getLocalPartners(workspaceKey)).map((row) => normalizePartner(row, workspaceKey)),
    invites: (normalizeArray(options.invites).length ? normalizeArray(options.invites) : getLocalInvites(workspaceKey)).map((row) => normalizeInvite(row, workspaceKey)),
    regions: normalizeArray(options.regions),
    branches: normalizeArray(options.branches || options.units),
    consultants: normalizeArray(options.consultants || options.users),
    applications: normalizeArray(options.applications || options.rows),
    routingRules: normalizeArray(options.routingRules),
  }
}

function createValidationError(message = 'Partner validation failed.', fieldErrors = {}) {
  const error = new Error(message)
  error.code = 'validation_error'
  error.fieldErrors = fieldErrors
  return error
}

function createPermissionError() {
  const error = new Error('You do not have permission to manage partners.')
  error.code = 'permission_denied'
  return error
}

function validateEmail(value = '') {
  const safeValue = normalizeText(value)
  return !safeValue || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeValue)
}

function validatePhone(value = '') {
  const safeValue = normalizeText(value)
  return !safeValue || /^[+()\d\s.-]{7,24}$/.test(safeValue)
}

function assertCanManagePartners(context = {}, data = {}) {
  const scope = resolveBondOrganisationScope(context, data)
  if (scope.scopeLevel !== BOND_ORGANISATION_LEVELS.hq) throw createPermissionError()
  return scope
}

function validatePartnerPayload(payload = {}, existing = null) {
  const fieldErrors = {}
  const name = normalizeText(payload.name || payload.partnerName || existing?.name)
  const type = normalizePartnerType(payload.type || payload.partnerType || existing?.type)
  const primaryContactEmail = normalizeLower(payload.primaryContactEmail ?? payload.primary_contact_email ?? existing?.primaryContactEmail)
  const primaryContactNumber = normalizeText(payload.primaryContactNumber ?? payload.primary_contact_number ?? existing?.primaryContactNumber)
  const status = normalizeStatus(payload.status || existing?.status || BOND_PARTNER_STATUSES.draft)

  if (!name) fieldErrors.name = 'Partner name is required.'
  if (!type) fieldErrors.type = 'Partner type is required.'
  if (primaryContactEmail && !validateEmail(primaryContactEmail)) fieldErrors.primaryContactEmail = 'Enter a valid contact email.'
  if (primaryContactNumber && !validatePhone(primaryContactNumber)) fieldErrors.primaryContactNumber = 'Enter a valid contact number.'

  if (Object.keys(fieldErrors).length) throw createValidationError('Partner validation failed.', fieldErrors)

  return {
    name,
    type,
    primaryContactName: normalizeText(payload.primaryContactName ?? payload.primary_contact_name ?? existing?.primaryContactName),
    primaryContactEmail,
    primaryContactNumber,
    defaultRegionId: normalizeText(payload.defaultRegionId ?? payload.default_region_id ?? existing?.defaultRegionId),
    defaultBranchId: normalizeText(payload.defaultBranchId ?? payload.default_branch_id ?? existing?.defaultBranchId),
    defaultConsultantId: normalizeText(payload.defaultConsultantId ?? payload.default_consultant_id ?? existing?.defaultConsultantId),
    status,
    notes: normalizeText(payload.notes ?? payload.description ?? existing?.notes),
  }
}

function validateRoutingDefaults(defaults = {}, data = {}) {
  const fieldErrors = {}
  const defaultRegionId = normalizeText(defaults.defaultRegionId ?? defaults.regionId ?? defaults.default_region_id)
  const defaultBranchId = normalizeText(defaults.defaultBranchId ?? defaults.branchId ?? defaults.default_branch_id)
  const defaultConsultantId = normalizeText(defaults.defaultConsultantId ?? defaults.consultantId ?? defaults.default_consultant_id)

  if (defaultRegionId && !data.regions.some((region) => normalizeText(region.id) === defaultRegionId)) {
    fieldErrors.defaultRegionId = 'Selected region does not exist.'
  }
  if (defaultBranchId && !data.branches.some((branch) => getBranchId(branch) === defaultBranchId)) {
    fieldErrors.defaultBranchId = 'Selected branch does not exist.'
  }
  if (defaultConsultantId && !data.consultants.some((consultant) => getUserId(consultant) === defaultConsultantId)) {
    fieldErrors.defaultConsultantId = 'Selected consultant does not exist.'
  }
  if (defaultBranchId && defaultRegionId) {
    const branch = data.branches.find((row) => getBranchId(row) === defaultBranchId)
    if (branch && getBranchRegionId(branch) && getBranchRegionId(branch) !== defaultRegionId) {
      fieldErrors.defaultBranchId = 'Selected branch does not belong to the selected region.'
    }
  }
  if (defaultConsultantId && defaultBranchId) {
    const consultant = data.consultants.find((row) => getUserId(row) === defaultConsultantId)
    if (consultant && getConsultantBranchId(consultant) && getConsultantBranchId(consultant) !== defaultBranchId) {
      fieldErrors.defaultConsultantId = 'Selected consultant does not belong to the selected branch.'
    }
  }

  if (Object.keys(fieldErrors).length) throw createValidationError('Partner routing defaults validation failed.', fieldErrors)

  return { defaultRegionId, defaultBranchId, defaultConsultantId }
}

function appendActivity(workspaceKey = '', event = {}) {
  const rows = getLocalActivity(workspaceKey)
  const createdAt = event.createdAt || new Date().toISOString()
  const row = {
    id: event.id || `partner-activity-${Date.now().toString(36)}-${rows.length + 1}`,
    organisationId: workspaceKey,
    organisation_id: workspaceKey,
    eventType: event.eventType,
    event_type: event.eventType,
    partnerId: normalizeText(event.partnerId),
    partner_id: normalizeText(event.partnerId),
    actorUserId: normalizeText(event.actorUserId),
    actor_user_id: normalizeText(event.actorUserId),
    source: normalizeText(event.source),
    previousValue: event.previousValue ?? null,
    previous_value: event.previousValue ?? null,
    newValue: event.newValue ?? null,
    new_value: event.newValue ?? null,
    createdAt,
    created_at: createdAt,
  }
  setLocalActivity(workspaceKey, [row, ...rows])
  return row
}

function appendNotification(workspaceKey = '', notification = {}) {
  const rows = getLocalNotifications(workspaceKey)
  const createdAt = new Date().toISOString()
  const row = {
    id: `partner-notification-${Date.now().toString(36)}-${rows.length + 1}`,
    organisationId: workspaceKey,
    type: normalizeText(notification.type),
    recipient: normalizeText(notification.recipient),
    partnerId: normalizeText(notification.partnerId),
    message: normalizeText(notification.message),
    createdAt,
  }
  setLocalNotifications(workspaceKey, [row, ...rows])
  return row
}

function mapPartnerToPersistencePayload(partner = {}, workspaceKey = '', context = {}) {
  return {
    organisation_id: workspaceKey,
    name: partner.name,
    partner_type: partner.type,
    primary_contact_name: partner.primaryContactName || null,
    primary_contact_email: partner.primaryContactEmail || null,
    primary_contact_number: partner.primaryContactNumber || null,
    default_region_id: isUuidLike(partner.defaultRegionId) ? partner.defaultRegionId : null,
    default_branch_id: isUuidLike(partner.defaultBranchId) ? partner.defaultBranchId : null,
    default_consultant_id: isUuidLike(partner.defaultConsultantId) ? partner.defaultConsultantId : null,
    routing_rule_id: isUuidLike(partner.routingRuleId) ? partner.routingRuleId : null,
    status: partner.status,
    notes: partner.notes || null,
    updated_by: isUuidLike(getActorUserId(context)) ? getActorUserId(context) : null,
    updated_at: new Date().toISOString(),
  }
}

async function fetchRemotePartners(workspaceKey = '', options = {}) {
  if (!isSupabaseConfigured || !supabase || options.forceLocal || options.persistRemote === false || !isUuidLike(workspaceKey)) return []
  const { data, error } = await supabase
    .from('bond_partners')
    .select('id, organisation_id, name, partner_type, primary_contact_name, primary_contact_email, primary_contact_number, default_region_id, default_branch_id, default_consultant_id, routing_rule_id, status, notes, created_at, updated_at')
    .eq('organisation_id', workspaceKey)
    .order('name', { ascending: true })
  if (error && !isMissingTableError(error, 'bond_partners')) throw error
  return (data || []).map((row) => normalizePartner(row, workspaceKey))
}

async function persistRemotePartner(partner = {}, workspaceKey = '', context = {}, mode = 'insert', options = {}) {
  if (!isSupabaseConfigured || !supabase || options.forceLocal || options.persistRemote === false || !isUuidLike(workspaceKey)) return null
  const payload = mapPartnerToPersistencePayload(partner, workspaceKey, context)
  if (mode === 'insert') payload.created_by = isUuidLike(getActorUserId(context)) ? getActorUserId(context) : null
  const query = mode === 'insert'
    ? supabase.from('bond_partners').insert(payload)
    : supabase.from('bond_partners').update(payload).eq('id', partner.id).eq('organisation_id', workspaceKey)
  const { data, error } = await query
    .select('id, organisation_id, name, partner_type, primary_contact_name, primary_contact_email, primary_contact_number, default_region_id, default_branch_id, default_consultant_id, routing_rule_id, status, notes, created_at, updated_at')
    .maybeSingle()
  if (error && !isMissingTableError(error, 'bond_partners')) throw error
  return data ? normalizePartner(data, workspaceKey) : null
}

async function persistRemoteInvite(invite = {}, workspaceKey = '', options = {}) {
  if (!isSupabaseConfigured || !supabase || options.forceLocal || options.persistRemote === false || !isUuidLike(workspaceKey)) return null
  const payload = {
    organisation_id: workspaceKey,
    partner_id: isUuidLike(invite.partnerId) ? invite.partnerId : null,
    invited_email: invite.invitedEmail,
    invited_by: isUuidLike(invite.invitedBy) ? invite.invitedBy : null,
    status: invite.status,
    token: invite.token,
    sent_at: invite.sentAt || null,
    accepted_at: invite.acceptedAt || null,
    expires_at: invite.expiresAt || null,
  }
  const { data, error } = await supabase
    .from('bond_partner_invitations')
    .upsert(payload, { onConflict: 'token' })
    .select('id, organisation_id, partner_id, invited_email, invited_by, status, token, sent_at, accepted_at, expires_at, created_at')
    .maybeSingle()
  if (error && !isMissingTableError(error, 'bond_partner_invitations')) throw error
  return data ? normalizeInvite(data, workspaceKey) : null
}

async function persistRemoteActivity(workspaceKey = '', activity = {}, options = {}) {
  if (!isSupabaseConfigured || !supabase || options.forceLocal || options.persistRemote === false || !isUuidLike(workspaceKey)) return null
  const payload = {
    organisation_id: workspaceKey,
    partner_id: isUuidLike(activity.partnerId) ? activity.partnerId : null,
    event_type: activity.eventType,
    actor_user_id: isUuidLike(activity.actorUserId) ? activity.actorUserId : null,
    source: activity.source || null,
    previous_value: activity.previousValue || null,
    new_value: activity.newValue || null,
    created_at: activity.createdAt || new Date().toISOString(),
  }
  const { error } = await supabase.from('bond_partner_activity').insert(payload)
  if (error && !isMissingTableError(error, 'bond_partner_activity')) throw error
  return null
}

async function logPartnerActivity(workspaceKey = '', event = {}, options = {}) {
  const activity = appendActivity(workspaceKey, event)
  await persistRemoteActivity(workspaceKey, activity, options)
  return activity
}

function getPartnerApplicationRows(partner = {}, applications = []) {
  const partnerId = normalizeText(partner.id)
  const partnerName = normalizeLower(partner.name)
  return normalizeArray(applications).filter((row) => {
    const rowPartnerId = getApplicationPartnerId(row)
    const rowPartnerName = normalizeLower(getApplicationPartnerName(row))
    return (partnerId && rowPartnerId === partnerId) || (partnerName && rowPartnerName === partnerName)
  })
}

function getScopedApplicationRows(applications = [], scope = {}) {
  if (!scope?.scopeLevel || scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq) return applications
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.region) {
    const ids = new Set(normalizeArray(scope.regionIds).map(normalizeText))
    return applications.filter((row) => ids.has(getApplicationRegionId(row)))
  }
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.branch) {
    const ids = new Set(normalizeArray(scope.branchIds).map(normalizeText))
    return applications.filter((row) => ids.has(getApplicationBranchId(row)))
  }
  const ids = new Set(normalizeArray(scope.consultantIds).map(normalizeText))
  return applications.filter((row) => ids.has(getApplicationConsultantId(row)))
}

function canViewPartner(partner = {}, scope = {}, data = {}) {
  if (!scope?.scopeLevel || scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq) return true
  const partnerRows = getPartnerApplicationRows(partner, data.applications)
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.region) {
    const regionIds = new Set(normalizeArray(scope.regionIds).map(normalizeText))
    return regionIds.has(partner.defaultRegionId) || partnerRows.some((row) => regionIds.has(getApplicationRegionId(row)))
  }
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.branch) {
    const branchIds = new Set(normalizeArray(scope.branchIds).map(normalizeText))
    return branchIds.has(partner.defaultBranchId) || partnerRows.some((row) => branchIds.has(getApplicationBranchId(row)))
  }
  const consultantIds = new Set(normalizeArray(scope.consultantIds).map(normalizeText))
  return consultantIds.has(partner.defaultConsultantId) || partnerRows.some((row) => consultantIds.has(getApplicationConsultantId(row)))
}

function enrichPartner(partner = {}, data = {}, scope = {}) {
  const branch = data.branches.find((row) => getBranchId(row) === partner.defaultBranchId)
  const region = data.regions.find((row) => normalizeText(row.id) === (partner.defaultRegionId || getBranchRegionId(branch)))
  const consultant = data.consultants.find((row) => getUserId(row) === partner.defaultConsultantId)
  const applicationRows = getScopedApplicationRows(getPartnerApplicationRows(partner, data.applications), scope)
  const approved = applicationRows.filter(isApprovedApplication).length
  const declined = applicationRows.filter(isDeclinedApplication).length
  const active = applicationRows.filter(isActiveApplication).length
  const submitted = applicationRows.filter(isSubmittedApplication).length
  const lastApplicationDate = applicationRows.map(getDateValue).filter(Boolean).sort().at(-1) || ''
  return {
    ...partner,
    typeLabel: getPartnerTypeLabel(partner.type),
    statusLabel: getPartnerStatusLabel(partner.status),
    defaultRegion: region?.name || partner.defaultRegionId || 'Fallback',
    defaultBranch: branch?.name || partner.defaultBranchId || 'Fallback',
    defaultConsultant: consultant ? getConsultantName(consultant) : partner.defaultConsultantId || 'Workload balanced',
    routingRuleLabel: getPartnerRoutingRuleLabel(partner),
    applicationsSent: applicationRows.length,
    activeApplications: active,
    submittedApplications: submitted,
    approvedApplications: approved,
    declinedApplications: declined,
    approvalRate: percent(approved, applicationRows.length),
    averageTurnaround: average(applicationRows.map(getLeadDays)),
    averageBankResponseTime: average(applicationRows.map((row) => row.averageBankResponseTime || row.average_bank_response_time || row.bankResponseDays || row.bank_response_days)),
    lastApplicationDate,
    lastActivity: lastApplicationDate || partner.updatedAt || partner.createdAt || 'No activity yet',
    applications: applicationRows,
  }
}

function getPartnerTypeLabel(value = '') {
  const type = normalizePartnerType(value)
  if (type === BOND_PARTNER_TYPES.referralPartner) return 'Referral Partner'
  if (type === BOND_PARTNER_TYPES.internalSource) return 'Internal Source'
  return type.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function getPartnerStatusLabel(value = '') {
  const status = normalizeStatus(value)
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function getPartnerRoutingRuleType(partner = {}) {
  const type = normalizePartnerType(partner.type)
  if (type === BOND_PARTNER_TYPES.development || type === BOND_PARTNER_TYPES.developer) return BOND_ROUTING_RULE_TYPES.development
  return BOND_ROUTING_RULE_TYPES.agency
}

function getPartnerRoutingRuleLabel(partner = {}) {
  const type = normalizePartnerType(partner.type)
  if (type === BOND_PARTNER_TYPES.development || type === BOND_PARTNER_TYPES.developer) return 'Development Default'
  if (type === BOND_PARTNER_TYPES.referralPartner) return 'Referral Default'
  return 'Agency Default'
}

export function getBondPartners(context = {}, workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  const data = getData(options, workspaceKey)
  const scope = options.organisationScope || resolveBondOrganisationScope({ ...context, workspaceId: workspaceKey }, data)
  return data.partners
    .filter((partner) => canViewPartner(partner, scope, data))
    .map((partner) => enrichPartner(partner, data, scope))
}

export async function getAllBondPartnerRows(workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, {}, options)
  if (normalizeArray(options.partners).length || options.forceLocal) {
    return getData(options, workspaceKey).partners
  }
  const remoteRows = await fetchRemotePartners(workspaceKey, options)
  if (remoteRows.length) {
    setLocalPartners(workspaceKey, remoteRows)
    return remoteRows
  }
  return getLocalPartners(workspaceKey)
}

export async function createBondPartner(payload = {}, context = {}, workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  const data = getData(options, workspaceKey)
  assertCanManagePartners({ ...context, workspaceId: workspaceKey }, data)
  const now = new Date().toISOString()
  const validated = validatePartnerPayload(payload)
  const partner = normalizePartner({
    ...validated,
    id: payload.id || createLocalPartnerId(validated.name),
    organisationId: workspaceKey,
    createdAt: now,
    updatedAt: now,
  }, workspaceKey)
  const persisted = await persistRemotePartner(partner, workspaceKey, context, 'insert', options)
  const finalPartner = persisted || partner
  setLocalPartners(workspaceKey, [...getLocalPartners(workspaceKey).filter((row) => row.id !== finalPartner.id), finalPartner])
  await logPartnerActivity(workspaceKey, {
    eventType: BOND_PARTNER_ACTIVITY_EVENTS.created,
    partnerId: finalPartner.id,
    actorUserId: getActorUserId(context),
    source: finalPartner.name,
    previousValue: null,
    newValue: finalPartner,
  }, options)
  return finalPartner
}

export async function updateBondPartner(partnerId = '', payload = {}, context = {}, workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  const data = getData(options, workspaceKey)
  assertCanManagePartners({ ...context, workspaceId: workspaceKey }, data)
  const rows = getLocalPartners(workspaceKey)
  const existing = rows.find((partner) => partner.id === normalizeText(partnerId))
  if (!existing) throw new Error('Partner could not be found.')
  const validated = validatePartnerPayload(payload, existing)
  const updated = normalizePartner({
    ...existing,
    ...validated,
    updatedAt: new Date().toISOString(),
  }, workspaceKey)
  const persisted = await persistRemotePartner(updated, workspaceKey, context, 'update', options)
  const finalPartner = persisted || updated
  setLocalPartners(workspaceKey, rows.map((partner) => (partner.id === existing.id ? finalPartner : partner)))
  await logPartnerActivity(workspaceKey, {
    eventType: finalPartner.status === BOND_PARTNER_STATUSES.disabled
      ? BOND_PARTNER_ACTIVITY_EVENTS.disabled
      : finalPartner.status === BOND_PARTNER_STATUSES.paused
        ? BOND_PARTNER_ACTIVITY_EVENTS.paused
        : BOND_PARTNER_ACTIVITY_EVENTS.updated,
    partnerId: finalPartner.id,
    actorUserId: getActorUserId(context),
    source: finalPartner.name,
    previousValue: existing,
    newValue: finalPartner,
  }, options)
  return finalPartner
}

export async function inviteBondPartner(partnerId = '', email = '', context = {}, workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  const data = getData(options, workspaceKey)
  assertCanManagePartners({ ...context, workspaceId: workspaceKey }, data)
  const rows = getLocalPartners(workspaceKey)
  const partner = rows.find((row) => row.id === normalizeText(partnerId))
  if (!partner) throw new Error('Partner could not be found.')
  const invitedEmail = normalizeLower(email || partner.primaryContactEmail)
  if (!invitedEmail || !validateEmail(invitedEmail)) throw createValidationError('Partner invitation validation failed.', { invitedEmail: 'Enter a valid invitation email.' })
  const now = new Date().toISOString()
  const invite = normalizeInvite({
    id: `partner-invite-${Date.now().toString(36)}-${localInviteSequence += 1}`,
    organisationId: workspaceKey,
    partnerId: partner.id,
    invitedEmail,
    invitedBy: getActorUserId(context),
    status: BOND_PARTNER_INVITE_STATUSES.pending,
    token: createInviteToken(partner.id),
    sentAt: now,
    expiresAt: addDays(new Date(now), 14),
    createdAt: now,
  }, workspaceKey)
  const persistedInvite = await persistRemoteInvite(invite, workspaceKey, options)
  const finalInvite = persistedInvite || invite
  setLocalInvites(workspaceKey, [finalInvite, ...getLocalInvites(workspaceKey).filter((row) => row.id !== finalInvite.id)])
  const updatedPartner = normalizePartner({ ...partner, status: BOND_PARTNER_STATUSES.invited, updatedAt: now }, workspaceKey)
  const persistedPartner = await persistRemotePartner(updatedPartner, workspaceKey, context, 'update', options)
  const finalPartner = persistedPartner || updatedPartner
  setLocalPartners(workspaceKey, rows.map((row) => (row.id === partner.id ? finalPartner : row)))
  await logPartnerActivity(workspaceKey, {
    eventType: BOND_PARTNER_ACTIVITY_EVENTS.invited,
    partnerId: partner.id,
    actorUserId: getActorUserId(context),
    source: partner.name,
    previousValue: null,
    newValue: finalInvite,
  }, options)
  appendNotification(workspaceKey, {
    type: BOND_PARTNER_ACTIVITY_EVENTS.invited,
    recipient: invitedEmail,
    partnerId: partner.id,
    message: `${partner.name} partner invitation sent.`,
  })
  return finalInvite
}

export async function resendBondPartnerInvite(inviteId = '', context = {}, workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  const data = getData(options, workspaceKey)
  assertCanManagePartners({ ...context, workspaceId: workspaceKey }, data)
  const invites = getLocalInvites(workspaceKey)
  const existing = invites.find((invite) => invite.id === normalizeText(inviteId))
  if (!existing) throw new Error('Partner invitation could not be found.')
  const updated = normalizeInvite({
    ...existing,
    status: BOND_PARTNER_INVITE_STATUSES.pending,
    sentAt: new Date().toISOString(),
    expiresAt: addDays(new Date(), 14),
  }, workspaceKey)
  const persistedInvite = await persistRemoteInvite(updated, workspaceKey, options)
  const finalInvite = persistedInvite || updated
  setLocalInvites(workspaceKey, invites.map((invite) => (invite.id === existing.id ? finalInvite : invite)))
  await logPartnerActivity(workspaceKey, {
    eventType: BOND_PARTNER_ACTIVITY_EVENTS.inviteResent,
    partnerId: finalInvite.partnerId,
    actorUserId: getActorUserId(context),
    source: finalInvite.invitedEmail,
    previousValue: existing,
    newValue: finalInvite,
  }, options)
  appendNotification(workspaceKey, {
    type: BOND_PARTNER_ACTIVITY_EVENTS.inviteResent,
    recipient: updated.invitedEmail,
    partnerId: updated.partnerId,
    message: 'Partner invitation resent.',
  })
  return finalInvite
}

export async function cancelBondPartnerInvite(inviteId = '', context = {}, workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  const data = getData(options, workspaceKey)
  assertCanManagePartners({ ...context, workspaceId: workspaceKey }, data)
  const invites = getLocalInvites(workspaceKey)
  const existing = invites.find((invite) => invite.id === normalizeText(inviteId))
  if (!existing) throw new Error('Partner invitation could not be found.')
  const updated = normalizeInvite({ ...existing, status: BOND_PARTNER_INVITE_STATUSES.cancelled }, workspaceKey)
  const persistedInvite = await persistRemoteInvite(updated, workspaceKey, options)
  const finalInvite = persistedInvite || updated
  setLocalInvites(workspaceKey, invites.map((invite) => (invite.id === existing.id ? finalInvite : invite)))
  return finalInvite
}

export async function acceptBondPartnerInvite(token = '', context = {}, workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  const invites = getLocalInvites(workspaceKey)
  const invite = invites.find((row) => row.token === normalizeText(token))
  if (!invite) throw new Error('Partner invitation could not be found.')
  if (invite.status === BOND_PARTNER_INVITE_STATUSES.cancelled) throw new Error('This partner invitation has been cancelled.')
  const now = new Date().toISOString()
  const acceptedInvite = normalizeInvite({ ...invite, status: BOND_PARTNER_INVITE_STATUSES.accepted, acceptedAt: now }, workspaceKey)
  const persistedInvite = await persistRemoteInvite(acceptedInvite, workspaceKey, options)
  const finalInvite = persistedInvite || acceptedInvite
  setLocalInvites(workspaceKey, invites.map((row) => (row.id === invite.id ? finalInvite : row)))
  const rows = getLocalPartners(workspaceKey)
  const partner = rows.find((row) => row.id === invite.partnerId)
  if (partner) {
    const updatedPartner = normalizePartner({ ...partner, status: BOND_PARTNER_STATUSES.active, updatedAt: now }, workspaceKey)
    const persistedPartner = await persistRemotePartner(updatedPartner, workspaceKey, context, 'update', options)
    const finalPartner = persistedPartner || updatedPartner
    setLocalPartners(workspaceKey, rows.map((row) => (row.id === partner.id ? finalPartner : row)))
    await logPartnerActivity(workspaceKey, {
      eventType: BOND_PARTNER_ACTIVITY_EVENTS.accepted,
      partnerId: partner.id,
      actorUserId: getActorUserId(context),
      source: partner.name,
      previousValue: partner,
      newValue: finalPartner,
    }, options)
    appendNotification(workspaceKey, {
      type: BOND_PARTNER_ACTIVITY_EVENTS.accepted,
      recipient: 'HQ',
      partnerId: partner.id,
      message: `${partner.name} accepted the partnership invitation.`,
    })
  }
  return finalInvite
}

export async function setPartnerRoutingDefaults(partnerId = '', defaults = {}, context = {}, workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  const data = getData(options, workspaceKey)
  assertCanManagePartners({ ...context, workspaceId: workspaceKey }, data)
  const rows = getLocalPartners(workspaceKey)
  const partner = rows.find((row) => row.id === normalizeText(partnerId))
  if (!partner) throw new Error('Partner could not be found.')
  const validated = validateRoutingDefaults(defaults, data)
  const hasDefaults = Boolean(validated.defaultRegionId || validated.defaultBranchId || validated.defaultConsultantId)
  let routingRuleId = partner.routingRuleId
  let routingRule = null
  if (hasDefaults) {
    const rulePayload = {
      ruleType: getPartnerRoutingRuleType(partner),
      sourceId: partner.id,
      sourceName: partner.name,
      regionId: validated.defaultRegionId,
      branchId: validated.defaultBranchId,
      consultantId: validated.defaultConsultantId,
      priority: defaults.priority || 40,
      status: 'active',
    }
    routingRule = routingRuleId
      ? await updateRoutingRule(routingRuleId, rulePayload, context, workspaceKey, { ...options, ...data })
      : await createRoutingRule(rulePayload, context, workspaceKey, { ...options, ...data })
    routingRuleId = routingRule.id
  } else if (routingRuleId) {
    await disableRoutingRule(routingRuleId, context, workspaceKey, { ...options, ...data })
  }

  const updated = normalizePartner({
    ...partner,
    ...validated,
    routingRuleId: hasDefaults ? routingRuleId : '',
    updatedAt: new Date().toISOString(),
  }, workspaceKey)
  const persistedPartner = await persistRemotePartner(updated, workspaceKey, context, 'update', options)
  const finalPartner = persistedPartner || updated
  setLocalPartners(workspaceKey, rows.map((row) => (row.id === partner.id ? finalPartner : row)))
  await logPartnerActivity(workspaceKey, {
    eventType: BOND_PARTNER_ACTIVITY_EVENTS.routingDefaultUpdated,
    partnerId: finalPartner.id,
    actorUserId: getActorUserId(context),
    source: finalPartner.name,
    previousValue: partner,
    newValue: { partner: finalPartner, routingRule },
  }, options)
  appendNotification(workspaceKey, {
    type: BOND_PARTNER_ACTIVITY_EVENTS.routingDefaultUpdated,
    recipient: finalPartner.defaultConsultantId || finalPartner.defaultBranchId || 'HQ',
    partnerId: finalPartner.id,
    message: `${finalPartner.name} routing default updated.`,
  })
  return finalPartner
}

export function getBondPartnerApplications(partnerId = '', context = {}, workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  const data = getData(options, workspaceKey)
  const scope = options.organisationScope || resolveBondOrganisationScope({ ...context, workspaceId: workspaceKey }, data)
  const partner = data.partners.find((row) => row.id === normalizeText(partnerId))
  if (!partner || !canViewPartner(partner, scope, data)) return []
  return getScopedApplicationRows(getPartnerApplicationRows(partner, data.applications), scope)
}

export function getBondPartnerPerformance(partnerId = '', context = {}, workspaceId = '', options = {}) {
  return getBondPartners(context, workspaceId, options).find((partner) => partner.id === normalizeText(partnerId)) || null
}

export function getBondPartnerWorkspace(partnerId = '', context = {}, workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  const data = getData(options, workspaceKey)
  const scope = options.organisationScope || resolveBondOrganisationScope({ ...context, workspaceId: workspaceKey }, data)
  const partner = data.partners.find((row) => row.id === normalizeText(partnerId))
  if (!partner || !canViewPartner(partner, scope, data)) return null
  const enriched = enrichPartner(partner, data, scope)
  const activity = getLocalActivity(workspaceKey).filter((event) => normalizeText(event.partnerId || event.partner_id) === partner.id)
  const invites = getLocalInvites(workspaceKey).filter((invite) => invite.partnerId === partner.id)
  return {
    id: partner.id,
    partner: enriched,
    metrics: {
      applicationsSent: enriched.applicationsSent,
      activeApplications: enriched.activeApplications,
      submittedApplications: enriched.submittedApplications,
      approvals: enriched.approvedApplications,
      approvalRate: enriched.approvalRate,
      averageTurnaround: enriched.averageTurnaround,
      averageBankResponseTime: enriched.averageBankResponseTime,
      lastApplicationDate: enriched.lastApplicationDate,
    },
    routingDefaults: {
      defaultRegionId: partner.defaultRegionId,
      defaultBranchId: partner.defaultBranchId,
      defaultConsultantId: partner.defaultConsultantId,
      defaultRegion: enriched.defaultRegion,
      defaultBranch: enriched.defaultBranch,
      defaultConsultant: enriched.defaultConsultant,
      routingRuleId: partner.routingRuleId,
      routingRuleLabel: enriched.routingRuleLabel,
    },
    applications: enriched.applications,
    invites,
    recentActivity: activity,
    tabs: ['Overview', 'Applications', 'Routing', 'Activity', 'Settings'],
  }
}

export function getBondPartnerWorkspaceRoute(partnerId = '') {
  return `/bond/organisation/partners/${encodeURIComponent(normalizeText(partnerId))}`
}

export function getBondPartnerActivityEvents(context = {}, workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  return getLocalActivity(workspaceKey)
}

export const __bondPartnerManagementServiceTestUtils = Object.freeze({
  clearStores() {
    LOCAL_PARTNER_STORE.clear()
    LOCAL_INVITE_STORE.clear()
    LOCAL_ACTIVITY_STORE.clear()
    LOCAL_NOTIFICATION_STORE.clear()
    localPartnerSequence = 0
    localInviteSequence = 0
  },
  seedPartners(workspaceId = '', rows = []) {
    setLocalPartners(normalizeText(workspaceId || 'default'), rows)
  },
  getPartners(workspaceId = '') {
    return getLocalPartners(normalizeText(workspaceId || 'default'))
  },
  getInvites(workspaceId = '') {
    return getLocalInvites(normalizeText(workspaceId || 'default'))
  },
  getActivity(workspaceId = '') {
    return getLocalActivity(normalizeText(workspaceId || 'default'))
  },
  getNotifications(workspaceId = '') {
    return getLocalNotifications(normalizeText(workspaceId || 'default'))
  },
})
