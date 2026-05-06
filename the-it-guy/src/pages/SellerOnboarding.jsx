import { CheckCircle2, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import { invokeEdgeFunction } from '../lib/supabaseClient'
import {
  createListingDraftFromSellerLead,
  findSellerWorkflowRecordByToken,
  LISTING_STATUS,
  SELLER_ONBOARDING_STATUS,
  SELLER_LEAD_STAGE,
  updateSellerWorkflowRecordByToken,
} from '../lib/agentListingStorage'

const STEPS = ['Seller Information', 'Property Details', 'FICA & Compliance', 'Review & Submit']

const SELLER_STATUS_LABELS = {
  [SELLER_ONBOARDING_STATUS.NOT_STARTED]: 'Not Started',
  [SELLER_ONBOARDING_STATUS.IN_PROGRESS]: 'In Progress',
  [SELLER_ONBOARDING_STATUS.SUBMITTED]: 'Submitted',
  [SELLER_ONBOARDING_STATUS.UNDER_REVIEW]: 'Under Review',
  [SELLER_ONBOARDING_STATUS.COMPLETED]: 'Completed',
}

const PROPERTY_FEATURES = [
  { key: 'garden', label: 'Garden' },
  { key: 'security', label: 'Security (Estate / Alarm / Electric Fence)' },
  { key: 'solar', label: 'Solar / Inverter' },
  { key: 'water', label: 'Borehole / Water Tank' },
  { key: 'fibre', label: 'Fibre' },
  { key: 'aircon', label: 'Aircon' },
  { key: 'fireplace', label: 'Fireplace' },
  { key: 'flatlet', label: 'Flatlet / Second Dwelling' },
  { key: 'staff_quarters', label: 'Staff Quarters' },
]

const OWNERSHIP_TYPES = [
  { value: 'individual', label: 'Individual' },
  { value: 'married_cop', label: 'Married (COP)' },
  { value: 'married_anc', label: 'Married (ANC)' },
  { value: 'company', label: 'Company' },
  { value: 'trust', label: 'Trust' },
  { value: 'multiple_owners', label: 'Multiple owners' },
]

const PAGE_CONTAINER_CLASS = 'mx-auto w-full max-w-[420px] md:max-w-[1120px]'
const SECTION_CARD_CLASS =
  'rounded-[26px] border border-[#dbe5ef] bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.06)] md:p-6'
const INNER_PANEL_CLASS =
  'rounded-[20px] border border-[#dfe8f2] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] md:p-5'
const DETAIL_INPUT_CLASS =
  'w-full min-h-[52px] rounded-[12px] border border-[#d9e2ee] bg-white px-4 py-3 text-base text-[#162334] outline-none transition duration-150 ease-out placeholder:text-[#8aa0b8] focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12'

function choiceCardClass(isActive) {
  return `w-full rounded-[16px] border px-4 py-4 text-left transition duration-150 ease-out ${
    isActive
      ? 'border-[#35546c] bg-[#f3f8ff] shadow-[0_10px_24px_rgba(53,84,108,0.14)]'
      : 'border-[#dbe5ef] bg-white hover:border-[#b6c9de] hover:bg-[#fafcff]'
  }`
}

function chipChoiceClass(isActive) {
  return `inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition ${
    isActive ? 'border-[#35546c] bg-[#f3f8ff] text-[#1f3a56]' : 'border-[#d6e1ee] bg-white text-[#35546c]'
  }`
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'R 0'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function splitName(fullName = '') {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: '', surname: '' }
  if (parts.length === 1) return { firstName: parts[0], surname: '' }
  return { firstName: parts.slice(0, -1).join(' '), surname: parts.slice(-1).join(' ') }
}

function normalizeOwnershipType(existing = {}) {
  if (existing.ownershipType) {
    const explicit = String(existing.ownershipType).toLowerCase()
    if (explicit === 'married') {
      return String(existing.marriageRegime || '').toLowerCase().includes('cop') ? 'married_cop' : 'married_anc'
    }
    return explicit
  }
  if (String(existing.maritalStatus || '').toLowerCase() === 'married') {
    return String(existing.marriageRegime || '').toLowerCase().includes('cop') ? 'married_cop' : 'married_anc'
  }
  return 'individual'
}

function normalizeFormData(listing) {
  const seller = listing?.seller || {}
  const existing = listing?.sellerOnboarding?.formData || {}
  const split = splitName(existing.fullName || seller.name || '')

  return {
    sellerFirstName: existing.sellerFirstName || split.firstName,
    sellerSurname: existing.sellerSurname || split.surname,
    idNumber: existing.idNumber || '',
    email: existing.email || seller.email || '',
    phone: existing.phone || seller.phone || '',
    residentialAddress: existing.residentialAddress || '',

    ownershipType: normalizeOwnershipType(existing),
    spouseName: existing.spouseName || '',
    spouseIdNumber: existing.spouseIdNumber || '',
    spouseEmail: existing.spouseEmail || '',
    spousePhone: existing.spousePhone || '',

    companyName: existing.companyName || existing.entityName || '',
    companyRegistrationNumber: existing.companyRegistrationNumber || existing.entityRegistrationNumber || '',
    companyDirectorName: existing.companyDirectorName || existing.entityRepresentative || '',
    companyDirectorEmail: existing.companyDirectorEmail || '',
    companyDirectorPhone: existing.companyDirectorPhone || '',

    trustName: existing.trustName || existing.entityName || '',
    trustRegistrationNumber: existing.trustRegistrationNumber || existing.entityRegistrationNumber || '',
    trusteeName: existing.trusteeName || existing.entityRepresentative || '',
    trusteeEmail: existing.trusteeEmail || '',
    trusteePhone: existing.trusteePhone || '',

    multipleOwners: Array.isArray(existing.multipleOwners) && existing.multipleOwners.length
      ? existing.multipleOwners
      : [
          {
            id: 'owner-1',
            name: '',
            surname: '',
            idNumber: '',
            email: '',
            phone: '',
            ownershipShare: '',
          },
        ],

    askingPrice: existing.askingPrice || String(listing?.askingPrice || ''),
    sellingTimeline: existing.sellingTimeline || '1_3_months',
    sellingReason: existing.sellingReason || '',

    propertyType: existing.propertyType || listing?.propertyType || 'House',
    propertyAddress: existing.propertyAddress || [listing?.listingTitle, listing?.suburb, listing?.city].filter(Boolean).join(', '),
    suburb: existing.suburb || listing?.suburb || '',
    city: existing.city || listing?.city || '',
    province: existing.province || '',
    estateComplexName: existing.estateComplexName || '',
    unitNumber: existing.unitNumber || '',

    erfSize: existing.erfSize || '',
    floorSize: existing.floorSize || '',
    bedrooms: existing.bedrooms || '',
    bathrooms: existing.bathrooms || '',
    livingArea: existing.livingArea || '',
    kitchens: existing.kitchens || '',
    garages: existing.garages || '',
    parkingCovered: existing.parkingCovered || '',
    parkingOpen: existing.parkingOpen || '',
    pool: Boolean(existing.pool),
    levies: existing.levies || '',
    ratesTaxes: existing.ratesTaxes || '',

    features: Array.isArray(existing.features) ? existing.features : [],
    propertyCondition: existing.propertyCondition || 'good',
    kitchenCondition: existing.kitchenCondition || 'good',
    bathroomCondition: existing.bathroomCondition || 'good',
    views: existing.views || '',
    recentRenovations: existing.recentRenovations || '',
    propertyNotes: existing.propertyNotes || '',
  }
}

export function SellerOnboarding({ tokenOverride = '', embedded = false, onSubmitted = null }) {
  const params = useParams()
  const token = String(tokenOverride || params?.token || '').trim()
  const [listing, setListing] = useState(null)
  const [form, setForm] = useState(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showFicaInfo, setShowFicaInfo] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('Invalid seller onboarding link.')
      setLoading(false)
      return
    }

    const found = findSellerWorkflowRecordByToken(token)
    if (!found) {
      setError('Seller onboarding link is invalid or inactive.')
      setLoading(false)
      return
    }

    const onboardingStatus = String(found?.sellerOnboarding?.status || '').trim().toLowerCase()
    const persistedStep = Number(found?.sellerOnboarding?.currentStep || 0)
    const nextStep =
      onboardingStatus === SELLER_ONBOARDING_STATUS.SUBMITTED ||
      onboardingStatus === SELLER_ONBOARDING_STATUS.UNDER_REVIEW ||
      onboardingStatus === SELLER_ONBOARDING_STATUS.COMPLETED
        ? 3
        : Math.min(Math.max(persistedStep, 0), 3)

    const nextListing =
      onboardingStatus === SELLER_ONBOARDING_STATUS.NOT_STARTED
        ? updateSellerWorkflowRecordByToken(token, (row) => ({
            ...row,
            sellerOnboarding: {
              ...(row?.sellerOnboarding || {}),
              status: SELLER_ONBOARDING_STATUS.IN_PROGRESS,
              startedAt: row?.sellerOnboarding?.startedAt || new Date().toISOString(),
              currentStep: nextStep,
            },
          })) || found
        : found

    setListing(nextListing)
    setForm(normalizeFormData(nextListing))
    setCurrentStep(nextStep)
    setLoading(false)
  }, [token])

  const progress = useMemo(() => Math.round(((currentStep + 1) / STEPS.length) * 100), [currentStep])

  const statusLabel = useMemo(() => {
    const key = String(listing?.sellerOnboarding?.status || '').trim().toLowerCase()
    return SELLER_STATUS_LABELS[key] || 'In Progress'
  }, [listing?.sellerOnboarding?.status])

  const isCompleted = String(listing?.sellerOnboarding?.status || '').trim().toLowerCase() === SELLER_ONBOARDING_STATUS.COMPLETED

  const ficaRequirements = useMemo(() => {
    const type = String(form?.ownershipType || '').toLowerCase()
    if (type === 'company') {
      return [
        'Company registration documents',
        'Director ID document(s)',
        'Director proof of address',
        'Proof of registered address',
      ]
    }
    if (type === 'trust') {
      return [
        'Trust deed',
        'Trustee ID document(s)',
        'Trustee proof of address',
        'Trust address confirmation',
      ]
    }
    if (type === 'multiple_owners') {
      return [
        'ID documents for all owners',
        'Proof of address for each owner',
        'Ownership share confirmation',
      ]
    }
    if (type === 'married_cop' || type === 'married_anc') {
      return [
        'Seller ID document',
        'Spouse ID document',
        'Seller proof of address',
        'Spouse proof of address',
      ]
    }
    return ['Seller ID document', 'Proof of address']
  }, [form?.ownershipType])

  function persistListingUpdate(updater, options = {}) {
    const updated = updateSellerWorkflowRecordByToken(token, updater)
    if (updated) {
      setListing(updated)
      if (options.refreshForm) {
        setForm(normalizeFormData(updated))
      }
      return updated
    }
    return null
  }

  function handleFormUpdate(key, value) {
    setForm((previous) => ({ ...(previous || {}), [key]: value }))
  }

  function handleFeatureToggle(featureKey) {
    setForm((previous) => {
      const prev = previous || {}
      const current = Array.isArray(prev.features) ? prev.features : []
      const nextFeatures = current.includes(featureKey) ? current.filter((item) => item !== featureKey) : [...current, featureKey]
      return { ...prev, features: nextFeatures }
    })
  }

  function updateMultipleOwner(ownerId, key, value) {
    setForm((previous) => ({
      ...(previous || {}),
      multipleOwners: (previous?.multipleOwners || []).map((owner) =>
        owner.id === ownerId ? { ...owner, [key]: value } : owner,
      ),
    }))
  }

  function addMultipleOwner() {
    setForm((previous) => ({
      ...(previous || {}),
      multipleOwners: [
        ...(previous?.multipleOwners || []),
        {
          id: `owner-${Date.now()}`,
          name: '',
          surname: '',
          idNumber: '',
          email: '',
          phone: '',
          ownershipShare: '',
        },
      ],
    }))
  }

  function removeMultipleOwner(ownerId) {
    setForm((previous) => {
      const current = previous?.multipleOwners || []
      if (current.length <= 1) return previous
      return {
        ...(previous || {}),
        multipleOwners: current.filter((owner) => owner.id !== ownerId),
      }
    })
  }

  async function saveDraft(nextStep = currentStep) {
    if (!form) return
    setSaving(true)
    setError('')
    persistListingUpdate((row) => ({
      ...row,
      sellerOnboarding: {
        ...(row?.sellerOnboarding || {}),
        status: SELLER_ONBOARDING_STATUS.IN_PROGRESS,
        currentStep: nextStep,
        formData: { ...(form || {}) },
        updatedAt: new Date().toISOString(),
      },
    }))
    setSaving(false)
    setSuccess('Draft saved.')
    setTimeout(() => setSuccess(''), 1200)
  }

  function validateCurrentStep() {
    if (!form) return 'Form state unavailable.'

    if (currentStep === 0) {
      if (!form.sellerFirstName || !form.sellerSurname || !form.email || !form.phone) {
        return 'Please complete name, surname, email, and phone.'
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.email))) {
        return 'Please provide a valid email address.'
      }

      const ownershipType = String(form.ownershipType || '')
      if (!ownershipType) return 'Please select ownership structure.'

      if (['individual', 'married_cop', 'married_anc'].includes(ownershipType) && !form.idNumber) {
        return 'Please provide ID number / passport details.'
      }

      if ((ownershipType === 'married_cop' || ownershipType === 'married_anc') && (!form.spouseName || !form.spouseIdNumber)) {
        return 'Spouse name and spouse ID number are required for married ownership.'
      }

      if (ownershipType === 'company' && (!form.companyName || !form.companyRegistrationNumber || !form.companyDirectorName)) {
        return 'Company name, registration number, and director details are required.'
      }

      if (ownershipType === 'trust' && (!form.trustName || !form.trustRegistrationNumber || !form.trusteeName)) {
        return 'Trust name, registration number, and trustee details are required.'
      }

      if (ownershipType === 'multiple_owners') {
        const owners = form.multipleOwners || []
        const hasInvalid = owners.some((owner) => !owner.name || !owner.surname || !owner.idNumber)
        if (!owners.length || hasInvalid) {
          return 'Each owner must include name, surname, and ID number.'
        }
      }
    }

    if (currentStep === 1) {
      if (!form.propertyType || !form.propertyAddress || !form.suburb || !form.province) {
        return 'Property type, address, suburb, and province are required.'
      }
    }

    if (currentStep === 2) {
      if (!form.ownershipType) {
        return 'Please confirm ownership structure before submitting compliance requirements.'
      }
    }

    return ''
  }

  async function handleNext() {
    setError('')
    const validationError = validateCurrentStep()
    if (validationError) {
      setError(validationError)
      return
    }
    const nextStep = Math.min(currentStep + 1, STEPS.length - 1)
    await saveDraft(nextStep)
    setCurrentStep(nextStep)
  }

  async function handleBack() {
    setError('')
    const nextStep = Math.max(currentStep - 1, 0)
    await saveDraft(nextStep)
    setCurrentStep(nextStep)
  }

  async function handleSubmit() {
    if (!form) return
    setSubmitting(true)
    setError('')

    const updated = persistListingUpdate((row) => ({
      ...row,
      stage: SELLER_LEAD_STAGE.ONBOARDING_COMPLETED,
      onboardingStatus: SELLER_ONBOARDING_STATUS.COMPLETED,
      listingStatus: LISTING_STATUS.SELLER_ONBOARDING_COMPLETED,
      sellerOnboarding: {
        ...(row?.sellerOnboarding || {}),
        status: SELLER_ONBOARDING_STATUS.COMPLETED,
        submittedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        currentStep: 3,
        formData: { ...(form || {}) },
      },
    }))

    if (!updated) {
      setSubmitting(false)
      setError('Unable to submit onboarding right now.')
      return
    }

    createListingDraftFromSellerLead(updated, { stage: LISTING_STATUS.SELLER_ONBOARDING_COMPLETED })

    const assignedAgentEmail = String(updated?.assignedAgentEmail || updated?.agentId || '').trim()
    const assignedAgentName = String(updated?.assignedAgentName || updated?.assignedAgent || 'Agent').trim()
    const sellerName = [form.sellerFirstName, form.sellerSurname].filter(Boolean).join(' ') || 'Seller'
    const propertyTitle = String(updated?.listingTitle || form.propertyAddress || 'property').trim()
    if (assignedAgentEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assignedAgentEmail)) {
      try {
        await invokeEdgeFunction('send-email', {
          body: {
            type: 'seller_onboarding_submitted',
            to: assignedAgentEmail,
            agentName: assignedAgentName,
            sellerName,
            propertyTitle,
          },
        })
      } catch (notificationError) {
        console.error('[Seller Onboarding] assigned agent notification failed', notificationError)
      }
    }

    setListing(updated)
    setCurrentStep(3)
    setSubmitting(false)
    setSuccess('Your property details have been submitted.\nYour agent will review the information and prepare the next step.')
    if (typeof onSubmitted === 'function') {
      onSubmitted(updated)
    }
  }

  if (loading) {
    return embedded
      ? <div className="px-1 py-2 text-sm text-[#5f738a]">Loading seller onboarding...</div>
      : (
        <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,#eef4fb_0%,#e8eef7_45%,#e1e8f2_100%)] px-4 py-5">
          <div className={PAGE_CONTAINER_CLASS}>
            <p className="rounded-[16px] border border-[#dde4ee] bg-white px-4 py-4 text-sm text-[#516277] shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              Loading seller onboarding...
            </p>
          </div>
        </main>
      )
  }

  if (!listing || !form) {
    const invalidState = (
      <div className="rounded-[20px] border border-[#f6d4d4] bg-[#fff5f5] p-5 text-sm text-[#b42318]">
        {error || 'Seller onboarding link is invalid or inactive.'}
      </div>
    )
    return embedded ? invalidState : (
      <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,#eef4fb_0%,#e8eef7_45%,#e1e8f2_100%)] px-4 py-5">
        <div className={PAGE_CONTAINER_CLASS}>
          {invalidState}
        </div>
      </main>
    )
  }

  const content = (
    <section className={SECTION_CARD_CLASS}>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#142132]">Complete Your Seller Onboarding</h1>
            <p className="mt-2 text-sm leading-6 text-[#516277]">This will take 3–5 minutes. You&apos;ll be guided step-by-step.</p>
            <p className="mt-3 text-sm font-medium text-[#35546c]">{listing.listingTitle || 'Property onboarding'}</p>
          </div>
          <span className="inline-flex items-center rounded-full border border-[#dce6f2] bg-[#f7fbff] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#3b5a77]">
            {statusLabel}
          </span>
        </div>

        <div className="mt-5 rounded-[20px] border border-[#d8e3ef] bg-white p-4 shadow-[0_16px_36px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-[#142132]">Step {currentStep + 1} of {STEPS.length}</p>
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5f7590]">{STEPS[currentStep]}</span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#eef3f8]">
            <span
              className="block h-full rounded-full transition-[width] duration-300"
              style={{ width: `${progress}%`, backgroundImage: 'linear-gradient(90deg,#35546c 0%,#2f8f86 100%)' }}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            {STEPS.map((label, index) => (
              <div key={label} className="rounded-[12px] border border-[#e1e9f3] bg-[#f8fbff] px-3 py-2 text-center">
                <span
                  className={`mx-auto inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold ${
                    index <= currentStep ? 'border-[#35546c] bg-[#35546c] text-white' : 'border-[#d5e0ec] bg-white text-[#6b7d93]'
                  }`}
                >
                  {index + 1}
                </span>
                <p className="mt-1 text-[11px] leading-4 text-[#5f7590]">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {error ? <p className="mt-4 rounded-[12px] border border-[#f6d4d4] bg-[#fff5f5] px-4 py-2 text-sm text-[#b42318]">{error}</p> : null}
        {success ? <p className="mt-4 whitespace-pre-line rounded-[12px] border border-[#d8ecdf] bg-[#eefbf3] px-4 py-2 text-sm text-[#1f7d44]">{success}</p> : null}

        <div className="mt-5 space-y-4">
          {currentStep === 0 ? (
            <>
              <section className={INNER_PANEL_CLASS}>
                <h2 className="text-lg font-semibold text-[#162435]">Seller Details</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    Name
                    <input className={DETAIL_INPUT_CLASS} value={form.sellerFirstName} onChange={(event) => handleFormUpdate('sellerFirstName', event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    Surname
                    <input className={DETAIL_INPUT_CLASS} value={form.sellerSurname} onChange={(event) => handleFormUpdate('sellerSurname', event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    Email
                    <input className={DETAIL_INPUT_CLASS} type="email" value={form.email} onChange={(event) => handleFormUpdate('email', event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    Phone
                    <input className={DETAIL_INPUT_CLASS} value={form.phone} onChange={(event) => handleFormUpdate('phone', event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    ID Number / Registration Number (where applicable)
                    <input className={DETAIL_INPUT_CLASS} value={form.idNumber} onChange={(event) => handleFormUpdate('idNumber', event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                    Residential Address
                    <input className={DETAIL_INPUT_CLASS} value={form.residentialAddress} onChange={(event) => handleFormUpdate('residentialAddress', event.target.value)} />
                  </label>
                </div>
              </section>

              <section className={INNER_PANEL_CLASS}>
                <h2 className="text-lg font-semibold text-[#162435]">Ownership Structure</h2>
                <p className="mt-2 text-sm text-[#60748b]">Who owns the property?</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {OWNERSHIP_TYPES.map((item) => {
                    const active = form.ownershipType === item.value
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => handleFormUpdate('ownershipType', item.value)}
                        className={choiceCardClass(active)}
                      >
                        <span className={`block text-sm font-semibold ${active ? 'text-[#142132]' : 'text-[#35546c]'}`}>{item.label}</span>
                      </button>
                    )
                  })}
                </div>

                {(form.ownershipType === 'married_cop' || form.ownershipType === 'married_anc') ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Spouse Name
                      <input className={DETAIL_INPUT_CLASS} value={form.spouseName} onChange={(event) => handleFormUpdate('spouseName', event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Spouse ID Number
                      <input className={DETAIL_INPUT_CLASS} value={form.spouseIdNumber} onChange={(event) => handleFormUpdate('spouseIdNumber', event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Spouse Email (optional)
                      <input className={DETAIL_INPUT_CLASS} value={form.spouseEmail} onChange={(event) => handleFormUpdate('spouseEmail', event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Spouse Phone (optional)
                      <input className={DETAIL_INPUT_CLASS} value={form.spousePhone} onChange={(event) => handleFormUpdate('spousePhone', event.target.value)} />
                    </label>
                  </div>
                ) : null}

                {form.ownershipType === 'company' ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Company Name
                      <input className={DETAIL_INPUT_CLASS} value={form.companyName} onChange={(event) => handleFormUpdate('companyName', event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Registration Number
                      <input className={DETAIL_INPUT_CLASS} value={form.companyRegistrationNumber} onChange={(event) => handleFormUpdate('companyRegistrationNumber', event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Director Name
                      <input className={DETAIL_INPUT_CLASS} value={form.companyDirectorName} onChange={(event) => handleFormUpdate('companyDirectorName', event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Director Email / Phone (optional)
                      <input className={DETAIL_INPUT_CLASS} value={form.companyDirectorEmail} onChange={(event) => handleFormUpdate('companyDirectorEmail', event.target.value)} placeholder="Email" />
                    </label>
                  </div>
                ) : null}

                {form.ownershipType === 'trust' ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Trust Name
                      <input className={DETAIL_INPUT_CLASS} value={form.trustName} onChange={(event) => handleFormUpdate('trustName', event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Registration Number
                      <input className={DETAIL_INPUT_CLASS} value={form.trustRegistrationNumber} onChange={(event) => handleFormUpdate('trustRegistrationNumber', event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Trustee Name
                      <input className={DETAIL_INPUT_CLASS} value={form.trusteeName} onChange={(event) => handleFormUpdate('trusteeName', event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Trustee Email / Phone (optional)
                      <input className={DETAIL_INPUT_CLASS} value={form.trusteeEmail} onChange={(event) => handleFormUpdate('trusteeEmail', event.target.value)} placeholder="Email" />
                    </label>
                  </div>
                ) : null}

                {form.ownershipType === 'multiple_owners' ? (
                  <div className="mt-4 space-y-3">
                    {(form.multipleOwners || []).map((owner, index) => (
                      <article key={owner.id} className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-sm font-semibold text-[#22364a]">Owner {index + 1}</p>
                          {(form.multipleOwners || []).length > 1 ? (
                            <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#ffd2d2] bg-white text-[#9f1239]" onClick={() => removeMultipleOwner(owner.id)}>
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                            Name
                            <input className={DETAIL_INPUT_CLASS} value={owner.name} onChange={(event) => updateMultipleOwner(owner.id, 'name', event.target.value)} />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                            Surname
                            <input className={DETAIL_INPUT_CLASS} value={owner.surname} onChange={(event) => updateMultipleOwner(owner.id, 'surname', event.target.value)} />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                            ID Number
                            <input className={DETAIL_INPUT_CLASS} value={owner.idNumber} onChange={(event) => updateMultipleOwner(owner.id, 'idNumber', event.target.value)} />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                            Ownership Share % (optional)
                            <input className={DETAIL_INPUT_CLASS} value={owner.ownershipShare} onChange={(event) => updateMultipleOwner(owner.id, 'ownershipShare', event.target.value)} />
                          </label>
                        </div>
                      </article>
                    ))}
                    <Button type="button" variant="secondary" size="sm" onClick={addMultipleOwner}>
                      <Plus size={14} />
                      Add Owner
                    </Button>
                  </div>
                ) : null}
              </section>

              <section className={INNER_PANEL_CLASS}>
                <h2 className="text-lg font-semibold text-[#162435]">Selling Context</h2>
                <p className="mt-2 text-sm text-[#60748b]">Light qualification details for your agent.</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    Asking Price (optional)
                    <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.askingPrice} onChange={(event) => handleFormUpdate('askingPrice', event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    Selling Timeline
                    <select className={DETAIL_INPUT_CLASS} value={form.sellingTimeline} onChange={(event) => handleFormUpdate('sellingTimeline', event.target.value)}>
                      <option value="urgent">Urgent (0-1 month)</option>
                      <option value="1_3_months">1-3 months</option>
                      <option value="3_6_months">3-6 months</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                    Reason for Selling (optional)
                    <select className={DETAIL_INPUT_CLASS} value={form.sellingReason} onChange={(event) => handleFormUpdate('sellingReason', event.target.value)}>
                      <option value="">Select reason</option>
                      <option value="upgrade">Upgrading</option>
                      <option value="downsize">Downsizing</option>
                      <option value="relocation">Relocation</option>
                      <option value="investment_exit">Investment Exit</option>
                      <option value="financial_change">Financial Change</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                </div>
              </section>
            </>
          ) : null}

          {currentStep === 1 ? (
            <>
              <section className="rounded-[18px] border border-[#e0e9f3] bg-[#fbfdff] p-4 md:p-5">
                <h2 className="text-lg font-semibold text-[#162435]">Property Details</h2>

                <div className="mt-4 grid gap-4">
                  <article className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                    <h3 className="text-sm font-semibold text-[#22364a]">Basics</h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Property Type
                        <select className={DETAIL_INPUT_CLASS} value={form.propertyType} onChange={(event) => handleFormUpdate('propertyType', event.target.value)}>
                          <option>House</option>
                          <option>Apartment</option>
                          <option>Townhouse</option>
                          <option>Sectional Title</option>
                          <option>Commercial</option>
                          <option>Agricultural</option>
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                        Address (start typing)
                        <input className={DETAIL_INPUT_CLASS} value={form.propertyAddress} onChange={(event) => handleFormUpdate('propertyAddress', event.target.value)} placeholder="Street address" />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Suburb
                        <input className={DETAIL_INPUT_CLASS} value={form.suburb} onChange={(event) => handleFormUpdate('suburb', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        City
                        <input className={DETAIL_INPUT_CLASS} value={form.city} onChange={(event) => handleFormUpdate('city', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Province
                        <input className={DETAIL_INPUT_CLASS} value={form.province} onChange={(event) => handleFormUpdate('province', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Estate / Complex Name (optional)
                        <input className={DETAIL_INPUT_CLASS} value={form.estateComplexName} onChange={(event) => handleFormUpdate('estateComplexName', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Unit Number (optional)
                        <input className={DETAIL_INPUT_CLASS} value={form.unitNumber} onChange={(event) => handleFormUpdate('unitNumber', event.target.value)} />
                      </label>
                    </div>
                  </article>

                  <article className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                    <h3 className="text-sm font-semibold text-[#22364a]">Size</h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Erf Size (m2)
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.erfSize} onChange={(event) => handleFormUpdate('erfSize', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Floor Size (m2)
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.floorSize} onChange={(event) => handleFormUpdate('floorSize', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Bedrooms
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.bedrooms} onChange={(event) => handleFormUpdate('bedrooms', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Bathrooms
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.bathrooms} onChange={(event) => handleFormUpdate('bathrooms', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Living Areas
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.livingArea} onChange={(event) => handleFormUpdate('livingArea', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Kitchens
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.kitchens} onChange={(event) => handleFormUpdate('kitchens', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Garages
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.garages} onChange={(event) => handleFormUpdate('garages', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Covered Parking
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.parkingCovered} onChange={(event) => handleFormUpdate('parkingCovered', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Open Parking
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.parkingOpen} onChange={(event) => handleFormUpdate('parkingOpen', event.target.value)} />
                      </label>
                      <label className="flex items-center gap-2 rounded-[10px] border border-[#d6e1ee] px-3 py-2 text-sm font-medium text-[#2a4057]">
                        <input type="checkbox" checked={form.pool} onChange={(event) => handleFormUpdate('pool', event.target.checked)} />
                        Pool
                      </label>
                    </div>
                  </article>

                  <article className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                    <h3 className="text-sm font-semibold text-[#22364a]">Features</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {PROPERTY_FEATURES.map((feature) => {
                        const active = (form.features || []).includes(feature.key)
                        return (
                          <button
                            key={feature.key}
                            type="button"
                            onClick={() => handleFeatureToggle(feature.key)}
                            className={chipChoiceClass(active)}
                          >
                            {feature.label}
                          </button>
                        )
                      })}
                    </div>
                  </article>

                  <article className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                    <h3 className="text-sm font-semibold text-[#22364a]">Condition</h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Property Condition
                        <select className={DETAIL_INPUT_CLASS} value={form.propertyCondition} onChange={(event) => handleFormUpdate('propertyCondition', event.target.value)}>
                          <option value="needs_renovation">Needs renovation</option>
                          <option value="average">Average</option>
                          <option value="good">Good</option>
                          <option value="recently_renovated">Recently renovated</option>
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                        Notes (optional)
                        <textarea className={`${DETAIL_INPUT_CLASS} min-h-[110px] resize-y`} value={form.propertyNotes} onChange={(event) => handleFormUpdate('propertyNotes', event.target.value)} placeholder="Anything your agent should know about condition or upgrades" />
                      </label>
                    </div>
                  </article>

                  <article className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                    <h3 className="text-sm font-semibold text-[#22364a]">Value / Valuation Factors</h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Kitchen Condition
                        <select className={DETAIL_INPUT_CLASS} value={form.kitchenCondition} onChange={(event) => handleFormUpdate('kitchenCondition', event.target.value)}>
                          <option value="needs_renovation">Needs renovation</option>
                          <option value="average">Average</option>
                          <option value="good">Good</option>
                          <option value="recently_renovated">Recently renovated</option>
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Bathroom Condition
                        <select className={DETAIL_INPUT_CLASS} value={form.bathroomCondition} onChange={(event) => handleFormUpdate('bathroomCondition', event.target.value)}>
                          <option value="needs_renovation">Needs renovation</option>
                          <option value="average">Average</option>
                          <option value="good">Good</option>
                          <option value="recently_renovated">Recently renovated</option>
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Levies (optional)
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.levies} onChange={(event) => handleFormUpdate('levies', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Rates & Taxes (optional)
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.ratesTaxes} onChange={(event) => handleFormUpdate('ratesTaxes', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Views (optional)
                        <input className={DETAIL_INPUT_CLASS} value={form.views} onChange={(event) => handleFormUpdate('views', event.target.value)} placeholder="Mountain, sea, park, city..." />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Recent Renovations (optional)
                        <input className={DETAIL_INPUT_CLASS} value={form.recentRenovations} onChange={(event) => handleFormUpdate('recentRenovations', event.target.value)} placeholder="Kitchen updated in 2024, repaint, etc." />
                      </label>
                    </div>
                  </article>
                </div>
              </section>
            </>
          ) : null}

          {currentStep === 2 ? (
            <section className={INNER_PANEL_CLASS}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#162435]">FICA / Compliance</h2>
                  <p className="mt-1 text-sm text-[#60748b]">
                    Required documents are based on seller type. You don&apos;t need to upload them now.
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-full border border-[#dce6f2] bg-white px-3 py-1 text-xs font-semibold text-[#35546c]"
                  onClick={() => setShowFicaInfo((current) => !current)}
                >
                  {showFicaInfo ? 'Hide List' : 'Show List'}
                </button>
              </div>

              <div className="mt-4 rounded-[12px] border border-[#dce6f2] bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7890a8]">
                  Compliance set for {OWNERSHIP_TYPES.find((item) => item.value === form.ownershipType)?.label || 'Individual'}
                </p>
                {showFicaInfo ? (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-[#5f738a]">
                    {ficaRequirements.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-[#5f738a]">
                    We&apos;ll request only the documents relevant to your ownership type after agent review.
                  </p>
                )}
              </div>
            </section>
          ) : null}

          {currentStep === 3 ? (
            <section className={INNER_PANEL_CLASS}>
              <h2 className="text-lg font-semibold text-[#162435]">Review & Submit</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-[14px] border border-[#dce6f2] bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.08em] text-[#7890a8]">Seller</p>
                  <p className="mt-1 text-sm font-semibold text-[#22364a]">{form.sellerFirstName} {form.sellerSurname}</p>
                  <p className="text-xs text-[#5f738a]">{form.email} • {form.phone}</p>
                </div>
                <div className="rounded-[14px] border border-[#dce6f2] bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.08em] text-[#7890a8]">Ownership</p>
                  <p className="mt-1 text-sm font-semibold text-[#22364a]">{OWNERSHIP_TYPES.find((item) => item.value === form.ownershipType)?.label || 'Individual'}</p>
                </div>
                <div className="rounded-[14px] border border-[#dce6f2] bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.08em] text-[#7890a8]">Property</p>
                  <p className="mt-1 text-sm font-semibold text-[#22364a]">{form.propertyType}</p>
                  <p className="text-xs text-[#5f738a]">{form.propertyAddress} • {form.suburb} • {form.province}</p>
                </div>
                <div className="rounded-[14px] border border-[#dce6f2] bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.08em] text-[#7890a8]">Selling Context</p>
                  <p className="mt-1 text-sm font-semibold text-[#22364a]">{form.askingPrice ? formatCurrency(form.askingPrice) : 'Price not set'}</p>
                  <p className="text-xs text-[#5f738a]">Timeline: {String(form.sellingTimeline || '').replace(/_/g, ' ')}</p>
                </div>
                <div className="rounded-[14px] border border-[#dce6f2] bg-white p-3 md:col-span-2">
                  <p className="text-xs uppercase tracking-[0.08em] text-[#7890a8]">Compliance Summary</p>
                  <p className="mt-1 text-sm text-[#22364a]">{ficaRequirements.join(' • ')}</p>
                </div>
              </div>
              <div className="mt-4 rounded-[12px] border border-[#dce6f2] bg-white p-3 text-sm text-[#5f738a]">
                Your property details have been submitted. Your agent will review the information and prepare the next step.
              </div>
            </section>
          ) : null}

          {isCompleted ? (
            <section className="rounded-[18px] border border-[#d8ecdf] bg-[#eefbf3] p-4 md:p-5">
              <h2 className="text-lg font-semibold text-[#14532d]">Your property details have been submitted</h2>
              <p className="mt-2 text-sm leading-6 text-[#25603d]">
                Your agent will review the information and prepare the next step.
              </p>
              <div className="mt-4">
                <Link
                  to={`/seller/${token}`}
                  className="inline-flex items-center rounded-[10px] border border-[#b7dfc3] bg-white px-3 py-2 text-sm font-semibold text-[#14532d]"
                >
                  Open Seller Workspace
                </Link>
              </div>
            </section>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-[#e4ebf5] pt-4">
          <Link to="/" className="text-sm font-semibold text-[#35546c] underline-offset-2 hover:underline">
            Return to Bridge
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {currentStep > 0 ? (
              <Button type="button" variant="secondary" onClick={handleBack} disabled={saving || submitting}>
                <ChevronLeft size={14} />
                Back
              </Button>
            ) : null}
            {currentStep < 3 ? (
              <Button type="button" variant="ghost" onClick={() => saveDraft(currentStep)} disabled={saving || submitting}>
                {saving ? 'Saving...' : 'Save Draft'}
              </Button>
            ) : null}
            {currentStep < 3 ? (
              <Button type="button" onClick={handleNext} disabled={saving || submitting}>
                Next
                <ChevronRight size={14} />
              </Button>
            ) : null}
            {currentStep === 3 && !isCompleted ? (
              <Button type="button" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Details'}
                <CheckCircle2 size={14} />
              </Button>
            ) : null}
          </div>
        </div>
      </section>
  )

  if (embedded) {
    return <div className="w-full">{content}</div>
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,#eef4fb_0%,#e8eef7_45%,#e1e8f2_100%)] px-4 py-5 pb-10 md:py-8">
      <div className={PAGE_CONTAINER_CLASS}>
        {content}
      </div>
    </main>
  )
}

export default SellerOnboarding
