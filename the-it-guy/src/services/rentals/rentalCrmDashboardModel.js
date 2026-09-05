import { getRentalLeadFollowUpState } from './rentalLeadFollowUpModel.js'
import { buildRentalPipelineSummary, resolveRentalLeadRole } from './rentalLeadPipelineModel.js'

export const RENTAL_CRM_DASHBOARD_VERSION = 'arch9_rental_crm_dashboard_v1'

const leadStage = (lead = {}) => String(lead.stage || lead.rentalStage || 'new').trim().toLowerCase()

function countAtStage(leads, role, stage) {
  return leads.filter((lead) => resolveRentalLeadRole(lead.role || lead.rentalLeadRole) === role && leadStage(lead) === stage).length
}

export function buildRentalCrmDashboard({ leads = [], tasks = [], now = new Date() } = {}) {
  const visibleLeads = Array.isArray(leads) ? leads : []
  const visibleTasks = Array.isArray(tasks) ? tasks : []
  const landlordLeads = visibleLeads.filter((lead) => resolveRentalLeadRole(lead.role || lead.rentalLeadRole) === 'landlord')
  const tenantLeads = visibleLeads.filter((lead) => resolveRentalLeadRole(lead.role || lead.rentalLeadRole) === 'tenant')
  const followUps = visibleTasks.reduce((counts, task) => {
    counts[getRentalLeadFollowUpState(task, now)] += 1
    return counts
  }, { overdue: 0, open: 0, completed: 0 })

  return {
    version: RENTAL_CRM_DASHBOARD_VERSION,
    leads: {
      total: visibleLeads.length,
      landlords: landlordLeads.length,
      tenants: tenantLeads.length,
      listingReady: countAtStage(visibleLeads, 'landlord', 'listing_ready'),
      placementReady: countAtStage(visibleLeads, 'tenant', 'placement_ready'),
      applicationsSubmitted: countAtStage(visibleLeads, 'tenant', 'application_submitted'),
      ficaPending: countAtStage(visibleLeads, 'tenant', 'fica_pending'),
      mandatesPending: countAtStage(visibleLeads, 'landlord', 'mandate_pending'),
    },
    followUps,
    pipelines: {
      landlords: buildRentalPipelineSummary(landlordLeads, 'landlord'),
      tenants: buildRentalPipelineSummary(tenantLeads, 'tenant'),
    },
    attention: [
      ...(followUps.overdue ? [{ key: 'overdue_follow_ups', count: followUps.overdue, label: 'overdue follow-up' }] : []),
      ...(countAtStage(visibleLeads, 'landlord', 'mandate_pending') ? [{ key: 'mandates_pending', count: countAtStage(visibleLeads, 'landlord', 'mandate_pending'), label: 'landlord mandate pending' }] : []),
      ...(countAtStage(visibleLeads, 'tenant', 'fica_pending') ? [{ key: 'fica_pending', count: countAtStage(visibleLeads, 'tenant', 'fica_pending'), label: 'tenant FICA pending' }] : []),
    ],
  }
}
