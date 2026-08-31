export const RENTAL_LEAD_PIPELINE_VERSION = 'arch9_rental_lead_pipeline_v1'
export const RENTAL_LEAD_PIPELINE_STAGES = Object.freeze(['new', 'contacted', 'viewing', 'application'])

const nextStages = Object.freeze({
  new: ['contacted'],
  contacted: ['viewing'],
  viewing: ['application', 'contacted'],
  application: [],
})

const labels = Object.freeze({
  new: 'New',
  contacted: 'Contacted',
  viewing: 'Viewing',
  application: 'Application',
})

function text(value) { return String(value ?? '').trim().toLowerCase() }
function normaliseStage(value) {
  const stage = text(value).replace(/[\s-]+/g, '_')
  return RENTAL_LEAD_PIPELINE_STAGES.includes(stage) ? stage : 'new'
}

export function resolveRentalLeadRole(value) {
  return ['landlord', 'owner', 'lessor'].includes(text(value)) ? 'landlord' : 'tenant'
}

export function getRentalLeadStageLabel(stage = '') { return labels[normaliseStage(stage)] }

export function getNextRentalLeadStage(lead = {}) {
  const stage = normaliseStage(lead.stage || lead.rentalStage || lead.raw?.stage)
  return nextStages[stage][0] || ''
}

export function getRentalLeadNextAction(stage = '', role = 'tenant') {
  const actions = resolveRentalLeadRole(role) === 'landlord'
    ? { new: 'Contact landlord', contacted: 'Arrange appraisal', viewing: 'Confirm rental mandate', application: 'Create rental listing' }
    : { new: 'Contact tenant', contacted: 'Schedule viewing', viewing: 'Record viewing outcome', application: 'Review application' }
  return actions[normaliseStage(stage)]
}

export function canTransitionRentalLead(from = '', to = '') {
  return nextStages[normaliseStage(from)]?.includes(normaliseStage(to)) === true
}

export function transitionRentalLead(lead = {}, to = '') {
  const fromStage = normaliseStage(lead.stage)
  const nextStage = normaliseStage(to)
  if (!canTransitionRentalLead(fromStage, nextStage)) throw new Error(`Rental lead cannot move from ${lead.stage || 'unknown'} to ${to || 'unknown'}.`)
  const role = resolveRentalLeadRole(lead.role || lead.rentalLeadRole)
  return { ...lead, role, stage: nextStage, nextAction: getRentalLeadNextAction(nextStage, role) }
}

export function buildRentalPipelineSummary(leads = [], role) {
  const resolvedRole = role ? resolveRentalLeadRole(role) : ''
  const filteredLeads = (Array.isArray(leads) ? leads : []).filter((lead) => !resolvedRole || resolveRentalLeadRole(lead.role || lead.rentalLeadRole) === resolvedRole)
  return RENTAL_LEAD_PIPELINE_STAGES.map((stage) => ({
    stage,
    label: getRentalLeadStageLabel(stage),
    count: filteredLeads.filter((lead) => normaliseStage(lead.stage || lead.rentalStage) === stage).length,
  }))
}
