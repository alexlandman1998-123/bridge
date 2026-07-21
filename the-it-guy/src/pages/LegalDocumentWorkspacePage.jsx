import { AlertCircle, ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import LegalDocumentWorkspace from '../components/documents/LegalDocumentWorkspace'
import MandateDraftIntakePanel from '../components/documents/MandateDraftIntakePanel'
import OtpDraftIntakePanel from '../components/documents/OtpDraftIntakePanel'
import Button from '../components/ui/Button'
import { useWorkspace } from '../context/WorkspaceContext'
import { archivePacket, generatePacketVersion, listPacketTemplates, resolveActiveTemplate } from '../core/documents/packetService'
import {
  DOCUMENT_START_ENTRY_POINTS,
  DOCUMENT_START_SOURCE_MODES,
} from '../core/documents/documentStartRules'
import { readDocumentStartLegalScenarioParams } from '../core/documents/documentStartLegalScenario'
import {
  normalizeLegalPropertyTitleType,
  resolveLegalDocumentScenarioProfile,
} from '../core/documents/legalDocumentScenarioProfile'
import {
  resolveLegalDocumentScenarioRequirements,
  sanitizeLegalDocumentScenarioDraft,
} from '../core/documents/legalDocumentScenarioRequirements'
import {
  buildPacketSectionManifest,
  renderPacketPreviewHtml,
  resolveMandatePacketPlaceholders,
} from '../core/documents/packetWorkflow'
import { templateIsUsableForGeneration } from '../core/documents/structuredTemplateRenderer'
import {
  mapSellerOnboardingToMandateData,
  validateMandateGenerationData,
} from '../core/documents/mandateDataMapper'
import { documentPacketBelongsToLead, resolveDocumentPacketStatus } from '../core/documents/packetStatusResolver'
import { OTP_DOCUMENT_TYPES } from '../core/transactions/salesWorkflow'
import { addLeadActivity, getAgencyPipelineSnapshot, listAgencyLeads, updateAgencyLead } from '../lib/agencyPipelineService'
import { inferLeadCategoryFromRecord } from '../lib/leadCategory'
import {
  appendDocumentPacketEvent,
  createDocumentPacket,
  createEditableDocumentDraftFromTemplate,
  fetchDocumentPacket,
  listDocumentPackets,
  resolveDocumentPacketBranding,
  updateDocumentPacket,
} from '../lib/documentPacketsApi'
import { createAgencyCrmLeadActivity, updateAgencyCrmLeadRecord } from '../lib/agencyCrmRepository'
import { fetchTransactionById, updateOtpDocumentWorkflowState } from '../lib/api'
import { isUnsafeFallbackAllowed } from '../lib/envValidation'
import { assertEdgeFunctionSuccess, invokeEdgeFunction, isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { fetchAgencyOnboardingSettings, listOrganisationPreferredPartners } from '../lib/settingsApi'
import {
  createPrivateListing,
  createPrivateListingActivity,
  getSellerOnboardingByToken,
  linkPrivateListingDocument,
  sendSellerPortalInviteAfterMandateSigned,
  updatePrivateListing,
} from '../services/privateListingService'
import { getMandateSignerRoleLabel, resolveMandateSecondarySignerConfig } from '../lib/mandateSignatureRules'
import { allocatePrivateListingTransferAttorney } from '../services/privateListingAttorneyAllocationService'
import { fetchDocumentExperienceRuntimeRolloutAccess } from '../services/documentExperienceRuntimeRolloutService'

function normalizeText(value) {
  return String(value || '').trim()
}

const SELLER_PORTAL_INVITE_AFTER_MANDATE_SIGNED_EVENT = 'seller_portal_invite_ready_after_mandate_signed'

function firstText(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

function resolveDevelopmentSellerDetailsFromTransactionDetail(transactionDetail = {}) {
  const unit = transactionDetail?.unit || {}
  const source =
    unit?.development?.sellerDetails ||
    unit?.development?.seller_details ||
    unit?.development?.profile?.sellerDetails ||
    unit?.development?.profile?.seller_details ||
    transactionDetail?.sellerDetails ||
    transactionDetail?.seller_details ||
    {}

  return source && typeof source === 'object' ? source : {}
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function normalizeLeadUuid(value) {
  const raw = normalizeText(value)
  if (!raw) return ''
  if (isUuidLike(raw)) return raw
  const withoutPrefix = raw.replace(/^lead_/i, '')
  return isUuidLike(withoutPrefix) ? withoutPrefix : ''
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function appendAnnexureLabel(current = '', label = '') {
  const nextLabel = normalizeText(label)
  if (!nextLabel) return normalizeText(current)
  const existing = normalizeText(current)
  if (!existing) return nextLabel
  if (existing.toLowerCase().includes(nextLabel.toLowerCase())) return existing
  return `${existing}; ${nextLabel}`
}

function resolveModeFromQuery(mode = '') {
  const key = normalizeKey(mode)
  if (['generate', 'edit', 'send', 'signed', 'view'].includes(key)) return key
  if (key === 'view_signed') return 'signed'
  return 'view'
}

function resolveDocumentLabel(packetType = '') {
  return normalizeKey(packetType) === 'otp' ? 'Offer to Purchase' : 'Mandate Agreement'
}

function addDaysToIsoDate(days = 0) {
  const date = new Date()
  if (Number.isFinite(days) && days) {
    date.setDate(date.getDate() + days)
  }
  return date.toISOString().slice(0, 10)
}

function toIsoDate(value = '') {
  const text = normalizeText(value)
  if (!text) return ''
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

function normalizeEntityType(value = '', fallback = '') {
  const key = normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (['individual', 'company', 'trust', 'close_corporation'].includes(key)) return key
  if (key === 'cc') return 'close_corporation'
  return fallback
}

function normalizeOtpFinanceType(value = '') {
  const key = normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (key === 'hybrid') return 'combination'
  if (['cash', 'bond', 'combination'].includes(key)) return key
  return ''
}

function parseDraftMoney(value = '') {
  const text = normalizeText(value)
  if (!text) return null
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

function compactObjectValues(source = {}) {
  const output = {}
  for (const [key, value] of Object.entries(source || {})) {
    const text = normalizeText(value)
    if (text) output[key] = value
  }
  return output
}

function parseListingMoney(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    const text = normalizeText(value)
    if (!text) continue
    const cleaned = text.replace(/[^\d.-]+/g, '')
    if (!cleaned) continue
    const number = Number(cleaned)
    if (Number.isFinite(number)) return number
  }
  return null
}

function splitDisplayName(fullName = '') {
  const parts = normalizeText(fullName).split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  }
}

function buildMandateFirstListingTitle({ property = {}, mandateDraft = {} } = {}) {
  const propertyType = firstText(property.propertyType, property.type, mandateDraft.propertyType, 'Property')
  const location = firstText(property.suburb, mandateDraft.propertySuburb, property.city, mandateDraft.propertyCity)
  const address = firstText(property.displayAddress, property.fullAddress, property.address, mandateDraft.propertyAddress)
  return firstText(
    [propertyType, location].filter(Boolean).join(' - '),
    address,
    'Mandate listing',
  )
}

function buildMandateFirstListingPayload({
  organisationId = null,
  actor = {},
  packet = {},
  mandateData = {},
  mandateDraft = {},
  leadContext = {},
  routeLeadId = '',
} = {}) {
  const seller = asRecord(mandateData?.seller)
  const property = asRecord(mandateData?.property)
  const mandate = asRecord(mandateData?.mandate)
  const sourceContext = asRecord(mandateData?.sourceContext)
  const draft = asRecord(mandateDraft)
  const packetId = normalizeText(packet?.id)
  const realLeadId = normalizeLeadUuid(leadContext?.lead?.leadId || routeLeadId)
  const sellerFullName = firstText(seller.fullName, seller.name, draft.sellerFullName)
  const sellerEmail = firstText(seller.email, draft.sellerEmail).toLowerCase()
  const sellerPhone = firstText(seller.phone, draft.sellerPhone)
  const sellerIdNumber = firstText(seller.identityNumber, seller.idNumber, draft.sellerIdNumber)
  const sellerEntityType = normalizeEntityType(firstText(seller.entityType, draft.sellerEntityType))
  const propertyAddress = firstText(property.fullAddress, property.address, draft.propertyAddress)
  const displayAddress = firstText(property.displayAddress, propertyAddress)
  const propertyType = firstText(property.propertyType, property.type, draft.propertyType, 'Property')
  const suburb = firstText(property.suburb, draft.propertySuburb)
  const city = firstText(property.city, draft.propertyCity)
  const province = firstText(property.province, draft.propertyProvince)
  const postalCode = firstText(property.postalCode, draft.propertyPostalCode)
  const unitNumber = firstText(property.unitNumber, draft.unitNumber)
  const sectionNumber = firstText(property.sectionNumber, draft.sectionNumber)
  const complexName = firstText(property.complexName, property.estateComplexName, draft.complexName)
  const estateName = firstText(property.estateName, draft.estateName)
  const erfNumber = firstText(property.erfNumber, draft.erfNumber)
  const askingPrice = parseListingMoney(mandate.askingPrice, property.askingPrice, draft.askingPrice)
  const mandateType = normalizeKey(firstText(mandate.type, draft.mandateType, 'sole')) || 'sole'
  const mandateStartDate = toIsoDate(firstText(mandate.startDate, draft.mandateStartDate))
  const mandateEndDate = toIsoDate(firstText(mandate.expiryDate, mandate.endDate, draft.mandateEndDate))
  const commissionStructure = normalizeKey(firstText(mandate.commissionStructure, draft.commissionStructure, 'percentage')) || 'percentage'
  const commissionPercent = parseListingMoney(mandate.commissionPercent, mandate.commissionPercentage, draft.commissionPercent)
  const commissionAmount = parseListingMoney(mandate.commissionAmount, draft.commissionAmount)
  const now = new Date().toISOString()
  const sellerCanonicalFacts = {
    source: 'mandate_first',
    packetId,
    mandatePacketId: packetId,
    sellerName: sellerFullName,
    sellerFullName,
    fullName: sellerFullName,
    name: sellerFullName,
    entityType: sellerEntityType,
    sellerType: sellerEntityType,
    idNumber: sellerIdNumber,
    identityNumber: sellerIdNumber,
    email: sellerEmail,
    phone: sellerPhone,
    domiciliumAddress: firstText(seller.domiciliumAddress, draft.sellerDomiciliumAddress),
    representativeName: firstText(seller.representativeName, draft.sellerRepresentativeName),
    representativeCapacity: firstText(seller.representativeCapacity, draft.sellerRepresentativeCapacity),
    property: compactObjectValues({
      address: propertyAddress,
      fullAddress: propertyAddress,
      displayAddress,
      suburb,
      city,
      province,
      postalCode,
      propertyType,
      unitNumber,
      sectionNumber,
      complexName,
      estateName,
      erfNumber,
      sectionalTitleScheme: firstText(property.sectionalTitleScheme, draft.sectionalTitleScheme),
    }),
    mandate: compactObjectValues({
      type: mandateType,
      status: 'generated',
      packetId,
      startDate: mandateStartDate,
      expiryDate: mandateEndDate,
      endDate: mandateEndDate,
      askingPrice: askingPrice === null ? '' : askingPrice,
      commissionStructure,
      commissionPercent: commissionPercent === null ? '' : commissionPercent,
      commissionAmount: commissionAmount === null ? '' : commissionAmount,
      vatHandling: firstText(mandate.vatHandling, draft.vatHandling),
      specialConditions: firstText(mandate.specialConditions, draft.specialConditions),
    }),
    sourceContext,
    updatedAt: now,
  }
  const sellerCanonicalFactReadiness = {
    sellerName: Boolean(sellerFullName),
    sellerEmail: Boolean(sellerEmail),
    sellerPhone: Boolean(sellerPhone),
    sellerIdentity: Boolean(sellerIdNumber),
    propertyAddress: Boolean(propertyAddress),
    askingPrice: askingPrice !== null,
    mandateGenerated: true,
    mandatePacketLinked: Boolean(packetId),
    autoCreatedFromMandate: true,
  }
  const title = buildMandateFirstListingTitle({ property, mandateDraft: draft })
  const notes = [
    'Created automatically after mandate generation.',
    mandateStartDate || mandateEndDate ? `Mandate dates: ${mandateStartDate || 'not set'} to ${mandateEndDate || 'not set'}.` : '',
  ].filter(Boolean).join('\n')

  return {
    organisationId,
    assignedAgentId: isUuidLike(actor.id) ? actor.id : null,
    assignedAgentEmail: actor.email,
    sellerLeadId: realLeadId || undefined,
    originatingCrmLeadId: realLeadId || undefined,
    listingStatus: 'mandate_ready',
    listingVisibility: 'internal',
    sellerOnboardingStatus: 'not_started',
    mandateStatus: 'generated',
    mandatePacketId: packetId,
    isActive: false,
    title,
    description: firstText(mandate.specialConditions, draft.specialConditions),
    propertyCategory: 'residential',
    listingSource: 'private_listing',
    propertyStructureType: unitNumber || sectionNumber || complexName ? 'sectional_title' : 'freehold',
    propertyType,
    listingCategory: 'private_sale',
    askingPrice: askingPrice === null ? 0 : askingPrice,
    estimatedValue: askingPrice === null ? 0 : askingPrice,
    addressLine1: propertyAddress,
    formattedAddress: displayAddress,
    streetAddress: propertyAddress,
    suburb,
    city,
    province,
    country: firstText(property.country, draft.propertyCountry, 'South Africa'),
    postalCode,
    sellerType: sellerEntityType,
    mandateType,
    listingPreviewDescription: firstText(displayAddress, title),
    internalListingNotes: notes,
    sellerCanonicalFacts,
    sellerCanonicalFactReadiness,
    sellerCanonicalFactsUpdatedAt: now,
    completeness: {
      source: 'mandate_first',
      missingItems: Object.entries(sellerCanonicalFactReadiness)
        .filter(([, ready]) => ready === false)
        .map(([key]) => key),
    },
    source: 'mandate_first',
    origin: 'mandate_first',
  }
}

function buildMandateFirstLeadContext({ listing = {}, payload = {}, routeLeadId = '', previous = {} } = {}) {
  const canonicalFacts = asRecord(payload.sellerCanonicalFacts)
  const nameParts = splitDisplayName(canonicalFacts.sellerFullName || canonicalFacts.fullName || canonicalFacts.name)
  const listingId = normalizeText(listing?.id)
  const leadId = normalizeText(payload.sellerLeadId || routeLeadId)
  const property = asRecord(canonicalFacts.property)
  const contact = canonicalFacts.sellerName || canonicalFacts.email || canonicalFacts.phone
    ? {
        ...(previous?.contact || {}),
        contactId: normalizeText(previous?.contact?.contactId),
        organisationId: normalizeText(listing?.organisationId || payload.organisationId),
        firstName: normalizeText(previous?.contact?.firstName) || nameParts.firstName,
        lastName: normalizeText(previous?.contact?.lastName) || nameParts.lastName,
        phone: canonicalFacts.phone || normalizeText(previous?.contact?.phone),
        email: canonicalFacts.email || normalizeText(previous?.contact?.email),
        contactType: 'Seller',
      }
    : previous?.contact || null

  return {
    ...previous,
    privateListing: listing,
    listing,
    contact,
    lead: {
      ...(previous?.lead || {}),
      leadId,
      organisationId: normalizeText(listing?.organisationId || payload.organisationId),
      leadCategory: 'seller',
      leadDirection: 'Listing',
      leadSource: 'Mandate',
      stage: 'Mandate Draft',
      status: 'Mandate Draft',
      priority: 'Medium',
      budget: listing?.estimatedValue || listing?.askingPrice || payload.estimatedValue || payload.askingPrice || 0,
      areaInterest: listing?.suburb || property.suburb || '',
      propertyInterest: listing?.propertyType || property.propertyType || listing?.title || '',
      sellerPropertyAddress: listing?.formattedAddress || listing?.addressLine1 || property.displayAddress || property.address || '',
      sellerName: canonicalFacts.sellerName || canonicalFacts.fullName || '',
      sellerEmail: canonicalFacts.email || '',
      sellerPhone: canonicalFacts.phone || '',
      sellerOnboardingStatus: listing?.sellerOnboardingStatus || payload.sellerOnboardingStatus || 'not_started',
      mandateStatus: listing?.mandateStatus || payload.mandateStatus || 'generated',
      mandatePacketId: listing?.mandatePacketId || payload.mandatePacketId || '',
      listingId,
      privateListingId: listingId,
    },
  }
}

function toFriendlyPageError(error = null) {
  const raw = normalizeText(error?.message || error)
  const message = raw.toLowerCase()
  if (message.includes('invalid input syntax for type uuid')) {
    return 'The transaction or packet reference in this link is invalid. Check the link and try again.'
  }
  if (message.includes('permission denied') || message.includes('row-level security')) {
    return 'You do not have permission to view this legal document workspace.'
  }
  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'Arch9 could not reach the legal document service. Please retry.'
  }
  return raw || 'Unable to load this legal document workspace.'
}

function resolveSafeReturnPath(value = '') {
  const text = normalizeText(value)
  if (!text || !text.startsWith('/')) return ''
  if (text.startsWith('//')) return ''
  return text
}

function resolveTransactionReference(detail = null, fallback = '') {
  const unit = detail?.unit || null
  const transaction = detail?.transaction || null
  const buyer = detail?.buyer || null
  return [
    unit?.unit_number ? `Unit ${unit.unit_number}` : '',
    unit?.development?.name || '',
    buyer?.name ? `Buyer: ${buyer.name}` : '',
    transaction?.stage || transaction?.current_main_stage || '',
  ].filter(Boolean).join(' · ') || fallback || 'Transaction document context'
}

function buildAgentFromProfile(profile = null) {
  return {
    id: normalizeText(profile?.id),
    fullName:
      normalizeText(profile?.fullName) ||
      [profile?.firstName, profile?.lastName].map(normalizeText).filter(Boolean).join(' ') ||
      'Arch9 User',
    email: normalizeText(profile?.email).toLowerCase(),
    phone: normalizeText(profile?.phone || profile?.phoneNumber || profile?.mobile || profile?.cellphone),
    ffcNumber: normalizeText(profile?.ffcNumber || profile?.ppraNumber || profile?.fidelityFundCertificateNumber),
  }
}

function findLeadContext({ organisationId = '', leadId = '' } = {}) {
  const normalizedLeadId = normalizeText(leadId)
  const dbLeadId = normalizeLeadUuid(normalizedLeadId)
  if (!organisationId || !normalizedLeadId) {
    return { lead: null, contact: null, linkedTransaction: null }
  }

  const snapshot = getAgencyPipelineSnapshot(organisationId)
  const leads = Array.isArray(snapshot?.leads) ? snapshot.leads : []
  const lead = leads.find((item) => {
    const itemId = normalizeText(item?.leadId)
    return itemId === normalizedLeadId || normalizeLeadUuid(itemId) === dbLeadId
  }) || null
  if (!lead) return { lead: null, contact: null, linkedTransaction: null }

  const contacts = Array.isArray(snapshot?.contacts) ? snapshot.contacts : []
  const contact = contacts.find((item) => normalizeText(item?.contactId) === normalizeText(lead.contactId)) || null
  const deals = Array.isArray(snapshot?.deals) ? snapshot.deals : []
  const linkedTransaction =
    deals
      .filter((row) => normalizeText(row?.leadId) === normalizeText(lead.leadId))
      .sort((a, b) => new Date(b?.updatedAt || b?.createdAt || 0) - new Date(a?.updatedAt || a?.createdAt || 0))[0] || null

  return { lead, contact, linkedTransaction }
}

function buildLooseLeadContextFromRoute({ organisationId = '', leadId = '', listingId = '' } = {}) {
  const normalizedLeadId = normalizeText(leadId)
  const normalizedListingId = normalizeText(listingId)
  if (!normalizedLeadId && !normalizedListingId) return { lead: null, contact: null, linkedTransaction: null }
  const lead = {
    leadId: normalizedLeadId,
    organisationId: normalizeText(organisationId) || null,
    leadCategory: 'seller',
    stage: 'Mandate Draft',
    status: 'Mandate Draft',
    sellerPropertyAddress: '',
    areaInterest: '',
    propertyInterest: '',
    listingId: normalizedListingId || null,
  }
  return { lead, contact: null, linkedTransaction: null }
}

async function fetchLeadContextFromSupabase({ organisationId = '', leadId = '' } = {}) {
  if (!isSupabaseConfigured || !supabase) return { lead: null, contact: null, linkedTransaction: null }
  const scopedLeadId = normalizeLeadUuid(leadId)
  if (!scopedLeadId) return { lead: null, contact: null, linkedTransaction: null }

  let leadQuery = supabase
    .from('leads')
    .select('lead_id, organisation_id, assigned_agent_id, contact_id, lead_category, lead_direction, lead_source, stage, status, priority, budget, area_interest, property_interest, seller_property_address, estimated_value, notes, seller_onboarding_token, seller_onboarding_status, mandate_packet_id, listing_id, converted_transaction_id, created_at, updated_at')
    .eq('lead_id', scopedLeadId)

  if (isUuidLike(organisationId)) {
    leadQuery = leadQuery.eq('organisation_id', organisationId)
  }

  const leadResult = await leadQuery.maybeSingle()
  if (leadResult.error || !leadResult.data) {
    return { lead: null, contact: null, linkedTransaction: null }
  }

  const row = leadResult.data
  const contactId = normalizeText(row?.contact_id)
  const listingId = normalizeText(row?.listing_id)
  const [contactResult, onboardingResult, listingResult] = await Promise.all([
    contactId
      ? supabase
        .from('contacts')
        .select('contact_id, organisation_id, assigned_agent_id, first_name, last_name, phone, email, contact_type, notes, created_at, updated_at')
        .eq('contact_id', contactId)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    listingId
      ? supabase
        .from('private_listing_seller_onboarding')
        .select('id, private_listing_id, token, status, submitted_at, updated_at, form_data')
        .eq('private_listing_id', listingId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    listingId
      ? supabase
        .from('private_listings')
        .select('id, organisation_id, seller_lead_id, title, asking_price, estimated_value, address_line_1, address_line_2, suburb, city, province, postal_code, property_type, mandate_type, updated_at')
        .eq('id', listingId)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  const onboarding = onboardingResult?.data
    ? {
        ...(onboardingResult.data || {}),
        token: normalizeText(onboardingResult.data?.token),
        status: normalizeText(onboardingResult.data?.status),
        formData:
          onboardingResult.data?.form_data && typeof onboardingResult.data.form_data === 'object'
            ? onboardingResult.data.form_data
            : {},
      }
    : null

  const listing = listingResult?.data
    ? {
        id: normalizeText(listingResult.data.id),
        organisationId: normalizeText(listingResult.data.organisation_id),
        sellerLeadId: normalizeText(listingResult.data.seller_lead_id),
        listingTitle: normalizeText(listingResult.data.title),
        propertyAddress: [listingResult.data.address_line_1, listingResult.data.address_line_2].map(normalizeText).filter(Boolean).join(', '),
        addressLine1: normalizeText(listingResult.data.address_line_1),
        addressLine2: normalizeText(listingResult.data.address_line_2),
        suburb: normalizeText(listingResult.data.suburb),
        city: normalizeText(listingResult.data.city),
        province: normalizeText(listingResult.data.province),
        postalCode: normalizeText(listingResult.data.postal_code),
        propertyType: normalizeText(listingResult.data.property_type),
        mandateType: normalizeText(listingResult.data.mandate_type),
        askingPrice: Number(listingResult.data.asking_price || 0) || 0,
        estimatedValue: Number(listingResult.data.estimated_value || 0) || 0,
        sellerOnboardingStatus: normalizeText(onboarding?.status || row?.seller_onboarding_status),
        sellerOnboarding: onboarding ? { ...onboarding } : null,
      }
    : null

  const contact = contactResult?.data
    ? {
        contactId: normalizeText(contactResult.data.contact_id),
        organisationId: normalizeText(contactResult.data.organisation_id),
        assignedAgentId: normalizeText(contactResult.data.assigned_agent_id),
        firstName: normalizeText(contactResult.data.first_name),
        lastName: normalizeText(contactResult.data.last_name),
        phone: normalizeText(contactResult.data.phone),
        email: normalizeText(contactResult.data.email).toLowerCase(),
        contactType: normalizeText(contactResult.data.contact_type) || 'Lead',
        notes: normalizeText(contactResult.data.notes),
        createdAt: contactResult.data.created_at || null,
        updatedAt: contactResult.data.updated_at || null,
      }
    : null

  const lead = {
    leadId: normalizeText(row?.lead_id),
    organisationId: normalizeText(row?.organisation_id),
    assignedAgentId: normalizeText(row?.assigned_agent_id),
    assignedAgentName: '',
    assignedAgentEmail: '',
    contactId,
    leadCategory: inferLeadCategoryFromRecord(row, 'other'),
    leadDirection: normalizeText(row?.lead_direction) || 'Inbound',
    leadSource: normalizeText(row?.lead_source) || 'Other',
    stage: normalizeText(row?.stage) || 'New Lead',
    status: normalizeText(row?.status) || normalizeText(row?.stage) || 'New Lead',
    priority: normalizeText(row?.priority) || 'Medium',
    budget: Number(row?.budget || 0) || 0,
    areaInterest: normalizeText(row?.area_interest),
    propertyInterest: normalizeText(row?.property_interest),
    sellerPropertyAddress: normalizeText(row?.seller_property_address),
    estimatedValue: Number(row?.estimated_value || 0) || 0,
    notes: normalizeText(row?.notes),
    sellerOnboardingToken: normalizeText(row?.seller_onboarding_token || onboarding?.token),
    sellerOnboardingLink: '',
    sellerOnboardingStatus: normalizeText(row?.seller_onboarding_status || onboarding?.status),
    sellerWorkflowLeadId: normalizeText(listing?.sellerLeadId),
    mandatePacketId: normalizeText(row?.mandate_packet_id),
    listingId,
    sellerOnboarding: onboarding ? { ...onboarding } : null,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
    convertedDealId: normalizeText(row?.converted_transaction_id),
    convertedTransactionId: normalizeText(row?.converted_transaction_id),
  }

  return {
    lead,
    contact,
    linkedTransaction: normalizeText(row?.converted_transaction_id)
      ? { transactionId: normalizeText(row?.converted_transaction_id), dealId: normalizeText(row?.converted_transaction_id) }
      : null,
    privateListing: listing,
    listing,
  }
}

function mapPrivateListingToLeadContext({ listingRow = {}, onboardingRow = null, organisationId = '', leadId = '' } = {}) {
  const onboarding = onboardingRow
    ? {
        ...(onboardingRow || {}),
        token: normalizeText(onboardingRow?.token),
        status: normalizeText(onboardingRow?.status),
        formData:
          onboardingRow?.form_data && typeof onboardingRow.form_data === 'object'
            ? onboardingRow.form_data
            : onboardingRow?.formData && typeof onboardingRow.formData === 'object'
              ? onboardingRow.formData
              : {},
      }
    : null
  const formData = onboarding?.formData || {}
  const listingId = normalizeText(listingRow?.id)
  const sellerLeadId = normalizeText(listingRow?.seller_lead_id || listingRow?.sellerLeadId)
  const incomingLeadId = normalizeText(leadId)
  const safeIncomingLeadId = incomingLeadId && incomingLeadId !== listingId ? incomingLeadId : ''
  const propertyAddress = [
    listingRow?.address_line_1 || listingRow?.addressLine1,
    listingRow?.address_line_2 || listingRow?.addressLine2,
  ].map(normalizeText).filter(Boolean).join(', ')
  const sellerFirstName = firstText(formData.sellerFirstName, formData.firstName)
  const sellerSurname = firstText(formData.sellerSurname, formData.lastName, formData.surname)
  const sellerFullName = firstText(
    formData.sellerName,
    formData.fullName,
    formData.displayName,
    [sellerFirstName, sellerSurname].filter(Boolean).join(' '),
  )
  const sellerEmail = firstText(formData.sellerEmail, formData.email, formData.contactEmail).toLowerCase()
  const sellerPhone = firstText(formData.sellerPhone, formData.phone, formData.contactNumber, formData.mobile)
  const privateListing = {
    id: listingId,
    organisationId: normalizeText(listingRow?.organisation_id || listingRow?.organisationId || organisationId),
    sellerLeadId,
    listingTitle: normalizeText(listingRow?.title || listingRow?.listingTitle),
    propertyAddress,
    addressLine1: normalizeText(listingRow?.address_line_1 || listingRow?.addressLine1),
    addressLine2: normalizeText(listingRow?.address_line_2 || listingRow?.addressLine2),
    suburb: normalizeText(listingRow?.suburb),
    city: normalizeText(listingRow?.city),
    province: normalizeText(listingRow?.province),
    postalCode: normalizeText(listingRow?.postal_code || listingRow?.postalCode),
    propertyType: normalizeText(listingRow?.property_type || listingRow?.propertyType),
    mandateType: normalizeText(listingRow?.mandate_type || listingRow?.mandateType),
    askingPrice: Number(listingRow?.asking_price || listingRow?.askingPrice || 0) || 0,
    estimatedValue: Number(listingRow?.estimated_value || listingRow?.estimatedValue || listingRow?.asking_price || 0) || 0,
    sellerOnboardingStatus: normalizeText(onboarding?.status),
    sellerOnboarding: onboarding ? { ...onboarding } : null,
  }
  const contact = sellerFullName || sellerEmail || sellerPhone
    ? {
        contactId: '',
        organisationId: privateListing.organisationId,
        firstName: sellerFirstName,
        lastName: sellerSurname,
        phone: sellerPhone,
        email: sellerEmail,
        contactType: 'Seller',
        notes: '',
        createdAt: null,
        updatedAt: null,
      }
    : null
  const lead = {
    leadId: sellerLeadId || safeIncomingLeadId,
    organisationId: privateListing.organisationId,
    contactId: '',
    leadCategory: 'seller',
    leadDirection: 'Listing',
    leadSource: 'Listing',
    stage: 'Mandate Draft',
    status: 'Mandate Draft',
    priority: 'Medium',
    budget: privateListing.estimatedValue || privateListing.askingPrice || 0,
    areaInterest: privateListing.suburb,
    propertyInterest: privateListing.propertyType || privateListing.listingTitle || propertyAddress,
    sellerPropertyAddress: propertyAddress,
    estimatedValue: privateListing.estimatedValue || privateListing.askingPrice || 0,
    sellerName: sellerFirstName,
    sellerSurname,
    sellerEmail,
    sellerPhone,
    sellerOnboardingToken: normalizeText(onboarding?.token),
    sellerOnboardingLink: '',
    sellerOnboardingStatus: normalizeText(onboarding?.status),
    sellerWorkflowLeadId: sellerLeadId,
    mandatePacketId: '',
    listingId,
    sellerOnboarding: onboarding ? { ...onboarding, listing: privateListing } : null,
    createdAt: listingRow?.created_at || null,
    updatedAt: listingRow?.updated_at || null,
    convertedDealId: '',
    convertedTransactionId: '',
  }

  return {
    lead,
    contact,
    linkedTransaction: null,
    privateListing,
    listing: privateListing,
  }
}

async function fetchListingContextFromSupabase({ organisationId = '', listingId = '', leadId = '' } = {}) {
  if (!isSupabaseConfigured || !supabase) return { lead: null, contact: null, linkedTransaction: null }
  const scopedListingId = normalizeText(listingId)
  if (!isUuidLike(scopedListingId)) return { lead: null, contact: null, linkedTransaction: null }

  let listingQuery = supabase
    .from('private_listings')
    .select('id, organisation_id, seller_lead_id, title, asking_price, estimated_value, address_line_1, address_line_2, suburb, city, province, postal_code, property_type, mandate_type, created_at, updated_at')
    .eq('id', scopedListingId)

  if (isUuidLike(organisationId)) {
    listingQuery = listingQuery.eq('organisation_id', organisationId)
  }

  const [listingResult, onboardingResult] = await Promise.all([
    listingQuery.maybeSingle(),
    supabase
      .from('private_listing_seller_onboarding')
      .select('id, private_listing_id, token, status, submitted_at, updated_at, form_data')
      .eq('private_listing_id', scopedListingId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (listingResult.error || !listingResult.data) {
    return { lead: null, contact: null, linkedTransaction: null }
  }

  return mapPrivateListingToLeadContext({
    listingRow: listingResult.data,
    onboardingRow: onboardingResult?.data || null,
    organisationId,
    leadId,
  })
}

function mergeLeadContextWithListingContext(leadContext = {}, listingContext = {}) {
  if (!leadContext?.lead) return listingContext
  if (!listingContext?.lead) return leadContext
  return {
    ...leadContext,
    privateListing: leadContext.privateListing || listingContext.privateListing || null,
    listing: leadContext.listing || listingContext.listing || null,
    contact: leadContext.contact || listingContext.contact || null,
    linkedTransaction: leadContext.linkedTransaction || listingContext.linkedTransaction || null,
    lead: {
      ...(listingContext.lead || {}),
      ...(leadContext.lead || {}),
      listingId: normalizeText(leadContext.lead?.listingId || listingContext.lead?.listingId),
      sellerWorkflowLeadId: normalizeText(leadContext.lead?.sellerWorkflowLeadId || listingContext.lead?.sellerWorkflowLeadId),
      sellerOnboardingToken: normalizeText(leadContext.lead?.sellerOnboardingToken || listingContext.lead?.sellerOnboardingToken),
      sellerOnboardingStatus: normalizeText(leadContext.lead?.sellerOnboardingStatus || listingContext.lead?.sellerOnboardingStatus),
      sellerOnboarding: leadContext.lead?.sellerOnboarding || listingContext.lead?.sellerOnboarding || null,
    },
  }
}

function findLeadContextAcrossStores({ organisationId = '', leadId = '' } = {}) {
  const direct = findLeadContext({ organisationId, leadId })
  if (direct.lead) return direct

  if (!isUnsafeFallbackAllowed()) return direct
  if (typeof window === 'undefined' || !leadId) return direct
  try {
    const normalizedLeadId = normalizeText(leadId)
    const dbLeadId = normalizeLeadUuid(normalizedLeadId)
    const candidateOrgIds = new Set([normalizeText(organisationId), 'default'].filter(Boolean))
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      const match = String(key || '').match(/^itg:agency-crm:v1:(.+)$/)
      if (match?.[1]) candidateOrgIds.add(match[1])
    }

    for (const candidateOrgId of candidateOrgIds) {
      const rows = listAgencyLeads(candidateOrgId, { includeAll: true })
      const lead = rows.find((item) => {
        const itemId = normalizeText(item?.leadId)
        return itemId === normalizedLeadId || (dbLeadId && normalizeLeadUuid(itemId) === dbLeadId)
      })
      if (!lead) continue
      const snapshot = getAgencyPipelineSnapshot(candidateOrgId)
      const contact =
        (Array.isArray(snapshot.contacts) ? snapshot.contacts : [])
          .find((item) => normalizeText(item?.contactId) === normalizeText(lead.contactId)) || null
      const linkedTransaction =
        (Array.isArray(snapshot.deals) ? snapshot.deals : [])
          .filter((row) => normalizeText(row?.leadId) === normalizeText(lead.leadId))
          .sort((a, b) => new Date(b?.updatedAt || b?.createdAt || 0) - new Date(a?.updatedAt || a?.createdAt || 0))[0] || null
      return { lead, contact, linkedTransaction }
    }
  } catch {
    // Fall through to a loose route context so the workspace remains manually editable.
  }

  return buildLooseLeadContextFromRoute({ organisationId, leadId })
}

async function hydrateLeadContextWithSellerOnboarding(leadContext = {}) {
  const localOnboarding = leadContext?.lead?.sellerOnboarding || null
  if (
    localOnboarding?.formData &&
    typeof localOnboarding.formData === 'object' &&
    Object.keys(localOnboarding.formData).length
  ) {
    return leadContext
  }
  const token = normalizeText(leadContext?.lead?.sellerOnboardingToken || leadContext?.lead?.sellerOnboarding?.token)
  if (!token) {
    const listingId = normalizeText(leadContext?.lead?.listingId || leadContext?.privateListing?.id || leadContext?.listing?.id)
    if (!listingId || !isSupabaseConfigured || !supabase) return leadContext
    try {
      const onboardingQuery = await supabase
        .from('private_listing_seller_onboarding')
        .select('id, private_listing_id, token, status, submitted_at, updated_at, form_data')
        .eq('private_listing_id', listingId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const onboarding = onboardingQuery?.data
      if (!onboarding) return leadContext
      return {
        ...leadContext,
        lead: {
          ...(leadContext.lead || {}),
          sellerOnboardingToken: normalizeText(onboarding?.token || leadContext?.lead?.sellerOnboardingToken),
          sellerOnboardingStatus: normalizeText(onboarding?.status || leadContext?.lead?.sellerOnboardingStatus),
          sellerOnboarding: {
            ...(leadContext?.lead?.sellerOnboarding || {}),
            ...onboarding,
            formData: onboarding?.form_data && typeof onboarding.form_data === 'object' ? onboarding.form_data : {},
          },
        },
      }
    } catch {
      return leadContext
    }
  }
  try {
    const context = await getSellerOnboardingByToken(token, { includeRequirementsAndDocuments: false })
    const listing = context?.listing || null
    const onboarding = listing?.sellerOnboarding || null
    if (!onboarding?.formData) return leadContext
    return {
      ...leadContext,
      privateListing: listing || leadContext.privateListing || null,
      listing: listing || leadContext.listing || null,
      lead: {
        ...(leadContext.lead || {}),
        listingId: normalizeText(listing?.id) || normalizeText(leadContext?.lead?.listingId),
        sellerOnboardingStatus: normalizeText(onboarding.status || leadContext?.lead?.sellerOnboardingStatus),
        sellerOnboarding: {
          ...(leadContext?.lead?.sellerOnboarding || {}),
          ...onboarding,
          formData: onboarding.formData || {},
        },
      },
    }
  } catch {
    return leadContext
  }
}

function normalizeLockedDisclosureAnnexure(snapshot = {}, metadata = {}) {
  const source = asRecord(snapshot)
  if (!Object.keys(source).length) return null
  const title = normalizeText(source.title || source.annexureTitle || source.annexure_title) || 'Declaration by Seller - Annexure A'
  return {
    ...source,
    type: normalizeText(source.type) || 'property_disclosure_annexure_a',
    title,
    annexureLabel: normalizeText(source.annexureLabel || source.annexure_label) || 'Annexure A',
    status: normalizeText(source.status) || 'complete',
    lockedAt: normalizeText(source.lockedAt || source.locked_at || metadata.lockedAt),
    lockedByPacketId: normalizeText(source.lockedByPacketId || source.locked_by_packet_id || metadata.lockedByPacketId),
    lockedByPacketVersionId: normalizeText(source.lockedByPacketVersionId || source.locked_by_packet_version_id || metadata.lockedByPacketVersionId),
    finalSignedFilePath: normalizeText(source.finalSignedFilePath || source.final_signed_file_path || metadata.finalSignedFilePath),
    source: normalizeText(metadata.source || source.source) || 'seller_disclosure_locked_snapshot',
    readOnly: true,
    immutable: true,
    reuseTarget: 'otp_annexure',
  }
}

function resolveLockedDisclosureFromFormData(formData = {}) {
  const payload = asRecord(formData)
  const disclosure = asRecord(payload.propertyDisclosure || payload.property_disclosure)
  const lockedSnapshot = asRecord(disclosure.lockedSnapshot || disclosure.locked_snapshot)
  return normalizeLockedDisclosureAnnexure(lockedSnapshot, {
    source: 'seller_onboarding_locked_snapshot',
  })
}

function resolveDisclosureAnnexureFromPacket(packet = null) {
  const packetSource = asRecord(packet?.source_context_json)
  const packetGenerated = asRecord(packetSource.generatedDataSnapshot || packetSource.generated_data_snapshot)
  const packetNestedSource = asRecord(packetSource.sourceContext || packetSource.source_context)
  const candidates = [
    packetSource.propertyDisclosureAnnexure,
    packetSource.property_disclosure_annexure,
    packetNestedSource.propertyDisclosureAnnexure,
    packetNestedSource.property_disclosure_annexure,
    packetGenerated.propertyDisclosureAnnexure,
    packetGenerated.property_disclosure_annexure,
  ]

  const versions = Array.isArray(packet?.versions) ? packet.versions : []
  versions.forEach((version) => {
    const summary = asRecord(version?.validation_summary_json)
    const generated = asRecord(summary.generatedDataSnapshot || summary.generated_data_snapshot)
    const nestedSource = asRecord(summary.sourceContext || summary.source_context)
    candidates.push(
      summary.propertyDisclosureAnnexure,
      summary.property_disclosure_annexure,
      generated.propertyDisclosureAnnexure,
      generated.property_disclosure_annexure,
      nestedSource.propertyDisclosureAnnexure,
      nestedSource.property_disclosure_annexure,
    )
  })

  const snapshot = candidates.map(asRecord).find((candidate) => Object.keys(candidate).length)
  return normalizeLockedDisclosureAnnexure(snapshot, {
    source: 'signed_mandate_packet_context',
    lockedByPacketId: normalizeText(packet?.id),
  })
}

async function fetchLockedDisclosureAnnexureFromListing(listingId = '') {
  const normalizedListingId = normalizeText(listingId)
  if (!normalizedListingId || !isSupabaseConfigured || !supabase) return null
  try {
    const { data, error } = await supabase
      .from('private_listing_seller_onboarding')
      .select('id, private_listing_id, token, status, submitted_at, updated_at, form_data')
      .eq('private_listing_id', normalizedListingId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    return resolveLockedDisclosureFromFormData(asRecord(data.form_data))
  } catch {
    return null
  }
}

async function fetchDisclosureAnnexureFromMandatePacket(packetId = '') {
  const normalizedPacketId = normalizeText(packetId)
  if (!normalizedPacketId || !isUuidLike(normalizedPacketId)) return null
  try {
    const packet = await fetchDocumentPacket(normalizedPacketId, { includeVersions: true, includeEvents: false })
    return resolveDisclosureAnnexureFromPacket(packet)
  } catch {
    return null
  }
}

async function resolveOtpPropertyDisclosureAnnexure({
  leadContext = {},
  transactionDetail = null,
  existingPacketSourceContext = {},
} = {}) {
  const existingAnnexure = normalizeLockedDisclosureAnnexure(
    existingPacketSourceContext.propertyDisclosureAnnexure ||
      existingPacketSourceContext.property_disclosure_annexure ||
      existingPacketSourceContext.lockedPropertyDisclosureAnnexure ||
      existingPacketSourceContext.locked_property_disclosure_annexure,
    {
      source: 'existing_otp_packet_context',
    },
  )
  if (existingAnnexure) return existingAnnexure

  const leadOnboardingFormData = asRecord(leadContext?.lead?.sellerOnboarding?.formData)
  const localLocked = resolveLockedDisclosureFromFormData(leadOnboardingFormData)
  if (localLocked) return localLocked

  const listingId = normalizeText(
    transactionDetail?.transaction?.listing_id ||
      leadContext?.lead?.listingId ||
      leadContext?.privateListing?.id ||
      leadContext?.listing?.id,
  )
  const listingLocked = await fetchLockedDisclosureAnnexureFromListing(listingId)
  if (listingLocked) return listingLocked

  const mandatePacketId = normalizeText(
    leadContext?.lead?.mandatePacketId ||
      leadContext?.privateListing?.mandatePacketId ||
      leadContext?.privateListing?.mandate_packet_id ||
      leadContext?.listing?.mandatePacketId ||
      leadContext?.listing?.mandate_packet_id,
  )
  return fetchDisclosureAnnexureFromMandatePacket(mandatePacketId)
}

function createRuntimeDefaultTemplate(packetType = 'mandate') {
  const normalizedType = normalizeKey(packetType) === 'otp' ? 'otp' : 'mandate'
  const isOtp = normalizedType === 'otp'
  return {
    id: '',
    organisation_id: null,
    module_type: 'agency',
    packet_type: normalizedType,
    template_key: isOtp ? 'otp_default_v1' : 'mandate_default_v1',
    template_label: isOtp ? 'Offer to Purchase (OTP) · Runtime Default' : 'Mandate Agreement · Runtime Default',
    template_format: 'docx',
    version_tag: 'v1',
    description: 'Runtime fallback used when the global packet template seed has not been applied yet.',
    is_default: true,
    is_active: true,
    metadata_json: {
      template_scope: 'runtime_default',
      document_family: normalizedType,
      preview_layout: 'three_panel_packet',
    },
  }
}

function templateHasUsableSource(template = null) {
  return templateIsUsableForGeneration(template, normalizeText(template?.packet_type || template?.packetType || 'mandate'))
}

function getFirstTemplate(templates = [], packetType = 'mandate') {
  const rows = Array.isArray(templates) ? templates : []
  const usable = rows.find((template) => templateHasUsableSource(template))
  if (usable) return usable
  return rows[0] || createRuntimeDefaultTemplate(packetType)
}

function isLegalWorkspaceTimeoutError(error = null) {
  const message = normalizeText(error?.message || error).toLowerCase()
  return message.includes('taking too long') || message.includes('timeout')
}

function getLatestVersion(status = null) {
  const versions = Array.isArray(status?.versions) ? status.versions : []
  const generatedVersion = versions.find((row) => normalizeKey(row?.render_status) === 'generated')
  if (generatedVersion) return generatedVersion
  const usableVersion = versions.find((row) => ['generated', 'draft', 'ready'].includes(normalizeKey(row?.render_status)))
  if (usableVersion) return usableVersion
  return versions[0] || null
}

function resolveSignedMandateArtifact(payload = {}, status = null) {
  const latestVersion = payload?.version && typeof payload.version === 'object'
    ? payload.version
    : getLatestVersion(status)
  const packet = payload?.packet && typeof payload.packet === 'object'
    ? payload.packet
    : status?.packet || null
  const sourceContext = asRecord(packet?.source_context_json)
  const finalArtifact = asRecord(payload?.finalArtifact)
  return {
    packetId: firstText(
      payload?.packetId,
      packet?.id,
      latestVersion?.packet_id,
      status?.packet?.id,
    ),
    packetVersionId: firstText(
      payload?.packetVersionId,
      payload?.versionId,
      latestVersion?.id,
      sourceContext.finalSignedVersionId,
    ),
    finalFilePath: firstText(
      payload?.finalFilePath,
      payload?.finalSignedFilePath,
      finalArtifact.path,
      finalArtifact.filePath,
      latestVersion?.final_signed_file_path,
      sourceContext.finalArtifactPath,
      sourceContext.manualSignedFilePath,
    ),
    finalFileName: firstText(
      payload?.finalFileName,
      payload?.finalSignedFileName,
      finalArtifact.fileName,
      latestVersion?.final_signed_file_name,
      sourceContext.manualSignedFileName,
      'signed-mandate.pdf',
    ),
    finalFileUrl: firstText(
      payload?.finalFileUrl,
      payload?.finalSignedFileUrl,
      finalArtifact.signedUrl,
      finalArtifact.url,
      latestVersion?.final_signed_file_access_url,
      latestVersion?.final_signed_file_url,
    ),
    finalFileBucket: firstText(
      payload?.finalFileBucket,
      payload?.finalSignedFileBucket,
      finalArtifact.bucket,
      latestVersion?.final_signed_file_bucket,
    ),
    finalSignedDocumentId: firstText(
      payload?.finalSignedDocumentId,
      payload?.documentId,
      latestVersion?.final_signed_document_id,
      sourceContext.manualSignedDocumentId,
    ),
    signingMethod: firstText(payload?.signingMethod, sourceContext.signingMethod, sourceContext.signing_method),
    signingStatus: firstText(payload?.signingStatus, sourceContext.signingStatus, sourceContext.signing_status, 'signed'),
    finalizedAt: firstText(payload?.finalizedAt, sourceContext.finalizedAt, latestVersion?.finalised_at) || new Date().toISOString(),
  }
}

function getSignedMandateNotificationContext({
  leadContext = {},
  profile = null,
  actor = {},
  transactionReference = '',
  finalFileName = '',
  finalFileUrl = '',
  finalizedAt = '',
} = {}) {
  const lead = asRecord(leadContext?.lead)
  const contact = asRecord(leadContext?.contact)
  const privateListing = asRecord(leadContext?.privateListing)
  const listing = asRecord(leadContext?.listing)
  const formData = asRecord(
    lead?.sellerOnboarding?.formData ||
      privateListing?.sellerOnboarding?.formData ||
      listing?.sellerOnboarding?.formData,
  )
  const contactName = [
    contact.firstName,
    contact.lastName,
  ].map((item) => normalizeText(item)).filter(Boolean).join(' ')
  const formName = [
    formData.sellerFirstName || formData.firstName,
    formData.sellerSurname || formData.lastName || formData.surname,
  ].map((item) => normalizeText(item)).filter(Boolean).join(' ')
  const sellerEmail = firstText(
    contact.email,
    lead.sellerEmail,
    lead.seller_email,
    lead.email,
    privateListing?.seller?.email,
    privateListing.sellerEmail,
    privateListing.seller_email,
    listing?.seller?.email,
    listing.sellerEmail,
    listing.seller_email,
    formData.sellerEmail,
    formData.seller_email,
    formData.email,
    formData.contactEmail,
  ).toLowerCase()
  const propertyTitle = firstText(
    lead.sellerPropertyAddress,
    lead.propertyAddress,
    lead.property_address,
    lead.propertyInterest,
    lead.listingTitle,
    privateListing.propertyAddress,
    privateListing.property_address,
    privateListing.addressLine1,
    privateListing.address_line_1,
    privateListing.title,
    listing.propertyAddress,
    listing.property_address,
    listing.addressLine1,
    listing.address_line_1,
    listing.listingTitle,
    listing.title,
    transactionReference,
    'your property',
  )
  const agentName = firstText(
    profile?.full_name,
    profile?.fullName,
    profile?.name,
    profile?.email,
    actor?.name,
    actor?.email,
    'your agent',
  )
  const organisationName = firstText(
    privateListing.organisationName,
    privateListing.organisation_name,
    privateListing.agencyName,
    privateListing.agency_name,
    listing.organisationName,
    listing.organisation_name,
    listing.agencyName,
    listing.agency_name,
    profile?.organisationName,
    profile?.organisation_name,
    'Arch9',
  )
  return {
    sellerEmail,
    sellerName: firstText(contact.name, contactName, formData.sellerName, formData.seller_name, formName, lead.sellerName, lead.name, sellerEmail, 'Seller'),
    propertyTitle,
    agentName,
    organisationName,
    supportEmail: firstText(profile?.email, actor?.email),
    signedAt: finalizedAt || new Date().toISOString(),
    signedDocumentName: firstText(finalFileName, 'Signed Mandate.pdf'),
    downloadLink: normalizeText(finalFileUrl),
  }
}

function isRuntimePacketId(value = '') {
  return normalizeText(value).startsWith('runtime_')
}

function buildRuntimePacket({ packetType = 'mandate', organisationId = null, transactionId = '', routeLeadId = '', transactionReference = '', actor = null, template = null } = {}) {
  const now = new Date().toISOString()
  const safeLeadId = normalizeText(routeLeadId).replace(/[^a-zA-Z0-9_-]/g, '') || 'lead'
  const safePacketType = ['mandate', 'otp'].includes(normalizeKey(packetType)) ? normalizeKey(packetType) : 'mandate'
  return {
    id: `runtime_${safePacketType}_${safeLeadId}`,
    organisation_id: organisationId || null,
    packet_type: safePacketType,
    title: `${resolveDocumentLabel(safePacketType)} - ${transactionReference || 'Lead'}`,
    status: 'draft',
    template_id: normalizeText(template?.id) || null,
    template_key_snapshot: normalizeText(template?.template_key || template?.templateKey || template?.key),
    template_label_snapshot: normalizeText(template?.template_label || template?.templateLabel || template?.label || resolveDocumentLabel(safePacketType)),
    transaction_id: transactionId || null,
    lead_id: normalizeLeadUuid(routeLeadId) || null,
    assigned_agent_id: isUuidLike(actor?.id) ? actor.id : null,
    created_by: isUuidLike(actor?.id) ? actor.id : null,
    source_context_json: {
      runtimeOnly: true,
      contextType: safePacketType === 'mandate' ? 'listing_seller' : 'transaction',
      uiLeadId: routeLeadId || null,
      transactionId: transactionId || null,
      signing_method: 'not_selected',
    },
    created_at: now,
    updated_at: now,
  }
}

function buildRuntimeMandateDraft({ packet, context = {}, branding = null } = {}) {
  const now = new Date().toISOString()
  const placeholders = resolveMandatePacketPlaceholders({
    mandateData: context?.mandateData || null,
    lead: context?.lead || null,
    privateListing: context?.privateListing || null,
    mandateDraft: context?.mandateDraft || null,
    agency: context?.agency || null,
    organisation: context?.organisation || null,
    agent: context?.agent || null,
    contact: context?.contact || null,
    transaction: context?.transaction || null,
  })
  const sectionManifest = buildPacketSectionManifest({
    packetType: 'mandate',
    placeholders,
  })
  const missingPlaceholders = []
  for (const section of sectionManifest) {
    for (const [placeholderKey, placeholderLabel] of section.placeholders || []) {
      if (placeholders?.[placeholderKey]) continue
      missingPlaceholders.push({
        sectionKey: section.key,
        sectionLabel: section.label,
        placeholderKey,
        placeholderLabel,
      })
    }
  }
  const previewHtml = renderPacketPreviewHtml({
    packetType: 'mandate',
    title: packet?.title || 'Mandate Agreement',
    placeholders,
    sectionManifest,
    branding: branding || {},
  })
  const version = {
    id: `${packet.id}_version_1`,
    packet_id: packet.id,
    organisation_id: packet.organisation_id || null,
    version_number: 1,
    render_status: 'draft',
    rendered_document_id: null,
    rendered_file_path: null,
    rendered_file_name: null,
    rendered_file_url: null,
    rendered_file_access_url: null,
    placeholders_resolved_json: placeholders,
    placeholders_missing_json: missingPlaceholders,
    section_manifest_json: sectionManifest,
    validation_summary_json: {
      isValidForGeneration: true,
      criticalCount: 0,
      warningCount: missingPlaceholders.length,
      critical: [],
      warnings: missingPlaceholders.map((row) => ({
        ...row,
        message: `${row.placeholderLabel || row.placeholderKey} is not filled yet.`,
      })),
      generatedDataSnapshot: context?.mandateData || context?.generatedDataSnapshot || null,
      missingFieldsSnapshot: context?.mandateValidation?.missingRequiredFields || missingPlaceholders,
      warningsSnapshot: context?.mandateValidation?.warnings || [],
      sourceContext: context?.mandateData?.sourceContext || context?.sourceContext || null,
      generationStatus: 'runtime_preview',
      previewOnly: true,
      runtimeOnly: true,
      previewOnlyReason: 'Runtime draft created without waiting for packet persistence.',
    },
    generated_by: context?.generatedByUserId || null,
    generated_at: now,
    created_at: now,
    updated_at: now,
  }

  return {
    packet,
    version,
    previewHtml,
    runtimeOnly: true,
    status: {
      packetType: 'mandate',
      state: 'draft',
      packet,
      versions: [version],
      signingSummary: null,
      warnings: ['Runtime draft created. Packet persistence will be required before sending or finalizing.'],
      actionHint: 'Draft preview is ready.',
    },
  }
}

function hasGeneratedRuntimeMandate(lead = null) {
  if (!lead) return false
  if (normalizeText(lead.mandatePacketId)) return false
  return ['generated', 'draft'].includes(normalizeKey(lead.mandateStatus)) || isRuntimePacketId(lead.mandateRuntimeDraftId)
}

function buildMandateGenerationContext({
  organisationId = null,
  transaction = null,
  transactionId = '',
  transactionDetail = null,
  leadContext = {},
  mandateDraft = null,
  actor = {},
  role = 'agent',
  branding = null,
  settings = null,
} = {}) {
  const onboardingSettings = settings?.onboarding && typeof settings.onboarding === 'object' ? settings.onboarding : {}
  const organisationSettings = settings?.organisation && typeof settings.organisation === 'object' ? settings.organisation : {}
  const agencyInformation = onboardingSettings?.agencyInformation && typeof onboardingSettings.agencyInformation === 'object'
    ? onboardingSettings.agencyInformation
    : {}
  const principalInformation = onboardingSettings?.principalInformation && typeof onboardingSettings.principalInformation === 'object'
    ? onboardingSettings.principalInformation
    : {}
  const primaryBranch = Array.isArray(onboardingSettings?.branchStructure?.branches)
    ? onboardingSettings.branchStructure.branches[0] || {}
    : {}
  const leadOnboarding = leadContext.lead?.sellerOnboarding || {}
  const leadOnboardingFormData =
    leadOnboarding?.formData && typeof leadOnboarding.formData === 'object'
      ? leadOnboarding.formData
      : {}
  const onboardingFormData =
    transactionDetail?.onboardingFormData?.formData ||
    transactionDetail?.onboardingFormData ||
    leadOnboardingFormData ||
    {}
  const mandateDraftContext = mandateDraft && typeof mandateDraft === 'object' ? mandateDraft : {}
  const privateListing = leadContext.privateListing || leadContext.listing || leadOnboarding?.listing || null
  const sellerDetails = resolveDevelopmentSellerDetailsFromTransactionDetail(transactionDetail)
  const sellerFirstName = normalizeText(
    leadContext.contact?.firstName ||
      onboardingFormData?.sellerFirstName ||
      onboardingFormData?.firstName,
  )
  const sellerSurname = normalizeText(
    leadContext.contact?.lastName ||
      onboardingFormData?.sellerSurname ||
      onboardingFormData?.lastName ||
      onboardingFormData?.surname,
  )
  const sellerDisplayName =
    [sellerFirstName, sellerSurname].filter(Boolean).join(' ') ||
    normalizeText(
      onboardingFormData?.seller_full_name ||
        onboardingFormData?.fullName ||
        onboardingFormData?.displayName ||
        onboardingFormData?.display_name,
    )
  return {
    organisationId,
    organisation: {
      id: organisationId,
      name: firstText(branding?.organisationName, organisationSettings.displayName, organisationSettings.name, agencyInformation.agencyName),
      displayName: firstText(branding?.organisationName, organisationSettings.displayName, organisationSettings.name, agencyInformation.agencyName),
      legalName: firstText(agencyInformation.agencyName, organisationSettings.displayName, organisationSettings.name),
      registrationNumber: firstText(agencyInformation.companyRegistrationNumber),
      vatNumber: firstText(agencyInformation.vatNumber),
      address: firstText(
        agencyInformation.physicalAddress,
        [organisationSettings.addressLine1, organisationSettings.addressLine2, organisationSettings.city, organisationSettings.province, organisationSettings.postalCode]
          .map(normalizeText)
          .filter(Boolean)
          .join(', '),
      ),
      branchName: firstText(primaryBranch.branchName),
      logoLightUrl: firstText(branding?.logoLightUrl, onboardingSettings?.branding?.logoLight, organisationSettings.logoUrl),
      logoDarkUrl: firstText(branding?.logoDarkUrl, onboardingSettings?.branding?.logoDark),
      logoUrl: firstText(branding?.logoLightUrl, onboardingSettings?.branding?.logoLight, organisationSettings.logoUrl),
      companyPhone: firstText(organisationSettings.companyPhone, agencyInformation.mainOfficeNumber),
    },
    agency: {
      name: firstText(agencyInformation.tradingName, branding?.organisationName, agencyInformation.agencyName, organisationSettings.displayName, organisationSettings.name),
      legalName: firstText(agencyInformation.agencyName, branding?.organisationName, organisationSettings.displayName, organisationSettings.name),
      organisationName: firstText(branding?.organisationName, organisationSettings.displayName, organisationSettings.name, agencyInformation.agencyName),
      tradingName: firstText(agencyInformation.tradingName),
      registrationNumber: firstText(agencyInformation.companyRegistrationNumber),
      vatNumber: firstText(agencyInformation.vatNumber),
      address: firstText(
        agencyInformation.physicalAddress,
        [organisationSettings.addressLine1, organisationSettings.addressLine2, organisationSettings.city, organisationSettings.province, organisationSettings.postalCode]
          .map(normalizeText)
          .filter(Boolean)
          .join(', '),
      ),
      branchName: firstText(primaryBranch.branchName),
      phone: firstText(agencyInformation.mainOfficeNumber, organisationSettings.companyPhone),
      logoUrl: firstText(branding?.logoLightUrl, onboardingSettings?.branding?.logoLight, organisationSettings.logoUrl),
      logoLightUrl: firstText(branding?.logoLightUrl, onboardingSettings?.branding?.logoLight, organisationSettings.logoUrl),
      logoDarkUrl: firstText(branding?.logoDarkUrl, onboardingSettings?.branding?.logoDark),
      eaabPpraNumber: firstText(agencyInformation.eaabPpraNumber),
    },
    agent: {
      fullName: firstText(actor.fullName, principalInformation.principalFullName),
      email: firstText(actor.email, principalInformation.emailAddress),
      phone: firstText(actor.phone, principalInformation.phoneNumber),
      ffcNumber: firstText(actor.ffcNumber, principalInformation.ppraNumber),
    },
    transaction,
    transactionId,
    privateListing,
    mandateDraft: mandateDraftContext,
    unit: transactionDetail?.unit || null,
    buyer: transactionDetail?.buyer || null,
    sellerDetails,
    contact: leadContext.contact || null,
    onboardingFormData,
    generatedByRole: role || 'agent',
    generatedByUserId: actor.id,
    generatedByName: actor.fullName,
    generatedByUserEmail: actor.email,
    agentEmail: actor.email,
    lead: leadContext.lead
      ? {
          id: normalizeLeadUuid(leadContext.lead.leadId) || null,
          lead_id: normalizeLeadUuid(leadContext.lead.leadId) || null,
          name: sellerDisplayName,
          sellerName: sellerFirstName,
          sellerSurname: sellerSurname,
          sellerEmail: normalizeText(leadContext.contact?.email || onboardingFormData?.email || onboardingFormData?.sellerEmail),
          sellerPhone: normalizeText(leadContext.contact?.phone || onboardingFormData?.phone || onboardingFormData?.sellerPhone),
          propertyAddress: normalizeText(leadContext.lead?.sellerPropertyAddress || leadContext.lead?.areaInterest),
          propertyType: normalizeText(leadContext.lead?.propertyInterest) || 'Property',
          listingTitle: normalizeText(leadContext.lead?.propertyInterest || leadContext.lead?.sellerPropertyAddress),
          askingPrice: Number(leadContext.lead?.estimatedValue || leadContext.lead?.budget || 0) || null,
          estimatedValue: Number(leadContext.lead?.estimatedValue || leadContext.lead?.budget || 0) || null,
          assignedAgentName: normalizeText(leadContext.lead?.assignedAgentName || actor.fullName),
          assignedAgentEmail: normalizeText(leadContext.lead?.assignedAgentEmail || actor.email),
          sellerOnboardingStatus: normalizeText(leadContext.lead?.sellerOnboardingStatus || leadOnboarding?.status),
          sellerOnboarding: {
            ...leadOnboarding,
            status: normalizeText(leadOnboarding?.status || leadContext.lead?.sellerOnboardingStatus),
            formData: leadOnboarding?.formData && typeof leadOnboarding.formData === 'object' ? leadOnboarding.formData : {},
          },
        }
      : null,
  }
}

function buildRuntimeMandateStatusForLead({
  organisationId = null,
  transaction = null,
  transactionId = '',
  transactionDetail = null,
  transactionReference = '',
  routeLeadId = '',
  leadContext = {},
  actor = {},
  role = 'agent',
  branding = null,
  template = null,
  settings = null,
} = {}) {
  const packet = buildRuntimePacket({
    packetType: 'mandate',
    organisationId,
    transactionId,
    routeLeadId,
    transactionReference,
    actor,
    template,
  })
  return buildRuntimeMandateDraft({
    packet,
    context: buildMandateGenerationContext({
      organisationId,
      transaction,
      transactionId,
      transactionDetail,
      leadContext,
      actor,
      role,
      branding,
      settings,
    }),
    branding,
  }).status
}

function buildMandateDraftDefaults({ leadContext = {}, initialStatus = null, transactionDetail = null } = {}) {
  const lead = leadContext?.lead && typeof leadContext.lead === 'object' ? leadContext.lead : {}
  const onboarding = lead?.sellerOnboarding?.formData && typeof lead.sellerOnboarding.formData === 'object'
    ? lead.sellerOnboarding.formData
    : {}
  const privateListing = leadContext?.privateListing && typeof leadContext.privateListing === 'object'
    ? leadContext.privateListing
    : leadContext?.listing && typeof leadContext.listing === 'object'
      ? leadContext.listing
      : lead?.sellerOnboarding?.listing && typeof lead.sellerOnboarding.listing === 'object'
        ? lead.sellerOnboarding.listing
        : {}
  const transactionOnboarding =
    transactionDetail?.onboardingFormData?.formData ||
    transactionDetail?.onboardingFormData ||
    {}
  const packetSourceContext =
    initialStatus?.packet?.source_context_json && typeof initialStatus.packet.source_context_json === 'object'
      ? initialStatus.packet.source_context_json
      : {}
  const packetDraft =
    packetSourceContext?.mandateDraft && typeof packetSourceContext.mandateDraft === 'object'
      ? packetSourceContext.mandateDraft
      : {}
  const generatedSnapshot =
    initialStatus?.versions?.[0]?.validation_summary_json?.generatedDataSnapshot &&
    typeof initialStatus.versions[0].validation_summary_json.generatedDataSnapshot === 'object'
      ? initialStatus.versions[0].validation_summary_json.generatedDataSnapshot
      : packetSourceContext?.generatedDataSnapshot && typeof packetSourceContext.generatedDataSnapshot === 'object'
        ? packetSourceContext.generatedDataSnapshot
        : {}
  const snapshotMandate = generatedSnapshot?.mandate && typeof generatedSnapshot.mandate === 'object' ? generatedSnapshot.mandate : {}
  const snapshotTransferAttorney = generatedSnapshot?.transferAttorney && typeof generatedSnapshot.transferAttorney === 'object'
    ? generatedSnapshot.transferAttorney
    : {}
  const onboardingTransferAttorney = onboarding?.preferredTransferAttorney && typeof onboarding.preferredTransferAttorney === 'object'
    ? onboarding.preferredTransferAttorney
    : {}
  const snapshotSeller = generatedSnapshot?.seller && typeof generatedSnapshot.seller === 'object' ? generatedSnapshot.seller : {}
  const snapshotProperty = generatedSnapshot?.property && typeof generatedSnapshot.property === 'object' ? generatedSnapshot.property : {}
  const sellerFirstName = firstText(
    onboarding.sellerFirstName,
    onboarding.firstName,
    lead.sellerName,
    lead.name,
    lead.contact?.firstName,
  )
  const sellerSurname = firstText(
    onboarding.sellerSurname,
    onboarding.lastName,
    onboarding.surname,
    lead.sellerSurname,
    lead.contact?.lastName,
  )
  const sellerFullName = firstText(
    packetDraft.sellerFullName,
    snapshotSeller.fullName,
    onboarding.seller_full_name,
    onboarding.fullName,
    onboarding.displayName,
    [sellerFirstName, sellerSurname].map(normalizeText).filter(Boolean).join(' '),
    lead.name,
    lead.contact?.name,
  )

  return {
    sellerEntityType: normalizeKey(firstText(
      packetDraft.sellerEntityType,
      snapshotSeller.entityType,
      onboarding.ownershipType,
      onboarding.entityType,
      onboarding.sellerType,
      lead.sellerType,
    )),
    sellerFullName,
    sellerIdNumber: firstText(
      packetDraft.sellerIdNumber,
      snapshotSeller.identityNumber,
      snapshotSeller.idNumber,
      onboarding.idNumber,
      onboarding.passportNumber,
      onboarding.seller_id_number,
      onboarding.companyRegistrationNumber,
      onboarding.trustRegistrationNumber,
      lead.sellerIdNumber,
    ),
    sellerEmail: firstText(
      packetDraft.sellerEmail,
      snapshotSeller.email,
      onboarding.email,
      onboarding.sellerEmail,
      lead.contact?.email,
      lead.sellerEmail,
      lead.email,
    ),
    sellerPhone: firstText(
      packetDraft.sellerPhone,
      snapshotSeller.phone,
      onboarding.phone,
      onboarding.sellerPhone,
      lead.contact?.phone,
      lead.sellerPhone,
      lead.phone,
    ),
    sellerDomiciliumAddress: firstText(
      packetDraft.sellerDomiciliumAddress,
      snapshotSeller.domiciliumAddress,
      onboarding.domiciliumAddress,
      onboarding.domicilium_address,
      onboarding.residentialAddress,
      onboarding.physicalAddress,
      lead.address,
    ),
    sellerRepresentativeName: firstText(
      packetDraft.sellerRepresentativeName,
      snapshotSeller.representativeName,
      onboarding.representativeName,
      onboarding.companyRepresentativeName,
      onboarding.trustRepresentativeName,
    ),
    sellerRepresentativeCapacity: firstText(
      packetDraft.sellerRepresentativeCapacity,
      snapshotSeller.representativeCapacity,
      onboarding.representativeCapacity,
      onboarding.companyDirectorCapacity,
      onboarding.trusteeCapacity,
    ),
    sellerMaritalRegime: firstText(
      packetDraft.sellerMaritalRegime,
      snapshotSeller.maritalRegime,
      snapshotSeller.maritalStatus,
      onboarding.maritalRegime,
      onboarding.maritalStatus,
      onboarding.marital_status,
    ),
    sellerSpouseFullName: firstText(packetDraft.sellerSpouseFullName, snapshotSeller.spouseFullName, onboarding.spouseFullName, onboarding.spouse_name),
    sellerSpouseIdNumber: firstText(packetDraft.sellerSpouseIdNumber, snapshotSeller.spouseIdNumber, onboarding.spouseIdNumber, onboarding.spouse_id_number),
    sellerSpouseEmail: firstText(packetDraft.sellerSpouseEmail, snapshotSeller.spouseEmail, onboarding.spouseEmail, onboarding.spouse_email),
    sellerTrusteeNames: firstText(packetDraft.sellerTrusteeNames, snapshotSeller.trusteeNames, onboarding.trusteeNames),
    sellerResolutionDate: toIsoDate(firstText(packetDraft.sellerResolutionDate, snapshotSeller.resolutionDate, onboarding.resolutionDate)),
    sellerAuthorityBasis: firstText(packetDraft.sellerAuthorityBasis, snapshotSeller.authorityBasis, onboarding.authorityBasis),
    propertyAddress: firstText(
      packetDraft.propertyAddress,
      snapshotProperty.fullAddress,
      snapshotProperty.address,
      onboarding.propertyAddress,
      onboarding.property_address,
      onboarding.address,
      privateListing.propertyAddress,
      privateListing.addressLine1,
      privateListing.address_line_1,
      lead.propertyAddress,
      lead.sellerPropertyAddress,
      lead.addressLine1,
      lead.propertyInterest,
    ),
    propertySuburb: firstText(
      packetDraft.propertySuburb,
      snapshotProperty.suburb,
      onboarding.suburb,
      privateListing.suburb,
      lead.suburb,
      lead.areaInterest,
    ),
    propertyCity: firstText(
      packetDraft.propertyCity,
      snapshotProperty.city,
      onboarding.city,
      privateListing.city,
      lead.city,
    ),
    propertyType: firstText(
      packetDraft.propertyType,
      snapshotProperty.propertyType,
      snapshotProperty.type,
      onboarding.propertyType,
      onboarding.propertyStructureType,
      privateListing.propertyType,
      lead.propertyType,
      lead.propertyInterest,
    ),
    propertyTitleType: firstText(
      packetDraft.propertyTitleType,
      snapshotProperty.propertyTitleType,
      snapshotProperty.titleType,
      onboarding.propertyTitleType,
      onboarding.propertyStructureType,
    ),
    unitNumber: firstText(
      packetDraft.unitNumber,
      snapshotProperty.unitNumber,
      onboarding.unitNumber,
      onboarding.unit_number,
      privateListing.unitNumber,
      privateListing.unit_number,
      lead.unitNumber,
    ),
    complexName: firstText(
      packetDraft.complexName,
      snapshotProperty.complexName,
      snapshotProperty.estateComplexName,
      onboarding.complexName,
      onboarding.complex_name,
      onboarding.estateComplexName,
      lead.complexName,
      lead.estateComplexName,
    ),
    erfNumber: firstText(
      packetDraft.erfNumber,
      snapshotProperty.erfNumber,
      onboarding.erfNumber,
      onboarding.erf,
      privateListing.erfNumber,
      lead.erfNumber,
    ),
    mandateType: normalizeKey(firstText(packetDraft.mandateType, snapshotMandate.type, onboarding.mandateType, onboarding.mandate_type, lead.mandateType, 'sole')) || 'sole',
    commissionStructure: normalizeKey(firstText(
      packetDraft.commissionStructure,
      snapshotMandate.commissionStructure,
      onboarding.commissionStructure,
      onboarding.commissionType,
      onboarding.commission_type,
      lead.commissionStructure,
      'percentage',
    )) || 'percentage',
    commissionPercent: String(firstText(
      packetDraft.commissionPercent,
      snapshotMandate.commissionPercent,
      snapshotMandate.commissionPercentage,
      onboarding.commissionPercentage,
      onboarding.commissionPercent,
      onboarding.commission_percentage,
      onboarding.mandateCommissionPercent,
      transactionOnboarding.commissionPercentage,
      transactionOnboarding.commissionPercent,
      lead.commissionPercent,
      lead.mandateCommissionPercent,
      '7.5',
    )),
    commissionAmount: String(firstText(
      packetDraft.commissionAmount,
      snapshotMandate.commissionAmount,
      onboarding.commissionAmount,
      onboarding.commission_amount,
      onboarding.mandateCommissionAmount,
      transactionOnboarding.commissionAmount,
      lead.commissionAmount,
    )),
    vatHandling: normalizeKey(firstText(
      packetDraft.vatHandling,
      snapshotMandate.vatHandling,
      onboarding.vatHandling,
      onboarding.vat_handling,
      transactionOnboarding.vatHandling,
      lead.vatHandling,
      'exclusive',
    )) || 'exclusive',
    mandateStartDate: toIsoDate(firstText(
      packetDraft.mandateStartDate,
      snapshotMandate.startDate,
      snapshotMandate.mandateStartDate,
      onboarding.mandateStartDate,
      onboarding.mandate_start_date,
      onboarding.startDate,
      transactionOnboarding.mandateStartDate,
      transactionOnboarding.startDate,
      lead.mandateStartDate,
      privateListing.mandateStartDate,
    )) || addDaysToIsoDate(0),
    mandateEndDate: toIsoDate(firstText(
      packetDraft.mandateEndDate,
      snapshotMandate.expiryDate,
      snapshotMandate.endDate,
      snapshotMandate.mandateEndDate,
      onboarding.mandateExpiryDate,
      onboarding.mandate_expiry_date,
      onboarding.mandateEndDate,
      onboarding.mandate_end_date,
      onboarding.expiryDate,
      transactionOnboarding.mandateExpiryDate,
      transactionOnboarding.mandateEndDate,
      transactionOnboarding.expiryDate,
      lead.mandateEndDate,
      privateListing.mandateEndDate,
    )) || addDaysToIsoDate(90),
    askingPrice: String(firstText(
      packetDraft.askingPrice,
      snapshotMandate.askingPrice,
      onboarding.askingPrice,
      onboarding.marketingPrice,
      transactionOnboarding.askingPrice,
      transactionOnboarding.marketingPrice,
      lead.estimatedValue,
      lead.estimatedPrice,
      lead.budget,
      privateListing.askingPrice,
    )),
    specialConditions: firstText(
      packetDraft.specialConditions,
      snapshotMandate.specialConditions,
      onboarding.specialConditions,
      onboarding.additionalConditions,
      onboarding.additional_conditions,
      transactionOnboarding.specialConditions,
      lead.specialConditions,
    ),
    transferAttorneyPreferredPartnerId: firstText(
      packetDraft.transferAttorneyPreferredPartnerId,
      snapshotTransferAttorney.preferredPartnerId,
      onboardingTransferAttorney.preferredPartnerId,
    ),
    transferAttorneyPartnerOrganisationId: firstText(
      packetDraft.transferAttorneyPartnerOrganisationId,
      snapshotTransferAttorney.partnerOrganisationId,
      onboardingTransferAttorney.partnerOrganisationId,
    ),
    transferAttorneyCompanyName: firstText(
      packetDraft.transferAttorneyCompanyName,
      snapshotTransferAttorney.companyName,
      onboardingTransferAttorney.companyName,
    ),
    transferAttorneyContactPerson: firstText(
      packetDraft.transferAttorneyContactPerson,
      snapshotTransferAttorney.contactPerson,
      onboardingTransferAttorney.contactPerson,
    ),
    transferAttorneyEmail: firstText(
      packetDraft.transferAttorneyEmail,
      snapshotTransferAttorney.email,
      onboardingTransferAttorney.email,
    ),
    transferAttorneyPhone: firstText(
      packetDraft.transferAttorneyPhone,
      snapshotTransferAttorney.phone,
      onboardingTransferAttorney.phone,
    ),
    transferAttorneySelectionSource: firstText(
      packetDraft.transferAttorneySelectionSource,
      snapshotTransferAttorney.selectionSource,
      onboardingTransferAttorney.selectionSource,
      'seller_mandate',
    ),
    transferAttorneySelectionDeferred: Boolean(
      packetDraft.transferAttorneySelectionDeferred || snapshotTransferAttorney.selectionDeferred,
    ),
  }
}

function buildOtpDraftDefaults({ transactionDetail = null, initialStatus = null, leadContext = {} } = {}) {
  const transaction = transactionDetail?.transaction && typeof transactionDetail.transaction === 'object' ? transactionDetail.transaction : {}
  const buyer = transactionDetail?.buyer && typeof transactionDetail.buyer === 'object' ? transactionDetail.buyer : {}
  const unit = transactionDetail?.unit && typeof transactionDetail.unit === 'object' ? transactionDetail.unit : {}
  const onboarding =
    transactionDetail?.onboardingFormData?.formData ||
    transactionDetail?.onboardingFormData ||
    {}
  const sellerDetails = resolveDevelopmentSellerDetailsFromTransactionDetail(transactionDetail)
  const sellerSignatory = sellerDetails?.signatory && typeof sellerDetails.signatory === 'object' ? sellerDetails.signatory : {}
  const privateListing =
    leadContext?.privateListing && typeof leadContext.privateListing === 'object'
      ? leadContext.privateListing
      : leadContext?.listing && typeof leadContext.listing === 'object'
        ? leadContext.listing
        : {}
  const packetSourceContext =
    initialStatus?.packet?.source_context_json && typeof initialStatus.packet.source_context_json === 'object'
      ? initialStatus.packet.source_context_json
      : {}
  const nestedSourceContext = packetSourceContext?.sourceContext && typeof packetSourceContext.sourceContext === 'object'
    ? packetSourceContext.sourceContext
    : packetSourceContext?.source_context && typeof packetSourceContext.source_context === 'object'
      ? packetSourceContext.source_context
      : {}
  const generatedSnapshot =
    initialStatus?.versions?.[0]?.validation_summary_json?.generatedDataSnapshot &&
    typeof initialStatus.versions[0].validation_summary_json.generatedDataSnapshot === 'object'
      ? initialStatus.versions[0].validation_summary_json.generatedDataSnapshot
      : packetSourceContext?.generatedDataSnapshot && typeof packetSourceContext.generatedDataSnapshot === 'object'
        ? packetSourceContext.generatedDataSnapshot
        : {}
  const packetDraft =
    packetSourceContext?.otpDraft && typeof packetSourceContext.otpDraft === 'object'
      ? packetSourceContext.otpDraft
      : nestedSourceContext?.otpDraft && typeof nestedSourceContext.otpDraft === 'object'
        ? nestedSourceContext.otpDraft
        : generatedSnapshot?.otpDraft && typeof generatedSnapshot.otpDraft === 'object'
          ? generatedSnapshot.otpDraft
          : {}
  const sourceProperty =
    nestedSourceContext?.property && typeof nestedSourceContext.property === 'object'
      ? nestedSourceContext.property
      : {}
  const sourceSeller =
    nestedSourceContext?.seller && typeof nestedSourceContext.seller === 'object'
      ? nestedSourceContext.seller
      : {}
  const sourceBuyer =
    nestedSourceContext?.buyer && typeof nestedSourceContext.buyer === 'object'
      ? nestedSourceContext.buyer
      : {}
  const sourceOffer =
    nestedSourceContext?.offer && typeof nestedSourceContext.offer === 'object'
      ? nestedSourceContext.offer
      : {}
  const offerConditions =
    sourceOffer?.conditions && typeof sourceOffer.conditions === 'object'
      ? sourceOffer.conditions
      : {}
  const purchaserRows = Array.isArray(onboarding.purchasers) ? onboarding.purchasers : []
  const primaryPurchaser = purchaserRows[0] && typeof purchaserRows[0] === 'object' ? purchaserRows[0] : {}
  const secondaryPurchaser = purchaserRows[1] && typeof purchaserRows[1] === 'object' ? purchaserRows[1] : {}
  const buyerFirstName = firstText(onboarding.firstName, onboarding.buyerFirstName)
  const buyerLastName = firstText(onboarding.lastName, onboarding.surname, onboarding.buyerLastName)
  const buyerFullName = firstText(
    packetDraft.buyerFullName,
    sourceBuyer.fullName,
    sourceBuyer.name,
    primaryPurchaser.name,
    primaryPurchaser.fullName,
    primaryPurchaser.full_name,
    buyer.name,
    onboarding.fullName,
    onboarding.full_name,
    [buyerFirstName, buyerLastName].map(normalizeText).filter(Boolean).join(' '),
  )
  const propertyAddress = firstText(
    packetDraft.propertyAddress,
    sourceProperty.address,
    sourceProperty.propertyAddress,
    transaction.property_address_line_1,
    transaction.property_address,
    onboarding.propertyAddress,
    onboarding.property_address,
    privateListing.propertyAddress,
    privateListing.addressLine1,
    privateListing.address_line_1,
    unit?.development?.address,
    leadContext?.lead?.sellerPropertyAddress,
    leadContext?.lead?.propertyInterest,
  )

  return {
    buyerEntityType: normalizeEntityType(firstText(
      packetDraft.buyerEntityType,
      sourceBuyer.entityType,
      transaction.purchaser_type,
      onboarding.purchaserType,
      onboarding.purchaser_type,
    )),
    buyerFullName,
    buyerIdNumber: firstText(
      packetDraft.buyerIdNumber,
      sourceBuyer.idNumber,
      sourceBuyer.registrationNumber,
      primaryPurchaser.idNumber,
      primaryPurchaser.id_number,
      primaryPurchaser.identityNumber,
      onboarding.idNumber,
      onboarding.identityNumber,
      onboarding.companyRegistrationNumber,
      onboarding.trustRegistrationNumber,
    ),
    buyerEmail: firstText(packetDraft.buyerEmail, sourceBuyer.email, primaryPurchaser.email, buyer.email, onboarding.email, onboarding.buyerEmail),
    buyerPhone: firstText(packetDraft.buyerPhone, sourceBuyer.phone, primaryPurchaser.phone, buyer.phone, onboarding.phone, onboarding.buyerPhone),
    buyerDomiciliumAddress: firstText(
      packetDraft.buyerDomiciliumAddress,
      sourceBuyer.domiciliumAddress,
      onboarding.residentialAddress,
      onboarding.physicalAddress,
      onboarding.domiciliumAddress,
    ),
    buyerRepresentativeName: firstText(packetDraft.buyerRepresentativeName, sourceBuyer.representativeName, onboarding.authorizedRepresentativeName, onboarding.authorisedRepresentativeName),
    buyerRepresentativeCapacity: firstText(packetDraft.buyerRepresentativeCapacity, sourceBuyer.representativeCapacity, onboarding.authorizedRepresentativeCapacity, onboarding.authorisedRepresentativeCapacity),
    buyerMaritalRegime: firstText(packetDraft.buyerMaritalRegime, sourceBuyer.maritalRegime, sourceBuyer.maritalStatus, onboarding.maritalRegime, onboarding.maritalStatus),
    buyerSpouseFullName: firstText(packetDraft.buyerSpouseFullName, sourceBuyer.spouseFullName, onboarding.spouseFullName, onboarding.spouse_name),
    buyerSpouseIdNumber: firstText(packetDraft.buyerSpouseIdNumber, sourceBuyer.spouseIdNumber, onboarding.spouseIdNumber, onboarding.spouse_id_number),
    buyerSpouseEmail: firstText(packetDraft.buyerSpouseEmail, sourceBuyer.spouseEmail, onboarding.spouseEmail, onboarding.spouse_email),
    buyerTrusteeNames: firstText(packetDraft.buyerTrusteeNames, sourceBuyer.trusteeNames, onboarding.trusteeNames),
    buyerResolutionDate: toIsoDate(firstText(packetDraft.buyerResolutionDate, sourceBuyer.resolutionDate, onboarding.resolutionDate)),
    buyerAuthorityBasis: firstText(packetDraft.buyerAuthorityBasis, sourceBuyer.authorityBasis, onboarding.authorityBasis),
    coBuyerFullName: firstText(packetDraft.coBuyerFullName, secondaryPurchaser.name, secondaryPurchaser.fullName, secondaryPurchaser.full_name, onboarding.co_buyer_name, onboarding.coBuyerName, onboarding.co_buyer_full_name, onboarding.coBuyerFullName),
    coBuyerEmail: firstText(packetDraft.coBuyerEmail, secondaryPurchaser.email, onboarding.co_buyer_email, onboarding.coBuyerEmail),
    coBuyerPhone: firstText(packetDraft.coBuyerPhone, secondaryPurchaser.phone, onboarding.co_buyer_phone, onboarding.coBuyerPhone),
    coBuyerIdNumber: firstText(packetDraft.coBuyerIdNumber, secondaryPurchaser.idNumber, secondaryPurchaser.id_number, secondaryPurchaser.identityNumber, onboarding.co_buyer_id_number, onboarding.coBuyerIdNumber, onboarding.co_buyer_identity_number, onboarding.coBuyerIdentityNumber),

    sellerEntityType: normalizeEntityType(firstText(packetDraft.sellerEntityType, sourceSeller.entityType, sellerDetails.entityType, transaction.seller_type)),
    sellerFullName: firstText(
      packetDraft.sellerFullName,
      sourceSeller.fullName,
      sourceSeller.name,
      sellerDetails.legalName,
      sellerDetails.tradingName,
      unit?.development?.developer_company,
      unit?.development?.name,
      transaction.matter_owner,
    ),
    sellerIdNumber: firstText(packetDraft.sellerIdNumber, sourceSeller.idNumber, sourceSeller.registrationNumber, sellerDetails.registrationNumber, transaction.seller_registration_number),
    sellerEmail: firstText(packetDraft.sellerEmail, sourceSeller.email, sellerDetails.email),
    sellerPhone: firstText(packetDraft.sellerPhone, sourceSeller.phone, sellerDetails.phone),
    sellerRegisteredAddress: firstText(packetDraft.sellerRegisteredAddress, sourceSeller.registeredAddress, sellerDetails.registeredAddress, sellerDetails.postalAddress),
    sellerRepresentativeName: firstText(packetDraft.sellerRepresentativeName, sourceSeller.representativeName, sellerSignatory.fullName),
    sellerRepresentativeCapacity: firstText(packetDraft.sellerRepresentativeCapacity, sourceSeller.representativeCapacity, sellerSignatory.signingCapacity, sellerSignatory.role),
    sellerRepresentativeEmail: firstText(packetDraft.sellerRepresentativeEmail, sourceSeller.representativeEmail, sellerSignatory.email),
    sellerRepresentativePhone: firstText(packetDraft.sellerRepresentativePhone, sourceSeller.representativePhone, sellerSignatory.phone),
    sellerRepresentativeIdNumber: firstText(packetDraft.sellerRepresentativeIdNumber, sourceSeller.representativeIdNumber, sellerSignatory.idNumber),
    sellerMaritalRegime: firstText(packetDraft.sellerMaritalRegime, sourceSeller.maritalRegime, sourceSeller.maritalStatus, sellerDetails.maritalRegime, sellerDetails.maritalStatus),
    sellerSpouseFullName: firstText(packetDraft.sellerSpouseFullName, sourceSeller.spouseFullName, sellerDetails.spouseFullName),
    sellerSpouseIdNumber: firstText(packetDraft.sellerSpouseIdNumber, sourceSeller.spouseIdNumber, sellerDetails.spouseIdNumber),
    sellerSpouseEmail: firstText(packetDraft.sellerSpouseEmail, sourceSeller.spouseEmail, sellerDetails.spouseEmail),
    sellerTrusteeNames: firstText(packetDraft.sellerTrusteeNames, sourceSeller.trusteeNames, sellerDetails.trusteeNames),
    sellerResolutionDate: toIsoDate(firstText(packetDraft.sellerResolutionDate, sourceSeller.resolutionDate, sellerDetails.resolutionDate)),
    sellerAuthorityBasis: firstText(packetDraft.sellerAuthorityBasis, sourceSeller.authorityBasis, sellerDetails.authorityBasis),

    propertyAddress,
    propertySuburb: firstText(packetDraft.propertySuburb, sourceProperty.suburb, transaction.suburb, onboarding.suburb, onboarding.propertySuburb, privateListing.suburb, unit?.development?.suburb),
    propertyCity: firstText(packetDraft.propertyCity, sourceProperty.city, transaction.city, onboarding.city, onboarding.propertyCity, privateListing.city, unit?.development?.city),
    propertyType: firstText(packetDraft.propertyType, sourceProperty.propertyType, transaction.property_type, onboarding.propertyType, unit?.property_type, privateListing.propertyType),
    propertyTitleType: firstText(packetDraft.propertyTitleType, sourceProperty.propertyTitleType, sourceProperty.titleType, transaction.property_title_type, onboarding.propertyTitleType),
    unitNumber: firstText(packetDraft.unitNumber, sourceProperty.unitNumber, unit.unit_number, onboarding.unitNumber, onboarding.unit_number, privateListing.unitNumber),
    complexName: firstText(packetDraft.complexName, sourceProperty.complexName, onboarding.complexName, onboarding.estateComplexName, privateListing.complexName),
    erfNumber: firstText(packetDraft.erfNumber, sourceProperty.erfNumber, onboarding.erfNumber, privateListing.erfNumber),

    purchasePrice: String(firstText(packetDraft.purchasePrice, sourceOffer.purchasePrice, transaction.purchase_price, transaction.sales_price, unit.price)),
    depositAmount: String(firstText(packetDraft.depositAmount, sourceOffer.depositAmount, transaction.deposit_amount, onboarding.depositAmount, onboarding.deposit_amount)),
    financeType: normalizeOtpFinanceType(firstText(packetDraft.financeType, sourceOffer.financeType, transaction.finance_type, onboarding.financeType, onboarding.finance_type)),
    bondAmount: String(firstText(packetDraft.bondAmount, sourceOffer.bondAmount, transaction.bond_amount, onboarding.bondAmount, onboarding.bond_amount)),
    cashAmount: String(firstText(packetDraft.cashAmount, sourceOffer.cashAmount, transaction.cash_amount, onboarding.cashAmount, onboarding.cash_amount)),
    occupationDate: toIsoDate(firstText(packetDraft.occupationDate, offerConditions.occupationDate, offerConditions.occupation_date, onboarding.occupationDate, onboarding.occupation_date)),
    transferDate: toIsoDate(firstText(packetDraft.transferDate, sourceOffer.transferDate, sourceOffer.transfer_date, transaction.expected_transfer_date, transaction.target_registration_date, onboarding.transferDate, onboarding.transfer_date)),
    suspensiveConditions: firstText(packetDraft.suspensiveConditions, offerConditions.suspensiveConditions, offerConditions.suspensive_conditions, onboarding.suspensiveConditions, onboarding.suspensive_conditions),
    specialConditions: firstText(packetDraft.specialConditions, nestedSourceContext.specialConditions, onboarding.specialConditions, onboarding.special_conditions),
  }
}

function buildOtpDraftGenerationOverrides({
  transaction = null,
  buyer = null,
  sellerDetails = null,
  onboardingFormData = null,
  otpDraft = {},
} = {}) {
  const draft = sanitizeLegalDocumentScenarioDraft(
    otpDraft && typeof otpDraft === 'object' ? otpDraft : {},
    { packetType: 'otp' },
  )
  const purchasePrice = parseDraftMoney(draft.purchasePrice)
  const depositAmount = parseDraftMoney(draft.depositAmount)
  const bondAmount = parseDraftMoney(draft.bondAmount)
  const cashAmount = parseDraftMoney(draft.cashAmount)
  const buyerEntityType = normalizeEntityType(draft.buyerEntityType)
  const sellerEntityType = normalizeEntityType(draft.sellerEntityType)
  const financeType = normalizeOtpFinanceType(draft.financeType)
  const propertyTitleType = normalizeLegalPropertyTitleType(draft.propertyTitleType)
  const existingTransaction = transaction && typeof transaction === 'object' ? transaction : {}
  const existingBuyer = buyer && typeof buyer === 'object' ? buyer : {}
  const existingSeller = sellerDetails && typeof sellerDetails === 'object' ? sellerDetails : {}
  const existingSignatory = existingSeller.signatory && typeof existingSeller.signatory === 'object' ? existingSeller.signatory : {}
  const existingOnboarding = onboardingFormData && typeof onboardingFormData === 'object' ? onboardingFormData : {}

  const transactionPatch = compactObjectValues({
    purchaser_type: buyerEntityType,
    finance_type: financeType,
    property_address_line_1: draft.propertyAddress,
    property_address: draft.propertyAddress,
    suburb: draft.propertySuburb,
    city: draft.propertyCity,
    property_type: draft.propertyType,
    property_title_type: propertyTitleType,
    seller_type: sellerEntityType,
    seller_registration_number: draft.sellerIdNumber,
  })
  if (purchasePrice !== null) transactionPatch.purchase_price = purchasePrice
  if (depositAmount !== null) transactionPatch.deposit_amount = depositAmount
  if (bondAmount !== null) transactionPatch.bond_amount = bondAmount
  if (cashAmount !== null) transactionPatch.cash_amount = cashAmount

  const nextTransaction = {
    ...existingTransaction,
    ...transactionPatch,
  }
  const nextBuyer = {
    ...existingBuyer,
    ...compactObjectValues({
      name: draft.buyerFullName,
      email: draft.buyerEmail,
      phone: draft.buyerPhone,
      maritalRegime: draft.buyerMaritalRegime,
      maritalStatus: draft.buyerMaritalRegime,
      spouseFullName: draft.buyerSpouseFullName,
      spouseIdNumber: draft.buyerSpouseIdNumber,
      spouseEmail: draft.buyerSpouseEmail,
      trusteeNames: draft.buyerTrusteeNames,
      resolutionDate: draft.buyerResolutionDate,
      authorityBasis: draft.buyerAuthorityBasis,
    }),
  }
  const nextSellerDetails = {
    ...existingSeller,
    ...compactObjectValues({
      entityType: sellerEntityType,
      legalName: draft.sellerFullName,
      tradingName: draft.sellerFullName,
      registrationNumber: draft.sellerIdNumber,
      email: draft.sellerEmail,
      phone: draft.sellerPhone,
      registeredAddress: draft.sellerRegisteredAddress,
      postalAddress: draft.sellerRegisteredAddress,
      maritalRegime: draft.sellerMaritalRegime,
      maritalStatus: draft.sellerMaritalRegime,
      spouseFullName: draft.sellerSpouseFullName,
      spouseIdNumber: draft.sellerSpouseIdNumber,
      spouseEmail: draft.sellerSpouseEmail,
      trusteeNames: draft.sellerTrusteeNames,
      resolutionDate: draft.sellerResolutionDate,
      authorityBasis: draft.sellerAuthorityBasis,
    }),
    signatory: {
      ...existingSignatory,
      ...compactObjectValues({
        fullName: draft.sellerRepresentativeName,
        role: draft.sellerRepresentativeCapacity,
        signingCapacity: draft.sellerRepresentativeCapacity,
        idNumber: draft.sellerRepresentativeIdNumber,
        email: draft.sellerRepresentativeEmail || draft.sellerEmail,
        phone: draft.sellerRepresentativePhone || draft.sellerPhone,
      }),
    },
  }
  const draftPurchasers = [
    compactObjectValues({
      name: draft.buyerFullName,
      idNumber: draft.buyerIdNumber,
      email: draft.buyerEmail,
      phone: draft.buyerPhone,
    }),
    compactObjectValues({
      name: draft.coBuyerFullName,
      idNumber: draft.coBuyerIdNumber,
      email: draft.coBuyerEmail,
      phone: draft.coBuyerPhone,
    }),
  ].filter((party) => Object.keys(party).length)
  const nextOnboardingFormData = {
    ...existingOnboarding,
    ...compactObjectValues({
      purchaserType: buyerEntityType,
      purchaser_type: buyerEntityType,
      fullName: draft.buyerFullName,
      full_name: draft.buyerFullName,
      idNumber: draft.buyerIdNumber,
      identityNumber: draft.buyerIdNumber,
      companyRegistrationNumber: ['company', 'close_corporation'].includes(buyerEntityType) ? draft.buyerIdNumber : '',
      trustRegistrationNumber: buyerEntityType === 'trust' ? draft.buyerIdNumber : '',
      email: draft.buyerEmail,
      phone: draft.buyerPhone,
      residentialAddress: draft.buyerDomiciliumAddress,
      physicalAddress: draft.buyerDomiciliumAddress,
      authorizedRepresentativeName: draft.buyerRepresentativeName,
      authorisedRepresentativeName: draft.buyerRepresentativeName,
      authorizedRepresentativeCapacity: draft.buyerRepresentativeCapacity,
      authorisedRepresentativeCapacity: draft.buyerRepresentativeCapacity,
      maritalRegime: draft.buyerMaritalRegime,
      maritalStatus: draft.buyerMaritalRegime,
      spouseFullName: draft.buyerSpouseFullName,
      spouseIdNumber: draft.buyerSpouseIdNumber,
      spouseEmail: draft.buyerSpouseEmail,
      trusteeNames: draft.buyerTrusteeNames,
      resolutionDate: draft.buyerResolutionDate,
      authorityBasis: draft.buyerAuthorityBasis,
      co_buyer_name: draft.coBuyerFullName,
      coBuyerName: draft.coBuyerFullName,
      co_buyer_email: draft.coBuyerEmail,
      coBuyerEmail: draft.coBuyerEmail,
      co_buyer_phone: draft.coBuyerPhone,
      coBuyerPhone: draft.coBuyerPhone,
      co_buyer_id_number: draft.coBuyerIdNumber,
      coBuyerIdNumber: draft.coBuyerIdNumber,
      propertyAddress: draft.propertyAddress,
      property_address: draft.propertyAddress,
      suburb: draft.propertySuburb,
      propertySuburb: draft.propertySuburb,
      city: draft.propertyCity,
      propertyCity: draft.propertyCity,
      propertyType: draft.propertyType,
      propertyTitleType,
      property_title_type: propertyTitleType,
      unitNumber: draft.unitNumber,
      unit_number: draft.unitNumber,
      complexName: draft.complexName,
      estateComplexName: draft.complexName,
      erfNumber: draft.erfNumber,
      depositAmount: draft.depositAmount,
      deposit_amount: draft.depositAmount,
      financeType,
      finance_type: financeType,
      bondAmount: draft.bondAmount,
      bond_amount: draft.bondAmount,
      cashAmount: draft.cashAmount,
      cash_amount: draft.cashAmount,
      occupationDate: draft.occupationDate,
      occupation_date: draft.occupationDate,
      transferDate: draft.transferDate,
      transfer_date: draft.transferDate,
      suspensiveConditions: draft.suspensiveConditions,
      suspensive_conditions: draft.suspensiveConditions,
      specialConditions: draft.specialConditions,
      special_conditions: draft.specialConditions,
    }),
  }
  if (draftPurchasers.length) {
    nextOnboardingFormData.purchasers = draftPurchasers
  }

  const sourceContext = {
    otpDraft: draft,
    buyer: compactObjectValues({
      entityType: buyerEntityType,
      fullName: draft.buyerFullName,
      name: draft.buyerFullName,
      idNumber: draft.buyerIdNumber,
      registrationNumber: draft.buyerIdNumber,
      email: draft.buyerEmail,
      phone: draft.buyerPhone,
      representativeName: draft.buyerRepresentativeName,
      representativeCapacity: draft.buyerRepresentativeCapacity,
      maritalRegime: draft.buyerMaritalRegime,
      maritalStatus: draft.buyerMaritalRegime,
      spouseFullName: draft.buyerSpouseFullName,
      spouseIdNumber: draft.buyerSpouseIdNumber,
      spouseEmail: draft.buyerSpouseEmail,
      trusteeNames: draft.buyerTrusteeNames,
      resolutionDate: draft.buyerResolutionDate,
      authorityBasis: draft.buyerAuthorityBasis,
      domiciliumAddress: draft.buyerDomiciliumAddress,
    }),
    seller: compactObjectValues({
      entityType: sellerEntityType,
      fullName: draft.sellerFullName,
      name: draft.sellerFullName,
      idNumber: draft.sellerIdNumber,
      registrationNumber: draft.sellerIdNumber,
      email: draft.sellerEmail,
      phone: draft.sellerPhone,
      registeredAddress: draft.sellerRegisteredAddress,
      representativeName: draft.sellerRepresentativeName,
      representativeCapacity: draft.sellerRepresentativeCapacity,
      representativeEmail: draft.sellerRepresentativeEmail || draft.sellerEmail,
      representativePhone: draft.sellerRepresentativePhone || draft.sellerPhone,
      representativeIdNumber: draft.sellerRepresentativeIdNumber,
      maritalRegime: draft.sellerMaritalRegime,
      maritalStatus: draft.sellerMaritalRegime,
      spouseFullName: draft.sellerSpouseFullName,
      spouseIdNumber: draft.sellerSpouseIdNumber,
      spouseEmail: draft.sellerSpouseEmail,
      trusteeNames: draft.sellerTrusteeNames,
      resolutionDate: draft.sellerResolutionDate,
      authorityBasis: draft.sellerAuthorityBasis,
    }),
    property: compactObjectValues({
      address: draft.propertyAddress,
      propertyAddress: draft.propertyAddress,
      suburb: draft.propertySuburb,
      city: draft.propertyCity,
      propertyType: draft.propertyType,
      propertyTitleType,
      titleType: propertyTitleType,
      unitNumber: draft.unitNumber,
      complexName: draft.complexName,
      estateComplexName: draft.complexName,
      erfNumber: draft.erfNumber,
    }),
    offer: {
      ...compactObjectValues({
        purchasePrice: draft.purchasePrice,
        depositAmount: draft.depositAmount,
        financeType,
        bondAmount: draft.bondAmount,
        cashAmount: draft.cashAmount,
        occupationDate: draft.occupationDate,
        transferDate: draft.transferDate,
      }),
      conditions: compactObjectValues({
        suspensiveConditions: draft.suspensiveConditions,
        specialConditions: draft.specialConditions,
      }),
    },
    signatureParties: compactObjectValues({
      buyerName: draft.buyerRepresentativeName || draft.buyerFullName,
      sellerName: draft.sellerRepresentativeName || draft.sellerFullName,
    }),
  }

  return {
    otpDraft: draft,
    transaction: nextTransaction,
    buyer: nextBuyer,
    sellerDetails: nextSellerDetails,
    onboardingFormData: nextOnboardingFormData,
    specialConditions: firstText(draft.specialConditions),
    sourceContext,
    generatedDataSnapshot: {
      otpDraft: draft,
      transaction: nextTransaction,
      buyer: nextBuyer,
      sellerDetails: nextSellerDetails,
      onboardingFormData: nextOnboardingFormData,
      sourceContext,
    },
  }
}

const LEGAL_WORKSPACE_ROUTE_TIMEOUT_MS = 3500
const LEGAL_WORKSPACE_GENERATION_TIMEOUT_MS = 65000
const LEGAL_WORKSPACE_PACKET_SAVE_TIMEOUT_MS = 18000
const LEGAL_WORKSPACE_SIGNING_EMAIL_TIMEOUT_MS = 20000

function withLegalWorkspaceTimeout(task, message, timeoutMs = LEGAL_WORKSPACE_ROUTE_TIMEOUT_MS) {
  let timeoutId = null
  return Promise.race([
    task,
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
    }),
  ]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })
}

function buildFallbackPacketStatus(packetType = 'mandate', warning = '') {
  return {
    packetType: ['mandate', 'otp'].includes(normalizeKey(packetType)) ? normalizeKey(packetType) : 'mandate',
    state: 'NO_PACKET',
    packet: null,
    versions: [],
    signingSummary: null,
    warnings: warning ? [warning] : [],
    actionHint: 'No packet record was found for this context.',
  }
}

export default function LegalDocumentWorkspacePage() {
  const navigate = useNavigate()
  const params = useParams()
  const [searchParams] = useSearchParams()
  const { profile, role } = useWorkspace()
  const [loadingContext, setLoadingContext] = useState(true)
  const [pageError, setPageError] = useState('')
  const [transactionDetail, setTransactionDetail] = useState(null)
  const [organisationId, setOrganisationId] = useState(null)
  const [workspaceBranding, setWorkspaceBranding] = useState(null)
  const [workspaceSettings, setWorkspaceSettings] = useState(null)
  const [leadContext, setLeadContext] = useState({ lead: null, contact: null, linkedTransaction: null })
  const [contextHydrated, setContextHydrated] = useState(false)
  const [routeContextSettled, setRouteContextSettled] = useState(false)
  const [initialStatus, setInitialStatus] = useState(null)
  const [validatedRoutePacketId, setValidatedRoutePacketId] = useState('')
  const [otpDraftOverrides, setOtpDraftOverrides] = useState({})
  const [mandateEssentialsConfirmed, setMandateEssentialsConfirmed] = useState(false)
  const [preferredTransferAttorneys, setPreferredTransferAttorneys] = useState([])
  const [preferredTransferAttorneysLoading, setPreferredTransferAttorneysLoading] = useState(false)
  const [preferredTransferAttorneysError, setPreferredTransferAttorneysError] = useState('')
  const [selectedTransferAttorneyId, setSelectedTransferAttorneyId] = useState('')
  const [transferAttorneySelectionDeferred, setTransferAttorneySelectionDeferred] = useState(false)
  const [runtimeRolloutAccess, setRuntimeRolloutAccess] = useState({ organisationId: '', decision: null })
  const initialStatusRef = useRef(null)
  const initialStatusValueRef = useRef(initialStatus)
  const hasRenderedContextRef = useRef(false)
  const hydratedRouteContextKeyRef = useRef('')

  useEffect(() => {
    initialStatusRef.current = initialStatus
    initialStatusValueRef.current = initialStatus
  }, [initialStatus])

  const applyInitialStatus = useCallback((nextStatus) => {
    initialStatusRef.current = nextStatus
    initialStatusValueRef.current = nextStatus
    setInitialStatus(nextStatus)
  }, [])

  const rawRoutePacketId = normalizeText(params.packetId || searchParams.get('packetId'))
  const routePacketId = isUuidLike(rawRoutePacketId) ? rawRoutePacketId : ''
  const routeLeadId = normalizeText(params.leadId || searchParams.get('leadId'))
  const routeListingId = normalizeText(params.listingId || searchParams.get('listingId'))
  const routeOfferId = normalizeText(params.offerId || searchParams.get('offerId'))
  const routeTransactionId = normalizeText(params.transactionId || searchParams.get('transactionId'))
  const mode = resolveModeFromQuery(searchParams.get('mode'))
  const returnTo = resolveSafeReturnPath(searchParams.get('returnTo'))
  const requestedPacketType = normalizeKey(params.packetType || searchParams.get('packetType'))
  const packetType = ['mandate', 'otp'].includes(requestedPacketType)
    ? requestedPacketType
    : normalizeKey(initialStatus?.packet?.packet_type || initialStatus?.packetType || 'mandate')
  const documentStartSourceMode = normalizeKey(searchParams.get('sourceMode'))
  const documentStartEntryPoint = normalizeKey(searchParams.get('documentStart'))

  useEffect(() => {
    if (loadingContext) return undefined
    let active = true
    const scopedOrganisationId = normalizeText(organisationId)
    fetchDocumentExperienceRuntimeRolloutAccess({ organisationId: scopedOrganisationId })
      .then((decision) => {
        if (active) setRuntimeRolloutAccess({ organisationId: scopedOrganisationId, decision })
      })
      .catch(() => {
        if (active) setRuntimeRolloutAccess({
          organisationId: scopedOrganisationId,
          decision: {
            contract: 'arch9-document-experience-runtime-rollout-gate-v1',
            allowed: true,
            status: 'shadow_allowed',
            code: 'N6_SHADOW_RUNTIME_CHECK_FAILED',
            configured: false,
            stage: 'legacy',
            revision: 0,
          },
        })
      })
    return () => { active = false }
  }, [loadingContext, organisationId])
  const documentStartLegalScenario = useMemo(
    () => readDocumentStartLegalScenarioParams(searchParams, packetType),
    [packetType, searchParams],
  )
  const autoCreateListingFromMandate = ['1', 'true', 'yes'].includes(normalizeKey(searchParams.get('autoCreateListing')))
  const actor = useMemo(() => buildAgentFromProfile(profile), [profile])

  const backPath = useMemo(() => {
    if (returnTo) return returnTo
    if (routeTransactionId) return `/transactions/${routeTransactionId}`
    if (routeListingId) return `/agent/listings/${routeListingId}`
    if (routeLeadId) return `/pipeline/leads/${routeLeadId}`
    return '/transactions'
  }, [returnTo, routeLeadId, routeListingId, routeTransactionId])

  const handleBack = useCallback(() => {
    navigate(backPath)
  }, [backPath, navigate])

  const mandateDraftDefaults = useMemo(
    () => buildMandateDraftDefaults({
      leadContext,
      initialStatus,
      transactionDetail,
    }),
    [initialStatus, leadContext, transactionDetail],
  )
  useEffect(() => {
    if (packetType !== 'mandate' || !organisationId) return undefined
    let active = true

    void Promise.resolve()
      .then(() => {
        if (!active) return []
        setPreferredTransferAttorneysLoading(true)
        setPreferredTransferAttorneysError('')
        return listOrganisationPreferredPartners()
      })
      .then((partners) => {
        if (!active) return
        const attorneys = (partners || []).filter((partner) => partner?.isActive && partner?.partnerType === 'transfer_attorney')
        setPreferredTransferAttorneys(attorneys)
        const savedAttorneyId = normalizeText(mandateDraftDefaults.transferAttorneyPreferredPartnerId)
        const defaultAttorney = attorneys.find((partner) => String(partner.id) === savedAttorneyId)
          || attorneys.find((partner) => partner.isPreferredDefault)
          || attorneys[0]
          || null
        setSelectedTransferAttorneyId(defaultAttorney?.id || savedAttorneyId || '')
        setTransferAttorneySelectionDeferred(Boolean(mandateDraftDefaults.transferAttorneySelectionDeferred))
      })
      .catch((error) => {
        if (!active) return
        setPreferredTransferAttorneys([])
        setPreferredTransferAttorneysError(error?.message || 'Preferred transfer attorneys could not be loaded.')
      })
      .finally(() => {
        if (active) setPreferredTransferAttorneysLoading(false)
      })

    return () => {
      active = false
    }
  }, [mandateDraftDefaults, organisationId, packetType, routeLeadId, routeListingId, routePacketId])
  const selectedTransferAttorney = useMemo(
    () => preferredTransferAttorneys.find((partner) => String(partner.id) === String(selectedTransferAttorneyId)) || null,
    [preferredTransferAttorneys, selectedTransferAttorneyId],
  )
  const effectiveMandateDraft = useMemo(() => ({
    ...mandateDraftDefaults,
    transferAttorneyPreferredPartnerId: transferAttorneySelectionDeferred ? '' : selectedTransferAttorney?.id || normalizeText(mandateDraftDefaults.transferAttorneyPreferredPartnerId),
    transferAttorneyPartnerOrganisationId: transferAttorneySelectionDeferred ? '' : selectedTransferAttorney?.partnerOrganisationId || normalizeText(mandateDraftDefaults.transferAttorneyPartnerOrganisationId),
    transferAttorneyCompanyName: transferAttorneySelectionDeferred ? '' : selectedTransferAttorney?.companyName || normalizeText(mandateDraftDefaults.transferAttorneyCompanyName),
    transferAttorneyContactPerson: transferAttorneySelectionDeferred ? '' : selectedTransferAttorney?.contactPerson || normalizeText(mandateDraftDefaults.transferAttorneyContactPerson),
    transferAttorneyEmail: transferAttorneySelectionDeferred ? '' : selectedTransferAttorney?.email || normalizeText(mandateDraftDefaults.transferAttorneyEmail),
    transferAttorneyPhone: transferAttorneySelectionDeferred ? '' : selectedTransferAttorney?.phone || normalizeText(mandateDraftDefaults.transferAttorneyPhone),
    transferAttorneySelectionSource: normalizeText(mandateDraftDefaults.transferAttorneySelectionSource) || 'seller_mandate',
    transferAttorneySelectionDeferred,
    ...(documentStartLegalScenario.sellerEntityType ? { sellerEntityType: documentStartLegalScenario.sellerEntityType } : {}),
    ...(documentStartLegalScenario.sellerMaritalRegime ? {
      sellerMaritalRegime: documentStartLegalScenario.sellerMaritalRegime,
      sellerMaritalStatus: documentStartLegalScenario.sellerMaritalRegime,
    } : {}),
    ...(documentStartLegalScenario.propertyTitleType ? {
      propertyTitleType: documentStartLegalScenario.propertyTitleType,
      propertyStructureType: documentStartLegalScenario.propertyTitleType,
    } : {}),
  }), [documentStartLegalScenario, mandateDraftDefaults, selectedTransferAttorney, transferAttorneySelectionDeferred])
  const showMandateDraftPanel =
    routeContextSettled &&
    packetType === 'mandate' &&
    mode === 'generate' &&
    !validatedRoutePacketId &&
    !initialStatus?.packet?.id &&
    !mandateEssentialsConfirmed
  const handleEditMandateSellerDetails = useCallback(() => {
    if (routeLeadId) {
      navigate(`/pipeline/leads/${encodeURIComponent(routeLeadId)}?sellerWorkspace=seller`)
      return
    }
    navigate(backPath)
  }, [backPath, navigate, routeLeadId])
  const handleConfirmMandateEssentials = useCallback(() => {
    if (!selectedTransferAttorneyId && !transferAttorneySelectionDeferred) {
      setPreferredTransferAttorneysError('Select the seller\'s transfer attorney or explicitly defer the nomination.')
      return
    }
    setPreferredTransferAttorneysError('')
    setMandateEssentialsConfirmed(true)
  }, [selectedTransferAttorneyId, transferAttorneySelectionDeferred])
  useEffect(() => {
    setMandateEssentialsConfirmed(false)
  }, [routeLeadId, routeListingId, routePacketId, routeTransactionId])
  const otpDraftDefaults = useMemo(
    () => buildOtpDraftDefaults({
      transactionDetail,
      initialStatus,
      leadContext,
    }),
    [initialStatus, leadContext, transactionDetail],
  )
  const effectiveOtpDraft = useMemo(
    () => ({
      ...otpDraftDefaults,
      ...(documentStartLegalScenario.sellerEntityType ? { sellerEntityType: documentStartLegalScenario.sellerEntityType } : {}),
      ...(documentStartLegalScenario.sellerMaritalRegime ? {
        sellerMaritalRegime: documentStartLegalScenario.sellerMaritalRegime,
        sellerMaritalStatus: documentStartLegalScenario.sellerMaritalRegime,
      } : {}),
      ...(documentStartLegalScenario.buyerEntityType ? { buyerEntityType: documentStartLegalScenario.buyerEntityType } : {}),
      ...(documentStartLegalScenario.buyerMaritalRegime ? {
        buyerMaritalRegime: documentStartLegalScenario.buyerMaritalRegime,
        buyerMaritalStatus: documentStartLegalScenario.buyerMaritalRegime,
      } : {}),
      ...(documentStartLegalScenario.propertyTitleType ? {
        propertyTitleType: documentStartLegalScenario.propertyTitleType,
        propertyStructureType: documentStartLegalScenario.propertyTitleType,
      } : {}),
      ...(documentStartLegalScenario.financeType ? { financeType: documentStartLegalScenario.financeType } : {}),
      ...otpDraftOverrides,
    }),
    [documentStartLegalScenario, otpDraftDefaults, otpDraftOverrides],
  )
  const showOtpDraftPanel =
    routeContextSettled &&
    packetType === 'otp' &&
    mode === 'generate' &&
    !validatedRoutePacketId &&
    !initialStatus?.packet?.id
  const updateOtpDraftField = useCallback((field, value) => {
    setOtpDraftOverrides((previous) => ({
      ...previous,
      [field]: value,
    }))
  }, [])
  const resetOtpDraftFields = useCallback(() => {
    setOtpDraftOverrides({})
  }, [])

  const loadRouteContext = useCallback(async () => {
    const nextRouteContextKey = [
      requestedPacketType,
      routePacketId,
      routeLeadId,
      routeListingId,
      routeTransactionId,
    ].map(normalizeText).join(':')
    const hasRenderedCurrentRoute = hasRenderedContextRef.current
      && hydratedRouteContextKeyRef.current === nextRouteContextKey

    setContextHydrated(false)
    setRouteContextSettled(hasRenderedCurrentRoute)
    setLoadingContext(!hasRenderedCurrentRoute)
    setPageError('')
    if (!hasRenderedCurrentRoute) setValidatedRoutePacketId('')
    let renderedFallback = false
    try {
      let resolvedOrganisationId = null
      let resolvedTransactionId = routeTransactionId
      let resolvedPacketType = requestedPacketType
      let effectiveRoutePacketId = routePacketId
      const packetOwnershipWarnings = []

      if (routePacketId) {
        let packet = null
        try {
          packet = await withLegalWorkspaceTimeout(
            fetchDocumentPacket(routePacketId, { includeVersions: false, includeEvents: false }),
            'Packet lookup is taking too long.',
          )
        } catch (packetLookupError) {
          const canContinueWithoutRoutePacket = Boolean(
            routeTransactionId ||
              routeLeadId ||
              routeListingId ||
              hasRenderedCurrentRoute ||
              normalizeText(initialStatusValueRef.current?.packet?.id),
          )
          if (!isLegalWorkspaceTimeoutError(packetLookupError) || !canContinueWithoutRoutePacket) {
            throw packetLookupError
          }
          effectiveRoutePacketId = normalizeText(initialStatusValueRef.current?.packet?.id)
          packetOwnershipWarnings.push('Packet lookup timed out. Arch9 kept this workspace open from the available lead or transaction context.')
          console.warn('[LegalDocumentWorkspacePage] route packet lookup timed out; continuing with available route context.', packetLookupError)
        }

        if (packet) {
          if (routeLeadId && !documentPacketBelongsToLead(packet, routeLeadId)) {
            effectiveRoutePacketId = ''
            packetOwnershipWarnings.push('The packet in this link belongs to another lead, so Arch9 ignored it for this workspace.')
          }
          resolvedPacketType = resolvedPacketType || normalizeKey(packet?.packet_type || packet?.packetType || 'mandate')
          if (effectiveRoutePacketId) {
            resolvedTransactionId = resolvedTransactionId || normalizeText(packet?.transaction_id || packet?.transactionId)
          }
          resolvedOrganisationId = normalizeText(packet?.organisation_id || packet?.organisationId) || null
        }
      }

      resolvedPacketType = resolvedPacketType || normalizeKey(
        initialStatusValueRef.current?.packet?.packet_type ||
          initialStatusValueRef.current?.packetType ||
          'mandate',
      )

      if (!['mandate', 'otp'].includes(resolvedPacketType)) {
        throw new Error('This legal document type is not supported.')
      }

      if (!resolvedTransactionId && !effectiveRoutePacketId && !routeLeadId && !routeListingId) {
        throw new Error('A transaction, packet, lead, or listing reference is required to open this workspace.')
      }

      let immediateLeadContext = findLeadContextAcrossStores({
        organisationId: null,
        leadId: routeLeadId,
      })
      if (!immediateLeadContext?.lead && routeLeadId) {
        const supabaseLeadContext = await withLegalWorkspaceTimeout(
          fetchLeadContextFromSupabase({
            organisationId: resolvedOrganisationId,
            leadId: routeLeadId,
          }),
          'Lead lookup is taking too long.',
          2500,
        ).catch(() => ({ lead: null, contact: null, linkedTransaction: null }))
        if (supabaseLeadContext?.lead) immediateLeadContext = supabaseLeadContext
      }
      if (routeListingId && (!immediateLeadContext?.lead || !normalizeText(immediateLeadContext.privateListing?.id || immediateLeadContext.listing?.id))) {
        const listingLeadContext = await withLegalWorkspaceTimeout(
          fetchListingContextFromSupabase({
            organisationId: resolvedOrganisationId,
            listingId: routeListingId,
            leadId: routeLeadId,
          }),
          'Listing lookup is taking too long.',
          2500,
        ).catch(() => ({ lead: null, contact: null, linkedTransaction: null }))
        if (listingLeadContext?.lead) {
          immediateLeadContext = mergeLeadContextWithListingContext(immediateLeadContext, listingLeadContext)
        } else if (!immediateLeadContext?.lead) {
          immediateLeadContext = buildLooseLeadContextFromRoute({
            organisationId: resolvedOrganisationId,
            leadId: routeLeadId,
            listingId: routeListingId,
          })
        }
      }
      immediateLeadContext = await withLegalWorkspaceTimeout(
        hydrateLeadContextWithSellerOnboarding(immediateLeadContext),
        'Seller onboarding lookup is taking too long.',
        2500,
      ).catch((onboardingError) => {
        console.warn('[LegalDocumentWorkspacePage] seller onboarding lookup unavailable; continuing with local lead context.', onboardingError)
        return immediateLeadContext
      })
      const immediateOrganisationId = normalizeText(immediateLeadContext.lead?.organisationId) || null
      const immediateTransactionId = normalizeText(
        immediateLeadContext.linkedTransaction?.transactionId || immediateLeadContext.linkedTransaction?.dealId,
      )
      if (!hasRenderedContextRef.current) {
        setTransactionDetail(null)
        setOrganisationId(immediateOrganisationId)
        setWorkspaceBranding(null)
        setWorkspaceSettings(null)
        setLeadContext(immediateLeadContext)
        applyInitialStatus(
          resolvedPacketType === 'mandate' && hasGeneratedRuntimeMandate(immediateLeadContext.lead)
            ? buildRuntimeMandateStatusForLead({
                organisationId: immediateOrganisationId,
                transactionId: immediateTransactionId,
                transactionReference: [
                  normalizeText(immediateLeadContext.lead?.sellerPropertyAddress || immediateLeadContext.lead?.propertyInterest),
                  normalizeText(immediateLeadContext.lead?.leadCategory),
                ].filter(Boolean).join(' · '),
                routeLeadId,
                leadContext: immediateLeadContext,
                actor,
                role,
                settings: null,
              })
            : buildFallbackPacketStatus(resolvedPacketType)
        )
        setLoadingContext(false)
        setContextHydrated(true)
        renderedFallback = true
        hasRenderedContextRef.current = true
        hydratedRouteContextKeyRef.current = nextRouteContextKey
      }

      if (!resolvedTransactionId && immediateTransactionId) {
        resolvedTransactionId = immediateTransactionId
      }
      if (!resolvedOrganisationId && immediateOrganisationId) {
        resolvedOrganisationId = immediateOrganisationId
      }

      const settingsPromise = withLegalWorkspaceTimeout(
        fetchAgencyOnboardingSettings(),
        'Organisation settings are taking too long.',
      ).catch((settingsError) => {
        console.warn('[LegalDocumentWorkspacePage] organisation settings unavailable; continuing with route context.', settingsError)
        return null
      })

      let detail = null
      if (resolvedTransactionId) {
        detail = await withLegalWorkspaceTimeout(
          fetchTransactionById(resolvedTransactionId),
          'Transaction lookup is taking too long.',
        ).catch((transactionError) => {
          console.warn('[LegalDocumentWorkspacePage] transaction detail unavailable; continuing with route context.', transactionError)
          return null
        })
        if (!detail?.transaction?.id) {
          console.warn('[LegalDocumentWorkspacePage] transaction could not be found during background hydration.', {
            transactionId: resolvedTransactionId,
          })
        }
        resolvedOrganisationId = normalizeText(detail?.transaction?.organisation_id) || resolvedOrganisationId
      }

      const settings = await settingsPromise
      if (!resolvedOrganisationId) {
        resolvedOrganisationId = normalizeText(settings?.organisation?.id) || null
      }
      const onboardingSettings = settings?.onboarding && typeof settings.onboarding === 'object' ? settings.onboarding : {}
      const agencyInformation = onboardingSettings?.agencyInformation && typeof onboardingSettings.agencyInformation === 'object'
        ? onboardingSettings.agencyInformation
        : onboardingSettings?.agency_information && typeof onboardingSettings.agency_information === 'object'
          ? onboardingSettings.agency_information
          : {}
      const organisationSettings = settings?.organisation || {}
      const organisationAddress = firstText(
        agencyInformation.physicalAddress,
        agencyInformation.physical_address,
        organisationSettings.physical_address,
        organisationSettings.physicalAddress,
        [
          organisationSettings.address_line_1 || organisationSettings.addressLine1,
          organisationSettings.address_line_2 || organisationSettings.addressLine2,
          organisationSettings.city,
          organisationSettings.province,
          organisationSettings.postal_code || organisationSettings.postalCode,
        ].map(normalizeText).filter(Boolean).join(', '),
      )
      const organisationPhone = firstText(
        agencyInformation.mainOfficeNumber,
        agencyInformation.main_office_number,
        agencyInformation.phoneNumber,
        agencyInformation.phone_number,
        organisationSettings.companyPhone,
        organisationSettings.company_phone,
        organisationSettings.telephone,
        organisationSettings.phone_number,
        organisationSettings.phone,
      )
      const organisationEmail = firstText(
        agencyInformation.mainEmailAddress,
        agencyInformation.main_email_address,
        agencyInformation.emailAddress,
        agencyInformation.email_address,
        agencyInformation.email,
        organisationSettings.companyEmail,
        organisationSettings.company_email,
        organisationSettings.email,
      )
      const organisationWebsite = firstText(
        agencyInformation.website,
        organisationSettings.website,
        organisationSettings.companyWebsite,
        organisationSettings.company_website,
      )
      const brandingFromSettings = {
        organisationName:
          normalizeText(organisationSettings.display_name) ||
          normalizeText(organisationSettings.displayName) ||
          normalizeText(organisationSettings.name),
        logoLightUrl: normalizeText(onboardingSettings?.branding?.logoLight) || normalizeText(organisationSettings.logo_url),
        logoDarkUrl: normalizeText(onboardingSettings?.branding?.logoDark),
        website: organisationWebsite,
        organisationWebsite,
        email: organisationEmail,
        organisationEmail,
        physicalAddress: organisationAddress,
        organisationPhysicalAddress: organisationAddress,
        telephone: organisationPhone,
        phoneNumber: organisationPhone,
        organisationPhone,
      }
      const packetBranding = resolvedOrganisationId
        ? await withLegalWorkspaceTimeout(
            resolveDocumentPacketBranding({ organisationId: resolvedOrganisationId }),
            'Workspace branding is taking too long.',
          ).catch((brandingError) => {
            console.warn('[LegalDocumentWorkspacePage] branding unavailable; continuing with settings fallback.', brandingError)
            return null
          })
        : null

      let nextLeadContext = immediateLeadContext.lead
        ? immediateLeadContext
        : findLeadContextAcrossStores({
            organisationId: resolvedOrganisationId,
            leadId: routeLeadId,
          })
      if (!nextLeadContext?.lead && routeLeadId) {
        const supabaseLeadContext = await withLegalWorkspaceTimeout(
          fetchLeadContextFromSupabase({
            organisationId: resolvedOrganisationId,
            leadId: routeLeadId,
          }),
          'Lead lookup is taking too long.',
          2500,
        ).catch(() => ({ lead: null, contact: null, linkedTransaction: null }))
        if (supabaseLeadContext?.lead) nextLeadContext = supabaseLeadContext
      }
      if (routeListingId && (!nextLeadContext?.lead || !normalizeText(nextLeadContext.privateListing?.id || nextLeadContext.listing?.id))) {
        const listingLeadContext = await withLegalWorkspaceTimeout(
          fetchListingContextFromSupabase({
            organisationId: resolvedOrganisationId,
            listingId: routeListingId,
            leadId: routeLeadId,
          }),
          'Listing lookup is taking too long.',
          2500,
        ).catch(() => ({ lead: null, contact: null, linkedTransaction: null }))
        if (listingLeadContext?.lead) {
          nextLeadContext = mergeLeadContextWithListingContext(nextLeadContext, listingLeadContext)
        } else if (!nextLeadContext?.lead) {
          nextLeadContext = buildLooseLeadContextFromRoute({
            organisationId: resolvedOrganisationId,
            leadId: routeLeadId,
            listingId: routeListingId,
          })
        }
      }
      nextLeadContext = await withLegalWorkspaceTimeout(
        hydrateLeadContextWithSellerOnboarding(nextLeadContext),
        'Seller onboarding lookup is taking too long.',
        2500,
      ).catch((onboardingError) => {
        console.warn('[LegalDocumentWorkspacePage] seller onboarding lookup unavailable during hydration.', onboardingError)
        return nextLeadContext
      })
      if (!resolvedOrganisationId) {
        resolvedOrganisationId = normalizeText(nextLeadContext.lead?.organisationId) || null
      }

      const linkedTransactionId = normalizeText(
        nextLeadContext.linkedTransaction?.transactionId || nextLeadContext.linkedTransaction?.dealId,
      )
      if (!detail && linkedTransactionId) {
        detail = await withLegalWorkspaceTimeout(
          fetchTransactionById(linkedTransactionId),
          'Linked transaction lookup is taking too long.',
        ).catch((linkedTransactionError) => {
          console.warn('[LegalDocumentWorkspacePage] linked transaction unavailable; continuing with lead context.', linkedTransactionError)
          return null
        })
        resolvedTransactionId = normalizeText(detail?.transaction?.id || linkedTransactionId)
        if (detail?.transaction?.organisation_id && !resolvedOrganisationId) {
          resolvedOrganisationId = normalizeText(detail.transaction.organisation_id)
        }
      }

      const leadRuntimeMandate = resolvedPacketType === 'mandate'
        && routeLeadId
        && !effectiveRoutePacketId
        && !normalizeText(nextLeadContext.lead?.mandatePacketId)
      let status = leadRuntimeMandate && isRuntimePacketId(initialStatusRef.current?.packet?.id)
        ? initialStatusRef.current
        : initialStatusValueRef.current || buildFallbackPacketStatus(resolvedPacketType)
      const canResolveStatus = Boolean(
        effectiveRoutePacketId ||
        resolvedTransactionId ||
        (resolvedOrganisationId && normalizeLeadUuid(routeLeadId))
      )
      if (canResolveStatus) {
        status = await withLegalWorkspaceTimeout(
          resolveDocumentPacketStatus({
            packetType: resolvedPacketType,
            packetId: effectiveRoutePacketId,
            transactionId: resolvedTransactionId,
            leadId: routeLeadId,
            organisationId: resolvedOrganisationId,
          }),
          'Packet status lookup is taking too long.',
        ).catch((statusError) => {
          console.warn('[LegalDocumentWorkspacePage] packet status unavailable; opening workspace in draft mode.', statusError)
          return buildFallbackPacketStatus(resolvedPacketType, 'Packet status lookup timed out. You can still prepare this draft manually.')
        })
      }
      if (leadRuntimeMandate && hasGeneratedRuntimeMandate(nextLeadContext.lead) && !isUuidLike(status?.packet?.id)) {
        status = buildRuntimeMandateStatusForLead({
          organisationId: resolvedOrganisationId,
          transaction: detail?.transaction || null,
          transactionId: resolvedTransactionId,
          transactionDetail: detail,
          transactionReference: resolveTransactionReference(
            detail,
            [
              normalizeText(nextLeadContext.lead?.sellerPropertyAddress || nextLeadContext.lead?.propertyInterest),
              normalizeText(nextLeadContext.lead?.leadCategory),
            ].filter(Boolean).join(' · '),
          ),
          routeLeadId,
          leadContext: nextLeadContext,
          actor,
          role,
          branding: packetBranding || brandingFromSettings,
          settings,
        })
      }
      if (packetOwnershipWarnings.length) {
        status = {
          ...(status || buildFallbackPacketStatus(resolvedPacketType)),
          warnings: [
            ...packetOwnershipWarnings,
            ...((Array.isArray(status?.warnings) ? status.warnings : [])),
          ],
        }
      }

      setTransactionDetail(detail)
      setOrganisationId(resolvedOrganisationId)
      setWorkspaceBranding({
        ...(packetBranding || {}),
        organisationName: normalizeText(packetBranding?.organisationName) || brandingFromSettings.organisationName,
        logoLightUrl: normalizeText(packetBranding?.logoLightUrl) || brandingFromSettings.logoLightUrl,
        logoDarkUrl: normalizeText(packetBranding?.logoDarkUrl) || brandingFromSettings.logoDarkUrl,
        website: normalizeText(packetBranding?.website) || normalizeText(packetBranding?.organisationWebsite) || brandingFromSettings.website,
        organisationWebsite: normalizeText(packetBranding?.organisationWebsite) || normalizeText(packetBranding?.website) || brandingFromSettings.organisationWebsite,
        email: normalizeText(packetBranding?.email) || normalizeText(packetBranding?.organisationEmail) || brandingFromSettings.email,
        organisationEmail: normalizeText(packetBranding?.organisationEmail) || normalizeText(packetBranding?.email) || brandingFromSettings.organisationEmail,
        physicalAddress: normalizeText(packetBranding?.physicalAddress) || normalizeText(packetBranding?.organisationPhysicalAddress) || brandingFromSettings.physicalAddress,
        organisationPhysicalAddress: normalizeText(packetBranding?.organisationPhysicalAddress) || normalizeText(packetBranding?.physicalAddress) || brandingFromSettings.organisationPhysicalAddress,
        telephone: normalizeText(packetBranding?.telephone) || normalizeText(packetBranding?.phoneNumber) || normalizeText(packetBranding?.organisationPhone) || brandingFromSettings.telephone,
        phoneNumber: normalizeText(packetBranding?.phoneNumber) || normalizeText(packetBranding?.telephone) || normalizeText(packetBranding?.organisationPhone) || brandingFromSettings.phoneNumber,
        organisationPhone: normalizeText(packetBranding?.organisationPhone) || normalizeText(packetBranding?.phoneNumber) || normalizeText(packetBranding?.telephone) || brandingFromSettings.organisationPhone,
      })
      setWorkspaceSettings(settings)
      setLeadContext(nextLeadContext)
      const currentPacketId = normalizeText(initialStatusValueRef.current?.packet?.id)
      const nextPacketId = normalizeText(status?.packet?.id)
      const staleNoPacketResult = isUuidLike(currentPacketId) && !nextPacketId
      const nextStatus = staleNoPacketResult ? initialStatusValueRef.current : status
      if (staleNoPacketResult) {
        console.info('[LegalDocumentWorkspacePage] ignored stale route status after mandate generation.', {
          routePacketId: effectiveRoutePacketId || null,
          currentPacketId,
        })
      }
      applyInitialStatus(nextStatus)
      setValidatedRoutePacketId(normalizeText(nextStatus?.packet?.id || effectiveRoutePacketId))
      setContextHydrated(true)
      hasRenderedContextRef.current = true
      hydratedRouteContextKeyRef.current = nextRouteContextKey
    } catch (error) {
      if (renderedFallback || hasRenderedCurrentRoute) {
        console.warn('[LegalDocumentWorkspacePage] background route hydration failed after workspace render; keeping current workspace state.', error)
        if (hasRenderedCurrentRoute) {
          setContextHydrated(true)
        }
      } else {
        setPageError(toFriendlyPageError(error))
      }
    } finally {
      setRouteContextSettled(true)
      if (!renderedFallback && !hasRenderedCurrentRoute) setLoadingContext(false)
    }
  }, [actor, applyInitialStatus, requestedPacketType, role, routeLeadId, routeListingId, routePacketId, routeTransactionId])

  useEffect(() => {
    void loadRouteContext()
  }, [loadRouteContext])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    let cancelled = false

    const refreshRouteContext = () => {
      if (cancelled) return
      void loadRouteContext()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshRouteContext()
      }
    }

    window.addEventListener('itg:seller-onboarding-submitted', refreshRouteContext)
    window.addEventListener('itg:listings-updated', refreshRouteContext)
    window.addEventListener('itg:pipeline-updated', refreshRouteContext)
    window.addEventListener('itg:transaction-updated', refreshRouteContext)
    window.addEventListener('focus', refreshRouteContext)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      window.removeEventListener('itg:seller-onboarding-submitted', refreshRouteContext)
      window.removeEventListener('itg:listings-updated', refreshRouteContext)
      window.removeEventListener('itg:pipeline-updated', refreshRouteContext)
      window.removeEventListener('itg:transaction-updated', refreshRouteContext)
      window.removeEventListener('focus', refreshRouteContext)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [loadRouteContext])

  const transaction = transactionDetail?.transaction || null
  const transactionId = normalizeText(transaction?.id || routeTransactionId || leadContext.linkedTransaction?.transactionId || leadContext.linkedTransaction?.dealId)
  const transactionReference = resolveTransactionReference(
    transactionDetail,
    [
      normalizeText(leadContext.lead?.sellerPropertyAddress || leadContext.lead?.propertyInterest),
      normalizeText(leadContext.lead?.leadCategory),
    ].filter(Boolean).join(' · '),
  )

  const syncLeadMandateState = useCallback(async (patch = {}, { reason = 'update mandate state' } = {}) => {
    const scopedLeadId = normalizeText(leadContext?.lead?.leadId)
    if (!scopedLeadId) return null

    try {
      return await updateAgencyCrmLeadRecord(organisationId, scopedLeadId, patch)
    } catch (error) {
      console.warn(`[LegalDocumentWorkspacePage] unable to ${reason} in the remote CRM record; keeping local lead state in sync.`, error)
      try {
        return updateAgencyLead(organisationId, scopedLeadId, patch)
      } catch (fallbackError) {
        console.warn('[LegalDocumentWorkspacePage] local lead fallback is unavailable; continuing without blocking mandate generation.', fallbackError)
        return null
      }
    }
  }, [leadContext?.lead?.leadId, organisationId])

  const recordLeadMandateActivity = useCallback(async (payload = {}) => {
    const scopedLeadId = normalizeText(leadContext?.lead?.leadId)
    if (!scopedLeadId) return null

    try {
      return await createAgencyCrmLeadActivity(organisationId, scopedLeadId, payload, {
        actor: {
          id: actor.id,
          name: normalizeText(profile?.full_name || profile?.fullName || profile?.email || actor.name),
          email: actor.email,
        },
      })
    } catch (error) {
      console.warn('[LegalDocumentWorkspacePage] mandate activity could not be recorded remotely; attempting local fallback.', error)
      try {
        return addLeadActivity(organisationId, scopedLeadId, payload)
      } catch (fallbackError) {
        console.warn('[LegalDocumentWorkspacePage] local activity fallback is unavailable; continuing without blocking mandate generation.', fallbackError)
        return null
      }
    }
  }, [actor, leadContext?.lead?.leadId, organisationId, profile])

  const resolveCurrentStatus = useCallback(async () => {
    const currentPacketId = normalizeText(validatedRoutePacketId || initialStatus?.packet?.id || '')
    if (isRuntimePacketId(currentPacketId)) {
      return initialStatus || buildFallbackPacketStatus(packetType)
    }
    const status = await withLegalWorkspaceTimeout(
      resolveDocumentPacketStatus({
        packetType,
        packetId: currentPacketId,
        transactionId,
        leadId: routeLeadId,
        organisationId,
      }),
      'Packet status is taking too long.',
    )
    const resolvedPacketId = normalizeText(status?.packet?.id || currentPacketId)
    if (isUuidLike(resolvedPacketId)) {
      setValidatedRoutePacketId(resolvedPacketId)
    }
    applyInitialStatus(status)
    return status
  }, [applyInitialStatus, initialStatus, organisationId, packetType, routeLeadId, transactionId, validatedRoutePacketId])

  const ensurePacket = useCallback(async ({ template, allowRuntime = true, forceNew = false } = {}) => {
    const routeListingUuid = normalizeLeadUuid(routeListingId)
    const routeLeadUuid = normalizeLeadUuid(routeLeadId)
    const contextLeadUuid = normalizeLeadUuid(leadContext.lead?.leadId)
    const packetLeadId = routeLeadUuid && routeLeadUuid !== routeListingUuid ? routeLeadUuid : contextLeadUuid
    const sourceListingId = normalizeText(
      routeListingId ||
        leadContext.lead?.listingId ||
        leadContext.privateListing?.id ||
        leadContext.listing?.id,
    )
    const packetHint = forceNew
      ? ''
      : (
          normalizeText(validatedRoutePacketId) ||
          normalizeText(initialStatus?.packet?.id) ||
          normalizeText(packetType === 'mandate' ? leadContext.lead?.mandatePacketId : '')
        )

    if (allowRuntime && packetType === 'mandate' && routeLeadId && !packetHint) {
      return buildRuntimePacket({
        packetType,
        organisationId,
        transactionId,
        routeLeadId,
        transactionReference,
        actor: { id: actor.id },
        template,
      })
    }

    const currentStatus = packetHint && !isRuntimePacketId(packetHint)
      ? await resolveCurrentStatus().catch((statusError) => {
          if (!isLegalWorkspaceTimeoutError(statusError)) throw statusError
          console.warn('[LegalDocumentWorkspacePage] status lookup timed out while preparing packet; using current route state.', statusError)
          return initialStatus || buildFallbackPacketStatus(packetType)
        })
      : (forceNew ? buildFallbackPacketStatus(packetType) : (initialStatus || buildFallbackPacketStatus(packetType)))
    if (!forceNew && currentStatus?.packet?.id && (allowRuntime || !isRuntimePacketId(currentStatus.packet.id))) {
      return currentStatus.packet
    }

    const shouldLookupExistingPacket = !forceNew && Boolean(transactionId || packetLeadId)
    if (shouldLookupExistingPacket) {
      const scopedPackets = await withLegalWorkspaceTimeout(
        listDocumentPackets({
          organisationId,
          packetType,
          transactionId: transactionId || null,
          leadId: packetLeadId || null,
          limit: 5,
        }),
        'Packet lookup is taking too long.',
      ).catch((packetLookupError) => {
        if (!isLegalWorkspaceTimeoutError(packetLookupError)) throw packetLookupError
        console.warn('[LegalDocumentWorkspacePage] packet lookup timed out while preparing packet; creating a draft packet.', packetLookupError)
        return []
      })
      const existing = Array.isArray(scopedPackets) ? scopedPackets[0] : null
      if (existing?.id) return existing
    }

    if (packetType === 'otp' && !transactionId) {
      throw new Error('A transaction is required before generating an OTP.')
    }

    const packetInput = {
        organisationId,
        packetType,
        title: `${resolveDocumentLabel(packetType)} - ${transactionReference}`,
        transactionId: isUuidLike(transactionId) ? transactionId : null,
        dealId: isUuidLike(transactionId) ? transactionId : null,
        leadId: packetLeadId || null,
        status: 'ready_for_generation',
        templateId: isUuidLike(template?.id) ? normalizeText(template?.id) : null,
        templateKeySnapshot: normalizeText(template?.template_key || template?.templateKey || template?.key),
        templateLabelSnapshot: normalizeText(template?.template_label || template?.templateLabel || template?.label || resolveDocumentLabel(packetType)),
        assignedAgentId: isUuidLike(actor.id) ? actor.id : null,
        sourceContextJson: {
          transactionId: transactionId || null,
          leadId: packetLeadId || null,
          uiLeadId: routeLeadId || null,
          listingId: sourceListingId || null,
          offerId: routeOfferId || null,
          route: 'legal_document_workspace_page',
          sourceMode: documentStartSourceMode || null,
          documentStart: documentStartEntryPoint || null,
          ...(packetType === 'mandate' ? { mandateDraft: effectiveMandateDraft } : {}),
          ...(packetType === 'otp' ? { otpDraft: effectiveOtpDraft } : {}),
        },
      }
    const templateStatus = normalizeText(template?.status || template?.template_status || template?.metadata_json?.template_status).toLowerCase()
    const templateFormat = normalizeText(template?.template_format || template?.templateFormat).toLowerCase()
    const canCreateEditableDraft = isUuidLike(template?.id) &&
      ['published', 'active', 'approved', 'live'].includes(templateStatus) &&
      template?.is_active !== false &&
      ['structured', 'json'].includes(templateFormat)
    const packet = await withLegalWorkspaceTimeout(
      canCreateEditableDraft
        ? createEditableDocumentDraftFromTemplate({
            ...packetInput,
            placeholders: packetType === 'mandate'
              ? effectiveMandateDraft?.placeholders || {}
              : effectiveOtpDraft?.placeholders || {},
          })
        : createDocumentPacket(packetInput),
      'Packet creation is taking too long.',
      LEGAL_WORKSPACE_PACKET_SAVE_TIMEOUT_MS,
    )

    if (packetType === 'mandate' && leadContext.lead?.leadId) {
      void syncLeadMandateState({
        mandatePacketId: normalizeText(packet?.id),
      }, { reason: 'persist the generated mandate packet reference' })
    }
    setValidatedRoutePacketId(normalizeText(packet?.id))

    return packet
  }, [actor.id, documentStartEntryPoint, documentStartSourceMode, effectiveMandateDraft, effectiveOtpDraft, initialStatus, leadContext.lead, leadContext.listing, leadContext.privateListing, organisationId, packetType, resolveCurrentStatus, routeLeadId, routeListingId, routeOfferId, syncLeadMandateState, transactionId, transactionReference, validatedRoutePacketId])

  const createListingFromGeneratedMandate = useCallback(async ({
    packet = null,
    status = null,
    mandateData = null,
    sourceListingId = '',
    onProgress = null,
    navigateToListing = true,
  } = {}) => {
    const existingListingId = normalizeText(
      sourceListingId ||
        routeListingId ||
        leadContext?.privateListing?.id ||
        leadContext?.listing?.id ||
        leadContext?.lead?.listingId,
    )
    if (!autoCreateListingFromMandate || packetType !== 'mandate' || existingListingId) {
      return { listing: null, packet, status }
    }
    const packetId = normalizeText(packet?.id || status?.packet?.id)
    if (!isUuidLike(packetId)) {
      return { listing: null, packet, status }
    }
    if (!organisationId) {
      throw new Error('Organisation context is missing. The mandate was generated, but the listing could not be created automatically.')
    }

    onProgress?.('Creating listing from generated mandate...')
    const basePacket = packet?.id ? packet : status?.packet
    const listingPayload = buildMandateFirstListingPayload({
      organisationId,
      actor,
      packet: basePacket,
      mandateData,
      mandateDraft: effectiveMandateDraft,
      leadContext,
      routeLeadId,
    })
    const created = await createPrivateListing(listingPayload, {
      includeRequirementsAndDocuments: false,
      syncRequirements: false,
    })
    const listing = created?.listing || created
    if (!listing?.id) {
      throw new Error('The mandate was generated, but Arch9 could not create the listing record.')
    }

    await createPrivateListingActivity({
      privateListingId: listing.id,
      activityType: 'mandate_first_listing_created',
      activityTitle: 'Listing created from generated mandate',
      activityDescription: 'Mandate was generated first and the private listing was created automatically.',
      performedBy: normalizeText(actor.id),
      visibility: 'internal',
      metadata: {
        origin: 'mandate_first',
        source: 'legal_document_workspace',
        packetId,
        routeLeadId: normalizeText(routeLeadId),
        documentStart: documentStartEntryPoint || null,
        sourceMode: documentStartSourceMode || null,
        listingStatus: listing.listingStatus || listingPayload.listingStatus,
        mandateStatus: listing.mandateStatus || listingPayload.mandateStatus,
      },
    }).catch((activityError) => {
      console.warn('[LegalDocumentWorkspacePage] mandate-first listing activity skipped.', activityError)
    })

    const linkedAt = new Date().toISOString()
    const existingSourceContext = asRecord(basePacket?.source_context_json || status?.packet?.source_context_json)
    const linkedSourceContext = {
      ...existingSourceContext,
      autoCreateListing: true,
      autoCreatedListingId: listing.id,
      autoCreatedListingAt: linkedAt,
      privateListingId: listing.id,
      private_listing_id: listing.id,
      listingId: listing.id,
      listing_id: listing.id,
      leadId: normalizeLeadUuid(listingPayload.sellerLeadId || leadContext?.lead?.leadId || routeLeadId) || null,
      uiLeadId: normalizeText(routeLeadId) || null,
      sourceMode: documentStartSourceMode || null,
      documentStart: documentStartEntryPoint || null,
      mandateDraft: effectiveMandateDraft,
      generatedDataSnapshot: mandateData || existingSourceContext.generatedDataSnapshot || null,
      sourceContext: {
        ...(asRecord(existingSourceContext.sourceContext)),
        listingId: listing.id,
        privateListingId: listing.id,
        autoCreateListing: true,
      },
      generationPayload: existingSourceContext.generationPayload && typeof existingSourceContext.generationPayload === 'object'
        ? {
            ...existingSourceContext.generationPayload,
            mandateData: mandateData || existingSourceContext.generationPayload.mandateData || null,
            listingId: listing.id,
            privateListingId: listing.id,
          }
        : existingSourceContext.generationPayload,
    }
    let linkedPacket = {
      ...(basePacket || {}),
      id: packetId,
      source_context_json: linkedSourceContext,
    }
    try {
      linkedPacket = await updateDocumentPacket(packetId, {
        sourceContextJson: linkedSourceContext,
      })
    } catch (packetUpdateError) {
      console.warn('[LegalDocumentWorkspacePage] generated mandate packet listing metadata update skipped.', packetUpdateError)
    }

    const nextStatus = status
      ? {
          ...status,
          packet: {
            ...(status.packet || basePacket || {}),
            ...(linkedPacket || {}),
            source_context_json: linkedSourceContext,
          },
          actionHint: 'Mandate generated and listing created.',
        }
      : status
    const nextLeadContext = buildMandateFirstLeadContext({
      listing,
      payload: listingPayload,
      routeLeadId,
      previous: leadContext,
    })
    setLeadContext(nextLeadContext)
    if (nextStatus) applyInitialStatus(nextStatus)
    setValidatedRoutePacketId(packetId)

    const nextParams = new URLSearchParams()
    nextParams.set('mode', 'generate')
    nextParams.set('sourceMode', DOCUMENT_START_SOURCE_MODES.saved)
    nextParams.set('documentStart', DOCUMENT_START_ENTRY_POINTS.listingMandate)
    nextParams.set('listingId', listing.id)
    nextParams.set('packetId', packetId)
    nextParams.set('returnTo', '/listings')
    const linkedLeadId = normalizeLeadUuid(listingPayload.sellerLeadId || leadContext?.lead?.leadId || routeLeadId)
    if (linkedLeadId && linkedLeadId !== listing.id) nextParams.set('leadId', linkedLeadId)
    if (navigateToListing) {
      navigate(`/agent/listings/${encodeURIComponent(listing.id)}/legal/mandate?${nextParams.toString()}`, { replace: true })
    }

    return { listing, packet: linkedPacket, status: nextStatus }
  }, [
    actor,
    applyInitialStatus,
    autoCreateListingFromMandate,
    documentStartEntryPoint,
    documentStartSourceMode,
    effectiveMandateDraft,
    leadContext,
    navigate,
    organisationId,
    packetType,
    routeLeadId,
    routeListingId,
  ])

  const handleGenerate = useCallback(async ({ onProgress, resetExisting = false, editableSections = null, renderFreeze = null } = {}) => {
    const generationStartedAt = Date.now()
    const logGenerationStage = (stage, metadata = {}) => {
      console.info('[LegalDocumentWorkspacePage] mandate generation timing', {
        stage,
        elapsedMs: Date.now() - generationStartedAt,
        packetType,
        routeLeadId: normalizeText(routeLeadId) || null,
        packetId: normalizeText(validatedRoutePacketId || initialStatus?.packet?.id) || null,
        ...metadata,
      })
    }
    onProgress?.('Preparing draft...')
    logGenerationStage('started')
    if (packetType === 'mandate' && !effectiveMandateDraft.transferAttorneyPreferredPartnerId && !effectiveMandateDraft.transferAttorneySelectionDeferred) {
      throw new Error('Select the seller\'s transfer attorney or explicitly defer the nomination before generating the mandate.')
    }
    const generationLookupTimeoutMs = 8000
    let template = null
    const resetMandatePacket = packetType === 'mandate' && resetExisting === true
    const existingPacketIdForReset = normalizeText(
      validatedRoutePacketId ||
      initialStatus?.packet?.id ||
      leadContext.lead?.mandatePacketId,
    )
    if (resetMandatePacket) {
      onProgress?.('Resetting failed mandate packet...')
      if (isUuidLike(existingPacketIdForReset)) {
        await archivePacket(existingPacketIdForReset, {
          reason: 'Reset failed mandate before regeneration.',
        }).catch((resetError) => {
          console.warn('[LegalDocumentWorkspacePage] failed mandate packet could not be archived; continuing with fresh packet generation.', resetError)
        })
      }
      if (leadContext.lead?.leadId) {
        await Promise.resolve(syncLeadMandateState({
          mandatePacketId: '',
          mandateStatus: '',
          mandateGeneratedAt: '',
        }, { reason: 'clear the failed mandate packet reference' })).catch((leadResetError) => {
          console.warn('[LegalDocumentWorkspacePage] lead mandate status could not be cleared before regeneration; continuing with fresh packet generation.', leadResetError)
        })
      }
      setValidatedRoutePacketId('')
      applyInitialStatus(buildFallbackPacketStatus(packetType))
    }

    const shouldResolveExistingStatus = !resetMandatePacket && Boolean(validatedRoutePacketId || initialStatus?.packet?.id)
    const existingStatus = shouldResolveExistingStatus
      ? await resolveCurrentStatus().catch((statusError) => {
          if (!isLegalWorkspaceTimeoutError(statusError)) throw statusError
          console.warn('[LegalDocumentWorkspacePage] status lookup timed out before generation; continuing with current route state.', statusError)
          return initialStatus || buildFallbackPacketStatus(packetType)
        })
      : (initialStatus || buildFallbackPacketStatus(packetType))
    if (['sent', 'partially_signed', 'signed', 'archived'].includes(normalizeKey(existingStatus?.state))) {
      throw new Error('This document is already sent or signed. Open the current packet instead of generating a new draft.')
    }
    const existingPacketSourceContext = existingStatus?.packet?.source_context_json && typeof existingStatus.packet.source_context_json === 'object'
      ? existingStatus.packet.source_context_json
      : {}
    const isDeveloperAgentMandatePacket =
      packetType === 'mandate' &&
      (normalizeKey(existingPacketSourceContext.mandateType) === 'developer_agent_mandate' ||
        normalizeKey(existingPacketSourceContext.contextType) === 'developer_agent_mandate')

    // Route hydration already loaded seller onboarding before generation became available.
    // Repeating it here made every mandate request wait on a second network round trip.
    const effectiveLeadContext = leadContext

    const generationContext = buildMandateGenerationContext({
      organisationId,
      transaction,
      transactionId,
      transactionDetail,
      leadContext: effectiveLeadContext,
      mandateDraft: effectiveMandateDraft,
      actor,
      role,
      branding: workspaceBranding,
      settings: workspaceSettings,
    })
    if (Array.isArray(editableSections) && editableSections.length) {
      generationContext.editableSections = editableSections
    }
    if (renderFreeze?.freezeId) {
      generationContext.editableRenderFreeze = renderFreeze
    }
    if (packetType === 'otp') {
      const otpContext = buildOtpDraftGenerationOverrides({
        transaction: generationContext.transaction || transaction,
        buyer: generationContext.buyer,
        sellerDetails: generationContext.sellerDetails,
        onboardingFormData: generationContext.onboardingFormData,
        otpDraft: effectiveOtpDraft,
      })
      generationContext.otpDraft = otpContext.otpDraft
      generationContext.transaction = otpContext.transaction
      generationContext.buyer = otpContext.buyer
      generationContext.sellerDetails = otpContext.sellerDetails
      generationContext.onboardingFormData = otpContext.onboardingFormData
      generationContext.specialConditions = firstText(otpContext.specialConditions, generationContext.specialConditions)
      generationContext.sourceContext = {
        ...(generationContext.sourceContext || {}),
        ...otpContext.sourceContext,
      }
      generationContext.generatedDataSnapshot = otpContext.generatedDataSnapshot

      const otpScenarioProfile = resolveLegalDocumentScenarioProfile({
        packetType: 'otp',
        seller: {
          entityType: effectiveOtpDraft.sellerEntityType,
          maritalStatus: effectiveOtpDraft.sellerMaritalRegime,
        },
        buyer: {
          entityType: effectiveOtpDraft.buyerEntityType,
          maritalStatus: effectiveOtpDraft.buyerMaritalRegime,
        },
        property: {
          propertyType: effectiveOtpDraft.propertyTitleType || effectiveOtpDraft.propertyType,
          unitNumber: effectiveOtpDraft.unitNumber,
          complexName: effectiveOtpDraft.complexName,
        },
        transaction: { financeType: effectiveOtpDraft.financeType },
      })
      const otpLegalRequirements = resolveLegalDocumentScenarioRequirements({
        scenarioProfile: otpScenarioProfile,
        draft: {
          ...effectiveOtpDraft,
          propertyTitleType: otpScenarioProfile.propertyTitleType,
        },
      })
      if (!otpLegalRequirements.complete) {
        const validationError = new Error('Complete the legal details shown above before generating this OTP.')
        validationError.code = 'VALIDATION_BLOCKED'
        validationError.validation = {
          legalDocumentMissingRoutingFacts: otpScenarioProfile.missingRoutingFacts,
          legalDocumentConflictingFacts: otpScenarioProfile.conflictingFacts,
          legalDocumentInvalidFacts: otpScenarioProfile.invalidFacts,
          legalDocumentScenarioProvenance: otpScenarioProfile.sourceProvenance,
          legalDocumentScenarioProfile: otpScenarioProfile,
          legalScenarioRequirements: otpLegalRequirements,
          critical: otpLegalRequirements.missingFields.map((field) => ({
            source: 'legal_scenario_requirement',
            sectionKey: 'legal_scenario',
            sectionLabel: field.group,
            placeholderKey: field.key,
            placeholderLabel: field.label,
            message: `${field.label} is required for this legal situation.`,
          })),
        }
        throw validationError
      }
    }
    const sourceListingId = normalizeText(
      routeListingId ||
        generationContext?.lead?.listingId ||
        generationContext?.privateListing?.id ||
        leadContext?.privateListing?.id ||
        leadContext?.listing?.id,
    )
    generationContext.documentStart = {
      sourceMode: documentStartSourceMode || null,
      entryPoint: documentStartEntryPoint || null,
      listingId: sourceListingId || null,
      offerId: routeOfferId || null,
    }
    if (packetType === 'otp') {
      generationContext.sourceContext = {
        ...(generationContext.sourceContext || {}),
        packetType: 'otp',
        contextType: documentStartEntryPoint === 'accepted_offer_otp' ? 'accepted_offer' : 'transaction',
        transactionId: transactionId || null,
        leadId: normalizeLeadUuid(routeLeadId) || null,
        sourceMode: documentStartSourceMode || null,
        documentStart: documentStartEntryPoint || null,
        listingId: sourceListingId || null,
        offerId: routeOfferId || null,
      }
    }
    if (packetType === 'otp') {
      onProgress?.('Checking signed seller disclosure...')
      const propertyDisclosureAnnexure = await resolveOtpPropertyDisclosureAnnexure({
        leadContext,
        transactionDetail,
        existingPacketSourceContext,
      })
      if (propertyDisclosureAnnexure) {
        const annexuresList = appendAnnexureLabel(generationContext.onboardingFormData?.annexuresList, propertyDisclosureAnnexure.title)
        generationContext.propertyDisclosureAnnexure = propertyDisclosureAnnexure
        generationContext.property_disclosure_annexure = propertyDisclosureAnnexure
        generationContext.readOnlyAnnexures = [propertyDisclosureAnnexure]
        generationContext.otpAnnexures = [propertyDisclosureAnnexure]
        generationContext.onboardingFormData = {
          ...(generationContext.onboardingFormData || {}),
          annexuresList,
          annexures_list: annexuresList,
          propertyDisclosureAnnexure,
          property_disclosure_annexure: propertyDisclosureAnnexure,
        }
        generationContext.sourceContext = {
          ...(existingPacketSourceContext || {}),
          ...(generationContext.sourceContext || {}),
          packetType: 'otp',
          contextType: documentStartEntryPoint === 'accepted_offer_otp' ? 'accepted_offer' : 'transaction',
          transactionId: transactionId || null,
          leadId: normalizeLeadUuid(routeLeadId) || null,
          listingId: sourceListingId || null,
          offerId: routeOfferId || null,
          propertyDisclosureAnnexure,
          property_disclosure_annexure: propertyDisclosureAnnexure,
          lockedPropertyDisclosureAnnexure: propertyDisclosureAnnexure,
          readOnlyAnnexures: [propertyDisclosureAnnexure],
          otpAnnexures: [propertyDisclosureAnnexure],
          annexuresList,
        }
      }
    }
    if (packetType === 'mandate') {
      const mandateData = isDeveloperAgentMandatePacket && existingPacketSourceContext.generatedDataSnapshot && typeof existingPacketSourceContext.generatedDataSnapshot === 'object'
        ? {
            ...existingPacketSourceContext.generatedDataSnapshot,
            sourceContext: {
              ...(existingPacketSourceContext.generatedDataSnapshot.sourceContext || {}),
              mandateType: 'developer_agent_mandate',
              relationshipMode: 'developer_buyer',
            },
          }
        : mapSellerOnboardingToMandateData({
            onboardingSubmission: {
              ...((generationContext?.lead?.sellerOnboarding?.formData && typeof generationContext.lead.sellerOnboarding.formData === 'object')
                ? generationContext.lead.sellerOnboarding.formData
                : {}),
              status: normalizeText(generationContext?.lead?.sellerOnboardingStatus || generationContext?.lead?.sellerOnboarding?.status),
            },
            lead: generationContext?.lead || {},
            privateListing: generationContext?.privateListing || {},
            agency: generationContext?.agency || {},
            organisation: generationContext?.organisation || {},
            agent: generationContext?.agent || {},
            contact: generationContext?.contact || {},
            transaction: generationContext?.transaction || {},
            mandateDraft: generationContext?.mandateDraft || {},
          })
      const mandatePreflight = validateMandateGenerationData(mandateData, { action: 'generate' })
      generationContext.mandateData = mandateData
      generationContext.mandateValidation = mandatePreflight
      generationContext.generatedDataSnapshot = mandateData
      generationContext.sourceContext = isDeveloperAgentMandatePacket
        ? {
            ...existingPacketSourceContext,
            ...(mandateData.sourceContext || {}),
            mandateType: 'developer_agent_mandate',
            relationshipMode: 'developer_buyer',
          }
        : {
            ...(mandateData.sourceContext || {}),
            sourceMode: documentStartSourceMode || null,
            documentStart: documentStartEntryPoint || null,
            listingId: sourceListingId || null,
          }
      if (!mandatePreflight.canProceed) {
        console.warn('[MANDATE] legal workspace preflight found missing data; continuing with mandate generation.', {
          leadId: normalizeText(generationContext?.lead?.leadId || routeLeadId),
          missingRequiredFields: mandatePreflight.missingRequiredFields,
          warnings: mandatePreflight.warnings,
        })
      }
    }

    const templateResolution = await withLegalWorkspaceTimeout(
      resolveActiveTemplate({
        packetType,
        moduleType: 'residential',
        organisationId,
        context: generationContext,
      }),
      'Template lookup is taking too long.',
      generationLookupTimeoutMs,
    )
    template = templateResolution?.template || null
    if (!template?.id) {
      const templates = await withLegalWorkspaceTimeout(
        listPacketTemplates({
          packetType,
          moduleType: 'agency',
          includeInactive: false,
          organisationId,
        }),
        'Template lookup is taking too long.',
        generationLookupTimeoutMs,
      )
      template = getFirstTemplate(templates, packetType)
    }
    logGenerationStage('template_resolved', { templateId: normalizeText(template?.id) || null })

    onProgress?.('Preparing mandate packet...')
    const packet = await ensurePacket({ template, allowRuntime: false, forceNew: resetMandatePacket })
    logGenerationStage('packet_ready', { packetId: normalizeText(packet?.id) || null })

    if (isRuntimePacketId(packet?.id)) {
      const runtimeDraft = buildRuntimeMandateDraft({
        packet,
        context: generationContext,
        branding: workspaceBranding,
      })
      applyInitialStatus(runtimeDraft.status)
      if (packetType === 'mandate' && leadContext.lead?.leadId) {
        void syncLeadMandateState({
          mandateRuntimeDraftId: normalizeText(packet?.id),
          mandateStatus: 'generated',
          mandateGeneratedAt: new Date().toISOString(),
        }, { reason: 'persist the runtime mandate draft state' })
        void recordLeadMandateActivity({
          agent: { id: actor.id, name: normalizeText(profile?.full_name || profile?.fullName || profile?.email || actor.name), email: actor.email },
          activityType: 'Mandate Generated',
          activityNote: 'Mandate was generated successfully.',
          outcome: 'Generated',
        })
      }
      window.dispatchEvent(new Event('itg:transaction-updated'))
      return runtimeDraft
    }

    onProgress?.('Generating mandate PDF... this can take up to a minute.')
    const generationResult = await withLegalWorkspaceTimeout(
      generatePacketVersion({
        packetId: packet.id,
        packetType,
        template,
        allowWarnings: true,
        forceGenerate: false,
        context: generationContext,
      }),
      'Draft generation is taking too long.',
      LEGAL_WORKSPACE_GENERATION_TIMEOUT_MS,
    )
    logGenerationStage('pdf_generated', {
      packetId: normalizeText(packet?.id) || null,
      versionId: normalizeText(generationResult?.version?.id) || null,
    })

    if (packetType === 'mandate' && leadContext.lead?.leadId) {
      void syncLeadMandateState({
        mandatePacketId: normalizeText(packet?.id),
        mandateRuntimeDraftId: '',
        mandateStatus: 'generated',
        mandateGeneratedAt: new Date().toISOString(),
      }, { reason: 'persist the generated mandate packet state' })
      void recordLeadMandateActivity({
        agent: { id: actor.id, name: normalizeText(profile?.full_name || profile?.fullName || profile?.email || actor.name), email: actor.email },
        activityType: 'Mandate Generated',
        activityNote: 'Mandate was generated successfully.',
        outcome: 'Generated',
      })
    }
    setValidatedRoutePacketId(normalizeText(packet?.id))

    // The render response already has the new packet and version. Show it immediately;
    // reconciliation is deliberately background work and must not block or replace it.
    let refreshedStatus = {
      packetType,
      state: 'PDF_GENERATED',
      signingStatus: 'generated',
      packet: generationResult.packet || packet,
      versions: [generationResult.version].filter(Boolean),
      signingSummary: null,
      warnings: generationResult.validation?.warnings || [],
      actionHint: 'Draft generated.',
    }
    applyInitialStatus(refreshedStatus)

    void withLegalWorkspaceTimeout(
      resolveDocumentPacketStatus({
        packetType,
        packetId: packet.id,
        transactionId,
        leadId: routeLeadId,
        organisationId,
      }),
      'Generated packet status is taking too long.',
    ).then((resolvedStatus) => {
      const currentPacketId = normalizeText(initialStatusValueRef.current?.packet?.id)
      if (currentPacketId && currentPacketId !== normalizeText(packet.id)) return
      applyInitialStatus(resolvedStatus)
    }).catch((statusError) => {
      console.warn('[LegalDocumentWorkspacePage] generated packet status reconciliation failed; keeping generation result.', statusError)
    })

    // Listing creation is useful follow-up work, but must not keep the newly generated
    // mandate in a busy state or route the agent away from the workspace.
    void createListingFromGeneratedMandate({
      packet: generationResult.packet || refreshedStatus?.packet || packet,
      status: refreshedStatus,
      mandateData: generationContext.mandateData,
      sourceListingId,
      navigateToListing: false,
    }).then((autoCreateResult) => {
      if (autoCreateResult?.listing) {
        logGenerationStage('listing_synced', { listingId: normalizeText(autoCreateResult.listing.id) || null })
      }
    }).catch((listingError) => {
      console.warn('[LegalDocumentWorkspacePage] generated mandate listing sync skipped.', listingError)
    })

    window.dispatchEvent(new Event('itg:transaction-updated'))
    return {
      ...generationResult,
      status: refreshedStatus,
    }
  }, [
    actor,
    applyInitialStatus,
    createListingFromGeneratedMandate,
    documentStartEntryPoint,
    documentStartSourceMode,
    ensurePacket,
    effectiveOtpDraft,
    initialStatus,
    leadContext,
    effectiveMandateDraft,
    organisationId,
    packetType,
    profile,
    recordLeadMandateActivity,
    resolveCurrentStatus,
    role,
    routeLeadId,
    routeListingId,
    routeOfferId,
    syncLeadMandateState,
    transaction,
    transactionDetail,
    transactionId,
    validatedRoutePacketId,
    workspaceBranding,
    workspaceSettings,
  ])

  const handleSend = useCallback(async ({ resend = false, reminder = false, signerLinks = [], packetId: sentPacketId = '', targetSignerRole = '', signingStatus = '' } = {}) => {
    // Mandate sending already has the packet and signer links from the workspace.
    // Avoid a full packet/status read before the email edge call.
    const shouldResolveStatus = packetType === 'otp'
    const status = shouldResolveStatus ? await resolveCurrentStatus() : null
    const latestVersion = status ? getLatestVersion(status) : null
    if (packetType === 'otp') {
      const recipients = (Array.isArray(signerLinks) ? signerLinks : []).filter((signer) =>
        normalizeText(signer?.signing_link) && normalizeText(signer?.signer_email)
      )
      if (!recipients.length) {
        const error = new Error('No OTP signing recipient has a secure link and email address.')
        error.code = 'SIGNING_EMAIL_FAILED'
        throw error
      }
      const deliveries = []
      for (const signer of recipients) {
        const recipientEmail = normalizeText(signer.signer_email).toLowerCase()
        const recipientName = normalizeText(signer.signer_name) || 'Signer'
        const response = await withLegalWorkspaceTimeout(
          invokeEdgeFunction('send-mandate-signing-email', {
            body: {
              type: 'seller_mandate_sent',
              to: recipientEmail,
              organisationId,
              packetId: normalizeText(status?.packet?.id || latestVersion?.packet_id || sentPacketId),
              recipientRole: 'seller',
              recipientName,
              sellerName: recipientName,
              propertyTitle: transactionReference || 'your property transaction',
              mandateType: 'Offer to Purchase',
              portalLink: normalizeText(signer.signing_link),
              resend: Boolean(resend),
              reminder: Boolean(reminder),
            },
          }),
          `The OTP signing email to ${recipientEmail} timed out before delivery was confirmed.`,
          LEGAL_WORKSPACE_SIGNING_EMAIL_TIMEOUT_MS,
        )
        assertEdgeFunctionSuccess(response, `The OTP signing email could not be sent to ${recipientEmail}.`)
        deliveries.push({ emailDeliveryId: normalizeText(response?.data?.emailId), recipientEmail, recipientRole: normalizeText(signer.signer_role) })
      }
      if (latestVersion?.rendered_document_id) {
        await updateOtpDocumentWorkflowState({
          documentId: latestVersion.rendered_document_id,
          workflowState: OTP_DOCUMENT_TYPES.sentToClient,
          isClientVisible: true,
        })
      }
      window.dispatchEvent(new Event('itg:transaction-updated'))
      return {
        emailDeliveryId: deliveries[0]?.emailDeliveryId || null,
        emailDeliveryIds: deliveries.map((row) => row.emailDeliveryId).filter(Boolean),
        recipientEmail: deliveries[0]?.recipientEmail || null,
        recipientEmails: deliveries.map((row) => row.recipientEmail),
        recipientRole: deliveries[0]?.recipientRole || null,
        emailConfirmed: deliveries.length === recipients.length,
      }
    }
    if (packetType === 'mandate' && leadContext.lead?.leadId) {
      const sellerName =
        normalizeText(leadContext?.contact?.name) ||
        [leadContext?.contact?.firstName, leadContext?.contact?.lastName].map(normalizeText).filter(Boolean).join(' ') ||
        normalizeText(leadContext?.lead?.name) ||
        'Seller'
      const signerRows = Array.isArray(signerLinks) ? signerLinks : []
      const normalizedTargetRole = normalizeText(targetSignerRole).toLowerCase()
      const activeSigner =
        signerRows.find((signer) =>
          normalizeText(signer?.signing_link) &&
          (!normalizedTargetRole || normalizeText(signer?.signer_role).toLowerCase() === normalizedTargetRole)
        ) ||
        signerRows.find((signer) => normalizeText(signer?.signing_link)) ||
        null
      const signerRole = normalizeText(activeSigner?.signer_role).toLowerCase()
      const agentEmail = normalizeText(profile?.email || actor.email).toLowerCase()
      const agentName = normalizeText(profile?.full_name || profile?.fullName || profile?.email || actor.name || actor.email || 'Agent')
      const sellerEmail = normalizeText(leadContext?.contact?.email || leadContext?.lead?.sellerEmail || leadContext?.lead?.email).toLowerCase()
      const secondarySignerLabel = resolveMandateSecondarySignerConfig({
        sourceContext: status?.packet?.source_context_json || {},
        latestVersion,
      }).label || 'Co-signer'
      const recipientLabel = getMandateSignerRoleLabel(signerRole, { secondarySignerLabel })
      const recipientLabelLower = recipientLabel.toLowerCase()
      const signingLink = normalizeText(activeSigner?.signing_link)
      const recipientEmail = signerRole === 'agent'
        ? normalizeText(activeSigner?.signer_email || agentEmail).toLowerCase()
        : normalizeText(activeSigner?.signer_email || (signerRole === 'seller' ? sellerEmail : '')).toLowerCase()
      const recipientName = signerRole === 'agent'
        ? normalizeText(activeSigner?.signer_name || agentName)
        : normalizeText(activeSigner?.signer_name || (signerRole === 'seller' ? sellerName : recipientLabel))
      let emailDelivery = null
      if (!signingLink) {
        const linkError = new Error(`The ${recipientLabelLower} signing link could not be created. Confirm the ${recipientLabelLower} has an email address, then try again.`)
        linkError.code = 'SIGNING_LINK_FAILED'
        throw linkError
      }
      if (isSupabaseConfigured && recipientEmail) {
        const emailResponse = await withLegalWorkspaceTimeout(
          invokeEdgeFunction('send-mandate-signing-email', {
            body: {
              type: 'seller_mandate_sent',
              to: recipientEmail,
              organisationId,
              packetId: normalizeText(status?.packet?.id || latestVersion?.packet_id || sentPacketId),
              recipientRole: signerRole === 'agent' ? 'agent' : 'seller',
              recipientName,
              sellerName,
              propertyTitle: normalizeText(leadContext?.lead?.propertyAddress || leadContext?.lead?.listingTitle || transactionReference || 'your property'),
              mandateType: 'Mandate',
              portalLink: signingLink,
              agentName,
              resend: Boolean(resend),
              reminder: Boolean(reminder),
            },
          }),
          `The mandate signing email to the ${recipientLabelLower} timed out before the email provider confirmed delivery. The signing link is prepared; use Resend from this page if no email arrives.`,
          LEGAL_WORKSPACE_SIGNING_EMAIL_TIMEOUT_MS,
        )
        assertEdgeFunctionSuccess(emailResponse, `The mandate signing email could not be sent to the ${recipientLabelLower}.`)
        emailDelivery = {
          emailDeliveryId: normalizeText(emailResponse?.data?.emailId),
          recipientRole: signerRole === 'agent' ? 'agent' : 'seller',
          recipientEmail,
        }
      }
      const nextMandateStatus = normalizeText(signingStatus) || (signerRole === 'agent' ? 'sent_to_agent' : signerRole === 'seller' ? 'sent_to_seller' : 'sent_for_signature')
      void syncLeadMandateState({
        stage: 'Mandate Sent',
        status: 'Sent',
        mandateStatus: nextMandateStatus,
        mandateSentAt: new Date().toISOString(),
        mandateSigningLink: signingLink,
      }, { reason: 'persist the mandate send state' })
      const linkedListingId = normalizeText(
        leadContext?.lead?.listingId ||
        leadContext?.lead?.listing_id ||
        leadContext?.lead?.privateListingId ||
        leadContext?.lead?.private_listing_id,
      )
      if (isSupabaseConfigured && isUuidLike(linkedListingId)) {
        try {
          await updatePrivateListing(
            linkedListingId,
            {
              listingStatus: 'mandate_sent',
              mandateStatus: 'sent',
            },
            { includeRequirementsAndDocuments: false },
          )
          await createPrivateListingActivity({
            privateListingId: linkedListingId,
            activityType: 'mandate_sent',
            activityTitle: 'Mandate sent for digital signing',
            activityDescription: `Mandate was sent to the ${recipientLabelLower} for digital signing.`,
            performedBy: normalizeText(actor.id),
            visibility: 'internal',
            metadata: {
              leadId: normalizeText(leadContext?.lead?.leadId),
              packetId: normalizeText(status?.packet?.id || latestVersion?.packet_id || sentPacketId),
              signingMethod: 'digital',
              recipientRole: signerRole || null,
            },
          })
        } catch (listingUpdateError) {
          console.warn('[LegalDocumentWorkspacePage] linked listing mandate send sync skipped.', listingUpdateError)
        }
      }
      void recordLeadMandateActivity({
        agent: { id: actor.id, name: normalizeText(profile?.full_name || profile?.fullName || profile?.email || actor.name), email: actor.email },
        activityType: 'Mandate Sent',
        activityNote: reminder
          ? `Signing reminder was sent to the ${recipientLabelLower}.`
          : resend
          ? `Mandate signing link was resent to the ${recipientLabelLower}.`
          : `Mandate was sent to the ${recipientLabelLower} for digital signing.`,
        outcome: reminder ? `Signing reminder sent to ${recipientLabelLower}` : resend ? `Signing link resent to ${recipientLabelLower}` : `Sent to ${recipientLabelLower} for digital signing`,
      })
      window.dispatchEvent(new Event('itg:transaction-updated'))
      return {
        ...emailDelivery,
        recipientRole: emailDelivery?.recipientRole || (signerRole === 'agent' ? 'agent' : 'seller'),
        recipientEmail: emailDelivery?.recipientEmail || recipientEmail,
      }
    }
    window.dispatchEvent(new Event('itg:transaction-updated'))
  }, [actor, leadContext, organisationId, packetType, profile, recordLeadMandateActivity, resolveCurrentStatus, syncLeadMandateState, transactionReference])

  const handleSignedFinalized = useCallback(async (payload = {}) => {
    if (packetType !== 'mandate') return null

    let currentStatus = null
    try {
      currentStatus = await resolveCurrentStatus()
    } catch (statusError) {
      if (!isLegalWorkspaceTimeoutError(statusError)) {
        console.warn('[LegalDocumentWorkspacePage] signed mandate status refresh skipped.', statusError)
      }
      currentStatus = initialStatus || null
    }

    const artifact = resolveSignedMandateArtifact(payload, currentStatus)
    const packetId = normalizeText(artifact.packetId || validatedRoutePacketId || leadContext?.lead?.mandatePacketId)
    const packetVersionId = normalizeText(artifact.packetVersionId)
    const finalizedAt = normalizeText(artifact.finalizedAt) || new Date().toISOString()
    const finalFilePath = normalizeText(artifact.finalFilePath)
    const finalFileUrl = normalizeText(artifact.finalFileUrl)
    const finalFileName = normalizeText(artifact.finalFileName) || 'Signed Mandate.pdf'
    const finalFileBucket = normalizeText(artifact.finalFileBucket)
    const signingStatus = normalizeKey(artifact.signingStatus) === 'uploaded_signed' ? 'signed_uploaded' : 'signed'
    const sellerNotification = getSignedMandateNotificationContext({
      leadContext,
      profile,
      actor,
      transactionReference,
      finalFileName,
      finalFileUrl,
      finalizedAt,
    })

    if (leadContext.lead?.leadId) {
      await Promise.resolve(syncLeadMandateState({
        stage: 'Mandate Signed',
        status: 'Signed',
        mandateStatus: signingStatus,
        mandateSignedAt: finalizedAt,
        mandatePacketId: packetId,
        mandatePacketVersionId: packetVersionId,
        mandateSignedDocumentPath: finalFilePath,
        mandateSignedDocumentUrl: finalFileUrl,
      }, { reason: 'persist the signed mandate state' })).catch((leadSyncError) => {
        console.warn('[LegalDocumentWorkspacePage] signed mandate lead sync skipped.', leadSyncError)
      })
    }

    const linkedListingId = normalizeText(
      routeListingId ||
        leadContext?.lead?.listingId ||
        leadContext?.lead?.listing_id ||
        leadContext?.lead?.privateListingId ||
        leadContext?.lead?.private_listing_id ||
        leadContext?.privateListing?.id ||
        leadContext?.listing?.id,
    )
    let linkedDocument = null
    const sellerWorkspaceToken = normalizeText(
      leadContext?.lead?.sellerOnboardingToken ||
        leadContext?.lead?.sellerOnboarding?.token ||
        leadContext?.privateListing?.sellerOnboarding?.token ||
        leadContext?.listing?.sellerOnboarding?.token,
    )

    if (isSupabaseConfigured && isUuidLike(linkedListingId)) {
      try {
        await updatePrivateListing(
          linkedListingId,
          {
            listingStatus: 'mandate_signed',
            mandateStatus: 'signed',
            mandatePacketId: packetId,
          },
          { includeRequirementsAndDocuments: false },
        )

        if (finalFilePath || finalFileUrl) {
          linkedDocument = await linkPrivateListingDocument(linkedListingId, {
            documentType: 'signed_mandate',
            documentCategory: 'Mandate',
            documentName: finalFileName,
            filePath: finalFilePath,
            fileUrl: finalFileUrl,
            visibility: 'seller_visible',
            status: 'signed',
            requirementKey: 'signed_mandate',
            uploadedAt: finalizedAt,
            metadata: {
              source: 'legal_document_workspace',
              leadId: normalizeText(leadContext?.lead?.leadId),
              packetId,
              packetVersionId,
              signingMethod: artifact.signingMethod || null,
              signingStatus: artifact.signingStatus || null,
              finalFileBucket: finalFileBucket || null,
              finalSignedDocumentId: artifact.finalSignedDocumentId || null,
            },
          })
        }

        if (sellerWorkspaceToken && isUuidLike(packetId) && supabase) {
          const portalContextUpdate = await supabase
            .from('client_portal_contexts')
            .update({
              mandate_packet_id: packetId,
              updated_at: finalizedAt,
            })
            .eq('seller_workspace_token', sellerWorkspaceToken)
          if (
            portalContextUpdate.error &&
            !String(portalContextUpdate.error?.message || '').toLowerCase().includes('client_portal_contexts')
          ) {
            console.warn('[LegalDocumentWorkspacePage] seller portal context mandate packet sync skipped.', portalContextUpdate.error)
          }
        }

        await createPrivateListingActivity({
          privateListingId: linkedListingId,
          activityType: 'mandate_signed',
          activityTitle: 'Signed mandate received',
          activityDescription: 'Your signed mandate has been recorded and is available in your seller portal.',
          performedBy: normalizeText(actor.id),
          visibility: 'client_visible',
          metadata: {
            audience: 'seller',
            visibility: 'client_visible',
            actionLabel: 'View documents',
            actionRoute: 'documents',
            actorName: normalizeText(profile?.full_name || profile?.fullName || profile?.email || actor.name || actor.email || 'Agent'),
            actorRole: 'Agent',
            leadId: normalizeText(leadContext?.lead?.leadId),
            packetId,
            packetVersionId,
            documentId: normalizeText(linkedDocument?.id || artifact.finalSignedDocumentId),
            signingMethod: artifact.signingMethod || null,
            signingStatus: artifact.signingStatus || null,
          },
        })
      } catch (listingSyncError) {
        console.warn('[LegalDocumentWorkspacePage] linked listing signed mandate sync skipped.', listingSyncError)
      }
    }

    const signedMandateAttorney = {
      preferredPartnerId: normalizeText(effectiveMandateDraft.transferAttorneyPreferredPartnerId),
      partnerOrganisationId: normalizeText(effectiveMandateDraft.transferAttorneyPartnerOrganisationId),
      companyName: normalizeText(effectiveMandateDraft.transferAttorneyCompanyName),
      contactPerson: normalizeText(effectiveMandateDraft.transferAttorneyContactPerson),
      email: normalizeText(effectiveMandateDraft.transferAttorneyEmail),
      phone: normalizeText(effectiveMandateDraft.transferAttorneyPhone),
    }
    if (
      isSupabaseConfigured &&
      isUuidLike(linkedListingId) &&
      !effectiveMandateDraft.transferAttorneySelectionDeferred
    ) {
      const allocation = await allocatePrivateListingTransferAttorney({
        privateListingId: linkedListingId,
        attorney: signedMandateAttorney,
        mandatePacketId: packetId,
        mandateSignedAt: finalizedAt,
        source: normalizeText(effectiveMandateDraft.transferAttorneySelectionSource) || 'seller_mandate',
        metadata: {
          source: 'legal_document_workspace',
          phase: 'mandate_attorney_allocation_phase1',
          leadId: normalizeText(leadContext?.lead?.leadId) || null,
          packetVersionId: packetVersionId || null,
        },
      })
      await createPrivateListingActivity({
        privateListingId: linkedListingId,
        activityType: 'transfer_attorney_allocated',
        activityTitle: 'Transfer attorney allocated',
        activityDescription: `${allocation.companyName} was allocated when the mandate was signed.`,
        performedBy: normalizeText(actor.id),
        visibility: 'internal',
        metadata: {
          allocationId: allocation.id,
          preferredPartnerId: allocation.preferredPartnerId,
          attorneyCompanyName: allocation.companyName,
          attorneyEmail: allocation.email || null,
          allocationStatus: allocation.status,
          mandatePacketId: packetId || null,
        },
      })
    } else if (isSupabaseConfigured && isUuidLike(linkedListingId) && effectiveMandateDraft.transferAttorneySelectionDeferred) {
      await createPrivateListingActivity({
        privateListingId: linkedListingId,
        activityType: 'transfer_attorney_allocation_deferred',
        activityTitle: 'Transfer attorney nomination deferred',
        activityDescription: 'The mandate was signed with the seller attorney nomination still outstanding.',
        performedBy: normalizeText(actor.id),
        visibility: 'internal',
        metadata: {
          mandatePacketId: packetId || null,
          requiresAttorneySelection: true,
        },
      })
    }

    if (isSupabaseConfigured && isUuidLike(packetId)) {
      await appendDocumentPacketEvent({
        packetId,
        organisationId: normalizeText(currentStatus?.packet?.organisation_id || organisationId) || null,
        versionId: packetVersionId,
        eventType: SELLER_PORTAL_INVITE_AFTER_MANDATE_SIGNED_EVENT,
        eventPayload: {
          triggerSource: 'legal_document_workspace',
          triggerReason: 'mandate_signed',
          portalInviteStatus: 'ready',
          readyForSellerPortalPasswordInvite: true,
          requiresPasswordSetup: true,
          signedAt: finalizedAt,
          finalizedAt,
          packetStatus: 'completed',
          listingId: linkedListingId || null,
          sellerWorkspaceTokenPresent: Boolean(sellerWorkspaceToken),
          finalArtifactPath: finalFilePath || null,
          finalArtifactUrlPresent: Boolean(finalFileUrl),
          signingMethod: artifact.signingMethod || null,
          signingStatus,
        },
      }).catch((triggerError) => {
        console.warn('[LegalDocumentWorkspacePage] seller portal invite trigger marker skipped.', triggerError)
        return null
      })
    }

    if (isSupabaseConfigured && isUuidLike(packetId)) {
      await sendSellerPortalInviteAfterMandateSigned({
        packetId,
        organisationId: normalizeText(currentStatus?.packet?.organisation_id || organisationId),
        versionId: packetVersionId,
        listingId: linkedListingId,
        sellerWorkspaceToken,
        finalArtifactPath: finalFilePath,
        finalArtifactUrlPresent: Boolean(finalFileUrl),
        source: 'legal_document_workspace',
      }).catch((portalInviteError) => {
        console.warn('[LegalDocumentWorkspacePage] seller portal invite after mandate signed skipped.', portalInviteError)
        return null
      })
    }

    if (isSupabaseConfigured && sellerNotification.sellerEmail) {
      try {
        const emailResponse = await withLegalWorkspaceTimeout(
          invokeEdgeFunction('send-email', {
            body: {
              type: 'seller_mandate_signed',
              to: sellerNotification.sellerEmail,
              recipientName: sellerNotification.sellerName,
              sellerName: sellerNotification.sellerName,
              propertyTitle: sellerNotification.propertyTitle,
              signedAt: sellerNotification.signedAt,
              signedDocumentName: sellerNotification.signedDocumentName,
              downloadLink: sellerNotification.downloadLink,
              agentName: sellerNotification.agentName,
              organisationName: sellerNotification.organisationName,
              supportEmail: sellerNotification.supportEmail,
            },
          }),
          'The signed mandate notification email timed out. The mandate has still been finalized and stored.',
          LEGAL_WORKSPACE_SIGNING_EMAIL_TIMEOUT_MS,
        )
        assertEdgeFunctionSuccess(emailResponse, 'The signed mandate notification email could not be sent.')
      } catch (emailError) {
        console.warn('[LegalDocumentWorkspacePage] seller signed mandate notification skipped.', emailError)
      }
    }

    if (leadContext.lead?.leadId) {
      void recordLeadMandateActivity({
        agent: { id: actor.id, name: normalizeText(profile?.full_name || profile?.fullName || profile?.email || actor.name), email: actor.email },
        activityType: 'Mandate Signed',
        activityNote: finalFilePath || finalFileUrl
          ? 'Signed mandate was finalized and stored.'
          : 'Mandate signing was finalized.',
        outcome: 'Signed mandate received',
      })
    }

    window.dispatchEvent(new Event('itg:transaction-updated'))
    window.dispatchEvent(new Event('itg:listings-updated'))
    window.dispatchEvent(new Event('itg:pipeline-updated'))
    window.dispatchEvent(new CustomEvent('itg:seller-mandate-signed', {
      detail: {
        token: sellerWorkspaceToken,
        sellerOnboardingToken: sellerWorkspaceToken,
        leadId: normalizeText(leadContext?.lead?.leadId),
        sellerLeadId: normalizeText(
          leadContext?.lead?.sellerLeadId ||
            leadContext?.lead?.seller_lead_id ||
            leadContext?.lead?.sellerWorkflowLeadId ||
            leadContext?.lead?.leadId,
        ),
        listingId: linkedListingId,
        privateListingId: linkedListingId,
        mandatePacketId: packetId,
        mandatePacketVersionId: packetVersionId,
        packetVersionId,
        signedAt: finalizedAt,
        documentId: normalizeText(linkedDocument?.id || artifact.finalSignedDocumentId),
        documentName: finalFileName,
        sellerPortalVisible: Boolean(linkedDocument || finalFilePath || finalFileUrl),
        source: 'legal_document_workspace',
      },
    }))

    return {
      packetId,
      packetVersionId,
      finalFilePath,
      finalFileUrl,
      linkedListingId,
      linkedDocument,
    }
  }, [
    actor,
    initialStatus,
    leadContext,
    packetType,
    profile,
    recordLeadMandateActivity,
    resolveCurrentStatus,
    routeListingId,
    syncLeadMandateState,
    transactionReference,
    validatedRoutePacketId,
    organisationId,
    effectiveMandateDraft,
  ])

  const openLatestDocument = useCallback(async ({ signed = false } = {}) => {
    const status = await resolveCurrentStatus()
    const latestVersion = getLatestVersion(status)
    const url = signed
      ? normalizeText(latestVersion?.final_signed_file_access_url || latestVersion?.final_signed_file_url)
      : normalizeText(latestVersion?.rendered_file_access_url || latestVersion?.rendered_file_url)
    if (!url) {
      throw new Error(signed ? 'Signed document is not available yet.' : 'Document preview is not available yet.')
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [resolveCurrentStatus])

  if (loadingContext) {
    return (
      <section className="flex min-h-[420px] items-center justify-center rounded-[18px] border border-[#dce6f2] bg-white text-sm font-semibold text-[#60758d]">
        Loading legal document workspace...
      </section>
    )
  }

  if (pageError) {
    return (
      <section className="rounded-[20px] border border-[#f1d8d0] bg-[#fff7f5] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em] text-[#9d3b2b]">
              <AlertCircle size={16} />
              Legal Workspace Unavailable
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-[#142132]">This legal document could not be opened.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6b7d93]">{pageError}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={handleBack}>
              <ArrowLeft size={14} />
              Back
            </Button>
            <Button type="button" onClick={() => void loadRouteContext()}>
              Retry
            </Button>
          </div>
        </div>
      </section>
    )
  }

  const rolloutScopeMatches = runtimeRolloutAccess.organisationId === normalizeText(organisationId)
  if (!rolloutScopeMatches || !runtimeRolloutAccess.decision) {
    return (
      <section className="flex min-h-[420px] items-center justify-center rounded-[18px] border border-[#dce6f2] bg-white text-sm font-semibold text-[#60758d]">
        Checking document rollout access...
      </section>
    )
  }

  if (runtimeRolloutAccess.decision?.allowed !== true) {
    const rolloutDecision = runtimeRolloutAccess.decision
    return (
      <section className="rounded-[20px] border border-[#f0d8aa] bg-[#fffaf0] p-6" data-testid="document-runtime-rollout-blocked">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em] text-[#8a5a12]"><AlertCircle size={16} /> Controlled document rollout</p>
        <h1 className="mt-2 text-2xl font-semibold text-[#142132]">{rolloutDecision.title || 'Document workspace temporarily unavailable'}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6b7d93]">{rolloutDecision.message}</p>
        <ol className="mt-4 space-y-2 text-sm text-[#52677f]">
          {(rolloutDecision.solution?.phases || []).map((phase) => <li key={phase.id}><span className="font-semibold">{phase.id}</span> {phase.action}</li>)}
        </ol>
        <Button type="button" variant="secondary" className="mt-5" onClick={handleBack}><ArrowLeft size={14} /> Back</Button>
      </section>
    )
  }

  return (
    <>
      {showMandateDraftPanel ? (
        <MandateDraftIntakePanel
          draft={effectiveMandateDraft}
          sourceMode={documentStartSourceMode}
          documentStart={documentStartEntryPoint}
          preferredAttorneys={preferredTransferAttorneys}
          preferredAttorneysLoading={preferredTransferAttorneysLoading}
          preferredAttorneysError={preferredTransferAttorneysError}
          selectedAttorneyId={selectedTransferAttorneyId}
          attorneySelectionDeferred={transferAttorneySelectionDeferred}
          onAttorneyChange={(partnerId) => {
            setSelectedTransferAttorneyId(partnerId)
            if (partnerId) setTransferAttorneySelectionDeferred(false)
          }}
          onAttorneySelectionDeferredChange={setTransferAttorneySelectionDeferred}
          onConfirm={handleConfirmMandateEssentials}
          onEditSellerDetails={handleEditMandateSellerDetails}
        />
      ) : null}

      {showOtpDraftPanel ? (
        <OtpDraftIntakePanel
          draft={effectiveOtpDraft}
          sourceMode={documentStartSourceMode}
          documentStart={documentStartEntryPoint}
          onFieldChange={updateOtpDraftField}
          onReset={resetOtpDraftFields}
        />
      ) : null}

      <LegalDocumentWorkspace
        displayMode="page"
        open
        onBack={handleBack}
        onClose={handleBack}
        backLabel={routeListingId && !transactionId ? 'Back to Listing' : routeLeadId && !transactionId ? 'Back to Lead' : 'Back to Transaction'}
        transactionId={transactionId}
        transactionReference={transactionReference}
        packetType={packetType}
        packetId={validatedRoutePacketId || normalizeText(initialStatus?.packet?.id)}
        mode={mode}
        initialStatus={initialStatus}
        organisationId={organisationId}
        branding={workspaceBranding}
        onGenerate={handleGenerate}
        onEdit={handleGenerate}
        onSend={handleSend}
        onSignedFinalized={handleSignedFinalized}
        onView={() => openLatestDocument({ signed: false })}
        onViewSigned={() => openLatestDocument({ signed: true })}
        onRefreshContext={undefined}
        autoGenerateEnabled={contextHydrated && routeContextSettled}
      />
    </>
  )
}
