import {
  isMissingTableError,
  requireClient,
} from './attorneyFirmServiceShared.js'

const CLIENT_ROLES = new Set(['buyer', 'seller'])
const INTERNAL_ROLES = new Set([
  'admin',
  'attorney',
  'bond_attorney',
  'cancellation_attorney',
  'conveyancer',
  'developer',
  'internal_admin',
  'platform_admin',
  'transfer_attorney',
])

const ROLE_AUDIENCE = Object.freeze({
  admin: ['admin', 'agent', 'attorney', 'bond_originator', 'buyer', 'cancellation_attorney', 'originator', 'seller', 'transfer_attorney', 'bond_attorney'],
  agent: ['agent'],
  attorney: ['attorney', 'bond_attorney', 'cancellation_attorney', 'conveyancer', 'transfer_attorney'],
  bond_attorney: ['attorney', 'bond_attorney'],
  bond_originator: ['bond_originator', 'originator'],
  buyer: ['buyer'],
  cancellation_attorney: ['attorney', 'cancellation_attorney'],
  conveyancer: ['attorney', 'bond_attorney', 'cancellation_attorney', 'conveyancer', 'transfer_attorney'],
  developer: ['admin', 'agent', 'attorney', 'bond_originator', 'buyer', 'cancellation_attorney', 'originator', 'seller', 'transfer_attorney', 'bond_attorney'],
  internal_admin: ['admin', 'agent', 'attorney', 'bond_originator', 'buyer', 'cancellation_attorney', 'originator', 'seller', 'transfer_attorney', 'bond_attorney'],
  platform_admin: ['admin', 'agent', 'attorney', 'bond_originator', 'buyer', 'cancellation_attorney', 'originator', 'seller', 'transfer_attorney', 'bond_attorney'],
  seller: ['seller'],
  transfer_attorney: ['attorney', 'transfer_attorney'],
})

