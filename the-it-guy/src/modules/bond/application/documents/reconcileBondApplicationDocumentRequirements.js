import { BOND_APPLICATION_DOCUMENT_RULE_SET_VERSION, getBondApplicationDocumentManagedKeys } from './bondApplicationDocumentRules.js'
import { buildBondApplicationDocumentRequirementFingerprint } from './resolveBondApplicationDocumentRequirements.js'
import { normalizeBondApplicationDocumentKey } from './bondApplicationDocumentStatus.js'

export const BOND_APPLICATION_DOCUMENT_RECONCILIATION_VERSION = 'phase-3-v1'

function normalizeIdentitySegment(value, fallback = 'none') {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || fallback
}

export function buildBondApplicationRequirementIdentity(requirement = {}) {
  const scope = normalizeIdentitySegment(requirement.scope, 'participant')
  const participantRole = normalizeIdentitySegment(requirement.participantRole, 'primary_applicant')
  const participantKey = scope === 'application'
    ? 'application'
    : normalizeIdentitySegment(requirement.participantKey, participantRole)
  const requirementKey = normalizeIdentitySegment(
    requirement.baseRequirementKey || requirement.key,
    'unknown_requirement',
  )
  return [
    normalizeIdentitySegment(BOND_APPLICATION_DOCUMENT_RECONCILIATION_VERSION),
    scope,
    participantRole,
    participantKey,
    requirementKey,
  ].join(':')
}

function rowRequirementIdentity(row = {}) {
  return String(row.requirement_identity || row.requirementIdentity || '').trim()
}

function rowDocumentKey(row = {}) {
  return normalizeBondApplicationDocumentKey(row.document_key || row.key || row.requirement_key)
}

function rowHasUpload(row = {}) {
  return Boolean(
    row.is_uploaded ||
    row.isUploaded ||
    row.uploaded_document_id ||
    row.uploadedDocumentId,
  )
}

function preferredExistingRow(current, candidate) {
  if (!current) return candidate
  if (rowHasUpload(candidate) && !rowHasUpload(current)) return candidate
  const currentUpdatedAt = Date.parse(current.updated_at || current.updatedAt || current.created_at || 0) || 0
  const candidateUpdatedAt = Date.parse(candidate.updated_at || candidate.updatedAt || candidate.created_at || 0) || 0
  return candidateUpdatedAt > currentUpdatedAt ? candidate : current
}

export function isManagedBondApplicationRequirementRow(row = {}, managedKeys = getBondApplicationDocumentManagedKeys()) {
  const key = rowDocumentKey(row)
  return row.reconciliation_source === 'bond_application_document_reconciliation' ||
    row.group_key === 'bond_application_documents' ||
    key.includes('bond_application_') ||
    managedKeys.has(key)
}

export function buildBondApplicationDocumentReconciliationPlan({
  transactionId = null,
  activeRequirements = [],
  existingRequiredDocuments = [],
  managedKeys = getBondApplicationDocumentManagedKeys(),
} = {}) {
  const existingByIdentity = new Map()
  const existingByKey = new Map()
  ;(existingRequiredDocuments || []).forEach((row) => {
    const identity = rowRequirementIdentity(row)
    const key = rowDocumentKey(row)
    if (identity) existingByIdentity.set(identity, preferredExistingRow(existingByIdentity.get(identity), row))
    if (key) existingByKey.set(key, preferredExistingRow(existingByKey.get(key), row))
  })

  const diagnostics = []
  const seenActiveIdentities = new Set()
  const activeRows = activeRequirements.flatMap((requirement, index) => {
    const normalizedKey = normalizeBondApplicationDocumentKey(requirement.key)
    const requirementIdentity = buildBondApplicationRequirementIdentity(requirement)
    if (seenActiveIdentities.has(requirementIdentity)) {
      diagnostics.push({
        code: 'duplicate_active_requirement_identity',
        requirementIdentity,
        requirementKey: requirement.key || '',
      })
      return []
    }
    seenActiveIdentities.add(requirementIdentity)
    const existing = existingByIdentity.get(requirementIdentity) || existingByKey.get(normalizedKey) || {}
    const profile = requirement.requirementProfile || {}
    return [{
      transaction_id: transactionId || existing.transaction_id || null,
      document_key: requirement.key,
      document_label: requirement.title,
      is_required: requirement.required !== false,
      is_uploaded: Boolean(existing.is_uploaded || existing.isUploaded),
      status: existing.status || existing.requiredDocumentStatus || (existing.is_uploaded ? 'uploaded' : 'missing'),
      enabled: true,
      group_key: 'bond_application_documents',
      group_label: requirement.category || 'Bond application documents',
      description: requirement.description || '',
      required_from_role: 'client',
      visibility_scope: 'client',
      allow_multiple: Boolean(requirement.allowMultipleFiles || requirement.allowMultiple || Number(requirement.minimumFileCount || 1) > 1),
      uploaded_document_id: existing.uploaded_document_id || existing.uploadedDocumentId || null,
      uploaded_at: existing.uploaded_at || existing.uploadedAt || null,
      verified_at: existing.verified_at || existing.verifiedAt || null,
      rejected_at: existing.rejected_at || existing.rejectedAt || null,
      notes: existing.notes || null,
      sort_order: Number(requirement.order || 0) || index + 1,
      canonical_requirement_instance_id: existing.canonical_requirement_instance_id || existing.canonicalRequirementInstanceId || null,
      requirement_identity: requirementIdentity,
      requirement_identity_version: BOND_APPLICATION_DOCUMENT_RECONCILIATION_VERSION,
      requirement_base_key: requirement.baseRequirementKey || requirement.key,
      participant_role: requirement.participantRole || 'primary_applicant',
      participant_key: requirement.participantKey || (requirement.scope === 'application' ? 'application' : requirement.participantRole || 'primary_applicant'),
      requirement_baseline_version: requirement.requirementBaselineVersion || profile.baselineVersion || null,
      originator_profile_key: requirement.originatorProfileKey || profile.profileKey || null,
      originator_profile_version: requirement.originatorProfileVersion || profile.profileVersion || null,
      requirement_profile_fingerprint: requirement.requirementProfileFingerprint || profile.fingerprint || null,
      decision_fingerprint: requirement.decisionFingerprint || null,
      reconciliation_source: 'bond_application_document_reconciliation',
    }]
  })
  const activeIdentities = new Set(activeRows.map((row) => row.requirement_identity))
  const activeKeys = new Set(activeRows.map((row) => rowDocumentKey(row)))
  const inactiveRows = (existingRequiredDocuments || []).filter((row) => {
    const identity = rowRequirementIdentity(row)
    const key = rowDocumentKey(row)
    const stillActive = identity ? activeIdentities.has(identity) : activeKeys.has(key)
    return isManagedBondApplicationRequirementRow(row, managedKeys) && !stillActive
  }).map((row) => ({
    ...row,
    is_required: false,
    enabled: false,
    status: row.is_uploaded || row.uploaded_document_id ? row.status || 'uploaded' : 'not_required',
  }))

  return {
    ruleSetVersion: BOND_APPLICATION_DOCUMENT_RULE_SET_VERSION,
    reconciliationVersion: BOND_APPLICATION_DOCUMENT_RECONCILIATION_VERSION,
    fingerprint: buildBondApplicationDocumentRequirementFingerprint(activeRequirements),
    rowsToUpsert: activeRows,
    inactiveRows,
    reusedRows: activeRows.filter((row) =>
      existingByIdentity.has(row.requirement_identity) || existingByKey.has(rowDocumentKey(row)),
    ),
    diagnostics,
  }
}
