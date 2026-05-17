import ClientDocumentSection from './ClientDocumentSection'
import { normalizeDocumentStatus } from '../../../lib/clientPortalDocumentStatus'
import { getEducationalContentForRequirement } from '../../../content/clientPortalEducation'

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function toText(value, fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function isClientVisible(document = {}) {
  const visibility = String(document?.visibility || document?.document_visibility || document?.visibility_scope || '').trim().toLowerCase()
  if (visibility === 'internal' || visibility === 'internal_only') return false
  if (document?.clientVisible === false) return false
  return true
}

function resolveRequirementStatus(requirement = {}) {
  if (requirement?.complete === true) return 'completed'
  return normalizeDocumentStatus(requirement?.requiredDocumentStatus || requirement?.status || '')
}

function resolveRequirementUploadSpec(requirement = {}) {
  const key = toText(requirement?.key || requirement?.requirement_key || requirement?.id)
  if (!key) return null
  return {
    type: 'requirement',
    requirementKey: key,
  }
}

function normalizeRequiredDocument(requirement = {}, uploadedDocumentsById = new Map()) {
  const key = toText(requirement?.key || requirement?.requirement_key || requirement?.id || requirement?.label || 'required-document')
  const status = resolveRequirementStatus(requirement)
  const uploadedDocumentId = toText(requirement?.uploadedDocumentId || requirement?.uploaded_document_id)
  const linkedDocument = uploadedDocumentId ? uploadedDocumentsById.get(uploadedDocumentId) || null : null
  const education = getEducationalContentForRequirement(requirement?.key || requirement?.label || '')
  return {
    id: `required_${key}`,
    sourceId: key,
    title: toText(requirement?.label || requirement?.requirement_name || requirement?.name, 'Required document'),
    description: toText(requirement?.description || requirement?.requirement_description, 'This document is needed before your transaction can move forward.'),
    group: toText(requirement?.requirement_group || requirement?.group || requirement?.groupKey),
    status,
    rejectionReason: toText(requirement?.rejectionReason || requirement?.rejection_reason),
    linkedDocument,
    hasUploadedDocument: Boolean(linkedDocument?.id || linkedDocument?.file_path || linkedDocument?.url),
    uploadKey: key,
    uploadSpec: resolveRequirementUploadSpec(requirement),
    metaLine: toText(requirement?.requestedBy || requirement?.requested_by_name),
    education: toText(education?.shortExplanation),
  }
}

function normalizeAdditionalRequest(request = {}, uploadedDocumentsById = new Map()) {
  const requestId = toText(request?.id || request?.request_id || request?.title || 'additional-request')
  const status = normalizeDocumentStatus(request?.status || 'requested')
  const linkedDocumentId = toText(request?.requestedDocumentId || request?.requested_document_id || request?.uploadedDocumentId || request?.uploaded_document_id)
  const linkedDocument = linkedDocumentId ? uploadedDocumentsById.get(linkedDocumentId) || null : null
  const requester = toText(request?.requestedBy || request?.requested_by_name || request?.createdByName || request?.created_by_name, 'Transaction team')
  const requesterRole = toText(request?.requestedByRole || request?.requested_by_role || request?.createdByRole || request?.created_by_role)
  const dueDate = toText(request?.dueDate || request?.due_date)
  const priority = toText(request?.priority || request?.additionalPriority)

  const education = getEducationalContentForRequirement(request?.documentName || request?.document_name || request?.title || '')
  return {
    id: `additional_${requestId}`,
    sourceId: requestId,
    title: toText(request?.documentName || request?.document_name || request?.title, 'Additional document request'),
    description: toText(request?.notes || request?.description, 'An additional document has been requested for your transaction.'),
    status,
    rejectionReason: toText(request?.rejectionReason || request?.rejection_reason),
    linkedDocument,
    hasUploadedDocument: Boolean(linkedDocument?.id || linkedDocument?.file_path || linkedDocument?.url),
    uploadKey: `additional_request_${requestId}`,
    uploadSpec: {
      type: 'additional_request',
      requestId,
    },
    metaLine: `${requester}${requesterRole ? ` • ${requesterRole.replaceAll('_', ' ')}` : ''}${dueDate ? ` • Due ${dueDate}` : ''}${priority ? ` • ${priority}` : ''}`,
    education: toText(education?.shortExplanation),
  }
}

function normalizeUploadedDocument(document = {}) {
  const id = toText(document?.id || document?.file_path || document?.name || `uploaded-${Math.random().toString(36).slice(2, 8)}`)
  return {
    id: `uploaded_${id}`,
    sourceId: id,
    title: toText(document?.name || document?.document_name, 'Uploaded document'),
    description: toText(document?.category || document?.document_type, 'Your uploaded document is waiting for review.'),
    status: normalizeDocumentStatus(document?.status || 'uploaded'),
    linkedDocument: document,
    hasUploadedDocument: true,
    uploadKey: '',
    uploadSpec: null,
    metaLine: document?.created_at ? `Uploaded ${new Date(document.created_at).toLocaleDateString('en-ZA')}` : '',
  }
}

function normalizeSignedDocument(document = {}) {
  const base = normalizeUploadedDocument(document)
  return {
    ...base,
    id: `signed_${base.sourceId}`,
    status: 'completed',
    description: toText(document?.category || document?.document_type, 'This signed document has been completed and stored.'),
    metaLine: document?.created_at ? `Signed ${new Date(document.created_at).toLocaleDateString('en-ZA')}` : '',
  }
}

function matchesWorkspace(item = {}, workspace = 'buying') {
  const appliesTo = toText(item?.applies_to || item?.appliesTo || item?.requested_from || '').toLowerCase()
  if (!appliesTo || appliesTo === 'both' || appliesTo === 'buyer_and_seller') return true
  if (workspace === 'selling') {
    return appliesTo.includes('seller') || appliesTo.includes('trust') || appliesTo.includes('company')
  }
  return !appliesTo.includes('seller')
}

function uniqueById(items = []) {
  const seen = new Set()
  return items.filter((item) => {
    if (!item?.id) return false
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function buildDocumentCentreSections(documentCenter = {}, workspace = 'buying') {
  const uploadedDocuments = toArray(documentCenter?.uploadedDocuments).filter((item) => isClientVisible(item))
  const uploadedDocumentsById = new Map(uploadedDocuments.map((item) => [toText(item?.id), item]))

  const normalizedRequired = uniqueById(
    toArray(documentCenter?.requiredDocuments)
      .filter((item) => isClientVisible(item) && matchesWorkspace(item, workspace))
      .map((item) => normalizeRequiredDocument(item, uploadedDocumentsById)),
  )

  const normalizedAdditional = uniqueById(
    toArray(documentCenter?.additionalRequests)
      .filter((item) => isClientVisible(item))
      .map((item) => normalizeAdditionalRequest(item, uploadedDocumentsById)),
  )

  const normalizedUploaded = uniqueById(uploadedDocuments.map((item) => normalizeUploadedDocument(item)))
  const normalizedSigned = uniqueById(
    toArray(documentCenter?.signedDocuments)
      .filter((item) => isClientVisible(item))
      .map((item) => normalizeSignedDocument(item)),
  )

  const requiredFromYou = normalizedRequired.filter((item) => ['required', 'requested'].includes(item.status))
  const additionalRequests = normalizedAdditional.filter((item) => !['cancelled', 'not_applicable'].includes(item.status))
  const rejectedNeedsAttention = [
    ...normalizedRequired.filter((item) => item.status === 'rejected'),
    ...normalizedAdditional.filter((item) => item.status === 'rejected'),
  ]
  const uploadedUnderReview = [
    ...normalizedRequired.filter((item) => ['uploaded', 'under_review'].includes(item.status)),
    ...normalizedAdditional.filter((item) => ['uploaded', 'under_review'].includes(item.status)),
    ...normalizedUploaded.filter((item) => ['uploaded', 'under_review'].includes(item.status)),
  ]
  const approvedCompleted = [
    ...normalizedRequired.filter((item) => ['approved', 'completed'].includes(item.status)),
    ...normalizedAdditional.filter((item) => ['approved', 'completed'].includes(item.status)),
    ...toArray(documentCenter?.approvedDocuments)
      .filter((item) => isClientVisible(item))
      .map((item) => normalizeRequiredDocument(item, uploadedDocumentsById)),
  ]

  return {
    requiredFromYou: uniqueById(requiredFromYou),
    allRequired: uniqueById(normalizedRequired),
    additionalRequests: uniqueById(additionalRequests),
    uploadedUnderReview: uniqueById(uploadedUnderReview),
    rejectedNeedsAttention: uniqueById(rejectedNeedsAttention),
    approvedCompleted: uniqueById(approvedCompleted),
    signedDocuments: uniqueById(normalizedSigned),
  }
}

function sellerRequirementGroup(item = {}) {
  const haystack = `${item?.group || ''} ${item?.sourceId || ''} ${item?.title || ''} ${item?.description || ''}`.toLowerCase()
  if (/additional/.test(haystack)) return 'additional'
  if (/mandate/.test(haystack)) return 'mandate'
  if (/transfer|clearance|guarantee|sale agreement|otp/.test(haystack)) return 'transfer'
  if (/rates|levy|hoa|body corporate|property|bond statement|occupancy|lease|tenant|electrical|plumbing|beetle|coc|certificate/.test(haystack)) return 'property'
  return 'fica'
}

function ClientDocumentCentre({
  documentCenter = {},
  workspace = 'buying',
  uploadingDocumentKey = '',
  openingDocumentPath = '',
  onUpload = null,
  onOpenDocument = null,
}) {
  const sections = buildDocumentCentreSections(documentCenter, workspace)
  const isSelling = workspace === 'selling'
  const sellerFicaDocuments = sections.allRequired.filter((item) => sellerRequirementGroup(item) === 'fica')
  const sellerPropertyDocuments = sections.allRequired.filter((item) => sellerRequirementGroup(item) === 'property')
  const sellerMandateDocuments = [
    ...sections.allRequired.filter((item) => sellerRequirementGroup(item) === 'mandate'),
    ...sections.signedDocuments.filter((item) => /mandate/i.test(`${item?.title || ''} ${item?.description || ''}`)),
  ]
  const sellerTransferDocuments = [
    ...sections.allRequired.filter((item) => sellerRequirementGroup(item) === 'transfer'),
    ...sections.signedDocuments.filter((item) => /transfer|sale agreement|otp/i.test(`${item?.title || ''} ${item?.description || ''}`)),
  ]

  return (
    <section className="space-y-5 rounded-[28px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
      <div>
        <h3 className="text-[1.16rem] font-semibold tracking-[-0.03em] text-[#142132]">{isSelling ? 'Seller Documents' : 'Document Centre'}</h3>
        <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
          {isSelling
            ? 'Track seller-visible FICA, property, mandate, and transfer documents.'
            : 'Upload, review, and track all required documents for your transaction.'}
        </p>
      </div>

      {isSelling ? (
        <>
          <ClientDocumentSection
            title="FICA Documents"
            subtitle="Identity and compliance documents based on your seller onboarding answers."
            items={sellerFicaDocuments}
            emptyState="No FICA documents are required at this stage."
            uploadingDocumentKey={uploadingDocumentKey}
            openingDocumentPath={openingDocumentPath}
            onUpload={onUpload}
            onOpenDocument={onOpenDocument}
          />

          <ClientDocumentSection
            title="Property Documents"
            subtitle="Property, levy, rates, occupancy, and related sale documents."
            items={sellerPropertyDocuments}
            emptyState="No property documents are required at this stage."
            uploadingDocumentKey={uploadingDocumentKey}
            openingDocumentPath={openingDocumentPath}
            onUpload={onUpload}
            onOpenDocument={onOpenDocument}
          />

          <ClientDocumentSection
            title="Additional Requests"
            subtitle="Extra seller documents requested by your transaction team."
            items={sections.additionalRequests}
            emptyState="No additional document requests yet."
            uploadingDocumentKey={uploadingDocumentKey}
            openingDocumentPath={openingDocumentPath}
            onUpload={onUpload}
            onOpenDocument={onOpenDocument}
          />

          <ClientDocumentSection
            title="Mandate Documents"
            subtitle="Mandate documents and seller signature records."
            items={sellerMandateDocuments}
            emptyState="Mandate documents will appear here once prepared."
            uploadingDocumentKey={uploadingDocumentKey}
            openingDocumentPath={openingDocumentPath}
            onUpload={onUpload}
            onOpenDocument={onOpenDocument}
          />

          <ClientDocumentSection
            title="Transfer Documents"
            subtitle="Transfer documents appear here when your sale moves into transfer."
            items={sellerTransferDocuments}
            emptyState="Transfer documents are not required yet."
            uploadingDocumentKey={uploadingDocumentKey}
            openingDocumentPath={openingDocumentPath}
            onUpload={onUpload}
            onOpenDocument={onOpenDocument}
          />

          <ClientDocumentSection
            title="Uploaded / Under Review"
            subtitle="Your uploads are being checked by the team."
            items={sections.uploadedUnderReview}
            emptyState="Uploaded documents will appear here."
            uploadingDocumentKey={uploadingDocumentKey}
            openingDocumentPath={openingDocumentPath}
            onUpload={onUpload}
            onOpenDocument={onOpenDocument}
          />

          <ClientDocumentSection
            title="Approved / Completed"
            subtitle="Documents reviewed and accepted."
            items={sections.approvedCompleted}
            emptyState="No approved or completed documents yet."
            uploadingDocumentKey={uploadingDocumentKey}
            openingDocumentPath={openingDocumentPath}
            onUpload={onUpload}
            onOpenDocument={onOpenDocument}
          />
        </>
      ) : (
      <>
      <ClientDocumentSection
        title="Required From You"
        subtitle="Documents currently required to move your transaction forward."
        items={sections.requiredFromYou}
        emptyState="No required documents at this stage."
        uploadingDocumentKey={uploadingDocumentKey}
        openingDocumentPath={openingDocumentPath}
        onUpload={onUpload}
        onOpenDocument={onOpenDocument}
      />

      <ClientDocumentSection
        title="Rejected / Needs Attention"
        subtitle="These documents need to be corrected and uploaded again."
        items={sections.rejectedNeedsAttention}
        emptyState="No documents need attention."
        uploadingDocumentKey={uploadingDocumentKey}
        openingDocumentPath={openingDocumentPath}
        onUpload={onUpload}
        onOpenDocument={onOpenDocument}
      />

      <ClientDocumentSection
        title="Additional Requests"
        subtitle="Extra documents requested by your transaction team."
        items={sections.additionalRequests}
        emptyState="No additional document requests yet."
        uploadingDocumentKey={uploadingDocumentKey}
        openingDocumentPath={openingDocumentPath}
        onUpload={onUpload}
        onOpenDocument={onOpenDocument}
      />

      <ClientDocumentSection
        title="Uploaded / Under Review"
        subtitle="Your uploads are in progress and being checked by the team."
        items={sections.uploadedUnderReview}
        emptyState="Uploaded documents will appear here."
        uploadingDocumentKey={uploadingDocumentKey}
        openingDocumentPath={openingDocumentPath}
        onUpload={onUpload}
        onOpenDocument={onOpenDocument}
      />

      <ClientDocumentSection
        title="Approved / Completed"
        subtitle="Documents reviewed and accepted."
        items={sections.approvedCompleted}
        emptyState="No approved or completed documents yet."
        uploadingDocumentKey={uploadingDocumentKey}
        openingDocumentPath={openingDocumentPath}
        onUpload={onUpload}
        onOpenDocument={onOpenDocument}
      />

      <ClientDocumentSection
        title="Signed Documents"
        subtitle="Completed signatures and signed records."
        items={sections.signedDocuments}
        emptyState="Signed documents will appear here once completed."
        uploadingDocumentKey={uploadingDocumentKey}
        openingDocumentPath={openingDocumentPath}
        onUpload={onUpload}
        onOpenDocument={onOpenDocument}
      />
      </>
      )}
    </section>
  )
}

export default ClientDocumentCentre
