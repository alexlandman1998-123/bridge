import { WORKFLOW_LANE_DEFINITIONS } from './definitions'

const INTERNAL_ADMIN_ROLES = new Set(['developer', 'internal_admin'])

function normalizeActorRole(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function buildCapabilitySet({
  actorRole = '',
  canEditCoreTransaction = false,
  canEditFinanceWorkflow = false,
  canEditAttorneyWorkflow = false,
  isFinanceOwner = false,
  isTransactionOwner = false,
} = {}) {
  const normalizedRole = normalizeActorRole(actorRole)
  const capabilities = new Set()

  if (canEditCoreTransaction || isTransactionOwner) {
    capabilities.add('transaction_owner')
  }

  if (normalizedRole === 'agent') {
    capabilities.add('agent')
  }

  if (normalizedRole === 'bond_originator' || canEditFinanceWorkflow || isFinanceOwner) {
    capabilities.add('finance_owner')
  }

  if (normalizedRole === 'attorney' || canEditAttorneyWorkflow) {
    capabilities.add('attorney')
  }

  if (INTERNAL_ADMIN_ROLES.has(normalizedRole)) {
    capabilities.add('admin')
    capabilities.add('developer_owner')
  }

  if (['client', 'buyer', 'seller'].includes(normalizedRole)) {
    capabilities.add('client')
  }

  return capabilities
}

function hasAnyCapability(owned = new Set(), expected = []) {
  return (expected || []).some((key) => owned.has(key))
}

export function resolveWorkflowLanePermissions(
  laneKey,
  {
    actorRole = '',
    canEditCoreTransaction = false,
    canEditFinanceWorkflow = false,
    canEditAttorneyWorkflow = false,
    isFinanceOwner = false,
    isTransactionOwner = false,
  } = {},
) {
  const normalizedLaneKey = String(laneKey || '')
    .trim()
    .toLowerCase()
  const laneDefinition = WORKFLOW_LANE_DEFINITIONS[normalizedLaneKey] || null
  const ownedCapabilities = buildCapabilitySet({
    actorRole,
    canEditCoreTransaction,
    canEditFinanceWorkflow,
    canEditAttorneyWorkflow,
    isFinanceOwner,
    isTransactionOwner,
  })
  const editableByRoles = laneDefinition?.editableByRoles || []
  const canEdit = hasAnyCapability(ownedCapabilities, editableByRoles)

  return {
    laneKey: normalizedLaneKey,
    actorRole: normalizeActorRole(actorRole),
    capabilities: [...ownedCapabilities],
    canViewWorkflowLane: true,
    canEditWorkflowLane: canEdit,
    canAdvanceStage: canEdit,
    canApproveDocuments: canEdit,
    canOverrideBlockers: ownedCapabilities.has('admin') || ownedCapabilities.has('developer_owner'),
    canPublishClientVisibleDocument: canEdit,
    editableByRoles,
  }
}
