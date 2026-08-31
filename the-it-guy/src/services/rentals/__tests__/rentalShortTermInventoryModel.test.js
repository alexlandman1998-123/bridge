import assert from 'node:assert/strict'
import { createShortTermUnitModePayload, mapShortTermUnitInventory } from '../rentalShortTermInventoryModel.js'

const payload = createShortTermUnitModePayload({ unitId: 'unit-1', organisationId: 'org-1', propertyId: 'property-1', branchId: 'branch-1' })
assert.equal(payload.operating_mode, 'short_term')
assert.equal(payload.status, 'active')
assert.equal(payload.unit_id, 'unit-1')
assert.throws(() => createShortTermUnitModePayload({ unitId: 'unit-1' }), /Unit, property, and organisation/)

const unit = mapShortTermUnitInventory({ id: 'unit-1', unit_label: 'A1', organisation_id: 'org-1', property_id: 'property-1', status: 'vacant', rental_properties: { name: 'Harbour View' }, rental_unit_operating_modes: [{ operating_mode: 'short_term', status: 'active' }], rental_unit_occupancy_blocks: [{ status: 'held' }, { status: 'cancelled' }] })
assert.equal(unit.isShortTermEnabled, true)
assert.equal(unit.activeBlockCount, 1)
console.log('Short-Term inventory model tests passed.')
