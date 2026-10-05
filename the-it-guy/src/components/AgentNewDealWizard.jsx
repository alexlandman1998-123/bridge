import { CheckCircle2, ExternalLink } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createTransactionFromWizard, fetchDevelopmentOptions, fetchUnitsForTransactionSetup, uploadDocument } from '../lib/api'
import { readAgentPrivateListings, writeAgentPrivateListings } from '../lib/agentListingStorage'
import {
  fetchOrganisationSettings,
  listOrganisationPartnerRoutingRules,
  listOrganisationPreferredPartners,
  listUserPreferredPartnerRoutingRules,
  resolveCommissionSnapshotForAgent,
} from '../lib/settingsApi'
import {
  filterPreferredPartners,
  getDefaultPreferredPartnerByType,
  normalizePreferredPartnerType,
} from '../lib/preferredPartners'
import { fetchPartnersSnapshot, getPartnerAssignmentOptions } from '../lib/partnersRepository'
import {
  findPartnerPersonOption,
  loadPartnerPersonOptions,
} from '../lib/partnerPersonOptions'
import { useWorkspace } from '../context/WorkspaceContext'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { listAgencyCrmLeadContacts } from '../lib/agencyCrmRepository'
import { getBuyerLeadOptions, mapAgencyLeadSelectionRows } from '../lib/agencyLeadSelection'
import { getAgentPrivateListingSummaries, getAgentPrivateListings } from '../services/privateListingService'
import { inferPartnerRoutingRoleTypesForTransaction, resolvePartnerRoutingForTransaction } from '../services/universalPartnerRoutingService'
import { activateAnchorOnSpace } from '../lib/keyboardActivation'
import { getPurchaserTypeLabel } from '../lib/purchaserPersonas'
import {
  AGENT_TRANSACTION_STAGE_OPTIONS,
  normalizeTransactionStage,
} from '../core/transactions/stageConfig.js'
import Button from './ui/Button'
import Modal from './ui/Modal'
import TransactionBondAttorneyCapture from './transaction/TransactionBondAttorneyCapture.jsx'
import TransactionHandoffRegisterPanel from './transactions/TransactionHandoffRegisterPanel.jsx'
import { buildTransactionCaptureFinance, splitTransactionCaptureRolePlayers, CAPTURE_BOND_STATUS_OPTIONS } from '../core/transactions/transactionCaptureFinance.js'
import { ensureTransactionCaptureInvitations } from '../services/transactionCaptureHandoffService.js'
import TransactionCaptureDocuments from './transaction/TransactionCaptureDocuments.jsx'
import { saveTransactionCaptureDocuments } from '../core/transactions/transactionCaptureDocuments.js'
import { fetchTransactionDocumentRequirementsByTransactionIds } from '../services/documents/transactionCanonicalDocumentRequirementService.js'
import TransactionPartyCapture from './transaction/TransactionPartyCapture.jsx'
import TransactionPartyDocumentPreview from './transaction/TransactionPartyDocumentPreview.jsx'
import { buildTransactionPartiesSnapshot, normalizeTransactionPartyProfile, partyPurchaserType, partyDisplayName, isNaturalParty, transactionSellerProfileFromSource, transactionPartyMissingDetails } from '../core/transactions/transactionPartyProfile.js'

function createInitialWizardForm({ initialDevelopmentId = '', initialUnitId = '' } = {}) {
  return {
    propertyMode: PROPERTY_MODE_PRIVATE,
    privateListingId: '',
    developmentId: initialDevelopmentId || '',
    unitId: initialUnitId || '',
    purchaserType: 'individual',
    buyerParties: [],
    buyerPartyProfile: null,
    sellerPartyProfile: null,
    buyerPersonId: crypto.randomUUID(),
    sellerPersonId: crypto.randomUUID(),
    financeType: 'unknown',
    financeManagedBy: 'client',
    financeBank: '',
    bondStatus: 'unknown',
    sellerBondStatus: 'unknown',
    sellerBondBank: '',
    sellerBondReference: '',
    bondAttorneyNomination: { mode: 'none' },
    cashAmount: '',
    bondAmount: '',
    depositAmount: '',
    hasExistingBondToCancel: false,
    importPropertyAddress: '',
    importSuburb: '',
    importCity: '',
    importProvince: '',
    importSellerName: '',
    importSellerEmail: '',
    importSellerPhone: '',
    importPropertyStructure: 'full_title',
    importSchemeName: '',
    importUnitNumber: '',
    importDevelopmentName: '',
    importCurrentStage: AGENT_TRANSACTION_STAGE_OPTIONS[0],
    capturedSalePrice: '',
    capturedStage: '',
    signedOtpStatus: 'pending_upload',
    handoffNotes: '',
    importCommissionStructure: '',
    importProperty24Link: '',
    importNotes: '',
    pipelineLeadId: '',
    sellerLeadId: '',
    connectBuyerNow: true,
    clientName: '',
    clientSurname: '',
    clientEmail: '',
    clientPhone: '',
    saleDate: todayIso(),
    reservationRequired: false,
    reservationAmount: '',
    reservationAmountType: 'fixed',
    reservationTreatment: 'credited_to_purchase_price',
    reservationPayableTo: 'developer',
    alterationChargeTreatment: 'included_in_purchase_price',
    transferPartnerMode: PARTNER_MODE_AGENCY,
    transferPreferredPartnerId: '',
    transferPreferredPartnerPersonId: '',
    transferBuyerCompanyName: '',
    transferBuyerContactPerson: '',
    transferBuyerEmail: '',
    transferBuyerPhone: '',
    transferBuyerNotes: '',
    bondOriginatorMode: PARTNER_MODE_NONE,
    bondOriginatorPreferredPartnerId: '',
    bondOriginatorPreferredPartnerPersonId: '',
    bondOriginatorBuyerCompanyName: '',
    bondOriginatorBuyerContactPerson: '',
    bondOriginatorBuyerEmail: '',
    bondOriginatorBuyerPhone: '',
    bondOriginatorBuyerNotes: '',
    cancellationAttorneyMode: PARTNER_MODE_NONE,
    cancellationAttorneyPreferredPartnerId: '',
    cancellationAttorneyPreferredPartnerPersonId: '',
    cancellationAttorneyBuyerCompanyName: '',
    cancellationAttorneyBuyerContactPerson: '',
    cancellationAttorneyBuyerEmail: '',
    cancellationAttorneyBuyerPhone: '',
    cancellationAttorneyBuyerNotes: '',
  }
}

const PIPELINE_STORAGE_KEY = 'itg:pipeline-leads:v1'

