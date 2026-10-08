import { Building2, Check, House, Plus, Trash2, Trees, Users, Wallet } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'
import { createDevelopmentWorkspace, fetchDeveloperAccessOptions, fetchDeveloperPartnersWorkspace } from '../lib/api'
import { upsertAreaFromAddress } from '../lib/location/upsertArea'
import { invokeEdgeFunction, isSupabaseConfigured } from '../lib/supabaseClient'
import { formatSouthAfricanWhatsAppNumber, sendWhatsAppNotification } from '../lib/whatsapp'
import AddressAutocomplete from './location/AddressAutocomplete'
import Button from './ui/Button'
import Modal from './ui/Modal'
import StockMasterSetup, { LayoutPreview } from './developments/StockMasterSetup'
import { buildStockSummary, buildStockTargets, createStockPlan, validateStockStep } from '../core/developments/developmentStockPlan.js'
import { clearDevelopmentDraft, developmentDraftScope, markDevelopmentDraftCreated, readDevelopmentDraft, restoreDevelopmentDraft, writeDevelopmentDraft } from '../core/developments/developmentCreateDraft.js'
import './developments/development-create.css'

const STEPS = [
  { id: 'basic', label: 'Details', description: 'Step 1' },
  { id: 'units', label: 'Units', description: 'Step 2' },
  { id: 'financials', label: 'Sales setup', description: 'Step 3' },
  { id: 'review', label: 'Review', description: 'Step 4' },
]

