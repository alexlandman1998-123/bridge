import { createElement, useCallback, useEffect, useId, useState } from 'react'
import { CalendarClock, CheckCircle2, ChevronDown, Clock3, Landmark, RefreshCw, Settings2, ShieldCheck } from 'lucide-react'
import Button from '../ui/Button'
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsPanelId = useId()
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
  const inputClass = 'min-h-11 w-full rounded-xl border border-[#dce5ee] bg-white px-3 text-sm text-[#243d56] outline-none transition focus:border-[#26966a] focus:ring-2 focus:ring-[#26966a]/15 disabled:opacity-60'
  return (
    <section className="overflow-hidden rounded-[24px] border border-[#dce6e1] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.045)]" aria-label="Madison Place reservations">
      <header className="flex flex-col gap-4 border-b border-[#e8eeeb] p-5 sm:p-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-[#d9eade] bg-[#eef8f2] text-[#1b7854]"><CalendarClock size={22} aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-[#58816d]">Website reservations</p>
            <div className="mt-1 flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-semibold tracking-[-0.03em] text-[#142132]">Madison Place reservations</h2>
              {!loading ? <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.65rem] font-semibold ${settings.enabled ? 'bg-[#eaf7ef] text-[#18724b]' : 'bg-[#f1f4f6] text-[#63768a]'}`}><span className={`h-1.5 w-1.5 rounded-full ${settings.enabled ? 'bg-[#2d9d67]' : 'bg-[#96a4b2]'}`} />{settings.enabled ? 'Requests enabled' : 'Requests disabled'}</span> : null}
            </div>
            <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Manage website holds and review cleared trust deposits.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 xl:shrink-0">
          <Button variant="secondary" size="sm" disabled={saving || loading} onClick={() => void perform(async () => {})}><RefreshCw size={15} aria-hidden="true" />Refresh reservations</Button>
          <Button variant="secondary" size="sm" disabled={loading} aria-expanded={settingsOpen} aria-controls={settingsPanelId} onClick={() => setSettingsOpen(open => !open)}><Settings2 size={15} aria-hidden="true" />Reservation settings<ChevronDown size={14} className={`transition-transform ${settingsOpen ? 'rotate-180' : ''}`} aria-hidden="true" /></Button>
        </div>
      </header>
      <div className="grid gap-3 border-b border-[#e8eeeb] bg-[#f8fbf9] px-5 py-4 sm:grid-cols-3 sm:px-6">
        {[
          [Clock3, 'Hold period', '48 hours'],
          [ShieldCheck, 'Fully refundable deposit', 'R10,000'],
          [Landmark, 'Trust account', 'Tuckers Attorneys'],
        ].map(([Icon, label, value]) => <div key={label} className="flex min-w-0 items-center gap-3">{createElement(Icon, { size: 18, className: 'shrink-0 text-[#55816c]', 'aria-hidden': true })}<div><p className="text-[0.68rem] font-medium text-[#718596]">{label}</p><p className="mt-0.5 text-sm font-semibold text-[#29483e]">{value}</p></div></div>)}
      </div>
      <div className="p-5 sm:p-6">
        {loading ? <p role="status" className="flex items-center gap-2 py-3 text-sm text-[#60758d]"><RefreshCw size={16} className="animate-spin" aria-hidden="true" />Loading reservations…</p> : null}
        {error ? <p role="alert" className="mb-4 rounded-xl border border-[#f0d4cd] bg-[#fff5f2] px-4 py-3 text-sm leading-6 text-[#a63c32]">{error}</p> : null}
        {notice ? <p role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-[#d4e9dc] bg-[#f0f9f3] px-4 py-3 text-sm text-[#226744]"><CheckCircle2 size={17} className="shrink-0" aria-hidden="true" />{notice}</p> : null}
        {!loading ? <>
          {settingsOpen ? <section id={settingsPanelId} aria-label="Reservation settings" className="mb-5 rounded-[18px] border border-[#dce8e1] bg-[#f8fbf9] p-4 sm:p-5">
            <h3 className="text-base font-semibold tracking-[-0.02em] text-[#203b32]">Trust payment details and activation</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#647c70]">Enter confirmed Tuckers Attorneys trust details. Before enabling requests, confirm the email sender and automatic expiry/email jobs are active. No banking details are prefilled.</p>
            <form className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" onSubmit={event => { event.preventDefault(); void perform(async () => {
              const { error: failure } = await supabase.rpc('madison_save_reservation_settings', { p_development_id: developmentId, p_settings: settings })
              if (failure) throw failure
              setNotice('Reservation settings saved.')
            }) }}>
              {fields.map(([key, label]) => <label key={key} className="grid min-w-0 gap-2 text-xs font-semibold text-[#4e6578]">{label}<input disabled={saving} type={key.endsWith('email') ? 'email' : 'text'} maxLength={254} className={inputClass} value={settings[key]} onChange={event => setSettings(current => ({ ...current, [key]: event.target.value }))} /></label>)}
              <label className="grid gap-2 text-xs font-semibold text-[#4e6578] sm:col-span-2 xl:col-span-3">Reservation and refund terms<textarea disabled={saving} rows={3} maxLength={4000} className={`${inputClass} py-3`} value={settings.refund_terms} onChange={event => setSettings(current => ({ ...current, refund_terms: event.target.value }))} /></label>
              <div className="flex flex-col gap-4 border-t border-[#dfe9e3] pt-4 sm:col-span-2 xl:col-span-3 xl:flex-row xl:items-center xl:justify-between">
                <label className="flex items-center gap-3 text-sm font-medium text-[#304d40]"><input disabled={saving} type="checkbox" className="h-4 w-4 shrink-0 accent-[#1b7854]" checked={settings.enabled} onChange={event => setSettings(current => ({ ...current, enabled: event.target.checked }))} />Enable online reservation requests for Madison Place</label>
                <Button type="submit" disabled={saving} className="self-start">{saving ? 'Saving…' : 'Save reservation settings'}</Button>
              </div>
            </form>
          </section> : null}
          <div className="flex items-start gap-3 rounded-[14px] border border-[#eee2c9] bg-[#fdfaf3] px-4 py-3.5">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#a78238]" aria-hidden="true" />
            <div><p className="text-xs font-semibold text-[#7b6438]">Verify cleared funds before confirming</p><p className="mt-1 text-xs leading-6 text-[#857458]">Confirm only after checking that the full R10,000 has cleared into trust. A proof-of-payment email alone is insufficient. Expired holds require a fresh availability review.</p></div>
          </div>
          {!rows.length ? <div className="mt-5 flex flex-col items-center rounded-[18px] border border-dashed border-[#dbe6e0] bg-[#fbfdfc] px-5 py-8 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#edf5f0] text-[#709883]"><CalendarClock size={22} aria-hidden="true" /></span>
            <p className="mt-3 text-sm font-semibold text-[#2e4b3f]">No website reservation requests yet.</p>
            <p className="mt-1 max-w-md text-xs leading-6 text-[#7c8f84]">New requests will appear here with their hold deadline and payment reference.</p>
          </div> : <div className="mt-5 grid gap-3">{rows.map(row => {
            const expired = row.state === 'awaiting_deposit' && Date.parse(row.expires_at) <= Date.now()
            const pending = row.state === 'awaiting_deposit' && !expired
            const delivery = emails.filter(item => item.reservation_id === row.id)
            const status = expired ? 'Expired — awaiting automatic release' : ({ awaiting_deposit: 'Awaiting deposit', confirmed: 'Deposit confirmed · Reserved', expired: 'Hold expired', released: 'Hold released', converted: 'Continued to sale' })[row.state]
            return <article key={row.id} className="overflow-hidden rounded-[18px] border border-[#dce5ee] bg-white p-4 sm:p-5">
              <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
                <div className="min-w-0"><span className={`mb-2 inline-flex rounded-full px-2.5 py-1 text-[0.65rem] font-semibold ${pending ? 'bg-[#fff5df] text-[#986e23]' : row.state === 'confirmed' ? 'bg-[#eaf7ef] text-[#18724b]' : 'bg-[#f1f4f7] text-[#64788d]'}`}>{status}</span><h3 className="break-words text-sm font-semibold text-[#243d56]">Unit {row.unit?.unit_number || '—'} · {row.payment_reference} · {row.buyer_name}</h3><p className="mt-1 break-words text-xs leading-6 text-[#718398]">{row.buyer_email} · {row.buyer_phone}</p><p className="mt-2 text-xs text-[#60758d]">Hold deadline: {madisonDeadline(row.expires_at)}</p>{row.confirmed_at ? <p className="mt-1 break-words text-xs text-[#60758d]">Confirmed {madisonDeadline(row.confirmed_at)} · Receipt: {row.bank_reference}</p> : null}</div>
                {pending ? <div className="flex flex-wrap gap-2 xl:shrink-0"><Button size="sm" disabled={saving} onClick={() => { setReview({ id: row.id, action: 'confirm' }); setReference(''); setCleared(false) }}>Review deposit</Button><Button variant="secondary" size="sm" disabled={saving} onClick={() => setReview({ id: row.id, action: 'release' })}>Release hold</Button></div> : null}
              </div>
              <p className="mt-4 border-t border-[#edf1f5] pt-3 text-xs leading-6 text-[#718398]">Email delivery: {delivery.map(item => `${({ buyer_request: 'Payment instructions', staff_request: 'Samlin alert', confirmed: 'Buyer confirmation', expired: 'Expiry notice', released: 'Release notice' })[item.kind]} — ${item.state === 'sent' ? 'accepted by email provider' : item.state}`).join(' · ') || 'Queue unavailable'}</p>
              {delivery.some(item => ['failed', 'review'].includes(item.state)) ? <p className="mt-2 rounded-xl bg-[#fff8ea] px-3 py-2 text-xs leading-6 text-[#946b28]">Email needs attention. Check delivery before contacting the buyer; the hold remains recorded.</p> : null}
              {review?.id === row.id ? <div className="mt-4 grid gap-4 rounded-[14px] border border-[#dbe8e0] bg-[#f6faf7] p-4">
                {review.action === 'confirm' ? <><label className="grid gap-2 text-xs font-semibold text-[#4e6578]">Trust bank receipt reference<input disabled={saving} className={inputClass} value={reference} onChange={event => setReference(event.target.value)} maxLength={200} /></label><label className="flex items-start gap-3 text-sm leading-6 text-[#446453]"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[#1b7854]" checked={cleared} onChange={event => setCleared(event.target.checked)} />I verified that the full R10,000 has cleared into the Tuckers Attorneys trust account.</label></> : <p className="text-sm leading-6 text-[#446453]">Release this unpaid hold and notify the buyer? Review any incoming payment separately.</p>}
                <div className="flex flex-wrap gap-2"><Button disabled={saving || (review.action === 'confirm' && (!cleared || reference.trim().length < 3))} onClick={() => void act(row, review.action)}>{review.action === 'confirm' ? 'Confirm deposit received' : 'Confirm release'}</Button><Button variant="secondary" disabled={saving} onClick={() => setReview(null)}>Cancel</Button></div>
              </div> : null}
            </article>
          })}</div>}
        </> : null}
      </div>
    </section>
  )
}
