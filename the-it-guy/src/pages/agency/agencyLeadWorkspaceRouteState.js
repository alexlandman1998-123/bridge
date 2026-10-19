import { isRentalCrmLead } from '../../services/rentals/rentalCrmLeadModel.js'

export function normalizeBuyerWorkspaceTab(tab = '') {
  const key = String(tab || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (['offer', 'offers', 'otp', 'onboarding_otp', 'buyer_onboarding_otp'].includes(key)) return 'documents'
  if (['onboarding', 'buyer_onboarding', 'buyer', 'profile', 'buyer_details', 'buyer_detail'].includes(key)) return 'buyer_profile'
  return key
}


export function resolveAgencyLeadWorkspaceTab(search = '') {
  const params = new URLSearchParams(search)
  return normalizeBuyerWorkspaceTab(params.get('tab') || params.get('sellerWorkspace')) || 'overview'
}

export function resolveAgencyLeadWorkspaceRedirect(lead = {}) {
  const id = String(lead.leadId || lead.lead_id || lead.id || '').trim()
  return id && isRentalCrmLead(lead) ? `/agent/rentals/pipeline/leads/${encodeURIComponent(id)}` : ''
}
