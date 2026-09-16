import { CheckCircle2, KeyRound, Loader2, Mail, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'

const normalise = (value) => String(value || '').trim()

export default function RentalClientPortalActivationPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const [sessionUser, setSessionUser] = useState(null)
  const [form, setForm] = useState({ fullName: '', email: '', password: '' })
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    async function loadSession() {
      if (!isSupabaseConfigured || !supabase) {
        if (active) { setError('Client account access is not configured. Please contact your rentals team.'); setBusy(false) }
        return
      }
      const { data } = await supabase.auth.getSession()
      if (!active) return
      const user = data.session?.user || null
      setSessionUser(user)
      setForm((current) => ({ ...current, email: user?.email || current.email, fullName: user?.user_metadata?.full_name || current.fullName }))
      setBusy(false)
    }
    void loadSession()
    return () => { active = false }
  }, [])

  const accept = async (event) => {
    event.preventDefault()
    if (!supabase) return
    try {
      setBusy(true); setError(''); setNotice('')
      let user = sessionUser
      if (!user) {
        if (!normalise(form.fullName)) throw new Error('Please enter your name.')
        if (!normalise(form.email)) throw new Error('Please enter your email address.')
        if (normalise(form.password).length < 8) throw new Error('Choose a password with at least 8 characters.')
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: normalise(form.email), password: form.password,
          options: { emailRedirectTo: `${window.location.origin}/rentals/portal/activate/${token}`, data: { full_name: normalise(form.fullName) } },
        })
        if (signUpError) throw signUpError
        user = data.user || null
        if (!data.session) {
          setNotice('Check your inbox to confirm your email, then reopen this invitation link to finish activating your account.')
          return
        }
        setSessionUser(user)
      }
      const { error: acceptError } = await supabase.rpc('rental_client_portal_accept_invitation', { p_token: token })
      if (acceptError) throw acceptError
      navigate('/rentals/portal', { replace: true })
    } catch (cause) {
      setError(cause?.message || 'We could not activate this invitation.')
    } finally { setBusy(false) }
  }

  return <main className="grid min-h-screen place-items-center bg-[#f4f7fb] p-5 text-[#152b45]">
    <section className="w-full max-w-[510px] rounded-[28px] border border-[#dce6f1] bg-white p-7 shadow-[0_24px_70px_rgba(26,49,78,.12)] sm:p-9">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e8f7ef] text-[#087443]"><ShieldCheck size={24} /></div>
      <p className="mt-6 text-xs font-bold uppercase tracking-[.15em] text-[#31705a]">Arch9 rentals</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em]">Activate your client account</h1>
      <p className="mt-3 text-sm leading-6 text-[#65758a]">This secure invitation gives you access to the rental relationships your agency has shared with you.</p>
      {sessionUser ? <div className="mt-6 rounded-2xl border border-[#d5eadf] bg-[#f1fbf5] p-4 text-sm text-[#176842]"><CheckCircle2 className="mr-2 inline" size={16} />Signed in as <strong>{sessionUser.email}</strong>. Confirm access to continue.</div> : <form onSubmit={accept} className="mt-6 grid gap-4"><label className="text-sm font-semibold">Full name<input value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} className="mt-2 w-full rounded-xl border border-[#d7e1eb] px-3 py-3 font-normal outline-none focus:border-[#2b8b62]" autoComplete="name" /></label><label className="text-sm font-semibold">Email address<input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="mt-2 w-full rounded-xl border border-[#d7e1eb] px-3 py-3 font-normal outline-none focus:border-[#2b8b62]" autoComplete="email" /></label><label className="text-sm font-semibold">Choose a password<input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} className="mt-2 w-full rounded-xl border border-[#d7e1eb] px-3 py-3 font-normal outline-none focus:border-[#2b8b62]" autoComplete="new-password" /></label></form>}
      {error ? <p className="mt-5 rounded-xl border border-[#f2c6c6] bg-[#fff6f6] p-3 text-sm text-[#a42a2a]">{error}</p> : null}
      {notice ? <p className="mt-5 rounded-xl border border-[#c8e8d4] bg-[#f0fbf4] p-3 text-sm text-[#176842]">{notice}</p> : null}
      <button onClick={accept} disabled={busy || !token} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#087443] px-4 text-sm font-semibold text-white disabled:opacity-60">{busy ? <Loader2 size={17} className="animate-spin" /> : <KeyRound size={17} />}{sessionUser ? 'Confirm access' : 'Create account and activate'}</button>
      <p className="mt-5 text-center text-sm text-[#65758a]"><Mail className="mr-1 inline" size={15} />Already have an account? <Link className="font-semibold text-[#087443]" to="/rentals/portal">Sign in to your portal</Link></p>
    </section>
  </main>
}
