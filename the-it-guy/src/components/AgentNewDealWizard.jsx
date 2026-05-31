import { CheckCircle2, CircleAlert, ExternalLink } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createTransactionFromWizard, fetchDevelopmentOptions, fetchUnitsForTransactionSetup } from '../lib/api'
import { readAgentPrivateListings, writeAgentPrivateListings } from '../lib/agentListingStorage'
import { fetchOrganisationSettings, listOrganisationPreferredPartners, resolveCommissionSnapshotForAgent } from '../lib/settingsApi'
import {
  filterPreferredPartners,
  getDefaultPreferredPartnerByType,
} from '../lib/preferredPartners'
import { useWorkspace } from '../context/WorkspaceContext'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { getAgentPrivateListings } from '../services/privateListingService'
import Button from './ui/Button'
import Modal from './ui/Modal'

const PIPELINE_STORAGE_KEY = 'itg:pipeline-leads:v1'

const STEP_ORDER = ['property', 'client', 'terms', 'attorney', 'review']
const PARTNER_MODE_NONE = 'none'
const PARTNER_MODE_AGENCY = 'agency'
const PARTNER_MODE_BUYER = 'buyer'
const PROPERTY_MODE_PRIVATE = 'private'
const PROPERTY_MODE_DEVELOPMENT = 'development'
const PROPERTY_MODE_IMPORT = 'import'
const BOND_FINANCE_TYPES = new Set(['bond', 'combination', 'hybrid'])
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
  'activity_log',
]
const PARTNER_ROLE_FIELD_OPTIONS = [
  { value: PARTNER_MODE_AGENCY, label: 'Use Agency Preferred Partner' },
  { value: PARTNER_MODE_BUYER, label: 'Use Buyer Appointed Partner' },
]
const OPTIONAL_PARTNER_ROLE_FIELD_OPTIONS = [
  { value: PARTNER_MODE_NONE, label: 'Not Assigned Yet' },
  ...PARTNER_ROLE_FIELD_OPTIONS,
]

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

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
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

