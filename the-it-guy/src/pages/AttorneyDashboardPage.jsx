import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import AttorneyDashboardHeader from '../components/attorney/dashboard/AttorneyDashboardHeader'
import AttorneyDepartmentOverview from '../components/attorney/dashboard/AttorneyDepartmentOverview'
import AttorneyKpiGrid from '../components/attorney/dashboard/AttorneyKpiGrid'
import AttorneyMattersAttention from '../components/attorney/dashboard/AttorneyMattersAttention'
import AttorneyRecentActivity from '../components/attorney/dashboard/AttorneyRecentActivity'
import AttorneyStaffWorkload from '../components/attorney/dashboard/AttorneyStaffWorkload'
import { useWorkspace } from '../context/WorkspaceContext'
import useAttorneyPermissions from '../hooks/useAttorneyPermissions'
import { getAttorneyManagementDashboardData } from '../services/attorneyDashboard'

const EMPTY_DASHBOARD = {
  firm: null,
  currentUserRole: null,
  canViewFirmDashboard: false,
  departments: [],
  members: [],
  kpis: {
    activeMatters: 0,
    transferMatters: 0,
    bondMatters: 0,
    lodgedThisWeek: 0,
    registeredThisMonth: 0,
    delayedMatters: 0,
    awaitingFica: 0,
    awaitingSignatures: 0,
  },
  departmentOverview: [],
  staffWorkload: [],
  mattersRequiringAttention: [],
  recentActivity: [],
}

function AttorneyDashboardPage() {
  const { role, profile } = useWorkspace()
  const permissionsState = useAttorneyPermissions()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD)

  const shellClass = 'mx-auto grid w-full max-w-[1680px] gap-4 px-4 py-5 sm:px-5 lg:px-6'
  const stateCardClass = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'
  const mutedTextClass = 'text-sm text-slate-600'

  useEffect(() => {
    let active = true

    async function loadDashboard() {
      setLoading(true)
      setError('')
      try {
        const nextData = await getAttorneyManagementDashboardData()
        if (!active) return
        setDashboard(nextData || EMPTY_DASHBOARD)
      } catch (loadError) {
        if (!active) return
        setError(loadError?.message || 'Unable to load attorney management dashboard.')
        setDashboard(EMPTY_DASHBOARD)
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadDashboard()

    return () => {
      active = false
    }
  }, [])

  if (role !== 'attorney') {
    return <Navigate to="/dashboard" replace />
  }

  if (permissionsState.loading) {
    return (
      <section className={shellClass}>
        <div className={stateCardClass}>
          <p className={mutedTextClass}>Loading attorney permissions...</p>
        </div>
      </section>
    )
  }

  if (permissionsState.error) {
    return (
      <section className={shellClass}>
        <div className={stateCardClass}>
          <p className="text-sm text-red-700">{permissionsState.error}</p>
        </div>
      </section>
    )
  }

  if (permissionsState.membership && !permissionsState.membership.isActive) {
    return (
      <section className={shellClass}>
        <div className={stateCardClass}>
          <p className={mutedTextClass}>
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
      <section className={shellClass}>
        <div className={stateCardClass}>
          <p className={mutedTextClass}>Loading attorney management dashboard...</p>
        </div>
      </section>
    )
  }

  if (!dashboard?.firm?.id) {
    const hasProfileFirmLink = Boolean(String(profile?.primaryAttorneyFirmId || '').trim())

    return (
      <section className={shellClass}>
        <div className={`${stateCardClass} grid gap-3`}>
          <h2 className="text-xl font-semibold text-slate-950">Firm Setup Pending</h2>
          <p className={mutedTextClass}>
            {hasProfileFirmLink
              ? 'Your profile points to an attorney firm, but we could not load an active firm workspace. Review or repair the firm setup to unlock full workflow access.'
              : 'Your onboarding is complete, but your attorney firm is not configured yet. Continue setup to unlock full workflow access.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/attorney/onboarding?repair=firm" className="inline-flex min-h-10 items-center rounded-xl bg-[#10273A] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F3E57]">
              {hasProfileFirmLink ? 'Repair Firm Setup' : 'Continue Firm Setup'}
            </Link>
            <Link to="/setup" className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">View Setup Status</Link>
          </div>
        </div>
      </section>
    )
  }

  if (!dashboard.canViewFirmDashboard) {
    return <Navigate to="/attorney/operations" replace />
  }

  const activeDepartmentCount = (dashboard.departments || []).filter((department) => department.isActive).length
  const activeMembersCount = (dashboard.members || []).filter((member) => member.status === 'active').length

  return (
    <section className={shellClass}>
      {error ? (
        <div className={stateCardClass}>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : null}

      <AttorneyDashboardHeader
        firm={dashboard.firm}
        currentUserRole={dashboard.currentUserRole}
        activeDepartmentsCount={activeDepartmentCount}
        activeMembersCount={activeMembersCount}
      />

      {permissionsState.canManageFirmSettings ? (
        <div className="flex justify-end">
          <Link to="/attorney/firm-settings" className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">Manage Firm Settings</Link>
        </div>
      ) : null}

      <AttorneyKpiGrid kpis={dashboard.kpis} />
      <AttorneyDepartmentOverview departments={dashboard.departmentOverview} />
      <AttorneyStaffWorkload rows={dashboard.staffWorkload} />
      <AttorneyMattersAttention rows={dashboard.mattersRequiringAttention} />
      <AttorneyRecentActivity rows={dashboard.recentActivity} />
    </section>
  )
}

export default AttorneyDashboardPage
