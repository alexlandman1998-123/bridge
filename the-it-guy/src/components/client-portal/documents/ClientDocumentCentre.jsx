import { useState } from 'react'
import ClientDocumentSection from './ClientDocumentSection'
import { normalizeDocumentStatus } from '../../../lib/clientPortalDocumentStatus'
import { getEducationalContentForRequirement } from '../../../content/clientPortalEducation'
import CanonicalDocumentWorkspace from './canonical/CanonicalDocumentWorkspace'
import { isCanonicalDocumentWorkspaceEnabled } from '../../../services/documents/canonicalDocumentWorkspaceService'

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

function normalizeDocumentMatchKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function getDocumentLookupKeys(document = {}) {
  return [
    document?.id,
    document?.file_path,
    document?.storage_path,
    document?.url,
    document?.file_url,
  ]
    .map((value) => toText(value))
    .filter(Boolean)
}

function documentMatchesRequirement(document = {}, requirement = {}) {
  const requirementId = toText(requirement?.id || requirement?.requirement_id)
  const documentRequirementId = toText(document?.requirementId || document?.requirement_id)
  if (requirementId && documentRequirementId && requirementId === documentRequirementId) return true

  const requirementKey = normalizeDocumentMatchKey(requirement?.key || requirement?.requirement_key)
  const documentRequirementKey = normalizeDocumentMatchKey(document?.requirementKey || document?.requirement_key)
  const documentType = normalizeDocumentMatchKey(document?.document_type || document?.documentType)
  const documentCategory = normalizeDocumentMatchKey(document?.category || document?.document_category)
  return Boolean(
    requirementKey &&
      (
        documentRequirementKey === requirementKey ||
        documentType === requirementKey ||
        documentCategory === requirementKey
      ),
  )
}

function findUploadedDocumentForRequirement(uploadedDocuments = [], requirement = {}) {
  return uploadedDocuments.find((document) => documentMatchesRequirement(document, requirement)) || null
}

