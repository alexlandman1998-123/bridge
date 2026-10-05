export const emptyActivationDraft = () => ({notes:'',confirmed:false})
export function recruitmentActivationErrors(lead,draft) {
  const errors=[]
  if (!lead.id || lead.status!=='onboarding_complete' || !lead.onboarding_completed_at || !lead.onboarding_snapshot?.version || lead.activated_at) errors.push('Complete onboarding before activating the agent.')
  if (typeof lead.email!=='string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email.trim()) || lead.email.length>254) errors.push('Save a valid agent email in Agent Details before preparing access.')
  if (lead.activation_json?.email && lead.email.trim().toLowerCase()!==lead.activation_json.email) errors.push('The agent email changed after access was prepared. Restore the recorded email before continuing.')
  if (typeof draft.notes!=='string' || draft.notes.trim().length<5 || draft.notes.length>3000) errors.push('Record activation findings (5–3,000 characters).')
  if (draft.confirmed!==true) errors.push('Confirm the agent identity, onboarding and organisation access.')
  return errors
}
