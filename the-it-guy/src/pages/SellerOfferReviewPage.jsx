import { AlertTriangle, CheckCircle2, Clock3, Home, Mail, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import { getSellerOfferReviewContext, submitSellerOfferDecision } from '../lib/buyerLifecycleService'
import { invokeEdgeFunction } from '../lib/supabaseClient'

const MONEY_FORMATTER = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})
const BUYER_LIFECYCLE_REFRESH_STORAGE_KEY = 'bridge:buyer-lifecycle-refresh:v1'
const BUYER_LIFECYCLE_REFRESH_EVENT = 'bridge:buyer-lifecycle-refresh'

function toText(value, fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function toMoney(value) {
  const amount = Number(value || 0)
  return Number.isFinite(amount) && amount > 0 ? MONEY_FORMATTER.format(amount) : 'Not supplied'
}

function formatDate(value, fallback = 'Not set') {
  const parsed = Date.parse(value || '')
  if (Number.isNaN(parsed)) return fallback
  return new Date(parsed).toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(value, fallback = 'Not set') {
  const parsed = Date.parse(value || '')
  if (Number.isNaN(parsed)) return fallback
  return new Date(parsed).toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toYesNo(value, fallback = 'No') {
  if (value === true) return 'Yes'
  if (String(value || '').trim().toLowerCase() === 'yes') return 'Yes'
  if (String(value || '').trim() === '') return fallback
  return 'No'
}

function normalizeCounterAmount(value) {
  const digits = String(value || '').replace(/[^\d.]/g, '')
  if (!digits) return null
  const amount = Number(digits)
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

function buildCounterTermsPayload(counterTerms = {}) {
  const nextTerms = {
    counterOfferAmount: normalizeCounterAmount(counterTerms.counterOfferAmount),
    counterDepositAmount: normalizeCounterAmount(counterTerms.counterDepositAmount),
    counterOccupationDate: toText(counterTerms.counterOccupationDate),
    counterExpiryDate: toText(counterTerms.counterExpiryDate),
    counterExpiryTime: toText(counterTerms.counterExpiryTime),
    counterSpecialTerms: toText(counterTerms.counterSpecialTerms),
  }
  return Object.fromEntries(Object.entries(nextTerms).filter(([, value]) => value !== null && value !== ''))
}

function listingLabel(listing = {}) {
  const details = listing.property_details && typeof listing.property_details === 'object' ? listing.property_details : {}
  const marketing = listing.marketing && typeof listing.marketing === 'object' ? listing.marketing : {}
  return toText(
    listing.listing_title ||
      listing.title ||
      marketing.title ||
      details.title ||
      listing.property_address ||
      details.address ||
      'Your property',
  )
}

function contactName(contact = {}, fallback = 'Buyer') {
  return toText(
    contact.full_name ||
      contact.display_name ||
      contact.name ||
      [contact.first_name, contact.last_name].filter(Boolean).join(' '),
    fallback,
  )
}

function EmptyState({ title, body }) {
  return (
    <main className="min-h-screen bg-[#f6f8fb] px-4 py-10">
      <section className="mx-auto max-w-[760px] rounded-[28px] border border-[#dfe7f0] bg-white p-8 text-center shadow-[0_20px_60px_rgba(15,33,55,0.08)]">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff7ed] text-[#c05621]">
          <AlertTriangle size={24} />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.04em] text-[#102235]">{title}</h1>
        <p className="mx-auto mt-2 max-w-[520px] text-sm leading-6 text-[#60758c]">{body}</p>
      </section>
    </main>
  )
}

function publishBuyerLifecycleRefresh(payload = {}) {
  if (typeof window === 'undefined') return
  const eventPayload = {
    ...payload,
    source: payload.source || 'seller_offer_review',
    timestamp: new Date().toISOString(),
  }
  try {
    window.localStorage.setItem(BUYER_LIFECYCLE_REFRESH_STORAGE_KEY, JSON.stringify(eventPayload))
  } catch {
    // Non-critical: the current page still shows the persisted result.
  }
  window.dispatchEvent(new CustomEvent(BUYER_LIFECYCLE_REFRESH_EVENT, { detail: eventPayload }))
}

function SellerOfferReviewPage() {
  const { token } = useParams()
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [decisionNotes, setDecisionNotes] = useState('')
  const [decisionSaving, setDecisionSaving] = useState('')
  const [decisionMessage, setDecisionMessage] = useState('')
  const [decisionWarning, setDecisionWarning] = useState('')
  const [counterTerms, setCounterTerms] = useState({
    counterOfferAmount: '',
    counterDepositAmount: '',
    counterOccupationDate: '',
    counterExpiryDate: '',
    counterExpiryTime: '',
    counterSpecialTerms: '',
  })

  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(() => {
        if (cancelled) return null
        setLoading(true)
        setError('')
        return getSellerOfferReviewContext(token)
      })
      .then((payload) => {
        if (!cancelled && payload) setContext(payload)
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError?.message || 'Unable to load this offer.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const offer = context?.offer || {}
  const conditions = offer.conditions || {}
  const listing = context?.listing || {}
  const buyer = context?.buyer || {}
  const agent = context?.agent || {}
  const sessionMetadata = context?.session?.metadata && typeof context.session.metadata === 'object' ? context.session.metadata : {}
  const propertyTitle = listingLabel(listing)
  const buyerName = toText(conditions.buyerName, contactName(buyer, 'Buyer'))
  const sellerStatus = toText(context?.session?.status, 'viewed').replaceAll('_', ' ')
  const sellerName = toText(conditions.sellerReviewRecipientName || conditions.sellerName, contactName(context?.seller || {}, 'Seller'))
  const isDecided = ['accepted', 'rejected', 'countered'].includes(toText(context?.session?.status).toLowerCase())
  const purchaserLabel = toText(conditions.purchaserType || conditions.buyerType, 'individual').replaceAll('_', ' ')
  const expiryLabel = conditions.expiryTime
    ? `${formatDate(offer.expiryDate)} at ${conditions.expiryTime}`
    : formatDate(offer.expiryDate)
  const sellerReviewDeliveryModeLabel = toText(sessionMetadata.deliveryModeLabel, 'Seller review')
  const authorityWarnings = Array.isArray(sessionMetadata.warnings) ? sessionMetadata.warnings : []
  const authorityStatus = toText(sessionMetadata.authorityStatus, 'ready')

  async function sendDecisionNotification(payload = {}, recipient = {}) {
    const to = toText(recipient.email)
    if (!to) {
      return {
        attempted: false,
        sent: false,
        recipientRole: recipient.role,
        reason: `${recipient.label || recipient.role || 'Recipient'} email is missing.`,
      }
    }
    try {
      const response = await invokeEdgeFunction('send-email', {
        body: {
          type: 'offer_decision_notification',
          to,
          organisationId: toText(payload.organisationId || offer.organisationId),
          leadId: toText(payload.leadId || offer.buyerLeadId),
          listingId: toText(payload.listingId || offer.listingId),
          offerId: toText(payload.offerId || offer.id),
          transactionId: toText(payload.transactionId || offer.transactionId || offer.transaction_id),
          recipientName: recipient.name,
          recipientRole: recipient.role,
          decision: payload.decision,
          propertyTitle: payload.propertyTitle || propertyTitle,
          buyerName: payload.buyerName || buyerName,
          sellerName: payload.sellerName || sellerName,
          agentName: payload.agentName || contactName(agent, 'Assigned agent'),
          offerAmount: payload.offerAmount || toMoney(offer.offerAmount),
          decisionNotes: payload.decisionNotes,
          nextStep: recipient.nextStep,
        },
      })
      const responseError = response?.error || response?.data?.error
      if (responseError) {
        return {
          attempted: true,
          sent: false,
          recipientRole: recipient.role,
          to,
          reason: typeof responseError === 'string' ? responseError : responseError?.message || 'Email send failed.',
        }
      }
      return { attempted: true, sent: true, recipientRole: recipient.role, to }
    } catch (notificationError) {
      return {
        attempted: true,
        sent: false,
        recipientRole: recipient.role,
        to,
        reason: notificationError?.message || 'Email send failed.',
      }
    }
  }

  async function sendBuyerOnboardingEmail(transactionId = '') {
    const scopedTransactionId = toText(transactionId)
    if (!scopedTransactionId) {
      return {
        attempted: false,
        sent: false,
        recipientRole: 'buyer',
        reason: 'Transaction was not created, so buyer onboarding could not be sent.',
      }
    }
    try {
      const response = await invokeEdgeFunction('send-email', {
        body: {
          type: 'client_onboarding',
          transactionId: scopedTransactionId,
          source: 'seller_accepted_offer',
        },
      })
      const responseError = response?.error || response?.data?.error
      if (responseError) {
        return {
          attempted: true,
          sent: false,
          recipientRole: 'buyer',
          reason: typeof responseError === 'string' ? responseError : responseError?.message || 'Buyer onboarding email failed.',
        }
      }
      return {
        attempted: true,
        sent: true,
        recipientRole: 'buyer',
        to: response?.data?.recipientEmail || '',
      }
    } catch (onboardingError) {
      return {
        attempted: true,
        sent: false,
        recipientRole: 'buyer',
        reason: onboardingError?.message || 'Buyer onboarding email failed.',
      }
    }
  }

  async function handleSellerDecision(decision) {
    if (decisionSaving || isDecided) return
    setDecisionSaving(decision)
    setDecisionMessage('')
    setDecisionWarning('')
    setError('')
    try {
      const counterPayload = decision === 'countered' ? buildCounterTermsPayload(counterTerms) : null
      if (decision === 'countered' && !Object.keys(counterPayload || {}).length && !toText(decisionNotes)) {
        throw new Error('Add at least one counter term or a note for your agent before requesting a counter.')
      }
      const result = await submitSellerOfferDecision({
        token,
        decision,
        notes: decisionNotes,
        counterTerms: counterPayload,
      })
      const nextContext = { ...(context || {}), ...(result || {}) }
      const nextOffer = nextContext.offer || offer
      const nextConditions = nextOffer.conditions || conditions
      const nextBuyer = nextContext.buyer || buyer
      const nextAgent = nextContext.agent || agent
      const nextSeller = nextContext.seller || context?.seller || {}
      const nextTransactionId = toText(nextContext.transactionId || nextOffer.transactionId || nextOffer.transaction_id)
      publishBuyerLifecycleRefresh({
        organisationId: toText(nextOffer.organisationId),
        leadId: toText(nextOffer.buyerLeadId),
        offerId: toText(nextOffer.id),
        listingId: toText(nextOffer.listingId),
        transactionId: nextTransactionId,
        decision,
      })
      const nextPropertyTitle = listingLabel(nextContext.listing || listing)
      const nextBuyerName = toText(nextConditions.buyerName, contactName(nextBuyer, buyerName))
      const nextSellerName = toText(
        nextConditions.sellerReviewRecipientName || nextConditions.sellerName,
        contactName(nextSeller, sellerName),
      )
      const notificationPayload = {
        decision,
        propertyTitle: nextPropertyTitle,
        buyerName: nextBuyerName,
        sellerName: nextSellerName,
        agentName: contactName(nextAgent, 'Assigned agent'),
        offerAmount: toMoney(nextOffer.offerAmount),
        decisionNotes,
      }
      const notificationResults = await Promise.all([
        sendDecisionNotification(notificationPayload, {
          email: toText(nextAgent.email),
          name: contactName(nextAgent, 'Agent'),
          role: 'agent',
          label: 'Agent',
          nextStep: decision === 'accepted'
            ? 'Create the transaction from the accepted offer and send buyer onboarding.'
            : 'Open the buyer lead to manage the next negotiation step.',
        }),
        decision === 'accepted'
          ? nextTransactionId
            ? sendBuyerOnboardingEmail(nextTransactionId)
            : sendDecisionNotification(notificationPayload, {
                email: toText(nextConditions.buyerEmail || nextBuyer.email),
                name: nextBuyerName,
                role: 'buyer',
                label: 'Buyer',
                nextStep: 'Your agent will confirm the accepted offer and send the buyer onboarding link.',
              })
          : null,
      ])
      setContext(nextContext)
      const notificationFailures = notificationResults
        .filter(Boolean)
        .filter((notificationResult) => !notificationResult.sent)
      if (notificationFailures.length) {
        setDecisionWarning(
          `Decision saved, but ${notificationFailures
            .map((notificationResult) => notificationResult.reason || `${notificationResult.recipientRole || 'recipient'} notification failed`)
            .join(' ')}`,
        )
      }
      setDecisionMessage(
        decision === 'accepted'
          ? nextTransactionId
            ? 'Offer accepted. The transaction was created and buyer onboarding was triggered.'
            : 'Offer accepted. The canonical offer and buyer lead have been updated.'
          : decision === 'countered'
            ? 'Counter request submitted. Your agent will continue the negotiation with the updated terms.'
            : 'Offer rejected. The canonical offer and buyer lead have been updated.',
      )
    } catch (decisionError) {
      setError(decisionError?.message || 'Unable to submit this decision.')
    } finally {
      setDecisionSaving('')
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f6f8fb] px-4 py-10">
        <section className="mx-auto max-w-[980px] rounded-[28px] border border-[#dfe7f0] bg-white p-8 shadow-[0_20px_60px_rgba(15,33,55,0.08)]">
          <p className="text-sm font-semibold text-[#60758c]">Loading offer...</p>
        </section>
      </main>
    )
  }

  if (error) return <EmptyState title="Offer unavailable" body={error} />
  if (!context?.ok) {
    const reason = context?.reason === 'expired'
      ? 'This seller review link has expired. Ask your agent to send a fresh offer review link.'
      : 'This offer review link is no longer available.'
    return <EmptyState title="Offer unavailable" body={reason} />
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-4 py-8 text-[#102235]">
      <section className="mx-auto max-w-[1180px] space-y-6">
        <header className="rounded-[30px] border border-[#dfe7f0] bg-white p-6 shadow-[0_20px_60px_rgba(15,33,55,0.08)] sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#76889c]">Seller Offer Review</p>
              <h1 className="mt-3 max-w-[780px] text-3xl font-semibold tracking-[-0.05em] text-[#0f2137] sm:text-5xl">
                {propertyTitle}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm font-medium text-[#60758c]">
                <span className="inline-flex items-center gap-1">
                  <Home size={15} />
                  {toText(listing.property_address || listing.address || listing.suburb, 'Property details')}
                </span>
                <span className="hidden text-[#b3c0ce] sm:inline">/</span>
                <span>Offer from {buyerName}</span>
              </div>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#d9e7f5] bg-[#f3f8fd] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#2c5a89]">
              <Clock3 size={14} />
              {sellerStatus}
            </span>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <article className="rounded-[26px] border border-[#dfe7f0] bg-white p-6 shadow-[0_14px_44px_rgba(15,33,55,0.06)]">
            <div className="flex flex-col gap-4 border-b border-[#edf2f7] pb-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#76889c]">Offer Amount</p>
                <p className="mt-2 text-4xl font-semibold tracking-[-0.06em] text-[#0f2137]">{toMoney(offer.offerAmount)}</p>
              </div>
              <div className="rounded-2xl bg-[#f7fafc] px-4 py-3 text-sm text-[#60758c]">
                Submitted <strong className="text-[#102235]">{formatDate(offer.buyerSubmittedAt || offer.submittedAt, 'Awaiting submission date')}</strong>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {[
                ['Buyer', buyerName],
                ['Purchaser Structure', purchaserLabel],
                ['Finance Type', toText(offer.financeType, 'To be confirmed')],
                ['Deposit', toMoney(offer.depositAmount)],
                ['Deposit Due', formatDate(conditions.depositDueDate)],
                ['Cash Component', toMoney(offer.cashComponent)],
                ['Bond Component', toMoney(offer.bondComponent)],
                ['Bond Approval Deadline', formatDate(conditions.bondApprovalDeadline)],
                ['Occupation Date', formatDate(conditions.occupationDate)],
                ['Occupational Rent', conditions.occupationalRent ? `${toMoney(conditions.occupationalRentAmount)} (${toYesNo(conditions.occupationalRent)})` : 'No'],
                ['Subject To Sale', toYesNo(conditions.subjectToSale)],
                ['Offer Expires', expiryLabel],
              ].map(([label, value]) => (
                <div key={label} className="border-b border-[#edf2f7] pb-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#76889c]">{label}</p>
                  <p className="mt-1 text-base font-semibold text-[#14283d]">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 space-y-4">
              <section className="grid gap-4 md:grid-cols-2">
                <div>
                  <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#102235]">Funding Evidence</h2>
                  <div className="mt-2 rounded-2xl bg-[#f7fafc] p-4 text-sm leading-6 text-[#40566d]">
                    <p><span className="font-semibold text-[#102235]">Proof reference:</span> {toText(conditions.proofOfFundsReference, 'Not supplied')}</p>
                    <p className="mt-1"><span className="font-semibold text-[#102235]">Pre-approval:</span> {toText(conditions.preApprovalReference, 'Not supplied')}</p>
                    {conditions.purchaserEntityName ? (
                      <p className="mt-1"><span className="font-semibold text-[#102235]">Entity name:</span> {conditions.purchaserEntityName}</p>
                    ) : null}
                  </div>
                </div>
                <div>
                  <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#102235]">Occupation & Sale Dependencies</h2>
                  <div className="mt-2 rounded-2xl bg-[#f7fafc] p-4 text-sm leading-6 text-[#40566d]">
                    <p><span className="font-semibold text-[#102235]">Subject sale property:</span> {toText(conditions.subjectSaleProperty, 'Not supplied')}</p>
                    <p className="mt-1"><span className="font-semibold text-[#102235]">Subject sale timeline:</span> {toText(conditions.subjectSaleTimeline, 'Not supplied')}</p>
                    <p className="mt-1"><span className="font-semibold text-[#102235]">Submitted:</span> {formatDateTime(offer.buyerSubmittedAt || offer.submittedAt)}</p>
                  </div>
                </div>
              </section>
              <section>
                <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#102235]">Conditions</h2>
                <p className="mt-2 rounded-2xl bg-[#f7fafc] p-4 text-sm leading-6 text-[#40566d]">
                  {toText(conditions.specialConditions || conditions.suspensiveConditions, 'No special conditions supplied.')}
                </p>
              </section>
              <section className="grid gap-4 md:grid-cols-2">
                <div>
                  <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#102235]">Included Fixtures</h2>
                  <p className="mt-2 rounded-2xl bg-[#f7fafc] p-4 text-sm leading-6 text-[#40566d]">
                    {toText(conditions.includedFixtures, 'No fixtures listed.')}
                  </p>
                </div>
                <div>
                  <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#102235]">Excluded Fixtures</h2>
                  <p className="mt-2 rounded-2xl bg-[#f7fafc] p-4 text-sm leading-6 text-[#40566d]">
                    {toText(conditions.excludedFixtures, 'No exclusions listed.')}
                  </p>
                </div>
              </section>
              {conditions.proofOfFundsUrl ? (
                <a
                  href={conditions.proofOfFundsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-[#dbe6f2] bg-white px-4 text-sm font-semibold text-[#12344f] transition hover:border-[#b9cadc]"
                >
                  Open supporting document
                </a>
              ) : null}
            </div>
          </article>

          <aside className="space-y-4">
            <section className="rounded-[24px] border border-[#dfe7f0] bg-white p-5 shadow-[0_14px_44px_rgba(15,33,55,0.06)]">
              <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#102235]">Seller Decision</h2>
              <p className="mt-2 text-sm leading-6 text-[#60758c]">
                Accept the offer, reject it, or request a counter. Your decision is recorded against the canonical offer.
              </p>
              <div className="mt-4 rounded-2xl border border-[#d9e7f5] bg-[#f7fbff] px-4 py-3 text-sm text-[#35546c]">
                <p className="font-semibold text-[#203a54]">Delivery Mode</p>
                <p className="mt-1">{sellerReviewDeliveryModeLabel}</p>
              </div>
              {authorityStatus !== 'ready' && authorityWarnings.length ? (
                <div className="mt-3 rounded-2xl border border-[#f5d6a8] bg-[#fff8ed] px-4 py-3 text-sm text-[#9a5b11]">
                  {authorityWarnings.join(' ')}
                </div>
              ) : null}
              {decisionMessage ? (
                <div className="mt-4 rounded-2xl border border-[#cde8d8] bg-[#effaf3] px-4 py-3 text-sm font-medium text-[#26724c]">
                  {decisionMessage}
                </div>
              ) : null}
              {decisionWarning ? (
                <div className="mt-3 rounded-2xl border border-[#f5d6a8] bg-[#fff8ed] px-4 py-3 text-sm font-medium text-[#9a5b11]">
                  {decisionWarning}
                </div>
              ) : null}
              {isDecided ? (
                <div className="mt-4 rounded-2xl border border-[#d9e7f5] bg-[#f3f8fd] px-4 py-3 text-sm font-medium text-[#2c5a89]">
                  This offer has already been {sellerStatus}.
                </div>
              ) : (
                <>
                  <label className="mt-4 block">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#76889c]">Decision Notes</span>
                    <textarea
                      value={decisionNotes}
                      onChange={(event) => setDecisionNotes(event.target.value)}
                      rows={4}
                      className="mt-2 w-full resize-none rounded-2xl border border-[#dfe7f0] bg-[#f8fafc] px-4 py-3 text-sm leading-6 text-[#102235] outline-none transition focus:border-[#9fb9d4] focus:bg-white"
                      placeholder="Optional note for your agent"
                    />
                  </label>
                  <div className="mt-4 rounded-2xl border border-[#e3ebf4] bg-[#fbfdff] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#76889c]">Counter Terms</p>
                    <div className="mt-3 grid gap-3">
                      <input
                        value={counterTerms.counterOfferAmount}
                        onChange={(event) => setCounterTerms((previous) => ({ ...previous, counterOfferAmount: event.target.value }))}
                        className="w-full rounded-2xl border border-[#dfe7f0] bg-white px-4 py-3 text-sm text-[#102235] outline-none transition focus:border-[#9fb9d4]"
                        placeholder="Counter purchase price"
                        inputMode="decimal"
                      />
                      <input
                        value={counterTerms.counterDepositAmount}
                        onChange={(event) => setCounterTerms((previous) => ({ ...previous, counterDepositAmount: event.target.value }))}
                        className="w-full rounded-2xl border border-[#dfe7f0] bg-white px-4 py-3 text-sm text-[#102235] outline-none transition focus:border-[#9fb9d4]"
                        placeholder="Counter deposit amount"
                        inputMode="decimal"
                      />
                      <input
                        type="date"
                        value={counterTerms.counterOccupationDate}
                        onChange={(event) => setCounterTerms((previous) => ({ ...previous, counterOccupationDate: event.target.value }))}
                        className="w-full rounded-2xl border border-[#dfe7f0] bg-white px-4 py-3 text-sm text-[#102235] outline-none transition focus:border-[#9fb9d4]"
                      />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input
                          type="date"
                          value={counterTerms.counterExpiryDate}
                          onChange={(event) => setCounterTerms((previous) => ({ ...previous, counterExpiryDate: event.target.value }))}
                          className="w-full rounded-2xl border border-[#dfe7f0] bg-white px-4 py-3 text-sm text-[#102235] outline-none transition focus:border-[#9fb9d4]"
                        />
                        <input
                          type="time"
                          value={counterTerms.counterExpiryTime}
                          onChange={(event) => setCounterTerms((previous) => ({ ...previous, counterExpiryTime: event.target.value }))}
                          className="w-full rounded-2xl border border-[#dfe7f0] bg-white px-4 py-3 text-sm text-[#102235] outline-none transition focus:border-[#9fb9d4]"
                        />
                      </div>
                      <textarea
                        value={counterTerms.counterSpecialTerms}
                        onChange={(event) => setCounterTerms((previous) => ({ ...previous, counterSpecialTerms: event.target.value }))}
                        rows={3}
                        className="w-full resize-none rounded-2xl border border-[#dfe7f0] bg-white px-4 py-3 text-sm leading-6 text-[#102235] outline-none transition focus:border-[#9fb9d4]"
                        placeholder="Specific changes the buyer should discuss with the agent"
                      />
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2">
                    <Button type="button" onClick={() => void handleSellerDecision('accepted')} disabled={Boolean(decisionSaving)}>
                      {decisionSaving === 'accepted' ? 'Accepting...' : 'Accept Offer'}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => void handleSellerDecision('countered')} disabled={Boolean(decisionSaving)}>
                      {decisionSaving === 'countered' ? 'Submitting...' : 'Request Counter'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="border-[#f1d0ca] text-[#9f3a2f] hover:bg-[#fff6f4]"
                      onClick={() => void handleSellerDecision('rejected')}
                      disabled={Boolean(decisionSaving)}
                    >
                      {decisionSaving === 'rejected' ? 'Rejecting...' : 'Reject Offer'}
                    </Button>
                  </div>
                </>
              )}
            </section>

            <section className="rounded-[24px] border border-[#dfe7f0] bg-white p-5 shadow-[0_14px_44px_rgba(15,33,55,0.06)]">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#effaf3] text-[#1f7d44]">
                <ShieldCheck size={20} />
              </span>
              <h2 className="mt-4 text-lg font-semibold tracking-[-0.03em] text-[#102235]">What happens next?</h2>
              <p className="mt-2 text-sm leading-6 text-[#60758c]">
                Your agent has routed this offer to you for review. Acceptance, rejection, and counter-offer decisions are handled by the next seller-decision step.
              </p>
            </section>

            <section className="rounded-[24px] border border-[#dfe7f0] bg-white p-5 shadow-[0_14px_44px_rgba(15,33,55,0.06)]">
              <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#102235]">Agent</h2>
              <p className="mt-2 text-sm font-semibold text-[#14283d]">{contactName(agent, 'Assigned agent')}</p>
              <p className="mt-1 text-sm text-[#60758c]">{toText(agent.email, 'No email on record')}</p>
              {agent.email ? (
                <Button type="button" className="mt-4 w-full" onClick={() => { window.location.href = `mailto:${agent.email}` }}>
                  <Mail size={15} />
                  Contact Agent
                </Button>
              ) : null}
            </section>

            <section className="rounded-[24px] border border-[#dfe7f0] bg-[#0f2137] p-5 text-white shadow-[0_14px_44px_rgba(15,33,55,0.12)]">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-[#64d9a8]" />
                <p className="text-sm leading-6 text-white/82">
                  Opening this link has marked the seller review as viewed so your agent can see that the offer reached you.
                </p>
              </div>
            </section>
          </aside>
        </section>
      </section>
    </main>
  )
}

export default SellerOfferReviewPage
