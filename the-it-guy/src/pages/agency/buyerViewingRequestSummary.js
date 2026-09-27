function text(value) {
  return String(value ?? '').trim()
}

function time(value) {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : 0
}

function viewingTimes(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).slice(0, 3)
  return text(value).split(/\r?\n|;|\u2022/).map(text).filter(Boolean).slice(0, 3)
}

const BOOKED_APPOINTMENT_STATUSES = new Set(['scheduled', 'confirmed', 'accepted', 'completed', 'booked'])

export function buildBuyerViewingRequestSummary({
  plan = {},
  links = [],
  latestResponse = null,
  appointments = [],
  loading = false,
  error = '',
  now = new Date().toISOString(),
} = {}) {
  const latestLink = [...(Array.isArray(links) ? links : [])]
    .sort((left, right) => time(right?.createdAt) - time(left?.createdAt))[0] || null
  const linkStatus = text(latestLink?.status).toLowerCase()
  const delivered = text(plan.buyerEmailDeliveryStatus).toLowerCase()
  // The request timestamp is taken just before link creation. An older plan
  // must not make a newly created, unsent link look delivered.
  const currentRequestSent = time(plan.requestedAt) > 0 && (
    !time(latestLink?.createdAt) || time(plan.requestedAt) >= time(latestLink.createdAt) - 300000
  )
  const requestedAt = text(currentRequestSent ? plan.requestedAt : latestLink?.lastSentAt || latestLink?.createdAt)
  const submittedAt = text(latestResponse?.submittedAt || plan.respondedAt)
  const hasBookedAppointment = (Array.isArray(appointments) ? appointments : [])
    .some((appointment) => BOOKED_APPOINTMENT_STATUSES.has(text(appointment?.status).toLowerCase()))
  const latestBookedAt = Math.max(time(plan.bookedAt), ...(Array.isArray(appointments) ? appointments : [])
    .filter((appointment) => BOOKED_APPOINTMENT_STATUSES.has(text(appointment?.status).toLowerCase()))
    .map((appointment) => time(appointment?.createdAt || appointment?.created_at)))
  const newerRequest = latestBookedAt > 0 && Math.max(time(plan.requestedAt), time(latestLink?.createdAt)) > latestBookedAt
  const latestResponseId = text(latestResponse?.id)
  const latestLinkId = text(latestLink?.id)
  const responseIsLatest = Boolean(latestResponseId && (!latestLinkId || latestLinkId === latestResponseId))
  const hasEarlierResponse = Boolean(latestResponseId && latestLinkId && latestResponseId !== latestLinkId)
  const expired = ['expired', 'revoked'].includes(linkStatus) || (
    linkStatus === 'pending' && time(latestLink?.expiresAt) > 0 && time(latestLink.expiresAt) <= time(now)
  )
  let status = 'not_requested'
  if (!newerRequest && (hasBookedAppointment || text(plan.bookedAt))) {
    status = 'booked'
  } else if (responseIsLatest || (!latestLink && submittedAt && text(plan.availabilityWindows))) {
    status = 'submitted'
  } else if (delivered === 'failed') {
    status = 'delivery_failed'
  } else if (delivered === 'suppressed') {
    status = 'delivery_suppressed'
  } else if (expired) {
    status = 'expired'
  } else if (currentRequestSent && delivered !== 'failed') {
    status = 'awaiting_response'
  } else if (linkStatus === 'pending') {
    status = 'requested'
  }
  const labels = {
    not_requested: ['Not requested', 'No viewing times requested yet'],
    requested: ['Requested', 'Viewing link prepared'],
    awaiting_response: ['Awaiting response', 'Waiting for the buyer’s viewing times'],
    submitted: ['Submitted', 'Buyer submitted viewing times'],
    booked: ['Booked', 'Viewing booked'],
    delivery_failed: ['Delivery failed', 'Viewing request could not be sent'],
    delivery_suppressed: ['Delivery suppressed', 'Viewing request was not delivered'],
    expired: ['Link expired', 'Viewing request needs a new link'],
  }
  const responseTimes = viewingTimes(latestResponse?.availabilityWindows)
  const legacyTimes = !latestResponseId && status === 'submitted' ? viewingTimes(plan.availabilityWindows) : []

  return {
    status,
    badge: labels[status][0],
    title: labels[status][1],
    requestedAt,
    submittedAt,
    bookedAt: text(plan.bookedAt),
    proposedTimes: responseTimes.length ? responseTimes : legacyTimes,
    hasEarlierResponse: Boolean(hasEarlierResponse && responseTimes.length),
    error: text(error),
    isLoading: Boolean(loading),
  }
}
