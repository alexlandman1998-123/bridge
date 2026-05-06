import { AlertTriangle, Building2, CheckCircle2, Clock3, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
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

function BuyerOfferSubmission() {
  const { token = '' } = useParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [verificationMethod, setVerificationMethod] = useState('email')
  const [generatedOtp, setGeneratedOtp] = useState('')
  const [otpInput, setOtpInput] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpVerified, setOtpVerified] = useState(false)
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
    proofOfFundsUrl: '',
    suspensiveConditions: '',
    subjectToSale: false,
    subjectSaleProperty: '',
    subjectSaleTimeline: '',
    subjectSaleAgentInvolved: false,
    occupationDate: '',
    occupationalRent: '',
    includedFixtures: '',
    excludedFixtures: '',
    specialConditions: '',
    expiryDate: '',
    acknowledgeSellerReview: false,
    acknowledgeLegalDisclaimer: false,
    acknowledgeInfoAccuracy: false,
  })

  const context = useMemo(() => getOfferInviteContext(token), [token, refreshKey])
  const listing = context?.listing || null
  const invite = context?.invite || null
  const existingOffers = Array.isArray(context?.offers) ? context.offers : []
  const latestOffer = existingOffers
    .slice()
    .sort((left, right) => new Date(right?.submittedAt || 0) - new Date(left?.submittedAt || 0))[0] || null
  const latestStatus = normalizeOfferWorkflowStatus(latestOffer?.status || '')
  const counterPendingBuyer = latestStatus === OFFER_WORKFLOW_STATUS.BUYER_REVIEW_COUNTER || latestStatus === OFFER_WORKFLOW_STATUS.COUNTERED

  function updateForm(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  function handleSendOtp() {
    setErrorMessage('')
    const target = verificationMethod === 'email' ? form.email : form.phone
    if (!String(target || '').trim()) {
      setErrorMessage(`Add your ${verificationMethod === 'email' ? 'email address' : 'mobile number'} first.`)
      return
    }
    const otp = String(Math.floor(100000 + Math.random() * 900000))
    setGeneratedOtp(otp)
    setOtpSent(true)
    setOtpVerified(false)
    setSuccessMessage(`Verification code sent via ${verificationMethod}. Demo code: ${otp}`)
  }

  function handleVerifyOtp() {
    setErrorMessage('')
    if (!otpSent) {
      setErrorMessage('Send a verification code first.')
      return
    }
    if (String(otpInput || '').trim() !== String(generatedOtp || '').trim()) {
      setErrorMessage('Verification code is incorrect.')
      return
    }
    setOtpVerified(true)
    setSuccessMessage('Verification successful. You can now submit your offer.')
  }

  async function handleSubmitOffer(event) {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')
    if (!otpVerified) {
      setErrorMessage('Verify your email or phone number before submitting.')
      return
    }
    if (!form.acknowledgeSellerReview || !form.acknowledgeLegalDisclaimer || !form.acknowledgeInfoAccuracy) {
      setErrorMessage('Confirm all required declarations before submitting.')
      return
    }

    try {
      setSubmitting(true)
      submitBuyerOffer({
        token,
        mode: counterPendingBuyer ? 'counter_response' : 'new',
        submission: {
          ...form,
          verification: {
            verified: true,
            method: verificationMethod,
          },
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

      {errorMessage ? (
        <section className="rounded-[16px] border border-[#f4d4d4] bg-[#fff5f5] px-4 py-3 text-sm text-[#b42318]">{errorMessage}</section>
      ) : null}
      {successMessage ? (
        <section className="rounded-[16px] border border-[#d6ecd9] bg-[#edf9f0] px-4 py-3 text-sm text-[#1f7d44]">{successMessage}</section>
      ) : null}

      <form onSubmit={handleSubmitOffer} className="space-y-5">
        <section className="rounded-[24px] border border-[#e1e9f4] bg-white p-5 shadow-[0_14px_28px_rgba(15,23,42,0.07)]">
          <h2 className="text-[1rem] font-semibold text-[#142132]">Buyer Verification</h2>
          <p className="mt-1 text-sm text-[#607387]">Verify your contact details before final offer submission.</p>
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
          <div className="mt-4 grid gap-3 rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#2d445e]">Verification method</span>
              <Field as="select" value={verificationMethod} onChange={(event) => setVerificationMethod(event.target.value)}>
                <option value="email">Email OTP</option>
                <option value="phone">Phone OTP</option>
              </Field>
            </label>
            <Button type="button" variant="secondary" onClick={handleSendOtp}>Send OTP</Button>
            <Field value={otpInput} onChange={(event) => setOtpInput(event.target.value)} placeholder="Enter OTP" />
            <Button type="button" onClick={handleVerifyOtp} disabled={!otpSent}>Verify</Button>
          </div>
          {otpVerified ? (
            <p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#1f7d44]">
              <CheckCircle2 size={14} />
              Verification completed
            </p>
          ) : null}
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
              <Field as="select" value={form.financeType} onChange={(event) => updateForm('financeType', event.target.value)}>
                <option value="cash">Cash</option>
                <option value="bond">Bond</option>
                <option value="hybrid">Hybrid</option>
              </Field>
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#2d445e]">Offer expiry date</span>
              <Field type="date" value={form.expiryDate} onChange={(event) => updateForm('expiryDate', event.target.value)} />
            </label>
            {form.financeType !== 'cash' ? (
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[#2d445e]">Bond amount</span>
                <Field type="number" min="0" step="1000" value={form.bondAmount} onChange={(event) => updateForm('bondAmount', event.target.value)} placeholder="2000000" />
              </label>
            ) : null}
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#2d445e]">Cash contribution</span>
              <Field type="number" min="0" step="1000" value={form.cashContribution} onChange={(event) => updateForm('cashContribution', event.target.value)} placeholder="500000" />
            </label>
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
              <span className="text-sm font-semibold text-[#2d445e]">Occupation date</span>
              <Field type="date" value={form.occupationDate} onChange={(event) => updateForm('occupationDate', event.target.value)} />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#2d445e]">Occupational rent</span>
              <Field value={form.occupationalRent} onChange={(event) => updateForm('occupationalRent', event.target.value)} placeholder="Optional amount/details" />
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
          <h2 className="text-[1rem] font-semibold text-[#142132]">Declarations</h2>
          <div className="mt-3 space-y-2 text-sm text-[#35546c]">
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={form.acknowledgeSellerReview} onChange={(event) => updateForm('acknowledgeSellerReview', event.target.checked)} />
              <span>I understand this offer is subject to seller review.</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={form.acknowledgeLegalDisclaimer} onChange={(event) => updateForm('acknowledgeLegalDisclaimer', event.target.checked)} />
              <span>I understand this does not replace formal legal documentation.</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={form.acknowledgeInfoAccuracy} onChange={(event) => updateForm('acknowledgeInfoAccuracy', event.target.checked)} />
              <span>I confirm the information provided is accurate.</span>
            </label>
          </div>
          <div className="mt-5 flex justify-end">
            <Button type="submit" disabled={submitting}>{submitting ? 'Submitting offer...' : 'Submit Offer'}</Button>
          </div>
        </section>
      </form>

      {latestOffer ? (
        <section className="rounded-[20px] border border-[#dce6f2] bg-white p-4">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-[#7b8ca2]">Latest Offer Record</p>
          <p className="mt-2 text-sm text-[#142132]">
            Status: <span className="font-semibold">{statusLabel(normalizeOfferWorkflowStatus(latestOffer?.status || 'submitted'))}</span>
          </p>
          <p className="mt-1 text-sm text-[#607387]">Submitted: {formatDate(latestOffer?.submittedAt)}</p>
          <p className="mt-1 text-sm text-[#607387]">Offer amount: {formatCurrency(latestOffer?.offer?.offerAmount)}</p>
        </section>
      ) : null}

      <section className="rounded-[16px] border border-[#dbe6f2] bg-[#f7fbff] px-4 py-3 text-xs text-[#5f738a]">
        Demo mode: OTP delivery is simulated for this environment.
      </section>
    </main>
  )
}

export default BuyerOfferSubmission
