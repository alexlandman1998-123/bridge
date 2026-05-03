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

export const LISTING_DRAFT_STAGE = {
  ONBOARDING_COMPLETED: 'onboarding_completed',
  VALUATION_PENDING: 'valuation_pending',
  MANDATE_SETUP: 'mandate_setup',
  MANDATE_SENT: 'mandate_sent',
  MANDATE_SIGNED_PENDING_DOCS: 'mandate_signed_pending_docs',
  READY_TO_ACTIVATE: 'ready_to_activate',
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
  return `${origin}/seller/onboarding/${token}`
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
    agencyId: payload.agencyId || '',
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
    const nextRow = { ...updater({ ...row }), updatedAt: new Date().toISOString() }
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
  if (currentStage && currentStage !== LISTING_DRAFT_STAGE.ONBOARDING_COMPLETED) {
    return currentStage
  }

  const mandateSigned = Boolean(draft?.mandate?.signedAt || draft?.mandate?.signed)
  const docsSummary = getDraftDocumentSummary(draft?.requiredDocuments)
  if (mandateSigned && docsSummary.ready) return LISTING_DRAFT_STAGE.READY_TO_ACTIVATE
  if (mandateSigned) return LISTING_DRAFT_STAGE.MANDATE_SIGNED_PENDING_DOCS
  if (draft?.mandate?.sentAt) return LISTING_DRAFT_STAGE.MANDATE_SENT
  if (draft?.listingPrice || draft?.commission?.commission_percentage || draft?.commission?.commission_amount) {
    return LISTING_DRAFT_STAGE.MANDATE_SETUP
  }
  return LISTING_DRAFT_STAGE.VALUATION_PENDING
}

export function createListingDraftFromSellerLead(lead) {
  if (!lead) return null

  const existingDrafts = readAgentListingDrafts()
  const existing = existingDrafts.find((draft) => String(draft?.sellerLeadId || '') === String(lead?.sellerLeadId || lead?.id || ''))
  if (existing) return existing

  const requiredDocuments = Array.isArray(lead?.requiredDocuments) && lead.requiredDocuments.length
    ? lead.requiredDocuments.map((doc) => ({ ...doc }))
    : cloneRequiredDocuments()

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
    stage: LISTING_DRAFT_STAGE.ONBOARDING_COMPLETED,
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
    commission: lead?.commission || null,
    mandate: lead?.mandate || null,
    requiredDocuments,
    sellerOnboarding: {
      ...(lead?.sellerOnboarding || {}),
      status: SELLER_ONBOARDING_STATUS.COMPLETED,
    },
  }

  draft.stage = deriveListingDraftStage(draft)
  writeAgentListingDrafts([draft, ...existingDrafts])
  updateAgentSellerLead(lead?.sellerLeadId || lead?.id || '', (row) => ({
    ...row,
    stage: SELLER_LEAD_STAGE.ONBOARDING_COMPLETED,
    onboardingStatus: SELLER_ONBOARDING_STATUS.COMPLETED,
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
    sellerOnboarding: {
      ...(target?.sellerOnboarding || {}),
      status: SELLER_ONBOARDING_STATUS.COMPLETED,
      completedAt: target?.sellerOnboarding?.completedAt || new Date().toISOString(),
    },
    offers: [],
    marketing: target.marketing || {},
    ownership: target.ownership || {},
    requiredDocuments: (target.requiredDocuments || []).map((doc) => ({ ...doc })),
    status: 'active',
    sourceDraftId: target.id,
  }

  writeAgentPrivateListings([activeListing, ...activeRows])
  writeAgentListingDrafts(draftRows.filter((row) => String(row?.id || row?.listingDraftId || '') !== String(draftId)))
  return activeListing
}

export function isAgentListingReadyForDeal(listing) {
  if (!listing || String(listing?.status || '').trim().toLowerCase() !== 'active') {
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

  return ['approved', 'verified', 'completed'].includes(String(mandateDocument.status || '').trim().toLowerCase())
}
