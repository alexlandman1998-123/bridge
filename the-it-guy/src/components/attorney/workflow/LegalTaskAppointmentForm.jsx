import { useRef, useState } from 'react'
import Button from '../../ui/Button.jsx'
import Field from '../../ui/Field.jsx'

export default function LegalTaskAppointmentForm({ task, recipient = {}, onCreate, onResend, onBusyChange }) {
  const [draft, setDraft] = useState({ recipientName: recipient.name || '', recipientEmail: recipient.email || '', date: '', startTime: '', locationMode: 'physical_address', location: '', instructions: '' })
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  async function submit(event) {
    event.preventDefault()
    if (pending.current || result) return
    pending.current = true
    setBusy(true)
    onBusyChange?.(true)
    setError('')
    try { setResult(await onCreate(draft)) } catch (error) { setError(error.message || 'Appointment could not be saved.') }
    finally { pending.current = false; setBusy(false); onBusyChange?.(false) }
  }
  async function resend() {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    onBusyChange?.(true)
    setError('')
    try { await onResend(result.appointmentId); setResult({ ...result, message: 'Invite resend requested. Check the appointment delivery status in the calendar.' }) }
    catch (error) { setError(error.message || 'Could not resend the invite.') }
    finally { pending.current = false; setBusy(false); onBusyChange?.(false) }
  }
  const change = key => event => setDraft(previous => ({ ...previous, [key]: event.target.value }))
  if (result) return <div className="space-y-3"><p role="status">{result.message}</p>{error ? <p role="alert" className="text-red-700">{error}</p> : null}<p className="text-sm text-slate-600">This appointment is linked to {task.label}. Confirm the task outcome when ready.</p>{result.delivery?.status !== 'sent' ? <Button type="button" disabled={busy} onClick={resend}>{busy ? 'Sending…' : 'Resend invite'}</Button> : null}</div>
  return <form onSubmit={submit} className="space-y-4">
    {error ? <p role="alert" className="text-red-700">{error}</p> : null}
    <div className="grid gap-4 sm:grid-cols-2">
      {[['recipientName', 'Recipient name', 'text'], ['recipientEmail', 'Recipient email', 'email'], ['date', 'Date', 'date'], ['startTime', 'Time (South Africa)', 'time']].map(([key, label, type]) => <label key={key} className="grid gap-1 text-sm">{label}<Field required type={type} disabled={busy} value={draft[key]} onChange={change(key)} /></label>)}
    </div>
    <label className="grid gap-1 text-sm">Appointment location<Field as="select" value={draft.locationMode} onChange={change('locationMode')} disabled={busy}><option value="physical_address">In person</option><option value="video_call">Video meeting</option><option value="phone_call">Phone call</option></Field></label>
    <label className="grid gap-1 text-sm">{draft.locationMode === 'video_call' ? 'Meeting link' : draft.locationMode === 'phone_call' ? 'Phone number' : 'Address'}<Field required value={draft.location} onChange={change('location')} disabled={busy} /></label>
    <label className="grid gap-1 text-sm">Instructions for recipient<Field as="textarea" rows={3} value={draft.instructions} onChange={change('instructions')} disabled={busy} /></label>
    <Button type="submit" disabled={busy}>{busy ? 'Scheduling…' : 'Schedule & send invite'}</Button>
  </form>
}
