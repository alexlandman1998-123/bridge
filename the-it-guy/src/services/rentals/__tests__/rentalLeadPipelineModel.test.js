import assert from 'node:assert/strict'
import { buildRentalPipelineSummary, getNextRentalLeadStage, getRentalLeadNextAction, getRentalLeadStageLabel, resolveRentalLeadRole, transitionRentalLead } from '../rentalLeadPipelineModel.js'

assert.equal(resolveRentalLeadRole('owner'), 'landlord')
assert.equal(resolveRentalLeadRole('unknown'), 'tenant')
assert.equal(getRentalLeadStageLabel('contacted'), 'Contacted')
assert.equal(getNextRentalLeadStage({ stage: 'viewing' }), 'application')
assert.equal(getRentalLeadNextAction('contacted', 'landlord'), 'Arrange appraisal')
assert.equal(transitionRentalLead({ stage: 'new' }, 'contacted').nextAction, 'Schedule viewing')
const summary = buildRentalPipelineSummary([{ stage: 'new', role: 'landlord' }, { stage: 'new', role: 'tenant' }], 'landlord')
assert.equal(summary[0].count, 1)
assert.equal(summary[0].label, 'New')
console.log('Rental lead pipeline model tests passed.')
