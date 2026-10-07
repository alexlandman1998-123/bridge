import { useState } from 'react'
import { CalendarDays, CheckCircle2, Home, ShieldCheck } from 'lucide-react'
import { invokeEdgeFunction } from '../../lib/supabaseClient'
import { TENANT_INTAKE_QUESTIONS } from '../../services/rentals/rentalTenantIntakeModel.js'

const inputClass = 'w-full min-h-12 rounded-xl border border-[#cddfd9] bg-white px-3 py-2 text-sm text-[#183e35] outline-none focus:border-[#287961] focus:ring-2 focus:ring-[#287961]/20'
const emptySlot = () => ({ date: '', startTime: '', endTime: '' })

export default function TenantQualificationPage({ token, session: initialSession }) {
  const [session, setSession] = useState(initialSession)
  const [answers, setAnswers] = useState(() => Object.fromEntries(TENANT_INTAKE_QUESTIONS.map(({ key }) => [key, initialSession.response?.tenantQualification?.[key] ?? ''])))
  const [slots, setSlots] = useState([emptySlot()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const closed = ['submitted', 'expired', 'revoked'].includes(session.status)
  const update = (index, key, value) => setSlots((previous) => previous.map((slot, i) => i === index ? { ...slot, [key]: value } : slot))

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (slots.some((slot) => !slot.date || !slot.startTime || !slot.endTime || slot.endTime <= slot.startTime)) {
      setError('Each viewing option needs a date and an end time after the start time.')
      return
    }
    setBusy(true)
    try {
      const { data, error: requestError } = await invokeEdgeFunction('buyer-viewing-preferences', { body: {
        action: 'submit', token, qualificationAnswers: answers,
        availabilitySlots: slots,
        timezone: 'Africa/Johannesburg',
      } })
      if (requestError || data?.error) throw requestError || new Error(data.error)
      if (data?.session?.status !== 'submitted') throw new Error('Your details were not saved. Please retry.')
      setSession(data.session)
    } catch (failure) {
      setError(failure?.message || 'Your details could not be saved. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="min-h-screen bg-[#f2f7f4] px-4 py-6 text-[#183e35] sm:px-6 sm:py-10">
    <div className="mx-auto max-w-3xl">
      <header className="overflow-hidden rounded-3xl bg-[#163e34] p-6 text-white sm:p-9">
        {session.organisationLogoLightUrl || session.organisationLogoUrl ? <img src={session.organisationLogoLightUrl || session.organisationLogoUrl} alt={session.organisationName || 'Agency'} className="mb-6 max-h-12 max-w-[210px] object-contain" /> : <p className="mb-6 text-sm font-semibold tracking-wide !text-white">{session.organisationName || 'Arch9'}</p>}
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#addbc6]">Rental enquiry · Tenant qualification</p>
        <h1 className="mt-3 max-w-xl text-3xl font-semibold leading-tight !text-white sm:text-4xl">Let’s find your next rental home.</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-[#d3e8df]">Tell us what you need, then share a suitable viewing time. {session.agentName || 'Your rental agent'} will review your answers and confirm the next step.</p>
        <div className="mt-6 flex flex-wrap gap-3 text-xs font-medium text-[#d3e8df]">
          <span className="rounded-full border border-white/20 px-3 py-2">01 Your requirements</span><span className="rounded-full border border-white/20 px-3 py-2">02 Your household</span><span className="rounded-full border border-white/20 px-3 py-2">03 Viewing times</span>
        </div>
      </header>
      {closed ? <section className="mt-6 rounded-3xl border border-[#d5e4dc] bg-white p-7">
        <CheckCircle2 className="text-[#287961]" aria-hidden="true" />
        <h2 className="mt-3 text-2xl font-semibold">{session.status === 'submitted' ? 'Thank you, your rental details are received.' : 'This qualification link is closed.'}</h2>
        <p className="mt-3 text-sm leading-6">{session.status === 'submitted' ? 'Your agent has your tenant qualification and viewing request. They will contact you to confirm a viewing; your preferred time is not a booked appointment yet.' : 'Contact your rental agent for a new link.'}</p>
        {session.agentEmail ? <a className="mt-4 inline-block underline" href={`mailto:${session.agentEmail}`}>Contact your agent</a> : null}
      </section> : <form onSubmit={submit} className="mt-6 grid gap-5">
        {session.properties?.length ? <section className="rounded-2xl border border-[#d5e4dc] bg-white p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#287961]"><Home size={16} aria-hidden="true" /> Your rental enquiry</p>
          {session.properties.map((property) => <p key={property.id} className="mt-2 font-semibold">{property.title}</p>)}
        </section> : null}
        <section className="rounded-3xl border border-[#d5e4dc] bg-white p-5 sm:p-7">
          <h2 className="text-xl font-semibold">Tenant qualification</h2>
          <p className="mt-2 text-sm leading-6 text-[#5b746b]">A few details help your agent find a suitable rental. You can answer No to screening consent; submitting this form does not approve an application.</p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {TENANT_INTAKE_QUESTIONS.map((question) => <label key={question.key} className={`grid content-start gap-2 ${question.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
              <span className="text-sm font-semibold">{question.question}{question.key === 'additionalNotes' ? ' (optional)' : ''}</span>
              {question.options ? <select required value={answers[question.key]} onChange={(event) => setAnswers((previous) => ({ ...previous, [question.key]: event.target.value }))} className={inputClass}>
                <option value="">Choose an answer</option>{question.options.map((option) => <option key={option}>{option}</option>)}
              </select> : question.type === 'textarea' ? <textarea rows={3} maxLength={1200} value={answers[question.key]} onChange={(event) => setAnswers((previous) => ({ ...previous, [question.key]: event.target.value }))} className={inputClass} />
                : <input required type={question.type || 'text'} min={question.type === 'number' ? 1 : undefined} step={question.key === 'monthlyBudget' ? '0.01' : question.type === 'number' ? 1 : undefined} maxLength={1200} value={answers[question.key]} onChange={(event) => setAnswers((previous) => ({ ...previous, [question.key]: event.target.value }))} className={inputClass} />}
            </label>)}
          </div>
        </section>
        <section className="rounded-3xl border border-[#d5e4dc] bg-white p-5 sm:p-7">
          <h2 className="flex items-center gap-2 text-xl font-semibold"><CalendarDays size={21} aria-hidden="true" /> Preferred viewing times</h2>
          <p className="mt-2 text-sm leading-6 text-[#5b746b]">Choose one to three options in South African time. Your agent will confirm availability with the landlord.</p>
          <div className="mt-5 grid gap-4">{slots.map((slot, index) => <fieldset key={index} className="rounded-2xl bg-[#f2f7f4] p-4">
            <legend className="px-2 text-sm font-semibold">Option {index + 1}</legend>
            <div className="grid gap-3 sm:grid-cols-3">{[['date', 'Date', 'date'], ['startTime', 'From', 'time'], ['endTime', 'Until', 'time']].map(([key, label, type]) => <label key={key} className="grid gap-2 text-sm">{label}<input required type={type} aria-label={`${label} for option ${index + 1}`} value={slot[key]} onChange={(event) => update(index, key, event.target.value)} className={inputClass} /></label>)}</div>
            {index > 0 ? <button type="button" className="mt-3 text-sm underline" onClick={() => setSlots((previous) => previous.filter((_, i) => i !== index))}>Remove option {index + 1}</button> : null}
          </fieldset>)}</div>
          {slots.length < 3 ? <button type="button" className="mt-4 text-sm font-semibold underline" onClick={() => setSlots((previous) => [...previous, emptySlot()])}>Add another viewing option</button> : null}
        </section>
        {error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
        <button disabled={busy} className="min-h-14 rounded-2xl bg-[#163e34] px-5 py-3 font-semibold text-white disabled:opacity-60">{busy ? 'Sending your details…' : 'Send qualification and viewing request'}</button>
        <p className="mb-4 flex items-start gap-2 text-xs leading-5 text-[#5b746b]"><ShieldCheck size={16} className="shrink-0" aria-hidden="true" /> Your answers are shared with your rental agency to process your enquiry.</p>
      </form>}
    </div>
  </main>
}
