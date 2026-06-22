import {
  Archive,
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Percent,
  Phone,
  Send,
  Target,
  UserRound,
  Users,
} from 'lucide-react'
import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import Button from '../../../components/ui/Button'
import CommercialStatusPill from '../components/CommercialStatusPill'
import {
  formatRelativeTime,
  formatShortDate,
  normalizeKey,
  normalizeText,
} from '../commercialProspectFormatters'
import {
  getCategoryBadgeVariant,
  getDealTypeFromRole,
  getDealTypeLabel,
  getPropertyCategoryLabel,
  getProspectBadgeVariant,
  getRoleLabel,
} from '../commercialProspectTypes'
import { getCommercialAssetConfiguration } from '../commercialAssetConfiguration'
import {
  buildCommercialConversionSuggestion,
  buildCommercialConversionTimeline,
  buildCommercialLeadConversionDraft,
  buildCommercialRelationshipGraph,
} from '../commercialConversionEngine'
import { normaliseCommercialProspect } from '../commercialProspectFilters'
import {
  createCommercialCanvassingActivity,
  listCommercialCanvassingWorkspace,
  updateCommercialCanvassingProspect,
} from '../services/commercialCanvassingApi'
import { getCommercialLookupData, resolveCommercialOrganisationContext } from '../services/commercialApi'

const CARD_CLASS = 'rounded-[18px] border border-[#e6edf4] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)]'

const TAB_KEYS = ['overview', 'profile', 'property', 'mandate', 'listing', 'funding', 'matching', 'viewings', 'offers', 'proposal', 'appointments', 'documents', 'activity', 'conversion']

const LANDLORD_RELATIONSHIP_TYPES = [
  'Owner',
  'Asset Manager',
  'Property Manager',
  'Developer',
  'Investor',
  'Company Representative',
  'Trust Representative',
  'Other',
]

const LANDLORD_MANDATE_TYPES = ['Open', 'Sole', 'Dual', 'Exclusive', 'None']
const LANDLORD_MANDATE_STATUSES = ['Not Started', 'Requested', 'Sent', 'Signed', 'Not Required']

const LANDLORD_JOURNEY_STAGES = [
  { key: 'LEAD_CAPTURED', label: 'Lead Captured', subtext: 'Landlord lead created' },
  { key: 'CONTACTED', label: 'Contacted', subtext: 'Broker contact logged' },
  { key: 'ONBOARDING_SENT', label: 'Landlord Onboarding Sent', subtext: 'Ownership and portfolio request sent' },
  { key: 'ONBOARDING_COMPLETE', label: 'Landlord Onboarding Complete', subtext: 'Client information received' },
  { key: 'MANDATE_SENT', label: 'Mandate Sent', subtext: 'Mandate issued for signature' },
  { key: 'MANDATE_COMPLETE', label: 'Mandate Complete', subtext: 'Authority confirmed' },
  { key: 'LANDLORD_ONBOARDED', label: 'Landlord Onboarded', subtext: 'Active client established' },
]

const LANDLORD_JOURNEY_STAGE_KEYS = LANDLORD_JOURNEY_STAGES.map((stage) => stage.key)

const LANDLORD_DOCUMENT_CHECKLIST = [
  'Company Registration Document',
  'Owner / Director ID',
  'Proof of Ownership',
  'Rates Account',
  'Existing Lease Schedule',
  'Floor Plans',
  'Mandate Agreement',
  'Property Photos',
]

const PROPERTY_TYPE_OPTIONS_BY_ASSET_CLASS = {
  retail: ['Shopping Centre', 'Strip Retail', 'Standalone Retail', 'Showroom'],
  office: ['Office Park', 'Standalone Office', 'Mixed-use Office', 'Co-working'],
  industrial: ['Warehouse', 'Factory', 'Logistics', 'Mini Units', 'Yard'],
  agricultural: ['Farm', 'Smallholding', 'Agri-processing', 'Storage'],
}

const TENANT_RELATIONSHIP_TYPES = [
  'Business Owner',
  'Managing Director',
  'Operations Manager',
  'Tenant Representative',
  'Property Consultant',
  'Investor',
  'Developer',
  'Other',
]

const TENANT_PREFERRED_AREAS = ['Rosebank', 'Sandton', 'Midrand', 'Centurion', 'Menlyn', 'Bedfordview']
const TENANT_LEASE_TERMS = ['12 Months', '24 Months', '36 Months', '60 Months', 'Custom']

const TENANT_DOCUMENT_CHECKLIST = [
  'Company Registration',
  'Director IDs',
  'Financial Statements',
  'Proof Of Address',
  'VAT Registration',
  'Lease Application',
  'Board Resolution',
]

const SELLER_RELATIONSHIP_TYPES = [
  'Owner',
  'Investor',
  'Developer',
  'Asset Manager',
  'Property Manager',
  'Trust Representative',
  'Company Representative',
  'Other',
]

const SELLER_MANDATE_STATUSES = ['Not Started', 'Requested', 'Sent', 'Signed', 'Expired']
const SELLER_MANDATE_TYPES = ['Open', 'Sole', 'Dual', 'Exclusive']
const SELLER_LISTING_STATUSES = ['Draft', 'Pending', 'Active', 'Under Offer', 'Sold', 'Withdrawn']
const SELLER_DOCUMENT_STATUSES = ['Not Requested', 'Requested', 'Uploaded', 'Verified']

const SELLER_DOCUMENT_CHECKLIST = [
  'Company Registration',
  'Director IDs',
  'Trust Documents',
  'Rates Account',
  'Title Deed',
  'Lease Schedule',
  'Property Photos',
  'Floor Plans',
  'Mandate Agreement',
]

const BUYER_RELATIONSHIP_TYPES = [
  'Owner Occupier',
  'Investor',
  'Developer',
  'Fund Manager',
  'Business Owner',
  'Property Consultant',
  'Buyer Representative',
  'Other',
]

const BUYER_PREFERRED_AREAS = ['Rosebank', 'Sandton', 'Midrand', 'Centurion', 'Menlyn', 'Bedfordview', 'Bryanston', 'Fourways']
const BUYER_FUNDING_TYPES = ['Cash', 'Commercial Bond', 'Hybrid', 'Investor Funding', 'Undecided']
const BUYER_FUNDING_STATUSES = ['Unknown', 'Discussed', 'Confirmed', 'Proof Received', 'Approved', 'Declined']
const BUYER_PRE_APPROVAL_STATUSES = ['Not Started', 'Requested', 'In Progress', 'Approved', 'Expired']
const BUYER_PURCHASE_TIMELINES = ['Immediate', '0-3 Months', '3-6 Months', '6-12 Months', 'Future Opportunity']

const BUYER_DOCUMENT_CHECKLIST = [
  'Company Registration',
  'Director IDs',
  'Proof Of Funds',
  'Financial Statements',
  'Bank Confirmation',
  'Board Resolution',
  'Trust Documents',
  'VAT Registration',
]

const BUYER_DOCUMENT_STATUSES = ['Not Requested', 'Requested', 'Uploaded', 'Verified']

function normalizeDealType(value = '') {
  const key = normalizeKey(value)
  return key === 'sale' ? 'sale' : 'lease'
}

function normalizeLeadType(record = {}, fallback = '') {
  const explicit = normalizeKey(record?.prospectRole || record?.prospectType || record?.leadType || fallback)
  if (explicit.includes('tenant') || explicit.includes('occupier')) return 'tenant'
  if (explicit.includes('landlord')) return 'landlord'
  if (explicit.includes('buyer') || explicit.includes('investor')) return 'buyer'
  if (explicit.includes('seller') || explicit.includes('owner')) return 'seller'
  const dealType = normalizeDealType(record?.dealType || getDealTypeFromRole(explicit))
  return dealType === 'sale' ? 'seller' : 'landlord'
}

function normalizeLeadStatus(value = '') {
  const key = normalizeKey(value)
  if (!key) return 'new'
  if (key.includes('converted')) return 'converted'
  if (key.includes('negotiat') || key.includes('proposal')) return 'negotiation'
  if (key.includes('qualified')) return 'qualified'
  if (key.includes('active')) return 'active'
  if (key.includes('contact') || key.includes('follow')) return 'contacted'
  if (key.includes('dormant')) return 'dormant'
  if (key.includes('lost') || key.includes('archive') || key.includes('not_interested') || key.includes('not interested')) return 'not_interested'
  return 'new'
}

function titleCase(value = '') {
  return normalizeText(value).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function toneClass(tone = 'slate') {
  switch (tone) {
    case 'blue':
      return 'border-blue-200 bg-blue-50 text-blue-700'
    case 'green':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'amber':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'purple':
      return 'border-violet-200 bg-violet-50 text-violet-700'
    case 'rose':
      return 'border-rose-200 bg-rose-50 text-rose-700'
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600'
  }
}

function getStatusTone(status = '') {
  const normalized = normalizeLeadStatus(status)
  if (normalized === 'converted') return 'green'
  if (normalized === 'negotiation') return 'amber'
  if (normalized === 'qualified' || normalized === 'active') return 'blue'
  if (normalized === 'not_interested' || normalized === 'dormant') return 'rose'
  if (normalized === 'contacted') return 'purple'
  return 'slate'
}

function getLeadRoleSpecific(record = {}) {
  return record?.roleSpecific || record?.role_specific || record?.metadata?.roleSpecific || record?.metadata_json?.roleSpecific || {}
}

function firstText(...values) {
  return values.map((value) => normalizeText(value)).find(Boolean) || ''
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

function firstBoolean(...values) {
  for (const value of values) {
    if (typeof value === 'boolean') return value
    if (['true', 'yes', 'confirmed'].includes(normalizeKey(value))) return true
    if (['false', 'no'].includes(normalizeKey(value))) return false
  }
  return false
}

function toSnakeCase(value = '') {
  return normalizeText(value).replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).replace(/[\s-]+/g, '_').replace(/^_+/, '')
}

function getAssetConfigurationForRecord(record = {}) {
  return getCommercialAssetConfiguration(getAssetClass(record))
}

function getAssetIntelligence(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  return record.assetIntelligence || record.asset_intelligence || roleSpecific.assetIntelligence || roleSpecific.asset_intelligence || record.metadata?.asset_intelligence || record.metadata_json?.asset_intelligence || {}
}

function getAssetIntelligenceValue(record = {}, fieldKey = '', assetClass = '') {
  const roleSpecific = getLeadRoleSpecific(record)
  const intelligence = getAssetIntelligence(record)
  const key = normalizeText(fieldKey)
  const snakeKey = toSnakeCase(key)
  const normalizedAssetClass = normalizeKey(assetClass || getAssetClass(record))
  const assetData = intelligence[normalizedAssetClass] || intelligence[normalizeKey(normalizedAssetClass)] || intelligence.mixed_use || {}
  return firstText(
    assetData[key],
    assetData[snakeKey],
    intelligence[key],
    intelligence[snakeKey],
    roleSpecific[key],
    roleSpecific[snakeKey],
    record[key],
    record[snakeKey],
  )
}

function buildAssetReadinessChecks(record = {}, scope = 'property') {
  const configuration = getAssetConfigurationForRecord(record)
  if (configuration.assetClass === 'other') return []
  return configuration.readinessChecks.map((check) => {
    const value = getAssetIntelligenceValue(record, check.key, configuration.assetClass) || getAssetIntelligenceValue(record, check.fallbackKey, configuration.assetClass)
    return {
      key: `asset_${check.key}`,
      label: check.label,
      scope,
      complete: Boolean(value),
    }
  })
}

function buildAssetDocumentChecklist(baseChecklist = [], record = {}) {
  const configuration = getAssetConfigurationForRecord(record)
  return [...new Set([...baseChecklist, ...(configuration.documentChecklist || [])])]
}

function getPreservedData(record = {}) {
  return getLeadRoleSpecific(record).preservedProspectData || {}
}

function getLeadName(record = {}) {
  const preserved = getPreservedData(record)
  return normalizeText(record.companyName || preserved.companyName || record.displayName || record.contactName || preserved.contactPerson) || 'Commercial lead'
}

function getContactName(record = {}) {
  const preserved = getPreservedData(record)
  return normalizeText(record.contactName || preserved.contactPerson || [record.firstName, record.lastName].filter(Boolean).join(' ')) || 'Contact pending'
}

function getPhone(record = {}) {
  const preserved = getPreservedData(record)
  return normalizeText(record.phone || preserved.contactNumber) || 'Phone pending'
}

function getEmail(record = {}) {
  const preserved = getPreservedData(record)
  return normalizeText(record.email || preserved.email) || 'Email pending'
}

function getArea(record = {}) {
  const preserved = getPreservedData(record)
  return normalizeText(record.area || record.preferredArea || record.propertyAddress || preserved.area || preserved.address) || 'Area pending'
}

function getAssetClass(record = {}) {
  const preserved = getPreservedData(record)
  return normalizeKey(record.propertyCategory || preserved.assetClass || record.propertyType) || ''
}

function getAssetClassLabel(record = {}) {
  const assetClass = getAssetClass(record)
  return assetClass ? getPropertyCategoryLabel(assetClass) : 'Asset class pending'
}

function getSource(record = {}) {
  const preserved = getPreservedData(record)
  return normalizeText(record.sourceLabel || record.canvassingMethod || preserved.source) || 'Source pending'
}

function getBroker(record = {}) {
  const preserved = getPreservedData(record)
  return normalizeText(record.assignedBrokerName || preserved.brokerName) || 'No broker assigned'
}

function getLandlordProfile(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  const preserved = getPreservedData(record)
  return {
    companyName: getLeadName(record),
    contactPerson: getContactName(record),
    relationshipType: firstText(record.relationshipType, record.relationship_type, roleSpecific.relationshipType, roleSpecific.relationship_type) || 'Owner',
    phone: getPhone(record),
    email: getEmail(record),
    alternativeContact: firstText(record.alternativeContact, record.alternative_contact, roleSpecific.alternativeContact, roleSpecific.alternative_contact) || 'Not captured',
    broker: getBroker(record),
    source: getSource(record),
    notes: firstText(record.notes, roleSpecific.qualificationNotes, roleSpecific.qualification_notes, preserved.notes) || 'Not captured',
  }
}

function getDefaultPropertyType(assetClass = '') {
  return PROPERTY_TYPE_OPTIONS_BY_ASSET_CLASS[normalizeKey(assetClass)]?.[0] || 'Not captured'
}

function getLandlordProperty(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  const preserved = getPreservedData(record)
  const assetClass = getAssetClass(record)
  const propertyName = firstText(record.propertyName, record.property_name, roleSpecific.propertyName, roleSpecific.property_name, roleSpecific.propertyDetails, roleSpecific.property_details)
  const propertyAddress = firstText(record.propertyAddress, record.property_address, roleSpecific.propertyAddress, roleSpecific.property_address, preserved.address, record.area)
  return {
    propertyName: propertyName || 'Property details pending',
    propertyAddress: propertyAddress || 'Property details pending',
    areaNode: getArea(record),
    assetClassLabel: getAssetClassLabel(record),
    assetClass: assetClass || 'other',
    propertyType: firstText(record.propertyType, record.property_type, roleSpecific.propertyType, roleSpecific.property_type) || getDefaultPropertyType(assetClass),
    glaSqm: firstNumber(record.glaSqm, record.gla_sqm, roleSpecific.glaSqm, roleSpecific.gla_sqm),
    erfSizeSqm: firstNumber(record.erfSizeSqm, record.erf_size_sqm, roleSpecific.erfSizeSqm, roleSpecific.erf_size_sqm),
    availableSizeSqm: firstNumber(record.availableSizeSqm, record.available_size_sqm, roleSpecific.availableSizeSqm, roleSpecific.available_size_sqm, roleSpecific.availableArea, roleSpecific.available_area),
    parkingNotes: firstText(record.parkingNotes, record.parking_notes, roleSpecific.parkingNotes, roleSpecific.parking_notes) || 'Not captured',
    ownershipType: firstText(record.ownershipType, record.ownership_type, roleSpecific.ownershipType, roleSpecific.ownership_type) || 'Not captured',
    authorityConfirmed: firstBoolean(record.authorityConfirmed, record.authority_confirmed, roleSpecific.authorityConfirmed, roleSpecific.authority_confirmed),
    propertyNotes: firstText(record.propertyNotes, record.property_notes, roleSpecific.propertyNotes, roleSpecific.property_notes, record.notes) || 'Not captured',
  }
}

function getLandlordVacancy(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  const vacancyId = firstText(record.vacancyId, record.vacancy_id, roleSpecific.vacancyId, roleSpecific.vacancy_id)
  const status = firstText(record.vacancyStatus, record.vacancy_status, roleSpecific.vacancyStatus, roleSpecific.vacancy_status) || (vacancyId ? 'draft' : 'not_created')
  return {
    vacancyId,
    vacancyCreated: Boolean(vacancyId),
    vacancyStatus: normalizeKey(status) === 'not_created' ? 'not_created' : normalizeKey(status),
    vacancyStatusLabel: vacancyId ? titleCase(status || 'draft') : 'No vacancy created',
    availableArea: firstNumber(record.availableSizeSqm, record.available_size_sqm, roleSpecific.availableSizeSqm, roleSpecific.available_size_sqm, roleSpecific.availableArea, roleSpecific.available_area),
    askingRental: firstNumber(record.askingRental, record.asking_rental, roleSpecific.askingRental, roleSpecific.asking_rental),
    operatingCosts: firstNumber(record.operatingCosts, record.operating_costs, roleSpecific.operatingCosts, roleSpecific.operating_costs),
    availabilityDate: firstText(record.availabilityDate, record.availability_date, roleSpecific.availabilityDate, roleSpecific.availability_date, roleSpecific.availability) || 'Not captured',
    leaseTermPreference: firstText(record.leaseTermPreference, record.lease_term_preference, roleSpecific.leaseTermPreference, roleSpecific.lease_term_preference) || 'Not captured',
    incentives: firstText(record.incentives, roleSpecific.incentives) || 'Not captured',
  }
}

function getLandlordMandate(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  const status = firstText(record.mandateStatus, record.mandate_status, roleSpecific.mandateStatus, roleSpecific.mandate_status) || 'not_started'
  const mandateType = firstText(record.mandateType, record.mandate_type, roleSpecific.mandateType, roleSpecific.mandate_type) || 'none'
  const authorityConfirmed = firstBoolean(record.authorityConfirmed, record.authority_confirmed, roleSpecific.authorityConfirmed, roleSpecific.authority_confirmed)
  return {
    mandateStatus: normalizeKey(status),
    mandateStatusLabel: titleCase(status || 'not_started') || 'Mandate not confirmed',
    mandateType: normalizeKey(mandateType),
    mandateTypeLabel: titleCase(mandateType || 'none'),
    commissionStructure: firstText(record.commissionStructure, record.commission_structure, roleSpecific.commissionStructure, roleSpecific.commission_structure) || 'Not captured',
    authorityConfirmed,
    termsNotes: firstText(record.termsNotes, record.terms_notes, roleSpecific.termsNotes, roleSpecific.terms_notes, roleSpecific.qualificationNotes, record.notes) || 'Not captured',
  }
}

function landlordHasOnboardingSent(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  const metadata = record.metadata || record.metadata_json || {}
  return Boolean(
    firstText(record.onboardingSentAt, record.onboarding_sent_at, roleSpecific.onboardingSentAt, roleSpecific.onboarding_sent_at) ||
    ['sent', 'submitted', 'complete'].includes(normalizeKey(record.onboardingStatus || record.onboarding_status || roleSpecific.onboardingStatus || metadata.onboarding_status)),
  )
}

function landlordHasContactLogged(record = {}, activities = []) {
  const status = normalizeLeadStatus(record.status)
  if (['contacted', 'qualified', 'active', 'negotiation', 'converted'].includes(status)) return true
  return activities.some((activity) => ['call', 'email', 'meeting', 'whatsapp'].includes(normalizeKey(activity.activityType || activity.activity_type)))
}

function landlordOnboardingComplete(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  const metadata = record.metadata || record.metadata_json || {}
  const explicitStatus = normalizeKey(firstText(
    record.onboardingStatus,
    record.onboarding_status,
    roleSpecific.onboardingStatus,
    roleSpecific.onboarding_status,
    metadata.onboarding_status,
  ))
  if (['submitted', 'complete', 'completed', 'onboarded'].includes(explicitStatus)) return true

  const contactComplete = getPhone(record) !== 'Phone pending' && getEmail(record) !== 'Email pending'
  const entityType = normalizeKey(firstText(record.entityType, record.entity_type, roleSpecific.entityType, roleSpecific.entity_type))
  const companyDetails = firstText(record.legalName, record.legal_name, record.companyName, record.company_name, roleSpecific.legalName, roleSpecific.legal_name)
  const registrationNumber = firstText(record.registrationNumber, record.registration_number, record.companyRegistrationNumber, record.company_registration_number, roleSpecific.registrationNumber, roleSpecific.registration_number)
  const representative = firstText(record.representativeName, record.representative_name, record.contactName, record.contact_name, roleSpecific.representativeName, roleSpecific.representative_name)
  const fullName = firstText(record.fullName, record.full_name, record.contactName, record.contact_name, [record.firstName, record.lastName].filter(Boolean).join(' '))
  const identityNumber = firstText(record.idNumber, record.id_number, record.identityNumber, record.identity_number, roleSpecific.idNumber, roleSpecific.id_number, registrationNumber)
  const companyLike = entityType.includes('company') || entityType.includes('trust') || Boolean(companyDetails && registrationNumber)

  if (companyLike) return Boolean(companyDetails && registrationNumber && representative && contactComplete)
  return Boolean(fullName && identityNumber && contactComplete)
}

function landlordMandateSent(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  const mandate = getLandlordMandate(record)
  return ['sent', 'signed'].includes(mandate.mandateStatus) ||
    Boolean(firstText(record.mandateSentAt, record.mandate_sent_at, roleSpecific.mandateSentAt, roleSpecific.mandate_sent_at))
}

function landlordMandateComplete(record = {}) {
  return getLandlordMandate(record).mandateStatus === 'signed'
}

function normalizeLandlordJourneyStage(value = '') {
  const normalized = normalizeKey(value).toUpperCase()
  if (LANDLORD_JOURNEY_STAGE_KEYS.includes(normalized)) return normalized
  const compact = normalizeKey(value)
  if (compact.includes('onboard') && compact.includes('complete')) return 'ONBOARDING_COMPLETE'
  if (compact.includes('onboard') && compact.includes('sent')) return 'ONBOARDING_SENT'
  if (compact.includes('mandate') && (compact.includes('complete') || compact.includes('signed'))) return 'MANDATE_COMPLETE'
  if (compact.includes('mandate') && compact.includes('sent')) return 'MANDATE_SENT'
  if (compact.includes('contact')) return 'CONTACTED'
  if (compact.includes('landlord') && compact.includes('onboard')) return 'LANDLORD_ONBOARDED'
  if (compact.includes('client') || compact.includes('converted')) return 'LANDLORD_ONBOARDED'
  if (compact.includes('lead')) return 'LEAD_CAPTURED'
  return ''
}

function getLandlordJourneyAudit(record = {}) {
  const metadata = record.metadata || record.metadata_json || {}
  return {
    stageCompletedAt: record.stageCompletedAt || record.stage_completed_at || metadata.stageCompletedAt || metadata.stage_completed_at || {},
    stageCompletedBy: record.stageCompletedBy || record.stage_completed_by || metadata.stageCompletedBy || metadata.stage_completed_by || {},
  }
}

function getLandlordJourneyStage(record = {}, activities = []) {
  const explicitStage = normalizeLandlordJourneyStage(firstText(
    record.landlordJourneyStage,
    record.landlord_journey_stage,
    record.metadata?.landlordJourneyStage,
    record.metadata_json?.landlordJourneyStage,
    record.metadata?.landlord_journey_stage,
    record.metadata_json?.landlord_journey_stage,
  ))
  const inferredStages = ['LEAD_CAPTURED']
  if (landlordHasContactLogged(record, activities)) inferredStages.push('CONTACTED')
  if (landlordHasOnboardingSent(record)) inferredStages.push('ONBOARDING_SENT')
  if (landlordOnboardingComplete(record)) inferredStages.push('ONBOARDING_COMPLETE')
  if (landlordMandateSent(record)) inferredStages.push('MANDATE_SENT')
  if (landlordMandateComplete(record)) inferredStages.push('MANDATE_COMPLETE')
  if (landlordOnboardingComplete(record) && landlordMandateComplete(record)) inferredStages.push('LANDLORD_ONBOARDED')

  const explicitIndex = LANDLORD_JOURNEY_STAGE_KEYS.indexOf(explicitStage)
  const inferredStage = inferredStages[inferredStages.length - 1]
  const inferredIndex = LANDLORD_JOURNEY_STAGE_KEYS.indexOf(inferredStage)
  const index = Math.max(explicitIndex, inferredIndex, 0)
  return LANDLORD_JOURNEY_STAGE_KEYS[index]
}

function getLandlordReadiness(record = {}) {
  const checks = [
    { key: 'contact', label: 'Contact details complete', complete: getPhone(record) !== 'Phone pending' && getEmail(record) !== 'Email pending' },
    { key: 'onboarding_sent', label: 'Onboarding request sent', complete: landlordHasOnboardingSent(record) },
    { key: 'onboarding_complete', label: 'Client information received', complete: landlordOnboardingComplete(record) },
    { key: 'mandate_sent', label: 'Mandate issued for signature', complete: landlordMandateSent(record) },
    { key: 'mandate_complete', label: 'Authority signed and confirmed', complete: landlordMandateComplete(record) },
  ]
  const completeCount = checks.filter((check) => check.complete).length
  return { percentage: Math.round((completeCount / checks.length) * 100), checks }
}

function getLandlordNextBestAction(record = {}) {
  if (!landlordHasOnboardingSent(record)) return { label: 'Send landlord onboarding', description: 'Request company, ownership and portfolio information from the landlord.', action: 'send_onboarding' }
  if (!landlordOnboardingComplete(record)) return { label: 'Track landlord onboarding', description: 'Review whether the landlord has submitted the required client information.', action: 'track_onboarding' }
  if (!landlordMandateSent(record)) return { label: 'Send mandate', description: 'Issue the leasing, sales or management mandate for signature.', action: 'send_mandate' }
  if (!landlordMandateComplete(record)) return { label: 'Track mandate signature', description: 'Follow up until authority is signed and confirmed.', action: 'track_mandate' }
  return { label: 'Landlord onboarded', description: 'This landlord is now an active client. Manage properties and vacancies separately.', action: 'client_onboarded' }
}

function buildLandlordSummaryCards(lead = {}, activities = []) {
  const currentStage = LANDLORD_JOURNEY_STAGES.find((stage) => stage.key === getLandlordJourneyStage(lead, activities)) || LANDLORD_JOURNEY_STAGES[0]
  const lastActivity = activities[0]
  return [
    { key: 'broker', label: 'Assigned Broker', value: getBroker(lead), icon: UserRound, tone: 'blue' },
    { key: 'stage', label: 'Current Stage', value: currentStage.label, icon: Clock3, tone: currentStage.key === 'LANDLORD_ONBOARDED' ? 'green' : 'purple' },
    { key: 'onboarding', label: 'Onboarding Status', value: landlordOnboardingComplete(lead) ? 'Complete' : landlordHasOnboardingSent(lead) ? 'Sent' : 'Not sent', icon: ClipboardList, tone: landlordOnboardingComplete(lead) ? 'green' : landlordHasOnboardingSent(lead) ? 'amber' : 'slate' },
    { key: 'mandate', label: 'Mandate Status', value: landlordMandateComplete(lead) ? 'Complete' : landlordMandateSent(lead) ? 'Sent' : 'Not sent', icon: FileText, tone: landlordMandateComplete(lead) ? 'green' : landlordMandateSent(lead) ? 'amber' : 'slate' },
    {
      key: 'activity',
      label: 'Last Activity',
      value: lastActivity ? formatRelativeTime(lastActivity.createdAt || lastActivity.created_at || lastActivity.activityDate || lastActivity.activity_date) : 'No activity yet',
      icon: CalendarDays,
      tone: 'amber',
    },
  ]
}

function buildLandlordJourney(lead = {}, activities = []) {
  const currentStage = getLandlordJourneyStage(lead, activities)
  const currentIndex = LANDLORD_JOURNEY_STAGE_KEYS.indexOf(currentStage)
  const finalComplete = currentStage === 'LANDLORD_ONBOARDED'
  const audit = getLandlordJourneyAudit(lead)
  const firstContactActivity = activities.find((activity) => ['call', 'email', 'meeting', 'whatsapp'].includes(normalizeKey(activity.activityType || activity.activity_type)))
  return LANDLORD_JOURNEY_STAGES.map((step, index) => {
    const completedAt = audit.stageCompletedAt?.[step.key] || audit.stageCompletedAt?.[normalizeKey(step.key)] || ''
    const fallbackDate = step.key === 'LEAD_CAPTURED'
      ? lead.createdAt || lead.created_at
      : step.key === 'CONTACTED'
        ? firstContactActivity?.createdAt || firstContactActivity?.created_at || firstContactActivity?.activityDate || firstContactActivity?.activity_date
        : ''
    return {
      ...step,
      done: finalComplete || index < currentIndex,
      completedBy: audit.stageCompletedBy?.[step.key] || audit.stageCompletedBy?.[normalizeKey(step.key)] || '',
      date: completedAt ? formatShortDate(completedAt) : fallbackDate && (finalComplete || index < currentIndex) ? formatShortDate(fallbackDate) : '',
      state: finalComplete || index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'upcoming',
    }
  })
}

function buildLandlordVacancyPrefill(lead = {}) {
  const property = getLandlordProperty(lead)
  const vacancy = getLandlordVacancy(lead)
  return {
    source: 'commercial_leasing_landlord_lead',
    source_lead_id: lead.id || null,
    landlord_name: getLeadName(lead),
    contact_name: getContactName(lead),
    phone: getPhone(lead) === 'Phone pending' ? null : getPhone(lead),
    email: getEmail(lead) === 'Email pending' ? null : getEmail(lead),
    vacancy_type: property.assetClass || 'other',
    property_name: property.propertyName === 'Property details pending' ? null : property.propertyName,
    formatted_address: property.propertyAddress === 'Property details pending' ? null : property.propertyAddress,
    area_node: property.areaNode === 'Area pending' ? null : property.areaNode,
    available_area_m2: vacancy.availableArea,
    asking_rental: vacancy.askingRental,
    operating_costs: vacancy.operatingCosts,
    availability_date: vacancy.availabilityDate === 'Not captured' ? null : vacancy.availabilityDate,
    minimum_lease_term: vacancy.leaseTermPreference === 'Not captured' ? null : vacancy.leaseTermPreference,
    incentives: vacancy.incentives === 'Not captured' ? null : vacancy.incentives,
    broker_assignment: lead.assignedBrokerId || getPreservedData(lead).brokerId || null,
    notes: firstText(lead.notes, getLeadRoleSpecific(lead).qualificationNotes, getPreservedData(lead).notes) || null,
    status: 'draft',
    metadata_json: {
      source: 'commercial_leasing_landlord_lead',
      source_lead_id: lead.id || null,
      landlord_lead_snapshot: {
        company_name: getLeadName(lead),
        contact_person: getContactName(lead),
        asset_class: property.assetClass,
        area_node: property.areaNode,
      },
    },
  }
}

function getTenantProfile(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  const preserved = getPreservedData(record)
  return {
    companyName: getLeadName(record),
    tradingName: firstText(record.tradingName, record.trading_name, roleSpecific.tradingName, roleSpecific.trading_name) || 'Not captured',
    industry: firstText(record.industry, roleSpecific.industry) || 'Not captured',
    contactPerson: getContactName(record),
    relationshipType: firstText(record.relationshipType, record.relationship_type, roleSpecific.relationshipType, roleSpecific.relationship_type) || 'Business Owner',
    phone: getPhone(record),
    email: getEmail(record),
    website: firstText(record.website, roleSpecific.website) || 'Not captured',
    currentPremises: firstText(record.currentPremises, record.current_premises, roleSpecific.currentPremises, roleSpecific.current_premises) || 'Not captured',
    broker: getBroker(record),
    source: getSource(record),
    notes: firstText(record.notes, roleSpecific.qualificationNotes, roleSpecific.qualification_notes, preserved.notes) || 'Not captured',
  }
}

function normalizeAreaList(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).filter(Boolean)
  const text = normalizeText(value)
  if (!text) return []
  return text.split(/[,;|]/).map((item) => normalizeText(item)).filter(Boolean)
}