function normalizeRole(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeAudience(value) {
  const source = Array.isArray(value) ? value : []
  return [...new Set(source.map((item) => normalizeRole(item)).filter(Boolean))]
}

function toIso(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

const ATTORNEY_LANES = Object.freeze({
  attorney: 'transfer', conveyancer: 'transfer', transfer: 'transfer', transfer_attorney: 'transfer',
  bond: 'bond', bond_registration: 'bond', bond_attorney: 'bond',
  cancellation: 'cancellation', seller_bond_cancellation: 'cancellation', cancellation_attorney: 'cancellation',
})

function canRoleSeeActivity(activity, viewerRole, viewerLaneKeys) {
  const role = normalizeRole(viewerRole)
  const visibility = normalizeRole(activity?.visibility)
  const audience = normalizeAudience(activity?.audience_json || activity?.audience)
  const acceptedAudiences = [...(ROLE_AUDIENCE[role] || [])]
  if (visibility === 'internal' && INTERNAL_ROLES.has(role) && Array.isArray(viewerLaneKeys)) {
    for (const lane of viewerLaneKeys) {
      const key = ATTORNEY_LANES[normalizeRole(lane)]
      if (key) acceptedAudiences.push(`${key}_attorney`)
    }
  }

  if (!acceptedAudiences.some((candidate) => audience.includes(candidate))) return false
  if (CLIENT_ROLES.has(role)) return visibility === 'client_visible'
  if (visibility === 'internal') {
    const privateLane = ATTORNEY_LANES[normalizeRole(activity?.lane_key || activity?.laneKey)]
    if (privateLane && !['admin', 'platform_admin', 'internal_admin', 'developer'].includes(role)) {
      const lanes = Array.isArray(viewerLaneKeys) ? viewerLaneKeys : [ATTORNEY_LANES[role]]
      if (!lanes.some((lane) => ATTORNEY_LANES[normalizeRole(lane)] === privateLane)) return false
    }
    if (role === 'agent') {
      return activity?.canonical_event_type === 'AgentWorkflowOverrideApplied' || activity?.eventType === 'AgentWorkflowOverrideApplied'
    }
    return INTERNAL_ROLES.has(role)
  }
  return visibility === 'professional_shared' || visibility === 'client_visible'
}

function mapActivity(row = {}) {
  return {
    id: row.id || null,
    commandReceiptId: row.command_receipt_id || null,
    canonicalEventId: row.canonical_event_id || null,
    eventType: row.canonical_event_type || null,
    laneKey: row.lane_key || null,
    visibility: row.visibility || null,
    audience: normalizeAudience(row.audience_json),
    title: row.title || '',
    description: row.description || '',
    payload: row.payload_json && typeof row.payload_json === 'object' ? row.payload_json : {},
    occurredAt: toIso(row.occurred_at),
  }
}

function mapLane(lane = {}) {
  return {
    key: lane.key || lane.laneKey || lane.processType || null,
    label: lane.label || null,
    status: lane.status || lane.laneStatus || null,
    ownerType: lane.ownerType || lane.owner_type || null,
    currentStep: lane.currentStep || lane.currentStage || null,
    updatedAt: toIso(lane.updatedAt || lane.updated_at),
    blockers: Array.isArray(lane.blockers) ? lane.blockers : [],
  }
}

export function buildTransactionSyncReadModel({
  transactionId,
  viewerRole,
  viewerLaneKeys,
  workflowReadModel = null,
  activityRows = [],
  refreshSignal = null,
  warnings = [],
} = {}) {
  const role = normalizeRole(viewerRole)
  const activities = (activityRows || [])
    .filter((row) => canRoleSeeActivity(row, role, viewerLaneKeys))
    .map(mapActivity)
    .sort((left, right) => String(right.occurredAt || '').localeCompare(String(left.occurredAt || '')))

  return Object.freeze({
    schemaVersion: 1,
    transactionId: String(transactionId || '').trim() || null,
    viewerRole: role || null,
    version: Number(refreshSignal?.version || 0),
    changedAt: toIso(refreshSignal?.changed_at),
    generatedAt: new Date().toISOString(),
    stage: Object.freeze({
      main: workflowReadModel?.mainStage || null,
      detailed: workflowReadModel?.detailedStage || null,
    }),
    lanes: Object.freeze((workflowReadModel?.lanes || []).map(mapLane)),
    activity: Object.freeze(activities),
    sharedProgress: Object.freeze([...(workflowReadModel?.sharedProgress || [])]),
    warnings: Object.freeze([...(warnings || [])]),
  })
}

async function readActivity(client, transactionId, limit) {
  const result = await client
    .from('transaction_activity_projections')
    .select('id, command_receipt_id, canonical_event_id, canonical_event_type, lane_key, visibility, audience_json, title, description, payload_json, occurred_at')
    .eq('transaction_id', transactionId)
    .order('occurred_at', { ascending: false })
    .limit(limit)
  if (result.error) throw result.error
  return result.data || []
}

async function readRefreshSignal(client, transactionId) {
  const result = await client
    .from('transaction_refresh_signals')
    .select('transaction_id, version, command_receipt_id, canonical_event_id, changed_at')
    .eq('transaction_id', transactionId)
    .maybeSingle()
  if (result.error) throw result.error
  return result.data || null
}

export async function getTransactionSyncReadModel(transactionId, options = {}) {
  const normalizedTransactionId = String(transactionId || '').trim()
  if (!normalizedTransactionId) throw new Error('Transaction id is required.')
  const client = options.client || requireClient()
  const warnings = []
  const [activityRows, refreshSignal] = await Promise.all([
    readActivity(client, normalizedTransactionId, Math.min(Math.max(Number(options.limit) || 100, 1), 250))
      .catch((error) => {
        if (isMissingTableError(error, 'transaction_activity_projections')) {
          warnings.push('Phase 2 activity projection is not deployed.')
          return []
        }
        throw error
      }),
    readRefreshSignal(client, normalizedTransactionId).catch((error) => {
      if (isMissingTableError(error, 'transaction_refresh_signals')) {
        warnings.push('Phase 2 refresh watermark is not deployed.')
        return null
      }
      throw error
    }),
  ])

  return buildTransactionSyncReadModel({
    transactionId: normalizedTransactionId,
    viewerRole: options.viewerRole,
    viewerLaneKeys: options.viewerLaneKeys,
    workflowReadModel: options.workflowReadModel,
    activityRows,
    refreshSignal,
    warnings,
  })
}

async function getRoleTransactionSyncReadModel(transactionId, viewerRole, options = {}) {
  if (options.workflowReadModel) {
    return getTransactionSyncReadModel(transactionId, { ...options, viewerRole })
  }

  const { getTransactionWorkflowReadModel } = await import('./transactionWorkflowReadModelService.js')
  const workflowReadModel = await getTransactionWorkflowReadModel(transactionId, {
    client: options.client,
    viewerRole,
    canViewPrivate: INTERNAL_ROLES.has(viewerRole),
  })
  if (workflowReadModel?.transactionSync) return workflowReadModel.transactionSync
  return getTransactionSyncReadModel(transactionId, {
    ...options,
    viewerRole,
    workflowReadModel,
  })
}

export function getBuyerTransactionSyncReadModel(transactionId, options = {}) {
  return getRoleTransactionSyncReadModel(transactionId, 'buyer', options)
}

export function getSellerTransactionSyncReadModel(transactionId, options = {}) {
  return getRoleTransactionSyncReadModel(transactionId, 'seller', options)
}

export function getAgentTransactionSyncReadModel(transactionId, options = {}) {
  return getRoleTransactionSyncReadModel(transactionId, 'agent', options)
}

export function getBondOriginatorTransactionSyncReadModel(transactionId, options = {}) {
  return getRoleTransactionSyncReadModel(transactionId, 'bond_originator', options)
}

export function getAttorneyTransactionSyncReadModel(transactionId, options = {}) {
  const role = normalizeRole(options.viewerRole)
  return getRoleTransactionSyncReadModel(transactionId,
    ['attorney', 'conveyancer', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney'].includes(role) ? role : 'attorney', options)
}
