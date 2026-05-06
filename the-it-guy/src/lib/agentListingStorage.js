const AGENT_PRIVATE_LISTINGS_STORAGE_KEY = 'itg:agent-private-listings:v1'
const AGENT_SELLER_LEADS_STORAGE_KEY = 'itg:agent-seller-leads:v1'
const AGENT_LISTING_DRAFTS_STORAGE_KEY = 'itg:agent-listing-drafts:v1'

export const SELLER_ONBOARDING_STATUS = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  COMPLETED: 'completed',
}

export const SELLER_LEAD_STAGE = {
  NEW_LEAD: 'new_lead',
  CONTACTED: 'contacted',
  ONBOARDING_SENT: 'onboarding_sent',
  ONBOARDING_COMPLETED: 'onboarding_completed',
}

export const LISTING_STATUS = {
  DRAFT: 'draft',
  SELLER_ONBOARDING_PENDING: 'seller_onboarding_pending',
  SELLER_ONBOARDING_SENT: 'seller_onboarding_sent',
  SELLER_ONBOARDING_COMPLETED: 'seller_onboarding_completed',
  MANDATE_READY: 'mandate_ready',
  MANDATE_SENT: 'mandate_sent',
  MANDATE_SIGNED: 'mandate_signed',
  LISTING_ACTIVE: 'listing_active',
}

export const LISTING_DRAFT_STAGE = {
  SELLER_ONBOARDING_PENDING: LISTING_STATUS.SELLER_ONBOARDING_PENDING,
  ONBOARDING_COMPLETED: LISTING_STATUS.SELLER_ONBOARDING_COMPLETED,
  VALUATION_PENDING: LISTING_STATUS.MANDATE_READY,
  MANDATE_SETUP: LISTING_STATUS.MANDATE_READY,
  MANDATE_SENT: LISTING_STATUS.MANDATE_SENT,
  MANDATE_SIGNED_PENDING_DOCS: LISTING_STATUS.MANDATE_SIGNED,
  READY_TO_ACTIVATE: LISTING_STATUS.MANDATE_SIGNED,
}

export const OFFER_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
}

export const SELLER_REQUIRED_DOCUMENTS = [
  { key: 'mandate_to_sell', label: 'Mandate to Sell', status: 'requested', required: true },
  { key: 'rates_account', label: 'Rates Account (Municipal)', status: 'requested', required: true },
  { key: 'levies_statement', label: 'Levies Statement', status: 'requested', required: false },
  { key: 'bond_statement', label: 'Bond Statement', status: 'requested', required: false },
  { key: 'utility_bill', label: 'Utility Bill', status: 'requested', required: false },
  { key: 'id_document', label: 'ID Document', status: 'requested', required: true },
  { key: 'proof_of_address', label: 'Proof of Address', status: 'requested', required: true },
  { key: 'entity_documents', label: 'Company / Trust Documents', status: 'requested', required: false },
]

function readRows(storageKey) {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeRows(storageKey, rows) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(storageKey, JSON.stringify(Array.isArray(rows) ? rows : []))
}

function cloneRequiredDocuments() {
  return SELLER_REQUIRED_DOCUMENTS.map((doc) => ({ ...doc }))
}

function getDraftDocumentSummary(requiredDocuments = []) {
  const rows = Array.isArray(requiredDocuments) ? requiredDocuments : []
  const required = rows.filter((doc) => doc?.required)
  const ready = required.every((doc) => ['approved', 'verified', 'completed'].includes(String(doc?.status || '').trim().toLowerCase()))
  return {
    total: rows.length,
    complete: rows.filter((doc) => ['approved', 'verified', 'completed'].includes(String(doc?.status || '').trim().toLowerCase())).length,
    ready,
  }
}