function getTenantRequirement(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  const preserved = getPreservedData(record)
  const assetClass = getAssetClass(record)
  const preferredAreas = normalizeAreaList(record.preferredAreas || record.preferred_areas || roleSpecific.preferredAreas || roleSpecific.preferred_areas || preserved.area || record.area)
  return {
    assetClass: assetClass || 'other',
    assetClassLabel: getAssetClassLabel(record),
    preferredAreas,
    preferredAreasLabel: preferredAreas.length ? preferredAreas.join(', ') : 'Area preferences pending',
    minSizeSqm: firstNumber(record.minSizeSqm, record.min_size_sqm, roleSpecific.minSizeSqm, roleSpecific.min_size_sqm, roleSpecific.minSize),
    maxSizeSqm: firstNumber(record.maxSizeSqm, record.max_size_sqm, roleSpecific.maxSizeSqm, roleSpecific.max_size_sqm, roleSpecific.maxSize),
    targetSizeSqm: firstNumber(record.targetSizeSqm, record.target_size_sqm, roleSpecific.targetSizeSqm, roleSpecific.target_size_sqm),
    budgetPerSqm: firstNumber(record.budgetPerSqm, record.budget_per_sqm, roleSpecific.budgetPerSqm, roleSpecific.budget_per_sqm),
    monthlyBudget: firstNumber(record.monthlyBudget, record.monthly_budget, roleSpecific.monthlyBudget, roleSpecific.monthly_budget),
    annualBudget: firstNumber(record.annualBudget, record.annual_budget, roleSpecific.annualBudget, roleSpecific.annual_budget),
    occupationDate: firstText(record.occupationDate, record.occupation_date, roleSpecific.occupationDate, roleSpecific.occupation_date, roleSpecific.timing) || 'Not captured',
    leaseTerm: firstText(record.leaseTerm, record.lease_term, roleSpecific.leaseTerm, roleSpecific.lease_term) || 'Not captured',
    parkingRequirement: firstText(record.parkingRequirement, record.parking_requirement, roleSpecific.parkingRequirement, roleSpecific.parking_requirement) || 'Not captured',
    powerRequirement: firstText(record.powerRequirement, record.power_requirement, roleSpecific.powerRequirement, roleSpecific.power_requirement) || 'Not captured',
    specialRequirements: firstText(record.specialRequirements, record.special_requirements, roleSpecific.specialRequirements, roleSpecific.special_requirements, record.notes) || 'Not captured',
    requirementCaptured: Boolean(firstText(record.requirementId, record.requirement_id, roleSpecific.requirementId, roleSpecific.requirement_id) || preferredAreas.length || firstNumber(roleSpecific.minSize, roleSpecific.maxSize, roleSpecific.budgetPerSqm, roleSpecific.monthlyBudget)),
  }
}

function getTenantMatching(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  const matches = Array.isArray(roleSpecific.matchedVacancies) ? roleSpecific.matchedVacancies : Array.isArray(roleSpecific.matched_vacancies) ? roleSpecific.matched_vacancies : []
  const matchCount = firstNumber(record.matchCount, record.match_count, roleSpecific.matchCount, roleSpecific.match_count) || matches.length || 0
  return {
    matches,
    matchCount,
    matchingStatus: firstText(record.matchingStatus, record.matching_status, roleSpecific.matchingStatus, roleSpecific.matching_status) || (matchCount ? `${matchCount} Matches Found` : 'No matches yet'),
  }
}

function getTenantViewing(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  const upcoming = firstNumber(roleSpecific.upcomingViewings, roleSpecific.upcoming_viewings, record.upcomingViewings, record.upcoming_viewings) || 0
  const completed = firstNumber(roleSpecific.completedViewings, roleSpecific.completed_viewings, record.completedViewings, record.completed_viewings) || 0
  const cancelled = firstNumber(roleSpecific.cancelledViewings, roleSpecific.cancelled_viewings, record.cancelledViewings, record.cancelled_viewings) || 0
  return {
    upcoming,
    completed,
    cancelled,
    viewingStatus: firstText(record.viewingStatus, record.viewing_status, roleSpecific.viewingStatus, roleSpecific.viewing_status) || (upcoming ? `${upcoming} Viewings Scheduled` : 'No Viewings Scheduled'),
  }
}

function getTenantProposal(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  return {
    proposalSent: firstBoolean(record.proposalSent, record.proposal_sent, roleSpecific.proposalSent, roleSpecific.proposal_sent),
    proposalAccepted: firstBoolean(record.proposalAccepted, record.proposal_accepted, roleSpecific.proposalAccepted, roleSpecific.proposal_accepted),
    hotDrafted: firstBoolean(record.hotDrafted, record.hot_drafted, roleSpecific.hotDrafted, roleSpecific.hot_drafted),
    hotSigned: firstBoolean(record.hotSigned, record.hot_signed, roleSpecific.hotSigned, roleSpecific.hot_signed),
  }
}

function tenantHasOnboardingSent(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  const metadata = record.metadata || record.metadata_json || {}
  return Boolean(firstText(record.onboardingSentAt, record.onboarding_sent_at, roleSpecific.onboardingSentAt, roleSpecific.onboarding_sent_at) ||
    ['sent', 'submitted', 'complete'].includes(normalizeKey(record.onboardingStatus || record.onboarding_status || roleSpecific.onboardingStatus || metadata.onboarding_status)))
}

function getTenantReadiness(record = {}) {
  const requirement = getTenantRequirement(record)
  const profile = getTenantProfile(record)
  const checks = [
    { key: 'contact', label: 'Contact Details', complete: !['Phone pending', 'Email pending'].includes(getPhone(record)) && !['Phone pending', 'Email pending'].includes(getEmail(record)) },
    { key: 'business', label: 'Business Information', complete: profile.companyName !== 'Commercial lead' && profile.industry !== 'Not captured' },
    { key: 'requirement', label: 'Requirement Captured', complete: requirement.requirementCaptured },
    { key: 'areas', label: 'Area Preferences', complete: requirement.preferredAreas.length > 0 },
    { key: 'budget', label: 'Budget Captured', complete: Boolean(requirement.budgetPerSqm || requirement.monthlyBudget || requirement.annualBudget) },
    { key: 'occupation', label: 'Occupation Date', complete: requirement.occupationDate !== 'Not captured' },
    { key: 'decision', label: 'Decision Maker Identified', complete: profile.relationshipType !== 'Not captured' && profile.contactPerson !== 'Contact pending' },
    ...buildAssetReadinessChecks(record, 'requirement'),
  ]
  const percentage = Math.round((checks.filter((check) => check.complete).length / checks.length) * 100)
  const label = percentage >= 80 ? 'Requirement Ready' : percentage >= 45 ? 'Needs Attention' : 'Incomplete'
  return { percentage, label, checks }
}

function getTenantNextBestAction(record = {}) {
  const requirement = getTenantRequirement(record)
  const matching = getTenantMatching(record)
  const viewing = getTenantViewing(record)
  const proposal = getTenantProposal(record)
  if (!tenantHasOnboardingSent(record)) return { label: 'Send Tenant Onboarding', description: 'Request occupier details and supporting tenant documents.', action: 'send_onboarding' }
  if (!requirement.requirementCaptured) return { label: 'Capture Requirement', description: 'Capture preferred areas, size, budget and timing.', action: 'capture_requirement' }
  if (!matching.matchCount) return { label: 'Run Vacancy Matching', description: 'Search available vacancies against this tenant requirement.', action: 'match_vacancies' }
  if (!viewing.upcoming && !viewing.completed) return { label: 'Schedule Viewing', description: 'Book a viewing for one of the matched vacancies.', action: 'schedule_viewing' }
  if (!proposal.proposalSent) return { label: 'Prepare Proposal', description: 'Prepare a proposal for the preferred vacancy shortlist.', action: 'prepare_proposal' }
  if (!proposal.hotSigned) return { label: 'Prepare Heads Of Terms', description: 'Move accepted proposal terms into HOT.', action: 'prepare_hot' }
  return { label: 'Convert to Deal', description: 'HOT is signed and this tenant lead can move into a lease deal.', action: 'convert_deal' }
}

function buildTenantSummaryCards(lead = {}, activities = []) {
  const requirement = getTenantRequirement(lead)
  const matching = getTenantMatching(lead)
  const viewing = getTenantViewing(lead)
  const lastActivity = activities[0]
  return [
    { key: 'broker', label: 'Assigned Broker', value: getBroker(lead) === 'No broker assigned' ? 'No broker assigned' : 'Broker Assigned', icon: UserRound, tone: 'blue' },
    { key: 'requirement', label: 'Requirement Status', value: requirement.requirementCaptured ? 'Requirement Captured' : 'Requirement Pending', icon: ClipboardList, tone: requirement.requirementCaptured ? 'green' : 'amber' },
    { key: 'matching', label: 'Matching Status', value: matching.matchingStatus, icon: Target, tone: matching.matchCount ? 'green' : 'slate' },
    { key: 'viewing', label: 'Viewing Status', value: viewing.viewingStatus, icon: CalendarDays, tone: viewing.upcoming ? 'blue' : 'slate' },
    { key: 'activity', label: 'Last Activity', value: lastActivity ? formatRelativeTime(lastActivity.createdAt || lastActivity.created_at || lastActivity.activityDate || lastActivity.activity_date) : 'No activity yet', icon: Clock3, tone: 'amber' },
  ]
}

