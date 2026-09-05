import { getRentalLeadNextAction } from './rentalLeadPipelineModel.js'

const text = (value) => String(value ?? '').trim()
const normalise = (value) => text(value).toLowerCase()

export const RENTAL_LEAD_FOLLOW_UP_VERSION = 'arch9_rental_lead_follow_up_v1'
export const RENTAL_LEAD_FOLLOW_UP_PRIORITIES = Object.freeze(['Low', 'Medium', 'High'])

export function buildRentalLeadFollowUpDraft(lead = {}) {
  const nextAction = getRentalLeadNextAction(lead.stage, lead.role) || 'Follow up'
  return {
    leadId: text(lead.id),
    title: nextAction,
    description: `${lead.role === 'landlord' ? 'Landlord' : 'Tenant'} lead: ${text(lead.name) || 'Unnamed lead'}.`,
    dueDate: '',
    priority: 'Medium',
  }
}

export function validateRentalLeadFollowUp(values = {}) {
  const errors = []
  if (!text(values.leadId)) errors.push('Choose a rental lead.')
  if (!text(values.title)) errors.push('Follow-up title is required.')
  if (!text(values.dueDate)) errors.push('A due date is required.')
  else if (Number.isNaN(new Date(values.dueDate).getTime())) errors.push('Due date must be valid.')
  if (!RENTAL_LEAD_FOLLOW_UP_PRIORITIES.includes(text(values.priority) || 'Medium')) errors.push('Choose a supported priority.')
  return errors
}

export function getRentalLeadFollowUpState(task = {}, now = new Date()) {
  const status = normalise(task.status)
  if (['completed', 'cancelled'].includes(status)) return 'completed'
  const due = task.dueDate ? new Date(task.dueDate) : null
  if (due && !Number.isNaN(due.getTime()) && due.getTime() < now.getTime()) return 'overdue'
  return 'open'
}

export function sortRentalLeadFollowUps(tasks = [], now = new Date()) {
  return [...(Array.isArray(tasks) ? tasks : [])].sort((left, right) => {
    const stateWeight = { overdue: 0, open: 1, completed: 2 }
    const stateDifference = stateWeight[getRentalLeadFollowUpState(left, now)] - stateWeight[getRentalLeadFollowUpState(right, now)]
    if (stateDifference) return stateDifference
    return String(left.dueDate || '9999-12-31').localeCompare(String(right.dueDate || '9999-12-31'))
  })
}
