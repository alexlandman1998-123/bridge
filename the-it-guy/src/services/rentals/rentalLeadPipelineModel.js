export const RENTAL_LEAD_PIPELINE_VERSION = 'arch9_rental_lead_pipeline_v2'

export const RENTAL_LANDLORD_PIPELINE_STAGES = Object.freeze([
  'new', 'contacted', 'appraisal_scheduled', 'appraisal_completed', 'mandate_pending', 'mandate_signed', 'listing_ready',
])

export const RENTAL_TENANT_PIPELINE_STAGES = Object.freeze([
  'new', 'contacted', 'qualified', 'viewing_scheduled', 'viewing_completed', 'application_pending', 'application_submitted', 'screening_pending', 'fica_pending', 'fica_complete', 'placement_ready',
])

// Retained as a flattened export for callers that need to inspect every valid
// rental workflow state. Use getRentalLeadPipelineStages(role) for UI columns.
export const RENTAL_LEAD_PIPELINE_STAGES = Object.freeze([...new Set([
  ...RENTAL_LANDLORD_PIPELINE_STAGES,
  ...RENTAL_TENANT_PIPELINE_STAGES,
])])

const labels = Object.freeze({
  new: 'New', contacted: 'Contacted', qualified: 'Qualified',
  appraisal_scheduled: 'Appraisal scheduled', appraisal_completed: 'Appraisal completed',
  mandate_pending: 'Mandate pending', mandate_signed: 'Mandate signed', listing_ready: 'Listing ready',
  viewing_scheduled: 'Viewing scheduled', viewing_completed: 'Viewing completed',
  application_pending: 'Application pending', application_submitted: 'Application submitted',
  screening_pending: 'Screening pending', fica_pending: 'FICA pending', fica_complete: 'FICA complete',
  placement_ready: 'Placement ready',
})

const nextAction = Object.freeze({
  landlord: {
    new: 'Contact landlord', contacted: 'Schedule appraisal', appraisal_scheduled: 'Complete appraisal',
    appraisal_completed: 'Prepare mandate', mandate_pending: 'Secure signed mandate',
    mandate_signed: 'Prepare listing', listing_ready: 'Create rental listing',
  },
  tenant: {
    new: 'Contact tenant', contacted: 'Complete qualification', qualified: 'Schedule viewing',
    viewing_scheduled: 'Record viewing outcome', viewing_completed: 'Invite application',
    application_pending: 'Collect application', application_submitted: 'Start screening',
    screening_pending: 'Complete screening', fica_pending: 'Collect FICA documents',
    fica_complete: 'Confirm placement readiness', placement_ready: 'Open placement workspace',
  },
})

function text(value) { return String(value ?? '').trim().toLowerCase() }

export function resolveRentalLeadRole(value) {
  return ['landlord', 'owner', 'lessor'].includes(text(value)) ? 'landlord' : 'tenant'
}

export function getRentalLeadPipelineStages(role = 'tenant') {
  return resolveRentalLeadRole(role) === 'landlord' ? RENTAL_LANDLORD_PIPELINE_STAGES : RENTAL_TENANT_PIPELINE_STAGES
}

function normaliseKey(value) { return text(value).replace(/[\s-]+/g, '_') }

// Version 1 had generic viewing/application stages. Existing records retain a
// sensible next step when read, but every newly written transition uses v2.
function migrateLegacyStage(stage, role) {
  const key = normaliseKey(stage)
  if (key === 'viewing') return role === 'landlord' ? 'appraisal_scheduled' : 'viewing_scheduled'
  if (key === 'application') return role === 'landlord' ? 'mandate_pending' : 'application_pending'
  return key
}

export function normaliseRentalLeadStage(value = '', role = 'tenant') {
  const resolvedRole = resolveRentalLeadRole(role)
  const stage = migrateLegacyStage(value, resolvedRole)
  return getRentalLeadPipelineStages(resolvedRole).includes(stage) ? stage : 'new'
}

export function getRentalLeadStageLabel(stage = '', role = 'tenant') {
  return labels[normaliseRentalLeadStage(stage, role)]
}

export function getNextRentalLeadStage(lead = {}) {
  const role = resolveRentalLeadRole(lead.role || lead.rentalLeadRole)
  const stages = getRentalLeadPipelineStages(role)
  const stage = normaliseRentalLeadStage(lead.stage || lead.rentalStage || lead.raw?.stage, role)
  return stages[stages.indexOf(stage) + 1] || ''
}

export function getRentalLeadNextAction(stage = '', role = 'tenant') {
  const resolvedRole = resolveRentalLeadRole(role)
  return nextAction[resolvedRole][normaliseRentalLeadStage(stage, resolvedRole)]
}

export function canTransitionRentalLead(from = '', to = '', role = 'tenant') {
  const resolvedRole = resolveRentalLeadRole(role)
  const stages = getRentalLeadPipelineStages(resolvedRole)
  const current = normaliseRentalLeadStage(from, resolvedRole)
  return stages[stages.indexOf(current) + 1] === normaliseRentalLeadStage(to, resolvedRole)
}

export function transitionRentalLead(lead = {}, to = '') {
  const role = resolveRentalLeadRole(lead.role || lead.rentalLeadRole)
  const fromStage = normaliseRentalLeadStage(lead.stage || lead.rentalStage, role)
  const nextStage = normaliseRentalLeadStage(to, role)
  if (!canTransitionRentalLead(fromStage, nextStage, role)) throw new Error(`Rental ${role} lead cannot move from ${getRentalLeadStageLabel(fromStage, role)} to ${to || 'unknown'}.`)
  return { ...lead, role, stage: nextStage, nextAction: getRentalLeadNextAction(nextStage, role) }
}

export function buildRentalPipelineSummary(leads = [], role = 'tenant') {
  const resolvedRole = resolveRentalLeadRole(role)
  const filteredLeads = (Array.isArray(leads) ? leads : []).filter((lead) => resolveRentalLeadRole(lead.role || lead.rentalLeadRole) === resolvedRole)
  return getRentalLeadPipelineStages(resolvedRole).map((stage) => ({
    stage,
    label: getRentalLeadStageLabel(stage, resolvedRole),
    count: filteredLeads.filter((lead) => normaliseRentalLeadStage(lead.stage || lead.rentalStage, resolvedRole) === stage).length,
  }))
}
