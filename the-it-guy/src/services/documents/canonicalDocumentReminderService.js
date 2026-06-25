import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import {
  REQUIREMENT_LEVELS,
  REQUIREMENT_STATUSES,
  isRequirementSatisfied,
} from './canonicalDocumentResolverService'
import { isRequirementExpired } from './canonicalDocumentLifecycleService'
import {
  evaluateAllGateReadinessFromRequirements,
  getGateDefinition,
} from './canonicalWorkflowGateService'

export const CANONICAL_DOCUMENT_REMINDERS_FLAG = 'VITE_CANONICAL_DOCUMENT_REMINDERS_ENABLED'
export const CANONICAL_AUTOMATED_REMINDERS_FLAG = 'VITE_CANONICAL_AUTOMATED_REMINDERS_ENABLED'
export const CANONICAL_EXTERNAL_EMAIL_REMINDERS_FLAG = 'VITE_CANONICAL_EXTERNAL_EMAIL_REMINDERS_ENABLED'
export const CANONICAL_WHATSAPP_REMINDERS_FLAG = 'VITE_CANONICAL_WHATSAPP_REMINDERS_ENABLED'
export const CANONICAL_ESCALATIONS_FLAG = 'VITE_CANONICAL_ESCALATIONS_ENABLED'
export const CANONICAL_REMINDER_SOURCE = 'canonical_document_reminder_service'

export const REMINDER_TYPES = Object.freeze({
  missingRequiredDocuments: 'missing_required_documents',
  missingBlockerDocuments: 'missing_blocker_documents',
  rejectedDocuments: 'rejected_documents',
  expiredDocuments: 'expired_documents',
  documentsAwaitingReview: 'documents_awaiting_review',
  workflowGateBlocked: 'workflow_gate_blocked',
  packIncomplete: 'pack_incomplete',
  staleUploadRequest: 'stale_upload_request',
  finalPreLodgementCheck: 'final_pre_lodgement_check',
})

export const REMINDER_CHANNELS = Object.freeze({
  inApp: 'in_app',
  email: 'email',
  whatsapp: 'whatsapp',
  manual: 'manual',
  system: 'system',
})

export const REMINDER_STATUSES = Object.freeze({
  pending: 'pending',
  scheduled: 'scheduled',
  sent: 'sent',
  suppressed: 'suppressed',
  paused: 'paused',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
})

export const REMINDER_EVENT_TYPES = Object.freeze({
  scheduled: 'reminder_scheduled',
  sent: 'reminder_sent',
  suppressed: 'reminder_suppressed',
  failed: 'reminder_failed',
  escalationCreated: 'escalation_created',
  manualFollowUpSent: 'manual_follow_up_sent',
  completed: 'reminder_completed',
})

export const REMINDER_CADENCE = Object.freeze({
  initialBusinessDays: 0,
  firstReminderBusinessDays: 2,
  secondReminderBusinessDays: 5,
  escalationBusinessDays: 8,
  recentReminderCooldownHours: 36,
})

export const REMINDER_TYPE_CONFIG = Object.freeze({
  missing_required_documents: {
    urgency: 'normal',
    cadenceBusinessDays: 2,
    stopStatuses: ['approved', 'completed', 'waived', 'not_applicable', 'under_review', 'uploaded'],
  },
  missing_blocker_documents: {
    urgency: 'high',
    cadenceBusinessDays: 2,
    stopStatuses: ['approved', 'completed', 'waived', 'not_applicable', 'under_review', 'uploaded'],
  },
  rejected_documents: {
    urgency: 'high',
    cadenceBusinessDays: 2,
    stopStatuses: ['approved', 'completed', 'waived', 'not_applicable', 'under_review', 'uploaded'],
  },
  expired_documents: {
    urgency: 'high',
    cadenceBusinessDays: 2,
    stopStatuses: ['approved', 'completed', 'waived', 'not_applicable', 'under_review', 'uploaded'],
  },
  documents_awaiting_review: {
    urgency: 'normal',
    cadenceBusinessDays: 2,
    stopStatuses: ['approved', 'completed', 'waived', 'not_applicable', 'rejected'],
  },
  workflow_gate_blocked: {
    urgency: 'critical',
    cadenceBusinessDays: 2,
    stopStatuses: ['approved', 'completed', 'waived', 'not_applicable'],
  },
  pack_incomplete: {
    urgency: 'low',
    cadenceBusinessDays: 5,
    stopStatuses: ['approved', 'completed', 'waived', 'not_applicable', 'under_review', 'uploaded'],
  },
  stale_upload_request: {
    urgency: 'normal',
    cadenceBusinessDays: 5,
    stopStatuses: ['approved', 'completed', 'waived', 'not_applicable', 'under_review', 'uploaded'],
  },
  final_pre_lodgement_check: {
    urgency: 'critical',
    cadenceBusinessDays: 2,
    stopStatuses: ['approved', 'completed', 'waived', 'not_applicable'],
  },
})

