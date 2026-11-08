import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'
import { fetchTransactionDocumentsWorkspace, uploadDocument, invalidateTransactionWorkspaceCoreCache, createTransactionDocumentSignedUrl } from '../../lib/transactionWorkspaceApi.js'
import { documentRequirementParty } from '../../core/documents/documentRequirementIdentity.js'
import { documentStorageReference } from '../../lib/documentAccess.js'
import { buildDeveloperLeadAccessProfile } from '../../core/developerLeads/developerLeadContract.js'
import { normalizeCanonicalRequirement } from './canonicalDocumentWorkspaceService.js'
import { mergeDocumentEvidence, readDocumentRequirementContext } from './documentRequirementReadService.js'
import { validateDocumentUploadFile } from '../../lib/documentUploadPolicy.js'
import { isBondStatementHandoff } from '../../modules/bond/application/documents/bondDocumentWorkspacePresentation.js'

const text = (value) => String(value || '').trim()
const submittedStatuses = new Set(['submitted', 'reviewed', 'approved', 'complete', 'completed', 'client_onboarding_complete', 'onboarding_submitted', 'awaiting_signed_otp', 'signed_otp_received', 'otp_uploaded'])
const empty = (state, transactionId = '') => ({ state, transactionId, requirements: [], documents: [] })

function accessError(message) {
  const error = new Error(message)
  error.code = 'lead_documents_access_denied'
  return error
}

