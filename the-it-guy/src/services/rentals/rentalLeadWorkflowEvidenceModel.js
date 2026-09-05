import { normaliseRentalLeadStage, resolveRentalLeadRole } from './rentalLeadPipelineModel.js'

export const RENTAL_LEAD_WORKFLOW_EVIDENCE_VERSION = 'arch9_rental_lead_workflow_evidence_v1'

const text = (value) => String(value ?? '').trim()
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

const requirements = Object.freeze({
  landlord: Object.freeze({
    appraisal_scheduled: Object.freeze({ title: 'Schedule appraisal', fields: ['scheduledFor'] }),
    appraisal_completed: Object.freeze({ title: 'Record appraisal', fields: ['note'] }),
    mandate_signed: Object.freeze({ title: 'Record signed mandate', fields: ['mandateReference', 'signedAt'] }),
  }),
  tenant: Object.freeze({
    qualified: Object.freeze({ title: 'Record qualification', fields: ['qualificationOutcome'] }),
    viewing_scheduled: Object.freeze({ title: 'Schedule viewing', fields: ['scheduledFor'] }),
    viewing_completed: Object.freeze({ title: 'Record viewing outcome', fields: ['viewingOutcome'] }),
    application_submitted: Object.freeze({ title: 'Record application received', fields: ['applicationReference'] }),
    fica_complete: Object.freeze({ title: 'Record FICA completion', fields: ['ficaReference'] }),
  }),
})

export function getRentalLeadStageEvidenceRequirement(lead = {}, toStage = '') {
  const role = resolveRentalLeadRole(lead.role || lead.rentalLeadRole)
  const stage = normaliseRentalLeadStage(toStage, role)
  const requirement = requirements[role][stage] || { title: '', fields: [] }
  return { role, stage, ...requirement }
}

function normaliseDate(value, label, errors) {
  const raw = text(value)
  if (!raw) { errors.push(`${label} is required.`); return '' }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) { errors.push(`${label} must be a valid date and time.`); return '' }
  return parsed.toISOString()
}

export function buildRentalLeadWorkflowEvidence(lead = {}, toStage = '', values = {}) {
  const requirement = getRentalLeadStageEvidenceRequirement(lead, toStage)
  const source = object(values)
  const errors = []
  const evidence = {
    version: RENTAL_LEAD_WORKFLOW_EVIDENCE_VERSION,
    stage: requirement.stage,
    recordedAt: new Date().toISOString(),
    note: text(source.note),
  }

  if (requirement.fields.includes('scheduledFor')) evidence.scheduledFor = normaliseDate(source.scheduledFor, 'Scheduled time', errors)
  if (requirement.fields.includes('note') && !evidence.note) errors.push('A milestone note is required.')
  if (requirement.fields.includes('qualificationOutcome')) {
    evidence.qualificationOutcome = text(source.qualificationOutcome).toLowerCase()
    if (evidence.qualificationOutcome !== 'qualified') errors.push('Confirm that the tenant is qualified before advancing.')
  }
  if (requirement.fields.includes('viewingOutcome')) {
    evidence.viewingOutcome = text(source.viewingOutcome).toLowerCase()
    if (evidence.viewingOutcome !== 'attended') errors.push('Only an attended viewing can advance this lead. Record another outcome in the viewing workspace.')
  }
  if (requirement.fields.includes('mandateReference')) {
    evidence.mandateReference = text(source.mandateReference)
    if (!evidence.mandateReference) errors.push('Mandate reference is required.')
  }
  if (requirement.fields.includes('signedAt')) evidence.signedAt = normaliseDate(source.signedAt, 'Mandate signed time', errors)
  if (requirement.fields.includes('applicationReference')) {
    evidence.applicationReference = text(source.applicationReference)
    if (!evidence.applicationReference) errors.push('Application reference is required.')
  }
  if (requirement.fields.includes('ficaReference')) {
    evidence.ficaReference = text(source.ficaReference)
    if (!evidence.ficaReference) errors.push('FICA evidence reference is required.')
  }

  if (errors.length) throw new Error(errors.join(' '))
  return evidence
}

export function appendRentalLeadWorkflowEvidence(metadata = {}, evidence = {}) {
  const workflow = object(metadata.workflow)
  const events = Array.isArray(workflow.events) ? workflow.events : []
  const entry = object(evidence)
  return {
    version: RENTAL_LEAD_WORKFLOW_EVIDENCE_VERSION,
    lastEvent: entry,
    events: [...events, entry],
  }
}