function buildTenantJourney(lead = {}) {
  const status = normalizeLeadStatus(lead.status)
  const requirement = getTenantRequirement(lead)
  const matching = getTenantMatching(lead)
  const viewing = getTenantViewing(lead)
  const proposal = getTenantProposal(lead)
  const dealCreated = Boolean(firstText(lead.dealId, lead.deal_id, getLeadRoleSpecific(lead).dealId, getLeadRoleSpecific(lead).deal_id))
  const steps = [
    { key: 'captured', label: 'Lead Captured', done: true, date: lead.createdAt ? formatShortDate(lead.createdAt) : '', subtext: 'Tenant lead created' },
    { key: 'contacted', label: 'Contacted', done: ['contacted', 'qualified', 'active', 'negotiation', 'converted'].includes(status), subtext: 'Broker contact logged' },
    { key: 'onboarding', label: 'Tenant Onboarding Sent', done: tenantHasOnboardingSent(lead), subtext: 'Tenant onboarding request sent' },
    { key: 'requirement', label: 'Requirement Captured', done: requirement.requirementCaptured, subtext: 'Size, area, budget and timing captured' },
    { key: 'matching', label: 'Vacancies Matched', done: matching.matchCount > 0, subtext: 'Vacancies matched to requirement' },
    { key: 'viewing', label: 'Viewing Scheduled', done: viewing.upcoming > 0 || viewing.completed > 0, subtext: 'Viewing booked or completed' },
    { key: 'proposal', label: 'Proposal Submitted', done: proposal.proposalSent, subtext: 'Proposal sent to tenant' },
    { key: 'hot', label: 'HOT Signed', done: proposal.hotSigned, subtext: 'Heads of Terms signed' },
    { key: 'deal', label: 'Deal Created', done: dealCreated, subtext: 'Lease deal opened' },
  ]
  const firstIncomplete = steps.findIndex((step) => !step.done)
  return steps.map((step, index) => ({ ...step, state: step.done ? 'complete' : index === firstIncomplete ? 'current' : 'upcoming' }))
}

function getSellerProfile(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  const preserved = getPreservedData(record)
  return {
    companyName: getLeadName(record),
    contactPerson: getContactName(record),
    relationshipType: firstText(record.relationshipType, record.relationship_type, roleSpecific.relationshipType, roleSpecific.relationship_type) || 'Owner',
    phone: getPhone(record),
    email: getEmail(record),
    alternativeContact: firstText(record.alternativeContact, record.alternative_contact, roleSpecific.alternativeContact, roleSpecific.alternative_contact) || 'Not captured',
    broker: getBroker(record),
    source: getSource(record),
    notes: firstText(record.notes, roleSpecific.qualificationNotes, roleSpecific.qualification_notes, preserved.notes) || 'Not captured',
  }
}

function getSellerProperty(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  const preserved = getPreservedData(record)
  const assetClass = getAssetClass(record)
  const propertyName = firstText(record.propertyName, record.property_name, roleSpecific.propertyName, roleSpecific.property_name)
  const propertyAddress = firstText(record.propertyAddress, record.property_address, roleSpecific.propertyAddress, roleSpecific.property_address, preserved.address, record.area)
  return {
    propertyName: propertyName || 'Property details pending',
    propertyAddress: propertyAddress || 'Property details pending',
    areaNode: getArea(record),
    assetClass: assetClass || 'other',
    assetClassLabel: getAssetClassLabel(record),
    propertyType: firstText(record.propertyType, record.property_type, roleSpecific.propertyType, roleSpecific.property_type) || getDefaultPropertyType(assetClass),
    glaSqm: firstNumber(record.glaSqm, record.gla_sqm, roleSpecific.glaSqm, roleSpecific.gla_sqm),
    erfSizeSqm: firstNumber(record.erfSizeSqm, record.erf_size_sqm, roleSpecific.erfSizeSqm, roleSpecific.erf_size_sqm),
    parking: firstText(record.parking, record.parkingNotes, record.parking_notes, roleSpecific.parking, roleSpecific.parkingNotes, roleSpecific.parking_notes) || 'Not captured',
    ownershipType: firstText(record.ownershipType, record.ownership_type, roleSpecific.ownershipType, roleSpecific.ownership_type) || 'Not captured',
    occupancyStatus: firstText(record.occupancyStatus, record.occupancy_status, roleSpecific.occupancyStatus, roleSpecific.occupancy_status) || 'Not captured',
    ownershipVerified: firstBoolean(record.ownershipVerified, record.ownership_verified, record.authorityConfirmed, record.authority_confirmed, roleSpecific.ownershipVerified, roleSpecific.ownership_verified, roleSpecific.authorityConfirmed, roleSpecific.authority_confirmed),
    propertyNotes: firstText(record.propertyNotes, record.property_notes, roleSpecific.propertyNotes, roleSpecific.property_notes, record.notes) || 'Not captured',
  }
}

function getSellerMandate(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  const status = firstText(record.mandateStatus, record.mandate_status, roleSpecific.mandateStatus, roleSpecific.mandate_status) || 'not_started'
  const mandateType = firstText(record.mandateType, record.mandate_type, roleSpecific.mandateType, roleSpecific.mandate_type) || 'open'
  return {
    mandateStatus: normalizeKey(status),
    mandateStatusLabel: titleCase(status || 'not_started') || 'Mandate Pending',
    mandateType: normalizeKey(mandateType),
    mandateTypeLabel: titleCase(mandateType || 'open'),
    commissionStructure: firstText(record.commissionStructure, record.commission_structure, roleSpecific.commissionStructure, roleSpecific.commission_structure) || 'Not captured',
    authorityConfirmed: firstBoolean(record.authorityConfirmed, record.authority_confirmed, roleSpecific.authorityConfirmed, roleSpecific.authority_confirmed),
    mandateExpiry: firstText(record.mandateExpiry, record.mandate_expiry, roleSpecific.mandateExpiry, roleSpecific.mandate_expiry) || 'Not captured',
    mandateNotes: firstText(record.mandateNotes, record.mandate_notes, roleSpecific.mandateNotes, roleSpecific.mandate_notes, roleSpecific.qualificationNotes, record.notes) || 'Not captured',
  }
}

function getSellerListing(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  const listingId = firstText(record.listingId, record.listing_id, roleSpecific.listingId, roleSpecific.listing_id)
  const status = firstText(record.listingStatus, record.listing_status, roleSpecific.listingStatus, roleSpecific.listing_status) || (listingId ? 'draft' : 'not_created')
  const offerReceived = firstBoolean(record.offerReceived, record.offer_received, roleSpecific.offerReceived, roleSpecific.offer_received)
  const buyerInterest = firstNumber(record.buyerInterestCount, record.buyer_interest_count, roleSpecific.buyerInterestCount, roleSpecific.buyer_interest_count) || 0
  return {
    listingId,
    listingCreated: Boolean(listingId),
    listingStatus: normalizeKey(status),
    listingStatusLabel: listingId ? titleCase(status || 'draft') : 'No listing created',
    listingPrice: firstNumber(record.listingPrice, record.listing_price, roleSpecific.listingPrice, roleSpecific.listing_price),
    listingCreatedDate: firstText(record.listingCreatedDate, record.listing_created_date, roleSpecific.listingCreatedDate, roleSpecific.listing_created_date) || 'Not captured',
    marketingStatus: firstText(record.marketingStatus, record.marketing_status, roleSpecific.marketingStatus, roleSpecific.marketing_status) || 'Not started',
    onlineStatus: firstText(record.onlineStatus, record.online_status, roleSpecific.onlineStatus, roleSpecific.online_status) || 'Offline',
    photosUploaded: firstBoolean(record.photosUploaded, record.photos_uploaded, roleSpecific.photosUploaded, roleSpecific.photos_uploaded),
    documentsUploaded: firstBoolean(record.documentsUploaded, record.documents_uploaded, roleSpecific.documentsUploaded, roleSpecific.documents_uploaded),
    buyerInterest,
    offerReceived,
    sellerEngaged: firstBoolean(record.sellerEngaged, record.seller_engaged, roleSpecific.sellerEngaged, roleSpecific.seller_engaged) || ['contacted', 'qualified', 'active', 'negotiation', 'converted'].includes(normalizeLeadStatus(record.status)),
  }
}

function sellerHasOnboardingSent(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  const metadata = record.metadata || record.metadata_json || {}
  return Boolean(firstText(record.onboardingSentAt, record.onboarding_sent_at, roleSpecific.onboardingSentAt, roleSpecific.onboarding_sent_at) ||
    ['sent', 'submitted', 'complete'].includes(normalizeKey(record.onboardingStatus || record.onboarding_status || roleSpecific.onboardingStatus || metadata.onboarding_status)))
}

function getSellerReadiness(record = {}) {
  const property = getSellerProperty(record)
  const mandate = getSellerMandate(record)
  const listing = getSellerListing(record)
  const checks = [
    { key: 'contact', label: 'Contact Details', complete: !['Phone pending', 'Email pending'].includes(getPhone(record)) && !['Phone pending', 'Email pending'].includes(getEmail(record)) },
    { key: 'property', label: 'Property Details', complete: property.propertyName !== 'Property details pending' && property.propertyAddress !== 'Property details pending' },
    { key: 'ownership', label: 'Ownership Verified', complete: property.ownershipVerified || mandate.authorityConfirmed },
    { key: 'onboarding', label: 'Seller Onboarding Complete', complete: sellerHasOnboardingSent(record) },
    { key: 'mandate', label: 'Mandate Signed', complete: mandate.mandateStatus === 'signed' },
    { key: 'photos', label: 'Photos Uploaded', complete: listing.photosUploaded },
    { key: 'documents', label: 'Required Documents Uploaded', complete: listing.documentsUploaded },
    { key: 'listing', label: 'Listing Created', complete: listing.listingCreated },
    ...buildAssetReadinessChecks(record, 'property'),
  ]
  const percentage = Math.round((checks.filter((check) => check.complete).length / checks.length) * 100)
  const label = percentage >= 85 ? 'Ready' : percentage >= 45 ? 'Needs Attention' : 'Incomplete'
  return { percentage, label, checks }
}

function getSellerNextBestAction(record = {}) {
  const property = getSellerProperty(record)
  const mandate = getSellerMandate(record)
  const listing = getSellerListing(record)
  if (!sellerHasOnboardingSent(record)) return { label: 'Send Seller Onboarding', description: 'Request seller details, ownership documents and property support material.', action: 'send_onboarding' }
  if (property.propertyName === 'Property details pending' || property.propertyAddress === 'Property details pending') return { label: 'Confirm Property Information', description: 'Capture property identity, address, node and commercial property facts.', action: 'confirm_property' }
  if (mandate.mandateStatus !== 'signed') return { label: 'Generate Mandate', description: 'Prepare the commercial sales mandate for seller signature.', action: 'generate_mandate' }
  if (!listing.listingCreated) return { label: 'Create Sales Listing', description: 'Use the seller lead details to open a draft sales listing.', action: 'create_listing' }
  if (!listing.photosUploaded) return { label: 'Request Property Photos', description: 'Ask the seller for property photos before publishing.', action: 'request_photos' }
  if (!listing.documentsUploaded) return { label: 'Request Supporting Documents', description: 'Collect title, rates, plans and seller support documents.', action: 'request_documents' }
  return { label: 'Convert to Deal', description: 'Listing, seller engagement and offer signals can now move into a sale deal.', action: 'convert_deal' }
}

function buildSellerSummaryCards(lead = {}, activities = []) {
  const readiness = getSellerReadiness(lead)
  const mandate = getSellerMandate(lead)
  const lastActivity = activities[0]
  return [
    { key: 'broker', label: 'Assigned Broker', value: getBroker(lead) === 'No broker assigned' ? 'No broker assigned' : 'Broker Assigned', icon: UserRound, tone: 'blue' },
    { key: 'stage', label: 'Current Stage', value: lead.stageLabel || titleCase(normalizeLeadStatus(lead.status)) || 'Qualification', icon: Clock3, tone: 'purple' },
    { key: 'readiness', label: 'Listing Readiness', value: `${readiness.percentage}% Ready`, icon: Percent, tone: readiness.percentage >= 85 ? 'green' : 'amber' },
    { key: 'mandate', label: 'Mandate Status', value: mandate.mandateStatusLabel || 'Mandate Pending', icon: FileText, tone: mandate.mandateStatus === 'signed' ? 'green' : 'amber' },
    { key: 'activity', label: 'Last Activity', value: lastActivity ? formatRelativeTime(lastActivity.createdAt || lastActivity.created_at || lastActivity.activityDate || lastActivity.activity_date) : 'No activity yet', icon: CalendarDays, tone: 'amber' },
  ]
}

function buildSellerJourney(lead = {}) {
  const status = normalizeLeadStatus(lead.status)
  const property = getSellerProperty(lead)
  const mandate = getSellerMandate(lead)
  const listing = getSellerListing(lead)
  const dealCreated = Boolean(firstText(lead.dealId, lead.deal_id, getLeadRoleSpecific(lead).dealId, getLeadRoleSpecific(lead).deal_id))
  const propertyConfirmed = property.propertyName !== 'Property details pending' && property.propertyAddress !== 'Property details pending'
  const steps = [
    { key: 'captured', label: 'Lead Captured', done: true, date: lead.createdAt ? formatShortDate(lead.createdAt) : '', subtext: 'Seller lead created' },
    { key: 'contacted', label: 'Contacted', done: ['contacted', 'qualified', 'active', 'negotiation', 'converted'].includes(status), subtext: 'Broker contact logged' },
    { key: 'onboarding', label: 'Seller Onboarding Sent', done: sellerHasOnboardingSent(lead), subtext: 'Seller onboarding request sent' },
    { key: 'property', label: 'Property Confirmed', done: propertyConfirmed, subtext: 'Property identity and ownership facts confirmed' },
    { key: 'mandate_sent', label: 'Mandate Sent', done: ['sent', 'signed'].includes(mandate.mandateStatus), subtext: 'Commercial sales mandate issued' },
    { key: 'mandate_signed', label: 'Mandate Signed', done: mandate.mandateStatus === 'signed', subtext: 'Authority to sell confirmed' },
    { key: 'listing', label: 'Listing Created', done: listing.listingCreated, subtext: 'Draft or active sales listing exists' },
    { key: 'interest', label: 'Buyer Interest', done: listing.buyerInterest > 0, subtext: 'Buyer interest logged' },
    { key: 'offer', label: 'Offer Received', done: listing.offerReceived, subtext: 'Offer submitted by buyer' },
    { key: 'deal', label: 'Deal Created', done: dealCreated, subtext: 'Sale deal opened' },
  ]
  const firstIncomplete = steps.findIndex((step) => !step.done)
  return steps.map((step, index) => {
    const blocked = ['interest', 'offer', 'deal'].includes(step.key) && !listing.listingCreated
    return { ...step, state: step.done ? 'complete' : blocked ? 'blocked' : index === firstIncomplete ? 'current' : 'upcoming' }
  })
}

function buildSellerListingPrefill(lead = {}) {
  const property = getSellerProperty(lead)
  const listing = getSellerListing(lead)
  return {
    source: 'commercial_sales_seller_lead',
    source_lead_id: lead.id || null,
    listing_type: 'sale',
    seller_name: getLeadName(lead),
    contact_name: getContactName(lead),
    phone: getPhone(lead) === 'Phone pending' ? null : getPhone(lead),
    email: getEmail(lead) === 'Email pending' ? null : getEmail(lead),
    property_name: property.propertyName === 'Property details pending' ? null : property.propertyName,
    formatted_address: property.propertyAddress === 'Property details pending' ? null : property.propertyAddress,
    area_node: property.areaNode === 'Area pending' ? null : property.areaNode,
    asset_class: property.assetClass || 'other',
    property_type: property.propertyType === 'Not captured' ? null : property.propertyType,
    gla_sqm: property.glaSqm,
    erf_size_sqm: property.erfSizeSqm,
    listing_price: listing.listingPrice,
    broker_assignment: lead.assignedBrokerId || getPreservedData(lead).brokerId || null,
    notes: firstText(lead.notes, getLeadRoleSpecific(lead).qualificationNotes, getPreservedData(lead).notes) || null,
    status: 'draft',
    metadata_json: {
      source: 'commercial_sales_seller_lead',
      source_lead_id: lead.id || null,
      seller_lead_snapshot: {
        company_name: getLeadName(lead),
        contact_person: getContactName(lead),
        asset_class: property.assetClass,
        area_node: property.areaNode,
      },
    },
  }
}

function getBuyerProfile(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  const preserved = getPreservedData(record)
  return {
    companyName: getLeadName(record),
    tradingName: firstText(record.tradingName, record.trading_name, roleSpecific.tradingName, roleSpecific.trading_name) || 'Not captured',
    industry: firstText(record.industry, roleSpecific.industry) || 'Not captured',
    contactPerson: getContactName(record),
    relationshipType: firstText(record.relationshipType, record.relationship_type, roleSpecific.relationshipType, roleSpecific.relationship_type) || 'Owner Occupier',
    phone: getPhone(record),
    email: getEmail(record),
    website: firstText(record.website, roleSpecific.website) || 'Not captured',
    broker: getBroker(record),
    source: getSource(record),
    notes: firstText(record.notes, roleSpecific.qualificationNotes, roleSpecific.qualification_notes, preserved.notes) || 'Not captured',
  }
}

function getBuyerRequirement(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  const preserved = getPreservedData(record)
  const assetClass = getAssetClass(record)
  const preferredAreas = normalizeAreaList(record.preferredAreas || record.preferred_areas || roleSpecific.preferredAreas || roleSpecific.preferred_areas || preserved.area || record.area)
  return {
    assetClass: assetClass || 'other',
    assetClassLabel: getAssetClassLabel(record),
    preferredAreas,
    preferredAreasLabel: preferredAreas.length ? preferredAreas.join(', ') : 'Area preferences pending',
    minSizeSqm: firstNumber(record.minSizeSqm, record.min_size_sqm, roleSpecific.minSizeSqm, roleSpecific.min_size_sqm, roleSpecific.minSize),
    maxSizeSqm: firstNumber(record.maxSizeSqm, record.max_size_sqm, roleSpecific.maxSizeSqm, roleSpecific.max_size_sqm, roleSpecific.maxSize),
    targetSizeSqm: firstNumber(record.targetSizeSqm, record.target_size_sqm, roleSpecific.targetSizeSqm, roleSpecific.target_size_sqm),
    purchaseBudget: firstNumber(record.purchaseBudget, record.purchase_budget, roleSpecific.purchaseBudget, roleSpecific.purchase_budget, record.estimatedValue, record.estimated_value),
    maxPurchasePrice: firstNumber(record.maxPurchasePrice, record.max_purchase_price, roleSpecific.maxPurchasePrice, roleSpecific.max_purchase_price),
    depositAvailable: firstNumber(record.depositAvailable, record.deposit_available, roleSpecific.depositAvailable, roleSpecific.deposit_available),
    fundingType: firstText(record.fundingType, record.funding_type, roleSpecific.fundingType, roleSpecific.funding_type) || 'Undecided',
    occupationDate: firstText(record.occupationDate, record.occupation_date, roleSpecific.occupationDate, roleSpecific.occupation_date, roleSpecific.timing) || 'Not captured',
    purchaseTimeline: firstText(record.purchaseTimeline, record.purchase_timeline, roleSpecific.purchaseTimeline, roleSpecific.purchase_timeline) || 'Not captured',
    specialRequirements: firstText(record.specialRequirements, record.special_requirements, roleSpecific.specialRequirements, roleSpecific.special_requirements, record.lookingFor, record.looking_for, record.notes) || 'Not captured',
    requirementCaptured: Boolean(firstText(record.requirementId, record.requirement_id, roleSpecific.requirementId, roleSpecific.requirement_id) || preferredAreas.length || firstNumber(roleSpecific.minSize, roleSpecific.maxSize, roleSpecific.purchaseBudget, roleSpecific.maxPurchasePrice, record.estimatedValue)),
  }
}

function getBuyerFunding(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  const requirement = getBuyerRequirement(record)
  const status = firstText(record.fundingStatus, record.funding_status, roleSpecific.fundingStatus, roleSpecific.funding_status) || 'unknown'
  const preApprovalStatus = firstText(record.preApprovalStatus, record.pre_approval_status, roleSpecific.preApprovalStatus, roleSpecific.pre_approval_status) || 'not_started'
  return {
    fundingStatus: normalizeKey(status),
    fundingStatusLabel: titleCase(status || 'unknown'),
    fundingType: requirement.fundingType,
    budget: requirement.purchaseBudget,
    maxPurchasePrice: requirement.maxPurchasePrice,
    depositAvailable: requirement.depositAvailable,
    bankFinancier: firstText(record.bankFinancier, record.bank_financier, roleSpecific.bankFinancier, roleSpecific.bank_financier) || 'Not captured',
    proofOfFunds: firstBoolean(record.proofOfFunds, record.proof_of_funds, roleSpecific.proofOfFunds, roleSpecific.proof_of_funds),
    preApprovalStatus: normalizeKey(preApprovalStatus),
    preApprovalStatusLabel: titleCase(preApprovalStatus || 'not_started'),
    fundingConfirmed: ['confirmed', 'proof_received', 'approved'].includes(normalizeKey(status)) || firstBoolean(record.fundingConfirmed, record.funding_confirmed, roleSpecific.fundingConfirmed, roleSpecific.funding_confirmed),
  }
}

function getBuyerMatching(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  const matches = Array.isArray(roleSpecific.matchedListings) ? roleSpecific.matchedListings : Array.isArray(roleSpecific.matched_listings) ? roleSpecific.matched_listings : []
  const matchCount = firstNumber(record.matchCount, record.match_count, roleSpecific.matchCount, roleSpecific.match_count) || matches.length || 0
  return {
    matches,
    matchCount,
    matchingStatus: firstText(record.matchingStatus, record.matching_status, roleSpecific.matchingStatus, roleSpecific.matching_status) || (matchCount ? `${matchCount} Potential Matches` : 'No matches yet'),
  }
}

