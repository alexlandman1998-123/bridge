import { getAppointmentTypeTemplate } from '../services/appointmentTemplateService.js'
import { APPOINTMENT_TYPE_TEMPLATES } from './appointmentTypeTemplates.js'
import { normalizeWorkspaceType } from '../constants/workspaceTypes.js'

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

const WORKSPACE_APPOINTMENT_TYPES = {
  agency: ['viewing', 'seller_consultation', 'seller_valuation', 'valuation_presentation', 'buyer_consultation', 'mandate_signing', 'otp_signing', 'handover', 'internal_meeting', 'client_meeting', 'other'],
  developer_company: ['viewing', 'buyer_consultation', 'otp_signing', 'handover', 'snag_inspection', 'internal_meeting', 'client_meeting', 'other'],
  attorney_firm: ['otp_signing', 'transfer_signing', 'bond_signing', 'attorney_consultation', 'internal_meeting', 'client_meeting', 'other'],
  bond_originator: ['finance_consultation', 'bond_signing', 'internal_meeting', 'client_meeting', 'other'],
}

export function getAppointmentTypeOptions(workspaceType) {
  const allowed = workspaceType ? WORKSPACE_APPOINTMENT_TYPES[normalizeWorkspaceType(workspaceType, 'agency')] : null
  return TEMPLATE_KEYS.filter(key => !allowed || allowed.includes(key)).map((key) => {
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
