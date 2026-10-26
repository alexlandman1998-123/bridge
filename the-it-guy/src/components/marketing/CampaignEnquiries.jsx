import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, Clock3, Plus, RefreshCw, Search, UsersRound } from 'lucide-react'
import { MarketingLink as Link } from './MarketingNavigation.jsx'
import Modal from '../ui/Modal'
import { playbookFollowUpSuggestion } from '../../services/campaignPlaybookModel'
import { ENQUIRY_CHANNELS, loadCampaignEnquiries, saveCampaignEnquiryAction, searchCampaignLeads } from '../../services/campaignEnquiryService'
import { calendarDateKey, shiftCalendarDate } from '../../services/marketingCalendarModel'
import './CampaignEnquiries.css'

const sastInput = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value))
  const part = (name) => parts.find((item) => item.type === name)?.value
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}
const toTimestamp = (value) => value && Number.isFinite(Date.parse(`${value}:00+02:00`)) ? new Date(`${value}:00+02:00`).toISOString() : ''
const timestamp = (value) => value ? new Date(value).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'No contact log'
const dueLabel = (value) => value ? new Date(`${value}T12:00:00Z`).toLocaleDateString('en-ZA', { timeZone: 'UTC', day: 'numeric', month: 'short' }) : 'No due date'

export default function CampaignEnquiries({ campaign, userId, canEdit = false, focusLeadId = '' }) {
  const organisationId = campaign.organisation_id
  const campaignId = campaign.id
  const [state, setState] = useState({ entries: [], warnings: [], loading: true, error: '', tasksAvailable: true, activitiesAvailable: true })
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedLead, setSelectedLead] = useState(focusLeadId)
  const [dialog, setDialog] = useState(null)
  const [matches, setMatches] = useState([])
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [modalError, setModalError] = useState('')
  const [notice, setNotice] = useState('')
  const generation = useRef(0)
  const lock = useRef(false)
  const invalidate = useCallback(() => { generation.current++ }, [])
  const load = useCallback(async () => {
    const current = ++generation.current
    setState((old) => ({ ...old, loading: true, error: '' }))
    try {
      const data = await loadCampaignEnquiries({ organisationId, campaignId, userId, canManage: canEdit })
      if (current === generation.current) setState({ ...data, loading: false, error: '' })
    } catch (error) {
      if (current === generation.current) setState((old) => ({ ...old, loading: false, error: error.message }))
    }
  }, [organisationId, campaignId, userId, canEdit])
  useEffect(() => { void load(); return invalidate }, [load, invalidate])
  const leadSearch = dialog?.action === 'record' ? dialog.search : ''
  useEffect(() => {
    setMatches([])
    if (leadSearch.trim().length < 2) { setSearching(false); return }
    let current = true
    setSearching(true)
    const timer = setTimeout(() => {
      searchCampaignLeads({ organisationId, campaignId, search: leadSearch }).then((rows) => {
        if (current) setMatches(rows)
      }).catch((error) => { if (current) setModalError(error.message) })
        .finally(() => { if (current) setSearching(false) })
    }, 250)
    return () => { current = false; clearTimeout(timer) }
  }, [organisationId, campaignId, leadSearch])
  function open(action, entry = null) {
    setModalError('')
    setMatches([])
    setDialog({ action, entry, id: crypto.randomUUID(), search: '', selected: null, channel: action === 'contact' ? 'Call' : 'email', at: sastInput(), title: entry ? `Follow up with ${entry.name}` : '', dueDate: shiftCalendarDate(calendarDateKey(new Date()), 1), note: '' })
  }
  function applyRecipe(id) {
    const recipe = campaign.playbook?.followUp?.find((item) => item.id === id)
    if (!id && dialog?.entry) { setDialog((old) => ({ ...old, recipeId: '', title: `Follow up with ${old.entry.name}`, dueDate: shiftCalendarDate(calendarDateKey(new Date()), 1) })); return }
    if (recipe && dialog?.entry) { setDialog((old) => ({ ...old, ...playbookFollowUpSuggestion(recipe, old.entry), recipeId: id })); setModalError('') }
  }
  function edit(field, value) { setDialog((old) => ({ ...old, [field]: value })); setModalError('') }
  async function save(event, completion = null) {
    event?.preventDefault()
    if (lock.current) return
    const form = completion ? { action: 'complete', entry: completion, id: completion.nextTask.task_id } : dialog
    if (form.action === 'record' && !form.selected) { setModalError('Choose a CRM lead first.'); return }
    const payload = form.action === 'record' ? { channel: form.channel, respondedAt: toTimestamp(form.at) }
      : form.action === 'follow_up' ? { id: form.id, title: form.title.trim(), dueDate: form.dueDate }
        : form.action === 'contact' ? { id: form.id, channel: form.channel, contactedAt: toTimestamp(form.at), note: form.note.trim() }
          : { id: form.id }
    lock.current = true; setBusy(true); setModalError(''); setNotice('')
    try {
      await saveCampaignEnquiryAction({ organisationId, campaignId, leadId: form.selected?.id || form.entry.lead_id, action: form.action, payload })
      setDialog(null)
      setNotice({ record: 'Enquiry recorded.', contact: 'Contact added to the CRM history.', follow_up: 'Follow-up added to CRM tasks.', complete: 'Follow-up completed.' }[form.action])
      await load()
    } catch (error) {
      if (completion) setState((old) => ({ ...old, error: error.message }))
      else setModalError(error.message)
    } finally { lock.current = false; setBusy(false) }
  }
  const entries = state.entries.filter((entry) => (
    filter === 'all' || (filter === 'attention' && entry.needsAttention) || (filter === 'unassigned' && !entry.ownerId) || (filter === 'overdue' && entry.overdue) || (filter === 'awaiting' && entry.awaitingContact)
  ) && (!selectedLead || entry.lead_id === selectedLead) && `${entry.name} ${entry.email} ${entry.ownerName}`.toLowerCase().includes(search.toLowerCase()))
  return (
    <section className="mc-enquiries" aria-labelledby="mc-enquiries-heading" aria-busy={state.loading}>
      <header className="mc-enquiries-header">
        <div><UsersRound size={22} aria-hidden="true" /><h2 id="mc-enquiries-heading">Enquiries & follow-up</h2></div>
        <div><button className="mc-button" disabled={state.loading || busy} onClick={() => void load()}><RefreshCw size={15} />Refresh</button><button className="mc-button mc-primary" disabled={state.loading || Boolean(state.error) || busy} onClick={() => open('record')}><Plus size={16} />Record enquiry</button></div>
      </header>
      <p className="mc-enquiries-intro">People who responded to this campaign, connected to their CRM owner and next action.</p>
      {state.error && <p className="mc-enquiries-error" role="alert">{state.error}</p>}
      {state.warnings.map((warning) => <p role="status" className="mc-enquiries-warning" key={warning}>{warning}</p>)}
      {notice && <p role="status" className="mc-enquiries-notice">{notice}</p>}
      <div className="mc-enquiries-stats">
        {[['Enquiries', state.entries.length], ['Awaiting contact', state.activitiesAvailable ? state.entries.filter((entry) => entry.awaitingContact).length : '—'], ['Overdue follow-ups', state.tasksAvailable ? state.entries.filter((entry) => entry.overdue).length : '—'], ['Unassigned', state.entries.filter((entry) => !entry.ownerId).length]].map(([label, value]) => <div key={label}><strong>{state.loading || state.error ? '—' : value}</strong><span>{label}</span></div>)}
      </div>
      <div className="mc-enquiries-controls">
        <label><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search campaign enquiries" placeholder="Search people or agents…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <select aria-label="Enquiry filter" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All enquiries</option><option value="attention">Needs attention</option><option value="awaiting">Awaiting contact</option><option value="overdue">Overdue follow-up</option><option value="unassigned">Unassigned</option></select>
      </div>
      {selectedLead && <p className="mc-enquiries-selection">Showing the enquiry opened from your campaign work queue. <button type="button" className="mc-text-button" onClick={() => setSelectedLead('')}>Show all enquiries</button>{!state.loading && !state.error && !state.entries.some((entry) => entry.lead_id === selectedLead) && <span> This enquiry is no longer available to you.</span>}</p>}
      {state.loading && !state.entries.length ? <p className="mc-enquiries-empty" role="status">Loading campaign enquiries…</p> : entries.length ? (
        <div className="mc-enquiries-table-wrap"><table><thead><tr><th>Enquiry</th><th>Responsible agent</th><th>Last logged contact</th><th>What happens next</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
          {entries.map((entry) => <tr key={entry.id} className={entry.overdue ? 'mc-enquiry-overdue' : ''}>
            <th scope="row"><Link to={`/pipeline/leads/${encodeURIComponent(entry.lead_id)}`} className="mc-enquiry-name">{entry.name}<ArrowUpRight size={13} /></Link><span>{entry.lead.stage}</span><small>{ENQUIRY_CHANNELS[entry.channel]} · {timestamp(entry.responded_at)}</small></th>
            <td data-label="Responsible agent"><strong className={!entry.ownerId ? 'mc-enquiry-unassigned' : ''}>{entry.ownerName}</strong><Link to={`/pipeline/leads/${encodeURIComponent(entry.lead_id)}`}>Manage in CRM</Link></td>
            <td data-label="Last logged contact"><strong>{state.activitiesAvailable ? timestamp(entry.lastContact?.activity_date) : 'Unavailable'}</strong>{entry.lastContact && <span>{entry.lastContact.activity_type}</span>}{entry.canWork && <button disabled={busy} onClick={() => open('contact', entry)}>Log contact</button>}</td>
            <td data-label="What happens next">{!state.tasksAvailable ? <strong>Tasks unavailable</strong> : entry.nextTask ? <><strong>{entry.nextTask.title}</strong><span>Task owner: {entry.taskOwnerName || entry.ownerName}</span><span className={`mc-enquiry-task-due${entry.overdue ? ' mc-enquiry-due-overdue' : ''}`}><Clock3 size={12} />{entry.overdue ? 'Overdue · ' : 'Due '}{dueLabel(entry.nextTask.due_date)}</span>{entry.canWork && <button disabled={busy} onClick={() => void save(null, entry)} aria-label={`Complete follow-up for ${entry.name}`}><Check size={13} />Complete task</button>}</> : <><strong>{entry.awaitingContact ? 'Make first contact' : 'Set the next step'}</strong><span>No open CRM task</span></>}</td>
            <td>{entry.canWork && <button className="mc-button" disabled={busy || !state.tasksAvailable} onClick={() => open('follow_up', entry)} aria-label={`Add follow-up for ${entry.name}`}><Plus size={14} />Follow-up</button>}</td>
          </tr>)}
        </tbody></table></div>
      ) : !state.error && <div className="mc-enquiries-empty"><UsersRound size={28} /><h3>{state.entries.length ? 'No matching enquiries' : 'Give every response a next step'}</h3><p>{state.entries.length ? 'Try another filter or search.' : 'Record a responder from your CRM to see their agent, contact history and follow-up here.'}</p></div>}
      <p className="mc-enquiries-footnote">Enquiries are recorded associations with CRM leads. Clicks and message reads are engagement signals; they do not automatically add a responder here.</p>
      <Modal open={Boolean(dialog)} onClose={busy ? undefined : () => setDialog(null)} title={dialog?.action === 'record' ? 'Record a campaign enquiry' : dialog?.action === 'contact' ? 'Log a completed contact' : 'Add a follow-up'} className="mc-enquiry-dialog">
        {dialog && <form onSubmit={save} className="mc-enquiry-form">
          {modalError && <p role="alert" className="mc-enquiries-error">{modalError}</p>}
          {dialog.action === 'record' ? <>
            <label>Find a CRM lead<input type="search" value={dialog.search} onChange={(event) => { edit('search', event.target.value); edit('selected', null) }} placeholder="Name, email or phone" /></label>
            {searching && <p role="status">Searching CRM…</p>}
            <div className="mc-enquiry-search-results">{matches.map((lead) => <button key={lead.id} type="button" aria-pressed={dialog.selected?.id === lead.id} disabled={state.entries.some((entry) => entry.lead_id === lead.id)} onClick={() => edit('selected', lead)}><strong>{lead.name}</strong><span>{lead.email} · {lead.stage}{state.entries.some((entry) => entry.lead_id === lead.id) ? ' · Already recorded' : ''}</span></button>)}</div>
            {leadSearch.length >= 2 && !searching && !matches.length && <p>No matching CRM leads. <Link to="/pipeline/leads">Open CRM to add a lead</Link>.</p>}
            <label>How did they respond?<select value={dialog.channel} onChange={(event) => edit('channel', event.target.value)}>{Object.entries(ENQUIRY_CHANNELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </> : <p className="mc-enquiry-person">{dialog.entry.name} · {dialog.entry.ownerName}</p>}
          {dialog.action === 'follow_up' ? <>{campaign.playbook?.sourceRevision === campaign.revision && campaign.playbook?.followUp?.length > 0 && <label>Playbook action<select aria-label="Playbook action" value={dialog.recipeId || ''} onChange={(event) => applyRecipe(event.target.value)}><option value="">Write your own follow-up</option>{campaign.playbook.followUp.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.title} · {recipe.days} days after response</option>)}</select><small>Review the title and due date before creating this CRM task.</small></label>}
            <label>Next action<input required maxLength={180} value={dialog.title} onChange={(event) => edit('title', event.target.value)} /></label>
            <label>Due date<input type="date" required value={dialog.dueDate} onChange={(event) => edit('dueDate', event.target.value)} /></label>
            <p>The task is assigned to the lead’s current owner, or to you if the lead is unassigned.</p>
          </> : <>
            {dialog.action === 'contact' && <label>Contact method<select value={dialog.channel} onChange={(event) => edit('channel', event.target.value)}>{['Call', 'Email', 'WhatsApp', 'Meeting'].map((value) => <option key={value}>{value}</option>)}</select></label>}
            <label>{dialog.action === 'record' ? 'Responded at' : 'Contacted at'} (SAST)<input type="datetime-local" required max={sastInput()} value={dialog.at} onChange={(event) => edit('at', event.target.value)} /></label>
            {dialog.action === 'contact' && <label>Contact note<textarea maxLength={2000} value={dialog.note} onChange={(event) => edit('note', event.target.value)} /></label>}
          </>}
          <div className="mc-enquiry-form-actions"><button className="mc-button" type="button" disabled={busy} onClick={() => setDialog(null)}>Cancel</button><button className="mc-button mc-primary" type="submit" disabled={busy || (dialog.action === 'record' && !dialog.selected)}>{busy ? 'Saving…' : 'Save'}</button></div>
        </form>}
      </Modal>
    </section>
  )
}
