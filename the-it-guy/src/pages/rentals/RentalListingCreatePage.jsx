import ListingLandSizeInput from '../../components/listings/ListingLandSizeInput'
import Modal from '../../components/ui/Modal'
import ListingReviewDetails from '../../components/listings/ListingReviewDetails'
import { RENTAL_SAVED_NOT_SENT_MESSAGE } from '../../services/listings/listingCaptureModel'
import { saveListingRecoveryDraft, readListingRecoveryDraft, clearListingRecoveryDraft, writeListingTextRecoveryDraft, listingRecoveryRevision, reconcileListingEditRecovery } from '../../services/listings/listingDraftRecovery'
import useListingRecoveryProtection from '../../hooks/useListingRecoveryProtection'
import ListingSaveStatus from '../../components/listings/ListingSaveStatus'
import ListingCaptureLayout from '../../components/listings/ListingCaptureLayout'
import { RENT_PREVIEW_UNITS, listingTitleExample } from '../../services/listings/listingAdvertPreviewModel'
import { isRentalListingDraft } from '../../services/rentals/rentalListingIndexModel'
import ListingChannelLogo from '../../components/listings/ListingChannelLogo'
import ListingFieldIssues from '../../components/listings/ListingFieldIssues'
import { getSyndicationChannelAvailability, UNAVAILABLE_SYNDICATION_CHANNELS } from '../../services/syndicationChannelAvailabilityService'
import { isRentalCreationId, serializeRentalCreationDraft } from '../../services/rentals/rentalListingCreationRecovery'
import { buildRentalWorkspaceKey, buildRentalListingDraftStorageKey, buildRentalListingQueryOptions } from '../../services/rentals/rentalWorkspaceScope'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Blocks, Building2, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Coins, FileText, Globe2, House, ImagePlus, Landmark, LandPlot, Loader2, Minus, Plus, Save, ShieldCheck, Sprout, Store, Trash2, UserRound, Users, Wallet, Warehouse, X } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import useListingCaptureSession from '../../hooks/useListingCaptureSession'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import './rental-listing-create.css'
import AddressAutocomplete from '../../components/location/AddressAutocomplete'
import Button from '../../components/ui/Button'
import ListingSyndicationChannelCard from '../../components/listings/ListingSyndicationChannelCard'
import RentalCategoryFields from '../../components/listings/RentalCategoryFields'
import { rentalFeatureAnswerLabels, restoreRentalFeatureSelections } from '../../services/rentals/rentalFeatureCaptureModel'
import { RENTAL_CATEGORY_TYPES, RENTAL_PORTAL_FIELDS } from '../../services/rentals/rentalPortalFieldContract'
import { activateRentalListing, createRentalListingDraft, getRentalListingForAgent, updateRentalListingDraft, saveRentalListingProgress } from '../../services/rentals/rentalListingDraftService'
import {
  buildRentalListingTitle,
  normalizeRentalDistributionChannels,
  RENTAL_DISTRIBUTION_CHANNELS,
  RENTAL_LISTING_INITIAL_FORM,
  RENTAL_SELECT_OPTIONS,
  getRentalListingValidationIssues,
} from '../../services/rentals/rentalListingDraftModel'
import { buildRentalListingEditForm } from '../../services/rentals/rentalListingEditModel'
import { resolveRentalWorkspaceScope } from '../../services/rentals/rentalWorkspaceScope'
import { listRentalLeads } from '../../services/rentals/rentalLeadService'
import { listRentalPropertyMandates } from '../../services/rentals/rentalLandlordMandateRepository'
import { findLeadMandate } from '../../services/rentals/rentalLeadHandoffModel'
import { landlordListingPrefill, landlordWorkspace } from '../../services/rentals/rentalLandlordWorkspaceModel'
import { linkRentalLandlordLeadToListing } from '../../services/rentals/rentalLandlordListingHandoffService'

const LEGACY_PROPERTY_TYPE_OPTIONS = Object.freeze([
  { value: 'Apartment', label: 'Apartment' },
  { value: 'House', label: 'House' },
  { value: 'Townhouse', label: 'Townhouse' },
  { value: 'Duplex', label: 'Duplex' },
  { value: 'Studio', label: 'Studio' },
  { value: 'Office', label: 'Office / commercial' },
  { value: 'Warehouse', label: 'Warehouse / industrial' },
  { value: 'Retail', label: 'Retail' },
  { value: 'Farm', label: 'Farm' },
  { value: 'Smallholding', label: 'Smallholding' },
  { value: 'Vacant Land', label: 'Vacant land' },
  { value: 'Mixed-use', label: 'Mixed use' },
])

const PROPERTY_CATEGORY_OPTIONS = Object.freeze([
  { value: 'residential', label: 'Residential', icon: House },
  { value: 'commercial', label: 'Commercial', icon: Building2 },
  { value: 'industrial', label: 'Industrial', icon: Warehouse },
  { value: 'retail', label: 'Retail', icon: Store },
  { value: 'agricultural', label: 'Farm / agricultural', icon: Sprout },
  { value: 'vacant_land', label: 'Vacant land', icon: LandPlot },
  { value: 'mixed_use', label: 'Mixed use', icon: Blocks },
])

const PER_SQUARE_METRE_RENTAL_CATEGORIES = new Set(['commercial', 'industrial', 'retail', 'vacant_land', 'mixed_use'])

function rentalPriceFrequencyOptions(propertyCategory) {
  return RENTAL_SELECT_OPTIONS.rentalPriceFrequency.filter((option) => (
    option.value !== 'per_square_metre' || PER_SQUARE_METRE_RENTAL_CATEGORIES.has(propertyCategory)
  ))
}

const CREATE_STEPS = Object.freeze([
  { key: 'landlord', label: 'Landlord & Mandate', description: 'Owner & mandate details' },
  { key: 'property', label: 'Property details', description: '' },
  { key: 'features', label: 'Extra details (optional)', description: '' },
  { key: 'terms', label: 'Rent & deposit', description: '' },
  { key: 'marketing', label: 'Photos & description', description: '' },
  { key: 'syndication', label: 'Where to advertise', description: '' },
  { key: 'review', label: 'Check & publish', description: '' },
])


const LANDLORD_TYPE_CARDS = Object.freeze([
  { value: 'individual', label: 'Individual', description: 'One person owns the property.', icon: UserRound },
  { value: 'multiple_owners', label: 'Multiple owners', description: 'Two or more people own the property.', icon: Users },
  { value: 'company', label: 'Company', description: 'A company owns the property.', icon: Building2 },
  { value: 'trust', label: 'Trust', description: 'A trust owns the property.', icon: Landmark },
  { value: 'close_corporation', label: 'Close corporation', description: 'A CC owns the property.', icon: Building2 },
  { value: 'other_entity', label: 'Other entity', description: 'Another legal entity owns the property.', icon: Building2 },
  { value: 'foreign_owner', label: 'Foreign owner', description: 'The owner is based outside South Africa.', icon: Globe2 },
])

function formField(name, value, onChange) {
  return {
    name,
    value,
    onChange: (event) => onChange(name, event.target.value),
  }
}

function createInitialFormState() {
  return {
    ...RENTAL_LISTING_INITIAL_FORM,
    rentalPortalFacts: {},
    selectedFeatures: [...RENTAL_LISTING_INITIAL_FORM.selectedFeatures],
    amenities: [...RENTAL_LISTING_INITIAL_FORM.amenities],
    galleryImages: [...RENTAL_LISTING_INITIAL_FORM.galleryImages],
    selectedSyndicationChannels: [...RENTAL_LISTING_INITIAL_FORM.selectedSyndicationChannels],
  }
}

function createGalleryAssetId(index = 0) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `gallery-${Date.now()}-${index + 1}`
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Unable to read file'))
    reader.readAsDataURL(file)
  })
}

function createGalleryPreviewUrl(file) {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    return {
      url: URL.createObjectURL(file),
      revokeOnCleanup: true,
    }
  }
  return readAsDataUrl(file).then((url) => ({
    url,
    revokeOnCleanup: false,
  }))
}

async function buildGalleryDrafts(files = []) {
  return Promise.all(
    files.map(async (file, index) => {
      const preview = await createGalleryPreviewUrl(file)
      return {
        id: createGalleryAssetId(index),
        name: file.name || `Image ${index + 1}`,
        url: preview.url,
        previewUrl: preview.url,
        revokePreviewUrl: preview.revokeOnCleanup,
        contentType: file.type || '',
        size: file.size || 0,
        file,
      }
    }),
  )
}

