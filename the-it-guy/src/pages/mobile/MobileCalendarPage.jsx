import CalendarHealthPanel from '../../components/appointments/CalendarHealthPanel'
import ConnectedCalendarPanel from '../../components/appointments/ConnectedCalendarPanel'
import useCalendarRead from '../../hooks/useCalendarRead'
import { useState } from 'react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import { addCalendarDays, sastDateKey, sastDayStart, sastWeekStart } from '../../core/appointments/attorneyCalendarModel.js'
import { getMobileCalendarSnapshotAsync } from '../../services/mobileDashboardService.js'
import MobileCalendarView from './MobileCalendarView.jsx'
import MobileAppointmentWorkspace from '../../components/appointments/MobileAppointmentWorkspace'
import { resolveMobileRoleCategory } from '../../config/mobileShell'

export default function MobileCalendarPage() {
  const workspace = useWorkspace()
  const organisationContext = useOptionalOrganisation()
  const organisation = organisationContext?.organisation || null
  const organisationLoading = Boolean(organisationContext?.loading)
  const [selectedDate, setSelectedDate] = useState(() => sastDayStart(new Date()))
  const [selection, setSelection] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const weekKey = sastDateKey(sastWeekStart(selectedDate))
  const scopeKey = JSON.stringify([organisation?.id || organisation?.organisationId || organisation?.organisation_id || organisation?.workspaceId, workspace.currentWorkspace?.organisationId || workspace.currentWorkspace?.organisation_id || workspace.currentWorkspace?.id || workspace.workspace?.id, workspace.profile?.id || workspace.profile?.userId, workspace.profile?.email, workspace.currentMembership?.role, workspace.role, weekKey])
  const result = useCalendarRead({
    scopeKey, enabled: !organisationLoading,
    read: async signal => {
      const start = new Date(`${weekKey}T00:00:00+02:00`)
      const snapshot = await getMobileCalendarSnapshotAsync({ workspace, organisation, signal, dateRange: { from: start.toISOString(), to: new Date(addCalendarDays(start, 7).getTime() - 1).toISOString() } })
      if (!Array.isArray(snapshot?.appointments)) throw new Error('Appointment data could not be verified. Please retry.')
      return snapshot
    },
  })
  const { reload } = result
  const ready = !organisationLoading && result.hasSnapshot
  const appointments = result.data?.appointments || []

  const organisationId = organisation?.id || organisation?.organisationId || organisation?.organisation_id || organisation?.workspaceId || workspace.currentWorkspace?.organisationId || workspace.currentWorkspace?.organisation_id || workspace.currentWorkspace?.id || workspace.workspace?.id
  const actor = { ...workspace.profile, id: workspace.profile?.id || workspace.profile?.userId, name: workspace.profile?.fullName || workspace.profile?.full_name || workspace.profile?.email, canManageCalendar: resolveMobileRoleCategory(workspace) === 'principal' }
  const selected = selection?.scopeKey === scopeKey && (selection.create || appointments.some(row => (row.appointmentId || row.id) === selection.id)) ? selection : null
  return <>
  {feedback?.scopeKey === scopeKey ? <p role="status" className="px-4 py-2 text-sm">{feedback.message}</p> : null}
  {!organisationLoading ? <div className="px-4 py-2"><ConnectedCalendarPanel organisationId={organisationId} viewerKey={actor.id} /><CalendarHealthPanel organisationId={organisationId} viewerKey={actor.id} /></div> : null}
  <MobileCalendarView
    selectedDate={selectedDate}
    onSelectDate={setSelectedDate}
    appointments={appointments}
    loading={organisationLoading || (!result.hasSnapshot && result.status === 'loading')}
    hasSnapshot={ready}
    refreshing={ready && result.status === 'loading'}
    error={result.error || null}
    onRetry={reload}
    onCreate={organisationId && actor.id && !organisationLoading ? () => setSelection({ scopeKey, create:true }) : undefined}
    onOpen={row => setSelection({ scopeKey, id:row.appointmentId || row.id })}
  />
  {selected ? <MobileAppointmentWorkspace key={`${scopeKey}:${selected.id || 'new'}`}
    appointment={selected.create ? null : appointments.find(row => (row.appointmentId || row.id) === selected.id)} organisationId={organisationId} actor={actor} selectedDate={sastDateKey(selectedDate)}
    onTimeChanged={state => {
      reload()
      if (!state.active && state.history[0]?.status === 'accepted') { setSelection(null); setFeedback({scopeKey,message:'The new appointment time is confirmed.'}) }
    }}
    onClose={() => setSelection(null)} onSaved={(_saved,message) => { setSelection(null);setFeedback({scopeKey,message:message || 'Appointment saved.'});reload() }} /> : null}
  </>
}
