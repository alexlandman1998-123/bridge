import {
  APPOINTMENT_TEMPLATE_ALIASES,
  APPOINTMENT_TYPE_TEMPLATES,
  GENERIC_APPOINTMENT_TEMPLATE,
} from '../lib/appointmentTypeTemplates'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s-]+/g, '_')
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function resolveTemplateKey(value = '') {
  const normalized = normalizeKey(value)
  if (!normalized) return GENERIC_APPOINTMENT_TEMPLATE.type
  if (APPOINTMENT_TYPE_TEMPLATES[normalized]) return normalized
  if (APPOINTMENT_TEMPLATE_ALIASES[normalized]) return APPOINTMENT_TEMPLATE_ALIASES[normalized]
  return GENERIC_APPOINTMENT_TEMPLATE.type
}

function parseTimeToMinutes(value = '') {
  const match = normalizeText(value).match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return (hours * 60) + minutes
}

function minutesToTimeText(total = 0) {
  const safeTotal = Math.max(0, Number(total) || 0)
  const hours = Math.floor((safeTotal % (24 * 60)) / 60)
  const minutes = safeTotal % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function computeEndTimeFromTemplate(startTime = '', durationMinutes = 45) {
  const startMinutes = parseTimeToMinutes(startTime)
  if (!Number.isFinite(startMinutes)) return ''
  const duration = Math.max(15, Number(durationMinutes) || 45)
  return minutesToTimeText(startMinutes + duration)
}

function normalizeRequiredBefore(required = []) {
  return toArray(required).map((item, index) => {
    if (typeof item === 'string') {
      const key = normalizeKey(item) || `required_${index}`
      return { key, label: item, description: '' }
    }
    const key = normalizeKey(item?.key || item?.label || item?.name || `required_${index}`)
    return {
      key: key || `required_${index}`,
      label: normalizeText(item?.label || item?.name || item?.key || `Required ${index + 1}`),
      description: normalizeText(item?.description),
    }
  })
}

function normalizeReminderRules(rules = []) {
  return toArray(rules)
    .map((rule) => ({
      type: normalizeText(rule?.type || 'before_start'),
      offsetMinutes: Number(rule?.offsetMinutes ?? rule?.offset_minutes ?? 0) || 0,
      reminderType: normalizeText(rule?.reminderType || rule?.reminder_type || 'appointment_reminder_due'),
    }))
    .filter((rule) => rule.reminderType)
}

function buildCompletionBehavior(template = GENERIC_APPOINTMENT_TEMPLATE) {
  const first = toArray(template?.completionEffects)[0]
  return normalizeText(first || 'record_outcome')
}

export function getAppointmentTypeTemplate(type) {
  const key = resolveTemplateKey(type)
  const raw = APPOINTMENT_TYPE_TEMPLATES[key] || GENERIC_APPOINTMENT_TEMPLATE
  return {
    ...GENERIC_APPOINTMENT_TEMPLATE,
    ...raw,
    type: key,
    requiredBeforeAppointment: normalizeRequiredBefore(raw?.requiredBeforeAppointment),
    reminderRules: normalizeReminderRules(raw?.reminderRules),
    completionEffects: toArray(raw?.completionEffects),
    requiredParticipantRoles: toArray(raw?.requiredParticipantRoles),
    optionalParticipantRoles: toArray(raw?.optionalParticipantRoles),
    allowedRescheduleRoles: toArray(raw?.allowedRescheduleRoles),
  }
}

export function applyAppointmentTemplate(type, payload = {}) {
  const template = getAppointmentTypeTemplate(type)
  const next = {
    ...payload,
    appointmentType: template.type,
    title: normalizeText(payload?.title) || template.label,
    durationMinutes: Number(payload?.durationMinutes || payload?.duration_minutes || template.defaultDurationMinutes) || template.defaultDurationMinutes,
    visibility: normalizeText(payload?.visibility || payload?.visibility_scope || template.defaultVisibility) || template.defaultVisibility,
    linkedWorkflow: normalizeText(payload?.linkedWorkflow || payload?.linked_workflow || template.linkedWorkflow) || null,
    linkedWorkflowStage: normalizeText(payload?.linkedWorkflowStage || payload?.linked_workflow_stage || template.linkedWorkflowStage) || null,
    completionBehavior: normalizeText(payload?.completionBehavior || payload?.completion_behavior || buildCompletionBehavior(template)) || 'record_outcome',
    workflowCompletionEffect:
      payload?.workflowCompletionEffect && typeof payload.workflowCompletionEffect === 'object'
        ? payload.workflowCompletionEffect
        : { completionEffects: toArray(template.completionEffects) },
    instructions:
      normalizeText(payload?.instructions || payload?.appointmentInstructions || payload?.appointment_instructions)
      || template.clientInstructions
      || template.internalInstructions
      || '',
    internalInstructions:
      normalizeText(payload?.internalInstructions || payload?.internal_instructions)
      || template.internalInstructions
      || '',
    requiredDocuments: (() => {
      const existing = toArray(payload?.requiredDocuments || payload?.required_documents)
      if (existing.length) return existing
      return normalizeRequiredBefore(template.requiredBeforeAppointment)
    })(),
    requiredBeforeAppointment: normalizeRequiredBefore(template.requiredBeforeAppointment),
    reminderRules: normalizeReminderRules(payload?.reminderRules || payload?.reminder_rules || template.reminderRules),
    calendarTitle:
      normalizeText(payload?.calendarTitle || payload?.calendar_title)
      || template.calendarTitle
      || `Bridge: ${template.label}`,
    calendarDescription:
      normalizeText(payload?.calendarDescription || payload?.calendar_description)
      || template.calendarDescription
      || template.clientInstructions
      || template.description,
  }

  const hasStart = normalizeText(next?.startTime || next?.start_time)
  const hasEnd = normalizeText(next?.endTime || next?.end_time)
  if (hasStart && !hasEnd) {
    const computed = computeEndTimeFromTemplate(hasStart, next.durationMinutes || template.defaultDurationMinutes)
    if (computed) {
      next.endTime = computed
    }
  }

  return next
}

export function getAppointmentTemplateInstructions(type, clientRole = 'buyer') {
  const template = getAppointmentTypeTemplate(type)
  const role = normalizeKey(clientRole)
  if (role.includes('internal') || role.includes('agent') || role.includes('attorney') || role.includes('bond')) {
    return normalizeText(template.internalInstructions || template.clientInstructions || template.description)
  }
  return normalizeText(template.clientInstructions || template.description || template.internalInstructions)
}

export function getAppointmentRequiredPrep(type, transactionContext = {}) {
  const template = getAppointmentTypeTemplate(type)
  const required = normalizeRequiredBefore(template.requiredBeforeAppointment)
  const statusByKeyRaw = transactionContext?.requirementStatusByKey && typeof transactionContext.requirementStatusByKey === 'object'
    ? transactionContext.requirementStatusByKey
    : {}

  const statusByKey = Object.entries(statusByKeyRaw).reduce((acc, [key, value]) => {
    acc[normalizeKey(key)] = normalizeText(value).toLowerCase()
    return acc
  }, {})

  const uploadedKeys = new Set(
    toArray(transactionContext?.uploadedRequirementKeys)
      .map((item) => normalizeKey(item))
      .filter(Boolean),
  )

  return required.map((item) => {
    const status = statusByKey[item.key] || (uploadedKeys.has(item.key) ? 'uploaded' : 'required')
    const completed = ['approved', 'completed', 'uploaded', 'under_review'].includes(status)
    return {
      ...item,
      status,
      completed,
    }
  })
}

export function getAppointmentCompletionEffects(type) {
  return toArray(getAppointmentTypeTemplate(type).completionEffects)
}

export function validateAppointmentAgainstTemplate(appointment = {}) {
  const template = getAppointmentTypeTemplate(appointment?.appointmentType || appointment?.appointment_type)
  const participantRoles = new Set(
    toArray(appointment?.participants)
      .map((participant) => normalizeKey(participant?.participantRole || participant?.participant_role))
      .filter(Boolean),
  )

  const missingParticipantRoles = toArray(template.requiredParticipantRoles).filter((role) => {
    const normalizedRole = normalizeKey(role)
    if (!normalizedRole) return false
    if (normalizedRole.includes('_or_')) {
      const candidates = normalizedRole.split('_or_').map((entry) => normalizeKey(entry)).filter(Boolean)
      return !candidates.some((candidate) => participantRoles.has(candidate) || Array.from(participantRoles).some((value) => value.includes(candidate)))
    }
    return !participantRoles.has(normalizedRole) && !Array.from(participantRoles).some((value) => value.includes(normalizedRole))
  })

  const issues = []
  if (!normalizeText(appointment?.date || appointment?.appointment_date)) {
    issues.push('Appointment date is missing.')
  }
  if (!normalizeText(appointment?.startTime || appointment?.start_time || appointment?.dateTime || appointment?.date_time)) {
    issues.push('Appointment start time is missing.')
  }
  if (missingParticipantRoles.length) {
    issues.push(`Missing required participants: ${missingParticipantRoles.join(', ')}`)
  }

  const warnings = []
  if (!normalizeText(appointment?.instructions || appointment?.appointmentInstructions || appointment?.appointment_instructions)) {
    warnings.push('Appointment instructions are empty; template defaults should be applied.')
  }
  if (!normalizeText(appointment?.visibility || appointment?.visibility_scope)) {
    warnings.push('Appointment visibility is missing; template default visibility should be applied.')
  }

  return {
    templateType: template.type,
    isValid: issues.length === 0,
    issues,
    warnings,
    missingParticipantRoles,
  }
}
