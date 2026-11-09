import { isKnownRentalLeadStage } from './rentalLeadPipelineModel.js'

export const TENANT_JOURNEY = [
  'Captured',
  'Contacted',
  'Qualified',
  'Viewing',
  'Application pending',
  'Application submitted',
  'Lease',
  'Tenancy',
]
export function tenantJourneyStage(lead = {}, conversions = [], applications = []) {
  if (
    conversions.some(
      (item) =>
        ['active', 'notice_given', 'move_out_pending', 'closed'].includes(
          item.status,
        ),
    )
  )
    return 7
  if (conversions.some((item) => Array.isArray(item.rental_leases) ? item.rental_leases.length : Boolean(item.rental_leases?.id))) return 6
  if (
    [
      'application_submitted',
      'screening_pending',
      'fica_pending',
      'fica_complete',
      'placement_ready',
    ].includes(lead.stage)
  )
    return 5
  if (applications.some((item) => ['submitted', 'under_review', 'approved', 'declined'].includes(item.status))) return 5
  if (lead.stage === 'application_pending' || applications.some((item) => item.data?.onboarding?.sentAt)) return 4
  if (['viewing_scheduled', 'viewing_completed'].includes(lead.stage)) return 3
  return { new: 0, contacted: 1, qualified: 2 }[lead.stage] ?? 0
}
// Journey evidence is a read-only projection. Never replace the saved stage
// used by the guarded milestone commands with this display stage.
export function projectRentalLeadJourney(lead = {}, { applications = [], conversions = [] } = {}) {
  if (lead.role !== 'tenant' || lead.workflowIssue || !isKnownRentalLeadStage(lead.savedStage || lead.stage, lead.role)) return lead
  const journey = tenantJourneyStage(lead, conversions, applications)
  let stage = lead.stage
  if (journey === 7) stage = 'tenancy'
  else if (journey === 6) stage = 'lease'
  else if (journey === 5 && !['application_submitted', 'screening_pending', 'fica_pending', 'fica_complete', 'placement_ready'].includes(stage)) stage = 'application_submitted'
  else if (journey === 4) stage = 'application_pending'
  if (stage === lead.stage) return lead
  return { ...lead, journeyStage: stage, journeyStageLabel: { application_pending: 'Application pending', application_submitted: 'Application submitted', lease: 'Lease', tenancy: 'Tenancy' }[stage], journeyAhead: true }
}

export const rentalLeadDisplayStage = lead => lead.journeyStage || lead.stage
export const rentalLeadDisplayStageLabel = lead => lead.journeyStageLabel || lead.stageLabel
