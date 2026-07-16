import {
  getLegalDocumentDefinition,
  normalizeLegalDocumentEditorScope,
} from './legalDocumentCatalog.js'

export const LEGAL_DOCUMENTS_BASE_PATH = '/settings/legal-templates'

const EDITOR_SCOPE_TO_WORKSPACE_AREA = Object.freeze({
  all: '',
  standard: 'content',
  situations: 'conditions',
  signing: 'signatures',
})

const WORKSPACE_AREA_TO_EDITOR_SCOPE = Object.freeze({
  content: 'standard',
  conditions: 'situations',
  signatures: 'signing',
})

function requireDocumentKey(documentKey = '') {
  const definition = getLegalDocumentDefinition(documentKey)
  if (!definition) throw new Error(`Unknown legal document: ${String(documentKey || '').trim() || 'empty'}`)
  return definition.key
}

export function buildLegalDocumentsLandingPath() {
  return LEGAL_DOCUMENTS_BASE_PATH
}

export function getLegalDocumentWorkspaceAreaFromEditorScope(scope = 'all') {
  return EDITOR_SCOPE_TO_WORKSPACE_AREA[normalizeLegalDocumentEditorScope(scope)] || ''
}

export function getLegalDocumentEditorScopeFromWorkspaceArea(area = '') {
  return WORKSPACE_AREA_TO_EDITOR_SCOPE[String(area || '').trim().toLowerCase()] || 'all'
}

export function buildLegalDocumentWorkspacePath(documentKey = '', {
  area = '',
  templateId = '',
  situationKey = '',
  blockId = '',
  advanced = false,
} = {}) {
  const path = `${LEGAL_DOCUMENTS_BASE_PATH}/${requireDocumentKey(documentKey)}`
  const query = new URLSearchParams()
  const normalizedArea = String(area || '').trim().toLowerCase()
  if (WORKSPACE_AREA_TO_EDITOR_SCOPE[normalizedArea]) query.set('area', normalizedArea)
  if (templateId) query.set('template', String(templateId))
  if (situationKey) query.set('situation', String(situationKey))
  if (blockId) query.set('block', String(blockId))
  if (advanced) query.set('mode', 'advanced')
  const suffix = query.toString()
  return `${path}${suffix ? `?${suffix}` : ''}`
}

export function buildLegalDocumentOverviewPath(documentKey = '') {
  return buildLegalDocumentWorkspacePath(documentKey)
}

export function buildLegalDocumentEditorPath(documentKey = '', scope = 'all', options = {}) {
  return buildLegalDocumentWorkspacePath(documentKey, {
    ...options,
    area: getLegalDocumentWorkspaceAreaFromEditorScope(scope),
  })
}

export function buildLegacyLegalDocumentEditorPath(documentKey = '', scope = 'all') {
  return `${buildLegalDocumentWorkspacePath(documentKey)}/edit/${normalizeLegalDocumentEditorScope(scope)}`
}

export function buildLegacyLegalDocumentRedirectPath(documentKey = '', scope = 'all', search = '') {
  const query = new URLSearchParams(String(search || '').replace(/^\?/, ''))
  const area = getLegalDocumentWorkspaceAreaFromEditorScope(scope)
  if (area) query.set('area', area)
  else query.delete('area')
  const suffix = query.toString()
  const path = buildLegalDocumentWorkspacePath(documentKey)
  return `${path}${suffix ? `?${suffix}` : ''}`
}

export function buildLegalDocumentPreviewPath(documentKey = '') {
  return `${buildLegalDocumentOverviewPath(documentKey)}/preview`
}

export function parseLegalDocumentPath(pathname = '') {
  const normalized = `/${String(pathname || '').trim().replace(/^\/+|\/+$/g, '')}`
  if (normalized === LEGAL_DOCUMENTS_BASE_PATH) return { view: 'landing', documentKey: '', scope: '' }
  const suffix = normalized.startsWith(`${LEGAL_DOCUMENTS_BASE_PATH}/`)
    ? normalized.slice(LEGAL_DOCUMENTS_BASE_PATH.length + 1)
    : ''
  const [documentKey = '', action = '', scope = ''] = suffix.split('/')
  if (!getLegalDocumentDefinition(documentKey)) return null
  if (!action) return { view: 'workspace', documentKey, scope: 'all' }
  if (action === 'preview') return { view: 'preview', documentKey, scope: '' }
  if (action === 'edit') {
    return { view: 'legacy_editor', documentKey, scope: normalizeLegalDocumentEditorScope(scope) }
  }
  return null
}