export const MESSAGE_TEMPLATE_DEFINITIONS = Object.freeze({
  missing_required_documents: {
    title: '{pack_name} documents still needed',
    body: '{missing_documents} are still needed for {transaction_reference}.',
  },
  missing_blocker_documents: {
    title: 'Blocker documents still needed',
    body: '{missing_documents} are blocking {gate_name}.',
  },
  rejected_documents: {
    title: 'Document re-upload needed',
    body: '{rejected_documents} need to be replaced before the transaction can move forward.',
  },
  expired_documents: {
    title: 'Expired document replacement needed',
    body: '{missing_documents} have expired and need replacement.',
  },
  documents_awaiting_review: {
    title: 'Documents awaiting review',
    body: '{missing_documents} are waiting for review.',
  },
  workflow_gate_blocked: {
    title: '{gate_name} is blocked',
    body: '{missing_documents} are preventing {gate_name}.',
  },
  pack_incomplete: {
    title: '{pack_name} is incomplete',
    body: '{missing_documents} remain outstanding.',
  },
  stale_upload_request: {
    title: 'Document request still outstanding',
    body: '{missing_documents} have not been received yet.',
  },
  final_pre_lodgement_check: {
    title: 'Pre-lodgement document check',
    body: '{missing_documents} need attention before lodgement.',
  },
})

const CLOSED_CONTEXT_STATUSES = new Set(['archived', 'cancelled', 'canceled', 'registered', 'completed', 'closed', 'withdrawn'])
const AUTO_CHASE_LEVELS = new Set([REQUIREMENT_LEVELS.blocker, REQUIREMENT_LEVELS.required])
const CHASE_STATUSES = new Set([
  REQUIREMENT_STATUSES.pending,
  REQUIREMENT_STATUSES.requested,
  REQUIREMENT_STATUSES.rejected,
  REQUIREMENT_STATUSES.expired,
])
const REVIEW_STATUSES = new Set([
  REQUIREMENT_STATUSES.uploaded,
  REQUIREMENT_STATUSES.underReview,
])
const SATISFIED_STATUSES = new Set([
  REQUIREMENT_STATUSES.approved,
  REQUIREMENT_STATUSES.completed,
  REQUIREMENT_STATUSES.waived,
  REQUIREMENT_STATUSES.notApplicable,
])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function normalizeArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value.filter(Boolean) : [value]
}

function isTruthyFlag(value, fallback = false) {
  const text = normalizeText(value).toLowerCase()
  if (!text) return fallback
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(text)) return true
  if (['0', 'false', 'no', 'off', 'disabled'].includes(text)) return false
  return fallback
}

function getEnvFlag(name) {
  try {
    return import.meta.env?.[name]
  } catch {
    return undefined
  }
}

function requireClient(client = supabase) {
  if (!client || !isSupabaseConfigured) throw new Error('Supabase is required for canonical document reminders.')
  return client
}

function normalizeUuid(value) {
  const normalized = normalizeText(value)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized) ? normalized : null
}

export function areCanonicalDocumentRemindersEnabled(options = {}) {
  if (typeof options.enabled === 'boolean') return options.enabled
  if (typeof options.force === 'boolean' && options.force) return true
  return isTruthyFlag(getEnvFlag(CANONICAL_DOCUMENT_REMINDERS_FLAG), true)
}

export function areCanonicalAutomatedRemindersEnabled(options = {}) {
  if (typeof options.automatedEnabled === 'boolean') return options.automatedEnabled
  return isTruthyFlag(getEnvFlag(CANONICAL_AUTOMATED_REMINDERS_FLAG), false)
}

export function areCanonicalEmailRemindersEnabled(options = {}) {
  if (typeof options.emailEnabled === 'boolean') return options.emailEnabled
  return isTruthyFlag(getEnvFlag(CANONICAL_EXTERNAL_EMAIL_REMINDERS_FLAG), false)
}

export function areCanonicalWhatsappRemindersEnabled(options = {}) {
  if (typeof options.whatsappEnabled === 'boolean') return options.whatsappEnabled
  return isTruthyFlag(getEnvFlag(CANONICAL_WHATSAPP_REMINDERS_FLAG), false)
}

export function areCanonicalEscalationsEnabled(options = {}) {
  if (typeof options.escalationsEnabled === 'boolean') return options.escalationsEnabled
  return isTruthyFlag(getEnvFlag(CANONICAL_ESCALATIONS_FLAG), false)
}

export function addBusinessDays(dateInput = new Date(), businessDays = 0) {
  const date = dateInput instanceof Date ? new Date(dateInput.getTime()) : new Date(dateInput)
  if (Number.isNaN(date.getTime())) return new Date().toISOString()
  let remaining = Math.max(0, Number(businessDays || 0))
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1)
    const day = date.getUTCDay()
    if (day !== 0 && day !== 6) remaining -= 1
  }
  return date.toISOString()
}

