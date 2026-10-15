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
assert.deepEqual(getRentalLeadPipelineStages('landlord').slice(-3), ['mandate_signed', 'listing_ready', 'listing_created'])
assert.deepEqual(getRentalLeadPipelineStages('tenant').slice(-2), ['fica_complete', 'placement_ready'])
assert.equal(normaliseRentalLeadStage('viewing', 'tenant'), 'viewing_scheduled')
assert.equal(normaliseRentalLeadStage('application', 'landlord'), 'mandate_pending')
assert.equal(getRentalLeadStageLabel('mandate_signed', 'landlord'), 'Mandate signed')
assert.equal(getNextRentalLeadStage({ role: 'tenant', stage: 'qualified' }), 'viewing_scheduled')
assert.equal(getRentalLeadNextAction('contacted', 'landlord'), 'Contact landlord')
assert.equal(getRentalLeadNextAction('screening_pending', 'tenant'), 'Complete screening')
assert.equal(canTransitionRentalLead('mandate_pending', 'mandate_signed', 'landlord'), true)
assert.equal(canTransitionRentalLead('listing_ready', 'listing_created', 'landlord'), true)
assert.equal(canTransitionRentalLead('mandate_pending', 'listing_ready', 'landlord'), false)
assert.equal(canTransitionRentalLead('new', 'unknown', 'tenant'), false)
assert.equal(canTransitionRentalLead('unknown', 'contacted', 'tenant'), false)
assert.equal(canTransitionRentalLead('New Lead', 'contacted', 'tenant'), true)
assert.equal(canTransitionRentalLead('viewing', 'viewing_completed', 'tenant'), true)
assert.throws(() => transitionRentalLead({ role: 'tenant', stage: 'new', savedStage: 'corrupted' }, 'contacted'), /review the saved journey/)
assert.equal(transitionRentalLead({ role: 'tenant', stage: 'new' }, 'contacted').nextAction, 'Complete qualification')
const summary = buildRentalPipelineSummary([{ stage: 'new', role: 'landlord' }, { stage: 'new', role: 'tenant' }], 'landlord')
assert.equal(summary[0].count, 1)
assert.equal(summary[0].label, 'New')
console.log('Rental lead pipeline model tests passed.')