function getBuyerViewing(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  const upcoming = firstNumber(roleSpecific.upcomingViewings, roleSpecific.upcoming_viewings, record.upcomingViewings, record.upcoming_viewings) || 0
  const completed = firstNumber(roleSpecific.completedViewings, roleSpecific.completed_viewings, record.completedViewings, record.completed_viewings) || 0
  const cancelled = firstNumber(roleSpecific.cancelledViewings, roleSpecific.cancelled_viewings, record.cancelledViewings, record.cancelled_viewings) || 0
  return {
    upcoming,
    completed,
    cancelled,
    viewingStatus: firstText(record.viewingStatus, record.viewing_status, roleSpecific.viewingStatus, roleSpecific.viewing_status) || (upcoming ? `${upcoming} Viewings Scheduled` : 'No Viewings Scheduled'),
  }
}

function getBuyerOffers(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  const offers = Array.isArray(roleSpecific.offers) ? roleSpecific.offers : Array.isArray(roleSpecific.buyer_offers) ? roleSpecific.buyer_offers : []
  const submitted = firstNumber(record.offersSubmitted, record.offers_submitted, roleSpecific.offersSubmitted, roleSpecific.offers_submitted) || offers.filter((offer) => normalizeKey(offer.status).includes('submitted')).length || 0
  const accepted = firstNumber(record.offersAccepted, record.offers_accepted, roleSpecific.offersAccepted, roleSpecific.offers_accepted) || offers.filter((offer) => normalizeKey(offer.status).includes('accepted')).length || 0
  const declined = firstNumber(record.offersDeclined, record.offers_declined, roleSpecific.offersDeclined, roleSpecific.offers_declined) || offers.filter((offer) => normalizeKey(offer.status).includes('declined')).length || 0
  const withdrawn = firstNumber(record.offersWithdrawn, record.offers_withdrawn, roleSpecific.offersWithdrawn, roleSpecific.offers_withdrawn) || offers.filter((offer) => normalizeKey(offer.status).includes('withdrawn')).length || 0
  return {
    offers,
    submitted,
    accepted,
    declined,
    withdrawn,
    offerSubmitted: submitted > 0 || accepted > 0 || firstBoolean(record.offerSubmitted, record.offer_submitted, roleSpecific.offerSubmitted, roleSpecific.offer_submitted),
  }
}

function buyerHasOnboardingSent(record = {}) {
  const roleSpecific = getLeadRoleSpecific(record)
  const metadata = record.metadata || record.metadata_json || {}
  return Boolean(firstText(record.onboardingSentAt, record.onboarding_sent_at, roleSpecific.onboardingSentAt, roleSpecific.onboarding_sent_at) ||
    ['sent', 'submitted', 'complete'].includes(normalizeKey(record.onboardingStatus || record.onboarding_status || roleSpecific.onboardingStatus || metadata.onboarding_status)))
}

function getBuyerReadiness(record = {}) {
  const profile = getBuyerProfile(record)
  const requirement = getBuyerRequirement(record)
  const funding = getBuyerFunding(record)
  const checks = [
    { key: 'contact', label: 'Contact Details', complete: !['Phone pending', 'Email pending'].includes(getPhone(record)) && !['Phone pending', 'Email pending'].includes(getEmail(record)) },
    { key: 'requirement', label: 'Requirement Captured', complete: requirement.requirementCaptured },
    { key: 'budget', label: 'Budget Confirmed', complete: Boolean(requirement.purchaseBudget || requirement.maxPurchasePrice) },
    { key: 'funding', label: 'Funding Confirmed', complete: funding.fundingConfirmed },
    { key: 'timeline', label: 'Occupation Timeline', complete: requirement.occupationDate !== 'Not captured' || requirement.purchaseTimeline !== 'Not captured' },
    { key: 'decision', label: 'Decision Maker Identified', complete: profile.relationshipType !== 'Not captured' && profile.contactPerson !== 'Contact pending' },
    { key: 'areas', label: 'Area Preferences Captured', complete: requirement.preferredAreas.length > 0 },
    ...buildAssetReadinessChecks(record, 'requirement'),
  ]
  const percentage = Math.round((checks.filter((check) => check.complete).length / checks.length) * 100)
  const label = percentage >= 85 ? 'Ready' : percentage >= 45 ? 'Needs Attention' : 'Incomplete'
  return { percentage, label, checks }
}

function getBuyerNextBestAction(record = {}) {
  const requirement = getBuyerRequirement(record)
  const funding = getBuyerFunding(record)
  const matching = getBuyerMatching(record)
  const viewing = getBuyerViewing(record)
  const offers = getBuyerOffers(record)
  if (!buyerHasOnboardingSent(record)) return { label: 'Send Buyer Onboarding', description: 'Request buyer details, acquisition appetite and funding position.', action: 'send_onboarding' }
  if (!requirement.requirementCaptured) return { label: 'Capture Requirement', description: 'Capture asset class, preferred areas, size, budget and timeline.', action: 'capture_requirement' }
  if (!funding.fundingConfirmed) return { label: 'Confirm Funding Position', description: 'Validate budget, funding type, deposit and proof of funds.', action: 'confirm_funding' }
  if (!matching.matchCount) return { label: 'Match Listings', description: 'Run acquisition matching against active sales listings.', action: 'match_listings' }
  if (!viewing.upcoming && !viewing.completed) return { label: 'Schedule Viewing', description: 'Book a viewing for a matched commercial sales listing.', action: 'schedule_viewing' }
  if (!offers.offerSubmitted) return { label: 'Prepare Offer', description: 'Prepare an offer package for a viewed matched listing.', action: 'prepare_offer' }
  return { label: 'Convert to Deal', description: 'Offer activity exists and this buyer lead can move into a sale deal.', action: 'convert_deal' }
}

function buildBuyerSummaryCards(lead = {}, activities = []) {
  const requirement = getBuyerRequirement(lead)
  const funding = getBuyerFunding(lead)
  const viewing = getBuyerViewing(lead)
  const lastActivity = activities[0]
  return [
    { key: 'broker', label: 'Assigned Broker', value: getBroker(lead) === 'No broker assigned' ? 'No broker assigned' : 'Broker Assigned', icon: UserRound, tone: 'blue' },
    { key: 'funding', label: 'Funding Status', value: funding.fundingConfirmed ? 'Funding Confirmed' : funding.fundingStatusLabel, icon: Percent, tone: funding.fundingConfirmed ? 'green' : 'amber' },
    { key: 'requirement', label: 'Requirement Status', value: requirement.requirementCaptured ? 'Requirement Complete' : 'Requirement Pending', icon: ClipboardList, tone: requirement.requirementCaptured ? 'green' : 'amber' },
    { key: 'viewing', label: 'Viewing Status', value: viewing.viewingStatus, icon: CalendarDays, tone: viewing.upcoming ? 'blue' : 'slate' },
    { key: 'activity', label: 'Last Activity', value: lastActivity ? formatRelativeTime(lastActivity.createdAt || lastActivity.created_at || lastActivity.activityDate || lastActivity.activity_date) : 'No activity yet', icon: Clock3, tone: 'amber' },
  ]
}

function buildBuyerJourney(lead = {}) {
  const status = normalizeLeadStatus(lead.status)
  const requirement = getBuyerRequirement(lead)
  const funding = getBuyerFunding(lead)
  const matching = getBuyerMatching(lead)
  const viewing = getBuyerViewing(lead)
  const offers = getBuyerOffers(lead)
  const dealCreated = Boolean(firstText(lead.dealId, lead.deal_id, getLeadRoleSpecific(lead).dealId, getLeadRoleSpecific(lead).deal_id))
  const steps = [
    { key: 'captured', label: 'Lead Captured', done: true, date: lead.createdAt ? formatShortDate(lead.createdAt) : '', subtext: 'Buyer lead created' },
    { key: 'contacted', label: 'Contacted', done: ['contacted', 'qualified', 'active', 'negotiation', 'converted'].includes(status), subtext: 'Broker contact logged' },
    { key: 'onboarding', label: 'Buyer Onboarding Sent', done: buyerHasOnboardingSent(lead), subtext: 'Buyer onboarding request sent' },
    { key: 'requirement', label: 'Requirement Captured', done: requirement.requirementCaptured, subtext: 'Acquisition criteria captured' },
    { key: 'funding', label: 'Funding Confirmed', done: funding.fundingConfirmed, subtext: 'Funding position validated' },
    { key: 'matching', label: 'Listings Matched', done: matching.matchCount > 0, subtext: 'Sales listings matched to requirement' },
    { key: 'viewing', label: 'Viewing Scheduled', done: viewing.upcoming > 0 || viewing.completed > 0, subtext: 'Viewing booked or completed' },
    { key: 'offer', label: 'Offer Submitted', done: offers.offerSubmitted, subtext: 'Offer submitted or accepted' },
    { key: 'deal', label: 'Deal Created', done: dealCreated, subtext: 'Sale deal opened' },
  ]
  const firstIncomplete = steps.findIndex((step) => !step.done)
  return steps.map((step, index) => {
    const blocked = ['matching', 'viewing', 'offer', 'deal'].includes(step.key) && (!requirement.requirementCaptured || !funding.fundingConfirmed)
    return { ...step, state: step.done ? 'complete' : blocked ? 'blocked' : index === firstIncomplete ? 'current' : 'upcoming' }
  })
}

function buildInitials(value = '') {
  const initials = normalizeText(value)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  return initials || 'CL'
}

function getBackPath(dealType = 'lease', search = '') {
  const params = new URLSearchParams(search || '')
  params.delete('detailTab')
  const query = params.toString()
  const base = normalizeDealType(dealType) === 'sale' ? '/commercial/sales/leads' : '/commercial/leasing/leads'
  return query ? `${base}?${query}` : base
}

function buildSummaryCards(lead = {}, activities = []) {
  const lastActivity = activities[0]
  return [
    { key: 'broker', label: 'Assigned Broker', value: getBroker(lead), icon: UserRound, tone: 'blue' },
    { key: 'stage', label: 'Current Stage', value: lead.stageLabel || titleCase(normalizeLeadStatus(lead.status)) || 'Stage pending', icon: Clock3, tone: 'purple' },
    { key: 'status', label: 'Lead Status', value: titleCase(normalizeLeadStatus(lead.status)), icon: CheckCircle2, tone: getStatusTone(lead.status) },
    {
      key: 'activity',
      label: 'Last Activity',
      value: lastActivity ? formatRelativeTime(lastActivity.createdAt || lastActivity.created_at || lastActivity.activityDate || lastActivity.activity_date) : 'No activity yet',
      icon: CalendarDays,
      tone: 'amber',
    },
  ]
}

function buildJourney(lead = {}) {
  const status = normalizeLeadStatus(lead.status)
  const order = ['new', 'contacted', 'qualified', 'active', 'converted']
  const currentIndex = Math.max(0, order.indexOf(status))
  return [
    { key: 'captured', label: 'Lead Captured', date: lead.createdAt ? formatShortDate(lead.createdAt) : '', subtext: 'Commercial lead created', state: 'complete' },
    { key: 'contacted', label: 'Contacted', date: '', subtext: 'First broker contact', state: currentIndex > 1 ? 'complete' : currentIndex === 1 ? 'current' : 'upcoming' },
    { key: 'qualified', label: 'Qualified', date: '', subtext: 'Opportunity validated', state: currentIndex > 2 ? 'complete' : currentIndex === 2 ? 'current' : 'upcoming' },
    { key: 'onboarding', label: 'Onboarding Sent', date: '', subtext: 'Documentation request ready', state: status === 'converted' ? 'complete' : status === 'active' ? 'current' : 'upcoming' },
    { key: 'converted', label: 'Converted', date: lead.convertedAt ? formatShortDate(lead.convertedAt) : '', subtext: 'Ready for vacancy, listing or deal', state: status === 'converted' ? 'complete' : 'upcoming' },
  ]
}

function DetailBadge({ children, tone = 'slate' }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass(tone)}`}>{children}</span>
}

function getCommercialConvertedObjects(lead = {}) {
  const role = normalizeLeadType(lead)
  const roleSpecific = getLeadRoleSpecific(lead)
  const dealId = firstText(lead.dealId, lead.deal_id, roleSpecific.dealId, roleSpecific.deal_id)
  const convertedObjects = {}

  if (role === 'landlord') {
    const vacancy = getLandlordVacancy(lead)
    if (vacancy.vacancyCreated) convertedObjects.vacancy = { id: vacancy.vacancyId, target_type: 'vacancy', title: 'Vacancy' }
  }

  if (role === 'tenant') {
    const requirement = getTenantRequirement(lead)
    const proposal = getTenantProposal(lead)
    const requirementId = firstText(lead.requirementId, lead.requirement_id, roleSpecific.requirementId, roleSpecific.requirement_id)
    if (requirement.requirementCaptured) convertedObjects.tenant_requirement = { id: requirementId || `${lead.id || 'lead'}-requirement`, target_type: 'tenant_requirement', title: 'Tenant Requirement' }
    if (proposal.hotDrafted || proposal.hotSigned) convertedObjects.hot = { id: firstText(lead.hotId, lead.hot_id, roleSpecific.hotId, roleSpecific.hot_id) || `${lead.id || 'lead'}-hot`, target_type: 'hot', title: 'Heads Of Terms' }
  }

  if (role === 'seller') {
    const listing = getSellerListing(lead)
    const listingId = firstText(lead.listingId, lead.listing_id, roleSpecific.listingId, roleSpecific.listing_id)
    if (listing.listingCreated) convertedObjects.listing = { id: listingId || `${lead.id || 'lead'}-listing`, target_type: 'listing', title: 'Sales Listing' }
    if (listing.offerReceived) convertedObjects.offer = { id: firstText(lead.offerId, lead.offer_id, roleSpecific.offerId, roleSpecific.offer_id) || `${lead.id || 'lead'}-offer`, target_type: 'offer', title: 'Offer' }
  }

  if (role === 'buyer') {
    const requirement = getBuyerRequirement(lead)
    const offers = getBuyerOffers(lead)
    const requirementId = firstText(lead.requirementId, lead.requirement_id, roleSpecific.requirementId, roleSpecific.requirement_id)
    if (requirement.requirementCaptured) convertedObjects.buyer_requirement = { id: requirementId || `${lead.id || 'lead'}-buyer-requirement`, target_type: 'buyer_requirement', title: 'Buyer Requirement' }
    if (offers.offerSubmitted) convertedObjects.offer = { id: firstText(lead.offerId, lead.offer_id, roleSpecific.offerId, roleSpecific.offer_id) || `${lead.id || 'lead'}-offer`, target_type: 'offer', title: 'Offer' }
  }

  if (dealId) convertedObjects.deal = { id: dealId, target_type: 'deal', title: normalizeDealType(lead.dealType || lead.deal_type) === 'sale' ? 'Sale Deal' : 'Lease Deal' }
  return convertedObjects
}

function CommercialConversionLineagePanel({ lead, readinessPercentage = 0 }) {
  const convertedObjects = getCommercialConvertedObjects(lead)
  const timeline = buildCommercialConversionTimeline(lead, convertedObjects)
  const graph = buildCommercialRelationshipGraph(lead, convertedObjects)
  const suggestion = buildCommercialConversionSuggestion(lead, readinessPercentage)
  const relatedNodes = graph.nodes.filter((node) => node.type !== 'lead')
  const createdFromType = firstText(lead.created_from_type, lead.createdFromType, lead.source_type, getLeadRoleSpecific(lead).createdFromType) || 'Commercial Prospect'
  const createdFromId = firstText(lead.created_from_id, lead.createdFromId, lead.source_prospect_id, getLeadRoleSpecific(lead).createdFromId, lead.id)
  const convertedLabels = relatedNodes.length ? relatedNodes.map((node) => node.label).join(', ') : suggestion?.label || 'No converted objects yet'

  return (
    <div className="mt-4 rounded-[16px] border border-slate-200 bg-[#fbfcfe] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Commercial Conversion Engine</p>
          <p className="mt-1 text-sm font-semibold text-[#102236]">Data lineage, related objects and next conversion actions.</p>
        </div>
        {suggestion ? <DetailBadge tone="blue">{suggestion.label}</DetailBadge> : <DetailBadge tone="slate">Readiness {readinessPercentage}%</DetailBadge>}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Created From</p>
          <p className="mt-1 text-sm font-semibold text-[#102236]">{titleCase(createdFromType)}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{createdFromId || 'Source pending'}</p>
        </div>
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Converted To</p>
          <p className="mt-1 text-sm font-semibold text-[#102236]">{convertedLabels}</p>
          <p className="mt-1 text-xs text-slate-500">{timeline.filter((event) => event.complete).length} timeline events complete</p>
        </div>
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Related Objects</p>
          <p className="mt-1 text-sm font-semibold text-[#102236]">{relatedNodes.length ? `${relatedNodes.length} linked object${relatedNodes.length === 1 ? '' : 's'}` : 'No related objects yet'}</p>
          <p className="mt-1 text-xs text-slate-500">{titleCase(graph.graph_type)}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {timeline.map((event) => (
          <DetailBadge key={`${event.label}-${event.entity_type}`} tone={event.complete ? 'green' : 'slate'}>{event.label}</DetailBadge>
        ))}
      </div>
    </div>
  )
}

function SummaryCard({ card }) {
  return (
    <article className="flex min-h-[86px] items-center gap-3 rounded-[16px] border border-[#e6edf4] bg-white px-4 py-3">
      <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] ${toneClass(card.tone)}`}>
        {createElement(card.icon, { size: 17 })}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#60758d]">{card.label}</p>
        <p className="mt-1 truncate text-sm font-semibold text-[#102236]">{card.value}</p>
      </div>
    </article>
  )
}

