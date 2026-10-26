import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Copy } from 'lucide-react'
import Modal from '../ui/Modal'
import { CAMPAIGN_CHANNELS } from '../../services/marketingCampaignService'
import { copyCampaignToAgent, loadCampaignAgentIdentity, personaliseCampaignForAgent } from '../../services/campaignReuseService'
import { activeCampaignMember } from '../../services/campaignAgentModel'

export default function CampaignCopyDialog({ organisationId, source, members, onClose, onCopied }) {
  const [form, setForm] = useState({ targetId: '', name: `${source.name} · copy`.slice(0, 120), area: '', agentName: '', kind: 'email', destination: '', startDate: '', endDate: '' })
  const [identity, setIdentity] = useState({ loading: false, note: '' })
  const [review, setReview] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [requestId] = useState(() => crypto.randomUUID())
  const lock = useRef(false), mounted = useRef(true)
  const targets = members.filter((row) => activeCampaignMember(row) && row.userId !== source.created_by)
  const target = targets.find((row) => row.userId === form.targetId)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (!form.targetId) return
    let current = true
    loadCampaignAgentIdentity(organisationId, form.targetId).then((person) => {
      if (!current) return
      if (person) setForm((old) => ({ ...old, agentName: person.name || old.agentName, area: person.areas?.[0] || '', kind: person.email ? 'email' : person.whatsapp ? 'whatsapp' : 'email', destination: person.email || person.whatsapp || '' }))
      setIdentity({ loading: false, note: person ? 'Public agent details loaded. Review them before continuing.' : 'No active public agent card found. Enter the agent’s public details to continue.' })
    }).catch(() => { if (current) setIdentity({ loading: false, note: 'Public agent details could not be loaded. Enter and review them below.' }) })
    return () => { current = false }
  }, [organisationId, form.targetId])
  function edit(field, value) {
    setError('')
    if (field === 'targetId') {
      setIdentity({ loading: Boolean(value), note: '' })
      setForm((old) => ({ ...old, targetId: value, agentName: targets.find((row) => row.userId === value)?.fullName || '', area: '', destination: '' }))
    } else setForm((old) => ({ ...old, [field]: value }))
  }
  function prepare(event) {
    event.preventDefault()
    try {
      if (!target) throw new Error('Choose an active agent in this agency.')
      const sourceOwner = members.find((row) => row.userId === source.created_by)
      setReview(personaliseCampaignForAgent(source, { ...form, sourceOwnerName: sourceOwner?.fullName, sourceOwnerEmail: sourceOwner?.email, response: { kind: form.kind, label: source.playbook?.response?.label || 'Get in touch', value: form.destination.trim() } }))
      setError('')
    } catch (problem) { setError(problem.message) }
  }
  async function save() {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const saved = await copyCampaignToAgent({ organisationId, source, targetId: form.targetId, requestId, draft: review })
      if (mounted.current) onCopied(saved)
    } catch (problem) { if (mounted.current) setError(problem.message) }
    finally { lock.current = false; if (mounted.current) setBusy(false) }
  }
  return <Modal open onClose={busy ? undefined : onClose} title="Copy to another agent" className="mc-agent-copy-dialog">
    <div className="mc-agent-copy-steps" aria-label="Copy campaign steps"><span aria-current={!review ? 'step' : undefined}>1. Personalise</span><ArrowRight size={14} /><span aria-current={review ? 'step' : undefined}>2. Review copy</span></div>
    <p className="mc-agent-copy-source">From <strong>{source.name}</strong> · Revision {source.revision}</p>
    {error && <p className="mc-error" role="alert">{error}</p>}
    {!review ? <form className="mc-agent-copy-form" onSubmit={prepare}>
      <label>Receiving agent<select required value={form.targetId} onChange={(event) => edit('targetId', event.target.value)}><option value="">Choose an active agent…</option>{targets.map((row) => <option key={row.userId} value={row.userId}>{row.fullName}</option>)}</select></label>
      {identity.loading && <p role="status">Loading public agent details…</p>}
      {identity.note && <p className="mc-note" role="status">{identity.note}</p>}
      <div className="mc-agent-copy-fields"><label>Campaign name<input required maxLength={120} value={form.name} onChange={(event) => edit('name', event.target.value)} /></label><label>Service area<input required maxLength={120} value={form.area} onChange={(event) => edit('area', event.target.value)} /></label><label>Public agent name<input required maxLength={120} value={form.agentName} onChange={(event) => edit('agentName', event.target.value)} /></label><label>Respond using<select value={form.kind} onChange={(event) => { edit('kind', event.target.value); edit('destination', '') }}><option value="email">Email address</option><option value="whatsapp">WhatsApp number</option><option value="url">Website / enquiry form</option></select></label></div>
      <label>Response destination<input required maxLength={2048} type={form.kind === 'email' ? 'email' : form.kind === 'url' ? 'url' : 'tel'} placeholder={form.kind === 'whatsapp' ? '+ country code and number' : ''} value={form.destination} onChange={(event) => edit('destination', event.target.value)} /></label>
      <div className="mc-agent-copy-fields"><label>New start date<input type="date" value={form.startDate} onChange={(event) => edit('startDate', event.target.value)} /></label><label>New end date<input type="date" min={form.startDate || undefined} value={form.endDate} onChange={(event) => edit('endDate', event.target.value)} /></label></div>
      <p className="mc-note">Leave dates empty for the agent to plan. Choose a fresh audience and prepare artwork in the new campaign.</p>
      <button className="mc-button mc-primary" disabled={!target || identity.loading} type="submit">Review personalised copy<ArrowRight size={16} /></button>
    </form> : <div className="mc-agent-copy-review">
      <div className="mc-agent-copy-summary"><Check size={20} /><div><strong>{review.name}</strong><span>{target?.fullName} · {review.area}</span><small>{form.destination}</small></div></div>
      <p className="mc-note">Check every name, link, property fact and claim before creating the draft. The agent will review the playbook and their audience before sending.</p>
      {Object.entries(review.channel_content).map(([channel, copy]) => <fieldset key={channel} disabled={busy}><legend>{CAMPAIGN_CHANNELS[channel]}</legend><label>Title · {CAMPAIGN_CHANNELS[channel]}<input maxLength={240} value={copy.title} onChange={(event) => setReview((old) => ({ ...old, channel_content: { ...old.channel_content, [channel]: { ...copy, title: event.target.value } } }))} /></label><label>Message · {CAMPAIGN_CHANNELS[channel]}<textarea maxLength={12000} rows={5} value={copy.body} onChange={(event) => setReview((old) => ({ ...old, channel_content: { ...old.channel_content, [channel]: { ...copy, body: event.target.value } } }))} /></label></fieldset>)}
      {review.playbook && <details><summary>Review {review.playbook.steps.length} playbook communications</summary>{review.playbook.steps.map((step, index) => <fieldset key={step.id} disabled={busy}><legend>Day {step.day} · {CAMPAIGN_CHANNELS[step.channel]}</legend><label>Step title<input maxLength={240} value={step.title} onChange={(event) => setReview((old) => ({ ...old, playbook: { ...old.playbook, steps: old.playbook.steps.map((item, i) => i === index ? { ...item, title: event.target.value } : item) } }))} /></label><label>Step message<textarea rows={4} maxLength={12000} value={step.body} onChange={(event) => setReview((old) => ({ ...old, playbook: { ...old.playbook, steps: old.playbook.steps.map((item, i) => i === index ? { ...item, body: event.target.value } : item) } }))} /></label></fieldset>)}</details>}
      <div className="mc-agent-copy-actions"><button className="mc-button" disabled={busy} onClick={() => setReview(null)}><ArrowLeft size={15} />Back</button><button className="mc-button mc-primary" disabled={busy} onClick={() => void save()}><Copy size={15} />{busy ? 'Creating draft…' : 'Create agent draft'}</button></div>
    </div>}
  </Modal>
}
