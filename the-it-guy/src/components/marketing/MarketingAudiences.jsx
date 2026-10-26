import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Copy, Filter, Plus, RefreshCw, Search, UsersRound, X } from 'lucide-react'
import Modal from '../ui/Modal'
import { listOrganisationUsersForWorkspace } from '../../lib/settingsApi'
import { AUDIENCE_FIELDS, archiveMarketingAudience, attachCampaignAudience, emptyAudienceDefinition, loadCampaignAudience, loadMarketingAudiences, previewMarketingAudience, saveMarketingAudience, validateAudienceDefinition } from '../../services/marketingAudienceService'
import './MarketingAudiences.css'

const valid = (definition) => { try { validateAudienceDefinition(definition); return true } catch { return false } }
const count = (value) => new Intl.NumberFormat().format(value || 0)
const starters = [
  ['Buyers', 'Find the right property audience', { field: 'role', operator: 'in', values: ['buyer'] }],
  ['Sellers', 'Reach potential vendors', { field: 'role', operator: 'in', values: ['seller'] }],
  ['Past clients', 'Stay in touch with your clients', { field: 'role', operator: 'contains', values: ['client'] }],
  ['Reconnect', 'Leave 30 days between contact', { field: 'role', operator: 'in', values: ['buyer', 'seller', 'lead'] }],
  ['My contacts', 'Work your own CRM relationships', { field: 'owner', operator: 'in', values: ['me'] }],
]

