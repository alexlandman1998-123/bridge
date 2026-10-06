import { useEffect, useState } from 'react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import { addCalendarDays, sastDateKey, sastDayStart, sastWeekStart } from '../../core/appointments/attorneyCalendarModel.js'
import { getMobileCalendarSnapshotAsync } from '../../services/mobileDashboardService.js'
import MobileCalendarView from './MobileCalendarView.jsx'

export default function MobileCalendarPage() {
  const workspace = useWorkspace()
  const organisationContext = useOptionalOrganisation()
  const organisation = organisationContext?.organisation || null
  const organisationLoading = Boolean(organisationContext?.loading)
  const [selectedDate, setSelectedDate] = useState(() => sastDayStart(new Date()))
  const [result, setResult] = useState(null)
  const [retry, setRetry] = useState(0)
  const weekKey = sastDateKey(sastWeekStart(selectedDate))

  useEffect(() => {
    if (organisationLoading) return undefined
    let active = true
    const start = new Date(`${weekKey}T00:00:00+02:00`)
    getMobileCalendarSnapshotAsync({ workspace, organisation, dateRange: { from: start.toISOString(), to: new Date(addCalendarDays(start, 7).getTime() - 1).toISOString() } })
      .then((snapshot) => { if (active) setResult({ workspace, organisation, weekKey, snapshot }) })
      .catch((error) => { if (active) setResult({ workspace, organisation, weekKey, error: error.message || 'Unable to load appointments.' }) })
    return () => { active = false }
  }, [workspace, organisation, organisationLoading, weekKey, retry])

  const ready = !organisationLoading && result?.workspace === workspace && result?.organisation === organisation && result?.weekKey === weekKey
  const appointments = ready && !result.error ? result.snapshot?.appointments || [] : []
  return <MobileCalendarView
    selectedDate={selectedDate}
    onSelectDate={setSelectedDate}
    appointments={appointments}
    loading={!ready}
    error={ready ? result.error : null}
    onRetry={() => { setResult(null); setRetry((value) => value + 1) }}
  />
}
