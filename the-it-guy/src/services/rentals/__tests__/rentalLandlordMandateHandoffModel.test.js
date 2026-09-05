import assert from 'node:assert/strict'
import { buildRentalLandlordMandateHandoff } from '../rentalLandlordMandateHandoffModel.js'

const handoff = buildRentalLandlordMandateHandoff({ id: 'lead-1', role: 'landlord', stage: 'mandate_pending' }, { propertyId: 'property-1', signedAt: '2026-09-05T09:00', evidenceReference: 'MANDATE-PACK-1', signedConfirmation: true, managementFeeAmount: 8 })
assert.equal(handoff.propertyId, 'property-1')
assert.throws(() => buildRentalLandlordMandateHandoff({ role: 'landlord', stage: 'mandate_pending' }, {}), /managed rental property/)
console.log('Rental landlord mandate handoff model tests passed.')
