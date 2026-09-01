const text = (value) => String(value ?? '').trim()
const number = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function dayKey(value, timeZone = 'Africa/Johannesburg') {
  if (!value) return ''
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function addDays(value, days) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function isActiveBooking(booking = {}) {
  return ['confirmed', 'checked_in'].includes(text(booking.status))
}

function overlapsDay(booking, date) {
  const start = new Date(booking.checkInAt)
  const end = new Date(booking.checkOutAt)
  const dayEnd = addDays(date, 1)
  return start < dayEnd && end > date
}

function label(value = '') {
  return text(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function hoursUntil(value, now) {
  return Math.round((new Date(value).getTime() - now.getTime()) / 3_600_000)
}

function buildPropertyPerformance({ unit, bookings, rangeDays, now }) {
  const active = bookings.filter((booking) => booking.unitId === unit.id && isActiveBooking(booking))
  const currentStay = active.find((booking) => new Date(booking.checkInAt) <= now && new Date(booking.checkOutAt) > now) || null
  const nextStay = active.find((booking) => new Date(booking.checkInAt) > now) || null
  const occupiedDays = Array.from({ length: rangeDays }, (_, index) => addDays(now, index))
    .filter((date) => active.some((booking) => overlapsDay(booking, date))).length
  return {
    id: unit.id,
    propertyId: unit.propertyId,
    propertyName: unit.propertyName,
    propertyCoverImageUrl: unit.propertyCoverImageUrl,
    propertyCoverImageAlt: unit.propertyCoverImageAlt,
    unitLabel: unit.unitLabel,
    bedrooms: number(unit.bedrooms),
    bathrooms: number(unit.bathrooms),
    occupancyRate: rangeDays ? Math.round((occupiedDays / rangeDays) * 100) : null,
    currentStay,
    nextStay,
  }
}

/**
 * Converts existing Short-Term entities into a read-only dashboard projection.
 * No financial total is inferred: bookings currently do not persist a value.
 */
export function buildShortTermRentalDashboard({ units = [], bookings = [], turnovers = [], ratePlans = [], now = new Date(), rangeDays = 30, timeZone = 'Africa/Johannesburg' } = {}) {
  const safeRangeDays = Math.max(1, number(rangeDays, 30))
  const today = dayKey(now, timeZone)
  const enabledUnits = units.filter((unit) => unit.isShortTermEnabled)
  const activeBookings = bookings.filter(isActiveBooking)
  const arrivalsToday = activeBookings.filter((booking) => booking.status === 'confirmed' && dayKey(booking.checkInAt, timeZone) === today)
  const departuresToday = activeBookings.filter((booking) => booking.status === 'checked_in' && dayKey(booking.checkOutAt, timeZone) === today)
  const propertyMedia = new Map(enabledUnits.map((unit) => [text(unit.propertyId), {
    propertyCoverImageUrl: text(unit.propertyCoverImageUrl), propertyCoverImageAlt: text(unit.propertyCoverImageAlt),
  }]))
  const withPropertyMedia = (booking) => ({ ...booking, ...(propertyMedia.get(text(booking.propertyId)) || {}) })
  const activeStays = activeBookings.filter((booking) => new Date(booking.checkInAt) <= now && new Date(booking.checkOutAt) > now)
  const guestsInHouse = activeStays.reduce((total, booking) => total + number(booking.adults, 1) + number(booking.children), 0)
  const occupiedNights = enabledUnits.reduce((total, unit) => total + Array.from({ length: safeRangeDays }, (_, index) => addDays(now, index))
    .filter((date) => activeBookings.some((booking) => booking.unitId === unit.id && overlapsDay(booking, date))).length, 0)
  const occupancyRate = enabledUnits.length ? Math.round((occupiedNights / (enabledUnits.length * safeRangeDays)) * 100) : null

  const events = [
    ...turnovers.filter((turnover) => turnover.status !== 'ready' && dayKey(turnover.dueAt, timeZone) === today).map((turnover) => ({
      id: `turnover-${turnover.id}`, kind: 'turnover', at: turnover.dueAt, propertyName: turnover.propertyName, unitLabel: turnover.unitLabel,
      title: 'Turnover', detail: turnover.status === 'in_progress' ? 'Cleaning underway' : 'Turnover queued', status: label(turnover.status), tone: turnover.status === 'in_progress' ? 'blue' : 'amber', href: '/agent/rentals/short-term/turnovers',
    })),
    ...departuresToday.map((booking) => ({
      id: `departure-${booking.id}`, kind: 'departure', at: booking.checkOutAt, propertyName: booking.propertyName, unitLabel: booking.unitLabel,
      title: 'Departure', detail: `${booking.guestName || 'Guest'} · Check-out due`, status: 'Due today', tone: 'slate', href: '/agent/rentals/short-term/bookings',
    })),
    ...arrivalsToday.map((booking) => ({
      id: `arrival-${booking.id}`, kind: 'arrival', at: booking.checkInAt, propertyName: booking.propertyName, unitLabel: booking.unitLabel,
      title: 'Arrival', detail: `${booking.guestName || 'Guest'} · ${number(booking.adults, 1) + number(booking.children)} guests`, status: 'Upcoming', tone: 'green', href: '/agent/rentals/short-term/bookings',
    })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at))

  const activeRateUnitIds = new Set(ratePlans.filter((plan) => text(plan.status) === 'active' && text(plan.effective_from) <= today && (!text(plan.effective_to) || text(plan.effective_to) >= today)).map((plan) => text(plan.unit_id)))
  const attention = [
    ...bookings.filter((booking) => booking.status === 'provisional').map((booking) => ({ id: `confirmation-${booking.id}`, severity: 'warning', title: 'Booking requires confirmation', propertyName: booking.propertyName, detail: `${booking.guestName || 'Guest'} is waiting for confirmation.`, href: '/agent/rentals/short-term/bookings' })),
    ...activeBookings.filter((booking) => booking.status === 'confirmed' && new Date(booking.checkInAt) > now && hoursUntil(booking.checkInAt, now) <= 48 && !text(booking.guestEmail) && !text(booking.guestPhone)).map((booking) => ({ id: `guest-${booking.id}`, severity: 'attention', title: 'Guest contact details incomplete', propertyName: booking.propertyName, detail: `${booking.guestName || 'Upcoming guest'} arrives within 48 hours.`, href: '/agent/rentals/short-term/bookings' })),
    ...turnovers.filter((turnover) => turnover.status !== 'ready').map((turnover) => ({ id: `turnover-${turnover.id}`, severity: turnover.status === 'in_progress' ? 'info' : 'attention', title: turnover.status === 'in_progress' ? 'Turnover in progress' : 'Turnover incomplete', propertyName: turnover.propertyName, detail: `${turnover.unitLabel} is due ${turnover.dueAt ? 'for turnover' : 'for review'}.`, href: '/agent/rentals/short-term/turnovers' })),
    ...enabledUnits.filter((unit) => !activeRateUnitIds.has(text(unit.id))).map((unit) => ({ id: `rate-${unit.id}`, severity: 'warning', title: 'Rate plan needed', propertyName: unit.propertyName, detail: `${unit.unitLabel} has no active nightly rate.`, href: '/agent/rentals/short-term/rates' })),
  ].slice(0, 8)

  const upcomingStays = bookings.filter((booking) => ['provisional', 'confirmed'].includes(booking.status) && new Date(booking.checkInAt) >= now)
    .sort((a, b) => new Date(a.checkInAt) - new Date(b.checkInAt)).slice(0, 12).map(withPropertyMedia)
  const propertyPerformance = enabledUnits.map((unit) => buildPropertyPerformance({ unit, bookings, rangeDays: safeRangeDays, now }))
  const dailyOccupancy = Array.from({ length: safeRangeDays }, (_, index) => {
    const date = addDays(now, index)
    const occupied = enabledUnits.filter((unit) => activeBookings.some((booking) => booking.unitId === unit.id && overlapsDay(booking, date))).length
    return { date: dayKey(date, timeZone), occupancyRate: enabledUnits.length ? Math.round((occupied / enabledUnits.length) * 100) : null, revenue: null }
  })

  return {
    arrivalsToday: arrivalsToday.map(withPropertyMedia), departuresToday: departuresToday.map(withPropertyMedia), activeStays, guestsInHouse, occupancyRate, enabledUnitCount: enabledUnits.length,
    events, attention, upcomingStays, propertyPerformance, eligibleForSetupCount: Math.max(0, units.length - enabledUnits.length),
    performance: { bookingRevenue: null, occupancyRate, adr: null, revPar: null, daily: dailyOccupancy },
  }
}