export function hoursBetween(leftInput, rightInput = new Date()) {
  const left = new Date(leftInput)
  const right = rightInput instanceof Date ? rightInput : new Date(rightInput)
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return Infinity
  return Math.max(0, (right.getTime() - left.getTime()) / (60 * 60 * 1000))
}

function getDefinition(requirement = {}) {
  return requirement.document_definitions || requirement.document_definition || requirement.definition || {}
}

function getPack(requirement = {}) {
  return requirement.document_packs || requirement.document_pack || requirement.pack || {}
}

function getRequirementLabel(requirement = {}) {
  const definition = getDefinition(requirement)
  return normalizeText(definition.display_label || requirement.display_label || requirement.document_label || requirement.document_definition_key) || 'Document'
}

function getPackLabel(requirement = {}) {
  const pack = getPack(requirement)
  return normalizeText(pack.display_label || requirement.pack_label || requirement.pack_key || 'Documents').replace(/_/g, ' ')
}

function contextClosed(context = {}) {
  const status = normalizeKey(context.status || context.lifecycle_status || context.listing_status || context.transaction_status)
  return Boolean(status && CLOSED_CONTEXT_STATUSES.has(status))
}

function roleCanSeeAndUpload(requirement = {}, role = '', { mode = 'upload' } = {}) {
  const normalizedRole = normalizeKey(role)
  if (!normalizedRole) return false
  const visible = normalizeArray(requirement.visible_to_roles || getDefinition(requirement).default_visibility).map(normalizeKey)
  const uploadable = normalizeArray(requirement.uploadable_by_roles || getDefinition(requirement).default_upload_roles).map(normalizeKey)
  const visibleOk = !visible.length || visible.includes(normalizedRole) || visible.includes('client')
  if (mode === 'review') return visibleOk
  return visibleOk && (uploadable.includes(normalizedRole) || uploadable.includes('client'))
}

function determineReviewerRole(requirement = {}) {
  return normalizeKey(requirement.reviewer_role) || 'agent'
}

function determineUploadRole(requirement = {}) {
  return normalizeKey(requirement.requested_from_role) ||
    normalizeArray(requirement.uploadable_by_roles || getDefinition(requirement).default_upload_roles).map(normalizeKey).find(Boolean) ||
    'client'
}

function getAffectedGate(requirement = {}, gateReadiness = []) {
  const gates = normalizeArray(requirement.stage_gates).map(normalizeKey)
  const blockedGate = gateReadiness.find((gate) =>
    gates.includes(normalizeKey(gate.gate_key || gate.gate)) &&
    gate.status === 'blocked'
  )
  return normalizeKey(blockedGate?.gate_key || blockedGate?.gate || gates[0] || '')
}

function getRequirementReminderType(requirement = {}, { gateReadiness = [], now = new Date() } = {}) {
  const status = normalizeKey(requirement.status || REQUIREMENT_STATUSES.pending)
  const reviewRequired = Boolean(getDefinition(requirement).review_required)
  const expired = status === REQUIREMENT_STATUSES.expired || isRequirementExpired(requirement, now)
  const affectedGate = getAffectedGate(requirement, gateReadiness)
  const blockingGate = gateReadiness.find((gate) =>
    affectedGate &&
    normalizeKey(gate.gate_key || gate.gate) === affectedGate &&
    gate.status === 'blocked' &&
    (gate.blockers || []).some((item) => item.id === requirement.id)
  )

  if (REVIEW_STATUSES.has(status) && reviewRequired) return REMINDER_TYPES.documentsAwaitingReview
  if (expired) return REMINDER_TYPES.expiredDocuments
  if (status === REQUIREMENT_STATUSES.rejected) return REMINDER_TYPES.rejectedDocuments
  if (blockingGate) return REMINDER_TYPES.workflowGateBlocked
  if (requirement.requirement_level === REQUIREMENT_LEVELS.blocker) return REMINDER_TYPES.missingBlockerDocuments
  return REMINDER_TYPES.missingRequiredDocuments
}

function getUrgencyForReminder(type, requirement = {}) {
  if (type === REMINDER_TYPES.workflowGateBlocked || type === REMINDER_TYPES.finalPreLodgementCheck) return 'critical'
  if (type === REMINDER_TYPES.rejectedDocuments || type === REMINDER_TYPES.expiredDocuments || requirement.requirement_level === REQUIREMENT_LEVELS.blocker) return 'high'
  return REMINDER_TYPE_CONFIG[type]?.urgency || 'normal'
}

function shouldStopReminderForRequirement(requirement = {}, type = '') {
  const status = normalizeKey(requirement.status)
  if (SATISFIED_STATUSES.has(status)) return true
  const stopStatuses = REMINDER_TYPE_CONFIG[type]?.stopStatuses || []
  return stopStatuses.includes(status)
}

