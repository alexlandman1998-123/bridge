import { useId, useState } from 'react'
import { ArrowUpRight, CalendarDays, Clock3, MapPin, PartyPopper, UserRound } from 'lucide-react'
import Button from '../ui/Button'
import Field from '../ui/Field'
import Modal from '../ui/Modal'
import './development-marketing-events.css'

const dateFormat = new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit' })
const validDate = value => { const date = value ? new Date(value) : null; return date && Number.isFinite(date.getTime()) ? date : null }
const typeLabel = type => type === 'launch' ? 'Launch' : 'Show day'
const statusLabel = value => String(value || 'upcoming').replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase())
const blankDraft = eventType => ({ eventType, title: '', startsAt: '', location: '', description: '' })

function organiserName(event, users) {
  const person = users.find(user => event.createdBy && [user.id, user.userId, user.user_id].includes(event.createdBy))
  return person?.fullName || person?.full_name || person?.name || [person?.firstName || person?.first_name, person?.lastName || person?.last_name].filter(Boolean).join(' ') || 'Agent not recorded'
}

export default function DevelopmentMarketingEvents({ events = [], organisationUsers = [], canManage = false, saving = false, onCreate, now }) {
  const formId = useId()
  const [openedAt] = useState(Date.now)
  const [draft, setDraft] = useState(null)
  const [saveError, setSaveError] = useState('')
  const past = event => ['completed', 'past', 'cancelled', 'ended'].includes(String(event.status).toLowerCase()) || (validDate(event.endsAt || event.startsAt)?.getTime() ?? Infinity) < (now ?? openedAt)
  const upcoming = events.filter(event => !past(event)).sort((a, b) => (validDate(a.startsAt)?.getTime() ?? Infinity) - (validDate(b.startsAt)?.getTime() ?? Infinity))
  const history = events.filter(past).sort((a, b) => (validDate(b.startsAt || b.createdAt)?.getTime() ?? 0) - (validDate(a.startsAt || a.createdAt)?.getTime() ?? 0))
  function open(type) { setSaveError(''); setDraft(blankDraft(type)) }
  function update(key, value) { setDraft(current => ({ ...current, [key]: value })) }
  async function submit(event) {
    event.preventDefault()
    if (saving) return
    setSaveError('')
    try {
      if (await onCreate(draft) !== false) setDraft(null)
      else setSaveError('The event could not be saved. Your details are still here; try again.')
    } catch (error) { setSaveError(error.message || 'The event could not be saved. Try again.') }
  }
  function eventList(items, empty) {
    return items.length ? <div className="development-event-list">{items.map(item => {
      const start = validDate(item.startsAt)
      const organiser = organiserName(item, organisationUsers)
      return <article key={item.id} className="development-event-row">
        <div className="development-event-date" aria-hidden="true">{start ? <><strong>{start.getDate()}</strong><span>{start.toLocaleDateString('en-ZA', { month: 'short' })}</span></> : <CalendarDays size={24} />}</div>
        <div className="development-event-content"><div className="development-event-title"><h5>{item.title}</h5><span className={`development-event-badge ${item.eventType === 'launch' ? 'is-launch' : ''}`}>{typeLabel(item.eventType)}</span><span className="development-event-status">{statusLabel(item.status)}</span></div>
          <div className="development-event-meta"><span><Clock3 size={14} aria-hidden="true" />{start ? `${dateFormat.format(start)} · ${timeFormat.format(start)}` : 'Date to be confirmed'}</span><span><MapPin size={14} aria-hidden="true" />{item.location || 'Location to be confirmed'}</span></div>
          {item.description ? <p className="development-event-notes">{item.description}</p> : null}
        </div>
        <div className="development-event-organiser"><span className="development-event-avatar" aria-hidden="true"><UserRound size={18} /></span><div><span>Organised by</span><strong>{organiser}</strong></div></div>
      </article>
    })}</div> : <div className="development-event-empty"><CalendarDays size={25} aria-hidden="true" /><p>{empty}</p></div>
  }
  return <section className="development-marketing-events" aria-label="Development events">
    <header className="development-events-heading"><span className="development-events-eyebrow">Bring buyers closer</span><h3>Make it an occasion.</h3><p>Plan a show day or celebrate a launch, and keep every event in one place.</p></header>
    {canManage ? <div className="development-event-actions">
      <button type="button" className="development-event-action is-show-day" onClick={() => open('show_day')}><span className="development-event-action-icon"><CalendarDays size={28} aria-hidden="true" /></span><span><strong>Create show day</strong><small>Invite buyers to experience the development.</small></span><ArrowUpRight size={22} aria-hidden="true" /></button>
      <button type="button" className="development-event-action is-launch" onClick={() => open('launch')}><span className="development-event-action-icon"><PartyPopper size={28} aria-hidden="true" /></span><span><strong>Create launch</strong><small>Give your next milestone a memorable debut.</small></span><ArrowUpRight size={22} aria-hidden="true" /></button>
    </div> : null}
    <section className="development-events-panel" aria-label="Upcoming events"><div className="development-events-section-heading"><div><span className="development-events-eyebrow">On the calendar</span><h4>Upcoming events</h4></div><span className="development-event-count">{upcoming.length}</span></div>{eventList(upcoming, 'No upcoming events. Your next show day or launch will appear here.')}</section>
    <section className="development-events-panel" aria-label="Past events"><div className="development-events-section-heading"><div><span className="development-events-eyebrow">Event history</span><h4>Past events</h4></div><span className="development-event-count">{history.length}</span></div>{eventList(history, 'No past events yet. Completed and cancelled events will be kept here.')}</section>
    <Modal open={Boolean(draft)} onClose={saving ? undefined : () => setDraft(null)} title={draft?.eventType === 'launch' ? 'Create launch' : 'Create show day'} subtitle="Add the details for this development event. You will be recorded as the organiser." className="development-event-modal">
      {draft ? <form id={formId} onSubmit={submit} className="development-event-form" aria-busy={saving}>
        <label>Event title<Field value={draft.title} onChange={event => update('title', event.target.value)} placeholder={draft.eventType === 'launch' ? 'e.g. Harbour Heights launch evening' : 'e.g. Sunday at Harbour Heights'} required disabled={saving} /></label>
        <label>Date and time<Field type="datetime-local" value={draft.startsAt} onChange={event => update('startsAt', event.target.value)} required disabled={saving} /></label>
        <label>Location<Field addressSearch value={draft.location} onChange={event => update('location', event.target.value)} placeholder="Venue or meeting point" disabled={saving} /></label>
        <label>Notes <span>(optional)</span><Field as="textarea" value={draft.description} onChange={event => update('description', event.target.value)} placeholder="Arrival details, parking or anything guests should know" rows={3} disabled={saving} /></label>
        {saveError ? <p role="alert" className="development-event-error">{saveError}</p> : null}
        <div className="development-event-form-actions"><Button type="button" variant="secondary" disabled={saving} onClick={() => setDraft(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Creating…' : draft.eventType === 'launch' ? 'Create launch' : 'Create show day'}</Button></div>
      </form> : null}
    </Modal>
  </section>
}
