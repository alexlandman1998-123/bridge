import { Building2, Check, House, Layers3, Plus, Trash2, Trees } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'
import { createDevelopmentWorkspace, fetchDeveloperAccessOptions, fetchDeveloperPartnersWorkspace } from '../lib/api'
import { upsertAreaFromAddress } from '../lib/location/upsertArea'
import { invokeEdgeFunction, isSupabaseConfigured } from '../lib/supabaseClient'
import { formatSouthAfricanWhatsAppNumber, sendWhatsAppNotification } from '../lib/whatsapp'
import AddressAutocomplete from './location/AddressAutocomplete'
import Button from './ui/Button'
import Modal from './ui/Modal'
import StockMasterSetup from './developments/StockMasterSetup'
import { buildStockSummary, buildStockTargets, createStockPlan, validateStockStep } from '../core/developments/developmentStockPlan.js'
import './developments/development-create.css'

const STEPS = [
  { id: 'basic', label: 'Development Details', description: 'Step 1' },
  { id: 'units', label: 'Units', description: 'Step 2' },
  { id: 'financials', label: 'Sales setup', description: 'Step 3' },
  { id: 'review', label: 'Review', description: 'Step 4' },
]

const DEVELOPMENT_TYPES = [
  { value: 'residential', label: 'Residential', icon: House },
  { value: 'mixed_use', label: 'Mixed-use', icon: Building2 },
  { value: 'estate', label: 'Estate', icon: Trees },
  { value: 'sectional_title', label: 'Sectional title', icon: Layers3 },
]

function getStepsForContext(unitConfigurationMethod) {
  return STEPS.flatMap((step) => step.id === 'units' && unitConfigurationMethod === 'generate_range'
    ? [step, { id: 'unit_setup', label: 'Unit setup' }]
    : [step])
}

const DEFAULT_DETAILS = {
  name: '',
  code: '',
  location: '',
  suburb: '',
  city: '',
  province: '',
  country: 'South Africa',
  address: '',
  formattedAddress: '',
  streetAddress: '',
  postalCode: '',
  latitude: null,
  longitude: null,
  googlePlaceId: '',
  developerCompany: '',
  totalUnitsExpected: '',
  launchDate: '',
  expectedCompletionDate: '',
  handoverEnabled: true,
  snagTrackingEnabled: true,
  alterationsEnabled: false,
  onboardingEnabled: true,
}

const DEFAULT_FINANCIALS = {
  landCost: '',
  buildCost: '',
  professionalFees: '',
  marketingCost: '',
  infrastructureCost: '',
  otherCosts: '',
  projectedGrossSalesValue: '',
  notes: '',
}

const DEFAULT_TRANSACTION_DEFAULTS = {
  reservationDepositEnabled: false,
  reservationDepositAmount: '',
  reservationDepositAmountType: 'fixed',
  reservationDepositPayableTo: 'developer',
  defaultAgentSource: 'none',
  defaultAgentRelationshipId: '',
  defaultAgentPreferredPartnerId: '',
  defaultAgentName: '',
  multipleAgentsAllowed: true,
  developerSellingDirectly: false,
  defaultTransferAttorneySource: 'none',
  defaultTransferAttorneyRelationshipId: '',
  defaultTransferAttorneyPreferredPartnerId: '',
  defaultTransferAttorneyName: '',
  defaultBondOriginatorSource: 'none',
  defaultBondOriginatorRelationshipId: '',
  defaultBondOriginatorPreferredPartnerId: '',
  defaultBondOriginatorName: '',
  buyerAppointedBondOriginatorAllowed: true,
  buyerAppointedBondOriginatorRequiresApproval: true,
  autoInviteSelectedBondOriginator: false,
}

const DEFAULT_LEGAL = {
  enabledModules: {
    agent: true,
    conveyancing: true,
    bond_originator: true,
  },
  agents: [{ name: '', email: '', company: '' }],
  conveyancers: [{ firmName: '', contactName: '', email: '', phone: '', defaultFeeAmount: '' }],
  bondOriginators: [{ name: '', contactName: '', email: '', phone: '', commission_type: 'purchase_price', commission_percentage: '' }],
  attorneyFirmName: '',
  primaryContactName: '',
  primaryContactEmail: '',
  primaryContactPhone: '',
  defaultFeeAmount: '',
  vatIncluded: true,
  disbursementsIncluded: false,
  overrideAllowed: true,
  bondOriginatorName: '',
  bondPrimaryContactName: '',
  bondPrimaryContactEmail: '',
  bondPrimaryContactPhone: '',
  commission_type: 'purchase_price',
  commission_percentage: '',
  bondCommissionModelType: 'fixed_fee',
  bondVatIncluded: true,
  bondOverrideAllowed: true,
  requiredDocuments: [
    { key: 'attorney_invoice', label: 'Attorney Invoice', isRequired: true },
    { key: 'attorney_statement', label: 'Attorney Statement', isRequired: true },
    { key: 'registration_confirmation', label: 'Registration Confirmation', isRequired: true },
  ],
}

function buildInitialLegal(profile = null, workspace = null) {
  const defaultAgentName = String(profile?.fullName || profile?.name || profile?.email || '').trim()
  const defaultAgentEmail = String(profile?.email || '').trim()
  const defaultAgentCompany = String(profile?.agencyName || profile?.company || workspace?.name || '').trim()
  const seedAgent = defaultAgentName || defaultAgentEmail || defaultAgentCompany
    ? { name: defaultAgentName, email: defaultAgentEmail, company: defaultAgentCompany }
    : buildEmptyAgent()

  return {
    ...DEFAULT_LEGAL,
    agents: [seedAgent],
    conveyancers: DEFAULT_LEGAL.conveyancers.map((item) => ({ ...item })),
    bondOriginators: DEFAULT_LEGAL.bondOriginators.map((item) => ({ ...item })),
    requiredDocuments: DEFAULT_LEGAL.requiredDocuments.map((item) => ({ ...item })),
  }
}

const DEFAULT_DEVELOPER_ACCESS = {
  mode: 'later',
  selectedDeveloperId: '',
  selectedDeveloperEmail: '',
  selectedDeveloperName: '',
  selectedDeveloperCompany: '',
  inviteCompanyName: '',
  inviteContactName: '',
  inviteEmail: '',
  invitePhone: '',
}

function buildEmptyAgent() {
  return {
    name: '',
    email: '',
    company: '',
  }
}

function buildEmptyConveyancer() {
  return {
    firmName: '',
    contactName: '',
    email: '',
    phone: '',
    defaultFeeAmount: '',
  }
}

function buildEmptyBondOriginator() {
  return {
    name: '',
    contactName: '',
    email: '',
    phone: '',
    commission_type: 'purchase_price',
    commission_percentage: '',
  }
}

function buildEmptyDocument() {
  return {
    documentType: 'floorplan',
    title: '',
    description: '',
    fileUrl: '',
    linkedUnitType: '',
  }
}

function normalizeOptionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatCurrency(value) {
  const amount = normalizeOptionalNumber(value)
  if (amount === null) return 'R0'
  return `R${amount.toLocaleString('en-ZA')}`
}

function buildUnitPriceRange(unitTypes = []) {
  const prices = unitTypes
    .flatMap((unitType) => unitType.floorplans || [])
    .map((floorplan) => normalizeOptionalNumber(floorplan.listPrice))
    .filter((price) => price !== null && price > 0)

  if (!prices.length) return 'Not set'

  const min = Math.min(...prices)
  const max = Math.max(...prices)
  return min === max ? formatCurrency(min) : `${formatCurrency(min)} - ${formatCurrency(max)}`
}

function createInviteToken(prefix = 'dev') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

function buildDeveloperAccessLink(token) {
  if (!token) return ''
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://app.arch9.co.za'
  return `${origin}/developer/access-invite/${encodeURIComponent(token)}`
}

function getResolvedDevelopmentLocation(details) {
  const explicitLocation = String(details.location || '').trim()
  if (explicitLocation) return explicitLocation

  const areaLabel = [details.suburb, details.city]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(', ')

  if (areaLabel) return areaLabel

  return String(details.address || '').trim()
}

function buildDevelopmentAddressValue(details = {}) {
  const formattedAddress = String(
    details.formattedAddress ||
      [details.address || details.streetAddress, details.suburb, details.city, details.province].filter(Boolean).join(', '),
  ).trim()

  if (!formattedAddress) return null

  return {
    formattedAddress,
    streetAddress: String(details.streetAddress || details.address || '').trim(),
    suburb: String(details.suburb || '').trim(),
    city: String(details.city || '').trim(),
    province: String(details.province || '').trim(),
    country: String(details.country || 'South Africa').trim(),
    postalCode: String(details.postalCode || '').trim(),
    latitude: typeof details.latitude === 'number' ? details.latitude : Number(details.latitude) || undefined,
    longitude: typeof details.longitude === 'number' ? details.longitude : Number(details.longitude) || undefined,
    placeId: String(details.googlePlaceId || '').trim(),
  }
}

function mergeDevelopmentAddress(previous = {}, value = null) {
  if (!value) {
    return {
      ...previous,
      address: '',
      formattedAddress: '',
      streetAddress: '',
      suburb: '',
      city: '',
      province: '',
      country: 'South Africa',
      postalCode: '',
      latitude: null,
      longitude: null,
      googlePlaceId: '',
    }
  }

  return {
    ...previous,
    address: value.streetAddress || value.formattedAddress || '',
    formattedAddress: value.formattedAddress || '',
    streetAddress: value.streetAddress || value.formattedAddress || '',
    suburb: value.suburb || '',
    city: value.city || '',
    province: value.province || '',
    country: value.country || 'South Africa',
    postalCode: value.postalCode || '',
    latitude: value.latitude ?? null,
    longitude: value.longitude ?? null,
    googlePlaceId: value.placeId || '',
  }
}

