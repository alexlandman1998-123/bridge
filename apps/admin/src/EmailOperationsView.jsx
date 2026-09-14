import { useState } from 'react'
import { Activity, CheckCircle2, PauseCircle, ShieldCheck, XCircle } from 'lucide-react'
import { supabase } from './lib/supabaseClient'

export default function EmailOperationsView() {
  const [organisationId, setOrganisationId] = useState('')
  const [dailyLimit, setDailyLimit] = useState('500')
  const [approved, setApproved] = useState(false)
  const [paused, setPaused] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [health, setHealth] = useState(null)
  const [healthBusy, setHealthBusy] = useState(false)
  const [healthMessage, setHealthMessage] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true); setMessage('')
    const { error } = await supabase.rpc('arch9_admin_set_email_sending_policy', {
      p_organisation_id: organisationId.trim(), p_approved: approved,
      p_daily_recipient_limit: Number(dailyLimit), p_paused: paused,
      p_approval_note: note.trim() || null,
    })
    setBusy(false)
    setMessage(error ? error.message : approved && !paused ? 'Email sending approved with the selected limit.' : 'Email sending remains blocked for this organisation.')
  }

  const refreshHealth = async () => {
    setHealthBusy(true); setHealthMessage('')
    const { data, error } = await supabase.functions.invoke('email-platform-status', { body: {} })
    setHealthBusy(false)
    if (error || data?.error) {
      setHealth(null)
      setHealthMessage(data?.error || error?.message || 'Unable to check platform readiness.')
      return
    }
    setHealth(data)
  }

  return <section className="admin-panel email-operations-panel">
    <div className="panel-title"><div><span className="eyebrow">CENTRAL RESEND CONTROLS</span><h2>Email sending approval</h2><p>Approve a verified agency before it can send through Arch9’s shared Resend account.</p></div><ShieldCheck size={24} /></div>
    <div className="prospect-demo-form" aria-live="polite">
      <div className="panel-title"><div><span className="eyebrow">PLATFORM READINESS</span><h3>Resend health check</h3><p>Check the central sender domain, delivery webhook, signing secret, and billing acknowledgement without exposing provider credentials.</p></div><Activity size={20} /></div>
      <button type="button" className="secondary-button" onClick={refreshHealth} disabled={healthBusy}>{healthBusy ? 'Checking…' : 'Check platform readiness'}</button>
      {healthMessage ? <p className="form-status">{healthMessage}</p> : null}
      {health ? <div className="email-platform-checks">
        <p className={`form-status ${health.ready ? '' : 'is-warning'}`}>{health.ready ? 'Platform is ready to support approved agencies.' : 'Platform needs attention before approving more agencies.'}</p>
        <ul>{health.checks.map((check) => <li key={check.key}>{check.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}<span>{check.label}</span></li>)}</ul>
        <p className="subtle-text">Checked {new Date(health.checkedAt).toLocaleString()}{health.platformSenderDomain ? ` · ${health.platformSenderDomain}` : ''}</p>
      </div> : null}
    </div>
    <form className="prospect-demo-form" onSubmit={submit}>
      <label><span>Organisation ID</span><input required value={organisationId} onChange={(event) => setOrganisationId(event.target.value)} placeholder="UUID from Organisations" /></label>
      <label><span>Daily recipient limit</span><input required type="number" min="1" max="500" value={dailyLimit} onChange={(event) => setDailyLimit(event.target.value)} /></label>
      <label><span>Approval note</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Business review and sender-reputation notes" /></label>
      <label className="checkbox-row"><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} /><CheckCircle2 size={16} /> Approve this organisation for email sending</label>
      <label className="checkbox-row"><input type="checkbox" checked={paused} onChange={(event) => setPaused(event.target.checked)} /><PauseCircle size={16} /> Keep sending paused</label>
      <button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save email policy'}</button>
      {message ? <p className="form-status">{message}</p> : null}
    </form>
  </section>
}