function SelectField({ label, name, value, options, onChange }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <select {...formField(name, value, onChange)}>
        {value && !options.some((option) => option.value === value) ? <option value={value}>{String(value).replaceAll('_', ' ')} (existing value)</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

function FormSection({ eyebrow, title, description = '', children }) {
  return (
    <section className="ui-panel ui-panel-body grid w-full min-w-0 max-w-full gap-4 overflow-hidden">
      {eyebrow || title || description ? <div>
        {eyebrow ? <p className="text-xs font-semibold uppercase text-[#607891]">{eyebrow}</p> : null}
        {title ? <h2 className="text-lg font-semibold text-[#18324b]">{title}</h2> : null}
        {description ? <p className="mt-1 text-sm text-[#607891]">{description}</p> : null}
      </div> : null}
      {children}
    </section>
  )
}

function RentalTermsCard({ title, icon, children }) {
  const Icon = icon
  return (
    <section className="min-w-0 rounded-2xl border border-[#dbe6f2] bg-white p-4 sm:p-5">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eef4fa] text-[#315f80]"><Icon size={18} aria-hidden="true" /></span>
        <h3 className="text-sm font-semibold text-[#18324b]">{title}</h3>
      </div>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function LandlordTypeCard({ option, active, onClick }) {
  const Icon = option.icon
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-h-[108px] items-center gap-3 rounded-[14px] border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-[#286b43] focus:ring-offset-2 ${
        active
          ? 'border-[#79bf95] bg-[#eef9f1] text-[#18324b]'
          : 'border-[#dbe6f2] bg-white text-[#42617f] hover:border-[#9fc5ae]'
      }`}
    >
      <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-white text-[#286b43]' : 'bg-[#f4f7fb] text-[#69819a]'}`}>
        <Icon size={20} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-[#18324b]">{option.label}</span>
        <span className="mt-1 block text-sm leading-5 text-[#607891]">{option.description}</span>
      </span>
      <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? 'border-[#286b43] bg-[#286b43] text-white' : 'border-[#c8d6e5] bg-white text-transparent'}`}>
        <CheckCircle2 size={13} aria-hidden="true" />
      </span>
    </button>
  )
}

function PropertyCounter({ label, name, value, onChange, step = 1, studio = false }) {
  const amount = Number(value || 0)
  const safeValue = Number.isFinite(amount) && amount > 0 ? amount : 0
  const changeValue = (nextValue) => onChange(String(Math.max(0, Number(nextValue.toFixed(1)))))

  return (
    <div className="flex min-w-0 flex-col gap-2 self-start">
      <span className="text-sm font-semibold text-[#2d445e]">{label}</span>
      <div className="grid min-h-12 grid-cols-[3rem_1fr_3rem] overflow-hidden rounded-xl border border-[#dbe6f2] bg-white">
        <button data-rental-control type="button" aria-label={`Decrease ${label}`} disabled={safeValue <= 0} onClick={() => changeValue(safeValue - step)} className="inline-flex items-center justify-center border-r border-[#e6edf5] bg-white text-lg font-semibold text-[#1f4f78] transition hover:bg-[#f4f8fc] disabled:cursor-not-allowed disabled:text-[#b5c3d1]">
          <Minus size={17} aria-hidden="true" />
        </button>
        <input name={name} aria-label={label} type="number" min="0" step={step} inputMode={step < 1 ? 'decimal' : 'numeric'} value={value ?? ''} placeholder="Not added" onChange={event => onChange(event.target.value)} className="min-w-0 border-0 bg-white px-1 text-center text-sm font-semibold text-[#18324b]" />
        <button data-rental-control type="button" aria-label={`Increase ${label}`} onClick={() => changeValue(safeValue + step)} className="inline-flex items-center justify-center border-l border-[#e6edf5] bg-white text-lg font-semibold text-[#1f4f78] transition hover:bg-[#f4f8fc]">
          <Plus size={17} aria-hidden="true" />
        </button>
      </div>
      {studio && name === 'bedrooms' ? <button type="button" className="text-left text-xs text-[#1f4f78] underline" onClick={() => onChange('0')}>Studio? Set bedrooms to 0</button> : null}
    </div>
  )
}

function PropertyChoiceCard({ label, active, onClick, icon: Icon }) {
  return <button type="button" data-rental-control aria-pressed={active} onClick={onClick} className={`flex min-h-16 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#274c69] ${active ? 'border-[#274c69] bg-[#eef4f8] text-[#274c69]' : 'border-[#dbe6f2] bg-white text-[#42617f] hover:border-[#9aafbf]'}`}>
    <span className="flex min-w-0 items-center gap-3">{Icon ? <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-white' : 'bg-[#f4f8fc]'}`}><Icon size={19} strokeWidth={1.75} aria-hidden="true" /></span> : null}<span>{label}</span></span>
    <span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded-full border ${active ? 'border-[#274c69] bg-[#274c69] text-white' : 'border-[#c8d6e5] text-transparent'}`}><CheckCircle2 size={13} /></span>
  </button>
}

function ReviewSummaryCard({ title, details, onEdit }) {
  return (
    <article className="rounded-[12px] border border-[#dbe6f2] bg-[#fbfdff] p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-[#607891]">{title}</p>
        <button type="button" aria-label={`Edit ${title.toLowerCase()}`} onClick={onEdit} className="text-xs font-semibold text-[#1f7d44] underline underline-offset-2">Edit</button>
      </div>
      <div className="mt-3 grid gap-1.5 text-sm text-[#607891]">
        {details.map((detail) => <p key={detail.label}><span className="font-semibold text-[#18324b]">{detail.label}:</span> {detail.value}</p>)}
      </div>
    </article>
  )
}

function stepForValidationError(error = '') {
  const normalized = String(error).toLowerCase()
  if (normalized.includes('landlord') || normalized.includes('mandate') || normalized.includes('marketing approval')) return 'landlord'
  if (normalized.includes('video link') || normalized.includes('virtual tour link')) return 'marketing'
  if (normalized.includes('property address')) return 'property'
  if (normalized.includes('rental amount') || normalized.includes('rental price frequency') || normalized.includes('deposit') || normalized.includes('available from') || normalized.includes('occupation date')) return 'terms'
  if (normalized.startsWith('enter a valid ') && !normalized.includes('landlord')) return 'features'
  if (normalized.includes('public rental description')) return 'marketing'
  return 'review'
}

function RentalCreateProgressNav({ activeStep, onStepClick, steps = CREATE_STEPS }) {
  const activeIndex = steps.findIndex((step) => step.key === activeStep)
  const compactLabels = steps.map(step => step.label)
  return (
    <nav className="rental-create-progress" aria-label="Create rental listing progress">
      <div className="rental-create-progress-grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((step, index) => {
          const complete = index < activeIndex
          const active = index === activeIndex
          return (
            <button key={step.key} type="button" onClick={() => onStepClick(step.key)} aria-current={active ? 'step' : undefined} aria-label={`Step ${index + 1}: ${step.label}`} title={step.label} className={`rental-create-step ${complete ? 'is-visited' : ''} ${active ? 'is-current' : ''}`}>
              <span className="rental-create-step-number">
                {complete ? <CheckCircle2 size={17} aria-hidden="true" /> : index + 1}
              </span>
              <span className="rental-create-step-label">
                <span className="rental-create-step-compact">{compactLabels[index]}</span>
                <span className="rental-create-step-full">{step.label}</span>
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export default function RentalListingCreatePage() {
  const captureSessionId = useListingCaptureSession()
  const scope = resolveRentalWorkspaceScope(useWorkspace())
  const params = useParams()
  const [searchParams] = useSearchParams()
  const routeKey = [params.listingId || '', searchParams.get('leadId') || '', searchParams.get('portfolioPropertyId') || ''].join(':')
  return <ScopedRentalListingCreatePage key={buildRentalWorkspaceKey(scope, routeKey) + (params.listingId ? '' : `:capture:${captureSessionId}`)} captureSessionId={captureSessionId} />
}

function ScopedRentalListingCreatePage({ captureSessionId }) {
  const navigate = useNavigate()
  const params = useParams()
  const [searchParams] = useSearchParams()
  const workspaceContext = useWorkspace()
  const organisationContext = useOptionalOrganisation()
  const agencyLogo = organisationContext?.branding?.logoUrl || workspaceContext.currentWorkspace?.logoUrl || workspaceContext.currentWorkspace?.logo_url || ''
  const rentalScope = useMemo(() => resolveRentalWorkspaceScope(workspaceContext), [workspaceContext])
  const organisationId = rentalScope.organisationId
  const branchId = rentalScope.branchId
  const assignedAgentId = rentalScope.assignedAgentId
  const editListingId = String(params.listingId || '').trim()
  const isEditing = Boolean(editListingId)
  const [isDraftCapture, setIsDraftCapture] = useState(false)
  const requestedStepRef = useRef(searchParams.get('step'))
  const portfolioPropertyId = String(searchParams.get('portfolioPropertyId') || '').trim()
  const draftStorageKey = buildRentalListingDraftStorageKey(rentalScope, { leadId: searchParams.get('leadId') || '', portfolioPropertyId }) + (isEditing ? `:edit:${editListingId}` : `:capture:${captureSessionId}`)
  const [draftReadyKey, setDraftReadyKey] = useState('')
  const editBaselineRef = useRef(null)
  const [editRecoveryBaseline, setEditRecoveryBaseline] = useState(null)
  const [editDraftConflict, setEditDraftConflict] = useState(null)
  const completedDraftRef = useRef(false)
  const [form, setForm] = useState(createInitialFormState)
  const cloudSavedFormRef = useRef(JSON.stringify(createInitialFormState()))
  const recoveryWarningGenerationRef = useRef(0)
  const [cloudSave, setCloudSave] = useState({ status: 'idle' })
  const unsavedToListings = JSON.stringify(form) !== cloudSavedFormRef.current
  const [activeStep, setActiveStep] = useState(() => isEditing && CREATE_STEPS.some((step) => step.key === searchParams.get('step')) ? searchParams.get('step') : 'property')
  const galleryImagesRef = useRef(form.galleryImages)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [saveProgress, setSaveProgress] = useState('')
  const [error, setError] = useState('')
  const [validationAttemptedStep, setValidationAttemptedStep] = useState('')
  const [correctionField, setCorrectionField] = useState('')
  const [correctionRequest, setCorrectionRequest] = useState(0)
  const [notice, setNotice] = useState('')
  const [leaveAction, setLeaveAction] = useState(null)
  const requestLeave = useCallback(proceed => setLeaveAction(() => proceed), [])
  const [linkedLandlordLead, setLinkedLandlordLead] = useState(null)
  const [pendingListingId, setPendingListingId] = useState('')
  const pendingListingIdRef = useRef('')
  const pendingDraftRevisionRef = useRef('')
  const [creationId, setCreationId] = useState('')
  const creationIdRef = useRef('')
  const [recovering, setRecovering] = useState(false)
  const [recoveryBlocked, setRecoveryBlocked] = useState(false)
  const mountedRef = useRef(true)
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const [channelAvailability, setChannelAvailability] = useState(UNAVAILABLE_SYNDICATION_CHANNELS)
  const [channelAvailabilityLoading, setChannelAvailabilityLoading] = useState(true)
  useEffect(() => { let cancelled = false; setChannelAvailabilityLoading(true); getSyndicationChannelAvailability(organisationId, { listingType: 'rental' }).then(value => { if (!cancelled) setChannelAvailability(value) }).catch(() => { if (!cancelled) setChannelAvailability(UNAVAILABLE_SYNDICATION_CHANNELS) }).finally(() => { if (!cancelled) setChannelAvailabilityLoading(false) }); return () => { cancelled = true } }, [organisationId])
  const fieldIssues = useMemo(() => getRentalListingValidationIssues(form, { organisationId }), [form, organisationId])
  const includeLandlordStep = isEditing || activeStep === 'landlord' || fieldIssues.some(issue => issue.step === 'landlord')
  const steps = useMemo(() => CREATE_STEPS.filter(step => includeLandlordStep || step.key !== 'landlord').map(step => isEditing && !isDraftCapture && step.key === 'review' ? { ...step, label: 'Check & save' } : step), [isEditing, isDraftCapture, includeLandlordStep])
  const stepForError = message => fieldIssues.find(issue => issue.message === message)?.step || stepForValidationError(message)
  const validationErrors = fieldIssues.map(issue => issue.message)
  const suggestedDepositAmount = useMemo(() => {
    const rent = Number(form.monthlyRent || 0)
    const multiplier = Number(form.depositMultiplier || 0)
    if (!Number.isFinite(rent) || !Number.isFinite(multiplier) || rent <= 0 || multiplier <= 0) return 0
    return rent * multiplier
  }, [form.depositMultiplier, form.monthlyRent])
  const selectedSellingPoints = useMemo(
    () => rentalFeatureAnswerLabels(form),
    [form],
  )
  const selectedDistributionChannels = useMemo(
    () => normalizeRentalDistributionChannels(form.selectedSyndicationChannels),
    [form.selectedSyndicationChannels],
  )
  const canSubmit = validationErrors.length === 0 && !saving && !recovering && !recoveryBlocked && (draftReadyKey === draftStorageKey && !editDraftConflict) && (!searchParams.get('leadId') || Boolean(linkedLandlordLead))
  const activeStepIndex = steps.findIndex((step) => step.key === activeStep)
  const priceFrequencyOptions = rentalPriceFrequencyOptions(form.propertyCategory)

  useEffect(() => {
    if (isEditing) return
    let cancelled = false
    let recoveredDraft
    completedDraftRef.current = false
    void (async () => {
    try {
      recoveredDraft = await readListingRecoveryDraft(draftStorageKey)
      if (cancelled) { recoveredDraft?.release(); return }
      const storedDraft = window.localStorage.getItem(draftStorageKey) || window.sessionStorage.getItem(draftStorageKey)
      if (!storedDraft && !recoveredDraft) return
      const localDraft = storedDraft ? JSON.parse(storedDraft) : null
      const parsedDraft = recoveredDraft ? { ...recoveredDraft.recovery, ...(recoveredDraft.version === 2 ? {} : localDraft || {}), form: recoveredDraft.form, missingPhotoCount: recoveredDraft.missingPhotos } : localDraft
      if (!parsedDraft || typeof parsedDraft !== 'object') throw new Error('Invalid saved draft.')
      if (parsedDraft.creationId && !isRentalCreationId(parsedDraft.creationId)) throw new Error('The saved creation identity is invalid. Open Rental Listings to find the existing draft.')
      pendingListingIdRef.current = parsedDraft.pendingListingId || ''
      creationIdRef.current = parsedDraft.creationId || ''
      setCreationId(creationIdRef.current)
      const restored = restoreRentalFeatureSelections({ ...createInitialFormState(), ...parsedDraft.form,
        galleryImages: parsedDraft.form?.galleryImages || [], coverImageId: parsedDraft.form?.coverImageId || '' })
      setForm(restored)
      if (CREATE_STEPS.some(step => step.key === parsedDraft.activeStep) && (parsedDraft.activeStep !== 'landlord' || getRentalListingValidationIssues(restored, { organisationId }).some(issue => issue.step === 'landlord'))) setActiveStep(parsedDraft.activeStep); else setActiveStep('property')
      const missingPhotos = parsedDraft.missingPhotoCount ? ' Reselect photos that had not finished uploading before the refresh.' : ''
      setNotice(missingPhotos.trim())
      const recoveryId = parsedDraft.pendingListingId || parsedDraft.creationId
      if (recoveryId) {
        setRecovering(true)
        void getRentalListingForAgent(recoveryId, assignedAgentId, buildRentalListingQueryOptions(rentalScope)).then(row => {
          if (cancelled) return
          if (!row) {
            if (parsedDraft.pendingListingId) throw new Error('The previously created rental is unavailable. Open Rental Listings before retrying.')
            setNotice(`Creation was not confirmed. Retry this draft to use the same reserved listing.${missingPhotos}`)
            return
          }
          pendingListingIdRef.current = row.id
          setPendingListingId(row.id)
          const savedForm = restoreRentalFeatureSelections(buildRentalListingEditForm(row))
          // A completed atomic save is authoritative. For an unfinished shell,
          // keep any uploaded photos retained in the browser recovery receipt.
          if (!row.listingPublicationData && !savedForm.galleryImages.length) {
            savedForm.galleryImages = restored.galleryImages
            savedForm.coverImageId = restored.coverImageId
          }
          setForm(recoveredDraft ? restored : savedForm)
          setNotice(missingPhotos.trim())
        }).catch(loadError => {
          if (!cancelled) { setRecoveryBlocked(true); setError(loadError?.message || 'Unable to verify the existing rental. Reload before retrying.') }
        }).finally(() => { if (!cancelled) setRecovering(false) })
      }
    } catch (restoreError) {
      setRecoveryBlocked(true)
      if (!cancelled) setError(restoreError?.message || 'Unable to recover the saved draft. Open Rental Listings before creating another rental.')
    } finally { if (!cancelled) setDraftReadyKey(draftStorageKey) }
    })()
    return () => { cancelled = true; recoveredDraft?.release() }
  }, [assignedAgentId, draftStorageKey, isEditing, rentalScope, organisationId])

  const persistRecoveryDraft = useCallback((currentForm, pendingId = pendingListingIdRef.current) => {
    if (!currentForm.expectedUpdatedAt && pendingDraftRevisionRef.current) currentForm = { ...currentForm, expectedUpdatedAt: pendingDraftRevisionRef.current }
    const warningGeneration = recoveryWarningGenerationRef.current
    const recovery = { activeStep, creationId: creationIdRef.current, pendingListingId: pendingId,
      ...(isEditing && editBaselineRef.current ? { baseForm: editBaselineRef.current.form, baseRevision: editBaselineRef.current.revision } : {}) }
    const snapshot = writeListingTextRecoveryDraft(draftStorageKey, { form: currentForm, recovery, photoField: 'galleryImages' })
    const draft = { ...serializeRentalCreationDraft(currentForm, recovery), ...recovery }
    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft))
    void saveListingRecoveryDraft(draftStorageKey, { form: currentForm, recovery, photoField: 'galleryImages', snapshot })
      .catch(() => { if (mountedRef.current && warningGeneration === recoveryWarningGenerationRef.current && currentForm.galleryImages.some(photo => photo.file instanceof Blob)) setNotice('Automatic photo recovery is unavailable. Keep this tab open until the listing is saved.') })
  }, [activeStep, draftStorageKey, isEditing])

  const recoveryMetadata = useMemo(() => ({ activeStep, creationId, pendingListingId,
    ...(isEditing && editRecoveryBaseline ? { baseForm: editRecoveryBaseline.form, baseRevision: editRecoveryBaseline.revision } : {}) }), [activeStep, creationId, pendingListingId, isEditing, editRecoveryBaseline])
  const recoveryProtection = useListingRecoveryProtection({
    enabled: draftReadyKey === draftStorageKey && !recovering && !recoveryBlocked && !editDraftConflict && !completedDraftRef.current
      && (!isEditing || JSON.stringify(form) !== JSON.stringify(editBaselineRef.current?.form)),
    onLeaveRequested: requestLeave, scope: draftStorageKey, form, recovery: recoveryMetadata, photoField: 'galleryImages', onWarning: setNotice, requireSaved: unsavedToListings,
  })

  useEffect(() => {
    if (!isEditing || !organisationId) return
    let cancelled = false
    let recoveredDraft
    setSaving(true)
    setError('')
    void (async () => {
      try {
        const existingListing = await getRentalListingForAgent(editListingId, assignedAgentId, buildRentalListingQueryOptions(rentalScope))
        if (!existingListing) throw new Error('Rental listing not found.')
        recoveredDraft = await readListingRecoveryDraft(draftStorageKey)
        if (cancelled) { recoveredDraft?.release(); return }
        const savedForm = restoreRentalFeatureSelections(buildRentalListingEditForm(existingListing))
        cloudSavedFormRef.current = JSON.stringify(savedForm)
        setCloudSave({ status: 'saved', savedAt: existingListing.updatedAt || existingListing.updated_at })
        setIsDraftCapture(isRentalListingDraft(existingListing))
        const revision = listingRecoveryRevision(existingListing)
        editBaselineRef.current = { form: savedForm, revision }
        setEditRecoveryBaseline(editBaselineRef.current)
        const legacy = window.localStorage.getItem(draftStorageKey)
        const stored = legacy ? JSON.parse(legacy) : null
        const draft = recoveredDraft || (stored ? { form: stored.form, recovery: stored } : null)
        const restored = reconcileListingEditRecovery(draft, savedForm, revision)
        if (restored?.conflict) {
          setForm(savedForm)
          setEditDraftConflict(restored)
          setNotice('This listing has changed since your draft. Review your changes before saving.')
        } else {
          setForm(restored?.form || savedForm)
          setNotice('')
          if (draft?.recovery?.activeStep && CREATE_STEPS.some(step => step.key === draft.recovery.activeStep)) setActiveStep(draft.recovery.activeStep)
          else if (!requestedStepRef.current && CREATE_STEPS.some(step => step.key === existingListing.sellerCanonicalFacts?.rentalCaptureDraft?.step)) setActiveStep(existingListing.sellerCanonicalFacts.rentalCaptureDraft.step)
        }
        if (recoveredDraft?.missingPhotos) setNotice('Your text was restored. Reselect photos that did not finish saving for recovery.')
        setDraftReadyKey(draftStorageKey)
      } catch (loadError) {
        if (!cancelled) { setRecoveryBlocked(true); setError(loadError?.message || 'Unable to load the rental listing for editing.') }
      } finally { if (!cancelled) setSaving(false) }
    })()
    return () => { cancelled = true; recoveredDraft?.release() }
  }, [assignedAgentId, draftStorageKey, editListingId, isEditing, organisationId, rentalScope])

  useEffect(() => {
    galleryImagesRef.current = form.galleryImages
  }, [form.galleryImages])

  useEffect(() => {
    const leadId = searchParams.get('leadId')
    if (!leadId || !organisationId) { setLinkedLandlordLead(null); return }
    let active = true
    setLinkedLandlordLead(null)
    const recoveryListingId = pendingListingIdRef.current || pendingListingId
    const options = { assignedAgentId, branchId, scopeLevel: rentalScope.scopeLevel, includeAllOrganisationLeads: rentalScope.scopeLevel === 'organisation' }
    void listRentalLeads(organisationId, options).then(async (leads) => {
      if (!active) return
      const lead = leads.find((item) => item.id === leadId && item.role === 'landlord' && (item.stage === 'listing_ready' || (item.stage === 'listing_created' && (portfolioPropertyId || (recoveryListingId && item.relationships?.listingId === recoveryListingId))))) || null
      if (lead && portfolioPropertyId) {
        const property = landlordWorkspace(lead).portfolio.find(item => item.id === portfolioPropertyId)
        if (!property) throw new Error('This landlord portfolio property is not available.')
        if (property.listingId && property.listingId !== recoveryListingId) throw new Error('This portfolio property already has a rental listing. Open that listing to edit it.')
        const mandates = property.canonicalPropertyId ? await listRentalPropertyMandates(property.canonicalPropertyId) : []
        if (!findLeadMandate(lead, mandates, property.canonicalPropertyId, organisationId)) throw new Error('Record a signed mandate for this portfolio property before creating its rental listing.')
        if (!active) return
        if (!window.localStorage.getItem(draftStorageKey) && !window.sessionStorage.getItem(draftStorageKey)) setForm(current => ({ ...current, ...Object.fromEntries(Object.entries(landlordListingPrefill(lead, portfolioPropertyId)).filter(([, value]) => value !== undefined)) }))
      }
      setLinkedLandlordLead(lead)
      if (!lead) setError('The requested landlord lead is not available at Listing ready in your current scope.')
    }).catch((loadError) => { if (active) setError(loadError?.message || 'Unable to validate linked landlord lead.') })
    return () => { active = false }
  }, [assignedAgentId, branchId, organisationId, rentalScope.scopeLevel, searchParams, portfolioPropertyId, draftStorageKey, pendingListingId])

  useEffect(() => () => {
    for (const image of galleryImagesRef.current) {
      if (image?.revokePreviewUrl && image.url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(image.url)
      }
    }
  }, [])

  function updateForm(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
    setError('')
    setNotice('')
  }

  function updatePropertyAddress(address) {
    setForm((current) => ({
      ...current,
      propertyAddress: address?.formattedAddress || '',
      streetNumber: address?.streetNumber || '',
      streetName: address?.streetName || address?.route || '',
      suburb: address?.suburb || '',
      city: address?.city || '',
      province: address?.province || '',
      postalCode: address?.postalCode || '',
      latitude: address?.latitude ?? '',
      longitude: address?.longitude ?? '',
      googlePlaceId: address?.googlePlaceId || address?.placeId || '',
    }))
    setError('')
    setNotice('')
  }

  function toggleDistributionChannel(channel) {
    setForm((current) => {
      const selected = normalizeRentalDistributionChannels(current.selectedSyndicationChannels)
      return {
        ...current,
        selectedSyndicationChannels: selected.includes(channel)
          ? selected.filter((item) => item !== channel)
          : [...selected, channel],
      }
    })
    setError('')
    setNotice('')
  }

  function moveGalleryImage(imageId, direction) {
    setForm((current) => ({
      ...current,
      galleryImages: (() => {
        const currentIndex = current.galleryImages.findIndex((image) => String(image.id) === String(imageId))
        const nextIndex = currentIndex + direction
        if (currentIndex < 0 || nextIndex < 0 || nextIndex >= current.galleryImages.length) return current.galleryImages
        const nextImages = [...current.galleryImages]
        const [image] = nextImages.splice(currentIndex, 1)
        nextImages.splice(nextIndex, 0, image)
        return nextImages
      })(),
    }))
    setError('')
    setNotice('')
  }

  async function handleGalleryUpload(event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    try {
      const galleryImages = await buildGalleryDrafts(files)
      setForm((current) => ({
        ...current,
        galleryImages: [...current.galleryImages, ...galleryImages],
        coverImageId: current.coverImageId || galleryImages[0]?.id || '',
      }))
      setError('')
    } catch (uploadError) {
      setError(uploadError?.message || 'Unable to load the selected images.')
    } finally {
      event.target.value = ''
    }
  }

  function removeGalleryImage(imageId) {
    setForm((current) => {
      const removedImage = current.galleryImages.find((image) => String(image.id) === String(imageId))
      if (removedImage?.revokePreviewUrl && removedImage.url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(removedImage.url)
      }
      const nextGallery = current.galleryImages.filter((image) => String(image.id) !== String(imageId))
      return {
        ...current,
        galleryImages: nextGallery,
        coverImageId:
          String(current.coverImageId) === String(imageId)
            ? String(nextGallery[0]?.id || '')
            : current.coverImageId,
      }
    })
    setError('')
  }

  function setCoverImage(imageId) {
    updateForm('coverImageId', imageId)
  }

  function goToStep(stepKey, field = '') {
    if (steps.some((step) => step.key === stepKey)) {
      setActiveStep(stepKey)
      setCorrectionField(field)
      if (field) setCorrectionRequest(current => current + 1)
      setError('')
      setNotice('')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  function goToNextStep() {
    setValidationAttemptedStep(activeStep)
    const stepErrors = validationErrors.filter((validationError) => activeStep === 'syndication' || stepForError(validationError) === activeStep)
    if (stepErrors.length) {
      const target = stepForError(stepErrors[0])
      if (target !== activeStep) { goToStep(target); setValidationAttemptedStep(target) }
      setError(stepErrors[0])
      return
    }
    const next = steps[activeStepIndex + 1]
    if (next) goToStep(next.key)
  }

  function goToPreviousStep() {
    const previous = steps[activeStepIndex - 1]
    if (previous) goToStep(previous.key)
  }



  async function saveDraftToListings() {
    if (savingRef.current || recoveryBlocked || recovering || editDraftConflict || draftReadyKey !== draftStorageKey) return
    savingRef.current = true
    setSaving(true)
    setCloudSave({ status: 'saving' })
    try {
      if (!isEditing) creationIdRef.current ||= globalThis.crypto.randomUUID()
      persistRecoveryDraft(form)
      setCreationId(creationIdRef.current)
      const result = await saveRentalListingProgress(form, {
        ...rentalScope, organisationId, branchId, assignedAgentId, performedBy: assignedAgentId,
        listingId: editListingId || pendingListingIdRef.current,
        creationId: creationIdRef.current, activeStep,
        onListingCreated: (id, row) => {
          pendingListingIdRef.current = id
          pendingDraftRevisionRef.current = row?.updatedAt || row?.updated_at || pendingDraftRevisionRef.current
          persistRecoveryDraft(form, id)
          if (mountedRef.current) { setPendingListingId(id); setForm(current => ({ ...current, expectedUpdatedAt: current.expectedUpdatedAt || pendingDraftRevisionRef.current })) }
        },
        onUploadProgress: ({ completed, total, phase }) => { if (mountedRef.current) setSaveProgress(phase === 'saving' ? 'Confirming saved details…' : `Saving photos: ${completed} of ${total}…`) },
      })
      if (!mountedRef.current) return
      if (!result?.listing?.id) throw new Error('The rental save returned no confirmation. Keep this tab open and retry.')
      if (result.recovered) {
        pendingListingIdRef.current = result.listing.id
        setPendingListingId(result.listing.id)
        setForm(current => ({ ...current, expectedUpdatedAt: result.listing.updatedAt || result.listing.updated_at }))
        setCloudSave({ status: 'idle' })
        setNotice('An existing rental was found for this draft. Your typed information is still here. Review it and retry Save draft to finish the same rental.')
        return
      }
      const savedForm = restoreRentalFeatureSelections(buildRentalListingEditForm(result.listing))
      pendingDraftRevisionRef.current = savedForm.expectedUpdatedAt
      cloudSavedFormRef.current = JSON.stringify(savedForm)
      recoveryWarningGenerationRef.current += 1
      editBaselineRef.current = { form: savedForm, revision: listingRecoveryRevision(result.listing) }
      setEditRecoveryBaseline(editBaselineRef.current)
      setForm(savedForm)
      pendingListingIdRef.current = result.listing.id
      setPendingListingId(result.listing.id)
      setCloudSave({ status: 'saved', savedAt: result.listing.updatedAt || result.listing.updated_at || new Date().toISOString() })
      recoveryProtection.markSaved()
      void clearListingRecoveryDraft(draftStorageKey).catch(() => {})
      try { window.localStorage.removeItem(draftStorageKey); window.sessionStorage.removeItem(draftStorageKey) } catch { /* Confirmed Listings save remains authoritative. */ }
      setError('')
      setNotice('Draft saved to Listings. Nothing was published. You can continue here or reopen it from Listings on another device.')
      window.dispatchEvent(new Event('itg:listings-updated'))
      return true
    } catch (saveError) {
      if (!mountedRef.current) return
      if (saveError.listingId) { pendingListingIdRef.current = saveError.listingId; setPendingListingId(saveError.listingId) }
      if (Array.isArray(saveError.galleryImages)) setForm(current => ({ ...current, galleryImages: saveError.galleryImages }))
      setCloudSave({ status: 'error' })
      setError(saveError.message || 'Could not confirm the draft save. Keep this tab open and retry Save draft.')
      setNotice('')
    } finally {
      savingRef.current = false
      if (mountedRef.current) { setSaving(false); setSaveProgress('') }
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (savingRef.current) return
    if (activeStep !== 'review') {
      goToNextStep()
      return
    }
    if (!canSubmit) {
      if (!recoveryBlocked && !recovering) { setValidationAttemptedStep(validationErrors[0] ? stepForError(validationErrors[0]) : activeStep); setError(validationErrors[0] || 'Complete the required rental listing fields.'); if (validationErrors[0]) setActiveStep(stepForError(validationErrors[0])) }
      return
    }
    let detailsSaved = false
    let savedFormForRecovery = form
    try {
      savingRef.current = true
      setSaving(true)
      setCloudSave({ status: 'saving' })
      setSaveProgress(pendingListingId || isEditing ? 'Saving rental details…' : 'Creating rental draft…')
      setError('')
      if (!isEditing) {
        // Persist before the first request. A browser-storage failure must not
        // leave a remotely created record with no durable recovery identity.
        creationIdRef.current ||= globalThis.crypto.randomUUID()
        persistRecoveryDraft(form)
        setCreationId(creationIdRef.current)
      }
      const context = {
        creationId: creationIdRef.current,
        canonicalPropertyId: linkedLandlordLead && portfolioPropertyId
          ? landlordWorkspace(linkedLandlordLead).portfolio.find(item => item.id === portfolioPropertyId)?.canonicalPropertyId : undefined,
        canonicalUnitId: linkedLandlordLead && portfolioPropertyId
          ? landlordWorkspace(linkedLandlordLead).portfolio.find(item => item.id === portfolioPropertyId)?.canonicalUnitId : undefined,
        ...rentalScope, organisationId, branchId, assignedAgentId, performedBy: assignedAgentId,
        onListingCreated: (id, row) => {
          // Persist the receipt even if the user has since switched workspaces.
          pendingListingIdRef.current = id
          pendingDraftRevisionRef.current = row?.updatedAt || row?.updated_at || pendingDraftRevisionRef.current
          persistRecoveryDraft(form, id)
          if (mountedRef.current) { setPendingListingId(id); setForm(current => ({ ...current, expectedUpdatedAt: current.expectedUpdatedAt || pendingDraftRevisionRef.current })) }
        },
        onUploadProgress: ({ completed, total, phase }) => setSaveProgress(phase === 'saving' ? 'Saving rental marketing…' : `Saving photos: ${completed} of ${total}…`),
      }
      const result = isEditing || pendingListingId
        ? await updateRentalListingDraft(editListingId || pendingListingId, form, context)
        : await createRentalListingDraft(form, context)
      if (!mountedRef.current) return
      const listingId = result?.listing?.id
      if (listingId) {
        if (result.recovered) {
          pendingListingIdRef.current = listingId
          setPendingListingId(listingId)
          const savedForm = restoreRentalFeatureSelections(buildRentalListingEditForm(result.listing))
          if (!result.listing.listingPublicationData && !savedForm.galleryImages.length) {
            savedForm.galleryImages = form.galleryImages
            savedForm.coverImageId = form.coverImageId
          }
          setForm(savedForm)
          persistRecoveryDraft(savedForm, listingId)
          setNotice('Your existing rental was recovered. Review its saved details, then retry saving to finish the same rental.')
          return
        }
        pendingListingIdRef.current = listingId
        if (!isEditing) setPendingListingId(listingId)
        const savedMedia = buildRentalListingEditForm(result.listing)
        const confirmedForm = { ...form,
          ...(Array.isArray(result.listing.listingMedia) ? { galleryImages: savedMedia.galleryImages, coverImageId: savedMedia.coverImageId } : {}),
          expectedUpdatedAt: result.listing.updatedAt || result.listing.updated_at || form.expectedUpdatedAt }
        savedFormForRecovery = confirmedForm
        pendingDraftRevisionRef.current = confirmedForm.expectedUpdatedAt
        cloudSavedFormRef.current = JSON.stringify(confirmedForm)
        setForm(confirmedForm)
        setCloudSave({ status: 'saved', savedAt: confirmedForm.expectedUpdatedAt || new Date().toISOString() })
        detailsSaved = true
        if (linkedLandlordLead && !isEditing) {
          setPendingListingId(listingId)
          try {
            await linkRentalLandlordLeadToListing(linkedLandlordLead, listingId, { organisationId, actor: { id: assignedAgentId, userId: assignedAgentId }, scope: { ...rentalScope, assignedAgentId, branchId, includeAllOrganisationLeads: rentalScope.scopeLevel === 'organisation' }, portfolioPropertyId })
            setPendingListingId('')
          } catch (linkError) {
            setError(`Listing ${listingId} was created, but it was not linked to the landlord lead: ${linkError?.message || 'unknown link failure'}`)
            return
          }
        }
        if (!mountedRef.current) return
        const activation = !isEditing || isDraftCapture ? await activateRentalListing(result.listing, form, { websiteDestination: channelAvailability.agency_website }) : null
        if (!mountedRef.current) return
        recoveryProtection.markSaved()
        recoveryWarningGenerationRef.current += 1
        completedDraftRef.current = true
        void clearListingRecoveryDraft(draftStorageKey).catch(() => {})
        try { window.localStorage.removeItem(draftStorageKey); window.sessionStorage.removeItem(draftStorageKey) } catch { /* Confirmed save remains authoritative. */ }
        navigate(`/agent/rentals/listings/${encodeURIComponent(listingId)}/marketing`, {
          state: {
            [isEditing ? 'rentalListingUpdatedTitle' : 'rentalListingCreatedTitle']: buildRentalListingTitle(form),
            rentalListingDistributionChannels: selectedDistributionChannels,
            rentalListingPublicationError: activation?.publicationError,
            rentalListingChangesNotSent: isEditing && !isDraftCapture,
            rentalListingSaveMessage: isEditing && !isDraftCapture ? RENTAL_SAVED_NOT_SENT_MESSAGE : undefined,
          },
        })
        return
      }
      navigate('/agent/rentals/listings', {
        state: { [isEditing ? 'rentalListingUpdatedTitle' : 'rentalListingCreatedTitle']: buildRentalListingTitle(form) },
      })
    } catch (saveError) {
      if (saveError.code === 'RENTAL_INVENTORY_LINK_FAILED' && saveError.savedListing?.id === saveError.listingId && saveError.expectedUpdatedAt) {
        savedFormForRecovery = { ...savedFormForRecovery, expectedUpdatedAt: saveError.expectedUpdatedAt, galleryImages: saveError.galleryImages || savedFormForRecovery.galleryImages }
        pendingDraftRevisionRef.current = saveError.expectedUpdatedAt
        detailsSaved = true
        if (mountedRef.current) {
          setForm(current => ({ ...current, expectedUpdatedAt: saveError.expectedUpdatedAt, galleryImages: saveError.galleryImages || current.galleryImages }))
          setCloudSave({ status: 'saved', savedAt: saveError.expectedUpdatedAt })
        }
      }
      if (!isEditing && creationIdRef.current) {
        try { persistRecoveryDraft({ ...savedFormForRecovery, galleryImages: saveError.galleryImages || savedFormForRecovery.galleryImages }, saveError.listingId || pendingListingIdRef.current) }
        catch { /* The identity saved before creation remains the recovery anchor. */ }
      }
      if (!mountedRef.current) return
      if (!detailsSaved) setCloudSave({ status: 'error' })
      else setNotice(saveError.code === 'RENTAL_INVENTORY_LINK_FAILED' ? 'Your rental details are saved. Retry connecting the vacancy using this same listing.' : 'Your rental details are saved. Activation did not finish. Continue with the same listing; do not create another rental.')
      if (!isEditing && saveError.listingId) { pendingListingIdRef.current = saveError.listingId; setPendingListingId(saveError.listingId) }
      if (Array.isArray(saveError.galleryImages)) {
        setForm((current) => ({ ...current, galleryImages: saveError.galleryImages }))
      }
      setError(saveError?.message || `Unable to ${isEditing ? 'update' : 'create'} the rental listing draft.`)
    } finally {
      savingRef.current = false
      setSaving(false)
      setSaveProgress('')
    }
  }

  if (draftReadyKey !== draftStorageKey && !recoveryBlocked) return <p role="status">Restoring listing draft…</p>

  return (
    <section className="page-content w-full min-w-0 max-w-full">
      <form onSubmit={handleSubmit} className="rental-capture-form ui-section-stack w-full min-w-0 max-w-full">
        <header className="flex items-stretch gap-3">
          <div className="flex min-w-0 flex-1 items-center rounded-[16px] border border-[#dde6ef] bg-white px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.035)]">
            <h1 className="text-[1.8rem] font-semibold tracking-[-0.03em] text-[#18324b]">{isDraftCapture ? 'Continue rental draft' : isEditing ? 'Edit rental listing' : 'Create new listing'}</h1>
          </div>
          <div className="flex shrink-0 items-center justify-center rounded-[16px] border border-[#dde6ef] bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.035)]">
          <button
            type="button"
            disabled={saving}
            className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-[#607891] transition hover:bg-[#f4f8fc] hover:text-[#286b43] disabled:opacity-50"
            onClick={() => { const leave = () => navigate(isEditing ? `/agent/rentals/listings/${encodeURIComponent(editListingId)}` : '/agent/rentals/listings'); if (unsavedToListings) requestLeave(leave); else leave() }}
            aria-label={isEditing ? 'Close rental listing editor' : 'Close new rental listing'}
          >
            <X size={21} aria-hidden="true" />
          </button>
          </div>
        </header>

        <ListingSaveStatus cloud={{ ...cloudSave, message: saveProgress }} recovery={recoveryProtection.status} dirty={unsavedToListings} hideDeviceNotice />
        {cloudSave.status === 'saved' && !isEditing && pendingListingId ? <Button type="button" onClick={() => navigate('/agent/rentals/listings')}>Back to Listings</Button> : null}

        {recovering ? <p role="status" className="px-4 text-sm text-[#607891]">Checking the saved rental before retrying…</p> : null}
        {pendingListingId && error ? <p className="px-4 text-sm text-[#607891]">Your rental draft already exists. Retry saving here to finish its photos and marketing without creating another listing.</p> : null}
        {error && !validationErrors.includes(error) ? (
          <p className="rounded-[8px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">{error}</p>
        ) : null}
        {notice ? (
          <p className="rounded-[8px] border border-[#cfe8dc] bg-[#f2fbf5] px-4 py-3 text-sm font-semibold text-[#286b43]">{notice}</p>
        ) : null}

        {editDraftConflict ? <section role="alert" className="ui-panel ui-panel-body">
          <p>The saved listing changed after you started this draft. Reviewing your draft keeps newer saved values in fields you did not change.</p>
          <div className="mt-3 flex gap-3">
            <Button type="button" onClick={() => { setForm(editDraftConflict.form); setEditDraftConflict(null); setNotice('Your recovered changes are ready to review. Nothing has been saved or sent.'); }}>Review my draft changes</Button>
            <Button type="button" onClick={() => { recoveryProtection.markSaved(); void clearListingRecoveryDraft(draftStorageKey).catch(() => {}); try { window.localStorage.removeItem(draftStorageKey) } catch { /* Keep the verified saved record. */ }; setEditDraftConflict(null); setNotice('Using the saved listing.'); }}>Use saved listing</Button>
          </div>
        </section> : null}

        <fieldset disabled={saving || Boolean(editDraftConflict) || recoveryBlocked} className="m-0 min-w-0 space-y-6 border-0 p-0">
        <RentalCreateProgressNav steps={steps} activeStep={activeStep} onStepClick={goToStep} />

        <ListingCaptureLayout form={form} rental streamlined showPreview={activeStep !== 'review'}>
        <ListingFieldIssues issues={fieldIssues.filter(issue => issue.step === activeStep)} step={activeStep} attempted={validationAttemptedStep === activeStep} onGoToStep={goToStep} />
        <div className="grid w-full min-w-0 max-w-full gap-6">
          {linkedLandlordLead ? <p className="rounded-[8px] border border-[#cfe8dc] bg-[#f2fbf5] px-4 py-3 text-sm font-semibold text-[#286b43]">Creating this listing for landlord lead {linkedLandlordLead.name}. The listing will be linked after it is created.</p> : null}
          {activeStep === 'property' ? <FormSection>
            <section>
              <h3 id="rental-property-category-label" className="text-sm font-semibold text-[#18324b]">Property category</h3>
              <div role="group" aria-labelledby="rental-property-category-label" className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {PROPERTY_CATEGORY_OPTIONS.map((option) => <PropertyChoiceCard key={option.value} label={option.label} icon={option.icon} active={form.propertyCategory === option.value} onClick={() => { updateForm('propertyCategory', option.value); if (!RENTAL_CATEGORY_TYPES[option.value]?.includes(form.propertyType)) updateForm('propertyType', RENTAL_CATEGORY_TYPES[option.value]?.[0] || 'Apartment') }} />)}
              </div>
            </section>
            <section className="border-t border-[#e6edf5] pt-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <SelectField label="Ownership type" name="rentalTitleType" value={form.rentalPortalFacts?.['propertyInfo.propertyDescription.propertyDescriptionType'] || ''} onChange={(_, value) => updateForm('rentalPortalFacts', { ...form.rentalPortalFacts, ['propertyInfo.propertyDescription.propertyDescriptionType']: value })} options={[{ value: '', label: 'Not captured' }, ...RENTAL_PORTAL_FIELDS.find((field) => field.key === 'propertyInfo.propertyDescription.propertyDescriptionType').options.map((value) => ({ value, label: ({ Erf: 'Freehold / erf', Unit: 'Sectional title', ExclusiveUseArea: 'Sectional title — exclusive use area', AgriculturalHolding: 'Agricultural holding' })[value] || value }))]} />
                <SelectField label="Property type" name="propertyType" value={form.propertyType} onChange={updateForm} options={[...(RENTAL_CATEGORY_TYPES[form.propertyCategory] || []).map((value) => ({ value, label: value })), ...(!RENTAL_CATEGORY_TYPES[form.propertyCategory]?.includes(form.propertyType) ? [{ value: form.propertyType, label: LEGACY_PROPERTY_TYPE_OPTIONS.find((option) => option.value === form.propertyType)?.label || form.propertyType }] : [])]} />
                {['residential', 'agricultural'].includes(form.propertyCategory) ? <div role="group" aria-labelledby="rental-retirement-label"><p id="rental-retirement-label" className="text-sm font-semibold text-[#2d445e]">Retirement accommodation</p><div className="mt-2 grid grid-cols-2 gap-3">{['yes', 'no'].map((value) => <PropertyChoiceCard key={value} label={value === 'yes' ? 'Yes' : 'No'} active={form.retirementAccommodation === value} onClick={() => updateForm('retirementAccommodation', value)} />)}</div></div> : null}
              </div>
            </section>
            <section>
              <div data-listing-field="propertyAddress">
                <AddressAutocomplete
                  label="Property address"
                  value={{ formattedAddress: form.propertyAddress, streetNumber: form.streetNumber, streetName: form.streetName, suburb: form.suburb, city: form.city, province: form.province, postalCode: form.postalCode, latitude: form.latitude, longitude: form.longitude, googlePlaceId: form.googlePlaceId }}
                  onChange={updatePropertyAddress}
                  onInputValueChange={(value) => updatePropertyAddress({ formattedAddress: value })}
                  predictionTypes={['address']}
                  placeholder="Search for the property address..."
                  hideUnavailableMessage
                />
              </div>
              <details className="mt-4 rounded-xl border border-[#dbe6f2] bg-[#fbfdff] p-4">
                <summary className="cursor-pointer text-sm font-semibold text-[#1f4f78]">Address details and public display</summary>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {['Unit', 'ExclusiveUseArea'].includes(form.rentalPortalFacts?.['propertyInfo.propertyDescription.propertyDescriptionType']) ? <><label className="form-field"><span>Unit number</span><input {...formField('unitNumber', form.unitNumber, updateForm)} placeholder="Unit 12" /></label>
                  <label className="form-field"><span>Complex / building</span><input {...formField('complexName', form.complexName, updateForm)} placeholder="The Atrium" /></label></> : null}
                  <label className="form-field"><span>Street number</span><input {...formField('streetNumber', form.streetNumber, updateForm)} placeholder="10" /></label>
                  <label className="form-field"><span>Street name</span><input {...formField('streetName', form.streetName, updateForm)} placeholder="Beach Road" /></label>
                  <label className="form-field"><span>Suburb</span><input {...formField('suburb', form.suburb, updateForm)} placeholder="Suburb" /></label>
                  <label className="form-field"><span>City</span><input {...formField('city', form.city, updateForm)} placeholder="City" /></label>
                  <label className="form-field"><span>Province</span><input {...formField('province', form.province, updateForm)} placeholder="Province" /></label>
                  <label className="form-field"><span>Postal code</span><input {...formField('postalCode', form.postalCode, updateForm)} placeholder="8005" /></label>
                  <SelectField label="Public address display" name="exactAddressVisibility" value={form.exactAddressVisibility} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.exactAddressVisibility} />
                </div>
              </details>
            </section>

            <section className="border-t border-[#e6edf5] pt-6">
              <h3 className="text-sm font-semibold text-[#18324b]">Property specifications</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {['residential', 'agricultural', 'mixed_use'].includes(form.propertyCategory) ? <PropertyCounter studio={form.propertyCategory === 'residential'} name="bedrooms" label="Bedrooms" value={form.bedrooms} onChange={(value) => updateForm('bedrooms', value)} /> : null}
                {form.propertyCategory !== 'vacant_land' ? <PropertyCounter name="bathrooms" step={0.5} label="Bathrooms" value={form.bathrooms} onChange={(value) => updateForm('bathrooms', value)} /> : null}
                {['residential', 'agricultural'].includes(form.propertyCategory) ? <PropertyCounter name="garages" label="Garages" value={form.garages} onChange={(value) => updateForm('garages', value)} /> : null}
                <PropertyCounter name="parkingBays" label="Parking" value={form.parkingBays} onChange={(value) => updateForm('parkingBays', value)} />
              </div>
              {['commercial', 'industrial', 'retail'].includes(form.propertyCategory) ? <details data-listing-rooms className="mt-4 rounded-xl border border-[#dbe6f2] p-4"><summary className="cursor-pointer text-sm font-semibold">Living accommodation (optional)</summary><div className="mt-4"><PropertyCounter name="bedrooms" label="Bedrooms" value={form.bedrooms} onChange={value => updateForm('bedrooms', value)} /></div></details> : null}
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {form.propertyCategory !== 'vacant_land' ? <label className="form-field"><span>Floor size (m²)</span><input type="number" min="0" step="0.1" {...formField('floorSize', form.floorSize, updateForm)} placeholder="120" /></label> : null}
                <ListingLandSizeInput value={form.erfSize} onChange={value => updateForm('erfSize', value)} />
              </div>
              {['residential', 'agricultural'].includes(form.propertyCategory) ? <details className="mt-5 rounded-xl border border-[#dbe6f2] bg-[#fbfdff] p-4">
                <summary className="cursor-pointer text-sm font-semibold text-[#1f4f78]">More specifications</summary>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <PropertyCounter name="coveredParking" label="Covered parking" value={form.coveredParking} onChange={(value) => updateForm('coveredParking', value)} />
                  <PropertyCounter name="openParking" label="Open parking" value={form.openParking} onChange={(value) => updateForm('openParking', value)} />
                  <PropertyCounter name="carports" label="Carports" value={form.carports} onChange={(value) => updateForm('carports', value)} />
                  <PropertyCounter name="enSuiteBathrooms" label="En-suite bathrooms" value={form.enSuiteBathrooms} step={0.5} onChange={(value) => updateForm('enSuiteBathrooms', value)} />
                  <PropertyCounter name="lounges" label="Lounges" value={form.lounges} onChange={(value) => updateForm('lounges', value)} />
                  <PropertyCounter name="diningRooms" label="Dining rooms" value={form.diningRooms} onChange={(value) => updateForm('diningRooms', value)} />
                  <PropertyCounter name="kitchens" label="Kitchens" value={form.kitchens} onChange={(value) => updateForm('kitchens', value)} />
                  <PropertyCounter name="studies" label="Studies" value={form.studies} onChange={(value) => updateForm('studies', value)} />
                  <PropertyCounter name="storerooms" label="Storerooms" value={form.storerooms} onChange={(value) => updateForm('storerooms', value)} />
                  <PropertyCounter name="staffRooms" label="Staff rooms" value={form.staffRooms} onChange={(value) => updateForm('staffRooms', value)} />
                </div>
              </details> : null}
            </section>
          </FormSection> : null}

          {activeStep === 'features' ? <FormSection><RentalCategoryFields key={correctionRequest} form={form} onChange={updateForm} disabled={saving} focusField={correctionField} /></FormSection> : null}

          {activeStep === 'landlord' ? <FormSection>
            <section>
              <h3 className="text-sm font-semibold text-[#18324b]">Landlord type</h3>
              <div data-listing-field="landlordType" className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {LANDLORD_TYPE_CARDS.map((option) => (
                  <LandlordTypeCard
                    key={option.value}
                    option={option}
                    active={form.landlordType === option.value}
                    onClick={() => updateForm('landlordType', option.value)}
                  />
                ))}
              </div>
            </section>

            <section className="border-t border-[#e6edf5] pt-6">
              <h3 className="text-sm font-semibold text-[#18324b]">Landlord details</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="form-field">
                  <span>{form.landlordType === 'company' ? 'Company name (optional)' : form.landlordType === 'trust' ? 'Trust name (optional)' : form.landlordType === 'multiple_owners' ? 'Primary owner full name (optional)' : form.landlordType === 'foreign_owner' ? 'Owner or entity name (optional)' : form.landlordType === 'individual' ? 'Full name (optional)' : 'Entity name (optional)'}</span>
                  <input {...formField('landlordName', form.landlordName, updateForm)} placeholder={form.landlordType === 'individual' ? 'Landlord full name' : 'Registered entity name'} />
                </label>
                <label className="form-field">
                  <span>Mobile</span>
                  <input {...formField('landlordPhone', form.landlordPhone, updateForm)} placeholder="+27..." />
                </label>
                <label className="form-field">
                  <span>Email</span>
                  <input type="email" {...formField('landlordEmail', form.landlordEmail, updateForm)} placeholder="landlord@example.com" />
                </label>
              </div>
            </section>

            <section className="border-t border-[#e6edf5] pt-6">
              <h3 className="text-sm font-semibold text-[#18324b]">Mandate</h3>
              <p className="mt-1 text-sm text-[#607891]">Capture the mandate and marketing approval that authorise this rental listing.</p>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <SelectField label="Rental mandate" name="mandateStatus" value={form.mandateStatus} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.mandateStatus} />
                <SelectField label="Marketing approval" name="marketingApprovalStatus" value={form.marketingApprovalStatus} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.marketingApprovalStatus} />
                <label className="form-field">
                  <span>Mandate start date</span>
                  <input type="date" {...formField('mandateStartDate', form.mandateStartDate, updateForm)} />
                </label>
                <label className="form-field">
                  <span>Mandate end / expiry date</span>
                  <input type="date" {...formField('mandateEndDate', form.mandateEndDate, updateForm)} />
                </label>
              </div>
            </section>
          </FormSection> : null}

          {activeStep === 'terms' ? <FormSection title="Rent & deposit">
            <p className="text-sm text-[#607387]">Rent and availability use portal fields where supported. Lease terms, deposit instructions, utilities and fees are added to the advert description on Property24 and Private Property. Only add details you want tenants to see.</p>
            <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
              <RentalTermsCard title="Rent" icon={Coins}>
                <label className="form-field"><span>Rental amount</span><input type="number" min="0" step="0.01" aria-describedby="rental-price-unit-help" {...formField('monthlyRent', form.monthlyRent, updateForm)} placeholder="Amount in rand" /></label>
                <SelectField label="How is rent charged?" name="rentalPriceFrequency" value={form.rentalPriceFrequency} onChange={updateForm} options={priceFrequencyOptions} />
                <p id="rental-price-unit-help" className="sm:col-span-2 text-xs text-[#607387]">{form.rentalPriceFrequency === 'per_square_metre' ? 'Enter the rate in rand (R) for one square metre. Add the rentable floor area in Extra details.' : `Enter the rent in rand (R), ${RENT_PREVIEW_UNITS[form.rentalPriceFrequency] || 'then choose how it is charged'}.`}</p>
                <div className="sm:col-span-2"><SelectField label="Furnished" name="furnishedStatus" value={form.furnishedStatus} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.furnishedStatus} /></div>
              </RentalTermsCard>

              <RentalTermsCard title="Availability & lease" icon={CalendarDays}>
                <label className="form-field"><span>Available from</span><input type="date" {...formField('availableFrom', form.availableFrom, updateForm)} /></label>
                <label className="form-field"><span>Occupation date</span><input type="date" {...formField('occupationDate', form.occupationDate, updateForm)} /></label>
                <SelectField label="Lease length" name="leasePeriodType" value={['month_to_month', 'negotiable'].includes(form.leasePeriodType) ? form.leasePeriodType : 'fixed'} onChange={(_, value) => setForm(current => ({ ...current, leasePeriodType: value === 'fixed' ? `fixed_${current.leasePeriodMonths || 12}_months` : value, leasePeriodMonths: value === 'fixed' ? current.leasePeriodMonths || '12' : '' }))} options={[{ value: 'fixed', label: 'Fixed number of months' }, { value: 'month_to_month', label: 'Month to month' }, { value: 'negotiable', label: 'Negotiable' }]} />
                {!['month_to_month', 'negotiable'].includes(form.leasePeriodType) ? <label className="form-field"><span>Number of months</span><input type="number" min="1" step="1" name="leasePeriodMonths" value={form.leasePeriodMonths} onChange={event => { const value = event.target.value; setForm(current => ({ ...current, leasePeriodMonths: value, leasePeriodType: `fixed_${value}_months` })) }} /></label> : null}
                <div className="sm:col-span-2"><SelectField label="Rental type" name="rentalMandateType" value={form.rentalMandateType} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.rentalMandateType} /></div>
              </RentalTermsCard>

              <RentalTermsCard title="Deposit" icon={ShieldCheck}>
                <div className="sm:col-span-2"><SelectField label="Deposit policy" name="depositPolicy" value={form.depositPolicy} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.depositPolicy} /></div>
                {form.depositPolicy !== 'no_deposit' ? <>
                  <label className="form-field"><span>Deposit amount</span><input type="number" min="0" {...formField('depositAmount', form.depositAmount, updateForm)} placeholder="Amount in rand" /></label>
                  <label className="form-field"><span>Months of rent for the deposit (optional)</span><input type="number" min="0" step="0.5" {...formField('depositMultiplier', form.depositMultiplier, updateForm)} placeholder="e.g. 1.5" /></label>
                  <label className="form-field sm:col-span-2"><span>Deposit requirements</span><input {...formField('depositRequirement', form.depositRequirement, updateForm)} placeholder="e.g. One and a half months’ rent" /></label>
                  <p className="text-xs text-[#607891] sm:col-span-2">You can enter a deposit amount, or calculate it using months of rent. Select Use calculated amount to apply it.</p>
                  {suggestedDepositAmount ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f4f8fc] px-3 py-3 text-sm text-[#315f80] sm:col-span-2">
                    <span>Calculated deposit <strong className="ml-1 text-[#18324b]">R {suggestedDepositAmount.toLocaleString('en-ZA')}</strong></span>
                    <button type="button" data-rental-control="deposit-calculation" className="font-semibold underline underline-offset-2" onClick={() => updateForm('depositAmount', String(suggestedDepositAmount))}>Use calculated amount</button>
                  </div> : null}
                </> : null}
              </RentalTermsCard>

              <RentalTermsCard title="Utilities" icon={Wallet}>
                <div className="sm:col-span-2"><SelectField label="Utilities" name="utilitiesPolicy" value={form.utilitiesPolicy} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.utilitiesPolicy} /></div>
                <label className="form-field sm:col-span-2"><span>Rental includes</span><input {...formField('rentalIncludes', form.rentalIncludes, updateForm)} placeholder="Water, Wi-Fi, garden service" /></label>
                <label className="form-field sm:col-span-2"><span>Rental excludes</span><input {...formField('rentalExcludes', form.rentalExcludes, updateForm)} placeholder="Electricity, refuse, sewerage" /></label>
              </RentalTermsCard>

              <details className="min-w-0 rounded-2xl border border-[#dbe6f2] bg-white p-4 sm:p-5">
                <summary className="cursor-pointer text-sm font-semibold text-[#18324b]"><span className="inline-flex items-center gap-3 align-middle"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef4fa] text-[#315f80]"><FileText size={18} aria-hidden="true" /></span>Additional deposits & fees</span></summary>
                <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
                  <label className="form-field"><span>Application fee</span><input type="number" min="0" {...formField('applicationFee', form.applicationFee, updateForm)} /></label>
                  <label className="form-field"><span>Lease admin fee</span><input type="number" min="0" {...formField('leaseAdminFee', form.leaseAdminFee, updateForm)} /></label>
                  <label className="form-field"><span>Credit check fee</span><input type="number" min="0" {...formField('creditCheckFee', form.creditCheckFee, updateForm)} /></label>
                  <label className="form-field"><span>Key deposit</span><input type="number" min="0" {...formField('keyDepositAmount', form.keyDepositAmount, updateForm)} /></label>
                  <label className="form-field"><span>Utility deposit</span><input type="number" min="0" {...formField('utilityDepositAmount', form.utilityDepositAmount, updateForm)} /></label>
                </div>
              </details>
            </div>
          </FormSection> : null}

          {activeStep === 'marketing' ? <FormSection title="Photos & description">
            <section className="min-w-0 rounded-2xl border border-[#dbe6f2] bg-white p-4 sm:p-5">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eef4fa] text-[#315f80]"><ImagePlus size={18} aria-hidden="true" /></span>
                  <h3 className="text-sm font-semibold text-[#18324b]">Photos</h3>
                  <span className="rounded-full bg-[#eef4fa] px-2.5 py-1 text-xs font-semibold text-[#526f88]">{form.galleryImages.length}</span>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-[#1f7d44] bg-[#1f7d44] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#176338] focus-within:ring-2 focus-within:ring-[#286b43] focus-within:ring-offset-2"><ImagePlus size={16} aria-hidden="true" />Upload photos<input name="galleryImages" type="file" accept="image/*" multiple className="sr-only" onChange={handleGalleryUpload} aria-label="Upload listing photos" /></label>
              </div>
              {form.galleryImages.length ? <div aria-label="Listing photos" role="region" tabIndex={0} className="sales-capture-gallery mt-5">
                {form.galleryImages.map((image, index) => {
                  const isCover = String(form.coverImageId) === String(image.id)
                  return <article key={image.id} className={`min-w-0 overflow-hidden rounded-xl border ${isCover ? 'border-[#91abc0]' : 'border-[#dbe6f2]'} bg-white`}>
                    <div className="sales-capture-photo relative bg-[#eef4fa]">
                      <img src={image.url} alt={image.name} className="block h-full w-full object-cover" loading="lazy" />
                      <span className="absolute left-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-md bg-white/95 px-1.5 text-xs font-semibold text-[#18324b]">{index + 1}</span>
                      {isCover ? <span className="absolute right-2 top-2 rounded-md bg-[#18324b] px-2 py-1 text-xs font-semibold text-white">Cover</span> : null}
                    </div>
                    <div className="min-w-0 p-3">
                      <p className="truncate text-xs font-medium text-[#526f88]" title={image.name}>{image.name}</p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <button type="button" data-rental-control="photo-cover" onClick={() => setCoverImage(image.id)} disabled={isCover} className={`min-h-8 rounded-lg border px-2.5 text-xs font-semibold ${isCover ? 'border-[#dbe6f2] bg-[#eef4fa] text-[#315f80]' : 'border-[#dbe6f2] bg-white text-[#42617f] hover:bg-[#f4f8fc]'}`}>{isCover ? 'Cover photo' : 'Set cover'}</button>
                        <div className="flex items-center gap-1">
                          <button type="button" data-rental-control="photo-order" aria-label={`Move ${image.name} earlier`} title="Move earlier" disabled={index === 0} onClick={() => moveGalleryImage(image.id, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#dbe6f2] text-[#526f88] hover:bg-[#f4f8fc] disabled:opacity-30"><ChevronLeft size={14} aria-hidden="true" /></button>
                          <button type="button" data-rental-control="photo-order" aria-label={`Move ${image.name} later`} title="Move later" disabled={index === form.galleryImages.length - 1} onClick={() => moveGalleryImage(image.id, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#dbe6f2] text-[#526f88] hover:bg-[#f4f8fc] disabled:opacity-30"><ChevronRight size={14} aria-hidden="true" /></button>
                          <button type="button" data-rental-control="photo-remove" aria-label={`Remove ${image.name}`} title="Remove photo" onClick={() => removeGalleryImage(image.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#b42318] hover:bg-[#fff4f2]"><Trash2 size={14} aria-hidden="true" /></button>
                        </div>
                      </div>
                    </div>
                  </article>
                })}
              </div> : <div className="mt-5 flex min-h-36 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#cddaea] bg-[#f7fafc] px-4 py-6 text-center"><ImagePlus size={28} className="text-[#91abc0]" aria-hidden="true" /><p className="text-sm text-[#607891]">Add property photos</p></div>}
            </section>

            <section className="grid gap-4 rounded-2xl border border-[#dbe6f2] bg-white p-4 sm:grid-cols-2 sm:p-5">
              <label className="form-field"><span>Video link</span><input type="url" aria-label="Video link" {...formField('videoLink', form.videoLink, updateForm)} placeholder="https://youtu.be/..." /><small>Optional link to a property video.</small></label>
              <label className="form-field"><span>Virtual tour link</span><input type="url" aria-label="Virtual tour link" {...formField('virtualTourLink', form.virtualTourLink, updateForm)} placeholder="https://my.matterport.com/..." /><small>Optional link to a virtual tour.</small></label>
            </section>
            <div className="grid min-w-0 gap-4">
              <section className="min-w-0 rounded-2xl border border-[#dbe6f2] bg-white p-4 sm:p-5">
                <div className="mb-5 flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eef4fa] text-[#315f80]"><FileText size={18} aria-hidden="true" /></span><h3 className="text-sm font-semibold text-[#18324b]">Title and description</h3></div>
                <div className="grid min-w-0 gap-4">
                  <label className="form-field"><span>Listing title</span><input {...formField('title', form.title, updateForm)} placeholder={listingTitleExample(form.propertyCategory)} /></label>
                  <label className="form-field"><span>Listing description</span><textarea rows={8} {...formField('description', form.description, updateForm)} placeholder="Describe the property, its size, access and main features." /></label>
                </div>
              </section>
            </div>
          </FormSection> : null}

          {activeStep === 'syndication' ? <FormSection title="Where to advertise">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[#18324b]">Advertising websites</h3>
              <span className="rounded-full bg-[#eef4fa] px-3 py-1 text-xs font-semibold text-[#526f88]">{selectedDistributionChannels.length} websites selected</span>
            </div>
            <div className="listing-syndication-grid">
              {RENTAL_DISTRIBUTION_CHANNELS.map((channel) => {
                const selected = selectedDistributionChannels.includes(channel.key)
                const needsAttention = channel.key === 'private_property' && form.galleryImages.length < 3
                  ? `Add ${3 - form.galleryImages.length} more photo${3 - form.galleryImages.length === 1 ? '' : 's'} (minimum 3).`
                  : channel.key === 'agency_website' && form.galleryImages.length < 1
                    ? 'Add at least 1 photo.'
                    : ''
                return <ListingSyndicationChannelCard key={channel.key} channel={{ ...channel, availability: channelAvailability[channel.key] }} selected={selected} disabled={channelAvailabilityLoading || !channelAvailability[channel.key]?.available} needsAttention={channelAvailabilityLoading ? 'Checking connection…' : !channelAvailability[channel.key]?.available ? 'Connection needed' : selected && validationAttemptedStep === activeStep ? needsAttention : ''} onToggle={toggleDistributionChannel} agencyLogo={agencyLogo} />
              })}
              <ListingSyndicationChannelCard channel={{ key: 'arch9_internal', label: 'Arch9 Platform', internalOnly: true }} selected />
            </div>
            {validationAttemptedStep === activeStep && selectedDistributionChannels.some((key) => (key === 'private_property' && form.galleryImages.length < 3) || (key === 'agency_website' && form.galleryImages.length < 1)) ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f1d4a6] bg-[#fffaf0] px-4 py-3 text-sm text-[#8a5a12]">
              <span>Selected channels need more photos.</span>
              <button type="button" data-rental-control="syndication-photos" className="font-semibold underline underline-offset-2" onClick={() => goToStep('marketing')}>Add photos</button>
            </div> : null}
            <p className="text-xs leading-5 text-[#607891]">{isEditing ? 'Save rental changes saves your details here. It does not update public adverts. Send updates from the saved listing when you are ready.' : 'Choose where this rental will appear. Save draft keeps it private.'}</p>
          </FormSection> : null}

          {activeStep === 'review' ? <section className="ui-panel ui-panel-body grid gap-6">
            <div className="flex flex-col gap-4 border-b border-[#e6edf5] pb-5 md:flex-row md:items-start md:justify-between">
              <div><p className="text-xs font-semibold uppercase text-[#607891]">Step {steps.length} of {steps.length}</p><h2 className="text-2xl font-semibold text-[#18324b]">Check your rental listing</h2><p className="mt-1 text-sm text-[#607891]">Check the details below, then {isEditing && !isDraftCapture ? 'save your changes. Public adverts will need a separate update.' : selectedDistributionChannels.length ? 'save and publish to your selected websites.' : 'save this listing. No adverts will be sent.'}</p></div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${validationAttemptedStep === activeStep && validationErrors.length ? 'bg-[#fff5e5] text-[#a76a12]' : 'bg-[#eef9f1] text-[#286b43]'}`}>{validationAttemptedStep !== activeStep ? 'Review details' : validationErrors.length ? `${validationErrors.length} items still needed` : isEditing ? 'Ready to save' : 'Ready to create'}</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {isEditing ? <ReviewSummaryCard title="Landlord & mandate" onEdit={() => goToStep('landlord')} details={[{ label: 'Landlord', value: form.landlordName || 'Not added' }, { label: 'Contact', value: form.landlordEmail || form.landlordPhone || 'Not added' }, { label: 'Mandate', value: RENTAL_SELECT_OPTIONS.mandateStatus.find((option) => option.value === form.mandateStatus)?.label || 'Not captured' }]} /> : null}
              <ReviewSummaryCard title="Extra details (optional)" onEdit={() => goToStep('features')} details={[{ label: 'Confirmed features', value: `${selectedSellingPoints.length} confirmed` }, { label: 'Pet friendly', value: form.petsPolicy === 'allowed' ? 'Yes' : form.petsPolicy === 'not_allowed' ? 'No' : 'Subject to approval' }]} />
            </div>
            <ListingReviewDetails form={form} rental compact onEdit={goToStep} />
            {isEditing ? <p className="rounded-xl border border-[#f1d4a6] bg-[#fffaf0] p-4 text-sm">Saving here does not update your public adverts. Send the updates from the saved listing.</p> : null}
            <div className="rounded-xl border border-[#dce6f2] bg-[#fbfdff] p-4">
              <h3 className="text-sm font-semibold text-[#18324b]">Publishing readiness</h3>
              <div className="mt-3 grid gap-2">
                {[...RENTAL_DISTRIBUTION_CHANNELS.filter(channel => selectedDistributionChannels.includes(channel.key)), { key: 'arch9_internal', label: 'Arch9 Platform', internalOnly: true }].map(channel => {
                  const destination = channelAvailability[channel.key]
                  return <div key={channel.key} className="flex flex-wrap items-center gap-5 rounded-lg border border-[#dce6f2] bg-white p-3">
                    <ListingChannelLogo channel={{ ...channel, availability: destination }} agencyLogo={agencyLogo} />
                    <span className="text-sm text-[#2d445e]">{destination?.label || channel.label}</span>
                  </div>
                })}
              </div>
            </div>
          </section> : null}

        </div>
        </ListingCaptureLayout>
          <footer className="listing-capture-actions sales-capture-actions ui-panel ui-panel-body flex flex-wrap items-center justify-between gap-3">
            <div>
              {activeStepIndex > 0 ? (
                <Button type="button" onClick={goToPreviousStep}>
                  <ChevronLeft size={16} aria-hidden="true" />
                  Back
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={saveDraftToListings} disabled={saving || recovering || recoveryBlocked}>Save draft</Button>
              <Button
                key={activeStep === 'review' ? 'submit' : 'continue'}
                type={activeStep === 'review' ? 'submit' : 'button'}
                onClick={activeStep === 'review' ? undefined : (event) => { event.preventDefault(); goToNextStep() }}
                disabled={saving || recovering || recoveryBlocked}
              >
                {activeStep === 'review' && saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : activeStep === 'review' ? <Save size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                {activeStep === 'review' ? (saving ? 'Saving rental…' : isEditing && !isDraftCapture ? 'Save rental changes' : (pendingListingId || creationId) && cloudSave.status !== 'saved' && !isDraftCapture ? selectedDistributionChannels.length ? 'Retry save and publish' : 'Retry save listing' : selectedDistributionChannels.length ? 'Save and publish' : 'Save listing') : 'Continue'}
              </Button>
            </div>
          </footer>
        </fieldset>
      </form>
      <Modal open={Boolean(leaveAction)} onClose={saving ? undefined : () => setLeaveAction(null)} title="Leave this rental listing?" subtitle="Save a private draft to finish later, or discard your unsaved changes." footer={<div className="flex flex-wrap justify-end gap-3">
        <Button type="button" disabled={saving} onClick={() => setLeaveAction(null)}>Keep editing</Button>
        <Button type="button" disabled={saving} onClick={async () => {
          recoveryProtection.markSaved()
          try {
            await clearListingRecoveryDraft(draftStorageKey)
            window.localStorage.removeItem(draftStorageKey)
            window.sessionStorage.removeItem(draftStorageKey)
            const proceed = leaveAction
            setLeaveAction(null)
            proceed?.()
          } catch { setForm(current => ({ ...current })); setError('Could not discard the device draft. Keep editing and try again.'); }
        }}>Discard changes</Button>
        <Button type="button" disabled={saving || recoveryBlocked || recovering || Boolean(editDraftConflict)} onClick={async () => {
          const proceed = leaveAction
          if (await saveDraftToListings()) { setLeaveAction(null); proceed?.() }
        }}>{saving ? 'Saving draft…' : 'Save draft and leave'}</Button>
      </div>}>
        {pendingListingId || isEditing ? <p className="text-sm text-[#607387]">Discard removes changes on this device. A draft already saved to Listings remains there.</p> : null}
        {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
      </Modal>
    </section>
  )
}
