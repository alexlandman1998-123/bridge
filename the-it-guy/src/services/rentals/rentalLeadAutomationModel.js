import { getRentalLeadFollowUpState } from './rentalLeadFollowUpModel.js'

export const RENTAL_LEAD_AUTOMATION_VERSION = 'arch9_rental_lead_automation_v1'

const text = (value) => String(value ?? '').trim()
const openTaskForLead = (tasks, leadId) => tasks.some((task) => text(task.leadId) === text(leadId) && getRentalLeadFollowUpState(task) !== 'completed')
const dueTomorrow = (now) => new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16)

export function buildRentalLeadAutomationQueue({ leads = [], tasks = [], now = new Date() } = {}) {
  const visibleLeads = Array.isArray(leads) ? leads : []
  const visibleTasks = Array.isArray(tasks) ? tasks : []
  const suggestions = []
  visibleTasks.filter((task) => getRentalLeadFollowUpState(task, now) === 'overdue').forEach((task) => {
    suggestions.push({ key: `overdue:${task.taskId}`, type: 'overdue_follow_up', severity: 'high', leadId: text(task.leadId), task, title: task.title || 'Overdue follow-up', detail: 'Existing follow-up is overdue. Complete or re-plan it in the follow-up queue.', actionable: false })
  })
  visibleLeads.forEach((lead) => {
    if (openTaskForLead(visibleTasks, lead.id)) return
    const stage = text(lead.stage).toLowerCase()
    const rule = stage === 'new'
      ? { type: 'initial_contact', severity: 'high', title: 'Contact new rental lead', detail: 'No open follow-up is currently linked to this new lead.' }
      : stage === 'mandate_pending'
        ? { type: 'mandate_follow_up', severity: 'high', title: 'Secure signed landlord mandate', detail: 'Landlord mandate is pending and has no open follow-up.' }
        : stage === 'fica_pending'
          ? { type: 'fica_follow_up', severity: 'high', title: 'Collect outstanding FICA documents', detail: 'Tenant FICA is pending and has no open follow-up.' }
          : null
    if (rule) suggestions.push({ key: `${rule.type}:${lead.id}`, ...rule, leadId: text(lead.id), lead, actionable: true })
  })
  const severity = { high: 0, medium: 1, low: 2 }
  return suggestions.sort((left, right) => severity[left.severity] - severity[right.severity] || Number(left.type !== 'overdue_follow_up') - Number(right.type !== 'overdue_follow_up') || left.title.localeCompare(right.title))
}

export function buildRentalLeadAutomationFollowUp(suggestion = {}, now = new Date()) {
  if (!suggestion.actionable || !text(suggestion.leadId)) throw new Error('This automation item cannot create a follow-up.')
  return { leadId: text(suggestion.leadId), title: suggestion.title, description: `${suggestion.detail} Created from the rental CRM automation queue.`, dueDate: dueTomorrow(now), priority: suggestion.severity === 'high' ? 'High' : 'Medium' }
}
