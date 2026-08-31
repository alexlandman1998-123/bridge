export const RENTAL_CALENDAR_VERSION = 'arch9_rental_calendar_v1'
const text = (value) => String(value ?? '').trim()
const label = (value) => text(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
export function buildRentalCalendarItems({ leases = [], events = [] } = {}) {
  const entries = [
    ...events.filter((event) => event.dueDate && !['completed', 'cancelled'].includes(text(event.status))).map((event) => ({ id: `event:${event.id}`, date: event.dueDate, type: event.type, title: label(event.type), tenantName: event.tenantName, listingTitle: event.listingTitle, status: event.status, detail: event.note })),
    ...leases.filter((lease) => lease.occupationDate && !['cancelled'].includes(text(lease.leaseStatus))).map((lease) => ({ id: `occupation:${lease.id}`, date: lease.occupationDate, type: 'occupation', title: 'Occupation', tenantName: lease.tenantName, listingTitle: lease.listingTitle, status: lease.handoverStatus, detail: 'Lease occupation and handover.' })),
  ]
  return entries.sort((left, right) => String(left.date).localeCompare(String(right.date)))
}
