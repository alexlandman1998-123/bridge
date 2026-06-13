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
  const service = await server.ssrLoadModule('/src/services/universalAssignmentService.js')

  service.clearUniversalAssignmentEvents({ workspaceId: 'org-1' })

  const created = await service.createUniversalAssignment({
    workspaceId: 'org-1',
    itemType: 'lead',
    itemId: 'lead-1',
    organisationId: 'org-1',
    assignedUserId: 'user-1',
    assignmentMethod: service.UNIVERSAL_ASSIGNMENT_METHODS.manual,
    sourceModule: 'lead',
    sourceEvent: 'assign_lead_to_agent',
  })

  assert.equal(created.assignment.currentOwnerId, 'user-1')
  assert.equal(created.event.type, 'assignment.created')

  const reassigned = await service.reassignUniversalAssignment({
    workspaceId: 'org-1',
    itemType: 'lead',
    itemId: 'lead-1',
    organisationId: 'org-1',
    assignedUserId: 'user-2',
    previousOwnerId: 'user-1',
    assignmentMethod: service.UNIVERSAL_ASSIGNMENT_METHODS.managerAssignment,
    sourceModule: 'lead',
    sourceEvent: 'reassign_lead',
  })

  assert.equal(reassigned.event.type, 'assignment.reassigned')
  assert.equal(reassigned.assignment.currentOwnerId, 'user-2')

  const queueAssignment = await service.returnUniversalAssignmentToQueue({
    workspaceId: 'org-1',
    itemType: 'lead',
    itemId: 'lead-1',
    organisationId: 'org-1',
    assignedQueueId: 'branch-queue-1',
    assignmentMethod: service.UNIVERSAL_ASSIGNMENT_METHODS.queueAllocation,
    sourceModule: 'lead',
    sourceEvent: 'return_to_queue',
  })

  assert.equal(queueAssignment.event.type, 'assignment.returned_to_queue')

  const events = service.getUniversalAssignmentEvents({ workspaceId: 'org-1', itemType: 'lead', itemId: 'lead-1' })
  assert.equal(events.length, 3)

  const diagnostics = service.getUniversalAssignmentDiagnosticsSnapshot({ workspaceId: 'org-1' })
  assert.ok(diagnostics.totals.totalEvents >= 3)
  assert.equal(diagnostics.totals.assignedToUser >= 2, true)
  assert.equal(diagnostics.totals.assignedToQueue >= 1, true)

  const comparison = service.compareAssignmentDecisions(
    { itemType: 'lead', itemId: 'lead-1', assignedUserId: 'user-1', assignmentMethod: 'manual' },
    { itemType: 'lead', itemId: 'lead-1', assignedUserId: 'user-2', assignmentMethod: 'manual' },
  )
  assert.equal(comparison.status, 'mismatch')
  assert.equal(comparison.differences.assignedUserId.legacy, 'user-1')

  console.log('universalAssignmentService tests passed')
} finally {
  await server.close()
}
