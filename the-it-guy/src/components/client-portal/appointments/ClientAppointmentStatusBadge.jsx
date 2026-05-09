function normalizeAppointmentStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '_')
  if (['pending', 'proposed', 'awaiting_confirmation', 'confirmed', 'completed', 'cancelled', 'declined', 'reschedule_requested'].includes(normalized)) {
    return normalized
  }
  if (normalized === 'pending_confirmation') return 'awaiting_confirmation'
  if (normalized === 'needs_reschedule') return 'reschedule_requested'
  return 'pending'
}

function getAppointmentStatusLabel(status) {
  if (status === 'awaiting_confirmation') return 'Awaiting Your Confirmation'
  if (status === 'reschedule_requested') return 'Reschedule Requested'
  if (status === 'confirmed') return 'Confirmed'
  if (status === 'completed') return 'Completed'
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'declined') return 'Declined'
  if (status === 'proposed') return 'Proposed'
  return 'Pending'
}

function getAppointmentStatusClasses(status) {
  if (status === 'awaiting_confirmation' || status === 'pending' || status === 'proposed') {
    return 'border-[#f0d8ae] bg-[#fff6e7] text-[#9a5b0f]'
  }
  if (status === 'reschedule_requested') {
    return 'border-[#f1cbc7] bg-[#fff5f4] text-[#b42318]'
  }
  if (status === 'confirmed') {
    return 'border-[#cfe4d8] bg-[#eef9f2] text-[#2f7a51]'
  }
  if (status === 'completed') {
    return 'border-[#d4e6f8] bg-[#eef5fb] text-[#2f5478]'
  }
  if (status === 'cancelled' || status === 'declined') {
    return 'border-[#e7d6d1] bg-[#f9f4f2] text-[#7a4b3a]'
  }
  return 'border-[#d8e4ef] bg-[#f4f8fc] text-[#3b5873]'
}

function ClientAppointmentStatusBadge({ status = '' }) {
  const normalizedStatus = normalizeAppointmentStatus(status)
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] ${getAppointmentStatusClasses(normalizedStatus)}`}>
      {getAppointmentStatusLabel(normalizedStatus)}
    </span>
  )
}

export {
  getAppointmentStatusLabel,
  normalizeAppointmentStatus,
}

export default ClientAppointmentStatusBadge
