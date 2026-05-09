import ClientAppointmentStatusBadge from './ClientAppointmentStatusBadge'
import ClientAppointmentInstructions from './ClientAppointmentInstructions'
import AppointmentCalendarActions from '../../appointments/AppointmentCalendarActions'

function formatDateTime(value, fallback = 'Date and time to be confirmed') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleString('en-ZA', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toText(value, fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function ClientAppointmentDetailsModal({ appointment = null, onClose = null, onCalendarError = null }) {
  if (!appointment) return null

  const participants = Array.isArray(appointment?.participants) ? appointment.participants : []

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0f1e2d]/45 p-4">
      <div className="max-h-[85vh] w-full max-w-[760px] overflow-y-auto rounded-[22px] border border-[#dbe5ef] bg-white p-5 shadow-[0_24px_54px_rgba(15,23,42,0.24)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">
              {toText(appointment?.title, toText(appointment?.appointmentTypeLabel, 'Appointment'))}
            </h3>
            <p className="mt-1 text-sm text-[#5f7288]">{formatDateTime(appointment?.dateTime)}</p>
          </div>
          <div className="flex items-center gap-2">
            <ClientAppointmentStatusBadge status={appointment?.status} />
            <button
              type="button"
              onClick={() => onClose?.()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d5e1ee] bg-white text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
              aria-label="Close appointment details"
            >
              ×
            </button>
          </div>
        </div>

        <div className="mt-3">
          <AppointmentCalendarActions
            appointment={appointment}
            onError={onCalendarError}
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <article className="rounded-[12px] border border-[#e3ebf4] bg-[#fbfdff] px-3.5 py-3">
            <span className="block text-[0.68rem] uppercase tracking-[0.12em] text-[#7b8ca2]">Location</span>
            <p className="mt-1 text-sm text-[#35546c]">{toText(appointment?.location, 'Location to be confirmed')}</p>
          </article>
          <article className="rounded-[12px] border border-[#e3ebf4] bg-[#fbfdff] px-3.5 py-3">
            <span className="block text-[0.68rem] uppercase tracking-[0.12em] text-[#7b8ca2]">Current Stage</span>
            <p className="mt-1 text-sm text-[#35546c]">
              {toText(appointment?.linkedWorkflowStage || appointment?.linkedTransactionStage || appointment?.linkedWorkflow, 'Transaction coordination')}
            </p>
          </article>
        </div>

        <div className="mt-4">
          <ClientAppointmentInstructions
            instructions={appointment?.instructions}
            linkedStage={appointment?.linkedWorkflowStage || appointment?.linkedTransactionStage || appointment?.linkedWorkflow}
          />
        </div>

        <div className="mt-4 rounded-[12px] border border-[#e3ebf4] bg-[#fbfdff] px-3.5 py-3">
          <h5 className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Attendees</h5>
          {participants.length ? (
            <ul className="mt-2 space-y-2 text-sm text-[#35546c]">
              {participants.map((participant) => (
                <li key={participant?.participantId || `${participant?.name}-${participant?.participantRole}`} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-[#142132]">{toText(participant?.name, 'Participant')}</p>
                    <p className="text-xs text-[#6b7d93]">{toText(participant?.participantRole, 'Role player')}</p>
                  </div>
                  <span className="text-xs font-semibold text-[#5f7288]">{toText(participant?.rsvpStatus, 'Pending')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-[#6b7d93]">Attendee information is being prepared by your transaction team.</p>
          )}
        </div>

        {Array.isArray(appointment?.requiredDocumentChecklist) && appointment.requiredDocumentChecklist.length ? (
          <div className="mt-4 rounded-[12px] border border-[#e3ebf4] bg-[#fbfdff] px-3.5 py-3">
            <h5 className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Required Before Appointment</h5>
            <ul className="mt-2 space-y-1.5 text-sm text-[#35546c]">
              {appointment.requiredDocumentChecklist.map((item) => (
                <li key={`${appointment?.appointmentId}-${item.key}`} className="flex items-start gap-2">
                  <span className={`mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${item.completed ? 'bg-[#2f7a51]' : 'bg-[#b5472d]'}`} />
                  <span>{item.label} {item.completed ? '(Uploaded)' : '(Missing)'}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default ClientAppointmentDetailsModal
