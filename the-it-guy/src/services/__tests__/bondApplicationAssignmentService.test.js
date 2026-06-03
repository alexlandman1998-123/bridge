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
  const service = await server.ssrLoadModule('/src/services/bondApplicationAssignmentService.js')
  service.__bondApplicationAssignmentServiceTestUtils.clearStores()

  const workspaceId = 'workspace-assignment'
  const regions = [
    { id: 'region-gauteng', name: 'Gauteng' },
    { id: 'region-cape', name: 'Western Cape' },
  ]
  const branches = [
    { id: 'branch-east-rand', name: 'East Rand Branch', regionId: 'region-gauteng', managerUserId: 'manager-east' },
    { id: 'branch-midrand', name: 'Midrand Branch', regionId: 'region-gauteng', managerUserId: 'manager-midrand' },
    { id: 'branch-cape', name: 'Cape Branch', regionId: 'region-cape', managerUserId: 'manager-cape' },
  ]
  const consultants = [
    { id: 'consultant-light', user_id: 'consultant-light', firstName: 'John', lastName: 'Smith', branchId: 'branch-east-rand', regionId: 'region-gauteng', status: 'active' },
    { id: 'consultant-normal', user_id: 'consultant-normal', firstName: 'Sarah', lastName: 'Jones', branchId: 'branch-east-rand', regionId: 'region-gauteng', status: 'active' },
    { id: 'consultant-inactive', user_id: 'consultant-inactive', firstName: 'Inactive', lastName: 'User', branchId: 'branch-east-rand', regionId: 'region-gauteng', status: 'inactive' },
    { id: 'consultant-midrand', user_id: 'consultant-midrand', firstName: 'Peter', lastName: 'Adams', branchId: 'branch-midrand', regionId: 'region-gauteng', status: 'active' },
    { id: 'consultant-cape', user_id: 'consultant-cape', firstName: 'Cape', lastName: 'Owner', branchId: 'branch-cape', regionId: 'region-cape', status: 'active' },
  ]

  function makeApplication(id, consultantId, branchId = 'branch-east-rand', regionId = 'region-gauteng', status = 'active') {
    return {
      id,
      transactionReference: id.toUpperCase(),
      assignedUserId: consultantId,
      assigned_user_id: consultantId,
      assignedBranchId: branchId,
      assigned_branch_id: branchId,
      assignedRegionId: regionId,
      assigned_region_id: regionId,
      status,
    }
  }

  const workloadRows = [
    ...Array.from({ length: 41 }, (_, index) => makeApplication(`overload-${index}`, 'consultant-normal')),
    ...Array.from({ length: 2 }, (_, index) => makeApplication(`light-${index}`, 'consultant-light')),
    makeApplication('submitted-1', 'consultant-light', 'branch-east-rand', 'region-gauteng', 'submitted'),
    makeApplication('docs-1', 'consultant-light', 'branch-east-rand', 'region-gauteng', 'awaiting_documents'),
  ]
  const applications = [
    ...workloadRows,
    { id: 'app-partner', partnerId: 'harcourts-bedfordview', status: 'active', buyer: 'Buyer One', property: '123 Main Road' },
    { id: 'app-development', developmentId: 'waterfall-estate', status: 'active' },
    { id: 'app-manual', selectedConsultantId: 'consultant-midrand', status: 'active' },
    { id: 'app-balanced', assignedBranchId: 'branch-east-rand', assignedRegionId: 'region-gauteng', status: 'active' },
    makeApplication('app-reassign', 'consultant-light'),
    makeApplication('app-cape', 'consultant-cape', 'branch-cape', 'region-cape'),
  ]
  service.__bondApplicationAssignmentServiceTestUtils.seedApplications(workspaceId, applications)

  function makeContext({
    userId = 'hq-owner',
    workspaceRole = 'owner',
    scopeLevel = 'workspace_hq',
    regionId = '',
    workspaceUnitId = '',
  } = {}) {
    return {
      appRole: 'bond_originator',
      workspaceType: 'bond_originator',
      userId,
      profile: { id: userId, email: `${userId}@example.test` },
      currentWorkspace: { id: workspaceId, type: 'bond_originator' },
      currentMembership: {
        id: `membership-${userId}`,
        status: 'active',
        user_id: userId,
        organisation_id: workspaceId,
        workspaceRole,
        workspace_role: workspaceRole,
        scopeLevel,
        scope_level: scopeLevel,
        regionId,
        region_id: regionId,
        workspaceUnitId,
        workspace_unit_id: workspaceUnitId,
      },
    }
  }

  const hqContext = makeContext()
  const commonOptions = {
    regions,
    branches,
    consultants,
    applications: service.__bondApplicationAssignmentServiceTestUtils.getApplications(workspaceId),
    forceLocal: true,
    partnerDefaults: [{ partnerId: 'harcourts-bedfordview', branchId: 'branch-east-rand' }],
    developmentDefaults: [{ developmentId: 'waterfall-estate', regionId: 'region-gauteng', branchId: 'branch-midrand' }],
  }

  const partnerAssignment = await service.assignApplication('app-partner', hqContext, workspaceId, commonOptions)
  assert.equal(partnerAssignment.assignmentMethod, service.BOND_APPLICATION_ASSIGNMENT_METHODS.partnerDefault)
  assert.equal(partnerAssignment.branch.id, 'branch-east-rand')
  assert.equal(partnerAssignment.application.assignedRegionId, 'region-gauteng')
  assert.equal(partnerAssignment.application.assignedConsultantId, 'consultant-light')

  const developmentAssignment = await service.assignApplication('app-development', hqContext, workspaceId, {
    ...commonOptions,
    applications: service.__bondApplicationAssignmentServiceTestUtils.getApplications(workspaceId),
  })
  assert.equal(developmentAssignment.routingMode, service.BOND_APPLICATION_ROUTING_MODES.developmentDefault)
  assert.equal(developmentAssignment.branch.id, 'branch-midrand')
  assert.equal(developmentAssignment.application.assignedConsultantId, 'consultant-midrand')

  const manualAssignment = await service.assignApplication('app-manual', hqContext, workspaceId, {
    ...commonOptions,
    applications: service.__bondApplicationAssignmentServiceTestUtils.getApplications(workspaceId),
  })
  assert.equal(manualAssignment.assignmentMethod, service.BOND_APPLICATION_ASSIGNMENT_METHODS.manual)
  assert.equal(manualAssignment.application.assignedConsultantId, 'consultant-midrand')

  const balancedPreview = service.previewApplicationAssignment('app-balanced', hqContext, workspaceId, {
    ...commonOptions,
    applications: service.__bondApplicationAssignmentServiceTestUtils.getApplications(workspaceId),
  })
  assert.equal(balancedPreview.assignmentMethod, service.BOND_APPLICATION_ASSIGNMENT_METHODS.workloadBalanced)
  assert.equal(balancedPreview.consultant.id, 'consultant-light')
  assert.notEqual(balancedPreview.consultant.id, 'consultant-inactive')
  assert.notEqual(balancedPreview.consultant.id, 'consultant-normal')

  const overloadedCapacity = service.calculateConsultantCapacity('consultant-normal', service.__bondApplicationAssignmentServiceTestUtils.getApplications(workspaceId))
  assert.equal(overloadedCapacity.capacityStatus, 'Overloaded')

  const reassignment = await service.reassignApplication('app-reassign', 'consultant-midrand', 'Workload', hqContext, workspaceId, {
    ...commonOptions,
    applications: service.__bondApplicationAssignmentServiceTestUtils.getApplications(workspaceId),
  })
  assert.equal(reassignment.application.assignedConsultantId, 'consultant-midrand')
  assert.equal(reassignment.application.assignedBranchId, 'branch-midrand')
  assert.equal(reassignment.application.assignmentMethod, service.BOND_APPLICATION_ASSIGNMENT_METHODS.reassigned)
  assert.ok(reassignment.history.some((row) => row.eventType === service.BOND_APPLICATION_ASSIGNMENT_EVENTS.reassigned && row.reason === 'Workload'))

  const ownership = service.getApplicationOwnership('app-reassign', hqContext, workspaceId, {
    regions,
    branches,
    consultants,
    applications: service.__bondApplicationAssignmentServiceTestUtils.getApplications(workspaceId),
  })
  assert.equal(ownership.consultant, 'Peter Adams')
  assert.equal(ownership.branch, 'Midrand Branch')
  assert.equal(ownership.region, 'Gauteng')

  const notifications = service.__bondApplicationAssignmentServiceTestUtils.getNotifications(workspaceId)
  assert.ok(notifications.some((row) => row.recipientUserId === 'consultant-midrand'))
  assert.ok(notifications.some((row) => row.recipientUserId === 'manager-midrand'))

  const branchCapacity = service.getBranchCapacity('branch-east-rand', hqContext, workspaceId, {
    regions,
    branches,
    consultants,
    applications: service.__bondApplicationAssignmentServiceTestUtils.getApplications(workspaceId),
  })
  assert.ok(branchCapacity.activeApplications >= 45)
  assert.equal(branchCapacity.consultants.find((row) => row.consultantId === 'consultant-normal').capacityStatus, 'Overloaded')

  const regionCapacity = service.getRegionCapacity('region-gauteng', hqContext, workspaceId, {
    regions,
    branches,
    consultants,
    applications: service.__bondApplicationAssignmentServiceTestUtils.getApplications(workspaceId),
  })
  assert.ok(regionCapacity.branches.some((row) => row.branchId === 'branch-east-rand'))
  assert.ok(regionCapacity.branches.some((row) => row.branchId === 'branch-midrand'))
  assert.ok(regionCapacity.activeApplications >= branchCapacity.activeApplications)

  const regionalContext = makeContext({ userId: 'regional-gauteng', workspaceRole: 'regional_manager', scopeLevel: 'region', regionId: 'region-gauteng' })
  const regionalReassign = await service.reassignApplication('app-balanced', 'consultant-midrand', 'Escalation', regionalContext, workspaceId, {
    regions,
    branches,
    consultants,
    applications: service.__bondApplicationAssignmentServiceTestUtils.getApplications(workspaceId),
    forceLocal: true,
  })
  assert.equal(regionalReassign.application.assignedConsultantId, 'consultant-midrand')

  await assert.rejects(
    () => service.reassignApplication('app-cape', 'consultant-midrand', 'Escalation', regionalContext, workspaceId, {
      regions,
      branches,
      consultants,
      applications: service.__bondApplicationAssignmentServiceTestUtils.getApplications(workspaceId),
      forceLocal: true,
    }),
    /permission/,
  )

  const consultantContext = makeContext({ userId: 'consultant-light', workspaceRole: 'consultant', scopeLevel: 'assigned', regionId: 'region-gauteng', workspaceUnitId: 'branch-east-rand' })
  await assert.rejects(
    () => service.reassignApplication('app-partner', 'consultant-midrand', 'Other', consultantContext, workspaceId, {
      regions,
      branches,
      consultants,
      applications: service.__bondApplicationAssignmentServiceTestUtils.getApplications(workspaceId),
      forceLocal: true,
    }),
    /permission/,
  )

  assert.ok(service.__bondApplicationAssignmentServiceTestUtils.getHistory(workspaceId).some((row) => row.eventType === service.BOND_APPLICATION_ASSIGNMENT_EVENTS.assigned))
  assert.ok(service.__bondApplicationAssignmentServiceTestUtils.getHistory(workspaceId).some((row) => row.eventType === service.BOND_APPLICATION_ASSIGNMENT_EVENTS.reassigned))

  console.log('bondApplicationAssignmentService tests passed')
} finally {
  await server.close()
}
