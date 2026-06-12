import { AlertTriangle, Clock3, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import {
  getCanonicalOfferInviteContext,
  getOfferLifecycleSummary,
  submitCanonicalBuyerOffer,
} from '../lib/buyerLifecycleService'
import { invokeEdgeFunction } from '../lib/supabaseClient'
import {
  getOfferInviteContext,
  OFFER_WORKFLOW_STATUS,
  normalizeOfferWorkflowStatus,
  submitBuyerOffer,
} from '../lib/listingOffersService'

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'R 0'
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount)
}

function formatDate(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString('en-ZA')
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

function BuyerOfferSubmission() {
  const { token = '' } = useParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const [canonicalContext, setCanonicalContext] = useState(null)
  const [canonicalLoading, setCanonicalLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    idNumber: '',
    offerAmount: '',
    depositAmount: '',
    financeType: 'bond',
    bondAmount: '',
    cashContribution: '',
    needsBondAssistance: false,
    proofOfFundsUrl: '',
    suspensiveConditions: '',
    subjectToSale: false,
    subjectSaleProperty: '',
    subjectSaleTimeline: '',
    subjectSaleAgentInvolved: false,
    occupationDate: '',
    occupationalRent: false,
    includedFixtures: '',
    excludedFixtures: '',
    specialConditions: '',
    expiryDate: '',
    acknowledgeSellerReview: true,
    acknowledgeLegalDisclaimer: true,
    acknowledgeInfoAccuracy: true,
  })

  const legacyContext = useMemo(() => {
    void refreshKey
    return getOfferInviteContext(token)
  }, [token, refreshKey])
  useEffect(() => {
    let active = true
    if (legacyContext?.ok) {
      setCanonicalContext(null)
      return () => {
        active = false
      }
    }
    setCanonicalLoading(true)
    getCanonicalOfferInviteContext(token)
      .then((nextContext) => {
        if (active) setCanonicalContext(nextContext)
      })
      .catch(() => {
        if (active) setCanonicalContext({ ok: false, reason: 'not_found', invite: null, listing: null, offers: [] })
      })
      .finally(() => {
        if (active) setCanonicalLoading(false)
      })
    return () => {
      active = false
    }
  }, [legacyContext?.ok, refreshKey, token])
  const context = legacyContext?.ok ? legacyContext : (canonicalContext || legacyContext)
  const listing = context?.listing || null
  const invite = context?.invite || null
  const existingOffers = Array.isArray(context?.offers) ? context.offers : []
  const canonicalOffer = context?.source === 'canonical' ? (context?.canonicalOffer || existingOffers[0] || null) : null
  const canonicalLifecycle = context?.source === 'canonical' && canonicalOffer ? getOfferLifecycleSummary(canonicalOffer) : null
  const latestOffer = existingOffers
    .slice()
    .sort((left, right) => new Date(right?.updatedAt || right?.submittedAt || right?.createdAt || 0) - new Date(left?.updatedAt || left?.submittedAt || left?.createdAt || 0))[0] || null
  const latestStatus = normalizeOfferWorkflowStatus(latestOffer?.status || '')
  const counterPendingBuyer = canonicalLifecycle?.effectiveStatus === 'countered' || latestStatus === OFFER_WORKFLOW_STATUS.BUYER_REVIEW_COUNTER || latestStatus === OFFER_WORKFLOW_STATUS.COUNTERED
  const canSubmitCanonicalOffer = !canonicalLifecycle || canonicalLifecycle.buyerCanResubmit
  const financeType = String(form.financeType || '').toLowerCase()
  const showHybridFinanceFields = financeType === 'hybrid'
  const showBondAssistance = ['bond', 'hybrid'].includes(financeType)
  const canonicalBanner = useMemo(() => {
    if (!canonicalLifecycle) return null
    if (canonicalLifecycle.effectiveStatus === 'countered') {
      return {
        tone: 'amber',
        text: 'Seller sent a counter offer. Update the terms below and submit a revised offer if you still want to proceed.',
      }
    }
    if (canonicalLifecycle.effectiveStatus === 'changes_requested') {
      return {
        tone: 'amber',
        text: 'The agent asked for changes before the offer goes back to the seller. Update the details and resubmit.',
      }
    }
    if (canonicalLifecycle.activeNegotiation) {
      return {
        tone: 'amber',
        text: canonicalLifecycle.blockedReason || 'This offer is already under review. Wait for feedback before sending another version.',
      }
    }
    if (canonicalLifecycle.acceptedOrConverted) {
      return {
        tone: 'green',
        text: canonicalLifecycle.blockedReason,
      }
    }
    if (canonicalLifecycle.terminal && !canonicalLifecycle.buyerCanResubmit) {
      return {
        tone: 'red',
        text: canonicalLifecycle.blockedReason || 'This offer is closed. Ask the agent for a new secure link if negotiations restart.',
      }
    }
    return null
  }, [canonicalLifecycle])

  useEffect(() => {
    if (!context?.ok) return
    const conditions = context?.canonicalOffer?.conditions || {}
    setForm((previous) => ({
      ...previous,
      fullName: previous.fullName || conditions.buyerName || invite?.buyerLeadName || '',
      email: previous.email || conditions.buyerEmail || '',
      phone: previous.phone || conditions.buyerPhone || '',
    }))
  }, [context?.canonicalOffer?.conditions, context?.ok, invite?.buyerLeadName])

  useEffect(() => {
    if (!canonicalLifecycle?.counterTerms || !counterPendingBuyer) return
    const counterTerms = canonicalLifecycle.counterTerms || {}
    setForm((previous) => ({
      ...previous,
      offerAmount: previous.offerAmount || moneyInputValue(counterTerms.offerAmount || counterTerms.amount),
      depositAmount: previous.depositAmount || moneyInputValue(counterTerms.depositAmount),
      bondAmount: previous.bondAmount || moneyInputValue(counterTerms.bondAmount),
      cashContribution: previous.cashContribution || moneyInputValue(counterTerms.cashContribution),
      occupationDate: previous.occupationDate || normalizeText(counterTerms.occupationDate),
      expiryDate: previous.expiryDate || normalizeText(counterTerms.expiryDate),
      includedFixtures: previous.includedFixtures || normalizeText(counterTerms.includedFixtures),
      excludedFixtures: previous.excludedFixtures || normalizeText(counterTerms.excludedFixtures),
      specialConditions: previous.specialConditions || normalizeText(counterTerms.specialConditions || counterTerms.suspensiveConditions),
    }))
  }, [canonicalLifecycle?.counterTerms, counterPendingBuyer])

  function updateForm(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  function updateFinanceType(value) {
    setForm((previous) => ({
      ...previous,
      financeType: value,
      bondAmount: value === 'hybrid' ? previous.bondAmount : '',
      cashContribution: value === 'hybrid' ? previous.cashContribution : '',
      needsBondAssistance: ['bond', 'hybrid'].includes(value) ? previous.needsBondAssistance : false,
    }))
  }

  async function handleSubmitOffer(event) {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')
    try {
      if (context?.source === 'canonical' && !canSubmitCanonicalOffer) {
        throw new Error(canonicalLifecycle?.blockedReason || 'This offer cannot be updated from this link anymore.')
      }
      setSubmitting(true)
      let submittedOffer = null
      if (context?.source === 'canonical') {
        submittedOffer = await submitCanonicalBuyerOffer({
          token,
          submission: form,
        })
      } else {
        submittedOffer = await submitBuyerOffer({
          token,
          mode: counterPendingBuyer ? 'counter_response' : 'new',
          submission: form,
        })
      }
      await sendAgentOfferSubmittedNotification(submittedOffer).catch((notificationError) => {
        console.warn('[BUYER OFFER] agent offer submission notification failed', notificationError)
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
    const conditions = context?.canonicalOffer?.conditions || offer?.conditions || {}
    const agentEmail = normalizeText(conditions.agentEmail || context?.invite?.agentEmail).toLowerCase()
    if (!agentEmail) return null

    const response = await invokeEdgeFunction('send-email', {
      body: {
        type: 'buyer_offer_submitted_agent',
        to: agentEmail,
        organisationId: normalizeText(offer?.organisationId || context?.canonicalOffer?.organisationId),
        leadId: normalizeText(offer?.buyerLeadId || context?.canonicalOffer?.buyerLeadId || context?.invite?.buyerLeadId),
        listingId: normalizeText(offer?.listingId || listing?.id || context?.canonicalOffer?.listingId),
        appointmentId: normalizeText(offer?.viewingAppointmentId || context?.canonicalOffer?.viewingAppointmentId),
        offerId: normalizeText(offer?.id),
        agentName: normalizeText(conditions.agentName || context?.invite?.agentName),
        buyerName: normalizeText(form.fullName || conditions.buyerName || context?.invite?.buyerLeadName),
        propertyTitle: listing?.listingTitle || listing?.propertyAddress || 'Listing',
        offerAmount: formatCurrency(offer?.offerAmount || form.offerAmount),
        financeType: normalizeText(offer?.financeType || form.financeType),
        offerSubmittedAt: formatDateTime(offer?.buyerSubmittedAt || offer?.submittedAt || new Date().toISOString()),
        agentReviewUrl: normalizeText(conditions.agentReviewUrl),
        note: normalizeText(form.specialConditions || form.suspensiveConditions),
      },
    })
    if (response?.error || response?.data?.error) {
      throw response.error || new Error(response.data.error)
    }
    return response?.data || null
  }

  if (canonicalLoading && !context?.ok) {
    return (
      <main className="mx-auto w-full max-w-[860px] px-4 py-8">
        <section className="rounded-[22px] border border-[#e3eaf4] bg-white p-6 text-sm text-[#5f738a] shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
          Loading secure offer link...
        </section>
      </main>
    )
  }

  if (!context?.ok) {
    return (
      <main className="mx-auto w-full max-w-[860px] px-4 py-8">
        <section className="rounded-[22px] border border-[#e3eaf4] bg-white p-6 shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
          <div className="flex items-start gap-3 text-[#b42318]">
            <AlertTriangle className="mt-0.5 h-5 w-5" />
            <div>
              <h1 className="text-[1.2rem] font-semibold text-[#142132]">Offer link unavailable</h1>
              <p className="mt-1 text-sm text-[#5f738a]">
                {context?.reason === 'expired'
                  ? 'This offer link has expired. Ask the agent to send a new secure offer link.'
                  : 'This offer link is invalid or no longer active.'}
              </p>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-[980px] space-y-5 px-4 py-6">
      <section className="rounded-[24px] border border-[#e1e9f4] bg-white p-5 shadow-[0_14px_28px_rgba(15,23,42,0.07)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Secure Buyer Offer</p>
            <h1 className="mt-2 text-[1.35rem] font-semibold tracking-[-0.02em] text-[#142132]">Submit Your Offer</h1>
            <p className="mt-1 text-sm text-[#5f738a]">
              Submit your offer for seller review. This offer does not replace formal legal documentation.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-3 py-1.5 text-xs font-semibold text-[#35546c]">
            <ShieldCheck size={13} />
            Secure token active
          </span>
        </div>
      </section>

      <section className="rounded-[24px] border border-[#e1e9f4] bg-white p-5 shadow-[0_14px_28px_rgba(15,23,42,0.07)]">
        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <article className="rounded-[18px] border border-[#dbe6f2] bg-[#fbfdff] p-4">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.09em] text-[#7b8ca2]">Property</p>
            <p className="mt-2 text-lg font-semibold text-[#142132]">{listing?.listingTitle || listing?.propertyAddress || 'Listing'}</p>
            <p className="mt-1 text-sm text-[#607387]">{[listing?.propertyAddress, listing?.suburb, listing?.city].filter(Boolean).join(', ') || 'Address pending'}</p>
            <p className="mt-3 text-sm text-[#607387]">Listing price: <span className="font-semibold text-[#142132]">{formatCurrency(listing?.askingPrice)}</span></p>
          </article>
          <article className="rounded-[18px] border border-[#dbe6f2] bg-[#fbfdff] p-4">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.09em] text-[#7b8ca2]">Offer Window</p>
            <p className="mt-2 text-sm text-[#142132]">Buyer: <span className="font-semibold">{invite?.buyerLeadName || 'Prospect'}</span></p>
            <p className="mt-1 text-sm text-[#142132]">Expires: <span className="font-semibold">{formatDate(invite?.expiresAt)}</span></p>
            <p className="mt-1 text-sm text-[#142132]">Agent: <span className="font-semibold">{invite?.agentName || 'Assigned agent'}</span></p>
          </article>
        </div>
      </section>

      {counterPendingBuyer ? (
        <section className="rounded-[20px] border border-[#f5dbb0] bg-[#fff8ec] px-4 py-3 text-sm text-[#8a4b08]">
          <div className="flex items-center gap-2">
            <Clock3 size={15} />
            Seller sent a counter offer. Submit a revised offer to respond.
          </div>
        </section>
      ) : null}

      {canonicalBanner ? (
        <section className={`rounded-[20px] px-4 py-3 text-sm ${
          canonicalBanner.tone === 'green'
            ? 'border border-[#cfe8dc] bg-[#edf9f0] text-[#17643a]'
            : canonicalBanner.tone === 'red'
              ? 'border border-[#f4d4d4] bg-[#fff5f5] text-[#b42318]'
              : 'border border-[#f5dbb0] bg-[#fff8ec] text-[#8a4b08]'
        }`}>
          {canonicalBanner.text}
        </section>
      ) : null}

      {errorMessage ? (
        <section className="rounded-[16px] border border-[#f4d4d4] bg-[#fff5f5] px-4 py-3 text-sm text-[#b42318]">{errorMessage}</section>
      ) : null}
      {successMessage ? (
        <section className="rounded-[16px] border border-[#d6ecd9] bg-[#edf9f0] px-4 py-3 text-sm text-[#1f7d44]">{successMessage}</section>
      ) : null}

      <form onSubmit={handleSubmitOffer} className="space-y-5">
        <section className="rounded-[24px] border border-[#e1e9f4] bg-white p-5 shadow-[0_14px_28px_rgba(15,23,42,0.07)]">
          <h2 className="text-[1rem] font-semibold text-[#142132]">Buyer Details</h2>
          <p className="mt-1 text-sm text-[#607387]">Confirm the contact details the agent and seller should use for this offer.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#2d445e]">Full name</span>
              <Field value={form.fullName} onChange={(event) => updateForm('fullName', event.target.value)} placeholder="Full legal name" />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#2d445e]">ID / Passport number</span>
              <Field value={form.idNumber} onChange={(event) => updateForm('idNumber', event.target.value)} placeholder="ID / passport number" />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#2d445e]">Email</span>
              <Field type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} placeholder="name@email.com" />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#2d445e]">Phone</span>
              <Field value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} placeholder="082..." />
            </label>
          </div>
        </section>

        <section className="rounded-[24px] border border-[#e1e9f4] bg-white p-5 shadow-[0_14px_28px_rgba(15,23,42,0.07)]">
          <h2 className="text-[1rem] font-semibold text-[#142132]">Offer Details</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#2d445e]">Offer amount</span>
              <Field type="number" min="0" step="1000" value={form.offerAmount} onChange={(event) => updateForm('offerAmount', event.target.value)} placeholder="2500000" />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#2d445e]">Deposit amount</span>
              <Field type="number" min="0" step="1000" value={form.depositAmount} onChange={(event) => updateForm('depositAmount', event.target.value)} placeholder="250000" />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#2d445e]">Finance type</span>
              <Field as="select" value={form.financeType} onChange={(event) => updateFinanceType(event.target.value)}>
                <option value="cash">Cash</option>
                <option value="bond">Bond</option>
                <option value="hybrid">Hybrid</option>
              </Field>
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#2d445e]">Offer expiry date</span>
              <Field type="date" value={form.expiryDate} onChange={(event) => updateForm('expiryDate', event.target.value)} />
            </label>
            {showHybridFinanceFields ? (
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[#2d445e]">Bond amount</span>
                <Field type="number" min="0" step="1000" value={form.bondAmount} onChange={(event) => updateForm('bondAmount', event.target.value)} placeholder="2000000" />
              </label>
            ) : null}
            {showHybridFinanceFields ? (
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[#2d445e]">Cash contribution</span>
                <Field type="number" min="0" step="1000" value={form.cashContribution} onChange={(event) => updateForm('cashContribution', event.target.value)} placeholder="500000" />
              </label>
            ) : null}
            {showBondAssistance ? (
              <label className="flex items-center gap-2 rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] px-3 py-3 text-sm text-[#35546c] md:col-span-2">
                <input type="checkbox" checked={form.needsBondAssistance} onChange={(event) => updateForm('needsBondAssistance', event.target.checked)} />
                Do you need help sorting out your bond?
              </label>
            ) : null}
            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-semibold text-[#2d445e]">Proof of funds / pre-approval URL (optional)</span>
              <Field value={form.proofOfFundsUrl} onChange={(event) => updateForm('proofOfFundsUrl', event.target.value)} placeholder="https://..." />
            </label>
          </div>
        </section>

        <section className="rounded-[24px] border border-[#e1e9f4] bg-white p-5 shadow-[0_14px_28px_rgba(15,23,42,0.07)]">
          <h2 className="text-[1rem] font-semibold text-[#142132]">Conditions</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-semibold text-[#2d445e]">Suspensive conditions</span>
              <Field as="textarea" rows={3} value={form.suspensiveConditions} onChange={(event) => updateForm('suspensiveConditions', event.target.value)} placeholder="Any conditions that must be met..." />
            </label>
            <label className="flex items-center gap-2 text-sm text-[#35546c]">
              <input type="checkbox" checked={form.subjectToSale} onChange={(event) => updateForm('subjectToSale', event.target.checked)} />
              Subject to sale
            </label>
            {form.subjectToSale ? (
              <>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Property being sold</span>
                  <Field value={form.subjectSaleProperty} onChange={(event) => updateForm('subjectSaleProperty', event.target.value)} placeholder="Address / property reference" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Estimated sale timeline</span>
                  <Field value={form.subjectSaleTimeline} onChange={(event) => updateForm('subjectSaleTimeline', event.target.value)} placeholder="e.g. 60 days" />
                </label>
                <label className="flex items-center gap-2 text-sm text-[#35546c]">
                  <input type="checkbox" checked={form.subjectSaleAgentInvolved} onChange={(event) => updateForm('subjectSaleAgentInvolved', event.target.checked)} />
                  Existing agent involved in subject sale
                </label>
              </>
            ) : null}
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#2d445e]">When would you like to move in ideally?</span>
              <Field type="date" value={form.occupationDate} onChange={(event) => updateForm('occupationDate', event.target.value)} />
            </label>
            <label className="flex items-center gap-2 rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] px-3 py-3 text-sm text-[#35546c]">
              <input type="checkbox" checked={form.occupationalRent} onChange={(event) => updateForm('occupationalRent', event.target.checked)} />
              Occupational rent
            </label>
            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-semibold text-[#2d445e]">Included fixtures</span>
              <Field as="textarea" rows={2} value={form.includedFixtures} onChange={(event) => updateForm('includedFixtures', event.target.value)} placeholder="List included fixtures..." />
            </label>
            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-semibold text-[#2d445e]">Excluded fixtures</span>
              <Field as="textarea" rows={2} value={form.excludedFixtures} onChange={(event) => updateForm('excludedFixtures', event.target.value)} placeholder="List excluded fixtures..." />
            </label>
            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-semibold text-[#2d445e]">Special conditions</span>
              <Field as="textarea" rows={3} value={form.specialConditions} onChange={(event) => updateForm('specialConditions', event.target.value)} placeholder="Additional terms or requests..." />
            </label>
          </div>
        </section>

        <section className="rounded-[24px] border border-[#e1e9f4] bg-white p-5 shadow-[0_14px_28px_rgba(15,23,42,0.07)]">
          <p className="text-sm leading-6 text-[#35546c]">
            Your agent will review the offer before sending it to the seller. Formal legal documentation will follow if the offer is accepted.
          </p>
          <div className="mt-5 flex justify-end">
            <Button type="submit" disabled={submitting || (context?.source === 'canonical' && !canSubmitCanonicalOffer)}>
              {submitting ? 'Submitting offer...' : counterPendingBuyer ? 'Submit Revised Offer' : 'Submit Offer'}
            </Button>
          </div>
        </section>
      </form>

      {(latestOffer || canonicalOffer) ? (
        <section className="rounded-[20px] border border-[#dce6f2] bg-white p-4">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-[#7b8ca2]">Latest Offer Record</p>
          <p className="mt-2 text-sm text-[#142132]">
            Status: <span className="font-semibold">{statusLabel(canonicalLifecycle?.effectiveStatus || normalizeOfferWorkflowStatus(latestOffer?.status || canonicalOffer?.status || 'submitted'))}</span>
          </p>
          <p className="mt-1 text-sm text-[#607387]">Submitted: {formatDate(latestOffer?.submittedAt || canonicalOffer?.submittedAt || canonicalOffer?.createdAt)}</p>
          <p className="mt-1 text-sm text-[#607387]">Offer amount: {formatCurrency(latestOffer?.offer?.offerAmount || canonicalOffer?.offerAmount)}</p>
        </section>
      ) : null}

    </main>
  )
}

export default BuyerOfferSubmission
