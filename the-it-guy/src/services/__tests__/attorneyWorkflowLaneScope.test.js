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

function lane(laneKey) {
  return {
    id: `${laneKey}-lane`,
    laneKey,
    attorneyRole: `${laneKey === 'cancellation' ? 'cancellation' : laneKey}_attorney`,
    permissions: { canView: true },
  }
}

function operationFixture() {
  return {
    transaction: { id: 'tx-1' },
    workflow: {
      lanes: {
        transfer: { required: true },
        bond: { required: true },
        cancellation: { required: true },
      },
      requiredAttorneyRoles: ['transfer_attorney', 'bond_attorney', 'cancellation_attorney'],
      assignedAttorneyRoles: ['transfer_attorney', 'bond_attorney'],
      missingRequiredRoles: ['cancellation_attorney'],
      documentRequirements: [
        { id: 'transfer-doc', laneKey: 'transfer' },
        { id: 'bond-doc', laneKey: 'bond' },
        { id: 'cancellation-doc', laneKey: 'cancellation' },
      ],
      dataRequirements: [
        { id: 'transfer-data', laneKey: 'transfer' },
        { id: 'bond-data', laneKey: 'bond' },
      ],
      signingRequirements: [
        { id: 'transfer-signing', laneKey: 'transfer' },
        { id: 'bond-signing', laneKey: 'bond' },
      ],
    },
    legalDocuments: {
      requirements: [
        { id: 'transfer-doc', laneKey: 'transfer' },
        { id: 'bond-doc', laneKey: 'bond' },
        { id: 'cancellation-doc', laneKey: 'cancellation' },
      ],
      signingRequirements: [
        { id: 'transfer-signing', laneKey: 'transfer' },
        { id: 'bond-signing', laneKey: 'bond' },
      ],
      warnings: [],
    },
    legalTimeline: [
      { id: 'transfer-update', laneKey: 'transfer' },
      { id: 'bond-update', laneKey: 'bond' },
      { id: 'cancellation-update', laneKey: 'cancellation' },
    ],
    timelineFilters: ['all', 'transfer', 'bond', 'cancellation', 'documents', 'internal'],
    lanes: [lane('transfer'), lane('bond'), lane('cancellation')],
    missingRequiredRoles: ['cancellation_attorney'],
    assignments: [
      { id: 'transfer-assignment', attorneyRole: 'transfer_attorney' },
      { id: 'bond-assignment', attorneyRole: 'bond_attorney' },
      { id: 'cancellation-assignment', attorneyRole: 'cancellation_attorney' },
    ],
    notificationDeliveries: [
      { id: 'transfer-delivery', laneKey: 'transfer', status: 'sent' },
      { id: 'bond-delivery', laneKey: 'bond', status: 'queued' },
      { id: 'general-delivery', status: 'sent' },
    ],
  }
}

try {
  const {
    scopeAttorneyWorkflowOperations,
  } = await server.ssrLoadModule('/src/services/attorneyWorkflow/attorneyWorkflowLaneService.js')
  const {
    buildAttorneyMatterScope,
  } = await server.ssrLoadModule('/src/core/transactions/attorneyMatterScope.js')

  {
    const bondScope = {
      ...buildAttorneyMatterScope({
        requiredLaneKeys: ['transfer', 'bond', 'cancellation'],
        laneAccessContexts: {
          transfer: { canViewMatter: true },
          bond: {
            canViewMatter: true,
            canActAsAttorney: true,
            canUpdateLane: true,
            isAssignedAttorney: true,
            isAssignedParticipant: true,
          },
          cancellation: { canViewMatter: true },
        },
      }),
      scoped: true,
    }
    const scoped = scopeAttorneyWorkflowOperations(operationFixture(), bondScope)

    assert.equal(scoped.scopeAudit, undefined)
    assert.deepEqual(scoped.lanes.map((item) => item.laneKey), ['bond'])
    assert.deepEqual(scoped.workflow.requiredAttorneyRoles, ['bond_attorney'])
    assert.deepEqual(scoped.workflow.documentRequirements.map((item) => item.id), ['bond-doc'])
    assert.deepEqual(scoped.legalDocuments.requirements.map((item) => item.id), ['bond-doc'])
    assert.deepEqual(scoped.legalTimeline.map((item) => item.id), ['bond-update'])
    assert.deepEqual(scoped.assignments.map((item) => item.id), ['bond-assignment'])
    assert.deepEqual(scoped.timelineFilters, ['all', 'bond', 'documents', 'internal'])
    assert.equal(scoped.notificationSummary.total, 2)
  }

  {
    const {
      buildAttorneyMatterScopeAudit,
    } = await server.ssrLoadModule('/src/core/transactions/attorneyMatterScopeAudit.js')
    const managementScope = {
      ...buildAttorneyMatterScope({
        requiredLaneKeys: ['transfer', 'bond', 'cancellation'],
        laneAccessContexts: {
          transfer: { canViewMatter: true, isManagementUser: true },
          bond: { canViewMatter: true, isManagementUser: true },
          cancellation: { canViewMatter: true, isManagementUser: true },
        },
      }),
      scoped: true,
    }
    const fixture = {
      ...operationFixture(),
      scopeAudit: buildAttorneyMatterScopeAudit(managementScope, { transactionId: 'tx-1' }),
    }
    const scoped = scopeAttorneyWorkflowOperations(fixture, managementScope)

    assert.equal(scoped.scopeAudit.scopeKind, 'management')
    assert.deepEqual(scoped.lanes.map((item) => item.laneKey), ['transfer', 'bond', 'cancellation'])
    assert.deepEqual(scoped.workflow.requiredAttorneyRoles, ['transfer_attorney', 'bond_attorney', 'cancellation_attorney'])
    assert.deepEqual(scoped.timelineFilters, ['all', 'transfer', 'bond', 'cancellation', 'documents', 'internal'])
  }

  console.log('attorney workflow lane scope tests passed')
} finally {
  await server.close()
}
