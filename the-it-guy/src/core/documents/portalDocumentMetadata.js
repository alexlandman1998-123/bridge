const PORTAL_WORKSPACE_CATEGORIES = ['sales', 'fica', 'bond', 'additional', 'property']

const GROUP_KEY_TO_WORKSPACE = {
  sale: 'sales',
  buyer_fica: 'fica',
  finance: 'bond',
  transfer: 'property',
  handover: 'property',
}

function normalizeText(value) {
  return String(value || '').trim()
}

export function normalizePortalWorkspaceCategory(value) {
  const normalized = normalizeText(value).toLowerCase()
  return PORTAL_WORKSPACE_CATEGORIES.includes(normalized) ? normalized : ''
}

export function normalizePortalDocumentType(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function classifyWorkspaceFromType(documentType) {
  const type = normalizePortalDocumentType(documentType)
  if (!type) return ''

  if (
    type.includes('reservation') ||
    type.includes('otp') ||
    type.includes('offer_to_purchase') ||
    type.includes('sale') ||
    type.includes('instruction')
  ) {
    return 'sales'
  }

  if (
    type.includes('fica') ||
    type.includes('identity') ||
    type.includes('passport') ||
    type.includes('address') ||
    type.includes('marriage') ||
    type.includes('anc') ||
    type.includes('company') ||
    type.includes('cipc') ||
    type.includes('trust') ||
    type.includes('trustee') ||
    type.includes('authority')
  ) {
    return 'fica'
  }

  if (
    type.includes('bond') ||
    type.includes('bank') ||
    type.includes('lender') ||
    type.includes('payslip') ||
    type.includes('income') ||
    type.includes('salary') ||
    type.includes('statement') ||
    type.includes('credit') ||
    type.includes('tax') ||
    type.includes('affordability')
  ) {
    return 'bond'
  }

  if (
    type.includes('title_deed') ||
    type.includes('transfer') ||
    type.includes('warranty') ||
    type.includes('certificate') ||
    type.includes('compliance') ||
    type.includes('handover') ||
    type.includes('occupation')
  ) {
    return 'property'
  }

  if (type.includes('additional') || type.includes('ad_hoc') || type.includes('request')) {
    return 'additional'
  }

  return ''
}

function classifyWorkspaceFromStage(stageKey) {
  const normalizedStage = normalizePortalDocumentType(stageKey)
  if (!normalizedStage) return ''

  if (normalizedStage.includes('sale') || normalizedStage.includes('reservation') || normalizedStage.includes('otp')) {
    return 'sales'
  }

  if (normalizedStage.includes('finance') || normalizedStage.includes('bond')) {
    return 'bond'
  }

  if (
    normalizedStage.includes('transfer') ||
    normalizedStage.includes('registration') ||
    normalizedStage.includes('handover') ||
    normalizedStage.includes('occupation')
  ) {
    return 'property'
  }

  return ''
}

function classifyWorkspaceFromSignal(signal) {
  const haystack = normalizeText(signal).toLowerCase()
  if (!haystack) return ''

  if (
    haystack.includes('reservation') ||
    haystack.includes('otp') ||
    haystack.includes('offer to purchase') ||
    haystack.includes('sale') ||
    haystack.includes('mandate') ||
    haystack.includes('instruction')
  ) {
    return 'sales'
  }

  if (
    haystack.includes('fica') ||
    haystack.includes('identity') ||
    haystack.includes('passport') ||
    haystack.includes('address') ||
    haystack.includes('marriage') ||
    haystack.includes('anc') ||
    haystack.includes('company registration') ||
    haystack.includes('cipc') ||
    haystack.includes('director identity') ||
    haystack.includes('authority resolution') ||
    haystack.includes('trust deed') ||
    haystack.includes('trustee') ||
    haystack.includes('trust resolution') ||
    haystack.includes('letter of authority') ||
    haystack.includes('letters_of_authority')
  ) {
    return 'fica'
  }

  if (
    haystack.includes('bond') ||
    haystack.includes('lender') ||
    haystack.includes('bank offer') ||
    haystack.includes('bond offer') ||
    haystack.includes('grant') ||
    haystack.includes('approval') ||
    haystack.includes('payslip') ||
    haystack.includes('income') ||
    haystack.includes('salary') ||
    haystack.includes('statement') ||
    haystack.includes('credit') ||
    haystack.includes('tax')
  ) {
    return 'bond'
  }

  if (
    haystack.includes('title deed') ||
    haystack.includes('transfer') ||
    haystack.includes('warranty') ||
    haystack.includes('certificate') ||
    haystack.includes('compliance') ||
    haystack.includes('coc') ||
    haystack.includes('handover')
  ) {
    return 'property'
  }

  return ''
}

function resolveDocumentType({
  portalDocumentType,
  documentType,
  documentKey,
  key,
  category,
  label,
  name,
} = {}) {
  const preferred =
    normalizePortalDocumentType(portalDocumentType) ||
    normalizePortalDocumentType(documentType) ||
    normalizePortalDocumentType(documentKey) ||
    normalizePortalDocumentType(key)

  if (preferred) {
    return preferred
  }

  const fallbackSignal =
    normalizePortalDocumentType(category) ||
    normalizePortalDocumentType(label) ||
    normalizePortalDocumentType(name)

  return fallbackSignal || 'other'
}

export function resolvePortalDocumentMetadata(document = {}) {
  const existingWorkspace = normalizePortalWorkspaceCategory(
    document.portalWorkspaceCategory || document.portal_workspace_category || document.workspaceCategory || document.workspace_category,
  )

  const groupKey = normalizePortalDocumentType(document.groupKey || document.group_key)
  const groupWorkspace = groupKey ? GROUP_KEY_TO_WORKSPACE[groupKey] || '' : ''

  const resolvedDocumentType = resolveDocumentType(document)
  const typeWorkspace = classifyWorkspaceFromType(resolvedDocumentType)
  const stageWorkspace = classifyWorkspaceFromStage(document.stageKey || document.stage_key)
  const signalWorkspace = classifyWorkspaceFromSignal(
    `${document.label || ''} ${document.name || ''} ${document.description || ''} ${document.category || ''}`,
  )

  const candidateEntries = [
    ['group_key', groupWorkspace],
    ['document_type', typeWorkspace],
    ['stage_key', stageWorkspace],
  ].filter(([, workspace]) => Boolean(workspace))

  const explicitCandidateSet = new Set(candidateEntries.map(([, workspace]) => workspace))
  const hasExplicitConflict = explicitCandidateSet.size > 1

  let workspaceCategory = existingWorkspace
  let mappingSource = 'persisted_workspace'

  if (!workspaceCategory) {
    if (groupWorkspace) {
      workspaceCategory = groupWorkspace
      mappingSource = 'group_key'
    } else if (typeWorkspace) {
      workspaceCategory = typeWorkspace
      mappingSource = 'document_type'
    } else if (stageWorkspace) {
      workspaceCategory = stageWorkspace
      mappingSource = 'stage_key'
    } else if (signalWorkspace) {
      workspaceCategory = signalWorkspace
      mappingSource = 'keyword'
    } else {
      workspaceCategory = 'additional'
      mappingSource = 'fallback'
    }
  }

  const mappingConfidence =
    mappingSource === 'keyword' ? 'inferred' : mappingSource === 'fallback' ? 'fallback' : 'explicit'

  return {
    portalDocumentType: resolvedDocumentType,
    portalWorkspaceCategory: workspaceCategory,
    portalMappingSource: mappingSource,
    portalMappingConfidence: mappingConfidence,
    portalMappingAmbiguous: hasExplicitConflict,
  }
}
