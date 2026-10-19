import useCalendarRead from '../../hooks/useCalendarRead'
import { useMemo, useState } from 'react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { listShortTermBookings } from '../../services/rentals/rentalShortTermBookingRepository.js'
import { buildShortTermCalendarBoard, startOfCalendarWeek } from '../../services/rentals/shortTermRentalCalendarModel.js'
import { listShortTermUnitInventory } from '../../services/rentals/rentalShortTermInventoryRepository.js'
import { buildRentalWorkspaceKey, resolveRentalWorkspaceScope } from '../../services/rentals/rentalWorkspaceScope.js'
import { BookingCalendar, CalendarHeader, CalendarLegend, CalendarListView, CalendarToolbar } from './ShortTermCalendarComponents.jsx'

const addDays = (value, amount) => { const date = new Date(value); date.setDate(date.getDate() + amount); return date }

export default function ShortTermRentalCalendarPage() {
  const workspace = useWorkspace()
  const scope = resolveRentalWorkspaceScope(workspace)
  const [view, setView] = useState('calendar')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [weekStart, setWeekStart] = useState(() => startOfCalendarWeek(new Date()))

  const source = useCalendarRead({
    intervalMs: 0,
    scopeKey: JSON.stringify([buildRentalWorkspaceKey(scope), weekStart.toISOString()]), enabled: Boolean(scope.organisationId),
    read: async signal => {
      const results = await Promise.allSettled([
        listShortTermBookings({ organisationId: scope.organisationId, branchId: scope.listingBranchId, from: addDays(weekStart, -1).toISOString() }, { signal }),
        listShortTermUnitInventory({ organisationId: scope.organisationId, branchId: scope.listingBranchId }, { signal }),
      ])
      signal.throwIfAborted()
      const failure = results.find(result => result.status === 'rejected')
      if (failure) throw failure.reason
      const [bookings, units] = results.map(result => result.value)
      return { bookings, units }
    },
  })
  const bookings = source.data?.bookings || []
  const units = source.data?.units || []
  const loading = source.status === 'loading'
  const error = source.error
  const board = useMemo(() => buildShortTermCalendarBoard({ units, bookings, weekStart }), [bookings, units, weekStart])
  const filteredBoard = useMemo(() => {
    const query = search.trim().toLowerCase()
    return { ...board, rows: board.rows.filter((row) => {
      const propertyMatches = !query || `${row.propertyName} ${row.unitLabel}`.toLowerCase().includes(query)
      const statusMatches = status === 'all' || row.bookings.some((booking) => booking.status === status)
      return propertyMatches && statusMatches
    }) }
  }, [board, search, status])

  return <main className="mx-auto w-full max-w-[1600px] px-1.5 py-3 sm:px-2.5 lg:px-3.5"><section className="rounded-[20px] border border-[#e4ebf2] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,.035)] sm:p-5">
    <CalendarHeader summary={board.summary} />
    {error ? <p className="mt-4 rounded-xl border border-[#f2c6c6] bg-[#fff7f7] p-3 text-sm text-[#9f3131]">{error}</p> : null}
    {!scope.organisationId ? <p className="mt-4 rounded-xl border border-[#f4d7a9] bg-[#fffaf0] p-3 text-sm text-[#7a4b05]">Choose an agency workspace to load the Short-Term calendar.</p> : null}
    <CalendarToolbar view={view} setView={setView} search={search} setSearch={setSearch} status={status} setStatus={setStatus} weekStart={board.weekStart} onToday={() => setWeekStart(startOfCalendarWeek(new Date()))} onPrevious={() => setWeekStart((value) => addDays(value, -7))} onNext={() => setWeekStart((value) => addDays(value, 7))} />
    {view === 'calendar' ? <BookingCalendar board={filteredBoard} loading={loading} today={new Date()} /> : <CalendarListView rows={filteredBoard.rows} />}
    <CalendarLegend />
  </section></main>
}
