import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { listShortTermBookings } from '../../services/rentals/rentalShortTermBookingRepository.js'
import { buildShortTermCalendarBoard, startOfCalendarWeek } from '../../services/rentals/shortTermRentalCalendarModel.js'
import { listShortTermUnitInventory } from '../../services/rentals/rentalShortTermInventoryRepository.js'
import { resolveRentalWorkspaceScope } from '../../services/rentals/rentalWorkspaceScope.js'
import { BookingCalendar, CalendarHeader, CalendarLegend, CalendarListView, CalendarToolbar } from './ShortTermCalendarComponents.jsx'

const addDays = (value, amount) => { const date = new Date(value); date.setDate(date.getDate() + amount); return date }

export default function ShortTermRentalCalendarPage() {
  const workspace = useWorkspace()
  const scope = useMemo(() => resolveRentalWorkspaceScope(workspace), [workspace])
  const [bookings, setBookings] = useState([])
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState('calendar')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [weekStart, setWeekStart] = useState(() => startOfCalendarWeek(new Date()))

  const load = useCallback(async () => {
    if (!scope.organisationId) {
      setBookings([]); setUnits([]); setLoading(false)
      return
    }
    try {
      setLoading(true); setError('')
      const [nextBookings, nextUnits] = await Promise.all([
        listShortTermBookings({ organisationId: scope.organisationId, branchId: scope.listingBranchId, from: addDays(weekStart, -1).toISOString() }),
        listShortTermUnitInventory({ organisationId: scope.organisationId, branchId: scope.listingBranchId }),
      ])
      setBookings(nextBookings); setUnits(nextUnits)
    } catch (cause) {
      setError(cause?.message || 'Unable to load the Short-Term calendar.')
    } finally {
      setLoading(false)
    }
  }, [scope.listingBranchId, scope.organisationId, weekStart])

  useEffect(() => { void load() }, [load])
  const board = useMemo(() => buildShortTermCalendarBoard({ units, bookings, weekStart }), [bookings, units, weekStart])
  const filteredBoard = useMemo(() => {
    const query = search.trim().toLowerCase()
    return { ...board, rows: board.rows.filter((row) => {
      const propertyMatches = !query || `${row.propertyName} ${row.unitLabel}`.toLowerCase().includes(query)
      const statusMatches = status === 'all' || row.bookings.some((booking) => booking.status === status)
      return propertyMatches && statusMatches
    }) }
  }, [board, search, status])

  return <main className="mx-auto w-full max-w-[1600px] px-3 py-3 sm:px-5 lg:px-7"><section className="rounded-[20px] border border-[#e4ebf2] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,.035)] sm:p-5">
    <CalendarHeader summary={board.summary} />
    {error ? <p className="mt-4 rounded-xl border border-[#f2c6c6] bg-[#fff7f7] p-3 text-sm text-[#9f3131]">{error}</p> : null}
    {!scope.organisationId ? <p className="mt-4 rounded-xl border border-[#f4d7a9] bg-[#fffaf0] p-3 text-sm text-[#7a4b05]">Choose an agency workspace to load the Short-Term calendar.</p> : null}
    <CalendarToolbar view={view} setView={setView} search={search} setSearch={setSearch} status={status} setStatus={setStatus} weekStart={board.weekStart} onToday={() => setWeekStart(startOfCalendarWeek(new Date()))} onPrevious={() => setWeekStart((value) => addDays(value, -7))} onNext={() => setWeekStart((value) => addDays(value, 7))} />
    {view === 'calendar' ? <BookingCalendar board={filteredBoard} loading={loading} today={new Date()} /> : <CalendarListView rows={filteredBoard.rows} />}
    <CalendarLegend />
  </section></main>
}
