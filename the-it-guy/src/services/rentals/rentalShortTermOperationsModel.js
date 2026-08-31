function dayKey(value, timeZone = 'Africa/Johannesburg') {
  if (!value) return ''
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function buildShortTermOperationsSnapshot({ bookings = [], turnovers = [], now = new Date(), timeZone = 'Africa/Johannesburg' } = {}) {
  const today = dayKey(now, timeZone)
  const arrivals = bookings.filter((booking) => booking.status === 'confirmed' && dayKey(booking.checkInAt, timeZone) === today)
  const departures = bookings.filter((booking) => booking.status === 'checked_in' && dayKey(booking.checkOutAt, timeZone) === today)
  const inHouse = bookings.filter((booking) => booking.status === 'checked_in')
  const outstandingTurnovers = turnovers.filter((turnover) => turnover.status !== 'ready')
  return {
    arrivals, departures, inHouse, outstandingTurnovers,
    arrivalCount: arrivals.length, departureCount: departures.length, inHouseCount: inHouse.length,
    turnoverCount: outstandingTurnovers.length, readyTurnoverCount: turnovers.filter((turnover) => turnover.status === 'ready').length,
  }
}
