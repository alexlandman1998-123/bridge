import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, CheckCircle2, CheckSquare, Clock3, MoreHorizontal, Plus, UserRound, X } from 'lucide-react'
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

function KingstonsSellerAppointmentsWorkspace({
  appointments = [],
  currentAgent = {},
  resolveAppointmentListingLabel = () => '',
  getAppointmentTypeLabel = () => '',
  formatDateShort = () => '—',
  formatAppointmentTimeRange = () => 'Time pending',
  getAppointmentStatusTone = () => 'border-[#dde7f2] bg-[#f7fbff] text-[#4c6680]',
  handleOpenAppointmentModal = () => {},
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
        <Button type="button" onClick={() => handleOpenAppointmentModal()}>
          <Plus className="h-4 w-4" />
          Schedule Appointment
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-5">
        <TabsList className="bg-[#f6f9fc]">
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming">
          <div className="space-y-3">
            {upcomingAppointments.length ? (
              upcomingAppointments.map((appointment, index) => {
                const appointmentId = String(
                  appointment?.appointmentId ||
                    appointment?.id ||
                    appointment?.appointment_id ||
                    appointment?.calendarEventId ||
                    `${appointment?.dateTime || appointment?.createdAt || 'upcoming'}-${index}`,
                )
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
                  <button
                    key={appointmentId}
                    type="button"
                    onClick={() => handleOpenAppointmentModal(appointment)}
                    className="flex w-full flex-col gap-4 rounded-[16px] border border-[#e4edf5] bg-[#fbfdff] p-4 text-left transition hover:border-[#c9d7e6] hover:bg-white"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-[#18324b]">{appointmentTitle}</p>
                        <p className="mt-1 text-sm text-[#607891]">{propertyLabel}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getWorkspaceStatusTone(appointment.status)}`}>
                          {getWorkspaceStatusLabel(appointment.status)}
                        </span>
                        <div
                          ref={menuOpen ? menuRef : null}
                          className="relative"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-[#d9e4ef] bg-white text-[#5b7289] transition hover:border-[#c5d4e4] hover:bg-[#f7fbfe]"
                            aria-label={`More actions for ${appointmentTitle}`}
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            onClick={() => setOpenMenuAppointmentId((value) => (value === appointmentId ? '' : appointmentId))}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {menuOpen ? (
                            <div className="absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-[16px] border border-[#dbe7f2] bg-white py-2 shadow-[0_18px_40px_rgba(18,44,68,0.16)]" role="menu">
                              <button
                                type="button"
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-[#29435d] transition hover:bg-[#f5f9fc]"
                                onClick={() => {
                                  setOpenMenuAppointmentId('')
                                  handleOpenAppointmentModal(appointment)
                                }}
                                role="menuitem"
                              >
                                <CalendarDays className="h-4 w-4" />
                                Reschedule
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-[#29435d] transition hover:bg-[#f5f9fc]"
                                onClick={() => {
                                  setOpenMenuAppointmentId('')
                                  void handleMarkAppointmentComplete(appointment)
                                }}
                                role="menuitem"
                              >
                                <CheckSquare className="h-4 w-4" />
                                Mark Complete
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-[#b42318] transition hover:bg-[#fff5f3]"
                                onClick={() => {
                                  setOpenMenuAppointmentId('')
                                  void handleCancelAppointment(appointment)
                                }}
                                role="menuitem"
                              >
                                <X className="h-4 w-4" />
                                Cancel
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#6f839c]">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {appointmentDateLabel}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 className="h-3.5 w-3.5" />
                        {appointmentTimeLabel}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <UserRound className="h-3.5 w-3.5" />
                        {assignedAgentLabel}
                      </span>
                    </div>
                  </button>
                )
              })
            ) : (
              <div className="rounded-[16px] border border-dashed border-[#d8e4f0] bg-[#fbfdff] px-4 py-6 text-sm text-[#6a8098]">
                No upcoming appointments yet. Schedule the first appointment to get started.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="past">
          <div className="space-y-3">
            {pastAppointments.length ? (
              pastAppointments.map((appointment, index) => {
                const appointmentId = String(
                  appointment?.appointmentId ||
                    appointment?.id ||
                    appointment?.appointment_id ||
                    appointment?.calendarEventId ||
                    `${appointment?.dateTime || appointment?.createdAt || 'past'}-${index}`,
                )
                const appointmentTitle = getAppointmentTypeLabel(appointment.appointmentType) || appointment.title || 'Appointment'
                const propertyLabel =
                  resolveAppointmentListingLabel(appointment.listingId) ||
                  String(appointment.location || '').trim() ||
                  'Property to be confirmed'
                const appointmentDateLabel = formatDateShort(appointment.dateTime || appointment.createdAt)
                const appointmentTimeLabel = formatAppointmentTimeRange(appointment)
                const outcomeLabel = String(appointment.outcomeSummary || appointment.notes || '').trim() || getWorkspaceStatusLabel(appointment.status)

                return (
                  <button
                    key={appointmentId}
                    type="button"
                    onClick={() => handleOpenAppointmentModal(appointment)}
                    className="flex w-full flex-col gap-3 rounded-[16px] border border-[#e4edf5] bg-white p-4 text-left transition hover:border-[#c9d7e6] hover:bg-[#fbfdff]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-[#18324b]">{appointmentTitle}</p>
                        <p className="mt-1 text-sm text-[#607891]">{propertyLabel}</p>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getWorkspaceStatusTone(appointment.status)}`}>
                        {getWorkspaceStatusLabel(appointment.status)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#6f839c]">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {appointmentDateLabel}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 className="h-3.5 w-3.5" />
                        {appointmentTimeLabel}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {outcomeLabel}
                      </span>
                    </div>
                  </button>
                )
              })
            ) : (
              <div className="rounded-[16px] border border-dashed border-[#d8e4f0] bg-[#fbfdff] px-4 py-6 text-sm text-[#6a8098]">
                No past appointments yet.
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
