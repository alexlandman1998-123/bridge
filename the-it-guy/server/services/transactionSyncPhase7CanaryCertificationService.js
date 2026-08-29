import { createHash } from 'node:crypto'

import {
  buildTransactionSyncReadModel,
} from '../../src/services/transactionSyncReadModelService.js'
import {
  runTransactionSyncPhase5OperationalAssurance,
} from './transactionSyncPhase5OperationalAssuranceService.js'

export const TRANSACTION_SYNC_CERTIFICATION_ROLES = Object.freeze([
  'buyer',
  'seller',
  'agent',
  'bond_originator',
  'attorney',
])

function normalizedAudience(row = {}) {
  return (Array.isArray(row.audience_json) ? row.audience_json : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
}

function laneFingerprint(model = {}) {
  return JSON.stringify([...(model.lanes || [])]
    .map((lane) => ({ key: lane.key, status: lane.status, currentStep: lane.currentStep }))
    .sort((left, right) => String(left.key || '').localeCompare(String(right.key || ''))))
}

function stageFingerprint(model = {}) {
  return JSON.stringify(model.stage || null)
}

function addIssue(issues, code, detail = {}) {
  issues.push({ code, ...detail })
}

function stableEvidence(value) {
  if (Array.isArray(value)) return value.map(stableEvidence)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableEvidence(value[key])]))
}

export function buildTransactionSyncCanaryCertification({
  transactionId,
  phase5Assessment,
  roleModels = {},
  activityRows = [],
} = {}) {
  const issues = []
  if (phase5Assessment?.status !== 'healthy') {
    addIssue(issues, 'phase5_health_not_green', { status: phase5Assessment?.status || 'missing' })
  }

  for (const role of TRANSACTION_SYNC_CERTIFICATION_ROLES) {
    if (!roleModels[role]) addIssue(issues, 'role_projection_missing', { role })
  }
  const models = TRANSACTION_SYNC_CERTIFICATION_ROLES.map((role) => roleModels[role]).filter(Boolean)
  const versions = [...new Set(models.map((model) => Number(model.version || 0)))]
  if (versions.length !== 1 || versions[0] < 1) addIssue(issues, 'role_version_mismatch', { versions })
  if (new Set(models.map(laneFingerprint)).size > 1) addIssue(issues, 'role_lane_mismatch')
  if (new Set(models.map(stageFingerprint)).size > 1) addIssue(issues, 'role_stage_mismatch')

  for (const role of ['buyer', 'seller']) {
    for (const activity of roleModels[role]?.activity || []) {
      if (activity.visibility !== 'client_visible' || !activity.audience.includes(role)) {
        addIssue(issues, 'client_visibility_leak', { role, activityId: activity.id })
      }
    }
  }
  for (const role of ['agent', 'bond_originator']) {
    for (const activity of roleModels[role]?.activity || []) {
      const allowedAgentOverride = role === 'agent' && activity.eventType === 'AgentWorkflowOverrideApplied'
      if (activity.visibility === 'internal' && !allowedAgentOverride) {
        addIssue(issues, 'professional_internal_leak', { role, activityId: activity.id })
      }
    }
  }

  const visibleIdsByRole = Object.fromEntries(TRANSACTION_SYNC_CERTIFICATION_ROLES.map((role) => [
    role,
    new Set((roleModels[role]?.activity || []).map((activity) => activity.id)),
  ]))
  for (const row of activityRows) {
    const audience = normalizedAudience(row)
    const visibility = String(row.visibility || '').trim().toLowerCase()
    if (!String(row.title || '').trim() || !String(row.description || '').trim()) {
      addIssue(issues, 'activity_safe_copy_missing', { activityId: row.id })
    }
    if (visibility === 'client_visible') {
      if (!audience.includes('buyer') && !audience.includes('seller')) {
        addIssue(issues, 'client_activity_recipient_missing', { activityId: row.id })
      }
      if (row.payload_json && typeof row.payload_json === 'object' && Object.keys(row.payload_json).length) {
        addIssue(issues, 'client_activity_payload_not_empty', { activityId: row.id })
      }
      if (audience.includes('buyer') && !visibleIdsByRole.buyer.has(row.id)) {
        addIssue(issues, 'buyer_activity_missing', { activityId: row.id })
      }
      if (audience.includes('seller') && !visibleIdsByRole.seller.has(row.id)) {
        addIssue(issues, 'seller_activity_missing', { activityId: row.id })
      }
    }
    if (visibility === 'professional_shared' && (
      visibleIdsByRole.buyer.has(row.id) || visibleIdsByRole.seller.has(row.id)
    )) addIssue(issues, 'professional_activity_client_leak', { activityId: row.id })
    if (visibility === 'internal') {
      if (visibleIdsByRole.buyer.has(row.id) || visibleIdsByRole.seller.has(row.id) || visibleIdsByRole.bond_originator.has(row.id)) {
        addIssue(issues, 'internal_activity_external_leak', { activityId: row.id })
      }
      if (visibleIdsByRole.agent.has(row.id) && row.canonical_event_type !== 'AgentWorkflowOverrideApplied') {
        addIssue(issues, 'agent_internal_activity_overexposed', { activityId: row.id })
      }
    }
  }

  const roleVersions = Object.fromEntries(TRANSACTION_SYNC_CERTIFICATION_ROLES.map((role) => [
    role,
    Number(roleModels[role]?.version || 0),
  ]))
  const evidence = stableEvidence({
    transactionId,
    phase5Status: phase5Assessment?.status || 'missing',
    version: versions.length === 1 ? versions[0] : 0,
    roleVersions,
    stages: Object.fromEntries(TRANSACTION_SYNC_CERTIFICATION_ROLES.map((role) => [role, roleModels[role]?.stage || null])),
    laneFingerprints: Object.fromEntries(TRANSACTION_SYNC_CERTIFICATION_ROLES.map((role) => [role, laneFingerprint(roleModels[role])])),
    activityIds: Object.fromEntries(TRANSACTION_SYNC_CERTIFICATION_ROLES.map((role) => [role, [...(visibleIdsByRole[role] || [])].sort()])),
    issueCodes: issues.map((issue) => issue.code).sort(),
  })
  const evidenceHash = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')

  return {
    transactionId: transactionId || null,
    status: issues.length ? 'failed' : 'passed',
    certified: issues.length === 0,
    canonicalVersion: versions.length === 1 ? versions[0] : 0,
    phase5Status: phase5Assessment?.status || 'failed',
    roleVersions,
    evidenceHash,
    issues,
    summary: {
      rolesChecked: TRANSACTION_SYNC_CERTIFICATION_ROLES.length,
      canonicalActivityCount: activityRows.length,
      issueCount: issues.length,
    },
  }
}

