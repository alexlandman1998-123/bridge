import { useEffect, useState } from 'react'
import { CalendarDays, CheckCircle2, Clock3, MapPin, UsersRound } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

function formatDate(value, timezone, options) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? 'To be confirmed' : new Intl.DateTimeFormat('en-ZA', { timeZone: timezone || 'Africa/Johannesburg', ...options }).format(date)
}

export default function MarketingEventRsvpPage() {
  const { token = '' } = useParams()
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [values, setValues] = useState({ name: '', email: '', phone: '', guests: '1', note: '' })
  const update = (field) => (input) => setValues((current) => ({ ...current, [field]: input.target.value }))

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        if (!isSupabaseConfigured || !supabase) throw new Error('RSVP is unavailable right now.')
        const { data, error: rpcError } = await supabase.rpc('get_marketing_event_rsvp', { p_token: token })
        if (rpcError) throw rpcError
        if (!data?.[0]) throw new Error('This RSVP link is invalid, expired, or unavailable.')
        if (!cancelled) setEvent(data[0])
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Could not load this event.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [token])

  async function submit(input) {
    input.preventDefault()
    setError('')
    try {
      const { error: rpcError } = await supabase.rpc('submit_marketing_event_rsvp', { p_token: token, p_full_name: values.name, p_email: values.email, p_mobile: values.phone, p_guest_count: Number(values.guests), p_note: values.note })
      if (rpcError) throw rpcError
      setSubmitted(true)
    } catch (submitError) {
      setError(submitError.message || 'Could not save your RSVP.')
    }
  }

  if (loading || !event) return <main className="min-h-screen bg-[#f3f7f5] px-4 py-12 text-[#193141]"><section className="mx-auto max-w-lg rounded-[24px] border border-[#dbe7df] bg-white p-7 text-center shadow-[0_18px_45px_rgba(15,55,39,0.08)]"><h1 className="text-xl font-semibold">{loading ? 'Loading event details…' : 'This RSVP link is unavailable'}</h1><p className="mt-2 text-sm text-[#687d88]">{error || 'Please wait a moment.'}</p></section></main>

  return <main className="min-h-screen bg-[#f3f7f5] px-4 py-8 text-[#193141] sm:py-12"><section className="mx-auto grid max-w-4xl overflow-hidden rounded-[28px] border border-[#dbe7df] bg-white shadow-[0_24px_60px_rgba(15,55,39,0.1)] md:grid-cols-[.95fr_1.05fr]"><aside className="relative min-h-[260px] overflow-hidden bg-[#173b39] p-7 text-white"><img className="absolute inset-0 h-full w-full object-cover opacity-45" src={event.image_url || ''} alt="" /><div className="absolute inset-0 bg-gradient-to-t from-[#102d2b] via-[#173b39]/45 to-transparent" /><div className="relative flex h-full flex-col justify-end"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b9efd4]">{event.event_type === 'launch' ? 'Launch RSVP' : 'Show Day RSVP'}</p><h1 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.04em]">{event.title}</h1><p className="mt-3 flex items-center gap-2 text-sm text-[#e5f4ed]"><MapPin size={15} /> {event.address || event.location}</p><div className="mt-5 grid gap-2 text-sm text-[#e5f4ed]"><span className="flex items-center gap-2"><CalendarDays size={15} /> {formatDate(event.starts_at, event.timezone, { day: 'numeric', month: 'long', year: 'numeric' })}</span><span className="flex items-center gap-2"><Clock3 size={15} /> {formatDate(event.starts_at, event.timezone, { hour: '2-digit', minute: '2-digit', hour12: false })}</span></div></div></aside><div className="p-6 sm:p-8"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#4b8c6a]">Reserve your place</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-[#183143]">Will you be joining us?</h2><p className="mt-2 text-sm leading-6 text-[#687d88]">Please leave your details and the event team will confirm your attendance.</p>{submitted ? <div className="mt-6 rounded-[16px] border border-[#cce7d5] bg-[#effaf3] p-5 text-sm text-[#24683f]"><CheckCircle2 className="mb-2" size={22} /><strong className="block text-base">You’re on the list.</strong><span>Thank you—we’ll be in touch with the event details.</span></div> : <form className="mt-6 grid gap-4" onSubmit={submit}><label className="grid gap-1.5 text-sm font-semibold text-[#2a4754]">Full name<input required value={values.name} onChange={update('name')} autoComplete="name" className="rounded-[12px] border border-[#d6e3df] px-3 py-2.5 font-normal" /></label><label className="grid gap-1.5 text-sm font-semibold text-[#2a4754]">Mobile number<input required value={values.phone} onChange={update('phone')} autoComplete="tel" className="rounded-[12px] border border-[#d6e3df] px-3 py-2.5 font-normal" /></label><label className="grid gap-1.5 text-sm font-semibold text-[#2a4754]">Email address<input required type="email" value={values.email} onChange={update('email')} autoComplete="email" className="rounded-[12px] border border-[#d6e3df] px-3 py-2.5 font-normal" /></label><label className="grid gap-1.5 text-sm font-semibold text-[#2a4754]"><span className="flex items-center gap-1.5"><UsersRound size={15} /> Guests attending</span><select value={values.guests} onChange={update('guests')} className="rounded-[12px] border border-[#d6e3df] px-3 py-2.5 font-normal"><option value="1">Just me</option><option value="2">2 people</option><option value="3">3 people</option><option value="4">4 people</option></select></label><label className="grid gap-1.5 text-sm font-semibold text-[#2a4754]">Anything we should know? <span className="font-normal text-[#7c8f96]">(optional)</span><textarea value={values.note} onChange={update('note')} rows="3" className="resize-none rounded-[12px] border border-[#d6e3df] px-3 py-2.5 font-normal" /></label>{error ? <p className="text-sm text-[#a33c33]">{error}</p> : null}<button className="rounded-[12px] bg-[#167a55] px-4 py-3 text-sm font-bold text-white" type="submit">Confirm RSVP</button><p className="text-xs leading-5 text-[#7b8c94]">Your details are used only to manage this event and follow up on your interest.</p></form>}</div></section></main>
}
