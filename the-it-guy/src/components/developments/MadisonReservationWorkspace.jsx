import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import { madisonDeadline } from '../../core/developments/madisonReservations.js'

const emptySettings = { enabled: false, account_holder: '', bank_name: '', account_number: '', branch_code: '', proof_email: '', notification_email: '', refund_terms: '' }
const fields = [['account_holder', 'Trust account holder'], ['bank_name', 'Bank'], ['account_number', 'Account number'], ['branch_code', 'Branch code'], ['proof_email', 'Proof-of-payment email'], ['notification_email', 'Samlin notification email']]
export default function MadisonReservationWorkspace({ developmentId, onChanged }) {
  const [settings, setSettings] = useState(emptySettings)
  const [rows, setRows] = useState([])
  const [emails, setEmails] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [review, setReview] = useState(null)
  const [reference, setReference] = useState('')
  const [cleared, setCleared] = useState(false)
  const load = useCallback(async () => {
    const results = await Promise.all([
      supabase.from('madison_reservation_settings').select('*').eq('development_id', developmentId).maybeSingle(),
      supabase.from('madison_reservations').select('*,unit:units(unit_number)').eq('development_id', developmentId).order('created_at', { ascending: false }).limit(100),
    ])
    for (const result of results) if (result.error) throw result.error
    const reservations = results[1].data || []
    const delivery = reservations.length ? await supabase.from('madison_reservation_emails').select('id,reservation_id,kind,state,provider_id').in('reservation_id', reservations.map(row => row.id)) : { data: [], error: null }
    if (delivery.error) throw delivery.error
    setSettings({ ...emptySettings, ...results[0].data }); setRows(reservations); setEmails(delivery.data || [])
  }, [developmentId])
  useEffect(() => {
    let active = true
    load().catch(() => active && setError('Reservation controls are unavailable. Check that the Madison reservation migration is installed.')).finally(() => active && setLoading(false))
    return () => { active = false }
  }, [load])
  const perform = async work => {
    if (saving) return
    setSaving(true); setError(''); setNotice('')
    try { await work(); await load(); onChanged?.() } catch (failure) { setError(failure.message || 'The change could not be saved.') } finally { setSaving(false) }
  }
  const act = (row, action) => perform(async () => {
    const { error: failure } = await supabase.rpc('madison_manage_reservation', { p_id: row.id, p_action: action, p_bank_reference: reference.trim() })
    if (failure) throw failure
    setReview(null); setReference(''); setCleared(false)
    setNotice(action === 'confirm' ? 'Deposit confirmed. The buyer confirmation email is queued.' : 'Hold released. The buyer notification is queued.')
  })
  return <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5" aria-label="Madison Place reservations">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Madison Place reservations</h2><p className="mt-1 text-sm text-slate-600">48-hour holds · R10,000 fully refundable deposit · Tuckers Attorneys trust account</p></div><button type="button" disabled={saving || loading} onClick={() => void perform(async () => {})} className="min-h-11 rounded border px-4">Refresh reservations</button></div>
    {loading ? <p role="status">Loading reservations…</p> : null}
    {error ? <p role="alert" className="mt-3 text-red-800">{error}</p> : null}
    {notice ? <p role="status" className="mt-3">{notice}</p> : null}
    {!loading ? <>
      <details className="mt-4"><summary className="cursor-pointer font-medium">Trust payment details and activation · {settings.enabled ? 'Requests enabled' : 'Requests disabled'}</summary>
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void perform(async () => {
          const { error: failure } = await supabase.rpc('madison_save_reservation_settings', { p_development_id: developmentId, p_settings: settings })
          if (failure) throw failure
          setNotice('Reservation settings saved.')
        }) }}>
          <p className="text-sm sm:col-span-2">Enter confirmed Tuckers Attorneys trust details. Before enabling requests, confirm the email sender and automatic expiry/email jobs are active. No banking details are prefilled.</p>
          {fields.map(([key, label]) => <label key={key} className="grid gap-1 text-sm">{label}<input disabled={saving} type={key.endsWith('email') ? 'email' : 'text'} maxLength={254} className="min-h-11 rounded border px-3" value={settings[key]} onChange={event => setSettings(current => ({ ...current, [key]: event.target.value }))} /></label>)}
          <label className="grid gap-1 text-sm sm:col-span-2">Reservation and refund terms<textarea disabled={saving} rows={4} maxLength={4000} className="rounded border p-3" value={settings.refund_terms} onChange={event => setSettings(current => ({ ...current, refund_terms: event.target.value }))} /></label>
          <label className="flex items-center gap-3 text-sm sm:col-span-2"><input disabled={saving} type="checkbox" checked={settings.enabled} onChange={event => setSettings(current => ({ ...current, enabled: event.target.checked }))} />Enable online reservation requests for Madison Place</label>
          <button disabled={saving} className="min-h-11 rounded bg-slate-900 px-4 text-white sm:col-span-2">{saving ? 'Saving…' : 'Save reservation settings'}</button>
        </form>
      </details>
      <p className="mt-5 text-sm">Confirm only after checking that the full R10,000 has cleared into trust. A proof-of-payment email alone is insufficient. Expired holds require a fresh availability review.</p>
      {!rows.length ? <p className="mt-4 text-sm text-slate-600">No website reservation requests yet.</p> : <div className="mt-4 grid gap-3">{rows.map(row => {
        const expired = row.state === 'awaiting_deposit' && Date.parse(row.expires_at) <= Date.now()
        const pending = row.state === 'awaiting_deposit' && !expired
        const delivery = emails.filter(item => item.reservation_id === row.id)
        return <article key={row.id} className="rounded-xl border p-4">
          <div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">Unit {row.unit?.unit_number || "—"} · {row.payment_reference} · {row.buyer_name}</h3><p className="text-sm">{row.buyer_email} · {row.buyer_phone}</p><p className="mt-1 text-sm">{expired ? 'Expired — awaiting automatic release' : ({ awaiting_deposit: 'Awaiting deposit', confirmed: 'Deposit confirmed · Reserved', expired: 'Hold expired', released: 'Hold released', converted: 'Continued to sale' })[row.state]} · Hold deadline: {madisonDeadline(row.expires_at)}</p>{row.confirmed_at ? <p className="text-sm">Confirmed {madisonDeadline(row.confirmed_at)} · Receipt: {row.bank_reference}</p> : null}</div>
            {pending ? <div className="flex gap-2"><button type="button" disabled={saving} className="min-h-11 rounded border px-3" onClick={() => { setReview({ id: row.id, action: 'confirm' }); setReference(''); setCleared(false) }}>Review deposit</button><button type="button" disabled={saving} className="min-h-11 rounded border px-3" onClick={() => setReview({ id: row.id, action: 'release' })}>Release hold</button></div> : null}
          </div>
          <p className="mt-2 text-xs text-slate-600">Email delivery: {delivery.map(item => `${({ buyer_request: 'Payment instructions', staff_request: 'Samlin alert', confirmed: 'Buyer confirmation', expired: 'Expiry notice', released: 'Release notice' })[item.kind]} — ${item.state === 'sent' ? 'accepted by email provider' : item.state}`).join(' · ') || 'Queue unavailable'}</p>
          {delivery.some(item => ['failed', 'review'].includes(item.state)) ? <p className="mt-1 text-sm text-amber-800">Email needs attention. Check delivery before contacting the buyer; the hold remains recorded.</p> : null}
          {review?.id === row.id ? <div className="mt-4 grid gap-3 rounded bg-slate-50 p-3">
            {review.action === 'confirm' ? <><label className="grid gap-1 text-sm">Trust bank receipt reference<input disabled={saving} className="min-h-11 rounded border px-3" value={reference} onChange={event => setReference(event.target.value)} maxLength={200} /></label><label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={cleared} onChange={event => setCleared(event.target.checked)} />I verified that the full R10,000 has cleared into the Tuckers Attorneys trust account.</label></> : <p>Release this unpaid hold and notify the buyer? Review any incoming payment separately.</p>}
            <div className="flex gap-3"><button type="button" disabled={saving || (review.action === 'confirm' && (!cleared || reference.trim().length < 3))} onClick={() => void act(row, review.action)} className="min-h-11 rounded bg-slate-900 px-4 text-white disabled:opacity-50">{review.action === 'confirm' ? 'Confirm deposit received' : 'Confirm release'}</button><button type="button" disabled={saving} onClick={() => setReview(null)}>Cancel</button></div>
          </div> : null}
        </article>
      })}</div>}
    </> : null}
  </section>
}