export function generateId(prefix = 'id') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${prefix}_${Date.now()}`
}

export function generateListingReference(existingRows = []) {
  const rows = Array.isArray(existingRows) ? existingRows : []
  const maxSequence = rows.reduce((max, row) => {
    const raw = String(row?.listingCode || '').trim()
    const match = raw.match(/BRG-LST-(\d{6})$/)
    if (!match) return max
    const value = Number(match[1] || 0)
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, 0)

  const nextValue = maxSequence + 1
  return `BRG-LST-${String(nextValue).padStart(6, '0')}`
}

export function generateSellerOnboardingToken() {
  return `seller-${Math.random().toString(36).slice(2, 14)}${Date.now().toString(36)}`
}

export function buildSellerOnboardingLink(token, baseUrl = '') {
  if (!token) return ''
  const origin =
    baseUrl ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://app.bridgenine.co.za')
  return `${origin}/client/${token}/selling/onboarding`
}

export function buildSellerWorkspaceLink(token, baseUrl = '') {
  if (!token) return ''
  const origin =
    baseUrl ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://app.bridgenine.co.za')
  return `${origin}/client/${token}/selling`
}

export function readAgentPrivateListings() {
  return readRows(AGENT_PRIVATE_LISTINGS_STORAGE_KEY)
}

export function writeAgentPrivateListings(rows) {
  writeRows(AGENT_PRIVATE_LISTINGS_STORAGE_KEY, rows)
}

export function readAgentSellerLeads() {
  return readRows(AGENT_SELLER_LEADS_STORAGE_KEY)
}

export function writeAgentSellerLeads(rows) {
  writeRows(AGENT_SELLER_LEADS_STORAGE_KEY, rows)
}

export function readAgentListingDrafts() {
  return readRows(AGENT_LISTING_DRAFTS_STORAGE_KEY)
}

export function writeAgentListingDrafts(rows) {
  writeRows(AGENT_LISTING_DRAFTS_STORAGE_KEY, rows)
}

export function createAgentSellerLead(payload = {}) {
  const leads = readAgentSellerLeads()
  const token = payload?.sellerOnboarding?.token || generateSellerOnboardingToken()
  const link = payload?.sellerOnboarding?.link || buildSellerOnboardingLink(token)
  const lead = {
    id: payload.id || generateId('seller_lead'),
    sellerLeadId: payload.sellerLeadId || payload.id || generateId('seller_lead'),
    createdAt: payload.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    agentId: payload.agentId || '',
    assignedAgentName: payload.assignedAgentName || payload.assignedAgent || '',
    assignedAgentEmail: payload.assignedAgentEmail || '',
    agencyId: payload.agencyId || '',
    agencyOrganisation: payload.agencyOrganisation || '',
    listingCategory: payload.listingCategory || 'private_sale',
    sellerName: payload.sellerName || '',
    sellerSurname: payload.sellerSurname || '',
    sellerEmail: payload.sellerEmail || '',
    sellerPhone: payload.sellerPhone || '',
    seller: {
      name: [payload.sellerName || '', payload.sellerSurname || ''].filter(Boolean).join(' ').trim(),
      email: payload.sellerEmail || '',
      phone: payload.sellerPhone || '',
    },
    propertyAddress: payload.propertyAddress || '',
    propertyType: payload.propertyType || 'House',
    estimatedPrice: Number(payload.estimatedPrice || 0) || 0,
    listingTitle: payload.propertyData?.listingTitle || payload.listingTitle || payload.propertyAddress || '',
    suburb: payload.propertyData?.suburb || payload.suburb || '',
    city: payload.propertyData?.city || payload.city || '',
    askingPrice: Number(payload.estimatedPrice || 0) || 0,
    mandateType: payload?.mandate?.type || payload.mandateType || 'sole',
    mandateStartDate: payload?.mandate?.startDate || payload.mandateStartDate || null,
    mandateEndDate: payload?.mandate?.endDate || payload.mandateEndDate || null,
    leadSource: payload.leadSource || 'Referral',
    stage: payload.stage || SELLER_LEAD_STAGE.ONBOARDING_SENT,
    listingStatus: payload.listingStatus || LISTING_STATUS.DRAFT,
    onboardingStatus: payload.onboardingStatus || SELLER_ONBOARDING_STATUS.NOT_STARTED,
    propertyData: {
      listingTitle: payload.propertyData?.listingTitle || payload.listingTitle || '',
      suburb: payload.propertyData?.suburb || payload.suburb || '',
      city: payload.propertyData?.city || payload.city || '',
      province: payload.propertyData?.province || payload.province || '',
      addressLine1: payload.propertyData?.addressLine1 || payload.propertyAddress || '',
      addressLine2: payload.propertyData?.addressLine2 || '',
      ...payload.propertyData,
    },
    commission: payload.commission || null,
    rolePlayers: payload.rolePlayers || null,
    mandate: payload.mandate || null,
    notes: payload.notes || '',
    requiredDocuments: Array.isArray(payload.requiredDocuments) && payload.requiredDocuments.length ? payload.requiredDocuments : cloneRequiredDocuments(),
    sellerOnboarding: {
      token,
      link,
      status: payload?.sellerOnboarding?.status || payload.onboardingStatus || SELLER_ONBOARDING_STATUS.NOT_STARTED,
      startedAt: payload?.sellerOnboarding?.startedAt || null,
      submittedAt: payload?.sellerOnboarding?.submittedAt || null,
      completedAt: payload?.sellerOnboarding?.completedAt || null,
      reviewedAt: payload?.sellerOnboarding?.reviewedAt || null,
      currentStep: Number(payload?.sellerOnboarding?.currentStep || 0),
      formData: payload?.sellerOnboarding?.formData || {},
    },
    listingDraftId: payload.listingDraftId || null,
  }
  writeAgentSellerLeads([lead, ...leads])
  return lead
}

export function updateAgentSellerLead(leadId, updater) {
  if (!leadId || typeof updater !== 'function') return null
  const rows = readAgentSellerLeads()
  let updated = null
  const nextRows = rows.map((row) => {
    if (String(row?.id || row?.sellerLeadId || '') !== String(leadId)) return row
    const candidate = updater({ ...row })
    const nextRow = {
      ...candidate,
      updatedAt: new Date().toISOString(),
    }
    updated = nextRow
    return nextRow
  })
  if (updated) writeAgentSellerLeads(nextRows)
  return updated
}

export function findListingBySellerOnboardingToken(token) {
  if (!token) return null
  const normalized = String(token).trim()
  return readAgentPrivateListings().find((listing) => String(listing?.sellerOnboarding?.token || '').trim() === normalized) || null
}

export function findSellerLeadByOnboardingToken(token) {
  if (!token) return null
  const normalized = String(token).trim()
  return readAgentSellerLeads().find((lead) => String(lead?.sellerOnboarding?.token || '').trim() === normalized) || null
}

export function findSellerWorkflowRecordByToken(token) {
  return findSellerLeadByOnboardingToken(token) || findListingBySellerOnboardingToken(token)
}

export function updateListingBySellerOnboardingToken(token, updater) {
  if (!token || typeof updater !== 'function') return null
  const normalized = String(token).trim()
  const rows = readAgentPrivateListings()
  let updatedListing = null
  const nextRows = rows.map((row) => {
    if (String(row?.sellerOnboarding?.token || '').trim() !== normalized) return row
    const nextRow = updater({ ...row })
    updatedListing = nextRow
    return nextRow
  })
  if (updatedListing) {
    writeAgentPrivateListings(nextRows)
  }
  return updatedListing
}

export function updateSellerLeadByOnboardingToken(token, updater) {
  if (!token || typeof updater !== 'function') return null
  const normalized = String(token).trim()
  const rows = readAgentSellerLeads()
  let updatedLead = null
  const nextRows = rows.map((row) => {
    if (String(row?.sellerOnboarding?.token || '').trim() !== normalized) return row
    const nextRow = { ...updater({ ...row }), updatedAt: new Date().toISOString() }
    updatedLead = nextRow
    return nextRow
  })
  if (updatedLead) writeAgentSellerLeads(nextRows)
  return updatedLead
}

export function updateSellerWorkflowRecordByToken(token, updater) {
  return updateSellerLeadByOnboardingToken(token, updater) || updateListingBySellerOnboardingToken(token, updater)
}

function deriveListingDraftStage(draft) {
  const currentStage = String(draft?.stage || '').trim().toLowerCase()
  const legacyStatusMap = {
    onboarding_completed: LISTING_STATUS.SELLER_ONBOARDING_COMPLETED,
    valuation_pending: LISTING_STATUS.MANDATE_READY,
    mandate_setup: LISTING_STATUS.MANDATE_READY,
    mandate_signed_pending_docs: LISTING_STATUS.MANDATE_SIGNED,
    ready_to_activate: LISTING_STATUS.MANDATE_SIGNED,
    active: LISTING_STATUS.LISTING_ACTIVE,
  }
  if (legacyStatusMap[currentStage]) return legacyStatusMap[currentStage]
  const explicitWorkflowStatuses = new Set([
    LISTING_STATUS.DRAFT,
    LISTING_STATUS.SELLER_ONBOARDING_PENDING,
    LISTING_STATUS.SELLER_ONBOARDING_SENT,
    LISTING_STATUS.SELLER_ONBOARDING_COMPLETED,
    LISTING_STATUS.MANDATE_READY,
    LISTING_STATUS.MANDATE_SENT,
    LISTING_STATUS.MANDATE_SIGNED,
    LISTING_STATUS.LISTING_ACTIVE,
  ])
  if (explicitWorkflowStatuses.has(currentStage)) return currentStage
  if (currentStage) {
    return currentStage
  }

  const onboardingStatus = String(draft?.sellerOnboarding?.status || '').trim().toLowerCase()
  const onboardingCompleted = [SELLER_ONBOARDING_STATUS.COMPLETED, SELLER_ONBOARDING_STATUS.SUBMITTED, SELLER_ONBOARDING_STATUS.UNDER_REVIEW]
    .includes(onboardingStatus)

  const mandateSigned = Boolean(draft?.mandate?.signedAt || draft?.mandate?.signed)
  if (mandateSigned) return LISTING_STATUS.MANDATE_SIGNED
  if (draft?.mandate?.sentAt) return LISTING_STATUS.MANDATE_SENT
  if (draft?.listingPrice || draft?.commission?.commission_percentage || draft?.commission?.commission_amount) {
    return LISTING_STATUS.MANDATE_READY
  }
  if (onboardingCompleted) return LISTING_STATUS.SELLER_ONBOARDING_COMPLETED
  if (draft?.sellerOnboarding?.link) return LISTING_STATUS.SELLER_ONBOARDING_SENT
  return LISTING_STATUS.SELLER_ONBOARDING_PENDING
}

export function createListingDraftFromSellerLead(lead, options = {}) {
  if (!lead) return null

  const existingDrafts = readAgentListingDrafts()
  const existingIndex = existingDrafts.findIndex((draft) => String(draft?.sellerLeadId || '') === String(lead?.sellerLeadId || lead?.id || ''))
  const onboardingStatus = String(lead?.sellerOnboarding?.status || lead?.onboardingStatus || '').trim().toLowerCase()
  const onboardingCompleted = [SELLER_ONBOARDING_STATUS.COMPLETED, SELLER_ONBOARDING_STATUS.SUBMITTED, SELLER_ONBOARDING_STATUS.UNDER_REVIEW].includes(onboardingStatus)
  const requestedStage = String(options?.stage || '').trim().toLowerCase()
  const targetStage = requestedStage || (onboardingCompleted ? LISTING_STATUS.SELLER_ONBOARDING_COMPLETED : LISTING_STATUS.SELLER_ONBOARDING_PENDING)

  const requiredDocuments = Array.isArray(lead?.requiredDocuments) && lead.requiredDocuments.length
    ? lead.requiredDocuments.map((doc) => ({ ...doc }))
    : cloneRequiredDocuments()

  if (existingIndex >= 0) {
    const existing = existingDrafts[existingIndex]
    const nextRow = {
      ...existing,
      sellerId: lead?.sellerId || existing?.sellerId || '',
      agentId: lead?.agentId || existing?.agentId || '',
      agencyId: lead?.agencyId || existing?.agencyId || '',
      propertyId: lead?.propertyId || existing?.propertyId || '',
      onboardingDataSnapshot: lead?.sellerOnboarding?.formData || existing?.onboardingDataSnapshot || {},
      stage:
        targetStage ||
        (onboardingCompleted && existing?.stage === LISTING_STATUS.SELLER_ONBOARDING_PENDING
          ? LISTING_STATUS.SELLER_ONBOARDING_COMPLETED
          : existing?.stage),
      seller: {
        name: [lead?.sellerName, lead?.sellerSurname].filter(Boolean).join(' ').trim() || existing?.seller?.name || '',
        email: lead?.sellerEmail || existing?.seller?.email || '',
        phone: lead?.sellerPhone || existing?.seller?.phone || '',
      },
      listingTitle: lead?.propertyData?.listingTitle || lead?.propertyAddress || existing?.listingTitle || '',
      propertyAddress: lead?.propertyAddress || existing?.propertyAddress || '',
      propertyType: lead?.propertyType || existing?.propertyType || 'House',
      suburb: lead?.propertyData?.suburb || existing?.suburb || '',
      city: lead?.propertyData?.city || existing?.city || '',
      province: lead?.propertyData?.province || existing?.province || '',
      askingPrice: Number(lead?.estimatedPrice || existing?.askingPrice || 0) || 0,
      listingPrice: Number(lead?.estimatedPrice || existing?.listingPrice || 0) || 0,
      leadSource: lead?.leadSource || existing?.leadSource || 'Referral',
      listingCategory: lead?.listingCategory || existing?.listingCategory || 'private_sale',
      assignedAgentName: lead?.assignedAgentName || lead?.assignedAgent || existing?.assignedAgentName || '',
      assignedAgentEmail: lead?.assignedAgentEmail || existing?.assignedAgentEmail || '',
      agencyOrganisation: lead?.agencyOrganisation || existing?.agencyOrganisation || '',
      commission: lead?.commission || existing?.commission || null,
      rolePlayers: lead?.rolePlayers || existing?.rolePlayers || null,
      mandate: lead?.mandate || existing?.mandate || null,
      requiredDocuments: (existing?.requiredDocuments || requiredDocuments).map((doc) => ({ ...doc })),
      sellerOnboarding: {
        ...(existing?.sellerOnboarding || {}),
        ...(lead?.sellerOnboarding || {}),
        status: onboardingCompleted ? SELLER_ONBOARDING_STATUS.COMPLETED : lead?.sellerOnboarding?.status || SELLER_ONBOARDING_STATUS.NOT_STARTED,
      },
      updatedAt: new Date().toISOString(),
    }

    const finalized = {
      ...nextRow,
      stage: deriveListingDraftStage(nextRow),
      requiredDocumentsStatus: getDraftDocumentSummary(nextRow?.requiredDocuments).ready ? 'complete' : 'pending',
    }
    const rows = existingDrafts.slice()
    rows[existingIndex] = finalized
    writeAgentListingDrafts(rows)
    updateAgentSellerLead(lead?.sellerLeadId || lead?.id || '', (row) => ({
      ...row,
      ...(onboardingCompleted
        ? { stage: SELLER_LEAD_STAGE.ONBOARDING_COMPLETED, onboardingStatus: SELLER_ONBOARDING_STATUS.COMPLETED, listingStatus: LISTING_STATUS.SELLER_ONBOARDING_COMPLETED }
        : {}),
      listingDraftId: finalized.id,
    }))
    return finalized
  }

  const draft = {
    id: generateId('listing_draft'),
    listingDraftId: generateId('listing_draft'),
    sellerLeadId: lead?.sellerLeadId || lead?.id || '',
    sellerId: lead?.sellerId || '',
    agentId: lead?.agentId || '',
    agencyId: lead?.agencyId || '',
    propertyId: lead?.propertyId || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    onboardingDataSnapshot: lead?.sellerOnboarding?.formData || {},
    stage: targetStage,
    mandateStatus: 'pending',
    requiredDocumentsStatus: getDraftDocumentSummary(requiredDocuments).ready ? 'complete' : 'pending',
    internalVisibility: true,
    seller: {
      name: [lead?.sellerName, lead?.sellerSurname].filter(Boolean).join(' ').trim(),
      email: lead?.sellerEmail || '',
      phone: lead?.sellerPhone || '',
    },
    listingTitle: lead?.propertyData?.listingTitle || lead?.propertyAddress || '',
    propertyAddress: lead?.propertyAddress || '',
    propertyType: lead?.propertyType || 'House',
    suburb: lead?.propertyData?.suburb || '',
    city: lead?.propertyData?.city || '',
    province: lead?.propertyData?.province || '',
    askingPrice: Number(lead?.estimatedPrice || 0) || 0,
    listingPrice: Number(lead?.estimatedPrice || 0) || 0,
    leadSource: lead?.leadSource || 'Referral',
    listingCategory: lead?.listingCategory || 'private_sale',
    assignedAgentName: lead?.assignedAgentName || lead?.assignedAgent || '',
    assignedAgentEmail: lead?.assignedAgentEmail || '',
    agencyOrganisation: lead?.agencyOrganisation || '',
    commission: lead?.commission || null,
    rolePlayers: lead?.rolePlayers || null,
    mandate: lead?.mandate || null,
    requiredDocuments,
    sellerOnboarding: {
      ...(lead?.sellerOnboarding || {}),
      status: onboardingCompleted ? SELLER_ONBOARDING_STATUS.COMPLETED : lead?.sellerOnboarding?.status || SELLER_ONBOARDING_STATUS.NOT_STARTED,
    },
  }

  draft.stage = deriveListingDraftStage(draft)
  writeAgentListingDrafts([draft, ...existingDrafts])
  updateAgentSellerLead(lead?.sellerLeadId || lead?.id || '', (row) => ({
    ...row,
    ...(onboardingCompleted
      ? { stage: SELLER_LEAD_STAGE.ONBOARDING_COMPLETED, onboardingStatus: SELLER_ONBOARDING_STATUS.COMPLETED, listingStatus: LISTING_STATUS.SELLER_ONBOARDING_COMPLETED }
      : {}),
    listingDraftId: draft.id,
  }))
  return draft
}

export function updateListingDraft(draftId, updater) {
  if (!draftId || typeof updater !== 'function') return null
  const rows = readAgentListingDrafts()
  let updated = null
  const nextRows = rows.map((row) => {
    if (String(row?.id || row?.listingDraftId || '') !== String(draftId)) return row
    const candidate = updater({ ...row })
    const nextRow = {
      ...candidate,
      stage: deriveListingDraftStage(candidate),
      requiredDocumentsStatus: getDraftDocumentSummary(candidate?.requiredDocuments).ready ? 'complete' : 'pending',
      updatedAt: new Date().toISOString(),
    }
    updated = nextRow
    return nextRow
  })
  if (updated) writeAgentListingDrafts(nextRows)
  return updated
}

export function isListingDraftReadyForActivation(draft) {
  if (!draft) return false
  const docsReady = getDraftDocumentSummary(draft?.requiredDocuments).ready
  const mandateSigned = Boolean(draft?.mandate?.signedAt || draft?.mandate?.signed)
  return mandateSigned && docsReady
}

export function activateListingDraft(draftId, overrides = {}) {
  const draftRows = readAgentListingDrafts()
  const activeRows = readAgentPrivateListings()
  const target = draftRows.find((row) => String(row?.id || row?.listingDraftId || '') === String(draftId))
  if (!target || !isListingDraftReadyForActivation(target)) return null

  const activeListing = {
    id: generateId('listing'),
    listingCode: generateListingReference(activeRows),
    createdAt: target.createdAt || new Date().toISOString(),
    activatedAt: new Date().toISOString(),
    listingTitle: overrides.listingTitle || target.listingTitle || target.propertyAddress || 'Private Listing',
    propertyType: overrides.propertyType || target.propertyType || 'House',
    suburb: overrides.suburb || target.suburb || '',
    city: overrides.city || target.city || '',
    askingPrice: Number(overrides.askingPrice || target.listingPrice || target.askingPrice || 0) || 0,
    mandateType: overrides.mandateType || target?.mandate?.type || 'sole',
    mandateStartDate: overrides.mandateStartDate || target?.mandate?.startDate || null,
    mandateEndDate: overrides.mandateEndDate || target?.mandate?.endDate || null,
    seller: target.seller || { name: '', email: '', phone: '' },
    commission: target.commission || null,
    rolePlayers: target.rolePlayers || null,
    sellerOnboarding: {
      ...(target?.sellerOnboarding || {}),
      status: SELLER_ONBOARDING_STATUS.COMPLETED,
      completedAt: target?.sellerOnboarding?.completedAt || new Date().toISOString(),
    },
    offers: [],
    marketing: target.marketing || {},
    ownership: target.ownership || {},
    requiredDocuments: (target.requiredDocuments || []).map((doc) => ({ ...doc })),
    status: LISTING_STATUS.LISTING_ACTIVE,
    listingStatus: LISTING_STATUS.LISTING_ACTIVE,
    sourceDraftId: target.id,
  }

  writeAgentPrivateListings([activeListing, ...activeRows])
  writeAgentListingDrafts(draftRows.filter((row) => String(row?.id || row?.listingDraftId || '') !== String(draftId)))
  return activeListing
}

export function isAgentListingReadyForDeal(listing) {
  if (!listing) {
    return false
  }

  const status = String(listing?.status || listing?.listingStatus || '').trim().toLowerCase()
  const explicitBlockedStatuses = new Set([
    LISTING_STATUS.DRAFT,
    LISTING_STATUS.SELLER_ONBOARDING_PENDING,
    LISTING_STATUS.SELLER_ONBOARDING_SENT,
    LISTING_STATUS.SELLER_ONBOARDING_COMPLETED,
    LISTING_STATUS.MANDATE_READY,
    LISTING_STATUS.MANDATE_SENT,
  ])
  if (explicitBlockedStatuses.has(status)) {
    return false
  }

  const onboardingStatus = String(listing?.sellerOnboarding?.status || '').trim().toLowerCase()
  if (onboardingStatus !== SELLER_ONBOARDING_STATUS.COMPLETED) {
    return false
  }

  const requiredDocuments = Array.isArray(listing?.requiredDocuments) ? listing.requiredDocuments : []
  const requiredReady = requiredDocuments
    .filter((doc) => doc?.required)
    .every((doc) => ['approved', 'verified', 'completed'].includes(String(doc?.status || '').trim().toLowerCase()))

  if (!requiredReady) {
    return false
  }

  const mandateDocument = requiredDocuments.find((doc) => doc?.key === 'mandate_to_sell')
  if (!mandateDocument) {
    return false
  }

  const mandateReady = ['approved', 'verified', 'completed'].includes(String(mandateDocument.status || '').trim().toLowerCase())
  if (!mandateReady) {
    return false
  }

  const hasExistingActiveDeal = Boolean(
    listing?.activeDeal &&
    (String(listing?.activeDeal?.transactionId || '').trim() ||
      String(listing?.activeDeal?.id || '').trim()),
  )
  if (hasExistingActiveDeal) {
    return false
  }

  if (!status) {
    return true
  }

  return ['active', 'under_offer', 'in_progress', LISTING_STATUS.MANDATE_SIGNED, LISTING_STATUS.LISTING_ACTIVE].includes(status)
}
