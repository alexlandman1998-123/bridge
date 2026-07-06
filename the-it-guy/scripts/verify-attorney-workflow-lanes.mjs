import { resolveAttorneyLanes } from '../src/services/attorneyWorkflow/attorneyWorkflowResolver.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const cash = resolveAttorneyLanes({
  id: 'cash',
  finance_type: 'cash',
  buyer_entity_type: 'individual',
  seller_entity_type: 'individual',
})
assert(cash.transfer.required, 'cash: transfer lane required')
assert(!cash.bond.required, 'cash: bond lane must not be required')
assert(!cash.cancellation.required, 'cash: cancellation lane must not be required without seller bond')

const bond = resolveAttorneyLanes({
  id: 'bond',
  finance_type: 'bond',
  buyer_entity_type: 'company',
  seller_entity_type: 'individual',
})
assert(bond.transfer.required, 'bond: transfer lane required')
assert(bond.bond.required, 'bond: bond lane required')
assert(!bond.cancellation.required, 'bond: cancellation lane not required without seller bond')

const hybridCancellation = resolveAttorneyLanes({
  id: 'hybrid-cancellation',
  finance_type: 'hybrid',
  buyer_entity_type: 'trust',
  seller_entity_type: 'company',
  cancellation_required: true,
})
assert(hybridCancellation.transfer.required, 'hybrid: transfer lane required')
assert(hybridCancellation.bond.required, 'hybrid: bond lane required')
assert(hybridCancellation.cancellation.required, 'hybrid cancellation: cancellation lane required')

assert(cash.transfer.stages.at(0) === 'instruction_received', 'transfer first stage is stable')
assert(cash.transfer.stages.includes('registered'), 'transfer registration milestone is stable')
assert(cash.transfer.stages.at(-1) === 'matter_closed', 'transfer final stage is close-out')
assert(bond.bond.stages.includes('bond_registered'), 'bond registration milestone is stable')
assert(bond.bond.stages.at(-1) === 'bond_close_out_complete', 'bond final stage is close-out')
assert(hybridCancellation.cancellation.stages.includes('cancellation_registered'), 'cancellation registration milestone is stable')
assert(hybridCancellation.cancellation.stages.at(-1) === 'cancellation_close_out_complete', 'cancellation final stage is close-out')

console.log('Attorney workflow lane verification passed.')
