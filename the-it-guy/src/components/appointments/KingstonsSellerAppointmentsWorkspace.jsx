import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, CheckCircle2, CheckSquare, Clock3, MapPin, MoreHorizontal, Plus, UserRound, X } from 'lucide-react'
import Button from '../ui/Button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'declined', 'no_show'])

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase()
}

function getWorkspaceStatusTone(status) {
  const normalized = normalizeStatus(status)
  if (normalized === 'completed') return 'border-[#dce9dd] bg-[#f4faf5] text-[#3e6a47]'
  if (normalized === 'cancelled' || normalized === 'declined' || normalized === 'no_show') {
    return 'border-[#eadfd9] bg-[#fff8f4] text-[#8a5d47]'
  }
  if (normalized === 'accepted' || normalized === 'confirmed') {
    return 'border-[#d9e9dd] bg-[#f3faf4] text-[#3d6d47]'
  }
  return 'border-[#efddba] bg-[#fff8e9] text-[#8d6820]'
}

function getWorkspaceStatusLabel(status) {
  const normalized = normalizeStatus(status)
  if (normalized === 'draft' || normalized === 'requested') return 'Pending'
  if (normalized === 'accepted' || normalized === 'confirmed') return 'Confirmed'
  if (normalized === 'alternative_requested' || normalized === 'alternative_proposed') return 'Rescheduled'
  if (normalized === 'completed') return 'Completed'
  if (normalized === 'cancelled' || normalized === 'declined') return 'Cancelled'
  if (normalized === 'no_show') return 'No-show'
  return String(status || 'Pending')
}

function getAppointmentIdentity(appointment = {}, fallback = 'appointment') {
  return String(
    appointment?.appointmentId ||
      appointment?.id ||
      appointment?.appointment_id ||
      appointment?.calendarEventId ||
      `${appointment?.dateTime || appointment?.createdAt || fallback}`,
  )
}

function getAppointmentCardAccent(status) {
  const normalized = normalizeStatus(status)
  if (normalized === 'completed') return 'from-[#edf8f1] via-white to-white text-[#13784f]'
  if (normalized === 'cancelled' || normalized === 'declined' || normalized === 'no_show') return 'from-[#fff4ee] via-white to-white text-[#9a5737]'
  if (normalized === 'accepted' || normalized === 'confirmed') return 'from-[#edf8f1] via-white to-white text-[#13784f]'
  return 'from-[#fff8e9] via-white to-white text-[#8d6820]'
}

function AppointmentCard({
  appointment = {},
  appointmentTitle = 'Appointment',
  propertyLabel = 'Property to be confirmed',
  appointmentDateLabel = '—',
  appointmentTimeLabel = 'Time pending',
  assignedAgentLabel = '',
  outcomeLabel = '',
  menuOpen = false,
  menuRef = null,
  onOpen = () => {},
  onToggleMenu = () => {},
  onReschedule = () => {},
  onMarkComplete = null,
  onCancel = null,
}) {
  const accentClass = getAppointmentCardAccent(appointment.status)
  return (
    <article
      className={`group relative flex min-h-[230px] flex-col overflow-visible rounded-[22px] border border-[#dfe9f4] bg-gradient-to-br ${accentClass} p-4 text-left shadow-[0_14px_34px_rgba(31,54,78,0.045)] transition hover:-translate-y-0.5 hover:border-[#c8d7e6] hover:shadow-[0_20px_44px_rgba(31,54,78,0.08)]`}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-[16px] text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[#13784f]/30"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[15px] bg-white text-current shadow-[0_10px_24px_rgba(31,54,78,0.08)] ring-1 ring-[#e7eff7]">
            <CalendarDays className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold tracking-[-0.02em] text-[#18324b]" title={appointmentTitle}>{appointmentTitle}</span>
            <span className="mt-1 flex items-start gap-1.5 text-sm leading-5 text-[#607891]">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8aa0b7]" />
              <span className="line-clamp-2">{propertyLabel}</span>
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getWorkspaceStatusTone(appointment.status)}`}>
            {getWorkspaceStatusLabel(appointment.status)}
          </span>
          <div ref={menuOpen ? menuRef : null} className="relative">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-[#d9e4ef] bg-white text-[#5b7289] shadow-[0_8px_18px_rgba(31,54,78,0.06)] transition hover:border-[#c5d4e4] hover:bg-[#f7fbfe]"
              aria-label={`More actions for ${appointmentTitle}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={onToggleMenu}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-[16px] border border-[#dbe7f2] bg-white py-2 shadow-[0_18px_40px_rgba(18,44,68,0.16)]" role="menu">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-[#29435d] transition hover:bg-[#f5f9fc]"
                  onClick={onReschedule}
                  role="menuitem"
                >
                  <CalendarDays className="h-4 w-4" />
                  Reschedule
                </button>
                {onMarkComplete ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-[#29435d] transition hover:bg-[#f5f9fc]"
                    onClick={onMarkComplete}
                    role="menuitem"
                  >
                    <CheckSquare className="h-4 w-4" />
                    Mark Complete
                  </button>
                ) : null}
                {onCancel ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-[#b42318] transition hover:bg-[#fff5f3]"
                    onClick={onCancel}
                    role="menuitem"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="mt-5 grid gap-2 rounded-[18px] border border-[#e5eef7] bg-white/78 p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#13784f]/30"
      >
        <span className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#8aa0b7]">
          <span>Appointment time</span>
          <span className="text-[#607891]">{appointmentTimeLabel}</span>
        </span>
        <span className="flex items-center gap-2 text-sm font-semibold text-[#20364c]">
          <Clock3 className="h-4 w-4 text-[#7f94aa]" />
          {appointmentDateLabel}
        </span>
      </button>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4 text-xs font-semibold text-[#607891]">
        {assignedAgentLabel ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e4edf6] bg-white px-2.5 py-1.5">
            <UserRound className="h-3.5 w-3.5 text-[#7f94aa]" />
            {assignedAgentLabel}
          </span>
        ) : null}
        {outcomeLabel ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e4edf6] bg-white px-2.5 py-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#7f94aa]" />
            {outcomeLabel}
          </span>
        ) : null}
      </div>
    </article>
  )
}

