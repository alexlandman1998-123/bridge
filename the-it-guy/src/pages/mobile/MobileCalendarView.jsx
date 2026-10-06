import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, MapPin, UserRound } from 'lucide-react'
import { useRef } from 'react'
import { addCalendarDays, sameSastDay, sastDateKey, sastDayStart, sastWeekStart } from '../../core/appointments/attorneyCalendarModel.js'
import { MobileErrorState, MobileLoadingState } from '../../components/mobile-shell/MobileShellStates.jsx'
import './mobile-pages.css'
import './mobile-calendar.css'

const formatDate = (date, options) => date.toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg', ...options })
const formatTime = (value) => new Date(value).toLocaleTimeString('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', hour12: false })

export default function MobileCalendarView({ selectedDate, onSelectDate, appointments = [], loading = false, error = null, onRetry }) {
  const datePicker = useRef(null)
  const today = sastDayStart(new Date())
  const weekStart = sastWeekStart(selectedDate)
  const days = Array.from({ length: 7 }, (_, index) => addCalendarDays(weekStart, index))
  const visible = appointments.filter((appointment) => sameSastDay(appointment.dateTime, selectedDate))
    .sort((left, right) => new Date(left.dateTime) - new Date(right.dateTime))
  const datesWithAppointments = new Set(appointments.map((appointment) => sastDateKey(appointment.dateTime)))
  const selectDate = (date) => {
    onSelectDate(date)
    if (datePicker.current?.open) {
      datePicker.current.open = false
      datePicker.current.querySelector('summary')?.focus()
    }
  }

  return <div className="mobile-pages mobile-calendar">
    <header className="mobile-pages-intro"><h1>Calendar</h1><p>Your schedule, one day at a time.</p></header>
    <section className="mobile-calendar-controls" aria-label="Choose a calendar day">
      <div className="mobile-calendar-month-header">
        <details className="mobile-calendar-jump" ref={datePicker}>
          <summary aria-label="Choose another date"><span>{formatDate(selectedDate, { month: 'long', year: 'numeric' })}</span><ChevronDown size={16} aria-hidden="true" /></summary>
          <form onSubmit={(event) => {
            event.preventDefault()
            const date = new Date(`${new FormData(event.currentTarget).get('calendarDate')}T00:00:00+02:00`)
            if (Number.isFinite(date.getTime())) selectDate(date)
          }}><label>Jump to date<input type="date" aria-label="Calendar date" name="calendarDate" required key={sastDateKey(selectedDate)} defaultValue={sastDateKey(selectedDate)} /></label><button type="submit">Show date</button></form>
        </details>
        <button type="button" className="mobile-calendar-today" onClick={() => selectDate(today)}>Today</button>
      </div>
      <div className="mobile-calendar-week-nav">
        <button type="button" aria-label="Previous week" onClick={() => selectDate(addCalendarDays(selectedDate, -7))}><ChevronLeft size={18} aria-hidden="true" /></button>
        <p>{formatDate(days[0], { day: 'numeric', month: 'short' })} – {formatDate(days[6], { day: 'numeric', month: 'short' })}</p>
        <button type="button" aria-label="Next week" onClick={() => selectDate(addCalendarDays(selectedDate, 7))}><ChevronRight size={18} aria-hidden="true" /></button>
      </div>
      <div className="mobile-calendar-days" aria-label="Week dates">
        {days.map((date) => <button key={sastDateKey(date)} type="button"
          aria-label={formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}
          aria-pressed={sameSastDay(date, selectedDate)} aria-current={sameSastDay(date, today) ? 'date' : undefined}
          onClick={() => selectDate(date)}>
          <span>{formatDate(date, { weekday: 'short' })}</span><strong>{formatDate(date, { day: 'numeric' })}</strong>
          <i aria-hidden="true" className={!loading && !error && datesWithAppointments.has(sastDateKey(date)) ? 'has-appointments' : ''} />
        </button>)}
      </div>
    </section>
    <section aria-label="Appointments for selected day" className="mobile-calendar-agenda" aria-busy={loading}>
      <header className="mobile-calendar-agenda-heading">
        <div><h2>{formatDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })}</h2><p>{loading ? 'Loading schedule…' : error ? 'Schedule unavailable' : `${visible.length} ${visible.length === 1 ? 'appointment' : 'appointments'}`}</p></div>
        <span className="mobile-calendar-timezone">SAST</span>
      </header>
      {loading ? <MobileLoadingState label="Loading calendar" /> : error ? <MobileErrorState body={error} onRetry={onRetry} /> : visible.length ? <ol className="mobile-calendar-timeline" aria-label="Daily schedule">
        {visible.map((appointment) => <li key={appointment.id}>
          <div className="mobile-calendar-time"><time dateTime={appointment.dateTime}>{formatTime(appointment.dateTime)}</time><span aria-hidden="true" /></div>
          <article className="mobile-calendar-appointment">
            <div className="mobile-calendar-appointment-top"><h3>{appointment.typeLabel || 'Appointment'}</h3>{appointment.statusLabel && <span className={`mobile-appointment-status ${['green', 'amber', 'red', 'slate'].includes(appointment.statusTone) ? appointment.statusTone : 'slate'}`}>{appointment.statusLabel}</span>}</div>
            <p className="mobile-calendar-client">{appointment.clientName || 'Client not recorded'}</p>
            {appointment.propertyAddress && <p className="mobile-calendar-location"><MapPin size={14} aria-hidden="true" /><span>{appointment.propertyAddress}</span></p>}
            {appointment.assignedName && appointment.assignedName !== 'Unassigned' && <p className="mobile-calendar-assigned"><UserRound size={13} aria-hidden="true" /><span>{appointment.assignedName}</span></p>}
          </article>
        </li>)}
      </ol> : <div className="mobile-pages-empty"><span className="mobile-calendar-empty-icon"><CalendarDays size={24} strokeWidth={1.5} aria-hidden="true" /></span><h3>No appointments for this day.</h3><p>Your saved appointments will appear here.<br />Choose another day to explore your schedule.</p></div>}
    </section>
  </div>
}
