const ROLE_LABELS = {
  agent: 'Agent',
  attorney: 'Attorney',
  bond_originator: 'Bond Originator',
  buyer: 'Buyer',
  cancellation_attorney: 'Cancellation Attorney',
  client: 'Client',
  developer: 'Developer',
  seller: 'Seller',
  system: 'System',
}

const GROUP_LABELS = {
  buyer_fica: 'Buyer & FICA',
  buyer_entity: 'Buyer & FICA',
  seller_fica: 'Seller & FICA',
  seller_entity: 'Seller & FICA',
  property: 'Property',
  finance: 'Finance',
  transfer: 'Transfer',
  cancellation: 'Cancellation',
  sale: 'Sale',
  handover: 'Handover',
}

const CANONICAL_DOCUMENT_DEFINITIONS = [
  {
    keys: ['bond_grant', 'grant_letter', 'bond_grant_letter', 'bond_approval'],
    label: 'Bond grant',
    documentType: 'bond_grant',
    groupKey: 'finance',
    groupLabel: 'Finance',
    requiredFromRole: 'bond_originator',
    visibilityScope: 'client',
    attorneyCategory: 'Guarantees',
    libraryCategory: 'bond',
    collectionGroupKey: 'buyer',
    collectionBucketKey: 'finance',
    owningWorkflow: 'Finance',
    visibleSection: 'finance_documents',
    blockingStage: 'FIN',
    financeLane: 'bond',
    source: 'bond_originator',
    confidence: 1,
  },
  {
    keys: ['bond_preapproval', 'bond_application', 'home_loan_application'],
    label: 'Bond pre-approval / application',
    documentType: 'bond_preapproval',
    groupKey: 'finance',
    groupLabel: 'Finance',
    requiredFromRole: 'bond_originator',
    visibilityScope: 'client',
    attorneyCategory: 'Guarantees',
    libraryCategory: 'bond',
    collectionGroupKey: 'buyer',
    collectionBucketKey: 'finance',
    owningWorkflow: 'Finance',
    visibleSection: 'finance_documents',
    blockingStage: 'FIN',
    financeLane: 'bond',
    source: 'bond_originator',
    confidence: 1,
  },
  {
    keys: ['purchase_price_guarantee', 'guarantee', 'guarantee_letter'],
    label: 'Guarantee',
    documentType: 'purchase_price_guarantee',
    groupKey: 'finance',
    groupLabel: 'Finance',
    requiredFromRole: 'bond_originator',
    visibilityScope: 'shared',
    attorneyCategory: 'Guarantees',
    libraryCategory: 'bond',
    collectionGroupKey: 'buyer',
    collectionBucketKey: 'finance',
    owningWorkflow: 'Finance',
    visibleSection: 'finance_documents',
    blockingStage: 'FIN',
    financeLane: 'bond',
    source: 'bond_originator',
    confidence: 1,
  },
  {
    keys: ['proof_of_funds', 'proof_of_funds_cash_component', 'source_of_funds'],
    groupKey: 'finance',
    groupLabel: 'Finance',
    requiredFromRole: 'buyer',
    visibilityScope: 'client',
    attorneyCategory: 'Guarantees',
    libraryCategory: 'finance',
    collectionGroupKey: 'buyer',
    collectionBucketKey: 'finance',
    owningWorkflow: 'Finance',
    visibleSection: 'finance_documents',
    blockingStage: 'FIN',
    financeLane: 'cash',
    confidence: 1,
  },
  {
    keys: ['buyer_identity', 'buyer_id_document', 'buyer_proof_of_address', 'buyer_fica'],
    groupKey: 'buyer_fica',
    groupLabel: 'Buyer & FICA',
    requiredFromRole: 'buyer',
    visibilityScope: 'client',
    attorneyCategory: 'Buyer FICA / Compliance',
    libraryCategory: 'buyer',
    collectionGroupKey: 'buyer',
    collectionBucketKey: 'fica',
    owningWorkflow: 'OTP / Buyer onboarding',
    visibleSection: 'buyer_documents',
    blockingStage: 'OTP',
    confidence: 1,
  },
  {
    keys: ['seller_identity', 'seller_id_document', 'seller_fica'],
    groupKey: 'seller_fica',
    groupLabel: 'Seller & FICA',
    requiredFromRole: 'seller',
    visibilityScope: 'client',
    attorneyCategory: 'Seller FICA / Compliance',
    libraryCategory: 'seller',
    collectionGroupKey: 'seller',
    collectionBucketKey: 'fica',
    owningWorkflow: 'OTP / Seller onboarding',
    visibleSection: 'seller_documents',
    blockingStage: 'OTP',
    confidence: 1,
  },
  {
    keys: ['property_title_deed', 'title_deed', 'property_docs', 'property_document'],
    groupKey: 'property',
    groupLabel: 'Property',
    requiredFromRole: 'seller',
    visibilityScope: 'client',
    attorneyCategory: 'Instruction / OTP Documents',
    libraryCategory: 'seller',
    collectionGroupKey: 'seller',
    collectionBucketKey: 'property',
    owningWorkflow: 'Transfer of Property',
    visibleSection: 'transfer_documents',
    blockingStage: 'ATTY',
    confidence: 1,
  },
]

