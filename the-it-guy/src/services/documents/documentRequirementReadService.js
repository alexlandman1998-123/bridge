import { resolveCrossModuleDocumentReference } from './crossModuleDocumentKeyMapService.js'
import { documentRequirementLabel, documentRequirementTypeKey, documentRequirementParty } from '../../core/documents/documentRequirementIdentity.js'

export async function readDocumentRequirementContext(client, { contextType, contextId }) {
  if (!client || !contextType || !contextId) throw new Error('Document workspace context is required.')
  const { data, error } = await client.rpc('bridge_document_requirement_context', { p_context_type: contextType, p_context_id: contextId })
  if (error) throw error
  if (data?.contextType !== contextType || data?.contextId !== contextId || !Array.isArray(data.requirements) || !Array.isArray(data.documents)) {
    throw new Error('The shared document workspace could not be verified. Refresh before continuing.')
  }
  return data
}

export const requirementLinkId = row => row?.canonical_requirement_instance_id || row?.canonicalRequirementInstanceId || row?.original?.requirement?.canonical_requirement_instance_id || ''
export const activeRequirement = row => row.applicability_override !== 'removed' && row.status !== 'not_applicable'

export function requirementDisplayRow(requirement, documents = []) {
  const key = documentRequirementTypeKey(requirement)
  const evidence = documents.find(row => requirementLinkId(row) === requirement.id && row.is_current_evidence === true) || null
  const label = documentRequirementLabel(requirement, requirement.document_definitions || {})
  const complete = ['approved', 'completed', 'waived'].includes(requirement.status)
  const pack = requirement.pack_key || ''
  const category = /identity|fica/.test(pack) ? documentRequirementParty(requirement) : /bond|finance|fund/.test(pack) ? 'finance' : /authority|legal|transfer|signature/.test(pack) ? 'legal' : 'property'
  const statusBucket = complete ? 'approved' : requirement.status === 'uploaded' ? 'ready_for_review' : ['under_review', 'rejected'].includes(requirement.status) ? requirement.status : 'outstanding'
  return {
    ...requirement,
    id: requirement.id, key, documentKey: key, document_key: key, requirementKey: key, requirement_key: key,
    label, title: label, name: label, requirement_name: label,
    canonicalRequirementInstanceId: requirement.id, canonical_requirement_instance_id: requirement.id,
    requestedFromRole: requirement.requested_from_role, expectedFromRole: requirement.requested_from_role,
    partyId: requirement.subject_id || requirement.requested_from_contact_id,
    required: ['required', 'blocker'].includes(requirement.requirement_level),
    isRequired: ['required', 'blocker'].includes(requirement.requirement_level),
    applicable: activeRequirement(requirement), isEnabled: activeRequirement(requirement),
    status: requirement.status, statusBucket, complete, category,
    statusLabel: ({ pending: 'Required', requested: 'Requested', uploaded: 'Awaiting review', under_review: 'Awaiting review', approved: 'Approved', completed: 'Complete', waived: 'Waived', rejected: 'Needs replacement', expired: 'Expired' })[requirement.status] || requirement.status,
    blocking: requirement.requirement_level === 'blocker' && !complete,
    description: requirement.document_definitions?.description || '',
    isUploaded: Boolean(evidence), hasUpload: Boolean(evidence),
    uploadedDocumentId: evidence?.id || null, uploadedDocument: evidence,
    storageBucket: evidence?.file_bucket || 'documents', storagePath: evidence?.file_path || '',
    uploadedFileName: evidence?.file_name || evidence?.name || '',
    canDownload: Boolean(evidence),
    fileName: evidence?.file_name || evidence?.name || '', uploadedAt: evidence?.uploaded_at || evidence?.created_at || '',
    group: requirement.pack_key, groupKey: requirement.pack_key,
    canUpload: false, // Upload through DocumentRequirementManager, never a legacy row handler.
    original: { requirement, document: evidence },
    sharedRequirement: true,
  }
}

