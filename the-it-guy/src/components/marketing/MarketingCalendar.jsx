import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  Facebook,
  MessageCircle,
  ChevronRight,
  Mail,
  Plus,
  Megaphone,
  RefreshCw,
  Search,
  Zap,
} from 'lucide-react'
import { MarketingLink as Link } from './MarketingNavigation.jsx'
import {
  buildMarketingCalendar,
  calendarDateKey,
  calendarItemsForDay,
  calendarMonthDays,
  MARKETING_CALENDAR_TIME_ZONE,
  matchesCalendarFilters,
  shiftCalendarDate,
  shiftCalendarMonth,
  validCalendarDate,
} from '../../services/marketingCalendarModel'
import { metaIntegrationRequest } from '../../services/metaIntegrationService'
import Modal from '../ui/Modal'
import './MarketingCalendar.css'

const formatDate = (date, options) =>
  new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', ...options }).format(
    new Date(`${date}T12:00:00Z`),
  )
const campaignColour = (item) => {
  if (item.type !== 'campaign') return item.type
  const hash = Array.from(item.id).reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return ['sage', 'violet', 'amber'][hash % 3]
}
const itemLabels = { campaign: 'Campaign plan', email: 'Email', whatsapp: 'WhatsApp', post: 'Facebook post' }
const itemIcons = { campaign: Megaphone, email: Mail, whatsapp: MessageCircle, post: Facebook }
const formatTime = (timestamp) => new Intl.DateTimeFormat(undefined, { timeZone: MARKETING_CALENDAR_TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp))
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export default function MarketingCalendar({
  workspace,
  organisationId,
  date,
  onDateChange,
  onRefresh,
  refreshing = false,
}) {
  const [today] = useState(() => calendarDateKey(new Date()))
  const [localDate, setLocalDate] = useState(
    validCalendarDate(date) ? date : today,
  )
  const [dayOpen, setDayOpen] = useState(false)
  const timelineRef = useRef(null)
  useEffect(() => {
    if (dayOpen && timelineRef.current) timelineRef.current.scrollTop = 8 * 64
  }, [dayOpen, date, localDate])
  const [type, setType] = useState('all')
  const [scope, setScope] = useState('all')
  const [campaignFilter, setCampaignFilter] = useState('all')
  const [status, setStatus] = useState('all')
  const [postState, setPostState] = useState({ organisationId: null, data: [], error: '', loaded: false })
  useEffect(() => {
    if (!organisationId || refreshing) return
    let current = true
    metaIntegrationRequest(organisationId, 'calendar_posts').then((result) => {
      if (!Array.isArray(result.posts)) throw new Error('Post calendar is unavailable.')
      if (current) setPostState({ organisationId, data: result.posts, error: '', loaded: true })
    }).catch(() => {
      if (current) setPostState({ organisationId, data: [], error: 'Posts could not be loaded. Refresh the calendar to try again.', loaded: true })
    })
    return () => { current = false }
  }, [organisationId, refreshing])
  const [search, setSearch] = useState('')
  const buttons = useRef(new Map())
  const selected = onDateChange
    ? validCalendarDate(date)
      ? date
      : today
    : localDate
  const month = selected.slice(0, 7)
  const days = calendarMonthDays(selected)
  const posts = organisationId
    ? postState.organisationId === organisationId ? postState : { data: [], loaded: false }
    : workspace.channels?.posts
  const data = buildMarketingCalendar({ ...workspace, channels: { ...workspace.channels, posts } })
  const filters = { type, scope, campaignId: campaignFilter, status, search }
  const items = data.items.filter((item) => matchesCalendarFilters(item, filters))
  const unscheduled = data.unscheduled.filter((item) => matchesCalendarFilters(item, filters))
  const daily = calendarItemsForDay(items, selected)
  const monthStart = `${month}-01`
  const monthEnd = shiftCalendarDate(shiftCalendarMonth(monthStart, 1), -1)
  const monthly = items.filter(
    (item) =>
      item.startDate <= monthEnd &&
      (!item.endDate || item.endDate >= monthStart),
  )
  const undated = data.undated.filter((campaign) => matchesCalendarFilters({
    type: 'campaign', campaignId: campaign.id, title: campaign.name, status: campaign.status,
  }, filters))
  function select(next, focus = false) {
    setLocalDate(next)
    onDateChange?.(next)
    if (focus) requestAnimationFrame(() => buttons.current.get(next)?.focus())
  }
  function keydown(event, day) {
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7
    const offset =
      offsets[event.key] ??
      (event.key === 'Home'
        ? -weekday
        : event.key === 'End'
          ? 6 - weekday
          : null)
    if (offset === null) return
    event.preventDefault()
    select(shiftCalendarDate(day, offset), true)
  }
  const campaignUrl = (id) =>
    `?section=campaigns&page=calendar&date=${selected}&view=detail&id=${encodeURIComponent(id)}`
  const itemUrl = (item) => item.type === 'campaign' ? campaignUrl(item.campaignId)
    : item.type === 'post' ? `/agent/listings/${encodeURIComponent(item.listingId)}`
    : `/marketing?section=${item.type}&view=${item.status === 'draft' ? 'create' : 'detail'}&id=${encodeURIComponent(item.sourceId)}`
  function agendaItem(item) {
    const Icon = itemIcons[item.type]
    return (
      <article className={`mk-agenda-item mk-agenda-item-${item.type} mk-calendar-tone-${campaignColour(item)}`} key={item.id}>
        <div className="mk-agenda-kind">
          <Icon size={15} aria-hidden="true" />
          <span>{itemLabels[item.type]}</span>
          <small>{item.status?.replaceAll('_', ' ')}</small>
        </div>
        <h4>{item.title}</h4>
        <p>{item.type !== 'campaign' ? `${formatTime(item.scheduledFor)} · SAST`
          : item.endOnly ? `Ends ${formatDate(item.endDate, { day: 'numeric', month: 'short' })}`
            : `${formatDate(item.startDate, { day: 'numeric', month: 'short' })} — ${item.endDate ? formatDate(item.endDate, { day: 'numeric', month: 'short' }) : 'Ongoing'}`}</p>
        {item.type !== 'campaign' && (item.campaignId
          ? <Link className="mk-agenda-campaign-tag" to={campaignUrl(item.campaignId)}>{item.campaignName}</Link>
          : <span className="mk-agenda-once-off">{item.linked ? 'Campaign unavailable' : 'Once-off'}</span>)}
        <Link to={itemUrl(item)}>
          {item.type === 'post' ? 'Open listing post' : `Open ${item.type}`}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </article>
    )
  }
  return (
    <section
      className="mk-calendar"
      aria-labelledby="mk-calendar-heading"
      aria-busy={refreshing}
    >
      <header className="mk-calendar-heading">
        <div>
          <CalendarDays size={22} aria-hidden="true" />
          <h2 id="mk-calendar-heading">Marketing calendar</h2>
        </div>
        <div className="mk-calendar-header-actions">
          <span>South Africa time · SAST</span>
          <details className="mk-calendar-create-menu">
            <summary className="mk-calendar-create"><Plus size={16} aria-hidden="true" /> Create <ChevronDown size={14} aria-hidden="true" /></summary>
            <div>
              <Link to="?section=campaigns&view=create"><Megaphone size={16} />Campaign</Link>
              <Link to="/marketing?section=email&view=create"><Mail size={16} />Email</Link>
              <Link to="/marketing?section=whatsapp&view=create"><MessageCircle size={16} />WhatsApp</Link>
              <Link to="/marketing?section=meta&tab=organic"><Facebook size={16} />Post</Link>
            </div>
          </details>
          {onRefresh && (
            <button type="button" disabled={refreshing} onClick={onRefresh}>
              <RefreshCw size={14} />
              {refreshing ? 'Refreshing…' : 'Refresh calendar'}
            </button>
          )}
        </div>
      </header>
      <div className="mk-calendar-toolbar">
        <div className="mk-calendar-month">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => select(shiftCalendarMonth(selected, -1))}
          >
            <ChevronLeft size={19} />
          </button>
          <h3 aria-live="polite">
            {formatDate(selected, { month: 'long', year: 'numeric' })}
          </h3>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => select(shiftCalendarMonth(selected, 1))}
          >
            <ChevronRight size={19} />
          </button>
          <button
            type="button"
            className="mk-calendar-today"
            onClick={() => select(calendarDateKey(new Date()))}
          >
            Today
          </button>
        </div>
        <div className="mk-calendar-filters">
          <label className="mc-search">
            <Search size={16} />
            <input
              type="search"
              aria-label="Search marketing calendar"
              placeholder="Search calendar…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <select
            aria-label="Calendar item type"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="all">All items</option>
            <option value="campaign">Campaign plans</option>
            <option value="email">Emails</option>
            <option value="whatsapp">WhatsApps</option>
            <option value="post">Posts</option>
            <option value="automation">Automations</option>
          </select>
        </div>
      </div>
      <div className="mk-calendar-context-filters">
        <div className="mk-calendar-scope" role="group" aria-label="Calendar scope">
          {[['all', 'Everything'], ['linked', 'Campaign-linked'], ['standalone', 'Once-off']].map(([value, label]) => (
            <button type="button" key={value} aria-pressed={scope === value} onClick={() => setScope(value)}>{label}</button>
          ))}
        </div>
        <div className="mk-calendar-context-selects">
          <select aria-label="Filter by campaign" value={campaignFilter} onChange={(event) => setCampaignFilter(event.target.value)}>
            <option value="all">All campaigns</option>
            {workspace.campaigns.map((campaign) => <option value={campaign.id} key={campaign.id}>{campaign.name}</option>)}
          </select>
          <select aria-label="Calendar status" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            {['draft', 'scheduled', 'sending', 'sent', 'published', 'active', 'completed', 'paused', 'partial', 'failed', 'cancelled', 'needs_attention', 'publishing', 'unknown'].map((value) => <option value={value} key={value}>{value.replaceAll('_', ' ')}</option>)}
          </select>
        </div>
      </div>
      <div className="mk-calendar-insights" aria-label="Month at a glance">
        <div className="mk-calendar-insight mk-insight-campaign">
          <span className="mk-insight-icon"><Megaphone size={19} aria-hidden="true" /></span>
          <div><strong>{monthly.filter((item) => item.type === 'campaign').length}</strong><span>Campaign plans</span></div>
        </div>
        <div className="mk-calendar-insight mk-insight-email">
          <span className="mk-insight-icon"><Mail size={19} aria-hidden="true" /></span>
          <div><strong>{monthly.filter((item) => item.type !== 'campaign').length}</strong><span>Communications & posts</span></div>
        </div>
        <div className="mk-calendar-insight mk-insight-days">
          <span className="mk-insight-icon"><CalendarDays size={19} aria-hidden="true" /></span>
          <div><strong>{days.filter((day) => day.startsWith(month) && calendarItemsForDay(items, day).length > 0).length}</strong><span>Days with activity</span></div>
        </div>
        <div className="mk-calendar-connection"><Zap size={16} aria-hidden="true" /><span>Automations<small>Scheduling not connected</small></span></div>
      </div>
      {['email', 'whatsapp'].filter((channel) => workspace.channels?.[channel]?.error).map((channel) => (
        <p className="mk-calendar-source-notice" role="status" key={channel}>{itemLabels[channel]} activity is unavailable. Other calendar items are still shown.</p>
      ))}
      {posts?.error && <p className="mk-calendar-source-notice" role="status">{posts.error}</p>}
      {organisationId && !posts?.loaded && <p className="mk-calendar-source-notice" role="status">Loading posts…</p>}
      {type === 'post' && <p className="mk-calendar-source-notice">Facebook listing posts are shown when published. Instagram and social post scheduling are not connected yet.</p>}
      {type === 'automation' && (
        <div className="mk-calendar-automation" role="status">
          <Zap size={20} />
          <p>
            Automation scheduling is not connected yet. Configured automation
            runs will appear here when the automation engine is available.
          </p>
        </div>
      )}
      <div className="mk-calendar-layout">
        <div
          className="mk-calendar-grid"
          role="grid"
          aria-label={`${formatDate(selected, { month: 'long', year: 'numeric' })} marketing calendar`}
        >
          <div role="row" className="mk-calendar-weekdays">
            {weekdays.map((day) => (
              <span role="columnheader" key={day}>
                {day}
              </span>
            ))}
          </div>
          {Array.from({ length: 6 }, (_, week) => (
            <div role="row" className="mk-calendar-week" key={week}>
              {days.slice(week * 7, week * 7 + 7).map((day) => {
                const events = calendarItemsForDay(items, day)
                return (
                  <div
                    role="gridcell"
                    aria-selected={day === selected}
                    key={day}
                    className={`mk-calendar-cell${day.slice(0, 7) !== month ? ' mk-calendar-outside' : ''}${day === selected ? ' mk-calendar-selected' : ''}${[0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay()) ? ' mk-calendar-weekend' : ''}`}
                  >
                    <button
                      type="button"
                      ref={(element) => {
                        if (element) buttons.current.set(day, element)
                        else buttons.current.delete(day)
                      }}
                      tabIndex={day === selected ? 0 : -1}
                      aria-label={`${formatDate(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${events.length} ${events.length === 1 ? 'item' : 'items'}`}
                      aria-current={day === today ? 'date' : undefined}
                      aria-haspopup="dialog"
                      onClick={() => { select(day); setDayOpen(true) }}
                      onKeyDown={(event) => keydown(event, day)}
                    >
                      <span
                        className={`mk-day-number${day === today ? ' mk-day-today' : ''}`}
                      >
                        {Number(day.slice(-2))}
                      </span>
                      <span className="mk-day-items">
                        {events.slice(0, 3).map((item) => {
                          const Icon = itemIcons[item.type]
                          return (
                          <span
                            key={item.id}
                            className={`mk-calendar-chip mk-calendar-chip-${item.type} mk-calendar-tone-${campaignColour(item)}${item.startDate === day ? ' mk-chip-start' : ''}${item.endDate === day ? ' mk-chip-end' : ''}`}
                            title={item.title}
                          >
                            <Icon size={11} aria-hidden="true" />
                            <span>
                              {item.type === 'campaign' &&
                              item.startDate === day
                                ? item.endOnly
                                  ? 'Ends · '
                                  : 'Starts · '
                                : item.type === 'campaign' &&
                                    item.endDate === day
                                  ? 'Ends · '
                                  : ''}
                              {item.type !== 'campaign' ? `${formatTime(item.scheduledFor)} · ` : ''}{item.title}
                            </span>
                          </span>
                        )})}
                        {events.length > 3 && (
                          <span className="mk-calendar-more">
                            +{events.length - 3} more
                          </span>
                        )}
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <aside
          className="mk-calendar-agenda"
          aria-labelledby="mk-agenda-heading"
        >
          <div className="mk-agenda-heading">
            <h3 id="mk-agenda-heading">
              {formatDate(selected, { day: 'numeric', month: 'long' })}
            </h3>
            <span className="mk-agenda-count" aria-label={`${daily.length} items`}>{daily.length}</span>
            <p>{formatDate(selected, { weekday: 'long' })} · Daily agenda</p>
          </div>
          <div className="mk-agenda-items">
            {[['campaign', 'Campaign plans'], ['communication', 'Communications & posts']].map(([group, label]) => {
              const entries = daily.filter((item) => group === 'campaign' ? item.type === 'campaign' : item.type !== 'campaign')
              return entries.length ? <div className="mk-agenda-group" key={group}><p className="mk-agenda-group-label">{label}<span>{entries.length}</span></p>{entries.map(agendaItem)}</div> : null
            })}
            {!daily.length && (
              <div className="mk-agenda-empty">
                <CalendarDays size={25} />
                <p>
                  {type === 'automation'
                    ? 'No connected automation runs.'
                    : 'No matching items on this day.'}
                </p>
              </div>
            )}
          </div>
          <p className="mk-agenda-note">
            Campaign bars show the plan. Individual items use saved scheduling,
            sending or publication times.
          </p>
        </aside>
      </div>
      <Modal
        open={dayOpen}
        onClose={() => setDayOpen(false)}
        title={formatDate(selected, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        subtitle="Plan this day · South Africa time (SAST)"
        className="mk-calendar-day-dialog"
      >
        <div className="mk-day-planner">
        <section className="mk-day-shortcuts" aria-label="Prepare marketing activity">
        <h4>Schedule or prepare activity</h4>
        <div className="mk-day-actions">
          <Link to={`/marketing?section=email&view=create&scheduleDate=${selected}`}><Mail size={20} aria-hidden="true" /><span><strong>Schedule mailer</strong><small>Start an email with this day selected. Review the time and audience before scheduling.</small></span><ArrowRight size={16} aria-hidden="true" /></Link>
          <Link to="/marketing?section=whatsapp&view=create"><MessageCircle size={20} aria-hidden="true" /><span><strong>Prepare WhatsApp</strong><small>Create a draft. Timed WhatsApp scheduling is not connected yet.</small></span><ArrowRight size={16} aria-hidden="true" /></Link>
          <Link to="/marketing?section=meta&tab=organic"><Facebook size={20} aria-hidden="true" /><span><strong>Plan a post</strong><small>Open social content. Schedule Facebook and Instagram posts in Meta Business Suite.</small></span><ArrowRight size={16} aria-hidden="true" /></Link>
          <Link to="?section=campaigns&view=create"><Megaphone size={20} aria-hidden="true" /><span><strong>Create campaign</strong><small>Plan a campaign across your marketing channels.</small></span><ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
        </section>
        <section className="mk-day-agenda" aria-label="Daily marketing calendar">
          <div className="mk-day-calendar-heading">
            <div><h4>Daily calendar</h4><p className="mk-day-agenda-note">On this day · {daily.length} {daily.length === 1 ? 'item' : 'items'} · SAST</p></div>
            <div className="mk-day-date-controls">
              <button type="button" aria-label="Previous day" onClick={() => select(shiftCalendarDate(selected, -1))}><ChevronLeft size={17} /></button>
              <button type="button" aria-label="Next day" onClick={() => select(shiftCalendarDate(selected, 1))}><ChevronRight size={17} /></button>
            </div>
          </div>
          <div className="mk-day-all-day">
            <span>Campaign plans</span>
            {daily.some((item) => item.type === 'campaign') ? daily.filter((item) => item.type === 'campaign').map(agendaItem) : <p>No campaign plans on this day.</p>}
          </div>
          {!daily.length && <p className="mk-day-agenda-note">No matching items on this day.</p>}
          <div className="mk-day-timeline" ref={timelineRef} tabIndex={0} aria-label="Hourly schedule in South Africa time">
            {Array.from({ length: 24 }, (_, hour) => {
              const entries = daily.filter((item) => item.type !== 'campaign' && Number(new Intl.DateTimeFormat('en-GB', { timeZone: MARKETING_CALENDAR_TIME_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(new Date(item.scheduledFor))) === hour)
              return <div className="mk-day-hour" key={hour}><time>{String(hour).padStart(2, '0')}:00</time><div>{entries.map(agendaItem)}</div></div>
            })}
          </div>
          <p className="mk-day-agenda-note">Activity matching your current calendar filters.</p>
        </section>
        </div>
      </Modal>
      {!!unscheduled.length && (
        <details className="mk-calendar-undated mk-calendar-unscheduled">
          <summary>Not scheduled · {unscheduled.length} {unscheduled.length === 1 ? 'communication' : 'communications'}</summary>
          <div className="mk-unscheduled-list">
            {unscheduled.map((item) => {
              const Icon = itemIcons[item.type]
              return <Link key={item.id} to={itemUrl(item)}><Icon size={16} aria-hidden="true" /><span><strong>{item.title}</strong><small>{itemLabels[item.type]} · {item.status.replaceAll('_', ' ')} · {item.campaignName || (item.linked ? 'Campaign unavailable' : 'Once-off')}</small></span><ArrowRight size={15} aria-hidden="true" /></Link>
            })}
          </div>
        </details>
      )}
      {!!undated.length && (
        <details className="mk-calendar-undated">
          <summary>
            {undated.length}{' '}
            {undated.length === 1
              ? 'campaign without dates'
              : 'campaigns without dates'}
          </summary>
          {undated.map((campaign) => (
            <Link key={campaign.id} to={campaignUrl(campaign.id)}>
              <span>{campaign.name}</span>
              <small>
                Set campaign dates
                <ArrowRight size={14} />
              </small>
            </Link>
          ))}
        </details>
      )}
    </section>
  )
}
