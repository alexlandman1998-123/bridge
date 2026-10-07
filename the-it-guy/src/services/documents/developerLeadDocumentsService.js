import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'
import { fetchTransactionDocumentsWorkspace, uploadDocument, invalidateTransactionWorkspaceCoreCache } from '../../lib/transactionWorkspaceApi.js'
import { buildDeveloperLeadAccessProfile } from '../../core/developerLeads/developerLeadContract.js'
import { normalizeCanonicalRequirement } from './canonicalDocumentWorkspaceService.js'
import { mergeProjectedDocuments } from './transactionDocumentProjection.js'
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
    .select('developer_lead_id, developer_org_id, converted_transaction_id, lead_owner, ownership_model, visibility_state, source_agency_org_id')
    .eq('developer_org_id', developerOrgId).eq('developer_lead_id', developerLeadId).maybeSingle()
  if (leadRead.error) throw leadRead.error
  const lead = leadRead.data
  if (!lead || lead.developer_org_id !== developerOrgId || lead.developer_lead_id !== developerLeadId) throw accessError('This lead is no longer available in your workspace.')
  if (buildDeveloperLeadAccessProfile(lead).requiresHandoverBeforePrivateDetails) return empty('protected')
  const transactionId = text(lead.converted_transaction_id)
  if (!transactionId) return empty('awaiting_onboarding')
  const [transactionRead, onboardingRead] = await Promise.all([
    supabase.from('transactions').select('id, onboarding_status, onboarding_completed_at, external_onboarding_submitted_at')
      .eq('id', transactionId).maybeSingle(),
    supabase.from('transaction_onboarding').select('transaction_id, status, submitted_at')
      .eq('transaction_id', transactionId).eq('is_active', true).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (transactionRead.error) throw transactionRead.error
  if (onboardingRead.error) throw onboardingRead.error
  if (transactionRead.data?.id !== transactionId) throw accessError('The linked transaction is no longer available in your workspace.')
  const transaction = transactionRead.data
  const onboarding = onboardingRead.data
  if (onboarding && onboarding.transaction_id !== transactionId) throw accessError('The onboarding record does not belong to this lead’s transaction.')
  const status = text(onboarding?.status).toLowerCase()
  const submitted = !['correction_requested', 'returned', 'awaiting_correction'].includes(status) && (
    submittedStatuses.has(status) || Boolean(onboarding?.submitted_at) ||
    submittedStatuses.has(text(transaction.onboarding_status).toLowerCase()) ||
    Boolean(transaction.onboarding_completed_at || transaction.external_onboarding_submitted_at)
  )
  if (!submitted) return empty('awaiting_onboarding', transactionId)
  const workspace = await fetchTransactionDocumentsWorkspace(transactionId)
  if (workspace?.transaction?.id !== transactionId) throw accessError('The linked transaction is no longer available in your workspace.')
  const projection = workspace.canonicalDocumentProjection
  if (!projection || projection.transactionId !== transactionId || !Array.isArray(projection.requirements)) throw new Error('The shared document requirements could not be loaded. Please retry.')
  const allDocuments = mergeProjectedDocuments(workspace.documents || [], projection)
  const requirements = projection.requirements.map((row) => {
    const normalized = normalizeCanonicalRequirement(row, { role: 'developer', documentCenter: { uploadedDocuments: allDocuments } })
    // A file (including one named Signed OTP) is evidence, not approval.
    const status = ['pending', 'requested'].includes(row.status) && normalized.uploadedDocument ? 'under_review' : row.status || 'pending'
    return { ...normalized, status, canUpload: normalized.projection.uploadable &&
      !['approved', 'completed', 'waived', 'not_applicable'].includes(status) &&
      !isBondStatementHandoff({ key: normalized.documentDefinitionKey, canonicalDocumentType: normalized.documentDefinitionKey }) }
  }).filter((row) => row.visible && (row.requestedFromRole === 'buyer' || row.documentOwnerRole === 'buyer'))
  const requirementIds = new Set(requirements.map((row) => row.id))
  const documents = allDocuments.filter((document) => requirementIds.has(document.canonical_requirement_instance_id || document.canonicalRequirementInstanceId) || (
    (document.client_recipient_role === 'buyer' || document.uploaded_by_party === 'buyer') &&
    document.is_client_visible === true && document.visibility_scope === 'shared'
  ))
  return { state: 'ready', transactionId, requirements, documents }
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
