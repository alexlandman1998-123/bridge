import { useMemo, useState } from 'react'
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus } from 'lucide-react'
import { layoutCalendarDay, sastDateKey, sastParts } from '../../core/appointments/attorneyCalendarModel'
import { buildCalendarDayEvents } from './agentCalendarDisplay'
import './agent-calendar-board.css'

const HOUR_HEIGHT = 56
const views = [['day', 'Day'], ['three_day', '3 days'], ['week', 'Week'], ['month', 'Month'], ['agenda', 'Agenda']]

const formatDate = (day, options) => day.toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg', ...options })
const clock = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.floor(minutes % 60)).padStart(2, '0')}`

const matchesStatus = (event, status) => status === 'all' || event.status === status


function EventLabel({ event, place, agent, compact = false }) {
  return <>
    <span className="ac-event-time">{event.allDay ? 'All day' : event.pointInTime ? clock(event.start) : `${clock(event.start)}–${clock(event.end)}`}</span>
    <span className="ac-event-title">{event.title}</span>
    {place && !compact ? <span className="ac-event-place">{place}</span> : null}
    {event.status !== 'Confirmed' && !compact ? <span className="ac-event-state">{event.status === 'Pending' ? <Clock3 /> : event.status === 'Needs reschedule' ? <CalendarClock /> : null}{event.status}</span> : null}
    {agent && !compact ? <span className="ac-event-agent" aria-hidden="true">{agent.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('')}</span> : null}
  </>
}

export default function AgentCalendarBoard({ appointments, days, cursorDate, view, onViewChange, periodLabel, onShift, onToday, onSelectDate, onCreate, onOpen, agents, agentFilter, onAgentChange, isPrincipal, historyView, onHistoryChange, hasSnapshot, resolveListingLabel, resolveAgentName, now = new Date(), category = 'appointments', onCreateMarketing }) {
  const [status, setStatus] = useState('all')
  const noun = category === 'appointments' ? 'appointment' : 'event'
  const nounTitle = category === 'appointments' ? 'Appointments' : category === 'marketing' ? 'Marketing events' : 'All events'
  const dayEvents = useMemo(() => buildCalendarDayEvents(appointments, days), [appointments, days])
  const periodEvents = [...new Map([...dayEvents.values()].flat().map(event => [event.id, event])).values()]
  const shown = periodEvents.filter(event => matchesStatus(event, status))
  const pending = periodEvents.filter(event => event.status === 'Pending').length
  const reschedule = periodEvents.filter(event => event.status === 'Needs reschedule').length
  const timed = [...dayEvents.values()].flat().filter(event => !event.allDay && matchesStatus(event, status))
  const firstHour = Math.min(8, ...timed.map(event => Math.floor(event.start / 60)))
  const lastHour = Math.max(18, ...timed.map(event => Math.ceil(event.end / 60)))
  const hours = Array.from({ length: lastHour - firstHour }, (_, index) => firstHour + index)
  const gridStyle = { '--ac-days': days.length, '--ac-hours': hours.length, '--ac-height': `${hours.length * HOUR_HEIGHT}px` }
  const today = sastDateKey(now)
  const placeFor = event => event.appointment.calendarSource === 'marketing' ? event.appointment.marketingItem.campaignName || '' : resolveListingLabel(event.appointment.listingId) || event.appointment.location || ''
  const agentFor = event => event.appointment.calendarSource === 'marketing' ? '' : event.appointment.assignedAgentName || event.appointment.agentName || resolveAgentName(event.appointment.assignedAgentId || event.appointment.agentId || event.appointment.createdBy)
  const describe = event => `${event.title}, ${event.allDay ? 'All day' : event.pointInTime ? clock(event.start) : `${clock(event.start)} to ${clock(event.end)}`}, ${event.status}${placeFor(event) ? `, ${placeFor(event)}` : ''}${agentFor(event) ? `, ${agentFor(event)}` : ''}`
  const filtered = status !== 'all' || agentFilter !== 'all'
  const clearFilters = () => { setStatus('all'); onAgentChange('all') }
  const dayButton = day => <button type="button" className="ac-day-number" aria-label={`View ${formatDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}`} onClick={() => onSelectDate(day)}>{sastParts(day).day}</button>

  return <div className="arch9-agent-calendar">
    <header className="ac-header">
    <div className="ac-heading"><h2>Calendar</h2><button type="button" className="ac-button ac-primary" onClick={category === 'marketing' ? onCreateMarketing : () => onCreate()}><Plus size={16} />{category === 'marketing' ? 'Plan marketing' : 'Appointment'}</button></div>
    <div className="ac-toolbar">
      <div className="ac-date-controls"><span className="ac-range">{periodLabel}</span><button type="button" className="ac-button ac-icon-button" aria-label="Previous period" onClick={() => onShift(-1)}><ChevronLeft /></button><button type="button" className="ac-button ac-icon-button" aria-label="Next period" onClick={() => onShift(1)}><ChevronRight /></button><button type="button" className="ac-button" onClick={onToday}>Today</button></div>
      <select className="ac-select" aria-label="Calendar view" value={view} onChange={event => onViewChange(event.target.value)}>{views.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
    </div>
    <div className="ac-filters">
      {isPrincipal ? <select className="ac-select" aria-label={category === 'all' ? 'Appointment agent filter' : 'Calendar agent filter'} value={agentFilter} onChange={event => onAgentChange(event.target.value)}><option value="all">All agents</option>{agents.map(agent => <option key={agent.id || agent.email} value={agent.id || agent.email}>{agent.name}</option>)}</select> : null}
      <select className="ac-select" aria-label="Filter by status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{[...new Set(['Confirmed', 'Accepted', 'Pending', 'Needs reschedule', 'Completed', 'Cancelled', 'Declined', 'No show', 'Draft', ...periodEvents.map(event => event.status)])].map(label => <option key={label}>{label}</option>)}</select>
      {category !== 'marketing' ? <select className="ac-select" aria-label="Calendar records" value={historyView} onChange={event => { onHistoryChange(event.target.value); setStatus('all') }}><option value="work">Active work</option><option value="history">History and drafts</option><option value="archived">Archived</option></select> : null}
      <div className="ac-counts"><span>{hasSnapshot ? `${shown.length} ${noun}${shown.length === 1 ? '' : 's'}` : 'Counts unavailable'}</span>{hasSnapshot && pending > 0 ? <button type="button" className="ac-count ac-pending" aria-pressed={status === 'Pending'} onClick={() => setStatus(status === 'Pending' ? 'all' : 'Pending')}><Clock3 />{pending} pending</button> : null}{hasSnapshot && reschedule > 0 ? <button type="button" className="ac-count ac-reschedule" aria-pressed={status === 'Needs reschedule'} onClick={() => setStatus(status === 'Needs reschedule' ? 'all' : 'Needs reschedule')}><CalendarClock />{reschedule} to reschedule</button> : null}</div>
    </div>
    </header>
    <section className="ac-calendar" aria-label={nounTitle}>
      {hasSnapshot && shown.length === 0 ? <div className="ac-empty"><CalendarDays size={23} /><strong>{filtered ? `No ${noun}s match these filters` : `No ${noun}s in this period`}</strong><p>{filtered ? 'Adjust your agent or status selection.' : category === 'marketing' ? 'Dated campaigns and communications appear here.' : 'Choose a time to plan your next appointment.'}</p>{category !== 'marketing' || filtered ? <button type="button" className={`ac-button ${filtered ? '' : 'ac-primary'}`} onClick={filtered ? clearFilters : () => onCreate()}>{filtered ? 'Clear filters' : 'Add appointment'}</button> : null}</div> : null}
      {view === 'agenda' ? days.map(day => {
        const events = dayEvents.get(sastDateKey(day)).filter(event => matchesStatus(event, status))
        return events.length ? <section className="ac-agenda-day" key={sastDateKey(day)}><div className="ac-agenda-label">{formatDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}<span>{sastDateKey(day) === today ? 'Today' : `${events.length} ${noun}${events.length === 1 ? '' : 's'}`}</span></div>{events.map(event => <button type="button" key={event.id} className="ac-agenda-event" onClick={() => onOpen(event.appointment)}><span className="ac-agenda-time">{event.allDay ? 'All day' : clock(event.start)}{!event.allDay && !event.pointInTime ? <small>{clock(event.end)}</small> : null}</span><span><span className="ac-agenda-title">{event.title}</span><span className="ac-agenda-place">{[placeFor(event), agentFor(event)].filter(Boolean).join(' · ')}</span></span><span className={`ac-status ${event.status === 'Pending' ? 'ac-pending' : event.status === 'Needs reschedule' ? 'ac-reschedule' : ''}`}>{event.status}</span></button>)}</section> : null
      }) : view === 'month' ? <>
        <div className="ac-month-labels">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(label => <span key={label}>{label}</span>)}</div>
        <div className="ac-month-grid">{days.map(day => <div className={`ac-month-cell ${sastParts(day).month !== sastParts(cursorDate).month ? 'ac-outside' : ''} ${sastDateKey(day) === today ? 'ac-today' : ''}`} key={sastDateKey(day)}>{dayButton(day)}{dayEvents.get(sastDateKey(day)).filter(event => matchesStatus(event, status)).map(event => <button type="button" key={event.id} className={`ac-month-event ac-${event.tone}`} title={describe(event)} onClick={() => onOpen(event.appointment)}>{event.allDay ? 'All day' : clock(event.start)} {event.title}</button>)}</div>)}</div>
      </> : <div className={`ac-grid-scroll ac-view-${view}`}>
        <div className="ac-grid-head" style={gridStyle}><div className="ac-zone">UTC+2</div>{days.map(day => <div className={`ac-day-head ${sastDateKey(day) === today ? 'ac-today' : ''}`} key={sastDateKey(day)}><span className="ac-day-name">{formatDate(day, { weekday: 'short' })}</span>{dayButton(day)}</div>)}</div>
        {[...dayEvents.values()].some(events => events.some(event => event.allDay && matchesStatus(event, status))) ? <div className="ac-all-day" style={gridStyle}><span>All day</span>{days.map(day => <div key={sastDateKey(day)}>{dayEvents.get(sastDateKey(day)).filter(event => event.allDay && matchesStatus(event, status)).map(event => <button type="button" key={event.id} className={`ac-month-event ac-${event.tone}`} onClick={() => onOpen(event.appointment)} title={describe(event)}>{event.title}</button>)}</div>)}</div> : null}
        <div className="ac-grid-body" style={gridStyle}>
          <div className="ac-hours">{hours.map(hour => <span className="ac-hour-label" key={hour} style={{ top: `${(hour - firstHour) * HOUR_HEIGHT}px` }}>{clock(hour * 60)}</span>)}</div>
          {days.map(day => {
            const events = dayEvents.get(sastDateKey(day)).filter(event => !event.allDay && matchesStatus(event, status))
            // Reserve the minimum painted height for lane placement only; a
            // marketing timestamp still has no displayed appointment duration.
            const lanes = layoutCalendarDay(events.map(event => ({ ...event, durationMinutes: Math.max(event.durationMinutes, 22 / HOUR_HEIGHT * 60) })))
            return <div key={sastDateKey(day)} className={`ac-day-column ${sastDateKey(day) === today ? 'ac-today' : ''} ${[0, 6].includes(sastParts(day).weekday) ? 'ac-weekend' : ''}`}>
              {category !== 'marketing' ? hours.map(hour => <button type="button" className="ac-slot" key={hour} style={{ top: `${(hour - firstHour) * HOUR_HEIGHT}px` }} aria-label={`Add appointment on ${formatDate(day, { weekday: 'long', day: 'numeric', month: 'short' })} at ${clock(hour * 60)}`} onClick={() => onCreate({ date: sastDateKey(day), startTime: clock(hour * 60) })} />) : null}
              {events.map(event => {
                const lane = lanes.get(event.id) || { lane: 0, count: 1 }
                const height = Math.max(22, (event.end - event.start) / 60 * HOUR_HEIGHT - 3)
                return <button type="button" key={event.id} className={`ac-event ac-${event.tone} ${height < 70 ? 'ac-short' : ''} ${height < 42 ? 'ac-tiny' : ''} ${event.status === 'Completed' ? 'ac-completed' : ''}`} style={{ top: `${(event.start / 60 - firstHour) * HOUR_HEIGHT}px`, height: `${height}px`, left: `calc(${lane.lane * 100 / lane.count}% + 3px)`, width: `calc(${100 / lane.count}% - 6px)` }} title={describe(event)} aria-label={describe(event)} onClick={() => onOpen(event.appointment)}><EventLabel event={event} place={placeFor(event)} agent={agentFor(event)} compact={height < 70} /></button>
              })}
            </div>
          })}
        </div>
      </div>}
      <footer className="ac-calendar-foot"><div className="ac-legend">
        {category !== 'marketing' ? <><span><i className="ac-dot ac-viewing" />Viewings</span><span><i className="ac-dot ac-valuation" />Valuations</span><span><i className="ac-dot ac-meeting" />Meetings &amp; other</span></> : null}
        {category !== 'appointments' ? <span><i className="ac-dot ac-marketing" />Marketing</span> : null}
      </div><span>South Africa · UTC+2</span></footer>
    </section>
    <span className="ac-sr-only" aria-live="polite">{periodLabel}. {hasSnapshot ? `${shown.length} ${noun}s shown.` : `Loading ${noun}s.`}</span>
  </div>
}
