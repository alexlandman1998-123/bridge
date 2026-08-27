import { BOND_APPLICATION_DOCUMENT_RULE_SET_VERSION, getBondApplicationDocumentManagedKeys } from './bondApplicationDocumentRules.js'
import { buildBondApplicationDocumentRequirementFingerprint } from './resolveBondApplicationDocumentRequirements.js'
import { normalizeBondApplicationDocumentKey } from './bondApplicationDocumentStatus.js'

function baseRequirementKey(value = '') {
  return normalizeBondApplicationDocumentKey(String(value || '').split(':').at(-1))
}

function isManagedBondApplicationKey(value = '', managedKeys = new Set()) {
  const normalized = normalizeBondApplicationDocumentKey(value)
  return managedKeys.has(normalized) || managedKeys.has(baseRequirementKey(normalized))
}

export function buildBondApplicationDocumentReconciliationPlan({
  transactionId = null,
  activeRequirements = [],
  existingRequiredDocuments = [],
  managedKeys = getBondApplicationDocumentManagedKeys(),
} = {}) {
  const existingByKey = new Map(
    (existingRequiredDocuments || []).map((row) => [
      normalizeBondApplicationDocumentKey(row.document_key || row.key || row.requirement_key),
      row,
    ]),
  )
  const existingByBaseKey = new Map(
    (existingRequiredDocuments || []).map((row) => [
      baseRequirementKey(row.document_key || row.key || row.requirement_key),
      row,
    ]),
  )
  const activeRows = activeRequirements.map((requirement, index) => {
    const normalizedKey = normalizeBondApplicationDocumentKey(requirement.key)
    const fallbackKey = normalizeBondApplicationDocumentKey(requirement.baseRequirementKey)
    const existing =
      existingByKey.get(normalizedKey) ||
      existingByKey.get(fallbackKey) ||
      existingByBaseKey.get(baseRequirementKey(fallbackKey)) ||
      {}
    return {
      transaction_id: transactionId || existing.transaction_id || null,
      document_key: requirement.key,
      canonical_document_key: requirement.canonicalDocumentType || existing.canonical_document_key || requirement.baseRequirementKey || requirement.key,
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
      participant_key: requirement.participantKey || null,
      participant_id: requirement.participantId || null,
      participant_role: requirement.participantRole || null,
      participant_name: requirement.participantName || null,
    }
  })
  const activeKeys = new Set(activeRows.map((row) => normalizeBondApplicationDocumentKey(row.document_key)))
  const inactiveRows = (existingRequiredDocuments || []).filter((row) => {
    const key = normalizeBondApplicationDocumentKey(row.document_key || row.key || row.requirement_key)
    return isManagedBondApplicationKey(key, managedKeys) && !activeKeys.has(key)
  }).map((row) => ({
    ...row,
    is_required: false,
    enabled: false,
    status: row.is_uploaded || row.uploaded_document_id ? row.status || 'uploaded' : 'not_required',
  }))

  return {
    ruleSetVersion: BOND_APPLICATION_DOCUMENT_RULE_SET_VERSION,
    fingerprint: buildBondApplicationDocumentRequirementFingerprint(activeRequirements),
    rowsToUpsert: activeRows,
    inactiveRows,
    reusedRows: activeRows.filter((row) => existingByKey.has(normalizeBondApplicationDocumentKey(row.document_key))),
  }
}
