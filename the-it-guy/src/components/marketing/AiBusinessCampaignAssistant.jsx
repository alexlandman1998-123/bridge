import { useEffect, useRef, useState } from 'react'
import { aiCampaignAction } from '../../services/aiCampaignService'
import { businessCampaignPlan, businessCampaignStateKey } from '../../services/businessCampaignAiModel'
import './AiCampaignAssistant.css'

export default function AiBusinessCampaignAssistant({ organisationId, builder, content, persist, onApply }) {
  const [channel, setChannel] = useState(() => content.email ? 'email' : Object.keys(content)[0])
  const [target, setTarget] = useState('both'), [brief, setBrief] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [proposal, setProposal] = useState(null), [undo, setUndo] = useState(null)
  const request = useRef(0), controller = useRef(null)
  const current = useRef(''), currentContent = useRef(content)
  const stateKey = businessCampaignStateKey(builder, content)
  current.current = stateKey; currentContent.current = content
  useEffect(() => () => { request.current++; controller.current?.abort() }, [organisationId])
  const plan = businessCampaignPlan(builder)
  async function generate() {
    const token = ++request.current, key = current.current
    setBusy(true); setError(''); setProposal(null)
    controller.current = new AbortController()
    try {
      if (!persist) throw new Error('Save this business campaign before generating a proposal.')
      const saved = await persist()
      if (request.current !== token) return
      if (current.current !== key) throw new Error('Your campaign changed while saving. Review the current wording before generating again.')
      if (!saved?.id || !Number.isInteger(saved.revision)) throw new Error('The saved campaign revision could not be confirmed. Your current wording is unchanged.')
      const value = await aiCampaignAction(organisationId, 'business_generate', { campaignId: saved.id, expectedRevision: saved.revision, requestId: crypto.randomUUID(), channel, target, brief }, { signal: controller.current.signal })
      if (request.current !== token) return
      if (current.current !== key || value.campaignId !== saved.id || value.revision !== saved.revision || value.applicability !== 'current') throw new Error('Newer edits were kept. Generate a fresh proposal for the current wording.')
      setProposal({ ...value, key })
    } catch (cause) { if (request.current === token && cause.name !== 'AbortError') setError(cause.message) } finally { if (request.current === token) setBusy(false) }
  }
  const valid = proposal?.key === stateKey ? proposal : null
  return <section className="ai-campaign" aria-label="Business campaign AI assistant">
    <div className="ai-campaign-panel">
      <div><h2>Give this campaign a sharper voice</h2><p>AI can propose a title and opening for one channel. Your confirmed facts, offer, terms, source material and response destination stay in the draft for review.</p></div>
      <details><summary>Campaign plan from your confirmed details</summary><p>{plan.audience}</p><ol>{plan.steps.map((step) => <li key={step}>{step}</li>)}</ol><p>{plan.boundary}</p></details>
      <div className="ai-campaign-fields">
        <label>Channel<select value={channel} disabled={busy} onChange={(event) => { setChannel(event.target.value); setProposal(null) }}>{Object.keys(content).filter((value) => ['email', 'whatsapp', 'social'].includes(value)).map((value) => <option key={value} value={value}>{value === 'email' ? 'Email' : value === 'whatsapp' ? 'WhatsApp' : 'Social caption'}</option>)}</select></label>
        <label>Improve<select value={target} disabled={busy} onChange={(event) => { setTarget(event.target.value); setProposal(null) }}><option value="both">Title and opening</option><option value="title">Title only</option><option value="opening">Opening only</option></select></label>
      </div>
      <label>Your direction<textarea maxLength={1500} disabled={busy} value={brief} onChange={(event) => { setBrief(event.target.value); setProposal(null) }} placeholder="For example: warm and concise, with a clear invitation to reply" /></label>
      <p>Uses this saved campaign’s goal, public area and language. Only the selected title and opening are sent for refinement; recipient records and campaign evidence are excluded. Generation uses the agency’s configured AI budget, separately from delivery.</p>
      <div className="ai-campaign-actions"><button type="button" disabled={busy} onClick={generate}>Generate proposal</button>{busy && <button type="button" onClick={() => { request.current++; controller.current?.abort(); setBusy(false) }}>Stop waiting</button>}</div>
      {busy && <p role="status">Preparing your proposal. Your current wording stays in place…</p>}
      {error && <p role="alert">{error}</p>}
      {proposal && !valid && <p role="status">Your newer edits are kept. Generate again to update the proposal.</p>}
      {valid && <div className="ai-campaign-copy"><h3>Proposed {channel === 'social' ? 'social caption' : channel} wording</h3><p>{valid.plan?.approach}</p><strong>{valid.content[channel].title}</strong><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', font: 'inherit' }}>{valid.content[channel].body}</pre><p>Review claims and tone before applying. Applying copy sends nothing. Usage reference: {valid.usageId}</p><div className="ai-campaign-actions"><button type="button" onClick={() => { if (current.current !== valid.key) return; const before = currentContent.current; onApply(valid.content); setUndo({ before, after: JSON.stringify(valid.content), builder: JSON.stringify(builder) }); setProposal(null) }}>Apply proposed wording</button><button type="button" onClick={() => setProposal(null)}>Keep current wording</button></div></div>}
      {undo && <button type="button" disabled={JSON.stringify(content) !== undo.after || JSON.stringify(builder) !== undo.builder} onClick={() => { if (JSON.stringify(currentContent.current) === undo.after && JSON.stringify(builder) === undo.builder) { onApply(undo.before); setUndo(null) } }}>Undo applied AI wording</button>}
      <p>You can continue editing manually whenever AI is unavailable. Stopping a wait does not cancel a provider request that has already started; check recorded usage before retrying.</p>
    </div>
  </section>
}
