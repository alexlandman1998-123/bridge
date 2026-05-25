import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import {
  calculateMissingBlockers,
  calculatePackCompletion,
  getRequirementReadiness,
  isRequirementProvisionallySatisfied,
  isRequirementSatisfied,
  requirementBlocksWorkflow,
} from './canonicalDocumentResolverService'
import {
  evaluateAllGateReadinessFromRequirements,
  evaluateGateReadinessFromRequirements,
} from './canonicalWorkflowGateService'

export const CANONICAL_DOCUMENT_WORKSPACE_FLAG = 'VITE_CANONICAL_DOCUMENT_WORKSPACE_ENABLED'
export const CANONICAL_READINESS_UI_FLAG = 'VITE_CANONICAL_READINESS_UI_ENABLED'

export const WORKFLOW_GATE_LABELS = Object.freeze({
  listing_ready: 'Listing Ready',
  mandate_ready: 'Mandate Ready',
  otp_ready: 'OTP Ready',
  attorney_instruction_ready: 'Attorney Instruction Ready',
  finance_ready: 'Finance Ready',
  lodgement_ready: 'Lodgement Ready',
  registration_ready: 'Registration Ready',
  handover_ready: 'Handover Ready',
})

export const PACK_ORDER = Object.freeze([
  'seller_identity_fica',
  'seller_authority',
  'property_ownership',
  'property_finance_existing_bond',
  'property_compliance',
  'sectional_title_body_corporate',
  'estate_hoa',
  'tenant_occupancy',
  'marketing_assets',
  'attorney_transfer_readiness',
  'buyer_identity_fica',
  'buyer_finance',
  'bond_originator',
  'attorney_generated_documents',
])

export const PACK_FALLBACKS = Object.freeze({
  seller_identity_fica: {
    display_label: 'Seller Identity & FICA',
    description: 'Identity, address, and legal entity documents for the seller.',
  },
  seller_authority: {
    display_label: 'Seller Authority',
    description: 'Mandates, resolutions, and signing authority documents.',
  },
  property_ownership: {
    display_label: 'Property Ownership',
    description: 'Ownership and property identity documents for the sale.',
  },
  property_finance_existing_bond: {
    display_label: 'Property Finance / Existing Bond',
    description: 'Bond and cancellation information where the property is financed.',
  },
  property_compliance: {
    display_label: 'Property Compliance',
    description: 'Certificates and compliance documents required for transfer.',
  },
  sectional_title_body_corporate: {
    display_label: 'Sectional Title / Body Corporate',
    description: 'Levy, clearance, and body corporate records.',
  },
  estate_hoa: {
    display_label: 'Estate / HOA',
    description: 'HOA levy, clearance, and estate governance records.',
  },
  tenant_occupancy: {
    display_label: 'Tenant / Occupancy',
    description: 'Lease, tenant, deposit, and occupancy information.',
  },
  marketing_assets: {
    display_label: 'Marketing Assets',
    description: 'Photos, plans, videos, and marketing-ready property assets.',
  },
  attorney_transfer_readiness: {
    display_label: 'Attorney / Transfer Readiness',
    description: 'Transfer, instruction, guarantee, lodgement, and registration records.',
  },
  buyer_identity_fica: {
    display_label: 'Buyer Identity & FICA',
    description: 'Buyer identity, address, and entity verification documents.',
  },
  buyer_finance: {
    display_label: 'Buyer Finance',
    description: 'Proof of funds, bond approvals, and finance support documents.',
  },
  bond_originator: {
    display_label: 'Bond Originator',
    description: 'Bond application, affordability, bank submission, and approval records.',
  },
  attorney_generated_documents: {
    display_label: 'Attorney Generated Documents',
    description: 'Generated, signed, or attorney-prepared transaction documents.',
  },
})