export function evaluateReminderEligibility(requirement = {}, {
  context = {},
  contactsByRole = {},
  includeRecommended = false,
  gateReadiness = [],
  now = new Date(),
} = {}) {
  const status = normalizeKey(requirement.status || REQUIREMENT_STATUSES.pending)
  const level = normalizeKey(requirement.requirement_level || REQUIREMENT_LEVELS.required)
  const reviewRequired = Boolean(getDefinition(requirement).review_required)
  const awaitingReview = REVIEW_STATUSES.has(status) && reviewRequired
  const type = getRequirementReminderType(requirement, { gateReadiness, now })
  const recipientRole = awaitingReview ? determineReviewerRole(requirement) : determineUploadRole(requirement)
  const recipient = contactsByRole[recipientRole] || contactsByRole[normalizeKey(recipientRole)] || {}
  const recipientContactId = normalizeUuid(requirement.requested_from_contact_id || recipient.id || recipient.contact_id)
  const recipientEmail = normalizeText(recipient.email || recipient.recipient_email || requirement.recipient_email)
  const affectedGate = getAffectedGate(requirement, gateReadiness)

  if (contextClosed(context)) {
    return { eligible: false, suppressedReason: 'context_closed', requirement, reminderType: type, recipientRole }
  }
  if (status === REQUIREMENT_STATUSES.waived || status === REQUIREMENT_STATUSES.notApplicable || isRequirementSatisfied(requirement)) {
    return { eligible: false, suppressedReason: 'requirement_satisfied', requirement, reminderType: type, recipientRole }
  }
  if (level === REQUIREMENT_LEVELS.optional) {
    return { eligible: false, suppressedReason: 'optional_requirement', requirement, reminderType: type, recipientRole }
  }
  if (level === REQUIREMENT_LEVELS.recommended && !includeRecommended) {
    return { eligible: false, suppressedReason: 'recommended_not_automatic', requirement, reminderType: type, recipientRole }
  }
  if (!awaitingReview && !CHASE_STATUSES.has(status) && !isRequirementExpired(requirement, now)) {
    return { eligible: false, suppressedReason: 'status_not_reminder_eligible', requirement, reminderType: type, recipientRole }
  }
  if (!recipientRole) {
    return { eligible: false, suppressedReason: 'recipient_role_missing', requirement, reminderType: type, recipientRole }
  }
  if (!roleCanSeeAndUpload(requirement, recipientRole, { mode: awaitingReview ? 'review' : 'upload' })) {
    return { eligible: false, suppressedReason: 'recipient_not_permitted', requirement, reminderType: type, recipientRole }
  }
  if (!recipientContactId && !recipientEmail && !['agent', 'agency_admin', 'internal_admin', 'transferring_attorney', 'bond_attorney', 'cancellation_attorney'].includes(recipientRole)) {
    return { eligible: false, suppressedReason: 'recipient_contact_missing', requirement, reminderType: type, recipientRole }
  }

  return {
    eligible: true,
    requirement,
    reminderType: type,
    recipientRole,
    recipientContactId,
    recipientEmail,
    urgency: getUrgencyForReminder(type, requirement),
    affectedGate,
    packKey: requirement.pack_key || getDefinition(requirement).pack_key || 'uncategorised',
    packName: getPackLabel(requirement),
    documentLabel: getRequirementLabel(requirement),
    awaitingReview,
  }
}

export function buildReminderGroupKey(item = {}, channel = REMINDER_CHANNELS.inApp) {
  return [
    item.requirement?.context_type || '',
    item.requirement?.context_id || '',
    item.recipientRole || '',
    item.recipientContactId || '',
    item.recipientEmail || '',
    item.packKey || '',
    item.affectedGate || '',
    item.reminderType || '',
    channel,
  ].map(normalizeKey).join('::')
}

export function groupReminderCandidates(candidates = [], { channel = REMINDER_CHANNELS.inApp } = {}) {
  const groups = new Map()
  for (const candidate of candidates.filter((item) => item.eligible)) {
    const groupKey = buildReminderGroupKey(candidate, channel)
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        groupKey,
        contextType: candidate.requirement.context_type,
        contextId: candidate.requirement.context_id,
        recipientRole: candidate.recipientRole,
        recipientContactId: candidate.recipientContactId || null,
        recipientEmail: candidate.recipientEmail || null,
        reminderType: candidate.reminderType,
        channel,
        packKey: candidate.packKey,
        packName: candidate.packName,
        affectedGate: candidate.affectedGate || '',
        urgency: candidate.urgency,
        items: [],
      })
    }
    const group = groups.get(groupKey)
    group.items.push(candidate)
    if (candidate.urgency === 'critical' || (candidate.urgency === 'high' && group.urgency !== 'critical')) {
      group.urgency = candidate.urgency
    }
  }
  return Array.from(groups.values()).sort((left, right) => {
    const urgencyOrder = { critical: 0, high: 1, normal: 2, low: 3 }
    return (urgencyOrder[left.urgency] ?? 9) - (urgencyOrder[right.urgency] ?? 9) ||
      left.packName.localeCompare(right.packName)
  })
}

