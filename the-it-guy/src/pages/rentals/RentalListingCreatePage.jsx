import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, Circle, Home, ImagePlus, Loader2, Save, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { createRentalListingDraft } from '../../services/rentals/rentalListingDraftService'
import {
  buildRentalListingTitle,
  RENTAL_AMENITY_OPTIONS,
  RENTAL_FEATURE_OPTIONS,
  RENTAL_LISTING_INITIAL_FORM,
  RENTAL_SELECT_OPTIONS,
  validateRentalListingDraftForm,
} from '../../services/rentals/rentalListingDraftModel'
import { resolveRentalWorkspaceScope } from '../../services/rentals/rentalWorkspaceScope'

const PROPERTY_TYPE_OPTIONS = Object.freeze([
  { value: 'Apartment', label: 'Apartment' },
  { value: 'House', label: 'House' },
  { value: 'Townhouse', label: 'Townhouse' },
  { value: 'Duplex', label: 'Duplex' },
  { value: 'Studio', label: 'Studio' },
])

const PORTAL_FEATURE_FIELDS = Object.freeze([
  ['garden', 'Garden'],
  ['pool', 'Pool'],
  ['flatlet', 'Flatlet'],
  ['accessGate', 'Access gate'],
  ['alarm', 'Alarm'],
  ['electricFencing', 'Electric fencing'],
  ['securityPost', 'Security post'],
  ['builtInCupboards', 'Built-in cupboards'],
  ['fibreInternet', 'Fibre internet'],
  ['prepaidElectricity', 'Prepaid electricity'],
  ['prepaidWater', 'Prepaid water'],
  ['borehole', 'Borehole'],
  ['backupWater', 'Backup water'],
  ['solarBackup', 'Solar / inverter'],
  ['balcony', 'Balcony'],
  ['patio', 'Patio'],
  ['builtInBraai', 'Built-in braai'],
  ['clubhouse', 'Clubhouse'],
  ['gym', 'Gym'],
  ['laundry', 'Laundry'],
  ['scenicView', 'Scenic view'],
  ['satellite', 'Satellite'],
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

function FormSection({ id, eyebrow, title, description = '', children }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-[18px] border border-[#dce6f2] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.035)] sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1f6fb8] text-xs font-bold text-white">
          {eyebrow}
        </span>
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.08em] text-[#294563]">{title}</h2>
          {description ? <p className="mt-1 text-xs leading-5 text-[#6b7d93]">{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  )
}

const PRIVATE_PROPERTY_MANDATE_READY_STATUSES = new Set(['signed', 'signed_uploaded'])
const PRIVATE_PROPERTY_MARKETING_READY_STATUSES = new Set(['approved', 'ready'])

function normalizeStatusKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function hasCapturedValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function getRentalCreateProgress(form = {}) {
  return [
    {
      key: 'property',
      label: 'Property',
      complete: Boolean(form.title && form.propertyAddress && form.streetNumber && form.streetName && form.suburb && form.city && form.province && form.privatePropertySuburbId && form.propertyType && hasCapturedValue(form.bedrooms) && hasCapturedValue(form.bathrooms)),
      detail: 'Address, portal ID, rooms',
    },
    {
      key: 'landlord',
      label: 'Landlord',
      complete: Boolean(form.landlordName && (form.landlordEmail || form.landlordPhone)),
      detail: 'Owner contact',
    },
    {
      key: 'terms',
      label: 'Rental terms',
      complete: Boolean(form.monthlyRent && form.availableFrom),
      detail: 'Rent, deposit, dates',
    },
    {
      key: 'marketing',
      label: 'Marketing',
      complete: Boolean(form.description && form.galleryImages?.length >= 3),
      detail: 'Copy and photos',
    },
    {
      key: 'portal',
      label: 'Portal fields',
      complete: Boolean(
        form.privatePropertySuburbId &&
        PRIVATE_PROPERTY_MANDATE_READY_STATUSES.has(normalizeStatusKey(form.mandateStatus)) &&
        PRIVATE_PROPERTY_MARKETING_READY_STATUSES.has(normalizeStatusKey(form.marketingApprovalStatus)),
      ),
      detail: 'Private Property checks',
    },
  ]
}

function RentalCreateProgressPanel({ steps = [] }) {
  return (
    <nav className="rounded-[16px] border border-[#dde6ef] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.035)]" aria-label="Rental listing capture progress">
      <ol className="grid gap-2">
        {steps.map((step, index) => {
          const Icon = step.complete ? CheckCircle2 : Circle
          return (
            <li key={step.key}>
              <a
                href={`#rental-create-${step.key}`}
                className="flex min-w-0 items-center gap-3 rounded-[12px] px-3 py-2 text-left transition hover:bg-[#f5f9fd]"
              >
                <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  step.complete ? 'bg-[#e7f7ee] text-[#1f8a4c]' : 'bg-[#eef4fa] text-[#71859b]'
                }`}>
                  <Icon size={15} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-[#22374d]">{index + 1}. {step.label}</span>
                  <span className="block truncate text-xs text-[#6b7d93]">{step.detail}</span>
                </span>
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function RentalCreatePreview({ form = {} }) {
  const coverImage = (Array.isArray(form.galleryImages) ? form.galleryImages : []).find((image) => String(image.id) === String(form.coverImageId)) || form.galleryImages?.[0] || null
  const facts = [
    form.bedrooms ? `${form.bedrooms} Beds` : '',
    form.bathrooms ? `${form.bathrooms} Baths` : '',
    form.parkingBays ? `${form.parkingBays} Parking` : '',
  ].filter(Boolean)

  return (
    <article className="overflow-hidden rounded-[8px] border border-[#dce6f2] bg-white shadow-[0_6px_16px_rgba(15,23,42,0.05)]">
      <div className="relative h-[132px] w-full overflow-hidden border-b border-[#e5edf6]">
        {coverImage?.url ? (
          <img src={coverImage.url} alt={coverImage.name || 'Rental listing preview'} className="h-full w-full object-cover" />
        ) : (
          <div className="relative h-full w-full bg-[linear-gradient(140deg,#1f4f78_0%,#4a7da8_55%,#a8c2dc_100%)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_22%,rgba(255,255,255,0.24),transparent_52%)]" />
            <div className="absolute bottom-3 left-3 rounded-full border border-white/35 bg-white/20 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-white">
              Listing image
            </div>
          </div>
        )}
        <div className="absolute left-3 right-3 top-3 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-full border border-white/25 bg-[#091322]/58 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_8px_18px_rgba(9,19,34,0.18)] backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-[#7b8ca2]" />
          <span className="truncate">Draft</span>
        </div>
      </div>
      <div className="grid gap-3 p-4">
        <div>
          <h3 className="line-clamp-2 text-[1.02rem] font-semibold leading-6 text-[#142132]">
            {form.title || 'Rental listing title'}
          </h3>
          <p className="mt-2 text-[1.05rem] font-semibold text-[#1f4f78]">
            {form.monthlyRent ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(Number(form.monthlyRent)) : 'Rent pending'}
          </p>
          <p className="mt-1 line-clamp-1 text-xs font-semibold text-[#6d8095]">
            {form.propertyAddress || [form.suburb, form.city].filter(Boolean).join(', ') || 'Address pending'}
          </p>
        </div>
        {facts.length ? (
          <div className="grid gap-2 rounded-[12px] border border-[#dbe6f2] bg-[#f9fbfe] px-3 py-2 text-center text-[0.76rem] font-semibold text-[#35546c]" style={{ gridTemplateColumns: `repeat(${facts.length}, minmax(0, 1fr))` }}>
            {facts.map((fact) => <span key={fact} className="truncate">{fact}</span>)}
          </div>
        ) : null}
      </div>
    </article>
  )
}

function ToggleChipGroup({ label, hint = '', options, values, onToggle }) {
  return (
    <div className="grid gap-3">
      <div>
        <p className="text-sm font-semibold text-[#18324b]">{label}</p>
        {hint ? <p className="mt-1 text-sm text-[#607891]">{hint}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = values.includes(option)
          return (
            <button
              key={option}
              type="button"
              onClick={() => onToggle(option)}
              className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${
                active
                  ? 'border-[#286b43] bg-[#eef9f1] text-[#286b43]'
                  : 'border-[#dbe6f2] bg-white text-[#42617f] hover:border-[#9fc5ae] hover:text-[#286b43]'
              }`}
            >
              {option}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function RentalListingCreatePage() {
  const navigate = useNavigate()
  const workspaceContext = useWorkspace()
  const rentalScope = useMemo(() => resolveRentalWorkspaceScope(workspaceContext), [workspaceContext])
  const organisationId = rentalScope.organisationId
  const branchId = rentalScope.branchId
  const assignedAgentId = rentalScope.assignedAgentId
  const [form, setForm] = useState(createInitialFormState)
  const galleryImagesRef = useRef(form.galleryImages)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const validationErrors = useMemo(
    () => validateRentalListingDraftForm(form, { organisationId }),
    [form, organisationId],
  )
  const canSubmit = validationErrors.length === 0 && !saving
  const progressSteps = useMemo(() => getRentalCreateProgress(form), [form])
  const completedSteps = progressSteps.filter((step) => step.complete).length

  useEffect(() => {
    galleryImagesRef.current = form.galleryImages
  }, [form.galleryImages])

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
  }

  function toggleFeature(value) {
    setForm((current) => ({
      ...current,
      selectedFeatures: toggleArrayValue(current.selectedFeatures, value),
    }))
    setError('')
  }

  function toggleAmenity(value) {
    setForm((current) => ({
      ...current,
      amenities: toggleArrayValue(current.amenities, value),
    }))
    setError('')
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
        <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-[#d9e8f5] bg-[#f3f8fd] text-[#1f4f78]">
                <Home size={20} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Rental listing</p>
                <h1 className="text-2xl font-semibold tracking-normal text-[#142132]">Create Listing</h1>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-[#607387]">
                  Capture the rental stock using the same listing workflow rhythm as sales, with landlord, lease, media, and portal fields tailored for rentals.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] border border-[#dce6f2] bg-white px-5 text-sm font-semibold text-[#142132] shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:border-[#b8c9dc] hover:bg-[#f8fbff]"
                onClick={() => navigate('/agent/rentals/listings')}
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Back to Listings
              </button>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] border border-[#0f7a4f] bg-[#0f7a4f] px-5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition hover:bg-[#0c6843] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!canSubmit}
              >
                {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
                Create Listing
              </button>
            </div>
          </div>
        </section>

        {error ? (
          <p className="rounded-[8px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">{error}</p>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)] xl:items-start">
          <aside className="grid gap-4 xl:sticky xl:top-4">
            <RentalCreateProgressPanel steps={progressSteps} />
            <RentalCreatePreview form={form} />
            <section className="rounded-[16px] border border-[#dce6f2] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.035)]">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Capture status</p>
              <p className="mt-2 text-sm font-bold text-[#22374d]">{completedSteps}/{progressSteps.length} sections ready</p>
              <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                {validationErrors[0] || 'Required rental listing fields are ready.'}
              </p>
              <div className="mt-4 grid gap-2">
                <button
                  type="submit"
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[#0f7a4f] bg-[#0f7a4f] px-4 text-sm font-semibold text-white transition hover:bg-[#0c6843] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!canSubmit}
                >
                  {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
                  Create Listing
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[#dce6f2] bg-white px-4 text-sm font-semibold text-[#142132] transition hover:border-[#b8c9dc] hover:bg-[#f8fbff]"
                  onClick={() => navigate('/agent/rentals/listings')}
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  Back
                </button>
              </div>
            </section>
          </aside>

          <div className="grid gap-5">
          <FormSection
            id="rental-create-property"
            eyebrow="1"
            title="Property"
            description="Use the full width of the page to capture the core listing specs agents need before publishing."
          >
            <div className="grid gap-4 md:grid-cols-4">
              <label className="form-field md:col-span-3">
                <span>Listing title</span>
                <input {...formField('title', form.title, updateForm)} placeholder="2 bedroom apartment in Green Point" />
              </label>
              <SelectField label="Property type" name="propertyType" value={form.propertyType} onChange={updateForm} options={PROPERTY_TYPE_OPTIONS} />
              <label className="form-field md:col-span-4">
                <span>Property address</span>
                <input {...formField('propertyAddress', form.propertyAddress, updateForm)} placeholder="Street address or complex name" />
              </label>
              <label className="form-field">
                <span>Unit number</span>
                <input {...formField('unitNumber', form.unitNumber, updateForm)} placeholder="Unit 12" />
              </label>
              <label className="form-field">
                <span>Complex / building</span>
                <input {...formField('complexName', form.complexName, updateForm)} placeholder="The Atrium" />
              </label>
              <label className="form-field">
                <span>Street number</span>
                <input {...formField('streetNumber', form.streetNumber, updateForm)} placeholder="10" />
              </label>
              <label className="form-field">
                <span>Street name</span>
                <input {...formField('streetName', form.streetName, updateForm)} placeholder="Beach Road" />
              </label>
              <label className="form-field">
                <span>Suburb</span>
                <input {...formField('suburb', form.suburb, updateForm)} placeholder="Suburb" />
              </label>
              <label className="form-field">
                <span>City</span>
                <input {...formField('city', form.city, updateForm)} placeholder="City" />
              </label>
              <label className="form-field">
                <span>Province</span>
                <input {...formField('province', form.province, updateForm)} placeholder="Province" />
              </label>
              <label className="form-field">
                <span>Private Property suburb ID</span>
                <input inputMode="numeric" {...formField('privatePropertySuburbId', form.privatePropertySuburbId, updateForm)} placeholder="11017" />
              </label>
              <label className="form-field">
                <span>Postal code</span>
                <input {...formField('postalCode', form.postalCode, updateForm)} placeholder="8005" />
              </label>
              <SelectField label="Portal address display" name="exactAddressVisibility" value={form.exactAddressVisibility} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.exactAddressVisibility} />
              <label className="form-field">
                <span>Bedrooms</span>
                <input type="number" min="0" {...formField('bedrooms', form.bedrooms, updateForm)} />
              </label>
              <label className="form-field">
                <span>Bathrooms</span>
                <input type="number" min="0" step="0.5" {...formField('bathrooms', form.bathrooms, updateForm)} />
              </label>
              <label className="form-field">
                <span>Parking bays</span>
                <input type="number" min="0" {...formField('parkingBays', form.parkingBays, updateForm)} />
              </label>
              <label className="form-field">
                <span>Garages</span>
                <input type="number" min="0" {...formField('garages', form.garages, updateForm)} placeholder="0" />
              </label>
              <label className="form-field">
                <span>Covered parking</span>
                <input type="number" min="0" {...formField('coveredParking', form.coveredParking, updateForm)} placeholder="0" />
              </label>
              <label className="form-field">
                <span>Open parking</span>
                <input type="number" min="0" {...formField('openParking', form.openParking, updateForm)} placeholder="0" />
              </label>
              <label className="form-field">
                <span>Carports</span>
                <input type="number" min="0" {...formField('carports', form.carports, updateForm)} placeholder="0" />
              </label>
              <label className="form-field">
                <span>En-suite bathrooms</span>
                <input type="number" min="0" step="0.5" {...formField('enSuiteBathrooms', form.enSuiteBathrooms, updateForm)} />
              </label>
              <label className="form-field">
                <span>Lounges</span>
                <input type="number" min="0" {...formField('lounges', form.lounges, updateForm)} />
              </label>
              <label className="form-field">
                <span>Dining rooms</span>
                <input type="number" min="0" {...formField('diningRooms', form.diningRooms, updateForm)} />
              </label>
              <label className="form-field">
                <span>Kitchens</span>
                <input type="number" min="0" {...formField('kitchens', form.kitchens, updateForm)} />
              </label>
              <label className="form-field">
                <span>Studies</span>
                <input type="number" min="0" {...formField('studies', form.studies, updateForm)} />
              </label>
              <label className="form-field">
                <span>Storerooms</span>
                <input type="number" min="0" {...formField('storerooms', form.storerooms, updateForm)} />
              </label>
              <label className="form-field">
                <span>Staff rooms</span>
                <input type="number" min="0" {...formField('staffRooms', form.staffRooms, updateForm)} />
              </label>
              <label className="form-field">
                <span>Floor size (m2)</span>
                <input type="number" min="0" step="0.1" {...formField('floorSize', form.floorSize, updateForm)} placeholder="120" />
              </label>
              <label className="form-field">
                <span>Erf size (m2)</span>
                <input type="number" min="0" step="0.1" {...formField('erfSize', form.erfSize, updateForm)} placeholder="350" />
              </label>
            </div>
          </FormSection>

          <FormSection id="rental-create-landlord" eyebrow="2" title="Landlord">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="form-field">
                <span>Landlord name</span>
                <input {...formField('landlordName', form.landlordName, updateForm)} placeholder="Landlord or entity name" />
              </label>
              <label className="form-field">
                <span>Landlord email</span>
                <input type="email" {...formField('landlordEmail', form.landlordEmail, updateForm)} placeholder="landlord@example.com" />
              </label>
              <label className="form-field">
                <span>Landlord phone</span>
                <input {...formField('landlordPhone', form.landlordPhone, updateForm)} placeholder="+27..." />
              </label>
              <SelectField label="Landlord type" name="landlordType" value={form.landlordType} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.landlordType} />
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
          </FormSection>

          <FormSection id="rental-create-terms" eyebrow="3" title="Rental Terms">
            <div className="grid gap-4 md:grid-cols-4">
              <label className="form-field">
                <span>Monthly rent</span>
                <input type="number" min="0" {...formField('monthlyRent', form.monthlyRent, updateForm)} placeholder="18500" />
              </label>
              <label className="form-field">
                <span>Deposit</span>
                <input type="number" min="0" {...formField('depositAmount', form.depositAmount, updateForm)} placeholder="37000" />
              </label>
              <label className="form-field">
                <span>Deposit multiplier</span>
                <input type="number" min="0" step="0.5" {...formField('depositMultiplier', form.depositMultiplier, updateForm)} placeholder="1.5" />
              </label>
              <label className="form-field">
                <span>Available from</span>
                <input type="date" {...formField('availableFrom', form.availableFrom, updateForm)} />
              </label>
              <label className="form-field">
                <span>Occupation date</span>
                <input type="date" {...formField('occupationDate', form.occupationDate, updateForm)} />
              </label>
              <label className="form-field">
                <span>Lease period months</span>
                <input type="number" min="1" {...formField('leasePeriodMonths', form.leasePeriodMonths, updateForm)} />
              </label>
              <SelectField label="Lease period type" name="leasePeriodType" value={form.leasePeriodType} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.leasePeriodType} />
              <SelectField label="Furnished" name="furnishedStatus" value={form.furnishedStatus} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.furnishedStatus} />
              <SelectField label="Pets" name="petsPolicy" value={form.petsPolicy} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.petsPolicy} />
              <SelectField label="Utilities" name="utilitiesPolicy" value={form.utilitiesPolicy} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.utilitiesPolicy} />
              <SelectField label="Inspection" name="inspectionStatus" value={form.inspectionStatus} onChange={updateForm} options={RENTAL_SELECT_OPTIONS.inspectionStatus} />
              <label className="form-field md:col-span-2">
                <span>Deposit requirements</span>
                <input {...formField('depositRequirement', form.depositRequirement, updateForm)} placeholder="One and a half months deposit" />
              </label>
              <label className="form-field md:col-span-2">
                <span>Rental includes</span>
                <input {...formField('rentalIncludes', form.rentalIncludes, updateForm)} placeholder="Water, Wi-Fi, garden service" />
              </label>
              <label className="form-field md:col-span-2">
                <span>Rental excludes</span>
                <input {...formField('rentalExcludes', form.rentalExcludes, updateForm)} placeholder="Prepaid electricity, refuse, sewerage" />
              </label>
              <label className="form-field">
                <span>Application fee</span>
                <input type="number" min="0" {...formField('applicationFee', form.applicationFee, updateForm)} />
              </label>
              <label className="form-field">
                <span>Lease admin fee</span>
                <input type="number" min="0" {...formField('leaseAdminFee', form.leaseAdminFee, updateForm)} />
              </label>
              <label className="form-field">
                <span>Credit check fee</span>
                <input type="number" min="0" {...formField('creditCheckFee', form.creditCheckFee, updateForm)} />
              </label>
              <label className="form-field">
                <span>Key deposit</span>
                <input type="number" min="0" {...formField('keyDepositAmount', form.keyDepositAmount, updateForm)} />
              </label>
              <label className="form-field">
                <span>Utility deposit</span>
                <input type="number" min="0" {...formField('utilityDepositAmount', form.utilityDepositAmount, updateForm)} />
              </label>
              <label className="form-field md:col-span-4">
                <span>Inspection notes</span>
                <textarea rows={4} {...formField('inspectionNotes', form.inspectionNotes, updateForm)} placeholder="Inspection checklist status, repairs, access notes" />
              </label>
            </div>
          </FormSection>

          <FormSection
            id="rental-create-marketing"
            eyebrow="4"
            title="Marketing Content"
            description="Description and internal context are captured up front so the draft is ready for portal prep immediately after creation."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="form-field md:col-span-2">
                <span>Public description</span>
                <textarea rows={8} {...formField('description', form.description, updateForm)} placeholder="Describe the property, layout, views, lifestyle, and standout rental value." />
              </label>
              <label className="form-field md:col-span-2">
                <span>Internal notes</span>
                <textarea rows={5} {...formField('internalNotes', form.internalNotes, updateForm)} placeholder="Landlord preferences, tenant profile, follow-ups, and team notes" />
              </label>
            </div>
          </FormSection>

          <FormSection
            id="rental-create-portal"
            eyebrow="5"
            title="Images, Features, and Amenities"
            description="Amenities follow the same portal-facing option set used elsewhere in the listing workflow, so agents can prepare Property24 and Private Property details here."
          >
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <section className="rounded-[12px] border border-[#dbe6f2] bg-[#fbfdff] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-[#18324b]">Image gallery</h3>
                    <p className="mt-1 text-sm text-[#607891]">
                      Add listing photos now. They will upload to the listing gallery as part of the create action.
                    </p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-[#1f4f78] bg-[#1f4f78] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#183f61]">
                    <ImagePlus size={16} aria-hidden="true" />
                    Add images
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryUpload} />
                  </label>
                </div>

                {form.galleryImages.length ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {form.galleryImages.map((image) => {
                      const isCover = String(form.coverImageId) === String(image.id)
                      return (
                        <div key={image.id} className="overflow-hidden rounded-[12px] border border-[#dbe6f2] bg-white">
                          <div className="relative aspect-[4/3] bg-[#eef4fa]">
                            <img src={image.url} alt={image.name} className="h-full w-full object-cover" />
                            {isCover ? (
                              <span className="absolute left-2 top-2 rounded-full bg-[#286b43] px-2.5 py-1 text-[0.72rem] font-semibold text-white">
                                Cover
                              </span>
                            ) : null}
                          </div>
                          <div className="grid gap-3 p-3">
                            <div>
                              <p className="truncate text-sm font-semibold text-[#18324b]">{image.name}</p>
                              <p className="text-xs text-[#607891]">
                                {image.size ? `${Math.max(1, Math.round(image.size / 1024))} KB` : 'Ready to save'}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setCoverImage(image.id)}
                                disabled={isCover}
                                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                                  isCover
                                    ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#286b43]'
                                    : 'border-[#dbe6f2] bg-white text-[#42617f] hover:border-[#9fc5ae] hover:text-[#286b43]'
                                }`}
                              >
                                {isCover ? 'Cover image' : 'Set as cover'}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeGalleryImage(image.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-[#f1c8c8] bg-white px-3 py-2 text-xs font-semibold text-[#b42318] transition hover:bg-[#fff6f6]"
                              >
                                <Trash2 size={13} aria-hidden="true" />
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="mt-4 rounded-[12px] border border-dashed border-[#cddaea] bg-white px-4 py-10 text-center">
                    <p className="text-sm font-semibold text-[#18324b]">No images added yet</p>
                    <p className="mt-2 text-sm text-[#607891]">Upload gallery images here so the rental draft is ready for publishing and portal review.</p>
                  </div>
                )}
              </section>

              <div className="grid gap-6">
                <section className="rounded-[12px] border border-[#dbe6f2] bg-[#fbfdff] p-4">
                  <ToggleChipGroup
                    label="Property features"
                    hint="Pick the features agents typically need on portal-ready rental listings."
                    options={RENTAL_FEATURE_OPTIONS}
                    values={form.selectedFeatures}
                    onToggle={toggleFeature}
                  />
                </section>

                <section className="rounded-[12px] border border-[#dbe6f2] bg-[#fbfdff] p-4">
                  <ToggleChipGroup
                    label="Amenities"
                    hint="Use the same amenity language expected across the listing workflow."
                    options={RENTAL_AMENITY_OPTIONS}
                    values={form.amenities}
                    onToggle={toggleAmenity}
                  />
                </section>

                <section className="rounded-[12px] border border-[#dbe6f2] bg-[#fbfdff] p-4">
                  <div>
                    <p className="text-sm font-semibold text-[#18324b]">Portal feature flags</p>
                    <p className="mt-1 text-sm text-[#607891]">
                      Capture explicit yes/no values for the fields portals expose as filters or property features.
                    </p>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {PORTAL_FEATURE_FIELDS.map(([name, label]) => (
                      <SelectField
                        key={name}
                        label={label}
                        name={name}
                        value={form[name]}
                        onChange={updateForm}
                        options={RENTAL_SELECT_OPTIONS.yesNoUnknown}
                      />
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </FormSection>

          <section className="rounded-[18px] border border-[#dce6f2] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.035)] sm:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Ready to create</p>
              <h2 className="text-lg font-semibold text-[#18324b]">Save the rental draft with the full listing capture</h2>
              <p className="mt-1 text-sm leading-6 text-[#607891]">
                {form.galleryImages.length
                  ? `${form.galleryImages.length} image${form.galleryImages.length === 1 ? '' : 's'} will be saved to the gallery when you create this listing.`
                  : 'You can create the listing now, and add more gallery images later if needed.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="ui-pill-button" onClick={() => navigate('/agent/rentals/listings')}>
                <ArrowLeft size={16} aria-hidden="true" />
                Back to Listings
              </button>
              <button type="submit" className="ui-pill-button ui-pill-button-active" disabled={!canSubmit}>
                {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
                Create Listing
              </button>
            </div>
            </div>
          </section>
          </div>
        </div>
      </form>
    </section>
  )
}
