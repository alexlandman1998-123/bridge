import { isRentalCrmLead } from '../../services/rentals/rentalCrmLeadModel.js'

export function resolveAgencyLeadWorkspaceTab(search = '') {
  const params = new URLSearchParams(search)
  return String(params.get('tab') || params.get('sellerWorkspace') || '').trim().toLowerCase() || 'overview'
}

export function resolveAgencyLeadWorkspaceRedirect(lead = {}) {
  const id = String(lead.leadId || lead.lead_id || lead.id || '').trim()
  return id && isRentalCrmLead(lead) ? `/agent/rentals/pipeline/leads/${encodeURIComponent(id)}` : ''
}