function getExistingReminderForGroup(group = {}, existingReminders = []) {
  return existingReminders.find((reminder) => {
    const metadata = reminder.metadata_json || reminder.metadata || {}
    return metadata.group_key === group.groupKey &&
      ![REMINDER_STATUSES.completed, REMINDER_STATUSES.cancelled, REMINDER_STATUSES.failed].includes(normalizeKey(reminder.status))
  }) || null
}

function isReminderPaused(reminder = {}, now = new Date()) {
  const pausedUntil = normalizeText(reminder.paused_until || reminder.pausedUntil)
  if (!pausedUntil) return false
  const date = new Date(pausedUntil)
  const current = now instanceof Date ? now : new Date(now)
  return !Number.isNaN(date.getTime()) && !Number.isNaN(current.getTime()) && date.getTime() > current.getTime()
}

function wasRemindedRecently(reminder = {}, now = new Date(), cooldownHours = REMINDER_CADENCE.recentReminderCooldownHours) {
  const last = reminder.last_reminded_at || reminder.lastRemindedAt
  if (!last) return false
  return hoursBetween(last, now) < cooldownHours
}

export function getNextReminderAt({ reminderCount = 0, reminderType = REMINDER_TYPES.missingRequiredDocuments, now = new Date() } = {}) {
  const count = Number(reminderCount || 0)
  if (count <= 0) return addBusinessDays(now, REMINDER_CADENCE.initialBusinessDays)
  if (count === 1) return addBusinessDays(now, REMINDER_CADENCE.firstReminderBusinessDays)
  if (count === 2) return addBusinessDays(now, REMINDER_CADENCE.secondReminderBusinessDays)
  return addBusinessDays(now, REMINDER_TYPE_CONFIG[reminderType]?.cadenceBusinessDays || REMINDER_CADENCE.escalationBusinessDays)
}

export function buildReminderPlan({
  requirements = [],
  existingReminders = [],
  context = {},
  contactsByRole = {},
  channel = REMINDER_CHANNELS.inApp,
  includeRecommended = false,
  now = new Date(),
} = {}) {
  const gateReadiness = evaluateAllGateReadinessFromRequirements(requirements, { now })
  const evaluations = requirements.map((requirement) => evaluateReminderEligibility(requirement, {
    context,
    contactsByRole,
    includeRecommended,
    gateReadiness,
    now,
  }))
  const suppressed = evaluations.filter((item) => !item.eligible)
  const groups = groupReminderCandidates(evaluations, { channel })
  const scheduled = []
  const suppressedGroups = []

  for (const group of groups) {
    const existing = getExistingReminderForGroup(group, existingReminders)
    if (existing && shouldCompleteExistingReminder(group)) {
      suppressedGroups.push({ ...group, suppressedReason: 'stop_condition_met', existingReminder: existing })
      continue
    }
    if (existing && isReminderPaused(existing, now)) {
      suppressedGroups.push({ ...group, suppressedReason: 'reminder_paused', existingReminder: existing })
      continue
    }
    if (existing && wasRemindedRecently(existing, now)) {
      suppressedGroups.push({ ...group, suppressedReason: 'recently_reminded', existingReminder: existing })
      continue
    }

    const reminderCount = Number(existing?.reminder_count || 0)
    const escalationDue = reminderCount >= 3
    scheduled.push({
      ...group,
      existingReminder: existing || null,
      reminderCount,
      escalationDue,
      nextReminderAt: getNextReminderAt({ reminderCount: reminderCount + 1, reminderType: group.reminderType, now }),
      template: renderReminderMessage(group, { context }),
    })
  }

  return {
    gateReadiness,
    evaluations,
    eligible: evaluations.filter((item) => item.eligible),
    suppressed,
    groups,
    scheduled,
    suppressedGroups,
  }
}

export function shouldCompleteExistingReminder(group = {}) {
  if (!group.items?.length) return true
  return group.items.every((item) => shouldStopReminderForRequirement(item.requirement, group.reminderType))
}

function interpolate(template = '', variables = {}) {
  return normalizeText(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => normalizeText(variables[key]) || '')
}

export function renderReminderMessage(group = {}, { context = {}, customNote = '' } = {}) {
  const template = MESSAGE_TEMPLATE_DEFINITIONS[group.reminderType] || MESSAGE_TEMPLATE_DEFINITIONS.missing_required_documents
  const gateName = group.affectedGate ? getGateDefinition(group.affectedGate).displayLabel : 'the next workflow gate'
  const labels = (group.items || []).map((item) => item.documentLabel).filter(Boolean)
  const variables = {
    recipient_name: group.recipientName || group.recipientRole || 'there',
    transaction_reference: context.transaction_reference || context.reference || context.title || context.property_address || 'this transaction',
    property_address: context.property_address || context.address || '',
    pack_name: group.packName || group.packKey || 'Documents',
    missing_documents: labels.join(', ') || 'Documents',
    rejected_documents: labels.join(', ') || 'Documents',
    gate_name: gateName,
    upload_link: context.upload_link || '',
    due_date: context.due_date || '',
    requester_name: context.requester_name || 'Arch9',
    reason: group.items?.[0]?.requirement?.rejection_reason || '',
  }
  return {
    title: interpolate(template.title, variables),
    body: [interpolate(template.body, variables), normalizeText(customNote)].filter(Boolean).join(' '),
    variables,
  }
}

