const text = (value) => String(value || '').trim()

const workspaceName = (workspace = {}) => [
  workspace.currentWorkspace?.name,
  workspace.currentWorkspace?.displayName,
  workspace.currentWorkspace?.display_name,
  workspace.currentWorkspace?.organisationName,
  workspace.currentWorkspace?.organisation_name,
  workspace.organisation?.name,
  workspace.organisation?.display_name,
].map(text).join(' ').toLowerCase()

/** Restrict the inline showcase to the named Revo agency. */
export function isRevoPropertyGroupWorkspace(workspace = {}) {
  return /\brevo\b/.test(workspaceName(workspace))
}

/**
 * A small, read-only demonstration of the 9 September 2026 operating day.
 * It is used only while Revo has no persisted short-term records, so live
 * operations always take precedence.
 */
export function getRevoShortTermDemoData({ organisationId = '', branchId = '' } = {}) {
  const organisation = text(organisationId)
  const branch = text(branchId)
  const units = [
    { id: 'revo-demo-unit-harbour', organisationId: organisation, branchId: branch, propertyId: 'revo-demo-property-harbour', propertyName: 'Harbour Heights', unitLabel: 'Apartment 402', bedrooms: 2, bathrooms: 2, isShortTermEnabled: true, activeBlockCount: 1 },
    { id: 'revo-demo-unit-grove', organisationId: organisation, branchId: branch, propertyId: 'revo-demo-property-grove', propertyName: 'The Grove Collection', unitLabel: 'Garden Suite', bedrooms: 1, bathrooms: 1, isShortTermEnabled: true, activeBlockCount: 1 },
    { id: 'revo-demo-unit-palm', organisationId: organisation, branchId: branch, propertyId: 'revo-demo-property-palm', propertyName: 'Palm View Residences', unitLabel: 'Penthouse 8', bedrooms: 3, bathrooms: 2, isShortTermEnabled: true, activeBlockCount: 1 },
  ]
  const bookings = [
    { id: 'revo-demo-booking-kaya', organisationId: organisation, branchId: branch, propertyId: 'revo-demo-property-harbour', unitId: 'revo-demo-unit-harbour', status: 'checked_in', guestName: 'Kaya Williams', guestEmail: 'kaya@example.test', guestPhone: '+27 82 555 0181', source: 'direct', checkInAt: '2026-09-05T15:00:00+02:00', checkOutAt: '2026-09-09T10:00:00+02:00', adults: 2, children: 0, propertyName: 'Harbour Heights', unitLabel: 'Apartment 402' },
    { id: 'revo-demo-booking-noah', organisationId: organisation, branchId: branch, propertyId: 'revo-demo-property-grove', unitId: 'revo-demo-unit-grove', status: 'checked_in', guestName: 'Noah Daniels', guestEmail: 'noah@example.test', guestPhone: '+27 82 555 0182', source: 'agent', checkInAt: '2026-09-07T14:00:00+02:00', checkOutAt: '2026-09-11T10:00:00+02:00', adults: 1, children: 0, propertyName: 'The Grove Collection', unitLabel: 'Garden Suite' },
    { id: 'revo-demo-booking-mia', organisationId: organisation, branchId: branch, propertyId: 'revo-demo-property-palm', unitId: 'revo-demo-unit-palm', status: 'confirmed', guestName: 'Mia Petersen', guestEmail: 'mia@example.test', guestPhone: '+27 82 555 0183', source: 'direct', checkInAt: '2026-09-09T14:00:00+02:00', checkOutAt: '2026-09-12T10:00:00+02:00', adults: 2, children: 1, propertyName: 'Palm View Residences', unitLabel: 'Penthouse 8' },
    { id: 'revo-demo-booking-ava', organisationId: organisation, branchId: branch, propertyId: 'revo-demo-property-harbour', unitId: 'revo-demo-unit-harbour', status: 'provisional', guestName: 'Ava Ndlovu', guestEmail: '', guestPhone: '', source: 'phone', checkInAt: '2026-09-12T15:00:00+02:00', checkOutAt: '2026-09-15T10:00:00+02:00', adults: 2, children: 0, propertyName: 'Harbour Heights', unitLabel: 'Apartment 402' },
  ]
  return {
    units,
    bookings,
    turnovers: [{ id: 'revo-demo-turnover-harbour', status: 'in_progress', dueAt: '2026-09-09T11:30:00+02:00', propertyName: 'Harbour Heights', unitLabel: 'Apartment 402', guestName: 'Kaya Williams' }],
    ratePlans: units.map((unit, index) => ({ id: `revo-demo-rate-${index + 1}`, unit_id: unit.id, status: 'active', effective_from: '2026-09-01', effective_to: null })),
  }
}
