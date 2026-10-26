const normal = (value) => typeof value === 'string' ? value.trim().toLowerCase().replace(/[_-]+/g, ' ') : ''
const categories = new Set(['buyer', 'seller', 'tenant', 'landlord'])
const stages = new Set(['new', 'new lead', 'captured', 'contacted', 'qualified', 'viewing', 'viewings', 'negotiation', 'offer', 'offer received', 'mandate', 'mandate signed', 'active', 'nurture', 'follow up'])
const finished = new Set(['completed', 'complete', 'done', 'cancelled', 'canceled'])
const date = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null

// Only this small, enumerated summary may enter the model. Source dates and
// record links are assembled separately; no contact or free-form notes are read.
export function crmFollowUpModelFacts(lead, summary) {
  const category = normal(lead.lead_category)
  const stage = normal(lead.stage)
  const area = typeof lead.area_interest === 'string' ? lead.area_interest.trim() : ''
  return {
    category: categories.has(category) ? category : 'property enquiry',
    stage: stages.has(stage) ? stage : 'not classified',
    area: /^[\p{L}][\p{L}\s'’-]{1,79}$/u.test(area) ? area : 'not specified',
    openTaskCount: summary.openTaskCount,
    overdueTaskCount: summary.overdueTaskCount,
    activityCount: summary.activityCount,
  }
}

export function crmFollowUpBrief(lead, tasks, activity, activityCount, now = new Date()) {
  const pending = tasks.filter((task) => !finished.has(normal(task.status)))
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const dueDate = (value) => date(value) ? value.slice(0, 10) : null
  const overdue = pending.filter((task) => dueDate(task.due_date) && dueDate(task.due_date) < today)
  const byDue = [...pending].sort((a, b) => (dueDate(a.due_date) || '9999').localeCompare(dueDate(b.due_date) || '9999') || String(a.task_id).localeCompare(String(b.task_id)))
  const summary = { openTaskCount: pending.length, overdueTaskCount: overdue.length, activityCount }
  return {
    leadId: lead.lead_id,
    updatedAt: lead.updated_at,
    facts: crmFollowUpModelFacts(lead, summary),
    ...summary,
    lastActivityAt: date(activity?.activity_date) || date(activity?.created_at),
    pendingTasks: byDue.slice(0, 5).map((task) => ({ id: task.task_id, dueDate: dueDate(task.due_date), overdue: overdue.includes(task) })),
    nextAction: overdue.length ? 'Review the overdue follow-up tasks before preparing another.' : pending.length ? 'Review the existing follow-up tasks before adding another.' : 'Prepare a follow-up draft, then choose an appropriate date and owner.',
    sourcePath: `/pipeline/leads/${encodeURIComponent(lead.lead_id)}?tab=activity`,
    boundary: 'Saved CRM facts only. Activity is not proof of consent or contact. Check communication permission and your existing conversation before using any outreach.',
  }
}

export function crmFollowUpManualDraft(language = 'en') {
  return language === 'af'
    ? 'Hallo, ek loer graag in oor jou eiendomsplanne. Laat weet gerus as jy vrae het of jou behoeftes verander het. As dit nie meer relevant is nie, laat weet my asseblief.'
    : 'Hello, I wanted to check in on your property plans. Let me know if you have questions or if your needs have changed. If this is no longer relevant, please let me know.'
}
