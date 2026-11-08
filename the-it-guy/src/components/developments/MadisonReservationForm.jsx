import { useEffect, useRef, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

import { madisonDeadline } from '../../core/developments/madisonReservations.js'

export default function MadisonReservationForm({ unit, config, onRequest, onClose }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', consent: false, website: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState(null)
  const intent = useRef(null)
  const busy = useRef(false)
  const successRef = useRef(null)
  const ready = Boolean(config?.enabled && config?.refundTerms && onRequest)
  const update = key => event => setForm(current => ({ ...current, [key]: key === 'consent' ? event.target.checked : event.target.value }))
  useEffect(() => { setForm(current => ({ ...current, consent: false })) }, [config?.refundTerms])
  const submit = async event => {
    event.preventDefault()
    if (busy.current || !ready || !event.currentTarget.reportValidity()) return
    busy.current = true; setSaving(true); setError('')
    // Reuse the exact request after a lost response. Changes need a new intent.
    const fingerprint = JSON.stringify([form, config.refundTerms])
    if (!intent.current || intent.current.fingerprint !== fingerprint) intent.current = { fingerprint, id: crypto.randomUUID() }
    try {
      const result = await onRequest({ ...form, refundTerms: config.refundTerms, requestId: intent.current.id, unitId: unit.id })
      if (result.state !== 'awaiting_deposit' && result.state !== 'confirmed') throw new Error('This hold has ended. Please contact Samlin before making a payment.')
      setReceipt(result)
      window.setTimeout(() => successRef.current?.focus(), 0)
    } catch (failure) { setError(failure.message || 'Your request could not be confirmed. Please retry with the same details.') }
    finally { busy.current = false; setSaving(false) }
  }
  if (receipt) return <div className="space-y-4" role="status">
    <CheckCircle2 size={32} aria-hidden="true" />
    <h3 ref={successRef} tabIndex={-1} className="font-serif text-2xl">{receipt.state === 'confirmed' ? 'Reservation confirmed.' : 'Your 48-hour hold is in place.'}</h3>
    <p>Unit {unit.unitNumber} · Reference <strong>{receipt.reference}</strong></p>
    {receipt.state === 'awaiting_deposit' ? <><p>Awaiting deposit. Your hold expires on <strong>{madisonDeadline(receipt.expiresAt)}</strong>.</p><p>Your payment instructions are queued for email to {form.email}. If they do not arrive, contact Samlin before paying.</p><p>Pay the fully refundable R10,000 into the designated Tuckers Attorneys trust account using the emailed details. Samlin will confirm your reservation once cleared funds are verified.</p></> : <p>Samlin has confirmed your deposit.</p>}
    <button type="button" className="min-h-12 w-full rounded bg-[#173b32] px-5 text-white" onClick={onClose}>Back to residences</button>
  </div>
  return <form onSubmit={submit} className="space-y-4">
    <p>Request a 48-hour hold with a <strong>fully refundable R10,000 reservation deposit</strong>, payable by EFT into the designated Tuckers Attorneys trust account. We’ll email the payment instructions. Samlin must verify cleared funds before the hold expires to confirm your reservation.</p>
    {!ready ? <p role="status">Online reservations are being prepared while the trust payment details are confirmed. Please contact Samlin to enquire about this unit.</p> : null}
    <fieldset disabled={saving} className="grid gap-3">
      {[['name', 'Full name', 'text'], ['email', 'Email address', 'email'], ['phone', 'Phone number', 'tel']].map(([key, label, type]) => <label key={key} className="grid gap-1.5 text-sm">{label}<input className="min-h-12 rounded border border-slate-300 bg-white px-3" required name={key} type={type} value={form[key]} maxLength={key === 'name' ? 160 : key === 'email' ? 254 : 40} minLength={key === 'name' ? 2 : key === 'phone' ? 6 : undefined} onChange={update(key)} /></label>)}
      <label style={{ display: 'none' }} aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={update('website')} /></label>
      {config?.refundTerms ? <details><summary className="cursor-pointer text-sm underline">Reservation and refund terms</summary><p className="mt-2 whitespace-pre-wrap text-sm">{config.refundTerms}</p></details> : null}
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" required checked={form.consent} onChange={update('consent')} /><span>I accept the reservation and refund terms and agree that Samlin may contact me about this reservation.</span></label>
    </fieldset>
    {error ? <p role="alert" className="text-sm text-red-800">{error}</p> : null}
    <button type="submit" disabled={!ready || saving} className="min-h-12 w-full rounded bg-[#173b32] px-5 text-white disabled:opacity-50">{saving ? 'Requesting hold…' : 'Request reservation'}</button>
    <p className="text-xs">The hold lasts 48 hours from acceptance. If the deposit has not been confirmed by then, the unit becomes available again. Proof of payment alone does not confirm receipt.</p>
  </form>
}
