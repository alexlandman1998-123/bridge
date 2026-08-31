import assert from 'node:assert/strict'
import { createShortTermBookingPayload, mapShortTermBooking } from '../rentalShortTermBookingModel.js'

const payload = createShortTermBookingPayload({ organisationId: 'org-1', propertyId: 'property-1', unitId: 'unit-1', guestName: 'Alex', checkInAt: '2026-09-01T14:00', checkOutAt: '2026-09-03T10:00' })
assert.equal(payload.status, 'provisional')
assert.equal(payload.guest_name, 'Alex')
assert.throws(() => createShortTermBookingPayload({ organisationId: 'org-1', propertyId: 'property-1', unitId: 'unit-1', guestName: 'Alex', checkInAt: '2026-09-03T10:00', checkOutAt: '2026-09-01T14:00' }), /Check-out/)
assert.equal(mapShortTermBooking({ id: 'booking-1', guest_name: 'Alex', rental_properties: { name: 'Harbour View' }, rental_units: { unit_label: 'A1' } }).propertyName, 'Harbour View')
console.log('Short-Term booking model tests passed.')
