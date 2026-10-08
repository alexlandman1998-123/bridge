export const joiningEntryPoints = {
  recruitment: 'Recruitment', agents: 'Agents', branch: 'Branch staff', settings_users: 'Settings users',
  agency_setup: 'Agency setup', commercial_brokers: 'Commercial brokers', website: 'Website',
  public_link: 'Public application link', private_link: 'Private application invitation', legacy: 'Existing record',
}
export const joiningRoles = [['agent', 'Agent'], ['senior_agent', 'Senior agent'], ['commercial_broker', 'Commercial broker']]
export const joiningBusinessAreas = [['sales', 'Sales'], ['rentals', 'Rentals'], ['short_term_rentals', 'Short-term rentals'], ['commercial', 'Commercial']]
export const emptyJoiningPlan = (entryPoint = 'recruitment') => ({
  version: 'recruitment-joining-v1', origin: { entryPoint }, branchId: '', role: 'agent',
  businessWorkspaces: [], commissionStructureId: '', startDate: '',
})
export function joiningPlanFor(lead = {}) {
  const saved = lead.joining_json || {}
  return { ...emptyJoiningPlan(lead.id ? 'legacy' : 'recruitment'), ...saved }
}
export function joiningPlanError(plan) {
  if (plan === undefined) return ''
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return 'Reload the joining record before saving.'
  if (Object.keys(plan).length === 0) return ''
  if (plan.version !== 'recruitment-joining-v1') return 'Reload the joining record before saving.'
  if (!joiningRoles.some(([id]) => id === plan.role)) return 'Choose an agent joining role.'
  if (!Array.isArray(plan.businessWorkspaces) || new Set(plan.businessWorkspaces).size !== plan.businessWorkspaces.length || plan.businessWorkspaces.some((id) => !joiningBusinessAreas.some(([key]) => key === id))) return 'Choose valid business areas.'
  if (!Object.hasOwn(joiningEntryPoints, plan.origin?.entryPoint || '')) return 'Choose a valid recruitment entry point.'
  for (const key of ['branchId', 'commissionStructureId']) {
    if (typeof plan[key] !== 'string' || (plan[key] && !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(plan[key]))) return 'Choose a valid branch and commission structure.'
  }
  if (typeof plan.startDate !== 'string' || (plan.startDate && (!/^\d{4}-\d{2}-\d{2}$/.test(plan.startDate) || Number.isNaN(Date.parse(`${plan.startDate}T12:00:00Z`)) || new Date(`${plan.startDate}T12:00:00Z`).toISOString().slice(0, 10) !== plan.startDate))) return 'Choose a valid joining date.'
  return ''
}
