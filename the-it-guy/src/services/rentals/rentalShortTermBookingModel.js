import { SHORT_TERM_BOOKING_STATUSES } from './shortTermRentalFoundation.js'

const text = (value) => String(value ?? '').trim()
const number = (value, fallback = 0) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback }

function timestamp(value, label) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} is required.`)
  return parsed.toISOString()
}

export function createShortTermBookingPayload(values = {}) {
  const organisationId = text(values.organisationId || values.organisation_id); const propertyId = text(values.propertyId || values.property_id); const unitId = text(values.unitId || values.unit_id); const guestName = text(values.guestName || values.guest_name)
  if (!organisationId || !propertyId || !unitId) throw new Error('Choose a Short-Term unit.')
  if (!guestName) throw new Error('Guest name is required.')
  const checkInAt = timestamp(values.checkInAt || values.check_in_at, 'Check-in time'); const checkOutAt = timestamp(values.checkOutAt || values.check_out_at, 'Check-out time')
  if (new Date(checkOutAt) <= new Date(checkInAt)) throw new Error('Check-out must be after check-in.')
  const adults = number(values.adults, 1); const children = number(values.children, 0)
  if (adults < 1 || children < 0) throw new Error('Guest counts are invalid.')
  return {
    organisation_id: organisationId, branch_id: text(values.branchId || values.branch_id) || null, property_id: propertyId, unit_id: unitId,
    status: SHORT_TERM_BOOKING_STATUSES.includes(text(values.status || 'provisional')) ? text(values.status || 'provisional') : 'provisional',
    guest_name: guestName, guest_email: text(values.guestEmail || values.guest_email) || null, guest_phone: text(values.guestPhone || values.guest_phone) || null,
    source: text(values.source || 'direct') || 'direct', check_in_at: checkInAt, check_out_at: checkOutAt, adults, children,
    notes: text(values.notes) || null, created_by: text(values.createdBy || values.created_by) || null,
  }
}

export function mapShortTermBooking(row = {}) {
  const propertyMetadata = row.rental_properties?.metadata_json && typeof row.rental_properties.metadata_json === 'object' ? row.rental_properties.metadata_json : {}
  return {
    id: text(row.id), organisationId: text(row.organisation_id), branchId: text(row.branch_id), propertyId: text(row.property_id), unitId: text(row.unit_id), status: text(row.status),
    guestName: text(row.guest_name), guestEmail: text(row.guest_email), guestPhone: text(row.guest_phone), source: text(row.source), checkInAt: row.check_in_at || null, checkOutAt: row.check_out_at || null,
    adults: number(row.adults, 1), children: number(row.children, 0), notes: text(row.notes), propertyName: text(row.rental_properties?.name) || 'Property', unitLabel: text(row.rental_units?.unit_label) || 'Unit',
    propertyCoverImageUrl: text(propertyMetadata.coverImageUrl || propertyMetadata.cover_image_url), propertyCoverImageAlt: text(propertyMetadata.coverImageAlt || propertyMetadata.cover_image_alt),
  }
}
