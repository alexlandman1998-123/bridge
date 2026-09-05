import assert from 'node:assert/strict'
import { buildRentalLeadCommunicationPayload, validateRentalLeadCommunication } from '../rentalLeadCommunicationModel.js'

assert.match(validateRentalLeadCommunication({}).join(' '), /Choose a rental lead/)
const payload = buildRentalLeadCommunicationPayload({ id: 'lead-1', role: 'tenant', stage: 'contacted' }, { communicationType: 'call', direction: 'outbound', summary: 'Qualification call completed.', outcome: 'Reached' })
assert.equal(payload.metadata.rentalRole, 'tenant')
assert.equal(payload.communicationType, 'call')
console.log('Rental lead communication model tests passed.')
