import { useState } from 'react'
import { normalizeDocumentStatus } from '../../../lib/clientPortalDocumentStatus'
import { getEducationalContentForRequirement } from '../../../content/clientPortalEducation'
import SellerDocumentWorkspace from './SellerDocumentWorkspace'

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
  const rawStatus = requirement?.requiredDocumentStatus || requirement?.status || ''
  const normalized = normalizeDocumentStatus(rawStatus)
  if (requirement?.complete === true) {
    const hasUploadedDocument = Boolean(
      requirement?.uploadedDocument ||
        requirement?.uploaded_document ||
        requirement?.uploadedDocumentId ||
        requirement?.uploaded_document_id,
    )
    if (hasUploadedDocument && ['required', 'requested'].includes(normalized)) return 'uploaded'
    if (hasUploadedDocument) return normalized
    return 'completed'
  }
  return normalized
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

function isSignedMandateRequirement(requirement = {}) {
  const source = normalizeDocumentMatchKey([
    requirement?.key,
    requirement?.requirement_key,
    requirement?.label,
    requirement?.requirement_name,
    requirement?.name,
    requirement?.title,
  ].filter(Boolean).join(' '))
  return source.includes('signed_mandate') || source.includes('mandate_signature') || (source.includes('mandate') && source.includes('signed'))
}

