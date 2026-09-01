const text = (value) => String(value ?? '').trim()
const dayMs = 86_400_000

const dayStart = (value) => { const date = new Date(value); return new Date(date.getFullYear(), date.getMonth(), date.getDate()) }
const dayKey = (value) => { const date = dayStart(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
const addDays = (value, amount) => { const date = dayStart(value); date.setDate(date.getDate() + amount); return date }
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback

export function startOfCalendarWeek(value = new Date()) { const date = dayStart(value); date.setDate(date.getDate() - date.getDay()); return date }
export function calendarWeekDays(weekStart) { return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)) }

function bookingOverlapsWeek(booking, weekStart) {
  const weekEnd = addDays(weekStart, 7)
  return new Date(booking.checkInAt) < weekEnd && new Date(booking.checkOutAt) > weekStart
}

function bookingBar(booking, weekStart) {
  const stayStart = dayStart(booking.checkInAt); const stayEnd = dayStart(booking.checkOutAt)
  const start = Math.max(0, Math.round((stayStart - weekStart) / dayMs))
  const end = Math.min(7, Math.max(start + 1, Math.ceil((stayEnd - weekStart) / dayMs)))
  return { ...booking, start, span: Math.max(1, end - start), checkOutThisWeek: stayEnd >= weekStart && stayEnd < addDays(weekStart, 7) }
}

export function buildShortTermCalendarBoard({ units = [], bookings = [], weekStart = new Date() } = {}) {
  const start = startOfCalendarWeek(weekStart)
  const activeBookings = bookings.filter((booking) => ['provisional', 'confirmed', 'checked_in'].includes(text(booking.status)))
  const rows = units.filter((unit) => unit.isShortTermEnabled).map((unit) => ({
    ...unit,
    maxGuests: Math.max(2, number(unit.bedrooms, 1) * 2),
    bookings: activeBookings.filter((booking) => booking.unitId === unit.id && bookingOverlapsWeek(booking, start)).map((booking) => bookingBar(booking, start)),
  }))
  const days = calendarWeekDays(start)
  const inWeek = (value) => { const date = dayStart(value); return date >= start && date < addDays(start, 7) }
  const totalOccupiedNights = rows.reduce((total, row) => total + row.bookings.reduce((count, booking) => count + booking.span, 0), 0)
  const occupancyRate = rows.length ? Math.round((totalOccupiedNights / (rows.length * 7)) * 100) : null
  return {
    weekStart: start, days, rows,
    summary: {
      stays: activeBookings.filter((booking) => bookingOverlapsWeek(booking, start)).length,
      guestsCheckingIn: activeBookings.filter((booking) => inWeek(booking.checkInAt)).reduce((total, booking) => total + number(booking.adults, 1) + number(booking.children), 0),
      guestsCheckingOut: activeBookings.filter((booking) => inWeek(booking.checkOutAt)).reduce((total, booking) => total + number(booking.adults, 1) + number(booking.children), 0),
      occupancyRate, bookedRevenue: null,
    },
  }
}

export const calendarDateKey = dayKey