const DEVELOPMENT_TYPES = [
  { value: 'residential', label: 'Residential', icon: House },
  { value: 'mixed_use', label: 'Mixed-use', icon: Building2 },
  { value: 'estate', label: 'Estate', icon: Trees },
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
      if (!floorplanName || floorplan.file || !floorplan.fileUrl) return []

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
  const [stockEditor, setStockEditor] = useState(null)
  const stockEditing = Boolean(stockEditor)
  const [reviewEditing, setReviewEditing] = useState(false)
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
  const [unitConfigurationMethod, setUnitConfigurationMethod] = useState('later')
  const [savedDevelopment, setSavedDevelopment] = useState(null)
  const [saveWarnings, setSaveWarnings] = useState([])
  const [stockPlan, setStockPlan] = useState(createStockPlan)
  const [stockUndo, setStockUndo] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const formRef = useRef(null)
  const receiptRef = useRef(null)
  const undoRef = useRef(null)
  const [recovery, setRecovery] = useState(null)
  const [recovering, setRecovering] = useState(false)
  const [closeRequested, setCloseRequested] = useState(false)
  const [closing, setClosing] = useState(false)
  const [draftStatus, setDraftStatus] = useState('')
  const sessionRef = useRef({ open: false, scope: '' })
  const skipAutoSave = useRef(false)
  const restoredDraft = useRef(false)
  const draftScope = developmentDraftScope(profile, workspace, isAgentContext ? 'agent' : 'developer')
  const activeSteps = useMemo(() => getStepsForContext(unitConfigurationMethod), [unitConfigurationMethod])
  const currentStepId = activeSteps[stepIndex]?.id || activeSteps[0]?.id || 'basic'
  const maxStepIndex = Math.max(activeSteps.length - 1, 0)
  const progressSteps = activeSteps.filter((step) => step.id !== 'unit_setup')
  const progressStepIndex = progressSteps.findIndex((step) => step.id === (currentStepId === 'unit_setup' ? 'units' : currentStepId))

  const draftData = useMemo(() => ({ details, financials, transactionDefaults, legal, developerAccess, documents,
    developmentType, unitConfigurationMethod, stockPlan, stockEditor, stepId: currentStepId, stockStepIndex, reviewEditing,
  }), [details, financials, transactionDefaults, legal, developerAccess, documents, developmentType, unitConfigurationMethod, stockPlan, stockEditor, currentStepId, stockStepIndex, reviewEditing])
  const hasDraftChanges = Boolean(stepIndex || stockEditor || developmentType !== 'residential' || unitConfigurationMethod !== 'later' || Object.entries(DEFAULT_DETAILS).some(([key, value]) => details[key] !== value))

  useEffect(() => () => { sessionRef.current.open = false }, [])

  useEffect(() => {
    if (stockUndo && document.activeElement === document.body) undoRef.current?.focus()
  }, [stockUndo])

  useEffect(() => {
    formRef.current?.closest('.ui-modal-body')?.scrollTo?.({ top: 0 })
    const heading = savedDevelopment ? receiptRef.current?.querySelector('h4') : formRef.current?.querySelector('h4, h5, legend')
    if (heading) {
      heading.tabIndex = -1
      heading.focus({ preventScroll: true })
    }
  }, [stepIndex, stockStepIndex, error, savedDevelopment])

  useEffect(() => {
    if (!open) { sessionRef.current.open = false; return }
    if (sessionRef.current.open && sessionRef.current.scope === draftScope) return
    sessionRef.current = { open: true, scope: draftScope }
    skipAutoSave.current = true
    restoredDraft.current = false
    setRecovery(null)
    setRecovering(false)
    setClosing(false)
    setCloseRequested(false)
    setDraftStatus('')
    try { setRecovery(readDevelopmentDraft(draftScope)) }
    catch { setDraftStatus('Recovery unavailable') }

    setStepIndex(0)
    setStockStepIndex(0)
    setStockEditor(null)
    setReviewEditing(false)
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
    setUnitConfigurationMethod('later')
    setSavedDevelopment(null)
    setSaveWarnings([])
    setStockPlan(createStockPlan())
    setStockUndo(null)
    setSaving(false)
    setError('')
  }, [open, profile, workspace, draftScope])

  useEffect(() => {
    if (skipAutoSave.current) { skipAutoSave.current = false; return }
    if (!open || recovery || recovering || savedDevelopment || saving || sessionRef.current.scope !== draftScope) return
    if (!hasDraftChanges) {
      try { clearDevelopmentDraft(draftScope); setDraftStatus('') }
      catch { setDraftStatus('Recovery unavailable') }
      return
    }
    let cancelled = false
    setDraftStatus('Saving on this device…')
    try {
      const written = writeDevelopmentDraft(draftScope, draftData)
      written.then(() => { if (!cancelled) setDraftStatus('Saved on this device') })
        .catch(() => { if (!cancelled) setDraftStatus('Files not saved on this device') })
    } catch { setDraftStatus('Recovery unavailable') }
    return () => { cancelled = true }
  }, [draftData, draftScope, hasDraftChanges, open, recovery, recovering, savedDevelopment, saving])

  useEffect(() => {
    if (!open || recovery || savedDevelopment || !hasDraftChanges || draftStatus === 'Saved on this device') return
    const warnBeforeUnload = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [open, recovery, savedDevelopment, hasDraftChanges, draftStatus])

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
        if (defaults.length && !restoredDraft.current) {
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

  async function resumeDraft() {
    setRecovering(true)
    const session = sessionRef.current
    try {
      const data = await restoreDevelopmentDraft(recovery)
      if (sessionRef.current !== session || !session.open) return
      restoredDraft.current = true
      setDetails({ ...DEFAULT_DETAILS, ...data.details })
      setFinancials({ ...DEFAULT_FINANCIALS, ...data.financials })
      setTransactionDefaults({ ...DEFAULT_TRANSACTION_DEFAULTS, ...data.transactionDefaults })
      setLegal(data.legal)
      setDeveloperAccess({ ...DEFAULT_DEVELOPER_ACCESS, ...data.developerAccess })
      setDocuments(data.documents)
      setDevelopmentType(data.developmentType)
      setUnitConfigurationMethod(data.unitConfigurationMethod)
      setStockPlan(data.stockPlan)
      setStockUndo(null)
      setStockEditor(data.stockEditor)
      setStockStepIndex(data.stockEditor ? 1 : data.stockStepIndex)
      setReviewEditing(Boolean(data.reviewEditing))
      const steps = getStepsForContext(data.unitConfigurationMethod)
      setStepIndex(Math.max(0, steps.findIndex((step) => step.id === (data.stockEditor ? 'unit_setup' : data.stepId))))
      setUnits(data.unitConfigurationMethod === 'generate_range' ? buildStockSummary(data.stockPlan).generatedUnits : [])
      setRecovery(null)
    } catch { if (sessionRef.current === session && session.open) setError('Could not restore this draft. Start fresh or try again.') }
    finally { if (sessionRef.current === session && session.open) setRecovering(false) }
  }

  function startFresh() {
    try { clearDevelopmentDraft(draftScope); setRecovery(null); setError('') }
    catch { setError('Could not clear this draft. Try again.') }
  }

  async function requestClose() {
    if (saving || closing || recovering || closeRequested) return
    if (recovery || savedDevelopment || !hasDraftChanges) { onClose(); return }
    const session = sessionRef.current
    setClosing(true)
    try {
      await writeDevelopmentDraft(draftScope, draftData)
      if (sessionRef.current === session && session.open) onClose()
    } catch { if (sessionRef.current === session && session.open) setCloseRequested(true) }
    finally { if (sessionRef.current === session && session.open) setClosing(false) }
  }

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

  function editReviewSection(id) {
    setError('')
    setReviewEditing(true)
    setStockStepIndex(0)
    setStepIndex(activeSteps.findIndex((step) => step.id === id))
  }

  function handleNext() {
    try {
      setError('')
      validateCurrentStep()
      setStepIndex(reviewEditing && (currentStepId !== 'units' || unitConfigurationMethod === 'later')
        ? activeSteps.findIndex((step) => step.id === 'review')
        : Math.min(stepIndex + 1, maxStepIndex))
      if (reviewEditing && (currentStepId !== 'units' || unitConfigurationMethod === 'later')) setReviewEditing(false)
    } catch (stepError) {
      setError(stepError.message)
    }
  }

  function updateStockPlan(updater, undoLabel = '') {
    setStockUndo(undoLabel ? { plan: stockPlan, label: undoLabel } : null)
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

  function undoStockChange() {
    if (!stockUndo || saving || closing || stockEditing || savedDevelopment) return
    setStockPlan(stockUndo.plan)
    setStockUndo(null)
    setError('')
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
    if (currentStepId === 'review') setReviewEditing(false)
    setError('')
    if (currentStepId === 'unit_setup' && stockStepIndex > 0) {
      handleStockStepBack()
      return
    }
    setStepIndex((previous) => Math.max(previous - 1, 0))
  }

  function deferUnitSetup() {
    setError('')
    setUnitConfigurationMethod('later')
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
      setStepIndex(reviewEditing ? activeSteps.findIndex((step) => step.id === 'review') : Math.min(stepIndex + 1, maxStepIndex))
      setReviewEditing(false)
    } catch (stockError) {
      setError(stockError.message)
    }
  }

  function handleContinue(event) {
    // The final step replaces this button with a submit button during the click.
    // Cancel the original click's default action before React updates its type.
    event?.preventDefault()
    if (stockEditing || saving || closing) return
    if (currentStepId === 'unit_setup') {
      if (stockStepIndex === 2) handleFinalizeStock()
      else handleStockStepNext()
    } else {
      handleNext()
    }
  }

  async function submitDevelopment(statusOverride = '') {
    if (saving || closing || savedDevelopment || stockEditing) return
    const submissionSession = sessionRef.current
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
          const missing = stockPlan.unitTypes.flatMap((type) => type.floorplans).find((layout) => layout.recoveryFileName)
          if (missing) throw new Error(`Reattach or remove the missing floor plan for ${missing.name}.`)
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

      const warnings = [...(created.warnings || [])]
      try { markDevelopmentDraftCreated(draftScope, { ...created, name: details.name }) }
      catch { warnings.push({ message: 'Saved. Local draft cleanup failed; open this development before starting another.' }) }
      if (sessionRef.current !== submissionSession || !submissionSession.open) return
      setSavedDevelopment({ ...created, creationStatus: statusOverride || 'active' })
      setStockUndo(null)
      try {
        await upsertAreaFromAddress(buildDevelopmentAddressValue(effectiveDetails), { incrementListingCount: false })
      } catch {
        warnings.push({ message: 'The development was saved, but its area directory entry could not be updated.' })
      }

      if (sessionRef.current !== submissionSession || !submissionSession.open) return
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

      if (sessionRef.current !== submissionSession || !submissionSession.open) return
      onCreated?.(created)
      setSaveWarnings(warnings)
      if (!warnings.length) clearDevelopmentDraft(draftScope)
    } catch (submitError) {
      if (submitError.developmentId) {
        const existing = { id: submitError.developmentId, name: details.name }
        const warnings = [{ message: submitError.message }]
        try { markDevelopmentDraftCreated(draftScope, existing) }
        catch { warnings.push({ message: 'Saved. Local draft cleanup failed; open this development before starting another.' }) }
        if (sessionRef.current !== submissionSession || !submissionSession.open) return
        setSavedDevelopment({ ...existing, creationStatus: statusOverride || 'active', setupIncomplete: true })
        setStockUndo(null)
        setSaveWarnings(warnings)
        onCreated?.(existing)
      } else if (sessionRef.current === submissionSession && submissionSession.open) {
        setError(submitError.message)
      }
    } finally {
      if (sessionRef.current === submissionSession && submissionSession.open) setSaving(false)
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

  function handleWizardKeyDown(event) {
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return
    const key = event.key.toLowerCase()
    if (key === 's' || key === 'enter') event.preventDefault()
    if (event.repeat || recovery || recovering || closeRequested || savedDevelopment || saving || closing || stockEditing) return
    if (key === 's') void handleSaveDraft(event)
    else if (key === 'enter' && currentStepId !== 'review') handleContinue(event)
    else if (key === 'z' && !event.shiftKey && currentStepId === 'unit_setup' && stockUndo && !event.target.closest('input, textarea, select, [contenteditable="true"]')) { event.preventDefault(); undoStockChange() }
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
  const reviewLayouts = unitConfigurationMethod === 'generate_range'
    ? stockPlan.unitTypes.flatMap((type) => type.floorplans.map((layout) => ({ type, layout })))
    : []
  const developerName = isAgentContext && hasDeveloperAccessDraft()
    ? (developerAccess.mode === 'invite' ? developerAccess.inviteCompanyName : developerAccess.selectedDeveloperCompany) || details.developerCompany || 'Add later'
    : details.developerCompany || 'Add later'
  const developerInvited = isAgentContext && developerAccess.mode === 'invite' && hasDeveloperAccessDraft()
  const depositSummary = transactionDefaults.reservationDepositEnabled
    ? transactionDefaults.reservationDepositAmountType === 'percentage'
      ? `${transactionDefaults.reservationDepositAmount}%`
      : formatCurrency(transactionDefaults.reservationDepositAmount)
    : 'No default deposit'
  const returningToReview = reviewEditing && (currentStepId === 'basic' || currentStepId === 'financials' || (currentStepId === 'units' && unitConfigurationMethod === 'later') || (currentStepId === 'unit_setup' && stockStepIndex === 2))
  return (
    <Modal
      open={open}
      onClose={saving || closing || recovering ? undefined : requestClose}
      title="New Development"
      className={`development-create-dialog${recovery || closeRequested || savedDevelopment ? ' development-create-dialog--recovery' : ''}`}
    >
      <div className="space-y-5" onKeyDown={handleWizardKeyDown}>
        {!recovery && !closeRequested && !savedDevelopment ? <div className="overflow-x-auto">
          <ol className="development-create-progress" style={{ '--development-step-count': progressSteps.length }} aria-label="Development setup progress">
          {progressSteps.map((step, index) => {
            const status = index === progressStepIndex ? 'active' : index < progressStepIndex ? 'complete' : ''
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
                  {index < progressStepIndex ? <button
                    type="button"
                    className="development-create-step-back"
                    aria-label={`Back to ${step.label}`}
                    disabled={saving || closing || Boolean(savedDevelopment) || stockEditing}
                    onClick={() => { setError(''); setReviewEditing(false); setStepIndex(activeSteps.findIndex((entry) => entry.id === step.id)) }}
                  >{step.label}</button> : <strong className="block text-sm font-semibold">{step.label}</strong>}
                </div>
                {index < progressSteps.length - 1 ? <span className="ml-1 hidden h-px flex-1 bg-[#dce5ef] lg:block" /> : null}
              </li>
            )
          })}
          </ol>
        </div> : null}

        {error ? (
          <p role="alert" className="rounded-[18px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm font-medium text-[#b42318]">{error}</p>
        ) : null}

        {savedDevelopment ? (
          <section className={`development-create-receipt${saveWarnings.length ? ' is-warning' : ''}`} role="status" ref={receiptRef} aria-label="Development saved">
            <span className="development-complete-icon"><Check size={24} aria-hidden="true" /></span>
            <span className="development-complete-label">{saving ? 'Finishing setup…' : saveWarnings.length ? 'Saved · needs attention' : savedDevelopment.creationStatus === 'draft' ? 'Draft saved' : 'Ready to go'}</span>
            <h4>{details.name}{savedDevelopment.creationStatus === 'draft' ? ' saved as a draft.' : ' has been created.'}</h4>
            {!savedDevelopment.setupIncomplete ? <p className="development-complete-summary">{unitConfigurationMethod === 'generate_range' ? `${units.length} ${units.length === 1 ? 'unit' : 'units'} added` : 'Units can be added later'}</p> : null}
            {saveWarnings.length ? <ul>{saveWarnings.map((warning, index) => <li key={index}>{warning.message}</li>)}</ul> : null}
            <div className="development-draft-actions">
              <Button type="button" variant="secondary" disabled={saving || closing} onClick={onClose}>Done</Button>
              <Button asChild><a href={saving ? undefined : `/developments/${encodeURIComponent(savedDevelopment.id)}`} aria-disabled={saving || undefined} onClick={(event) => { if (saving) event.preventDefault() }}>Open development</a></Button>
            </div>
          </section>
        ) : null}

        {recovery ? <section className="development-draft-recovery" aria-label="Draft recovery">
          <strong>{recovery.savedDevelopment ? 'Development already saved' : 'Continue your draft?'}</strong>
          <span>{recovery.savedDevelopment?.name || recovery.data?.details?.name || 'New development'}</span>
          <div className="development-draft-actions">
            <Button type="button" variant="secondary" disabled={recovering} onClick={startFresh}>Start fresh</Button>
            {recovery.savedDevelopment ? <a className="development-review-edit" href={`/developments/${encodeURIComponent(recovery.savedDevelopment.id)}`}>Open development</a> : <Button type="button" disabled={recovering} onClick={resumeDraft}>{recovering ? 'Restoring…' : 'Resume draft'}</Button>}
          </div>
        </section> : closeRequested ? <section className="development-draft-recovery" aria-label="Recovery unavailable">
          <strong>Leave without recovery?</strong>
          <div className="development-draft-actions"><Button type="button" variant="secondary" onClick={() => setCloseRequested(false)}>Keep editing</Button><Button type="button" onClick={onClose}>Leave</Button></div>
        </section> : savedDevelopment ? null : <>
          {!savedDevelopment && hasDraftChanges ? <p className="development-draft-status" role="status">{closing ? 'Saving on this device…' : draftStatus}</p> : null}
          {currentStepId === 'unit_setup' && stockUndo ? <div className="development-stock-undo" role="status"><span>{stockUndo.label}</span><Button ref={undoRef} type="button" variant="ghost" size="sm" disabled={saving || closing || stockEditing} aria-keyshortcuts="Control+z Meta+z" title="Undo (Ctrl/⌘ + Z outside text fields)" onClick={undoStockChange}>Undo</Button></div> : null}
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="development-create-form"
          noValidate
        >
          <fieldset className="development-create-content" disabled={saving || closing || Boolean(savedDevelopment)}>
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
            <div className="development-sales-sections">
              <section className="development-sales-card" aria-labelledby="development-sales-heading">
                <div className="development-sales-heading"><Building2 size={20} aria-hidden="true" /><h4 id="development-sales-heading">Developer</h4><span>Optional</span></div>
                <div className="development-create-fields">
                  <label className="full-width">Developer / Organisation
                    <input value={details.developerCompany} onChange={(event) => setDetails((previous) => ({ ...previous, developerCompany: event.target.value }))} placeholder="Developer company name" />
                  </label>
                </div>
              {isAgentContext ? (
                <div className="space-y-4">
                  <div>
                    <h5 className="development-sales-label">Developer access <span>Optional</span></h5>

                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    {[
                      { value: 'later', label: 'Add access later' },
                      { value: 'existing', label: 'Link developer' },
                      { value: 'invite', label: 'Invite developer' },
                    ].map((option) => <button
                      key={option.value}
                      type="button"
                      aria-pressed={developerAccess.mode === option.value}
                      onClick={() => updateDeveloperAccess('mode', option.value)}
                      className={`rounded-[10px] border px-4 py-3 text-left text-sm transition ${developerAccess.mode === option.value ? 'border-[#1f7a5a] bg-[#f3fbf5] text-[#1f6d3c]' : 'border-[#d8e3ef] bg-white text-[#35546c] hover:border-[#b7c8db]'}`}
                    >{option.label}</button>)}
                  </div>

                  {developerAccess.mode === 'existing' ? (
                    <div className="development-create-fields">
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
                    <div className="development-create-fields">
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
              <section className="development-sales-card" aria-labelledby="development-team-heading">
                <div className="development-sales-heading"><Users size={20} aria-hidden="true" /><h4 id="development-team-heading">Sales team</h4><span>Optional</span></div>
                    <label className="development-sales-toggle">
                      <span>
                        <strong className="block text-sm font-semibold text-[#142132]">Developer selling directly</strong>
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
                <div className="development-create-fields">
                  <label className="full-width">Selling agent
                    <select value={transactionDefaults.defaultAgentSource} disabled={transactionDefaults.developerSellingDirectly} onChange={(event) => {
                      const value = event.target.value
                      setTransactionDefaults((previous) => ({
                        ...previous, defaultAgentSource: value,
                        defaultAgentRelationshipId: value === 'developer_partner_default' ? defaultAgency?.relationshipId || '' : '',
                        defaultAgentPreferredPartnerId: value === 'developer_partner_default' ? defaultAgency?.id || '' : '',
                        defaultAgentName: value === 'none' ? '' : agencyDefaultName,
                      }))
                    }}>
                      <option value="none">Choose per transaction</option>
                      {agencyDefaultName ? <option value={defaultAgency ? 'developer_partner_default' : 'first_agent'}>{agencyDefaultName}{defaultAgency ? ' (preferred partner)' : ''}</option> : null}
                    </select>
                  </label>
                </div>
                {partnerDefaultsLoading ? <p className="development-create-hint">Loading partners…</p> : null}
                {partnerDefaultsError ? <p className="text-sm text-[#b42318]">{partnerDefaultsError}</p> : null}
              </section>
              <section className="development-sales-card" aria-labelledby="development-deposit-heading">
                <div className="development-sales-heading"><Wallet size={20} aria-hidden="true" /><h4 id="development-deposit-heading">Reservation deposit</h4><span>Optional</span></div>
                    <label className="development-sales-toggle">
                      <span>
                        <strong className="block text-sm font-semibold text-[#142132]">Reservation deposit applies</strong>
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
                {transactionDefaults.reservationDepositEnabled ? (
                    <div className="development-create-fields">
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

                ) : null}
              </section>
              <details className="development-sales-more">
                <summary>More settings</summary>
                <div className="development-sales-extras">
                  <div className="development-create-fields">
                  {[
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
                    <label className="development-sales-toggle">
                      <span>
                        <strong className="block text-sm font-semibold text-[#142132]">Multiple agents allowed</strong>
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
                    <label className="development-sales-toggle">
                      <span>
                        <strong className="block text-sm font-semibold text-[#142132]">Buyer may use own bond originator</strong>
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
                    <label className="development-sales-toggle">
                      <span>
                        <strong className="block text-sm font-semibold text-[#142132]">Approve buyer-appointed originators</strong>
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
                    <label className="development-sales-toggle">
                    <span>
                      <strong className="block text-sm font-semibold text-[#142132]">Auto-invite selected bond originator</strong>
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
                  <p className="development-create-hint">Originator invites are sent when assigned to a transaction.</p>
                </div>
              </details>
            </div>
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
                        { value: 'generate_range', label: 'Set up units now', description: 'Add unit layouts, quantities and prices in the next step.' },
                        { value: 'later', label: 'Set up units later', description: 'Add or import units from the development workspace after creation.' },
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
                  ? 'Next, set up your units. The final unit total will be calculated from your layouts.'
                  : 'You can add or import units in the development workspace after creation.'}</p>
              </section>
          ) : null}

          {currentStepId === 'unit_setup' ? (
            <StockMasterSetup plan={stockPlan} onChange={updateStockPlan} step={stockStepIndex} onDefer={deferUnitSetup} plannedUnits={details.totalUnitsExpected} editor={stockEditor} onEditorChange={setStockEditor} />
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
            <div className="development-review" role="region" aria-label="Review development">
              <section className="development-review-hero" aria-labelledby="development-review-heading">
                <div className="development-review-heading">
                  <span className="development-review-badge">{DEVELOPMENT_TYPES.find((option) => option.value === developmentType)?.label}</span>
                  <button type="button" className="development-review-edit" aria-label="Edit development details" onClick={() => editReviewSection('basic')}>Edit</button>
                </div>
                <h4 id="development-review-heading">{details.name}</h4>
                <p>{getResolvedDevelopmentLocation(details)}</p>
                {details.code || details.launchDate || details.expectedCompletionDate ? <dl className="development-review-facts">
                  {[
                    ['Code', details.code], ['Launch', details.launchDate], ['Completion', details.expectedCompletionDate],
                  ].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
                </dl> : null}
              </section>
              <section className="development-review-card" aria-labelledby="development-review-units">
                <div className="development-review-heading"><h4 id="development-review-units">Units</h4><button type="button" className="development-review-edit" aria-label="Edit units" onClick={() => editReviewSection('units')}>Edit</button></div>
                <div className="development-review-metrics">
                  <div><strong>{unitConfigurationMethod === 'generate_range' ? stockSummary.totalUnits : details.totalUnitsExpected || '—'}</strong><span>{unitConfigurationMethod === 'generate_range' ? 'Units to create now' : 'Planned units'}</span></div>
                  {reviewLayouts.length ? <div><strong>{reviewLayouts.length}</strong><span>{reviewLayouts.length === 1 ? 'Layout' : 'Layouts'}</span></div> : null}
                  {reviewLayouts.length ? <div><strong>{buildUnitPriceRange(stockPlan.unitTypes)}</strong><span>Price range</span></div> : null}
                </div>
                {reviewLayouts.length ? <ul className="development-review-layouts" aria-label="Unit layouts">{reviewLayouts.map(({ type, layout }) => <li key={layout.id}>
                  <LayoutPreview file={layout.file} fileUrl={layout.fileUrl} name={layout.name} emptyLabel="" />
                  <div><strong>{layout.name}</strong><span>{type.bedrooms} bed · {type.bathrooms} bath{layout.sizeSqm ? ` · ${layout.sizeSqm} m²` : ''}</span><span>{layout.propertyType || type.name} · {layout.quantity} units</span></div>
                </li>)}</ul> : <p className="development-create-hint">Set up units later</p>}
              </section>
              <section className="development-review-card" aria-labelledby="development-review-sales">
                <div className="development-review-heading"><h4 id="development-review-sales">Sales setup</h4><button type="button" className="development-review-edit" aria-label="Edit sales setup" onClick={() => editReviewSection('financials')}>Edit</button></div>
                <dl className="development-review-facts">
                  {[
                    ['Developer', developerName],
                    ...(isAgentContext ? [['Developer access', developerInvited ? developerAccess.inviteContactName : hasDeveloperAccessDraft() ? developerAccess.selectedDeveloperName : 'Add later']] : []),
                    ['Selling agent', transactionDefaults.developerSellingDirectly ? 'Developer selling directly' : transactionDefaults.defaultAgentSource === 'none' ? 'Choose per transaction' : agencyDefaultName],
                    ['Reservation deposit', depositSummary],
                    ...(transactionDefaults.reservationDepositEnabled ? [['Payable to', { developer: 'Developer', agency_trust: 'Agency trust account', attorney_trust: 'Attorney trust account' }[transactionDefaults.reservationDepositPayableTo]]] : []),
                    ['Transfer attorney', transactionDefaults.defaultTransferAttorneySource === 'none' ? 'Choose per transaction' : transferAttorneyDefaultName],
                    ['Bond originator', transactionDefaults.defaultBondOriginatorSource === 'none' ? 'Choose per transaction' : bondOriginatorDefaultName],
                  ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
                </dl>
                <details className="development-review-settings">
                  <summary>More settings</summary>
                  <dl className="development-review-facts">
                    {[
                      ['Multiple agents', transactionDefaults.multipleAgentsAllowed && !transactionDefaults.developerSellingDirectly ? 'Allowed' : 'Off'],
                      ['Buyer’s own originator', transactionDefaults.buyerAppointedBondOriginatorAllowed ? transactionDefaults.buyerAppointedBondOriginatorRequiresApproval ? 'Approval required' : 'Allowed' : 'Off'],
                      ['Originator invites', transactionDefaults.autoInviteSelectedBondOriginator ? 'When assigned' : 'Off'],
                    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
                  </dl>
                </details>
                {developerInvited ? <p className="development-review-invite">On save: email invitation to {developerAccess.inviteEmail}{formatSouthAfricanWhatsAppNumber(developerAccess.invitePhone) ? ` + WhatsApp to ${developerAccess.invitePhone}` : ''}.</p> : null}
                {transactionDefaults.autoInviteSelectedBondOriginator ? <p className="development-create-hint">Originator invites are sent when assigned to a transaction.</p> : null}
              </section>
              <p className="development-review-private"><Check size={15} aria-hidden="true" />Internal workspace · Publish later in Marketing</p>
            </div>
          ) : null}
            </div>

          </fieldset>

          <footer className="development-create-footer">
            <Button
              type="button"
              variant="ghost"
              onClick={stepIndex === 0 ? requestClose : handleBack}
              disabled={saving || closing || Boolean(savedDevelopment) || stockEditing}
            >
              {stepIndex === 0 ? 'Cancel' : 'Back'}
            </Button>
            <div className="development-create-actions">
            <Button
              type="button"
              variant="secondary"
              aria-keyshortcuts="Control+s Meta+s"
              title="Save draft (Ctrl/⌘ + S)"
              disabled={saving || closing || Boolean(savedDevelopment) || stockEditing}
              onClick={handleSaveDraft}
            >
              {saving ? 'Saving…' : 'Save Draft'}
            </Button>
            {stepIndex < maxStepIndex ? (
              <Button type="button" aria-keyshortcuts="Control+Enter Meta+Enter" title="Continue (Ctrl/⌘ + Enter)" onClick={handleContinue} disabled={saving || closing || Boolean(savedDevelopment) || stockEditing}>
                {returningToReview ? 'Back to review' : currentStepId === 'unit_setup' && stockStepIndex === 2 ? 'Use these units' : 'Next'}
              </Button>
            ) : (
              <Button type="submit" disabled={saving || closing || Boolean(savedDevelopment)}>
                {saving ? 'Saving…' : 'Create Development →'}
              </Button>
            )}
            </div>
          </footer>
        </form>
        </>}
      </div>
    </Modal>
  )
}

export default AddDevelopmentModal
