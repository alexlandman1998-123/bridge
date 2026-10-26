import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, CalendarDays, Check, Mail, MessageCircle, Plus, Save, Share2, Target, Trash2 } from 'lucide-react'
import { MarketingLink as Link } from './MarketingNavigation.jsx'
import { campaignHandoffId } from '../../services/campaignPackModel'
import { cleanCampaignPlaybook, createCampaignPlaybook, orderedPlaybookSteps, PLAYBOOK_CHANNELS, playbookStepCopy, playbookStepDate, RESPONSE_KINDS } from '../../services/campaignPlaybookModel'
import { saveCampaignPlaybook } from '../../services/campaignPlaybookService'
import { handoffCampaignDraft, loadCampaignChannelBrief } from '../../services/campaignPackService'
import CampaignPublishingActions from './CampaignPublishingActions'
import './CampaignPlaybook.css'

const CampaignAudience = lazy(() => import('./MarketingAudiences').then((module) => ({ default: module.CampaignAudience })))
const icons = { email: Mail, whatsapp: MessageCircle, social: Share2, meta: Target, chatgpt: MessageCircle }
const dateLabel = (value) => value ? new Date(`${value}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'Set campaign start date'
const activityUrl = (channel, id, status) => `/marketing?section=${channel}&view=${status === 'draft' ? 'create' : 'detail'}&id=${encodeURIComponent(id)}`

export default function CampaignPlaybook({ campaign, workspace, userId, canEdit, onSaved, onEdit, onTab }) {
  const [draft, setDraft] = useState(() => structuredClone(campaign.playbook || createCampaignPlaybook(campaign)))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [prepared, setPrepared] = useState({})
  const [linked, setLinked] = useState({})
  const [expanded, setExpanded] = useState(null)
  const lock = useRef(false)
  const current = useRef(true)
  useEffect(() => { current.current = true; return () => { current.current = false } }, [])
  // The parent keys this workspace by agency, campaign and revision.
  // Resolve no channel handoffs after navigation away from this instance.
  useEffect(() => {
    if (!campaign.playbook || !workspace) return
    let active = true
    Promise.all(campaign.playbook.steps.filter((step) => ['email', 'whatsapp'].includes(step.channel)).map(async (step) => {
      const id = await campaignHandoffId(campaign.organisation_id, campaign.id, campaign.revision, `${step.channel}:playbook:${step.id}`)
      const associated = workspace.activities?.some((item) => item.campaign_id === campaign.id && item.channel === step.channel && item[`${step.channel}_campaign_id`] === id)
      const row = workspace.channels?.[step.channel]?.data?.find((item) => item.id === id)
      return [step.id, associated && row ? { id, status: row.status || 'draft' } : null]
    })).then((items) => { if (active) setLinked(Object.fromEntries(items.filter(([, value]) => value))) }).catch(() => {})
    return () => { active = false }
  }, [campaign, workspace])
  const requiresReview = Boolean(campaign.playbook && campaign.playbook.sourceRevision !== campaign.revision)
  const dirty = requiresReview || !campaign.playbook || JSON.stringify(draft) !== JSON.stringify(campaign.playbook)
  const update = (fields) => { setDraft((old) => ({ ...old, ...fields })); setError('') }
  const stepChange = (id, fields) => update({ steps: draft.steps.map((item) => item.id === id ? { ...item, ...fields } : item) })
  const recipeChange = (id, fields) => update({ followUp: draft.followUp.map((item) => item.id === id ? { ...item, ...fields } : item) })
  async function save(event) {
    event.preventDefault()
    if (lock.current) return
    lock.current = true; setBusy('save'); setError('')
    try { await saveCampaignPlaybook(campaign.organisation_id, campaign, draft); if (current.current) await onSaved() }
    catch (cause) { if (current.current) setError(cause.message) }
    finally { lock.current = false; if (current.current) setBusy('') }
  }
  async function prepare(step) {
    if (dirty || lock.current || !canEdit) return
    lock.current = true; setBusy(step.id); setError('')
    try {
      const result = await handoffCampaignDraft(campaign.organisation_id, userId, campaign, step.channel, step.id)
      if (current.current) { setPrepared((old) => ({ ...old, [step.id]: result })); await onSaved() }
    } catch (cause) { if (current.current) setError(cause.message) }
    finally { lock.current = false; if (current.current) setBusy('') }
  }
  let valid = true
  try { cleanCampaignPlaybook(draft, campaign.planned_channels) } catch { valid = false }
  return <section className="cp-workspace" aria-label="Campaign playbook">
    <header className="cp-heading"><div><h2>Campaign playbook</h2><span>{requiresReview ? 'Review required' : dirty ? campaign.playbook ? 'Unsaved changes' : 'Suggested plan · review and save' : 'Saved plan'}{!dirty && <Check size={13} />}</span></div>{canEdit && <button className="mc-button mc-primary" form="campaign-playbook-form" type="submit" disabled={Boolean(busy) || !dirty}><Save size={15} />{busy === 'save' ? 'Saving…' : 'Save playbook'}</button>}</header>
    {requiresReview && <p className="cp-warning" role="status">Review the response route and every message against the current campaign brief, then save the playbook before preparing new drafts.</p>}
    {error && <p className="cp-error" role="alert">{error}</p>}
    {!valid && <p className="cp-warning" role="status">Complete the response destination, titles and messages before saving or preparing steps.</p>}
    <div className="cp-layout"><form id="campaign-playbook-form" className="cp-editor" onSubmit={save}>
      <fieldset disabled={Boolean(busy)}><legend className="sr-only">Personalise the campaign playbook</legend>
        <section className="cp-response"><h3>Where should responses go?</h3><div className="cp-response-fields"><label>Call to action<input disabled={!canEdit} maxLength={80} required value={draft.response.label} onChange={(event) => update({ response: { ...draft.response, label: event.target.value } })} /></label><label>Response route<select disabled={!canEdit} value={draft.response.kind} onChange={(event) => update({ response: { ...draft.response, kind: event.target.value, value: '' } })}>{Object.entries(RESPONSE_KINDS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{draft.response.kind !== 'reply' && <label className="cp-destination">Response destination<input disabled={!canEdit} required maxLength={2048} type={draft.response.kind === 'email' ? 'email' : draft.response.kind === 'url' ? 'url' : 'tel'} placeholder={draft.response.kind === 'url' ? 'https://…' : draft.response.kind === 'email' ? 'agent@example.com' : '+ country code and number'} value={draft.response.value} onChange={(event) => update({ response: { ...draft.response, value: event.target.value } })} /></label>}</div><p>The call to action is included when preparing each step. Use <code>{'{response}'}</code> to choose its position in the message.</p></section>
        <div className="cp-section-heading"><h3>Communication sequence</h3><span>{draft.steps.length} steps · days from campaign start</span></div>
        <ol className="cp-sequence">{orderedPlaybookSteps(draft).map((step, index) => {
          const Icon = icons[step.channel]
          const result = prepared[step.id] || linked[step.id]
          const stepDate = playbookStepDate(campaign, step)
          return <li className={`cp-step cp-step-${step.channel}`} key={step.id}>
            <div className="cp-step-number">{index + 1}</div><article>
              <header><span className="cp-channel"><Icon size={15} />{PLAYBOOK_CHANNELS[step.channel]}</span><span className="cp-step-date"><CalendarDays size={13} />Day {step.day} · {dateLabel(stepDate)}</span></header>
              <h4>{step.title || 'Untitled step'}</h4>
              {campaign.end_date && stepDate && stepDate > campaign.end_date && <p className="cp-warning">This step falls after the campaign’s end date. Adjust its day or the campaign dates.</p>}
              <p className="cp-step-excerpt">{step.body || 'Add the message for this step.'}</p>
              <div className="cp-step-actions"><button type="button" className="mc-text-button" onClick={() => setExpanded(expanded === step.id ? null : step.id)}>{expanded === step.id ? 'Close copy' : canEdit ? 'Personalise step' : 'View copy'}<ArrowDown size={13} /></button>{canEdit && <button type="button" className="cp-remove" aria-label={`Remove step ${index + 1}`} disabled={draft.steps.length === 1} onClick={() => update({ steps: draft.steps.filter((item) => item.id !== step.id) })}><Trash2 size={14} /></button>}</div>
              {expanded === step.id && <div className="cp-step-editor"><div><label>Channel<select disabled={!canEdit} aria-label={`Step ${index + 1} channel`} value={step.channel} onChange={(event) => stepChange(step.id, { channel: event.target.value })}>{campaign.planned_channels.map((channel) => <option value={channel} key={channel}>{PLAYBOOK_CHANNELS[channel]}</option>)}</select></label><label>Day after start<input disabled={!canEdit} aria-label={`Step ${index + 1} day`} type="number" required min={0} max={365} value={step.day} onChange={(event) => stepChange(step.id, { day: Number(event.target.value) })} /></label></div><label>{step.channel === 'email' ? 'Email subject' : 'Step title'}<input disabled={!canEdit} aria-label={`Step ${index + 1} title`} required maxLength={240} value={step.title} onChange={(event) => stepChange(step.id, { title: event.target.value })} /></label><label>Message<textarea disabled={!canEdit} aria-label={`Step ${index + 1} message`} rows={6} required maxLength={12000} value={step.body} onChange={(event) => stepChange(step.id, { body: event.target.value })} /></label>{valid && <details className="cp-rendered"><summary>Preview with response destination</summary><p>{playbookStepCopy(draft, step).body}</p></details>}</div>}
              {['email', 'whatsapp'].includes(step.channel) && <div className="cp-handoff">{result ? <><span role="status">{result.status === 'draft' ? 'Draft prepared and linked' : 'Existing channel activity'}</span><Link to={activityUrl(step.channel, result.id, result.status)} className="mc-button">{result.status === 'draft' ? 'Open draft' : 'View activity'}<ArrowRight size={14} /></Link></> : canEdit ? <><small>{dirty ? 'Save the playbook before preparing this step.' : 'Recipients, sender and send time are reviewed in the channel.'}</small><button className="mc-button" type="button" disabled={dirty || Boolean(busy)} onClick={() => void prepare(step)}>{busy === step.id ? 'Preparing…' : 'Prepare draft'}<ArrowRight size={14} /></button></> : <small>Drafts are managed by the campaign owner.</small>}</div>}
              {['social', 'meta', 'chatgpt'].includes(step.channel) && canEdit && !dirty && valid && <details className="cp-publishing-tools"><summary>{['meta', 'chatgpt'].includes(step.channel) ? 'Prepare ad publishing brief' : 'Prepare social publishing brief'}</summary><CampaignPublishingActions channel={step.channel} campaign={{ ...campaign, channel_content: { ...campaign.channel_content, [step.channel]: playbookStepCopy(draft, step) } }} onLoadBrief={(channel) => loadCampaignChannelBrief(campaign.organisation_id, userId, campaign, channel, step.id)} /></details>}
            </article>
          </li>
        })}</ol>
        {canEdit && <button className="mc-button cp-add-step" type="button" disabled={draft.steps.length >= 12} onClick={() => { const id = crypto.randomUUID(); update({ steps: [...draft.steps, { id, channel: campaign.planned_channels[0], day: Math.min(365, Math.max(...draft.steps.map((item) => item.day)) + 2), title: '', body: '{response}' }] }); setExpanded(id) }}><Plus size={15} />Add communication</button>}
        <section className="cp-follow-up"><div className="cp-section-heading"><h3>When someone responds</h3><button className="mc-text-button" type="button" disabled={!canEdit || draft.followUp.length >= 5} onClick={() => update({ followUp: [...draft.followUp, { id: crypto.randomUUID(), title: 'Follow up with {contact}', days: 1 }] })}><Plus size={14} />Add action</button></div><p>Review these suggestions in Enquiries &amp; follow-up. Saved CRM tasks go to the lead’s current owner.</p>{draft.followUp.map((item, index) => <div className="cp-follow-row" key={item.id}><label>Action {index + 1}<input disabled={!canEdit} required maxLength={180} value={item.title} onChange={(event) => recipeChange(item.id, { title: event.target.value })} /></label><label>Days after response<input disabled={!canEdit} type="number" min={0} max={365} required value={item.days} onChange={(event) => recipeChange(item.id, { days: Number(event.target.value) })} /></label><button className="cp-remove" type="button" disabled={!canEdit} aria-label={`Remove follow-up ${index + 1}`} onClick={() => update({ followUp: draft.followUp.filter((recipe) => recipe.id !== item.id) })}><Trash2 size={14} /></button></div>)}</section>
      </fieldset>
      {canEdit && <footer className="cp-save-footer"><span>{dirty ? 'Review your sequence, response route and follow-up actions.' : 'Your playbook is saved.'}</span><button type="submit" className="mc-button mc-primary" disabled={Boolean(busy) || !dirty}>Save changes <Save size={14} /></button></footer>}
    </form><aside className="cp-context"><section><h3>Campaign brief</h3><dl><dt>Goal</dt><dd>{campaign.objective}</dd><dt>Offer</dt><dd>{campaign.offer || 'Add a clear offer in the campaign brief.'}</dd><dt>Area</dt><dd>{campaign.area || 'Not specified'}</dd></dl>{canEdit && <button className="mc-button" type="button" disabled={dirty || Boolean(busy)} onClick={onEdit}>Edit campaign brief</button>}</section><Suspense fallback={<p role="status">Opening campaign audience…</p>}><CampaignAudience campaign={campaign} canEdit={canEdit} /></Suspense><section className="cp-next"><h3>Give responses a next step</h3><p>The saved playbook’s follow-up actions are available against each campaign enquiry.</p><button className="mc-button" type="button" disabled={dirty || Boolean(busy)} onClick={() => onTab('enquiries')}>Enquiries &amp; follow-up<ArrowRight size={15} /></button></section></aside></div>
    <p className="cp-footnote">Playbook days are planning dates. Prepare, review and schedule each communication in its channel. Playbook follow-up suggestions become CRM tasks after you review and save them. Configured campaign response links prepare their own follow-up when a form is submitted. Saving changes keeps earlier channel drafts; preparing a step again uses the new campaign version.</p>
  </section>
}
