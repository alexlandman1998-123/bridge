import assert from 'node:assert/strict'
import {
  buildRentalPipelineSummary,
  canTransitionRentalLead,
  getNextRentalLeadStage,
  getRentalLeadNextAction,
  getRentalLeadPipelineStages,
  getRentalLeadStageLabel,
  normaliseRentalLeadStage,
  resolveRentalLeadRole,
  transitionRentalLead,
} from '../rentalLeadPipelineModel.js'

assert.equal(resolveRentalLeadRole('owner'), 'landlord')
assert.equal(resolveRentalLeadRole('unknown'), 'tenant')
assert.deepEqual(getRentalLeadPipelineStages('landlord').slice(-2), ['mandate_signed', 'listing_ready'])
assert.deepEqual(getRentalLeadPipelineStages('tenant').slice(-2), ['fica_complete', 'placement_ready'])
assert.equal(normaliseRentalLeadStage('viewing', 'tenant'), 'viewing_scheduled')
assert.equal(normaliseRentalLeadStage('application', 'landlord'), 'mandate_pending')
assert.equal(getRentalLeadStageLabel('mandate_signed', 'landlord'), 'Mandate signed')
assert.equal(getNextRentalLeadStage({ role: 'tenant', stage: 'qualified' }), 'viewing_scheduled')
assert.equal(getRentalLeadNextAction('contacted', 'landlord'), 'Schedule appraisal')
assert.equal(getRentalLeadNextAction('screening_pending', 'tenant'), 'Complete screening')
assert.equal(canTransitionRentalLead('mandate_pending', 'mandate_signed', 'landlord'), true)
assert.equal(canTransitionRentalLead('mandate_pending', 'listing_ready', 'landlord'), false)
assert.equal(transitionRentalLead({ role: 'tenant', stage: 'new' }, 'contacted').nextAction, 'Complete qualification')
const summary = buildRentalPipelineSummary([{ stage: 'new', role: 'landlord' }, { stage: 'new', role: 'tenant' }], 'landlord')
assert.equal(summary[0].count, 1)
assert.equal(summary[0].label, 'New')
console.log('Rental lead pipeline model tests passed.')
