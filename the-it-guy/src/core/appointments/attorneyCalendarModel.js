export const CALENDAR_TIMEZONE = 'Africa/Johannesburg'
const OFFSET = 2 * 60 * 60 * 1000
const DAY = 24 * 60 * 60 * 1000

// Stored clock/date fields are SAST. Prefer the saved instant, never a clock
// value as a timestamp, and give older rows the same timezone interpretation.
export function appointmentStartIso(row = {}) {
  let raw = row.dateTime || row.date_time || row.scheduledAt || row.scheduled_at || ''
  const clock = row.startTime || row.start_time || ''
  const date = row.appointmentDate || row.appointment_date || row.date || ''
  if (!raw && /^\d{4}-\d{2}-\d{2}T/.test(clock)) raw = clock
  if (!raw && /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}/.test(clock)) raw = `${date}T${clock}`
  if (!/^\d{4}-\d{2}-\d{2}T/.test(raw)) return null
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) raw += '+02:00'
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export function appointmentEndIso(row = {}) {
  const start = appointmentStartIso(row)
  if (!start) return null
  const end = row.endTime || row.end_time || ''
  if (/^\d{4}-\d{2}-\d{2}T/.test(end)) return appointmentStartIso({ dateTime: end })
  if (/^\d{2}:\d{2}/.test(end)) return appointmentStartIso({ date: row.appointmentDate || row.appointment_date || row.date || sastDateKey(start), startTime: end })
  return new Date(Date.parse(start) + (Number(row.durationMinutes || row.duration_minutes) || 45) * 60000).toISOString()
}

export function sastParts(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const shifted = new Date(date.getTime() + OFFSET)
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate(), weekday: shifted.getUTCDay(), hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() }
}
export function sastDateKey(value) {
  const parts = sastParts(value)
  return parts ? `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}` : ''
}
export function sameSastDay(left, right) {
  const key = sastDateKey(left)
  return Boolean(key) && key === sastDateKey(right)
}
export function sastDayStart(value) {
  const key = sastDateKey(value)
  return key ? new Date(`${key}T00:00:00+02:00`) : new Date(NaN)
}
export function addCalendarDays(value, days) { return new Date(new Date(value).getTime() + days * DAY) }
export function sastWeekStart(value) {
  const start = sastDayStart(value)
  const weekday = sastParts(start)?.weekday
  return addCalendarDays(start, weekday === 0 ? -6 : 1 - weekday)
}
export function sastMonthStart(value) {
  const parts = sastParts(value)
  return parts ? new Date(Date.UTC(parts.year, parts.month, 1) - OFFSET) : new Date(NaN)
}
export function shiftCalendarMonth(value, count) {
  const parts = sastParts(value)
  if (!parts) return new Date(NaN)
  const target = new Date(Date.UTC(parts.year, parts.month + count, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(parts.day, lastDay)) - OFFSET)
}
export function appointmentMatchesCalendarRange(row, range, selectedDate) {
  const date = new Date(row.dateTime || '')
  if (Number.isNaN(date.getTime())) return range === 'all'
  if (range === 'today') return sameSastDay(date, selectedDate)
  if (range === 'week') {
    const start = sastWeekStart(selectedDate)
    return date >= start && date < addCalendarDays(start, 7)
  }
  if (range === 'month') return sastDateKey(date).slice(0, 7) === sastDateKey(selectedDate).slice(0, 7)
  return true
}
export function appointmentDurationMinutes(row = {}) {
  const start = new Date(appointmentStartIso(row) || '')
  const end = new Date(appointmentEndIso(row) || '')
  const duration = (end - start) / 60000
  return Number.isFinite(duration) && duration > 0 ? duration : 45
}
export function calendarOperationalStatus(row = {}) {
  const status = String(row.status || '').trim().toLowerCase()
  if (status.includes('cancel')) return 'cancelled'
  if (status.includes('complete')) return 'completed'
  if (status.includes('declin')) return 'declined'
  if (status.replace(/[-\s]+/g, '_') === 'no_show') return 'no_show'
  if (status.includes('block')) return 'blocked'
  if (status.includes('reschedule') || status.startsWith('alternative_')) return 'reschedule_requested'
  if (status.includes('pending') || status.includes('proposed') || status.includes('requested')) return 'awaiting_confirmation'
  if (status.includes('confirm')) return 'confirmed'
  return 'awaiting_confirmation'
}
export const isClosedAppointment = row => ['cancelled', 'completed', 'declined', 'no_show'].includes(calendarOperationalStatus(row))

// Put simultaneous appointments in separate columns within each overlap group.
export function layoutCalendarDay(rows) {
  const events = rows.map(row => ({row,start:Date.parse(row.dateTime),end:Date.parse(row.dateTime) + appointmentDurationMinutes(row) * 60000}))
    .filter(event => Number.isFinite(event.start)).sort((a,b)=>a.start-b.start || a.end-b.end)
  const groups=[]
  for (const event of events) {
    let group=groups.at(-1)
    if (!group || event.start >= group.end) { group={end:event.end,events:[],lanes:[]};groups.push(group) }
    let lane=group.lanes.findIndex(end=>end<=event.start)
    if (lane<0) lane=group.lanes.length
    group.lanes[lane]=event.end
    group.end=Math.max(group.end,event.end)
    group.events.push({...event,lane})
  }
  return new Map(groups.flatMap(group=>group.events.map(event=>[event.row.id,{lane:event.lane,count:group.lanes.length}])))
}