function buildReminderPayload(group = {}, { status = REMINDER_STATUSES.scheduled, now = new Date(), customNote = '' } = {}) {
  const first = group.items?.[0]?.requirement || {}
  const template = group.template || renderReminderMessage(group, { customNote })
  return {
    requirement_instance_id: first.id || null,
    context_type: group.contextType,
    context_id: group.contextId,
    recipient_role: group.recipientRole || null,
    recipient_contact_id: group.recipientContactId || null,
    recipient_email: group.recipientEmail || null,
    reminder_type: group.reminderType,
    channel: group.channel || REMINDER_CHANNELS.inApp,
    status,
    reminder_count: Number(group.reminderCount || 0) + (status === REMINDER_STATUSES.sent ? 1 : 0),
    last_reminded_at: status === REMINDER_STATUSES.sent ? now.toISOString() : null,
    next_reminder_at: group.nextReminderAt || getNextReminderAt({ reminderCount: group.reminderCount || 0, reminderType: group.reminderType, now }),
    escalation_count: group.escalationDue ? 1 : 0,
    metadata_json: {
      source_system: CANONICAL_REMINDER_SOURCE,
      group_key: group.groupKey,
      pack_key: group.packKey,
      pack_name: group.packName,
      affected_gate: group.affectedGate || null,
      urgency: group.urgency,
      requirement_instance_ids: (group.items || []).map((item) => item.requirement.id).filter(Boolean),
      title: template.title,
      body: template.body,
    },
  }
}

function buildReminderItems(reminderId, group = {}) {
  return (group.items || [])
    .map((item) => item.requirement.id)
    .filter(Boolean)
    .map((id) => ({
      reminder_id: reminderId,
      requirement_instance_id: id,
    }))
}

async function insertReminderEvents(client, group = {}, eventType, {
  reminderId = null,
  actorRole = 'system',
  actorUserId = null,
  metadata = {},
} = {}) {
  const rows = (group.items || [])
    .map((item) => item.requirement)
    .filter((requirement) => requirement?.id)
    .map((requirement) => ({
      requirement_instance_id: requirement.id,
      event_type: eventType,
      actor_role: actorRole,
      actor_user_id: normalizeUuid(actorUserId),
      message: group.template?.title || null,
      metadata_json: {
        source_system: CANONICAL_REMINDER_SOURCE,
        reminder_id: reminderId,
        reminder_type: group.reminderType,
        channel: group.channel,
        group_key: group.groupKey,
        affected_gate: group.affectedGate || null,
        urgency: group.urgency,
        ...metadata,
      },
    }))
  if (!rows.length) return { inserted: 0 }
  const result = await client.from('document_requirement_events').insert(rows)
  if (result.error) throw result.error
  return { inserted: rows.length }
}

export function buildDocumentRequestProjection(group = {}, requirementCandidate = {}) {
  const requirement = requirementCandidate.requirement || requirementCandidate || {}
  return {
    transaction_id: requirement.transaction_id || (requirement.context_type === 'transaction' ? requirement.context_id : null),
    category: requirement.pack_key || group.packKey || null,
    document_type: requirement.document_definition_key || null,
    title: getRequirementLabel(requirement),
    description: group.template?.body || getDefinition(requirement).description || null,
    priority: requirement.requirement_level === REQUIREMENT_LEVELS.blocker ? 'required' : 'important',
    assigned_to_role: group.recipientRole || requirement.requested_from_role || null,
    status: 'requested',
    requires_review: Boolean(getDefinition(requirement).review_required),
    canonical_requirement_instance_id: requirement.id || null,
  }
}

async function syncReminderToDocumentRequests(client, group = {}) {
  const transactionId = group.items?.find((item) => item.requirement.transaction_id || item.requirement.context_type === 'transaction')?.requirement?.transaction_id ||
    (group.contextType === 'transaction' ? group.contextId : null)
  if (!transactionId) return { skipped: true, reason: 'transaction_id_missing' }

  const ids = group.items.map((item) => item.requirement.id).filter(Boolean)
  if (!ids.length) return { skipped: true, reason: 'requirement_ids_missing' }
  const existing = await client
    .from('document_requests')
    .select('*')
    .eq('transaction_id', transactionId)
    .in('canonical_requirement_instance_id', ids)
  if (existing.error) return { skipped: true, reason: existing.error.message || 'document_requests_unavailable' }
  const existingByCanonicalId = new Map((existing.data || []).map((row) => [row.canonical_requirement_instance_id, row]))
  const rows = group.items.map((item) => {
    const projection = buildDocumentRequestProjection({ ...group, contextId: transactionId }, item)
    const previous = existingByCanonicalId.get(item.requirement.id)
    return {
      ...projection,
      id: previous?.id,
      status: previous && ['uploaded', 'reviewed', 'completed'].includes(normalizeKey(previous.status)) ? previous.status : projection.status,
    }
  })
  const write = await client.from('document_requests').upsert(rows, { onConflict: 'id' }).select('*')
  if (write.error) return { skipped: true, reason: write.error.message || 'document_requests_write_failed' }
  return { skipped: false, synced: write.data?.length || 0, rows: write.data || [] }
}

