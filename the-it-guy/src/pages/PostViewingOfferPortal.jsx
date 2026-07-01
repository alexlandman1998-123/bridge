import { AlertTriangle, Home, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import { financeTypeLabel, normalizeFinanceType } from '../core/transactions/financeType'
import {
  getOfferLifecycleSummary,
  getOfferPortalSessionContext,
  submitOfferPortalOffer,
} from '../lib/buyerLifecycleService'
import {
  getPurchaserTypeLabel,
  getPurchaserTypeOptions,
  normalizePurchaserType,
} from '../lib/purchaserPersonas'
import { invokeEdgeFunction } from '../lib/supabaseClient'

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'Price on application'
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount)
}

function formatDate(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function statusLabel(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function normalizeText(value) {
  return String(value || '').trim()
}

function moneyInputValue(value) {
  if (value === null || value === undefined || value === '') return ''
  const numeric = Number(value)
  return Number.isFinite(numeric) ? String(numeric) : ''
}

function formatDateTime(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
}

function propertyLabel(item = {}) {
  const listing = item?.listing && typeof item.listing === 'object' ? item.listing : {}
  return [listing.listingTitle, listing.propertyAddress, listing.suburb || listing.city]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' - ') || 'Viewed property'
}

function getLatestPropertyOffer(item = {}) {
  return (Array.isArray(item?.offers) ? item.offers : [])
    .filter(Boolean)
    .slice()
    .sort((left, right) => new Date(right?.updatedAt || right?.submittedAt || right?.createdAt || 0) - new Date(left?.updatedAt || left?.submittedAt || left?.createdAt || 0))[0] || null
}

const initialForm = {
  fullName: '',
  email: '',
  phone: '',
  idNumber: '',
  purchaserType: 'individual',
  purchaserEntityName: '',
  offerAmount: '',
  depositAmount: '',
  depositDueDate: '',
  financeType: 'bond',
  bondAmount: '',
  cashContribution: '',
  bondApprovalDeadline: '',
  needsBondAssistance: false,
  proofOfFundsUrl: '',
  proofOfFundsReference: '',
  preApprovalReference: '',
  suspensiveConditions: '',
  subjectToSale: false,
  subjectSaleProperty: '',
  subjectSaleTimeline: '',
  occupationDate: '',
  occupationalRent: false,
  occupationalRentAmount: '',
  includedFixtures: '',
  excludedFixtures: '',
  specialConditions: '',
  expiryDate: '',
  expiryTime: '17:00',
  acknowledgeSellerReview: true,
  acknowledgeLegalDisclaimer: true,
  acknowledgeInfoAccuracy: true,
}

const PURCHASER_TYPE_OPTIONS = getPurchaserTypeOptions({ includeOptional: true })

function formatTime(value) {
  const normalized = String(value || '').trim()
  if (!/^\d{2}:\d{2}$/.test(normalized)) return ''
  return normalized
}

function yesNoLabel(value) {
  return value ? 'Yes' : 'No'
}

function buildOfferValidationErrors(form = {}) {
  const errors = []
  const financeType = normalizeFinanceType(form.financeType || 'cash')
  const purchaserType = normalizePurchaserType(form.purchaserType || 'individual')
  const offerAmount = Number(form.offerAmount || 0)
  const bondAmount = Number(form.bondAmount || 0)
  const cashContribution = Number(form.cashContribution || 0)
  const subjectToSale = form.subjectToSale === true
  const occupationalRent = form.occupationalRent === true

  if (!normalizeText(form.fullName) || !normalizeText(form.email) || !normalizeText(form.phone)) {
    errors.push('Buyer full name, email, and phone are required.')
  }
  if (!(offerAmount > 0)) {
    errors.push('Offer amount is required.')
  }
  if (normalizeText(form.depositAmount) === '' || !normalizeText(form.depositDueDate)) {
    errors.push('Deposit amount and deposit due date are required.')
  }
  if (!normalizeText(form.expiryDate) || !formatTime(form.expiryTime)) {
    errors.push('Offer expiry date and time are required.')
  }
  if (!normalizeText(form.occupationDate)) {
    errors.push('Occupation date is required.')
  }
  if (!normalizeText(form.purchaserType)) {
    errors.push('Purchaser structure is required.')
  }

  if (financeType === 'cash') {
    if (!normalizeText(form.proofOfFundsUrl) && !normalizeText(form.proofOfFundsReference)) {
      errors.push('Cash offers require proof of funds or a reference note.')
    }
  }

  if (financeType === 'bond') {
    if (!(bondAmount > 0)) {
      errors.push('Bond offers require the bond amount.')
    }
    if (!normalizeText(form.bondApprovalDeadline)) {
      errors.push('Bond offers require a bond approval deadline.')
    }
    if (!normalizeText(form.preApprovalReference) && !normalizeText(form.proofOfFundsReference)) {
      errors.push('Bond offers require a pre-approval or finance reference.')
    }
  }

  if (financeType === 'combination') {
    if (!(bondAmount > 0) || !(cashContribution > 0)) {
      errors.push('Combination offers require both a bond amount and cash contribution.')
    }
    if (!normalizeText(form.bondApprovalDeadline)) {
      errors.push('Combination offers require a bond approval deadline.')
    }
  }

  if (subjectToSale) {
    if (!normalizeText(form.subjectSaleProperty) || !normalizeText(form.subjectSaleTimeline)) {
      errors.push('Subject-to-sale offers require the property and expected sale timeline.')
    }
  }

  if (occupationalRent && !normalizeText(form.occupationalRentAmount)) {
    errors.push('Add the occupational rent amount when occupational rent applies.')
  }

  if (['company', 'trust'].includes(purchaserType) && !normalizeText(form.purchaserEntityName)) {
    errors.push('Company and trust purchases require the entity name.')
  }

  if (!form.acknowledgeSellerReview || !form.acknowledgeLegalDisclaimer || !form.acknowledgeInfoAccuracy) {
    errors.push('All confirmations must be acknowledged before submitting.')
  }

  return errors
}

function PostViewingOfferPortal() {
  const { token = '' } = useParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [selectedListingId, setSelectedListingId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState(initialForm)

  useEffect(() => {
    let active = true
    setLoading(true)
    setErrorMessage('')
    getOfferPortalSessionContext(token)
      .then((nextContext) => {
        if (!active) return
        setContext(nextContext)
        const firstListingId = nextContext?.properties?.[0]?.viewedListing?.listingId || nextContext?.properties?.[0]?.listing?.id || ''
        setSelectedListingId((current) => current || firstListingId)
        const metadata = nextContext?.session?.metadata || {}
        setForm((previous) => ({
          ...previous,
          fullName: previous.fullName || metadata.buyerName || '',
          email: previous.email || metadata.buyerEmail || '',
          phone: previous.phone || metadata.buyerPhone || '',
        }))
      })
      .catch((error) => {
        if (active) setContext({ ok: false, reason: error?.message || 'not_found', session: null, properties: [] })
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [refreshKey, token])

  const properties = useMemo(() => (Array.isArray(context?.properties) ? context.properties : []), [context?.properties])
  const selectedProperty = useMemo(() => {
    return properties.find((item) => String(item?.viewedListing?.listingId || item?.listing?.id || '') === String(selectedListingId || '')) || properties[0] || null
  }, [properties, selectedListingId])
  const selectedPropertyOffers = useMemo(() => (Array.isArray(selectedProperty?.offers) ? selectedProperty.offers : []).filter(Boolean), [selectedProperty?.offers])
  const selectedPropertyLatestOffer = useMemo(() => getLatestPropertyOffer(selectedProperty), [selectedProperty])
  const selectedPropertyLifecycle = useMemo(() => (
    selectedPropertyLatestOffer ? getOfferLifecycleSummary(selectedPropertyLatestOffer) : null
  ), [selectedPropertyLatestOffer])
  const selectedPropertyOpenOfferCount = useMemo(() => (
    selectedPropertyOffers.filter((offer) => !getOfferLifecycleSummary(offer).terminal).length
  ), [selectedPropertyOffers])
  const submittedCount = properties.reduce((count, item) => count + (Array.isArray(item.offers) ? item.offers.length : 0), 0)
  const financeType = normalizeFinanceType(form.financeType || 'bond')
  const showHybridFinanceFields = financeType === 'combination'
  const showBondAssistance = ['bond', 'combination'].includes(financeType)
  const showDepositTiming = true
  const showEntityName = ['company', 'trust'].includes(normalizePurchaserType(form.purchaserType))
  const showSubjectSaleFields = form.subjectToSale === true
  const showOccupationalRentAmount = form.occupationalRent === true
  const offerValidationErrors = useMemo(() => buildOfferValidationErrors(form), [form])
  const canSubmitSelectedPropertyOffer = !selectedPropertyLifecycle || selectedPropertyLifecycle.buyerCanResubmit
  const selectedPropertyBanner = useMemo(() => {
    if (!selectedPropertyLifecycle) return null
    if (selectedPropertyLifecycle.effectiveStatus === 'countered') {
      return {
        tone: 'amber',
        text: 'Seller sent a counter on this property. Update the terms below and resubmit if you still want to proceed.',
      }
    }
    if (selectedPropertyLifecycle.effectiveStatus === 'changes_requested') {
      return {
        tone: 'amber',
        text: 'The agent asked for changes on this property before the offer goes back to the seller.',
      }
    }
    if (selectedPropertyLifecycle.activeNegotiation) {
      return {
        tone: 'amber',
        text: selectedPropertyLifecycle.blockedReason || 'There is already a live offer under review on this property.',
      }
    }
    if (selectedPropertyLifecycle.acceptedOrConverted) {
      return {
        tone: 'green',
        text: selectedPropertyLifecycle.blockedReason,
      }
    }
    if (selectedPropertyLifecycle.terminal && !selectedPropertyLifecycle.buyerCanResubmit) {
      return {
        tone: 'red',
        text: selectedPropertyLifecycle.blockedReason || 'This offer path is closed. Ask the agent for a new secure link if negotiations restart.',
      }
    }
    return null
  }, [selectedPropertyLifecycle])

  function updateForm(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  function updateFinanceType(value) {
    const canonical = normalizeFinanceType(value || 'cash')
    setForm((previous) => ({
      ...previous,
      financeType: canonical,
      bondAmount: canonical === 'combination' ? previous.bondAmount : canonical === 'bond' ? previous.bondAmount : '',
      cashContribution: canonical === 'combination' ? previous.cashContribution : '',
      bondApprovalDeadline: ['bond', 'combination'].includes(canonical) ? previous.bondApprovalDeadline : '',
      needsBondAssistance: ['bond', 'combination'].includes(canonical) ? previous.needsBondAssistance : false,
    }))
  }

  function handleSelectProperty(listingId) {
    setSelectedListingId(listingId)
    setErrorMessage('')
    setSuccessMessage('')
  }

  useEffect(() => {
    if (!selectedPropertyLifecycle?.counterTerms || !canSubmitSelectedPropertyOffer) return
    const counterTerms = selectedPropertyLifecycle.counterTerms || {}
    if (!Object.keys(counterTerms).length) return
    setForm((previous) => ({
      ...previous,
      offerAmount: previous.offerAmount || moneyInputValue(counterTerms.offerAmount || counterTerms.amount),
      depositAmount: previous.depositAmount || moneyInputValue(counterTerms.depositAmount),
      depositDueDate: previous.depositDueDate || normalizeText(counterTerms.depositDueDate),
      bondAmount: previous.bondAmount || moneyInputValue(counterTerms.bondAmount),
      cashContribution: previous.cashContribution || moneyInputValue(counterTerms.cashContribution),
      bondApprovalDeadline: previous.bondApprovalDeadline || normalizeText(counterTerms.bondApprovalDeadline),
      occupationDate: previous.occupationDate || normalizeText(counterTerms.occupationDate),
      occupationalRentAmount: previous.occupationalRentAmount || moneyInputValue(counterTerms.occupationalRentAmount),
      includedFixtures: previous.includedFixtures || normalizeText(counterTerms.includedFixtures),
      excludedFixtures: previous.excludedFixtures || normalizeText(counterTerms.excludedFixtures),
      suspensiveConditions: previous.suspensiveConditions || normalizeText(counterTerms.specialConditions || counterTerms.suspensiveConditions),
      expiryDate: previous.expiryDate || normalizeText(counterTerms.expiryDate),
      expiryTime: previous.expiryTime || normalizeText(counterTerms.expiryTime),
    }))
  }, [canSubmitSelectedPropertyOffer, selectedPropertyLifecycle?.counterTerms])

  async function handleSubmitOffer(event) {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')
    if (!selectedListingId) {
      setErrorMessage('Select a property before submitting an offer.')
      return
    }
    if (!canSubmitSelectedPropertyOffer) {
      setErrorMessage(selectedPropertyLifecycle?.blockedReason || 'This property already has a live or closed offer that cannot be resubmitted from this link.')
      return
    }
    if (offerValidationErrors.length) {
      setErrorMessage(offerValidationErrors[0])
      return
    }
    try {
      setSubmitting(true)
      const result = await submitOfferPortalOffer({
        token,
        listingId: selectedListingId,
        submission: {
          ...form,
          financeType,
          purchaserType: normalizePurchaserType(form.purchaserType),
          expiryTime: formatTime(form.expiryTime),
          selectedProperty: propertyLabel(selectedProperty),
        },
      })
      await sendAgentOfferSubmittedNotification(result?.offer).catch((notificationError) => {
        console.warn('[OFFER PORTAL] agent offer submission notification failed', notificationError)
      })
      setSuccessMessage('Offer submitted successfully. The agent will review and forward it to the seller.')
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to submit offer right now.')
    } finally {
      setSubmitting(false)
    }
  }

  async function sendAgentOfferSubmittedNotification(offer = {}) {
    const metadata = context?.session?.metadata || {}
    const agent = context?.agent || {}
    const agentEmail = normalizeText(agent.email || metadata.agentEmail).toLowerCase()
    if (!agentEmail) return null

    const agentReviewUrl = normalizeText(metadata.agentReviewUrl) ||
      (typeof window !== 'undefined' && context?.session?.buyerLeadId
        ? `${window.location.origin}/pipeline/leads/${encodeURIComponent(context.session.buyerLeadId)}`
        : '')
    const response = await invokeEdgeFunction('send-email', {
      body: {
        type: 'buyer_offer_submitted_agent',
        to: agentEmail,
        organisationId: normalizeText(offer?.organisationId || context?.session?.organisationId),
        leadId: normalizeText(offer?.buyerLeadId || context?.session?.buyerLeadId),
        listingId: normalizeText(offer?.listingId || selectedProperty?.viewedListing?.listingId || selectedProperty?.listing?.id),
        appointmentId: normalizeText(offer?.viewingAppointmentId || context?.session?.appointmentId),
        offerId: normalizeText(offer?.id),
        agentName: normalizeText(agent.name || metadata.agentName),
        buyerName: normalizeText(form.fullName || metadata.buyerName),
        propertyTitle: propertyLabel(selectedProperty),
        offerAmount: formatCurrency(offer?.offerAmount || form.offerAmount),
        financeType: financeTypeLabel(offer?.financeType || form.financeType),
        offerSubmittedAt: formatDateTime(offer?.buyerSubmittedAt || offer?.submittedAt || new Date().toISOString()),
        agentReviewUrl,
        note: [
          normalizeText(form.specialConditions || form.suspensiveConditions),
          normalizeText(form.subjectToSale ? `Subject to sale: ${form.subjectSaleProperty} (${form.subjectSaleTimeline})` : ''),
          normalizeText(form.depositDueDate ? `Deposit due: ${formatDate(form.depositDueDate)}` : ''),
        ].filter(Boolean).join(' | '),
      },
    })
    if (response?.error || response?.data?.error) {
      throw response.error || new Error(response.data.error)
    }
    return response?.data || null
  }

  if (loading && !context) {
    return (
      <main className="min-h-screen bg-[#f6f8fb] px-4 py-8">
        <section className="mx-auto max-w-[980px] rounded-[22px] border border-[#e3eaf4] bg-white p-6 text-sm text-[#5f738a] shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
          Loading your post-viewing offer portal...
        </section>
      </main>
    )
  }

  if (!context?.ok) {
    return (
      <main className="min-h-screen bg-[#f6f8fb] px-4 py-8">
        <section className="mx-auto max-w-[860px] rounded-[22px] border border-[#e3eaf4] bg-white p-6 shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
          <div className="flex items-start gap-3 text-[#b42318]">
            <AlertTriangle className="mt-0.5 h-5 w-5" />
            <div>
              <h1 className="text-[1.2rem] font-semibold text-[#142132]">Offer portal unavailable</h1>
              <p className="mt-1 text-sm text-[#5f738a]">
                {context?.reason === 'expired'
                  ? 'This post-viewing offer link has expired. Ask the agent to send a new secure link.'
                  : 'This post-viewing offer link is invalid or no longer active.'}
              </p>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-4 py-8 text-[#142132]">
      <div className="mx-auto grid w-full max-w-[1160px] gap-5 lg:grid-cols-[0.92fr_1.08fr]">
        <section className="space-y-5">
          <div className="rounded-[24px] border border-[#dce6f2] bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#6e8198]">Arch9 offer portal</p>
                <h1 className="mt-2 text-2xl font-semibold text-[#102033] sm:text-3xl">Make an offer on a viewed property</h1>
                <p className="mt-2 max-w-[620px] text-sm leading-6 text-[#61738a]">
                  Review the properties from your viewing session and submit an offer on one or more of them.
                </p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#cfe8dc] bg-[#eefbf4] px-3 py-1 text-xs font-semibold text-[#17643a]">
                <ShieldCheck className="h-4 w-4" />
                Secure link
              </span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#e4ebf4] bg-[#f9fbfd] p-4">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7a8da5]">Properties</p>
                <p className="mt-1 text-2xl font-semibold">{properties.length}</p>
              </div>
              <div className="rounded-2xl border border-[#e4ebf4] bg-[#f9fbfd] p-4">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7a8da5]">Offers sent</p>
                <p className="mt-1 text-2xl font-semibold">{submittedCount}</p>
              </div>
              <div className="rounded-2xl border border-[#e4ebf4] bg-[#f9fbfd] p-4">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7a8da5]">Expires</p>
                <p className="mt-2 text-sm font-semibold">{formatDate(context.session?.expiresAt) || 'Agent controlled'}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-[#dce6f2] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.07)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Viewed properties</h2>
                <p className="text-sm text-[#61738a]">Choose the property you want to make an offer on.</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {properties.length ? properties.map((item) => {
                const listingId = item?.viewedListing?.listingId || item?.listing?.id || ''
                const isSelected = String(listingId) === String(selectedListingId)
                const latestOffer = getLatestPropertyOffer(item)
                const lifecycle = latestOffer ? getOfferLifecycleSummary(latestOffer) : null
                return (
                  <button
                    key={listingId || item?.viewedListing?.id}
                    type="button"
                    onClick={() => handleSelectProperty(listingId)}
                    className={`w-full rounded-[18px] border p-4 text-left transition ${
                      isSelected
                        ? 'border-[#1f5b78] bg-[#f0f7fb] shadow-[0_10px_24px_rgba(31,91,120,0.12)]'
                        : 'border-[#e1e9f3] bg-white hover:border-[#bfd0df] hover:bg-[#f9fbfd]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#eaf2f7] text-[#1f5b78]">
                        <Home className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-semibold text-[#102033]">{propertyLabel(item)}</span>
                        <span className="mt-1 block text-sm text-[#61738a]">{formatCurrency(item?.listing?.askingPrice)}</span>
                        {latestOffer ? (
                          <span className="mt-3 inline-flex rounded-full bg-[#edf7f0] px-3 py-1 text-xs font-semibold text-[#17643a]">
                            Offer {statusLabel(lifecycle?.effectiveStatus || latestOffer.status)} - {formatCurrency(latestOffer.offerAmount)}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </button>
                )
              }) : (
                <div className="rounded-2xl border border-dashed border-[#d8e3ef] bg-[#f9fbfd] p-5 text-sm text-[#61738a]">
                  No viewed properties are linked to this session yet.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-[#dce6f2] bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] lg:sticky lg:top-6 lg:self-start">
          <div className="border-b border-[#e5edf5] pb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a8da5]">Selected property</p>
            <h2 className="mt-1 text-xl font-semibold">{propertyLabel(selectedProperty)}</h2>
            <p className="mt-1 text-sm text-[#61738a]">{formatCurrency(selectedProperty?.listing?.askingPrice)}</p>
          </div>

          {selectedPropertyBanner ? (
            <div className={`mt-4 rounded-2xl border p-3 text-sm ${
              selectedPropertyBanner.tone === 'green'
                ? 'border-[#cfe8dc] bg-[#edf9f0] text-[#17643a]'
                : selectedPropertyBanner.tone === 'red'
                  ? 'border-[#f2c7c7] bg-[#fff6f6] text-[#b42318]'
                  : 'border-[#f5d6a8] bg-[#fff8ed] text-[#9a5b11]'
            }`}>
              {selectedPropertyBanner.text}
            </div>
          ) : null}

          {selectedPropertyOpenOfferCount > 1 ? (
            <div className="mt-4 rounded-2xl border border-[#f5d6a8] bg-[#fff8ed] p-3 text-sm text-[#9a5b11]">
              There are {selectedPropertyOpenOfferCount} open offer records on this property already. Your agent should keep one live negotiation path and close the others cleanly.
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mt-4 rounded-2xl border border-[#f2c7c7] bg-[#fff6f6] p-3 text-sm text-[#b42318]">{errorMessage}</div>
          ) : null}
          {successMessage ? (
            <div className="mt-4 rounded-2xl border border-[#cfe8dc] bg-[#f0fbf5] p-3 text-sm text-[#17643a]">{successMessage}</div>
          ) : null}

          <form className="mt-5 space-y-4" onSubmit={handleSubmitOffer}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-[#334155]">
                Full name
                <Field className="mt-1" value={form.fullName} onChange={(event) => updateForm('fullName', event.target.value)} required />
              </label>
              <label className="text-sm font-semibold text-[#334155]">
                ID number
                <Field className="mt-1" value={form.idNumber} onChange={(event) => updateForm('idNumber', event.target.value)} />
              </label>
              <label className="text-sm font-semibold text-[#334155]">
                Email
                <Field className="mt-1" type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} required />
              </label>
              <label className="text-sm font-semibold text-[#334155]">
                Phone
                <Field className="mt-1" value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} required />
              </label>
              <label className="text-sm font-semibold text-[#334155]">
                Purchaser structure
                <Field as="select" className="mt-1" value={form.purchaserType} onChange={(event) => updateForm('purchaserType', event.target.value)} required>
                  {PURCHASER_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </Field>
              </label>
              {showEntityName ? (
                <label className="text-sm font-semibold text-[#334155]">
                  {normalizePurchaserType(form.purchaserType) === 'trust' ? 'Trust name' : 'Company name'}
                  <Field className="mt-1" value={form.purchaserEntityName} onChange={(event) => updateForm('purchaserEntityName', event.target.value)} required />
                </label>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-[#334155]">
                Offer amount
                <Field className="mt-1" type="number" min="0" step="1000" value={form.offerAmount} onChange={(event) => updateForm('offerAmount', event.target.value)} required />
              </label>
              <label className="text-sm font-semibold text-[#334155]">
                Deposit amount
                <Field className="mt-1" type="number" min="0" step="1000" value={form.depositAmount} onChange={(event) => updateForm('depositAmount', event.target.value)} required />
              </label>
              {showDepositTiming ? (
                <label className="text-sm font-semibold text-[#334155]">
                  Deposit due date
                  <Field className="mt-1" type="date" value={form.depositDueDate} onChange={(event) => updateForm('depositDueDate', event.target.value)} required />
                </label>
              ) : null}
              <label className="text-sm font-semibold text-[#334155]">
                Finance type
                <Field as="select" className="mt-1" value={form.financeType} onChange={(event) => updateFinanceType(event.target.value)}>
                  <option value="bond">Bond</option>
                  <option value="cash">Cash</option>
                  <option value="combination">Combination</option>
                </Field>
              </label>
              <label className="text-sm font-semibold text-[#334155]">
                Offer expiry date
                <Field className="mt-1" type="date" value={form.expiryDate} onChange={(event) => updateForm('expiryDate', event.target.value)} />
              </label>
              <label className="text-sm font-semibold text-[#334155]">
                Offer expiry time
                <Field className="mt-1" type="time" value={form.expiryTime} onChange={(event) => updateForm('expiryTime', event.target.value)} />
              </label>
              {['bond', 'combination'].includes(financeType) ? (
                <label className="text-sm font-semibold text-[#334155]">
                  Bond approval deadline
                  <Field className="mt-1" type="date" value={form.bondApprovalDeadline} onChange={(event) => updateForm('bondApprovalDeadline', event.target.value)} required />
                </label>
              ) : null}
              {showHybridFinanceFields ? (
                <label className="text-sm font-semibold text-[#334155]">
                  Bond amount
                  <Field className="mt-1" type="number" min="0" step="1000" value={form.bondAmount} onChange={(event) => updateForm('bondAmount', event.target.value)} required />
                </label>
              ) : null}
              {financeType === 'bond' ? (
                <label className="text-sm font-semibold text-[#334155]">
                  Bond amount
                  <Field className="mt-1" type="number" min="0" step="1000" value={form.bondAmount} onChange={(event) => updateForm('bondAmount', event.target.value)} />
                </label>
              ) : null}
              {showHybridFinanceFields ? (
                <label className="text-sm font-semibold text-[#334155]">
                  Cash contribution
                  <Field className="mt-1" type="number" min="0" step="1000" value={form.cashContribution} onChange={(event) => updateForm('cashContribution', event.target.value)} required />
                </label>
              ) : null}
              {showBondAssistance ? (
                <label className="flex items-center gap-2 rounded-2xl border border-[#e1e9f3] bg-[#f9fbfd] px-3 py-3 text-sm text-[#44566c] sm:col-span-2">
                  <input type="checkbox" className="shrink-0" checked={form.needsBondAssistance} onChange={(event) => updateForm('needsBondAssistance', event.target.checked)} />
                  <span>Do you need help sorting out your bond?</span>
                </label>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-[#334155]">
                Proof of funds link
                <Field className="mt-1" type="url" placeholder="https://..." value={form.proofOfFundsUrl} onChange={(event) => updateForm('proofOfFundsUrl', event.target.value)} />
              </label>
              <label className="text-sm font-semibold text-[#334155]">
                Proof / pre-approval reference
                <Field className="mt-1" value={financeType === 'cash' ? form.proofOfFundsReference : form.preApprovalReference} onChange={(event) => updateForm(financeType === 'cash' ? 'proofOfFundsReference' : 'preApprovalReference', event.target.value)} />
              </label>
            </div>

            <label className="text-sm font-semibold text-[#334155]">
              Suspensive conditions
              <Field as="textarea" className="mt-1" rows={3} value={form.suspensiveConditions} onChange={(event) => updateForm('suspensiveConditions', event.target.value)} />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-[#334155]">
                When would you like to move in ideally?
                <Field className="mt-1" type="date" value={form.occupationDate} onChange={(event) => updateForm('occupationDate', event.target.value)} />
              </label>
              <label className="flex items-center gap-2 rounded-2xl border border-[#e1e9f3] bg-[#f9fbfd] px-3 py-3 text-sm text-[#44566c]">
                <input type="checkbox" className="shrink-0" checked={form.occupationalRent} onChange={(event) => updateForm('occupationalRent', event.target.checked)} />
                <span>Occupational rent</span>
              </label>
              {showOccupationalRentAmount ? (
                <label className="text-sm font-semibold text-[#334155] sm:col-span-2">
                  Occupational rent amount
                  <Field className="mt-1" type="number" min="0" step="1000" value={form.occupationalRentAmount} onChange={(event) => updateForm('occupationalRentAmount', event.target.value)} />
                </label>
              ) : null}
            </div>

            <label className="flex items-start gap-2 text-sm text-[#44566c]">
              <input type="checkbox" className="mt-1" checked={form.subjectToSale} onChange={(event) => updateForm('subjectToSale', event.target.checked)} />
              <span>This offer is subject to the sale of another property.</span>
            </label>

            {showSubjectSaleFields ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold text-[#334155]">
                  Property being sold
                  <Field className="mt-1" value={form.subjectSaleProperty} onChange={(event) => updateForm('subjectSaleProperty', event.target.value)} />
                </label>
                <label className="text-sm font-semibold text-[#334155]">
                  Sale timeline
                  <Field className="mt-1" value={form.subjectSaleTimeline} onChange={(event) => updateForm('subjectSaleTimeline', event.target.value)} />
                </label>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-[#334155]">
                Included fixtures
                <Field as="textarea" className="mt-1" rows={3} value={form.includedFixtures} onChange={(event) => updateForm('includedFixtures', event.target.value)} />
              </label>
              <label className="text-sm font-semibold text-[#334155]">
                Excluded fixtures
                <Field as="textarea" className="mt-1" rows={3} value={form.excludedFixtures} onChange={(event) => updateForm('excludedFixtures', event.target.value)} />
              </label>
            </div>

            <label className="text-sm font-semibold text-[#334155]">
              Special conditions
              <Field as="textarea" className="mt-1" rows={4} value={form.specialConditions} onChange={(event) => updateForm('specialConditions', event.target.value)} />
            </label>

            <div className="rounded-2xl border border-[#e1e9f3] bg-[#f9fbfd] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8da5]">Offer Summary</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 text-sm text-[#44566c]">
                <div>
                  <p className="text-xs font-semibold text-[#7a8da5]">Purchaser</p>
                  <p className="mt-1 font-semibold text-[#102033]">{getPurchaserTypeLabel(form.purchaserType)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#7a8da5]">Finance</p>
                  <p className="mt-1 font-semibold text-[#102033]">{financeTypeLabel(financeType)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#7a8da5]">Deposit due</p>
                  <p className="mt-1 font-semibold text-[#102033]">{formatDate(form.depositDueDate) || 'Not set'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#7a8da5]">Occupation</p>
                  <p className="mt-1 font-semibold text-[#102033]">{formatDate(form.occupationDate) || 'Not set'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#7a8da5]">Occupational rent</p>
                  <p className="mt-1 font-semibold text-[#102033]">{yesNoLabel(form.occupationalRent)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#7a8da5]">Subject to sale</p>
                  <p className="mt-1 font-semibold text-[#102033]">{yesNoLabel(form.subjectToSale)}</p>
                </div>
              </div>
            </div>

            {offerValidationErrors.length ? (
              <div className="rounded-2xl border border-[#f5d6a8] bg-[#fff8ed] p-4 text-sm text-[#9a5b11]">
                <p className="font-semibold">Before you submit</p>
                <div className="mt-2 space-y-1">
                  {offerValidationErrors.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
              </div>
            ) : null}

            <label className="flex items-start gap-2 text-sm text-[#44566c]">
              <input type="checkbox" className="mt-1" checked={form.acknowledgeSellerReview} onChange={(event) => updateForm('acknowledgeSellerReview', event.target.checked)} />
              <span>I understand the agent will review this offer before it is presented to the seller.</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-[#44566c]">
              <input type="checkbox" className="mt-1" checked={form.acknowledgeLegalDisclaimer} onChange={(event) => updateForm('acknowledgeLegalDisclaimer', event.target.checked)} />
              <span>I understand this is a negotiation submission and formal sale documents will follow if the offer is accepted.</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-[#44566c]">
              <input type="checkbox" className="mt-1" checked={form.acknowledgeInfoAccuracy} onChange={(event) => updateForm('acknowledgeInfoAccuracy', event.target.checked)} />
              <span>I confirm these offer terms and buyer details are accurate.</span>
            </label>

            <p className="rounded-2xl border border-[#e1e9f3] bg-[#f9fbfd] px-4 py-3 text-sm leading-6 text-[#44566c]">
              Your agent will review the offer before sending it to the seller. Formal legal documentation will follow if the offer is accepted.
            </p>

            <Button type="submit" className="w-full justify-center" disabled={submitting || !selectedListingId || !properties.length || !canSubmitSelectedPropertyOffer}>
              {submitting ? 'Submitting offer...' : selectedPropertyLifecycle?.effectiveStatus === 'countered' ? 'Submit revised offer' : 'Submit offer'}
            </Button>
          </form>
        </section>
      </div>
    </main>
  )
}

export default PostViewingOfferPortal
