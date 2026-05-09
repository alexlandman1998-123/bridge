import ClientAppointmentStatusBadge from './ClientAppointmentStatusBadge'
import ClientAppointmentInstructions from './ClientAppointmentInstructions'
import AppointmentCalendarActions from '../../appointments/AppointmentCalendarActions'

function toText(value, fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function formatDateTime(value, fallback = 'Date and time to be confirmed') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleString('en-ZA', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function normalizeRsvpStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'accepted') return 'Confirmed'
  if (normalized === 'declined') return 'Declined'
  if (normalized === 'proposed new time') return 'Reschedule Requested'
  return 'Pending'
}

function ClientAppointmentCard({
  appointment,
  roleLabel = 'Buyer',
  onOpenDetails = null,
  onConfirm = null,
  onDecline = null,
  onReschedule = null,
  pendingAction = '',
  onCalendarError = null,
}) {
  const appointmentId = appointment?.appointmentId || appointment?.id || ''
  const status = String(appointment?.status || '')
  const clientParticipant = appointment?.clientParticipant || null
  const clientRsvpStatusLabel = normalizeRsvpStatus(clientParticipant?.rsvpStatus || clientParticipant?.rsvp_status)
  const canRespond = ['pending', 'proposed', 'awaiting_confirmation'].includes(String(appointment?.normalizedStatus || '').trim())
  const actionBusy = pendingAction && pendingAction.startsWith(`${appointmentId}:`)

  return (
    <article className="rounded-[18px] border border-[#dbe5ef] bg-white px-4 py-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-[1.02rem] font-semibold tracking-[-0.02em] text-[#142132]">
            {toText(appointment?.title, toText(appointment?.appointmentTypeLabel, 'Appointment'))}
          </h4>
          <p className="mt-1 text-sm leading-6 text-[#5f7288]">{formatDateTime(appointment?.dateTime)}</p>
          <p className="mt-1 text-xs text-[#6b7d93]">
            {roleLabel} confirmation status: <span className="font-semibold text-[#35546c]">{clientRsvpStatusLabel}</span>
          </p>
        </div>
        <ClientAppointmentStatusBadge status={status} />
      </div>

      <div className="mt-3 grid gap-2 text-sm text-[#324559] sm:grid-cols-2">
        <p>
          <span className="block text-[0.68rem] uppercase tracking-[0.12em] text-[#7b8ca2]">Location</span>
          {toText(appointment?.location, 'Location to be confirmed')}
        </p>
        <p>
          <span className="block text-[0.68rem] uppercase tracking-[0.12em] text-[#7b8ca2]">Linked Stage</span>
          {toText(appointment?.linkedWorkflowStage || appointment?.linkedTransactionStage || appointment?.linkedWorkflow, 'Transaction coordination')}
        </p>
      </div>

      <div className="mt-3">
        <ClientAppointmentInstructions
          instructions={appointment?.instructions}
          linkedStage={appointment?.linkedWorkflowStage || appointment?.linkedTransactionStage || appointment?.linkedWorkflow}
        />
      </div>

      {Array.isArray(appointment?.requiredDocumentChecklist) && appointment.requiredDocumentChecklist.length ? (
        <div className="mt-3 rounded-[12px] border border-[#e3ebf4] bg-[#fbfdff] px-3.5 py-3">
          <h5 className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Required Before Appointment</h5>
          <ul className="mt-2 space-y-1.5 text-sm text-[#35546c]">
            {appointment.requiredDocumentChecklist.slice(0, 4).map((item) => (
              <li key={`${appointmentId}-${item.key}`} className="flex items-start gap-2">
                <span className={`mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${item.completed ? 'bg-[#2f7a51]' : 'bg-[#b5472d]'}`} />
                <span>{item.label} {item.completed ? '(Uploaded)' : '(Missing)'}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {canRespond ? (
          <>
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => onConfirm?.(appointment)}
              className="inline-flex min-h-[36px] items-center justify-center rounded-[10px] bg-[#35546c] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#2d475d] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {actionBusy && pendingAction.endsWith(':confirm') ? 'Saving...' : 'Confirm Appointment'}
            </button>
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => onReschedule?.(appointment)}
              className="inline-flex min-h-[36px] items-center justify-center rounded-[10px] border border-[#d5e1ee] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {actionBusy && pendingAction.endsWith(':reschedule') ? 'Saving...' : 'Request Reschedule'}
            </button>
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => onDecline?.(appointment)}
              className="inline-flex min-h-[36px] items-center justify-center rounded-[10px] border border-[#f1cbc7] bg-white px-3 py-1.5 text-xs font-semibold text-[#b42318] transition hover:bg-[#fff5f4] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {actionBusy && pendingAction.endsWith(':decline') ? 'Saving...' : 'Decline Appointment'}
            </button>
          </>
        ) : null}

        <button
          type="button"
          onClick={() => onOpenDetails?.(appointment)}
          className="inline-flex min-h-[36px] items-center justify-center rounded-[10px] border border-[#d5e1ee] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-white"
        >
          View Details
        </button>
      </div>

      <div className="mt-3">
        <AppointmentCalendarActions
          appointment={appointment}
          compact
          onError={onCalendarError}
        />
      </div>
    </article>
  )
}

export default ClientAppointmentCard
