import { AlertTriangle, Home, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import {
  getOfferPortalSessionContext,
  submitOfferPortalOffer,
} from '../lib/buyerLifecycleService'

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

function propertyLabel(item = {}) {
  const listing = item.listing || {}
  return [listing.listingTitle, listing.propertyAddress, listing.suburb || listing.city]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' - ') || 'Viewed property'
}

const initialForm = {
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
  occupationDate: '',
  occupationalRent: false,
  includedFixtures: '',
  excludedFixtures: '',
  specialConditions: '',
  expiryDate: '',
  acknowledgeSellerReview: false,
  acknowledgeLegalDisclaimer: false,
  acknowledgeInfoAccuracy: false,
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
  const submittedCount = properties.reduce((count, item) => count + (Array.isArray(item.offers) ? item.offers.length : 0), 0)
  const financeType = String(form.financeType || '').toLowerCase()
  const showHybridFinanceFields = financeType === 'hybrid'
  const showBondAssistance = ['bond', 'hybrid'].includes(financeType)

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

  function handleSelectProperty(listingId) {
    setSelectedListingId(listingId)
    setErrorMessage('')
    setSuccessMessage('')
  }

  async function handleSubmitOffer(event) {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')
    if (!selectedListingId) {
      setErrorMessage('Select a property before submitting an offer.')
      return
    }
    if (!form.acknowledgeSellerReview || !form.acknowledgeLegalDisclaimer || !form.acknowledgeInfoAccuracy) {
      setErrorMessage('Confirm all required declarations before submitting.')
      return
    }

    try {
      setSubmitting(true)
      await submitOfferPortalOffer({
        token,
        listingId: selectedListingId,
        submission: {
          ...form,
          selectedProperty: propertyLabel(selectedProperty),
        },
      })
      setSuccessMessage('Offer submitted successfully. The agent will review and forward it to the seller.')
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to submit offer right now.')
    } finally {
      setSubmitting(false)
    }
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
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#6e8198]">Bridge offer portal</p>
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
                const latestOffer = (Array.isArray(item.offers) ? item.offers : [])[0]
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
                            Offer {statusLabel(latestOffer.status)} - {formatCurrency(latestOffer.offerAmount)}
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
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-[#334155]">
                Offer amount
                <Field className="mt-1" type="number" min="0" step="1000" value={form.offerAmount} onChange={(event) => updateForm('offerAmount', event.target.value)} required />
              </label>
              <label className="text-sm font-semibold text-[#334155]">
                Deposit amount
                <Field className="mt-1" type="number" min="0" step="1000" value={form.depositAmount} onChange={(event) => updateForm('depositAmount', event.target.value)} />
              </label>
              <label className="text-sm font-semibold text-[#334155]">
                Finance type
                <Field as="select" className="mt-1" value={form.financeType} onChange={(event) => updateFinanceType(event.target.value)}>
                  <option value="bond">Bond</option>
                  <option value="cash">Cash</option>
                  <option value="hybrid">Hybrid</option>
                </Field>
              </label>
              <label className="text-sm font-semibold text-[#334155]">
                Offer expiry
                <Field className="mt-1" type="date" value={form.expiryDate} onChange={(event) => updateForm('expiryDate', event.target.value)} />
              </label>
              {showHybridFinanceFields ? (
                <label className="text-sm font-semibold text-[#334155]">
                  Bond amount
                  <Field className="mt-1" type="number" min="0" step="1000" value={form.bondAmount} onChange={(event) => updateForm('bondAmount', event.target.value)} />
                </label>
              ) : null}
              {showHybridFinanceFields ? (
                <label className="text-sm font-semibold text-[#334155]">
                  Cash contribution
                  <Field className="mt-1" type="number" min="0" step="1000" value={form.cashContribution} onChange={(event) => updateForm('cashContribution', event.target.value)} />
                </label>
              ) : null}
              {showBondAssistance ? (
                <label className="flex items-center gap-2 rounded-2xl border border-[#e1e9f3] bg-[#f9fbfd] px-3 py-3 text-sm text-[#44566c] sm:col-span-2">
                  <input type="checkbox" className="shrink-0" checked={form.needsBondAssistance} onChange={(event) => updateForm('needsBondAssistance', event.target.checked)} />
                  <span>Do you need help sorting out your bond?</span>
                </label>
              ) : null}
            </div>

            <label className="text-sm font-semibold text-[#334155]">
              Suspensive conditions
              <Field as="textarea" className="mt-1" value={form.suspensiveConditions} onChange={(event) => updateForm('suspensiveConditions', event.target.value)} />
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
            </div>

            <label className="flex items-start gap-2 text-sm text-[#44566c]">
              <input type="checkbox" className="mt-1" checked={form.subjectToSale} onChange={(event) => updateForm('subjectToSale', event.target.checked)} />
              <span>This offer is subject to the sale of another property.</span>
            </label>

            {form.subjectToSale ? (
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

            <label className="text-sm font-semibold text-[#334155]">
              Special conditions
              <Field as="textarea" className="mt-1" value={form.specialConditions} onChange={(event) => updateForm('specialConditions', event.target.value)} />
            </label>

            <div className="space-y-2 rounded-2xl border border-[#e1e9f3] bg-white p-4">
              <label className="flex items-start gap-2 text-sm text-[#44566c]">
                <input type="checkbox" className="mt-1" checked={form.acknowledgeSellerReview} onChange={(event) => updateForm('acknowledgeSellerReview', event.target.checked)} />
                <span>I understand this offer will be reviewed by the agent and seller.</span>
              </label>
              <label className="flex items-start gap-2 text-sm text-[#44566c]">
                <input type="checkbox" className="mt-1" checked={form.acknowledgeLegalDisclaimer} onChange={(event) => updateForm('acknowledgeLegalDisclaimer', event.target.checked)} />
                <span>I understand this submission is not a signed deed of sale.</span>
              </label>
              <label className="flex items-start gap-2 text-sm text-[#44566c]">
                <input type="checkbox" className="mt-1" checked={form.acknowledgeInfoAccuracy} onChange={(event) => updateForm('acknowledgeInfoAccuracy', event.target.checked)} />
                <span>I confirm the information above is accurate.</span>
              </label>
            </div>

            <Button type="submit" className="w-full justify-center" disabled={submitting || !selectedListingId || !properties.length}>
              {submitting ? 'Submitting offer...' : 'Submit offer'}
            </Button>
          </form>
        </section>
      </div>
    </main>
  )
}

export default PostViewingOfferPortal