function getPreferredDeveloperPartnerDefault(defaults = [], partnerType = '') {
  return (defaults || []).find((item) => item?.partnerType === partnerType && item?.isPreferredDefault) ||
    (defaults || []).find((item) => item?.partnerType === partnerType) ||
    null
}

function partnerDefaultName(defaultRecord = null, fallback = '') {
  return String(defaultRecord?.companyName || defaultRecord?.contactPerson || defaultRecord?.email || fallback || '').trim()
}

function applyDeveloperPartnerDefaultsToLegal(previous = {}, defaults = []) {
  const agency = getPreferredDeveloperPartnerDefault(defaults, 'agency')
  const transferAttorney = getPreferredDeveloperPartnerDefault(defaults, 'transfer_attorney')
  const bondOriginator = getPreferredDeveloperPartnerDefault(defaults, 'bond_originator')

  return {
    ...previous,
    agents: agency
      ? [{
          ...buildEmptyAgent(),
          name: agency.contactPerson || agency.companyName || '',
          email: agency.email || '',
          company: agency.companyName || '',
        }]
      : previous.agents,
    conveyancers: transferAttorney
      ? [{
          ...buildEmptyConveyancer(),
          firmName: transferAttorney.companyName || '',
          contactName: transferAttorney.contactPerson || '',
          email: transferAttorney.email || '',
          phone: transferAttorney.phone || '',
        }]
      : previous.conveyancers,
    bondOriginators: bondOriginator
      ? [{
          ...buildEmptyBondOriginator(),
          name: bondOriginator.companyName || '',
          contactName: bondOriginator.contactPerson || '',
          email: bondOriginator.email || '',
          phone: bondOriginator.phone || '',
        }]
      : previous.bondOriginators,
  }
}

function buildFloorplanDocumentsFromUnitTypes(unitTypes) {
  const seen = new Set()

  return unitTypes.flatMap((unitType) =>
    unitType.floorplans.flatMap((floorplan) => {
      const floorplanName = String(floorplan.name || '').trim()
      if (!floorplanName) return []

      const dedupeKey = `${floorplanName}::${unitType.name || ''}`
      if (seen.has(dedupeKey)) return []
      seen.add(dedupeKey)

      const descriptionBits = [
        unitType.name ? `${unitType.name} layout` : '',
        floorplan.sizeSqm ? `${floorplan.sizeSqm} sqm` : '',
        floorplan.listPrice ? `from ${Number(floorplan.listPrice).toLocaleString('en-ZA')}` : '',
        floorplan.fileName ? `file: ${floorplan.fileName}` : '',
      ].filter(Boolean)

      return [
        {
          ...buildEmptyDocument(),
          documentType: 'floorplan',
          title: floorplanName,
          description: descriptionBits.join(' • '),
          fileUrl: floorplan.fileUrl || '',
          linkedUnitType: unitType.name || '',
        },
      ]
    }),
  )
}

