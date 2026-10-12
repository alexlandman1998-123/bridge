import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, ArrowRight, ChevronDown, ChevronRight, Search, RefreshCw, Phone, MessageSquare, StickyNote, Users, Megaphone, FileText, CalendarDays, CheckSquare, BriefcaseBusiness, CircleDot, Link2 } from 'lucide-react'
import { ACTIVITY_VIEWS, activityDirection, filterActivity, groupActivity, isCampaignActivity, matchesActivityView } from '../../core/clients/clientActivityTimeline'
import './clientActivityTimeline.css'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { CLIENT_ACTIVITY_CATEGORIES, CLIENT_INTERACTION_TYPES, clientActivityRecordPath, loadClientActivity, logClientInteraction } from '../../services/clientActivityService'

const formatTime = (value) => new Date(value).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
const actorLabels = { staff: 'Staff action', client: 'Client action', system: 'System', historical: 'Earlier record' }
const localTime = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export default function ClientActivityPanel({ client, onChanged, refreshToken = 0, previewData }) {
  const [category, setCategory] = useState('all')
  const [view, setView] = useState('all')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [expanded, setExpanded] = useState(new Set())
  const [autoUpdate, setAutoUpdate] = useState(true)
  const [events, setEvents] = useState([])
  const [cursor, setCursor] = useState(null)
  const [available, setAvailable] = useState(Boolean(client.identityId))
  const [loading, setLoading] = useState(Boolean(client.identityId))
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [type, setType] = useState('call')
  const [detail, setDetail] = useState('')
  const [occurredAt, setOccurredAt] = useState(localTime)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState('')
  const generation = useRef(0)
  const command = useRef(null)
  const composer = useRef(null)
  const identityId = client.identityId
  const organisationId = client.organisationId
  const currentScope = useRef('')
  currentScope.current = `${organisationId}:${identityId}`

  const refresh = useCallback(async (nextCursor = null, quiet = false) => {
    const request = ++generation.current
    if (!quiet) setLoading(true)
    setError('')
    try {
      const result = previewData
        ? { ...previewData, events: previewData.events.filter(event => category === 'all' || event.category === category) }
        : await loadClientActivity({ identityId, organisationId }, { category, cursor: nextCursor })
      if (request !== generation.current) return
      setAvailable(result.available)
      setEvents((previous) => nextCursor || quiet ? [...new Map([...previous, ...result.events].map((event) => [event.id, event])).values()].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)) : result.events)
      setCursor(previous => quiet ? previous || result.nextCursor : result.nextCursor)
    } catch (cause) { if (request === generation.current) setError(cause.message || 'Unable to load client activity.') }
    finally { if (request === generation.current && !quiet) setLoading(false) }
  }, [identityId, organisationId, category, previewData])

  useEffect(() => {
    setEvents([]); setCursor(null)
    void refresh()
    return () => { generation.current += 1 }
  }, [refresh, client.identityVersion, refreshToken])
  useEffect(() => {
    setEditing(false); setSaving(false); setDetail(''); setSaveError(''); setNotice(''); setExpanded(new Set()); setView('all'); setSearch(''); setFrom(''); setTo(''); command.current = null
  }, [identityId, organisationId, previewData])


  useEffect(() => {
    if (editing) {
      composer.current?.scrollIntoView?.({ block: 'center' })
      composer.current?.querySelector('textarea')?.focus({ preventScroll: true })
    }
  }, [editing])

  useEffect(() => {
    if (!autoUpdate || previewData || !identityId || !available || loading || saving || editing) return undefined
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(null, true)
    }, 30000)
    return () => window.clearInterval(timer)
  }, [autoUpdate, previewData, identityId, available, loading, saving, editing, refresh])

  const visible = useMemo(() => filterActivity(events, { view, search, from, to }), [events, view, search, from, to])
  const groups = useMemo(() => groupActivity(visible), [visible])
  const lastContact = events.find(event => event.category === 'interaction' && !isCampaignActivity(event) && ['manual', 'lead_activities'].includes(event.origin_table))
  function openComposer(nextType = 'call') {
    setType(nextType); setEditing(true); setOccurredAt(localTime()); setSaveError('')
  }
  function toggleEntry(id) {
    setExpanded(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  async function save() {
    if (previewData) return
    const time = new Date(occurredAt)
    if (!Number.isFinite(time.getTime())) { setSaveError('Enter a valid interaction time.'); return }
    const entry = { type, detail, occurredAt: time.toISOString() }
    const fingerprint = JSON.stringify(entry)
    if (command.current?.fingerprint !== fingerprint) command.current = { fingerprint, requestId: crypto.randomUUID() }
    const scope = currentScope.current
    setSaving(true); setSaveError(''); setNotice('')
    let saved = false
    try {
      await logClientInteraction(client, { ...entry, requestId: command.current.requestId })
      saved = true
      if (currentScope.current !== scope) return
      setEditing(false); setDetail(''); command.current = null
      setNotice('Interaction saved. This logs the interaction; it does not send a message.')
      await refresh(null, true)
      await onChanged?.(identityId)
    } catch (cause) { if (currentScope.current === scope) setSaveError(saved ? 'The interaction was saved, but the directory could not refresh. Reload to see the latest activity.' : cause.message || 'Unable to save the interaction. You can retry the same entry.') }
    finally { if (currentScope.current === scope) setSaving(false) }
  }

  return <section className="client-activity-workspace" aria-label="Client activity">
    <header className="client-activity-heading">
      <div><span className="client-activity-eyebrow">THE CLIENT JOURNEY</span><h4>Client activity</h4><p>Every recorded touchpoint, together in one place.</p></div>
      <div className="client-activity-header-actions">
        {!previewData && available ? <button className="activity-live-toggle" type="button" role="switch" aria-checked={autoUpdate} onClick={() => setAutoUpdate(!autoUpdate)}><span className={autoUpdate ? 'activity-live-dot' : ''} />{autoUpdate ? 'Auto update' : 'Updates paused'}</button> : null}
        <Button variant="ghost" disabled={loading || saving || (!identityId && !previewData)} onClick={() => void refresh(null, events.length > 0)}><RefreshCw size={16} className={loading ? 'activity-spin' : ''} />Refresh</Button>
        {available && (identityId || previewData) && !error ? <Button disabled={saving || loading || Boolean(previewData)} title={previewData ? 'Mock preview is read-only' : undefined} onClick={() => editing ? setEditing(false) : openComposer()}><MessageSquare size={16} />Log interaction</Button> : null}
      </div>
    </header>
    {available && !error ? <div className="activity-summary">
      <div><span>Latest activity</span><strong>{events[0] ? formatTime(events[0].occurred_at) : 'No activity yet'}</strong><small>{events[0] ? 'Most recent recorded touchpoint' : 'New activity will appear here'}</small></div>
      <div><span>Last logged interaction</span><strong>{lastContact ? formatTime(lastContact.occurred_at) : 'Not recorded'}</strong><small>{lastContact?.actor_name || 'Calls, notes and meetings'}</small></div>
      <div><span>History loaded</span><strong>{events.length} events</strong><small>{cursor ? 'Older activity is available below' : 'All available events in this category'}</small></div>
    </div> : null}
    {available ? <div className="activity-toolbar">
      <div className="activity-view-tabs" role="group" aria-label="Activity views">{ACTIVITY_VIEWS.map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}>{label}<span>{events.filter(event => matchesActivityView(event, key)).length}</span></button>)}</div>
      <div className="activity-filter-row">
        <label className="activity-search"><Search size={17} /><input aria-label="Search activity" placeholder="Search activity, people or properties…" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label className="activity-category"><span className="sr-only">Activity filter</span><Field as="select" value={category} disabled={saving} onChange={event => setCategory(event.target.value)}>{CLIENT_ACTIVITY_CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Field></label>
        <div className="activity-date-range"><label><span>From</span><input aria-label="Activity from date" type="date" max={to || undefined} value={from} onChange={event => setFrom(event.target.value)} /></label><label><span>To</span><input aria-label="Activity to date" type="date" min={from || undefined} value={to} onChange={event => setTo(event.target.value)} /></label></div>
      </div>
      <div className="activity-toolbar-footer"><p>{view === 'work' ? 'Workflow history: tasks, appointments, documents, offers and transaction updates. Past events do not confirm that work is still open.' : 'Search, view counts and dates apply to loaded history. Load older activity to look further back.'}</p>{view !== 'all' || search || from || to || category !== 'all' ? <button type="button" onClick={() => { setView('all'); setSearch(''); setFrom(''); setTo(''); setCategory('all') }}>Clear filters</button> : null}</div>
    </div> : null}
    {!available ? <p className="rounded-xl bg-[#fff9ed] p-3 text-sm text-[#7f5b16]">Client activity is awaiting database setup and a permanent client profile.</p> : null}
    {notice ? <p role="status" className="rounded-xl bg-[#edfdf3] p-3 text-sm text-[#1c7d45]">{notice}</p> : null}
    {saveError ? <p role="alert" className="rounded-xl bg-[#fff5f5] p-3 text-sm text-[#b42318]">{saveError}</p> : null}
    {editing && !previewData ? <form ref={composer} className="activity-composer grid gap-3" onSubmit={(event) => { event.preventDefault(); void save() }}>
      <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Interaction type<Field as="select" value={type} disabled={saving} onChange={(event) => setType(event.target.value)}>{CLIENT_INTERACTION_TYPES.map((key) => <option key={key} value={key}>{key.charAt(0).toUpperCase() + key.slice(1)}</option>)}</Field></label>
        <label className="grid gap-1 text-sm">When it happened<Field type="datetime-local" value={occurredAt} disabled={saving} onChange={(event) => setOccurredAt(event.target.value)} required /></label></div>
      <label className="grid gap-1 text-sm">Interaction details<Field as="textarea" rows={3} maxLength={4000} value={detail} disabled={saving} onChange={(event) => setDetail(event.target.value)} required /></label>
      <p className="text-xs leading-5 text-[#637890]">Record a call, meeting or message that took place. Entries remain in the history. Logging an email or message does not send it.</p>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button><Button type="submit" disabled={saving || !detail.trim()}>{saving ? 'Saving…' : 'Save interaction'}</Button></div>
    </form> : null}
    {error ? <p role="alert" className="rounded-xl bg-[#fff5f5] p-3 text-sm text-[#b42318]">{error}</p> : null}
    {loading && !events.length ? <p role="status" className="text-sm text-[#637890]">Loading client activity…</p> : null}
    {available && !loading && !error && !groups.length ? <div className="activity-empty"><CircleDot size={28} /><h5>{events.length ? 'No matching activity' : 'No recorded activity yet'}</h5><p>{events.length ? 'Try another view, change the dates or load older activity.' : 'Recorded interactions and linked client actions will appear here.'}</p></div> : null}
    <ol className="activity-timeline">{groups.map((group, index) => {
      const event = group.events[0]
      const previous = groups[index - 1]?.events[0]
      const day = new Date(event.occurred_at).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      const showDay = !previous || new Date(previous.occurred_at).toDateString() !== new Date(event.occurred_at).toDateString()
      const isOpen = expanded.has(group.id)
      const direction = activityDirection(event)
      const Icon = group.campaign ? Megaphone : ({ document: FileText, appointment: CalendarDays, task: CheckSquare, transaction: BriefcaseBusiness, offer: FileText, enquiry: ArrowDownLeft, portal: Users }[event.category] || MessageSquare)
      const title = group.campaign && group.events.length > 1 ? event.detail || 'Campaign activity' : event.title
      const path = previewData ? null : clientActivityRecordPath(event)
      return <li key={group.id}>
        {showDay ? <div className="activity-day-label">{day}</div> : null}
        <article className={`activity-timeline-entry activity-tone-${group.campaign ? 'campaign' : event.category || 'interaction'}`}>
          <div className="activity-marker"><Icon size={18} /></div>
          <div className="activity-entry-content">
            <div className="activity-entry-meta"><span className={`activity-direction activity-direction-${direction}`}>{direction === 'incoming' ? <ArrowDownLeft size={12} /> : direction === 'outgoing' ? <ArrowUpRight size={12} /> : <CircleDot size={12} />}{direction === 'internal' ? 'Workspace' : direction === 'incoming' ? 'Incoming' : 'Outgoing'}</span><span>{group.campaign ? 'Campaign' : CLIENT_ACTIVITY_CATEGORIES.find(([key]) => key === event.category)?.[1] || 'Interaction'}</span><time dateTime={event.occurred_at} title={formatTime(event.occurred_at)}>{new Date(event.occurred_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</time></div>
            <button type="button" className="activity-entry-toggle" aria-expanded={isOpen} aria-controls={`activity-details-${group.id}`} onClick={() => toggleEntry(group.id)}><h5>{title}</h5>{isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button>
            {event.detail && !(group.campaign && group.events.length > 1) ? <p className="activity-entry-preview">{event.detail}</p> : null}
            {group.campaign ? <div className="activity-campaign-milestones" aria-label="Recorded campaign milestones">{[...group.events].reverse().map(item => <span key={item.id}>{item.title.replace(/^Campaign /, '')}</span>)}</div> : null}
            <div className="activity-entry-footer"><span className="activity-avatar" aria-hidden="true">{event.actor_name ? event.actor_name.split(' ').map(word => word[0]).slice(0, 2).join('') : event.actor_kind === 'client' ? 'C' : 'S'}</span><span>{event.actor_name ? `Recorded by ${event.actor_name}` : actorLabels[event.actor_kind] || 'Recorded action'}</span>{event.historical ? <span>Historical record</span> : null}{path ? <Link to={path} className="activity-record-link">Open linked record<ArrowRight size={13} /></Link> : null}</div>
            {isOpen ? <div id={`activity-details-${group.id}`} className="activity-expanded-details">
              <span className="client-activity-eyebrow">RECORDED DETAILS</span>
              {group.events.map(item => <div key={item.id}><strong>{item.title}</strong><time dateTime={item.occurred_at}>{formatTime(item.occurred_at)}</time>{item.detail ? <p>{item.detail}</p> : null}<small>{actorLabels[item.actor_kind] || 'Recorded action'}{item.actor_name ? ` · ${item.actor_name}` : ''}</small></div>)}
              {group.campaign ? <p className="activity-tracking-note">Opens and clicks are tracking signals and may include automated activity. Only a recorded response confirms a reply.</p> : null}
              {!path ? <small><Link2 size={12} />{previewData ? 'Local preview · linked records are disabled' : 'No linked record action is available for this entry.'}</small> : null}
            </div> : null}
          </div>
        </article>
      </li>
    })}</ol>
    {cursor ? <div className="flex justify-center"><Button variant="secondary" disabled={loading || saving} onClick={() => void refresh(cursor)}>{loading ? 'Loading…' : 'Load older activity'}</Button></div> : null}
    {available && !editing ? <div className="activity-quick-log"><span>Record a touchpoint</span>{[['call', 'Call', Phone], ['note', 'Note', StickyNote], ['meeting', 'Meeting', Users], ['message', 'Message', MessageSquare]].map(([key, label, icon]) => <button key={key} type="button" disabled={loading || saving || Boolean(previewData) || Boolean(error)} title={previewData ? 'Mock preview is read-only' : undefined} onClick={() => openComposer(key)}>{createElement(icon, { size: 15 })}{label}</button>)}</div> : null}
  </section>
}
