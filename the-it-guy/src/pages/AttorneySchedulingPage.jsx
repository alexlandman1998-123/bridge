import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import AttorneySchedulingWorkspace from '../components/attorney/scheduling/AttorneySchedulingWorkspace'
import { useWorkspace } from '../context/WorkspaceContext'
import { listAppointmentResourcesAsync } from '../lib/agencyPipelineService'
import { createPerfTimer } from '../lib/performanceTrace'
import useAttorneyPermissions from '../hooks/useAttorneyPermissions'
import { getAttorneyOperationalWorkspaceData } from '../services/attorneyOperations'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function AttorneySchedulingPage() {
  const { role, profile, workspace: activeWorkspace } = useWorkspace()
  const permissionsState = useAttorneyPermissions()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [resources, setResources] = useState([])
  const [resourcesLoading, setResourcesLoading] = useState(false)
  const loadRequestIdRef = useRef(0)
  const attorneyFirmId = useMemo(() => {
    if (normalizeText(activeWorkspace?.type) === 'attorney_firm') return normalizeText(activeWorkspace?.id)
    return normalizeText(profile?.primaryAttorneyFirmId || profile?.primary_attorney_firm_id)
  }, [activeWorkspace?.id, activeWorkspace?.type, profile?.primaryAttorneyFirmId, profile?.primary_attorney_firm_id])
  const currentUserId = normalizeText(profile?.id || profile?.userId)

  const loadWorkspace = useCallback(async ({ force = false } = {}) => {
    const requestId = loadRequestIdRef.current + 1
    loadRequestIdRef.current = requestId
    const timer = createPerfTimer('attorney.page.scheduling', {
      firmId: attorneyFirmId || null,
      userId: currentUserId || null,
      force: Boolean(force),
    })
    let outcome = 'success'
    setLoading(true)
    setError('')
    try {
      timer.mark('workspace:start')
      const next = await getAttorneyOperationalWorkspaceData(attorneyFirmId || null, currentUserId || null, { force })
      timer.mark('workspace:end', {
        hasFirm: Boolean(next?.firm?.id),
        matters: next?.matterQueue?.length || 0,
        appointments: next?.appointmentQueue?.length || 0,
      })
      if (loadRequestIdRef.current !== requestId) return
      setData(next)
      setLoading(false)

      const organisationId = normalizeText(next?.matterQueue?.[0]?.organisationId || next?.appointmentQueue?.[0]?.organisationId)
      if (organisationId) {
        setResourcesLoading(true)
        const resourceTimer = createPerfTimer('attorney.page.scheduling.resources', {
          organisationId,
        })
        listAppointmentResourcesAsync(organisationId, { includeInactive: false })
          .then((resourceRows) => {
            if (loadRequestIdRef.current !== requestId) return
            setResources(Array.isArray(resourceRows) ? resourceRows : [])
            resourceTimer.mark('resources:end', {
              resources: Array.isArray(resourceRows) ? resourceRows.length : 0,
            })
          })
          .catch(() => {
            if (loadRequestIdRef.current !== requestId) return
            setResources([])
            resourceTimer.mark('resources:failed')
          })
          .finally(() => {
            if (loadRequestIdRef.current !== requestId) return
            setResourcesLoading(false)
            resourceTimer.end()
          })
      } else {
        setResources([])
        setResourcesLoading(false)
      }
    } catch (loadError) {
      outcome = 'failed'
      if (loadRequestIdRef.current !== requestId) return
      setError(loadError?.message || 'Unable to load attorney scheduling workspace.')
      setLoading(false)
      setResourcesLoading(false)
    } finally {
      timer.end({ outcome })
    }
  }, [attorneyFirmId, currentUserId])

  useEffect(() => {
    let active = true
    void (async () => {
      if (!active) return
      await loadWorkspace()
    })()
    return () => {
      active = false
    }
  }, [loadWorkspace])

  const showAppointments = Boolean(data?.permissions?.can_manage_signing_appointments)

  const memberOptions = useMemo(
    () => data?.availableFilters?.members || [],
    [data?.availableFilters?.members],
  )
  const organisationId = normalizeText(data?.matterQueue?.[0]?.organisationId || data?.appointmentQueue?.[0]?.organisationId)

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
        onWorkspaceChanged={() => loadWorkspace({ force: true })}
      />
    </section>
  )
}

export default AttorneySchedulingPage
