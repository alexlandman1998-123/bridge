import { getRentalLeadFollowUpState } from './rentalLeadFollowUpModel.js'

export const RENTAL_LEAD_SERVICE_LEVEL_VERSION = 'arch9_rental_lead_service_level_v1'
export const RENTAL_LEAD_SERVICE_LEVEL_WARNING_HOURS = 24

const text = (value) => String(value ?? '').trim()
const validDate = (value) => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

export function getRentalLeadServiceLevelState(task = {}, now = new Date(), warningHours = RENTAL_LEAD_SERVICE_LEVEL_WARNING_HOURS) {
  const followUpState = getRentalLeadFollowUpState(task, now)
  if (followUpState === 'completed') return 'completed'
  if (followUpState === 'overdue') return 'overdue'
  const due = validDate(task.dueDate)
  if (due && due.getTime() <= now.getTime() + warningHours * 60 * 60 * 1000) return 'at_risk'
  return 'on_track'
}

export function buildRentalLeadServiceLevelQueue(tasks = [], now = new Date(), warningHours = RENTAL_LEAD_SERVICE_LEVEL_WARNING_HOURS) {
  const rows = (Array.isArray(tasks) ? tasks : []).map((task) => ({
    ...task,
    serviceLevelState: getRentalLeadServiceLevelState(task, now, warningHours),
  }))
  const order = { overdue: 0, at_risk: 1, on_track: 2, completed: 3 }
  rows.sort((left, right) => {
    const stateDifference = order[left.serviceLevelState] - order[right.serviceLevelState]
    if (stateDifference) return stateDifference
    return String(left.dueDate || '9999-12-31').localeCompare(String(right.dueDate || '9999-12-31'))
  })
  return rows
}

export function buildRentalLeadServiceLevelSummary(tasks = [], now = new Date(), warningHours = RENTAL_LEAD_SERVICE_LEVEL_WARNING_HOURS) {
  const queue = buildRentalLeadServiceLevelQueue(tasks, now, warningHours)
  const counts = queue.reduce((result, task) => {
    result[task.serviceLevelState] += 1
    return result
  }, { overdue: 0, at_risk: 0, on_track: 0, completed: 0 })
  return { version: RENTAL_LEAD_SERVICE_LEVEL_VERSION, warningHours, counts, queue }
}

export function getRentalLeadServiceLevelOwner(task = {}) {
  return text(task.assignedAgentName || task.assignedAgent?.name || task.lead?.assignedAgentName) || 'Unassigned'
}