async function requiredQuery(promise, label) {
  const result = await promise
  if (result.error) throw new Error(`${label}: ${result.error.message || 'query failed'}`)
  return result.data || null
}

export async function runTransactionSyncPhase7CanaryCertification(client, options = {}) {
  const transactionId = String(options.transactionId || '').trim()
  const reason = String(options.reason || '').trim()
  if (!transactionId) throw new Error('Canary certification requires one transaction id.')
  if (reason.length < 12 || reason.length > 500) throw new Error('A certification reason between 12 and 500 characters is required.')

  const phase5 = await runTransactionSyncPhase5OperationalAssurance(client, {
    transactionId,
    limit: 1,
    receiptLimit: options.receiptLimit,
    includeDemo: options.includeDemo === true,
  })
  const phase5Assessment = phase5.rows.find((row) => row.transactionId === transactionId) || {
    transactionId,
    status: 'failed',
    issues: phase5.failures,
  }
  const { getTransactionWorkflowReadModel } = await import('../../src/services/transactionWorkflowReadModelService.js')
  const [workflowReadModel, activityRows, refreshSignal] = await Promise.all([
    getTransactionWorkflowReadModel(transactionId, {
      client,
      viewerRole: 'admin',
      canViewPrivate: true,
    }),
    requiredQuery(client.from('transaction_activity_projections')
      .select('id,command_receipt_id,canonical_event_id,canonical_event_type,lane_key,visibility,audience_json,title,description,payload_json,occurred_at')
      .eq('transaction_id', transactionId)
      .order('occurred_at', { ascending: false })
      .limit(Math.min(Math.max(Number(options.receiptLimit) || 1000, 1), 5000)), 'activity projections'),
    requiredQuery(client.from('transaction_refresh_signals')
      .select('transaction_id,version,command_receipt_id,canonical_event_id,changed_at')
      .eq('transaction_id', transactionId)
      .maybeSingle(), 'refresh signal'),
  ])
  const roleModels = Object.fromEntries(TRANSACTION_SYNC_CERTIFICATION_ROLES.map((role) => [
    role,
    buildTransactionSyncReadModel({
      transactionId,
      viewerRole: role,
      workflowReadModel,
      activityRows: activityRows || [],
      refreshSignal,
    }),
  ]))
  const certification = buildTransactionSyncCanaryCertification({
    transactionId,
    phase5Assessment,
    roleModels,
    activityRows: activityRows || [],
  })

  let certificationRunId = null
  if (options.certify === true) {
    const inserted = await requiredQuery(client.from('transaction_sync_certification_runs').insert({
      transaction_id: transactionId,
      environment: String(options.environment || '').trim().toLowerCase(),
      project_ref: String(options.projectRef || '').trim().toLowerCase(),
      status: certification.status,
      canonical_version: certification.canonicalVersion,
      phase5_status: certification.phase5Status,
      role_versions_json: certification.roleVersions,
      issue_codes_json: certification.issues.map((issue) => issue.code),
      summary_json: certification.summary,
      evidence_hash: certification.evidenceHash,
      certification_reason: reason,
    }).select('id').single(), 'certification receipt')
    certificationRunId = inserted?.id || null
  }

  return {
    phase: 7,
    mode: options.certify === true ? 'certify' : 'plan',
    releaseReady: certification.certified,
    certificationRunId,
    phase5,
    certification,
  }
}
