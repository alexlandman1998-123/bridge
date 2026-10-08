import CalendarHealthPanel from '../../components/appointments/CalendarHealthPanel'
import ConnectedCalendarPanel from '../../components/appointments/ConnectedCalendarPanel'
import useAppointmentReconciliation from '../../hooks/useAppointmentReconciliation'
import { useEffect, useState } from 'react'
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
  const [result, setResult] = useState(null)
  const [selection, setSelection] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const weekKey = sastDateKey(sastWeekStart(selectedDate))
  const scopeKey = JSON.stringify([organisation?.id || organisation?.organisationId || organisation?.organisation_id || organisation?.workspaceId, workspace.currentWorkspace?.organisationId || workspace.currentWorkspace?.organisation_id || workspace.currentWorkspace?.id || workspace.workspace?.id, workspace.profile?.id || workspace.profile?.userId, workspace.profile?.email, workspace.currentMembership?.role, workspace.role, weekKey])
  const { revision: retry, reload } = useAppointmentReconciliation({ enabled: !organisationLoading, scopeKey })

  useEffect(() => {
    if (organisationLoading) return undefined
    let active = true
    let timer
    setResult((previous) => previous?.scopeKey === scopeKey ? { ...previous, loading: true, error: null } : { scopeKey, loading: true })
    const start = new Date(`${weekKey}T00:00:00+02:00`)
    Promise.race([getMobileCalendarSnapshotAsync({ workspace, organisation, dateRange: { from: start.toISOString(), to: new Date(addCalendarDays(start, 7).getTime() - 1).toISOString() } }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Appointments are taking too long to load. Please retry.')), 15000) })])
      .then((snapshot) => {
        if (!Array.isArray(snapshot?.appointments)) throw new Error('Appointment data could not be verified. Please retry.')
        if (active) setResult({ scopeKey, snapshot, loading: false })
      })
      .catch((error) => { if (active) setResult((previous) => ({ ...previous, scopeKey, loading: false, error: error.message || 'Unable to load appointments.' })) })
      .finally(() => clearTimeout(timer))
    return () => { active = false; clearTimeout(timer) }
  }, [workspace, organisation, organisationLoading, weekKey, retry, scopeKey])

  const ready = !organisationLoading && result?.scopeKey === scopeKey
  const appointments = ready ? result.snapshot?.appointments || [] : []
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
    loading={!ready || (result?.loading && !result?.snapshot)}
    hasSnapshot={ready && Boolean(result?.snapshot)}
    refreshing={ready && result?.loading && Boolean(result?.snapshot)}
    error={ready ? result.error : null}
    onRetry={reload}
    onCreate={organisationId && actor.id && !organisationLoading ? () => setSelection({ scopeKey, create:true }) : undefined}
    onOpen={row => setSelection({ scopeKey, id:row.appointmentId || row.id })}
  />
  {selected ? <MobileAppointmentWorkspace key={`${scopeKey}:${selected.id || 'new'}`}
    appointment={selected.create ? null : appointments.find(row => (row.appointmentId || row.id) === selected.id)} organisationId={organisationId} actor={actor} selectedDate={sastDateKey(selectedDate)}
    onClose={() => setSelection(null)} onSaved={(_saved,message) => { setSelection(null);setFeedback({scopeKey,message:message || 'Appointment saved.'});reload() }} /> : null}
  </>
}