function isSignedMandateDocument(document = {}) {
  const source = normalizeDocumentMatchKey([
    document?.requirementKey,
    document?.requirement_key,
    document?.document_type,
    document?.documentType,
    document?.category,
    document?.document_category,
    document?.name,
    document?.document_name,
    document?.title,
  ].filter(Boolean).join(' '))
  return source.includes('mandate_signature') || source.includes('signed_mandate') || (source.includes('mandate') && source.includes('signed'))
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

  if (isSignedMandateRequirement(requirement) && isSignedMandateDocument(document)) return true

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
  const embeddedLinkedDocument =
    requirement?.uploadedDocument && typeof requirement.uploadedDocument === 'object'
      ? requirement.uploadedDocument
      : requirement?.uploaded_document && typeof requirement.uploaded_document === 'object'
        ? requirement.uploaded_document
        : null
  const linkedDocument = embeddedLinkedDocument || (
    uploadedDocumentId
      ? uploadedDocumentsById.get(uploadedDocumentId) || null
      : findUploadedDocumentForRequirement(uploadedDocuments, requirement)
  )
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
    uploadSpec: isSignedMandateRequirement(requirement) && linkedDocument ? null : resolveRequirementUploadSpec(requirement),
    openLabel: isSignedMandateRequirement(requirement) && linkedDocument ? 'Download Signed Mandate' : '',
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

function normalizeDocumentCentreItem(item = {}) {
  const sourceId = toText(item?.sourceId || item?.source_id || item?.id || item?.title, 'document')
  const sourceType = toText(item?.sourceType || item?.source_type || 'document')
  const linkedDocument =
    item?.linkedDocument && typeof item.linkedDocument === 'object'
      ? item.linkedDocument
      : item?.linked_document && typeof item.linked_document === 'object'
        ? item.linked_document
        : null
  return {
    ...item,
    id: toText(item?.id, `${sourceType}_${sourceId}`),
    sourceId,
    sourceType,
    title: toText(item?.title || item?.label || item?.document_name, 'Document'),
    description: toText(item?.description || item?.notes, 'Supporting document required for your transaction.'),
    group: toText(item?.group || item?.requirement_group || item?.category),
    status: normalizeDocumentStatus(item?.status || 'required'),
    rejectionReason: toText(item?.rejectionReason || item?.rejection_reason),
    linkedDocument,
    hasUploadedDocument: Boolean(item?.hasUploadedDocument || item?.has_uploaded_document || linkedDocument),
    uploadKey: toText(item?.uploadKey || item?.upload_key),
    uploadSpec: item?.uploadSpec || item?.upload_spec || null,
    metaLine: toText(item?.metaLine || item?.meta_line),
    isCoreRequirement: item?.isCoreRequirement ?? item?.is_core_requirement ?? sourceType === 'required_document',
  }
}

function isSignedDocumentCentreItem(item = {}) {
  const source = normalizeDocumentMatchKey([
    item?.sourceType,
    item?.group,
    item?.title,
    item?.description,
    item?.linkedDocument?.document_type,
    item?.linkedDocument?.category,
  ].filter(Boolean).join(' '))
  return source.includes('signed') || source.includes('signature') || source.includes('otp') || source.includes('mandate')
}

function buildDocumentCentreSections(documentCenter = {}, workspace = 'buying') {
  const typedItems = uniqueById(
    toArray(documentCenter?.items)
      .filter((item) => isClientVisible(item))
      .filter((item) => matchesWorkspace(item, workspace))
      .map((item) => normalizeDocumentCentreItem(item)),
  )

  if (typedItems.length) {
    const requirementItems = typedItems.filter((item) =>
      ['required_document', 'additional_request'].includes(item.sourceType),
    )
    const additionalRequests = typedItems.filter((item) => item.sourceType === 'additional_request')
    const requiredFromYou = requirementItems.filter((item) => ['required', 'requested'].includes(item.status))
    const rejectedNeedsAttention = requirementItems.filter((item) => item.status === 'rejected')
    const uploadedUnderReview = typedItems.filter((item) => ['uploaded', 'under_review'].includes(item.status))
    const approvedCompleted = typedItems.filter((item) => ['approved', 'completed'].includes(item.status))
    const signedDocuments = approvedCompleted.filter((item) => isSignedDocumentCentreItem(item))

    return {
      requiredFromYou: uniqueById(requiredFromYou),
      allRequired: uniqueById(requirementItems),
      additionalRequests: uniqueById(additionalRequests),
      uploadedUnderReview: uniqueById(uploadedUnderReview),
      rejectedNeedsAttention: uniqueById(rejectedNeedsAttention),
      approvedCompleted: uniqueById(approvedCompleted),
      signedDocuments: uniqueById(signedDocuments),
    }
  }

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

function buyerRequirementGroup(item = {}) {
  const haystack = `${item?.group || ''} ${item?.sourceId || ''} ${item?.title || ''} ${item?.description || ''}`.toLowerCase()
  if (/additional/.test(haystack)) return 'additional'
  if (/bond|bank|finance|income|employer|employment|affordability|proof.of.funds|source.of.funds|deposit|cash|salary|statement|liabilit/.test(haystack)) return 'finance'
  if (/offer|otp|reservation|sale agreement|agreement of sale|purchase agreement|signed/.test(haystack)) return 'sales'
  if (/property|unit|developer|specification|plans|levy|rates|hoa|body corporate/.test(haystack)) return 'property'
  if (/identity|passport|fica|kyc|residen|tax|spouse|director|trustee|company|cipc|registration/.test(haystack)) return 'fica'
  return 'fica'
}

function decoratePortalDocumentItem(item = {}, categoryKey = '') {
  const labels = {
    sales: 'Sales',
    finance: 'Finance',
    property: 'Property',
    fica: 'FICA',
    mandate: 'Mandate',
    transfer: 'Transfer',
    additional: 'Additional Request',
  }
  return {
    ...item,
    sellerCategoryKey: categoryKey || 'property',
    sellerCategoryLabel: labels[categoryKey] || 'Property',
    isCoreRequirement: categoryKey !== 'additional',
  }
}

function ClientDocumentCentre({
  documentCenter = {},
  workspace = 'buying',
  uploadingDocumentKey = '',
  openingDocumentPath = '',
  onUpload = null,
  onOpenDocument = null,
}) {
  const [activeSellerDocumentTab, setActiveSellerDocumentTab] = useState('property')
  const [activeBuyerDocumentTab, setActiveBuyerDocumentTab] = useState('sales')
  const sections = buildDocumentCentreSections(documentCenter, workspace)
  const isSelling = workspace === 'selling'
  const sellerFicaDocuments = sections.allRequired
    .filter((item) => sellerRequirementGroup(item) === 'fica')
    .map((item) => decoratePortalDocumentItem(item, 'fica'))
  const sellerPropertyDocuments = sections.allRequired
    .filter((item) => sellerRequirementGroup(item) === 'property')
    .map((item) => decoratePortalDocumentItem(item, 'property'))
  const sellerMandateDocuments = [
    ...sections.allRequired
      .filter((item) => sellerRequirementGroup(item) === 'mandate')
      .map((item) => decoratePortalDocumentItem(item, 'mandate')),
    ...sections.signedDocuments
      .filter((item) => /mandate/i.test(`${item?.title || ''} ${item?.description || ''}`))
      .map((item) => decoratePortalDocumentItem(item, 'mandate')),
  ]
  const sellerTransferDocuments = [
    ...sections.allRequired
      .filter((item) => sellerRequirementGroup(item) === 'transfer')
      .map((item) => decoratePortalDocumentItem(item, 'transfer')),
    ...sections.signedDocuments
      .filter((item) => /transfer|sale agreement|otp/i.test(`${item?.title || ''} ${item?.description || ''}`))
      .map((item) => decoratePortalDocumentItem(item, 'transfer')),
  ]
  const sellerAdditionalDocuments = sections.additionalRequests.map((item) => decoratePortalDocumentItem(item, 'additional'))
  const sellerDocumentTabs = [
    {
      key: 'property',
      title: 'Property Documents',
      subtitle: 'Property, mandate, transfer, levy, rates, occupancy, and related sale documents.',
      items: uniqueById([...sellerPropertyDocuments, ...sellerMandateDocuments, ...sellerTransferDocuments]),
      emptyState: 'No documents required in this category.',
    },
    {
      key: 'fica',
      title: 'FICA Documents',
      subtitle: 'Identity and compliance documents based on your seller onboarding answers.',
      items: sellerFicaDocuments,
      emptyState: 'No documents required in this category.',
    },
    {
      key: 'additional',
      title: 'Additional Requests',
      subtitle: 'Extra seller documents requested by your transaction team.',
      items: sellerAdditionalDocuments,
      emptyState: 'No documents required in this category.',
    },
  ]
  const activeSellerDocumentSection =
    sellerDocumentTabs.find((tab) => tab.key === activeSellerDocumentTab) || sellerDocumentTabs[0]
  const buyerFicaDocuments = sections.allRequired
    .filter((item) => buyerRequirementGroup(item) === 'fica')
    .map((item) => decoratePortalDocumentItem(item, 'fica'))
  const buyerSalesDocuments = [
    ...sections.allRequired
      .filter((item) => buyerRequirementGroup(item) === 'sales')
      .map((item) => decoratePortalDocumentItem(item, 'sales')),
    ...sections.signedDocuments
      .filter((item) => /offer|otp|reservation|sale agreement|purchase agreement/i.test(`${item?.title || ''} ${item?.description || ''}`))
      .map((item) => decoratePortalDocumentItem(item, 'sales')),
  ]
  const buyerFinanceDocuments = sections.allRequired
    .filter((item) => buyerRequirementGroup(item) === 'finance')
    .map((item) => decoratePortalDocumentItem(item, 'finance'))
  const buyerPropertyDocuments = [
    ...sections.allRequired
      .filter((item) => buyerRequirementGroup(item) === 'property')
      .map((item) => decoratePortalDocumentItem(item, 'property')),
    ...sections.signedDocuments
      .filter((item) => /property|unit|developer|levy|rates|body corporate/i.test(`${item?.title || ''} ${item?.description || ''}`))
      .map((item) => decoratePortalDocumentItem(item, 'property')),
  ]
  const buyerAdditionalDocuments = sections.additionalRequests.map((item) => decoratePortalDocumentItem(item, 'additional'))
  const buyerDocumentTabs = [
    {
      key: 'sales',
      title: 'Sales Documents',
      subtitle: 'Offer, reservation, purchase, and signed transaction documents.',
      items: uniqueById(buyerSalesDocuments),
      emptyState: 'No sales documents required in this category.',
    },
    {
      key: 'fica',
      title: 'FICA Documents',
      subtitle: 'Identity, purchaser, and compliance documents required for your purchase.',
      items: uniqueById(buyerFicaDocuments),
      emptyState: 'No FICA documents required in this category.',
    },
    {
      key: 'finance',
      title: 'Finance Documents',
      subtitle: 'Bond, bank, proof of funds, income, and affordability documents.',
      items: uniqueById(buyerFinanceDocuments),
      emptyState: 'No finance documents required in this category.',
    },
    {
      key: 'property',
      title: 'Property Documents',
      subtitle: 'Property, unit, development, and handover-related documents.',
      items: uniqueById(buyerPropertyDocuments),
      emptyState: 'No property documents required in this category.',
    },
    {
      key: 'additional',
      title: 'Additional Requests',
      subtitle: 'Extra buyer documents requested by your transaction team.',
      items: uniqueById(buyerAdditionalDocuments),
      emptyState: 'No additional document requests yet.',
    },
  ]
  const activeBuyerDocumentSection =
    buyerDocumentTabs.find((tab) => tab.key === activeBuyerDocumentTab) || buyerDocumentTabs[0]
  const handlePrimaryUploadAction = (tabs, setActiveTab, listId) => {
    const firstActionableTab = tabs.find((tab) =>
      tab.items.some((item) => item?.uploadSpec),
    ) || tabs[0]
    if (firstActionableTab?.key) {
      setActiveTab(firstActionableTab.key)
    }
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        document.getElementById(listId)?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      })
    }
  }

  if (isSelling) {
    return (
      <SellerDocumentWorkspace
        tabs={sellerDocumentTabs}
        activeTabKey={activeSellerDocumentSection.key}
        onTabChange={setActiveSellerDocumentTab}
        requiredItems={sections.allRequired.map((item) => decoratePortalDocumentItem(item, sellerRequirementGroup(item)))}
        errorMessage={documentCenter?.loadError || documentCenter?.error || ''}
        onPrimaryUploadAction={() => handlePrimaryUploadAction(sellerDocumentTabs, setActiveSellerDocumentTab, 'seller-document-list')}
        uploadingDocumentKey={uploadingDocumentKey}
        openingDocumentPath={openingDocumentPath}
        onUpload={onUpload}
        onOpenDocument={onOpenDocument}
      />
    )
  }

  return (
    <SellerDocumentWorkspace
      tabs={buyerDocumentTabs}
      activeTabKey={activeBuyerDocumentSection.key}
      onTabChange={setActiveBuyerDocumentTab}
      requiredItems={sections.allRequired.map((item) => decoratePortalDocumentItem(item, buyerRequirementGroup(item)))}
      errorMessage={documentCenter?.loadError || documentCenter?.error || ''}
      onPrimaryUploadAction={() => handlePrimaryUploadAction(buyerDocumentTabs, setActiveBuyerDocumentTab, 'buyer-document-list')}
      uploadingDocumentKey={uploadingDocumentKey}
      openingDocumentPath={openingDocumentPath}
      onUpload={onUpload}
      onOpenDocument={onOpenDocument}
      eyebrow="Buyer Portal"
      description="Upload and track the documents needed for your purchase."
      stillNeededDescription="These outstanding required documents are still blocking transaction progress."
      allCompleteMessage="All required buyer documents have been uploaded."
      footerText="Use the row actions to upload, view, or re-upload documents without leaving this page."
      listId="buyer-document-list"
    />
  )
}

export default ClientDocumentCentre