// Re-read the persisted lead association on every read and save. A route or a
// stale lead card cannot choose the transaction receiving a buyer's documents.
export async function fetchDeveloperLeadDocuments({ developerOrgId, developerLeadId } = {}) {
  if (!developerOrgId || !developerLeadId) throw accessError('Select a saved lead in your developer workspace.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Documents are unavailable while offline.')
  const leadRead = await supabase.from('developer_leads')
    .select('developer_lead_id, developer_org_id, converted_transaction_id, source_lead_id, primary_development_id, preferred_unit_id, lead_owner, ownership_model, visibility_state, source_agency_org_id')
    .eq('developer_org_id', developerOrgId).eq('developer_lead_id', developerLeadId).maybeSingle()
  if (leadRead.error) throw leadRead.error
  const lead = leadRead.data
  if (!lead || lead.developer_org_id !== developerOrgId || lead.developer_lead_id !== developerLeadId) throw accessError('This lead is no longer available in your workspace.')
  if (buildDeveloperLeadAccessProfile(lead).requiresHandoverBeforePrivateDetails) return empty('protected')
  const transactionId = text(lead.converted_transaction_id)
  if (!transactionId) return empty('awaiting_onboarding')
  const [transactionRead, onboardingRead] = await Promise.all([
    supabase.from('transactions').select('id, organisation_id, development_id, unit_id, originating_lead_id, originating_buyer_lead_id, onboarding_status, onboarding_completed_at, external_onboarding_submitted_at')
      .eq('id', transactionId).maybeSingle(),
    supabase.from('transaction_onboarding').select('transaction_id, status, submitted_at')
      .eq('transaction_id', transactionId).eq('is_active', true).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (transactionRead.error) throw transactionRead.error
  if (onboardingRead.error) throw onboardingRead.error
  if (transactionRead.data?.id !== transactionId) throw accessError('The linked transaction is no longer available in your workspace.')
  const transaction = transactionRead.data
  const originLeadIds = [transaction.originating_buyer_lead_id, transaction.originating_lead_id].filter(Boolean)
  if (lead.source_lead_id && !originLeadIds.includes(lead.source_lead_id)) throw accessError('The linked transaction does not have a verified link to this buyer lead. Repair that link before opening or uploading documents.')
  if (transaction.development_id && lead.primary_development_id && transaction.development_id !== lead.primary_development_id) throw accessError('The linked transaction belongs to a different development.')
  if (transaction.unit_id && lead.preferred_unit_id && transaction.unit_id !== lead.preferred_unit_id) throw accessError('The linked transaction belongs to a different unit.')
  if (transaction.organisation_id && ![developerOrgId, lead.source_agency_org_id].includes(transaction.organisation_id)) throw accessError('The linked transaction belongs to another organisation.')
  const onboarding = onboardingRead.data
  if (onboarding && onboarding.transaction_id !== transactionId) throw accessError('The onboarding record does not belong to this lead’s transaction.')
  const status = text(onboarding?.status).toLowerCase()
  const submitted = !['correction_requested', 'returned', 'awaiting_correction'].includes(status) && (
    submittedStatuses.has(status) || Boolean(onboarding?.submitted_at) ||
    submittedStatuses.has(text(transaction.onboarding_status).toLowerCase()) ||
    Boolean(transaction.onboarding_completed_at || transaction.external_onboarding_submitted_at)
  )
  if (!submitted) return empty('awaiting_onboarding', transactionId)
  const [workspace, snapshot] = await Promise.all([
    fetchTransactionDocumentsWorkspace(transactionId),
    readDocumentRequirementContext(supabase, { contextType: 'transaction', contextId: transactionId }),
  ])
  if (workspace?.transaction?.id !== transactionId) throw accessError('The linked transaction is no longer available in your workspace.')
  const projection = { transactionId: snapshot.contextId, requirements: snapshot.requirements, documents: snapshot.documents }
  if (!projection || projection.transactionId !== transactionId || !Array.isArray(projection.requirements)) throw new Error('The shared document requirements could not be loaded. Please retry.')
  if (projection.requirements.some(row => row.transaction_id && row.transaction_id !== transactionId || row.context_type === 'transaction' && row.context_id && row.context_id !== transactionId)) throw accessError('The document checklist belongs to a different transaction. Refresh documents.')
  const allDocuments = mergeDocumentEvidence(workspace.documents || [], snapshot)
  if (allDocuments.some(row => (row.transaction_id || row.transactionId) && (row.transaction_id || row.transactionId) !== transactionId)) throw accessError('A document belongs to a different transaction. Refresh documents.')
  const requirements = projection.requirements.filter(row => row.applicability_override !== 'removed' && row.status !== 'not_applicable').map((row) => {
    const normalized = normalizeCanonicalRequirement(row, { role: 'developer', documentCenter: { uploadedDocuments: allDocuments } })
    // A file (including one named Signed OTP) is evidence, not approval.
    const status = ['pending', 'requested'].includes(row.status) && normalized.uploadedDocument ? 'under_review' : row.status || 'pending'
    return { ...normalized, status, canUpload: normalized.projection.uploadable &&
      !['approved', 'completed', 'waived', 'not_applicable'].includes(status) &&
      !isBondStatementHandoff({ key: normalized.documentDefinitionKey, canonicalDocumentType: normalized.documentDefinitionKey }) }
  }).filter((row) => row.visible && documentRequirementParty({ requested_from_role: row.requestedFromRole || row.documentOwnerRole }) === 'buyer')
  const requirementIds = new Set(requirements.map((row) => row.id))
  const documents = allDocuments.filter(document => document.applicability_override !== 'removed' && document.is_current_evidence !== false).filter((document) => requirementIds.has(document.canonical_requirement_instance_id || document.canonicalRequirementInstanceId) || (
    (document.client_recipient_role === 'buyer' || document.uploaded_by_party === 'buyer') &&
    document.is_client_visible === true && document.visibility_scope === 'shared'
  ))
  const statusByRequirement = new Map(requirements.map(row => [row.id, row.status]))
  return { state: 'ready', transactionId, requirements, documents: documents.map(document => {
    const status = document.requirement_status || statusByRequirement.get(document.canonical_requirement_instance_id || document.canonicalRequirementInstanceId)
    return status ? { ...document, status, review_status: status } : document
  }) }
}

export async function createDeveloperLeadDocumentSignedUrl({ developerOrgId, developerLeadId, transactionId, documentId } = {}) {
  const current = await fetchDeveloperLeadDocuments({ developerOrgId, developerLeadId })
  const document = current.documents.find((row) => row.id === documentId)
  const storedTransactionId = text(document?.transaction_id || document?.transactionId)
  if (current.state !== 'ready' || current.transactionId !== transactionId || !document || (storedTransactionId && storedTransactionId !== transactionId)) {
    throw accessError('This document is no longer available for this lead. Refresh documents.')
  }
  return createTransactionDocumentSignedUrl(documentStorageReference(document))
}

export async function uploadDeveloperLeadDocument({ developerOrgId, developerLeadId, transactionId, requirementId = '', file, onProgress } = {}) {
  validateDocumentUploadFile(file, { surface: 'internal_transaction', transactionId })
  const current = await fetchDeveloperLeadDocuments({ developerOrgId, developerLeadId })
  if (current.state !== 'ready') throw new Error(current.state === 'protected' ? 'Agency handover is required before uploading documents.' : 'Awaiting onboarding. Uploads become available after submission.')
  if (current.transactionId !== transactionId) throw new Error('The lead’s linked transaction changed. Refresh documents before uploading.')
  const requirement = requirementId ? current.requirements.find((row) => row.id === requirementId) : null
  if (requirementId && !requirement?.canUpload) throw new Error('This document requirement is no longer available for upload. Refresh documents.')
  const document = await uploadDocument({
    transactionId: current.transactionId, file, category: requirement?.packKey || 'Buyer',
    documentType: requirement?.documentDefinitionKey || 'general',
    canonicalRequirementInstanceId: requirement?.id || null,
    requiredDocumentKey: requirement?.documentDefinitionKey || null,
    inferCanonicalRequirement: Boolean(requirement),
    isClientVisible: true, visibilityScope: 'shared', clientRecipientRole: 'buyer', uploadedByParty: 'buyer',
    source: 'developer_buyer_document_upload', onProgress,
  })
  if (!document?.id) throw new Error('The document save could not be confirmed. Refresh documents before retrying.')
  // Durable storage and the Documents row are already saved. Cache refresh
  // failures must not report an unsaved upload or prompt a duplicate file.
  void invalidateTransactionWorkspaceCoreCache(current.transactionId).catch(() => {})
  window.dispatchEvent(new CustomEvent('itg:transaction-updated', { detail: { transactionId: current.transactionId } }))
  window.dispatchEvent(new Event('itg:developer-leads-changed'))
  return { ...document, canonical_requirement_instance_id: document.canonical_requirement_instance_id || requirement?.id || null }
}