const DEFINITIONS_BY_KEY = CANONICAL_DOCUMENT_DEFINITIONS.reduce((accumulator, definition) => {
  for (const key of definition.keys) {
    accumulator[key] = definition
  }
  return accumulator
}, {})

function compactText(value) {
  return String(value || '').trim()
}

export function normalizeMatterDocumentKey(value = '') {
  return compactText(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function titleFromKey(value = '') {
  return compactText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getSignal(input = {}) {
  return [
    input.key,
    input.document_key,
    input.requiredDocumentKey,
    input.required_document_key,
    input.documentType,
    input.document_type,
    input.category,
    input.categoryLabel,
    input.groupKey,
    input.group_key,
    input.group,
    input.label,
    input.document_label,
    input.displayName,
    input.name,
    input.description,
    input.requiredFromRole,
    input.required_from_role,
    input.expectedFromRole,
    input.visibleSection,
    input.visible_section,
    input.relatedWorkflow,
    input.related_workflow,
    input.source,
    input.financeLane,
    input.finance_lane,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function getExactDefinition(input = {}) {
  const candidates = [
    input.key,
    input.document_key,
    input.requiredDocumentKey,
    input.required_document_key,
    input.documentType,
    input.document_type,
  ]
    .map(normalizeMatterDocumentKey)
    .filter(Boolean)

  for (const candidate of candidates) {
    if (DEFINITIONS_BY_KEY[candidate]) {
      return { ...DEFINITIONS_BY_KEY[candidate], key: candidate, matchedKey: candidate }
    }
  }

  return null
}

function inferDefinition(input = {}) {
  const signal = getSignal(input)
  if (!signal) return null

  if (/(bond.?pre.?approval|bond.?application|home.?loan.?application)/.test(signal)) {
    return { ...DEFINITIONS_BY_KEY.bond_preapproval, key: 'bond_preapproval', matchedKey: 'bond_preapproval', confidence: 0.92 }
  }
  if (/(bond.?grant|grant.?letter|approved.?grant|bond.?approval|home.?loan.?approval|loan.?approval|originator)/.test(signal)) {
    return { ...DEFINITIONS_BY_KEY.bond_grant, key: 'bond_grant', matchedKey: 'bond_grant', confidence: 0.92 }
  }
  if (/(guarantee|guarantees|lender.?guarantee|bank.?guarantee)/.test(signal)) {
    return { ...DEFINITIONS_BY_KEY.purchase_price_guarantee, key: 'purchase_price_guarantee', matchedKey: 'purchase_price_guarantee', confidence: 0.9 }
  }
  if (/(proof.?of.?funds|cash.?component|source.?of.?funds)/.test(signal)) {
    return { ...DEFINITIONS_BY_KEY.proof_of_funds, key: 'proof_of_funds', matchedKey: 'proof_of_funds', confidence: 0.9 }
  }
  if (/\bseller\b|vendor|seller_/.test(signal)) {
    if (/(title.?deed|property|ownership|erf|sectional|plans|occupancy|rates.?account)/.test(signal)) {
      return { ...DEFINITIONS_BY_KEY.property_title_deed, key: 'property_title_deed', matchedKey: 'property_title_deed', confidence: 0.86 }
    }
    return { ...DEFINITIONS_BY_KEY.seller_identity, key: 'seller_fica', matchedKey: 'seller_fica', confidence: 0.82 }
  }
  if (/\bbuyer\b|purchaser|buyer_/.test(signal)) {
    if (/(finance|bank|loan|bond|grant|guarantee)/.test(signal)) {
      return { ...DEFINITIONS_BY_KEY.bond_grant, key: 'bond_grant', matchedKey: 'bond_grant', confidence: 0.82 }
    }
    return { ...DEFINITIONS_BY_KEY.buyer_identity, key: 'buyer_fica', matchedKey: 'buyer_fica', confidence: 0.82 }
  }
  if (/(rates|levy|clearance|transfer.?duty|sars|municipal|hoa|body.?corporate)/.test(signal)) {
    return {
      key: 'clearance_document',
      groupKey: 'transfer',
      groupLabel: 'Transfer',
      requiredFromRole: 'attorney',
      visibilityScope: 'shared',
      attorneyCategory: 'Clearance Documents',
      libraryCategory: 'transfer',
      collectionGroupKey: 'matter',
      collectionBucketKey: 'clearances',
      owningWorkflow: 'Transfer of Property',
      visibleSection: 'transfer_documents',
      blockingStage: 'ATTY',
      confidence: 0.86,
    }
  }
  if (/(lodgement|lodged|registration|deeds|post.?registration|close.?out)/.test(signal)) {
    return {
      key: 'lodgement_registration',
      groupKey: 'transfer',
      groupLabel: 'Transfer',
      requiredFromRole: 'attorney',
      visibilityScope: 'shared',
      attorneyCategory: 'Lodgement Documents',
      libraryCategory: 'transfer',
      collectionGroupKey: 'matter',
      collectionBucketKey: 'lodgement',
      owningWorkflow: 'Transfer of Property',
      visibleSection: 'transfer_documents',
      blockingStage: 'ATTY',
      confidence: 0.82,
    }
  }

  return null
}

export function resolveMatterDocumentMetadata(input = {}) {
  const explicitDefinition = getExactDefinition(input)
  const inferredDefinition = explicitDefinition || inferDefinition(input) || {}
  const key = explicitDefinition?.key || normalizeMatterDocumentKey(input.key || input.document_key || input.requiredDocumentKey || input.documentType || input.document_type)
  const requiredFromRole = compactText(input.requiredFromRole || input.required_from_role || input.expectedFromRole || inferredDefinition.requiredFromRole || 'client').toLowerCase()
  const groupKey = normalizeMatterDocumentKey(input.groupKey || input.group_key || inferredDefinition.groupKey)
  const resolvedGroupKey = inferredDefinition.confidence >= 0.86 && inferredDefinition.groupKey ? inferredDefinition.groupKey : groupKey || inferredDefinition.groupKey || 'buyer_fica'

  return {
    ...inferredDefinition,
    key: inferredDefinition.key || key,
    label: compactText(input.label || input.document_label || input.displayName || input.name || inferredDefinition.label || titleFromKey(key || 'Document')),
    documentType: inferredDefinition.documentType || key || 'general',
    groupKey: resolvedGroupKey,
    groupLabel: inferredDefinition.groupLabel || GROUP_LABELS[resolvedGroupKey] || titleFromKey(resolvedGroupKey),
    requiredFromRole: inferredDefinition.confidence >= 0.86 ? inferredDefinition.requiredFromRole || requiredFromRole : requiredFromRole,
    requiredFromLabel: ROLE_LABELS[inferredDefinition.requiredFromRole || requiredFromRole] || titleFromKey(inferredDefinition.requiredFromRole || requiredFromRole),
    visibilityScope: inferredDefinition.confidence >= 0.86 ? inferredDefinition.visibilityScope || input.visibilityScope || input.visibility_scope || 'client' : input.visibilityScope || input.visibility_scope || inferredDefinition.visibilityScope || 'client',
    attorneyCategory: inferredDefinition.attorneyCategory || 'Internal Working Documents',
    libraryCategory: inferredDefinition.libraryCategory || 'buyer',
    collectionGroupKey: inferredDefinition.collectionGroupKey || 'matter',
    collectionBucketKey: inferredDefinition.collectionBucketKey || 'other',
    owningWorkflow: inferredDefinition.owningWorkflow,
    visibleSection: inferredDefinition.visibleSection,
    blockingStage: inferredDefinition.blockingStage,
    financeLane: inferredDefinition.financeLane || input.financeLane || input.finance_lane || null,
    source: inferredDefinition.source || input.source || null,
    confidence: inferredDefinition.confidence || 0,
    matchedKey: inferredDefinition.matchedKey || null,
  }
}

export function applyMatterDocumentMetadata(row = {}) {
  const metadata = resolveMatterDocumentMetadata(row)
  return {
    ...row,
    key: row.key || metadata.key,
    label: row.label || metadata.label,
    documentType: row.documentType || metadata.documentType,
    groupKey: metadata.groupKey || row.groupKey,
    groupLabel: metadata.groupLabel || row.groupLabel || row.group,
    group: metadata.groupLabel || row.group || row.groupLabel,
    requiredFromRole: metadata.requiredFromRole || row.requiredFromRole,
    expectedFromRole: metadata.requiredFromRole || row.expectedFromRole,
    defaultVisibility: metadata.visibilityScope || row.defaultVisibility,
    visibilityScope: metadata.visibilityScope || row.visibilityScope,
    attorneyCategory: metadata.attorneyCategory || row.attorneyCategory,
    libraryCategory: metadata.libraryCategory || row.libraryCategory,
    collectionGroupKey: metadata.collectionGroupKey || row.collectionGroupKey,
    collectionBucketKey: metadata.collectionBucketKey || row.collectionBucketKey,
    owningWorkflow: metadata.owningWorkflow || row.owningWorkflow,
    visibleSection: metadata.visibleSection || row.visibleSection,
    blockingStage: metadata.blockingStage || row.blockingStage,
    financeLane: metadata.financeLane || row.financeLane,
    source: metadata.source || row.source,
    metadataConfidence: metadata.confidence,
    metadataMatchedKey: metadata.matchedKey,
  }
}
