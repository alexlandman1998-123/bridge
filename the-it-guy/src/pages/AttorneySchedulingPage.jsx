import useCalendarRead from '../hooks/useCalendarRead'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import AttorneySchedulingWorkspace from '../components/attorney/scheduling/AttorneySchedulingWorkspace'
import { useWorkspace } from '../context/WorkspaceContext'
import { listAppointmentResourcesAsync } from '../lib/agencyPipelineService'
import { createPerfTimer } from '../lib/performanceTrace'
import useAttorneyPermissions from '../hooks/useAttorneyPermissions'
import useAttorneyDashboardLiveRefresh from '../hooks/useAttorneyDashboardLiveRefresh'
import { getAttorneyOperationalWorkspaceData, mapAttorneyAppointmentForWorkspace } from '../services/attorneyOperations'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function AttorneySchedulingPage() {
  const { role, profile, workspace: activeWorkspace } = useWorkspace()
  const permissionsState = useAttorneyPermissions()
  const [data, setData] = useState(null)
  const [resources, setResources] = useState([])
  const attorneyFirmId = useMemo(() => {
    if (normalizeText(activeWorkspace?.type) === 'attorney_firm') return normalizeText(activeWorkspace?.id)
    return normalizeText(profile?.primaryAttorneyFirmId || profile?.primary_attorney_firm_id)
  }, [activeWorkspace?.id, activeWorkspace?.type, profile?.primaryAttorneyFirmId, profile?.primary_attorney_firm_id])
  const currentUserId = normalizeText(profile?.id || profile?.userId)

  const scopeKey = JSON.stringify([attorneyFirmId, currentUserId, role])
  const source = useCalendarRead({
    scopeKey, enabled: role === 'attorney', reconcile: false,
    read: async signal => {
      const timer = createPerfTimer('attorney.page.scheduling', { firmId: attorneyFirmId, userId: currentUserId })
      try {
        const next = await getAttorneyOperationalWorkspaceData(attorneyFirmId || null, currentUserId || null, { force: true, signal })
        signal.throwIfAborted()
        const organisationIds = [...new Set([next?.firm?.organisationId, ...(next?.matterQueue || []).map(row => row.organisationId)].map(normalizeText).filter(Boolean))]
        const results = await Promise.allSettled(organisationIds.map(async organisationId => {
          const rows = await listAppointmentResourcesAsync(organisationId, { includeInactive: false, signal })
          return (rows || []).map(row => ({ ...row, organisationId }))
        }))
        signal.throwIfAborted()
        const failure = results.find(result => result.status === 'rejected')
        if (failure) throw failure.reason
        const scopes = results.map(result => result.value)
        setResources([...new Map(scopes.flat().map(row => [row.resourceId, row])).values()])
        setData(next)
        return next
      } finally { timer.end() }
    },
  })
  const { reload, refresh } = source
  const loading = !source.hasSnapshot && source.status === 'loading'
  const error = source.error
  const resourcesLoading = source.status === 'loading'
  useEffect(() => { setData(null); setResources([]) }, [scopeKey])

  const refreshWorkspace = useCallback(({ savedAppointment } = {}) => {
    if (savedAppointment?.appointment?.appointment_id) {
      setData((previous) => {
        if (!previous?.firm?.id) return previous
        const matter = previous.matterQueue?.find((row) => row.matterId === savedAppointment.transactionId)
        const row = mapAttorneyAppointmentForWorkspace({ ...savedAppointment.appointment, delivery: savedAppointment.delivery || savedAppointment.appointment.delivery }, matter, savedAppointment.participants, savedAppointment.rescheduleRequests || [])
        return { ...previous, appointmentQueue: [
          ...(previous.appointmentQueue || []).filter((item) => item.id !== row.id), row,
        ] }
      })
    }
    return reload()
  }, [reload])

  useAttorneyDashboardLiveRefresh({
    firmId: attorneyFirmId,
    enabled: Boolean(data?.firm?.id && data?.permissions?.can_manage_signing_appointments),
    onRefresh: refresh,
  })

  const showAppointments = Boolean(data?.permissions?.can_manage_signing_appointments)

  const memberOptions = useMemo(
    () => data?.availableFilters?.members || [],
    [data?.availableFilters?.members],
  )
  const organisationId = normalizeText(data?.firm?.organisationId)

  if (role !== 'attorney') {
    return <Navigate to="/dashboard" replace />
  }

  if (permissionsState.loading || loading) {
    return (
      <section className="page">
        <div className="panel card-tier-standard">
          <p className="status-message" style={{ margin: 0 }}>Loading attorney scheduling workspace…</p>
        </div>
      </section>
    )
  }

  if (permissionsState.error) {
    return (
      <section className="page">
        <div className="panel card-tier-standard">
          <p className="status-message" style={{ margin: 0, color: '#b42318' }}>{permissionsState.error}</p>
        </div>
      </section>
    )
  }

  if (error && !data) return <section className="page"><p role="alert">{error} <button type="button" onClick={reload}>Retry calendar</button></p></section>

  if (!data?.firm?.id) {
    return <Navigate to="/attorney/onboarding" replace />
  }

  if (!showAppointments) {
    return (
      <section className="page" style={{ display: 'grid', gap: '1rem' }}>
        <div className="panel card-tier-standard">
          <h2 style={{ margin: '0 0 0.35rem' }}>Calendar &amp; Scheduling</h2>
          <p className="status-message" style={{ margin: 0 }}>
            Your role does not include signing appointment coordination permissions.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="page" style={{ display: 'grid', gap: '1rem' }}>
      {error ? (
        <div className="panel card-tier-standard">
          <p className="status-message" style={{ margin: 0, color: '#b42318' }}>{error}</p>
        </div>
      ) : null}

      <AttorneySchedulingWorkspace
        appointmentRows={data?.appointmentQueue || []}
        matterRows={data?.matterQueue || []}
        documentRows={data?.documentQueue || []}
        resources={resources}
        resourcesLoading={resourcesLoading}
        memberOptions={memberOptions}
        organisationId={organisationId}
        currentRole={data?.currentUser?.role || ''}
        currentUser={data.currentUser}
        onWorkspaceChanged={refreshWorkspace}
      />
    </section>
  )
}

export default AttorneySchedulingPage
