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

function matter(overrides = {}) {
  return {
    assignmentId: overrides.assignmentId || `${overrides.matterId}-assignment`,
    matterId: overrides.matterId,
    matterReference: overrides.matterReference || overrides.matterId,
    matterType: overrides.matterType || 'Transfer',
    propertyLabel: overrides.propertyLabel || 'Property pending',
    buyerName: overrides.buyerName || 'Buyer',
    sellerName: overrides.sellerName || 'Seller',
    currentStage: overrides.currentStage || 'Instruction',
    assignedAttorneyId: overrides.assignedAttorneyId || 'user-1',
    assignedAttorneyName: overrides.assignedAttorneyName || 'Attorney User',
    status: overrides.status || 'On Track',
    flags: overrides.flags || {},
    lastUpdated: overrides.lastUpdated || '2026-07-01T08:00:00.000Z',
    ...overrides,
  }
}

const baseSource = {
  firm: { id: 'firm-1', name: 'Arch9 Attorneys' },
  currentUser: { id: 'user-1', role: 'attorney_conveyancer', practiceQualifications: ['transfer'] },
  permissions: {
    can_view_all_firm_matters: false,
    can_view_transfer_matters: true,
    can_view_bond_matters: false,
  },
  availableFilters: {
    members: [{ value: 'user-1', label: 'Attorney User', role: 'attorney_conveyancer' }],
  },
  documentQueue: [],
  matterQueue: [
    matter({ matterId: 'tx-transfer', matterReference: 'TRF-001', matterType: 'Transfer' }),
    matter({ matterId: 'tx-bond', matterReference: 'BND-001', matterType: 'Bond' }),
    matter({ matterId: 'tx-cancellation', matterReference: 'CAN-001', matterType: 'Cancellation' }),
    matter({ matterId: 'tx-transfer-bond', matterReference: 'TB-001', matterType: 'Transfer + Bond' }),
  ],
}

try {
  const {
    buildAttorneyMatterWorkspace,
  } = await server.ssrLoadModule('/src/services/attorneyMatterWorkspace.js')

  {
    const workspace = buildAttorneyMatterWorkspace({
      ...baseSource,
      currentUser: { id: 'bond-user', role: 'attorney_conveyancer', practiceQualifications: ['bond'] },
      permissions: {
        can_view_all_firm_matters: false,
        can_view_transfer_matters: false,
        can_view_bond_matters: true,
      },
    }, {
      view: 'all',
      pageSize: 20,
    })

    assert.equal(workspace.view.key, 'bond')
    assert.equal(workspace.scope.defaultMatterViewKey, 'bond')
    assert.deepEqual(workspace.scope.listLaneKeys, ['bond'])
    assert.deepEqual(workspace.tableRows.map((row) => row.matterId).sort(), ['tx-bond', 'tx-transfer-bond'])
  }

  {
    const workspace = buildAttorneyMatterWorkspace({
      ...baseSource,
      currentUser: { id: 'cancel-user', role: 'attorney_conveyancer', practiceQualifications: ['cancellation'] },
      permissions: {
        can_view_all_firm_matters: false,
        can_view_transfer_matters: true,
        can_view_bond_matters: false,
      },
    }, {
      view: 'transfer',
      pageSize: 20,
    })

    assert.equal(workspace.view.key, 'cancellation')
    assert.equal(workspace.scope.defaultMatterViewKey, 'cancellation')
    assert.deepEqual(workspace.scope.listLaneKeys, ['cancellation'])
    assert.deepEqual(workspace.tableRows.map((row) => row.matterId), ['tx-cancellation'])
  }

  {
    const workspace = buildAttorneyMatterWorkspace({
      ...baseSource,
      currentUser: { id: 'manager', role: 'director_partner', practiceQualifications: ['transfer', 'bond', 'cancellation'] },
      permissions: {
        can_view_all_firm_matters: true,
        can_view_transfer_matters: true,
        can_view_bond_matters: true,
        can_update_attorney_assignments: true,
      },
    }, {
      view: 'all',
      pageSize: 20,
    })

    assert.equal(workspace.view.key, 'all')
    assert.equal(workspace.scope.canViewAllMatterLists, true)
    assert.deepEqual(workspace.tableRows.map((row) => row.matterId).sort(), [
      'tx-bond',
      'tx-cancellation',
      'tx-transfer',
      'tx-transfer-bond',
    ])
  }

  {
    const workspace = buildAttorneyMatterWorkspace({
      ...baseSource,
      currentUser: { id: 'bond-user', role: 'attorney_conveyancer', practiceQualifications: ['bond'] },
      permissions: {
        can_view_all_firm_matters: false,
        can_view_transfer_matters: false,
        can_view_bond_matters: true,
      },
      matterQueue: [
        matter({ matterId: 'tx-transfer-delayed', matterType: 'Transfer', flags: { delayed: true } }),
        matter({ matterId: 'tx-bond-delayed', matterType: 'Bond', flags: { delayed: true } }),
      ],
    }, {
      view: 'delayed',
      pageSize: 20,
    })

    assert.equal(workspace.view.key, 'delayed')
    assert.deepEqual(workspace.tableRows.map((row) => row.matterId), ['tx-bond-delayed'])
  }

  console.log('attorneyMatterWorkspace scope tests passed')
} finally {
  await server.close()
}
