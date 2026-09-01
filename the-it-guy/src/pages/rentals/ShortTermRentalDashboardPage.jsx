import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { listShortTermBookings } from '../../services/rentals/rentalShortTermBookingRepository.js'
import { buildShortTermRentalDashboard } from '../../services/rentals/shortTermRentalDashboardModel.js'
import { listShortTermUnitInventory } from '../../services/rentals/rentalShortTermInventoryRepository.js'
import { listShortTermRatePlans } from '../../services/rentals/rentalShortTermRatePlanRepository.js'
import { listShortTermTurnovers } from '../../services/rentals/rentalShortTermTurnoverRepository.js'
import { resolveRentalWorkspaceScope } from '../../services/rentals/rentalWorkspaceScope.js'
import { AttentionPanel, DailyGuestLists, Metrics, OccupancyForecast, TodayTimeline } from './ShortTermDashboardComponents.jsx'

const DATE_OPTIONS = [{ value: 'last_7_days', label: 'Last 7 Days', days: 7 }, { value: 'last_30_days', label: 'Last 30 Days', days: 30 }, { value: 'last_90_days', label: 'Last 90 Days', days: 90 }]
const rangeDays = (value) => DATE_OPTIONS.find((option) => option.value === value)?.days || 30

export default function ShortTermRentalDashboardPage() {
  const workspace = useWorkspace()
  const scope = useMemo(() => resolveRentalWorkspaceScope(workspace), [workspace])
  const [dataScope, setDataScope] = useState('company')
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('all')
  const [dateRange, setDateRange] = useState('last_30_days')
  const [source, setSource] = useState({ units: [], bookings: [], turnovers: [], ratePlans: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const workspaceOptions = useMemo(() => [{ value: 'all', label: 'All Branches' }, ...(scope.branchId ? [{ value: scope.branchId, label: 'My Branch' }] : [])], [scope.branchId])

  const load = useCallback(async () => {
    if (!scope.organisationId) {
      setSource({ units: [], bookings: [], turnovers: [], ratePlans: [] })
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError('')
      const branchId = selectedWorkspaceId === 'all' ? '' : selectedWorkspaceId
      const [units, bookings, turnovers, ratePlans] = await Promise.all([
        listShortTermUnitInventory({ organisationId: scope.organisationId, branchId }),
        listShortTermBookings({ organisationId: scope.organisationId, branchId, from: new Date(Date.now() - 86_400_000).toISOString() }),
        listShortTermTurnovers({ organisationId: scope.organisationId, branchId }),
        listShortTermRatePlans({ organisationId: scope.organisationId, branchId }),
      ])
      setSource({ units, bookings, turnovers, ratePlans })
    } catch (cause) {
      setError(cause?.message || 'Unable to load Short-Term operations.')
    } finally {
      setLoading(false)
    }
  }, [scope.organisationId, selectedWorkspaceId])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('itg:principal-dashboard-header-controls', { detail: {
      visible: true, dataScope, selectedWorkspaceId, dateRange,
      dataScopeOptions: [{ value: 'company', label: 'Company' }, { value: 'agent', label: 'Agent' }],
      workspaceOptions, dateOptions: DATE_OPTIONS.map(({ value, label }) => ({ value, label })),
    } }))
    return () => window.dispatchEvent(new CustomEvent('itg:principal-dashboard-header-controls', { detail: null }))
  }, [dataScope, dateRange, selectedWorkspaceId, workspaceOptions])
  useEffect(() => {
    const onChange = (event) => {
      const { key, value } = event.detail || {}
      if (key === 'dataScope') setDataScope(value === 'agent' ? 'agent' : 'company')
      if (key === 'selectedWorkspaceId') setSelectedWorkspaceId(String(value || 'all'))
      if (key === 'dateRange') setDateRange(DATE_OPTIONS.some((option) => option.value === value) ? value : 'last_30_days')
    }
    window.addEventListener('itg:principal-dashboard-header-filter-change', onChange)
    return () => window.removeEventListener('itg:principal-dashboard-header-filter-change', onChange)
  }, [])

  const dashboard = useMemo(() => buildShortTermRentalDashboard({ ...source, rangeDays: rangeDays(dateRange) }), [dateRange, source])
  const selectedRangeDays = rangeDays(dateRange)

  return <main className="mx-auto w-full max-w-[1600px] px-3 py-3 sm:px-5 lg:px-7"><div className="space-y-4 pb-8">
    {error ? <p className="rounded-xl border border-[#f2c6c6] bg-[#fff7f7] p-3 text-sm text-[#9f3131]">{error}</p> : null}
    {!scope.organisationId ? <p className="rounded-xl border border-[#f4d7a9] bg-[#fffaf0] p-3 text-sm text-[#7a4b05]">Choose an agency workspace to load Short-Term Rentals.</p> : null}
    <Metrics dashboard={dashboard} loading={loading} rangeDays={selectedRangeDays} />
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,1fr)]"><TodayTimeline dashboard={dashboard} loading={loading} /><AttentionPanel dashboard={dashboard} loading={loading} /></section>
    <DailyGuestLists dashboard={dashboard} loading={loading} />
    <OccupancyForecast dashboard={dashboard} />
  </div></main>
}
