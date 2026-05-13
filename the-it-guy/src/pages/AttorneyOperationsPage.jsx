import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import AttorneyAppointmentQueue from '../components/attorney/operations/AttorneyAppointmentQueue'
import AttorneyDocumentQueue from '../components/attorney/operations/AttorneyDocumentQueue'
import AttorneyMatterQueue from '../components/attorney/operations/AttorneyMatterQueue'
import AttorneyMyWorkKpis from '../components/attorney/operations/AttorneyMyWorkKpis'
import AttorneyOperationsHeader from '../components/attorney/operations/AttorneyOperationsHeader'
import AttorneyPriorityQueue from '../components/attorney/operations/AttorneyPriorityQueue'
import AttorneyUpdatesPanel from '../components/attorney/operations/AttorneyUpdatesPanel'
import { useWorkspace } from '../context/WorkspaceContext'
import useAttorneyPermissions from '../hooks/useAttorneyPermissions'
import { getAttorneyOperationalWorkspaceData } from '../services/attorneyOperations'

const MANAGEMENT_ROLES = new Set(['firm_admin', 'director_partner'])

function filterMatterRows(rows = [], { matterType = 'all', status = 'all', member = 'all' }, isManagement) {
  let filtered = [...rows]

  if (matterType !== 'all') {
    filtered = filtered.filter((row) => row.matterType === matterType)
  }

  if (status !== 'all') {
    filtered = filtered.filter((row) => row.status === status)
  }

  if (isManagement && member !== 'all') {
    filtered = filtered.filter((row) => String(row.assignedUserId || '') === String(member))
  }

  return filtered
}

function filterPriorityRows(rows = [], { priority = 'all', matterType = 'all', status = 'all' }, matterByReference = {}) {
  let filtered = [...rows]

  if (priority !== 'all') {
    filtered = filtered.filter((row) => String(row.priority || '').toLowerCase() === String(priority).toLowerCase())
  }

  if (matterType !== 'all') {
    filtered = filtered.filter((row) => {
      const matter = matterByReference[row.matterReference]
      return matter?.matterType === matterType
    })
  }

  if (status !== 'all') {
    filtered = filtered.filter((row) => {
      const matter = matterByReference[row.matterReference]
      return matter?.status === status
    })
  }

  return filtered
}

function filterDocumentRows(rows = [], { status = 'all', matterType = 'all' }, matterByReference = {}) {
  let filtered = [...rows]

  if (status !== 'all') {
    filtered = filtered.filter((row) => String(row.status || '').toLowerCase() === String(status).toLowerCase())
  }

  if (matterType !== 'all') {
    filtered = filtered.filter((row) => {
      const matter = matterByReference[row.matterReference]
      return matter?.matterType === matterType
    })
  }

  return filtered
}

function filterAppointmentRows(rows = [], { status = 'all', matterType = 'all' }, matterByReference = {}) {
  let filtered = [...rows]

  if (status !== 'all') {
    filtered = filtered.filter((row) => String(row.status || '').toLowerCase() === String(status).toLowerCase())
  }

  if (matterType !== 'all') {
    filtered = filtered.filter((row) => {
      const matter = matterByReference[row.matterReference]
      return matter?.matterType === matterType
    })
  }

  return filtered
}