const SATISFIED_STATUSES = new Set(['approved', 'completed', 'waived', 'not_applicable'])
const PROVISIONAL_STATUSES = new Set(['uploaded', 'under_review'])
const MISSING_STATUSES = new Set(['pending', 'requested', 'rejected', 'expired'])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function isTruthyFlag(value, fallback = true) {
  const text = normalizeText(value).toLowerCase()
  if (!text) return fallback
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(text)) return true
  if (['0', 'false', 'no', 'off', 'disabled'].includes(text)) return false
  return fallback
}

export function isCanonicalDocumentWorkspaceEnabled(options = {}) {
  if (typeof options.enabled === 'boolean') return options.enabled
  return isTruthyFlag(import.meta.env?.[CANONICAL_DOCUMENT_WORKSPACE_FLAG], true)
}

export function isCanonicalReadinessUiEnabled(options = {}) {
  if (typeof options.enabled === 'boolean') return options.enabled
  return isTruthyFlag(import.meta.env?.[CANONICAL_READINESS_UI_FLAG], true)
}

export function formatCanonicalLabel(value = '') {
  return normalizeText(value).replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function coalesceObject(...values) {
  return values.find((value) => value && typeof value === 'object') || {}
}

function getDefinition(instance = {}) {
  return coalesceObject(instance.document_definitions, instance.document_definition, instance.definition)
}

function getPack(instance = {}) {
  return coalesceObject(instance.document_packs, instance.document_pack, instance.pack)
}

function getPackSortOrder(packKey = '') {
  const explicitIndex = PACK_ORDER.indexOf(packKey)
  return explicitIndex >= 0 ? explicitIndex : PACK_ORDER.length + 1
}

function getPackMeta(packKey = '', pack = {}) {
  const fallback = PACK_FALLBACKS[packKey] || {}
  return {
    key: packKey || 'uncategorised',
    displayLabel: normalizeText(pack.display_label || pack.displayLabel || fallback.display_label) || formatCanonicalLabel(packKey || 'Documents'),
    description: normalizeText(pack.description || fallback.description),
    sortOrder: Number(pack.sort_order ?? pack.sortOrder ?? getPackSortOrder(packKey)) || getPackSortOrder(packKey),
  }
}

function getDocumentLookupKeys(document = {}) {
  return [
    document.id,
    document.document_id,
    document.file_path,
    document.storage_path,
    document.url,
    document.file_url,
    document.canonicalRequirementInstanceId,
    document.canonical_requirement_instance_id,
    document.requirementInstanceId,
    document.requirement_instance_id,
    document.requirementId,
    document.requirement_id,
    document.requirementKey,
    document.requirement_key,
    document.document_type,
    document.documentType,
    document.category,
  ].map((value) => normalizeText(value)).filter(Boolean)
}

function documentLooksLikeDefinition(document = {}, definitionKey = '') {
  const target = normalizeKey(definitionKey)
  if (!target) return false
  return getDocumentLookupKeys(document).some((key) => normalizeKey(key) === target)
}

function getGeneratedDocumentForRequirement(requirement = {}, documentCenter = {}) {
  const definitionKey = requirement.documentDefinitionKey || requirement.document_definition_key
  const allGenerated = [
    ...normalizeArray(documentCenter.signedDocuments),
    ...normalizeArray(documentCenter.generatedDocuments),
    ...normalizeArray(documentCenter.uploadedDocuments).filter((document) => /signed|signature|generated|packet|mandate|otp|addendum/i.test(`${document.document_type || ''} ${document.category || ''} ${document.name || ''}`)),
  ]
  const direct = allGenerated.find((document) => {
    const requirementId = normalizeText(document.canonicalRequirementInstanceId || document.canonical_requirement_instance_id || document.requirementInstanceId || document.requirement_instance_id)
    return requirementId && requirementId === normalizeText(requirement.id)
  })
  if (direct) return direct

  if (definitionKey === 'signed_mandate' || definitionKey === 'generated_mandate') {
    return allGenerated.find((document) => /mandate/i.test(`${document.document_type || ''} ${document.category || ''} ${document.name || ''}`)) || null
  }
  if (definitionKey === 'signed_otp' || definitionKey === 'generated_otp') {
    return allGenerated.find((document) => /otp|offer to purchase|sale agreement/i.test(`${document.document_type || ''} ${document.category || ''} ${document.name || ''}`)) || null
  }
  if (definitionKey === 'signed_addendum') {
    return allGenerated.find((document) => /addendum/i.test(`${document.document_type || ''} ${document.category || ''} ${document.name || ''}`)) || null
  }
  if (definitionKey === 'signed_transfer_documents' || definitionKey === 'transfer_documents') {
    return allGenerated.find((document) => /transfer/i.test(`${document.document_type || ''} ${document.category || ''} ${document.name || ''}`)) || null
  }
  return allGenerated.find((document) => documentLooksLikeDefinition(document, definitionKey)) || null
}

function getUploadedDocumentForRequirement(requirement = {}, documentCenter = {}) {
  const uploaded = normalizeArray(documentCenter.uploadedDocuments)
  const direct = uploaded.find((document) => {
    const requirementId = normalizeText(document.canonicalRequirementInstanceId || document.canonical_requirement_instance_id || document.requirementInstanceId || document.requirement_instance_id)
    return requirementId && requirementId === normalizeText(requirement.id)
  })
  if (direct) return direct

  const satisfiedId = normalizeText(requirement.satisfied_by_document_id || requirement.satisfiedByDocumentId)
  if (satisfiedId) {
    const linked = uploaded.find((document) => getDocumentLookupKeys(document).includes(satisfiedId))
    if (linked) return linked
  }

  return uploaded.find((document) => {
    const requirementKey = normalizeKey(requirement.legacyRequirementKey || requirement.documentDefinitionKey || requirement.document_definition_key)
    return getDocumentLookupKeys(document).some((key) => normalizeKey(key) === requirementKey)
  }) || null
}

export function normalizeCanonicalRequirement(instance = {}, { documentCenter = {}, role = 'seller' } = {}) {
  const definition = getDefinition(instance)
  const pack = getPack(instance)
  const packKey = normalizeText(instance.pack_key || definition.pack_key || pack.key || 'uncategorised')
  const definitionKey = normalizeText(instance.document_definition_key || definition.key)
  const status = normalizeText(instance.status || 'pending').toLowerCase()
  const requirementLevel = normalizeText(instance.requirement_level || definition.default_requirement_level || 'required').toLowerCase()
  const uploadedDocument = getUploadedDocumentForRequirement({ ...instance, documentDefinitionKey: definitionKey }, documentCenter)
  const generatedDocument = getGeneratedDocumentForRequirement({ ...instance, documentDefinitionKey: definitionKey }, documentCenter)
  const linkedDocument = generatedDocument || uploadedDocument || null
  const hasLinkedDocument = Boolean(linkedDocument?.id || linkedDocument?.file_path || linkedDocument?.storage_path || linkedDocument?.url)
  const derivedStatus = hasLinkedDocument && ['pending', 'requested'].includes(status)
    ? (generatedDocument ? 'completed' : 'uploaded')
    : status
  const stageGates = normalizeArray(instance.stage_gates)
  const visibleToRoles = normalizeArray(instance.visible_to_roles || definition.default_visibility)
  const uploadableByRoles = normalizeArray(instance.uploadable_by_roles || definition.default_upload_roles)
  const visible = !visibleToRoles.length ||
    visibleToRoles.includes(role) ||
    visibleToRoles.includes('client') ||
    (role === 'seller' && visibleToRoles.includes('seller')) ||
    (role === 'buyer' && visibleToRoles.includes('buyer'))
  const uploadable = uploadableByRoles.includes(role) ||
    uploadableByRoles.includes('client') ||
    (role === 'seller' && uploadableByRoles.includes('seller')) ||
    (role === 'buyer' && uploadableByRoles.includes('buyer'))

  return {
    ...instance,
    id: normalizeText(instance.id),
    documentDefinitionKey: definitionKey,
    document_definition_key: definitionKey,
    packKey,
    pack_key: packKey,
    pack,
    packMeta: getPackMeta(packKey, pack),
    title: normalizeText(definition.display_label || instance.display_label || definitionKey) || 'Document',
    description: normalizeText(definition.description || instance.description || 'This document is required for your transaction.'),
    requirementLevel,
    requirement_level: requirementLevel,
    status: derivedStatus,
    rawStatus: status,
    stageGates,
    stage_gates: stageGates,
    visibleToRoles,
    uploadableByRoles,
    requestedFromRole: normalizeText(instance.requested_from_role || instance.requestedFromRole),
    reviewerRole: normalizeText(instance.reviewer_role || instance.reviewerRole),
    rejectionReason: normalizeText(instance.rejection_reason || instance.rejectionReason),
    waiverReason: normalizeText(instance.waiver_reason || instance.waiverReason),
    expiryDate: normalizeText(instance.expiry_date || instance.expiryDate),
    linkedDocument,
    generatedDocument,
    uploadedDocument,
    hasLinkedDocument,
    canUpload: uploadable && !['approved', 'completed', 'waived', 'not_applicable'].includes(derivedStatus),
    uploadSpec: {
      type: 'canonical_requirement',
      requirementInstanceId: normalizeText(instance.id),
      requirementKey: definitionKey,
      documentDefinitionKey: definitionKey,
      documentType: definitionKey,
      category: packKey,
    },
    visible,
    satisfied: SATISFIED_STATUSES.has(derivedStatus) || isRequirementSatisfied({ ...instance, status: derivedStatus }),
    provisionallySatisfied: PROVISIONAL_STATUSES.has(derivedStatus) || isRequirementProvisionallySatisfied({ ...instance, status: derivedStatus }),
    missing: MISSING_STATUSES.has(derivedStatus),
    blocksWorkflow: requirementBlocksWorkflow({ ...instance, status: derivedStatus }),
  }
}

export function getRequirementUploadState(requirement = {}) {
  if (requirement.generatedDocument) return 'generated'
  if (requirement.uploadedDocument || requirement.hasLinkedDocument) return 'uploaded'
  if (requirement.status === 'rejected') return 'reupload_required'
  return 'waiting'
}

export function getPackReadiness(requirements = [], packKey = '') {
  return calculatePackCompletion(requirements, packKey)
}

export function getWorkflowGateReadiness(requirements = [], gate = '') {
  return evaluateGateReadinessFromRequirements(requirements, gate)
}

export function getMissingBlockers(requirements = [], gate = '') {
  return calculateMissingBlockers(requirements, gate)
}

export function buildCanonicalDocumentWorkspaceModel({ requirements = [], documentCenter = {}, role = 'seller' } = {}) {
  const normalized = requirements
    .map((item) => normalizeCanonicalRequirement(item, { documentCenter, role }))
    .filter((item) => item.id && item.visible && item.status !== 'not_applicable')

  const grouped = new Map()
  for (const requirement of normalized) {
    const key = requirement.packKey || 'uncategorised'
    if (!grouped.has(key)) {
      grouped.set(key, {
        ...requirement.packMeta,
        key,
        requirements: [],
      })
    }
    grouped.get(key).requirements.push(requirement)
  }

  const packs = Array.from(grouped.values())
    .map((pack) => {
      const readiness = getPackReadiness(normalized, pack.key)
      const missing = pack.requirements.filter((item) => item.missing)
      const blockers = pack.requirements.filter((item) => requirementBlocksWorkflow(item))
      const uploaded = pack.requirements.filter((item) => item.uploadedDocument || item.generatedDocument || item.hasLinkedDocument)
      return {
        ...pack,
        readiness,
        percentComplete: readiness.percentComplete,
        completedCount: readiness.satisfiedCount,
        provisionalCount: readiness.provisionalCount,
        missingCount: missing.length,
        blockerCount: blockers.length,
        uploadedCount: uploaded.length,
        uploadProgress: pack.requirements.length ? Math.round((uploaded.length / pack.requirements.length) * 100) : 100,
      }
    })
    .sort((a, b) => (a.sortOrder - b.sortOrder) || a.displayLabel.localeCompare(b.displayLabel))

  const readiness = getRequirementReadiness(normalized)
  const gates = evaluateAllGateReadinessFromRequirements(normalized).map((gate) => ({
    ...gate,
    label: gate.display_label || WORKFLOW_GATE_LABELS[gate.gate] || formatCanonicalLabel(gate.gate),
    blockers: gate.blockers?.length ? gate.blockers : getMissingBlockers(normalized, gate.gate),
    affectedPacks: packs
      .filter((pack) => pack.requirements.some((requirement) => requirement.stageGates.includes(gate.gate)))
      .map((pack) => pack.key),
  }))
  const criticalMissing = normalized
    .filter((item) => requirementBlocksWorkflow(item))
    .sort((a, b) => {
      const levelOrder = { blocker: 0, required: 1, recommended: 2, optional: 3 }
      return (levelOrder[a.requirementLevel] ?? 9) - (levelOrder[b.requirementLevel] ?? 9) ||
        a.title.localeCompare(b.title)
    })
  const needsReview = normalized.filter((item) => ['uploaded', 'under_review'].includes(item.status))
  const rejected = normalized.filter((item) => item.status === 'rejected')

  return {
    requirements: normalized,
    packs,
    readiness: {
      ...readiness,
      gates,
    },
    criticalMissing,
    needsReview,
    rejected,
    hasRequirements: normalized.length > 0,
  }
}

export async function getCanonicalRequirementsForContext({ contextType, contextId, client = supabase } = {}) {
  const db = client || supabase
  if (!isSupabaseConfigured || !db || !contextType || !contextId) return []
  const result = await db
    .from('document_requirement_instances')
    .select('*, document_definitions(*), document_packs(*)')
    .eq('context_type', contextType)
    .eq('context_id', contextId)
    .neq('status', 'not_applicable')
    .order('pack_key', { ascending: true })
    .order('document_definition_key', { ascending: true })
  if (result.error) throw result.error
  return result.data || []
}

export async function getCanonicalRequirementsForListing({ listingId, client = supabase } = {}) {
  return getCanonicalRequirementsForContext({
    contextType: 'private_listing',
    contextId: listingId,
    client,
  })
}

export async function getCanonicalRequirementsForTransaction({ transactionId, client = supabase } = {}) {
  return getCanonicalRequirementsForContext({
    contextType: 'transaction',
    contextId: transactionId,
    client,
  })
}

export function useCanonicalRequirements({ contextType, contextId, documentCenter = {}, role = 'seller', enabled = true } = {}) {
  const [state, setState] = useState({
    loading: Boolean(enabled && contextType && contextId),
    error: null,
    requirements: [],
  })

  const load = useCallback(async () => {
    if (!enabled || !contextType || !contextId || !isCanonicalDocumentWorkspaceEnabled()) {
      setState({ loading: false, error: null, requirements: [] })
      return
    }
    setState((previous) => ({ ...previous, loading: true, error: null }))
    try {
      const requirements = await getCanonicalRequirementsForContext({ contextType, contextId })
      setState({ loading: false, error: null, requirements })
    } catch (error) {
      setState({ loading: false, error, requirements: [] })
    }
  }, [contextType, contextId, enabled])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  const model = useMemo(
    () => buildCanonicalDocumentWorkspaceModel({ requirements: state.requirements, documentCenter, role }),
    [documentCenter, role, state.requirements],
  )

  return {
    ...state,
    model,
    reload: load,
  }
}
