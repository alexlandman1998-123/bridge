import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import AttorneySchedulingWorkspace from '../components/attorney/scheduling/AttorneySchedulingWorkspace'
import { useWorkspace } from '../context/WorkspaceContext'
import { listAppointmentResourcesAsync } from '../lib/agencyPipelineService'
import useAttorneyPermissions from '../hooks/useAttorneyPermissions'
import { getAttorneyOperationalWorkspaceData } from '../services/attorneyOperations'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function AttorneySchedulingPage() {
  const { role } = useWorkspace()
  const permissionsState = useAttorneyPermissions()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [resources, setResources] = useState([])

  const loadWorkspace = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const next = await getAttorneyOperationalWorkspaceData()
      setData(next)

      const organisationId = normalizeText(next?.matterQueue?.[0]?.organisationId || next?.appointmentQueue?.[0]?.organisationId)
      if (organisationId) {
        const resourceRows = await listAppointmentResourcesAsync(organisationId, { includeInactive: false })
        setResources(Array.isArray(resourceRows) ? resourceRows : [])
      } else {
        setResources([])
      }
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load attorney scheduling workspace.')
    } finally {
      setLoading(false)
    }
  }, [])

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
        memberOptions={memberOptions}
        currentRole={data?.currentUser?.role || ''}
        firm={data.firm}
        currentUser={data.currentUser}
        onWorkspaceChanged={loadWorkspace}
      />
    </section>
  )
}

export default AttorneySchedulingPage
