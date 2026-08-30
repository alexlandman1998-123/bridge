import assert from 'node:assert/strict'
import {
  RENTAL_CAPABILITIES,
  canUseRentalCapability,
  getRentalCapabilityScope,
} from '../rentalCapabilities.js'
import { ACCESS_SCOPES } from '../../../../../auth/permissions/permissionRegistry.js'

const createContext = (workspaceRole, { status = 'active', branchId = 'branch-a' } = {}) => ({
  role: 'agent',
  workspaceType: 'agency',
  currentWorkspace: { id: 'organisation-a', type: 'agency' },
  currentMembership: {
    id: `${workspaceRole}-membership`,
    status,
    workspaceRole,
    organisationId: 'organisation-a',
    branchId,
  },
  profile: { id: `${workspaceRole}-user`, role: 'agent' },
})

const assertCapabilities = (role, expected) => {
  const context = createContext(role)
  for (const [capability, allowed] of Object.entries(expected)) {
    assert.equal(
      canUseRentalCapability(RENTAL_CAPABILITIES[capability], context),
      allowed,
      `${role} ${capability}`,
    )
  }
}

assertCapabilities('owner', {
  vacancyManage: true,
  applicationApprove: true,
  tenancyActivate: true,
  collectionsCapturePayment: true,
  collectionsReversePayment: true,
  maintenanceManage: true,
  inspectionsManage: true,
  reportsExport: true,
})

assertCapabilities('manager', {
  vacancyManage: true,
  applicationApprove: true,
  tenancyActivate: false,
  collectionsCapturePayment: true,
  collectionsReversePayment: true,
  maintenanceManage: true,
  inspectionsManage: true,
  reportsExport: false,
})

assertCapabilities('admin_staff', {
  vacancyManage: false,
  applicationManage: true,
  applicationApprove: false,
  tenancyManage: false,
  collectionsView: true,
  collectionsCapturePayment: false,
  maintenanceView: true,
  maintenanceManage: false,
  inspectionsManage: true,
  reportsExport: false,
})

assertCapabilities('agent', {
  vacancyManage: true,
  applicationManage: true,
  applicationApprove: false,
  tenancyManage: false,
  collectionsView: false,
  maintenanceManage: true,
  inspectionsManage: true,
  reportsExport: false,
})

assertCapabilities('viewer', {
  vacancyView: true,
  vacancyManage: false,
  applicationView: true,
  applicationManage: false,
  tenancyView: true,
  tenancyManage: false,
  collectionsView: false,
  maintenanceView: true,
  maintenanceManage: false,
  inspectionsManage: false,
})

const suspendedManager = createContext('manager', { status: 'suspended' })
assert.equal(canUseRentalCapability(RENTAL_CAPABILITIES.tenancyActivate, suspendedManager), false)
assert.equal(getRentalCapabilityScope(RENTAL_CAPABILITIES.vacancyView, suspendedManager), ACCESS_SCOPES.none)

console.log('Rentals Phase 51 role acceptance tests passed.')
