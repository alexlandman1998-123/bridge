import { useEffect, useMemo, useRef, useState } from 'react'
import { Blocks, Building2, CalendarDays, CheckCircle2, ClipboardCheck, ChevronLeft, ChevronRight, Coins, FileText, Globe2, House, ImagePlus, Landmark, LandPlot, Loader2, Minus, Plus, Save, ShieldCheck, Sprout, Store, Trash2, UserRound, Users, Wallet, Warehouse, X } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import './rental-listing-create.css'
import AddressAutocomplete from '../../components/location/AddressAutocomplete'
import Button from '../../components/ui/Button'
import ListingSyndicationChannelCard from '../../components/listings/ListingSyndicationChannelCard'
import RentalCategoryFields from '../../components/listings/RentalCategoryFields'
import { rentalFeatureAnswerLabels, restoreRentalFeatureSelections } from '../../services/rentals/rentalFeatureCaptureModel'
import { RENTAL_CATEGORY_TYPES, RENTAL_PORTAL_FIELDS } from '../../services/rentals/rentalPortalFieldContract'
import { createRentalListingDraft, getRentalListingForAgent, updateRentalListingDraft } from '../../services/rentals/rentalListingDraftService'
import {
  buildRentalListingTitle,
  normalizeRentalDistributionChannels,
  RENTAL_DISTRIBUTION_CHANNELS,
  RENTAL_LISTING_INITIAL_FORM,
  RENTAL_SELECT_OPTIONS,
  validateRentalListingDraftForm,
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
  { key: 'features', label: 'Additional property details', description: 'Features & facilities' },
  { key: 'terms', label: 'Rental terms', description: 'Price & lease' },
  { key: 'marketing', label: 'Marketing', description: 'Photos & description' },
  { key: 'syndication', label: 'Syndication', description: 'Choose publication channels' },
  { key: 'review', label: 'Review', description: 'Confirm & create' },
])

const RENTAL_CREATE_SESSION_DRAFT_KEY = 'arch9:rental-listing:create-draft'

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

