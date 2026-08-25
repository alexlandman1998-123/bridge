import { useMemo, useState } from 'react'
import { ArrowLeft, Home, ImagePlus, Loader2, Save, Trash2 } from 'lucide-react'
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

async function buildGalleryDrafts(files = []) {
  return Promise.all(
    files.map(async (file, index) => ({
      id: createGalleryAssetId(index),
      name: file.name || `Image ${index + 1}`,
      url: await readAsDataUrl(file),
      contentType: file.type || '',
      size: file.size || 0,
      file,
    })),
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const validationErrors = useMemo(
    () => validateRentalListingDraftForm(form, { organisationId }),
    [form, organisationId],
  )
  const canSubmit = validationErrors.length === 0 && !saving

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
      await createRentalListingDraft(form, {
        organisationId,
        branchId,
        assignedAgentId,
        performedBy: assignedAgentId,
      })
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
        <header className="ui-toolbar">
          <div className="ui-toolbar-group">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] border border-[#cfe8dc] bg-[#f2fbf5] text-[#286b43]">
              <Home size={20} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase text-[#607891]">Rental listing</p>
              <h1 className="text-2xl font-semibold text-[#18324b]">Create Listing</h1>
              <p className="status-message">
                Capture the property details, landlord information, marketing copy, images, and portal-ready amenities for this rental listing.
              </p>
            </div>
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
        </header>

        {error ? (
          <p className="rounded-[8px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">{error}</p>
        ) : null}

        <div className="grid gap-6">
          <FormSection
            eyebrow="Step 1"
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

          <FormSection eyebrow="Step 2" title="Landlord">
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

          <FormSection eyebrow="Step 3" title="Rental Terms">
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
            eyebrow="Step 4"
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
            eyebrow="Step 5"
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

          <section className="ui-panel ui-panel-body flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-[#607891]">Ready to create</p>
              <h2 className="text-lg font-semibold text-[#18324b]">Save the rental draft with the full listing capture</h2>
              <p className="mt-1 text-sm text-[#607891]">
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
          </section>
        </div>
      </form>
    </section>
  )
}
