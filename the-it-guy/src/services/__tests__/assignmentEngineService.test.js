import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    __assignmentEngineServiceTestUtils,
    getAssignmentRuleLabel,
    getQueueTypeLabel,
  } = await server.ssrLoadModule('/src/services/assignmentEngineService.js')

  {
    assert.equal(getQueueTypeLabel('bond_applications'), 'Bond Applications')
    assert.equal(getQueueTypeLabel('transfer_matters'), 'Transfer Matters')
    assert.equal(getQueueTypeLabel('unknown'), 'General Work')
    assert.equal(getAssignmentRuleLabel('round_robin'), 'Round Robin')
    assert.equal(getAssignmentRuleLabel('capacity_based'), 'Capacity Based')
  }

  {
    const queue = __assignmentEngineServiceTestUtils.toWorkQueue({
      id: 'queue-1',
      organization_id: 'org-betterbond',
      branch_id: 'branch-sandton',
      branch_name: 'Sandton',
      queue_name: 'Bond Applications',
      queue_type: 'bond_applications',
      waiting_count: 42,
      assigned_count: 82,
      completed_count: 120,
      sla_warning_count: 5,
      average_assignment_minutes: '134.5',
    })

    assert.equal(queue.organizationId, 'org-betterbond')
    assert.equal(queue.branchName, 'Sandton')
    assert.equal(queue.queueTypeLabel, 'Bond Applications')
    assert.equal(queue.waitingCount, 42)
    assert.equal(queue.slaWarningCount, 5)
    assert.equal(queue.averageAssignmentMinutes, 134.5)
  }

  {
    const item = __assignmentEngineServiceTestUtils.toQueueItem({
      id: 'item-1',
      transaction_id: 'tx-1',
      queue_id: 'queue-1',
      queue_name: 'Transfer Matters',
      source_role_type: 'transfer_attorney',
      assigned_user_id: 'user-sarah',
      assigned_user_name: 'Sarah Jones',
      assignment_method: 'round_robin',
      status: 'assigned',
      transaction_reference: 'TX-123',
      property_address_line_1: '123 Main Road',
      suburb: 'Sandton',
    })

    assert.equal(item.transactionId, 'tx-1')
    assert.equal(item.assignedUserName, 'Sarah Jones')
    assert.equal(item.assignmentMethod, 'round_robin')
    assert.equal(item.assignmentMethodLabel, 'Round Robin')
    assert.equal(item.propertyLabel, '123 Main Road, Sandton')
  }

  {
    const dashboard = __assignmentEngineServiceTestUtils.normalizeQueueDashboardPayload({
      queues: [{ id: 'queue-1', queue_type: 'bond_applications' }],
      items: [{ id: 'item-1', status: 'waiting' }],
      rules: [{ id: 'rule-1', rule_type: 'capacity_based', priority: 10 }],
      users: [{ user_id: 'user-1', full_name: 'John Smith', active_work_count: 7 }],
      canManageQueues: true,
    })

    assert.equal(dashboard.queues.length, 1)
    assert.equal(dashboard.items.length, 1)
    assert.equal(dashboard.rules[0].ruleTypeLabel, 'Capacity Based')
    assert.equal(dashboard.users[0].activeWorkCount, 7)
    assert.equal(dashboard.canManageQueues, true)
  }

  console.log('assignmentEngineService tests passed')
} finally {
  await server.close()
}
