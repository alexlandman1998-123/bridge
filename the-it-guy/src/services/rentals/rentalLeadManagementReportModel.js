import { getRentalLeadFollowUpState } from './rentalLeadFollowUpModel.js'

export const RENTAL_LEAD_MANAGEMENT_REPORT_VERSION = 'arch9_rental_lead_management_report_v1'

const text = (value) => String(value ?? '').trim()
const date = (value) => { const parsed = value ? new Date(value) : null; return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null }
const outcomeStatus = (lead) => text(lead.outcome?.status || 'open').toLowerCase()
const owner = (lead = {}) => text(lead.assignedAgentName || lead.raw?.assignedAgentName || lead.raw?.assignedAgentEmail) || 'Unassigned'
const branch = (lead = {}) => text(lead.branchId || lead.raw?.branchId || lead.raw?.branch_id) || 'Unassigned'

function emptyRow(key, label) { return { key, label, leads: 0, active: 0, won: 0, lost: 0, nurture: 0, overdue: 0, openTasks: 0, completedTasks: 0 } }
function addLead(row, lead) { row.leads += 1; const status = outcomeStatus(lead); if (status === 'open') row.active += 1; if (status === 'won') row.won += 1; if (status === 'lost') row.lost += 1; if (status === 'nurture') row.nurture += 1 }
function addTask(row, task, now) { const state = getRentalLeadFollowUpState(task, now); if (state === 'overdue') row.overdue += 1; if (state === 'open') row.openTasks += 1; if (state === 'completed') row.completedTasks += 1 }
function sortRows(rows) { return rows.map((row) => ({ ...row, currentTaskHealth: row.overdue + row.openTasks ? Math.round((row.openTasks / (row.overdue + row.openTasks)) * 100) : null })).sort((left, right) => right.active - left.active || left.label.localeCompare(right.label)) }

export function buildRentalLeadManagementReport({ leads = [], tasks = [], now = new Date() } = {}) {
  const agentRows = new Map(); const branchRows = new Map()
  const get = (map, key) => { if (!map.has(key)) map.set(key, emptyRow(key, key)); return map.get(key) }
  const visibleLeads = Array.isArray(leads) ? leads : []; const visibleTasks = Array.isArray(tasks) ? tasks : []
  visibleLeads.forEach((lead) => { addLead(get(agentRows, owner(lead)), lead); addLead(get(branchRows, branch(lead)), lead) })
  visibleTasks.forEach((task) => { const lead = task.lead || {}; addTask(get(agentRows, owner(lead)), task, now); addTask(get(branchRows, branch(lead)), task, now) })
  const ageing = visibleLeads.filter((lead) => outcomeStatus(lead) === 'open').reduce((counts, lead) => {
    const created = date(lead.createdAt); if (!created) { counts.unknown += 1; return counts }
    const days = Math.max(0, Math.floor((now.getTime() - created.getTime()) / 86400000)); if (days <= 2) counts['0_2'] += 1; else if (days <= 7) counts['3_7'] += 1; else if (days <= 14) counts['8_14'] += 1; else counts['15_plus'] += 1; return counts
  }, { '0_2': 0, '3_7': 0, '8_14': 0, '15_plus': 0, unknown: 0 })
  const totals = emptyRow('total', 'Total'); visibleLeads.forEach((lead) => addLead(totals, lead)); visibleTasks.forEach((task) => addTask(totals, task, now))
  return { version: RENTAL_LEAD_MANAGEMENT_REPORT_VERSION, totals: { ...totals, currentTaskHealth: totals.overdue + totals.openTasks ? Math.round((totals.openTasks / (totals.overdue + totals.openTasks)) * 100) : null }, ageing, agents: sortRows([...agentRows.values()]), branches: sortRows([...branchRows.values()]) }
}