export function CommercialLeadJourney({
  items = [],
  title = 'Lead Journey',
  subtitle = 'Qualification and conversion path for this commercial lead.',
  completionBanner = null,
}) {
  return (
    <section className={`${CARD_CLASS} p-4`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>
      {completionBanner ? (
        <div className="mt-4 flex items-start gap-3 rounded-[16px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
          <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
          <div>
            <p className="text-sm font-semibold">{completionBanner.title}</p>
            <p className="mt-1 text-sm leading-6 text-emerald-700">{completionBanner.description}</p>
          </div>
        </div>
      ) : null}
      <div className={`mt-5 grid gap-3 md:grid-cols-4 ${items.length === 7 ? 'xl:grid-cols-7' : 'xl:grid-cols-8'}`}>
        {items.map((item, index) => {
          const complete = item.state === 'complete'
          const current = item.state === 'current'
          const blocked = item.state === 'blocked'
          return (
            <div key={item.key || item.label} className="relative rounded-[16px] border border-slate-200 bg-[#fbfcfe] p-3">
              {index < items.length - 1 ? <span className="absolute left-[calc(100%-2px)] top-7 hidden h-px w-4 bg-slate-200 md:block" /> : null}
              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${
                complete
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : current
                    ? 'border-emerald-300 bg-emerald-100 text-emerald-800 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]'
                    : blocked
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : 'border-slate-200 bg-white text-slate-500'
              }`}>
                {complete ? <CheckCircle2 size={15} /> : index + 1}
              </span>
              <p className="mt-3 text-sm font-semibold text-[#102236]">{item.label}</p>
              <p className="mt-1 text-xs text-slate-500">{item.subtext}</p>
              <p className="mt-2 text-xs font-semibold text-slate-400">{item.date || titleCase(item.state)}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function CommercialLeadActivityFeed({ activities = [] }) {
  return (
    <section className={`${CARD_CLASS} p-4`}>
      <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Activity</h2>
      <p className="mt-1 text-sm text-slate-500">Calls, emails, WhatsApps, notes, meetings, documents, status changes and conversions will appear here.</p>
      <div className="mt-4 grid gap-3">
        {activities.length ? activities.map((activity) => (
          <article key={activity.id || `${activity.activityType}-${activity.createdAt}`} className="rounded-[16px] border border-slate-200 bg-[#fbfcfe] p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#102236]">{activity.activityType || activity.activity_type || 'Note'}</p>
                <p className="mt-1 text-sm text-slate-500">{activity.activityNote || activity.activity_note || activity.outcome || 'Activity logged'}</p>
              </div>
              <p className="text-xs font-semibold text-slate-400">
                {formatRelativeTime(activity.createdAt || activity.created_at || activity.activityDate || activity.activity_date)}
              </p>
            </div>
          </article>
        )) : (
          <div className="rounded-[16px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
            No activity yet.
          </div>
        )}
      </div>
    </section>
  )
}

function PlaceholderPanel({ title, description }) {
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </section>
  )
}

function SnapshotRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-b-0">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</span>
      <span className="max-w-[62%] text-right text-sm font-semibold text-[#102236]">{value}</span>
    </div>
  )
}

function DetailField({ label, value }) {
  return (
    <div className="rounded-[16px] border border-slate-200 bg-[#fbfcfe] px-4 py-3">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#102236]">{value || 'Not captured'}</p>
    </div>
  )
}

function AssetIntelligenceCards({ lead, scope = 'property' }) {
  const configuration = getAssetConfigurationForRecord(lead)
  if (configuration.assetClass === 'other' || !configuration.dashboardCards?.length) return null
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Asset Intelligence</h2>
          <p className="mt-1 text-sm text-slate-500">{configuration.label} intelligence for this {scope === 'requirement' ? 'requirement' : 'property'}.</p>
        </div>
        <DetailBadge tone="blue">{configuration.label}</DetailBadge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {configuration.dashboardCards.map((card) => (
          <DetailField
            key={card.label}
            label={card.label}
            value={getAssetIntelligenceValue(lead, card.key, configuration.assetClass) || card.fallback}
          />
        ))}
      </div>
    </section>
  )
}

function AssetIntelligenceFields({ lead, scope = 'property' }) {
  const configuration = getAssetConfigurationForRecord(lead)
  const fields = scope === 'requirement' ? configuration.requirementFields : configuration.propertyFields
  if (configuration.assetClass === 'other' || !fields?.length) return null
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">{configuration.label} Fields</h2>
          <p className="mt-1 text-sm text-slate-500">Only fields relevant to this asset class are shown.</p>
        </div>
        <DetailBadge tone="purple">Dynamic asset fields</DetailBadge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {fields.map((field) => (
          <DetailField
            key={field.key}
            label={field.label}
            value={getAssetIntelligenceValue(lead, field.key, configuration.assetClass) || 'Not captured'}
          />
        ))}
      </div>
    </section>
  )
}

function AssetMatchingRules({ lead }) {
  const configuration = getAssetConfigurationForRecord(lead)
  if (!configuration.matchingRules?.length) return null
  return (
    <div className="mt-4 rounded-[16px] border border-slate-200 bg-[#fbfcfe] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{configuration.label} Matching Rules</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {configuration.matchingRules.map((rule) => <DetailBadge key={rule} tone="slate">{rule}</DetailBadge>)}
      </div>
    </div>
  )
}

function ActionCentre({ onAddNote, onLogCall, onSendOnboarding, onEdit }) {
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Action Centre</h2>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onAddNote}>
          <MessageSquare size={15} />
          Add Note
        </Button>
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onLogCall}>
          <Phone size={15} />
          Log Call
        </Button>
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onSendOnboarding}>
          <Send size={15} />
          Send Onboarding
        </Button>
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onEdit}>
          <Pencil size={15} />
          Edit Lead
        </Button>
      </div>
    </section>
  )
}

function LandlordOverview({ lead, onSendOnboarding }) {
  const nextAction = getLandlordNextBestAction(lead)
  const readiness = getLandlordReadiness(lead)
  const profile = getLandlordProfile(lead)
  const mandate = getLandlordMandate(lead)
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <section className={`${CARD_CLASS} p-5`}>
          <div className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-blue-50 text-blue-700">
            <Target size={18} />
          </div>
          <h2 className="mt-4 text-base font-semibold tracking-[-0.03em] text-[#102236]">Next Best Action</h2>
          <p className="mt-2 text-lg font-semibold text-[#102236]">{nextAction.label}</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">{nextAction.description}</p>
          <div className="mt-4 grid gap-2">
            <Button
              type="button"
              className="justify-center rounded-[14px] bg-[#102b46] hover:bg-[#143858]"
              onClick={nextAction.action === 'send_onboarding' ? onSendOnboarding : undefined}
              disabled={nextAction.action !== 'send_onboarding'}
            >
              {nextAction.label}
            </Button>
          </div>
        </section>

      <section className={`${CARD_CLASS} p-5`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Landlord Readiness Score</h2>
            <p className="mt-1 text-sm text-slate-500">Based on relationship conversion signals.</p>
          </div>
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-lg font-semibold text-emerald-700">
            {readiness.percentage}%
          </span>
        </div>
        <div className="mt-4 grid gap-2">
          {readiness.checks.map((check) => (
            <div key={check.key} className="flex items-center justify-between gap-3 rounded-[14px] border border-slate-200 bg-[#fbfcfe] px-3 py-2">
              <span className="text-sm font-medium text-[#102236]">{check.label}</span>
              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${check.complete ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                <CheckCircle2 size={14} />
              </span>
            </div>
          ))}
        </div>
        </section>

        <section className={`${CARD_CLASS} p-5`}>
          <div className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-slate-50 text-slate-700">
            <UserRound size={18} />
          </div>
          <h2 className="mt-4 text-base font-semibold tracking-[-0.03em] text-[#102236]">Client Conversion Snapshot</h2>
          <div className="mt-4 grid gap-2">
            <SnapshotRow label="Landlord" value={profile.companyName} />
            <SnapshotRow label="Representative" value={profile.contactPerson} />
            <SnapshotRow label="Relationship" value={profile.relationshipType} />
            <SnapshotRow label="Onboarding" value={landlordOnboardingComplete(lead) ? 'Complete' : landlordHasOnboardingSent(lead) ? 'Sent' : 'Not sent'} />
            <SnapshotRow label="Mandate" value={mandate.mandateStatusLabel} />
            <SnapshotRow label="Client Status" value={landlordOnboardingComplete(lead) && landlordMandateComplete(lead) ? 'Active client' : 'Prospective landlord'} />
          </div>
        </section>
      </div>
    </div>
  )
}

function LandlordProfilePanel({ lead }) {
  const profile = getLandlordProfile(lead)
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Landlord Profile</h2>
          <p className="mt-1 text-sm text-slate-500">Owner, property manager or asset manager contact details.</p>
        </div>
        <DetailBadge tone="blue">{profile.relationshipType}</DetailBadge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <DetailField label="Landlord / Company Name" value={profile.companyName} />
        <DetailField label="Contact Person" value={profile.contactPerson} />
        <DetailField label="Role / Relationship Type" value={profile.relationshipType} />
        <DetailField label="Phone" value={profile.phone} />
        <DetailField label="Email" value={profile.email} />
        <DetailField label="Alternative Contact" value={profile.alternativeContact} />
        <DetailField label="Broker" value={profile.broker} />
        <DetailField label="Source" value={profile.source} />
        <DetailField label="Relationship Type Options" value={LANDLORD_RELATIONSHIP_TYPES.join(', ')} />
      </div>
      <div className="mt-3">
        <DetailField label="Notes" value={profile.notes} />
      </div>
    </section>
  )
}

function LandlordPropertyPanel({ lead, onCreateVacancy }) {
  const property = getLandlordProperty(lead)
  const vacancy = getLandlordVacancy(lead)
  const vacancyButtonLabel = vacancy.vacancyCreated ? 'View Vacancy' : 'Create Vacancy'
  return (
    <div className="grid gap-4">
      <section className={`${CARD_CLASS} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Property</h2>
            <p className="mt-1 text-sm text-slate-500">Core property and ownership details for this landlord lead.</p>
          </div>
          <DetailBadge tone={property.authorityConfirmed ? 'green' : 'slate'}>{property.authorityConfirmed ? 'Authority confirmed' : 'Authority pending'}</DetailBadge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <DetailField label="Property Name" value={property.propertyName} />
          <DetailField label="Property Address" value={property.propertyAddress} />
          <DetailField label="Area / Node" value={property.areaNode} />
          <DetailField label="Asset Class" value={property.assetClassLabel} />
          <DetailField label="Property Type" value={property.propertyType} />
          <DetailField label="GLA" value={property.glaSqm ? `${property.glaSqm} m²` : 'Not captured'} />
          <DetailField label="Erf Size" value={property.erfSizeSqm ? `${property.erfSizeSqm} m²` : 'Not captured'} />
          <DetailField label="Available Size" value={property.availableSizeSqm ? `${property.availableSizeSqm} m²` : 'Not captured'} />
          <DetailField label="Parking" value={property.parkingNotes} />
          <DetailField label="Ownership Type" value={property.ownershipType} />
          <DetailField label="Property Type Options" value={(PROPERTY_TYPE_OPTIONS_BY_ASSET_CLASS[property.assetClass] || ['Not captured']).join(', ')} />
        </div>
        <div className="mt-3">
          <DetailField label="Property Notes" value={property.propertyNotes} />
        </div>
      </section>

      <AssetIntelligenceFields lead={lead} scope="property" />

      <section className={`${CARD_CLASS} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Vacancy Readiness</h2>
            <p className="mt-1 text-sm text-slate-500">Vacancy fields that can prefill the creation workflow.</p>
          </div>
          <Button type="button" className="rounded-[14px] bg-[#102b46] hover:bg-[#143858]" onClick={onCreateVacancy}>
            {vacancyButtonLabel}
          </Button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DetailField label="Vacancy Created" value={vacancy.vacancyCreated ? 'Yes' : 'Vacancy not created'} />
          <DetailField label="Available Area" value={vacancy.availableArea ? `${vacancy.availableArea} m²` : 'Not captured'} />
          <DetailField label="Asking Rental" value={vacancy.askingRental ? `R${vacancy.askingRental}` : 'Rental not captured'} />
          <DetailField label="Operating Costs" value={vacancy.operatingCosts ? `R${vacancy.operatingCosts}` : 'Not captured'} />
          <DetailField label="Availability Date" value={vacancy.availabilityDate} />
          <DetailField label="Lease Term Preference" value={vacancy.leaseTermPreference} />
          <DetailField label="Incentives" value={vacancy.incentives} />
          <DetailField label="Vacancy Status" value={vacancy.vacancyStatusLabel} />
        </div>
      </section>
    </div>
  )
}

function LandlordMandatePanel({ lead }) {
  const mandate = getLandlordMandate(lead)
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Mandate / Terms</h2>
          <p className="mt-1 text-sm text-slate-500">Landlord authority, mandate and commission foundation.</p>
        </div>
        <DetailBadge tone={['signed', 'not_required'].includes(mandate.mandateStatus) ? 'green' : 'amber'}>{mandate.mandateStatusLabel}</DetailBadge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <DetailField label="Mandate Status" value={mandate.mandateStatusLabel} />
        <DetailField label="Mandate Type" value={mandate.mandateTypeLabel} />
        <DetailField label="Commission Structure" value={mandate.commissionStructure} />
        <DetailField label="Authority Confirmed" value={mandate.authorityConfirmed ? 'Yes' : 'Pending'} />
        <DetailField label="Mandate Type Options" value={LANDLORD_MANDATE_TYPES.join(', ')} />
        <DetailField label="Mandate Status Options" value={LANDLORD_MANDATE_STATUSES.join(', ')} />
      </div>
      <div className="mt-3">
        <DetailField label="Terms Notes" value={mandate.termsNotes} />
      </div>
    </section>
  )
}

function LandlordAppointmentsPanel({ onScheduleCall, onScheduleMeeting, onScheduleVisit }) {
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Appointments</h2>
      <p className="mt-1 text-sm text-slate-500">Schedule landlord calls, meetings and property visits.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onScheduleCall}>Schedule Call</Button>
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onScheduleMeeting}>Schedule Meeting</Button>
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onScheduleVisit}>Schedule Property Visit</Button>
      </div>
    </section>
  )
}

function LandlordDocumentsPanel({ lead }) {
  const roleSpecific = getLeadRoleSpecific(lead)
  const statusMap = roleSpecific.documentChecklist || roleSpecific.document_checklist || {}
  const documents = buildAssetDocumentChecklist(LANDLORD_DOCUMENT_CHECKLIST, lead)
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Landlord Documents</h2>
      <p className="mt-1 text-sm text-slate-500">Initial checklist for landlord onboarding, ownership and portfolio verification.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {documents.map((documentName) => {
          const key = normalizeKey(documentName)
          const status = titleCase(statusMap[key] || statusMap[documentName] || 'not_requested')
          return (
            <div key={documentName} className="rounded-[16px] border border-slate-200 bg-[#fbfcfe] p-4">
              <p className="text-sm font-semibold text-[#102236]">{documentName}</p>
              <p className="mt-2 text-xs font-semibold text-slate-500">{status}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function LandlordConversionPanel({ lead }) {
  const mandate = getLandlordMandate(lead)
  const readiness = getLandlordReadiness(lead)
  const events = [
    { label: 'Lead captured', complete: true },
    { label: 'Broker contact logged', complete: landlordHasContactLogged(lead) },
    { label: 'Ownership and portfolio request sent', complete: landlordHasOnboardingSent(lead) },
    { label: 'Client information received', complete: landlordOnboardingComplete(lead) },
    { label: 'Mandate issued for signature', complete: landlordMandateSent(lead) },
    { label: 'Authority confirmed', complete: landlordMandateComplete(lead) },
    { label: 'Active client established', complete: landlordOnboardingComplete(lead) && landlordMandateComplete(lead) },
  ]
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Conversion History</h2>
          <p className="mt-1 text-sm text-slate-500">Relationship conversion events from lead to active landlord client.</p>
        </div>
        <DetailBadge tone={mandate.mandateStatus === 'signed' ? 'green' : 'slate'}>{mandate.mandateStatusLabel}</DetailBadge>
      </div>
      <CommercialConversionLineagePanel lead={lead} readinessPercentage={readiness.percentage} />
      <div className="mt-4 grid gap-3">
        {events.map((event) => (
          <div key={event.label} className="flex items-center justify-between gap-3 rounded-[16px] border border-slate-200 bg-[#fbfcfe] px-4 py-3">
            <span className="text-sm font-semibold text-[#102236]">{event.label}</span>
            <DetailBadge tone={event.complete ? 'green' : 'slate'}>{event.complete ? 'Complete' : 'Pending'}</DetailBadge>
          </div>
        ))}
      </div>
    </section>
  )
}

function TenantOverview({ lead, onSendOnboarding, onCaptureRequirement, onMatchVacancies, onScheduleViewing, onPrepareProposal, onPrepareHot, onConvertToDeal }) {
  const nextAction = getTenantNextBestAction(lead)
  const readiness = getTenantReadiness(lead)
  const matching = getTenantMatching(lead)
  const matches = matching.matches.length ? matching.matches : [
    { property: 'Retail Plaza', area: 'Area pending', assetClass: getAssetClassLabel(lead), size: 'Size pending', rental: 'Rental pending', availability: 'Availability pending', matchScore: matching.matchCount ? '78%' : 'Pending' },
    { property: 'Office Park', area: 'Node pending', assetClass: 'Office', size: 'Size pending', rental: 'Rental pending', availability: 'Availability pending', matchScore: 'Pending' },
    { property: 'Industrial Warehouse', area: 'Node pending', assetClass: 'Industrial', size: 'Size pending', rental: 'Rental pending', availability: 'Availability pending', matchScore: 'Pending' },
  ]
  const actionMap = {
    send_onboarding: onSendOnboarding,
    capture_requirement: onCaptureRequirement,
    match_vacancies: onMatchVacancies,
    schedule_viewing: onScheduleViewing,
    prepare_proposal: onPrepareProposal,
    prepare_hot: onPrepareHot,
    convert_deal: onConvertToDeal,
  }
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <section className={`${CARD_CLASS} p-5`}>
        <div className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-blue-50 text-blue-700">
          <Target size={18} />
        </div>
        <h2 className="mt-4 text-base font-semibold tracking-[-0.03em] text-[#102236]">Next Best Action</h2>
        <p className="mt-2 text-lg font-semibold text-[#102236]">{nextAction.label}</p>
        <p className="mt-2 text-sm leading-6 text-slate-500">{nextAction.description}</p>
        <Button type="button" className="mt-4 w-full justify-center rounded-[14px] bg-[#102b46] hover:bg-[#143858]" onClick={actionMap[nextAction.action]}>
          {nextAction.label}
        </Button>
      </section>

      <section className={`${CARD_CLASS} p-5`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Requirement Readiness Score</h2>
            <p className="mt-1 text-sm text-slate-500">{readiness.label}</p>
          </div>
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-lg font-semibold text-emerald-700">
            {readiness.percentage}%
          </span>
        </div>
        <div className="mt-4 grid gap-2">
          {readiness.checks.map((check) => (
            <div key={check.key} className="flex items-center justify-between gap-3 rounded-[14px] border border-slate-200 bg-[#fbfcfe] px-3 py-2">
              <span className="text-sm font-medium text-[#102236]">{check.label}</span>
              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${check.complete ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                <CheckCircle2 size={14} />
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className={`${CARD_CLASS} p-5`}>
        <div className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-slate-50 text-slate-700">
          <Building2 size={18} />
        </div>
        <h2 className="mt-4 text-base font-semibold tracking-[-0.03em] text-[#102236]">Match Centre</h2>
        <p className="mt-2 text-lg font-semibold text-[#102236]">{matching.matchCount || 0} Potential Matches</p>
        <div className="mt-4 grid gap-2">
          {matches.slice(0, 3).map((match) => (
            <div key={match.property || match.id} className="rounded-[14px] border border-slate-200 bg-[#fbfcfe] px-3 py-2">
              <p className="text-sm font-semibold text-[#102236]">{match.property || match.propertyName || 'Matched vacancy'}</p>
              <p className="mt-1 text-xs text-slate-500">{match.area || match.node || 'Area pending'} · {match.assetClass || match.asset_class || 'Asset class pending'}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onMatchVacancies}>View Matches</Button>
          <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onMatchVacancies}>Send Matches</Button>
          <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onScheduleViewing} disabled={!matching.matchCount}>Schedule Viewing</Button>
        </div>
      </section>
    </div>
  )
}

function TenantProfilePanel({ lead }) {
  const profile = getTenantProfile(lead)
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Tenant Profile</h2>
          <p className="mt-1 text-sm text-slate-500">Occupier, business and decision-maker details.</p>
        </div>
        <DetailBadge tone="blue">{profile.relationshipType}</DetailBadge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <DetailField label="Company Name" value={profile.companyName} />
        <DetailField label="Trading Name" value={profile.tradingName} />
        <DetailField label="Industry" value={profile.industry} />
        <DetailField label="Contact Person" value={profile.contactPerson} />
        <DetailField label="Role" value={profile.relationshipType} />
        <DetailField label="Phone" value={profile.phone} />
        <DetailField label="Email" value={profile.email} />
        <DetailField label="Website" value={profile.website} />
        <DetailField label="Current Premises" value={profile.currentPremises} />
        <DetailField label="Broker" value={profile.broker} />
        <DetailField label="Source" value={profile.source} />
        <DetailField label="Relationship Type Options" value={TENANT_RELATIONSHIP_TYPES.join(', ')} />
      </div>
      <div className="mt-3">
        <DetailField label="Notes" value={profile.notes} />
      </div>
    </section>
  )
}

function TenantRequirementPanel({ lead, onCaptureRequirement }) {
  const requirement = getTenantRequirement(lead)
  return (
    <div className="grid gap-4">
      <section className={`${CARD_CLASS} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Requirement Details</h2>
            <p className="mt-1 text-sm text-slate-500">The central object for tenant leasing leads.</p>
          </div>
          <Button type="button" className="rounded-[14px] bg-[#102b46] hover:bg-[#143858]" onClick={onCaptureRequirement}>Capture Requirement</Button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DetailField label="Asset Class" value={requirement.assetClassLabel} />
          <DetailField label="Area Preferences" value={requirement.preferredAreasLabel} />
          <DetailField label="Minimum Size" value={requirement.minSizeSqm ? `${requirement.minSizeSqm} m²` : 'Not captured'} />
          <DetailField label="Maximum Size" value={requirement.maxSizeSqm ? `${requirement.maxSizeSqm} m²` : 'Not captured'} />
          <DetailField label="Target Size" value={requirement.targetSizeSqm ? `${requirement.targetSizeSqm} m²` : 'Not captured'} />
          <DetailField label="Budget R/sqm" value={requirement.budgetPerSqm ? `R${requirement.budgetPerSqm}/sqm` : 'Not captured'} />
          <DetailField label="Monthly Budget" value={requirement.monthlyBudget ? `R${requirement.monthlyBudget}` : 'Not captured'} />
          <DetailField label="Annual Budget" value={requirement.annualBudget ? `R${requirement.annualBudget}` : 'Not captured'} />
          <DetailField label="Occupation Date" value={requirement.occupationDate} />
          <DetailField label="Lease Term" value={requirement.leaseTerm} />
          <DetailField label="Parking Requirement" value={requirement.parkingRequirement} />
          <DetailField label="Power Requirement" value={requirement.powerRequirement} />
          <DetailField label="Preferred Area Options" value={TENANT_PREFERRED_AREAS.join(', ')} />
          <DetailField label="Lease Term Options" value={TENANT_LEASE_TERMS.join(', ')} />
        </div>
        <div className="mt-3">
          <DetailField label="Special Requirements" value={requirement.specialRequirements} />
        </div>
      </section>
      <AssetIntelligenceFields lead={lead} scope="requirement" />
    </div>
  )
}

function TenantMatchingPanel({ lead, onMatchVacancies, onScheduleViewing }) {
  const matching = getTenantMatching(lead)
  const rows = matching.matches.length ? matching.matches : []
  return (
    <section className={`${CARD_CLASS} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8eef5] p-5">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Matched Vacancies</h2>
          <p className="mt-1 text-sm text-slate-500">{matching.matchCount || 0} potential matches for this requirement.</p>
        </div>
        <Button type="button" className="rounded-[14px] bg-[#102b46] hover:bg-[#143858]" onClick={onMatchVacancies}>Match Vacancies</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[860px] w-full border-separate border-spacing-0">
          <thead className="bg-[#f7fafc] text-left text-[12px] font-semibold uppercase tracking-[0.12em] text-[#61758b]">
            <tr>{['Property', 'Area', 'Asset Class', 'Size', 'Rental', 'Availability', 'Match Score', 'Actions'].map((label) => <th key={label} className="border-b border-[#e7edf4] px-4 py-3">{label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((match, index) => (
              <tr key={match.id || match.property || index} className="border-b border-slate-100">
                <td className="px-4 py-3 text-sm font-semibold text-[#102236]">{match.property || match.propertyName || 'Vacancy'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{match.area || 'Area pending'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{match.assetClass || match.asset_class || 'Asset class pending'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{match.size || match.sizeSqm || 'Size pending'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{match.rental || 'Rental pending'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{match.availability || 'Availability pending'}</td>
                <td className="px-4 py-3 text-sm font-semibold text-[#102236]">{match.matchScore || match.match_score || 'Pending'}</td>
                <td className="px-4 py-3"><Button type="button" variant="secondary" size="sm" className="rounded-[12px]" onClick={onScheduleViewing}>Schedule Viewing</Button></td>
              </tr>
            )) : (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">No matched vacancies yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="p-5 pt-0">
        <AssetMatchingRules lead={lead} />
      </div>
    </section>
  )
}

function TenantViewingsPanel({ lead, onScheduleViewing }) {
  const viewing = getTenantViewing(lead)
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Viewings</h2>
          <p className="mt-1 text-sm text-slate-500">Upcoming, completed and cancelled tenant viewings.</p>
        </div>
        <Button type="button" className="rounded-[14px] bg-[#102b46] hover:bg-[#143858]" onClick={onScheduleViewing}>Schedule Viewing</Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <DetailField label="Upcoming Viewings" value={String(viewing.upcoming)} />
        <DetailField label="Completed Viewings" value={String(viewing.completed)} />
        <DetailField label="Cancelled Viewings" value={String(viewing.cancelled)} />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onScheduleViewing}>Schedule Viewing</Button>
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={() => window.alert('Viewing feedback logging is ready to connect to the viewings workflow.')}>Log Viewing Feedback</Button>
      </div>
    </section>
  )
}

function TenantProposalHotPanel({ lead, onPrepareProposal, onPrepareHot }) {
  const proposal = getTenantProposal(lead)
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Proposal / HOT</h2>
      <p className="mt-1 text-sm text-slate-500">Proposal, Heads of Terms and lease-deal readiness.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DetailField label="Proposal Sent" value={proposal.proposalSent ? 'Yes' : 'Not sent'} />
        <DetailField label="Proposal Accepted" value={proposal.proposalAccepted ? 'Yes' : 'Pending'} />
        <DetailField label="HOT Drafted" value={proposal.hotDrafted ? 'Yes' : 'Not drafted'} />
        <DetailField label="HOT Signed" value={proposal.hotSigned ? 'Yes' : 'Not signed'} />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onPrepareProposal}>Generate Proposal</Button>
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onPrepareProposal}>Upload Proposal</Button>
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onPrepareHot}>Create HOT</Button>
      </div>
    </section>
  )
}

function TenantDocumentsPanel({ lead }) {
  const roleSpecific = getLeadRoleSpecific(lead)
  const statusMap = roleSpecific.documentChecklist || roleSpecific.document_checklist || {}
  const documents = buildAssetDocumentChecklist(TENANT_DOCUMENT_CHECKLIST, lead)
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Tenant Documents</h2>
      <p className="mt-1 text-sm text-slate-500">Initial checklist for tenant onboarding and deal readiness.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {documents.map((documentName) => {
          const key = normalizeKey(documentName)
          const status = titleCase(statusMap[key] || statusMap[documentName] || 'not_requested')
          return (
            <div key={documentName} className="rounded-[16px] border border-slate-200 bg-[#fbfcfe] p-4">
              <p className="text-sm font-semibold text-[#102236]">{documentName}</p>
              <p className="mt-2 text-xs font-semibold text-slate-500">{status}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function TenantConversionPanel({ lead }) {
  const requirement = getTenantRequirement(lead)
  const readiness = getTenantReadiness(lead)
  const matching = getTenantMatching(lead)
  const viewing = getTenantViewing(lead)
  const proposal = getTenantProposal(lead)
  const dealCreated = Boolean(firstText(lead.dealId, lead.deal_id, getLeadRoleSpecific(lead).dealId, getLeadRoleSpecific(lead).deal_id))
  const events = [
    { label: 'Prospect → Lead', complete: true },
    { label: 'Requirement Captured', complete: requirement.requirementCaptured },
    { label: 'Vacancies Matched', complete: matching.matchCount > 0 },
    { label: 'Viewing Scheduled', complete: viewing.upcoming > 0 || viewing.completed > 0 },
    { label: 'HOT Signed', complete: proposal.hotSigned },
    { label: 'Deal Created', complete: dealCreated },
  ]
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Conversion History</h2>
      <CommercialConversionLineagePanel lead={lead} readinessPercentage={readiness.percentage} />
      <div className="mt-4 grid gap-3">
        {events.map((event) => (
          <div key={event.label} className="flex items-center justify-between gap-3 rounded-[16px] border border-slate-200 bg-[#fbfcfe] px-4 py-3">
            <span className="text-sm font-semibold text-[#102236]">{event.label}</span>
            <DetailBadge tone={event.complete ? 'green' : 'slate'}>{event.complete ? 'Complete' : 'Pending'}</DetailBadge>
          </div>
        ))}
      </div>
    </section>
  )
}

function SellerOverview({ lead, onSendOnboarding, onGenerateMandate, onCreateListing, onRequestPhotos, onRequestDocuments, onConvertToDeal }) {
  const nextAction = getSellerNextBestAction(lead)
  const readiness = getSellerReadiness(lead)
  const property = getSellerProperty(lead)
  const listing = getSellerListing(lead)
  const canConvertToDeal = listing.listingCreated && listing.offerReceived && listing.sellerEngaged
  const actionMap = {
    send_onboarding: onSendOnboarding,
    confirm_property: () => window.alert('Property information capture is ready to connect to the commercial sales property editor.'),
    generate_mandate: onGenerateMandate,
    create_listing: onCreateListing,
    request_photos: onRequestPhotos,
    request_documents: onRequestDocuments,
    convert_deal: canConvertToDeal ? onConvertToDeal : undefined,
  }
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <section className={`${CARD_CLASS} p-5`}>
        <div className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-blue-50 text-blue-700">
          <Target size={18} />
        </div>
        <h2 className="mt-4 text-base font-semibold tracking-[-0.03em] text-[#102236]">Next Best Action</h2>
        <p className="mt-2 text-lg font-semibold text-[#102236]">{nextAction.label}</p>
        <p className="mt-2 text-sm leading-6 text-slate-500">{nextAction.description}</p>
        <div className="mt-4 grid gap-2">
          <Button type="button" className="justify-center rounded-[14px] bg-[#102b46] hover:bg-[#143858]" onClick={actionMap[nextAction.action]} disabled={!actionMap[nextAction.action]}>
            {nextAction.label}
          </Button>
          <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onConvertToDeal} disabled={!canConvertToDeal}>
            Convert to Deal
          </Button>
        </div>
      </section>

      <section className={`${CARD_CLASS} p-5`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Listing Readiness Score</h2>
            <p className="mt-1 text-sm text-slate-500">{readiness.label}</p>
          </div>
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-lg font-semibold text-emerald-700">
            {readiness.percentage}%
          </span>
        </div>
        <div className="mt-4 grid gap-2">
          {readiness.checks.map((check) => (
            <div key={check.key} className="flex items-center justify-between gap-3 rounded-[14px] border border-slate-200 bg-[#fbfcfe] px-3 py-2">
              <span className="text-sm font-medium text-[#102236]">{check.label}</span>
              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${check.complete ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                <CheckCircle2 size={14} />
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className={`${CARD_CLASS} p-5`}>
        <div className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-slate-50 text-slate-700">
          <Building2 size={18} />
        </div>
        <h2 className="mt-4 text-base font-semibold tracking-[-0.03em] text-[#102236]">Property Preview</h2>
        <div className="mt-4 grid gap-2">
          <SnapshotRow label="Property Name" value={property.propertyName} />
          <SnapshotRow label="Address" value={property.propertyAddress} />
          <SnapshotRow label="Area" value={property.areaNode} />
          <SnapshotRow label="Asset Class" value={property.assetClassLabel} />
          <SnapshotRow label="Property Type" value={property.propertyType} />
          <SnapshotRow label="GLA" value={property.glaSqm ? `${property.glaSqm} m²` : 'Not captured'} />
          <SnapshotRow label="Erf Size" value={property.erfSizeSqm ? `${property.erfSizeSqm} m²` : 'Not captured'} />
          <SnapshotRow label="Listing Status" value={listing.listingStatusLabel} />
        </div>
      </section>
    </div>
  )
}

function SellerProfilePanel({ lead }) {
  const profile = getSellerProfile(lead)
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Seller Profile</h2>
          <p className="mt-1 text-sm text-slate-500">Seller, owner, investor or asset manager relationship details.</p>
        </div>
        <DetailBadge tone="blue">{profile.relationshipType}</DetailBadge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <DetailField label="Seller / Company Name" value={profile.companyName} />
        <DetailField label="Contact Person" value={profile.contactPerson} />
        <DetailField label="Relationship Type" value={profile.relationshipType} />
        <DetailField label="Phone" value={profile.phone} />
        <DetailField label="Email" value={profile.email} />
        <DetailField label="Alternative Contact" value={profile.alternativeContact} />
        <DetailField label="Broker" value={profile.broker} />
        <DetailField label="Source" value={profile.source} />
        <DetailField label="Relationship Type Options" value={SELLER_RELATIONSHIP_TYPES.join(', ')} />
      </div>
      <div className="mt-3">
        <DetailField label="Notes" value={profile.notes} />
      </div>
    </section>
  )
}

function SellerPropertyPanel({ lead, onCreateListing }) {
  const property = getSellerProperty(lead)
  const listing = getSellerListing(lead)
  const readiness = getSellerReadiness(lead)
  return (
    <div className="grid gap-4">
      <section className={`${CARD_CLASS} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Property</h2>
            <p className="mt-1 text-sm text-slate-500">Core commercial sales property data and ownership facts.</p>
          </div>
          <DetailBadge tone={property.ownershipVerified ? 'green' : 'slate'}>{property.ownershipVerified ? 'Ownership confirmed' : 'Ownership pending'}</DetailBadge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <DetailField label="Property Name" value={property.propertyName} />
          <DetailField label="Property Address" value={property.propertyAddress} />
          <DetailField label="Area / Node" value={property.areaNode} />
          <DetailField label="Asset Class" value={property.assetClassLabel} />
          <DetailField label="Property Type" value={property.propertyType} />
          <DetailField label="GLA" value={property.glaSqm ? `${property.glaSqm} m²` : 'Not captured'} />
          <DetailField label="Erf Size" value={property.erfSizeSqm ? `${property.erfSizeSqm} m²` : 'Not captured'} />
          <DetailField label="Parking" value={property.parking} />
          <DetailField label="Ownership Type" value={property.ownershipType} />
          <DetailField label="Occupancy Status" value={property.occupancyStatus} />
          <DetailField label="Occupancy Options" value="Owner Occupied, Fully Let, Partially Let, Vacant, Mixed Occupancy" />
          <DetailField label="Property Type Options" value={(PROPERTY_TYPE_OPTIONS_BY_ASSET_CLASS[property.assetClass] || ['Not captured']).join(', ')} />
        </div>
        <div className="mt-3">
          <DetailField label="Property Notes" value={property.propertyNotes} />
        </div>
      </section>

      <AssetIntelligenceFields lead={lead} scope="property" />

      <section className={`${CARD_CLASS} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Listing Readiness</h2>
            <p className="mt-1 text-sm text-slate-500">Signals required before a sales listing can be created or published.</p>
          </div>
          <Button type="button" className="rounded-[14px] bg-[#102b46] hover:bg-[#143858]" onClick={onCreateListing}>
            {listing.listingCreated ? 'View Listing' : 'Create Listing'}
          </Button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <DetailField label="Property Details Complete" value={readiness.checks.find((check) => check.key === 'property')?.complete ? 'Complete' : 'Incomplete'} />
          <DetailField label="Photos Uploaded" value={listing.photosUploaded ? 'Uploaded' : 'Not uploaded'} />
          <DetailField label="Mandate Signed" value={getSellerMandate(lead).mandateStatus === 'signed' ? 'Signed' : 'Pending'} />
          <DetailField label="Ownership Confirmed" value={property.ownershipVerified ? 'Confirmed' : 'Pending'} />
          <DetailField label="Documents Uploaded" value={listing.documentsUploaded ? 'Uploaded' : 'Pending'} />
        </div>
      </section>
    </div>
  )
}

function SellerMandatePanel({ lead, onGenerateMandate }) {
  const mandate = getSellerMandate(lead)
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Mandate</h2>
          <p className="mt-1 text-sm text-slate-500">Commercial sales mandate authority, expiry and commission basis.</p>
        </div>
        <Button type="button" className="rounded-[14px] bg-[#102b46] hover:bg-[#143858]" onClick={onGenerateMandate}>Generate Mandate</Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <DetailField label="Mandate Status" value={mandate.mandateStatusLabel} />
        <DetailField label="Mandate Type" value={mandate.mandateTypeLabel} />
        <DetailField label="Commission Structure" value={mandate.commissionStructure} />
        <DetailField label="Authority Confirmed" value={mandate.authorityConfirmed ? 'Yes' : 'Pending'} />
        <DetailField label="Mandate Expiry" value={mandate.mandateExpiry} />
        <DetailField label="Mandate Status Options" value={SELLER_MANDATE_STATUSES.join(', ')} />
        <DetailField label="Mandate Type Options" value={SELLER_MANDATE_TYPES.join(', ')} />
      </div>
      <div className="mt-3">
        <DetailField label="Mandate Notes" value={mandate.mandateNotes} />
      </div>
    </section>
  )
}

function SellerListingPanel({ lead, onCreateListing }) {
  const listing = getSellerListing(lead)
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Listing</h2>
          <p className="mt-1 text-sm text-slate-500">Sales listing status, pricing and publication readiness.</p>
        </div>
        <Button type="button" className="rounded-[14px] bg-[#102b46] hover:bg-[#143858]" onClick={onCreateListing}>
          {listing.listingCreated ? 'Edit Listing' : 'Create Listing'}
        </Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DetailField label="Listing Status" value={listing.listingStatusLabel} />
        <DetailField label="Listing Price" value={listing.listingPrice ? `R${listing.listingPrice}` : 'Not captured'} />
        <DetailField label="Listing Created Date" value={listing.listingCreatedDate} />
        <DetailField label="Marketing Status" value={listing.marketingStatus} />
        <DetailField label="Online Status" value={listing.onlineStatus} />
        <DetailField label="Buyer Interest" value={listing.buyerInterest ? `${listing.buyerInterest} enquiries` : 'No buyer interest'} />
        <DetailField label="Offer Received" value={listing.offerReceived ? 'Yes' : 'No offer yet'} />
        <DetailField label="Listing Status Options" value={SELLER_LISTING_STATUSES.join(', ')} />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onCreateListing}>Edit Listing</Button>
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={() => window.alert('Publish listing is ready to connect to the commercial publication workflow.')}>Publish Listing</Button>
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={() => window.alert('Listing preview is ready to connect to the sales listing workspace.')}>Preview Listing</Button>
      </div>
    </section>
  )
}

function SellerAppointmentsPanel({ onScheduleCall, onScheduleMeeting, onScheduleVisit }) {
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Appointments</h2>
      <p className="mt-1 text-sm text-slate-500">Schedule calls, client meetings and site visits.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onScheduleCall}>Schedule Call</Button>
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onScheduleMeeting}>Schedule Meeting</Button>
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onScheduleVisit}>Schedule Site Visit</Button>
      </div>
    </section>
  )
}

function SellerDocumentsPanel({ lead }) {
  const roleSpecific = getLeadRoleSpecific(lead)
  const statusMap = roleSpecific.documentChecklist || roleSpecific.document_checklist || {}
  const documents = buildAssetDocumentChecklist(SELLER_DOCUMENT_CHECKLIST, lead)
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Seller Documents</h2>
      <p className="mt-1 text-sm text-slate-500">Seller-specific checklist for mandate, ownership and listing readiness.</p>
      <div className="mt-4">
        <DetailField label="Document Status Options" value={SELLER_DOCUMENT_STATUSES.join(', ')} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {documents.map((documentName) => {
          const key = normalizeKey(documentName)
          const status = titleCase(statusMap[key] || statusMap[documentName] || 'not_requested')
          return (
            <div key={documentName} className="rounded-[16px] border border-slate-200 bg-[#fbfcfe] p-4">
              <p className="text-sm font-semibold text-[#102236]">{documentName}</p>
              <p className="mt-2 text-xs font-semibold text-slate-500">{status}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function SellerConversionPanel({ lead }) {
  const mandate = getSellerMandate(lead)
  const listing = getSellerListing(lead)
  const readiness = getSellerReadiness(lead)
  const dealCreated = Boolean(firstText(lead.dealId, lead.deal_id, getLeadRoleSpecific(lead).dealId, getLeadRoleSpecific(lead).deal_id))
  const events = [
    { label: 'Prospect Converted', complete: true },
    { label: 'Lead Qualified', complete: ['qualified', 'active', 'negotiation', 'converted'].includes(normalizeLeadStatus(lead.status)) },
    { label: 'Mandate Sent', complete: ['sent', 'signed'].includes(mandate.mandateStatus) },
    { label: 'Mandate Signed', complete: mandate.mandateStatus === 'signed' },
    { label: 'Listing Created', complete: listing.listingCreated },
    { label: 'Buyer Interest Logged', complete: listing.buyerInterest > 0 },
    { label: 'Offer Received', complete: listing.offerReceived },
    { label: 'Deal Created', complete: dealCreated },
  ]
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Conversion History</h2>
      <p className="mt-1 text-sm text-slate-500">Lifecycle events from prospect through sales listing and sale deal.</p>
      <CommercialConversionLineagePanel lead={lead} readinessPercentage={readiness.percentage} />
      <div className="mt-4 grid gap-3">
        {events.map((event) => (
          <div key={event.label} className="flex items-center justify-between gap-3 rounded-[16px] border border-slate-200 bg-[#fbfcfe] px-4 py-3">
            <span className="text-sm font-semibold text-[#102236]">{event.label}</span>
            <DetailBadge tone={event.complete ? 'green' : 'slate'}>{event.complete ? 'Complete' : 'Pending'}</DetailBadge>
          </div>
        ))}
      </div>
    </section>
  )
}

function BuyerOverview({ lead, onSendOnboarding, onCaptureRequirement, onConfirmFunding, onMatchListings, onScheduleViewing, onPrepareOffer, onConvertToDeal }) {
  const nextAction = getBuyerNextBestAction(lead)
  const readiness = getBuyerReadiness(lead)
  const matching = getBuyerMatching(lead)
  const matches = matching.matches.length ? matching.matches : [
    { property: 'Warehouse Midrand', area: 'Midrand', assetClass: getAssetClassLabel(lead), size: 'Size pending', price: 'Price pending', availability: 'Availability pending', matchScore: matching.matchCount ? '82%' : 'Pending' },
    { property: 'Office Park Sandton', area: 'Sandton', assetClass: 'Office', size: 'Size pending', price: 'Price pending', availability: 'Availability pending', matchScore: 'Pending' },
    { property: 'Retail Centre Centurion', area: 'Centurion', assetClass: 'Retail', size: 'Size pending', price: 'Price pending', availability: 'Availability pending', matchScore: 'Pending' },
  ]
  const actionMap = {
    send_onboarding: onSendOnboarding,
    capture_requirement: onCaptureRequirement,
    confirm_funding: onConfirmFunding,
    match_listings: onMatchListings,
    schedule_viewing: onScheduleViewing,
    prepare_offer: onPrepareOffer,
    convert_deal: onConvertToDeal,
  }
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <section className={`${CARD_CLASS} p-5`}>
        <div className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-blue-50 text-blue-700">
          <Target size={18} />
        </div>
        <h2 className="mt-4 text-base font-semibold tracking-[-0.03em] text-[#102236]">Next Best Action</h2>
        <p className="mt-2 text-lg font-semibold text-[#102236]">{nextAction.label}</p>
        <p className="mt-2 text-sm leading-6 text-slate-500">{nextAction.description}</p>
        <Button type="button" className="mt-4 w-full justify-center rounded-[14px] bg-[#102b46] hover:bg-[#143858]" onClick={actionMap[nextAction.action]}>
          {nextAction.label}
        </Button>
      </section>

      <section className={`${CARD_CLASS} p-5`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Buyer Readiness Score</h2>
            <p className="mt-1 text-sm text-slate-500">{readiness.percentage}% Buyer Ready · {readiness.label}</p>
          </div>
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-lg font-semibold text-emerald-700">
            {readiness.percentage}%
          </span>
        </div>
        <div className="mt-4 grid gap-2">
          {readiness.checks.map((check) => (
            <div key={check.key} className="flex items-center justify-between gap-3 rounded-[14px] border border-slate-200 bg-[#fbfcfe] px-3 py-2">
              <span className="text-sm font-medium text-[#102236]">{check.label}</span>
              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${check.complete ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                <CheckCircle2 size={14} />
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className={`${CARD_CLASS} p-5`}>
        <div className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-slate-50 text-slate-700">
          <Building2 size={18} />
        </div>
        <h2 className="mt-4 text-base font-semibold tracking-[-0.03em] text-[#102236]">Match Centre</h2>
        <p className="mt-2 text-lg font-semibold text-[#102236]">{matching.matchCount || 0} Potential Matches</p>
        <div className="mt-4 grid gap-2">
          {matches.slice(0, 3).map((match) => (
            <div key={match.property || match.id} className="rounded-[14px] border border-slate-200 bg-[#fbfcfe] px-3 py-2">
              <p className="text-sm font-semibold text-[#102236]">{match.property || match.propertyName || 'Matched listing'}</p>
              <p className="mt-1 text-xs text-slate-500">{match.area || match.node || 'Area pending'} · {match.assetClass || match.asset_class || 'Asset class pending'}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onMatchListings}>View Matches</Button>
          <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onMatchListings}>Send Matches</Button>
          <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onScheduleViewing} disabled={!matching.matchCount}>Schedule Viewing</Button>
        </div>
      </section>
    </div>
  )
}

function BuyerProfilePanel({ lead }) {
  const profile = getBuyerProfile(lead)
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Buyer Profile</h2>
          <p className="mt-1 text-sm text-slate-500">Acquirer, investor, occupier and decision-maker details.</p>
        </div>
        <DetailBadge tone="green">{profile.relationshipType}</DetailBadge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <DetailField label="Buyer / Company Name" value={profile.companyName} />
        <DetailField label="Trading Name" value={profile.tradingName} />
        <DetailField label="Industry" value={profile.industry} />
        <DetailField label="Contact Person" value={profile.contactPerson} />
        <DetailField label="Relationship Type" value={profile.relationshipType} />
        <DetailField label="Phone" value={profile.phone} />
        <DetailField label="Email" value={profile.email} />
        <DetailField label="Website" value={profile.website} />
        <DetailField label="Broker" value={profile.broker} />
        <DetailField label="Source" value={profile.source} />
        <DetailField label="Relationship Type Options" value={BUYER_RELATIONSHIP_TYPES.join(', ')} />
      </div>
      <div className="mt-3">
        <DetailField label="Notes" value={profile.notes} />
      </div>
    </section>
  )
}

function BuyerRequirementPanel({ lead, onCaptureRequirement }) {
  const requirement = getBuyerRequirement(lead)
  return (
    <div className="grid gap-4">
      <section className={`${CARD_CLASS} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Requirement Details</h2>
            <p className="mt-1 text-sm text-slate-500">The central working object for buyer acquisition leads.</p>
          </div>
          <Button type="button" className="rounded-[14px] bg-[#102b46] hover:bg-[#143858]" onClick={onCaptureRequirement}>Capture Requirement</Button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DetailField label="Asset Class" value={requirement.assetClassLabel} />
          <DetailField label="Area Preferences" value={requirement.preferredAreasLabel} />
          <DetailField label="Minimum Size" value={requirement.minSizeSqm ? `${requirement.minSizeSqm} m²` : 'Not captured'} />
          <DetailField label="Maximum Size" value={requirement.maxSizeSqm ? `${requirement.maxSizeSqm} m²` : 'Not captured'} />
          <DetailField label="Target Size" value={requirement.targetSizeSqm ? `${requirement.targetSizeSqm} m²` : 'Not captured'} />
          <DetailField label="Purchase Budget" value={requirement.purchaseBudget ? `R${requirement.purchaseBudget}` : 'Not captured'} />
          <DetailField label="Maximum Purchase Price" value={requirement.maxPurchasePrice ? `R${requirement.maxPurchasePrice}` : 'Not captured'} />
          <DetailField label="Deposit Available" value={requirement.depositAvailable ? `R${requirement.depositAvailable}` : 'Not captured'} />
          <DetailField label="Funding Type" value={requirement.fundingType} />
          <DetailField label="Occupation Date" value={requirement.occupationDate} />
          <DetailField label="Purchase Timeline" value={requirement.purchaseTimeline} />
          <DetailField label="Area Preference Options" value={BUYER_PREFERRED_AREAS.join(', ')} />
          <DetailField label="Funding Type Options" value={BUYER_FUNDING_TYPES.join(', ')} />
          <DetailField label="Purchase Timeline Options" value={BUYER_PURCHASE_TIMELINES.join(', ')} />
        </div>
        <div className="mt-3">
          <DetailField label="Special Requirements" value={requirement.specialRequirements} />
        </div>
      </section>
      <AssetIntelligenceFields lead={lead} scope="requirement" />
    </div>
  )
}

function BuyerFundingPanel({ lead, onRequestProofOfFunds, onUploadProofOfFunds, onRequestPreApproval, onReferBondOriginator }) {
  const funding = getBuyerFunding(lead)
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Funding</h2>
          <p className="mt-1 text-sm text-slate-500">Funding position, proof and pre-approval status for this buyer.</p>
        </div>
        <DetailBadge tone={funding.fundingConfirmed ? 'green' : 'amber'}>{funding.fundingStatusLabel}</DetailBadge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DetailField label="Funding Status" value={funding.fundingStatusLabel} />
        <DetailField label="Funding Type" value={funding.fundingType} />
        <DetailField label="Budget" value={funding.budget ? `R${funding.budget}` : 'Not captured'} />
        <DetailField label="Deposit Available" value={funding.depositAvailable ? `R${funding.depositAvailable}` : 'Not captured'} />
        <DetailField label="Bank / Financier" value={funding.bankFinancier} />
        <DetailField label="Proof Of Funds" value={funding.proofOfFunds ? 'Received' : 'Not received'} />
        <DetailField label="Pre-Approval Status" value={funding.preApprovalStatusLabel} />
        <DetailField label="Funding Status Options" value={BUYER_FUNDING_STATUSES.join(', ')} />
        <DetailField label="Pre-Approval Status Options" value={BUYER_PRE_APPROVAL_STATUSES.join(', ')} />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onRequestProofOfFunds}>Request Proof Of Funds</Button>
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onUploadProofOfFunds}>Upload Proof Of Funds</Button>
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onRequestPreApproval}>Request Pre-Approval</Button>
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onReferBondOriginator}>Refer To Bond Originator</Button>
      </div>
    </section>
  )
}

function BuyerMatchingPanel({ lead, onMatchListings, onScheduleViewing }) {
  const matching = getBuyerMatching(lead)
  const rows = matching.matches.length ? matching.matches : []
  return (
    <section className={`${CARD_CLASS} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8eef5] p-5">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Matched Listings</h2>
          <p className="mt-1 text-sm text-slate-500">{matching.matchCount || 0} potential matches for this acquisition requirement.</p>
        </div>
        <Button type="button" className="rounded-[14px] bg-[#102b46] hover:bg-[#143858]" onClick={onMatchListings}>Match Listings</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[860px] w-full border-separate border-spacing-0">
          <thead className="bg-[#f7fafc] text-left text-[12px] font-semibold uppercase tracking-[0.12em] text-[#61758b]">
            <tr>{['Property', 'Area', 'Asset Class', 'Size', 'Price', 'Availability', 'Match Score', 'Actions'].map((label) => <th key={label} className="border-b border-[#e7edf4] px-4 py-3">{label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((match, index) => (
              <tr key={match.id || match.property || index} className="border-b border-slate-100">
                <td className="px-4 py-3 text-sm font-semibold text-[#102236]">{match.property || match.propertyName || 'Listing'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{match.area || 'Area pending'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{match.assetClass || match.asset_class || 'Asset class pending'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{match.size || match.sizeSqm || 'Size pending'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{match.price || match.listingPrice || 'Price pending'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{match.availability || 'Availability pending'}</td>
                <td className="px-4 py-3 text-sm font-semibold text-[#102236]">{match.matchScore || match.match_score || 'Pending'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" size="sm" className="rounded-[12px]" onClick={() => window.alert('Listing preview is ready to connect to the sales listing workspace.')}>View Listing</Button>
                    <Button type="button" variant="secondary" size="sm" className="rounded-[12px]" onClick={onScheduleViewing}>Schedule Viewing</Button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">No matched listings yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="p-5 pt-0">
        <AssetMatchingRules lead={lead} />
      </div>
    </section>
  )
}

function BuyerViewingsPanel({ lead, onScheduleViewing }) {
  const viewing = getBuyerViewing(lead)
  const canScheduleViewing = getBuyerMatching(lead).matchCount > 0
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Viewings</h2>
          <p className="mt-1 text-sm text-slate-500">Upcoming, completed and cancelled buyer viewings.</p>
        </div>
        <Button type="button" className="rounded-[14px] bg-[#102b46] hover:bg-[#143858]" onClick={onScheduleViewing} disabled={!canScheduleViewing}>Schedule Viewing</Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <DetailField label="Upcoming Viewings" value={String(viewing.upcoming)} />
        <DetailField label="Completed Viewings" value={String(viewing.completed)} />
        <DetailField label="Cancelled Viewings" value={String(viewing.cancelled)} />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onScheduleViewing} disabled={!canScheduleViewing}>Schedule Viewing</Button>
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={() => window.alert('Buyer viewing feedback is ready to connect to the viewings workflow.')}>Log Feedback</Button>
      </div>
    </section>
  )
}

function BuyerOffersPanel({ lead, onPrepareOffer, onSubmitOffer }) {
  const offers = getBuyerOffers(lead)
  const viewing = getBuyerViewing(lead)
  const funding = getBuyerFunding(lead)
  const canSubmitOffer = viewing.completed > 0 && funding.fundingConfirmed
  const rows = offers.offers.length ? offers.offers : []
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Offers</h2>
          <p className="mt-1 text-sm text-slate-500">Buyer offers, statuses, conditions and deal readiness.</p>
        </div>
        <Button type="button" className="rounded-[14px] bg-[#102b46] hover:bg-[#143858]" onClick={onPrepareOffer}>Prepare Offer</Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <DetailField label="Offers Submitted" value={String(offers.submitted)} />
        <DetailField label="Offers Accepted" value={String(offers.accepted)} />
        <DetailField label="Offers Declined" value={String(offers.declined)} />
        <DetailField label="Offers Withdrawn" value={String(offers.withdrawn)} />
      </div>
      <div className="mt-4 overflow-x-auto rounded-[16px] border border-slate-200">
        <table className="min-w-[760px] w-full border-separate border-spacing-0">
          <thead className="bg-[#f7fafc] text-left text-[12px] font-semibold uppercase tracking-[0.12em] text-[#61758b]">
            <tr>{['Offer Date', 'Property', 'Offer Amount', 'Status', 'Conditions', 'Actions'].map((label) => <th key={label} className="border-b border-[#e7edf4] px-4 py-3">{label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((offer, index) => (
              <tr key={offer.id || `${offer.property}-${index}`}>
                <td className="px-4 py-3 text-sm text-slate-600">{offer.offerDate || offer.offer_date || 'Date pending'}</td>
                <td className="px-4 py-3 text-sm font-semibold text-[#102236]">{offer.property || offer.propertyName || 'Property pending'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{offer.offerAmount || offer.offer_amount || 'Amount pending'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{offer.status || 'Status pending'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{offer.conditions || 'No conditions captured'}</td>
                <td className="px-4 py-3"><Button type="button" variant="secondary" size="sm" className="rounded-[12px]" onClick={() => window.alert('Offer preview is ready to connect to the offer workflow.')}>View Offer</Button></td>
              </tr>
            )) : (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No offers submitted yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onPrepareOffer}>Prepare Offer</Button>
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={onSubmitOffer} disabled={!canSubmitOffer}>Submit Offer</Button>
        <Button type="button" variant="secondary" className="justify-center rounded-[14px]" onClick={() => window.alert('Offer preview is ready to connect to the offer workflow.')}>View Offer</Button>
      </div>
    </section>
  )
}

function BuyerDocumentsPanel({ lead }) {
  const roleSpecific = getLeadRoleSpecific(lead)
  const statusMap = roleSpecific.documentChecklist || roleSpecific.document_checklist || {}
  const documents = buildAssetDocumentChecklist(BUYER_DOCUMENT_CHECKLIST, lead)
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Buyer Documents</h2>
      <p className="mt-1 text-sm text-slate-500">Buyer-specific checklist for funding, authority and offer readiness.</p>
      <div className="mt-4">
        <DetailField label="Document Status Options" value={BUYER_DOCUMENT_STATUSES.join(', ')} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {documents.map((documentName) => {
          const key = normalizeKey(documentName)
          const status = titleCase(statusMap[key] || statusMap[documentName] || 'not_requested')
          return (
            <div key={documentName} className="rounded-[16px] border border-slate-200 bg-[#fbfcfe] p-4">
              <p className="text-sm font-semibold text-[#102236]">{documentName}</p>
              <p className="mt-2 text-xs font-semibold text-slate-500">{status}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function BuyerConversionPanel({ lead }) {
  const requirement = getBuyerRequirement(lead)
  const readiness = getBuyerReadiness(lead)
  const funding = getBuyerFunding(lead)
  const matching = getBuyerMatching(lead)
  const viewing = getBuyerViewing(lead)
  const offers = getBuyerOffers(lead)
  const dealCreated = Boolean(firstText(lead.dealId, lead.deal_id, getLeadRoleSpecific(lead).dealId, getLeadRoleSpecific(lead).deal_id))
  const events = [
    { label: 'Prospect Converted', complete: true },
    { label: 'Lead Qualified', complete: ['qualified', 'active', 'negotiation', 'converted'].includes(normalizeLeadStatus(lead.status)) },
    { label: 'Requirement Captured', complete: requirement.requirementCaptured },
    { label: 'Funding Confirmed', complete: funding.fundingConfirmed },
    { label: 'Listings Matched', complete: matching.matchCount > 0 },
    { label: 'Viewing Scheduled', complete: viewing.upcoming > 0 || viewing.completed > 0 },
    { label: 'Offer Submitted', complete: offers.offerSubmitted },
    { label: 'Deal Created', complete: dealCreated },
  ]
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Conversion History</h2>
      <p className="mt-1 text-sm text-slate-500">Lifecycle events from prospect through buyer requirement, offer and sale deal.</p>
      <CommercialConversionLineagePanel lead={lead} readinessPercentage={readiness.percentage} />
      <div className="mt-4 grid gap-3">
        {events.map((event) => (
          <div key={event.label} className="flex items-center justify-between gap-3 rounded-[16px] border border-slate-200 bg-[#fbfcfe] px-4 py-3">
            <span className="text-sm font-semibold text-[#102236]">{event.label}</span>
            <DetailBadge tone={event.complete ? 'green' : 'slate'}>{event.complete ? 'Complete' : 'Pending'}</DetailBadge>
          </div>
        ))}
      </div>
    </section>
  )
}

function MoreActionsMenu({ open, onToggle, onEdit, onAddNote, onLogCall, onSendOnboarding, onScheduleMeeting, onArchive, archiveDisabled = false, landlordMode = false }) {
  const items = [
    { label: 'Edit Lead', icon: Pencil, onClick: onEdit },
    { label: 'Add Note', icon: MessageSquare, onClick: onAddNote },
    { label: 'Log Call', icon: Phone, onClick: onLogCall },
    landlordMode ? { label: 'Schedule Meeting', icon: CalendarDays, onClick: onScheduleMeeting } : { label: 'Send Onboarding', icon: Send, onClick: onSendOnboarding },
    { label: 'Archive', icon: Archive, onClick: archiveDisabled ? null : onArchive, disabled: archiveDisabled },
  ]
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#dce6f0] bg-white text-[#62758b] shadow-sm transition hover:border-[#bfd2e6] hover:bg-[#f8fbff] hover:text-[#0f2748]"
        aria-label="More lead actions"
      >
        <MoreHorizontal size={17} />
      </button>
      {open ? (
        <div className="absolute right-0 top-12 z-30 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled || !item.onClick}
              onClick={() => item.onClick?.()}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-[#102236] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              <item.icon size={14} />
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function buildTabs(leadType = '', dealType = '') {
  const requirementLabel = ['tenant', 'buyer'].includes(leadType)
    ? 'Requirement'
    : ['landlord', 'seller'].includes(leadType)
      ? 'Property'
      : 'Property / Requirement'
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'profile', label: 'Profile' },
    { key: 'property', label: requirementLabel },
  ]
  if (leadType === 'landlord' && normalizeDealType(dealType) === 'lease') tabs.push({ key: 'mandate', label: 'Mandate / Terms' })
  if (leadType === 'seller' && normalizeDealType(dealType) === 'sale') {
    tabs.push(
      { key: 'mandate', label: 'Mandate' },
      { key: 'listing', label: 'Listing' },
    )
  }
  if (leadType === 'tenant' && normalizeDealType(dealType) === 'lease') {
    tabs.push(
      { key: 'matching', label: 'Matching' },
      { key: 'viewings', label: 'Viewings' },
      { key: 'proposal', label: 'Proposal / HOT' },
    )
  }
  if (leadType === 'buyer' && normalizeDealType(dealType) === 'sale') {
    tabs.push(
      { key: 'funding', label: 'Funding' },
      { key: 'matching', label: 'Matching' },
      { key: 'viewings', label: 'Viewings' },
      { key: 'offers', label: 'Offers' },
    )
  }
  return [
    ...tabs,
    ...(leadType === 'tenant' && normalizeDealType(dealType) === 'lease' ? [] : [{ key: 'appointments', label: 'Appointments' }]),
    { key: 'documents', label: 'Documents' },
    { key: 'activity', label: 'Activity' },
    { key: 'conversion', label: 'Conversion History' },
  ]
}

function CommercialLeadDetailPage({ leadId: leadIdProp = '', dealType: dealTypeProp = 'lease', leadType: leadTypeProp = '' }) {
  const params = useParams()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const leadId = leadIdProp || params.leadId || ''
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [organisationId, setOrganisationId] = useState('')
  const [lead, setLead] = useState(null)
  const [activities, setActivities] = useState([])
  const [menuOpen, setMenuOpen] = useState(false)
  const activeTab = TAB_KEYS.includes(searchParams.get('detailTab')) ? searchParams.get('detailTab') : 'overview'

  const loadLead = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const context = await resolveCommercialOrganisationContext()
      const nextOrganisationId = context.organisationId || ''
      const [workspace, lookupData] = await Promise.all([
        nextOrganisationId ? listCommercialCanvassingWorkspace(nextOrganisationId) : Promise.resolve({ prospects: [], activities: [] }),
        nextOrganisationId ? getCommercialLookupData(nextOrganisationId) : Promise.resolve({}),
      ])
      const row = (workspace.prospects || []).find((item) => normalizeText(item.id) === normalizeText(leadId))
      const leadActivities = (workspace.activities || [])
        .filter((activity) => normalizeText(activity.prospectId || activity.prospect_id) === normalizeText(leadId))
        .sort((left, right) => new Date(right.createdAt || right.created_at || right.activityDate || right.activity_date || '').getTime() - new Date(left.createdAt || left.created_at || left.activityDate || left.activity_date || '').getTime())
      const broker = (lookupData.brokers || []).find((item) => normalizeText(item.id || item.value) === normalizeText(row?.assignedBrokerId || row?.assigned_broker_id))
      setOrganisationId(nextOrganisationId)
      setActivities(leadActivities)
      setLead(row ? normaliseCommercialProspect(row, { assignedBrokerName: row.assignedBrokerName || broker?.name || broker?.label || '', lastActivity: leadActivities[0] || null }) : null)
      if (!row) setError('Commercial lead could not be found.')
    } catch (loadError) {
      setError(String(loadError?.message || loadError || 'Commercial lead could not be loaded.'))
      setLead(null)
    } finally {
      setLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    void loadLead()
  }, [loadLead])

  const inferredLeadType = normalizeLeadType(lead || {}, leadTypeProp)
  const inferredDealType = normalizeDealType(lead?.dealType || dealTypeProp || getDealTypeFromRole(inferredLeadType))
  const isLeasingLandlord = inferredDealType === 'lease' && inferredLeadType === 'landlord'
  const isLeasingTenant = inferredDealType === 'lease' && inferredLeadType === 'tenant'
  const isSalesSeller = inferredDealType === 'sale' && inferredLeadType === 'seller'
  const isSalesBuyer = inferredDealType === 'sale' && inferredLeadType === 'buyer'
  const isSpecializedWorkspace = isLeasingLandlord || isLeasingTenant || isSalesSeller || isSalesBuyer
  const backPath = getBackPath(inferredDealType, location.search)
  const tabs = useMemo(() => buildTabs(inferredLeadType, inferredDealType), [inferredDealType, inferredLeadType])
  const summaryCards = useMemo(() => {
    if (isLeasingLandlord) return buildLandlordSummaryCards(lead || {}, activities)
    if (isLeasingTenant) return buildTenantSummaryCards(lead || {}, activities)
    if (isSalesSeller) return buildSellerSummaryCards(lead || {}, activities)
    if (isSalesBuyer) return buildBuyerSummaryCards(lead || {}, activities)
    return buildSummaryCards(lead || {}, activities)
  }, [activities, isLeasingLandlord, isLeasingTenant, isSalesBuyer, isSalesSeller, lead])
  const journey = useMemo(() => {
    if (isLeasingLandlord) return buildLandlordJourney(lead || {}, activities)
    if (isLeasingTenant) return buildTenantJourney(lead || {})
    if (isSalesSeller) return buildSellerJourney(lead || {})
    if (isSalesBuyer) return buildBuyerJourney(lead || {})
    return buildJourney(lead || {})
  }, [activities, isLeasingLandlord, isLeasingTenant, isSalesBuyer, isSalesSeller, lead])
  const landlordOnboarded = isLeasingLandlord && getLandlordJourneyStage(lead || {}, activities) === 'LANDLORD_ONBOARDED'
  const leadName = getLeadName(lead || {})
  const assetClass = getAssetClass(lead || {})
  const statusLabel = titleCase(normalizeLeadStatus(lead?.status))

  function setActiveTab(nextTab) {
    const next = new URLSearchParams(searchParams)
    if (nextTab === 'overview') next.delete('detailTab')
    else next.set('detailTab', nextTab)
    setSearchParams(next, { replace: true })
  }

  async function createActivity(type, promptLabel) {
    if (!lead?.id || !organisationId) return
    const note = window.prompt(promptLabel)
    if (!normalizeText(note)) return
    await createCommercialCanvassingActivity(organisationId, {
      prospectId: lead.id,
      activityType: type,
      activityNote: note,
    })
    setMenuOpen(false)
    await loadLead()
  }

  function handleSendOnboarding() {
    setMenuOpen(false)
    if (isSalesSeller) {
      window.alert('Send seller onboarding is ready for the commercial seller onboarding workflow.')
      return
    }
    if (isSalesBuyer) {
      window.alert('Send buyer onboarding is ready for the commercial buyer onboarding workflow.')
      return
    }
    window.alert('Send onboarding is ready for the commercial onboarding workflow.')
  }

  function handleEdit() {
    setMenuOpen(false)
    window.alert('Edit lead will reuse the commercial lead form in the next phase.')
  }

  function handleScheduleMeeting() {
    setMenuOpen(false)
    window.alert('Meeting scheduling is ready to connect to the commercial calendar workflow.')
  }

  function handleCreateVacancy() {
    if (!lead) return
    const draft = { ...buildLandlordVacancyPrefill(lead), ...buildCommercialLeadConversionDraft(lead, 'vacancy') }
    setMenuOpen(false)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('commercial-create-vacancy-draft', { detail: draft }))
    }
    window.alert('Vacancy draft prepared from this landlord lead with preserved source lineage.')
  }

  function handleGenerateMandate() {
    setMenuOpen(false)
    window.alert('Commercial sales mandate generation is ready to connect to the mandate workflow.')
  }

  function handleCreateListing() {
    if (!lead) return
    const draft = { ...buildSellerListingPrefill(lead), ...buildCommercialLeadConversionDraft(lead, 'listing') }
    setMenuOpen(false)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('commercial-create-sales-listing-draft', { detail: draft }))
    }
    window.alert('Sales listing draft prepared from this seller lead with preserved source lineage.')
  }

  function handleRequestPhotos() {
    setMenuOpen(false)
    window.alert('Property photo request is ready to connect to the commercial document workflow.')
  }

  function handleRequestDocuments() {
    setMenuOpen(false)
    window.alert('Supporting document request is ready to connect to the commercial document workflow.')
  }

  function handleMatchTenant() {
    window.alert('Tenant matching will be enabled once a vacancy exists.')
  }

  function handleConvertToDeal() {
    if (!lead) return
    const draft = buildCommercialLeadConversionDraft(lead, 'deal')
    setMenuOpen(false)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('commercial-create-deal-draft', { detail: draft }))
    }
    if (isSalesSeller) {
      window.alert('Sale deal draft prepared from this seller lead. The engine will require a listing, seller and buyer relationship before activation.')
      return
    }
    if (isSalesBuyer) {
      window.alert('Sale deal draft prepared from this buyer lead. The engine will require a buyer requirement and matched listing before activation.')
      return
    }
    window.alert('Lease deal draft prepared from this lead. The engine will require tenant, landlord, requirement and vacancy relationships before activation.')
  }

  function handleCaptureRequirement() {
    if (!lead) return
    const draft = buildCommercialLeadConversionDraft(lead, isSalesBuyer ? 'buyer_requirement' : 'tenant_requirement')
    setMenuOpen(false)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('commercial-create-requirement-draft', { detail: draft }))
    }
    if (isSalesBuyer) {
      window.alert('Buyer requirement draft prepared from this buyer lead with preserved source lineage.')
      return
    }
    window.alert('Tenant requirement draft prepared from this tenant lead with preserved source lineage.')
  }

  function handleMatchVacancies() {
    setMenuOpen(false)
    window.alert('Vacancy matching is ready to connect to the Phase 7 matching engine.')
  }

  function handleMatchListings() {
    setMenuOpen(false)
    window.alert('Listing matching is ready to connect to the commercial acquisition matching engine.')
  }

  function handleConfirmFunding() {
    setMenuOpen(false)
    window.alert('Funding confirmation is ready to connect to the buyer funding workflow.')
  }

  function handleRequestProofOfFunds() {
    setMenuOpen(false)
    window.alert('Proof of funds request is ready to connect to the commercial document workflow.')
  }

  function handleUploadProofOfFunds() {
    setMenuOpen(false)
    window.alert('Proof of funds upload is ready to connect to the commercial document workflow.')
  }

  function handleRequestPreApproval() {
    setMenuOpen(false)
    window.alert('Pre-approval request is ready to connect to the commercial funding workflow.')
  }

  function handleReferBondOriginator() {
    setMenuOpen(false)
    window.alert('Bond originator referral is ready to connect to the finance partner workflow.')
  }

  function handleScheduleViewing() {
    setMenuOpen(false)
    window.alert(isSalesBuyer ? 'Buyer viewing scheduling is ready to connect to the commercial viewings workflow.' : 'Viewing scheduling is ready to connect to the commercial viewings workflow.')
  }

  function handlePrepareProposal() {
    setMenuOpen(false)
    window.alert('Proposal generation/upload is ready to connect to the proposal workflow.')
  }

  function handlePrepareHot() {
    if (!lead) return
    const draft = buildCommercialLeadConversionDraft(lead, 'hot')
    setMenuOpen(false)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('commercial-create-hot-draft', { detail: draft }))
    }
    window.alert('Heads of Terms draft prepared from this tenant lead and linked back to the source lead.')
  }

  function handlePrepareOffer() {
    if (!lead) return
    const draft = buildCommercialLeadConversionDraft(lead, 'offer')
    setMenuOpen(false)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('commercial-create-offer-draft', { detail: draft }))
    }
    window.alert('Offer draft prepared from this sales lead and linked back to the source lead.')
  }

  function handleSubmitOffer() {
    if (!lead) return
    const draft = buildCommercialLeadConversionDraft(lead, 'offer')
    setMenuOpen(false)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('commercial-submit-offer-draft', { detail: draft }))
    }
    window.alert('Offer submission draft prepared from this buyer lead and linked back to the source lead.')
  }

  async function handleArchive() {
    if (!lead?.id || !organisationId) return
    if (!window.confirm('Archive this lead?')) return
    await updateCommercialCanvassingProspect(organisationId, lead.id, {
      status: 'Archived',
      archivedAt: new Date().toISOString(),
    })
    setMenuOpen(false)
    await loadLead()
  }

  function renderTabPanel() {
    if (isLeasingLandlord) {
      if (activeTab === 'overview') {
        return (
          <LandlordOverview
            lead={lead}
            onSendOnboarding={handleSendOnboarding}
          />
        )
      }
      if (activeTab === 'profile') return <LandlordProfilePanel lead={lead} />
      if (activeTab === 'property') return <LandlordPropertyPanel lead={lead} onCreateVacancy={handleCreateVacancy} />
      if (activeTab === 'mandate') return <LandlordMandatePanel lead={lead} />
      if (activeTab === 'appointments') {
        return (
          <LandlordAppointmentsPanel
            onScheduleCall={() => createActivity('Meeting', 'Schedule call notes')}
            onScheduleMeeting={handleScheduleMeeting}
            onScheduleVisit={() => window.alert('Property visit scheduling is ready to connect to the commercial calendar workflow.')}
          />
        )
      }
      if (activeTab === 'documents') return <LandlordDocumentsPanel lead={lead} />
      if (activeTab === 'activity') return <CommercialLeadActivityFeed activities={activities} />
      return <LandlordConversionPanel lead={lead} />
    }

    if (isLeasingTenant) {
      if (activeTab === 'overview') {
        return (
          <div className="grid gap-4">
            <TenantOverview
              lead={lead}
              onSendOnboarding={handleSendOnboarding}
              onCaptureRequirement={handleCaptureRequirement}
              onMatchVacancies={handleMatchVacancies}
              onScheduleViewing={handleScheduleViewing}
              onPrepareProposal={handlePrepareProposal}
              onPrepareHot={handlePrepareHot}
              onConvertToDeal={handleConvertToDeal}
            />
            <AssetIntelligenceCards lead={lead} scope="requirement" />
          </div>
        )
      }
      if (activeTab === 'profile') return <TenantProfilePanel lead={lead} />
      if (activeTab === 'property') return <TenantRequirementPanel lead={lead} onCaptureRequirement={handleCaptureRequirement} />
      if (activeTab === 'matching') return <TenantMatchingPanel lead={lead} onMatchVacancies={handleMatchVacancies} onScheduleViewing={handleScheduleViewing} />
      if (activeTab === 'viewings') return <TenantViewingsPanel lead={lead} onScheduleViewing={handleScheduleViewing} />
      if (activeTab === 'proposal') return <TenantProposalHotPanel lead={lead} onPrepareProposal={handlePrepareProposal} onPrepareHot={handlePrepareHot} />
      if (activeTab === 'documents') return <TenantDocumentsPanel lead={lead} />
      if (activeTab === 'activity') return <CommercialLeadActivityFeed activities={activities} />
      return <TenantConversionPanel lead={lead} />
    }

    if (isSalesSeller) {
      if (activeTab === 'overview') {
        return (
          <div className="grid gap-4">
            <SellerOverview
              lead={lead}
              onSendOnboarding={handleSendOnboarding}
              onGenerateMandate={handleGenerateMandate}
              onCreateListing={handleCreateListing}
              onRequestPhotos={handleRequestPhotos}
              onRequestDocuments={handleRequestDocuments}
              onConvertToDeal={handleConvertToDeal}
            />
            <AssetIntelligenceCards lead={lead} scope="property" />
          </div>
        )
      }
      if (activeTab === 'profile') return <SellerProfilePanel lead={lead} />
      if (activeTab === 'property') return <SellerPropertyPanel lead={lead} onCreateListing={handleCreateListing} />
      if (activeTab === 'mandate') return <SellerMandatePanel lead={lead} onGenerateMandate={handleGenerateMandate} />
      if (activeTab === 'listing') return <SellerListingPanel lead={lead} onCreateListing={handleCreateListing} />
      if (activeTab === 'appointments') {
        return (
          <SellerAppointmentsPanel
            onScheduleCall={() => createActivity('Meeting', 'Schedule call notes')}
            onScheduleMeeting={handleScheduleMeeting}
            onScheduleVisit={() => window.alert('Site visit scheduling is ready to connect to the commercial calendar workflow.')}
          />
        )
      }
      if (activeTab === 'documents') return <SellerDocumentsPanel lead={lead} />
      if (activeTab === 'activity') return <CommercialLeadActivityFeed activities={activities} />
      return <SellerConversionPanel lead={lead} />
    }

    if (isSalesBuyer) {
      if (activeTab === 'overview') {
        return (
          <div className="grid gap-4">
            <BuyerOverview
              lead={lead}
              onSendOnboarding={handleSendOnboarding}
              onCaptureRequirement={handleCaptureRequirement}
              onConfirmFunding={handleConfirmFunding}
              onMatchListings={handleMatchListings}
              onScheduleViewing={handleScheduleViewing}
              onPrepareOffer={handlePrepareOffer}
              onConvertToDeal={handleConvertToDeal}
            />
            <AssetIntelligenceCards lead={lead} scope="requirement" />
          </div>
        )
      }
      if (activeTab === 'profile') return <BuyerProfilePanel lead={lead} />
      if (activeTab === 'property') return <BuyerRequirementPanel lead={lead} onCaptureRequirement={handleCaptureRequirement} />
      if (activeTab === 'funding') {
        return (
          <BuyerFundingPanel
            lead={lead}
            onRequestProofOfFunds={handleRequestProofOfFunds}
            onUploadProofOfFunds={handleUploadProofOfFunds}
            onRequestPreApproval={handleRequestPreApproval}
            onReferBondOriginator={handleReferBondOriginator}
          />
        )
      }
      if (activeTab === 'matching') return <BuyerMatchingPanel lead={lead} onMatchListings={handleMatchListings} onScheduleViewing={handleScheduleViewing} />
      if (activeTab === 'viewings') return <BuyerViewingsPanel lead={lead} onScheduleViewing={handleScheduleViewing} />
      if (activeTab === 'offers') return <BuyerOffersPanel lead={lead} onPrepareOffer={handlePrepareOffer} onSubmitOffer={handleSubmitOffer} />
      if (activeTab === 'appointments') {
        return (
          <SellerAppointmentsPanel
            onScheduleCall={() => createActivity('Meeting', 'Schedule call notes')}
            onScheduleMeeting={handleScheduleMeeting}
            onScheduleVisit={handleScheduleViewing}
          />
        )
      }
      if (activeTab === 'documents') return <BuyerDocumentsPanel lead={lead} />
      if (activeTab === 'activity') return <CommercialLeadActivityFeed activities={activities} />
      return <BuyerConversionPanel lead={lead} />
    }

    if (activeTab === 'overview') {
      return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <section className={`${CARD_CLASS} p-5`}>
            <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">Lead Snapshot</h2>
            <div className="mt-4">
              <SnapshotRow label="Company / Name" value={leadName} />
              <SnapshotRow label="Contact Person" value={getContactName(lead || {})} />
              <SnapshotRow label="Phone" value={getPhone(lead || {})} />
              <SnapshotRow label="Email" value={getEmail(lead || {})} />
              <SnapshotRow label="Area" value={getArea(lead || {})} />
              <SnapshotRow label="Asset Class" value={getAssetClassLabel(lead || {})} />
              <SnapshotRow label="Broker" value={getBroker(lead || {})} />
              <SnapshotRow label="Source" value={getSource(lead || {})} />
            </div>
          </section>
          <ActionCentre
            onAddNote={() => createActivity('Note', 'Add a note for this lead')}
            onLogCall={() => createActivity('Call', 'Call outcome / note')}
            onSendOnboarding={handleSendOnboarding}
            onEdit={handleEdit}
          />
        </div>
      )
    }
    if (activeTab === 'activity') return <CommercialLeadActivityFeed activities={activities} />
    if (activeTab === 'profile') return <PlaceholderPanel title="Profile" description="Contact, company, decision maker and relationship details will be expanded here in the next commercial lead detail phase." />
    if (activeTab === 'property') return <PlaceholderPanel title={tabs.find((tab) => tab.key === 'property')?.label || 'Property / Requirement'} description="Property or requirement detail cards will be configured by landlord, tenant, seller and buyer lead type in a later phase." />
    if (activeTab === 'appointments') return <PlaceholderPanel title="Appointments" description="Viewings, meetings and follow-up appointments will appear here once the commercial calendar workflow is connected." />
    if (activeTab === 'documents') return <PlaceholderPanel title="Documents" description="Document requests, uploads and onboarding packs will appear here once the document workflow is connected." />
    return <PlaceholderPanel title="Conversion History" description="Vacancy, requirement, listing and deal conversion history will appear here once conversion workflows are connected." />
  }

  if (loading) {
    return (
      <div className="space-y-4 pb-10">
        <div className="h-36 animate-pulse rounded-[18px] bg-slate-100" />
        <div className="grid gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-[18px] bg-slate-100" />)}
        </div>
      </div>
    )
  }

  if (error || !lead) {
    return (
      <div className={`${CARD_CLASS} p-6`}>
        <Link to={backPath} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0d5ed0]">
          <ArrowLeft size={15} />
          Back to leads
        </Link>
        <div className="mt-8 rounded-[18px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <h1 className="text-xl font-semibold text-[#102236]">Commercial lead unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">{error || 'Commercial lead could not be found.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-10">
      <Link to={backPath} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0d5ed0]">
        <ArrowLeft size={15} />
        Back to leads
      </Link>

      <header className={`${CARD_CLASS} p-5`}>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#eef5ff] text-base font-semibold text-[#1f6dd5]">
              {buildInitials(leadName)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <DetailBadge tone={getProspectBadgeVariant(inferredLeadType)}>{getRoleLabel(inferredLeadType)}</DetailBadge>
                <DetailBadge tone={inferredDealType === 'lease' ? 'blue' : 'green'}>{getDealTypeLabel(inferredDealType)}</DetailBadge>
                <DetailBadge tone={assetClass ? getCategoryBadgeVariant(assetClass) : 'slate'}>{getAssetClassLabel(lead)}</DetailBadge>
                <CommercialStatusPill value={lead.status} label={statusLabel} />
              </div>
              <h1 className="mt-3 text-[1.6rem] font-semibold leading-tight tracking-[-0.035em] text-[#102236]">{leadName}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                <span className="inline-flex items-center gap-1.5"><UserRound size={14} />{getContactName(lead)}</span>
                <span className="inline-flex items-center gap-1.5"><Phone size={14} />{getPhone(lead)}</span>
                <span className="inline-flex items-center gap-1.5"><Mail size={14} />{getEmail(lead)}</span>
                <span className="inline-flex items-center gap-1.5"><Building2 size={14} />{getArea(lead)}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isLeasingLandlord ? (
              <>
                <Button type="button" className="h-11 rounded-[14px] bg-[#102b46] px-4 hover:bg-[#143858]" onClick={handleSendOnboarding}>
                  <Send size={15} />
                  Send Onboarding
                </Button>
                <Button type="button" variant="secondary" className="h-11 rounded-[14px] px-4" onClick={handleCreateVacancy}>
                  <Building2 size={15} />
                  Create Vacancy
                </Button>
              </>
            ) : isLeasingTenant ? (
              <>
                <Button type="button" className="h-11 rounded-[14px] bg-[#102b46] px-4 hover:bg-[#143858]" onClick={handleSendOnboarding}>
                  <Send size={15} />
                  Send Onboarding
                </Button>
                <Button type="button" variant="secondary" className="h-11 rounded-[14px] px-4" onClick={handleCaptureRequirement}>
                  <ClipboardList size={15} />
                  Capture Requirement
                </Button>
                <Button type="button" variant="secondary" className="h-11 rounded-[14px] px-4" onClick={handleMatchVacancies}>
                  <Target size={15} />
                  Match Vacancies
                </Button>
              </>
            ) : isSalesSeller ? (
              <>
                <Button type="button" className="h-11 rounded-[14px] bg-[#102b46] px-4 hover:bg-[#143858]" onClick={handleSendOnboarding}>
                  <Send size={15} />
                  Send Seller Onboarding
                </Button>
                <Button type="button" variant="secondary" className="h-11 rounded-[14px] px-4" onClick={handleGenerateMandate}>
                  <FileText size={15} />
                  Generate Mandate
                </Button>
                <Button type="button" variant="secondary" className="h-11 rounded-[14px] px-4" onClick={handleCreateListing}>
                  <Building2 size={15} />
                  Create Listing
                </Button>
              </>
            ) : isSalesBuyer ? (
              <>
                <Button type="button" className="h-11 rounded-[14px] bg-[#102b46] px-4 hover:bg-[#143858]" onClick={handleSendOnboarding}>
                  <Send size={15} />
                  Send Buyer Onboarding
                </Button>
                <Button type="button" variant="secondary" className="h-11 rounded-[14px] px-4" onClick={handleCaptureRequirement}>
                  <ClipboardList size={15} />
                  Capture Requirement
                </Button>
                <Button type="button" variant="secondary" className="h-11 rounded-[14px] px-4" onClick={handleMatchListings}>
                  <Target size={15} />
                  Match Listings
                </Button>
              </>
            ) : (
              <Button type="button" className="h-11 rounded-[14px] bg-[#102b46] px-4 hover:bg-[#143858]" onClick={() => createActivity('Note', 'Add a note for this lead')}>
                <MessageSquare size={15} />
                Add Note
              </Button>
            )}
            <MoreActionsMenu
              open={menuOpen}
              onToggle={() => setMenuOpen((current) => !current)}
              onEdit={handleEdit}
              onAddNote={() => createActivity('Note', 'Add a note for this lead')}
              onLogCall={() => createActivity('Call', 'Call outcome / note')}
              onSendOnboarding={handleSendOnboarding}
              onScheduleMeeting={handleScheduleMeeting}
              onArchive={handleArchive}
              landlordMode={isSpecializedWorkspace}
            />
          </div>
        </div>
      </header>

      <section className={`grid gap-3 md:grid-cols-2 ${isSpecializedWorkspace ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
        {summaryCards.map((card) => <SummaryCard key={card.key} card={card} />)}
      </section>

      <CommercialLeadJourney
        items={journey}
        title={isLeasingLandlord ? 'Landlord Journey' : 'Lead Journey'}
        subtitle={isLeasingLandlord ? 'Progress from lead to active landlord client.' : 'Qualification and conversion path for this commercial lead.'}
        completionBanner={landlordOnboarded ? {
          title: 'Landlord Successfully Onboarded',
          description: 'This landlord is now an active client. Properties, vacancies and leasing activity are managed separately.',
        } : null}
      />

      <section className={`${CARD_CLASS} overflow-hidden`}>
        <div className="border-b border-[#e8eef5] px-4">
          <div className="flex gap-5 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`relative -mb-px inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-1 text-sm font-semibold transition ${
                  activeTab === tab.key
                    ? 'border-[#1f6dd5] text-[#0d5ed0]'
                    : 'border-transparent text-[#405671] hover:text-[#102236]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="p-4">
          {renderTabPanel()}
        </div>
      </section>
    </div>
  )
}

export default CommercialLeadDetailPage
