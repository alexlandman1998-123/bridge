import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildAttorneyMatterCapabilityProfile } from '../src/core/transactions/attorneyMatterCapabilityProfile.js'

const permissionSource = readFileSync(
  new URL('../src/services/permissions/attorneyPermissionService.js', import.meta.url),
  'utf8',
)
const laneServiceSource = readFileSync(
  new URL('../src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', import.meta.url),
  'utf8',
)
const pageSource = readFileSync(
  new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url),
  'utf8',
)

function strictContext(overrides = {}) {
  return {
    canViewLane: true,
    isAssignedAttorney: false,
    isFirmManagement: false,
    managementOverrideEnabled: false,
    assignmentScopedCapabilities: {},
    ...overrides,
  }
}

function verifyCapabilityIsolation() {
  const profile = buildAttorneyMatterCapabilityProfile({
    appRole: 'attorney',
    requiredLaneKeys: ['transfer', 'bond', 'cancellation'],
    lanePermissionContexts: {
      transfer: strictContext(),
      bond: strictContext({
        isAssignedAttorney: true,
        assignmentScopedCapabilities: {
          canEdit: true,
          canUpdateLane: true,
          canRequestDocuments: true,
          canUploadDocuments: true,
          canReviewDocuments: true,
          canManageSigning: true,
          canAddInternalNote: true,
          canAddSharedUpdate: true,
        },
      }),
      cancellation: strictContext(),
    },
  })

  assert.equal(profile.defaultLaneKey, 'bond')
  assert.deepEqual(profile.editableLaneKeys, ['bond'])
  assert.equal(profile.lanes.transfer.canEdit, false)
  assert.equal(profile.lanes.bond.canEdit, true)
  assert.equal(profile.lanes.cancellation.canEdit, false)
}

function verifyServerEnforcementContract() {
  assert.doesNotMatch(permissionSource, /PHASE_ONE_SHARED_WORKFLOW_EDITING|canEditAllWorkflowLanesInPhaseOne/)
  assert.match(permissionSource, /canUpdateLane:\s*Boolean\(strictLaneCapabilities\.canUpdateLane\)/)
  assert.match(permissionSource, /canManageSigning:\s*Boolean\(strictLaneCapabilities\.canManageSigning\)/)
  assert.match(permissionSource, /canAddInternalNote:\s*Boolean\(strictLaneCapabilities\.canAddInternalNote\)/)

  for (const mutation of [
    'updateAttorneyWorkflowLaneStage',
    'updateAttorneyWorkflowStepStatus',
    'requestAttorneyWorkflowLaneDocument',
    'reviewAttorneyDocumentRequest',
  ]) {
    const start = laneServiceSource.indexOf(`export async function ${mutation}`)
    assert.notEqual(start, -1, `${mutation}: mutation export is missing`)
    const nextExport = laneServiceSource.indexOf('export async function ', start + 24)
    const body = laneServiceSource.slice(start, nextExport === -1 ? undefined : nextExport)
    assert.match(body, /assertCan(UpdateLane|RequestLaneDocument|ReviewLaneDocument)/, `${mutation}: assignment guard is missing`)
  }

  const noteStart = laneServiceSource.indexOf('export async function addAttorneyTransactionUpdate')
  const noteEnd = laneServiceSource.indexOf('export async function addAttorneyWorkflowLaneUpdate', noteStart)
  assert.match(laneServiceSource.slice(noteStart, noteEnd), /assertCanPublishVisibility\(permissionContext, normalizedVisibility\)/)
}

function verifyReadOnlyUiContract() {
  assert.match(pageSource, /View only:\s*this \$\{capability\?\.label \|\| 'legal'\} workflow/)
  assert.match(pageSource, /viewerCapability\?\.canEdit === false \? 'Review Workflow'/)
  assert.match(pageSource, /readOnly=\{workspaceRole === 'attorney' && !canUseLaneCapability/)
  assert.match(pageSource, /canUseLaneCapability\(draft\.laneKey, 'canEdit'\)/)
  assert.match(pageSource, /canUseLaneCapability\(workflowDocumentDraft\.laneKey, 'canRequestDocuments'\)/)
  assert.match(pageSource, /Manager override active\./)
}

verifyCapabilityIsolation()
verifyServerEnforcementContract()
verifyReadOnlyUiContract()

console.log('Attorney workflow Phase 3 lane enforcement verification passed.')