function AddDevelopmentModal({ open, onClose, onCreated, contextRole = 'developer' }) {
  const isAgentContext = String(contextRole || '').trim().toLowerCase() === 'agent'
  const { profile, workspace } = useWorkspace()
  const [stepIndex, setStepIndex] = useState(0)
  const [stockStepIndex, setStockStepIndex] = useState(0)
  const [details, setDetails] = useState(DEFAULT_DETAILS)
  const [financials, setFinancials] = useState(DEFAULT_FINANCIALS)
  const [transactionDefaults, setTransactionDefaults] = useState(DEFAULT_TRANSACTION_DEFAULTS)
  const [legal, setLegal] = useState(() => buildInitialLegal(profile, workspace))
  const [developerAccess, setDeveloperAccess] = useState(DEFAULT_DEVELOPER_ACCESS)
  const [developerOptions, setDeveloperOptions] = useState([])
  const [developerOptionsLoading, setDeveloperOptionsLoading] = useState(false)
  const [developerOptionsError, setDeveloperOptionsError] = useState('')
  const [partnerDefaults, setPartnerDefaults] = useState([])
  const [partnerDefaultsLoading, setPartnerDefaultsLoading] = useState(false)
  const [partnerDefaultsError, setPartnerDefaultsError] = useState('')
  const [units, setUnits] = useState([])
  const [documents, setDocuments] = useState([buildEmptyDocument()])
  const [developmentType, setDevelopmentType] = useState('residential')
  const [unitConfigurationMethod, setUnitConfigurationMethod] = useState('import_later')
  const [savedDevelopment, setSavedDevelopment] = useState(null)
  const [saveWarnings, setSaveWarnings] = useState([])
  const [stockPlan, setStockPlan] = useState(createStockPlan)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const formRef = useRef(null)
  const activeSteps = useMemo(() => getStepsForContext(unitConfigurationMethod), [unitConfigurationMethod])
  const currentStepId = activeSteps[stepIndex]?.id || activeSteps[0]?.id || 'basic'
  const maxStepIndex = Math.max(activeSteps.length - 1, 0)

  useEffect(() => {
    formRef.current?.closest('.ui-modal-body')?.scrollTo?.({ top: 0 })
  }, [stepIndex, stockStepIndex, error, savedDevelopment])

  useEffect(() => {
    if (!open) return

    setStepIndex(0)
    setStockStepIndex(0)
    setDetails(DEFAULT_DETAILS)
    setFinancials(DEFAULT_FINANCIALS)
    setTransactionDefaults(DEFAULT_TRANSACTION_DEFAULTS)
    setLegal(buildInitialLegal(profile, workspace))
    setDeveloperAccess(DEFAULT_DEVELOPER_ACCESS)
    setDeveloperOptions([])
    setDeveloperOptionsLoading(false)
    setDeveloperOptionsError('')
    setPartnerDefaults([])
    setPartnerDefaultsLoading(false)
    setPartnerDefaultsError('')
    setUnits([])
    setDocuments([buildEmptyDocument()])
    setDevelopmentType('residential')
    setUnitConfigurationMethod('import_later')
    setSavedDevelopment(null)
    setSaveWarnings([])
    setStockPlan(createStockPlan())
    setSaving(false)
    setError('')
  }, [open, profile, workspace])

  useEffect(() => {
    if (!open || !isSupabaseConfigured) return
    const workspaceId = String(workspace?.id || workspace?.organisation_id || workspace?.organisationId || '').trim()
    if (!workspaceId) return

    let cancelled = false

    async function loadPartnerDefaults() {
      try {
        setPartnerDefaultsLoading(true)
        setPartnerDefaultsError('')
        const snapshot = await fetchDeveloperPartnersWorkspace({ organisationId: workspaceId })
        if (cancelled) return
        const defaults = (snapshot.defaults || []).filter((item) => item?.isActive && item?.isPreferredDefault)
        setPartnerDefaults(defaults)
        if (defaults.length) {
          setLegal((previous) => applyDeveloperPartnerDefaultsToLegal(previous, defaults))
        }
      } catch (loadError) {
        if (cancelled) return
        setPartnerDefaults([])
        setPartnerDefaultsError(loadError?.message || 'Unable to load partner defaults.')
      } finally {
        if (!cancelled) {
          setPartnerDefaultsLoading(false)
        }
      }
    }

    void loadPartnerDefaults()

    return () => {
      cancelled = true
    }
  }, [open, workspace])

  useEffect(() => {
    if (!open || !isAgentContext) {
      return
    }

    let cancelled = false

    async function loadDeveloperOptions() {
      try {
        setDeveloperOptionsLoading(true)
        setDeveloperOptionsError('')
        const options = await fetchDeveloperAccessOptions()
        if (cancelled) return
        setDeveloperOptions(options)
      } catch (loadError) {
        if (cancelled) return
        setDeveloperOptions([])
        setDeveloperOptionsError(loadError?.message || 'Unable to load developer options.')
      } finally {
        if (!cancelled) {
          setDeveloperOptionsLoading(false)
        }
      }
    }

    void loadDeveloperOptions()

    return () => {
      cancelled = true
    }
  }, [isAgentContext, open])

  const stockSummary = useMemo(() => buildStockSummary(stockPlan), [stockPlan])

  const derivedTotals = useMemo(() => {
    const totalProjectedCost = ['landCost', 'buildCost', 'professionalFees', 'marketingCost', 'infrastructureCost', 'otherCosts'].reduce(
      (sum, key) => sum + Number(financials[key] || 0),
      0,
    )
    const projectedGrossSalesValue = Number(financials.projectedGrossSalesValue || 0)
    const projectedProfit = projectedGrossSalesValue - totalProjectedCost

    return {
      totalProjectedCost,
      projectedProfit,
      targetMargin: projectedGrossSalesValue ? (projectedProfit / projectedGrossSalesValue) * 100 : 0,
      unitCount: units.filter((unit) => String(unit.unitNumber || '').trim()).length,
      documentCount: documents.filter((document) => String(document.title || '').trim()).length,
    }
  }, [documents, financials, units])

  function updateDocument(index, key, value) {
    setDocuments((previous) => previous.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)))
  }

  function updateLegalList(key, index, field, value) {
    setLegal((previous) => ({
      ...previous,
      [key]: previous[key].map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    }))
  }

  function updateDeveloperAccess(key, value) {
    setDeveloperAccess((previous) => ({ ...previous, [key]: value }))
  }

  function hasDeveloperAccessDraft() {
    if (!isAgentContext) return false
    if (developerAccess.mode === 'later') return false
    if (developerAccess.mode === 'invite') {
      return [
        developerAccess.inviteCompanyName,
        developerAccess.inviteContactName,
        developerAccess.inviteEmail,
        developerAccess.invitePhone,
      ].some((value) => String(value || '').trim())
    }
    return Boolean(String(developerAccess.selectedDeveloperId || '').trim())
  }

  function handleSelectDeveloper(value) {
    const selectedId = String(value || '').trim()
    const selected = developerOptions.find((item) => String(item?.id || '').trim() === selectedId) || null
    updateDeveloperAccess('selectedDeveloperId', selectedId)
    updateDeveloperAccess('selectedDeveloperEmail', selected?.email || '')
    updateDeveloperAccess('selectedDeveloperName', selected?.name || '')
    updateDeveloperAccess('selectedDeveloperCompany', selected?.company || '')

    if (selected?.company && !String(details.developerCompany || '').trim()) {
      setDetails((previous) => ({ ...previous, developerCompany: selected.company }))
    }
  }

  function buildDeveloperTeamFromAccess() {
    if (!isAgentContext) return []
    if (!hasDeveloperAccessDraft()) return []

    if (developerAccess.mode === 'invite') {
      const inviteToken = createInviteToken('dev')
      const onboardingLink = buildDeveloperAccessLink(inviteToken)
      return [
        {
          name: String(developerAccess.inviteContactName || '').trim(),
          contactName: String(developerAccess.inviteContactName || '').trim(),
          email: String(developerAccess.inviteEmail || '').trim().toLowerCase(),
          company: String(developerAccess.inviteCompanyName || '').trim(),
          phone: String(developerAccess.invitePhone || '').trim(),
          status: 'invited',
          inviteToken,
          onboardingLink,
        },
      ]
    }

    return [
      {
        id: String(developerAccess.selectedDeveloperId || '').trim() || null,
        name: String(developerAccess.selectedDeveloperName || '').trim(),
        contactName: String(developerAccess.selectedDeveloperName || '').trim(),
        email: String(developerAccess.selectedDeveloperEmail || '').trim().toLowerCase(),
        company: String(developerAccess.selectedDeveloperCompany || '').trim(),
        status: 'active',
      },
    ].filter((item) => item.name || item.email)
  }

  async function sendDeveloperInviteNotifications({
    companyName = '',
    contactName = '',
    recipientEmail = '',
    recipientPhone = '',
    onboardingLink = '',
  } = {}) {
    const warnings = []
    const normalizedEmail = String(recipientEmail || '').trim().toLowerCase()
    const normalizedPhone = formatSouthAfricanWhatsAppNumber(recipientPhone)
    const safeContactName = String(contactName || '').trim() || 'Developer'
    const safeCompanyName = String(companyName || '').trim() || details.name || 'the development'

    if (normalizedEmail && isSupabaseConfigured) {
      try {
        await invokeEdgeFunction('send-email', {
          body: {
            type: 'developer_access_invite',
            to: normalizedEmail,
            inviteeName: safeContactName,
            organisationName: safeCompanyName,
            workspaceRole: 'developer',
            developerName: safeContactName,
            developmentName: details.name,
            companyName: safeCompanyName,
            inviteLink: onboardingLink,
            onboardingLink,
          },
        })
      } catch (emailError) {
        console.error('[Development Invite] developer email notification failed', emailError)
        warnings.push({ message: 'The development was saved, but the developer email invitation could not be confirmed.' })
      }
    }

    if (normalizedPhone) {
      try {
        await sendWhatsAppNotification({
          to: normalizedPhone,
          role: 'developer_invite',
          message: `Hi ${safeContactName},\n\nYou have been invited to access ${details.name} on Arch9.\n\nOpen your developer access link:\n${onboardingLink}\n\nCompany: ${safeCompanyName}`,
        })
      } catch (whatsappError) {
        console.error('[Development Invite] developer WhatsApp notification failed', whatsappError)
        warnings.push({ message: 'The development was saved, but the developer WhatsApp invitation could not be confirmed.' })
      }
    }
    return warnings
  }

  function validateDevelopmentDetails() {
    if (!details.name.trim()) {
      throw new Error('Development name is required.')
    }
    if (!details.address.trim() && !details.suburb.trim() && !details.city.trim()) {
      throw new Error('Add at least a street address, suburb, or city for the development.')
    }
    const plannedUnits = Number(details.totalUnitsExpected || 0)
    if (!Number.isInteger(plannedUnits) || plannedUnits < 0) {
      throw new Error('Planned units must be a whole number of 0 or greater.')
    }
    if (details.launchDate && details.expectedCompletionDate && details.expectedCompletionDate < details.launchDate) {
      throw new Error('Expected completion must be on or after the launch date.')
    }
  }

  function validateSalesSetup() {
    if (isAgentContext && hasDeveloperAccessDraft()) {
      if (developerAccess.mode === 'invite') {
        if (
          !String(developerAccess.inviteCompanyName || '').trim() ||
          !String(developerAccess.inviteContactName || '').trim() ||
          !String(developerAccess.inviteEmail || '').trim()
        ) {
          throw new Error('Developer company name, contact name, and email are required for new developer invites.')
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(developerAccess.inviteEmail.trim())) {
          throw new Error('Enter a valid developer email address.')
        }
      }
    }
    if (transactionDefaults.reservationDepositEnabled) {
      const amount = Number(transactionDefaults.reservationDepositAmount)
      if (!String(transactionDefaults.reservationDepositAmount).trim() || !Number.isFinite(amount) || amount <= 0 || (transactionDefaults.reservationDepositAmountType === 'percentage' && amount > 100)) {
        throw new Error('Enter a positive reservation deposit amount. A percentage must be 100 or less.')
      }
    }
  }

  function validateCurrentStep() {
    if (currentStepId === 'basic' || currentStepId === 'units') validateDevelopmentDetails()
    if (currentStepId === 'financials') validateSalesSetup()
  }


  function handleNext() {
    try {
      setError('')
      validateCurrentStep()
      setStepIndex((previous) => Math.min(previous + 1, maxStepIndex))
    } catch (stepError) {
      setError(stepError.message)
    }
  }

  function updateStockPlan(updater) {
    setStockPlan((previous) => {
      const next = updater(previous)
      const targetIds = new Set(buildStockTargets(next).map((target) => target.id))
      return {
        ...next,
        unitTypes: next.unitTypes.map((type) => ({
          ...type,
          floorplans: type.floorplans.map((layout) => ({
            ...layout, allocations: layout.allocations.filter((entry) => targetIds.has(entry.targetId)),
          })),
        })),
      }
    })
  }

  function handleStockStepNext() {
    try {
      setError('')
      validateStockStep(stockPlan, stockStepIndex)
      setStockStepIndex((previous) => Math.min(previous + 1, 2))
    } catch (stockError) {
      setError(stockError.message)
    }
  }

  function handleStockStepBack() {
    setError('')
    setStockStepIndex((previous) => Math.max(previous - 1, 0))
  }

  function handleBack() {
    setError('')
    if (currentStepId === 'unit_setup' && stockStepIndex > 0) {
      handleStockStepBack()
      return
    }
    setStepIndex((previous) => Math.max(previous - 1, 0))
  }

  function deferUnitSetup() {
    setError('')
    setUnitConfigurationMethod('import_later')
    setUnits([])
    setStockStepIndex(0)
    setStepIndex(activeSteps.findIndex((step) => step.id === 'units'))
  }

  function handleFinalizeStock() {
    try {
      setError('')
      validateStockStep(stockPlan, 2)
      const generatedUnits = stockSummary.generatedUnits

      setUnits(generatedUnits)
      setDetails((previous) => ({
        ...previous,
        totalUnitsExpected: String(generatedUnits.length),
      }))
      setStepIndex((previous) => Math.min(previous + 1, maxStepIndex))
    } catch (stockError) {
      setError(stockError.message)
    }
  }

  function handleContinue(event) {
    // The final step replaces this button with a submit button during the click.
    // Cancel the original click's default action before React updates its type.
    event?.preventDefault()
    if (currentStepId === 'unit_setup') {
      if (stockStepIndex === 2) handleFinalizeStock()
      else handleStockStepNext()
    } else {
      handleNext()
    }
  }

  async function submitDevelopment(statusOverride = '') {
    if (saving || savedDevelopment) return
    try {
      setError('')
      try {
        validateDevelopmentDetails()
      } catch (validationError) {
        setStepIndex(0)
        throw validationError
      }
      try {
        validateSalesSetup()
      } catch (validationError) {
        setStepIndex(activeSteps.findIndex((step) => step.id === 'financials'))
        throw validationError
      }
      if (unitConfigurationMethod === 'generate_range') {
        try {
          validateStockStep(stockPlan, 2)
        } catch (stockError) {
          setStepIndex(activeSteps.findIndex((step) => step.id === 'unit_setup'))
          try { validateStockStep(stockPlan, 0); setStockStepIndex(1) }
          catch { setStockStepIndex(0) }
          throw stockError
        }
      }
      setSaving(true)

      const effectiveDetails = { ...details, status: statusOverride || 'active' }
      const primaryConveyancer = legal.conveyancers.find((item) => String(item.firmName || item.contactName || item.email || '').trim())
      const primaryBondOriginator = legal.bondOriginators.find((item) => String(item.name || item.contactName || item.email || '').trim())
      const commissionType = primaryBondOriginator?.commission_type || legal.commission_type || 'purchase_price'
      const commissionPercentage = normalizeOptionalNumber(primaryBondOriginator?.commission_percentage ?? legal.commission_percentage)
      const developerTeam = buildDeveloperTeamFromAccess()
      const resolvedDeveloperCompany = isAgentContext && hasDeveloperAccessDraft()
        ? (developerAccess.mode === 'invite'
            ? String(developerAccess.inviteCompanyName || '').trim()
            : String(developerAccess.selectedDeveloperCompany || '').trim()) || effectiveDetails.developerCompany
        : effectiveDetails.developerCompany
      const rolePlayerDefaults = {
        defaultAgentSource: transactionDefaults.defaultAgentSource,
        defaultAgentRelationshipId: transactionDefaults.defaultAgentRelationshipId,
        defaultAgentPreferredPartnerId: transactionDefaults.defaultAgentPreferredPartnerId,
        defaultAgentName: transactionDefaults.defaultAgentName,
        multipleAgentsAllowed: transactionDefaults.multipleAgentsAllowed,
        developerSellingDirectly: transactionDefaults.developerSellingDirectly,
        defaultTransferAttorneySource: transactionDefaults.defaultTransferAttorneySource,
        defaultTransferAttorneyRelationshipId: transactionDefaults.defaultTransferAttorneyRelationshipId,
        defaultTransferAttorneyPreferredPartnerId: transactionDefaults.defaultTransferAttorneyPreferredPartnerId,
        defaultTransferAttorneyName: transactionDefaults.defaultTransferAttorneyName,
        defaultBondOriginatorSource: transactionDefaults.defaultBondOriginatorSource,
        defaultBondOriginatorRelationshipId: transactionDefaults.defaultBondOriginatorRelationshipId,
        defaultBondOriginatorPreferredPartnerId: transactionDefaults.defaultBondOriginatorPreferredPartnerId,
        defaultBondOriginatorName: transactionDefaults.defaultBondOriginatorName,
        buyerAppointedBondOriginatorAllowed: transactionDefaults.buyerAppointedBondOriginatorAllowed,
        buyerAppointedBondOriginatorRequiresApproval:
          transactionDefaults.buyerAppointedBondOriginatorRequiresApproval,
        autoInviteSelectedBondOriginator: transactionDefaults.autoInviteSelectedBondOriginator,
      }

      const created = await createDevelopmentWorkspace({
        details: {
          ...effectiveDetails,
          organisationId: workspace?.id || workspace?.organisation_id || workspace?.organisationId || null,
          developerCompany: resolvedDeveloperCompany,
          marketingContent: { listingOverview: { developmentType } },
          location: getResolvedDevelopmentLocation(effectiveDetails),
          totalUnitsExpected: unitConfigurationMethod === 'generate_range' ? stockSummary.totalUnits : normalizeOptionalNumber(effectiveDetails.totalUnitsExpected) ?? derivedTotals.unitCount,
        },
        financials: {
          ...financials,
          landCost: normalizeOptionalNumber(financials.landCost) ?? 0,
          buildCost: normalizeOptionalNumber(financials.buildCost) ?? 0,
          professionalFees: normalizeOptionalNumber(financials.professionalFees) ?? 0,
          marketingCost: normalizeOptionalNumber(financials.marketingCost) ?? 0,
          infrastructureCost: normalizeOptionalNumber(financials.infrastructureCost) ?? 0,
          otherCosts: normalizeOptionalNumber(financials.otherCosts) ?? 0,
          totalProjectedCost: derivedTotals.totalProjectedCost,
          projectedGrossSalesValue: normalizeOptionalNumber(financials.projectedGrossSalesValue) ?? 0,
          projectedProfit: derivedTotals.projectedProfit,
          targetMargin: Number(derivedTotals.targetMargin.toFixed(2)),
        },
        legal: {
          ...legal,
          attorneyFirmName: primaryConveyancer?.firmName || '',
          primaryContactName: primaryConveyancer?.contactName || '',
          primaryContactEmail: primaryConveyancer?.email || '',
          primaryContactPhone: primaryConveyancer?.phone || '',
          defaultFeeAmount: primaryConveyancer?.defaultFeeAmount || '',
          bondOriginatorName: primaryBondOriginator?.name || '',
          bondPrimaryContactName: primaryBondOriginator?.contactName || '',
          bondPrimaryContactEmail: primaryBondOriginator?.email || '',
          bondPrimaryContactPhone: primaryBondOriginator?.phone || '',
          commission_type: commissionType,
          commission_percentage: commissionPercentage,
          bondCommissionModelType: 'percentage',
          defaultCommissionAmount: commissionPercentage,
        },
        developmentSettings: {
          alteration_requests_enabled: Boolean(details.alterationsEnabled),
          reservation_deposit_enabled_by_default: Boolean(transactionDefaults.reservationDepositEnabled),
          reservation_deposit_amount: transactionDefaults.reservationDepositEnabled
            ? normalizeOptionalNumber(transactionDefaults.reservationDepositAmount)
            : null,
          reservation_deposit_amount_type: transactionDefaults.reservationDepositAmountType,
          reservation_deposit_payable_to: transactionDefaults.reservationDepositPayableTo,
          rolePlayerDefaults,
          enabledModules: legal.enabledModules,
          stakeholderTeams: {
            agents: legal.agents.filter((item) => String(item.name || item.email || item.company || '').trim()),
            conveyancers: legal.conveyancers.filter((item) => String(item.firmName || item.contactName || item.email || '').trim()),
            bondOriginators: legal.bondOriginators.filter((item) => String(item.name || item.contactName || item.email || '').trim()),
            developers: developerTeam,
            rolePlayerDefaults,
          },
        },
        productCatalogue: unitConfigurationMethod === 'generate_range' ? stockSummary.productCatalogue : null,
        structureNodes: unitConfigurationMethod === 'generate_range' ? stockSummary.structureNodes : [],
        units: (unitConfigurationMethod === 'generate_range' ? stockSummary.generatedUnits : [])
          .filter((unit) => String(unit.unitNumber || '').trim())
          .map((unit) => ({
            ...unit,
            sizeSqm: normalizeOptionalNumber(unit.sizeSqm),
            listPrice: normalizeOptionalNumber(unit.listPrice) ?? 0,
          })),
        documents: (unitConfigurationMethod === 'generate_range' ? buildFloorplanDocumentsFromUnitTypes(stockPlan.unitTypes) : documents)
          .filter((document) => String(document.title || '').trim())
          .map((document) => ({
            ...document,
            fileUrl: document.fileUrl,
          })),
      })

      setSavedDevelopment(created)
      const warnings = [...(created.warnings || [])]
      try {
        await upsertAreaFromAddress(buildDevelopmentAddressValue(effectiveDetails), { incrementListingCount: false })
      } catch {
        warnings.push({ message: 'The development was saved, but its area directory entry could not be updated.' })
      }

      if (isAgentContext && developerAccess.mode === 'invite') {
        const inviteEntry = developerTeam[0] || null
        if (inviteEntry?.onboardingLink) {
          const inviteWarnings = await sendDeveloperInviteNotifications({
            companyName: inviteEntry.company,
            contactName: inviteEntry.contactName || inviteEntry.name,
            recipientEmail: inviteEntry.email,
            recipientPhone: inviteEntry.phone,
            onboardingLink: inviteEntry.onboardingLink,
          })
          warnings.push(...inviteWarnings)
        }
      }

      onCreated?.(created)
      setSaveWarnings(warnings)
      if (!warnings.length) onClose()
    } catch (submitError) {
      if (submitError.developmentId) {
        const existing = { id: submitError.developmentId, name: details.name }
        setSavedDevelopment(existing)
        setSaveWarnings([{ message: submitError.message }])
        onCreated?.(existing)
      } else {
        setError(submitError.message)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (currentStepId !== 'review') {
      handleContinue()
      return
    }
    await submitDevelopment()
  }

  async function handleSaveDraft(event) {
    event.preventDefault()
    await submitDevelopment('draft')
  }

  if (!open) {
    return null
  }

  const primaryConveyancer = legal.conveyancers.find((item) => String(item.firmName || item.contactName || item.email || '').trim())
  const primaryBondOriginator = legal.bondOriginators.find((item) => String(item.name || item.contactName || item.email || '').trim())
  const defaultAgency = getPreferredDeveloperPartnerDefault(partnerDefaults, 'agency')
  const defaultTransferAttorney = getPreferredDeveloperPartnerDefault(partnerDefaults, 'transfer_attorney')
  const defaultBondOriginator = getPreferredDeveloperPartnerDefault(partnerDefaults, 'bond_originator')
  const transferAttorneyDefaultName =
    transactionDefaults.defaultTransferAttorneyName ||
    partnerDefaultName(defaultTransferAttorney) ||
    primaryConveyancer?.firmName ||
    ''
  const bondOriginatorDefaultName =
    transactionDefaults.defaultBondOriginatorName ||
    partnerDefaultName(defaultBondOriginator) ||
    primaryBondOriginator?.name ||
    ''
  const agencyDefaultName =
    transactionDefaults.defaultAgentName ||
    partnerDefaultName(defaultAgency) ||
    legal.agents.find((item) => String(item.company || item.name || item.email || '').trim())?.company ||
    ''
  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title="New Development"
      className="development-create-dialog"
    >
      <div className="space-y-5">
        <div className="overflow-x-auto">
          <ol className="development-create-progress" style={{ '--development-step-count': activeSteps.length }} aria-label="Development setup progress">
          {activeSteps.map((step, index) => {
            const status = index === stepIndex ? 'active' : index < stepIndex ? 'complete' : ''
            return (
              <li
                key={step.id}
                aria-current={status === 'active' ? 'step' : undefined}
                className={`flex items-center gap-2 ${
                  status === 'active'
                    ? 'text-[#142132]'
                    : status === 'complete'
                      ? 'text-[#1f7a5a]'
                      : 'text-[#6b7d93]'
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                    status === 'active'
                      ? 'border-[#102236] bg-[#102236] text-white'
                      : status === 'complete'
                        ? 'border-[#d8e7dc] bg-[#e8f6ef] text-[#1f7a5a]'
                        : 'border-[#d9e4f1] bg-white text-[#6b7d93]'
                  }`}
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  {index < stepIndex ? <button
                    type="button"
                    className="development-create-step-back"
                    aria-label={`Back to ${step.label}`}
                    disabled={saving || Boolean(savedDevelopment)}
                    onClick={() => { setError(''); setStepIndex(index) }}
                  >{step.label}</button> : <strong className="block text-sm font-semibold">{step.label}</strong>}
                </div>
                {index < activeSteps.length - 1 ? <span className="ml-1 hidden h-px flex-1 bg-[#dce5ef] lg:block" /> : null}
              </li>
            )
          })}
          </ol>
        </div>

        {error ? (
          <p role="alert" className="rounded-[18px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm font-medium text-[#b42318]">{error}</p>
        ) : null}

        {savedDevelopment ? (
          <div className="development-create-receipt" role="status">
            <strong>{details.name} has been created.</strong>
            {saveWarnings.length ? <ul>{saveWarnings.map((warning, index) => <li key={index}>{warning.message}</li>)}</ul> : null}
            <p>Continue in the saved development workspace to complete or check its setup.</p>
            <div className="flex flex-wrap items-center gap-3">
              <a className="font-semibold text-[#1f7a5a] underline" href={`/developments/${savedDevelopment.id}`}>Open development</a>
              <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
            </div>
          </div>
        ) : null}

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="development-create-form"
          noValidate
        >
          <fieldset className="development-create-content" disabled={saving || Boolean(savedDevelopment)}>
            <div className="min-w-0 space-y-6">
          {currentStepId === 'basic' ? (
            <div className="development-create-sections">
              <section className="development-create-section" aria-labelledby="development-details-heading">
                <h4 id="development-details-heading">Development Details</h4>
                <div className="development-create-fields">
                  <label className="full-width">Development Name
                    <input autoFocus value={details.name} onChange={(event) => setDetails((previous) => ({ ...previous, name: event.target.value }))} placeholder="e.g. Willow Park" />
                  </label>
                  <fieldset className="development-type-picker full-width">
                    <legend>Development Type</legend>
                    <div className="development-type-options">
                      {DEVELOPMENT_TYPES.map((option) => (
                        <label key={option.value} className={`development-type-option${developmentType === option.value ? ' is-selected' : ''}`}>
                          <input
                            type="radio"
                            name="developmentType"
                            value={option.value}
                            checked={developmentType === option.value}
                            onChange={() => setDevelopmentType(option.value)}
                          />
                          <span className="development-type-icon"><option.icon size={24} strokeWidth={1.7} aria-hidden="true" /></span>
                          <span>{option.label}</span>
                          {developmentType === option.value ? <Check className="development-type-check" size={16} aria-hidden="true" /> : null}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="full-width">
                    <AddressAutocomplete
                      label="Location / Address"
                      value={buildDevelopmentAddressValue(details)}
                      onChange={(nextAddress) => setDetails((previous) => mergeDevelopmentAddress(previous, nextAddress))}
                      onInputValueChange={(nextValue) => setDetails((previous) => ({
                        ...previous, address: nextValue, formattedAddress: nextValue,
                        streetAddress: nextValue, googlePlaceId: '', latitude: null, longitude: null,
                      }))}
                      hideUnavailableMessage
                      description="Search for an address or enter it manually below."
                      placeholder="Search or enter the street address"
                    />
                  </div>
                </div>
              </section>
              <section className="development-create-section" aria-labelledby="development-address-heading">
                <h4 id="development-address-heading">Address details</h4>
                <div className="development-create-fields">
                  <label>Suburb<input value={details.suburb} onChange={(event) => setDetails((previous) => ({ ...previous, suburb: event.target.value }))} /></label>
                  <label>City<input value={details.city} onChange={(event) => setDetails((previous) => ({ ...previous, city: event.target.value }))} /></label>
                  <label>Province<input value={details.province} onChange={(event) => setDetails((previous) => ({ ...previous, province: event.target.value }))} /></label>
                  <label>Postal Code<input value={details.postalCode} onChange={(event) => setDetails((previous) => ({ ...previous, postalCode: event.target.value }))} /></label>
                  <label>Country<input value={details.country} onChange={(event) => setDetails((previous) => ({ ...previous, country: event.target.value }))} /></label>
                </div>
              </section>
              <section className="development-create-section" aria-labelledby="development-project-heading">
                <h4 id="development-project-heading">Project information</h4>
                <div className="development-create-fields">
                  <label className="full-width">Development Code <span className="development-create-hint">Optional</span><input value={details.code} onChange={(event) => setDetails((previous) => ({ ...previous, code: event.target.value }))} /></label>
                  <label>Launch Date <span className="development-create-hint">Optional</span><input type="date" value={details.launchDate} onChange={(event) => setDetails((previous) => ({ ...previous, launchDate: event.target.value }))} /></label>
                  <label>Expected Completion <span className="development-create-hint">Optional</span><input type="date" value={details.expectedCompletionDate} onChange={(event) => setDetails((previous) => ({ ...previous, expectedCompletionDate: event.target.value }))} /></label>
                </div>
              </section>
            </div>
          ) : null}

          {currentStepId === 'financials' ? (
            <>
              <section className="development-create-section" aria-labelledby="development-sales-heading">
                <h4 id="development-sales-heading">Developer &amp; access</h4>
                <div className="development-create-fields mb-5">
                  <label className="full-width">Developer / Organisation
                    <input value={details.developerCompany} onChange={(event) => setDetails((previous) => ({ ...previous, developerCompany: event.target.value }))} placeholder="Developer company name" />
                  </label>
                </div>
              {isAgentContext ? (
                <div className="space-y-4">
                  <div>
                    <h5 className="text-sm font-semibold text-[#142132]">Developer Access</h5>
                    <p className="mt-1 text-sm text-[#6b7d93]">Optionally link an existing developer profile or invite a new developer when they are ready to access this development workspace.</p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    {[
                      { value: 'later', label: 'Add access later' },
                      { value: 'existing', label: 'Select Existing Developer' },
                      { value: 'invite', label: 'Invite New Developer' },
                    ].map((option) => <button
                      key={option.value}
                      type="button"
                      aria-pressed={developerAccess.mode === option.value}
                      onClick={() => updateDeveloperAccess('mode', option.value)}
                      className={`rounded-[10px] border px-4 py-3 text-left text-sm transition ${developerAccess.mode === option.value ? 'border-[#1f7a5a] bg-[#f3fbf5] text-[#1f6d3c]' : 'border-[#d8e3ef] bg-white text-[#35546c] hover:border-[#b7c8db]'}`}
                    >{option.label}</button>)}
                  </div>

                  {developerAccess.mode === 'existing' ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <label className="full-width">
                        Developer profile
                        <select value={developerAccess.selectedDeveloperId} onChange={(event) => handleSelectDeveloper(event.target.value)}>
                          <option value="">Select developer profile</option>
                          {developerOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                              {option.company ? ` · ${option.company}` : ''}
                              {option.email ? ` · ${option.email}` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      {developerAccess.selectedDeveloperId ? <p className="development-create-hint full-width">{[developerAccess.selectedDeveloperName, developerAccess.selectedDeveloperEmail, developerAccess.selectedDeveloperCompany].filter(Boolean).join(' · ')}</p> : null}
                    </div>
                  ) : developerAccess.mode === 'invite' ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <label>
                        Developer company name
                        <input
                          value={developerAccess.inviteCompanyName}
                          onChange={(event) => updateDeveloperAccess('inviteCompanyName', event.target.value)}
                          placeholder="Axis Property Group"
                        />
                      </label>
                      <label>
                        Developer contact name
                        <input
                          value={developerAccess.inviteContactName}
                          onChange={(event) => updateDeveloperAccess('inviteContactName', event.target.value)}
                          placeholder="Jane Smith"
                        />
                      </label>
                      <label>
                        Developer email
                        <input
                          type="email"
                          value={developerAccess.inviteEmail}
                          onChange={(event) => updateDeveloperAccess('inviteEmail', event.target.value)}
                          placeholder="developer@company.com"
                        />
                      </label>
                      <label>
                        Developer phone
                        <input
                          value={developerAccess.invitePhone}
                          onChange={(event) => updateDeveloperAccess('invitePhone', event.target.value)}
                          placeholder="+27 82 000 0000"
                        />
                      </label>
                    </div>
                  ) : null}

                  {developerAccess.mode === 'existing' && developerOptionsLoading ? <p className="text-sm text-[#6b7d93]">Loading developer profiles…</p> : null}
                  {developerAccess.mode === 'existing' && developerOptionsError ? <p className="text-sm text-[#b42318]">{developerOptionsError}</p> : null}
                </div>
              ) : null}
              </section>
              <section className="development-create-section">
                <div className="mb-4 space-y-1.5">
                  <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Transaction Defaults</h4>
                  {partnerDefaultsLoading ? (
                    <p className="text-sm text-[#6b7d93]">Loading Developer Partner defaults...</p>
                  ) : partnerDefaultsError ? (
                    <p className="text-sm text-[#b42318]">{partnerDefaultsError}</p>
                  ) : (
                    <p className="text-sm text-[#6b7d93]">
                      Optional defaults can be left blank and refined after setup.
                      {partnerDefaults.length ? ' Developer Partner defaults are available when needed.' : ''}
                    </p>
                  )}
                </div>
                <div className="development-create-fields">
                  {[
                    {
                      title: 'Default Agent', value: transactionDefaults.defaultAgentSource,
                      preferredValue: defaultAgency ? 'developer_partner_default' : 'first_agent',
                      partnerName: agencyDefaultName, defaultRecord: defaultAgency,
                      disabled: transactionDefaults.developerSellingDirectly,
                      onChange: (value) => setTransactionDefaults((previous) => ({
                        ...previous, defaultAgentSource: value,
                        defaultAgentRelationshipId: value === 'developer_partner_default' ? defaultAgency?.relationshipId || '' : '',
                        defaultAgentPreferredPartnerId: value === 'developer_partner_default' ? defaultAgency?.id || '' : '',
                        defaultAgentName: value === 'none' ? '' : agencyDefaultName,
                      })),
                    },
                    {
                      title: 'Transfer Attorney', value: transactionDefaults.defaultTransferAttorneySource,
                      preferredValue: defaultTransferAttorney ? 'developer_partner_default' : 'first_conveyancer',
                      partnerName: transferAttorneyDefaultName, defaultRecord: defaultTransferAttorney,
                      onChange: (value) => setTransactionDefaults((previous) => ({
                        ...previous, defaultTransferAttorneySource: value,
                        defaultTransferAttorneyRelationshipId: value === 'developer_partner_default' ? defaultTransferAttorney?.relationshipId || '' : '',
                        defaultTransferAttorneyPreferredPartnerId: value === 'developer_partner_default' ? defaultTransferAttorney?.id || '' : '',
                        defaultTransferAttorneyName: value === 'none' ? '' : transferAttorneyDefaultName,
                      })),
                    },
                    {
                      title: 'Bond Originator', value: transactionDefaults.defaultBondOriginatorSource,
                      preferredValue: defaultBondOriginator ? 'developer_partner_default' : 'first_bond_originator',
                      partnerName: bondOriginatorDefaultName, defaultRecord: defaultBondOriginator,
                      onChange: (value) => setTransactionDefaults((previous) => ({
                        ...previous, defaultBondOriginatorSource: value,
                        defaultBondOriginatorRelationshipId: value === 'developer_partner_default' ? defaultBondOriginator?.relationshipId || '' : '',
                        defaultBondOriginatorPreferredPartnerId: value === 'developer_partner_default' ? defaultBondOriginator?.id || '' : '',
                        defaultBondOriginatorName: value === 'none' ? '' : bondOriginatorDefaultName,
                      })),
                    },
                  ].map((card) => (
                    <label key={card.title}>
                      {card.title}
                      <select value={card.value} disabled={card.disabled} onChange={(event) => card.onChange(event.target.value)}>
                        <option value="none">Choose per transaction</option>
                        {card.partnerName ? <option value={card.preferredValue}>{card.partnerName}{card.defaultRecord ? ' (preferred partner)' : ''}</option> : null}
                      </select>
                    </label>
                  ))}
                </div>

                <div className="mt-6">
                  <div>
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-4 rounded-[20px] border border-[#dce6f1] bg-[#f8fbff] p-5">
                    <div>
                      <h5 className="text-base font-semibold tracking-[-0.02em] text-[#142132]">Reservation Settings</h5>
                      <p className="mt-1 text-xs leading-5 text-[#6b7d93]">Capture the standard reservation deposit prompt for new transactions.</p>
                    </div>
                    <label className="!flex-row !items-start !justify-between !gap-4 rounded-[16px] border border-[#dde4ee] bg-white p-4">
                      <span>
                        <strong className="block text-sm font-semibold text-[#142132]">Reservation deposit applies</strong>
                        <span className="mt-2 block text-sm leading-6 text-[#6b7d93]">New transactions should ask whether a reservation deposit is payable.</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={transactionDefaults.reservationDepositEnabled}
                        onChange={(event) =>
                          setTransactionDefaults((previous) => ({
                            ...previous,
                            reservationDepositEnabled: event.target.checked,
                          }))
                        }
                      />
                    </label>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label>
                        Reservation Deposit Amount
                        <span className="relative block">
                          {transactionDefaults.reservationDepositAmountType === 'fixed' ? (
                            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#6b7d93]">R</span>
                          ) : null}
                          <input
                            className={transactionDefaults.reservationDepositAmountType === 'fixed' ? '!pl-9' : ''}
                            type="number"
                            min="0"
                            step="0.01"
                            value={transactionDefaults.reservationDepositAmount}
                            disabled={!transactionDefaults.reservationDepositEnabled}
                            onChange={(event) =>
                              setTransactionDefaults((previous) => ({
                                ...previous,
                                reservationDepositAmount: event.target.value,
                              }))
                            }
                          />
                        </span>
                      </label>
                      <label>
                        Amount Type
                        <select
                          value={transactionDefaults.reservationDepositAmountType}
                          disabled={!transactionDefaults.reservationDepositEnabled}
                          onChange={(event) =>
                            setTransactionDefaults((previous) => ({
                              ...previous,
                              reservationDepositAmountType: event.target.value,
                            }))
                          }
                        >
                          <option value="fixed">Fixed rand amount</option>
                          <option value="percentage">Percentage of purchase price</option>
                        </select>
                      </label>
                      <label className="md:col-span-2">
                        Payable To
                        <select
                          value={transactionDefaults.reservationDepositPayableTo}
                          disabled={!transactionDefaults.reservationDepositEnabled}
                          onChange={(event) =>
                            setTransactionDefaults((previous) => ({
                              ...previous,
                              reservationDepositPayableTo: event.target.value,
                            }))
                          }
                        >
                          <option value="developer">Developer</option>
                          <option value="agency_trust">Agency trust account</option>
                          <option value="attorney_trust">Attorney trust account</option>
                        </select>
                      </label>
                    </div>
                    <p className="rounded-[16px] border border-[#dfe8f2] bg-white px-4 py-3 text-xs leading-5 text-[#6b7d93]">
                      Deposit treatment and alteration cost treatment are set on each transaction because they depend on the signed deal terms.
                    </p>
                  </div>

                  <div className="space-y-4 rounded-[20px] border border-[#dce6f1] bg-[#f8fbff] p-5">
                    <div>
                      <h5 className="text-base font-semibold tracking-[-0.02em] text-[#142132]">Transaction Behaviour</h5>
                      <p className="mt-1 text-xs leading-5 text-[#6b7d93]">Decide how buyer, agent, and bond workflows should behave by default.</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                    <label className="!flex-row !items-start !justify-between !gap-4 rounded-[16px] border border-[#dde4ee] bg-white p-4">
                      <span>
                        <strong className="block text-sm font-semibold text-[#142132]">Developer selling directly</strong>
                        <span className="mt-2 block text-sm leading-6 text-[#6b7d93]">Do not auto-assign an agent to new development transactions.</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={transactionDefaults.developerSellingDirectly}
                        onChange={(event) =>
                          setTransactionDefaults((previous) => ({
                            ...previous,
                            developerSellingDirectly: event.target.checked,
                            defaultAgentSource: event.target.checked ? 'none' : previous.defaultAgentSource,
                          }))
                        }
                      />
                    </label>
                    <label className="!flex-row !items-start !justify-between !gap-4 rounded-[16px] border border-[#dde4ee] bg-white p-4">
                      <span>
                        <strong className="block text-sm font-semibold text-[#142132]">Multiple agents allowed</strong>
                        <span className="mt-2 block text-sm leading-6 text-[#6b7d93]">Allow transactions to include co-agents from the agent team.</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={transactionDefaults.multipleAgentsAllowed}
                        disabled={transactionDefaults.developerSellingDirectly}
                        onChange={(event) =>
                          setTransactionDefaults((previous) => ({
                            ...previous,
                            multipleAgentsAllowed: event.target.checked,
                          }))
                        }
                      />
                    </label>
                    <label className="!flex-row !items-start !justify-between !gap-4 rounded-[16px] border border-[#dde4ee] bg-white p-4">
                      <span>
                        <strong className="block text-sm font-semibold text-[#142132]">Buyer may use own bond originator</strong>
                        <span className="mt-2 block text-sm leading-6 text-[#6b7d93]">Allow buyers to nominate their own originator during onboarding.</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={transactionDefaults.buyerAppointedBondOriginatorAllowed}
                        onChange={(event) =>
                          setTransactionDefaults((previous) => ({
                            ...previous,
                            buyerAppointedBondOriginatorAllowed: event.target.checked,
                            buyerAppointedBondOriginatorRequiresApproval:
                              event.target.checked && previous.buyerAppointedBondOriginatorRequiresApproval,
                          }))
                        }
                      />
                    </label>
                    <label className="!flex-row !items-start !justify-between !gap-4 rounded-[16px] border border-[#dde4ee] bg-white p-4">
                      <span>
                        <strong className="block text-sm font-semibold text-[#142132]">Approve buyer-appointed originators</strong>
                        <span className="mt-2 block text-sm leading-6 text-[#6b7d93]">Keep buyer nominations pending until the agent or developer approves them.</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={transactionDefaults.buyerAppointedBondOriginatorRequiresApproval}
                        disabled={!transactionDefaults.buyerAppointedBondOriginatorAllowed}
                        onChange={(event) =>
                          setTransactionDefaults((previous) => ({
                            ...previous,
                            buyerAppointedBondOriginatorRequiresApproval: event.target.checked,
                          }))
                        }
                      />
                    </label>
                    <label className="!flex-row !items-start !justify-between !gap-4 rounded-[16px] border border-[#dde4ee] bg-white p-4 md:col-span-2">
                    <span>
                      <strong className="block text-sm font-semibold text-[#142132]">Auto-invite selected bond originator</strong>
                      <span className="mt-2 block text-sm leading-6 text-[#6b7d93]">Automatically send an invite once a transaction has a selected originator.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={transactionDefaults.autoInviteSelectedBondOriginator}
                      onChange={(event) =>
                        setTransactionDefaults((previous) => ({
                          ...previous,
                          autoInviteSelectedBondOriginator: event.target.checked,
                        }))
                      }
                    />
                    </label>
                    </div>
                  </div>
                </div>
                  </div>
                </div>
              </section>

            </>
          ) : null}

          {currentStepId === 'legal' ? (
            <>
              <section className="development-create-section">
                <div className="space-y-1.5">
                  <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Modules & Delivery Partners</h4>
                  <p className="text-sm leading-6 text-[#6b7d93]">Select which modules apply to this development and add the teams that can later be allocated per transaction.</p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                <label className="!flex-row !items-start !justify-between !gap-4 rounded-[22px] border border-[#dde4ee] bg-[#f8fbff] p-4">
                  <div>
                    <strong className="block text-sm font-semibold text-[#142132]">Agent</strong>
                    <span className="mt-2 block text-sm leading-6 text-[#6b7d93]">Allow agent assignment from this development team list.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={legal.enabledModules.agent}
                    onChange={(event) =>
                      setLegal((previous) => ({
                        ...previous,
                        enabledModules: { ...previous.enabledModules, agent: event.target.checked },
                      }))
                    }
                  />
                </label>
                <label className="!flex-row !items-start !justify-between !gap-4 rounded-[22px] border border-[#dde4ee] bg-[#f8fbff] p-4">
                  <div>
                    <strong className="block text-sm font-semibold text-[#142132]">Conveyancing</strong>
                    <span className="mt-2 block text-sm leading-6 text-[#6b7d93]">Configure one or more conveyancers for transaction allocation and inherited development-level transaction access.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={legal.enabledModules.conveyancing}
                    onChange={(event) =>
                      setLegal((previous) => ({
                        ...previous,
                        enabledModules: { ...previous.enabledModules, conveyancing: event.target.checked },
                      }))
                    }
                  />
                </label>
                <label className="!flex-row !items-start !justify-between !gap-4 rounded-[22px] border border-[#dde4ee] bg-[#f8fbff] p-4">
                  <div>
                    <strong className="block text-sm font-semibold text-[#142132]">Bond Originator</strong>
                    <span className="mt-2 block text-sm leading-6 text-[#6b7d93]">Configure one or more bond originators for transaction allocation.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={legal.enabledModules.bond_originator}
                    onChange={(event) =>
                      setLegal((previous) => ({
                        ...previous,
                        enabledModules: { ...previous.enabledModules, bond_originator: event.target.checked },
                      }))
                    }
                  />
                </label>
                </div>
              </section>

              {legal.enabledModules.agent ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Agent Team</h4>
                    <p className="text-sm leading-6 text-[#6b7d93]">Current user is pre-assigned. Add co-agents or invite additional agents by entering their email details.</p>
                  </div>
                  {legal.agents.map((agent, index) => (
                    <div key={`agent-${index}`} className="rounded-[22px] border border-[#dde4ee] bg-white p-5">
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <label>
                          Agent Name
                          <input value={agent.name} onChange={(event) => updateLegalList('agents', index, 'name', event.target.value)} />
                        </label>
                        <label>
                          Agent Email
                          <input type="email" value={agent.email} onChange={(event) => updateLegalList('agents', index, 'email', event.target.value)} />
                        </label>
                        <label>
                          Company
                          <input value={agent.company} onChange={(event) => updateLegalList('agents', index, 'company', event.target.value)} />
                        </label>
                      </div>
                      {legal.agents.length > 1 ? (
                        <Button type="button" variant="ghost" className="mt-4 text-[#b42318] hover:bg-[#fff5f4]" onClick={() => setLegal((previous) => ({ ...previous, agents: previous.agents.filter((_, itemIndex) => itemIndex !== index) }))}>
                          <Trash2 size={14} />
                          Remove Agent
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  <Button type="button" variant="secondary" onClick={() => setLegal((previous) => ({ ...previous, agents: [...previous.agents, buildEmptyAgent()] }))}>
                    <Plus size={14} />
                    Add Another Agent
                  </Button>
                </div>
              ) : null}

              {legal.enabledModules.conveyancing ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Conveyancing Team</h4>
                    <p className="text-sm leading-6 text-[#6b7d93]">The first conveyancer entered here becomes the default mandated firm for this development, with automatic access to all development transactions.</p>
                  </div>
                  {legal.conveyancers.map((conveyancer, index) => (
                    <div key={`conveyancer-${index}`} className="rounded-[22px] border border-[#dde4ee] bg-white p-5">
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <label>
                          Firm Name
                          <input value={conveyancer.firmName} onChange={(event) => updateLegalList('conveyancers', index, 'firmName', event.target.value)} />
                        </label>
                        <label>
                          Contact Name
                          <input value={conveyancer.contactName} onChange={(event) => updateLegalList('conveyancers', index, 'contactName', event.target.value)} />
                        </label>
                        <label>
                          Contact Email
                          <input type="email" value={conveyancer.email} onChange={(event) => updateLegalList('conveyancers', index, 'email', event.target.value)} />
                        </label>
                        <label>
                          Contact Phone
                          <input value={conveyancer.phone} onChange={(event) => updateLegalList('conveyancers', index, 'phone', event.target.value)} />
                        </label>
                        <label>
                          Budgeted Transfer Fee Per Unit
                          <input type="number" min="0" value={conveyancer.defaultFeeAmount} onChange={(event) => updateLegalList('conveyancers', index, 'defaultFeeAmount', event.target.value)} />
                        </label>
                      </div>
                      {legal.conveyancers.length > 1 ? (
                        <Button type="button" variant="ghost" className="mt-4 text-[#b42318] hover:bg-[#fff5f4]" onClick={() => setLegal((previous) => ({ ...previous, conveyancers: previous.conveyancers.filter((_, itemIndex) => itemIndex !== index) }))}>
                          <Trash2 size={14} />
                          Remove Conveyancer
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  <Button type="button" variant="secondary" onClick={() => setLegal((previous) => ({ ...previous, conveyancers: [...previous.conveyancers, buildEmptyConveyancer()] }))}>
                    <Plus size={14} />
                    Add Another Conveyancer
                  </Button>
                </div>
              ) : null}

              {legal.enabledModules.bond_originator ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Bond Originators</h4>
                    <p className="text-sm leading-6 text-[#6b7d93]">The first originator entered here becomes the default commercial setup for this development.</p>
                  </div>
                  {legal.bondOriginators.map((originator, index) => (
                    <div key={`bond-originator-${index}`} className="rounded-[22px] border border-[#dde4ee] bg-white p-5">
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <label>
                          Originator Name
                          <input value={originator.name} onChange={(event) => updateLegalList('bondOriginators', index, 'name', event.target.value)} />
                        </label>
                        <label>
                          Contact Name
                          <input value={originator.contactName} onChange={(event) => updateLegalList('bondOriginators', index, 'contactName', event.target.value)} />
                        </label>
                        <label>
                          Contact Email
                          <input type="email" value={originator.email} onChange={(event) => updateLegalList('bondOriginators', index, 'email', event.target.value)} />
                        </label>
                        <label>
                          Contact Phone
                          <input value={originator.phone} onChange={(event) => updateLegalList('bondOriginators', index, 'phone', event.target.value)} />
                        </label>
                        <label>
                          Bond Originator Commission (%)
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="e.g. 1.25"
                            value={originator.commission_percentage || ''}
                            onChange={(event) => updateLegalList('bondOriginators', index, 'commission_percentage', event.target.value)}
                          />
                        </label>
                        <label>
                          Commission Calculation
                          <select
                            value={originator.commission_type || 'purchase_price'}
                            onChange={(event) => updateLegalList('bondOriginators', index, 'commission_type', event.target.value)}
                          >
                            <option value="purchase_price">% of Full Purchase Price</option>
                            <option value="bond_amount">% of Bond Granted</option>
                          </select>
                        </label>
                      </div>
                      {legal.bondOriginators.length > 1 ? (
                        <Button type="button" variant="ghost" className="mt-4 text-[#b42318] hover:bg-[#fff5f4]" onClick={() => setLegal((previous) => ({ ...previous, bondOriginators: previous.bondOriginators.filter((_, itemIndex) => itemIndex !== index) }))}>
                          <Trash2 size={14} />
                          Remove Bond Originator
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  <Button type="button" variant="secondary" onClick={() => setLegal((previous) => ({ ...previous, bondOriginators: [...previous.bondOriginators, buildEmptyBondOriginator()] }))}>
                    <Plus size={14} />
                    Add Another Bond Originator
                  </Button>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-3">
                <label className="!flex-row !items-start !justify-between !gap-4 rounded-[22px] border border-[#dde4ee] bg-[#f8fbff] p-4">
                  <div>
                    <strong className="block text-sm font-semibold text-[#142132]">VAT Included</strong>
                    <span className="mt-2 block text-sm leading-6 text-[#6b7d93]">Use VAT-inclusive legal fees by default.</span>
                  </div>
                  <input type="checkbox" checked={legal.vatIncluded} onChange={(event) => setLegal((previous) => ({ ...previous, vatIncluded: event.target.checked }))} />
                </label>
                <label className="!flex-row !items-start !justify-between !gap-4 rounded-[22px] border border-[#dde4ee] bg-[#f8fbff] p-4">
                  <div>
                    <strong className="block text-sm font-semibold text-[#142132]">Disbursements Included</strong>
                    <span className="mt-2 block text-sm leading-6 text-[#6b7d93]">Include disbursements in the fee default.</span>
                  </div>
                  <input type="checkbox" checked={legal.disbursementsIncluded} onChange={(event) => setLegal((previous) => ({ ...previous, disbursementsIncluded: event.target.checked }))} />
                </label>
                <label className="!flex-row !items-start !justify-between !gap-4 rounded-[22px] border border-[#dde4ee] bg-[#f8fbff] p-4">
                  <div>
                    <strong className="block text-sm font-semibold text-[#142132]">Manual Override Allowed</strong>
                    <span className="mt-2 block text-sm leading-6 text-[#6b7d93]">Allow transaction-level override of legal fee defaults.</span>
                  </div>
                  <input type="checkbox" checked={legal.overrideAllowed} onChange={(event) => setLegal((previous) => ({ ...previous, overrideAllowed: event.target.checked }))} />
                </label>
              </div>

              <div className="space-y-4 rounded-[24px] border border-[#dde4ee] bg-white p-5">
                <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Required Close-Out Documents</h4>
                <div className="grid gap-4 md:grid-cols-3">
                  {legal.requiredDocuments.map((item) => (
                    <label key={item.key} className="!flex-row !items-start !justify-between !gap-4 rounded-[22px] border border-[#dde4ee] bg-[#f8fbff] p-4">
                      <div>
                        <strong className="block text-sm font-semibold text-[#142132]">{item.label}</strong>
                        <span className="mt-2 block text-sm leading-6 text-[#6b7d93]">Required before the attorney close-out can be completed.</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={item.isRequired}
                        onChange={(event) =>
                          setLegal((previous) => ({
                            ...previous,
                            requiredDocuments: previous.requiredDocuments.map((requiredDocument) =>
                              requiredDocument.key === item.key ? { ...requiredDocument, isRequired: event.target.checked } : requiredDocument,
                            ),
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {currentStepId === 'units' ? (
              <section className="development-create-section" aria-labelledby="development-units-heading">
                <h4 id="development-units-heading">Units</h4>
                  <label className="development-planned-units">
                    Planned Units
                    <input type="number" min="0" step="1" value={details.totalUnitsExpected} onChange={(event) => setDetails((previous) => ({ ...previous, totalUnitsExpected: event.target.value }))} />
                  </label>
                  <fieldset className="development-unit-method">
                    <legend>Unit Configuration Method</legend>
                    <div className="development-unit-method-options">
                      {[
                        { value: 'manual', label: 'Add individual units later', description: 'Add units one at a time after creating the development.' },
                        { value: 'import_later', label: 'Import units later', description: 'Upload your unit list from the development workspace.' },
                        { value: 'generate_range', label: 'Set up units now', description: 'Define unit types, quantities and prices in the next step.' },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          aria-label={option.label}
                          aria-pressed={unitConfigurationMethod === option.value}
                          aria-describedby={`development-unit-method-${option.value}`}
                          onClick={() => { setError(''); setUnitConfigurationMethod(option.value); setUnits([]) }}
                          className={`development-unit-method-option${unitConfigurationMethod === option.value ? ' is-selected' : ''}`}
                        >
                          <span className="development-unit-method-title">{option.label}</span>
                          <span className="development-unit-method-description" id={`development-unit-method-${option.value}`}>{option.description}</span>
                          {unitConfigurationMethod === option.value ? <Check className="development-unit-method-check" size={16} aria-hidden="true" /> : null}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                <p className="development-create-hint mt-4">{unitConfigurationMethod === 'generate_range'
                  ? 'Next, set up your units. The final unit total will be calculated from your unit types.'
                  : `You can ${unitConfigurationMethod === 'manual' ? 'add individual units' : 'import or add units'} in the development workspace after creation.`}</p>
              </section>
          ) : null}

          {currentStepId === 'unit_setup' ? (
            <StockMasterSetup plan={stockPlan} onChange={updateStockPlan} step={stockStepIndex} onDefer={deferUnitSetup} />
          ) : null}

          {currentStepId === 'documents' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Development Documents / Assets</h4>
                <p className="text-sm leading-6 text-[#6b7d93]">Add floorplans, pricing sheets, brochures, site plans, and shared specification material.</p>
              </div>
              {documents.map((document, index) => (
                <div key={`document-${index}`} className="rounded-[22px] border border-[#dde4ee] bg-white p-5">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <label>
                      Document Type
                      <select value={document.documentType} onChange={(event) => updateDocument(index, 'documentType', event.target.value)}>
                        <option value="floorplan">Floorplan</option>
                        <option value="pricing">Pricing / Sales</option>
                        <option value="marketing">Marketing Asset</option>
                        <option value="site_plan">Site Plan</option>
                        <option value="legal">Development Legal / Compliance</option>
                        <option value="specification">Specification / Finishes</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label>
                      Title
                      <input value={document.title} onChange={(event) => updateDocument(index, 'title', event.target.value)} />
                    </label>
                    <label>
                      Linked Unit Type
                      <input value={document.linkedUnitType} onChange={(event) => updateDocument(index, 'linkedUnitType', event.target.value)} />
                    </label>
                    <label className="full-width">
                      File URL / Reference
                      <input value={document.fileUrl} onChange={(event) => updateDocument(index, 'fileUrl', event.target.value)} />
                    </label>
                    <label className="full-width">
                      Description
                      <textarea rows={3} value={document.description} onChange={(event) => updateDocument(index, 'description', event.target.value)} />
                    </label>
                  </div>
                  {documents.length > 1 ? (
                    <Button type="button" variant="ghost" className="mt-4 text-[#b42318] hover:bg-[#fff5f4]" onClick={() => setDocuments((previous) => previous.filter((_, itemIndex) => itemIndex !== index))}>
                      <Trash2 size={14} />
                      Remove Document
                    </Button>
                  ) : null}
                </div>
              ))}
              <Button type="button" variant="secondary" onClick={() => setDocuments((previous) => [...previous, buildEmptyDocument()])}>
                <Plus size={14} />
                Add Another Asset
              </Button>
            </div>
          ) : null}

          {currentStepId === 'review' ? (
            <section className="development-create-section" aria-labelledby="development-review-heading">
              <h4 id="development-review-heading">Review development</h4>
              <dl className="development-create-review">
                {[
                  ['Development', details.name],
                  ['Type', { residential: 'Residential', mixed_use: 'Mixed-use', estate: 'Estate', sectional_title: 'Sectional title' }[developmentType]],
                  ['Address', getResolvedDevelopmentLocation(details)],
                  ['Planned units', details.totalUnitsExpected || units.length || 'Set up later'],
                  ['Units to create now', units.length],
                  ['Developer', details.developerCompany || developerAccess.selectedDeveloperCompany || developerAccess.inviteCompanyName || 'Add later'],
                  ['Developer access', hasDeveloperAccessDraft() ? developerAccess.mode === 'invite' ? `Invite ${developerAccess.inviteEmail}` : developerAccess.selectedDeveloperName : 'Add later'],
                  ['Selling agent', transactionDefaults.developerSellingDirectly ? 'Developer selling directly' : transactionDefaults.defaultAgentSource === 'none' ? 'Choose per transaction' : agencyDefaultName],
                  ['Transfer attorney', transactionDefaults.defaultTransferAttorneySource === 'none' ? 'Choose per transaction' : transferAttorneyDefaultName],
                  ['Bond originator', transactionDefaults.defaultBondOriginatorSource === 'none' ? 'Choose per transaction' : bondOriginatorDefaultName],
                  ['Reservation deposit', transactionDefaults.reservationDepositEnabled ? `${transactionDefaults.reservationDepositAmountType === 'fixed' ? 'R ' : ''}${transactionDefaults.reservationDepositAmount}${transactionDefaults.reservationDepositAmountType === 'percentage' ? '%' : ''}` : 'No default deposit'],
                ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
              </dl>
              {units.length > 0 ? <p className="development-create-hint mt-4">Unit price range: {buildUnitPriceRange(stockPlan.unitTypes)}</p> : null}
              <p className="development-create-hint mt-4">This creates an internal development workspace. Public visibility is managed separately in Marketing.</p>
            </section>
          ) : null}
            </div>

          </fieldset>

          <footer className="development-create-footer">
            <Button
              type="button"
              variant="ghost"
              onClick={stepIndex === 0 ? onClose : handleBack}
              disabled={saving || Boolean(savedDevelopment)}
            >
              {stepIndex === 0 ? 'Cancel' : 'Back'}
            </Button>
            <div className="development-create-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={saving || Boolean(savedDevelopment)}
              onClick={handleSaveDraft}
            >
              Save Draft
            </Button>
            {stepIndex < maxStepIndex ? (
              <Button type="button" onClick={handleContinue} disabled={saving || Boolean(savedDevelopment)}>
                {currentStepId === 'unit_setup' && stockStepIndex === 2 ? 'Use these units' : 'Next'}
              </Button>
            ) : (
              <Button type="submit" disabled={saving || Boolean(savedDevelopment)}>
                {saving ? 'Creating…' : 'Create Development →'}
              </Button>
            )}
            </div>
          </footer>
        </form>
      </div>
    </Modal>
  )
}

export default AddDevelopmentModal
