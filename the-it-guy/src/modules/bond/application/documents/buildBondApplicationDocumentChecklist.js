import {
  getBondApplicationDocumentBuyerStatus,
  getBondApplicationDocumentBuyerStatusLabel,
  isBuyerVisibleDocument,
  normalizeBondApplicationDocumentKey,
} from './bondApplicationDocumentStatus.js'
import { BOND_APPLICATION_DOCUMENT_SATISFACTION_MODES, BOND_APPLICATION_DOCUMENT_TIMING } from './bondApplicationDocumentRules.js'

function getDocumentTypeKeys(document = {}) {
  return [
    document.document_type,
    document.documentType,
    document.document_key,
    document.documentKey,
    document.requirement_key,
    document.requirementKey,
    document.category,
  ].map(normalizeBondApplicationDocumentKey).filter(Boolean)
}

function getLinkedDocumentIds(requirementRow = {}) {
  return [
    requirementRow.uploaded_document_id,
    requirementRow.uploadedDocumentId,
    requirementRow.document_id,
    requirementRow.documentId,
    requirementRow.uploadedDocument?.id,
    requirementRow.uploaded_document?.id,
  ].map((item) => String(item || '').trim()).filter(Boolean)
}

function matchesRequirement(requirement, document, requirementRow = null) {
  if (!isBuyerVisibleDocument(document)) return false
  const documentId = String(document?.id || '').trim()
  const linkedIds = getLinkedDocumentIds(requirementRow || {})
  if (documentId && linkedIds.includes(documentId)) return true
  const documentTypes = new Set(getDocumentTypeKeys(document))
  const aliases = new Set((requirement.matching?.canonicalTypes || []).map(normalizeBondApplicationDocumentKey).filter(Boolean))
  return [...aliases].some((alias) => documentTypes.has(alias))
}

function findRequirementRow(requirement, existingRequiredDocuments = []) {
  const requirementKey = normalizeBondApplicationDocumentKey(requirement.key)
  return existingRequiredDocuments.find((row) =>
    normalizeBondApplicationDocumentKey(row.document_key || row.key || row.requirement_key) === requirementKey,
  ) || null
}

function requirementAllowsMultipleFiles(requirement = {}) {
  return Boolean(requirement.allowMultipleFiles || requirement.allowMultiple || Number(requirement.minimumFileCount || 1) > 1)
}

export function matchBondApplicationDocumentsToRequirement({
  requirement,
  existingRequiredDocuments = [],
  existingDocuments = [],
} = {}) {
  const requirementRow = findRequirementRow(requirement, existingRequiredDocuments)
  const documents = (existingDocuments || []).filter((document) => matchesRequirement(requirement, document, requirementRow))
  const allowsMultipleFiles = requirementAllowsMultipleFiles(requirement)
  return {
    requirementRow,
    documents,
    ambiguous: !allowsMultipleFiles &&
      documents.length > Math.max(Number(requirement.minimumFileCount || 1), 1) &&
      !getLinkedDocumentIds(requirementRow || {}).length,
  }
}

function mergeExternallyRequestedRequirements(existingRequiredDocuments = [], managedKeys = new Set()) {
  return existingRequiredDocuments
    .filter((row) => {
      const key = normalizeBondApplicationDocumentKey(row.document_key || row.key || row.requirement_key)
      if (!key || managedKeys.has(key)) return false
      if (row.enabled === false || row.is_required === false) return false
      const role = normalizeBondApplicationDocumentKey(row.required_from_role || row.requiredFromRole)
      const scope = normalizeBondApplicationDocumentKey(row.visibility_scope || row.visibilityScope)
      if (role && !['client', 'buyer', 'primary_applicant'].includes(role)) return false
      if (scope && ['internal', 'admin', 'seller'].includes(scope)) return false
      return true
    })
    .map((row, index) => ({
      key: row.document_key || row.key || row.requirement_key || `external_requirement_${index}`,
      active: true,
      required: row.is_required !== false,
      title: row.document_label || row.label || row.title || 'Requested document',
      description: row.description || row.notes || 'This document has been requested for your application.',
      category: row.group_label || row.groupKey || 'Requested documents',
      requiredBefore: row.required_before || row.requiredBefore || BOND_APPLICATION_DOCUMENT_TIMING.requiredBeforeSignature,
      satisfactionMode: 'uploaded',
      minimumFileCount: 1,
      participantRole: 'primary_applicant',
      source: 'external',
      matching: { canonicalTypes: [row.document_key || row.key || row.requirement_key].filter(Boolean) },
    }))
}

export function buildBondApplicationDocumentChecklist({
  activeRequirements = [],
  existingRequiredDocuments = [],
  existingDocuments = [],
} = {}) {
  const managedKeys = new Set(activeRequirements.map((requirement) => normalizeBondApplicationDocumentKey(requirement.key)))
  const requirements = [
    ...activeRequirements,
    ...mergeExternallyRequestedRequirements(existingRequiredDocuments, managedKeys),
  ]

  const items = requirements.map((requirement) => {
    const match = matchBondApplicationDocumentsToRequirement({
      requirement,
      existingRequiredDocuments,
      existingDocuments,
    })
    const status = match.ambiguous
      ? 'missing'
      : getBondApplicationDocumentBuyerStatus({ requirement, matchedDocuments: match.documents })
    const complete = status === 'satisfied' ||
      (status === 'uploaded_pending_review' && requirement.satisfactionMode === BOND_APPLICATION_DOCUMENT_SATISFACTION_MODES.uploaded)
    return {
      requirement,
      requirementRow: match.requirementRow,
      documents: match.ambiguous ? [] : match.documents,
      candidateDocuments: match.ambiguous ? match.documents : [],
      status,
      statusLabel: getBondApplicationDocumentBuyerStatusLabel(status),
      blocking: requirement.required &&
        requirement.requiredBefore === BOND_APPLICATION_DOCUMENT_TIMING.requiredBeforeSignature &&
        !complete,
      complete,
      uploadedCount: match.ambiguous ? 0 : match.documents.length,
      requiredCount: Math.max(Number(requirement.minimumFileCount || 1), 1),
    }
  })

  const groups = [
    { key: 'already_received', title: 'Already received', items: items.filter((item) => item.status === 'satisfied') },
    { key: 'still_required', title: 'Still required', items: items.filter((item) => item.status === 'missing' || item.status === 'partially_satisfied') },
    { key: 'under_review', title: 'Under review', items: items.filter((item) => item.status === 'uploaded_pending_review') },
    { key: 'needs_attention', title: 'Needs attention', items: items.filter((item) => item.status === 'rejected') },
    { key: 'can_be_provided_later', title: 'Can be provided later', items: items.filter((item) =>
      item.status === 'missing' &&
      item.requirement.requiredBefore === BOND_APPLICATION_DOCUMENT_TIMING.requiredBeforeBankSubmission &&
      !item.blocking,
    ) },
  ].map((group) => ({ ...group, items: group.items.filter(Boolean) })).filter((group) => group.items.length)

  return { items, groups }
}
