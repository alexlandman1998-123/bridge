import { useMemo, useState } from 'react'
import ClientAppointmentCard from './ClientAppointmentCard'
import ClientAppointmentDetailsModal from './ClientAppointmentDetailsModal'
import { normalizeAppointmentStatus } from './ClientAppointmentStatusBadge'

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function toText(value, fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function resolveRequiredDocumentChecklist(appointment = {}, documentCenter = {}) {
  const requiredDocuments = toArray(documentCenter?.requiredDocuments)
  const uploadedDocuments = toArray(documentCenter?.uploadedDocuments)

  const uploadedBlob = uploadedDocuments
    .map((item) => `${item?.id || ''} ${item?.name || ''} ${item?.document_type || ''} ${item?.category || ''}`.toLowerCase())
    .join(' ')

  const requiredByKey = new Map(requiredDocuments.map((item) => [String(item?.key || '').trim().toLowerCase(), item]))
  const requiredList = toArray(appointment?.requiredDocuments)

  return requiredList.map((entry, index) => {
    const key = toText(entry?.key || entry?.requirementKey || entry?.value || entry, `required_${index}`).toLowerCase()
    const label = toText(entry?.label || entry?.title || entry, 'Required document')
    const requirement = requiredByKey.get(key)
    const completeFromRequirement = Boolean(requirement?.complete || requirement?.uploadedDocumentId)
    const completeFromUpload = uploadedBlob.includes(key.replaceAll('_', ' '))
    return {
      key,
      label,
      completed: completeFromRequirement || completeFromUpload,
    }
  })
}

function filterClientVisibleParticipants(participants = []) {
  const allowedRoles = new Set(['buyer', 'seller', 'agent', 'principal', 'attorney', 'bond originator', 'developer representative'])
  return toArray(participants).filter((participant) => {
    const role = String(participant?.participantRole || '').trim().toLowerCase()
    if (!role) return false
    if (allowedRoles.has(role)) return true
    return role.includes('buyer') || role.includes('seller') || role.includes('agent') || role.includes('attorney') || role.includes('bond')
  })
}

function normalizeAppointmentForDisplay(appointment = {}, role = 'buyer', documentCenter = {}) {
  const normalizedStatus = normalizeAppointmentStatus(appointment?.status)
  const participants = filterClientVisibleParticipants(appointment?.participants)
  const roleName = role === 'seller' ? 'seller' : 'buyer'
  const clientParticipant = participants.find((participant) =>
    String(participant?.participantRole || '').trim().toLowerCase() === roleName,
  ) || null

  return {
    ...appointment,
    normalizedStatus,
    participants,
    clientParticipant,
    requiredDocumentChecklist: resolveRequiredDocumentChecklist(appointment, documentCenter),
  }
}

function sortAppointments(appointments = []) {
  return [...appointments].sort((left, right) => {
    const leftTime = Date.parse(left?.dateTime || '')
    const rightTime = Date.parse(right?.dateTime || '')
    const safeLeft = Number.isNaN(leftTime) ? Number.MAX_SAFE_INTEGER : leftTime
    const safeRight = Number.isNaN(rightTime) ? Number.MAX_SAFE_INTEGER : rightTime
    return safeLeft - safeRight
  })
}

function ClientAppointmentsSection({
  appointments = [],
  workspace = 'buying',
  documentCenter = {},
  pendingAction = '',
  onConfirmAppointment = null,
  onDeclineAppointment = null,
  onRequestReschedule = null,
  feedbackMessage = '',
}) {
  const [selectedAppointment, setSelectedAppointment] = useState(null)
  const [rescheduleTarget, setRescheduleTarget] = useState(null)
  const [rescheduleDateTime, setRescheduleDateTime] = useState('')
  const [rescheduleNotes, setRescheduleNotes] = useState('')
  const [calendarError, setCalendarError] = useState('')
  const role = workspace === 'selling' ? 'seller' : 'buyer'
  const roleLabel = role === 'seller' ? 'Seller' : 'Buyer'

  const visibleAppointments = useMemo(() => {
    const normalized = toArray(appointments)
      .filter((appointment) => String(appointment?.visibility || appointment?.visibility_scope || '').trim().toLowerCase() !== 'internal_only')
      .map((appointment) => normalizeAppointmentForDisplay(appointment, role, documentCenter))
    return sortAppointments(normalized)
  }, [appointments, role, documentCenter])

  const now = Date.now()
  const upcoming = visibleAppointments.filter((item) => {
    const status = item?.normalizedStatus
    if (status === 'completed' || status === 'cancelled' || status === 'declined') return false
    const time = Date.parse(item?.dateTime || '')
    return Number.isNaN(time) || time >= now - (1000 * 60 * 60 * 2)
  })
  const past = visibleAppointments.filter((item) => item?.normalizedStatus === 'completed')
  const archived = visibleAppointments.filter((item) => ['cancelled', 'declined', 'reschedule_requested'].includes(item?.normalizedStatus))
  const rescheduleBusy = Boolean(
    rescheduleTarget &&
    pendingAction &&
    pendingAction === `${rescheduleTarget?.appointmentId || rescheduleTarget?.id}:reschedule`,
  )
  const suggestedRescheduleSlots = toArray(
    rescheduleTarget?.latestRescheduleRequest?.suggestedSlots || rescheduleTarget?.suggestedSlots || [],
  )

  function handleOpenRescheduleModal(appointment) {
    setRescheduleTarget(appointment)
    const initialDate = appointment?.dateTime ? new Date(appointment.dateTime) : null
    const localDate = initialDate && !Number.isNaN(initialDate.getTime())
      ? new Date(initialDate.getTime() - initialDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
      : ''
    setRescheduleDateTime(localDate)
    setRescheduleNotes('')
  }

  function handleCloseRescheduleModal() {
    setRescheduleTarget(null)
    setRescheduleDateTime('')
    setRescheduleNotes('')
  }

  function handleSubmitReschedule(event) {
    event.preventDefault()
    if (!rescheduleTarget || !rescheduleDateTime) return
    onRequestReschedule?.(rescheduleTarget, {
      preferredDateTime: rescheduleDateTime,
      notes: rescheduleNotes,
    })
    handleCloseRescheduleModal()
  }

  return (
    <>
      <section className="space-y-5 rounded-[28px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[1.16rem] font-semibold tracking-[-0.03em] text-[#142132]">Appointments</h3>
            <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
              Confirm attendance, request reschedules, and review what this meeting is for.
            </p>
          </div>
          <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#fbfdff] px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-[#64748b]">
            {visibleAppointments.length} total
          </span>
        </div>

        {feedbackMessage ? (
          <p className="rounded-[12px] border border-[#cfe4d8] bg-[#eef9f2] px-3 py-2 text-sm text-[#2f7a51]">{feedbackMessage}</p>
        ) : null}
        {calendarError ? (
          <p className="rounded-[12px] border border-[#f2d0ce] bg-[#fff5f4] px-3 py-2 text-sm text-[#9f3028]">{calendarError}</p>
        ) : null}

        <section className="space-y-3">
          <h4 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#6b7d93]">Upcoming Appointments</h4>
          {upcoming.length ? (
            <div className="grid gap-3">
              {upcoming.map((appointment) => (
                <ClientAppointmentCard
                  key={appointment?.appointmentId || appointment?.id}
                  appointment={appointment}
                  roleLabel={roleLabel}
                  pendingAction={pendingAction}
                  onConfirm={onConfirmAppointment}
                  onDecline={onDeclineAppointment}
                  onReschedule={handleOpenRescheduleModal}
                  onOpenDetails={setSelectedAppointment}
                  onCalendarError={(error) => setCalendarError(error?.message || 'Calendar invite could not be generated.')}
                />
              ))}
            </div>
          ) : (
            <article className="rounded-[18px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-6 text-center shadow-[0_8px_20px_rgba(15,23,42,0.03)]">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#eef4fb] text-[#35546c]">
                <span className="text-lg font-semibold">0</span>
              </div>
              <h5 className="mt-3 text-sm font-semibold text-[#142132]">No appointments scheduled</h5>
              <p className="mx-auto mt-1 max-w-[520px] text-sm leading-6 text-[#6b7d93]">
                The team will schedule an appointment when the next step requires it. Confirmed appointments and reschedule requests will appear here.
              </p>
            </article>
          )}
        </section>

        {past.length ? (
          <section className="space-y-3">
            <h4 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#6b7d93]">Completed Appointments</h4>
            <div className="grid gap-3">
              {past.map((appointment) => (
                <ClientAppointmentCard
                  key={appointment?.appointmentId || appointment?.id}
                  appointment={appointment}
                  roleLabel={roleLabel}
                  pendingAction={pendingAction}
                  onConfirm={onConfirmAppointment}
                  onDecline={onDeclineAppointment}
                  onReschedule={handleOpenRescheduleModal}
                  onOpenDetails={setSelectedAppointment}
                  onCalendarError={(error) => setCalendarError(error?.message || 'Calendar invite could not be generated.')}
                />
              ))}
            </div>
          </section>
        ) : null}

        {archived.length ? (
          <section className="space-y-3">
            <h4 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#6b7d93]">Cancelled / Rescheduled</h4>
            <div className="grid gap-3">
              {archived.map((appointment) => (
                <ClientAppointmentCard
                  key={appointment?.appointmentId || appointment?.id}
                  appointment={appointment}
                  roleLabel={roleLabel}
                  pendingAction={pendingAction}
                  onConfirm={onConfirmAppointment}
                  onDecline={onDeclineAppointment}
                  onReschedule={handleOpenRescheduleModal}
                  onOpenDetails={setSelectedAppointment}
                  onCalendarError={(error) => setCalendarError(error?.message || 'Calendar invite could not be generated.')}
                />
              ))}
            </div>
          </section>
        ) : null}
      </section>

      <ClientAppointmentDetailsModal
        appointment={selectedAppointment}
        onClose={() => setSelectedAppointment(null)}
        onCalendarError={(error) => setCalendarError(error?.message || 'Calendar invite could not be generated.')}
      />

      {rescheduleTarget ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0f1e2d]/45 p-4">
          <form
            onSubmit={handleSubmitReschedule}
            className="w-full max-w-[520px] rounded-[20px] border border-[#dbe5ef] bg-white p-5 shadow-[0_24px_54px_rgba(15,23,42,0.24)]"
          >
            <h4 className="text-[1.05rem] font-semibold tracking-[-0.02em] text-[#142132]">Request Appointment Reschedule</h4>
            <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
              Share your preferred time and the team will coordinate a new slot.
            </p>

            {suggestedRescheduleSlots.length ? (
              <div className="mt-3 rounded-[12px] border border-[#dbe5ef] bg-[#f8fbff] px-3 py-2.5">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#5f7690]">Suggested times</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {suggestedRescheduleSlots.slice(0, 4).map((slot) => {
                    const slotStart = String(slot?.start || '').trim()
                    if (!slotStart) return null
                    const localSlot = (() => {
                      const date = new Date(slotStart)
                      if (Number.isNaN(date.getTime())) return ''
                      return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
                    })()
                    return (
                      <button
                        key={slotStart}
                        type="button"
                        onClick={() => setRescheduleDateTime(localSlot)}
                        className="inline-flex items-center rounded-full border border-[#cddced] bg-white px-2.5 py-1 text-[0.72rem] font-semibold text-[#31506a] transition hover:border-[#b7cce2]"
                      >
                        {slot?.label || new Date(slotStart).toLocaleString('en-ZA')}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            <label className="mt-4 grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7d93]">Preferred new date and time</span>
              <input
                type="datetime-local"
                value={rescheduleDateTime}
                onChange={(event) => setRescheduleDateTime(event.target.value)}
                required
                className="rounded-[12px] border border-[#d5e1ee] bg-white px-3 py-2 text-sm text-[#142132] outline-none focus:border-[#9cb8d6] focus:ring-2 focus:ring-[#d7e5f4]"
              />
            </label>

            <label className="mt-3 grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7d93]">Reason (optional)</span>
              <textarea
                value={rescheduleNotes}
                onChange={(event) => setRescheduleNotes(event.target.value)}
                placeholder="Add any context for your transaction team."
                className="min-h-[96px] rounded-[12px] border border-[#d5e1ee] bg-white px-3 py-2 text-sm text-[#142132] outline-none focus:border-[#9cb8d6] focus:ring-2 focus:ring-[#d7e5f4]"
              />
            </label>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseRescheduleModal}
                className="inline-flex min-h-[38px] items-center justify-center rounded-[10px] border border-[#d5e1ee] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!rescheduleDateTime || rescheduleBusy}
                className="inline-flex min-h-[38px] items-center justify-center rounded-[10px] bg-[#35546c] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#2d475d] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {rescheduleBusy ? 'Sending...' : 'Submit Reschedule Request'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  )
}

export default ClientAppointmentsSection