function PropertyCounter({ label, value, onChange, step = 1 }) {
  const amount = Number(value || 0)
  const safeValue = Number.isFinite(amount) && amount > 0 ? amount : 0
  const changeValue = (nextValue) => onChange(String(Math.max(0, Number(nextValue.toFixed(1)))))

  return (
    <div className="grid gap-2">
      <span className="text-sm font-semibold text-[#2d445e]">{label}</span>
      <div className="grid min-h-12 grid-cols-[3rem_1fr_3rem] overflow-hidden rounded-xl border border-[#dbe6f2] bg-white">
        <button data-rental-control type="button" aria-label={`Decrease ${label}`} disabled={safeValue <= 0} onClick={() => changeValue(safeValue - step)} className="inline-flex items-center justify-center border-r border-[#e6edf5] bg-white text-lg font-semibold text-[#1f4f78] transition hover:bg-[#f4f8fc] disabled:cursor-not-allowed disabled:text-[#b5c3d1]">
          <Minus size={17} aria-hidden="true" />
        </button>
        <output className="flex items-center justify-center text-sm font-semibold text-[#18324b]">{safeValue}</output>
        <button data-rental-control type="button" aria-label={`Increase ${label}`} onClick={() => changeValue(safeValue + step)} className="inline-flex items-center justify-center border-l border-[#e6edf5] bg-white text-lg font-semibold text-[#1f4f78] transition hover:bg-[#f4f8fc]">
          <Plus size={17} aria-hidden="true" />
        </button>
      </div>
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
        <button type="button" onClick={onEdit} className="text-xs font-semibold text-[#1f7d44] underline underline-offset-2">Edit</button>
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

function RentalCreateProgressNav({ activeStep, onStepClick }) {
  const activeIndex = CREATE_STEPS.findIndex((step) => step.key === activeStep)
  const compactLabels = ['Landlord', 'Property', 'Features', 'Terms', 'Marketing', 'Portals', 'Review']
  return (
    <nav className="rental-create-progress" aria-label="Create rental listing progress">
      <div className="rental-create-progress-grid">
        {CREATE_STEPS.map((step, index) => {
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
  const portfolioPropertyId = String(searchParams.get('portfolioPropertyId') || '').trim()
  const draftStorageKey = searchParams.get('leadId') ? `${RENTAL_CREATE_SESSION_DRAFT_KEY}:${searchParams.get('leadId')}:${portfolioPropertyId || 'primary'}` : RENTAL_CREATE_SESSION_DRAFT_KEY
  const [form, setForm] = useState(createInitialFormState)
  const [activeStep, setActiveStep] = useState(() => isEditing && CREATE_STEPS.some((step) => step.key === searchParams.get('step')) ? searchParams.get('step') : 'landlord')
  const galleryImagesRef = useRef(form.galleryImages)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [saveProgress, setSaveProgress] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [linkedLandlordLead, setLinkedLandlordLead] = useState(null)
  const [pendingListingId, setPendingListingId] = useState('')

  const validationErrors = useMemo(
    () => validateRentalListingDraftForm(form, { organisationId }),
    [form, organisationId],
  )
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
  const canSubmit = validationErrors.length === 0 && !saving && (!searchParams.get('leadId') || Boolean(linkedLandlordLead))
  const activeStepIndex = CREATE_STEPS.findIndex((step) => step.key === activeStep)
  const priceFrequencyOptions = rentalPriceFrequencyOptions(form.propertyCategory)

  useEffect(() => {
    try {
      if (isEditing) return
      const storedDraft = window.sessionStorage.getItem(draftStorageKey)
      if (!storedDraft) return
      const parsedDraft = JSON.parse(storedDraft)
      if (!parsedDraft || typeof parsedDraft !== 'object') return
      setForm((current) => restoreRentalFeatureSelections({
        ...current,
        ...parsedDraft.form,
        selectedFeatures: Array.isArray(parsedDraft.form?.selectedFeatures) ? parsedDraft.form.selectedFeatures : current.selectedFeatures,
        amenities: Array.isArray(parsedDraft.form?.amenities) ? parsedDraft.form.amenities : current.amenities,
        galleryImages: current.galleryImages,
        coverImageId: current.coverImageId,
      }))
      if (CREATE_STEPS.some((step) => step.key === parsedDraft.activeStep)) setActiveStep(parsedDraft.activeStep)
      setNotice('Your saved rental draft was restored for this browser session.')
    } catch {
      window.sessionStorage.removeItem(draftStorageKey)
    }
  }, [isEditing, draftStorageKey])

  useEffect(() => {
    if (!isEditing || !organisationId) return
    let cancelled = false
    setSaving(true)
    setError('')
    getRentalListingForAgent(editListingId, assignedAgentId, {
      organisationId,
      branchId,
      scopeLevel: rentalScope.scopeLevel,
    }).then((existingListing) => {
      if (cancelled) return
      if (!existingListing) throw new Error('Rental listing not found.')
      setForm(restoreRentalFeatureSelections(buildRentalListingEditForm(existingListing)))
      setNotice('Editing this rental in the same guided capture flow used for new listings.')
    }).catch((loadError) => {
      if (!cancelled) setError(loadError?.message || 'Unable to load the rental listing for editing.')
    }).finally(() => {
      if (!cancelled) setSaving(false)
    })
    return () => { cancelled = true }
  }, [assignedAgentId, branchId, editListingId, isEditing, organisationId, rentalScope.scopeLevel])

  useEffect(() => {
    galleryImagesRef.current = form.galleryImages
  }, [form.galleryImages])

  useEffect(() => {
    const leadId = searchParams.get('leadId')
    if (!leadId || !organisationId) { setLinkedLandlordLead(null); return }
    const options = { assignedAgentId, branchId, scopeLevel: rentalScope.scopeLevel, includeAllOrganisationLeads: rentalScope.scopeLevel === 'organisation' }
    void listRentalLeads(organisationId, options).then(async (leads) => {
      const lead = leads.find((item) => item.id === leadId && item.role === 'landlord' && (item.stage === 'listing_ready' || (portfolioPropertyId && item.stage === 'listing_created'))) || null
      if (lead && portfolioPropertyId) {
        const property = landlordWorkspace(lead).portfolio.find(item => item.id === portfolioPropertyId)
        if (!property) throw new Error('This landlord portfolio property is not available.')
        if (property.listingId) throw new Error('This portfolio property already has a rental listing. Open that listing to edit it.')
        const mandates = property.canonicalPropertyId ? await listRentalPropertyMandates(property.canonicalPropertyId) : []
        if (!findLeadMandate(lead, mandates, property.canonicalPropertyId, organisationId)) throw new Error('Record a signed mandate for this portfolio property before creating its rental listing.')
        if (!window.sessionStorage.getItem(draftStorageKey)) setForm(current => ({ ...current, ...Object.fromEntries(Object.entries(landlordListingPrefill(lead, portfolioPropertyId)).filter(([, value]) => value !== undefined)) }))
      }
      setLinkedLandlordLead(lead)
      if (!lead) setError('The requested landlord lead is not available at Listing ready in your current scope.')
    }).catch((loadError) => setError(loadError?.message || 'Unable to validate linked landlord lead.'))
  }, [assignedAgentId, branchId, organisationId, rentalScope.scopeLevel, searchParams, portfolioPropertyId, draftStorageKey])

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

  function goToStep(stepKey) {
    if (CREATE_STEPS.some((step) => step.key === stepKey)) {
      setActiveStep(stepKey)
      setError('')
      setNotice('')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  function goToNextStep() {
    const stepErrors = validationErrors.filter((validationError) => stepForValidationError(validationError) === activeStep)
    if (stepErrors.length) {
      setError(stepErrors.join(' '))
      return
    }
    const next = CREATE_STEPS[activeStepIndex + 1]
    if (next) goToStep(next.key)
  }

  function goToPreviousStep() {
    const previous = CREATE_STEPS[activeStepIndex - 1]
    if (previous) goToStep(previous.key)
  }

  function saveDraftForSession() {
    try {
      const serializableForm = {
        ...form,
        galleryImages: [],
        coverImageId: '',
      }
      window.sessionStorage.setItem(draftStorageKey, JSON.stringify({
        activeStep,
        form: serializableForm,
      }))
      setError('')
      setNotice('Draft saved for this browser session. Images will be saved when the listing is created.')
    } catch {
      setError('Unable to save this draft in the current browser session.')
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
      setError(validationErrors[0] || 'Complete the required rental listing fields.')
      return
    }
    try {
      savingRef.current = true
      setSaving(true)
      setSaveProgress(pendingListingId || isEditing ? 'Saving rental details…' : 'Creating rental draft…')
      setError('')
      const context = {
        organisationId, branchId, assignedAgentId, performedBy: assignedAgentId,
        onListingCreated: setPendingListingId,
        onUploadProgress: ({ completed, total, phase }) => setSaveProgress(phase === 'saving' ? 'Saving rental marketing…' : `Saving photos: ${completed} of ${total}…`),
      }
      const result = isEditing || pendingListingId
        ? await updateRentalListingDraft(editListingId || pendingListingId, form, context)
        : await createRentalListingDraft(form, context)
      const listingId = result?.listing?.id
      if (listingId) {
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
        navigate(`/agent/rentals/listings/${encodeURIComponent(listingId)}/marketing`, {
          state: {
            [isEditing ? 'rentalListingUpdatedTitle' : 'rentalListingCreatedTitle']: buildRentalListingTitle(form),
            rentalListingDistributionChannels: selectedDistributionChannels,
          },
        })
        return
      }
      navigate('/agent/rentals/listings', {
        state: { [isEditing ? 'rentalListingUpdatedTitle' : 'rentalListingCreatedTitle']: buildRentalListingTitle(form) },
      })
    } catch (saveError) {
      if (!isEditing && saveError.listingId) setPendingListingId(saveError.listingId)
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

  return (
    <section className="page-content w-full min-w-0 max-w-full overflow-x-hidden">
      <form onSubmit={handleSubmit} className="ui-section-stack w-full min-w-0 max-w-full">
        <header className="flex items-stretch gap-3">
          <div className="flex min-w-0 flex-1 items-center rounded-[16px] border border-[#dde6ef] bg-white px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.035)]">
            <h1 className="text-[1.8rem] font-semibold tracking-[-0.03em] text-[#18324b]">{isEditing ? 'Edit rental listing' : 'Create new listing'}</h1>
          </div>
          <div className="flex shrink-0 items-center justify-center rounded-[16px] border border-[#dde6ef] bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.035)]">
          <button
            type="button"
            disabled={saving}
            className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-[#607891] transition hover:bg-[#f4f8fc] hover:text-[#286b43] disabled:opacity-50"
            onClick={() => navigate(isEditing ? `/agent/rentals/listings/${encodeURIComponent(editListingId)}` : '/agent/rentals/listings')}
            aria-label={isEditing ? 'Close rental listing editor' : 'Close new rental listing'}
          >
            <X size={21} aria-hidden="true" />
          </button>
          </div>
        </header>

        {saving && saveProgress ? <p role="status" className="px-4 py-3 text-sm font-semibold text-[#607891]">{saveProgress}</p> : null}
        {pendingListingId && error ? <p className="px-4 text-sm text-[#607891]">Your rental draft already exists. Retry saving here to finish its photos and marketing without creating another listing.</p> : null}
        {error ? (
          <p className="rounded-[8px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">{error}</p>
        ) : null}
        {notice ? (
          <p className="rounded-[8px] border border-[#cfe8dc] bg-[#f2fbf5] px-4 py-3 text-sm font-semibold text-[#286b43]">{notice}</p>
        ) : null}

        <fieldset disabled={saving} className="m-0 min-w-0 space-y-6 border-0 p-0">
        <RentalCreateProgressNav activeStep={activeStep} onStepClick={goToStep} />

        <div className="grid w-full min-w-0 max-w-full gap-6">
          {linkedLandlordLead ? <p className="rounded-[8px] border border-[#cfe8dc] bg-[#f2fbf5] px-4 py-3 text-sm font-semibold text-[#286b43]">Creating this listing for landlord lead {linkedLandlordLead.name}. The listing will be linked after it is created.</p> : null}
          {activeStep === 'property' ? <FormSection>
            <section>
              <h3 id="rental-property-category-label" className="text-sm font-semibold text-[#18324b]">Property category</h3>
              <div role="group" aria-labelledby="rental-property-category-label" className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {PROPERTY_CATEGORY_OPTIONS.filter((option) => option.value !== 'mixed_use' || form.propertyCategory === 'mixed_use').map((option) => <PropertyChoiceCard key={option.value} label={option.label} icon={option.icon} active={form.propertyCategory === option.value} onClick={() => { updateForm('propertyCategory', option.value); if (!RENTAL_CATEGORY_TYPES[option.value]?.includes(form.propertyType)) updateForm('propertyType', RENTAL_CATEGORY_TYPES[option.value]?.[0] || 'Apartment') }} />)}
              </div>
            </section>
            <section className="border-t border-[#e6edf5] pt-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <SelectField label="Ownership / title type" name="rentalTitleType" value={form.rentalPortalFacts?.['propertyInfo.propertyDescription.propertyDescriptionType'] || ''} onChange={(_, value) => updateForm('rentalPortalFacts', { ...form.rentalPortalFacts, ['propertyInfo.propertyDescription.propertyDescriptionType']: value })} options={[{ value: '', label: 'Not captured' }, ...RENTAL_PORTAL_FIELDS.find((field) => field.key === 'propertyInfo.propertyDescription.propertyDescriptionType').options.map((value) => ({ value, label: ({ Erf: 'Freehold / erf', Unit: 'Sectional title', ExclusiveUseArea: 'Sectional title — exclusive use area', AgriculturalHolding: 'Agricultural holding' })[value] || value }))]} />
                <SelectField label="Property type" name="propertyType" value={form.propertyType} onChange={updateForm} options={[...(RENTAL_CATEGORY_TYPES[form.propertyCategory] || []).map((value) => ({ value, label: value })), ...(!RENTAL_CATEGORY_TYPES[form.propertyCategory]?.includes(form.propertyType) ? [{ value: form.propertyType, label: LEGACY_PROPERTY_TYPE_OPTIONS.find((option) => option.value === form.propertyType)?.label || form.propertyType }] : [])]} />
                {['residential', 'agricultural'].includes(form.propertyCategory) ? <div role="group" aria-labelledby="rental-retirement-label"><p id="rental-retirement-label" className="text-sm font-semibold text-[#2d445e]">Retirement accommodation</p><div className="mt-2 grid grid-cols-2 gap-3">{['yes', 'no'].map((value) => <PropertyChoiceCard key={value} label={value === 'yes' ? 'Yes' : 'No'} active={form.retirementAccommodation === value} onClick={() => updateForm('retirementAccommodation', value)} />)}</div></div> : null}
              </div>
            </section>
            <section>
              <div>
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
                <summary className="cursor-pointer text-sm font-semibold text-[#1f4f78]">Address details and portal display</summary>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {['Unit', 'ExclusiveUseArea'].includes(form.rentalPortalFacts?.['propertyInfo.propertyDescription.propertyDescriptionType']) ? <><label className="form-field"><span>Unit number</span><input {...formField('unitNumber', form.unitNumber, updateForm)} placeholder="Unit 12" /></label>
                  <label className="form-field"><span>Complex / building</span><input {...formField('complexName', form.complexName, updateForm)} placeholder="The Atrium" /></label></> : null}
                  <label className="form-field"><span>Street number</span><input {...formField('streetNumber', form.streetNumber, updateForm)} placeholder="10" /></label>
                  <label className="form-field"><span>Street name</span><input {...formField('streetName', form.streetName, updateForm)} placeholder="Beach Road" /></label>
                  <label className="form-field"><span>Suburb</span><input {...formField('suburb', form.suburb, updateForm)} placeholder="Suburb" /></label>
                  <label className="form-field"><span>City</span><input {...formField('city', form.city, updateForm)} placeholder="City" /></label>
                  <label className="form-field"><span>Province</span><input {...formField('province', form.province, updateForm)} placeholder="Province" /></label>
                  <label className="form-field"><span>Postal code</span><input {...formField('postalCode', form.postalCode, updateForm)} placeholder="8005" /></label>
                  <SelectField label="Portal address display" name="exactAddressVisibility" value={form.exactAddressVisibility} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.exactAddressVisibility} />
                </div>
              </details>
            </section>

            <section className="border-t border-[#e6edf5] pt-6">
              <h3 className="text-sm font-semibold text-[#18324b]">Property specifications</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {['residential', 'agricultural', 'commercial', 'industrial', 'retail', 'mixed_use'].includes(form.propertyCategory) ? <PropertyCounter label="Bedrooms" value={form.bedrooms} onChange={(value) => updateForm('bedrooms', value)} /> : null}
                {form.propertyCategory !== 'vacant_land' ? <PropertyCounter label="Bathrooms" value={form.bathrooms} onChange={(value) => updateForm('bathrooms', value)} /> : null}
                {['residential', 'agricultural'].includes(form.propertyCategory) ? <PropertyCounter label="Garages" value={form.garages} onChange={(value) => updateForm('garages', value)} /> : null}
                <PropertyCounter label="Parking" value={form.parkingBays} onChange={(value) => updateForm('parkingBays', value)} />
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="form-field"><span>Floor size (m²)</span><input type="number" min="0" step="0.1" {...formField('floorSize', form.floorSize, updateForm)} placeholder="120" /></label>
                <label className="form-field"><span>Erf size (m²)</span><input type="number" min="0" step="0.1" {...formField('erfSize', form.erfSize, updateForm)} placeholder="350" /></label>
              </div>
              {['residential', 'agricultural'].includes(form.propertyCategory) ? <details className="mt-5 rounded-xl border border-[#dbe6f2] bg-[#fbfdff] p-4">
                <summary className="cursor-pointer text-sm font-semibold text-[#1f4f78]">More specifications</summary>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <PropertyCounter label="Covered parking" value={form.coveredParking} onChange={(value) => updateForm('coveredParking', value)} />
                  <PropertyCounter label="Open parking" value={form.openParking} onChange={(value) => updateForm('openParking', value)} />
                  <PropertyCounter label="Carports" value={form.carports} onChange={(value) => updateForm('carports', value)} />
                  <PropertyCounter label="En-suite bathrooms" value={form.enSuiteBathrooms} step={0.5} onChange={(value) => updateForm('enSuiteBathrooms', value)} />
                  <PropertyCounter label="Lounges" value={form.lounges} onChange={(value) => updateForm('lounges', value)} />
                  <PropertyCounter label="Dining rooms" value={form.diningRooms} onChange={(value) => updateForm('diningRooms', value)} />
                  <PropertyCounter label="Kitchens" value={form.kitchens} onChange={(value) => updateForm('kitchens', value)} />
                  <PropertyCounter label="Studies" value={form.studies} onChange={(value) => updateForm('studies', value)} />
                  <PropertyCounter label="Storerooms" value={form.storerooms} onChange={(value) => updateForm('storerooms', value)} />
                  <PropertyCounter label="Staff rooms" value={form.staffRooms} onChange={(value) => updateForm('staffRooms', value)} />
                </div>
              </details> : null}
            </section>
          </FormSection> : null}

          {activeStep === 'features' ? <FormSection><RentalCategoryFields form={form} onChange={updateForm} disabled={saving} /></FormSection> : null}

          {activeStep === 'landlord' ? <FormSection>
            <section>
              <h3 className="text-sm font-semibold text-[#18324b]">Landlord type</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                  <span>{form.landlordType === 'company' ? 'Company name *' : form.landlordType === 'trust' ? 'Trust name *' : form.landlordType === 'multiple_owners' ? 'Primary owner full name *' : form.landlordType === 'foreign_owner' ? 'Owner or entity name *' : form.landlordType === 'individual' ? 'Full name *' : 'Entity name *'}</span>
                  <input required {...formField('landlordName', form.landlordName, updateForm)} placeholder={form.landlordType === 'individual' ? 'Landlord full name' : 'Registered entity name'} />
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

          {activeStep === 'terms' ? <FormSection title="Rental terms">
            <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
              <RentalTermsCard title="Rent" icon={Coins}>
                <label className="form-field"><span>Rental amount</span><input type="number" min="0" {...formField('monthlyRent', form.monthlyRent, updateForm)} placeholder="Amount in rand" /></label>
                <SelectField label="Rental price frequency" name="rentalPriceFrequency" value={form.rentalPriceFrequency} onChange={updateForm} options={priceFrequencyOptions} />
                <div className="sm:col-span-2"><SelectField label="Furnished" name="furnishedStatus" value={form.furnishedStatus} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.furnishedStatus} /></div>
              </RentalTermsCard>

              <RentalTermsCard title="Availability & lease" icon={CalendarDays}>
                <label className="form-field"><span>Available from</span><input type="date" {...formField('availableFrom', form.availableFrom, updateForm)} /></label>
                <label className="form-field"><span>Occupation date</span><input type="date" {...formField('occupationDate', form.occupationDate, updateForm)} /></label>
                <label className="form-field"><span>Lease period (months)</span><input type="number" min="1" {...formField('leasePeriodMonths', form.leasePeriodMonths, updateForm)} /></label>
                <SelectField label="Lease period type" name="leasePeriodType" value={form.leasePeriodType} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.leasePeriodType} />
                <div className="sm:col-span-2"><SelectField label="Rental type" name="rentalMandateType" value={form.rentalMandateType} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.rentalMandateType} /></div>
              </RentalTermsCard>

              <RentalTermsCard title="Deposit" icon={ShieldCheck}>
                <div className="sm:col-span-2"><SelectField label="Deposit policy" name="depositPolicy" value={form.depositPolicy} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.depositPolicy} /></div>
                {form.depositPolicy !== 'no_deposit' ? <>
                  <label className="form-field"><span>Deposit amount</span><input type="number" min="0" {...formField('depositAmount', form.depositAmount, updateForm)} placeholder="Amount in rand" /></label>
                  <label className="form-field"><span>Deposit multiplier</span><input type="number" min="0" step="0.5" {...formField('depositMultiplier', form.depositMultiplier, updateForm)} placeholder="e.g. 1.5" /></label>
                  <label className="form-field sm:col-span-2"><span>Deposit requirements</span><input {...formField('depositRequirement', form.depositRequirement, updateForm)} placeholder="e.g. One and a half months’ rent" /></label>
                  <p className="text-xs text-[#607891] sm:col-span-2">The entered amount takes priority over the multiplier.</p>
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

              <RentalTermsCard title="Inspection" icon={ClipboardCheck}>
                <div className="sm:col-span-2"><SelectField label="Inspection" name="inspectionStatus" value={form.inspectionStatus} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.inspectionStatus} /></div>
                <label className="form-field sm:col-span-2"><span>Inspection notes</span><textarea rows={3} {...formField('inspectionNotes', form.inspectionNotes, updateForm)} placeholder="Repairs, access or inspection arrangements" /></label>
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

          {activeStep === 'marketing' ? <FormSection title="Marketing">
            <section className="min-w-0 rounded-2xl border border-[#dbe6f2] bg-white p-4 sm:p-5">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eef4fa] text-[#315f80]"><ImagePlus size={18} aria-hidden="true" /></span>
                  <h3 className="text-sm font-semibold text-[#18324b]">Photos</h3>
                  <span className="rounded-full bg-[#eef4fa] px-2.5 py-1 text-xs font-semibold text-[#526f88]">{form.galleryImages.length}</span>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-[#1f7d44] bg-[#1f7d44] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#176338] focus-within:ring-2 focus-within:ring-[#286b43] focus-within:ring-offset-2"><ImagePlus size={16} aria-hidden="true" />Upload photos<input type="file" accept="image/*" multiple className="sr-only" onChange={handleGalleryUpload} aria-label="Upload listing photos" /></label>
              </div>
              {form.galleryImages.length ? <div className="mt-5 grid max-h-[30rem] min-w-0 grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {form.galleryImages.map((image, index) => {
                  const isCover = String(form.coverImageId) === String(image.id)
                  return <article key={image.id} className={`min-w-0 overflow-hidden rounded-xl border ${isCover ? 'border-[#91abc0]' : 'border-[#dbe6f2]'} bg-white`}>
                    <div className="relative aspect-[16/10] bg-[#eef4fa]">
                      <img src={image.url} alt={image.name} className="block h-full w-full object-cover" loading="lazy" />
                      <span className="absolute left-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-md bg-white/95 px-1.5 text-xs font-semibold text-[#18324b]">{index + 1}</span>
                      {isCover ? <span className="absolute right-2 top-2 rounded-md bg-[#18324b] px-2 py-1 text-xs font-semibold text-white">Cover</span> : null}
                    </div>
                    <div className="min-w-0 p-3">
                      <p className="truncate text-xs font-medium text-[#526f88]" title={image.name}>{image.name}</p>
                      <div className="mt-3 flex items-center justify-between gap-2">
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
              <label className="form-field"><span>Video link</span><input type="url" aria-label="Video link" {...formField('videoLink', form.videoLink, updateForm)} placeholder="https://youtu.be/..." /><small>Optional public video URL.</small></label>
              <label className="form-field"><span>Virtual tour link</span><input type="url" aria-label="Virtual tour link" {...formField('virtualTourLink', form.virtualTourLink, updateForm)} placeholder="https://my.matterport.com/..." /><small>Optional public virtual tour URL.</small></label>
            </section>
            <div className="grid min-w-0 items-start gap-4 xl:grid-cols-3">
              <section className="min-w-0 rounded-2xl border border-[#dbe6f2] bg-white p-4 sm:p-5 xl:col-span-2">
                <div className="mb-5 flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eef4fa] text-[#315f80]"><FileText size={18} aria-hidden="true" /></span><h3 className="text-sm font-semibold text-[#18324b]">Listing copy</h3></div>
                <div className="grid min-w-0 gap-4">
                  <label className="form-field"><span>Listing title</span><input {...formField('title', form.title, updateForm)} placeholder="e.g. Bright two-bedroom apartment in Green Point" /></label>
                  <label className="form-field"><span>Listing description</span><textarea rows={8} {...formField('description', form.description, updateForm)} placeholder="Describe the home and what makes it stand out" /></label>
                </div>
              </section>

              <div className="grid min-w-0 gap-4">
                <section className="min-w-0 rounded-2xl border border-[#dbe6f2] bg-white p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eef4fa] text-[#315f80]"><CheckCircle2 size={18} aria-hidden="true" /></span><h3 className="text-sm font-semibold text-[#18324b]">Confirmed features</h3></div><button type="button" data-rental-control="edit-features" className="text-xs font-semibold text-[#315f80] underline underline-offset-2" onClick={() => goToStep('features')}>Edit features</button></div>
                  <div className="mt-5 flex flex-wrap gap-2">{selectedSellingPoints.length ? selectedSellingPoints.map((label) => <span key={label} className="rounded-lg border border-[#dbe6f2] bg-[#f5f9fc] px-2.5 py-1.5 text-xs text-[#315f80]">{label}</span>) : <p className="text-sm text-[#607891]">No features selected</p>}</div>
                </section>
                <details className="min-w-0 rounded-2xl border border-[#dbe6f2] bg-white p-4 sm:p-5">
                  <summary className="cursor-pointer text-sm font-semibold text-[#18324b]">Internal notes</summary>
                  <label className="form-field mt-4"><span>Internal notes</span><textarea rows={4} {...formField('internalNotes', form.internalNotes, updateForm)} placeholder="Notes for your team" /></label>
                </details>
              </div>
            </div>
          </FormSection> : null}

          {activeStep === 'syndication' ? <FormSection title="Syndication">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[#18324b]">Publication channels</h3>
              <span className="rounded-full bg-[#eef4fa] px-3 py-1 text-xs font-semibold text-[#526f88]">{selectedDistributionChannels.length} external selected</span>
            </div>
            <div className="listing-syndication-grid">
              {RENTAL_DISTRIBUTION_CHANNELS.map((channel) => {
                const selected = selectedDistributionChannels.includes(channel.key)
                const needsAttention = channel.key === 'private_property' && form.galleryImages.length < 3
                  ? `Add ${3 - form.galleryImages.length} more photo${3 - form.galleryImages.length === 1 ? '' : 's'} (minimum 3).`
                  : channel.key === 'agency_website' && form.galleryImages.length < 1
                    ? 'Add at least 1 photo.'
                    : ''
                return <ListingSyndicationChannelCard key={channel.key} channel={channel} selected={selected} needsAttention={selected ? needsAttention : ''} onToggle={toggleDistributionChannel} agencyLogo={agencyLogo} />
              })}
              <ListingSyndicationChannelCard channel={{ key: 'arch9_internal', label: 'Arch9 Platform', internalOnly: true }} selected />
            </div>
            {selectedDistributionChannels.some((key) => (key === 'private_property' && form.galleryImages.length < 3) || (key === 'agency_website' && form.galleryImages.length < 1)) ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f1d4a6] bg-[#fffaf0] px-4 py-3 text-sm text-[#8a5a12]">
              <span>Selected channels need more photos.</span>
              <button type="button" data-rental-control="syndication-photos" className="font-semibold underline underline-offset-2" onClick={() => goToStep('marketing')}>Add photos</button>
            </div> : null}
            <p className="text-xs leading-5 text-[#607891]">Choose where to publish this rental. Your selections are saved with the draft; publish to each channel from the listing workspace once its checks pass.</p>
          </FormSection> : null}

          {activeStep === 'review' ? <section className="ui-panel ui-panel-body grid gap-6">
            <div className="flex flex-col gap-4 border-b border-[#e6edf5] pb-5 md:flex-row md:items-start md:justify-between">
              <div><p className="text-xs font-semibold uppercase text-[#607891]">Step 7 of 7</p><h2 className="text-2xl font-semibold text-[#18324b]">Review rental listing</h2><p className="mt-1 text-sm text-[#607891]">Check the capture is complete, then {isEditing ? 'save the rental changes.' : 'create the rental draft.'}</p></div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${validationErrors.length ? 'bg-[#fff5e5] text-[#a76a12]' : 'bg-[#eef9f1] text-[#286b43]'}`}>{validationErrors.length ? `${validationErrors.length} items still needed` : isEditing ? 'Ready to save' : 'Ready to create'}</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <ReviewSummaryCard title="Landlord & mandate" onEdit={() => goToStep('landlord')} details={[{ label: 'Landlord', value: form.landlordName || 'Not added' }, { label: 'Contact', value: form.landlordEmail || form.landlordPhone || 'Not added' }, { label: 'Mandate', value: RENTAL_SELECT_OPTIONS.mandateStatus.find((option) => option.value === form.mandateStatus)?.label || 'Not captured' }]} />
              <ReviewSummaryCard title="Property" onEdit={() => goToStep('property')} details={[{ label: 'Listing', value: buildRentalListingTitle(form) || 'Untitled rental listing' }, { label: 'Address', value: form.propertyAddress || 'Not added' }, { label: 'Type', value: form.propertyType || 'Not captured' }]} />
              <ReviewSummaryCard title="Additional property details" onEdit={() => goToStep('features')} details={[{ label: 'Confirmed features', value: `${selectedSellingPoints.length} confirmed` }, { label: 'Pet friendly', value: form.petsPolicy === 'allowed' ? 'Yes' : form.petsPolicy === 'not_allowed' ? 'No' : 'Subject to approval' }]} />
              <ReviewSummaryCard title="Rental terms" onEdit={() => goToStep('terms')} details={[{ label: 'Rental amount', value: form.monthlyRent ? `R ${Number(form.monthlyRent).toLocaleString('en-ZA')}` : 'Not added' }, { label: 'Frequency', value: RENTAL_SELECT_OPTIONS.rentalPriceFrequency.find((option) => option.value === form.rentalPriceFrequency)?.label || 'Not captured' }, { label: 'Available', value: form.availableFrom || 'Not added' }, { label: 'Lease', value: form.leasePeriodMonths ? `${form.leasePeriodMonths} months` : 'Not captured' }]} />
              <ReviewSummaryCard title="Marketing" onEdit={() => goToStep('marketing')} details={[{ label: 'Photos', value: `${form.galleryImages.length} selected` }, { label: 'Video', value: form.videoLink ? 'Added' : 'Not added (optional)' }, { label: 'Virtual tour', value: form.virtualTourLink ? 'Added' : 'Not added (optional)' }, { label: 'Description', value: form.description ? 'Added' : 'Not added' }, { label: 'Selling points', value: `${selectedSellingPoints.length} selected` }]} />
            </div>
            {validationErrors.length ? <div className="rounded-[12px] border border-[#f1d4a6] bg-[#fffaf0] p-4"><p className="font-semibold text-[#8a5a12]">Complete these required items before creating</p><ul className="mt-3 grid gap-2 text-sm text-[#8a5a12]">{validationErrors.map((item) => { const step = stepForValidationError(item); return <li key={item} className="flex flex-wrap items-center justify-between gap-2"><span>{item}</span>{step !== 'review' ? <button type="button" className="font-semibold underline underline-offset-2" onClick={() => goToStep(step)}>Fix in {CREATE_STEPS.find((entry) => entry.key === step)?.label}</button> : null}</li> })}</ul></div> : null}
          </section> : null}

          <footer className="ui-panel ui-panel-body flex flex-wrap items-center justify-between gap-3">
            <div>
              {activeStepIndex > 0 ? (
                <Button type="button" onClick={goToPreviousStep}>
                  <ChevronLeft size={16} aria-hidden="true" />
                  Back
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={saveDraftForSession}>Save draft</Button>
              <Button
                type={activeStep === 'review' ? 'submit' : 'button'}
                onClick={activeStep === 'review' ? undefined : goToNextStep}
                disabled={activeStep === 'review' ? !canSubmit : false}
              >
                {activeStep === 'review' && saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : activeStep === 'review' ? <Save size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                {activeStep === 'review' ? (saving ? 'Saving rental…' : isEditing ? 'Save rental changes' : pendingListingId ? 'Retry saving rental' : 'Create rental listing') : 'Continue'}
              </Button>
            </div>
          </footer>
        </div>
        </fieldset>
      </form>
    </section>
  )
}