export async function scheduleReminderGroup(group = {}, {
  client = supabase,
  actorRole = 'system',
  actorUserId = null,
  status = REMINDER_STATUSES.scheduled,
  syncDocumentRequests = true,
  customNote = '',
} = {}) {
  const db = requireClient(client)
  const now = new Date()
  const payload = buildReminderPayload({ ...group, template: group.template || renderReminderMessage(group, { customNote }) }, { status, now, customNote })
  const reminderWrite = await db
    .from('document_requirement_reminders')
    .insert(payload)
    .select('*')
    .maybeSingle()
  if (reminderWrite.error) throw reminderWrite.error
  const reminder = reminderWrite.data || payload
  const items = buildReminderItems(reminder.id, group)
  if (items.length && reminder.id) {
    const itemWrite = await db.from('document_requirement_reminder_items').insert(items)
    if (itemWrite.error) throw itemWrite.error
  }
  const eventType = status === REMINDER_STATUSES.sent ? REMINDER_EVENT_TYPES.sent : REMINDER_EVENT_TYPES.scheduled
  await insertReminderEvents(db, group, eventType, {
    reminderId: reminder.id || null,
    actorRole,
    actorUserId,
  })
  const requestSync = syncDocumentRequests ? await syncReminderToDocumentRequests(db, group) : { skipped: true }
  return { reminder, items, requestSync }
}

export async function sendReminderThroughChannel(reminder = {}, {
  channel = reminder.channel || REMINDER_CHANNELS.inApp,
  client = supabase,
  force = false,
  emailEnabled = false,
  whatsappEnabled = false,
} = {}) {
  const db = requireClient(client)
  const normalizedChannel = normalizeKey(channel)
  const externalBlocked = (normalizedChannel === REMINDER_CHANNELS.email && !areCanonicalEmailRemindersEnabled({ emailEnabled })) ||
    (normalizedChannel === REMINDER_CHANNELS.whatsapp && !areCanonicalWhatsappRemindersEnabled({ whatsappEnabled }))
  if (externalBlocked && !force) {
    const update = await db
      .from('document_requirement_reminders')
      .update({
        status: REMINDER_STATUSES.suppressed,
        suppressed_reason: `${normalizedChannel}_reminders_disabled`,
      })
      .eq('id', reminder.id)
      .select('*')
      .maybeSingle()
    if (update.error) throw update.error
    return {
      sent: false,
      suppressed: true,
      reason: `${normalizedChannel}_reminders_disabled`,
      reminder: update.data || reminder,
    }
  }

  const update = await db
    .from('document_requirement_reminders')
    .update({
      status: REMINDER_STATUSES.sent,
      reminder_count: Number(reminder.reminder_count || 0) + 1,
      last_reminded_at: new Date().toISOString(),
      next_reminder_at: getNextReminderAt({
        reminderCount: Number(reminder.reminder_count || 0) + 1,
        reminderType: reminder.reminder_type,
      }),
    })
    .eq('id', reminder.id)
    .select('*')
    .maybeSingle()
  if (update.error) throw update.error
  return {
    sent: true,
    channel: normalizedChannel,
    reminder: update.data || reminder,
  }
}

export async function loadReminderInputsForContext(client, { contextType, contextId } = {}) {
  const [requirements, reminders] = await Promise.all([
    client
      .from('document_requirement_instances')
      .select('*, document_definitions(*), document_packs(*)')
      .eq('context_type', contextType)
      .eq('context_id', contextId),
    client
      .from('document_requirement_reminders')
      .select('*, document_requirement_reminder_items(*)')
      .eq('context_type', contextType)
      .eq('context_id', contextId)
      .in('status', [REMINDER_STATUSES.pending, REMINDER_STATUSES.scheduled, REMINDER_STATUSES.sent, REMINDER_STATUSES.paused]),
  ])
  if (requirements.error) throw requirements.error
  if (reminders.error) throw reminders.error
  return {
    requirements: requirements.data || [],
    reminders: reminders.data || [],
  }
}

