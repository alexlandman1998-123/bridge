import { getAppointmentTypeTemplate } from '../services/appointmentTemplateService'
import { APPOINTMENT_TYPE_TEMPLATES } from './appointmentTypeTemplates'

const TEMPLATE_KEYS = Object.keys(APPOINTMENT_TYPE_TEMPLATES)

function normalizeKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s-]+/g, '_')
}

export function normalizeAppointmentTypeKey(value = '') {
  return getAppointmentTypeTemplate(value).type
}

function mapTemplateToLegacyDefinition(template = {}) {
  return {
    type: template.type,
    title: template.label,
    description: template.description,
    defaultDuration: Number(template.defaultDurationMinutes || 45),
    defaultBufferMinutes: Number(template.defaultBufferMinutes || 15),
    requiredParticipants: Array.isArray(template.requiredParticipantRoles) ? template.requiredParticipantRoles : [],
    clientVisible: String(template.defaultVisibility || '').toLowerCase() === 'client_visible',
    linkedWorkflow: template.linkedWorkflow || null,
    linkedStage: template.linkedWorkflowStage || null,
    completionBehavior: (Array.isArray(template.completionEffects) ? template.completionEffects[0] : '') || 'record_outcome',
    requiredDocuments: Array.isArray(template.requiredBeforeAppointment)
      ? template.requiredBeforeAppointment.map((entry) => (typeof entry === 'string' ? entry : entry?.key)).filter(Boolean)
      : [],
    instructions: template.clientInstructions || template.internalInstructions || template.description || '',
  }
}

export function getAppointmentTypeDefinition(value = '') {
  const template = getAppointmentTypeTemplate(value)
  return mapTemplateToLegacyDefinition(template)
}

export function getAppointmentTypeLabel(value = '') {
  return getAppointmentTypeTemplate(value).label
}

export function getAppointmentTypeOptions() {
  return TEMPLATE_KEYS.map((key) => {
    const template = getAppointmentTypeTemplate(key)
    return {
      value: template.type,
      label: template.label,
      description: template.description,
      defaultDurationMinutes: Number(template.defaultDurationMinutes || 45),
      requiredParticipantRoles: Array.isArray(template.requiredParticipantRoles) ? template.requiredParticipantRoles : [],
      defaultVisibility: template.defaultVisibility || 'shared_role_players',
      linkedWorkflow: template.linkedWorkflow || null,
      linkedWorkflowStage: template.linkedWorkflowStage || null,
      requiredBeforeAppointment: Array.isArray(template.requiredBeforeAppointment) ? template.requiredBeforeAppointment : [],
      clientInstructions: template.clientInstructions || '',
      reminderRules: Array.isArray(template.reminderRules) ? template.reminderRules : [],
    }
  })
}

export function getAppointmentVisibilityDefault(value = '') {
  return getAppointmentTypeTemplate(value).defaultVisibility || 'shared_role_players'
}

export function getAppointmentCompletionBehavior(value = '') {
  const template = getAppointmentTypeTemplate(value)
  return (Array.isArray(template.completionEffects) ? template.completionEffects[0] : '') || 'record_outcome'
}

export const APPOINTMENT_TYPE_DEFINITIONS = TEMPLATE_KEYS.reduce((accumulator, key) => {
  const template = getAppointmentTypeTemplate(key)
  const legacy = mapTemplateToLegacyDefinition(template)
  accumulator[normalizeKey(key)] = legacy
  return accumulator
}, {})
