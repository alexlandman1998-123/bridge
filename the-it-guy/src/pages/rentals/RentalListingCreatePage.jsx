import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, CheckCircle2, ChevronLeft, ChevronRight, Globe2, ImagePlus, Landmark, Loader2, Minus, Plus, Save, Trash2, UserRound, Users, X } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import AddressAutocomplete from '../../components/location/AddressAutocomplete'
import { createRentalListingDraft } from '../../services/rentals/rentalListingDraftService'
import {
  buildRentalListingTitle,
  RENTAL_LISTING_INITIAL_FORM,
  RENTAL_SELECT_OPTIONS,
  validateRentalListingDraftForm,
} from '../../services/rentals/rentalListingDraftModel'
import { resolveRentalWorkspaceScope } from '../../services/rentals/rentalWorkspaceScope'
import { listRentalLeads } from '../../services/rentals/rentalLeadService'
import { linkRentalLandlordLeadToListing } from '../../services/rentals/rentalLandlordListingHandoffService'

const PROPERTY_TYPE_OPTIONS = Object.freeze([
  { value: 'Apartment', label: 'Apartment' },
  { value: 'House', label: 'House' },
  { value: 'Townhouse', label: 'Townhouse' },
  { value: 'Duplex', label: 'Duplex' },
  { value: 'Studio', label: 'Studio' },
])

const SELLING_POINT_OPTIONS = Object.freeze([
  ['Pool', 'pool'], ['Garden', 'garden'], ['Security', 'securityPost'], ['Electric fence', 'electricFencing'],
  ['Solar', 'solarBackup'], ['Backup water', 'backupWater'], ['Borehole', 'borehole'], ['Fibre', 'fibreInternet'],
  ['Pet friendly', null], ['Study', null], ['Staff quarters', null], ['Entertainment area', null],
  ['Open-plan living', null], ['Balcony', 'balcony'], ['Patio', 'patio'], ['Built-in braai', 'builtInBraai'],
  ['Flatlet', 'flatlet'], ['Clubhouse', 'clubhouse'], ['Gym', 'gym'], ['Scenic view', 'scenicView'],
  ['Prepaid electricity', 'prepaidElectricity'], ['Prepaid water', 'prepaidWater'], ['Access gate', 'accessGate'], ['Alarm', 'alarm'],
])