function normalizeRequiredDocument(requirement = {}, uploadedDocumentsById = new Map(), uploadedDocuments = []) {
  const key = toText(requirement?.key || requirement?.requirement_key || requirement?.id || requirement?.label || 'required-document')
  const requirementStatus = resolveRequirementStatus(requirement)
  const uploadedDocumentId = toText(requirement?.uploadedDocumentId || requirement?.uploaded_document_id)
  const linkedDocument = uploadedDocumentId
    ? uploadedDocumentsById.get(uploadedDocumentId) || null
    : findUploadedDocumentForRequirement(uploadedDocuments, requirement)
  const linkedStatus = linkedDocument ? normalizeDocumentStatus(linkedDocument?.status || 'uploaded') : ''
  const status = linkedDocument && ['required', 'requested'].includes(requirementStatus)
    ? linkedStatus
    : requirementStatus
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
  const uploadedDocumentsById = new Map()
  uploadedDocuments.forEach((item) => {
    getDocumentLookupKeys(item).forEach((key) => uploadedDocumentsById.set(key, item))
  })

  const normalizedRequired = uniqueById(
    toArray(documentCenter?.requiredDocuments)
      .filter((item) => isClientVisible(item) && matchesWorkspace(item, workspace))
      .map((item) => normalizeRequiredDocument(item, uploadedDocumentsById, uploadedDocuments)),
  )

  const normalizedAdditional = uniqueById(
    toArray(documentCenter?.additionalRequests)
      .filter((item) => isClientVisible(item))
      .map((item) => normalizeAdditionalRequest(item, uploadedDocumentsById)),
  )

  const linkedUploadedDocumentKeys = new Set(
    [...normalizedRequired, ...normalizedAdditional]
      .flatMap((item) => getDocumentLookupKeys(item?.linkedDocument || {})),
  )
  const isLinkedUpload = (document = {}) =>
    getDocumentLookupKeys(document).some((key) => linkedUploadedDocumentKeys.has(key))

  const normalizedUploaded = uniqueById(
    uploadedDocuments
      .filter((item) => !isLinkedUpload(item))
      .map((item) => normalizeUploadedDocument(item)),
  )
  const normalizedSigned = uniqueById(
    toArray(documentCenter?.signedDocuments)
      .filter((item) => isClientVisible(item))
      .filter((item) => !isLinkedUpload(item))
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
      .map((item) => normalizeRequiredDocument(item, uploadedDocumentsById, uploadedDocuments)),
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
  hideHeader = false,
  onUpload = null,
  onOpenDocument = null,
}) {
  const [activeSellerDocumentTab, setActiveSellerDocumentTab] = useState('property')
  const canonicalRequirements = toArray(documentCenter?.canonicalRequirements)
  if (isCanonicalDocumentWorkspaceEnabled() && canonicalRequirements.length) {
    return (
      <CanonicalDocumentWorkspace
        requirements={canonicalRequirements}
        documentCenter={documentCenter}
        role={workspace === 'selling' ? 'seller' : 'buyer'}
        uploadingDocumentKey={uploadingDocumentKey}
        openingDocumentPath={openingDocumentPath}
        onUpload={onUpload}
        onOpenDocument={onOpenDocument}
      />
    )
  }

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
  const sellerDocumentTabs = [
    {
      key: 'property',
      title: 'Property Documents',
      subtitle: 'Property, mandate, transfer, levy, rates, occupancy, and related sale documents.',
      items: uniqueById([...sellerPropertyDocuments, ...sellerMandateDocuments, ...sellerTransferDocuments]),
      emptyState: 'No property documents are required at this stage.',
    },
    {
      key: 'fica',
      title: 'FICA Documents',
      subtitle: 'Identity and compliance documents based on your seller onboarding answers.',
      items: sellerFicaDocuments,
      emptyState: 'No FICA documents are required at this stage.',
    },
    {
      key: 'additional',
      title: 'Additional Requests',
      subtitle: 'Extra seller documents requested by your transaction team.',
      items: sections.additionalRequests,
      emptyState: 'No additional document requests yet.',
    },
  ]
  const activeSellerDocumentSection =
    sellerDocumentTabs.find((tab) => tab.key === activeSellerDocumentTab) || sellerDocumentTabs[0]

  return (
    <section className="space-y-5 rounded-[28px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
      {!hideHeader ? (
      <div>
        <h3 className="text-[1.16rem] font-semibold tracking-[-0.03em] text-[#142132]">{isSelling ? 'Seller Documents' : 'Document Centre'}</h3>
        <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
          {isSelling
            ? 'Track seller-visible FICA, property, mandate, and transfer documents.'
            : 'Upload, review, and track all required documents for your transaction.'}
        </p>
      </div>
      ) : null}

      {isSelling ? (
        <>
          <div className="rounded-[18px] border border-[#dbe5ef] bg-[#f8fbff] p-2">
            <div className="grid gap-2 md:grid-cols-3">
              {sellerDocumentTabs.map((tab) => {
                const isActive = activeSellerDocumentSection.key === tab.key
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveSellerDocumentTab(tab.key)}
                    className={`inline-flex min-h-[46px] items-center justify-between gap-3 rounded-[14px] px-4 py-2 text-left text-sm font-semibold transition ${
                      isActive
                        ? 'border border-[#cfe0ef] bg-white text-[#142132] shadow-[0_10px_22px_rgba(15,23,42,0.08)]'
                        : 'border border-transparent text-[#5f7086] hover:border-[#d8e4ef] hover:bg-white hover:text-[#142132]'
                    }`}
                  >
                    <span>{tab.title}</span>
                    <span className="inline-flex min-w-[28px] items-center justify-center rounded-full border border-[#dce6f0] bg-white px-2 py-0.5 text-[0.7rem] font-semibold text-[#5f7086]">
                      {tab.items.length}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <ClientDocumentSection
            title={activeSellerDocumentSection.title}
            subtitle={activeSellerDocumentSection.subtitle}
            items={activeSellerDocumentSection.items}
            emptyState={activeSellerDocumentSection.emptyState}
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
