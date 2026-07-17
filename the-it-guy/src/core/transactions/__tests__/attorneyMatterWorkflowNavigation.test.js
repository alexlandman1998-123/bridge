import assert from 'node:assert/strict'
import {
  buildAttorneyWorkflowPath,
  getAttorneyMatterListWorkflowDetailKey,
  getAttorneyWorkflowNavigation,
} from '../attorneyMatterWorkflowNavigation.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('single-role attorneys navigate directly to their assigned workflow', () => {
  assert.deepEqual(
    getAttorneyWorkflowNavigation({ matterRole: 'transfer_attorney', defaultLaneKey: 'transfer', assignedLaneKeys: ['transfer'] }),
    { mode: 'direct', label: 'Transfer', defaultLaneKey: 'transfer', detailKey: 'transfer' },
  )
  assert.deepEqual(
    getAttorneyWorkflowNavigation({ matterRole: 'bond_attorney', defaultLaneKey: 'bond', assignedLaneKeys: ['bond'] }),
    { mode: 'direct', label: 'Bond Registration', defaultLaneKey: 'bond', detailKey: 'bond-registration' },
  )
  assert.deepEqual(
    getAttorneyWorkflowNavigation({ matterRole: 'cancellation_attorney', defaultLaneKey: 'cancellation', assignedLaneKeys: ['cancellation'] }),
    { mode: 'direct', label: 'Bond Cancellation', defaultLaneKey: 'cancellation', detailKey: 'bond-cancellation' },
  )
})

test('multi-role attorneys and unassigned managers retain a workflow hub', () => {
  assert.equal(getAttorneyWorkflowNavigation({ matterRole: 'multi_role', isMultiRole: true }).label, 'My Workflows')
  assert.equal(getAttorneyWorkflowNavigation({ matterRole: 'manager', assignedLaneKeys: [] }).label, 'All Workflows')
  assert.equal(getAttorneyWorkflowNavigation({ matterRole: 'manager', assignedLaneKeys: [] }).mode, 'hub')
})

test('neutral workflow routes are generated without transfer nesting', () => {
  assert.equal(buildAttorneyWorkflowPath('/transactions/tx-1', 'bond-registration'), '/transactions/tx-1/work/bond-registration')
  assert.equal(buildAttorneyWorkflowPath('/bond/files/tx-1/', 'transfer'), '/bond/files/tx-1/work/transfer')
})

test('matter-list views map to their owning workflow', () => {
  assert.equal(getAttorneyMatterListWorkflowDetailKey('transfer'), 'transfer')
  assert.equal(getAttorneyMatterListWorkflowDetailKey('bond'), 'bond-registration')
  assert.equal(getAttorneyMatterListWorkflowDetailKey('cancellation'), 'bond-cancellation')
  assert.equal(getAttorneyMatterListWorkflowDetailKey('all'), '')
})