const CREATE_STEPS = Object.freeze([
  { key: 'landlord', label: 'Landlord & Mandate', description: 'Owner & mandate details' },
  { key: 'property', label: 'Property', description: 'Add property details' },
  { key: 'terms', label: 'Rental terms', description: 'Price & lease' },
  { key: 'marketing', label: 'Marketing', description: 'Photos & description' },
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
    selectedFeatures: [...RENTAL_LISTING_INITIAL_FORM.selectedFeatures],
    amenities: [...RENTAL_LISTING_INITIAL_FORM.amenities],
    galleryImages: [...RENTAL_LISTING_INITIAL_FORM.galleryImages],
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

function toggleArrayValue(values, nextValue) {
  const normalized = String(nextValue || '').trim()
  const current = Array.isArray(values) ? values : []
  if (!normalized) return current
  return current.includes(normalized)
    ? current.filter((value) => value !== normalized)
    : [...current, normalized]
}

function SelectField({ label, name, value, options, onChange }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <select {...formField(name, value, onChange)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

function FormSection({ eyebrow, title, description = '', children }) {
  return (
    <section className="ui-panel ui-panel-body grid gap-4">
      <div>
        <p className="text-xs font-semibold uppercase text-[#607891]">{eyebrow}</p>
        <h2 className="text-lg font-semibold text-[#18324b]">{title}</h2>
        {description ? <p className="mt-1 text-sm text-[#607891]">{description}</p> : null}
      </div>
      {children}
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
        <button type="button" aria-label={`Decrease ${label}`} disabled={safeValue <= 0} onClick={() => changeValue(safeValue - step)} className="inline-flex items-center justify-center border-r border-[#e6edf5] text-lg font-semibold text-[#1f4f78] transition hover:bg-[#f4f8fc] disabled:cursor-not-allowed disabled:text-[#b5c3d1]">
          <Minus size={17} aria-hidden="true" />
        </button>
        <output className="flex items-center justify-center text-sm font-semibold text-[#18324b]">{safeValue}</output>
        <button type="button" aria-label={`Increase ${label}`} onClick={() => changeValue(safeValue + step)} className="inline-flex items-center justify-center border-l border-[#e6edf5] text-lg font-semibold text-[#1f4f78] transition hover:bg-[#f4f8fc]">
          <Plus size={17} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

function SellingPointTile({ label, active, onClick }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-h-11 items-center justify-between rounded-lg border px-3 text-left text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#286b43] focus:ring-offset-2 ${
        active
          ? 'border-[#79bf95] bg-[#eef9f1] text-[#286b43]'
          : 'border-[#dbe6f2] bg-white text-[#42617f] hover:border-[#9fc5ae] hover:text-[#286b43]'
      }`}
    >
      <span>{label}</span>
      <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full border ${active ? 'border-[#286b43] bg-[#286b43] text-white' : 'border-[#aebfd0] bg-white text-transparent'}`}>
        <CheckCircle2 size={11} aria-hidden="true" />
      </span>
    </button>
  )
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
  if (normalized.includes('landlord')) return 'landlord'
  if (normalized.includes('property address')) return 'property'
  if (normalized.includes('monthly rent') || normalized.includes('availability')) return 'terms'
  return 'review'
}

function RentalCreateProgressNav({ activeStep, onStepClick }) {
  const activeIndex = CREATE_STEPS.findIndex((step) => step.key === activeStep)
  return (
    <nav className="overflow-x-auto rounded-[16px] border border-[#dde6ef] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.035)]" aria-label="Create rental listing progress">
      <div className="flex min-w-[780px] items-center gap-3">
        {CREATE_STEPS.map((step, index) => {
          const complete = index < activeIndex
          const active = index === activeIndex
          return (
            <div key={step.key} className="flex flex-1 items-center gap-3">
              <button type="button" onClick={() => onStepClick(step.key)} className={`flex min-w-0 items-center gap-3 rounded-[10px] px-2 py-2 text-left ${active ? 'text-[#142132]' : 'text-[#607387]'}`}>
                <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${active || complete ? 'bg-[#1f7d44] text-white' : 'bg-[#eef2f6] text-[#6b7d93]'}`}>
                  {complete ? <CheckCircle2 size={16} aria-hidden="true" /> : index + 1}
                </span>
                <span className="min-w-0"><span className="block truncate text-sm font-bold">{step.label}</span><span className="block truncate text-xs text-[#60758c]">{step.description}</span>{active ? <span className="mt-2 block h-0.5 w-12 rounded-full bg-[#1f7d44]" /> : null}</span>
              </button>
              {index < CREATE_STEPS.length - 1 ? <span className={`h-px flex-1 ${complete ? 'bg-[#1f7d44]' : 'bg-[#d6e0eb]'}`} /> : null}
            </div>
          )
        })}
      </div>
    </nav>
  )
}

export default function RentalListingCreatePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const workspaceContext = useWorkspace()
  const rentalScope = useMemo(() => resolveRentalWorkspaceScope(workspaceContext), [workspaceContext])
  const organisationId = rentalScope.organisationId
  const branchId = rentalScope.branchId
  const assignedAgentId = rentalScope.assignedAgentId
  const [form, setForm] = useState(createInitialFormState)
  const [activeStep, setActiveStep] = useState('landlord')
  const galleryImagesRef = useRef(form.galleryImages)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [linkedLandlordLead, setLinkedLandlordLead] = useState(null)

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
    () => [...new Set([...(form.selectedFeatures || []), ...(form.amenities || [])])],
    [form.amenities, form.selectedFeatures],
  )
  const canSubmit = validationErrors.length === 0 && !saving
  const activeStepIndex = CREATE_STEPS.findIndex((step) => step.key === activeStep)

  useEffect(() => {
    try {
      const storedDraft = window.sessionStorage.getItem(RENTAL_CREATE_SESSION_DRAFT_KEY)
      if (!storedDraft) return
      const parsedDraft = JSON.parse(storedDraft)
      if (!parsedDraft || typeof parsedDraft !== 'object') return
      setForm((current) => ({
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
      window.sessionStorage.removeItem(RENTAL_CREATE_SESSION_DRAFT_KEY)
    }
  }, [])

  useEffect(() => {
    galleryImagesRef.current = form.galleryImages
  }, [form.galleryImages])

  useEffect(() => {
    const leadId = searchParams.get('leadId')
    if (!leadId || !organisationId) { setLinkedLandlordLead(null); return }
    const options = { assignedAgentId, branchId, scopeLevel: rentalScope.scopeLevel, includeAllOrganisationLeads: rentalScope.scopeLevel === 'organisation' }
    void listRentalLeads(organisationId, options).then((leads) => {
      const lead = leads.find((item) => item.id === leadId && item.role === 'landlord' && item.stage === 'listing_ready') || null
      setLinkedLandlordLead(lead)
      if (!lead) setError('The requested landlord lead is not available at Listing ready in your current scope.')
    }).catch((loadError) => setError(loadError?.message || 'Unable to validate linked landlord lead.'))
  }, [assignedAgentId, branchId, organisationId, rentalScope.scopeLevel, searchParams])

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
    if (!address) return
    setForm((current) => ({
      ...current,
      propertyAddress: address.formattedAddress || current.propertyAddress,
      streetNumber: address.streetNumber || current.streetNumber,
      streetName: address.streetName || address.route || current.streetName,
      suburb: address.suburb || current.suburb,
      city: address.city || current.city,
      province: address.province || current.province,
      postalCode: address.postalCode || current.postalCode,
    }))
    setError('')
    setNotice('')
  }

  function toggleSellingPoint(value, portalField) {
    setForm((current) => ({
      ...current,
      selectedFeatures: toggleArrayValue([...(current.selectedFeatures || []), ...(current.amenities || [])], value),
      amenities: [],
      ...(portalField
        ? { [portalField]: toggleArrayValue([...(current.selectedFeatures || []), ...(current.amenities || [])], value).includes(value) ? 'yes' : '' }
        : {}),
    }))
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
      window.sessionStorage.setItem(RENTAL_CREATE_SESSION_DRAFT_KEY, JSON.stringify({
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
    if (!canSubmit) {
      setError(validationErrors[0] || 'Complete the required rental listing fields.')
      return
    }
    try {
      setSaving(true)
      setError('')
      const result = await createRentalListingDraft(form, {
        organisationId,
        branchId,
        assignedAgentId,
        performedBy: assignedAgentId,
      })
      const listingId = result?.listing?.id
      if (listingId) {
        if (linkedLandlordLead) {
          try {
            await linkRentalLandlordLeadToListing(linkedLandlordLead, listingId, { organisationId, actor: { id: assignedAgentId, userId: assignedAgentId } })
          } catch (linkError) {
            setError(`Listing ${listingId} was created, but it was not linked to the landlord lead: ${linkError?.message || 'unknown link failure'}`)
            return
          }
        }
        navigate(`/agent/rentals/listings/${encodeURIComponent(listingId)}`, {
          state: { rentalListingCreatedTitle: buildRentalListingTitle(form) },
        })
        return
      }
      navigate('/agent/rentals/listings', {
        state: { rentalListingCreatedTitle: buildRentalListingTitle(form) },
      })
    } catch (saveError) {
      setError(saveError?.message || 'Unable to create the rental listing draft.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="page-content">
      <form onSubmit={handleSubmit} className="ui-section-stack">
        <header className="flex flex-wrap items-start justify-between gap-4 px-1 pt-1">
          <div>
            <p className="text-sm font-semibold text-[#607891]">Listings <span aria-hidden="true">→</span> New listing (rentals)</p>
            <h1 className="mt-3 text-[1.8rem] font-semibold tracking-[-0.03em] text-[#18324b]">New listing</h1>
            <p className="mt-1 text-base text-[#607891]">
              Capture the rental listing details.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[#dbe6f2] bg-white text-[#607891] transition hover:border-[#9fc5ae] hover:text-[#286b43]"
            onClick={() => navigate('/agent/rentals/listings')}
            aria-label="Close new rental listing"
          >
            <X size={21} aria-hidden="true" />
          </button>
        </header>

        {error ? (
          <p className="rounded-[8px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">{error}</p>
        ) : null}
        {notice ? (
          <p className="rounded-[8px] border border-[#cfe8dc] bg-[#f2fbf5] px-4 py-3 text-sm font-semibold text-[#286b43]">{notice}</p>
        ) : null}

        <RentalCreateProgressNav activeStep={activeStep} onStepClick={goToStep} />

        <div className="grid gap-6">
          {linkedLandlordLead ? <p className="rounded-[8px] border border-[#cfe8dc] bg-[#f2fbf5] px-4 py-3 text-sm font-semibold text-[#286b43]">Creating this listing for landlord lead {linkedLandlordLead.name}. The listing will be linked after it is created.</p> : null}
          {activeStep === 'property' ? <FormSection
            eyebrow="Step 2 of 5"
            title="Property"
            description="Add the property details."
          >
            <section>
              <h3 className="text-sm font-semibold text-[#18324b]">1. Property address</h3>
              <div className="mt-4">
                <AddressAutocomplete
                  label="Property address"
                  value={{ formattedAddress: form.propertyAddress, streetNumber: form.streetNumber, streetName: form.streetName, suburb: form.suburb, city: form.city, province: form.province, postalCode: form.postalCode }}
                  onChange={updatePropertyAddress}
                  onInputValueChange={(value) => updateForm('propertyAddress', value)}
                  predictionTypes={['address']}
                  placeholder="Search for the property address..."
                  hideUnavailableMessage
                />
              </div>
              <details className="mt-4 rounded-xl border border-[#dbe6f2] bg-[#fbfdff] p-4">
                <summary className="cursor-pointer text-sm font-semibold text-[#1f4f78]">Address details and portal display</summary>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <label className="form-field"><span>Unit number</span><input {...formField('unitNumber', form.unitNumber, updateForm)} placeholder="Unit 12" /></label>
                  <label className="form-field"><span>Complex / building</span><input {...formField('complexName', form.complexName, updateForm)} placeholder="The Atrium" /></label>
                  <label className="form-field"><span>Street number</span><input {...formField('streetNumber', form.streetNumber, updateForm)} placeholder="10" /></label>
                  <label className="form-field"><span>Street name</span><input {...formField('streetName', form.streetName, updateForm)} placeholder="Beach Road" /></label>
                  <label className="form-field"><span>Suburb</span><input {...formField('suburb', form.suburb, updateForm)} placeholder="Suburb" /></label>
                  <label className="form-field"><span>City</span><input {...formField('city', form.city, updateForm)} placeholder="City" /></label>
                  <label className="form-field"><span>Province</span><input {...formField('province', form.province, updateForm)} placeholder="Province" /></label>
                  <label className="form-field"><span>Postal code</span><input {...formField('postalCode', form.postalCode, updateForm)} placeholder="8005" /></label>
                  <SelectField label="Portal address display" name="exactAddressVisibility" value={form.exactAddressVisibility} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.exactAddressVisibility} />
                  <label className="form-field"><span>Property24 suburb ID</span><input inputMode="numeric" {...formField('property24SuburbId', form.property24SuburbId, updateForm)} placeholder="Optional portal lookup ID" /></label>
                </div>
              </details>
            </section>

            <section className="border-t border-[#e6edf5] pt-6">
              <h3 className="text-sm font-semibold text-[#18324b]">2. Listing basics</h3>
              <div className="mt-4"><SelectField label="Property type" name="propertyType" value={form.propertyType} onChange={updateForm} options={PROPERTY_TYPE_OPTIONS} /></div>
            </section>

            <section className="border-t border-[#e6edf5] pt-6">
              <h3 className="text-sm font-semibold text-[#18324b]">3. Property specifications</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <PropertyCounter label="Bedrooms" value={form.bedrooms} onChange={(value) => updateForm('bedrooms', value)} />
                <PropertyCounter label="Bathrooms" value={form.bathrooms} onChange={(value) => updateForm('bathrooms', value)} />
                <PropertyCounter label="Garages" value={form.garages} onChange={(value) => updateForm('garages', value)} />
                <PropertyCounter label="Parking" value={form.parkingBays} onChange={(value) => updateForm('parkingBays', value)} />
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="form-field"><span>Floor size (m²)</span><input type="number" min="0" step="0.1" {...formField('floorSize', form.floorSize, updateForm)} placeholder="120" /></label>
                <label className="form-field"><span>Erf size (m²)</span><input type="number" min="0" step="0.1" {...formField('erfSize', form.erfSize, updateForm)} placeholder="350" /></label>
              </div>
              <details className="mt-5 rounded-xl border border-[#dbe6f2] bg-[#fbfdff] p-4">
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
              </details>
            </section>
          </FormSection> : null}

          {activeStep === 'landlord' ? <FormSection eyebrow="Step 1 of 5" title="Landlord & Mandate" description="Add the property owner and confirm the rental mandate.">
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

          {activeStep === 'terms' ? <FormSection eyebrow="Step 3 of 5" title="Rental Terms" description="Set the rental amount, lease conditions, deposits, fees, and availability.">
            <section>
              <h3 className="text-sm font-semibold text-[#18324b]">Price & availability</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="form-field"><span>Monthly rent</span><input type="number" min="0" {...formField('monthlyRent', form.monthlyRent, updateForm)} placeholder="18500" /></label>
                <label className="form-field"><span>Available from</span><input type="date" {...formField('availableFrom', form.availableFrom, updateForm)} /></label>
                <label className="form-field"><span>Occupation date</span><input type="date" {...formField('occupationDate', form.occupationDate, updateForm)} /></label>
                <SelectField label="Furnished" name="furnishedStatus" value={form.furnishedStatus} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.furnishedStatus} />
              </div>
            </section>

            <section className="border-t border-[#e6edf5] pt-6">
              <h3 className="text-sm font-semibold text-[#18324b]">Lease</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="form-field"><span>Lease period (months)</span><input type="number" min="1" {...formField('leasePeriodMonths', form.leasePeriodMonths, updateForm)} /></label>
                <SelectField label="Lease period type" name="leasePeriodType" value={form.leasePeriodType} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.leasePeriodType} />
                <SelectField label="Pets" name="petsPolicy" value={form.petsPolicy} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.petsPolicy} />
              </div>
            </section>

            <section className="border-t border-[#e6edf5] pt-6">
              <h3 className="text-sm font-semibold text-[#18324b]">Deposits & fees</h3>
              <p className="mt-1 text-sm text-[#607891]">Use either a deposit amount or a multiplier. The amount is what tenants will see and takes precedence when both are supplied.</p>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="form-field"><span>Deposit amount</span><input type="number" min="0" {...formField('depositAmount', form.depositAmount, updateForm)} placeholder="37000" /></label>
                <label className="form-field"><span>Deposit multiplier</span><input type="number" min="0" step="0.5" {...formField('depositMultiplier', form.depositMultiplier, updateForm)} placeholder="1.5" /></label>
                <label className="form-field"><span>Deposit requirements</span><input {...formField('depositRequirement', form.depositRequirement, updateForm)} placeholder="One and a half months deposit" /></label>
              </div>
              {suggestedDepositAmount ? (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-[#d8eddf] bg-[#f4fbf6] px-4 py-3 text-sm text-[#286b43]">
                  <span>Suggested deposit: <strong>R {suggestedDepositAmount.toLocaleString('en-ZA')}</strong></span>
                  <button type="button" className="font-semibold underline underline-offset-2" onClick={() => updateForm('depositAmount', String(suggestedDepositAmount))}>Use calculated amount</button>
                </div>
              ) : null}
              <details className="mt-5 rounded-xl border border-[#dbe6f2] bg-[#fbfdff] p-4">
                <summary className="cursor-pointer text-sm font-semibold text-[#1f4f78]">Optional deposits and fees</summary>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <label className="form-field"><span>Application fee</span><input type="number" min="0" {...formField('applicationFee', form.applicationFee, updateForm)} /></label>
                  <label className="form-field"><span>Lease admin fee</span><input type="number" min="0" {...formField('leaseAdminFee', form.leaseAdminFee, updateForm)} /></label>
                  <label className="form-field"><span>Credit check fee</span><input type="number" min="0" {...formField('creditCheckFee', form.creditCheckFee, updateForm)} /></label>
                  <label className="form-field"><span>Key deposit</span><input type="number" min="0" {...formField('keyDepositAmount', form.keyDepositAmount, updateForm)} /></label>
                  <label className="form-field"><span>Utility deposit</span><input type="number" min="0" {...formField('utilityDepositAmount', form.utilityDepositAmount, updateForm)} /></label>
                </div>
              </details>
            </section>

            <section className="border-t border-[#e6edf5] pt-6">
              <h3 className="text-sm font-semibold text-[#18324b]">Utilities & inspection</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <SelectField label="Utilities" name="utilitiesPolicy" value={form.utilitiesPolicy} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.utilitiesPolicy} />
                <SelectField label="Inspection" name="inspectionStatus" value={form.inspectionStatus} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.inspectionStatus} />
                <label className="form-field xl:col-span-3"><span>Rental includes</span><input {...formField('rentalIncludes', form.rentalIncludes, updateForm)} placeholder="Water, Wi-Fi, garden service" /></label>
                <label className="form-field xl:col-span-3"><span>Rental excludes</span><input {...formField('rentalExcludes', form.rentalExcludes, updateForm)} placeholder="Prepaid electricity, refuse, sewerage" /></label>
                <label className="form-field xl:col-span-3"><span>Inspection notes</span><textarea rows={4} {...formField('inspectionNotes', form.inspectionNotes, updateForm)} placeholder="Inspection checklist status, repairs, access notes" /></label>
              </div>
            </section>
          </FormSection> : null}

          {activeStep === 'marketing' ? <FormSection eyebrow="Step 4 of 5" title="Marketing" description="Add photos, public listing copy, and the key selling points tenants will see.">
            <section>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="text-sm font-semibold text-[#18324b]">Photos</h3><p className="mt-1 text-sm text-[#607891]">{form.galleryImages.length} image{form.galleryImages.length === 1 ? '' : 's'} selected</p></div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-[#1f7d44] bg-[#1f7d44] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#176338]"><ImagePlus size={16} aria-hidden="true" />Upload images<input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryUpload} /></label>
              </div>
              {form.galleryImages.length ? <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {form.galleryImages.map((image, index) => {
                  const isCover = String(form.coverImageId) === String(image.id)
                  return <div key={image.id} className="overflow-hidden rounded-[12px] border border-[#dbe6f2] bg-white">
                    <div className="relative aspect-[4/3] bg-[#eef4fa]"><img src={image.url} alt={image.name} className="h-full w-full object-cover" />{isCover ? <span className="absolute left-2 top-2 rounded-full bg-[#286b43] px-2.5 py-1 text-[0.72rem] font-semibold text-white">Cover</span> : null}</div>
                    <div className="p-3"><p className="truncate text-sm font-semibold text-[#18324b]">{image.name}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setCoverImage(image.id)} disabled={isCover} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${isCover ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#286b43]' : 'border-[#dbe6f2] bg-white text-[#42617f]'}`}>{isCover ? 'Cover' : 'Set cover'}</button><button type="button" aria-label={`Move ${image.name} earlier`} disabled={index === 0} onClick={() => moveGalleryImage(image.id, -1)} className="rounded-lg border border-[#dbe6f2] px-3 py-2 text-xs font-semibold disabled:opacity-40">←</button><button type="button" aria-label={`Move ${image.name} later`} disabled={index === form.galleryImages.length - 1} onClick={() => moveGalleryImage(image.id, 1)} className="rounded-lg border border-[#dbe6f2] px-3 py-2 text-xs font-semibold disabled:opacity-40">→</button><button type="button" aria-label={`Remove ${image.name}`} onClick={() => removeGalleryImage(image.id)} className="rounded-lg border border-[#f1c8c8] px-3 py-2 text-xs font-semibold text-[#b42318]"><Trash2 size={13} aria-hidden="true" /></button></div></div>
                  </div>
                })}
              </div> : <div className="mt-4 rounded-[12px] border border-dashed border-[#cddaea] bg-white px-4 py-10 text-center"><p className="text-sm font-semibold text-[#18324b]">No images added yet</p><p className="mt-2 text-sm text-[#607891]">Upload gallery images to prepare this rental for marketing.</p></div>}
            </section>
            <section className="border-t border-[#e6edf5] pt-6"><div className="grid gap-4"><label className="form-field"><span>Listing title</span><input {...formField('title', form.title, updateForm)} placeholder="2 bedroom apartment in Green Point" /></label><label className="form-field"><span>Listing description</span><textarea rows={6} {...formField('description', form.description, updateForm)} placeholder="Describe the property, layout, views, lifestyle, and standout rental value." /></label></div></section>
            <section className="border-t border-[#e6edf5] pt-6"><h3 className="text-sm font-semibold text-[#18324b]">Key selling points</h3><p className="mt-1 text-sm text-[#607891]">Choose the features that can be shared with Property24, Private Property, and the agency website.</p><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{SELLING_POINT_OPTIONS.map(([label, portalField]) => <SellingPointTile key={label} label={label} active={selectedSellingPoints.includes(label)} onClick={() => toggleSellingPoint(label, portalField)} />)}</div></section>
            <details className="border-t border-[#e6edf5] pt-6"><summary className="cursor-pointer text-sm font-semibold text-[#1f4f78]">Internal notes</summary><label className="form-field mt-4"><span>Internal notes</span><textarea rows={4} {...formField('internalNotes', form.internalNotes, updateForm)} placeholder="Landlord preferences, tenant profile, follow-ups, and team notes" /></label></details>
          </FormSection> : null}

          {activeStep === 'review' ? <section className="ui-panel ui-panel-body grid gap-6">
            <div className="flex flex-col gap-4 border-b border-[#e6edf5] pb-5 md:flex-row md:items-start md:justify-between">
              <div><p className="text-xs font-semibold uppercase text-[#607891]">Step 5 of 5</p><h2 className="text-2xl font-semibold text-[#18324b]">Review rental listing</h2><p className="mt-1 text-sm text-[#607891]">Check the capture is complete, then create the rental draft.</p></div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${validationErrors.length ? 'bg-[#fff5e5] text-[#a76a12]' : 'bg-[#eef9f1] text-[#286b43]'}`}>{validationErrors.length ? `${validationErrors.length} items still needed` : 'Ready to create'}</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <ReviewSummaryCard title="Landlord & mandate" onEdit={() => goToStep('landlord')} details={[{ label: 'Landlord', value: form.landlordName || 'Not added' }, { label: 'Contact', value: form.landlordEmail || form.landlordPhone || 'Not added' }, { label: 'Mandate', value: RENTAL_SELECT_OPTIONS.mandateStatus.find((option) => option.value === form.mandateStatus)?.label || 'Not captured' }]} />
              <ReviewSummaryCard title="Property" onEdit={() => goToStep('property')} details={[{ label: 'Listing', value: buildRentalListingTitle(form) || 'Untitled rental listing' }, { label: 'Address', value: form.propertyAddress || 'Not added' }, { label: 'Type', value: form.propertyType || 'Not captured' }]} />
              <ReviewSummaryCard title="Rental terms" onEdit={() => goToStep('terms')} details={[{ label: 'Monthly rent', value: form.monthlyRent ? `R ${Number(form.monthlyRent).toLocaleString('en-ZA')}` : 'Not added' }, { label: 'Available', value: form.availableFrom || 'Not added' }, { label: 'Lease', value: form.leasePeriodMonths ? `${form.leasePeriodMonths} months` : 'Not captured' }]} />
              <ReviewSummaryCard title="Marketing" onEdit={() => goToStep('marketing')} details={[{ label: 'Photos', value: `${form.galleryImages.length} selected` }, { label: 'Description', value: form.description ? 'Added' : 'Not added' }, { label: 'Selling points', value: `${selectedSellingPoints.length} selected` }]} />
            </div>
            <section className="rounded-[12px] border border-[#dbe6f2] bg-[#fbfdff] p-4"><p className="text-sm font-semibold text-[#18324b]">Publication</p><p className="mt-1 text-sm text-[#607891]">This listing remains private after creation. Prepare Property24, Private Property, and agency website publication from the listing workspace.</p></section>
            {validationErrors.length ? <div className="rounded-[12px] border border-[#f1d4a6] bg-[#fffaf0] p-4"><p className="font-semibold text-[#8a5a12]">Complete these required items before creating</p><ul className="mt-3 grid gap-2 text-sm text-[#8a5a12]">{validationErrors.map((item) => { const step = stepForValidationError(item); return <li key={item} className="flex flex-wrap items-center justify-between gap-2"><span>{item}</span>{step !== 'review' ? <button type="button" className="font-semibold underline underline-offset-2" onClick={() => goToStep(step)}>Fix in {CREATE_STEPS.find((entry) => entry.key === step)?.label}</button> : null}</li> })}</ul></div> : null}
          </section> : null}

          <footer className="ui-panel ui-panel-body flex flex-wrap items-center justify-between gap-3">
            <div>
              {activeStepIndex > 0 ? (
                <button type="button" className="ui-pill-button" onClick={goToPreviousStep}>
                  <ChevronLeft size={16} aria-hidden="true" />
                  Back
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="ui-pill-button" onClick={saveDraftForSession}>Save draft</button>
              <button
                type={activeStep === 'review' ? 'submit' : 'button'}
                onClick={activeStep === 'review' ? undefined : goToNextStep}
                className="ui-pill-button ui-pill-button-active"
                disabled={activeStep === 'review' ? !canSubmit : false}
              >
                {activeStep === 'review' && saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : activeStep === 'review' ? <Save size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                {activeStep === 'review' ? 'Create Listing' : 'Continue'}
              </button>
            </div>
          </footer>
        </div>
      </form>
    </section>
  )
}
