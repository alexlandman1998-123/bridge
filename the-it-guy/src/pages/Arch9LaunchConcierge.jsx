import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Handshake,
  Phone,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { submitLaunchEventLead, validateLaunchEventLead } from '../services/launchEventLeadService'

const INTEREST_OPTIONS = [
  { value: 'developer', label: 'Developer', detail: 'Projects, unit sales and portfolio visibility' },
  { value: 'agency', label: 'Agency', detail: 'Residential or mixed real estate operations' },
  { value: 'commercial', label: 'Commercial', detail: 'Leasing, sales, canvassing and mandates' },
  { value: 'attorney', label: 'Attorney', detail: 'Transfers, documents and matter coordination' },
  { value: 'bond_originator', label: 'Bond Originator', detail: 'Bond applications, banks and consultants' },
  { value: 'buyer_seller', label: 'Buyer / Seller', detail: 'A clearer property transaction journey' },
]

const TRUST_ITEMS = [
  'Private follow-up this week',
  'Curated around your business',
  'No account setup',
]

const EVENT_DATE_LABEL = '24 June 2026'

function cx(...classes) {
  return classes.filter(Boolean).join(' ')
}

function Arch9Mark() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-11 w-11 place-items-center rounded-[14px] bg-[#111827] text-sm font-black text-white shadow-[0_18px_36px_rgba(17,24,39,0.22)]">
        A9
      </div>
      <div>
        <p className="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-[#d97706]">Arch9 launch</p>
        <p className="font-display text-xl font-extrabold text-[#111827]">Private preview</p>
      </div>
    </div>
  )
}

function FieldError({ id, children }) {
  if (!children) return null
  return <p id={id} className="mt-2 text-sm font-semibold text-[#b42318]">{children}</p>
}