function AttorneyOperationsPage() {
  const { role } = useWorkspace()
  const permissionsState = useAttorneyPermissions()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)

  const [managementFilters, setManagementFilters] = useState({
    department: 'all',
    member: 'all',
    matterType: 'all',
    status: 'all',
  })

  const [userFilters, setUserFilters] = useState({
    priority: 'all',
    matterType: 'all',
    status: 'all',
  })

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError('')
      try {
        const next = await getAttorneyOperationalWorkspaceData()
        if (!active) return
        setData(next)
      } catch (loadError) {
        if (!active) return
        setError(loadError?.message || 'Unable to load attorney operational workspace.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  const currentRole = data?.currentUser?.role || ''
  const isManagementUser = MANAGEMENT_ROLES.has(currentRole)

  const matterByReference = useMemo(
    () =>
      (data?.matterQueue || []).reduce((accumulator, row) => {
        accumulator[row.matterReference] = row
        return accumulator
      }, {}),
    [data?.matterQueue],
  )

  const managementFilteredMatterRows = useMemo(() => {
    const rows = data?.matterQueue || []
    let filtered = [...rows]

    if (managementFilters.matterType !== 'all') {
      filtered = filtered.filter((row) => row.matterType === managementFilters.matterType)
    }

    if (managementFilters.status !== 'all') {
      filtered = filtered.filter((row) => row.status === managementFilters.status)
    }

    if (managementFilters.department !== 'all') {
      filtered = filtered.filter((row) => row.assignedDepartmentId === managementFilters.department)
    }

    if (managementFilters.member !== 'all') {
      filtered = filtered.filter((row) => String(row.assignedUserId || '') === String(managementFilters.member))
    }

    return filtered
  }, [data?.matterQueue, managementFilters.department, managementFilters.matterType, managementFilters.member, managementFilters.status])

  const activeMatterRows = isManagementUser
    ? managementFilteredMatterRows
    : filterMatterRows(data?.matterQueue || [], userFilters, false)

  const priorityRows = filterPriorityRows(data?.priorityQueue || [], userFilters, matterByReference)
  const documentRows = filterDocumentRows(data?.documentQueue || [], userFilters, matterByReference)
  const appointmentRows = filterAppointmentRows(data?.appointmentQueue || [], userFilters, matterByReference)

  const showDocuments =
    Boolean(data?.permissions?.can_request_documents) ||
    Boolean(data?.permissions?.can_review_documents) ||
    Boolean(data?.permissions?.can_upload_documents)

  const showAppointments = Boolean(data?.permissions?.can_manage_signing_appointments)

  const availableMatterTypes = data?.availableFilters?.matterTypes || []
  const availableStatuses = data?.availableFilters?.statuses || []

  if (role !== 'attorney') {
    return <Navigate to="/dashboard" replace />
  }

  if (permissionsState.loading) {
    return (
      <section className="page">
        <div className="panel card-tier-standard">
          <p className="status-message" style={{ margin: 0 }}>Loading attorney permissions…</p>
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

  if (permissionsState.membership && !permissionsState.membership.isActive) {
    return (
      <section className="page">
        <div className="panel card-tier-standard" style={{ display: 'grid', gap: '0.45rem' }}>
          <h2 style={{ margin: 0 }}>Operational access unavailable</h2>
          <p className="status-message" style={{ margin: 0 }}>
            {permissionsState.membership.status === 'suspended'
              ? 'Your access to this firm has been suspended. Please contact your firm administrator.'
              : 'You are not an active member of this attorney firm.'}
          </p>
        </div>
      </section>
    )
  }

  if (loading) {
    return (
      <section className="page">
        <div className="panel card-tier-standard">
          <p className="status-message" style={{ margin: 0 }}>Loading attorney operations workspace…</p>
        </div>
      </section>
    )
  }

  if (!data?.firm?.id) {
    return <Navigate to="/attorney/onboarding" replace />
  }

  if (data?.accessBlocked) {
    return (
      <section className="page">
        <div className="panel card-tier-standard" style={{ display: 'grid', gap: '0.45rem' }}>
          <h2 style={{ margin: 0 }}>Operational access unavailable</h2>
          <p className="status-message" style={{ margin: 0 }}>
            Your attorney firm membership is not active. Please contact your firm administrator.
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

      <AttorneyOperationsHeader
        firm={data.firm}
        currentUser={data.currentUser}
        canViewFirmDashboard={Boolean(data.canViewFirmDashboard)}
      />

      <div className="panel card-tier-soft" style={{ display: 'grid', gap: '0.65rem' }}>
        <p className="status-message" style={{ margin: 0, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Workspace Filters
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Link to="/attorney/scheduling" className="header-secondary-cta" style={{ padding: '0.3rem 0.55rem' }}>
            Open Scheduling Operations Workspace
          </Link>
        </div>

        {isManagementUser ? (
          <div style={{ display: 'grid', gap: '0.65rem', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <label style={{ display: 'grid', gap: '0.3rem' }}>
              <span className="status-message">Department</span>
              <select
                className="input"
                value={managementFilters.department}
                onChange={(event) => setManagementFilters((prev) => ({ ...prev, department: event.target.value }))}
              >
                <option value="all">All Departments</option>
                {(data.availableFilters?.departments || []).map((department) => (
                  <option key={department.value} value={department.value}>{department.label}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: '0.3rem' }}>
              <span className="status-message">Staff Member</span>
              <select
                className="input"
                value={managementFilters.member}
                onChange={(event) => setManagementFilters((prev) => ({ ...prev, member: event.target.value }))}
              >
                <option value="all">All Staff</option>
                {(data.availableFilters?.members || []).map((member) => (
                  <option key={member.value} value={member.value}>{member.label}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: '0.3rem' }}>
              <span className="status-message">Matter Type</span>
              <select
                className="input"
                value={managementFilters.matterType}
                onChange={(event) => setManagementFilters((prev) => ({ ...prev, matterType: event.target.value }))}
              >
                <option value="all">All Matter Types</option>
                {availableMatterTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: '0.3rem' }}>
              <span className="status-message">Status</span>
              <select
                className="input"
                value={managementFilters.status}
                onChange={(event) => setManagementFilters((prev) => ({ ...prev, status: event.target.value }))}
              >
                <option value="all">All Statuses</option>
                {availableStatuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.65rem', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <label style={{ display: 'grid', gap: '0.3rem' }}>
              <span className="status-message">Priority</span>
              <select
                className="input"
                value={userFilters.priority}
                onChange={(event) => setUserFilters((prev) => ({ ...prev, priority: event.target.value }))}
              >
                <option value="all">All Priorities</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>

            <label style={{ display: 'grid', gap: '0.3rem' }}>
              <span className="status-message">Matter Type</span>
              <select
                className="input"
                value={userFilters.matterType}
                onChange={(event) => setUserFilters((prev) => ({ ...prev, matterType: event.target.value }))}
              >
                <option value="all">All Matter Types</option>
                {availableMatterTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: '0.3rem' }}>
              <span className="status-message">Status</span>
              <select
                className="input"
                value={userFilters.status}
                onChange={(event) => setUserFilters((prev) => ({ ...prev, status: event.target.value }))}
              >
                <option value="all">All Statuses</option>
                {availableStatuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      <AttorneyMyWorkKpis kpis={data.kpis} />
      <AttorneyPriorityQueue rows={priorityRows} />
      <AttorneyMatterQueue rows={activeMatterRows} />
      <AttorneyDocumentQueue rows={documentRows} allowed={showDocuments} />
      <AttorneyAppointmentQueue rows={appointmentRows} allowed={showAppointments} />
      <AttorneyUpdatesPanel rows={data.recentUpdates || []} />
    </section>
  )
}

export default AttorneyOperationsPage
