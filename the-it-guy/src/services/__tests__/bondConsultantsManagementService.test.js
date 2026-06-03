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
  const service = await server.ssrLoadModule('/src/services/bondOrganisationService.js')
  service.__bondOrganisationServiceTestUtils.clearRegionStores()

  function makeContext({
    userId = 'user-hq',
    workspaceRole = 'owner',
    scopeLevel = 'workspace_hq',
    regionId = '',
    workspaceUnitId = '',
  } = {}) {
    return {
      appRole: 'bond_originator',
      workspaceType: 'bond_originator',
      userId,
      email: `${userId}@example.test`,
      profile: { id: userId, email: `${userId}@example.test`, fullName: userId },
      currentWorkspace: { id: 'workspace-consultants', type: 'bond_originator', workspace_kind: 'bond_company' },
      currentMembership: {
        id: `membership-${userId}`,
        workspaceId: 'workspace-consultants',
        organisation_id: 'workspace-consultants',
        user_id: userId,
        workspaceRole,
        workspace_role: workspaceRole,
        scopeLevel,
        scope_level: scopeLevel,
        regionId,
        region_id: regionId,
        workspaceUnitId,
        workspace_unit_id: workspaceUnitId,
        status: 'active',
      },
    }
  }

  const users = [
    { id: 'user-hq', user_id: 'user-hq', first_name: 'HQ', last_name: 'Owner', email: 'hq@example.test', role: 'owner', workspace_role: 'owner' },
    { id: 'regional-north', user_id: 'regional-north', first_name: 'Regional', last_name: 'North', email: 'regional@example.test', role: 'regional_manager', workspace_role: 'regional_manager', region_id: 'region-north' },
    { id: 'branch-manager', user_id: 'branch-manager', first_name: 'Branch', last_name: 'Manager', email: 'branch@example.test', role: 'branch_manager', workspace_role: 'branch_manager', region_id: 'region-north', workspace_unit_id: 'branch-north' },
  ]
  const hqContext = makeContext()

  await service.createBondRegion({ id: 'region-north', name: 'Gauteng North', code: 'GN' }, hqContext, 'workspace-consultants', { users, forceLocal: true })
  await service.createBondRegion({ id: 'region-south', name: 'Western Cape', code: 'WC' }, hqContext, 'workspace-consultants', { users, forceLocal: true })
  const regions = service.__bondOrganisationServiceTestUtils.getRegionRows('workspace-consultants')
  await service.createBondBranch({ id: 'branch-north', name: 'Pretoria Branch', regionId: 'region-north', code: 'PTA' }, hqContext, 'workspace-consultants', { users, regions, forceLocal: true })
  await service.createBondBranch({ id: 'branch-south', name: 'Cape Branch', regionId: 'region-south', code: 'CPT' }, hqContext, 'workspace-consultants', { users, regions, forceLocal: true })
  const branches = service.__bondOrganisationServiceTestUtils.getBranchRows('workspace-consultants')

  const consultantA = await service.createBondConsultant({
    id: 'consultant-a',
    firstName: 'Lerato',
    lastName: 'Mokoena',
    email: 'lerato@example.test',
    mobileNumber: '+27 82 555 0101',
    role: 'consultant',
    branchId: 'branch-north',
    employeeNumber: 'EMP-1',
  }, hqContext, 'workspace-consultants', { users, regions, branches, forceLocal: true })
  assert.equal(consultantA.name, 'Lerato Mokoena')
  assert.equal(consultantA.branchId, 'branch-north')
  assert.equal(consultantA.regionId, 'region-north')

  const consultantB = await service.createBondConsultant({
    id: 'consultant-b',
    firstName: 'Sarah',
    lastName: 'Jones',
    email: 'sarah@example.test',
    role: 'processor',
    branchId: 'branch-south',
  }, hqContext, 'workspace-consultants', { users, regions, branches, forceLocal: true })
  assert.equal(consultantB.regionId, 'region-south')

  await assert.rejects(
    () => service.createBondConsultant({ firstName: 'Duplicate', lastName: 'Email', email: 'LERATO@example.test', branchId: 'branch-north' }, hqContext, 'workspace-consultants', { users, regions, branches, forceLocal: true }),
    (error) => error.fieldErrors?.email === 'Email must be unique within this organisation.',
  )

  const editedA = await service.updateBondConsultant('consultant-a', {
    firstName: 'Lerato',
    lastName: 'Naidoo',
    email: 'lerato-naidoo@example.test',
    role: 'bond_originator',
    branchId: 'branch-north',
  }, hqContext, 'workspace-consultants', { users, regions, branches, forceLocal: true })
  assert.equal(editedA.name, 'Lerato Naidoo')
  assert.equal(editedA.role, 'bond_originator')

  const movedB = await service.assignConsultantToBranch('consultant-b', 'branch-north', hqContext, 'workspace-consultants', { users, regions, branches, forceLocal: true })
  assert.equal(movedB.branchId, 'branch-north')
  assert.equal(movedB.regionId, 'region-north')

  const consultants = service.__bondOrganisationServiceTestUtils.getConsultantRows('workspace-consultants')
  const applications = [
    {
      key: 'app-a-1',
      regionId: 'region-north',
      branchId: 'branch-north',
      workspaceUnitId: 'branch-north',
      consultant: 'Lerato Naidoo',
      assignedConsultantId: 'consultant-a',
      assignedUserId: 'consultant-a',
      assignedUserEmail: 'lerato-naidoo@example.test',
      financeStageLabel: 'Submitted',
      financeStageKey: 'submitted',
      status: 'submitted',
      lastActivityAt: '2026-05-20T10:00:00.000Z',
      lastActivityLabel: 'Today',
      createdAt: '2026-05-18T10:00:00.000Z',
    },
    {
      key: 'app-a-2',
      regionId: 'region-north',
      branchId: 'branch-north',
      workspaceUnitId: 'branch-north',
      consultant: 'Lerato Naidoo',
      assignedConsultantId: 'consultant-a',
      assignedUserId: 'consultant-a',
      assignedUserEmail: 'lerato-naidoo@example.test',
      financeStageLabel: 'Awaiting Documents',
      financeStageKey: 'awaiting_documents',
      status: 'active',
      lastActivityAt: '2026-05-21T10:00:00.000Z',
      lastActivityLabel: 'Today',
      createdAt: '2026-05-19T10:00:00.000Z',
    },
  ]

  const reassignedRows = await service.reassignApplications('consultant-a', 'consultant-b', [], hqContext, 'workspace-consultants', { users: consultants, regions, branches, applications, forceLocal: true })
  assert.equal(reassignedRows.length, 2)
  assert.equal(reassignedRows[0].assignedConsultantId, 'consultant-b')

  const snapshotAfterReassign = service.buildBondOrganisationSnapshot({
    context: hqContext,
    workspaceId: 'workspace-consultants',
    hierarchy: { regions, units: branches },
    users: consultants,
    applicationSnapshot: { rows: applications },
    options: {
      regions,
      branches,
      consultants,
      activityEvents: service.__bondOrganisationServiceTestUtils.getActivityRows('workspace-consultants'),
    },
  })
  const consultantBPerformance = snapshotAfterReassign.consultantPerformance.find((row) => row.id === 'consultant-b')
  const consultantAPerformance = snapshotAfterReassign.consultantPerformance.find((row) => row.id === 'consultant-a')
  assert.equal(consultantBPerformance.activeApplications, 2)
  assert.equal(consultantAPerformance.activeApplications, 0)
  assert.equal(snapshotAfterReassign.branchPerformance.find((row) => row.id === 'branch-north').activeApplications, 2)
  assert.equal(snapshotAfterReassign.regionPerformance.find((row) => row.id === 'region-north').activeApplications, 2)
  assert.equal(snapshotAfterReassign.overview.metrics.activeApplications, 2)

  const workspace = service.getBondConsultantWorkspace('consultant-b', {
    organisationScope: snapshotAfterReassign.organisationScope,
    regions: snapshotAfterReassign.regions,
    branches: snapshotAfterReassign.branches,
    consultants: snapshotAfterReassign.consultants,
    applications: snapshotAfterReassign.applications,
    activityEvents: service.__bondOrganisationServiceTestUtils.getActivityRows('workspace-consultants'),
  })
  assert.equal(workspace.metrics.activeApplications, 2)
  assert.equal(workspace.metrics.pendingDocuments, 1)
  assert.equal(workspace.metrics.capacityStatus, 'Light')
  assert.ok(workspace.workloadBreakdown.some((row) => row.key === 'applicationsSubmitted' && row.value === 1))

  const deactivatedA = await service.deactivateConsultant('consultant-a', hqContext, 'workspace-consultants', { users: consultants, regions, branches, applications, forceLocal: true })
  assert.equal(deactivatedA.status, 'inactive')
  await assert.rejects(
    () => service.deactivateConsultant('consultant-b', hqContext, 'workspace-consultants', { users: service.__bondOrganisationServiceTestUtils.getConsultantRows('workspace-consultants'), regions, branches, applications, forceLocal: true }),
    /Reassign before deactivation/,
  )

  const regionalContext = makeContext({ userId: 'regional-north', workspaceRole: 'regional_manager', scopeLevel: 'region', regionId: 'region-north' })
  const regionalSnapshot = service.buildBondOrganisationSnapshot({
    context: regionalContext,
    workspaceId: 'workspace-consultants',
    hierarchy: { regions, units: branches },
    users: service.__bondOrganisationServiceTestUtils.getConsultantRows('workspace-consultants'),
    applicationSnapshot: { rows: applications },
    options: { regions, branches },
  })
  assert.ok(regionalSnapshot.consultantPerformance.some((row) => row.id === 'consultant-a'))
  assert.ok(regionalSnapshot.consultantPerformance.some((row) => row.id === 'consultant-b'))
  assert.ok(!regionalSnapshot.consultantPerformance.some((row) => row.branchId === 'branch-south'))
  await assert.rejects(
    () => service.updateBondConsultant('consultant-b', { branchId: 'branch-south' }, regionalContext, 'workspace-consultants', { users: service.__bondOrganisationServiceTestUtils.getConsultantRows('workspace-consultants'), regions, branches, forceLocal: true }),
    /You do not have permission to manage consultants/,
  )

  const branchContext = makeContext({ userId: 'branch-manager', workspaceRole: 'branch_manager', scopeLevel: 'branch', regionId: 'region-north', workspaceUnitId: 'branch-north' })
  const branchSnapshot = service.buildBondOrganisationSnapshot({
    context: branchContext,
    workspaceId: 'workspace-consultants',
    hierarchy: { regions, units: branches },
    users: service.__bondOrganisationServiceTestUtils.getConsultantRows('workspace-consultants'),
    applicationSnapshot: { rows: applications },
    options: { regions, branches },
  })
  assert.ok(branchSnapshot.consultantPerformance.some((row) => row.id === 'consultant-a'))
  assert.ok(branchSnapshot.consultantPerformance.some((row) => row.id === 'consultant-b'))
  assert.ok(!branchSnapshot.consultantPerformance.some((row) => row.branchId === 'branch-south'))

  const consultantContext = makeContext({ userId: 'consultant-b', workspaceRole: 'consultant', scopeLevel: 'assigned', regionId: 'region-north', workspaceUnitId: 'branch-north' })
  const consultantSnapshot = service.buildBondOrganisationSnapshot({
    context: consultantContext,
    workspaceId: 'workspace-consultants',
    hierarchy: { regions, units: branches },
    users: service.__bondOrganisationServiceTestUtils.getConsultantRows('workspace-consultants'),
    applicationSnapshot: { rows: applications },
    options: { regions, branches },
  })
  assert.equal(consultantSnapshot.capabilities.canManageConsultants, false)
  assert.deepEqual(consultantSnapshot.applications.map((row) => row.key).sort(), ['app-a-1', 'app-a-2'])
  assert.equal(service.getBondConsultantWorkspaceRoute('consultant-b'), '/bond/organisation/consultants/consultant-b')
  assert.ok(snapshotAfterReassign.recentActivity.some((row) => row.type === 'Application reassigned'))
  assert.ok(service.__bondOrganisationServiceTestUtils.getActivityRows('workspace-consultants').some((row) => row.eventType === 'CONSULTANT_CREATED'))

  console.log('bondConsultantsManagementService tests passed')
} finally {
  await server.close()
}
