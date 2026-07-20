import {
  getLegalDocumentDefinition,
  normalizeLegalDocumentEditorScope,
} from './legalDocumentCatalog.js'

export const LEGAL_DOCUMENTS_BASE_PATH = '/settings/legal-templates'

function requireDocumentKey(documentKey = '') {
  const definition = getLegalDocumentDefinition(documentKey)
  if (!definition) throw new Error(`Unknown legal document: ${String(documentKey || '').trim() || 'empty'}`)
  return definition.key
}

export function buildLegalDocumentsLandingPath() {
  return LEGAL_DOCUMENTS_BASE_PATH
}

export function buildLegalDocumentOverviewPath(documentKey = '') {
  return `${LEGAL_DOCUMENTS_BASE_PATH}/${requireDocumentKey(documentKey)}`
}

export function buildLegalDocumentEditorPath(documentKey = '', scope = 'standard') {
  return `${buildLegalDocumentOverviewPath(documentKey)}/edit/${normalizeLegalDocumentEditorScope(scope)}`
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
  if (!action) return { view: 'overview', documentKey, scope: '' }
  if (action === 'preview') return { view: 'preview', documentKey, scope: '' }
  if (action === 'edit') {
    return { view: 'editor', documentKey, scope: normalizeLegalDocumentEditorScope(scope) }
  }
  return null
}
