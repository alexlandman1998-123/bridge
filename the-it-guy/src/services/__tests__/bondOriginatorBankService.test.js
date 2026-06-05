/* global process */
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const workspaceId = 'workspace-originator-bank-panel'

function context({
  userId = 'hq-user',
  workspaceRole = 'hq_manager',
  scopeLevel = 'workspace_hq',
  regionId = '',
  branchId = '',
} = {}) {
  return {
    role: 'bond_originator',
    workspaceType: 'bond_originator',
    userId,
    profile: { id: userId, email: `${userId}@example.test` },
    currentWorkspace: { id: workspaceId, type: 'bond_originator' },
    currentMembership: {
      id: `membership-${userId}`,
      userId,
      user_id: userId,
      organisationId: workspaceId,
      organisation_id: workspaceId,
      workspaceId,
      workspaceRole,
      workspace_role: workspaceRole,
      scopeLevel,
      scope_level: scopeLevel,
      regionId,
      region_id: regionId,
      branchId,
      branch_id: branchId,
      status: 'active',
    },
  }
}

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const service = await server.ssrLoadModule('/src/services/bondOriginatorBankService.js')
  service.__bondOriginatorBankServiceTestUtils.clearStores()

  const hqContext = context()
  const regionalContext = context({
    userId: 'regional-user',
    workspaceRole: 'regional_manager',
    scopeLevel: 'region',
    regionId: 'region-gauteng',
  })
  const consultantContext = context({
    userId: 'consultant-user',
    workspaceRole: 'consultant',
    scopeLevel: 'assigned',
    regionId: 'region-gauteng',
    branchId: 'branch-sandton',
  })

  assert.equal(service.getSystemBanks().some((bank) => bank.shortName === 'FNB'), true)
  assert.equal(service.getBankPanelForCurrentUser(hqContext, { workspaceId }).length, 0)

  const fnb = service.addOriginatorBank({
    bankId: 'F.N.B',
    status: 'active',
    primaryContactName: 'Sarah Smith',
    primaryContactEmail: 'sarah@fnb.example.test',
    submissionEmail: 'submissions@fnb.example.test',
    slaDays: 3,
    supportedProducts: ['Residential Bond', 'Further Bond'],
    regionsSupported: ['Gauteng'],
    notes: 'Primary home-loan panel bank.',
  }, hqContext, { workspaceId })

  assert.equal(fnb.bankId, 'fnb')
  assert.equal(fnb.bankName, 'FNB')
  assert.deepEqual(fnb.supportedProducts, ['Residential Bond', 'Further Bond'])
  assert.throws(
    () => service.addOriginatorBank({ bankId: 'First National Bank' }, hqContext, { workspaceId }),
    /already in the originator bank panel/i,
  )

  service.addOriginatorBank({ bankId: 'absa', status: 'pending', slaDays: 4 }, hqContext, { workspaceId })
  assert.equal(service.getBankPanelForCurrentUser(hqContext, { workspaceId }).length, 2)
  assert.deepEqual(service.getBankPanelForCurrentUser(regionalContext, { workspaceId }).map((row) => row.bankName), ['FNB'])
  assert.deepEqual(service.getActiveBankOptionsForCurrentUser(consultantContext, { workspaceId }).map((row) => row.label), ['FNB'])

  const updated = service.updateOriginatorBank(fnb.id, {
    primaryContactPhone: '+27 11 555 0101',
    status: 'active',
  }, hqContext, { workspaceId })
  assert.equal(updated.primaryContactPhone, '+27 11 555 0101')

  const inactive = service.deactivateOriginatorBank(fnb.id, hqContext, { workspaceId })
  assert.equal(inactive.status, 'inactive')
  assert.equal(service.getActiveBankOptionsForCurrentUser(consultantContext, { workspaceId }).length, 0)

  assert.throws(
    () => service.addOriginatorBank({ bankId: 'nedbank' }, regionalContext, { workspaceId }),
    /Only HQ users/i,
  )

  console.log('bond originator bank service tests passed')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await server.close()
}