function isDealEligibleListing(listing) {
  if (!listing || hasActiveDeal(listing)) return false
  const status = getListingStatus(listing)
  const visibility = normalizeKey(listing?.listingVisibility || listing?.listing_visibility)
  if (visibility === 'archived') return false
  if (['withdrawn', 'deleted', 'archived', 'sold', 'cancelled', 'transaction_created'].includes(status)) return false
  if (!status) return true
  return [
    'active',
    'active_market',
    'under_offer',
    'in_progress',
    'mandate_signed',
    'listing_active',
    'live',
  ].includes(status)
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
  const facts = listing?.sellerCanonicalFacts || listing?.sellerOnboarding?.canonicalFacts || listing?.sellerOnboarding?.formData || {}
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

function getListingMandateReady(listing) {
  const mandateStatus = normalizeKey(listing?.mandateStatus || listing?.mandate_status)
  const docs = [
    ...(Array.isArray(listing?.requiredDocuments) ? listing.requiredDocuments : []),
    ...(Array.isArray(listing?.documentRequirements) ? listing.documentRequirements : []),
    ...(Array.isArray(listing?.documents) ? listing.documents : []),
  ]
  const mandateDoc = docs.find((doc) => ['mandate_to_sell', 'signed_mandate', 'mandate'].includes(normalizeKey(doc?.key || doc?.documentType || doc?.document_type || doc?.name)))
  const docStatus = normalizeKey(mandateDoc?.status || mandateDoc?.documentStatus || mandateDoc?.document_status)
  return ['signed', 'approved', 'verified', 'completed'].includes(mandateStatus) ||
    ['approved', 'verified', 'completed', 'signed'].includes(docStatus)
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

function formatListingDealOption(listing) {
  const title = getListingTitle(listing)
  const address = getListingAddress(listing)
  const seller = getListingSeller(listing).name || 'Seller pending'
  const primary = title && address && title !== address ? `${title}, ${address}` : title || address || 'Active listing'
  return `${primary} — ${seller}`
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

function requiresBondRolePlayers(financeType) {
  return BOND_FINANCE_TYPES.has(normalizeKey(financeType))
}

function getCreationOrigin(propertyMode) {
  if (propertyMode === PROPERTY_MODE_DEVELOPMENT) return 'development_unit'
  if (propertyMode === PROPERTY_MODE_IMPORT) return 'imported_existing_deal'
  return 'active_listing'
}

function getOriginLabel(propertyMode) {
  if (propertyMode === PROPERTY_MODE_DEVELOPMENT) return 'Created via development unit'
  if (propertyMode === PROPERTY_MODE_IMPORT) return 'Imported existing deal'
  return 'Created via active listing'
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

function buildCompletenessSnapshot({ form, listing = null, propertyMode = PROPERTY_MODE_PRIVATE }) {
  const checks = [
    {
      label: 'Signed mandate',
      complete: propertyMode !== PROPERTY_MODE_PRIVATE ||
        Boolean(form.importMandateUploaded) ||
        getListingMandateReady(listing),
    },
    {
      label: 'Seller FICA',
      complete: propertyMode !== PROPERTY_MODE_PRIVATE ||
        getSellerFicaReady(listing) ||
        propertyMode === PROPERTY_MODE_IMPORT,
    },
    {
      label: 'Buyer ID',
      complete: false,
    },
    {
      label: 'OTP upload',
      complete: Boolean(form.importOtpUploaded),
    },
    {
      label: 'Finance type',
      complete: Boolean(normalizeFinanceTypeForApi(form.financeType)),
    },
    {
      label: 'Transfer attorney',
      complete: form.transferPartnerMode === PARTNER_MODE_AGENCY
        ? Boolean(form.transferPreferredPartnerId)
        : Boolean(normalizeText(form.transferBuyerCompanyName) && normalizeText(form.transferBuyerEmail)),
    },
    {
      label: 'Seller contact details',
      complete: propertyMode === PROPERTY_MODE_IMPORT
        ? Boolean(normalizeText(form.importSellerEmail) && normalizeText(form.importSellerPhone))
        : Boolean(getListingSeller(listing).email && getListingSeller(listing).phone),
    },
  ]
  const total = checks.length
  const complete = checks.filter((item) => item.complete).length
  return {
    score: total ? Math.round((complete / total) * 100) : 0,
    missingItems: checks.filter((item) => !item.complete).map((item) => item.label),
    completedItems: checks.filter((item) => item.complete).map((item) => item.label),
  }
}

function AgentNewDealWizard({ open, onClose, initialDevelopmentId = '', onSaved }) {
  const navigate = useNavigate()
  const { profile, agencyWorkflowMode, currentMembership, workspace } = useWorkspace()
  const [activeStep, setActiveStep] = useState('property')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [errors, setErrors] = useState({})
  const [createdDeal, setCreatedDeal] = useState(null)
  const [commissionPreview, setCommissionPreview] = useState(null)
  const [privateListings, setPrivateListings] = useState([])
  const [pipelineRows, setPipelineRows] = useState([])
  const [developments, setDevelopments] = useState([])
  const [developmentUnits, setDevelopmentUnits] = useState([])
  const [preferredPartners, setPreferredPartners] = useState([])
  const [partnerSearch, setPartnerSearch] = useState({
    transferAttorney: '',
    bondOriginator: '',
    bondAttorney: '',
  })
  const [form, setForm] = useState({
    propertyMode: PROPERTY_MODE_PRIVATE,
    privateListingId: '',
    developmentId: initialDevelopmentId || '',
    unitId: '',
    financeType: 'unknown',
    importPropertyAddress: '',
    importSuburb: '',
    importCity: '',
    importProvince: '',
    importSellerName: '',
    importSellerEmail: '',
    importSellerPhone: '',
    importCurrentStage: 'Offer Accepted',
    importMandateUploaded: false,
    importOtpUploaded: false,
    importCommissionStructure: '',
    importProperty24Link: '',
    importNotes: '',
    pipelineLeadId: '',
    clientName: '',
    clientSurname: '',
    clientEmail: '',
    clientPhone: '',
    saleDate: todayIso(),
    salesPrice: '',
    grossCommissionPercentage: '5',
    reservationRequired: false,
    reservationAmount: '',
    transferPartnerMode: PARTNER_MODE_AGENCY,
    transferPreferredPartnerId: '',
    transferBuyerCompanyName: '',
    transferBuyerContactPerson: '',
    transferBuyerEmail: '',
    transferBuyerPhone: '',
    transferBuyerNotes: '',
    bondOriginatorMode: PARTNER_MODE_NONE,
    bondOriginatorPreferredPartnerId: '',
    bondOriginatorBuyerCompanyName: '',
    bondOriginatorBuyerContactPerson: '',
    bondOriginatorBuyerEmail: '',
    bondOriginatorBuyerPhone: '',
    bondOriginatorBuyerNotes: '',
    bondAttorneyMode: PARTNER_MODE_NONE,
    bondAttorneyPreferredPartnerId: '',
    bondAttorneyBuyerCompanyName: '',
    bondAttorneyBuyerContactPerson: '',
    bondAttorneyBuyerEmail: '',
    bondAttorneyBuyerPhone: '',
    bondAttorneyBuyerNotes: '',
  })

  useEffect(() => {
    if (!open) return
    setActiveStep('property')
    setSaving(false)
    setSaveError('')
    setErrors({})
    setCreatedDeal(null)
    setCommissionPreview(null)
    setLoading(true)
    setPreferredPartners([])
    setPartnerSearch({ transferAttorney: '', bondOriginator: '', bondAttorney: '' })
    const localListings = mergeListings(readAgentPrivateListings())
    setPrivateListings(localListings)
    setPipelineRows(readPipelineRows())

    ;(async () => {
      try {
        const settingsPromise = isSupabaseConfigured
          ? fetchOrganisationSettings().catch(() => null)
          : Promise.resolve(null)
        const [settingsContext, partnerRows, developmentRows] = await Promise.all([
          settingsPromise,
          listOrganisationPreferredPartners(),
          isSupabaseConfigured ? fetchDevelopmentOptions() : Promise.resolve([]),
        ])
        const organisationId = normalizeText(settingsContext?.organisation?.id || workspace?.id)
        const membershipRole = normalizeKey(settingsContext?.membershipRole || currentMembership?.workspaceRole || currentMembership?.role)
        const hasOrganisationScope = Boolean(organisationId && organisationId !== 'all')
        const includeAllOrganisationListings = hasOrganisationScope || agencyWorkflowMode === 'principal' || ['principal', 'owner', 'admin', 'hq'].includes(membershipRole)
        const remoteListings =
          isSupabaseConfigured
            ? await getAgentPrivateListings(profile?.id, {
                organisationId,
                includeAllOrganisationListings,
              }).catch((error) => {
                console.warn('[Transactions] Active listing lookup failed; using local listing cache.', error)
                return []
              })
            : []
        setPrivateListings(mergeListings(localListings, remoteListings))
        setPreferredPartners(Array.isArray(partnerRows) ? partnerRows : [])

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
      } finally {
        setLoading(false)
      }
    })()
  }, [agencyWorkflowMode, currentMembership?.role, currentMembership?.workspaceRole, open, profile?.email, profile?.id, initialDevelopmentId, workspace?.id])

  useEffect(() => {
    if (!open || form.propertyMode !== PROPERTY_MODE_DEVELOPMENT || !form.developmentId || !isSupabaseConfigured) {
      setDevelopmentUnits([])
      return
    }

    ;(async () => {
      try {
        const rows = await fetchUnitsForTransactionSetup(form.developmentId)
        const available = rows.filter((unit) => String(unit?.status || '').trim().toLowerCase() === 'available' && !unit?.activeTransaction)
        setDevelopmentUnits(available)
      } catch (error) {
        setSaveError(error?.message || 'Unable to load development units.')
      }
    })()
  }, [open, form.propertyMode, form.developmentId])

  const selectedPrivateListing = useMemo(
    () => privateListings.find((listing) => String(listing.id) === String(form.privateListingId)) || null,
    [privateListings, form.privateListingId],
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
  const bondAttorneyOptions = useMemo(
    () =>
      filterPreferredPartners(activePreferredPartners, {
        type: 'bond_attorney',
        query: partnerSearch.bondAttorney,
        activeOnly: true,
      }),
    [activePreferredPartners, partnerSearch.bondAttorney],
  )
  const selectedTransferPartner = useMemo(
    () => findPartnerById(activePreferredPartners, form.transferPreferredPartnerId),
    [activePreferredPartners, form.transferPreferredPartnerId],
  )
  const selectedBondOriginatorPartner = useMemo(
    () => findPartnerById(activePreferredPartners, form.bondOriginatorPreferredPartnerId),
    [activePreferredPartners, form.bondOriginatorPreferredPartnerId],
  )
  const selectedBondAttorneyPartner = useMemo(
    () => findPartnerById(activePreferredPartners, form.bondAttorneyPreferredPartnerId),
    [activePreferredPartners, form.bondAttorneyPreferredPartnerId],
  )

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
    const defaultBondAttorneyPartner = getDefaultPreferredPartnerByType(activePreferredPartners, 'bond_attorney')

    setForm((previous) => {
      const next = { ...previous }
      let changed = false

      if (defaultTransferPartner && !previous.transferPreferredPartnerId) {
        next.transferPreferredPartnerId = defaultTransferPartner.id
        next.transferPartnerMode = PARTNER_MODE_AGENCY
        changed = true
      }
      if (!defaultTransferPartner && previous.transferPartnerMode === PARTNER_MODE_AGENCY) {
        next.transferPartnerMode = PARTNER_MODE_BUYER
        changed = true
      }

      if (requiresBondRolePlayers(previous.financeType) && defaultBondOriginatorPartner && previous.bondOriginatorMode === PARTNER_MODE_NONE) {
        next.bondOriginatorMode = PARTNER_MODE_AGENCY
        next.bondOriginatorPreferredPartnerId = defaultBondOriginatorPartner.id
        changed = true
      }
      if (requiresBondRolePlayers(previous.financeType) && defaultBondAttorneyPartner && previous.bondAttorneyMode === PARTNER_MODE_NONE) {
        next.bondAttorneyMode = PARTNER_MODE_AGENCY
        next.bondAttorneyPreferredPartnerId = defaultBondAttorneyPartner.id
        changed = true
      }

      return changed ? next : previous
    })
  }, [activePreferredPartners, open])

  useEffect(() => {
    if (selectedLead) {
      const rawName = String(selectedLead.name || '').trim()
      const [first = '', ...rest] = rawName.split(/\s+/)
      setForm((previous) => ({
        ...previous,
        clientName: first || previous.clientName,
        clientSurname: rest.join(' ') || previous.clientSurname,
        clientEmail: String(selectedLead.email || '').trim() || previous.clientEmail,
        clientPhone: String(selectedLead.phone || '').trim() || previous.clientPhone,
      }))
    }
  }, [selectedLead])

  useEffect(() => {
    if (form.propertyMode === PROPERTY_MODE_PRIVATE && selectedPrivateListing) {
      const price = String(selectedPrivateListing?.askingPrice || '').trim()
      setForm((previous) => ({
        ...previous,
        salesPrice: price || previous.salesPrice,
        reservationRequired: false,
        reservationAmount: '',
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
        salesPrice: String(selectedUnit?.price || '') || previous.salesPrice,
        reservationRequired: reservationEnabled,
        reservationAmount,
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
  }, [selectedUnit, selectedDevelopment?.reservation_deposit_amount, selectedDevelopment?.reservation_deposit_enabled_by_default, defaultAttorney?.email, defaultAttorney?.name, defaultAttorney?.phone, form.propertyMode])

  useEffect(() => {
    if (!open) return
    const numericSalePrice = Number(form.salesPrice)
    if (!Number.isFinite(numericSalePrice) || numericSalePrice <= 0) {
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
            grossCommissionPercentage: Number(form.grossCommissionPercentage || 0),
          })
          if (active) {
            setCommissionPreview(preview)
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
  }, [open, form.salesPrice, form.grossCommissionPercentage, profile?.id, profile?.email])

  function updateField(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  function updatePropertyMode(nextMode) {
    setForm((previous) => ({
      ...previous,
      propertyMode: nextMode,
      privateListingId: '',
      developmentId: nextMode === PROPERTY_MODE_DEVELOPMENT ? previous.developmentId || initialDevelopmentId || '' : '',
      unitId: '',
    }))
  }

  function updateFinanceType(value) {
    setForm((previous) => ({
      ...previous,
      financeType: value,
      ...(requiresBondRolePlayers(value)
        ? {}
        : {
            bondOriginatorMode: PARTNER_MODE_NONE,
            bondOriginatorPreferredPartnerId: '',
            bondAttorneyMode: PARTNER_MODE_NONE,
            bondAttorneyPreferredPartnerId: '',
          }),
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
      if (form.propertyMode === PROPERTY_MODE_PRIVATE) {
        if (!form.privateListingId) nextErrors.privateListingId = 'Select an active listing.'
      } else if (form.propertyMode === PROPERTY_MODE_DEVELOPMENT) {
        if (!form.developmentId) nextErrors.developmentId = 'Select a development.'
        if (!form.unitId) nextErrors.unitId = 'Select an available unit.'
      } else {
        if (!normalizeText(form.importPropertyAddress)) nextErrors.importPropertyAddress = 'Property address is required.'
        if (!normalizeText(form.importSellerName)) nextErrors.importSellerName = 'Seller name is required.'
        if (!normalizeText(form.importSellerEmail)) nextErrors.importSellerEmail = 'Seller email is required.'
        if (!normalizeText(form.importSellerPhone)) nextErrors.importSellerPhone = 'Seller phone is required.'
        if (!normalizeText(form.importCurrentStage)) nextErrors.importCurrentStage = 'Current stage is required.'
      }
    }

    if (stepKey === 'client') {
      if (!String(form.clientName || '').trim()) nextErrors.clientName = 'Client name is required.'
      if (!String(form.clientSurname || '').trim()) nextErrors.clientSurname = 'Client surname is required.'
      if (!String(form.clientEmail || '').trim()) nextErrors.clientEmail = 'Client email is required.'
      if (!String(form.clientPhone || '').trim()) nextErrors.clientPhone = 'Client phone is required.'
    }

    if (stepKey === 'terms') {
      if (!String(form.salesPrice || '').trim() || Number(form.salesPrice) <= 0) nextErrors.salesPrice = 'Enter a valid deal value.'
      if (!normalizeFinanceTypeForApi(form.financeType)) nextErrors.financeType = 'Select a finance type.'
      if (!String(form.grossCommissionPercentage || '').trim() || Number(form.grossCommissionPercentage) < 0) {
        nextErrors.grossCommissionPercentage = 'Enter a valid gross commission percentage.'
      }
      if (form.propertyMode === PROPERTY_MODE_DEVELOPMENT && form.reservationRequired && (!String(form.reservationAmount || '').trim() || Number(form.reservationAmount) <= 0)) {
        nextErrors.reservationAmount = 'Enter a valid reservation deposit amount.'
      }
    }

    if (stepKey === 'attorney') {
      if (form.transferPartnerMode === PARTNER_MODE_AGENCY) {
        if (!String(form.transferPreferredPartnerId || '').trim()) {
          nextErrors.transferPreferredPartnerId = 'Select a transfer attorney partner.'
        }
      }

      if (form.transferPartnerMode === PARTNER_MODE_BUYER) {
        if (!String(form.transferBuyerCompanyName || '').trim()) nextErrors.transferBuyerCompanyName = 'Company name is required.'
        if (!String(form.transferBuyerContactPerson || '').trim()) nextErrors.transferBuyerContactPerson = 'Contact person is required.'
        if (!String(form.transferBuyerEmail || '').trim()) nextErrors.transferBuyerEmail = 'Email is required.'
        if (!String(form.transferBuyerPhone || '').trim()) nextErrors.transferBuyerPhone = 'Phone is required.'
      }

      if (requiresBondRolePlayers(form.financeType)) {
        if (form.bondOriginatorMode === PARTNER_MODE_AGENCY && !String(form.bondOriginatorPreferredPartnerId || '').trim()) {
          nextErrors.bondOriginatorPreferredPartnerId = 'Select a bond originator partner or change mode.'
        }

        if (form.bondOriginatorMode === PARTNER_MODE_BUYER) {
          if (!String(form.bondOriginatorBuyerCompanyName || '').trim()) nextErrors.bondOriginatorBuyerCompanyName = 'Company name is required.'
          if (!String(form.bondOriginatorBuyerContactPerson || '').trim()) nextErrors.bondOriginatorBuyerContactPerson = 'Contact person is required.'
        }

        if (form.bondAttorneyMode === PARTNER_MODE_AGENCY && !String(form.bondAttorneyPreferredPartnerId || '').trim()) {
          nextErrors.bondAttorneyPreferredPartnerId = 'Select a bond attorney partner or change mode.'
        }

        if (form.bondAttorneyMode === PARTNER_MODE_BUYER) {
          if (!String(form.bondAttorneyBuyerCompanyName || '').trim()) nextErrors.bondAttorneyBuyerCompanyName = 'Company name is required.'
          if (!String(form.bondAttorneyBuyerContactPerson || '').trim()) nextErrors.bondAttorneyBuyerContactPerson = 'Contact person is required.'
        }
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

  async function handleCreateDeal() {
    const validProperty = validate('property')
    const validClient = validate('client')
    const validTerms = validate('terms')
    const validAttorney = validate('attorney')
    if (!validProperty || !validClient || !validTerms || !validAttorney) {
      return
    }

    const privateListing = selectedPrivateListing
    const buyerName = `${form.clientName} ${form.clientSurname}`.trim()
    const propertyMode = form.propertyMode
    const financeType = normalizeFinanceTypeForApi(form.financeType)
    const bondRolePlayersRequired = requiresBondRolePlayers(form.financeType)
    const listingSeller = getListingSeller(privateListing)
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
    const completeness = buildCompletenessSnapshot({ form, listing: privateListing, propertyMode })
    const creationOrigin = getCreationOrigin(propertyMode)

    const transferSelection =
      form.transferPartnerMode === PARTNER_MODE_AGENCY
        ? {
            mode: PARTNER_MODE_AGENCY,
            partnerId: selectedTransferPartner?.id || null,
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
      !bondRolePlayersRequired
        ? null
        : form.bondOriginatorMode === PARTNER_MODE_AGENCY
        ? {
            mode: PARTNER_MODE_AGENCY,
            partnerId: selectedBondOriginatorPartner?.id || null,
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

    const bondAttorneySelection =
      !bondRolePlayersRequired
        ? null
        : form.bondAttorneyMode === PARTNER_MODE_AGENCY
        ? {
            mode: PARTNER_MODE_AGENCY,
            partnerId: selectedBondAttorneyPartner?.id || null,
            companyName: selectedBondAttorneyPartner?.companyName || '',
            contactPerson: selectedBondAttorneyPartner?.contactPerson || '',
            email: selectedBondAttorneyPartner?.email || '',
            phone: selectedBondAttorneyPartner?.phone || '',
            website: selectedBondAttorneyPartner?.website || '',
            physicalAddress: selectedBondAttorneyPartner?.physicalAddress || '',
            province: selectedBondAttorneyPartner?.province || '',
            notes: selectedBondAttorneyPartner?.notes || '',
          }
        : form.bondAttorneyMode === PARTNER_MODE_BUYER
          ? {
              mode: PARTNER_MODE_BUYER,
              partnerId: null,
              companyName: String(form.bondAttorneyBuyerCompanyName || '').trim(),
              contactPerson: String(form.bondAttorneyBuyerContactPerson || '').trim(),
              email: String(form.bondAttorneyBuyerEmail || '').trim(),
              phone: String(form.bondAttorneyBuyerPhone || '').trim(),
              website: '',
              physicalAddress: '',
              province: '',
              notes: String(form.bondAttorneyBuyerNotes || '').trim(),
            }
          : null

    const transferAttorneyLabel = transferSelection?.companyName || transferSelection?.contactPerson || ''
    const transferAttorneyEmail = transferSelection?.email || ''
    const bondOriginatorLabel = bondOriginatorSelection?.companyName || bondOriginatorSelection?.contactPerson || ''
    const bondOriginatorEmail = bondOriginatorSelection?.email || ''
    const hasBuyerSelectedRolePlayer = [transferSelection, bondOriginatorSelection, bondAttorneySelection]
      .filter(Boolean)
      .some((item) => item.mode === PARTNER_MODE_BUYER)
    const nextAction = hasBuyerSelectedRolePlayer
      ? 'Buyer-appointed role player captured. Validate assignment while onboarding proceeds.'
      : 'Finance details and bond requirements will be captured during client onboarding.'

    try {
      setSaving(true)
      setSaveError('')
      const resolvedCommissionSnapshot = await resolveCommissionSnapshotForAgent({
        assignedAgentUserId: String(profile?.id || '').trim(),
        assignedAgentEmail: String(profile?.email || '').trim(),
        salePrice: Number(form.salesPrice || 0),
        grossCommissionPercentage: Number(form.grossCommissionPercentage || 0),
      })
      const result = await createTransactionFromWizard({
        setup: {
          transactionType: propertyMode === PROPERTY_MODE_DEVELOPMENT ? 'developer_sale' : 'private_property',
          propertyType:
            propertyMode === PROPERTY_MODE_DEVELOPMENT
              ? ''
              : propertyMode === PROPERTY_MODE_PRIVATE
              ? mapPrivateListingToTransactionPropertyCategory(privateListing)
              : 'residential',
          developmentId: propertyMode === PROPERTY_MODE_DEVELOPMENT ? form.developmentId : '',
          unitId: propertyMode === PROPERTY_MODE_DEVELOPMENT ? form.unitId : '',
          propertyAddressLine1: resolvedPropertyAddress || importAddressParts.join(', '),
          propertyAddressLine2: '',
          suburb: propertyMode === PROPERTY_MODE_IMPORT ? form.importSuburb : propertyMode === PROPERTY_MODE_PRIVATE ? privateListing?.propertyDetails?.suburb || privateListing?.suburb || '' : '',
          city: resolvedCity,
          province: propertyMode === PROPERTY_MODE_IMPORT ? form.importProvince : propertyMode === PROPERTY_MODE_PRIVATE ? privateListing?.propertyDetails?.province || privateListing?.province || '' : '',
          postalCode: '',
          propertyDescription: propertyMode === PROPERTY_MODE_IMPORT ? form.importNotes : propertyMode === PROPERTY_MODE_PRIVATE ? privateListing?.propertyDetails?.description || privateListing?.marketing?.description || '' : '',
          buyerFirstName: form.clientName,
          buyerLastName: form.clientSurname,
          buyerName: `${String(form.clientName || '').trim()} ${String(form.clientSurname || '').trim()}`.trim(),
          buyerPhone: form.clientPhone,
          buyerEmail: form.clientEmail,
          sellerName: propertyMode === PROPERTY_MODE_IMPORT ? form.importSellerName : propertyMode === PROPERTY_MODE_PRIVATE ? listingSeller.name : '',
          sellerPhone: propertyMode === PROPERTY_MODE_IMPORT ? form.importSellerPhone : propertyMode === PROPERTY_MODE_PRIVATE ? listingSeller.phone : '',
          sellerEmail: propertyMode === PROPERTY_MODE_IMPORT ? form.importSellerEmail : propertyMode === PROPERTY_MODE_PRIVATE ? listingSeller.email : '',
          salesPrice: form.salesPrice,
          financeType,
          purchaserType: 'individual',
          saleDate: form.saleDate || todayIso(),
          assignedAgent: String(profile?.fullName || profile?.name || profile?.email || 'Agent').trim(),
          assignedAgentUserId: String(profile?.id || '').trim(),
          assignedAgentEmail: String(profile?.email || '').trim(),
          financeManagedBy: bondOriginatorSelection ? 'bond_originator' : 'internal',
        },
        finance: {
          reservationRequired: Boolean(form.reservationRequired),
          reservationAmount: form.reservationRequired ? form.reservationAmount : '',
          reservationStatus: form.reservationRequired ? 'pending' : 'not_required',
          attorney: transferAttorneyLabel,
          attorneyEmail: transferAttorneyEmail,
          bondOriginator: bondOriginatorLabel,
          bondOriginatorEmail,
        },
        status: {
          stage: propertyMode === PROPERTY_MODE_IMPORT
            ? form.importCurrentStage
            : propertyMode === PROPERTY_MODE_DEVELOPMENT && form.reservationRequired
              ? 'Reserved'
              : 'Offer Accepted',
          nextAction,
          notes: [
            hasBuyerSelectedRolePlayer ? 'Buyer-appointed role player captured for at least one assignment.' : '',
            form.importNotes ? `Import notes: ${form.importNotes}` : '',
            completeness.missingItems.length ? `Missing follow-up items: ${completeness.missingItems.join(', ')}` : '',
          ].filter(Boolean).join('\n'),
        },
        options: {
          allowIncomplete: true,
          deferFinanceType: !financeType,
          creationOrigin,
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
            developmentId: propertyMode === PROPERTY_MODE_DEVELOPMENT ? normalizeText(form.developmentId) : null,
            unitId: propertyMode === PROPERTY_MODE_DEVELOPMENT ? normalizeText(form.unitId) : null,
            unitStatus: propertyMode === PROPERTY_MODE_DEVELOPMENT ? normalizeText(selectedUnit?.status) : null,
            importedProperty24Link: propertyMode === PROPERTY_MODE_IMPORT ? normalizeText(form.importProperty24Link) : null,
          },
          completeness,
          canonicalStructure: CANONICAL_TRANSACTION_STRUCTURE,
          rolePlayers: [
            {
              roleType: 'transfer_attorney',
              source: transferSelection.mode === PARTNER_MODE_AGENCY ? 'agency_preferred' : 'buyer_appointed',
              preferredPartnerId: transferSelection.partnerId || null,
              partner: transferSelection,
            },
            ...(bondOriginatorSelection
              ? [
                  {
                    roleType: 'bond_originator',
                    source: bondOriginatorSelection.mode === PARTNER_MODE_AGENCY ? 'agency_preferred' : 'buyer_appointed',
                    preferredPartnerId: bondOriginatorSelection.partnerId || null,
                    partner: bondOriginatorSelection,
                  },
                ]
              : []),
            ...(bondAttorneySelection
              ? [
                  {
                    roleType: 'bond_attorney',
                    source: bondAttorneySelection.mode === PARTNER_MODE_AGENCY ? 'agency_preferred' : 'buyer_appointed',
                    preferredPartnerId: bondAttorneySelection.partnerId || null,
                    partner: bondAttorneySelection,
                  },
                ]
              : []),
          ],
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

      setCreatedDeal({
        ...result,
        onboardingUrl: result?.onboardingToken ? `${window.location.origin}/client/onboarding/${result.onboardingToken}` : '',
        attorneyChangeRequested: transferSelection.mode === PARTNER_MODE_BUYER,
      })
      window.dispatchEvent(new Event('itg:listings-updated'))
      window.dispatchEvent(new Event('itg:transaction-created'))
      onSaved?.(result)
    } catch (error) {
      setSaveError(error?.message || 'Unable to create deal.')
    } finally {
      setSaving(false)
    }
  }

  const footer = createdDeal ? (
    <div className="flex items-center justify-between">
      <Button variant="ghost" onClick={onClose}>Done</Button>
      <Button
        onClick={() => {
          const searchValue = createdDeal.transactionReference || createdDeal.reference || createdDeal.transactionId
          const query = searchValue ? `?search=${encodeURIComponent(searchValue)}` : ''
          navigate(`/transactions${query}`)
        }}
      >
        Open Deal
      </Button>
    </div>
  ) : (
    <div className="flex items-center justify-between">
      <Button variant="ghost" onClick={activeStep === 'property' ? onClose : goBack} disabled={saving}>
        {activeStep === 'property' ? 'Cancel' : 'Back'}
      </Button>
      {activeStep === 'review' ? (
        <Button onClick={handleCreateDeal} disabled={saving || loading}>
          Create Deal
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
      title="Create Deal"
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
                  ? 'Select Property'
                  : stepKey === 'client'
                    ? 'Client Details'
                    : stepKey === 'terms'
                      ? 'Deal Terms'
                      : stepKey === 'attorney'
                        ? 'Transfer Attorney'
                        : 'Review & Create Deal'
              }
              active={stepKey === activeStep}
            />
          ))}
        </section>

        {!createdDeal ? (
          <>
            {activeStep === 'property' ? (
              <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                <div className="mb-5 flex flex-wrap gap-3">
                  {[
                    { key: PROPERTY_MODE_PRIVATE, label: 'Existing Listing' },
                    { key: PROPERTY_MODE_DEVELOPMENT, label: 'Development Unit' },
                    { key: PROPERTY_MODE_IMPORT, label: 'Import Deal' },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => updatePropertyMode(item.key)}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold ${form.propertyMode === item.key ? 'border-[#1f4f78] bg-[#2b5577] text-white' : 'border-[#dbe6f2] bg-white text-[#47627c]'}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {form.propertyMode === PROPERTY_MODE_PRIVATE ? (
                    <Field label="Active Listing" error={errors.privateListingId} fullWidth>
                      <select className={fieldClass()} value={form.privateListingId} onChange={(event) => updateField('privateListingId', event.target.value)}>
                        <option value="">Select active listing</option>
                        {privateListings.map((listing) => (
                          <option key={listing.id} value={listing.id}>
                            {formatListingDealOption(listing)}
                          </option>
                        ))}
                      </select>
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
                      <Field label="Property Address" error={errors.importPropertyAddress} fullWidth>
                        <input className={fieldClass()} value={form.importPropertyAddress} onChange={(event) => updateField('importPropertyAddress', event.target.value)} />
                      </Field>
                      <Field label="Suburb">
                        <input className={fieldClass()} value={form.importSuburb} onChange={(event) => updateField('importSuburb', event.target.value)} />
                      </Field>
                      <Field label="City">
                        <input className={fieldClass()} value={form.importCity} onChange={(event) => updateField('importCity', event.target.value)} />
                      </Field>
                      <Field label="Province">
                        <input className={fieldClass()} value={form.importProvince} onChange={(event) => updateField('importProvince', event.target.value)} />
                      </Field>
                      <Field label="Current Stage" error={errors.importCurrentStage}>
                        <select className={fieldClass()} value={form.importCurrentStage} onChange={(event) => updateField('importCurrentStage', event.target.value)}>
                          {['Offer Accepted', 'Deposit', 'Finance', 'Transfer', 'Registration'].map((stage) => (
                            <option key={stage} value={stage}>{stage}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Seller Name" error={errors.importSellerName}>
                        <input className={fieldClass()} value={form.importSellerName} onChange={(event) => updateField('importSellerName', event.target.value)} />
                      </Field>
                      <Field label="Seller Email" error={errors.importSellerEmail}>
                        <input className={fieldClass()} type="email" value={form.importSellerEmail} onChange={(event) => updateField('importSellerEmail', event.target.value)} />
                      </Field>
                      <Field label="Seller Phone" error={errors.importSellerPhone}>
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
                      <div className="md:col-span-2 grid gap-3 rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4 text-sm text-[#48627f] sm:grid-cols-2">
                        <label className="flex items-center gap-2 font-semibold">
                          <input type="checkbox" checked={form.importMandateUploaded} onChange={(event) => updateField('importMandateUploaded', event.target.checked)} />
                          Mandate uploaded
                        </label>
                        <label className="flex items-center gap-2 font-semibold">
                          <input type="checkbox" checked={form.importOtpUploaded} onChange={(event) => updateField('importOtpUploaded', event.target.checked)} />
                          OTP uploaded
                        </label>
                      </div>
                    </>
                  )}
                </div>
              </section>
            ) : null}

            {activeStep === 'client' ? (
              <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
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
                  <Field label="Name" error={errors.clientName}>
                    <input className={fieldClass()} value={form.clientName} onChange={(event) => updateField('clientName', event.target.value)} />
                  </Field>
                  <Field label="Surname" error={errors.clientSurname}>
                    <input className={fieldClass()} value={form.clientSurname} onChange={(event) => updateField('clientSurname', event.target.value)} />
                  </Field>
                  <Field label="Email" error={errors.clientEmail}>
                    <input className={fieldClass()} type="email" value={form.clientEmail} onChange={(event) => updateField('clientEmail', event.target.value)} />
                  </Field>
                  <Field label="Phone" error={errors.clientPhone}>
                    <input className={fieldClass()} value={form.clientPhone} onChange={(event) => updateField('clientPhone', event.target.value)} />
                  </Field>
                </div>
              </section>
            ) : null}

            {activeStep === 'terms' ? (
              <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Deal Value" error={errors.salesPrice}>
                    <input className={fieldClass()} type="number" min="0" step="1000" value={form.salesPrice} onChange={(event) => updateField('salesPrice', event.target.value)} />
                  </Field>
                  <Field label="Gross Commission %" error={errors.grossCommissionPercentage}>
                    <input
                      className={fieldClass()}
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.grossCommissionPercentage}
                      onChange={(event) => updateField('grossCommissionPercentage', event.target.value)}
                    />
                  </Field>
                  <Field label="Sale Date">
                    <input className={fieldClass()} type="date" value={form.saleDate} onChange={(event) => updateField('saleDate', event.target.value)} />
                  </Field>
                  <Field label="Finance Type" error={errors.financeType}>
                    <select className={fieldClass()} value={form.financeType} onChange={(event) => updateFinanceType(event.target.value)}>
                      <option value="unknown">Select finance type</option>
                      <option value="cash">Cash</option>
                      <option value="bond">Bond</option>
                      <option value="combination">Hybrid</option>
                    </select>
                  </Field>
                  {form.propertyMode === PROPERTY_MODE_DEVELOPMENT && form.reservationRequired ? (
                    <Field label="Reservation Deposit" error={errors.reservationAmount} hint="Shown only when the development requires a reservation deposit.">
                      <input className={fieldClass()} type="number" min="0" step="1000" value={form.reservationAmount} onChange={(event) => updateField('reservationAmount', event.target.value)} />
                    </Field>
                  ) : null}
                </div>
                <div className="mt-5 rounded-[16px] border border-[#dbe6f2] bg-[#f7fbff] px-4 py-3 text-sm text-[#48627f]">
                  The deal can start now. Any missing documents and follow-up items are recorded against transaction completeness.
                </div>
                <div className="mt-4 rounded-[16px] border border-[#dbe6f2] bg-white px-4 py-3 text-sm text-[#48627f]">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#6f8298]">Commission Projection</p>
                  <p className="mt-2">Gross commission: <span className="font-semibold text-[#22374d]">{formatCurrency(commissionPreview?.grossCommissionAmount || 0)}</span></p>
                  <p className="mt-1">Agent split: <span className="font-semibold text-[#22374d]">{Number(commissionPreview?.agentSplitPercentage || 70).toFixed(2).replace(/\.00$/, '')}%</span></p>
                  <p className="mt-1">My projected commission: <span className="font-semibold text-[#22374d]">{formatCurrency(commissionPreview?.agentCommissionAmount || 0)}</span></p>
                </div>
              </section>
            ) : null}

            {activeStep === 'attorney' ? (
              <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                <div className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] px-4 py-4">
                  <p className="text-[0.82rem] font-semibold uppercase tracking-[0.08em] text-[#6f8298]">Role Player Assignment</p>
                  <p className="mt-1 text-sm text-[#5f748c]">Assign role players from agency preferred partners, with buyer-appointed overrides when needed.</p>
                </div>

                <div className="mt-4 grid gap-4">
                  <article className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-sm text-[#22374d]">Transfer Attorney</strong>
                      <span className="rounded-full border border-[#dce6f2] bg-white px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#5f748c]">
                        Required
                      </span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Selection Mode">
                        <select className={fieldClass()} value={form.transferPartnerMode} onChange={(event) => updateField('transferPartnerMode', event.target.value)}>
                          {PARTNER_ROLE_FIELD_OPTIONS.map((item) => (
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
                        <Field label="Agency Preferred Transfer Attorney" error={errors.transferPreferredPartnerId}>
                          <select className={fieldClass()} value={form.transferPreferredPartnerId} onChange={(event) => updateField('transferPreferredPartnerId', event.target.value)}>
                            <option value="">Select transfer attorney</option>
                            {transferAttorneyOptions.map((partner) => (
                              <option key={partner.id} value={partner.id}>
                                {partner.companyName} • {partner.contactPerson || 'Contact pending'} • {partner.email || 'No email'}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <div className="rounded-[14px] border border-[#dce6f2] bg-white px-4 py-3 text-sm text-[#5f748c]">
                          {selectedTransferPartner ? (
                            <>
                              <p className="font-semibold text-[#22374d]">{selectedTransferPartner.companyName}</p>
                              <p className="mt-1">{selectedTransferPartner.contactPerson || 'No contact person'}</p>
                              <p className="mt-1">{selectedTransferPartner.email || 'No email'} • {selectedTransferPartner.phone || 'No phone'}</p>
                            </>
                          ) : (
                            <p>Select a preferred transfer attorney partner.</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <Field label="Buyer Appointed Company" error={errors.transferBuyerCompanyName}>
                          <input className={fieldClass()} value={form.transferBuyerCompanyName} onChange={(event) => updateField('transferBuyerCompanyName', event.target.value)} />
                        </Field>
                        <Field label="Buyer Appointed Contact" error={errors.transferBuyerContactPerson}>
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

                  {requiresBondRolePlayers(form.financeType) ? (
                    <>
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
                      <div className="mt-4">
                        <Field label="Agency Preferred Bond Originator" error={errors.bondOriginatorPreferredPartnerId}>
                          <select className={fieldClass()} value={form.bondOriginatorPreferredPartnerId} onChange={(event) => updateField('bondOriginatorPreferredPartnerId', event.target.value)}>
                            <option value="">Select bond originator</option>
                            {bondOriginatorOptions.map((partner) => (
                              <option key={partner.id} value={partner.id}>
                                {partner.companyName} • {partner.contactPerson || 'Contact pending'} • {partner.email || 'No email'}
                              </option>
                            ))}
                          </select>
                        </Field>
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

                  <article className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-sm text-[#22374d]">Bond Attorney</strong>
                      <span className="rounded-full border border-[#dce6f2] bg-white px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#5f748c]">
                        Optional
                      </span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Selection Mode">
                        <select className={fieldClass()} value={form.bondAttorneyMode} onChange={(event) => updateField('bondAttorneyMode', event.target.value)}>
                          {OPTIONAL_PARTNER_ROLE_FIELD_OPTIONS.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {form.bondAttorneyMode === PARTNER_MODE_AGENCY ? (
                        <Field label="Search Partners">
                          <input
                            className={fieldClass()}
                            value={partnerSearch.bondAttorney}
                            onChange={(event) => updatePartnerSearchField('bondAttorney', event.target.value)}
                            placeholder="Search company, contact, or email"
                          />
                        </Field>
                      ) : null}
                    </div>
                    {form.bondAttorneyMode === PARTNER_MODE_AGENCY ? (
                      <div className="mt-4">
                        <Field label="Agency Preferred Bond Attorney" error={errors.bondAttorneyPreferredPartnerId}>
                          <select className={fieldClass()} value={form.bondAttorneyPreferredPartnerId} onChange={(event) => updateField('bondAttorneyPreferredPartnerId', event.target.value)}>
                            <option value="">Select bond attorney</option>
                            {bondAttorneyOptions.map((partner) => (
                              <option key={partner.id} value={partner.id}>
                                {partner.companyName} • {partner.contactPerson || 'Contact pending'} • {partner.email || 'No email'}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </div>
                    ) : null}
                    {form.bondAttorneyMode === PARTNER_MODE_BUYER ? (
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <Field label="Buyer Appointed Company" error={errors.bondAttorneyBuyerCompanyName}>
                          <input className={fieldClass()} value={form.bondAttorneyBuyerCompanyName} onChange={(event) => updateField('bondAttorneyBuyerCompanyName', event.target.value)} />
                        </Field>
                        <Field label="Buyer Appointed Contact" error={errors.bondAttorneyBuyerContactPerson}>
                          <input className={fieldClass()} value={form.bondAttorneyBuyerContactPerson} onChange={(event) => updateField('bondAttorneyBuyerContactPerson', event.target.value)} />
                        </Field>
                        <Field label="Email">
                          <input className={fieldClass()} type="email" value={form.bondAttorneyBuyerEmail} onChange={(event) => updateField('bondAttorneyBuyerEmail', event.target.value)} />
                        </Field>
                        <Field label="Phone">
                          <input className={fieldClass()} value={form.bondAttorneyBuyerPhone} onChange={(event) => updateField('bondAttorneyBuyerPhone', normalizePhoneInput(event.target.value))} />
                        </Field>
                        <Field label="Notes" fullWidth>
                          <textarea className={fieldClass()} rows={3} value={form.bondAttorneyBuyerNotes} onChange={(event) => updateField('bondAttorneyBuyerNotes', event.target.value)} />
                        </Field>
                      </div>
                    ) : null}
                  </article>
                    </>
                  ) : null}
                </div>
              </section>
            ) : null}

            {activeStep === 'review' ? (
              <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                  <h4 className="text-[1.04rem] font-semibold text-[#142132]">Review Deal Setup</h4>
                  <div className="mt-5 space-y-4 text-sm text-[#48627f]">
                    {(() => {
                      const completeness = buildCompletenessSnapshot({ form, listing: selectedPrivateListing, propertyMode: form.propertyMode })
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
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Property</p>
                      <p className="mt-2 font-semibold text-[#22374d]">
                        {form.propertyMode === PROPERTY_MODE_PRIVATE
                          ? formatListingDealOption(selectedPrivateListing || {})
                          : form.propertyMode === PROPERTY_MODE_IMPORT
                            ? form.importPropertyAddress || 'Imported property pending'
                          : selectedDevelopment && selectedUnit
                            ? `${selectedDevelopment.name} • Unit ${selectedUnit.unit_number}`
                            : 'Development selection pending'}
                      </p>
                      <p className="mt-1">{formatCurrency(form.salesPrice)}</p>
                    </div>
                    <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Client</p>
                      <p className="mt-2 font-semibold text-[#22374d]">{`${form.clientName} ${form.clientSurname}`.trim()}</p>
                      <p className="mt-1">{form.clientEmail} • {form.clientPhone}</p>
                    </div>
                    <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Finance</p>
                      <p className="mt-2 font-semibold capitalize text-[#22374d]">{form.financeType === 'combination' ? 'Hybrid' : form.financeType}</p>
                    </div>
                    <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Transfer Attorney</p>
                      <p className="mt-2 font-semibold text-[#22374d]">
                        {form.transferPartnerMode === PARTNER_MODE_AGENCY
                          ? selectedTransferPartner?.companyName || selectedTransferPartner?.contactPerson || 'Pending selection'
                          : form.transferBuyerCompanyName || form.transferBuyerContactPerson || 'Buyer-appointed partner pending'}
                      </p>
                      <p className="mt-1 text-[#5f748c]">
                        {form.transferPartnerMode === PARTNER_MODE_AGENCY ? 'Agency preferred partner' : 'Buyer appointed partner'}
                      </p>
                    </div>
                    {requiresBondRolePlayers(form.financeType) ? (
                      <>
                        <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Bond Originator</p>
                          <p className="mt-2 font-semibold text-[#22374d]">
                            {form.bondOriginatorMode === PARTNER_MODE_NONE
                              ? 'Not assigned yet'
                              : form.bondOriginatorMode === PARTNER_MODE_AGENCY
                                ? selectedBondOriginatorPartner?.companyName || selectedBondOriginatorPartner?.contactPerson || 'Pending selection'
                                : form.bondOriginatorBuyerCompanyName || form.bondOriginatorBuyerContactPerson || 'Buyer-appointed partner pending'}
                          </p>
                        </div>
                        <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Bond Attorney</p>
                          <p className="mt-2 font-semibold text-[#22374d]">
                            {form.bondAttorneyMode === PARTNER_MODE_NONE
                              ? 'Not assigned yet'
                              : form.bondAttorneyMode === PARTNER_MODE_AGENCY
                                ? selectedBondAttorneyPartner?.companyName || selectedBondAttorneyPartner?.contactPerson || 'Pending selection'
                                : form.bondAttorneyBuyerCompanyName || form.bondAttorneyBuyerContactPerson || 'Buyer-appointed partner pending'}
                          </p>
                        </div>
                      </>
                    ) : null}
                    <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Commission Projection</p>
                      <p className="mt-2 font-semibold text-[#22374d]">
                        Gross: {formatCurrency(commissionPreview?.grossCommissionAmount || 0)} at {Number(form.grossCommissionPercentage || 0).toFixed(2).replace(/\.00$/, '')}%
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
                      'Completeness follow-ups will be captured without blocking creation.',
                      'Transfer attorney will be notified.',
                      form.propertyMode === PROPERTY_MODE_PRIVATE
                        ? 'Listing will move into an in-progress state.'
                        : form.propertyMode === PROPERTY_MODE_DEVELOPMENT
                          ? 'Unit will move out of available status once the transaction is active.'
                          : 'Imported deal will use the same transaction workspace as every other deal.',
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
                <h4 className="text-[1.08rem] font-semibold text-[#142132]">Deal created successfully</h4>
                <p className="text-sm text-[#607387]">The transaction shell is live, the origin path has been logged, and any missing follow-up items are tracked against completeness.</p>
                {createdDeal.onboardingUrl ? (
                  <a href={createdDeal.onboardingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-[#1f4f78]">
                    <ExternalLink size={14} />
                    Open onboarding link
                  </a>
                ) : null}
                {createdDeal.attorneyChangeRequested ? (
                  <p className="text-sm text-[#9a5b13]">Buyer-appointed role player recorded and saved against this transaction setup.</p>
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
