import assert from 'node:assert/strict'
import { assertRentalLeadFicaCompletion, getRentalLeadFicaReadiness } from '../rentalLeadFicaModel.js'

assert.equal(getRentalLeadFicaReadiness({ identity: 'verified' }).complete, false)
const complete = { identity: 'verified', proof_of_address: 'verified', bank_details: 'verified', source_of_funds: 'verified' }
assert.equal(assertRentalLeadFicaCompletion(complete, 'DOC-42').complete, true)
assert.throws(() => assertRentalLeadFicaCompletion(complete, ''), /evidence reference/)
console.log('Rental lead FICA model tests passed.')