export async function generateCanonicalReminderPlan({
  contextType,
  contextId,
  context = {},
  contactsByRole = {},
  channel = REMINDER_CHANNELS.inApp,
  includeRecommended = false,
  client = supabase,
  force = false,
} = {}) {
  if (!areCanonicalDocumentRemindersEnabled({ force })) {
    return { skipped: true, reason: 'canonical_document_reminders_disabled', scheduled: [], suppressed: [] }
  }
  const db = requireClient(client)
  const inputs = await loadReminderInputsForContext(db, { contextType, contextId })
  return buildReminderPlan({
    requirements: inputs.requirements,
    existingReminders: inputs.reminders,
    context,
    contactsByRole,
    channel,
    includeRecommended,
  })
}

export async function scheduleCanonicalRemindersForContext({
  contextType,
  contextId,
  context = {},
  contactsByRole = {},
  channel = REMINDER_CHANNELS.inApp,
  includeRecommended = false,
  client = supabase,
  force = false,
  actorRole = 'system',
  actorUserId = null,
} = {}) {
  const plan = await generateCanonicalReminderPlan({
    contextType,
    contextId,
    context,
    contactsByRole,
    channel,
    includeRecommended,
    client,
    force,
  })
  if (plan.skipped) return plan
  const scheduled = []
  for (const group of plan.scheduled) {
    scheduled.push(await scheduleReminderGroup(group, {
      client,
      actorRole,
      actorUserId,
      status: REMINDER_STATUSES.scheduled,
    }))
  }
  return {
    ...plan,
    scheduledReminders: scheduled,
  }
}

export async function sendManualDocumentReminder({
  requirementInstances = [],
  context = {},
  contactsByRole = {},
  channel = REMINDER_CHANNELS.manual,
  customNote = '',
  actorRole = 'agent',
  actorUserId = null,
  client = supabase,
  force = true,
} = {}) {
  if (!areCanonicalDocumentRemindersEnabled({ force })) {
    return { skipped: true, reason: 'canonical_document_reminders_disabled' }
  }
  const plan = buildReminderPlan({
    requirements: requirementInstances,
    existingReminders: [],
    context,
    contactsByRole,
    channel,
    includeRecommended: true,
  })
  const sent = []
  for (const group of plan.groups) {
    const template = renderReminderMessage(group, { context, customNote })
    const result = await scheduleReminderGroup({ ...group, template }, {
      client,
      actorRole,
      actorUserId,
      status: REMINDER_STATUSES.sent,
      customNote,
    })
    await insertReminderEvents(requireClient(client), group, REMINDER_EVENT_TYPES.manualFollowUpSent, {
      reminderId: result.reminder?.id || null,
      actorRole,
      actorUserId,
      metadata: { custom_note: customNote || null },
    })
    sent.push(result)
  }
  return { plan, sent }
}

export function buildEscalationCandidate(group = {}, { escalationsEnabled = false } = {}) {
  const reminderCount = Number(group.reminderCount || group.existingReminder?.reminder_count || 0)
  const canEscalate = Boolean(escalationsEnabled || areCanonicalEscalationsEnabled()) && (group.escalationDue || reminderCount >= 3 || group.urgency === 'critical')
  if (!canEscalate) return { escalates: false, reason: 'escalations_disabled_or_not_due' }
  let escalationRole = 'agent'
  if (group.recipientRole === 'buyer') escalationRole = 'bond_originator'
  if (['transferring_attorney', 'bond_attorney', 'cancellation_attorney'].includes(group.recipientRole)) escalationRole = 'agency_admin'
  return {
    escalates: true,
    escalationRole,
    reminderType: group.reminderType,
    affectedGate: group.affectedGate,
    requirementIds: group.items.map((item) => item.requirement.id).filter(Boolean),
  }
}

export function buildReminderAuditReport({
  requirements = [],
  reminders = [],
  contactsByRole = {},
  now = new Date(),
} = {}) {
  const plan = buildReminderPlan({ requirements, existingReminders: reminders, contactsByRole, now })
  return {
    overdueDocumentRequirements: plan.eligible
      .filter((item) => CHASE_STATUSES.has(normalizeKey(item.requirement.status)))
      .map((item) => item.requirement.id),
    openRemindersByRecipient: reminders.reduce((acc, reminder) => {
      const key = normalizeText(reminder.recipient_email || reminder.recipient_role || 'unknown')
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {}),
    suppressedReminders: [...plan.suppressed, ...plan.suppressedGroups],
    repeatedEscalationCandidates: plan.scheduled
      .filter((group) => Number(group.reminderCount || 0) >= 3 || group.urgency === 'critical')
      .map((group) => group.groupKey),
    requirementsWithNoResponsibleRecipient: plan.suppressed
      .filter((item) => item.suppressedReason === 'recipient_contact_missing' || item.suppressedReason === 'recipient_role_missing')
      .map((item) => item.requirement.id),
    staleReviews: plan.eligible
      .filter((item) => item.reminderType === REMINDER_TYPES.documentsAwaitingReview)
      .map((item) => item.requirement.id),
    remindersBlockedByMissingContactDetails: plan.suppressed
      .filter((item) => item.suppressedReason === 'recipient_contact_missing')
      .map((item) => item.requirement.id),
  }
}
