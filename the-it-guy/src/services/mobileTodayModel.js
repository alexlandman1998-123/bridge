import { appointmentStartIso, isClosedAppointment, sameSastDay, sastDayStart, addCalendarDays, CALENDAR_TIMEZONE } from '../core/appointments/attorneyCalendarModel.js'

const text = (value) => String(value || '').trim()
const closedTask = (task) => ['completed', 'cancelled', 'canceled'].includes(text(task.status).toLowerCase())

function dueInstant(value) {
  if (!value) return null
  // A date-only follow-up remains due throughout its SAST calendar day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return Date.parse(`${value}T23:59:59+02:00`)
  const iso = appointmentStartIso({ dateTime: value })
  return iso ? Date.parse(iso) : null
}

function dateLabel(value, now, includeTime = true) {
  if (!Number.isFinite(value)) return 'No date set'
  const day = sameSastDay(value, now) ? 'Today' : new Date(value).toLocaleDateString('en-ZA', { timeZone: CALENDAR_TIMEZONE, day: 'numeric', month: 'short' })
  return includeTime ? `${day} · ${new Date(value).toLocaleTimeString('en-ZA', { timeZone: CALENDAR_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false })}` : day
}

export function buildMobileToday({ tasks = [], leads = [], contacts = [], appointments = [], deals = [], profile = {}, category = 'agent', now = new Date(), availability = {} } = {}) {
  const todayEnd = addCalendarDays(sastDayStart(now), 1).getTime()
  const nowTime = new Date(now).getTime()
  const keys = new Set([profile.id, profile.userId, profile.email].map((key) => text(key).toLowerCase()).filter(Boolean))
  const followUps = availability.followUps === false ? [] : tasks.filter((task) => {
    if (closedTask(task)) return false
    return category === 'principal' || [task.assignedAgentId, task.assignedAgentEmail].some((key) => keys.has(text(key).toLowerCase()))
  }).map((task) => {
    const lead = leads.find((item) => text(item.leadId) === text(task.leadId))
    const contact = contacts.find((item) => text(item.contactId) === text(lead?.contactId))
    const due = dueInstant(task.dueDate)
    const overdue = due !== null && due < nowTime
    const dueToday = due !== null && due < todayEnd
    const name = [contact?.firstName, contact?.lastName].filter(Boolean).join(' ')
    return {
      id: `task:${task.taskId || task.id}`, kind: 'followUps', title: text(task.title) || 'Follow-up',
      body: name || text(lead?.propertyAddress || lead?.listingTitle),
      meta: `${overdue ? 'Overdue · ' : ''}${dateLabel(due, now, !/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate || ''))}`,
      status: overdue ? 'Overdue' : text(task.status) || 'Pending', description: text(task.description),
      assignedName: text(task.assignedAgentName), cta: 'View follow-up',
      dueToday, rank: overdue ? 0 : dueToday ? 2 : 6, time: due ?? Infinity,
    }
  }).sort((a, b) => a.rank - b.rank || a.time - b.time)

  const appointmentItems = availability.appointments === false ? [] : appointments.filter((row) => !isClosedAppointment(row)).map((row) => {
    const time = Date.parse(appointmentStartIso(row) || '')
    const today = sameSastDay(time, now)
    const needsReview = row.statusKey !== 'confirmed' || time < nowTime
    const type = text(row.typeLabel) || 'Appointment'
    const transactionId = text(row.transactionId || (row.relatedEntityType === 'transaction' && row.relatedEntityId))
    return {
      id: `appointment:${row.id || row.appointmentId}`, kind: 'appointments',
      title: `${needsReview ? 'Review' : 'Prepare for'} ${type.toLowerCase()}`,
      body: [text(row.clientName), text(row.propertyAddress || row.locationAddress || row.location)].filter(Boolean).join(' · '),
      meta: dateLabel(time, now), status: text(row.statusLabel || row.status),
      description: text(row.notes || row.description), assignedName: text(row.assignedName),
      location: text(row.propertyAddress || row.locationAddress || row.location),
      cta: 'View appointment', to: transactionId ? `/mobile/transaction/${encodeURIComponent(transactionId)}` : '',
      today, rank: today && time <= nowTime + 3600000 ? 1 : today ? 3 : 5, time,
    }
  }).filter((item) => Number.isFinite(item.time) && (item.today || item.time >= nowTime)).sort((a, b) => a.time - b.time)

  const dealItems = availability.deals === false ? [] : deals.filter((deal) => text(deal.nextAction)).map((deal) => ({
    id: `deal:${deal.id}`, kind: 'deals', title: text(deal.nextAction), body: deal.title,
    meta: deal.stage, to: deal.to, cta: 'Open deal', rank: 4, time: Infinity,
  }))
  const queue = [...followUps, ...appointmentItems, ...dealItems].sort((a, b) => a.rank - b.rank || a.time - b.time)
  const available = { appointments: availability.appointments !== false, followUps: availability.followUps !== false, deals: availability.deals !== false }
  return {
    dateLabel: new Date(now).toLocaleDateString('en-ZA', { timeZone: CALENDAR_TIMEZONE, weekday: 'long', day: 'numeric', month: 'long' }),
    counts: {
      appointments: available.appointments ? appointmentItems.filter((item) => item.today).length : null,
      followUps: available.followUps ? followUps.filter((item) => item.dueToday).length : null,
      deals: available.deals ? dealItems.length : null,
    },
    available, items: { appointments: appointmentItems, followUps, deals: dealItems },
    action: queue[0] || null, radar: queue.slice(1, 3),
  }
}
