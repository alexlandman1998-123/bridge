import { normalizeResidentialOfferStageKey, RESIDENTIAL_OFFER_STAGE_KEYS } from '../core/offers/residentialOfferLifecycle.js'
import { buildSellerReadinessSummary } from './sellerReadinessService.js'
import { isSellerLead } from './sellerJourneyService.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function readContactValue(lead = {}, contact = {}, keys = []) {
  for (const key of keys) {
    const value = normalizeText(lead?.[key] || contact?.[key])
    if (value) return value
  }
  return ''
}

function taskIsOpen(task = {}) {
  const status = normalizeLower(task?.status)
  return !['completed', 'cancelled', 'canceled', 'done'].includes(status)
}

function parseTaskDueMs(task = {}) {
  const value = normalizeText(task?.dueDate || task?.due_date || task?.dueAt || task?.due_at)
  if (!value) return Number.POSITIVE_INFINITY
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const parsed = new Date(isDateOnly ? `${value}T23:59:59.999` : value)
  const time = parsed.getTime()
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY
}

function parseAppointmentStartMs(appointment = {}) {
  const value = normalizeText(
    appointment?.dateTime ||
      appointment?.date_time ||
      appointment?.startDateTime ||
      appointment?.start_date_time,
  )
  if (value) {
    const parsed = new Date(value)
    const time = parsed.getTime()
    if (Number.isFinite(time)) return time
  }

  const date = normalizeText(appointment?.date || appointment?.appointmentDate || appointment?.appointment_date)
  const start = normalizeText(appointment?.startTime || appointment?.start_time).slice(0, 5)
  if (!date) return Number.POSITIVE_INFINITY
  const parsed = new Date(`${date}T${start || '00:00'}`)
  const time = parsed.getTime()
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY
}

function appointmentIsUpcoming(appointment = {}, nowMs = Date.now()) {
  const status = normalizeLower(appointment?.status)
  if (['completed', 'cancelled', 'canceled', 'no_show', 'no-show'].includes(status)) return false
  return parseAppointmentStartMs(appointment) >= nowMs
}

function formatAppointmentDate(appointment = {}) {
  const startMs = parseAppointmentStartMs(appointment)
  if (!Number.isFinite(startMs)) return ''
  return new Date(startMs).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })
}

function getAppointmentLabel(appointment = {}) {
  return normalizeText(
    appointment?.title ||
      appointment?.appointmentTypeLabel ||
      appointment?.appointment_type_label ||
      appointment?.appointmentType ||
      appointment?.appointment_type,
  ) || 'appointment'
}

function getStageAction(lead = {}) {
  const rawStage = normalizeText(lead?.stage || lead?.status)
  const stageKey = normalizeResidentialOfferStageKey(rawStage, '')
  if (stageKey === RESIDENTIAL_OFFER_STAGE_KEYS.viewingCompleted) return 'Send Offer + Onboarding link'
  if (stageKey === RESIDENTIAL_OFFER_STAGE_KEYS.offerOnboardingLinkSent) return 'Wait for buyer to submit Offer + Onboarding'
  if (stageKey === RESIDENTIAL_OFFER_STAGE_KEYS.offerSubmitted) return 'Review buyer conditions before OTP generation'
  if (stageKey === RESIDENTIAL_OFFER_STAGE_KEYS.agentReviewRequired) return 'Approve or rewrite buyer conditions'
  if (stageKey === RESIDENTIAL_OFFER_STAGE_KEYS.readyToGenerateOtp) return 'Generate OTP'
  if (stageKey === RESIDENTIAL_OFFER_STAGE_KEYS.otpGenerated) return 'Send OTP for buyer signature'
  if (stageKey === RESIDENTIAL_OFFER_STAGE_KEYS.buyerSigned) return 'Complete agent/principal signature'
  if (stageKey === RESIDENTIAL_OFFER_STAGE_KEYS.agentSigned) return 'Send signed OTP to seller'
  if (stageKey === RESIDENTIAL_OFFER_STAGE_KEYS.sentToSeller) return 'Follow up seller signature'
  if (stageKey === RESIDENTIAL_OFFER_STAGE_KEYS.signedByAllParties) return 'Convert signed OTP to transaction'
  const stage = normalizeLower(rawStage)
  if (stage.includes('offer')) return 'Review buyer conditions before OTP generation'
  if (stage.includes('appointment') || stage.includes('viewing')) return 'Follow up after viewing'
  if (stage.includes('contacted') || stage.includes('qualified') || stage.includes('follow-up')) return 'Schedule viewing'
  if (stage.includes('lost')) return 'Archived'
  return 'Call lead'
}

function getSellerStageAction(lead = {}, appointments = [], options = {}) {
  if (!isSellerLead(lead)) return ''
  const summary = buildSellerReadinessSummary({
    lead,
    contact: options?.contact || lead?.contact || {},
    appointments,
    listing: options?.listing || options?.linkedListing || lead?.listing || null,
    mandatePacket: options?.mandatePacket || null,
    mandatePacketStatus: options?.mandatePacketStatus || lead?.mandatePacketStatus || lead?.mandate_packet_status || null,
    documents: Array.isArray(options?.documents) ? options.documents : [],
    journey: options?.journey || null,
  })
  return normalizeText(summary?.nextAction?.label || summary?.kpis?.find((item) => item?.key === 'next_action')?.value)
}

export function resolveLeadNextStep(lead = {}, tasks = [], appointments = [], options = {}) {
  const nowMs = options?.now ? new Date(options.now).getTime() : Date.now()
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now()
  const contact = options?.contact && typeof options.contact === 'object' ? options.contact : lead?.contact || {}
  const openTasks = (Array.isArray(tasks) ? tasks : [])
    .filter(taskIsOpen)
    .sort((a, b) => parseTaskDueMs(a) - parseTaskDueMs(b))
  const overdueTask = openTasks.find((task) => parseTaskDueMs(task) < safeNowMs)
  if (overdueTask) return `Overdue task: ${normalizeText(overdueTask.title) || 'Follow up lead'}`

  const upcomingAppointment = (Array.isArray(appointments) ? appointments : [])
    .filter((appointment) => appointmentIsUpcoming(appointment, safeNowMs))
    .sort((a, b) => parseAppointmentStartMs(a) - parseAppointmentStartMs(b))[0]
  if (upcomingAppointment) {
    const date = formatAppointmentDate(upcomingAppointment)
    return `Upcoming appointment: ${getAppointmentLabel(upcomingAppointment)}${date ? ` on ${date}` : ''}`
  }

  const phone = readContactValue(lead, contact, ['phone', 'mobile', 'phoneNumber', 'phone_number'])
  const email = readContactValue(lead, contact, ['email', 'emailAddress', 'email_address'])
  if (!phone && !email) return 'Add phone or email before outreach'

  const nextTask = openTasks[0]
  if (nextTask?.title) return `Next task: ${normalizeText(nextTask.title)}`

  const sellerAction = getSellerStageAction(lead, appointments, { ...options, contact })
  if (sellerAction) return sellerAction

  return getStageAction(lead)
}
