import { calculateSplitCosts } from './homeSeekersSplitCalculatorModel'
export const nextStepsStorageKey = 'home-seekers-next-steps-review-v1'
export const nextStepsEvents = ['qualifier_started', 'qualifier_passed', 'qualifier_failed', 'oneonone_booked', 'session_rsvp', 'application_completed', 'calculator_completed', 'calculator_email_submitted']
export const splitOptions = ['50/50', '60/40', '70/30', '80/20', 'cap model', 'desk fee plus a percentage', 'another fixed fee', 'prefer not to say']
export const sessionSalesOptions = ['0 to 4', '5 to 9', '10 to 19', '20+']
export function isNextStepsLocalReview(browser = globalThis.window) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(browser?.location?.hostname)
}
export function qualifierOutcome({ ffc, sales, value }) {
  if (ffc !== 'Yes') return 'C'
  return Number(sales) >= 5 || Number(value) >= 6000000 ? 'A' : 'B'
}
export function nextStepsErrors(data, type = 'qualifier') {
  const errors = {}
  for (const key of ['firstName', 'surname', 'email', 'mobile', 'area']) if (!String(data[key] || '').trim()) errors[key] = 'Please complete this field.'
  for (const key of ['firstName', 'surname', 'area']) if (String(data[key] || '').trim().length > 120) errors[key] = 'Use 120 characters or fewer.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email || '').trim()) || String(data.email || '').length > 254) errors.email = 'Enter a valid email address.'
  if (!/^\+?[\d ()-]+$/.test(String(data.mobile || '')) || !/^\d{9,15}$/.test(String(data.mobile || '').replace(/\D/g, ''))) errors.mobile = 'Enter a valid mobile number, including your dialling code.'
  if (type === 'qualifier') {
    if (!['Yes', 'No', 'Application in progress'].includes(data.ffc)) errors.ffc = 'Select your FFC status.'
    if (!/^\d{1,4}$/.test(String(data.sales ?? ''))) errors.sales = 'Enter a whole number from 0 to 9999.'
    if (!/^\d{1,12}(\.\d{1,2})?$/.test(String(data.value ?? ''))) errors.value = 'Enter a rand amount of zero or more.'
    if (!splitOptions.includes(data.split)) errors.split = 'Select your current arrangement.'
  } else {
    if (!sessionSalesOptions.includes(data.salesBand)) errors.salesBand = 'Select your registered sales range.'
    if (!data.session) errors.session = 'Choose a session.'
    if (String(data.question || '').length > 2000) errors.question = 'Use 2000 characters or fewer.'
  }
  if (!data.consent) errors.consent = 'Please agree so we can contact you about this enquiry.'
  return errors
}
export function formatNextStepDate(value, options = {}) {
  return new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...options }).format(new Date(value)) + ' SAST'
}
const plusDays = (date, days) => new Date(date.getTime() + days * 86400000)
function sastDay(now) { return new Date(new Date(now.getTime() + 7200000).toISOString().slice(0, 10) + 'T00:00:00+02:00') }
export function previewSessions(now = new Date()) {
  const day = sastDay(now)
  // Sample schedule for local review only: Thursday, 18:00 South African time.
  let first = plusDays(day, (4 - new Date(day.getTime() + 7200000).getUTCDay() + 7) % 7)
  first = new Date(first.getTime() + 18 * 3600000)
  if (first <= now) first = plusDays(first, 7)
  return Array.from({ length: 4 }, (_, index) => ({ id: plusDays(first, index * 7).toISOString(), start: plusDays(first, index * 7).toISOString() }))
}
export function previewFounderSlots(week = 0, now = new Date()) {
  const today = sastDay(now), weekday = new Date(today.getTime() + 7200000).getUTCDay()
  const monday = plusDays(today, -((weekday + 6) % 7) + week * 7)
  // Eight sample slots per week, never eight slots per day.
  return [1, 3].flatMap(day => [9, 9.5, 10, 10.5].map(hour => new Date(plusDays(monday, day).getTime() + hour * 3600000)))
    .filter(start => start > now).map(start => ({ id: start.toISOString(), start: start.toISOString() }))
}
export function readNextStepsReview(storage = globalThis.window?.localStorage) {
  const raw = storage?.getItem(nextStepsStorageKey)
  if (!raw) return { records: [], events: [] }
  const data = JSON.parse(raw)
  if (!Array.isArray(data.records) || !Array.isArray(data.events)) throw new Error('Local review records could not be read. Reset the preview records to start again.')
  return data
}
export function saveNextStepsReview(type, details, { id = crypto.randomUUID(), now = new Date(), storage = globalThis.window?.localStorage } = {}) {
  if (!isNextStepsLocalReview()) throw new Error('Bookings are not configured yet. Please try again once bookings open.')
  const state = readNextStepsReview(storage)
  const existing = state.records.find(item => item.id === id)
  if (existing) return existing
  let outcome, event
  if (type === 'qualifier') {
    if (Object.keys(nextStepsErrors(details)).length) throw new Error('Check your answers before continuing.')
    outcome = qualifierOutcome(details); event = outcome === 'A' ? 'qualifier_passed' : 'qualifier_failed'
  } else if (type === 'oneonone') {
    const lead = state.records.find(item => item.id === details.qualifierId && item.type === 'qualifier' && item.outcome === 'A')
    if (!lead) throw new Error('Complete the qualifier before booking a founder call.')
    const validSlots = Array.from({ length: 5 }, (_, week) => previewFounderSlots(week, now)).flat()
    if (!validSlots.some(slot => slot.id === details.start)) throw new Error('This time is no longer available. Choose another slot.')
    if (state.records.some(item => item.type === 'oneonone' && item.details.start === details.start)) throw new Error('That slot has just been taken. Please choose another.')
    if (state.records.some(item => item.type === 'oneonone' && item.details.qualifierId === lead.id)) throw new Error('You already have a preview booking for this enquiry.')
    outcome = 'booked'; event = 'oneonone_booked'
  } else if (type === 'session') {
    if (Object.keys(nextStepsErrors(details, 'session')).length) throw new Error('Check your registration details.')
    if (!previewSessions(now).some(session => session.id === details.session)) throw new Error('That session is no longer available. Please choose another.')
    outcome = 'registered'; event = 'session_rsvp'
  } else if (type === 'calculator') {
    const result = calculateSplitCosts(details.inputs || {})
    if (!result || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email || '') || String(details.email).length > 254) throw new Error('Check your email address and calculator inputs.')
    details = { email: details.email.trim().toLowerCase(), inputs: { ...details.inputs }, result }
    outcome = 'email_preview_saved'; event = 'calculator_email_submitted'
  } else if (type === 'application') { outcome = 'submitted'; event = 'application_completed' }
  else throw new Error('Unknown preview submission.')
  const record = { id, type, source: type === 'calculator' ? 'homeseeker_join_split_calculator' : 'homeseeker_join_next_steps', outcome, createdAt: now.toISOString(), details, preview: true }
  state.records.push(record)
  state.events.push({ event, recordId: id, outcome, at: now.toISOString(), preview: true })
  if (!storage) throw new Error('Local storage is unavailable. Enable it to save review submissions.')
  storage.setItem(nextStepsStorageKey, JSON.stringify(state))
  return record
}
export function recordNextStepsPreviewEvent(event, storage = globalThis.window?.localStorage) {
  if (!isNextStepsLocalReview() || !nextStepsEvents.includes(event)) return
  const state = readNextStepsReview(storage)
  state.events.push({ event, at: new Date().toISOString(), preview: true })
  storage.setItem(nextStepsStorageKey, JSON.stringify(state))
}
export function nextStepsCalendarFile(start, title, id) {
  const stamp = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const safeTitle = title.replace(/[\r\n]/g, ' ').replace(/\\/g, '\\\\').replace(/[,;]/g, '\\$&')
  const content = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Home Seekers//Local Review//EN', 'BEGIN:VEVENT', `UID:${id}@homeseeker.local`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(new Date(start).getTime() + 1800000))}`, `SUMMARY:${safeTitle}`, 'DESCRIPTION:Local preview only. No real meeting has been booked.', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n')
  return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(content)
}
