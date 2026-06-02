import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const resolver = await server.ssrLoadModule('/server/services/attorneyLaneResolver.js')

  const cashLanes = resolver.resolveRequiredAttorneyLanes({
    id: 'tx-cash',
    finance_type: 'cash',
    seller_has_existing_bond: false,
  })
  assert.equal(cashLanes.attorney_transfer.required, true)
  assert.equal(cashLanes.attorney_bond.required, false)
  assert.equal(cashLanes.seller_bond_cancellation.required, false)

  const bondLanes = resolver.resolveRequiredAttorneyLanes({
    id: 'tx-bond',
    finance_type: 'bond',
    seller_has_existing_bond: false,
  })
  assert.equal(bondLanes.attorney_transfer.required, true)
  assert.equal(bondLanes.attorney_bond.required, true)
  assert.equal(bondLanes.seller_bond_cancellation.required, false)

  const hybridLanes = resolver.resolveRequiredAttorneyLanes({
    id: 'tx-hybrid',
    finance_type: 'hybrid',
    seller_has_existing_bond: false,
  })
  assert.equal(hybridLanes.attorney_transfer.required, true)
  assert.equal(hybridLanes.attorney_bond.required, true)

  const cancellationLanes = resolver.resolveRequiredAttorneyLanes({
    id: 'tx-cancel',
    finance_type: 'cash',
    seller_has_existing_bond: true,
  })
  assert.equal(cancellationLanes.attorney_transfer.required, true)
  assert.equal(cancellationLanes.attorney_bond.required, false)
  assert.equal(cancellationLanes.seller_bond_cancellation.required, true)

  const bondInstructionOnly = resolver.resolveRequiredAttorneyLanes(
    {
      id: 'tx-bond-instruction',
      finance_type: 'cash',
      seller_has_existing_bond: false,
      bond_instruction_received: true,
    },
    {
      readModel: {
        lanes: [],
      },
    },
  )
  assert.equal(bondInstructionOnly.attorney_bond.required, true)

  assert.deepEqual(
    resolver.resolveRequiredAttorneyWorkflowKeys({
      id: 'tx-required-keys',
      finance_type: 'bond',
      seller_has_existing_bond: true,
    }),
    ['attorney_transfer', 'attorney_bond', 'seller_bond_cancellation'],
  )

  assert.deepEqual(
    resolver.getAttorneyLaneStepAliases('attorney_transfer', 'transfer_documents_signed'),
    ['buyer_signed_transfer_documents', 'seller_signed_transfer_documents', 'signed_transfer_documents'],
  )

  console.log('attorneyLaneResolver tests passed')
} finally {
  await server.close()
}