function KingstonsSellerAppointmentsWorkspace({
  appointments = [],
  currentAgent = {},
  resolveAppointmentListingLabel = () => '',
  getAppointmentTypeLabel = () => '',
  formatDateShort = () => '—',
  formatAppointmentTimeRange = () => 'Time pending',
  getAppointmentStatusTone = () => 'border-[#dde7f2] bg-[#f7fbff] text-[#4c6680]',
  handleOpenAppointmentModal = () => {},
  handleScheduleAppointment = () => {},
  handleCancelAppointment = () => {},
  handleMarkAppointmentComplete = () => {},
  resolveAgentById = () => null,
}) {
  const [activeTab, setActiveTab] = useState('upcoming')
  const [openMenuAppointmentId, setOpenMenuAppointmentId] = useState('')
  const menuRef = useRef(null)

  useEffect(() => {
    if (!openMenuAppointmentId || typeof document === 'undefined') return undefined
    const handlePointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) return
      setOpenMenuAppointmentId('')
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpenMenuAppointmentId('')
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openMenuAppointmentId])

  const upcomingAppointments = useMemo(
    () =>
      (Array.isArray(appointments) ? appointments : [])
        .filter((appointment) => !TERMINAL_STATUSES.has(normalizeStatus(appointment?.status)))
        .sort((a, b) => new Date(a.dateTime || a.createdAt || 0) - new Date(b.dateTime || b.createdAt || 0)),
    [appointments],
  )

  const pastAppointments = useMemo(
    () =>
      (Array.isArray(appointments) ? appointments : [])
        .filter((appointment) => TERMINAL_STATUSES.has(normalizeStatus(appointment?.status)))
        .sort((a, b) => new Date(a.dateTime || a.createdAt || 0) - new Date(b.dateTime || b.createdAt || 0)),
    [appointments],
  )

  return (
    <section className="rounded-[18px] border border-[#dfe9f4] bg-white p-5 shadow-[0_12px_30px_rgba(31,54,78,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[1.35rem] font-semibold tracking-[-0.03em] text-[#18324b]">Appointments</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6a8098]">Schedule and manage appointments with your seller.</p>
        </div>
        <Button type="button" onClick={() => handleScheduleAppointment()}>
          <Plus className="h-4 w-4" />
          Schedule Valuation Appointment
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-5">
        <TabsList className="bg-[#f6f9fc]">
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {upcomingAppointments.length ? (
              upcomingAppointments.map((appointment, index) => {
                const appointmentId = getAppointmentIdentity(appointment, `upcoming-${index}`)
                const appointmentTitle = getAppointmentTypeLabel(appointment.appointmentType) || appointment.title || 'Appointment'
                const propertyLabel =
                  resolveAppointmentListingLabel(appointment.listingId) ||
                  String(appointment.location || '').trim() ||
                  'Property to be confirmed'
                const appointmentDateLabel = formatDateShort(appointment.dateTime || appointment.createdAt)
                const appointmentTimeLabel = formatAppointmentTimeRange(appointment)
                const assignedAgentLabel =
                  resolveAppointmentLabel(resolveAgentById, appointment, currentAgent) || 'Assigned agent pending'
                const menuOpen = openMenuAppointmentId === appointmentId

                return (
                  <AppointmentCard
                    key={appointmentId}
                    appointment={appointment}
                    appointmentTitle={appointmentTitle}
                    propertyLabel={propertyLabel}
                    appointmentDateLabel={appointmentDateLabel}
                    appointmentTimeLabel={appointmentTimeLabel}
                    assignedAgentLabel={assignedAgentLabel}
                    menuOpen={menuOpen}
                    menuRef={menuRef}
                    onOpen={() => handleOpenAppointmentModal(appointment)}
                    onToggleMenu={() => setOpenMenuAppointmentId((value) => (value === appointmentId ? '' : appointmentId))}
                    onReschedule={() => {
                      setOpenMenuAppointmentId('')
                      handleOpenAppointmentModal(appointment)
                    }}
                    onMarkComplete={() => {
                      setOpenMenuAppointmentId('')
                      void handleMarkAppointmentComplete(appointment)
                    }}
                    onCancel={() => {
                      setOpenMenuAppointmentId('')
                      void handleCancelAppointment(appointment)
                    }}
                  />
                )
              })
            ) : (
              <div className="col-span-full rounded-[22px] border border-dashed border-[#d8e4f0] bg-[#fbfdff] px-5 py-10 text-center text-sm text-[#6a8098]">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-[15px] bg-white text-[#13784f] shadow-[0_10px_24px_rgba(31,54,78,0.06)] ring-1 ring-[#e7eff7]">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <p className="mt-3 font-semibold text-[#29435d]">No upcoming appointments yet.</p>
                <p className="mt-1">Schedule the first appointment to get started.</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="past">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pastAppointments.length ? (
              pastAppointments.map((appointment, index) => {
                const appointmentId = getAppointmentIdentity(appointment, `past-${index}`)
                const appointmentTitle = getAppointmentTypeLabel(appointment.appointmentType) || appointment.title || 'Appointment'
                const propertyLabel =
                  resolveAppointmentListingLabel(appointment.listingId) ||
                  String(appointment.location || '').trim() ||
                  'Property to be confirmed'
                const appointmentDateLabel = formatDateShort(appointment.dateTime || appointment.createdAt)
                const appointmentTimeLabel = formatAppointmentTimeRange(appointment)
                const outcomeLabel = String(appointment.outcomeSummary || appointment.notes || '').trim() || getWorkspaceStatusLabel(appointment.status)

                return (
                  <AppointmentCard
                    key={appointmentId}
                    appointment={appointment}
                    appointmentTitle={appointmentTitle}
                    propertyLabel={propertyLabel}
                    appointmentDateLabel={appointmentDateLabel}
                    appointmentTimeLabel={appointmentTimeLabel}
                    outcomeLabel={outcomeLabel}
                    menuOpen={openMenuAppointmentId === appointmentId}
                    menuRef={menuRef}
                    onOpen={() => handleOpenAppointmentModal(appointment)}
                    onToggleMenu={() => setOpenMenuAppointmentId((value) => (value === appointmentId ? '' : appointmentId))}
                    onReschedule={() => {
                      setOpenMenuAppointmentId('')
                      handleOpenAppointmentModal(appointment)
                    }}
                  />
                )
              })
            ) : (
              <div className="col-span-full rounded-[22px] border border-dashed border-[#d8e4f0] bg-[#fbfdff] px-5 py-10 text-center text-sm text-[#6a8098]">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-[15px] bg-white text-[#13784f] shadow-[0_10px_24px_rgba(31,54,78,0.06)] ring-1 ring-[#e7eff7]">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <p className="mt-3 font-semibold text-[#29435d]">No past appointments yet.</p>
                <p className="mt-1">Completed and cancelled appointments will appear here.</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </section>
  )
}

function resolveAppointmentLabel(resolveAgentById, appointment, currentAgent) {
  const agent = resolveAgentById(
    appointment?.assignedAgentId || appointment?.assignedAgentEmail || currentAgent?.id,
  )
  return String(
    agent?.name ||
    appointment?.assignedAgentName ||
    appointment?.assignedAgentEmail ||
    currentAgent?.fullName ||
    'Assigned agent pending',
  ).trim()
}

export default KingstonsSellerAppointmentsWorkspace