function AudiencePreview({ organisationId, audience, definition, channel = 'crm', subscriptionId, categories = [], canSend = false, compact = false, onApply, onChoose }) {
  const [category, setCategory] = useState(subscriptionId || '')
  const [offset, setOffset] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [reviewed, setReviewed] = useState(false)
  const [state, setState] = useState({ key: '', loading: true, data: null, error: '' })
  const [applying, setApplying] = useState(false)
  const lock = useRef(false)
  const activeRequest = useRef(null)
  const selectedCategory = onApply && channel === 'email' ? subscriptionId || '' : category
  const definitionKey = JSON.stringify(definition || audience?.definition)
  const requestKey = JSON.stringify([organisationId, audience?.id, audience?.revision, definitionKey, channel, selectedCategory, offset, attempt])
  useEffect(() => {
    let current = true
    activeRequest.current = requestKey
    setReviewed(false)
    if (!valid(JSON.parse(definitionKey))) return () => { current = false }
    const timer = setTimeout(() => {
      previewMarketingAudience({ organisationId, audience, definition: JSON.parse(definitionKey), channel, subscriptionId: selectedCategory, offset }).then((data) => {
        if (current) setState({ key: requestKey, data, loading: false, error: '' })
      }).catch((error) => { if (current) setState({ key: requestKey, data: null, loading: false, error: error.message }) })
    }, compact ? 350 : 0)
    return () => { current = false; activeRequest.current = null; clearTimeout(timer) }
  }, [requestKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const current = state.key === requestKey ? state : { loading: true, data: null, error: '' }
  const data = current.data
  const reviewedAudience = data?.audience || audience
  const eligible = channel === 'email' ? data?.emailEligible : data?.whatsappEligible
  const cap = channel === 'whatsapp' ? 500 : 10000
  async function apply() {
    if (!data || !reviewed || lock.current) return
    lock.current = true; setApplying(true)
    try {
      const selection = await previewMarketingAudience({ organisationId, audience: reviewedAudience, channel, subscriptionId: selectedCategory, resolve: true, reviewHash: data.reviewHash })
      if (activeRequest.current === requestKey) await onApply(selection.recipientIds, reviewedAudience)
    } catch (error) { setState((old) => ({ ...old, error: error.message })); setReviewed(false) }
    finally { lock.current = false; setApplying(false) }
  }
  if (!valid(JSON.parse(definitionKey))) return <p className="ma-muted">Complete the filters to preview this audience.</p>
  return <section className={`ma-preview${compact ? ' ma-preview-compact' : ''}`} aria-label="Audience preview" aria-busy={current.loading}>
    <header><h3>{compact ? 'Live preview' : reviewedAudience?.name || 'Audience preview'}</h3><button className="ma-button" type="button" onClick={() => setAttempt((value) => value + 1)} disabled={applying}><RefreshCw size={14} />Refresh preview</button></header>
    {channel !== 'whatsapp' && <label className="ma-category">Email subscription category
      {onApply ? <strong>{categories.find((item) => item.id === selectedCategory)?.name || 'Choose a category in campaign details first'}</strong> : <select value={category} onChange={(event) => { setCategory(event.target.value); setOffset(0) }}><option value="">Choose a category to check email eligibility</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
    </label>}
    {current.error && <p className="ma-error" role="alert">{current.error}</p>}
    <div className="ma-stats">{[['CRM matches', data?.matched], ['Email eligible', canSend ? data?.emailEligible : null], ['WhatsApp eligible', data?.whatsappEligible], [`Contacted in ${(reviewedAudience?.definition || JSON.parse(definitionKey)).quietDays || 7} days`, data?.recent]].map(([label, value]) => <div key={label}><strong>{current.loading || value == null ? '—' : count(value)}</strong><span>{label}</span></div>)}</div>
    {!canSend && channel !== 'whatsapp' && <p className="ma-muted">Email eligibility requires sending access in this workspace.</p>}
    {current.loading ? <p className="ma-muted" role="status">Checking current CRM membership and channel eligibility…</p> : data && !compact && <>
      <div className="ma-table-wrap" tabIndex={0} role="region" aria-label="Audience contacts; scroll horizontally for all columns"><table><thead><tr><th>Contact</th><th>CRM context</th><th>Email</th><th>WhatsApp</th><th>Last recorded contact</th></tr></thead><tbody>{data.rows.map((row) => <tr key={row.contact_id}><td><strong>{row.name}</strong><span>{row.email || (row.phone ? `+${row.phone}` : 'No contact details')}</span></td><td><strong>{row.role || 'Contact'}</strong><span>{row.stage || 'No lead stage'}{row.area ? ` · ${row.area}` : ''}</span></td><td><span className={row.email_reason ? 'ma-excluded' : 'ma-eligible'}>{row.email_reason || 'Eligible'}</span></td><td><span className={row.whatsapp_reason ? 'ma-excluded' : 'ma-eligible'}>{row.whatsapp_reason || 'Eligible'}</span></td><td>{row.last_contacted_at ? new Date(row.last_contacted_at).toLocaleDateString() : 'No recorded contact'}</td></tr>)}</tbody></table></div>
      {!data.rows.length && <p className="ma-empty">No visible CRM contacts match these rules.</p>}
      <footer className="ma-paging"><span>{data.matched ? `${offset + 1}–${offset + data.rows.length} of ${count(data.matched)}` : '0 contacts'}</span><div><button className="ma-button" type="button" disabled={!offset || applying} onClick={() => setOffset(offset - 25)}>Previous</button><button className="ma-button" type="button" disabled={offset + 25 >= data.matched || applying} onClick={() => setOffset(offset + 25)}>Next</button></div></footer>
    </>}
    <p className="ma-muted">Matches use visible CRM records. Eligibility uses separate channel permissions and deduplicates delivery destinations. Contact history reflects recorded activity visible to you.</p>
    {onApply && <div className="ma-apply">
      <p>This replaces the draft’s recipients with the current eligible selection. Membership stays live in the library; the draft keeps the selection you review here.</p>
      {eligible > cap && <p className="ma-error">Narrow this audience to {count(cap)} recipients or fewer for a reviewed selection in this channel.</p>}
      <label><input type="checkbox" checked={reviewed} disabled={current.loading || !eligible || Boolean(current.error) || eligible > cap || (channel === 'email' && (!selectedCategory || !canSend))} onChange={(event) => setReviewed(event.target.checked)} />I reviewed this audience and want to use these recipients.</label>
      <button type="button" className="ma-button ma-primary" disabled={applying || !reviewed || Boolean(current.error)} onClick={() => void apply()}>{applying ? 'Checking selection…' : `Use ${count(eligible)} ${eligible === 1 ? 'recipient' : 'recipients'}`}<ArrowRight size={15} /></button>
    </div>}
    {onChoose && data && !current.error && <button type="button" className="ma-button ma-primary" disabled={applying} onClick={async () => { if (lock.current) return; lock.current = true; setApplying(true); try { await onChoose(reviewedAudience) } catch (error) { setState((old) => ({ ...old, error: error.message })) } finally { lock.current = false; setApplying(false) } }}>Use this live audience<ArrowRight size={15} /></button>}
  </section>
}

function RuleValues({ field, values, onChange, label }) {
  const [text, setText] = useState(() => values.join(', '))
  return <input aria-label={label} inputMode={field === 'budget' ? 'decimal' : 'text'} placeholder={field === 'budget' ? 'Amount in your CRM currency' : 'Values separated by commas'} value={text} onChange={(event) => { setText(event.target.value); onChange(event.target.value.split(',').map((value) => value.trim())) }} />
}

function AudienceBuilder({ organisationId, initial, library, channel, onSaved, onCancel }) {
  const [draft, setDraft] = useState(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [agents, setAgents] = useState([])
  const [agentError, setAgentError] = useState('')
  const [ruleVersion, setRuleVersion] = useState(0)
  const lock = useRef(false)
  const needsAgents = draft.definition.rules.some((item) => item.field === 'owner')
  useEffect(() => { if (!needsAgents) return; let current = true; listOrganisationUsersForWorkspace({ organisationId }).then((rows) => { if (current) { setAgents(rows); setAgentError('') } }).catch(() => { if (current) setAgentError('The agent directory could not be loaded. Me and Unassigned are still available.') }); return () => { current = false } }, [organisationId, needsAgents])
  const update = (fields) => setDraft((old) => ({ ...old, ...fields }))
  const changeDefinition = (fields) => update({ definition: { ...draft.definition, ...fields } })
  const rule = (index, fields) => changeDefinition({ rules: draft.definition.rules.map((item, i) => i === index ? { ...item, ...fields } : item) })
  async function save(event) {
    event.preventDefault(); if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { const saved = await saveMarketingAudience(organisationId, draft); await onSaved(saved) } catch (cause) { setError(cause.message) }
    finally { lock.current = false; setBusy(false) }
  }
  return <div className="ma-builder"><form onSubmit={save}>
    <h3>{draft.id ? 'Edit audience' : 'Create audience'}</h3>
    <label>Audience name<input required maxLength={120} value={draft.name} onChange={(event) => update({ name: event.target.value })} placeholder="e.g. Buyers ready for their next home" /></label>
    <label>Description<textarea maxLength={600} rows={2} value={draft.description} onChange={(event) => update({ description: event.target.value })} /></label>
    <label>Who can reuse it?<select value={draft.visibility} onChange={(event) => update({ visibility: event.target.value })}><option value="personal">Only me</option>{library.canShare && <option value="agency">Agency</option>}</select></label>
    <div className="ma-rule-heading"><h4>CRM filters</h4><select aria-label="Match audience rules" value={draft.definition.match} onChange={(event) => changeDefinition({ match: event.target.value })}><option value="all">Match all rules</option><option value="any">Match any rule</option></select></div>
    {draft.definition.rules.map((item, index) => <div className="ma-rule" key={`${ruleVersion}:${index}`}>
      <select aria-label={`Rule ${index + 1} field`} value={item.field} onChange={(event) => rule(index, { field: event.target.value, operator: event.target.value === 'budget' ? 'gte' : 'in', values: [] })}>{Object.entries(AUDIENCE_FIELDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select aria-label={`Rule ${index + 1} comparison`} value={item.operator} onChange={(event) => rule(index, { operator: event.target.value })}>{(item.field === 'budget' ? [['gte', 'At least'], ['lte', 'At most']] : item.field === 'owner' ? [['in', 'Is any of'], ['not_in', 'Is none of']] : [['in', 'Is any of'], ['not_in', 'Is none of'], ['contains', 'Contains']]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      {item.field === 'owner' ? <select aria-label={`Rule ${index + 1} value`} value={item.values[0] || ''} onChange={(event) => rule(index, { values: [event.target.value] })}><option value="">Choose an agent</option><option value="me">Me</option><option value="unassigned">Unassigned</option>{agents.map((agent) => <option value={agent.userId || agent.user_id || agent.id} key={agent.id}>{agent.fullName || agent.name || agent.email}</option>)}</select> : <RuleValues key={`${index}:${item.field}`} field={item.field} label={`Rule ${index + 1} value`} values={item.values} onChange={(values) => rule(index, { values })} />}
      <button type="button" className="ma-icon-button" aria-label={`Remove rule ${index + 1}`} disabled={draft.definition.rules.length === 1} onClick={() => { changeDefinition({ rules: draft.definition.rules.filter((_, i) => i !== index) }); setRuleVersion((value) => value + 1) }}><X size={16} /></button>
    </div>)}
    {needsAgents && agentError && <p role="status" className="ma-muted">{agentError}</p>}
    <button type="button" className="ma-button" disabled={draft.definition.rules.length >= 12} onClick={() => changeDefinition({ rules: [...draft.definition.rules, { field: 'area', operator: 'in', values: [] }] })}><Plus size={14} />Add rule</button>
    <div className="ma-contact-policy"><label><input type="checkbox" checked={draft.definition.excludeClosed} onChange={(event) => changeDefinition({ excludeClosed: event.target.checked })} />Exclude closed, lost and archived leads</label><label>Quiet period (days)<input type="number" min={0} max={365} value={draft.definition.quietDays} onChange={(event) => changeDefinition({ quietDays: event.target.value === '' ? 0 : Number(event.target.value) })} /></label><p>Exclude people with recorded contact within this period from both channels. Set 0 to show recent-contact warnings without excluding them.</p></div>
    {error && <p role="alert" className="ma-error">{error}</p>}
    <div className="ma-form-actions"><button type="button" className="ma-button" disabled={busy} onClick={onCancel}>Cancel</button><button className="ma-button ma-primary" type="submit" disabled={busy || !draft.name.trim() || !valid(draft.definition)}>{busy ? 'Saving…' : 'Save audience'}</button></div>
  </form><AudiencePreview organisationId={organisationId} definition={draft.definition} channel={channel} categories={library.subscriptionTypes} canSend={library.canShare} compact /></div>
}

export default function MarketingAudiences(props) {
  return <AudienceLibrary key={props.organisationId} {...props} />
}

function AudienceLibrary({ organisationId, channel = 'crm', subscriptionId, onApply, onChoose, initialCreate = false }) {
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ key: '', data: null, error: '' })
  const [editing, setEditing] = useState(() => initialCreate ? { name: '', description: '', visibility: 'personal', definition: emptyAudienceDefinition() } : null)
  const [selected, setSelected] = useState(null)
  const [archive, setArchive] = useState(null)
  const [error, setError] = useState('')
  const [archiving, setArchiving] = useState(false)
  const requestKey = JSON.stringify([organisationId, query, offset, attempt])
  useEffect(() => {
    let current = true
    const timer = setTimeout(() => {
      loadMarketingAudiences(organisationId, query, offset).then((data) => { if (current) setState({ key: requestKey, data, error: '' }) }).catch((cause) => { if (current) setState({ key: requestKey, data: null, error: cause.message }) })
    }, query ? 250 : 0)
    return () => { current = false; clearTimeout(timer) }
  }, [requestKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const library = state.key === requestKey ? state.data : null
  const loadError = state.key === requestKey ? state.error : ''
  const start = (name = '', definition = emptyAudienceDefinition()) => { setEditing({ name, description: '', visibility: 'personal', definition }); setSelected(null); setError('') }
  const refresh = () => setAttempt((value) => value + 1)
  return <section className="ma-library" aria-label="Shared CRM audiences">
    <header className="ma-heading"><div><UsersRound size={22} /><h2>Shared CRM audiences</h2></div><div><button type="button" className="ma-button" onClick={refresh}><RefreshCw size={15} />Refresh</button><button type="button" className="ma-button ma-primary" disabled={!library} onClick={() => start()}><Plus size={16} />Create audience</button></div></header>
    <p className="ma-intro">Define the right people once. Reuse the same live CRM audience in Campaigns, Email and WhatsApp.</p>
    {loadError && <p role="alert" className="ma-error">{loadError}</p>}
    {error && <p role="alert" className="ma-error">{error}</p>}
    {!library && !loadError && <p role="status" className="ma-muted">Loading shared audiences…</p>}
    {library && (editing ? <AudienceBuilder key={editing.id || 'new'} organisationId={organisationId} initial={editing} library={library} channel={channel} onCancel={() => setEditing(null)} onSaved={(saved) => { setEditing(null); setSelected(saved); refresh() }} /> : selected ? <><button type="button" className="ma-back" onClick={() => { setSelected(null); refresh() }}><ArrowLeft size={15} />All audiences</button><AudiencePreview key={`${selected.id}:${selected.revision}`} organisationId={organisationId} audience={selected} channel={channel} subscriptionId={subscriptionId} categories={library.subscriptionTypes} canSend={library.canShare} onApply={onApply} onChoose={onChoose} /></> : <>
      <div className="ma-starters">{starters.map(([name, detail, rule]) => <button key={name} type="button" onClick={() => start(name, { ...emptyAudienceDefinition(), rules: [rule], excludeClosed: name !== 'Past clients', quietDays: name === 'Reconnect' ? 30 : 0 })}><Filter size={18} /><strong>{name}</strong><span>{detail}</span><ArrowRight size={15} /></button>)}</div>
      <div className="ma-list-heading"><label><Search size={16} /><input type="search" aria-label="Search shared audiences" placeholder="Search audiences…" value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0) }} /></label><span>{count(library.total)} saved audiences</span></div>
      <div className="ma-list">{library.audiences.map((audience) => { const editable = audience.created_by === library.actorId || (audience.visibility === 'agency' && library.canShare); return <article key={audience.id}><div className="ma-audience-icon"><UsersRound size={22} /></div><div className="ma-audience-copy"><h3>{audience.name}</h3><p>{audience.description || `${audience.definition.rules.length} CRM rules · ${audience.definition.match === 'all' ? 'All' : 'Any'} must match`}</p><span>{audience.visibility === 'agency' ? 'Agency' : 'Personal'} · Live CRM membership{audience.definition.quietDays ? ` · ${audience.definition.quietDays}-day quiet period` : ''}</span></div><div className="ma-row-actions"><button className="ma-button ma-primary" type="button" onClick={() => setSelected(audience)}>Preview<ArrowRight size={14} /></button>{editable && <button className="ma-button" type="button" onClick={() => { setSelected(null); setEditing(structuredClone(audience)) }}>Edit</button>}<button type="button" className="ma-icon-button" aria-label={`Duplicate ${audience.name}`} onClick={() => start(`${audience.name} copy`, structuredClone(audience.definition))}><Copy size={15} /></button>{editable && <button type="button" className="ma-text-button" onClick={() => setArchive(audience)}>Archive</button>}</div></article> })}</div>
      {!library.audiences.length && <p className="ma-empty">{query ? 'No audiences match this search.' : 'Start with a suggested audience, then refine it for your CRM.'}</p>}
      <footer className="ma-paging"><span>Audience definitions are shared; each channel checks its own eligibility.</span><div><button className="ma-button" type="button" disabled={!offset} onClick={() => setOffset(offset - 20)}>Previous</button><button className="ma-button" type="button" disabled={offset + 20 >= library.total} onClick={() => setOffset(offset + 20)}>Next</button></div></footer>
    </>)}
    {archive && <div className="ma-archive" role="alert"><p>Archive “{archive.name}”? Existing draft recipient selections stay unchanged.</p><button className="ma-button" disabled={archiving} type="button" onClick={() => setArchive(null)}>Cancel</button><button className="ma-button" type="button" disabled={archiving} onClick={async () => { setArchiving(true); try { await archiveMarketingAudience(organisationId, archive); setArchive(null); refresh() } catch (cause) { setError(cause.message) } finally { setArchiving(false) } }}>Archive audience</button></div>}
  </section>
}

export function MarketingAudiencePicker({ organisationId, channel, subscriptionId, onApply }) {
  const [open, setOpen] = useState(false)
  return <div className="ma-picker"><button className="ma-button" type="button" onClick={() => setOpen(true)}><UsersRound size={17} />Choose a shared CRM audience</button><Modal open={open} title="Choose a shared audience" onClose={() => setOpen(false)} className="ma-library-modal">{open && <MarketingAudiences key={`${organisationId}:${channel}`} organisationId={organisationId} channel={channel} subscriptionId={subscriptionId} onApply={async (ids, audience) => { await onApply(ids, audience); setOpen(false) }} />}</Modal></div>
}

export function CampaignAudience({ campaign, canEdit }) {
  const [state, setState] = useState({ key: '', audience: null, error: '' })
  const [open, setOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const requestKey = JSON.stringify([campaign.organisation_id, campaign.id, attempt])
  const loading = state.key !== requestKey
  const { audience, error } = loading ? { audience: null, error: '' } : state
  useEffect(() => { let current = true; loadCampaignAudience(campaign.organisation_id, campaign.id).then((audience) => { if (current) setState({ key: requestKey, audience, error: '' }) }).catch((cause) => { if (current) setState({ key: requestKey, audience: null, error: cause.message }) }); return () => { current = false } }, [requestKey]) // eslint-disable-line react-hooks/exhaustive-deps
  return <section className="mc-panel ma-campaign"><header><UsersRound size={20} /><h2>Live CRM audience</h2></header>{loading ? <p role="status">Loading campaign audience…</p> : error ? <p role="alert" className="ma-error">{error}</p> : audience ? <><h3>{audience.name}{audience.archived ? ' · Archived' : ''}</h3><p>{audience.description || 'Membership updates with the CRM.'}</p></> : <p>Connect a reusable CRM audience to this campaign.</p>}
    <div className="ma-campaign-actions"><button type="button" className="ma-button" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={14} />Refresh</button><button className="ma-button" type="button" onClick={() => setOpen(true)}>{canEdit ? audience ? 'Change / review audience' : 'Choose an audience' : 'Browse audiences'}</button>{canEdit && audience && <button className="ma-text-button" type="button" onClick={async () => { try { await attachCampaignAudience(campaign.organisation_id, campaign.id, null); setState({ key: requestKey, audience: null, error: '' }) } catch (cause) { setState((old) => ({ ...old, error: cause.message })) } }}>Remove from campaign</button>}</div>
    {campaign.audience && <p className="ma-muted">Audience notes: {campaign.audience}</p>}
    <Modal open={open} title="Campaign audience" onClose={() => setOpen(false)} className="ma-library-modal">{open && <MarketingAudiences key={campaign.id} organisationId={campaign.organisation_id} onChoose={canEdit ? async (selected) => { await attachCampaignAudience(campaign.organisation_id, campaign.id, selected.id); setState({ key: requestKey, audience: selected, error: '' }); setOpen(false) } : undefined} />}</Modal>
  </section>
}
