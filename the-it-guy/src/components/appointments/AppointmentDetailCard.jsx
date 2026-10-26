import { CalendarDays, Clock3, MapPin, Plus } from 'lucide-react'
import { resolveAppointmentSchedule } from '../../core/appointments/appointmentTime'

export default function AppointmentDetailCard({ appointment, statusLabel, agentName, listingLabel, canEdit, onAddAttendee, onAddNote }) {
  const schedule = resolveAppointmentSchedule(appointment, { strict: false })
  const date = new Date(schedule.dateTime)
  const validDate = Number.isFinite(date.getTime())
  const format = options => validDate ? date.toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg', ...options }) : '—'
  const clock = value => new Date(value).toLocaleTimeString('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit' })
  const people = (appointment.participants || []).filter(person => !person.rsvpRevokedAt && !person.rsvp_revoked_at && String(person.participantRole || person.role || '').toLowerCase() !== 'agent')
  const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('')
  const comments = appointment.clientFeedback || appointment.agentNotes || appointment.outcomeSummary
  const changingTime = ['alternative_requested', 'alternative_proposed'].includes(appointment.status)
  const bookingStatus = changingTime ? appointment.hasConfirmedReservation ? 'confirmed' : 'requested' : appointment.status
  const bookingStatusLabel = changingTime ? appointment.hasConfirmedReservation ? 'Confirmed' : 'Requested' : statusLabel
  return <section className="ad-card" aria-label="Appointment overview">
    <div className="ad-schedule">
      <div className="ad-date-tile" aria-hidden="true"><span>{format({ month: 'short' })}</span><strong>{format({ day: 'numeric' })}</strong></div>
      <div className="ad-schedule-text"><p><CalendarDays />{validDate ? format({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Date pending'}</p><span><Clock3 />{schedule.allDay ? 'All day' : validDate ? `${clock(schedule.dateTime)}${schedule.endDateTime ? ` – ${clock(schedule.endDateTime)}` : ''}` : 'Time pending'}<small>South Africa · UTC+2</small></span></div>
      <span className="ae-status" data-status={bookingStatus}>{bookingStatusLabel}</span>
    </div>
    <div className="ad-location"><MapPin /><div><span>Location</span><p>{appointment.location || appointment.meetingUrl || 'Location to be confirmed'}</p>{listingLabel ? <small>{listingLabel}</small> : null}</div></div>
    <div className="ad-person"><span className="ad-avatar" aria-hidden="true">{initials(agentName)}</span><div><span>Responsible agent</span><p>{agentName}</p></div></div>
    {people.length ? <section className="ad-section"><div className="ad-section-title"><h4>Attendees</h4>{canEdit ? <button type="button" className="ad-add" onClick={onAddAttendee}><Plus />Add attendee</button> : null}</div><div className="ad-people">{people.map((person, index) => <span className="ad-person-chip" key={person.participantId || person.email || index}><span className="ad-avatar" aria-hidden="true">{initials(person.name || person.email || 'Guest')}</span>{person.name || person.email || 'Guest'}</span>)}</div></section> : canEdit ? <button type="button" className="ad-add" onClick={onAddAttendee}><Plus />Add attendee</button> : null}
    {appointment.notes ? <section className="ad-section"><h4>Notes</h4><p className="ad-notes">{appointment.notes}</p></section> : canEdit ? <button type="button" className="ad-add" onClick={onAddNote}><Plus />Add note</button> : null}
    {comments ? <section className="ad-section"><h4>Comments</h4><p className="ad-notes">{comments}</p></section> : null}
  </section>
}
