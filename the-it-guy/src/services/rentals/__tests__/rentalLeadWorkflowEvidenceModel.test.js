import assert from 'node:assert/strict'
import { appendRentalLeadWorkflowEvidence, buildRentalLeadWorkflowEvidence, getRentalLeadStageEvidenceRequirement } from '../rentalLeadWorkflowEvidenceModel.js'

assert.deepEqual(getRentalLeadStageEvidenceRequirement({ role: 'landlord' }, 'mandate_signed').fields, ['mandateReference', 'signedAt'])
assert.throws(() => buildRentalLeadWorkflowEvidence({ role: 'tenant' }, 'qualified', {}), /Confirm that the tenant is qualified/)
assert.throws(() => buildRentalLeadWorkflowEvidence({ role: 'tenant' }, 'viewing_completed', { viewingOutcome: 'no_show' }), /Only an attended viewing/)
const evidence = buildRentalLeadWorkflowEvidence({ role: 'landlord' }, 'mandate_signed', { mandateReference: 'MAND-42', signedAt: '2026-09-05T09:00' })
assert.equal(evidence.mandateReference, 'MAND-42')
assert.equal(appendRentalLeadWorkflowEvidence({ workflow: { events: [{ stage: 'contacted' }] } }, evidence).events.length, 2)
console.log('Rental lead workflow evidence model tests passed.')