const STEP_ORDER = ['property', 'client', 'documents', 'attorney', 'review']
const PARTNER_MODE_NONE = 'none'
const PARTNER_MODE_AGENCY = 'agency'
const PARTNER_MODE_BUYER = 'buyer'
const PROPERTY_MODE_PRIVATE = 'private'
const PROPERTY_MODE_DEVELOPMENT = 'development'
const PROPERTY_MODE_IMPORT = 'import'
const QUICK_CAPTURE_STRUCTURE_OPTIONS = [
  { value: 'full_title', label: 'Full title' },
  { value: 'sectional_title', label: 'Sectional title' },
  { value: 'estate', label: 'Estate / new development' },
  { value: 'share_block', label: 'Share block' },
  { value: 'other', label: 'Other / not yet known' },
]
const CANONICAL_TRANSACTION_STRUCTURE = [
  'transaction',
  'property',
  'seller_party',
  'buyer_party',
  'agent_assignment',
  'deal_terms',
  'finance_profile',
  'roleplayers',
  'documents',
  'transaction_events',
]
const PARTNER_ROLE_FIELD_OPTIONS = [
  { value: PARTNER_MODE_AGENCY, label: 'Use Agency Preferred Partner' },
  { value: PARTNER_MODE_BUYER, label: 'Use Buyer Appointed Partner' },
]
const TRANSFER_FIRM_MODE_OPTIONS = [
  { value: PARTNER_MODE_AGENCY, label: 'Use Agency Preferred Firm' },
  { value: PARTNER_MODE_BUYER, label: 'Use Seller-Appointed Firm' },
]
const OPTIONAL_PARTNER_ROLE_FIELD_OPTIONS = [
  { value: PARTNER_MODE_NONE, label: 'Not Assigned Yet' },
  ...PARTNER_ROLE_FIELD_OPTIONS,
]
const CANCELLATION_PARTNER_ROLE_FIELD_OPTIONS = [
  { value: PARTNER_MODE_NONE, label: 'Not Assigned Yet' },
  { value: PARTNER_MODE_AGENCY, label: 'Use Agency Preferred Cancellation Attorney' },
  { value: PARTNER_MODE_BUYER, label: 'Use Seller Appointed Cancellation Attorney' },
]
const FINANCE_TYPE_OPTIONS = [
  { value: 'unknown', label: 'Not confirmed yet' },
  { value: 'cash', label: 'Cash' },
  { value: 'bond', label: 'Bond' },
  { value: 'combination', label: 'Combination' },
]
const FINANCE_MANAGED_BY_OPTIONS = [
  { value: 'client', label: 'Buyer arranging own finance' },
  { value: 'bond_originator', label: 'Use connected bond originator' },
]
const SIGNED_OTP_STATUS_OPTIONS = [
  {
    value: 'pending_upload',
    label: 'Signed OTP to upload',
    caption: 'Add the file in Existing Documents, or upload it later.',
  },
  {
    value: 'not_signed',
    label: 'OTP not signed yet',
    caption: 'Create the workspace and use onboarding/OTP signing as the next action.',
  },
]
const CORE_ROUTING_ROLE_TYPES = ['transfer_attorney', 'bond_originator', 'cancellation_attorney']
const ROLE_FIELD_TO_ROLE_KEY = Object.freeze({
  transferPartnerMode: 'transfer_attorney',
  transferPreferredPartnerId: 'transfer_attorney',
  transferBuyerCompanyName: 'transfer_attorney',
  transferPreferredPartnerPersonId: 'transfer_attorney',
  transferBuyerContactPerson: 'transfer_attorney',
  transferBuyerEmail: 'transfer_attorney',
  transferBuyerPhone: 'transfer_attorney',
  transferBuyerNotes: 'transfer_attorney',
  bondOriginatorMode: 'bond_originator',
  bondOriginatorPreferredPartnerId: 'bond_originator',
  bondOriginatorPreferredPartnerPersonId: 'bond_originator',
  bondOriginatorBuyerCompanyName: 'bond_originator',
  bondOriginatorBuyerContactPerson: 'bond_originator',
  bondOriginatorBuyerEmail: 'bond_originator',
  bondOriginatorBuyerPhone: 'bond_originator',
  bondOriginatorBuyerNotes: 'bond_originator',
  cancellationAttorneyMode: 'cancellation_attorney',
  cancellationAttorneyPreferredPartnerId: 'cancellation_attorney',
  cancellationAttorneyPreferredPartnerPersonId: 'cancellation_attorney',
  cancellationAttorneyBuyerCompanyName: 'cancellation_attorney',
  cancellationAttorneyBuyerContactPerson: 'cancellation_attorney',
  cancellationAttorneyBuyerEmail: 'cancellation_attorney',
  cancellationAttorneyBuyerPhone: 'cancellation_attorney',
  cancellationAttorneyBuyerNotes: 'cancellation_attorney',
})

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function readPipelineRows() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(PIPELINE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return '—'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function normalizeText(value) {
  return String(value || '').trim()
}

function resolveBuyerDocumentsPortal(result = {}) {
  const rawPath = normalizeText(result?.clientPortalPath || result?.buyerPortalPath)
  const token = normalizeText(result?.clientPortalToken || result?.buyerPortalToken)
  const path = rawPath ? (rawPath.startsWith('/') ? rawPath : `/${rawPath}`) : token ? `/client/${token}` : ''
  const origin = typeof window === 'undefined' ? '' : window.location.origin

  return {
    token,
    path,
    url: path && origin ? `${origin}${path}` : '',
  }
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function getRoutingRoleLabel(roleType) {
  switch (normalizeKey(roleType)) {
    case 'bond_originator':
      return 'Bond Originator'
    case 'bond_attorney':
      return 'Bond Attorney'
    case 'cancellation_attorney':
      return 'Cancellation Attorney'
    default:
      return 'Transfer Attorney'
  }
}

function getRoutingResolutionLabel(value) {
  switch (normalizeKey(value)) {
    case 'agent':
    case 'user':
      return 'Agent preference'
    case 'branch':
      return 'Branch default'
    case 'organisation':
      return 'Organisation default'
    case 'transaction_override':
      return 'Manual transaction override'
    case 'system_fallback':
      return 'Manual selection required'
    default:
      return normalizeText(value).replace(/_/g, ' ') || 'Manual selection required'
  }
}

function getPartnerTypeLabel(value = '') {
  const normalized = normalizeKey(value)
  if (normalized.includes('attorney')) return 'Attorney'
  if (normalized.includes('bond') || normalized.includes('originator')) return 'Bond Originator'
  if (normalized.includes('agency')) return 'Agency'
  return 'Partner'
}

function getBuyerCaptureLabels(purchaserType) {
  if (purchaserType === 'company') {
    return {
      firstName: 'Registered Entity Name',
      lastName: 'Authorised Representative',
      email: 'Representative Email',
      phone: 'Representative Phone',
      hint: 'Phase 3 stores the primary company/CC buyer against the current buyer fields. Phase 4 will split full party records.',
    }
  }
  if (purchaserType === 'trust') {
    return {
      firstName: 'Trust Name',
      lastName: 'Authorised Trustee',
      email: 'Trustee Email',
      phone: 'Trustee Phone',
      hint: 'Phase 3 stores the primary trust buyer against the current buyer fields. Phase 4 will split trustees and additional parties.',
    }
  }
  return {
    firstName: 'Name',
    lastName: 'Surname',
    email: 'Email',
    phone: 'Phone',
    hint: '',
  }
}

function getListingStatus(listing) {
  return normalizeKey(listing?.listingStatus || listing?.status || listing?.lifecycleStatus || listing?.listing_status)
}

function hasActiveDeal(listing) {
  return Boolean(
    listing?.activeDeal &&
      (normalizeText(listing?.activeDeal?.transactionId) ||
        normalizeText(listing?.activeDeal?.id)),
  )
}

function _getListingAssignedAgent(listing) {
  return normalizeText(listing?.assignedAgentId || listing?.assigned_agent_id || listing?.assignedAgentEmail || listing?.assignedAgentName || listing?.agentName)
}

function isDealEligibleListing(listing) {
  if (!listing || hasActiveDeal(listing)) return false
  const status = getListingStatus(listing)
  const visibility = normalizeKey(listing?.listingVisibility || listing?.listing_visibility)
  if (visibility === 'archived') return false
  const inactiveStatuses = new Set(['withdrawn', 'deleted', 'archived', 'sold', 'cancelled', 'transaction_created'])
  if (inactiveStatuses.has(status)) return false
  return true
}

function getListingAddress(listing) {
  return normalizeText(
    listing?.propertyAddress ||
      listing?.propertyDetails?.addressLine1 ||
      listing?.addressLine1 ||
      listing?.address_line_1 ||
      listing?.listingTitle ||
      listing?.title,
  )
}

function getListingTitle(listing) {
  return normalizeText(listing?.listingTitle || listing?.title || getListingAddress(listing) || 'Active listing')
}

function getListingCity(listing) {
  return normalizeText(listing?.propertyDetails?.city || listing?.city || listing?.suburb || listing?.propertyDetails?.suburb)
}

function getListingSeller(listing) {
  const facts = listing?.sellerCanonicalFacts
    || listing?.seller_canonical_facts_json
    || listing?.sellerOnboarding?.canonicalFacts
    || listing?.sellerOnboarding?.formData
    || {}
  const seller = listing?.seller || {}
  const firstName = normalizeText(facts.firstName || facts.sellerFirstName || facts.name)
  const lastName = normalizeText(facts.lastName || facts.sellerLastName || facts.surname)
  const sellerName = normalizeText(
    seller.name ||
      facts.sellerName ||
      facts.fullName ||
      facts.registeredName ||
      [firstName, lastName].filter(Boolean).join(' '),
  )
  return {
    name: sellerName,
    email: normalizeText(seller.email || facts.email || facts.sellerEmail),
    phone: normalizeText(seller.phone || facts.phone || facts.mobile || facts.sellerPhone),
  }
}

function getListingSellerLabel(listing) {
  const listingMandateSigned = getListingMandateReady(listing)
  const seller = getListingSeller(listing)
  const sellerLabel = seller.name || (listingMandateSigned ? 'Seller details missing' : 'Seller details pending')
  return `${sellerLabel} · ${listingMandateSigned ? 'Mandate signed' : 'Mandate pending'}`
}

function getListingMandateReady(listing) {
  const mandateStatus = normalizeKey(listing?.mandateStatus || listing?.mandate_status)
  const docs = [
    ...(Array.isArray(listing?.requiredDocuments) ? listing.requiredDocuments : []),
    ...(Array.isArray(listing?.documentRequirements) ? listing.documentRequirements : []),
    ...(Array.isArray(listing?.documents) ? listing.documents : []),
  ]
  const mandateDoc = docs.find((doc) => ['mandate_to_sell', 'signed_mandate', 'mandate'].includes(normalizeKey(doc?.key || doc?.documentType || doc?.document_type || doc?.name)))
  const docStatus = normalizeKey(mandateDoc?.status || mandateDoc?.documentStatus || mandateDoc?.document_status)
  return ['signed', 'signed_uploaded', 'approved', 'verified', 'completed'].includes(mandateStatus) ||
    ['approved', 'verified', 'completed', 'signed'].includes(docStatus)
}

function getListingMandateWarning(listing) {
  return getListingMandateReady(listing) ? '' : 'Mandate not uploaded for this listing. Continue?'
}

function getSellerFicaReady(listing) {
  const docs = [
    ...(Array.isArray(listing?.requiredDocuments) ? listing.requiredDocuments : []),
    ...(Array.isArray(listing?.documentRequirements) ? listing.documentRequirements : []),
    ...(Array.isArray(listing?.documents) ? listing.documents : []),
  ]
  return docs.some((doc) => {
    const key = normalizeKey(doc?.key || doc?.documentType || doc?.document_type || doc?.name)
    const status = normalizeKey(doc?.status || doc?.documentStatus || doc?.document_status)
    return key.includes('fica') && ['approved', 'verified', 'completed'].includes(status)
  })
}

function parseNumberValue(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const normalized = String(value).replace(/,/g, '').trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizePercentageInput(value, fallback = null) {
  const numeric = parseNumberValue(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(100, Math.max(0, Number(numeric.toFixed(2))))
}

function resolveSalePriceFromListing(listing = {}) {
  const candidates = [
    listing?.askingPrice,
    listing?.estimatedPrice,
    listing?.estimatedValue,
    listing?.listingPrice,
    listing?.price,
    listing?.propertyDetails?.price,
    listing?.propertyData?.price,
    listing?.listing?.askingPrice,
    listing?.listing?.estimatedPrice,
    listing?.listing?.listPrice,
  ]

  for (const candidate of candidates) {
    const parsed = parseNumberValue(candidate)
    if (parsed !== null && parsed >= 0) {
      return parsed
    }
  }
  return null
}

function resolveCommissionFromListing(listing = {}) {
  const commission = listing?.commission || listing?.commissionTerms || listing?.commission_terms || listing?.commissionData || {}
  const commissionType = String(commission?.type || commission?.commissionType || commission?.commission_type || '').trim().toLowerCase()
  const percentageCandidateValues = [
    commission?.commission_percentage,
    commission?.commissionPercentage,
    commission?.percentage,
    commission?.commission_pct,
    listing?.commission_percentage,
    listing?.commissionPercentage,
    listing?.commission_pct,
    listing?.commission_rate,
  ]
  const amountCandidateValues = [
    commission?.commission_amount,
    commission?.commissionAmount,
    commission?.amount,
    listing?.commission_amount,
    listing?.commissionAmount,
  ]

  let percentage = null
  let amount = null

  for (const candidate of percentageCandidateValues) {
    const parsed = parseNumberValue(candidate)
    if (parsed !== null) {
      percentage = parsed
      break
    }
  }

  for (const candidate of amountCandidateValues) {
    const parsed = parseNumberValue(candidate)
    if (parsed !== null) {
      amount = parsed
      break
    }
  }

  const mixedValue = parseNumberValue(commission?.value)
  if (mixedValue !== null && percentage === null && amount === null) {
    const looksPercentage = commissionType.includes('percent') || commissionType.includes('%') || commissionType === 'commission'
    if (looksPercentage || mixedValue <= 100) {
      percentage = mixedValue
    } else {
      amount = mixedValue
    }
  }

  return { percentage, amount }
}

function deriveDealTermsFromSelection({ propertyMode, listing = null, unit = null, salePriceOverride = null }) {
  const rawSalePrice = parseNumberValue(salePriceOverride) ?? (
    propertyMode === PROPERTY_MODE_DEVELOPMENT
      ? parseNumberValue(unit?.price)
      : resolveSalePriceFromListing(listing))

  const salePrice = rawSalePrice !== null && rawSalePrice >= 0 ? rawSalePrice : null
  const commissionFromListing = resolveCommissionFromListing(listing)
  let grossCommissionPercentage = commissionFromListing.percentage
  let grossCommissionAmount = commissionFromListing.amount

  if (grossCommissionPercentage === null && grossCommissionAmount !== null && salePrice && salePrice > 0) {
    grossCommissionPercentage = Number(((grossCommissionAmount / salePrice) * 100).toFixed(2))
  }

  if (grossCommissionAmount === null && grossCommissionPercentage !== null && salePrice !== null) {
    grossCommissionAmount = Number(((salePrice * grossCommissionPercentage) / 100).toFixed(2))
  }

  return {
    salePrice,
    grossCommissionPercentage,
    grossCommissionAmount,
  }
}

function formatListingDealOption(listing) {
  const title = getListingTitle(listing)
  const address = getListingAddress(listing)
  const propertyLabel = title && address && title !== address ? `${title}, ${address}` : title || address || 'Active listing'
  return `${propertyLabel} · ${getListingSellerLabel(listing)}`
}

function mapPartnerAssignmentToPreferredPartner(assignment, partnerType) {
  const partnerName = normalizeText(assignment?.companyName)
  const partnerEmail = normalizeText(assignment?.email)

  if (!partnerName && !partnerEmail) {
    return null
  }

  const partnerId = normalizeText(assignment?.id || assignment?.organisationId)
  const fallbackId = `${normalizePreferredPartnerType(partnerType)}-${partnerName.toLowerCase().replace(/\s+/g, '-')}-${partnerEmail.toLowerCase()}`

  return {
    id: partnerId || fallbackId || `fallback-${Date.now()}`,
    partnerType: normalizePreferredPartnerType(partnerType),
    companyName: partnerName,
    contactPerson: normalizeText(assignment?.contactPerson),
    email: partnerEmail.toLowerCase(),
    phone: normalizeText(assignment?.phone),
    website: '',
    physicalAddress: '',
    province: '',
    notes: normalizeText(assignment?.notes) || 'Available from connected partner snapshot',
    isActive: true,
    isPreferredDefault: Boolean(assignment?.preferred),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function mapRoutingRuleToPreferredPartner(rule = {}, partnerType = 'transfer_attorney', fallbackOrganisation = null) {
  const partnerName = normalizeText(rule?.targetScopeName || fallbackOrganisation?.name)
  const organisationId = normalizeText(rule?.targetOrganisationId || rule?.target_organisation_id || fallbackOrganisation?.id)
  if (!partnerName || !organisationId) {
    return null
  }

  const personLabel = normalizeText(rule?.targetScopeName || fallbackOrganisation?.name)
  const targetUserId = normalizeText(rule?.targetUserId || rule?.target_user_id)
  const baseId = `${normalizePreferredPartnerType(partnerType)}-${organisationId}-${targetUserId || 'preferred'}`

  return {
    id: baseId,
    partnerType: normalizePreferredPartnerType(partnerType),
    companyName: partnerName,
    contactPerson: personLabel || partnerName,
    email: normalizeText(fallbackOrganisation?.contactEmails?.[0] || '').toLowerCase(),
    phone: '',
    website: '',
    physicalAddress: '',
    province: '',
    notes: 'Selected from personal preferred partner routing.',
    isActive: true,
    isPreferredDefault: Boolean(rule?.isDefault),
    createdAt: rule?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: targetUserId || null,
    partnerOrganisationId: organisationId,
    targetOrganisationId: organisationId,
    routingRuleId: normalizeText(rule?.id),
  }
}

function getPreferredPartnerRowsFromRoutingRules(partnerSnapshot = null, routingRules = []) {
  const relationships = Array.isArray(partnerSnapshot?.relationships) ? partnerSnapshot.relationships : []
  return (Array.isArray(routingRules) ? routingRules : []).flatMap((rule) => {
    const targetOrganisationId = normalizeText(rule?.targetOrganisationId || rule?.target_organisation_id)
    if (!targetOrganisationId) return []
    const relationship = relationships.find(
      (item) => normalizeText(item?.partnerOrganisationId || item?.counterpartOrganisationId || item?.partner?.id) === targetOrganisationId,
    )
    const partner = relationship?.partner || null
    const basePartnerType = normalizePreferredPartnerType(
      partner?.type === 'bond_originator'
        ? 'bond_originator'
        : partner?.type === 'developer_company'
          ? 'bond_originator'
          : 'transfer_attorney',
    )
    const primaryRow = mapRoutingRuleToPreferredPartner(rule, basePartnerType, partner)
    if (!primaryRow) return []
    if (partner?.type === 'attorney_firm') {
      return [
        primaryRow,
        {
          ...primaryRow,
          partnerType: 'bond_attorney',
          id: `${primaryRow.id}-bond-attorney`,
        },
        {
          ...primaryRow,
          partnerType: 'cancellation_attorney',
          id: `${primaryRow.id}-cancellation-attorney`,
        },
      ]
    }
    return [primaryRow]
  })
}

function getFallbackPreferredPartnersFromSnapshot(partnerSnapshot, accessContext) {
  if (!partnerSnapshot) {
    return []
  }

  const roleTypes = ['transfer_attorney', 'bond_originator', 'bond_attorney', 'cancellation_attorney']
  const fallbackRows = roleTypes.flatMap((roleType) => {
    const assignmentRows = getPartnerAssignmentOptions(partnerSnapshot, roleType, accessContext)
    return assignmentRows
      .map((assignment) => mapPartnerAssignmentToPreferredPartner(assignment, roleType))
      .filter(Boolean)
  })

  return fallbackRows
}

function buildPreferredPartnerDedupKey(row = {}) {
  const normalizedType = normalizePreferredPartnerType(row?.partnerType)
  const rowId = normalizeText(row?.id)
  const companyName = normalizeText(row?.companyName)
  const email = normalizeText(row?.email)
  if (rowId) {
    return `id:${normalizedType}:${rowId}`
  }
  return `identity:${normalizedType}:${companyName}:${email}`
}

function mergePreferredPartnerOptions(primaryRows = [], fallbackRows = []) {
  const merged = [...(Array.isArray(primaryRows) ? primaryRows : []), ...(Array.isArray(fallbackRows) ? fallbackRows : [])]
  const seen = new Set()
  const unique = []

  merged.forEach((row) => {
    const key = buildPreferredPartnerDedupKey(row)
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(row)
    }
  })

  return unique
}

function _hasActivePartnerType(partners = [], partnerType = '') {
  const normalizedType = normalizePreferredPartnerType(partnerType)
  return (Array.isArray(partners) ? partners : []).some(
    (partner) =>
      normalizePreferredPartnerType(partner?.partnerType) === normalizedType
      && partner?.isActive !== false,
  )
}

function mergeListings(...groups) {
  const byId = new Map()
  groups.flat().filter(Boolean).forEach((listing) => {
    const key = normalizeText(listing?.id || listing?.listingReference || listing?.listingCode || formatListingDealOption(listing))
    if (!key) return
    byId.set(key, { ...(byId.get(key) || {}), ...listing })
  })
  return Array.from(byId.values()).filter(isDealEligibleListing)
}

function normalizeFinanceTypeForApi(value) {
  const normalized = normalizeKey(value)
  if (normalized === 'hybrid') return 'combination'
  if (['cash', 'bond', 'combination'].includes(normalized)) return normalized
  return ''
}

function getCreationOrigin(propertyMode) {
  if (propertyMode === PROPERTY_MODE_DEVELOPMENT) return 'development_unit'
  if (propertyMode === PROPERTY_MODE_IMPORT) return 'quick_address_capture'
  return 'active_listing'
}

function getOriginLabel(propertyMode) {
  if (propertyMode === PROPERTY_MODE_DEVELOPMENT) return 'Created via development unit'
  if (propertyMode === PROPERTY_MODE_IMPORT) return 'Quick address-first capture'
  return 'Created via active listing'
}

function getOptionLabel(options, value, fallback = 'Not set') {
  return options.find((option) => option.value === value)?.label || fallback
}

function fieldClass() {
  return 'w-full rounded-[14px] border border-[#dde4ee] bg-white px-4 py-3 text-sm text-[#162334] shadow-[0_10px_24px_rgba(15,23,42,0.06)] outline-none transition duration-150 ease-out placeholder:text-slate-400 focus:border-[rgba(29,78,216,0.35)] focus:ring-4 focus:ring-[rgba(29,78,216,0.1)]'
}

function Field({ label, hint, error, children, fullWidth = false }) {
  return (
    <label className={`${fullWidth ? 'md:col-span-2' : ''} flex min-w-0 flex-col gap-2 text-sm font-medium text-[#233247]`}>
      <span>{label}</span>
      {hint ? <small className="text-xs leading-5 text-[#6b7d93]">{hint}</small> : null}
      {children}
      {error ? <small className="text-xs font-medium text-[#b42318]">{error}</small> : null}
    </label>
  )
}

function StepChip({ index, title, active }) {
  return (
    <div className={`flex min-h-[74px] items-center gap-3 rounded-[18px] border px-4 py-3 ${active ? 'border-[#1f4f78] bg-[#2b5577] text-white shadow-[0_18px_32px_rgba(31,79,120,0.18)]' : 'border-[#dbe6f2] bg-white text-[#47627c]'}`}>
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-[0.8rem] font-semibold ${active ? 'border-white/30 bg-white/10 text-white' : 'border-[#d3dfec] bg-[#f7fbff] text-[#35546c]'}`}>
        {index + 1}
      </span>
      <span className="text-sm font-semibold">{title}</span>
    </div>
  )
}

function normalizePhoneInput(value) {
  return String(value || '').replace(/[^\d+\-()\s]/g, '')
}

function mapPrivateListingToTransactionPropertyCategory(listing) {
  const raw = String(
    listing?.propertyCategory ||
      listing?.propertyDetails?.propertyCategory ||
      listing?.propertyDetails?.propertyType ||
      listing?.propertyType ||
      '',
  )
    .trim()
    .toLowerCase()

  if (!raw) return 'residential'
  if (['residential', 'commercial', 'farm'].includes(raw)) return raw
  if (raw.includes('farm') || raw.includes('agric')) return 'farm'
  if (raw.includes('commercial') || raw.includes('office') || raw.includes('retail') || raw.includes('industrial')) return 'commercial'
  return 'residential'
}

function getDevelopmentTeamMembers(rawTeams, teamKey) {
  const teams = rawTeams && typeof rawTeams === 'object' ? rawTeams : {}
  const members = Array.isArray(teams?.[teamKey]) ? teams[teamKey] : []
  return members
    .map((member) => ({
      name: String(member?.participantName || member?.name || member?.label || '').trim(),
      email: String(member?.participantEmail || member?.email || '').trim(),
      phone: String(member?.participantPhone || member?.phone || '').trim(),
    }))
    .filter((member) => member.name || member.email)
}

function normalizeListingAttorneyOptions(listing) {
  const rolePlayersAttorney = String(listing?.rolePlayers?.attorney || '').trim()
  const mandateAttorney = String(listing?.mandateAttorney || '').trim()
  return [rolePlayersAttorney, mandateAttorney]
    .filter(Boolean)
    .map((name) => ({ name, email: '', phone: '' }))
}

function findPartnerById(partners, partnerId) {
  const normalizedId = String(partnerId || '').trim()
  if (!normalizedId) return null
  return partners.find((item) => String(item?.id || '').trim() === normalizedId) || null
}

function buildCompletenessSnapshot({ form, listing = null, propertyMode = PROPERTY_MODE_PRIVATE, buyerPartyProfile = null, sellerPartyProfile = null, salePrice = null }) {
  const buyerMissing = form.connectBuyerNow && buyerPartyProfile ? transactionPartyMissingDetails(buyerPartyProfile, 'Buyer') : []
  const sellerMissing = sellerPartyProfile ? transactionPartyMissingDetails(sellerPartyProfile, 'Seller') : []
  const sellerContact = sellerPartyProfile?.people.find((person) => person.primaryContact)
  const checks = [
    {
      label: 'Signed mandate',
      complete: propertyMode === PROPERTY_MODE_IMPORT
        ? false
        : propertyMode !== PROPERTY_MODE_PRIVATE ||
        getListingMandateReady(listing),
    },
    {
      label: 'Seller FICA',
      complete: propertyMode === PROPERTY_MODE_IMPORT
        ? false
        : propertyMode !== PROPERTY_MODE_PRIVATE || getSellerFicaReady(listing),
    },
    {
      label: 'Buyer ID',
      complete: false,
    },
    {
      label: 'OTP upload',
      complete: false,
    },
    {
      label: 'Selling price',
      complete: Number(salePrice || 0) > 0,
    },
    {
      label: 'Transfer attorney',
      complete: form.transferPartnerMode === PARTNER_MODE_AGENCY
        ? Boolean(form.transferPreferredPartnerId)
        : Boolean(normalizeText(form.transferBuyerCompanyName) && normalizeText(form.transferBuyerEmail)),
    },
    {
      label: 'Seller contact details',
      complete: sellerPartyProfile
        ? Boolean(sellerContact?.email && sellerContact?.phone)
        : propertyMode === PROPERTY_MODE_IMPORT
        ? Boolean(normalizeText(form.importSellerEmail) && normalizeText(form.importSellerPhone))
        : Boolean(getListingSeller(listing).email && getListingSeller(listing).phone),
    },
  ]
  if (buyerPartyProfile && form.connectBuyerNow) checks.push({ label: 'Buyer entity and people', complete: buyerMissing.length === 0 })
  if (sellerPartyProfile) checks.push({ label: 'Seller entity and people', complete: sellerMissing.length === 0 })
  const total = checks.length
  const complete = checks.filter((item) => item.complete).length
  return {
    score: total ? Math.round((complete / total) * 100) : 0,
    missingItems: [...checks.filter((item) => !item.complete).map((item) => item.label), ...buyerMissing, ...sellerMissing],
    completedItems: checks.filter((item) => item.complete).map((item) => item.label),
  }
}

function AgentNewDealWizard({
  open,
  onClose,
  initialDevelopmentId = '',
  initialPrivateListingId = '',
  initialUnitId = '',
  initialPropertyMode = '',
  onSaved,
}) {
  const navigate = useNavigate()
  const { profile, agencyWorkflowMode, currentMembership, workspace } = useWorkspace()
  const [activeStep, setActiveStep] = useState('property')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [errors, setErrors] = useState({})
  const [createdDeal, setCreatedDeal] = useState(null)
  const [captureDocuments, setCaptureDocuments] = useState([])
  const [captureInvitations, setCaptureInvitations] = useState([])

  useEffect(() => {
    const handlePostCreateComplete = (event) => {
      const result = event?.detail
      if (!result?.transactionId) return

      setCreatedDeal((current) => {
        if (!current || current.transactionId !== result.transactionId) return current
        return {
          ...current,
          ...result,
          buyerDocumentsUrl: resolveBuyerDocumentsPortal(result).url,
        }
      })
    }

    window.addEventListener('itg:transaction-post-create-complete', handlePostCreateComplete)
    return () => window.removeEventListener('itg:transaction-post-create-complete', handlePostCreateComplete)
  }, [])

  const [commissionPreview, setCommissionPreview] = useState(null)
  const [salesAgentSplitOverride, setSalesAgentSplitOverride] = useState('')
  const [privateListings, setPrivateListings] = useState([])
  const [propertyPickerListings, setPropertyPickerListings] = useState([])
  const [isLoadingPropertyOptions, setIsLoadingPropertyOptions] = useState(false)
  const [propertyOptionsError, setPropertyOptionsError] = useState('')
  const [pipelineRows, setPipelineRows] = useState([])
  const [sellerLeadRows, setSellerLeadRows] = useState([])
  const [developments, setDevelopments] = useState([])
  const [developmentUnits, setDevelopmentUnits] = useState([])
  const [preferredPartners, setPreferredPartners] = useState([])
  const [preferredPartnersLoading, setPreferredPartnersLoading] = useState(false)
  const [preferredPartnersError, setPreferredPartnersError] = useState('')
  const [routingRules, setRoutingRules] = useState([])
  const [partnerSnapshot, setPartnerSnapshot] = useState(null)
  const [routingRecommendations, setRoutingRecommendations] = useState([])
  const [routingRecommendationsLoading, setRoutingRecommendationsLoading] = useState(false)
  const [routingRecommendationChoices, setRoutingRecommendationChoices] = useState({})
  const [roleSelectionTouched, setRoleSelectionTouched] = useState({})
  const [partnerSearch, setPartnerSearch] = useState({
    transferAttorney: '',
    bondOriginator: '',
    cancellationAttorney: '',
  })
  const [partnerPersonOptions, setPartnerPersonOptions] = useState({
    transfer_attorney: [],
    bond_originator: [],
    cancellation_attorney: [],
  })
  const [loadingPartnerPeople, setLoadingPartnerPeople] = useState({
    transfer_attorney: false,
    bond_originator: false,
    cancellation_attorney: false,
  })
  const [partnerPeopleMessages, setPartnerPeopleMessages] = useState({
    transfer_attorney: '',
    bond_originator: '',
    cancellation_attorney: '',
  })
  const [form, setForm] = useState(() => createInitialWizardForm({ initialDevelopmentId, initialUnitId }))

  const loadPropertyPickerListings = useCallback(async () => {
    const localListings = mergeListings(readAgentPrivateListings())
    setPropertyPickerListings(localListings)
    setPrivateListings((previous) => mergeListings(previous, localListings))
    setPropertyOptionsError('')
    setIsLoadingPropertyOptions(true)

    if (!isSupabaseConfigured) {
      setIsLoadingPropertyOptions(false)
      return
    }

    const organisationId = normalizeText(workspace?.id)
    const membershipRole = normalizeKey(currentMembership?.membershipRole || currentMembership?.workspaceRole || currentMembership?.role)
    const hasOrganisationScope = Boolean(organisationId && organisationId !== 'all')
    const includeAllOrganisationListings = hasOrganisationScope || agencyWorkflowMode === 'principal' || ['principal', 'owner', 'admin', 'hq'].includes(membershipRole)
    const listingLookupConfig = {
      organisationId,
      includeAllOrganisationListings,
      assignedAgentEmail: normalizeText(profile?.email),
    }

    try {
      let remoteRows = []
      let loadFailed = false
      try {
        remoteRows = await getAgentPrivateListingSummaries(profile?.id, listingLookupConfig)
      } catch (error) {
        console.warn('[Transactions] Property picker summary lookup failed.', error)
        loadFailed = true
      }
      if (!remoteRows.length && !includeAllOrganisationListings && hasOrganisationScope) {
        try {
          remoteRows = await getAgentPrivateListingSummaries(profile?.id, {
            ...listingLookupConfig,
            includeAllOrganisationListings: true,
          })
          loadFailed = false
        } catch (error) {
          console.warn('[Transactions] Property picker summary fallback lookup failed.', error)
          loadFailed = true
        }
      }
      if (loadFailed) {
        setPropertyOptionsError('Could not load properties. Try again.')
      }
      const merged = mergeListings(localListings, remoteRows)
      setPropertyPickerListings(merged)
      setPrivateListings((previous) => mergeListings(previous, remoteRows))
      if (merged.length) {
        setPropertyOptionsError('')
      }
    } catch {
      setPropertyOptionsError('Could not load properties. Try again.')
    } finally {
      setIsLoadingPropertyOptions(false)
    }
  }, [agencyWorkflowMode, currentMembership?.membershipRole, currentMembership?.workspaceRole, currentMembership?.role, profile?.email, profile?.id, workspace?.id])

  useEffect(() => {
    if (!open) return
    setActiveStep('property')
    setSaving(false)
    setSaveError('')
    setErrors({})
    setCreatedDeal(null)
    setCaptureDocuments([])
    setCaptureInvitations([])
    setCommissionPreview(null)
    setSalesAgentSplitOverride('')
    setLoading(true)
    setPreferredPartnersLoading(true)
    setPreferredPartnersError('')
    setPreferredPartners([])
    setRoutingRules([])
    setPartnerSnapshot(null)
    setRoutingRecommendations([])
    setRoutingRecommendationsLoading(false)
    setRoutingRecommendationChoices({})
    setRoleSelectionTouched({})
    setPartnerSearch({ transferAttorney: '', bondOriginator: '', cancellationAttorney: '' })
    setPropertyOptionsError('')
    setIsLoadingPropertyOptions(true)
    const requestedPropertyMode =
      initialPropertyMode === PROPERTY_MODE_DEVELOPMENT || initialUnitId || initialDevelopmentId
        ? PROPERTY_MODE_DEVELOPMENT
        : PROPERTY_MODE_PRIVATE
    setForm({
      ...createInitialWizardForm({ initialDevelopmentId, initialUnitId }),
      propertyMode: requestedPropertyMode,
      privateListingId: requestedPropertyMode === PROPERTY_MODE_PRIVATE ? initialPrivateListingId || '' : '',
      developmentId: requestedPropertyMode === PROPERTY_MODE_DEVELOPMENT ? initialDevelopmentId || '' : '',
      unitId: requestedPropertyMode === PROPERTY_MODE_DEVELOPMENT ? initialUnitId || '' : '',
    })
    const localListings = mergeListings(readAgentPrivateListings())
    setPrivateListings(localListings)
    setPropertyPickerListings(localListings)
    setPipelineRows(readPipelineRows())
    setSellerLeadRows([])

    ;(async () => {
      const setupPromise = (async () => {
        try {
          let partnerRows = []
          let partnerRowsLoadFailed = false
          let allRoutingRules = []
          let preferredRoutingRules = []
          try {
            partnerRows = await listOrganisationPreferredPartners()
          } catch (error) {
            partnerRowsLoadFailed = true
            console.error('[Transactions] Unable to load agency preferred partners.', error)
          }
          try {
            allRoutingRules = await listOrganisationPartnerRoutingRules()
          } catch (error) {
            console.error('[Transactions] Unable to load organisation partner routing rules.', error)
          }
          try {
            preferredRoutingRules = await listUserPreferredPartnerRoutingRules()
          } catch (error) {
            console.error('[Transactions] Unable to load personal preferred partner routing rules.', error)
          }
          const settingsPromise = isSupabaseConfigured
            ? fetchOrganisationSettings().catch(() => null)
            : Promise.resolve(null)
          const [settingsContext, developmentRows] = await Promise.all([
            settingsPromise,
            isSupabaseConfigured ? fetchDevelopmentOptions() : Promise.resolve([]),
          ])
          const organisationId = normalizeText(settingsContext?.organisation?.id || workspace?.id)
          if (isSupabaseConfigured && organisationId) {
            try {
              const leadSnapshot = await listAgencyCrmLeadContacts(organisationId, { includeLocalFallback: false })
              const leadRows = mapAgencyLeadSelectionRows(leadSnapshot)
              setPipelineRows(getBuyerLeadOptions(leadRows))
              setSellerLeadRows(leadRows.filter((lead) => normalizeKey(lead.leadCategory || lead.lead_category || lead.contactType || lead.contact_type).includes('seller')))
            } catch (error) {
              console.warn('[Transactions] CRM buyer lead selector load failed.', error)
            }
          }
          const partnerFallbackContext = {
            organisationId,
            role: normalizeKey(currentMembership?.membershipRole || currentMembership?.workspaceRole || currentMembership?.role || profile?.role),
            profile,
            currentMembership,
          }
          // The saved Third Parties directory is the primary transaction
          // source. Make it usable immediately instead of withholding it
          // behind the optional legacy network snapshot, which can time out
          // on organisations with a large relationship history.
          const directPreferredPartners = mergePreferredPartnerOptions(partnerRows)
          setPreferredPartners(directPreferredPartners)
          setPreferredPartnersError(partnerRowsLoadFailed ? 'Could not load agency preferred partners. Try refreshing the page.' : '')
          setPreferredPartnersLoading(false)
          let fallbackRows = []
          let routingRows = []
          let fetchedPartnerSnapshot = null

          if (isSupabaseConfigured && organisationId) {
            try {
              fetchedPartnerSnapshot = await fetchPartnersSnapshot({
                organisationId,
                workspaceType: workspace?.type || 'agency',
                accessContext: partnerFallbackContext,
              })
              routingRows = getPreferredPartnerRowsFromRoutingRules(fetchedPartnerSnapshot, preferredRoutingRules)
              fallbackRows = getFallbackPreferredPartnersFromSnapshot(fetchedPartnerSnapshot, partnerFallbackContext)
              console.debug('[Transactions] Agency preferred partner fallback snapshot rows', {
                organisationId,
                fallbackCount: fallbackRows.length,
                routingCount: routingRows.length,
              })
            } catch (error) {
              console.warn('[Transactions] Could not load partner snapshot fallback.', error)
            }
          }

          const mergedPreferredPartners = mergePreferredPartnerOptions([...routingRows, ...partnerRows], fallbackRows)
          console.debug('[Transactions] Agency preferred partners loaded', {
            organisationId,
            primaryCount: Array.isArray(partnerRows) ? partnerRows.length : 0,
            routingCount: Array.isArray(routingRows) ? routingRows.length : 0,
            fallbackCount: Array.isArray(fallbackRows) ? fallbackRows.length : 0,
            mergedCount: mergedPreferredPartners.length,
            transferAttorneyCount: mergedPreferredPartners.filter((partner) => normalizePreferredPartnerType(partner?.partnerType) === 'transfer_attorney').length,
            bondOriginatorCount: mergedPreferredPartners.filter((partner) => normalizePreferredPartnerType(partner?.partnerType) === 'bond_originator').length,
            bondAttorneyCount: mergedPreferredPartners.filter((partner) => normalizePreferredPartnerType(partner?.partnerType) === 'bond_attorney').length,
            cancellationAttorneyCount: mergedPreferredPartners.filter((partner) => normalizePreferredPartnerType(partner?.partnerType) === 'cancellation_attorney').length,
          })

          if (!mergedPreferredPartners.length && partnerRowsLoadFailed) {
            setPreferredPartnersError('Could not load agency preferred partners. Try refreshing the page.')
          } else if (mergedPreferredPartners.length) {
            setPreferredPartnersError('')
          }

          setPreferredPartners(mergedPreferredPartners)
          setRoutingRules(Array.isArray(allRoutingRules) && allRoutingRules.length ? allRoutingRules : preferredRoutingRules)
          setPartnerSnapshot(fetchedPartnerSnapshot)
          const membershipRole = normalizeKey(settingsContext?.membershipRole || currentMembership?.workspaceRole || currentMembership?.role)
          const hasOrganisationScope = Boolean(organisationId && organisationId !== 'all')
          const includeAllOrganisationListings = hasOrganisationScope || agencyWorkflowMode === 'principal' || ['principal', 'owner', 'admin', 'hq'].includes(membershipRole)
          let remoteListings = []
          if (isSupabaseConfigured) {
            const listingLookupConfig = {
              organisationId,
              includeAllOrganisationListings,
              assignedAgentEmail: normalizeText(profile?.email),
            }
            remoteListings = await getAgentPrivateListings(profile?.id, listingLookupConfig).catch((error) => {
              console.warn('[Transactions] Active listing lookup failed; using local listing cache.', error)
              return []
            })
            if (!remoteListings.length && !includeAllOrganisationListings && hasOrganisationScope) {
              remoteListings = await getAgentPrivateListings(profile?.id, {
                ...listingLookupConfig,
                includeAllOrganisationListings: true,
              }).catch(() => [])
            }
          }
          setPrivateListings(mergeListings(localListings, remoteListings))
          const email = String(profile?.email || '').trim().toLowerCase()
          const filtered = (developmentRows || []).filter((row) => {
            const assignedAgents = getDevelopmentTeamMembers(row?.stakeholder_teams, 'agents')
            return email ? assignedAgents.some((item) => String(item.email || '').trim().toLowerCase() === email) : true
          })
          setDevelopments(filtered)
          if (!isSupabaseConfigured) {
            setDevelopmentUnits([])
          }
        } catch (error) {
          setSaveError(error?.message || 'Unable to load preferred partners and developments.')
        }
      })()
      const optionsPromise = loadPropertyPickerListings()
      await Promise.allSettled([setupPromise, optionsPromise])
      setLoading(false)
      setPreferredPartnersLoading(false)
    })()
  }, [
    agencyWorkflowMode,
    currentMembership,
    loadPropertyPickerListings,
    open,
    profile,
    initialDevelopmentId,
    initialPrivateListingId,
    initialPropertyMode,
    initialUnitId,
    workspace?.id,
    workspace?.type,
  ])

  useEffect(() => {
    if (!open || form.propertyMode !== PROPERTY_MODE_DEVELOPMENT || !form.developmentId || !isSupabaseConfigured) {
      setDevelopmentUnits([])
      return
    }

    ;(async () => {
      try {
        const rows = await fetchUnitsForTransactionSetup(form.developmentId)
        const available = rows.filter((unit) => String(unit?.status || '').trim().toLowerCase() === 'available' && !unit?.activeTransaction)
        const selected = rows.find((unit) => String(unit?.id) === String(form.unitId))
        setDevelopmentUnits(selected && !available.some((unit) => String(unit.id) === String(selected.id)) ? [selected, ...available] : available)
      } catch (error) {
        setSaveError(error?.message || 'Unable to load development units.')
      }
    })()
  }, [open, form.propertyMode, form.developmentId, form.unitId])

  const selectedPrivateListing = useMemo(
    () =>
      privateListings.find((listing) => String(listing.id) === String(form.privateListingId))
      || propertyPickerListings.find((listing) => String(listing.id) === String(form.privateListingId))
      || null,
    [privateListings, propertyPickerListings, form.privateListingId],
  )

  const selectedDevelopment = useMemo(
    () => developments.find((item) => String(item.id) === String(form.developmentId)) || null,
    [developments, form.developmentId],
  )

  const selectedUnit = useMemo(
    () => developmentUnits.find((item) => String(item.id) === String(form.unitId)) || null,
    [developmentUnits, form.unitId],
  )

  const selectedLead = useMemo(
    () => pipelineRows.find((row) => String(row.id) === String(form.pipelineLeadId)) || null,
    [pipelineRows, form.pipelineLeadId],
  )
  const inheritedDealTerms = useMemo(
    () =>
      deriveDealTermsFromSelection({
        propertyMode: form.propertyMode,
        listing: selectedPrivateListing,
        unit: selectedUnit,
        salePriceOverride: form.capturedSalePrice,
      }),
    [form.propertyMode, form.capturedSalePrice, selectedPrivateListing, selectedUnit],
  )
  const buyerPartyProfile = normalizeTransactionPartyProfile(form.buyerPartyProfile || {
    entityType: 'individual',
    people: [{ id: form.buyerPersonId, role: 'owner', name: [form.clientName, form.clientSurname].filter(Boolean).join(' '), email: form.clientEmail, phone: form.clientPhone, maritalStatus: 'unknown', isOwner: true, primaryContact: true, signatory: false }],
  })
  const listingSellerForCapture = getListingSeller(selectedPrivateListing)
  const listingSellerFacts = selectedPrivateListing?.sellerCanonicalFacts || selectedPrivateListing?.sellerOnboarding?.formData || {}
  const sellerPartyProfile = form.sellerPartyProfile ? normalizeTransactionPartyProfile(form.sellerPartyProfile) : transactionSellerProfileFromSource({
    facts: form.propertyMode === PROPERTY_MODE_IMPORT ? {} : { ...listingSellerFacts, sellerEntityType: listingSellerFacts.sellerEntityType || selectedPrivateListing?.sellerEntityType },
    contact: form.propertyMode === PROPERTY_MODE_IMPORT ? { name: form.importSellerName, email: form.importSellerEmail, phone: form.importSellerPhone } : listingSellerForCapture,
    personId: form.sellerPersonId,
  })
  const transactionParties = buildTransactionPartiesSnapshot({ buyer: form.connectBuyerNow ? buyerPartyProfile : { entityType: 'unknown', people: [] }, seller: sellerPartyProfile })
  const captureFinance = buildTransactionCaptureFinance(form, inheritedDealTerms.salePrice)
  const buyerCaptureLabels = getBuyerCaptureLabels(form.purchaserType)
  const purchaserTypeLabel = getPurchaserTypeLabel(form.purchaserType)
  const buyerPartyCount = buildBuyerPartiesForPayload().length
  const effectiveSignedOtpStatus = captureDocuments.some((entry) => entry.key === 'signed_otp') ? 'pending_upload' : form.signedOtpStatus
  const signedOtpStatusLabel = getOptionLabel(SIGNED_OTP_STATUS_OPTIONS, effectiveSignedOtpStatus, 'Signed OTP to upload')
  const normalizedWizardFinanceType = normalizeFinanceTypeForApi(form.financeType)
  const isWizardBondFinance = normalizedWizardFinanceType === 'bond' || normalizedWizardFinanceType === 'combination'
  const includesWizardCashFinance = normalizedWizardFinanceType === 'cash' || normalizedWizardFinanceType === 'combination'
  const shouldUseBondOriginator = isWizardBondFinance && form.financeManagedBy === 'bond_originator'
  const activePreferredPartners = useMemo(
    () => (preferredPartners || []).filter((item) => item?.isActive),
    [preferredPartners],
  )
  const transferAttorneyOptions = useMemo(
    () =>
      filterPreferredPartners(activePreferredPartners, {
        type: 'transfer_attorney',
        query: partnerSearch.transferAttorney,
        activeOnly: true,
      }),
    [activePreferredPartners, partnerSearch.transferAttorney],
  )
  const bondOriginatorOptions = useMemo(
    () =>
      filterPreferredPartners(activePreferredPartners, {
        type: 'bond_originator',
        query: partnerSearch.bondOriginator,
        activeOnly: true,
      }),
    [activePreferredPartners, partnerSearch.bondOriginator],
  )
  const cancellationAttorneyOptions = useMemo(
    () =>
      filterPreferredPartners(activePreferredPartners, {
        type: 'cancellation_attorney',
        query: partnerSearch.cancellationAttorney,
        activeOnly: true,
      }),
    [activePreferredPartners, partnerSearch.cancellationAttorney],
  )
  const selectedTransferPartner = useMemo(
    () => findPartnerById(activePreferredPartners, form.transferPreferredPartnerId),
    [activePreferredPartners, form.transferPreferredPartnerId],
  )
  const selectedBondOriginatorPartner = useMemo(
    () => findPartnerById(activePreferredPartners, form.bondOriginatorPreferredPartnerId),
    [activePreferredPartners, form.bondOriginatorPreferredPartnerId],
  )
  const selectedCancellationAttorneyPartner = useMemo(
    () => findPartnerById(activePreferredPartners, form.cancellationAttorneyPreferredPartnerId),
    [activePreferredPartners, form.cancellationAttorneyPreferredPartnerId],
  )
  const selectedTransferPartnerPerson = useMemo(
    () => findPartnerPersonOption(partnerPersonOptions.transfer_attorney, form.transferPreferredPartnerPersonId || selectedTransferPartner?.userId || ''),
    [form.transferPreferredPartnerPersonId, partnerPersonOptions.transfer_attorney, selectedTransferPartner?.userId],
  )
  const selectedBondOriginatorPartnerPerson = useMemo(
    () => findPartnerPersonOption(partnerPersonOptions.bond_originator, form.bondOriginatorPreferredPartnerPersonId || selectedBondOriginatorPartner?.userId || ''),
    [form.bondOriginatorPreferredPartnerPersonId, partnerPersonOptions.bond_originator, selectedBondOriginatorPartner?.userId],
  )
  const selectedCancellationAttorneyPartnerPerson = useMemo(
    () => findPartnerPersonOption(partnerPersonOptions.cancellation_attorney, form.cancellationAttorneyPreferredPartnerPersonId || selectedCancellationAttorneyPartner?.userId || ''),
    [form.cancellationAttorneyPreferredPartnerPersonId, partnerPersonOptions.cancellation_attorney, selectedCancellationAttorneyPartner?.userId],
  )

  useEffect(() => {
    const roleConfigs = [
      { roleType: 'transfer_attorney', mode: form.transferPartnerMode, partner: selectedTransferPartner },
      { roleType: 'bond_originator', mode: form.bondOriginatorMode, partner: selectedBondOriginatorPartner },
      { roleType: 'cancellation_attorney', mode: form.cancellationAttorneyMode, partner: selectedCancellationAttorneyPartner },
    ]
    const inactiveRoleTypes = roleConfigs
      .filter((item) => item.mode !== PARTNER_MODE_AGENCY || !item.partner)
      .map((item) => item.roleType)
    if (inactiveRoleTypes.length) {
      setPartnerPersonOptions((previous) => {
        const next = { ...previous }
        inactiveRoleTypes.forEach((roleType) => {
          next[roleType] = []
        })
        return next
      })
      setPartnerPeopleMessages((previous) => {
        const next = { ...previous }
        inactiveRoleTypes.forEach((roleType) => {
          next[roleType] = ''
        })
        return next
      })
      setLoadingPartnerPeople((previous) => {
        const next = { ...previous }
        inactiveRoleTypes.forEach((roleType) => {
          next[roleType] = false
        })
        return next
      })
    }

    const activeConfigs = open
      ? roleConfigs.filter((item) => item.mode === PARTNER_MODE_AGENCY && item.partner)
      : []
    if (!activeConfigs.length) return undefined

    let cancelled = false
    activeConfigs.forEach(({ roleType, partner }) => {
      setLoadingPartnerPeople((previous) => ({ ...previous, [roleType]: true }))
      loadPartnerPersonOptions(partner, roleType)
        .then((payload) => {
          if (cancelled) return
          setPartnerPersonOptions((previous) => ({ ...previous, [roleType]: payload.people || [] }))
          setPartnerPeopleMessages((previous) => ({ ...previous, [roleType]: payload.message || '' }))
        })
        .catch(() => {
          if (cancelled) return
          setPartnerPersonOptions((previous) => ({ ...previous, [roleType]: [] }))
          setPartnerPeopleMessages((previous) => ({
            ...previous,
            [roleType]: roleType === 'bond_originator'
              ? 'No visible consultants are available for this bond originator yet.'
              : 'No visible attorneys are available for this firm yet.',
          }))
        })
        .finally(() => {
          if (!cancelled) setLoadingPartnerPeople((previous) => ({ ...previous, [roleType]: false }))
        })
    })

    return () => {
      cancelled = true
    }
  }, [
    form.bondOriginatorMode,
    form.cancellationAttorneyMode,
    form.transferPartnerMode,
    open,
    selectedBondOriginatorPartner,
    selectedCancellationAttorneyPartner,
    selectedTransferPartner,
  ])
  const sourceOrganisationId = useMemo(
    () => normalizeText(workspace?.id),
    [workspace?.id],
  )
  const sourceBranchId = useMemo(
    () => normalizeText(currentMembership?.branchId || currentMembership?.branch_id),
    [currentMembership?.branchId, currentMembership?.branch_id],
  )
  const partnerOrganisationLookup = useMemo(() => {
    const relationships = Array.isArray(partnerSnapshot?.relationships) ? partnerSnapshot.relationships : []
    return relationships.reduce((accumulator, relationship) => {
      const organisationId = normalizeText(
        relationship?.partnerOrganisationId ||
        relationship?.counterpartOrganisationId ||
        relationship?.partner?.id,
      )
      if (!organisationId) return accumulator
      accumulator[organisationId] = {
        id: organisationId,
        name: normalizeText(relationship?.partner?.name || relationship?.counterpartName || relationship?.companyName),
        type: normalizeText(relationship?.partner?.type || relationship?.partnerRoleType || relationship?.counterpartType),
        relationshipId: normalizeText(relationship?.id || relationship?.relationshipId),
      }
      return accumulator
    }, {})
  }, [partnerSnapshot])
  const recommendedRoutingRoleTypes = useMemo(
    () =>
      inferPartnerRoutingRoleTypesForTransaction({
        financeType: normalizeFinanceTypeForApi(form.financeType),
        hasExistingBondToCancel: Boolean(form.hasExistingBondToCancel),
      }),
    [form.financeType, form.hasExistingBondToCancel],
  )
  const routingRecommendationByRole = useMemo(
    () =>
      routingRecommendations.reduce((accumulator, item) => {
        accumulator[item.roleType] = item
        return accumulator
      }, {}),
    [routingRecommendations],
  )
  const cancellationAttorneyRequired = Boolean(
    form.hasExistingBondToCancel || routingRecommendationByRole.cancellation_attorney?.required,
  )

  const describeManualRoleSelection = useCallback((roleType) => {
    if (roleType === 'transfer_attorney') {
      if (form.transferPartnerMode === PARTNER_MODE_BUYER) {
        return {
          roleType,
          label: String(form.transferBuyerCompanyName || form.transferBuyerContactPerson || '').trim(),
          detail: 'Seller-appointed firm',
        }
      }
      return selectedTransferPartner
        ? {
            roleType,
            label: selectedTransferPartner.companyName || selectedTransferPartner.contactPerson || '',
            detail: 'Agency selection',
          }
        : null
    }

    if (roleType === 'bond_originator') {
      if (form.bondOriginatorMode === PARTNER_MODE_BUYER) {
        return {
          roleType,
          label: String(form.bondOriginatorBuyerCompanyName || form.bondOriginatorBuyerContactPerson || '').trim(),
          detail: 'Buyer-appointed partner',
        }
      }
      return selectedBondOriginatorPartner
        ? {
            roleType,
            label: selectedBondOriginatorPartner.companyName || selectedBondOriginatorPartner.contactPerson || '',
            detail: 'Agency selection',
          }
        : null
    }

    if (roleType === 'cancellation_attorney') {
      if (form.cancellationAttorneyMode === PARTNER_MODE_BUYER) {
        return {
          roleType,
          label: String(form.cancellationAttorneyBuyerCompanyName || form.cancellationAttorneyBuyerContactPerson || '').trim(),
          detail: 'Seller-appointed partner',
        }
      }
      return selectedCancellationAttorneyPartner
        ? {
            roleType,
            label: selectedCancellationAttorneyPartner.companyName || selectedCancellationAttorneyPartner.contactPerson || '',
            detail: 'Agency selection',
          }
        : null
    }

    return null
  }, [
    form.transferPartnerMode,
    form.transferBuyerCompanyName,
    form.transferBuyerContactPerson,
    form.bondOriginatorMode,
    form.bondOriginatorBuyerCompanyName,
    form.bondOriginatorBuyerContactPerson,
    form.cancellationAttorneyMode,
    form.cancellationAttorneyBuyerCompanyName,
    form.cancellationAttorneyBuyerContactPerson,
    selectedTransferPartner,
    selectedBondOriginatorPartner,
    selectedCancellationAttorneyPartner,
  ])

  const defaultAttorney = useMemo(() => {
    const privateAttorneyOptions = normalizeListingAttorneyOptions(selectedPrivateListing)
    const developmentAttorneyOptions = getDevelopmentTeamMembers(selectedDevelopment?.stakeholder_teams, 'conveyancers')
    return form.propertyMode === PROPERTY_MODE_PRIVATE
      ? privateAttorneyOptions[0] || null
      : developmentAttorneyOptions[0] || null
  }, [form.propertyMode, selectedDevelopment?.stakeholder_teams, selectedPrivateListing])

  useEffect(() => {
    if (!open) return

    const defaultTransferPartner = getDefaultPreferredPartnerByType(activePreferredPartners, 'transfer_attorney')
    const defaultBondOriginatorPartner = getDefaultPreferredPartnerByType(activePreferredPartners, 'bond_originator')
    const defaultCancellationAttorneyPartner = getDefaultPreferredPartnerByType(activePreferredPartners, 'cancellation_attorney')
    setForm((previous) => {
      const next = { ...previous }
      let changed = false

      if (defaultTransferPartner && !previous.transferPreferredPartnerId) {
        next.transferPreferredPartnerId = defaultTransferPartner.id
        next.transferPreferredPartnerPersonId = defaultTransferPartner.userId || ''
        next.transferPartnerMode = PARTNER_MODE_AGENCY
        changed = true
      }
      if (!defaultTransferPartner && previous.transferPartnerMode === PARTNER_MODE_AGENCY) {
        next.transferPartnerMode = PARTNER_MODE_BUYER
        changed = true
      }
      if (
        shouldUseBondOriginator &&
        defaultBondOriginatorPartner &&
        !previous.bondOriginatorPreferredPartnerId &&
        previous.bondOriginatorMode === PARTNER_MODE_NONE
      ) {
        next.bondOriginatorPreferredPartnerId = defaultBondOriginatorPartner.id
        next.bondOriginatorPreferredPartnerPersonId = defaultBondOriginatorPartner.userId || ''
        next.bondOriginatorMode = PARTNER_MODE_AGENCY
        changed = true
      }
      if (!shouldUseBondOriginator && previous.bondOriginatorMode !== PARTNER_MODE_NONE) {
        next.bondOriginatorMode = PARTNER_MODE_NONE
        next.bondOriginatorPreferredPartnerId = ''
        next.bondOriginatorPreferredPartnerPersonId = ''
        next.bondOriginatorBuyerCompanyName = ''
        next.bondOriginatorBuyerContactPerson = ''
        next.bondOriginatorBuyerEmail = ''
        next.bondOriginatorBuyerPhone = ''
        next.bondOriginatorBuyerNotes = ''
        changed = true
      }
      if (
        previous.hasExistingBondToCancel
        && defaultCancellationAttorneyPartner
        && !previous.cancellationAttorneyPreferredPartnerId
        && previous.cancellationAttorneyMode === PARTNER_MODE_NONE
      ) {
        next.cancellationAttorneyPreferredPartnerId = defaultCancellationAttorneyPartner.id
        next.cancellationAttorneyPreferredPartnerPersonId = defaultCancellationAttorneyPartner.userId || ''
        next.cancellationAttorneyMode = PARTNER_MODE_AGENCY
        changed = true
      }
      return changed ? next : previous
    })
  }, [activePreferredPartners, form.hasExistingBondToCancel, open, shouldUseBondOriginator])

  useEffect(() => {
    if (selectedLead) {
      const rawName = String(selectedLead.name || '').trim()
      const [first = '', ...rest] = rawName.split(/\s+/)
      setForm((previous) => ({
        ...previous,
        buyerPartyProfile: previous.buyerPartyProfile ? { ...previous.buyerPartyProfile, people: previous.buyerPartyProfile.people.map((person, index) => person.primaryContact || (!previous.buyerPartyProfile.people.some((item) => item.primaryContact) && index === 0) ? { ...person, name: rawName || person.name, email: selectedLead.email || person.email, phone: selectedLead.phone || person.phone } : person) } : null,
        clientName: first || previous.clientName,
        clientSurname: rest.join(' ') || previous.clientSurname,
        clientEmail: String(selectedLead.email || '').trim() || previous.clientEmail,
        clientPhone: String(selectedLead.phone || '').trim() || previous.clientPhone,
      }))
    }
  }, [selectedLead])

  useEffect(() => {
    if (form.propertyMode === PROPERTY_MODE_PRIVATE && selectedPrivateListing) {
      setForm((previous) => ({
        ...previous,
        reservationRequired: false,
        reservationAmount: '',
        reservationAmountType: 'fixed',
        reservationTreatment: 'credited_to_purchase_price',
        reservationPayableTo: 'developer',
        alterationChargeTreatment: 'included_in_purchase_price',
        transferBuyerCompanyName:
          previous.transferPartnerMode === PARTNER_MODE_BUYER && !previous.transferBuyerCompanyName
            ? defaultAttorney?.name || ''
            : previous.transferBuyerCompanyName,
        transferBuyerEmail:
          previous.transferPartnerMode === PARTNER_MODE_BUYER && !previous.transferBuyerEmail
            ? defaultAttorney?.email || ''
            : previous.transferBuyerEmail,
        transferBuyerPhone:
          previous.transferPartnerMode === PARTNER_MODE_BUYER && !previous.transferBuyerPhone
            ? defaultAttorney?.phone || ''
            : previous.transferBuyerPhone,
      }))
    }
  }, [selectedPrivateListing, defaultAttorney?.email, defaultAttorney?.name, defaultAttorney?.phone, form.propertyMode])

  useEffect(() => {
    if (form.propertyMode === PROPERTY_MODE_DEVELOPMENT && selectedUnit) {
      const reservationEnabled = Boolean(selectedDevelopment?.reservation_deposit_enabled_by_default)
      const reservationAmount = reservationEnabled ? String(selectedDevelopment?.reservation_deposit_amount || '') : ''
      setForm((previous) => ({
        ...previous,
        reservationRequired: reservationEnabled,
        reservationAmount,
        reservationAmountType: selectedDevelopment?.reservation_deposit_amount_type || 'fixed',
        reservationTreatment: selectedDevelopment?.reservation_deposit_treatment || 'credited_to_purchase_price',
        reservationPayableTo: selectedDevelopment?.reservation_deposit_payable_to || 'developer',
        alterationChargeTreatment:
          selectedDevelopment?.default_alteration_charge_treatment || 'included_in_purchase_price',
        transferBuyerCompanyName:
          previous.transferPartnerMode === PARTNER_MODE_BUYER && !previous.transferBuyerCompanyName
            ? defaultAttorney?.name || ''
            : previous.transferBuyerCompanyName,
        transferBuyerEmail:
          previous.transferPartnerMode === PARTNER_MODE_BUYER && !previous.transferBuyerEmail
            ? defaultAttorney?.email || ''
            : previous.transferBuyerEmail,
        transferBuyerPhone:
          previous.transferPartnerMode === PARTNER_MODE_BUYER && !previous.transferBuyerPhone
            ? defaultAttorney?.phone || ''
            : previous.transferBuyerPhone,
      }))
    }
  }, [
    selectedUnit,
    selectedDevelopment?.reservation_deposit_amount,
    selectedDevelopment?.reservation_deposit_amount_type,
    selectedDevelopment?.reservation_deposit_enabled_by_default,
    selectedDevelopment?.reservation_deposit_payable_to,
    selectedDevelopment?.reservation_deposit_treatment,
    selectedDevelopment?.default_alteration_charge_treatment,
    defaultAttorney?.email,
    defaultAttorney?.name,
    defaultAttorney?.phone,
    form.propertyMode,
  ])

  useEffect(() => {
    if (!open) return
    const numericSalePrice = Number(inheritedDealTerms?.salePrice || 0)
    const grossCommissionPercentage = Number(inheritedDealTerms?.grossCommissionPercentage || 0)
    if (!Number.isFinite(numericSalePrice) || numericSalePrice <= 0 || !Number.isFinite(grossCommissionPercentage)) {
      setCommissionPreview(null)
      return
    }

    let active = true
    const timeoutId = window.setTimeout(() => {
      ;(async () => {
        try {
          const preview = await resolveCommissionSnapshotForAgent({
            assignedAgentUserId: String(profile?.id || '').trim(),
            assignedAgentEmail: String(profile?.email || '').trim(),
            salePrice: numericSalePrice,
            grossCommissionPercentage,
            overrideAgentSplitPercentage: normalizePercentageInput(salesAgentSplitOverride),
          })
          if (active) {
            setCommissionPreview(preview)
            if (!salesAgentSplitOverride && Number.isFinite(Number(preview?.agentSplitPercentage))) {
              setSalesAgentSplitOverride(String(preview.agentSplitPercentage))
            }
          }
        } catch {
          if (active) {
            setCommissionPreview(null)
          }
        }
      })()
    }, 420)

    return () => {
      active = false
      window.clearTimeout(timeoutId)
    }
  }, [open, inheritedDealTerms?.salePrice, inheritedDealTerms?.grossCommissionPercentage, profile?.id, profile?.email, salesAgentSplitOverride])

  useEffect(() => {
    if (!open || !['attorney', 'review'].includes(activeStep) || !sourceOrganisationId || !profile?.id) {
      return
    }

    let active = true
    setRoutingRecommendationsLoading(true)

    ;(async () => {
      try {
        const propertyType =
          form.propertyMode === PROPERTY_MODE_PRIVATE
            ? mapPrivateListingToTransactionPropertyCategory(selectedPrivateListing)
            : 'residential'
        const results = await Promise.all(
          CORE_ROUTING_ROLE_TYPES.map(async (roleType) => {
            const required = recommendedRoutingRoleTypes.includes(roleType)
            if (!required) {
              return {
                roleType,
                required: false,
                notRequired: true,
                resolutionSource: 'not_required',
                confidence: 1,
                requiresManualSelection: false,
                resolutionReason: roleType === 'cancellation_attorney'
                  ? 'Only required when there is an existing bond to cancel.'
                  : 'Not required for this finance profile.',
              }
            }

            const decision = await resolvePartnerRoutingForTransaction({
              sourceOrganisationId,
              sourceBranchId,
              sourceUserId: profile.id,
              targetRoleType: roleType,
              dealType: form.propertyMode === PROPERTY_MODE_DEVELOPMENT ? 'developer_sale' : 'private_property',
              financeType: normalizeFinanceTypeForApi(form.financeType) || 'unknown',
              propertyType,
              module: 'agent',
              moduleContext: {
                role: 'agent',
                workspaceRole: currentMembership?.workspaceRole || currentMembership?.role || profile?.role || 'agent',
                appRole: profile?.role || 'agent',
              },
              routingRules,
              partnerConnections: { connections: [], loaded: false },
            })

            const organisation =
              partnerOrganisationLookup[decision.targetOrganisationId] ||
              partnerOrganisationLookup[decision.targetOrganisationId || ''] ||
              null

            return {
              ...decision,
              roleType,
              required: true,
              notRequired: false,
              targetOrganisationName:
                decision.targetOrganisationName ||
                organisation?.name ||
                '',
              partnerType: organisation?.type || '',
            }
          }),
        )

        if (!active) return
        setRoutingRecommendations(results)
        setRoutingRecommendationChoices((previous) =>
          results.reduce((accumulator, item) => {
            if (item.notRequired) {
              accumulator[item.roleType] = 'skip'
            } else if (accumulator[item.roleType]) {
              return accumulator
            } else if (roleSelectionTouched[item.roleType]) {
              accumulator[item.roleType] = 'manual'
            } else if (item.requiresManualSelection) {
              accumulator[item.roleType] = 'manual'
            } else {
              accumulator[item.roleType] = 'confirm'
            }
            return accumulator
          }, { ...previous }),
        )
      } catch (error) {
        if (active) {
          setRoutingRecommendations([])
          setSaveError(error?.message || 'Unable to resolve recommended role players.')
        }
      } finally {
        if (active) {
          setRoutingRecommendationsLoading(false)
        }
      }
    })()

    return () => {
      active = false
    }
  }, [
    activeStep,
    currentMembership?.role,
    currentMembership?.workspaceRole,
    form.financeType,
    form.hasExistingBondToCancel,
    form.propertyMode,
    open,
    partnerOrganisationLookup,
    profile?.id,
    profile?.role,
    recommendedRoutingRoleTypes,
    roleSelectionTouched,
    routingRules,
    selectedPrivateListing,
    sourceBranchId,
    sourceOrganisationId,
  ])

  function updateField(key, value) {
    setForm((previous) => {
      const next = { ...previous, [key]: value }
      if (['privateListingId', 'developmentId', 'unitId'].includes(key) && previous[key] !== value) {
        next.sellerLeadId = ''
        next.capturedSalePrice = ''
        next.capturedStage = ''
        next.sellerPartyProfile = null
        next.sellerPersonId = crypto.randomUUID()
      }
      if (key === 'sellerBondStatus') next.hasExistingBondToCancel = value === 'yes'
      if (key === 'sellerLeadId') {
        const lead = sellerLeadRows.find((item) => String(item.id) === String(value))
        if (lead) next.sellerPartyProfile = transactionSellerProfileFromSource({ contact: lead, personId: previous.sellerPersonId })
      }
      if (key === 'transferPreferredPartnerId') {
        const partner = findPartnerById(activePreferredPartners, value)
        next.transferPreferredPartnerPersonId = partner?.userId || ''
      }
      if (key === 'bondOriginatorPreferredPartnerId') {
        const partner = findPartnerById(activePreferredPartners, value)
        next.bondOriginatorPreferredPartnerPersonId = partner?.userId || ''
      }
      if (key === 'financeManagedBy') {
        if (value !== 'bond_originator') {
          next.bondOriginatorMode = PARTNER_MODE_NONE
          next.bondOriginatorPreferredPartnerId = ''
          next.bondOriginatorPreferredPartnerPersonId = ''
          next.bondOriginatorBuyerCompanyName = ''
          next.bondOriginatorBuyerContactPerson = ''
          next.bondOriginatorBuyerEmail = ''
          next.bondOriginatorBuyerPhone = ''
          next.bondOriginatorBuyerNotes = ''
        } else if (next.bondOriginatorMode === PARTNER_MODE_NONE) {
          next.bondOriginatorMode = PARTNER_MODE_AGENCY
        }
      }
      if (key === 'cancellationAttorneyPreferredPartnerId') {
        const partner = findPartnerById(activePreferredPartners, value)
        next.cancellationAttorneyPreferredPartnerPersonId = partner?.userId || ''
      }
      if (key === 'transferPartnerMode' && value !== PARTNER_MODE_AGENCY) next.transferPreferredPartnerPersonId = ''
      if (key === 'bondOriginatorMode' && value !== PARTNER_MODE_AGENCY) next.bondOriginatorPreferredPartnerPersonId = ''
      if (key === 'cancellationAttorneyMode' && value !== PARTNER_MODE_AGENCY) next.cancellationAttorneyPreferredPartnerPersonId = ''
      return next
    })
    const roleKey = ROLE_FIELD_TO_ROLE_KEY[key]
    if (roleKey) {
      setRoleSelectionTouched((previous) => ({ ...previous, [roleKey]: true }))
      setRoutingRecommendationChoices((previous) => ({ ...previous, [roleKey]: 'manual' }))
    }
  }

  function handleFinanceTypeChange(value) {
    const normalized = normalizeFinanceTypeForApi(value)
    const nextIsBondFinance = normalized === 'bond' || normalized === 'combination'
    setForm((previous) => ({
      ...previous,
      financeType: value,
      financeManagedBy: nextIsBondFinance ? previous.financeManagedBy || 'bond_originator' : 'client',
      bondAmount: nextIsBondFinance ? previous.bondAmount : '',
      cashAmount: ['cash', 'combination'].includes(normalized) ? previous.cashAmount : '',
      financeBank: nextIsBondFinance ? previous.financeBank : '',
      bondStatus: nextIsBondFinance ? previous.bondStatus : 'unknown',
      bondAttorneyNomination: nextIsBondFinance ? previous.bondAttorneyNomination : { mode: 'none' },
      bondOriginatorMode: nextIsBondFinance ? previous.bondOriginatorMode : PARTNER_MODE_NONE,
    }))
  }

  function buildBuyerPartiesForPayload() {
    return buyerPartyProfile.people.filter((person) => person.name || person.email || person.phone || person.identityNumber).map((person) => ({
      ...person,
      role: person.isOwner ? (person.primaryContact ? 'primary_purchaser' : 'co_purchaser') : person.role,
      purchaserType: partyPurchaserType(buyerPartyProfile),
      primary: person.primaryContact,
    }))
  }

  function updateBuyerPartyProfile(value) {
    const primary = value.people.find((person) => person.primaryContact) || value.people[0] || {}
    setForm((previous) => ({ ...previous, buyerPartyProfile: value, purchaserType: partyPurchaserType(value), clientName: isNaturalParty(value.entityType) ? primary.name || '' : value.name || '', clientSurname: '', clientEmail: primary.email || '', clientPhone: primary.phone || '' }))
  }

  function buildHandoffChecklist() {
    const transferPartnerCaptured = Boolean(
      form.transferPreferredPartnerId ||
        form.transferBuyerCompanyName ||
        form.transferBuyerContactPerson,
    )
    const bondOriginatorCaptured =
      !shouldUseBondOriginator ||
      Boolean(
        form.bondOriginatorPreferredPartnerId ||
          form.bondOriginatorBuyerCompanyName ||
          form.bondOriginatorBuyerContactPerson,
      )
    const cancellationAttorneyCaptured =
      !cancellationAttorneyRequired ||
      Boolean(
        form.cancellationAttorneyPreferredPartnerId ||
          form.cancellationAttorneyBuyerCompanyName ||
          form.cancellationAttorneyBuyerContactPerson,
      )

    return {
      signedOtpStatus: effectiveSignedOtpStatus,
      buyerPartiesCaptured: buildBuyerPartiesForPayload().length > 0,
      financeCaptured: captureFinance.complete,
      partnersCaptured: Boolean(transferPartnerCaptured && bondOriginatorCaptured && cancellationAttorneyCaptured),
      notes: form.handoffNotes,
    }
  }

  function updatePropertyMode(nextMode) {
    setForm((previous) => ({
      ...previous,
      propertyMode: nextMode,
      capturedStage: '',
      sellerLeadId: '',
      capturedSalePrice: '',
      sellerPartyProfile: null,
      sellerPersonId: crypto.randomUUID(),
      privateListingId: '',
      developmentId: nextMode === PROPERTY_MODE_DEVELOPMENT ? previous.developmentId || initialDevelopmentId || '' : '',
      unitId: '',
      connectBuyerNow: nextMode === PROPERTY_MODE_IMPORT ? false : previous.connectBuyerNow,
    }))
  }

  function updatePartnerSearchField(key, value) {
    setPartnerSearch((previous) => ({
      ...previous,
      [key]: value,
    }))
  }

  function validate(stepKey) {
    const nextErrors = {}

    if (stepKey === 'property') {
      for (const key of ['cashAmount', 'bondAmount', 'depositAmount']) {
        if (String(form[key]).trim() && (!Number.isFinite(Number(form[key])) || Number(form[key]) < 0)) nextErrors[key] = 'Enter an amount of zero or more, or leave it blank.'
      }
      if (String(form.capturedSalePrice).trim() && (!Number.isFinite(Number(form.capturedSalePrice)) || Number(form.capturedSalePrice) <= 0)) nextErrors.capturedSalePrice = 'Enter a selling price greater than zero, or leave it blank until confirmed.'
      if (form.propertyMode === PROPERTY_MODE_PRIVATE) {
        if (!form.privateListingId) nextErrors.privateListingId = 'Select an active listing.'
      } else if (form.propertyMode === PROPERTY_MODE_DEVELOPMENT) {
        if (!form.developmentId) nextErrors.developmentId = 'Select a development.'
        if (!form.unitId) nextErrors.unitId = 'Select an available unit.'
      } else {
        if (!normalizeText(form.importPropertyAddress)) nextErrors.importPropertyAddress = 'Property address is required.'
        if (!normalizeText(form.importCurrentStage)) nextErrors.importCurrentStage = 'Current stage is required.'
      }
    }

    if (stepKey === 'client' && form.connectBuyerNow) {
      if (!partyDisplayName(buyerPartyProfile)) nextErrors.clientName = 'Buyer or entity name is required.'
      if (buyerPartyProfile.entityType === 'unknown') nextErrors.clientName = 'Confirm the buyer entity type.'
      if (!String(form.clientEmail || '').trim()) nextErrors.clientEmail = `${buyerCaptureLabels.email} is required.`
      if (!String(form.clientPhone || '').trim()) nextErrors.clientPhone = `${buyerCaptureLabels.phone} is required.`
    }

    if (stepKey === 'attorney' && isWizardBondFinance) {
      const bondAttorney = form.bondAttorneyNomination
      if (bondAttorney.mode === PARTNER_MODE_AGENCY && !bondAttorney.partnerId) nextErrors.bondAttorneyNomination = 'Select the bond attorney firm, or leave it as not appointed yet.'
      if (bondAttorney.mode === PARTNER_MODE_BUYER && (!String(bondAttorney.companyName || '').trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(bondAttorney.email || '').trim()))) nextErrors.bondAttorneyNomination = 'Capture the bond attorney firm and a valid invitation email, or leave it as not appointed yet.'
    }

    if (stepKey === 'attorney' && form.propertyMode !== PROPERTY_MODE_IMPORT) {
      const transferChoice = routingRecommendationChoices.transfer_attorney || ''
      const bondOriginatorChoice = routingRecommendationChoices.bond_originator || ''
      const cancellationAttorneyChoice = routingRecommendationChoices.cancellation_attorney || ''
      const transferRecommendation = routingRecommendationByRole.transfer_attorney || null
      const bondOriginatorRecommendation = routingRecommendationByRole.bond_originator || null
      const cancellationAttorneyRecommendation = routingRecommendationByRole.cancellation_attorney || null
      const cancellationAttorneyRequired = Boolean(
        form.hasExistingBondToCancel || cancellationAttorneyRecommendation?.required,
      )

      if (
        transferChoice !== 'confirm'
        && form.transferPartnerMode === PARTNER_MODE_AGENCY
      ) {
        if (!String(form.transferPreferredPartnerId || '').trim()) {
          nextErrors.transferPreferredPartnerId = 'Select a transfer attorney firm.'
        }
      }

      if (transferChoice !== 'confirm' && form.transferPartnerMode === PARTNER_MODE_BUYER) {
        if (!String(form.transferBuyerCompanyName || '').trim()) nextErrors.transferBuyerCompanyName = 'Attorney firm name is required.'
        if (!String(form.transferBuyerEmail || '').trim()) nextErrors.transferBuyerEmail = 'Firm contact email is required.'
      }

      if (
        shouldUseBondOriginator
        && bondOriginatorRecommendation?.required
        && bondOriginatorChoice !== 'confirm'
        && form.bondOriginatorMode === PARTNER_MODE_AGENCY
        && !String(form.bondOriginatorPreferredPartnerId || '').trim()
      ) {
        nextErrors.bondOriginatorPreferredPartnerId = 'Select a bond originator partner or change mode.'
      }

      if (shouldUseBondOriginator && bondOriginatorChoice !== 'confirm' && form.bondOriginatorMode === PARTNER_MODE_BUYER) {
        if (!String(form.bondOriginatorBuyerCompanyName || '').trim()) nextErrors.bondOriginatorBuyerCompanyName = 'Company name is required.'
        if (!String(form.bondOriginatorBuyerContactPerson || '').trim()) nextErrors.bondOriginatorBuyerContactPerson = 'Contact person is required.'
      }

      if (
        cancellationAttorneyRequired
        && cancellationAttorneyChoice !== 'confirm'
        && cancellationAttorneyChoice !== 'skip'
        && form.cancellationAttorneyMode === PARTNER_MODE_AGENCY
        && !String(form.cancellationAttorneyPreferredPartnerId || '').trim()
      ) {
        nextErrors.cancellationAttorneyPreferredPartnerId = 'Select a cancellation attorney partner or change mode.'
      }

      if (
        cancellationAttorneyChoice !== 'confirm'
        && cancellationAttorneyChoice !== 'skip'
        && form.cancellationAttorneyMode === PARTNER_MODE_BUYER
      ) {
        if (!String(form.cancellationAttorneyBuyerCompanyName || '').trim()) nextErrors.cancellationAttorneyBuyerCompanyName = 'Company name is required.'
        if (!String(form.cancellationAttorneyBuyerContactPerson || '').trim()) nextErrors.cancellationAttorneyBuyerContactPerson = 'Contact person is required.'
        if (!String(form.cancellationAttorneyBuyerEmail || '').trim()) nextErrors.cancellationAttorneyBuyerEmail = 'Email is required.'
        if (!String(form.cancellationAttorneyBuyerPhone || '').trim()) nextErrors.cancellationAttorneyBuyerPhone = 'Phone is required.'
      }

      if (
        transferRecommendation?.required
        && transferChoice !== 'confirm'
        && !String(form.transferPreferredPartnerId || form.transferBuyerCompanyName || '').trim()
      ) {
        nextErrors.transferPreferredPartnerId = 'Choose a transfer attorney firm or use the recommended route.'
      }
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  function goNext() {
    if (!validate(activeStep)) return
    const currentIndex = STEP_ORDER.indexOf(activeStep)
    if (currentIndex >= 0 && currentIndex < STEP_ORDER.length - 1) {
      setActiveStep(STEP_ORDER[currentIndex + 1])
    }
  }

  function goBack() {
    const currentIndex = STEP_ORDER.indexOf(activeStep)
    if (currentIndex > 0) {
      setActiveStep(STEP_ORDER[currentIndex - 1])
    }
  }

  function setRoutingRecommendationChoice(roleType, choice) {
    setRoutingRecommendationChoices((previous) => ({ ...previous, [roleType]: choice }))
    if (choice === 'manual') {
      setRoleSelectionTouched((previous) => ({ ...previous, [roleType]: true }))
      setActiveStep('attorney')
    }
  }

  function buildRolePlayerSelectionFromRecommendation(recommendation) {
    if (!recommendation?.targetOrganisationId) return null
    return {
      roleType: recommendation.roleType,
      source: 'partner_routing_rule',
      selectionSource: 'partner_routing_rule',
      assignmentStatus: recommendation.targetUserId ? 'assigned' : 'pending_assignment',
      partnerRelationshipId: recommendation.relationshipId || null,
      partnerOrganisationId: recommendation.targetOrganisationId || null,
      organisationId: recommendation.targetOrganisationId || null,
      userId: recommendation.targetUserId || null,
      regionId: recommendation.targetRegionId || null,
      branchId: recommendation.targetBranchId || null,
      teamId: recommendation.targetTeamId || null,
      routingRuleId: recommendation.routingRuleId || null,
      partner: {
        companyName: recommendation.targetOrganisationName || getRoutingRoleLabel(recommendation.roleType),
        contactPerson: recommendation.targetUserLabel || recommendation.targetOrganisationName || getRoutingRoleLabel(recommendation.roleType),
        email: recommendation.targetUserEmail || '',
        phone: recommendation.targetUserPhone || '',
        organisationId: recommendation.targetOrganisationId || null,
        partnerOrganisationId: recommendation.targetOrganisationId || null,
        userId: recommendation.targetUserId || null,
        regionId: recommendation.targetRegionId || null,
        branchId: recommendation.targetBranchId || null,
        teamId: recommendation.targetTeamId || null,
      },
    }
  }

  async function handleCreateDeal() {
    const validProperty = validate('property')
    const validClient = validate('client')
    const validAttorney = validate('attorney')
    if (!validProperty || !validClient || !validAttorney) {
      return
    }

    const privateListing = selectedPrivateListing
    const buyerConnected = Boolean(form.connectBuyerNow)
    const primaryBuyerOwner = buyerPartyProfile.people.find((person) => person.isOwner && person.primaryContact) || buyerPartyProfile.people.find((person) => person.isOwner)
    const buyerName = buyerConnected ? isNaturalParty(buyerPartyProfile.entityType) ? primaryBuyerOwner?.name || '' : partyDisplayName(buyerPartyProfile) : ''
    const propertyMode = form.propertyMode
    const financeType = normalizeFinanceTypeForApi(form.financeType)
    const bondFinance = financeType === 'bond' || financeType === 'combination'
    const financeManagedBy = bondFinance ? form.financeManagedBy || 'bond_originator' : 'client'
    const importAddressParts = [
      normalizeText(form.importPropertyAddress),
      normalizeText(form.importSuburb),
      normalizeText(form.importCity),
    ].filter(Boolean)
    const resolvedPropertyAddress =
      propertyMode === PROPERTY_MODE_IMPORT
        ? normalizeText(form.importPropertyAddress)
        : propertyMode === PROPERTY_MODE_PRIVATE
          ? getListingAddress(privateListing)
          : ''
    const resolvedCity =
      propertyMode === PROPERTY_MODE_IMPORT
        ? normalizeText(form.importCity || form.importSuburb || 'Not captured')
        : propertyMode === PROPERTY_MODE_PRIVATE
          ? getListingCity(privateListing) || 'Not captured'
          : ''
    const completeness = buildCompletenessSnapshot({ form, listing: privateListing, propertyMode, buyerPartyProfile, sellerPartyProfile, salePrice: inheritedDealTerms.salePrice })
    completeness.missingItems.push(...captureFinance.missing)
    const creationOrigin = getCreationOrigin(propertyMode)

    const transferSelection =
      form.transferPartnerMode === PARTNER_MODE_AGENCY
        ? {
            mode: PARTNER_MODE_AGENCY,
            partnerId: selectedTransferPartner?.id || null,
            partnerOrganisationId: selectedTransferPartner?.partnerOrganisationId || selectedTransferPartner?.organisationId || null,
            userId: null,
            preferredAttorneyUserId: selectedTransferPartnerPerson?.userId || selectedTransferPartner?.userId || null,
            selectedPerson: selectedTransferPartnerPerson || null,
            companyName: selectedTransferPartner?.companyName || '',
            contactPerson: selectedTransferPartner?.contactPerson || '',
            email: selectedTransferPartner?.email || '',
            phone: selectedTransferPartner?.phone || '',
            website: selectedTransferPartner?.website || '',
            physicalAddress: selectedTransferPartner?.physicalAddress || '',
            province: selectedTransferPartner?.province || '',
            notes: selectedTransferPartner?.notes || '',
          }
        : {
            mode: PARTNER_MODE_BUYER,
            partnerId: null,
            companyName: String(form.transferBuyerCompanyName || '').trim(),
            contactPerson: String(form.transferBuyerContactPerson || '').trim(),
            email: String(form.transferBuyerEmail || '').trim(),
            phone: String(form.transferBuyerPhone || '').trim(),
            website: '',
            physicalAddress: '',
            province: '',
            notes: String(form.transferBuyerNotes || '').trim(),
          }

    const bondOriginatorSelection =
      !shouldUseBondOriginator
        ? null
        : form.bondOriginatorMode === PARTNER_MODE_AGENCY
        ? {
            mode: PARTNER_MODE_AGENCY,
            partnerId: selectedBondOriginatorPartner?.id || null,
            partnerOrganisationId: selectedBondOriginatorPartner?.partnerOrganisationId || selectedBondOriginatorPartner?.organisationId || null,
            userId: selectedBondOriginatorPartnerPerson?.userId || selectedBondOriginatorPartner?.userId || null,
            selectedPerson: selectedBondOriginatorPartnerPerson || null,
            companyName: selectedBondOriginatorPartner?.companyName || '',
            contactPerson: selectedBondOriginatorPartner?.contactPerson || '',
            email: selectedBondOriginatorPartner?.email || '',
            phone: selectedBondOriginatorPartner?.phone || '',
            website: selectedBondOriginatorPartner?.website || '',
            physicalAddress: selectedBondOriginatorPartner?.physicalAddress || '',
            province: selectedBondOriginatorPartner?.province || '',
            notes: selectedBondOriginatorPartner?.notes || '',
          }
        : form.bondOriginatorMode === PARTNER_MODE_BUYER
          ? {
              mode: PARTNER_MODE_BUYER,
              partnerId: null,
              companyName: String(form.bondOriginatorBuyerCompanyName || '').trim(),
              contactPerson: String(form.bondOriginatorBuyerContactPerson || '').trim(),
              email: String(form.bondOriginatorBuyerEmail || '').trim(),
              phone: String(form.bondOriginatorBuyerPhone || '').trim(),
              website: '',
              physicalAddress: '',
              province: '',
              notes: String(form.bondOriginatorBuyerNotes || '').trim(),
            }
          : null

    const cancellationAttorneySelection =
      form.cancellationAttorneyMode === PARTNER_MODE_AGENCY
        ? {
            mode: PARTNER_MODE_AGENCY,
            partnerId: selectedCancellationAttorneyPartner?.id || null,
            partnerOrganisationId: selectedCancellationAttorneyPartner?.partnerOrganisationId || selectedCancellationAttorneyPartner?.organisationId || null,
            userId: null,
            preferredAttorneyUserId: selectedCancellationAttorneyPartnerPerson?.userId || selectedCancellationAttorneyPartner?.userId || null,
            selectedPerson: selectedCancellationAttorneyPartnerPerson || null,
            companyName: selectedCancellationAttorneyPartner?.companyName || '',
            contactPerson: selectedCancellationAttorneyPartner?.contactPerson || '',
            email: selectedCancellationAttorneyPartner?.email || '',
            phone: selectedCancellationAttorneyPartner?.phone || '',
            website: selectedCancellationAttorneyPartner?.website || '',
            physicalAddress: selectedCancellationAttorneyPartner?.physicalAddress || '',
            province: selectedCancellationAttorneyPartner?.province || '',
            notes: selectedCancellationAttorneyPartner?.notes || '',
          }
        : form.cancellationAttorneyMode === PARTNER_MODE_BUYER
          ? {
              mode: PARTNER_MODE_BUYER,
              partnerId: null,
              companyName: String(form.cancellationAttorneyBuyerCompanyName || '').trim(),
              contactPerson: String(form.cancellationAttorneyBuyerContactPerson || '').trim(),
              email: String(form.cancellationAttorneyBuyerEmail || '').trim(),
              phone: String(form.cancellationAttorneyBuyerPhone || '').trim(),
              website: '',
              physicalAddress: '',
              province: '',
              notes: String(form.cancellationAttorneyBuyerNotes || '').trim(),
            }
          : null

    const manualRolePlayers = {
      transfer_attorney: {
        roleType: 'transfer_attorney',
        source: transferSelection.mode === PARTNER_MODE_AGENCY ? 'agency_preferred' : 'seller_nomination',
        preferredPartnerId: transferSelection.partnerId || null,
        partnerOrganisationId: transferSelection.partnerOrganisationId || null,
        userId: null,
        firmFirstAllocation: Boolean(transferSelection.preferredAttorneyUserId),
        preferredAttorneyUserId: transferSelection.preferredAttorneyUserId || null,
        partner: transferSelection,
      },
      bond_originator: bondOriginatorSelection
        ? {
            roleType: 'bond_originator',
            source: bondOriginatorSelection.mode === PARTNER_MODE_AGENCY ? 'agency_preferred' : 'buyer_appointed',
            preferredPartnerId: bondOriginatorSelection.partnerId || null,
            partnerOrganisationId: bondOriginatorSelection.partnerOrganisationId || null,
            userId: bondOriginatorSelection.userId || null,
            partner: bondOriginatorSelection,
          }
        : null,
      cancellation_attorney: cancellationAttorneySelection
        ? {
            roleType: 'cancellation_attorney',
            source: cancellationAttorneySelection.mode === PARTNER_MODE_AGENCY ? 'agency_preferred' : 'manual',
            preferredPartnerId: cancellationAttorneySelection.partnerId || null,
            partnerOrganisationId: cancellationAttorneySelection.partnerOrganisationId || null,
            userId: null,
            firmFirstAllocation: Boolean(cancellationAttorneySelection.preferredAttorneyUserId),
            preferredAttorneyUserId: cancellationAttorneySelection.preferredAttorneyUserId || null,
            partner: cancellationAttorneySelection,
          }
        : null,
    }
    const resolvedRolePlayers = CORE_ROUTING_ROLE_TYPES.flatMap((roleType) => {
      const choice = routingRecommendationChoices[roleType] || ''
      const recommendation = routingRecommendationByRole[roleType] || null
      const manualSelection = manualRolePlayers[roleType] || null

      if (choice === 'skip') {
        return []
      }
      if (choice === 'manual') {
        return manualSelection ? [manualSelection] : []
      }
      if (choice === 'confirm' && recommendation && !recommendation.requiresManualSelection && !recommendation.notRequired) {
        const routedSelection = buildRolePlayerSelectionFromRecommendation(recommendation)
        return routedSelection ? [routedSelection] : []
      }
      if (recommendation && !recommendation.requiresManualSelection && !recommendation.notRequired) {
        const routedSelection = buildRolePlayerSelectionFromRecommendation(recommendation)
        return routedSelection ? [routedSelection] : []
      }
      if (manualSelection) {
        return [manualSelection]
      }
      return []
    })

    if (isWizardBondFinance && form.bondAttorneyNomination.mode !== 'none') {
      const nomination = form.bondAttorneyNomination
      const partner = nomination.mode === PARTNER_MODE_AGENCY
        ? findPartnerById(activePreferredPartners, nomination.partnerId) : nomination
      if (partner) resolvedRolePlayers.push({ roleType: 'bond_attorney', source: nomination.mode === PARTNER_MODE_AGENCY ? 'agency_preferred' : 'bank_nomination',
        preferredPartnerId: nomination.mode === PARTNER_MODE_AGENCY ? partner.id : null,
        partnerOrganisationId: partner.partnerOrganisationId || partner.organisationId || null,
        firmFirstAllocation: true, userId: null, partner })
    }
    const handoffPlan = splitTransactionCaptureRolePlayers(resolvedRolePlayers, { financeType, financeManagedBy, sellerBondStatus: form.sellerBondStatus })
    if (handoffPlan.missing.length) { setSaveError(handoffPlan.missing.join(' ')); return }

    const findResolvedRolePlayer = (roleType) => resolvedRolePlayers.find((item) => item.roleType === roleType) || null
    const resolveRolePlayerDisplay = (roleType, fallbackSelection = null) => {
      const choice = routingRecommendationChoices[roleType] || ''
      if (choice === 'skip') {
        return {
          label: '',
          email: '',
        }
      }
      const selected = findResolvedRolePlayer(roleType)
      if (!selected) {
        if (choice !== 'manual') {
          return {
            label: '',
            email: '',
          }
        }
        return {
          label: fallbackSelection?.companyName || fallbackSelection?.contactPerson || '',
          email: fallbackSelection?.email || '',
        }
      }
      const partner = selected.partner && typeof selected.partner === 'object' ? selected.partner : {}
      return {
        label: partner.companyName || partner.contactPerson || '',
        email: partner.email || '',
      }
    }

    const transferAttorneyDisplay = resolveRolePlayerDisplay('transfer_attorney', transferSelection)
    const bondOriginatorDisplay =
      financeManagedBy === 'bond_originator'
        ? resolveRolePlayerDisplay('bond_originator', bondOriginatorSelection)
        : { label: '', email: '' }
    const cancellationAttorneyDisplay = resolveRolePlayerDisplay('cancellation_attorney', cancellationAttorneySelection)
    const transferAttorneyLabel = transferAttorneyDisplay.label
    const bondOriginatorLabel = bondOriginatorDisplay.label
    const bondOriginatorEmail = bondOriginatorDisplay.email
    const cancellationAttorneyLabel = cancellationAttorneyDisplay.label
    const cancellationAttorneyEmail = cancellationAttorneyDisplay.email
    const hasExternallyAppointedRolePlayer = [transferSelection, bondOriginatorSelection, cancellationAttorneySelection]
      .filter(Boolean)
      .some((item) => item.mode === PARTNER_MODE_BUYER)
    const nextAction = transferAttorneyLabel
      ? 'Transfer attorney firm nominated. Awaiting firm acceptance and internal primary attorney assignment.'
      : hasExternallyAppointedRolePlayer
        ? 'Externally appointed role player captured. Validate assignment while onboarding proceeds.'
        : 'Finance details and bond requirements will be captured during client onboarding.'
    const handoffChecklist = buildHandoffChecklist()

    try {
      setSaving(true)
      setSaveError('')
      const resolvedCommissionSnapshot = await resolveCommissionSnapshotForAgent({
        assignedAgentUserId: String(profile?.id || '').trim(),
        assignedAgentEmail: String(profile?.email || '').trim(),
        salePrice: Number(inheritedDealTerms?.salePrice || 0),
        grossCommissionPercentage: Number(inheritedDealTerms?.grossCommissionPercentage || 0),
        overrideAgentSplitPercentage: normalizePercentageInput(salesAgentSplitOverride),
      })
      if (import.meta.env.DEV) {
        console.debug('[AgentNewDealWizard] createTransaction payload', {
          disableAutoPartnerRouting: true,
          rolePlayers: resolvedRolePlayers,
          financeType,
          hasExistingBondToCancel: Boolean(form.hasExistingBondToCancel),
        })
      }
      const result = await createTransactionFromWizard({
        setup: {
          transactionType: propertyMode === PROPERTY_MODE_DEVELOPMENT ? 'developer_sale' : 'private_property',
          propertyType:
            propertyMode === PROPERTY_MODE_DEVELOPMENT
              ? ''
              : propertyMode === PROPERTY_MODE_PRIVATE
              ? mapPrivateListingToTransactionPropertyCategory(privateListing)
              : 'residential',
          propertyTenure:
            propertyMode === PROPERTY_MODE_IMPORT
              ? form.importPropertyStructure
              : propertyMode === PROPERTY_MODE_PRIVATE
                ? privateListing?.propertyStructureType || privateListing?.property_structure_type || ''
                : '',
          developmentId: propertyMode === PROPERTY_MODE_DEVELOPMENT ? form.developmentId : '',
          unitId: propertyMode === PROPERTY_MODE_DEVELOPMENT ? form.unitId : '',
          propertyAddressLine1: resolvedPropertyAddress || importAddressParts.join(', '),
          propertyAddressLine2: propertyMode === PROPERTY_MODE_IMPORT
            ? [
                form.importSchemeName ? `Scheme / complex: ${form.importSchemeName}` : '',
                form.importUnitNumber ? `Unit / section: ${form.importUnitNumber}` : '',
                form.importDevelopmentName ? `Development: ${form.importDevelopmentName}` : '',
              ].filter(Boolean).join(' • ')
            : '',
          suburb: propertyMode === PROPERTY_MODE_IMPORT ? form.importSuburb : propertyMode === PROPERTY_MODE_PRIVATE ? privateListing?.propertyDetails?.suburb || privateListing?.suburb || '' : '',
          city: resolvedCity,
          province: propertyMode === PROPERTY_MODE_IMPORT ? form.importProvince : propertyMode === PROPERTY_MODE_PRIVATE ? privateListing?.propertyDetails?.province || privateListing?.province || '' : '',
          postalCode: '',
          propertyDescription: propertyMode === PROPERTY_MODE_IMPORT
            ? [
                form.importNotes,
                form.importSchemeName ? `Scheme / complex: ${form.importSchemeName}` : '',
                form.importUnitNumber ? `Unit / section: ${form.importUnitNumber}` : '',
                form.importDevelopmentName ? `Development: ${form.importDevelopmentName}` : '',
              ].filter(Boolean).join('\n')
            : propertyMode === PROPERTY_MODE_PRIVATE
              ? privateListing?.propertyDetails?.description || privateListing?.marketing?.description || ''
              : '',
          buyerFirstName: buyerConnected ? form.clientName : '',
          buyerLastName: buyerConnected ? form.clientSurname : '',
          buyerName,
          buyerPhone: buyerConnected ? form.clientPhone : '',
          buyerEmail: buyerConnected ? form.clientEmail : '',
          buyerParties: buyerConnected ? buildBuyerPartiesForPayload() : [],
          transactionParties,
          sellerName: partyDisplayName(sellerPartyProfile) || sellerPartyProfile.name,
          sellerPhone: sellerPartyProfile.people.find((person) => person.primaryContact)?.phone || '',
          sellerEmail: sellerPartyProfile.people.find((person) => person.primaryContact)?.email || '',
          salesPrice: inheritedDealTerms?.salePrice,
          financeType,
          purchaserType: form.purchaserType,
          saleDate: form.saleDate || todayIso(),
          assignedAgent: String(profile?.fullName || profile?.name || profile?.email || 'Agent').trim(),
          assignedAgentUserId: String(profile?.id || '').trim(),
          assignedAgentEmail: String(profile?.email || '').trim(),
          financeManagedBy,
        },
        finance: {
          cashAmount: form.cashAmount,
          bondAmount: form.bondAmount,
          depositAmount: form.depositAmount,
          reservationRequired: Boolean(form.reservationRequired),
          reservationAmount: form.reservationRequired ? form.reservationAmount : '',
          reservationAmountType: form.reservationRequired ? form.reservationAmountType : 'fixed',
          reservationTreatment: form.reservationRequired
            ? form.reservationTreatment
            : 'credited_to_purchase_price',
          reservationPayableTo: form.reservationRequired ? form.reservationPayableTo : 'developer',
          reservationStatus: form.reservationRequired ? 'pending' : 'not_required',
          alterationChargeTreatment:
            propertyMode === PROPERTY_MODE_DEVELOPMENT
              ? form.alterationChargeTreatment
              : 'included_in_purchase_price',
          attorney: transferAttorneyLabel,
          attorneyEmail: '',
          bondOriginator: bondOriginatorLabel,
          bondOriginatorEmail: handoffPlan.connected.some((item) => item.roleType === 'bond_originator') ? bondOriginatorEmail : '',
          bank: captureFinance.snapshot.bank,
          captureSnapshot: { ...captureFinance.snapshot, professionalNominations: [...handoffPlan.connected.map((item) => ({ roleType: item.roleType, connected: true, organisationId: item.partnerOrganisationId || item.organisationId || item.partner?.partnerOrganisationId || item.partner?.organisationId })), ...handoffPlan.invitations.map((item) => ({ ...item, connected: false }))] },
          cancellationAttorney: cancellationAttorneyLabel,
          cancellationAttorneyEmail,
        },
        status: {
          stage: form.capturedStage || (propertyMode === PROPERTY_MODE_IMPORT
            ? normalizeTransactionStage(form.importCurrentStage, AGENT_TRANSACTION_STAGE_OPTIONS[0])
            : propertyMode === PROPERTY_MODE_DEVELOPMENT && form.reservationRequired
              ? 'Reserved'
              : normalizeTransactionStage('Offer Accepted')),
          nextAction,
          notes: [
            hasExternallyAppointedRolePlayer ? 'Externally appointed role player captured for at least one assignment.' : '',
            cancellationAttorneyLabel ? `Cancellation attorney: ${cancellationAttorneyLabel}${cancellationAttorneyEmail ? ` (${cancellationAttorneyEmail})` : ''}` : '',
            form.hasExistingBondToCancel && !cancellationAttorneyLabel ? 'Existing bond cancellation attorney not assigned yet.' : '',
            form.importNotes ? `Import notes: ${form.importNotes}` : '',
            completeness.missingItems.length ? `Missing follow-up items: ${completeness.missingItems.join(', ')}` : '',
          ].filter(Boolean).join('\n'),
        },
        options: {
          allowIncomplete: true,
          buyerConnectionDeferred: !buyerConnected,
          deferFinanceType: !financeType,
          creationOrigin,
          preserveCapturedStage: Boolean(form.capturedStage || propertyMode === PROPERTY_MODE_IMPORT),
          handoffChecklist,
          sourceContext: {
            originLabel: getOriginLabel(propertyMode),
            branchId: normalizeText(currentMembership?.branchId || currentMembership?.branch_id),
            workspaceId: normalizeText(workspace?.id),
            organisationId: normalizeText(privateListing?.organisationId || workspace?.id),
            agentUserId: normalizeText(profile?.id),
            listingId: propertyMode === PROPERTY_MODE_PRIVATE ? normalizeText(privateListing?.id) : null,
            listingSource: propertyMode === PROPERTY_MODE_PRIVATE ? normalizeText(privateListing?.listingSource || privateListing?.marketing?.source) : null,
            mandateStatus: propertyMode === PROPERTY_MODE_PRIVATE ? normalizeText(privateListing?.mandateStatus || privateListing?.mandate_status) : null,
            commissionStructure: propertyMode === PROPERTY_MODE_IMPORT ? normalizeText(form.importCommissionStructure) : privateListing?.commission || null,
            importPropertyStructure: propertyMode === PROPERTY_MODE_IMPORT ? normalizeText(form.importPropertyStructure) : null,
            importSchemeName: propertyMode === PROPERTY_MODE_IMPORT ? normalizeText(form.importSchemeName) : null,
            importUnitNumber: propertyMode === PROPERTY_MODE_IMPORT ? normalizeText(form.importUnitNumber) : null,
            importDevelopmentName: propertyMode === PROPERTY_MODE_IMPORT ? normalizeText(form.importDevelopmentName) : null,
            developmentId: propertyMode === PROPERTY_MODE_DEVELOPMENT ? normalizeText(form.developmentId) : null,
            unitId: propertyMode === PROPERTY_MODE_DEVELOPMENT ? normalizeText(form.unitId) : null,
            unitStatus: propertyMode === PROPERTY_MODE_DEVELOPMENT ? normalizeText(selectedUnit?.status) : null,
            importedProperty24Link: propertyMode === PROPERTY_MODE_IMPORT ? normalizeText(form.importProperty24Link) : null,
          },
          completeness,
          canonicalStructure: CANONICAL_TRANSACTION_STRUCTURE,
          rolePlayers: [
            ...handoffPlan.connected.filter((item) => item.roleType !== 'bond_originator' || financeManagedBy === 'bond_originator'),
          ],
          disableAutoPartnerRouting: true,
          commissionSnapshot: resolvedCommissionSnapshot,
        },
      })

      if (form.propertyMode === PROPERTY_MODE_PRIVATE && privateListing) {
        const rows = readAgentPrivateListings().map((listing) =>
          String(listing.id) === String(privateListing.id)
            ? {
                ...listing,
                status: 'in_progress',
                activeDeal: {
                  transactionId: result?.transactionId || null,
                  buyerName,
                  createdAt: new Date().toISOString(),
                },
                attorneyChangeRequest: transferSelection.mode === PARTNER_MODE_BUYER
                  ? {
                      status: 'requested',
                      requestedAt: new Date().toISOString(),
                      requestedAttorney: {
                        name: transferSelection.contactPerson || transferSelection.companyName,
                        firm: transferSelection.companyName,
                        email: transferSelection.email,
                        phone: transferSelection.phone,
                        notes: transferSelection.notes,
                      },
                      defaultAttorney: {
                        name: selectedTransferPartner?.companyName || selectedTransferPartner?.contactPerson || '',
                        email: selectedTransferPartner?.email || '',
                      },
                    }
                  : null,
              }
            : listing,
        )
        writeAgentPrivateListings(rows)
      }

      const buyerDocumentsPortal = resolveBuyerDocumentsPortal(result)

      setCreatedDeal({
        ...result,
        buyerDocumentsUrl: buyerDocumentsPortal.url,
        attorneyChangeRequested: transferSelection.mode === PARTNER_MODE_BUYER,
        externalRolePlayerCaptured: hasExternallyAppointedRolePlayer,
        handoffChecklist,
        captureProfessionalNominations: handoffPlan.invitations,
      })
      await uploadCapturedDocuments(result.transactionId)
      setCaptureInvitations(await ensureTransactionCaptureInvitations({ transactionId: result.transactionId, nominations: handoffPlan.invitations }))
      window.dispatchEvent(new Event('itg:listings-updated'))
      window.dispatchEvent(new Event('itg:transaction-created'))
      onSaved?.(result)
    } catch (error) {
      if (error?.transactionId) {
        setCreatedDeal({ transactionId: error.transactionId, setupIncomplete: true, setupPending: true, setupWarnings: [{ area: 'transaction_setup', message: 'The transaction exists but setup needs attention. Open it to complete setup before uploading documents.' }] })
      }
      setSaveError(error?.message || 'Unable to create transaction.')
    } finally {
      setSaving(false)
    }
  }

  async function uploadCapturedDocuments(transactionId) {
    if (!captureDocuments.some((entry) => entry.status !== 'saved')) return
    let requirements = []
    try {
      const grouped = await fetchTransactionDocumentRequirementsByTransactionIds({ transactionIds: [transactionId] })
      requirements = grouped[transactionId] || []
    } catch {
      // Evidence can still be safely saved without guessing a checklist owner.
    }
    await saveTransactionCaptureDocuments({ transactionId, entries: captureDocuments, requirements, upload: uploadDocument,
      onEntry: (entry) => setCaptureDocuments((current) => current.map((item) => item.id === entry.id ? entry : item)),
    })
  }

  async function retryCaptureUploads() {
    setSaving(true)
    try { await uploadCapturedDocuments(createdDeal.transactionId) }
    finally { setSaving(false) }
  }

  async function retryCaptureInvitations() {
    setSaving(true)
    try { setCaptureInvitations(await ensureTransactionCaptureInvitations({ transactionId: createdDeal.transactionId, nominations: createdDeal.captureProfessionalNominations || [] })) }
    finally { setSaving(false) }
  }

  const footer = createdDeal ? (
    <div className="flex items-center justify-between">
      <Button variant="ghost" onClick={onClose} disabled={saving}>Done</Button>
      <Button
        disabled={saving}
        onClick={() => {
          const searchValue = createdDeal.transactionReference || createdDeal.reference || createdDeal.transactionId
          const query = searchValue ? `?search=${encodeURIComponent(searchValue)}` : ''
          navigate(`/transactions${query}`)
        }}
      >
        Open Transaction
      </Button>
    </div>
  ) : (
    <div className="flex items-center justify-between">
      <Button variant="ghost" onClick={activeStep === 'property' ? onClose : goBack} disabled={saving}>
        {activeStep === 'property' ? 'Cancel' : 'Back'}
      </Button>
      {activeStep === 'review' ? (
        <Button onClick={handleCreateDeal} disabled={saving || loading}>
          Create Transaction
        </Button>
      ) : (
        <Button onClick={goNext} disabled={saving || loading}>
          Continue
        </Button>
      )}
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title="Create Transaction"
      subtitle="Create a transaction from an active listing, development unit, or imported deal."
      className="max-w-[1040px]"
      footer={footer}
    >
      <div className="space-y-5">
        {saveError ? (
          <div className="rounded-[18px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm font-medium text-[#b42318]">{saveError}</div>
        ) : null}

        <section className="grid gap-3 lg:grid-cols-5">
          {STEP_ORDER.map((stepKey, index) => (
            <StepChip
              key={stepKey}
              index={index}
              title={
                stepKey === 'property'
                  ? 'Select Listing'
                  : stepKey === 'client'
                    ? 'Buyer & Seller'
                    : stepKey === 'documents'
                      ? 'Existing Documents'
                    : stepKey === 'attorney'
                      ? 'Transaction Roles'
                      : 'Review & Create Transaction'
              }
              active={stepKey === activeStep}
            />
          ))}
        </section>

        {!createdDeal ? (
          <>
            {activeStep === 'property' ? (
              <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                <div className="mb-5 rounded-[18px] border border-[#d8e5f2] bg-[#f7fbff] px-4 py-3">
                  <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#52708d]">
                    Transaction property
                  </span>
                  <p className="mt-1 text-sm leading-6 text-[#48627f]">
                    Use an existing property where it is available, or capture an address first and complete the listing, FICA, OTP, and contact information later.
                  </p>
                </div>

                <div className="mb-5 grid gap-3 md:grid-cols-3">
                  {[
                    { value: PROPERTY_MODE_PRIVATE, label: 'Existing listing', detail: 'Link the transaction to a property already on Arch9.' },
                    { value: PROPERTY_MODE_IMPORT, label: 'Quick address capture', detail: 'Fast capture for an OTP or historical deal when no listing exists yet.' },
                    { value: PROPERTY_MODE_DEVELOPMENT, label: 'Existing development unit', detail: 'Use a unit that is already set up in the development catalogue.' },
                  ].map((option) => {
                    const selected = form.propertyMode === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updatePropertyMode(option.value)}
                        className={`rounded-[16px] border p-4 text-left transition ${selected ? 'border-[#1f4f78] bg-[#edf4fb] shadow-[0_10px_24px_rgba(31,79,120,0.08)]' : 'border-[#dce6f2] bg-white hover:border-[#b9cadc]'}`}
                      >
                        <span className="block text-sm font-semibold text-[#22374d]">{option.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-[#60758d]">{option.detail}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {form.propertyMode === PROPERTY_MODE_PRIVATE ? (
                    <Field label="Active Listing" error={errors.privateListingId} fullWidth>
                      <select
                        className={fieldClass()}
                        value={form.privateListingId}
                        onChange={(event) => updateField('privateListingId', event.target.value)}
                        disabled={isLoadingPropertyOptions}
                      >
                        <option value="">
                          {isLoadingPropertyOptions
                            ? 'Loading properties...'
                            : propertyPickerListings.length
                              ? 'Select active listing'
                              : propertyOptionsError
                                ? 'Unable to load properties'
                                : 'No eligible properties found'}
                        </option>
                        {!isLoadingPropertyOptions &&
                          !propertyOptionsError &&
                          propertyPickerListings.map((listing) => (
                            <option key={listing.id} value={listing.id}>
                              {formatListingDealOption(listing)}
                            </option>
                          ))}
                      </select>
                      {propertyOptionsError ? (
                        <p className="mt-1 text-xs text-[#b42318]">
                          Could not load properties. Try again.
                          <button
                            type="button"
                            className="ml-1 inline-flex rounded-sm text-[#1f4f78] underline"
                            onClick={() => loadPropertyPickerListings()}
                            disabled={isLoadingPropertyOptions}
                          >
                            Retry
                          </button>
                        </p>
                      ) : null}
                      {!propertyOptionsError && isLoadingPropertyOptions ? (
                        <small className="mt-1 block text-xs text-[#6b7d93]">Refreshing properties...</small>
                      ) : null}
                      {selectedPrivateListing && getListingMandateWarning(selectedPrivateListing) ? (
                        <span className="mt-2 block rounded-[12px] border border-[#f0d7a7] bg-[#fff8ea] px-3 py-2 text-xs font-semibold text-[#8a5b16]">
                          {getListingMandateWarning(selectedPrivateListing)}
                        </span>
                      ) : null}
                      {!isLoadingPropertyOptions && !propertyPickerListings.length && !propertyOptionsError ? (
                        <small className="mt-2 block text-xs text-[#6b7d93]">Create a listing with a signed mandate before creating a transaction.</small>
                      ) : null}
                    </Field>
                  ) : form.propertyMode === PROPERTY_MODE_DEVELOPMENT ? (
                    <>
                      <Field label="Assigned Development" error={errors.developmentId}>
                        <select className={fieldClass()} value={form.developmentId} onChange={(event) => updateField('developmentId', event.target.value)}>
                          <option value="">Select development</option>
                          {developments.map((development) => (
                            <option key={development.id} value={development.id}>{development.name}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Available Unit" error={errors.unitId}>
                        <select className={fieldClass()} value={form.unitId} onChange={(event) => updateField('unitId', event.target.value)} disabled={!form.developmentId}>
                          <option value="">{form.developmentId ? 'Select unit' : 'Select development first'}</option>
                          {developmentUnits.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              Unit {unit.unit_number}{unit.phase ? ` • ${unit.phase}` : ''} • {formatCurrency(unit.price)}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </>
                  ) : (
                    <>
                      <div className="md:col-span-2 rounded-[14px] border border-[#d8e5f2] bg-[#fbfdff] px-4 py-3 text-sm leading-6 text-[#48627f]">
                        Only the address and current transaction stage are required. This creates an address-first transaction; it does not publish a listing or pretend that documents have been uploaded.
                      </div>
                      <Field label="Property Structure" fullWidth>
                        <select className={fieldClass()} value={form.importPropertyStructure} onChange={(event) => updateField('importPropertyStructure', event.target.value)}>
                          {QUICK_CAPTURE_STRUCTURE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Property Address" error={errors.importPropertyAddress} fullWidth>
                        <input className={fieldClass()} value={form.importPropertyAddress} onChange={(event) => updateField('importPropertyAddress', event.target.value)} />
                      </Field>
                      {form.importPropertyStructure === 'sectional_title' || form.importPropertyStructure === 'share_block' ? (
                        <>
                          <Field label="Scheme / Complex Name" hint="Capture if known; it can be completed later.">
                            <input className={fieldClass()} value={form.importSchemeName} onChange={(event) => updateField('importSchemeName', event.target.value)} />
                          </Field>
                          <Field label="Unit / Section Number" hint="Capture if known; it can be completed later.">
                            <input className={fieldClass()} value={form.importUnitNumber} onChange={(event) => updateField('importUnitNumber', event.target.value)} />
                          </Field>
                        </>
                      ) : null}
                      {form.importPropertyStructure === 'estate' ? (
                        <>
                          <Field label="Development / Estate Name" hint="For an unconfigured development, this is kept with the transaction until it can be linked later.">
                            <input className={fieldClass()} value={form.importDevelopmentName} onChange={(event) => updateField('importDevelopmentName', event.target.value)} />
                          </Field>
                          <Field label="Unit / Erf Number" hint="Capture if known; it can be completed later.">
                            <input className={fieldClass()} value={form.importUnitNumber} onChange={(event) => updateField('importUnitNumber', event.target.value)} />
                          </Field>
                        </>
                      ) : null}
                      <Field label="Suburb">
                        <input className={fieldClass()} value={form.importSuburb} onChange={(event) => updateField('importSuburb', event.target.value)} />
                      </Field>
                      <Field label="City">
                        <input className={fieldClass()} value={form.importCity} onChange={(event) => updateField('importCity', event.target.value)} />
                      </Field>
                      <Field label="Province">
                        <input className={fieldClass()} value={form.importProvince} onChange={(event) => updateField('importProvince', event.target.value)} />
                      </Field>
                      <Field label="Seller Name" hint="Optional — add it now only if it is on hand.">
                        <input className={fieldClass()} value={form.importSellerName} onChange={(event) => updateField('importSellerName', event.target.value)} />
                      </Field>
                      <Field label="Seller Email" hint="Optional — required later for seller communication.">
                        <input className={fieldClass()} type="email" value={form.importSellerEmail} onChange={(event) => updateField('importSellerEmail', event.target.value)} />
                      </Field>
                      <Field label="Seller Phone" hint="Optional — required later for seller communication.">
                        <input className={fieldClass()} value={form.importSellerPhone} onChange={(event) => updateField('importSellerPhone', normalizePhoneInput(event.target.value))} />
                      </Field>
                      <Field label="Property24 Link">
                        <input className={fieldClass()} value={form.importProperty24Link} onChange={(event) => updateField('importProperty24Link', event.target.value)} />
                      </Field>
                      <Field label="Commission Structure" fullWidth>
                        <input className={fieldClass()} value={form.importCommissionStructure} onChange={(event) => updateField('importCommissionStructure', event.target.value)} />
                      </Field>
                      <Field label="Notes" fullWidth>
                        <textarea className={fieldClass()} rows={3} value={form.importNotes} onChange={(event) => updateField('importNotes', event.target.value)} />
                      </Field>
                    </>
                  )}
                </div>
                  <div className="mt-4">
                    <Field label="Current Stage" error={errors.importCurrentStage}>
                      <select className={fieldClass()} value={form.propertyMode === PROPERTY_MODE_IMPORT ? form.importCurrentStage : form.capturedStage || (form.propertyMode === PROPERTY_MODE_DEVELOPMENT && form.reservationRequired ? 'Reserved' : 'Offer Accepted')} onChange={(event) => updateField(form.propertyMode === PROPERTY_MODE_IMPORT ? 'importCurrentStage' : 'capturedStage', event.target.value)}>
                        {AGENT_TRANSACTION_STAGE_OPTIONS.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Field label="Agreed Selling Price (R)" error={errors.capturedSalePrice} hint="Uses the listing or unit price until changed. Leave blank if not yet confirmed.">
                      <input className={fieldClass()} type="number" min="0.01" step="0.01" value={form.capturedSalePrice || inheritedDealTerms.salePrice || ''} onChange={(event) => updateField('capturedSalePrice', event.target.value)} />
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Field label="Sale Date" hint="Use the actual agreement date when backfilling a transaction.">
                      <input className={fieldClass()} type="date" value={form.saleDate} onChange={(event) => updateField('saleDate', event.target.value)} />
                    </Field>
                  </div>
                  {form.propertyMode === PROPERTY_MODE_PRIVATE && selectedPrivateListing ? (
                    <div className="mt-4 rounded-[14px] border border-[#d8e5f2] bg-[#f7fbff] px-4 py-3 text-sm text-[#48627f]">
                      <p className="font-semibold text-[#22374d]">Seller from this listing</p>
                      <p className="mt-1">
                        {getListingSeller(selectedPrivateListing).name || 'Seller name not captured'}
                        {getListingSeller(selectedPrivateListing).email || getListingSeller(selectedPrivateListing).phone
                          ? ` • ${[getListingSeller(selectedPrivateListing).email, getListingSeller(selectedPrivateListing).phone].filter(Boolean).join(' • ')}`
                          : ''}
                      </p>
                    </div>
                  ) : null}
                  <div className="mt-4 rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] px-4 py-3 text-sm text-[#5f748c]">
                  <p className="font-semibold text-[#22374d]">Captured deal terms</p>
                  <p className="mt-1">
                    {inheritedDealTerms.salePrice ? `Selling price: ${formatCurrency(inheritedDealTerms.salePrice)}` : 'Selling price not captured yet.'}
                  </p>
                  <p className="mt-1">
                    {inheritedDealTerms.grossCommissionPercentage !== null
                      ? `Commission: ${Number(inheritedDealTerms.grossCommissionPercentage).toFixed(2).replace(/\.00$/, '')}%`
                      : 'Commission terms not captured yet.'}
                  </p>
                  <label className="mt-3 grid gap-2">
                    <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Sales agent split %</span>
                    <input
                      className={fieldClass()}
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={salesAgentSplitOverride}
                      disabled={commissionPreview?.allowSalesCommissionOverride === false}
                      onChange={(event) => setSalesAgentSplitOverride(event.target.value)}
                    />
                  </label>
                  {commissionPreview?.allowSalesCommissionOverride === false ? (
                    <p className="mt-2 text-xs font-medium text-[#8a5a12]">This agent's sales split is locked to the assigned commission structure.</p>
                  ) : (
                    <p className="mt-2 text-xs text-[#6f8298]">Defaults from the assigned sales commission structure; edit here for this transaction.</p>
                  )}
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <Field label="Finance Route">
                      <select className={fieldClass()} value={form.financeType} onChange={(event) => handleFinanceTypeChange(event.target.value)}>
                        {FINANCE_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Seller Existing Bond">
                      <select className={fieldClass()} value={form.sellerBondStatus} onChange={(event) => updateField('sellerBondStatus', event.target.value)}>
                        <option value="unknown">Not confirmed</option><option value="no">No bond to cancel</option><option value="yes">Existing bond to cancel</option>
                      </select>
                    </Field>
                    {form.sellerBondStatus === 'yes' ? <>
                      <Field label="Seller Bond Bank"><input className={fieldClass()} value={form.sellerBondBank} onChange={(event) => updateField('sellerBondBank', event.target.value)} /></Field>
                      <Field label="Seller Bond Reference"><input className={fieldClass()} value={form.sellerBondReference} onChange={(event) => updateField('sellerBondReference', event.target.value)} /></Field>
                    </> : null}
                    {includesWizardCashFinance ? (
                      <Field label={normalizedWizardFinanceType === 'combination' ? 'Cash Portion' : 'Cash Amount'} error={errors.cashAmount} hint="Include the deposit in the cash portion.">
                        <input
                          className={fieldClass()}
                          type="number"
                          min="0"
                          step="1000"
                          value={form.cashAmount}
                          onChange={(event) => updateField('cashAmount', event.target.value)}
                          placeholder="Amount buyer will settle in cash"
                        />
                      </Field>
                    ) : null}
                    {isWizardBondFinance ? (
                      <Field label={normalizedWizardFinanceType === 'combination' ? 'Bond Portion' : 'Bond Amount'} error={errors.bondAmount}>
                        <input
                          className={fieldClass()}
                          type="number"
                          min="0"
                          step="1000"
                          value={form.bondAmount}
                          onChange={(event) => updateField('bondAmount', event.target.value)}
                          placeholder="Expected bond amount"
                        />
                      </Field>
                    ) : null}
                    <Field label="Deposit Amount" error={errors.depositAmount}>
                      <input
                        className={fieldClass()}
                        type="number"
                        min="0"
                        step="1000"
                        value={form.depositAmount}
                        onChange={(event) => updateField('depositAmount', event.target.value)}
                        placeholder="OTP deposit amount, if applicable"
                      />
                    </Field>
                    {isWizardBondFinance ? <>
                      <Field label="Buyer Bond Bank"><input className={fieldClass()} value={form.financeBank} onChange={(event) => updateField('financeBank', event.target.value)} placeholder="Bank name, if known" /></Field>
                      <Field label="Bond Application Position"><select className={fieldClass()} value={form.bondStatus} onChange={(event) => updateField('bondStatus', event.target.value)}>{CAPTURE_BOND_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                    </> : null}
                    {isWizardBondFinance ? (
                      <Field label="Bond Route">
                        <select className={fieldClass()} value={form.financeManagedBy} onChange={(event) => updateField('financeManagedBy', event.target.value)}>
                          {FINANCE_MANAGED_BY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </Field>
                    ) : (
                      <div className="rounded-[14px] border border-[#d8eadf] bg-[#eef8f2] px-4 py-3 text-sm leading-6 text-[#355e49] md:col-span-2">
                        {form.financeType === 'unknown' ? 'Finance is unconfirmed. Complete it later; no bond professionals will be routed yet.' : 'Cash route selected. No buyer bond professionals are needed. A seller bond may still require cancellation.'}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            ) : null}

            {activeStep === 'property' && captureFinance.missing.length ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm" aria-label="Finance follow-up"><p className="font-medium">Finance details to confirm</p><ul className="mt-2 list-disc pl-5">{captureFinance.missing.map((item) => <li key={item}>{item}</li>)}</ul><p className="mt-2">You can save now and complete these details later. A reported approval does not verify the bank's approval or release an instruction.</p></section> : null}
            {activeStep === 'client' ? (
              <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                <div className="mb-5 rounded-[18px] border border-[#d8e5f2] bg-[#f7fbff] p-4">
                  <p className="font-semibold text-[#22374d]">Connect a buyer now?</p>
                  <p className="mt-1 text-sm leading-6 text-[#60758d]">You can attach an existing lead or capture a buyer now. Choose no to create the transaction and add the buyer later.</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#22374d]">
                      <input type="radio" name="connect-buyer-now" checked={form.connectBuyerNow} onChange={() => updateField('connectBuyerNow', true)} />
                      Yes, connect buyer
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#22374d]">
                      <input type="radio" name="connect-buyer-now" checked={!form.connectBuyerNow} onChange={() => updateField('connectBuyerNow', false)} />
                      No, add buyer later
                    </label>
                  </div>
                </div>
                {form.connectBuyerNow ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Select From Pipeline" hint="Optional: pull through an existing lead and then edit as needed." fullWidth>
                    <select className={fieldClass()} value={form.pipelineLeadId} onChange={(event) => updateField('pipelineLeadId', event.target.value)}>
                      <option value="">Select existing lead</option>
                      {pipelineRows.map((lead) => (
                        <option key={lead.id} value={lead.id}>
                          {lead.name || 'Unnamed lead'} • {lead.source || 'No source'} • {lead.email || lead.phone || 'No contact'}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <div className="md:col-span-2">
                    <TransactionPartyCapture side="Buyer" value={buyerPartyProfile} onChange={updateBuyerPartyProfile} />
                    {['clientName', 'clientSurname', 'clientEmail', 'clientPhone'].filter((key) => errors[key]).map((key) => <p key={key} className="mt-2 text-sm text-red-700" role="alert">{errors[key]}</p>)}
                  </div>
                </div>
                ) : (
                  <p className="rounded-[16px] border border-dashed border-[#d6e1ee] bg-white px-4 py-4 text-sm leading-6 text-[#60758d]">
                    This transaction will be created without a buyer connection. The selected listing and its seller will remain attached, and buyer onboarding can be completed from the transaction workspace.
                  </p>
                )}
              </section>
            ) : null}

            {activeStep === 'client' ? <>
              {sellerLeadRows.length ? <Field label="Use Existing Seller Lead" hint="Optional: copies the contact details so you can confirm their entity and people.">
                <select className={fieldClass()} value={form.sellerLeadId || ''} onChange={(event) => updateField('sellerLeadId', event.target.value)}>
                  <option value="">Keep captured seller</option>
                  {sellerLeadRows.map((lead) => <option key={lead.id} value={lead.id}>{lead.name} • {lead.email || lead.phone || 'No contact details'}</option>)}
                </select>
              </Field> : null}
              <TransactionPartyCapture side="Seller" value={sellerPartyProfile} onChange={(value) => updateField('sellerPartyProfile', value)} />
              <TransactionPartyDocumentPreview parties={transactionParties} financeType={form.financeType} sellerHasExistingBond={form.sellerBondStatus === 'yes'} />
            </> : null}

            {activeStep === 'documents' ? (
              <TransactionCaptureDocuments parties={transactionParties} financeType={form.financeType} sellerHasExistingBond={form.sellerBondStatus === 'yes'} entries={captureDocuments} onChange={setCaptureDocuments} />
            ) : null}
            {activeStep === 'attorney' ? (
              <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                <div className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] px-4 py-4">
                  <p className="text-[0.82rem] font-semibold uppercase tracking-[0.08em] text-[#6f8298]">Transaction Roles</p>
                  <p className="mt-1 text-sm text-[#5f748c]">
                    Nominate the transfer attorney firm. The firm accepts the instruction and assigns its own primary attorney after creation.
                  </p>
                </div>

                <div className="mt-4 grid gap-4">
                  <article className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-sm text-[#22374d]">Transfer Attorney Firm</strong>
                      <span className="rounded-full border border-[#dce6f2] bg-white px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#5f748c]">
                        Required
                      </span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Selection Mode">
                        <select className={fieldClass()} value={form.transferPartnerMode} onChange={(event) => updateField('transferPartnerMode', event.target.value)}>
                          {TRANSFER_FIRM_MODE_OPTIONS.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {form.transferPartnerMode === PARTNER_MODE_AGENCY ? (
                        <Field label="Search Partners">
                          <input
                            className={fieldClass()}
                            value={partnerSearch.transferAttorney}
                            onChange={(event) => updatePartnerSearchField('transferAttorney', event.target.value)}
                            placeholder="Search company, contact, or email"
                          />
                        </Field>
                      ) : null}
                    </div>

                    {form.transferPartnerMode === PARTNER_MODE_AGENCY ? (
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <Field label="Agency Preferred Transfer Firm" error={errors.transferPreferredPartnerId}>
                          <select className={fieldClass()} value={form.transferPreferredPartnerId} onChange={(event) => updateField('transferPreferredPartnerId', event.target.value)}>
                            <option value="">Select transfer attorney firm</option>
                            {preferredPartnersLoading ? (
                              <option disabled>Loading preferred transfer attorneys...</option>
                            ) : preferredPartnersError ? (
                              <option disabled>Could not load agency preferred partners</option>
                            ) : transferAttorneyOptions.length ? (
                              transferAttorneyOptions.map((partner) => (
                                <option key={partner.id} value={partner.id}>
                                  {partner.companyName} • {partner.contactPerson || 'Preferred contact pending'} • {partner.email || 'No email'}
                                </option>
                              ))
                            ) : (
                              <option disabled>No preferred transfer attorneys found</option>
                            )}
                          </select>
                        </Field>
                        <Field label="Preferred Attorney">
                          <select
                            className={fieldClass()}
                            value={form.transferPreferredPartnerPersonId || selectedTransferPartner?.userId || ''}
                            onChange={(event) => updateField('transferPreferredPartnerPersonId', event.target.value)}
                            disabled={!selectedTransferPartner || loadingPartnerPeople.transfer_attorney}
                          >
                            <option value="">
                              {selectedTransferPartner ? 'Firm will assign internally' : 'Select transfer attorney firm first'}
                            </option>
                            {partnerPersonOptions.transfer_attorney.map((person) => (
                              <option key={person.userId} value={person.userId}>
                                {person.name}{person.detail ? ` • ${person.detail}` : ''}
                              </option>
                            ))}
                          </select>
                          {loadingPartnerPeople.transfer_attorney ? (
                            <p className="mt-1 text-xs text-[#6f8298]">Loading attorneys...</p>
                          ) : partnerPeopleMessages.transfer_attorney ? (
                            <p className="mt-1 text-xs text-[#6f8298]">{partnerPeopleMessages.transfer_attorney}</p>
                          ) : null}
                        </Field>
                        <div className="rounded-[14px] border border-[#dce6f2] bg-white px-4 py-3 text-sm text-[#5f748c]">
                          {selectedTransferPartner ? (
                            <>
                              <p className="font-semibold text-[#22374d]">{selectedTransferPartner.companyName}</p>
                              <p className="mt-1">Preferred contact: {selectedTransferPartner.contactPerson || 'None captured'}</p>
                              <p className="mt-1">{selectedTransferPartner.email || 'No email'} • {selectedTransferPartner.phone || 'No phone'}</p>
                              <p className="mt-2 text-xs font-medium text-[#6f8298]">
                                {selectedTransferPartnerPerson
                                  ? `Matter will go to the firm with ${selectedTransferPartnerPerson.name} marked as preferred attorney.`
                                  : 'Matter will go to the firm queue for internal allocation.'}
                              </p>
                            </>
                          ) : (
                            <p>Select the attorney firm that should receive the transfer instruction.</p>
                          )}
                          {preferredPartnersError ? (
                            <p className="mt-1 text-[#b42318]">Could not load agency preferred partners. Try refreshing the page.</p>
                          ) : null}
                          {!transferAttorneyOptions.length && !preferredPartnersLoading && !preferredPartnersError ? (
                            <p className="mt-1">
                              Add one in Organisation → Partners.
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <Field label="Seller-Appointed Firm" error={errors.transferBuyerCompanyName}>
                          <input className={fieldClass()} value={form.transferBuyerCompanyName} onChange={(event) => updateField('transferBuyerCompanyName', event.target.value)} />
                        </Field>
                        <Field label="Preferred Contact (Optional)" error={errors.transferBuyerContactPerson}>
                          <input className={fieldClass()} value={form.transferBuyerContactPerson} onChange={(event) => updateField('transferBuyerContactPerson', event.target.value)} />
                        </Field>
                        <Field label="Email" error={errors.transferBuyerEmail}>
                          <input className={fieldClass()} type="email" value={form.transferBuyerEmail} onChange={(event) => updateField('transferBuyerEmail', event.target.value)} />
                        </Field>
                        <Field label="Phone" error={errors.transferBuyerPhone}>
                          <input className={fieldClass()} value={form.transferBuyerPhone} onChange={(event) => updateField('transferBuyerPhone', normalizePhoneInput(event.target.value))} />
                        </Field>
                        <Field label="Notes" fullWidth>
                          <textarea className={fieldClass()} rows={3} value={form.transferBuyerNotes} onChange={(event) => updateField('transferBuyerNotes', event.target.value)} />
                        </Field>
                      </div>
                    )}
                  </article>

                  {shouldUseBondOriginator ? (
                  <article className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-sm text-[#22374d]">Bond Originator</strong>
                      <span className="rounded-full border border-[#dce6f2] bg-white px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#5f748c]">
                        Optional
                      </span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Selection Mode">
                        <select className={fieldClass()} value={form.bondOriginatorMode} onChange={(event) => updateField('bondOriginatorMode', event.target.value)}>
                          {OPTIONAL_PARTNER_ROLE_FIELD_OPTIONS.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {form.bondOriginatorMode === PARTNER_MODE_AGENCY ? (
                        <Field label="Search Partners">
                          <input
                            className={fieldClass()}
                            value={partnerSearch.bondOriginator}
                            onChange={(event) => updatePartnerSearchField('bondOriginator', event.target.value)}
                            placeholder="Search company, contact, or email"
                          />
                        </Field>
                      ) : null}
                    </div>
                    {form.bondOriginatorMode === PARTNER_MODE_AGENCY ? (
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <Field label="Agency Preferred Bond Originator" error={errors.bondOriginatorPreferredPartnerId}>
                          <select className={fieldClass()} value={form.bondOriginatorPreferredPartnerId} onChange={(event) => updateField('bondOriginatorPreferredPartnerId', event.target.value)}>
                            <option value="">Select bond originator</option>
                            {preferredPartnersLoading ? (
                              <option disabled>Loading preferred bond originators...</option>
                            ) : preferredPartnersError ? (
                              <option disabled>Could not load agency preferred partners</option>
                            ) : bondOriginatorOptions.length ? (
                              bondOriginatorOptions.map((partner) => (
                                <option key={partner.id} value={partner.id}>
                                  {partner.companyName} • {partner.contactPerson || 'Contact pending'} • {partner.email || 'No email'}
                                </option>
                              ))
                            ) : (
                              <option disabled>No preferred bond originators found</option>
                            )}
                          </select>
                        </Field>
                        <Field label="Bond Consultant">
                          <select
                            className={fieldClass()}
                            value={form.bondOriginatorPreferredPartnerPersonId || selectedBondOriginatorPartner?.userId || ''}
                            onChange={(event) => updateField('bondOriginatorPreferredPartnerPersonId', event.target.value)}
                            disabled={!selectedBondOriginatorPartner || loadingPartnerPeople.bond_originator}
                          >
                            <option value="">
                              {selectedBondOriginatorPartner ? 'Send to company queue' : 'Select bond originator first'}
                            </option>
                            {partnerPersonOptions.bond_originator.map((person) => (
                              <option key={person.userId} value={person.userId}>
                                {person.name}{person.detail ? ` • ${person.detail}` : ''}
                              </option>
                            ))}
                          </select>
                          {loadingPartnerPeople.bond_originator ? (
                            <p className="mt-1 text-xs text-[#6f8298]">Loading consultants...</p>
                          ) : partnerPeopleMessages.bond_originator ? (
                            <p className="mt-1 text-xs text-[#6f8298]">{partnerPeopleMessages.bond_originator}</p>
                          ) : null}
                        </Field>
                        {preferredPartnersError ? (
                          <p className="text-sm text-[#b42318] md:col-span-2">Could not load agency preferred partners. Try refreshing the page.</p>
                        ) : null}
                        {!bondOriginatorOptions.length && !preferredPartnersLoading && !preferredPartnersError ? (
                          <p className="text-sm text-[#5f748c] md:col-span-2">Add one in Organisation → Partners.</p>
                        ) : null}
                      </div>
                    ) : null}
                    {form.bondOriginatorMode === PARTNER_MODE_BUYER ? (
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <Field label="Buyer Appointed Company" error={errors.bondOriginatorBuyerCompanyName}>
                          <input className={fieldClass()} value={form.bondOriginatorBuyerCompanyName} onChange={(event) => updateField('bondOriginatorBuyerCompanyName', event.target.value)} />
                        </Field>
                        <Field label="Buyer Appointed Contact" error={errors.bondOriginatorBuyerContactPerson}>
                          <input className={fieldClass()} value={form.bondOriginatorBuyerContactPerson} onChange={(event) => updateField('bondOriginatorBuyerContactPerson', event.target.value)} />
                        </Field>
                        <Field label="Email">
                          <input className={fieldClass()} type="email" value={form.bondOriginatorBuyerEmail} onChange={(event) => updateField('bondOriginatorBuyerEmail', event.target.value)} />
                        </Field>
                        <Field label="Phone">
                          <input className={fieldClass()} value={form.bondOriginatorBuyerPhone} onChange={(event) => updateField('bondOriginatorBuyerPhone', normalizePhoneInput(event.target.value))} />
                        </Field>
                        <Field label="Notes" fullWidth>
                          <textarea className={fieldClass()} rows={3} value={form.bondOriginatorBuyerNotes} onChange={(event) => updateField('bondOriginatorBuyerNotes', event.target.value)} />
                        </Field>
                      </div>
                    ) : null}
                  </article>
                  ) : (
                    <article className="rounded-[18px] border border-[#d8eadf] bg-[#eef8f2] p-4">
                      <strong className="text-sm text-[#0f5132]">Bond Originator Not Required</strong>
                      <p className="mt-2 text-sm leading-6 text-[#355e49]">
                        The finance route is not connected-originator managed, so this transaction will not assign or invite a bond originator.
                      </p>
                      <button
                        type="button"
                        className="mt-3 rounded-full border border-[#b9dcc8] bg-white px-3 py-1.5 text-xs font-semibold text-[#147a52]"
                        onClick={() => {
                          if (!isWizardBondFinance) handleFinanceTypeChange('bond')
                          updateField('financeManagedBy', 'bond_originator')
                        }}
                      >
                        Route to bond originator instead
                      </button>
                    </article>
                  )}

                  {cancellationAttorneyRequired ? (
                    <article className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <strong className="text-sm text-[#22374d]">Cancellation Attorney</strong>
                          <p className="mt-1 text-sm text-[#5f748c]">Required when the seller has an existing bond to cancel.</p>
                        </div>
                        <span className="rounded-full border border-[#dce6f2] bg-white px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#5f748c]">
                          Required follow-up
                        </span>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Selection Mode" error={errors.cancellationAttorneyMode}>
                          <select className={fieldClass()} value={form.cancellationAttorneyMode} onChange={(event) => updateField('cancellationAttorneyMode', event.target.value)}>
                            {CANCELLATION_PARTNER_ROLE_FIELD_OPTIONS.map((item) => (
                              <option key={item.value} value={item.value}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        </Field>
                        {form.cancellationAttorneyMode === PARTNER_MODE_AGENCY ? (
                          <Field label="Search Partners">
                            <input
                              className={fieldClass()}
                              value={partnerSearch.cancellationAttorney}
                              onChange={(event) => updatePartnerSearchField('cancellationAttorney', event.target.value)}
                              placeholder="Search company, contact, or email"
                            />
                          </Field>
                        ) : null}
                      </div>
                      {form.cancellationAttorneyMode === PARTNER_MODE_AGENCY ? (
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <Field label="Agency Preferred Cancellation Attorney" error={errors.cancellationAttorneyPreferredPartnerId}>
                            <select className={fieldClass()} value={form.cancellationAttorneyPreferredPartnerId} onChange={(event) => updateField('cancellationAttorneyPreferredPartnerId', event.target.value)}>
                              <option value="">Select cancellation attorney</option>
                              {preferredPartnersLoading ? (
                                <option disabled>Loading preferred cancellation attorneys...</option>
                              ) : preferredPartnersError ? (
                                <option disabled>Could not load agency preferred partners</option>
                              ) : cancellationAttorneyOptions.length ? (
                                cancellationAttorneyOptions.map((partner) => (
                                  <option key={partner.id} value={partner.id}>
                                    {partner.companyName} • {partner.contactPerson || 'Contact pending'} • {partner.email || 'No email'}
                                  </option>
                                ))
                              ) : (
                                <option disabled>No preferred cancellation attorneys found</option>
                              )}
                            </select>
                          </Field>
                          <Field label="Preferred Attorney">
                            <select
                              className={fieldClass()}
                              value={form.cancellationAttorneyPreferredPartnerPersonId || selectedCancellationAttorneyPartner?.userId || ''}
                              onChange={(event) => updateField('cancellationAttorneyPreferredPartnerPersonId', event.target.value)}
                              disabled={!selectedCancellationAttorneyPartner || loadingPartnerPeople.cancellation_attorney}
                            >
                              <option value="">
                                {selectedCancellationAttorneyPartner ? 'Firm will assign internally' : 'Select cancellation attorney first'}
                              </option>
                              {partnerPersonOptions.cancellation_attorney.map((person) => (
                                <option key={person.userId} value={person.userId}>
                                  {person.name}{person.detail ? ` • ${person.detail}` : ''}
                                </option>
                              ))}
                            </select>
                            {loadingPartnerPeople.cancellation_attorney ? (
                              <p className="mt-1 text-xs text-[#6f8298]">Loading attorneys...</p>
                            ) : partnerPeopleMessages.cancellation_attorney ? (
                              <p className="mt-1 text-xs text-[#6f8298]">{partnerPeopleMessages.cancellation_attorney}</p>
                            ) : null}
                          </Field>
                          <div className="rounded-[14px] border border-[#dce6f2] bg-white px-4 py-3 text-sm text-[#5f748c]">
                            {selectedCancellationAttorneyPartner ? (
                              <>
                                <p className="font-semibold text-[#22374d]">{selectedCancellationAttorneyPartner.companyName}</p>
                                <p className="mt-1">{selectedCancellationAttorneyPartner.contactPerson || 'No contact person'}</p>
                                <p className="mt-1">{selectedCancellationAttorneyPartner.email || 'No email'} • {selectedCancellationAttorneyPartner.phone || 'No phone'}</p>
                                <p className="mt-2 text-xs font-medium text-[#6f8298]">
                                  {selectedCancellationAttorneyPartnerPerson
                                    ? `Matter will go to the firm with ${selectedCancellationAttorneyPartnerPerson.name} marked as preferred attorney.`
                                    : 'Matter will go to the firm queue for internal allocation.'}
                                </p>
                              </>
                            ) : (
                              <p>Select a preferred cancellation attorney partner.</p>
                            )}
                            {preferredPartnersError ? (
                              <p className="mt-1 text-[#b42318]">Could not load agency preferred partners. Try refreshing the page.</p>
                            ) : null}
                            {!cancellationAttorneyOptions.length && !preferredPartnersLoading && !preferredPartnersError ? (
                              <p className="mt-1">Add one in Organisation → Partners.</p>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                      {form.cancellationAttorneyMode === PARTNER_MODE_BUYER ? (
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <Field label="Seller Appointed Company" error={errors.cancellationAttorneyBuyerCompanyName}>
                            <input className={fieldClass()} value={form.cancellationAttorneyBuyerCompanyName} onChange={(event) => updateField('cancellationAttorneyBuyerCompanyName', event.target.value)} />
                          </Field>
                          <Field label="Seller Appointed Contact" error={errors.cancellationAttorneyBuyerContactPerson}>
                            <input className={fieldClass()} value={form.cancellationAttorneyBuyerContactPerson} onChange={(event) => updateField('cancellationAttorneyBuyerContactPerson', event.target.value)} />
                          </Field>
                          <Field label="Email" error={errors.cancellationAttorneyBuyerEmail}>
                            <input className={fieldClass()} type="email" value={form.cancellationAttorneyBuyerEmail} onChange={(event) => updateField('cancellationAttorneyBuyerEmail', event.target.value)} />
                          </Field>
                          <Field label="Phone" error={errors.cancellationAttorneyBuyerPhone}>
                            <input className={fieldClass()} value={form.cancellationAttorneyBuyerPhone} onChange={(event) => updateField('cancellationAttorneyBuyerPhone', normalizePhoneInput(event.target.value))} />
                          </Field>
                          <Field label="Notes" fullWidth>
                            <textarea className={fieldClass()} rows={3} value={form.cancellationAttorneyBuyerNotes} onChange={(event) => updateField('cancellationAttorneyBuyerNotes', event.target.value)} />
                          </Field>
                        </div>
                      ) : null}
                    </article>
                  ) : null}

                </div>
              </section>
            ) : null}

            {activeStep === 'attorney' ? <>
              <p className="rounded-xl border p-4 text-sm">Confirm the attorney of record and the professionals already handling this deal. Connected organisations use the handoff register. External companies receive an organisation connection invitation after saving; access and instruction wait for connection and readiness.</p>
              {isWizardBondFinance ? <><TransactionBondAttorneyCapture value={form.bondAttorneyNomination} partners={activePreferredPartners} onChange={(value) => updateField('bondAttorneyNomination', value)} />{errors.bondAttorneyNomination ? <p role="alert" className="mt-2 text-sm text-red-700">{errors.bondAttorneyNomination}</p> : null}</> : null}
            </> : null}
            {activeStep === 'review' ? (
              <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                  <h4 className="text-[1.04rem] font-semibold text-[#142132]">Review Deal Setup</h4>
                  <div className="mt-5 space-y-4 text-sm text-[#48627f]">
                    <p className="rounded-xl border bg-white p-3">{captureDocuments.length} document{captureDocuments.length === 1 ? '' : 's'} ready to upload after creation. Missing files can be added later.</p>
                    {(() => {
                      const completeness = buildCompletenessSnapshot({ form, listing: selectedPrivateListing, propertyMode: form.propertyMode, buyerPartyProfile, sellerPartyProfile, salePrice: inheritedDealTerms.salePrice })
                      completeness.missingItems.push(...captureFinance.missing)
                      return (
                        <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Transaction Completeness</p>
                          <p className="mt-2 text-2xl font-semibold text-[#142132]">{completeness.score}%</p>
                          <p className="mt-1 text-[#5f748c]">
                            {completeness.missingItems.length ? `Missing: ${completeness.missingItems.join(', ')}` : 'No immediate follow-up items.'}
                          </p>
                        </div>
                      )
                    })()}
                    <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Recommended Role Players</p>
                          <p className="mt-1 text-sm text-[#5f748c]">Arch9 will use your saved operational partner preferences first, then fall back to manual selections.</p>
                        </div>
                        {routingRecommendationsLoading ? (
                          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Resolving...</span>
                        ) : null}
                      </div>
                      <div className="mt-4 space-y-3">
                        {CORE_ROUTING_ROLE_TYPES.map((roleType) => {
                          const recommendation = routingRecommendationByRole[roleType] || null
                          const choice = routingRecommendationChoices[roleType] || ''
                          const manualSelection = describeManualRoleSelection(roleType)
                          const displayLabel =
                            choice === 'manual'
                              ? manualSelection?.label || 'Manual selection pending'
                              : choice === 'skip'
                                ? 'Skipped for now'
                                : recommendation?.notRequired
                                  ? 'Not required'
                                  : [recommendation?.targetUserLabel, recommendation?.targetOrganisationName].filter(Boolean).join(', ') || 'Manual selection needed'
                          const displayDetail =
                            choice === 'manual'
                              ? manualSelection?.detail || 'Go back to Transaction Roles to choose a person or organisation.'
                              : choice === 'skip'
                                ? 'This role will not be assigned during transaction creation.'
                                : recommendation?.notRequired
                                  ? recommendation?.resolutionReason || 'Not needed for this deal profile.'
                                  : recommendation?.requiresManualSelection
                                    ? recommendation?.resolutionReason || 'No saved preference matched, so choose manually if you need this role now.'
                                    : `${getRoutingResolutionLabel(recommendation?.resolutionSource)}${recommendation?.partnerType ? ` · ${getPartnerTypeLabel(recommendation.partnerType)}` : ''}`

                          return (
                            <div key={roleType} className="rounded-[14px] border border-[#dce6f2] bg-white p-3">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{getRoutingRoleLabel(roleType)}</p>
                                  <p className="mt-1 font-semibold text-[#22374d]">{displayLabel}</p>
                                  <p className="mt-1 text-sm text-[#5f748c]">{displayDetail}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {!recommendation?.notRequired ? (
                                    <button
                                      type="button"
                                      onClick={() => setRoutingRecommendationChoice(roleType, 'confirm')}
                                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${choice === 'confirm' ? 'border-[#1f4f78] bg-[#1f4f78] text-white' : 'border-[#dce6f2] bg-white text-[#47627c]'}`}
                                      disabled={recommendation?.requiresManualSelection}
                                    >
                                      {choice === 'confirm' ? 'Using recommendation' : 'Confirm'}
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => setRoutingRecommendationChoice(roleType, 'manual')}
                                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${choice === 'manual' ? 'border-[#1f4f78] bg-[#edf4fb] text-[#1f4f78]' : 'border-[#dce6f2] bg-white text-[#47627c]'}`}
                                  >
                                    Change
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRoutingRecommendationChoice(roleType, 'skip')}
                                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${choice === 'skip' ? 'border-[#7b8ca2] bg-[#f6f8fb] text-[#22374d]' : 'border-[#dce6f2] bg-white text-[#47627c]'}`}
                                  >
                                    Skip for now
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Property</p>
                      <p className="mt-2 font-semibold text-[#22374d]">
                        {form.propertyMode === PROPERTY_MODE_PRIVATE
                          ? formatListingDealOption(selectedPrivateListing || {})
                          : form.propertyMode === PROPERTY_MODE_IMPORT
                            ? `${QUICK_CAPTURE_STRUCTURE_OPTIONS.find((option) => option.value === form.importPropertyStructure)?.label || 'Property'} • ${form.importPropertyAddress || 'Address pending'}`
                          : selectedDevelopment && selectedUnit
                            ? `${selectedDevelopment.name} • Unit ${selectedUnit.unit_number}`
                            : 'Development selection pending'}
                      </p>
                      <p className="mt-1">{inheritedDealTerms?.salePrice ? formatCurrency(inheritedDealTerms.salePrice) : 'Not yet confirmed'}</p>
                    </div>
                    <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Finance Snapshot</p>
                      <p className="mt-2 font-semibold text-[#22374d]">
                        {FINANCE_TYPE_OPTIONS.find((option) => option.value === form.financeType)?.label || 'Not confirmed yet'}
                      </p>
                      <p className="mt-1 text-[#5f748c]">
                        {isWizardBondFinance
                          ? `${FINANCE_MANAGED_BY_OPTIONS.find((option) => option.value === form.financeManagedBy)?.label || 'Bond route not set'}${form.bondAmount ? ` • Bond ${formatCurrency(form.bondAmount)}` : ''}`
                          : includesWizardCashFinance && form.cashAmount
                            ? `Cash ${formatCurrency(form.cashAmount)}`
                            : 'Finance amounts not captured yet.'}
                      </p>
                      <p className="mt-1 text-[#5f748c]">
                        {form.depositAmount ? `Deposit ${formatCurrency(form.depositAmount)} • ` : ''}
                        {form.sellerBondStatus === 'yes' ? 'Seller has an existing bond to cancel.' : form.sellerBondStatus === 'no' ? 'Seller confirmed no existing bond to cancel.' : 'Seller bond position is unconfirmed.'}
                      </p>
                    </div>
                    <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Signed OTP Handoff</p>
                          <p className="mt-1 text-sm text-[#5f748c]">
                            Record whether the OTP still needs to be received or signed. Selected files upload after creation; a backfilled transaction keeps its captured stage.
                          </p>
                        </div>
                        <span className="rounded-full border border-[#dce6f2] bg-white px-3 py-1 text-xs font-semibold text-[#47627c]">
                          {signedOtpStatusLabel}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-2 md:grid-cols-3">
                        {SIGNED_OTP_STATUS_OPTIONS.map((option) => {
                          const selected = effectiveSignedOtpStatus === option.value
                          return (
                            <button
                              key={option.value}
                              type="button"
                              className={`rounded-[14px] border px-3 py-3 text-left transition ${
                                selected
                                  ? 'border-[#142132] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)]'
                                  : 'border-[#dce6f2] bg-white/70 hover:border-[#c9d8e8]'
                              }`}
                              onClick={() => updateField('signedOtpStatus', option.value)}
                            >
                              <strong className="block text-sm font-semibold text-[#22374d]">{option.label}</strong>
                              <span className="mt-1 block text-xs leading-5 text-[#60758d]">{option.caption}</span>
                            </button>
                          )
                        })}
                      </div>
                      <div className="mt-4">
                        <Field label="Handoff Notes" hint="Optional context for the transaction team." fullWidth>
                          <textarea
                            className={fieldClass()}
                            rows={3}
                            value={form.handoffNotes}
                            onChange={(event) => updateField('handoffNotes', event.target.value)}
                            placeholder="Example: OTP signed at show house; upload received scan after creation."
                          />
                        </Field>
                      </div>
                    </div>
                    <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Client</p>
                      <p className="mt-2 font-semibold text-[#22374d]">{`${form.clientName} ${form.clientSurname}`.trim()}</p>
                      <p className="mt-1 font-medium text-[#5f748c]">
                        {purchaserTypeLabel}{buyerPartyCount > 1 ? ` • ${buyerPartyCount} parties` : ''}
                      </p>
                      <p className="mt-1">{form.clientEmail} • {form.clientPhone}</p>
                    </div>
                    <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Transfer Attorney Firm</p>
                      <p className="mt-2 font-semibold text-[#22374d]">
                        {form.transferPartnerMode === PARTNER_MODE_AGENCY
                          ? selectedTransferPartner?.companyName || selectedTransferPartner?.contactPerson || 'Pending selection'
                          : form.transferBuyerCompanyName || form.transferBuyerContactPerson || 'Seller-appointed firm pending'}
                      </p>
                      <p className="mt-1 text-[#5f748c]">
                        Awaiting firm acceptance • Primary attorney will be assigned by the firm
                      </p>
                    </div>
                    <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Bond Originator</p>
                      <p className="mt-2 font-semibold text-[#22374d]">
                        {!shouldUseBondOriginator
                          ? 'Not required for this finance route'
                          : form.bondOriginatorMode === PARTNER_MODE_NONE
                          ? 'Not assigned yet'
                          : form.bondOriginatorMode === PARTNER_MODE_AGENCY
                            ? selectedBondOriginatorPartner?.companyName || selectedBondOriginatorPartner?.contactPerson || 'Pending selection'
                            : form.bondOriginatorBuyerCompanyName || form.bondOriginatorBuyerContactPerson || 'Buyer-appointed partner pending'}
                      </p>
                      {!shouldUseBondOriginator ? (
                        <p className="mt-1 text-[#5f748c]">No originator assignment or invitation will be created.</p>
                      ) : null}
                    </div>
                    {cancellationAttorneyRequired ? (
                      <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Cancellation Attorney</p>
                        <p className="mt-2 font-semibold text-[#22374d]">
                          {form.cancellationAttorneyMode === PARTNER_MODE_NONE
                            ? 'Not assigned yet'
                            : form.cancellationAttorneyMode === PARTNER_MODE_AGENCY
                              ? selectedCancellationAttorneyPartner?.companyName || selectedCancellationAttorneyPartner?.contactPerson || 'Pending selection'
                              : form.cancellationAttorneyBuyerCompanyName || form.cancellationAttorneyBuyerContactPerson || 'Seller-appointed partner pending'}
                        </p>
                        <p className="mt-1 text-[#5f748c]">
                          {form.cancellationAttorneyMode === PARTNER_MODE_AGENCY
                            ? 'Agency preferred partner'
                            : form.cancellationAttorneyMode === PARTNER_MODE_BUYER
                              ? 'Seller appointed partner'
                              : 'Existing bond cancellation follow-up'}
                        </p>
                      </div>
                    ) : null}
                    <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Commission Projection</p>
                      <p className="mt-2 font-semibold text-[#22374d]">
                        Gross: {formatCurrency(commissionPreview?.grossCommissionAmount || 0)} at {Number(inheritedDealTerms?.grossCommissionPercentage || 0).toFixed(2).replace(/\.00$/, '')}%
                      </p>
                      <p className="mt-1 text-[#5f748c]">
                        Agent split {Number(commissionPreview?.agentSplitPercentage || 70).toFixed(2).replace(/\.00$/, '')}% • Projected earning {formatCurrency(commissionPreview?.agentCommissionAmount || 0)}
                      </p>
                    </div>
                  </div>
                </section>

                <aside className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                  <h4 className="text-[1.04rem] font-semibold text-[#142132]">What happens next</h4>
                  <div className="mt-4 space-y-3">
                    {[
                      'Transaction will be created and linked to the selected property.',
                      `${getOriginLabel(form.propertyMode)} will be logged on the activity timeline.`,
                      effectiveSignedOtpStatus === 'uploaded'
                        ? 'The transaction will start in Finance because the signed OTP is already available.'
                        : effectiveSignedOtpStatus === 'pending_upload'
                          ? 'The first action will be to upload the signed OTP to transaction documents.'
                          : 'The first action will be to complete OTP signing before partner handoff.',
                      'Completeness follow-ups will be captured without blocking creation.',
                      'Assigned role players will be notified.',
                      form.propertyMode === PROPERTY_MODE_PRIVATE
                        ? 'Listing will move into an in-progress state.'
                        : form.propertyMode === PROPERTY_MODE_DEVELOPMENT
                          ? 'Unit will move out of available status once the transaction is active.'
                          : 'Address-first deal will use the same transaction workspace as every other deal and can be linked to a listing or development later.',
                    ].map((item) => (
                      <div key={item} className="flex gap-3 rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] px-3 py-2.5">
                        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#1f7d44]" />
                        <p className="text-sm text-[#48627f]">{item}</p>
                      </div>
                    ))}
                  </div>
                </aside>
              </section>
            ) : null}
          </>
        ) : (
          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={22} className="mt-0.5 text-[#1f7d44]" />
              <div className="space-y-2">
                <h4 className="text-[1.08rem] font-semibold text-[#142132]">{createdDeal.setupIncomplete ? 'Transaction saved — setup needs attention' : 'Transaction created successfully'}</h4>
                {captureDocuments.length ? <TransactionCaptureDocuments parties={transactionParties} financeType={form.financeType} sellerHasExistingBond={form.sellerBondStatus === 'yes'} entries={captureDocuments} onChange={setCaptureDocuments} saved busy={saving} onRetry={retryCaptureUploads} /> : null}
                <p className="text-sm text-[#607387]">{createdDeal.setupIncomplete ? 'Open this transaction to complete its setup. Selected documents have not been uploaded.' : 'The transaction is saved. Missing details and evidence remain follow-up items.'}</p>
                {createdDeal.buyerDocumentsUrl ? (
                  <a href={createdDeal.buyerDocumentsUrl} target="_blank" rel="noreferrer" onKeyDown={activateAnchorOnSpace} className="inline-flex items-center gap-1 text-sm font-semibold text-[#1f4f78]">
                    <ExternalLink size={14} />
                    Open buyer documents link
                  </a>
                ) : createdDeal.setupPending ? (
                  <p className="text-sm text-[#315f89]">Buyer documents and partner setup are being prepared in the background.</p>
                ) : null}
                {createdDeal.attorneyChangeRequested ? (
                  <p className="text-sm text-[#9a5b13]">Buyer-appointed role player recorded and saved against this transaction setup.</p>
                ) : null}
                {!createdDeal.attorneyChangeRequested && createdDeal.externalRolePlayerCaptured ? (
                  <p className="text-sm text-[#9a5b13]">Externally appointed role player recorded and saved against this transaction setup.</p>
                ) : null}
                {createdDeal.handoffChecklist?.signedOtpStatus ? (
                  <p className="text-sm text-[#607387]">
                    Signed OTP handoff: {getOptionLabel(SIGNED_OTP_STATUS_OPTIONS, createdDeal.handoffChecklist.signedOtpStatus)}.
                  </p>
                ) : null}
                {captureInvitations.length ? <section aria-label="Professional invitations" className="space-y-2 rounded-xl border p-4"><h4 className="font-semibold">Professional invitations</h4>{captureInvitations.map((item) => <p key={`${item.roleType}:${item.email}`} className="text-sm"><strong>{item.companyName}</strong>: {item.message}</p>)}{captureInvitations.some((item) => item.status === 'failed') ? <button type="button" disabled={saving} className="rounded-lg border p-2" onClick={retryCaptureInvitations}>Retry unconfirmed invitations</button> : null}</section> : null}
                {!createdDeal.setupIncomplete ? <TransactionHandoffRegisterPanel transactionId={createdDeal.transactionId} refreshKey={`${saving}:${captureInvitations.length}:${captureDocuments.filter((item) => item.status === 'saved').length}`} /> : null}
                {createdDeal.setupHealth ? (
                  <section className="mt-4 rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Setup Health</p>
                        <p className="mt-1 text-sm font-semibold text-[#142132]">{createdDeal.setupHealth.label}</p>
                      </div>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                          createdDeal.setupHealth.status === 'ready'
                            ? 'border-[#bfe7cf] bg-[#eefbf3] text-[#157347]'
                            : createdDeal.setupHealth.status === 'needs_attention'
                              ? 'border-[#f5d7a8] bg-[#fff8eb] text-[#a15c00]'
                              : 'border-[#cdddf0] bg-white text-[#315f89]'
                        }`}
                      >
                        {createdDeal.setupHealth.completeCount || 0} complete · {createdDeal.setupHealth.actionRequiredCount || 0} next actions
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {(createdDeal.setupHealth.checks || []).map((check) => (
                        <div key={check.key} className="rounded-[14px] border border-[#e5edf6] bg-white px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <strong className="text-sm text-[#142132]">{check.label}</strong>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] ${
                                check.status === 'complete'
                                  ? 'bg-[#eefbf3] text-[#157347]'
                                  : check.status === 'needs_attention'
                                    ? 'bg-[#fff8eb] text-[#a15c00]'
                                    : 'bg-[#f1f6fc] text-[#315f89]'
                              }`}
                            >
                              {check.status.replaceAll('_', ' ')}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-[#60758d]">{check.detail}</p>
                        </div>
                      ))}
                    </div>
                    {createdDeal.setupHealth.auditEventLogged === false ? (
                      <p className="mt-3 text-xs font-medium text-[#8a5a12]">Audit event could not be confirmed, but the transaction was still created.</p>
                    ) : null}
                  </section>
                ) : null}
                {createdDeal.setupWarnings?.length ? (
                  <section className="mt-4 rounded-[18px] border border-[#f5d7a8] bg-[#fff8eb] px-4 py-3 text-sm leading-6 text-[#8a5a12]">
                    <strong className="block text-xs uppercase tracking-[0.18em] text-[#a15c00]">Setup Needs Attention</strong>
                    <div className="mt-2 space-y-1">
                      {createdDeal.setupWarnings.map((warning) => (
                        <p key={`${warning.area}:${warning.code || warning.message}`}>
                          {warning.area ? `${warning.area.replaceAll('_', ' ')}: ` : ''}
                          {warning.message}
                        </p>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          </section>
        )}
      </div>
    </Modal>
  )
}

export default AgentNewDealWizard
