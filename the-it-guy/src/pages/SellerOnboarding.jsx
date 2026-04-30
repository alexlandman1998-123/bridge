import { CheckCircle2, ChevronLeft, ChevronRight, Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import {
  findListingBySellerOnboardingToken,
  OFFER_STATUS,
  readAgentPrivateListings,
  SELLER_ONBOARDING_STATUS,
  updateListingBySellerOnboardingToken,
} from '../lib/agentListingStorage'

const STEPS = [
  'Welcome',
  'Seller Information',
  'Property Ownership',
  'Mandate to Sell',
  'Financial Documents',
  'FICA Compliance',
  'Review & Submit',
  'Offers',
]

const SELLER_STATUS_LABELS = {
  [SELLER_ONBOARDING_STATUS.NOT_STARTED]: 'Not Started',
  [SELLER_ONBOARDING_STATUS.IN_PROGRESS]: 'In Progress',
  [SELLER_ONBOARDING_STATUS.SUBMITTED]: 'Submitted',
  [SELLER_ONBOARDING_STATUS.UNDER_REVIEW]: 'Under Review',
  [SELLER_ONBOARDING_STATUS.COMPLETED]: 'Completed',
}

const OFFER_STATUS_LABELS = {
  [OFFER_STATUS.PENDING]: 'Pending',
  [OFFER_STATUS.ACCEPTED]: 'Accepted',
  [OFFER_STATUS.REJECTED]: 'Rejected',
  [OFFER_STATUS.EXPIRED]: 'Expired',
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

function formatDate(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString('en-ZA')
}

function normalizeFormData(listing) {
  const seller = listing?.seller || {}
  const existing = listing?.sellerOnboarding?.formData || {}
  return {
    fullName: existing.fullName || seller.name || '',
    idNumber: existing.idNumber || '',
    email: existing.email || seller.email || '',
    phone: existing.phone || seller.phone || '',
    residentialAddress: existing.residentialAddress || '',
    maritalStatus: existing.maritalStatus || '',
    marriageRegime: existing.marriageRegime || '',
    spouseName: existing.spouseName || '',
    spouseIdNumber: existing.spouseIdNumber || '',
    propertyAddress: existing.propertyAddress || [listing?.listingTitle, listing?.suburb, listing?.city].filter(Boolean).join(', '),
    erfNumber: existing.erfNumber || '',
    propertyType: existing.propertyType || listing?.propertyType || 'House',
    ownershipType: existing.ownershipType || 'individual',
    entityName: existing.entityName || '',
    entityRegistrationNumber: existing.entityRegistrationNumber || '',
    entityRepresentative: existing.entityRepresentative || '',
    mandateType: existing.mandateType || listing?.mandateType || 'sole',
    askingPrice: existing.askingPrice || String(listing?.askingPrice || ''),
    commissionAgreement:
      existing.commissionAgreement ||
      (listing?.commission?.commission_type === 'fixed'
        ? formatCurrency(listing?.commission?.commission_amount || 0)
        : `${listing?.commission?.commission_percentage || 0}%`),
    mandateStartDate: existing.mandateStartDate || listing?.mandateStartDate || '',
    mandateEndDate: existing.mandateEndDate || listing?.mandateEndDate || '',
    specialConditions: existing.specialConditions || '',
    mandateAcknowledged: Boolean(existing.mandateAcknowledged),
  }
}

function SellerOnboarding() {
  const { token = '' } = useParams()
  const [listing, setListing] = useState(null)
  const [form, setForm] = useState(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!token) {
      setError('Invalid seller onboarding link.')
      setLoading(false)
      return
    }

    const found = findListingBySellerOnboardingToken(token)
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
        ? 7
        : Math.min(Math.max(persistedStep, 0), 6)

    const nextListing =
      onboardingStatus === SELLER_ONBOARDING_STATUS.NOT_STARTED
        ? updateListingBySellerOnboardingToken(token, (row) => ({
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

  const documentMap = useMemo(() => {
    const docs = Array.isArray(listing?.requiredDocuments) ? listing.requiredDocuments : []
    return docs.reduce((acc, item) => {
      acc[item.key] = item
      return acc
    }, {})
  }, [listing])

  const progress = useMemo(() => {
    return Math.round(((currentStep + 1) / STEPS.length) * 100)
  }, [currentStep])

  const statusLabel = useMemo(() => {
    const key = String(listing?.sellerOnboarding?.status || '').trim().toLowerCase()
    return SELLER_STATUS_LABELS[key] || 'In Progress'
  }, [listing?.sellerOnboarding?.status])

  function persistListingUpdate(updater, options = {}) {
    const updated = updateListingBySellerOnboardingToken(token, updater)
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
    setForm((prev) => ({ ...(prev || {}), [key]: value }))
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
    setTimeout(() => setSuccess(''), 1500)
  }

  function validateCurrentStep() {
    if (!form) return 'Form state unavailable.'
    if (currentStep === 1) {
      if (!form.fullName || !form.idNumber || !form.email || !form.phone) {
        return 'Please complete full name, ID/passport, email, and phone.'
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.email))) {
        return 'Please provide a valid email address.'
      }
    }
    if (currentStep === 2) {
      if (!form.propertyAddress || !form.propertyType || !form.ownershipType) {
        return 'Property address, type, and ownership type are required.'
      }
      const needsEntity = form.ownershipType === 'company' || form.ownershipType === 'trust'
      if (needsEntity && (!form.entityName || !form.entityRegistrationNumber || !form.entityRepresentative)) {
        return 'Entity name, registration number, and representative are required for company/trust ownership.'
      }
    }
    if (currentStep === 3) {
      if (!form.askingPrice || Number(form.askingPrice) <= 0) return 'Asking price is required.'
      if (!form.mandateAcknowledged) return 'Please confirm the mandate acknowledgment.'
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

  function handleDocumentUpload(docKey, file) {
    if (!file) return
    setError('')
    persistListingUpdate((row) => ({
      ...row,
      requiredDocuments: (row?.requiredDocuments || []).map((doc) =>
        doc.key === docKey
          ? {
              ...doc,
              status: 'uploaded',
              fileName: file.name,
              uploadedAt: new Date().toISOString(),
            }
          : doc,
      ),
      sellerOnboarding: {
        ...(row?.sellerOnboarding || {}),
        status: SELLER_ONBOARDING_STATUS.IN_PROGRESS,
        currentStep,
        formData: { ...(form || {}) },
      },
    }))
  }

  async function handleSubmit() {
    if (!form) return
    setSubmitting(true)
    setError('')

    const requiredDocKeys = ['mandate_to_sell', 'rates_account', 'id_document', 'proof_of_address']
    const missingRequiredDocs = requiredDocKeys.filter((key) => {
      const doc = documentMap[key]
      return !doc || !['uploaded', 'approved', 'reviewed', 'completed'].includes(String(doc.status || '').toLowerCase())
    })

    if (missingRequiredDocs.length) {
      setSubmitting(false)
      setError('Please upload all required mandate and FICA documents before submitting.')
      return
    }

    const updated = persistListingUpdate((row) => ({
      ...row,
      sellerOnboarding: {
        ...(row?.sellerOnboarding || {}),
        status: SELLER_ONBOARDING_STATUS.SUBMITTED,
        submittedAt: new Date().toISOString(),
        currentStep: 7,
        formData: { ...(form || {}) },
      },
    }))

    if (!updated) {
      setSubmitting(false)
      setError('Unable to submit onboarding right now.')
      return
    }

    setListing(updated)
    setCurrentStep(7)
    setSubmitting(false)
    setSuccess('Seller onboarding submitted successfully.')
  }

  function updateOfferStatus(offerId, status) {
    const reason = status === OFFER_STATUS.REJECTED ? window.prompt('Reason for rejection (optional):', '') || '' : ''
    const updated = persistListingUpdate((row) => {
      const nextOffers = (row?.offers || []).map((offer) => {
        if (offer.id !== offerId) return offer
        return {
          ...offer,
          status,
          sellerDecisionAt: new Date().toISOString(),
          sellerDecisionReason: reason,
        }
      })
      const completed = status === OFFER_STATUS.ACCEPTED
      return {
        ...row,
        offers: nextOffers,
        sellerOnboarding: {
          ...(row?.sellerOnboarding || {}),
          status: completed ? SELLER_ONBOARDING_STATUS.COMPLETED : SELLER_ONBOARDING_STATUS.SUBMITTED,
          completedAt: completed ? new Date().toISOString() : row?.sellerOnboarding?.completedAt || null,
          currentStep: 7,
          formData: { ...(form || {}) },
        },
      }
    })

    if (updated) {
      setSuccess(status === OFFER_STATUS.ACCEPTED ? 'Offer accepted. Deal progression has been triggered.' : 'Offer rejected.')
      setTimeout(() => setSuccess(''), 1800)
    }
  }

  const offers = Array.isArray(listing?.offers) ? listing.offers : []
  const canProceedToOffers = [SELLER_ONBOARDING_STATUS.SUBMITTED, SELLER_ONBOARDING_STATUS.UNDER_REVIEW, SELLER_ONBOARDING_STATUS.COMPLETED]
    .includes(String(listing?.sellerOnboarding?.status || '').trim().toLowerCase())

  if (loading) {
    return <main className="mx-auto w-full max-w-[880px] px-4 py-8 text-sm text-[#5f738a]">Loading seller onboarding…</main>
  }

  if (!listing || !form) {
    return (
      <main className="mx-auto w-full max-w-[880px] px-4 py-8">
        <div className="rounded-[20px] border border-[#f6d4d4] bg-[#fff5f5] p-5 text-sm text-[#b42318]">
          {error || 'Seller onboarding link is invalid or inactive.'}
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-[920px] px-4 py-6 md:py-8">
      <section className="rounded-[24px] border border-[#dce6f2] bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.08)] md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-[1.55rem] font-semibold tracking-[-0.03em] text-[#132134]">Seller Onboarding</h1>
            <p className="mt-2 text-sm leading-6 text-[#60748b]">Submit ownership, mandate, FICA, and property documentation to activate offer management.</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#7890a8]">{listing.listingTitle}</p>
          </div>
          <span className="inline-flex items-center rounded-full border border-[#dce6f2] bg-[#f7fbff] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#3b5a77]">
            {statusLabel}
          </span>
        </div>

        <div className="mt-5 rounded-[14px] border border-[#e2eaf4] bg-[#f9fcff] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7890a8]">Step {currentStep + 1} of {STEPS.length}</p>
            <p className="text-sm font-semibold text-[#1e3650]">{STEPS[currentStep]}</p>
          </div>
          <div className="mt-2 h-2 rounded-full bg-[#dce6f2]">
            <span className="block h-full rounded-full bg-[#35546c]" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {error ? <p className="mt-4 rounded-[12px] border border-[#f6d4d4] bg-[#fff5f5] px-4 py-2 text-sm text-[#b42318]">{error}</p> : null}
        {success ? <p className="mt-4 rounded-[12px] border border-[#d8ecdf] bg-[#eefbf3] px-4 py-2 text-sm text-[#1f7d44]">{success}</p> : null}

        <div className="mt-5 space-y-4">
          {currentStep === 0 ? (
            <section className="rounded-[18px] border border-[#e0e9f3] bg-[#fbfdff] p-4 md:p-5">
              <h2 className="text-lg font-semibold text-[#162435]">Welcome</h2>
              <p className="mt-2 text-sm leading-6 text-[#60748b]">
                Welcome, you&apos;re submitting your property details for sale. This helps your agent manage your listing, offers, and sale process.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-[12px] border border-[#dce6f2] bg-white px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.08em] text-[#7890a8]">Agent</p>
                  <p className="mt-1 text-sm font-semibold text-[#22364a]">{listing?.commission?.agent_id || 'Assigned agent'}</p>
                </div>
                <div className="rounded-[12px] border border-[#dce6f2] bg-white px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.08em] text-[#7890a8]">Agency</p>
                  <p className="mt-1 text-sm font-semibold text-[#22364a]">{listing?.commission?.agency_id || 'Agency'}</p>
                </div>
                <div className="rounded-[12px] border border-[#dce6f2] bg-white px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.08em] text-[#7890a8]">Property</p>
                  <p className="mt-1 text-sm font-semibold text-[#22364a]">{[listing?.suburb, listing?.city].filter(Boolean).join(', ') || listing.listingTitle}</p>
                </div>
              </div>
            </section>
          ) : null}

          {currentStep === 1 ? (
            <section className="rounded-[18px] border border-[#e0e9f3] bg-[#fbfdff] p-4 md:p-5">
              <h2 className="text-lg font-semibold text-[#162435]">Seller Information</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                  Full Name
                  <input className="h-12 rounded-[12px] border border-[#d6e1ee] px-3 text-sm" value={form.fullName} onChange={(event) => handleFormUpdate('fullName', event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                  ID Number / Passport
                  <input className="h-12 rounded-[12px] border border-[#d6e1ee] px-3 text-sm" value={form.idNumber} onChange={(event) => handleFormUpdate('idNumber', event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                  Email Address
                  <input className="h-12 rounded-[12px] border border-[#d6e1ee] px-3 text-sm" type="email" value={form.email} onChange={(event) => handleFormUpdate('email', event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                  Phone Number
                  <input className="h-12 rounded-[12px] border border-[#d6e1ee] px-3 text-sm" value={form.phone} onChange={(event) => handleFormUpdate('phone', event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                  Residential Address
                  <input className="h-12 rounded-[12px] border border-[#d6e1ee] px-3 text-sm" value={form.residentialAddress} onChange={(event) => handleFormUpdate('residentialAddress', event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                  Marital Status
                  <select className="h-12 rounded-[12px] border border-[#d6e1ee] px-3 text-sm" value={form.maritalStatus} onChange={(event) => handleFormUpdate('maritalStatus', event.target.value)}>
                    <option value="">Select status</option>
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                    <option value="divorced">Divorced</option>
                    <option value="widowed">Widowed</option>
                  </select>
                </label>
                {form.maritalStatus === 'married' ? (
                  <>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Marriage Regime
                      <select className="h-12 rounded-[12px] border border-[#d6e1ee] px-3 text-sm" value={form.marriageRegime} onChange={(event) => handleFormUpdate('marriageRegime', event.target.value)}>
                        <option value="">Select regime</option>
                        <option value="cop">In Community of Property</option>
                        <option value="anc">Out of Community (ANC)</option>
                        <option value="anc_accrual">ANC with accrual</option>
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Spouse Full Name
                      <input className="h-12 rounded-[12px] border border-[#d6e1ee] px-3 text-sm" value={form.spouseName} onChange={(event) => handleFormUpdate('spouseName', event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Spouse ID Number
                      <input className="h-12 rounded-[12px] border border-[#d6e1ee] px-3 text-sm" value={form.spouseIdNumber} onChange={(event) => handleFormUpdate('spouseIdNumber', event.target.value)} />
                    </label>
                  </>
                ) : null}
              </div>
            </section>
          ) : null}

          {currentStep === 2 ? (
            <section className="rounded-[18px] border border-[#e0e9f3] bg-[#fbfdff] p-4 md:p-5">
              <h2 className="text-lg font-semibold text-[#162435]">Property Ownership</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                  Property Address
                  <input className="h-12 rounded-[12px] border border-[#d6e1ee] px-3 text-sm" value={form.propertyAddress} onChange={(event) => handleFormUpdate('propertyAddress', event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                  Erf / Unit Number
                  <input className="h-12 rounded-[12px] border border-[#d6e1ee] px-3 text-sm" value={form.erfNumber} onChange={(event) => handleFormUpdate('erfNumber', event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                  Property Type
                  <select className="h-12 rounded-[12px] border border-[#d6e1ee] px-3 text-sm" value={form.propertyType} onChange={(event) => handleFormUpdate('propertyType', event.target.value)}>
                    <option>House</option>
                    <option>Apartment</option>
                    <option>Sectional Title</option>
                    <option>Commercial</option>
                    <option>Agricultural</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                  Ownership Type
                  <select className="h-12 rounded-[12px] border border-[#d6e1ee] px-3 text-sm" value={form.ownershipType} onChange={(event) => handleFormUpdate('ownershipType', event.target.value)}>
                    <option value="individual">Individual</option>
                    <option value="company">Company</option>
                    <option value="trust">Trust</option>
                  </select>
                </label>
              </div>
              {form.ownershipType === 'company' || form.ownershipType === 'trust' ? (
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    Entity Name
                    <input className="h-12 rounded-[12px] border border-[#d6e1ee] px-3 text-sm" value={form.entityName} onChange={(event) => handleFormUpdate('entityName', event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    Registration Number
                    <input className="h-12 rounded-[12px] border border-[#d6e1ee] px-3 text-sm" value={form.entityRegistrationNumber} onChange={(event) => handleFormUpdate('entityRegistrationNumber', event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    Representative
                    <input className="h-12 rounded-[12px] border border-[#d6e1ee] px-3 text-sm" value={form.entityRepresentative} onChange={(event) => handleFormUpdate('entityRepresentative', event.target.value)} />
                  </label>
                </div>
              ) : null}
            </section>
          ) : null}

          {currentStep === 3 ? (
            <section className="rounded-[18px] border border-[#e0e9f3] bg-[#fbfdff] p-4 md:p-5">
              <h2 className="text-lg font-semibold text-[#162435]">Mandate to Sell</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                  Mandate Type
                  <select className="h-12 rounded-[12px] border border-[#d6e1ee] px-3 text-sm" value={form.mandateType} onChange={(event) => handleFormUpdate('mandateType', event.target.value)}>
                    <option value="sole">Sole Mandate</option>
                    <option value="open">Open Mandate</option>
                    <option value="joint">Joint Mandate</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                  Asking Price
                  <input className="h-12 rounded-[12px] border border-[#d6e1ee] px-3 text-sm" type="number" min="0" value={form.askingPrice} onChange={(event) => handleFormUpdate('askingPrice', event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                  Commission Agreement
                  <input className="h-12 rounded-[12px] border border-[#d6e1ee] px-3 text-sm" value={form.commissionAgreement} onChange={(event) => handleFormUpdate('commissionAgreement', event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                  Mandate Start Date
                  <input className="h-12 rounded-[12px] border border-[#d6e1ee] px-3 text-sm" type="date" value={form.mandateStartDate} onChange={(event) => handleFormUpdate('mandateStartDate', event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                  Mandate Expiry Date
                  <input className="h-12 rounded-[12px] border border-[#d6e1ee] px-3 text-sm" type="date" value={form.mandateEndDate} onChange={(event) => handleFormUpdate('mandateEndDate', event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                  Special Conditions
                  <textarea className="min-h-[110px] rounded-[12px] border border-[#d6e1ee] px-3 py-2.5 text-sm" value={form.specialConditions} onChange={(event) => handleFormUpdate('specialConditions', event.target.value)} />
                </label>
              </div>
              <label className="mt-3 flex items-start gap-2 rounded-[12px] border border-[#dce6f2] bg-white px-3 py-2 text-sm text-[#2a4057]">
                <input type="checkbox" className="mt-1" checked={form.mandateAcknowledged} onChange={(event) => handleFormUpdate('mandateAcknowledged', event.target.checked)} />
                <span>I confirm that I appoint this agent to market and sell this property.</span>
              </label>
            </section>
          ) : null}

          {currentStep === 4 || currentStep === 5 ? (
            <section className="rounded-[18px] border border-[#e0e9f3] bg-[#fbfdff] p-4 md:p-5">
              <h2 className="text-lg font-semibold text-[#162435]">{currentStep === 4 ? 'Property Financial Documents' : 'FICA Compliance'}</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {(listing.requiredDocuments || [])
                  .filter((doc) =>
                    currentStep === 4
                      ? ['mandate_to_sell', 'rates_account', 'levies_statement', 'bond_statement', 'utility_bill'].includes(doc.key)
                      : ['id_document', 'proof_of_address', 'entity_documents'].includes(doc.key),
                  )
                  .map((doc) => (
                    <article key={doc.key} className="rounded-[14px] border border-[#dce6f2] bg-white p-3">
                      <p className="text-sm font-semibold text-[#22364a]">{doc.label}</p>
                      <p className="mt-1 text-xs text-[#5f738a]">Status: {String(doc.status || 'requested').replace(/_/g, ' ')}</p>
                      {doc.fileName ? <p className="mt-1 text-xs text-[#1f4f78]">File: {doc.fileName}</p> : null}
                      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-[#cfe0f2] bg-[#f7fbff] px-3 py-2 text-xs font-semibold text-[#1f4f78]">
                        <Upload size={14} />
                        Upload
                        <input
                          type="file"
                          className="hidden"
                          onChange={(event) => handleDocumentUpload(doc.key, event.target.files?.[0])}
                        />
                      </label>
                    </article>
                  ))}
              </div>
            </section>
          ) : null}

          {currentStep === 6 ? (
            <section className="rounded-[18px] border border-[#e0e9f3] bg-[#fbfdff] p-4 md:p-5">
              <h2 className="text-lg font-semibold text-[#162435]">Review & Submit</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-[14px] border border-[#dce6f2] bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.08em] text-[#7890a8]">Seller</p>
                  <p className="mt-1 text-sm font-semibold text-[#22364a]">{form.fullName}</p>
                  <p className="text-xs text-[#5f738a]">{form.email} • {form.phone}</p>
                </div>
                <div className="rounded-[14px] border border-[#dce6f2] bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.08em] text-[#7890a8]">Property</p>
                  <p className="mt-1 text-sm font-semibold text-[#22364a]">{form.propertyAddress}</p>
                  <p className="text-xs text-[#5f738a]">{form.propertyType} • {form.ownershipType}</p>
                </div>
                <div className="rounded-[14px] border border-[#dce6f2] bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.08em] text-[#7890a8]">Mandate</p>
                  <p className="mt-1 text-sm font-semibold text-[#22364a]">{form.mandateType} • {formatCurrency(form.askingPrice)}</p>
                  <p className="text-xs text-[#5f738a]">{form.mandateStartDate || 'Start pending'} → {form.mandateEndDate || 'End pending'}</p>
                </div>
                <div className="rounded-[14px] border border-[#dce6f2] bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.08em] text-[#7890a8]">Documents Uploaded</p>
                  <p className="mt-1 text-sm font-semibold text-[#22364a]">
                    {(listing.requiredDocuments || []).filter((doc) => ['uploaded', 'approved', 'reviewed', 'completed'].includes(String(doc.status || '').toLowerCase())).length}
                    {' / '}
                    {(listing.requiredDocuments || []).length}
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-[12px] border border-[#dce6f2] bg-white p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-[#7890a8]">Missing items</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-[#5f738a]">
                  {(listing.requiredDocuments || [])
                    .filter((doc) => doc.required && !['uploaded', 'approved', 'reviewed', 'completed'].includes(String(doc.status || '').toLowerCase()))
                    .map((doc) => <li key={`missing-${doc.key}`}>{doc.label}</li>)}
                </ul>
              </div>
            </section>
          ) : null}

          {currentStep === 7 ? (
            <section className="rounded-[18px] border border-[#e0e9f3] bg-[#fbfdff] p-4 md:p-5">
              <h2 className="text-lg font-semibold text-[#162435]">Offer Management</h2>
              <p className="mt-2 text-sm text-[#60748b]">
                Review offers and accept or reject directly from your seller portal.
              </p>
              {!canProceedToOffers ? (
                <div className="mt-4 rounded-[12px] border border-[#f0dfb8] bg-[#fffaee] px-4 py-3 text-sm text-[#8d6421]">
                  Submit onboarding first to unlock offer actions.
                </div>
              ) : null}
              <div className="mt-4 space-y-3">
                {offers.length ? (
                  offers.map((offer) => (
                    <article key={offer.id} className="rounded-[14px] border border-[#dce6f2] bg-white p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-[#22364a]">{offer.buyerName || 'Buyer'}</p>
                          <p className="text-xs text-[#5f738a]">{formatDate(offer.offerDate)} • {offer.conditions || 'No conditions captured'}</p>
                        </div>
                        <span className="rounded-full border border-[#dce6f2] bg-[#f8fbff] px-2.5 py-1 text-xs font-semibold text-[#365572]">
                          {OFFER_STATUS_LABELS[String(offer.status || '').toLowerCase()] || 'Pending'}
                        </span>
                      </div>
                      <p className="mt-2 text-[1rem] font-semibold text-[#142132]">{formatCurrency(offer.offerPrice || 0)}</p>
                      <p className="mt-1 text-xs text-[#5f738a]">Expiry: {formatDate(offer.expiryDate)}</p>
                      {offer.agentNotes ? <p className="mt-2 text-xs text-[#5f738a]">{offer.agentNotes}</p> : null}
                      {canProceedToOffers && String(offer.status || '').toLowerCase() === OFFER_STATUS.PENDING ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button type="button" size="sm" onClick={() => updateOfferStatus(offer.id, OFFER_STATUS.ACCEPTED)}>
                            Accept Offer
                          </Button>
                          <Button type="button" variant="secondary" size="sm" onClick={() => updateOfferStatus(offer.id, OFFER_STATUS.REJECTED)}>
                            Reject Offer
                          </Button>
                        </div>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <div className="rounded-[12px] border border-[#dce6f2] bg-white px-4 py-6 text-center text-sm text-[#60748b]">
                    No offers yet. Your agent will publish offers here for your decision.
                  </div>
                )}
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
            {currentStep < 6 ? (
              <Button type="button" variant="ghost" onClick={() => saveDraft(currentStep)} disabled={saving || submitting}>
                {saving ? 'Saving…' : 'Save Draft'}
              </Button>
            ) : null}
            {currentStep < 6 ? (
              <Button type="button" onClick={handleNext} disabled={saving || submitting}>
                Next
                <ChevronRight size={14} />
              </Button>
            ) : null}
            {currentStep === 6 ? (
              <Button type="button" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit Onboarding'}
                <CheckCircle2 size={14} />
              </Button>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  )
}

export default SellerOnboarding