export default function Arch9LaunchConcierge() {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    company: '',
    interest: '',
    preferredWindow: '',
    note: '',
    preferredFollowUp: 'private_follow_up_this_week',
    website: '',
  })
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('idle')
  const [submitError, setSubmitError] = useState('')
  const [confirmation, setConfirmation] = useState(null)

  const selectedInterest = useMemo(
    () => INTEREST_OPTIONS.find((option) => option.value === form.interest) || null,
    [form.interest],
  )

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitError('')

    if (form.website) {
      setStatus('complete')
      setConfirmation({ source: 'filtered' })
      return
    }

    const nextErrors = validateLaunchEventLead(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setStatus('submitting')
    try {
      const result = await submitLaunchEventLead(form)
      setConfirmation(result)
      setStatus('complete')
    } catch (error) {
      setSubmitError(error?.message || 'Something went wrong. Please try again.')
      setStatus('idle')
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#111827]">
      <section className="relative isolate min-h-screen overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1800&q=84"
          alt=""
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(120deg,rgba(247,244,238,0.97)_0%,rgba(247,244,238,0.9)_42%,rgba(247,244,238,0.46)_100%)]" />

        <div className="mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 gap-8 px-5 py-5 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:px-8 lg:py-8">
          <div className="flex min-h-[42vh] flex-col justify-between gap-8 py-2 lg:min-h-[calc(100vh-4rem)] lg:py-4">
            <Arch9Mark />

            <div className="max-w-2xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#111827]/10 bg-white/72 px-4 py-2 text-sm font-bold text-[#2f5f50] shadow-sm backdrop-blur">
                <Sparkles className="h-4 w-4" />
                Preview access from the Arch9 launch, {EVENT_DATE_LABEL}
              </div>
              <h1 className="font-display text-[clamp(3rem,8vw,7.4rem)] font-black leading-[0.88] text-[#111827]">
                Scan now. Meet privately this week.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[#425466] sm:text-xl">
                Request a considered Arch9 follow-up after the event. Leave the details that help us prepare the right conversation, then we will contact you to arrange a time later in the week.
              </p>

              <div className="mt-8 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-3">
                {TRUST_ITEMS.map((item) => (
                  <div key={item} className="flex items-center gap-2 rounded-[8px] border border-white/70 bg-white/72 px-3 py-3 text-sm font-bold text-[#111827] shadow-sm backdrop-blur">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#1f7a5a]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid max-w-2xl grid-cols-3 gap-3">
              {[
                ['2 min', 'request'],
                ['1:1', 'private'],
                ['this week', 'follow-up'],
              ].map(([value, label]) => (
                <div key={label} className="rounded-[8px] border border-[#111827]/10 bg-white/70 p-4 shadow-sm backdrop-blur">
                  <p className="font-display text-2xl font-black text-[#111827]">{value}</p>
                  <p className="mt-1 text-xs font-bold uppercase text-[#6b7280]">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <section className="self-center rounded-[8px] border border-white/80 bg-white/88 p-4 shadow-[0_28px_70px_rgba(17,24,39,0.14)] backdrop-blur-xl sm:p-6 lg:p-8" aria-labelledby="launch-form-title">
            {status === 'complete' ? (
              <div className="grid min-h-[620px] content-center gap-7 text-center">
                <div className="mx-auto grid h-20 w-20 place-items-center rounded-[8px] bg-[#e8f6ef] text-[#1f7a5a]">
                  <Handshake className="h-10 w-10" />
                </div>
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-[#d97706]">You are on our list</p>
                  <h2 className="mt-3 font-display text-4xl font-black text-[#111827] sm:text-5xl">
                    Your private follow-up is reserved.
                  </h2>
                  <p className="mx-auto mt-4 max-w-md text-lg leading-8 text-[#425466]">
                    Thanks{form.name ? `, ${form.name.split(' ')[0]}` : ''}. We will review your details and contact you to arrange a focused Arch9 session later this week.
                  </p>
                </div>
                <div className="mx-auto w-full max-w-md rounded-[8px] border border-[#e5e7eb] bg-[#f9fafb] p-4 text-left">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6b7280]">Preferred follow-up</p>
                  <p className="mt-2 text-lg font-black text-[#111827]">{form.preferredWindow || 'Arrange with me after the event'}</p>
                  <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-[#6b7280]">Interested in</p>
                  <p className="mt-2 text-lg font-black text-[#111827]">{selectedInterest?.label || 'Arch9'}</p>
                </div>
                {confirmation?.source === 'local' ? (
                  <p className="mx-auto max-w-md rounded-[8px] border border-[#f5d58a] bg-[#fff8e7] px-4 py-3 text-sm font-semibold text-[#7c4a03]">
                    Saved on this device because the live database is not configured in this environment.
                  </p>
                ) : null}
                <button
                  type="button"
                  className="mx-auto inline-flex h-12 items-center justify-center rounded-[8px] border border-[#111827]/10 bg-white px-5 text-sm font-black text-[#111827] shadow-sm transition hover:-translate-y-0.5"
                  onClick={() => {
                    setStatus('idle')
                    setConfirmation(null)
                    setForm({
                      name: '',
                      phone: '',
                      email: '',
                      company: '',
                      interest: '',
                      preferredWindow: '',
                      note: '',
                      preferredFollowUp: 'private_follow_up_this_week',
                      website: '',
                    })
                  }}
                >
                  Add another person
                </button>
              </div>
            ) : (
              <form className="grid gap-5" onSubmit={handleSubmit}>
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-[#d97706]">Arch9 concierge</p>
                  <h2 id="launch-form-title" className="mt-2 font-display text-3xl font-black text-[#111827] sm:text-4xl">
                    Request a private follow-up.
                  </h2>
                  <p className="mt-3 text-base leading-7 text-[#536272]">
                    Share enough context for us to prepare a precise conversation, not a generic demo.
                  </p>
                </div>

                <div className="hidden">
                  <label htmlFor="website">Website</label>
                  <input
                    id="website"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={form.website}
                    onChange={(event) => updateField('website', event.target.value)}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-sm font-black text-[#111827]">
                      <UserRound className="h-4 w-4 text-[#1f7a5a]" />
                      Name
                    </span>
                    <input
                      className={cx(
                        'h-[52px] w-full rounded-[8px] border bg-white px-4 text-base font-semibold text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#1f7a5a] focus:ring-4 focus:ring-[#1f7a5a]/10',
                        errors.name ? 'border-[#b42318]' : 'border-[#d1d5db]',
                      )}
                      value={form.name}
                      onChange={(event) => updateField('name', event.target.value)}
                      placeholder="Your name"
                      autoComplete="name"
                      aria-invalid={Boolean(errors.name)}
                      aria-describedby={errors.name ? 'launch-name-error' : undefined}
                    />
                    <FieldError id="launch-name-error">{errors.name}</FieldError>
                  </label>

                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-sm font-black text-[#111827]">
                      <Phone className="h-4 w-4 text-[#d97706]" />
                      Phone
                    </span>
                    <input
                      className={cx(
                        'h-[52px] w-full rounded-[8px] border bg-white px-4 text-base font-semibold text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#1f7a5a] focus:ring-4 focus:ring-[#1f7a5a]/10',
                        errors.phone ? 'border-[#b42318]' : 'border-[#d1d5db]',
                      )}
                      value={form.phone}
                      onChange={(event) => updateField('phone', event.target.value)}
                      placeholder="Mobile number"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      aria-invalid={Boolean(errors.phone)}
                      aria-describedby={errors.phone ? 'launch-phone-error' : undefined}
                    />
                    <FieldError id="launch-phone-error">{errors.phone}</FieldError>
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 text-sm font-black text-[#111827]">Email</span>
                    <input
                      className="h-[52px] w-full rounded-[8px] border border-[#d1d5db] bg-white px-4 text-base font-semibold text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#1f7a5a] focus:ring-4 focus:ring-[#1f7a5a]/10"
                      value={form.email}
                      onChange={(event) => updateField('email', event.target.value)}
                      placeholder="you@company.co.za"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-sm font-black text-[#111827]">
                      <Building2 className="h-4 w-4 text-[#365c8d]" />
                      Company
                    </span>
                    <input
                      className="h-[52px] w-full rounded-[8px] border border-[#d1d5db] bg-white px-4 text-base font-semibold text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#1f7a5a] focus:ring-4 focus:ring-[#1f7a5a]/10"
                      value={form.company}
                      onChange={(event) => updateField('company', event.target.value)}
                      placeholder="Company or team"
                      autoComplete="organization"
                    />
                  </label>
                </div>

                <div>
                  <span className="mb-2 block text-sm font-black text-[#111827]">What best describes you?</span>
                  <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-describedby={errors.interest ? 'launch-interest-error' : undefined}>
                    {INTEREST_OPTIONS.map((option) => {
                      const selected = form.interest === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={cx(
                            'min-h-[88px] rounded-[8px] border p-3 text-left transition focus:outline-none focus:ring-4 focus:ring-[#1f7a5a]/10',
                            selected
                              ? 'border-[#1f7a5a] bg-[#e8f6ef] shadow-[0_14px_28px_rgba(31,122,90,0.13)]'
                              : 'border-[#d1d5db] bg-white hover:border-[#9ca3af]',
                          )}
                          role="radio"
                          aria-checked={selected}
                          onClick={() => updateField('interest', option.value)}
                        >
                          <span className="flex items-center justify-between gap-3">
                            <span className="font-black text-[#111827]">{option.label}</span>
                            <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-full border', selected ? 'border-[#1f7a5a] bg-[#1f7a5a] text-white' : 'border-[#cbd5e1]')}>
                              {selected ? <CheckCircle2 className="h-4 w-4" /> : null}
                            </span>
                          </span>
                          <span className="mt-2 block text-sm leading-5 text-[#536272]">{option.detail}</span>
                        </button>
                      )
                    })}
                  </div>
                  <FieldError id="launch-interest-error">{errors.interest}</FieldError>
                </div>

                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-black text-[#111827]">
                    <CalendarDays className="h-4 w-4 text-[#b45309]" />
                    Best time later this week
                  </span>
                  <input
                    className="h-[52px] w-full rounded-[8px] border border-[#d1d5db] bg-white px-4 text-base font-semibold text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#1f7a5a] focus:ring-4 focus:ring-[#1f7a5a]/10"
                    value={form.preferredWindow}
                    onChange={(event) => updateField('preferredWindow', event.target.value)}
                    placeholder="Example: Thursday morning, Friday afternoon"
                    autoComplete="off"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 text-sm font-black text-[#111827]">What should we prepare?</span>
                  <textarea
                    className="min-h-[96px] w-full resize-none rounded-[8px] border border-[#d1d5db] bg-white px-4 py-3 text-base font-semibold text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#1f7a5a] focus:ring-4 focus:ring-[#1f7a5a]/10"
                    value={form.note}
                    onChange={(event) => updateField('note', event.target.value)}
                    placeholder="Example: commercial pipeline, document flow, client portals, executive reporting..."
                    maxLength={420}
                  />
                </label>

                {submitError ? (
                  <p className="rounded-[8px] border border-[#f3b5ac] bg-[#fff1ef] px-4 py-3 text-sm font-semibold text-[#b42318]">
                    {submitError}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={status === 'submitting'}
                  className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-[8px] bg-[#111827] px-5 text-base font-black text-white shadow-[0_18px_34px_rgba(17,24,39,0.22)] transition hover:-translate-y-0.5 hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:opacity-65"
                >
                  {status === 'submitting' ? 'Sending...' : 'Request my private Arch9 session'}
                  <ArrowRight className="h-5 w-5" />
                </button>
              </form>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}
