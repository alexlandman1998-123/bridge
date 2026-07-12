import assert from 'node:assert/strict'
import { buildTransactionReferenceDisplayModel } from '../transactionReferencePolicy.js'
import { buildWorkspaceHeaderConfigForRole } from '../workspaceHeaderConfig.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('developer header includes the shared Bridge matter number before operational stats', () => {
  const referenceSummary = buildTransactionReferenceDisplayModel({
    transaction: {
      id: 'tx-header-dev',
      matter_number: 'BRG-HDR-1',
    },
    audienceRole: 'developer',
  })
  const config = buildWorkspaceHeaderConfigForRole({
    role: 'developer',
    title: 'Header Test',
    referenceSummary,
  })

  assert.equal(config.stats[0].label, 'Bridge Matter No')
  assert.equal(config.stats[0].value, 'BRG-HDR-1')
  assert.equal(config.stats[1].label, 'Current Stage')
})

test('partner-facing header can surface visible partner reference numbers', () => {
  const referenceSummary = buildTransactionReferenceDisplayModel({
    transaction: {
      id: 'tx-header-attorney',
      matter_number: 'BRG-HDR-2',
    },
    attorneyAssignments: [
      {
        id: 'assignment-header-transfer',
        attorney_role: 'transfer_attorney',
        matter_reference: 'TRF-HDR-1',
        matter_reference_source: 'partner_portal',
      },
    ],
    audienceRole: 'attorney',
  })
  const config = buildWorkspaceHeaderConfigForRole({
    role: 'attorney',
    title: 'Header Test',
    referenceSummary,
  })

  assert.equal(config.stats[0].label, 'Bridge Matter No')
  assert.equal(config.stats[1].label, 'Transfer Matter No')
  assert.equal(config.stats[1].value, 'TRF-HDR-1')
  assert.equal(config.stats[1].helperText, 'Partner portal reference')
})

console.log('workspaceHeaderConfig tests passed')