// Override only explicit links, never a matching label or a broad document type.
// Removed rows are tombstones: discard their old projection before filtering.
export function mergeDocumentRequirementRows(legacyRows = [], snapshot, { party = null, canonicalOnly = false } = {}) {
  if (!snapshot) return legacyRows
  const requirements = snapshot.requirements.filter(row => !party || documentRequirementParty(row) === party)
  const owned = new Set(requirements.map(row => row.id))
  const hasCanonicalOwner = row => {
    if (requirementLinkId(row)) return owned.has(requirementLinkId(row))
    // A legacy standard type can be matched only through the established
    // taxonomy, the exact party/contact and a single candidate. Never by name.
    if (!party) return false
    const key = row.key || row.documentKey || row.document_key || row.requirementKey || row.requirement_key
    const canonical = resolveCrossModuleDocumentReference(key, { ownerRole: party, requestedFromRole: party }).canonicalDocumentKey || key
    const contact = row.partyId || row.requested_from_contact_id || null
    return requirements.filter(requirement => requirement.document_definition_key &&
      requirement.document_definition_key === canonical &&
      (requirement.requested_from_contact_id || null) === contact).length === 1
  }
  return [
    ...(canonicalOnly ? [] : legacyRows.filter(row => !hasCanonicalOwner(row))),
    ...requirements.filter(activeRequirement).map(row => requirementDisplayRow(row, snapshot.documents)),
  ]
}

export function mergeDocumentEvidence(legacyRows = [], snapshot) {
  const owned = new Set(snapshot.requirements.map(row => row.id))
  const byPath = new Map()
  for (const row of [...legacyRows.filter(row => !owned.has(requirementLinkId(row))), ...snapshot.documents]) {
    // Retain previous versions as history, but not as the current checklist file.
    const identity = row.id || `${row.file_bucket || 'documents'}:${row.file_path}`
    byPath.set(identity, row)
  }
  return [...byPath.values()]
}

// Same-tab command events + focus refresh + bounded polling cover changes made
// elsewhere without subscribing the browser to private requirement tables.
const DOCUMENT_CHANGE_STORAGE_KEY = 'arch9:document-requirements-changed'

export function notifyDocumentRequirementContextChanged(detail, { target = globalThis.window } = {}) {
  if (!target) return
  try {
    const EventConstructor = target.CustomEvent || globalThis.CustomEvent
    if (EventConstructor) target.dispatchEvent(new EventConstructor(DOCUMENT_CHANGE_STORAGE_KEY, { detail }))
    // A timestamp is enough to refresh another open tab; never persist files,
    // document names or private contact details in the cross-tab signal.
    target.localStorage?.setItem(DOCUMENT_CHANGE_STORAGE_KEY, `${Date.now()}:${Math.random()}`)
  } catch { /* Refresh signalling must never turn a confirmed save into failure. */ }
}

export function watchDocumentRequirementContext(refresh, { intervalMs = 15000, target = globalThis.window } = {}) {
  if (!target) return () => {}
  let pending = false
  const reload = () => {
    if (pending || target.document?.visibilityState === 'hidden') return
    const result = refresh()
    if (result?.then) {
      pending = true
      void Promise.resolve(result).catch(() => {}).finally(() => { pending = false })
    }
  }
  target.addEventListener('focus', reload)
  target.addEventListener('arch9:document-requirements-changed', reload)
  const storageChanged = event => { if (event.key === DOCUMENT_CHANGE_STORAGE_KEY) reload() }
  target.addEventListener('storage', storageChanged)
  target.document?.addEventListener?.('visibilitychange', reload)
  const timer = target.setInterval(reload, intervalMs)
  return () => {
    target.removeEventListener('focus', reload)
    target.removeEventListener('arch9:document-requirements-changed', reload)
    target.removeEventListener('storage', storageChanged)
    target.document?.removeEventListener?.('visibilitychange', reload)
    target.clearInterval(timer)
  }
}
