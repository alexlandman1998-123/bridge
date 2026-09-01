import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { canUseRentalCapability, RENTAL_CAPABILITIES } from '../../modules/rentals/shared/permissions/rentalCapabilities.js'
import { createShortTermBooking, listShortTermBookings, updateShortTermBookingStatus } from '../../services/rentals/rentalShortTermBookingRepository.js'
import { listShortTermUnitInventory } from '../../services/rentals/rentalShortTermInventoryRepository.js'
import { resolveRentalWorkspaceScope } from '../../services/rentals/rentalWorkspaceScope.js'
import { BookingDrawer, BookingFilters, BookingsHeader, BookingList, BookingPagination, BookingTabs } from './ShortTermBookingsComponents.jsx'

const initialForm = { unitId: '', guestName: '', guestEmail: '', guestPhone: '', checkInAt: '', checkOutAt: '', adults: 1, children: 0, source: 'direct', notes: '' }
const dayKey = (value) => new Date(value).toISOString().slice(0, 10)
const tabStatus = { all: null, upcoming: 'confirmed', in_house: 'checked_in', completed: 'checked_out', cancelled: 'cancelled' }

export default function ShortTermBookingsPage() {
  const workspace = useWorkspace()
  const scope = useMemo(() => resolveRentalWorkspaceScope(workspace), [workspace])
  const canManage = canUseRentalCapability(RENTAL_CAPABILITIES.shortTermManage, workspace)
  const [bookings, setBookings] = useState([])
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState(initialForm)
  const [drawer, setDrawer] = useState(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [property, setProperty] = useState('all')
  const [activeTab, setActiveTab] = useState('all')
  const [sort, setSort] = useState('checkin_soonest')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const enabledUnits = useMemo(() => units.filter((unit) => unit.isShortTermEnabled), [units])

  const load = useCallback(async () => {
    if (!scope.organisationId) { setBookings([]); setUnits([]); setLoading(false); return }
    try {
      setLoading(true); setError('')
      const [nextBookings, nextUnits] = await Promise.all([
        listShortTermBookings({ organisationId: scope.organisationId, branchId: scope.listingBranchId }),
        listShortTermUnitInventory({ organisationId: scope.organisationId, branchId: scope.listingBranchId }),
      ])
      setBookings(nextBookings); setUnits(nextUnits)
    } catch (reason) {
      setError(reason?.message || 'Unable to load Short-Term bookings.')
    } finally {
      setLoading(false)
    }
  }, [scope.organisationId, scope.listingBranchId])

  useEffect(() => { void load() }, [load])
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const closeDrawer = () => { setDrawer(null); setForm(initialForm) }
  const submit = async (event) => {
    event.preventDefault()
    const unit = enabledUnits.find((item) => item.id === form.unitId)
    if (!unit) { setError('Choose a unit enabled for Short-Term operation.'); return }
    try {
      setSaving(true); setError('')
      await createShortTermBooking({ ...form, organisationId: unit.organisationId, propertyId: unit.propertyId, branchId: unit.branchId, unitId: unit.id, createdBy: workspace.profile?.id || workspace.userId })
      closeDrawer(); await load()
    } catch (reason) {
      setError(reason?.message || 'Unable to create this booking. The unit may no longer be available for those dates.')
    } finally {
      setSaving(false)
    }
  }
  const changeStatus = async (booking, nextStatus) => {
    try { setUpdatingId(booking.id); setError(''); await updateShortTermBookingStatus(booking.id, nextStatus); await load() } catch (reason) { setError(reason?.message || 'Unable to update booking status.') } finally { setUpdatingId('') }
  }

  const metrics = useMemo(() => {
    const now = new Date(); const sevenDays = new Date(now); sevenDays.setDate(sevenDays.getDate() + 7); const today = dayKey(now)
    return { inHouse: bookings.filter((booking) => booking.status === 'checked_in').length, upcoming: bookings.filter((booking) => booking.status === 'confirmed' && new Date(booking.checkInAt) <= sevenDays).length, action: bookings.filter((booking) => booking.status === 'provisional').length, dueToday: bookings.filter((booking) => booking.status === 'checked_in' && dayKey(booking.checkOutAt) === today).length }
  }, [bookings])
  const counts = useMemo(() => ({ all: bookings.length, upcoming: bookings.filter((booking) => booking.status === 'confirmed').length, in_house: bookings.filter((booking) => booking.status === 'checked_in').length, completed: bookings.filter((booking) => booking.status === 'checked_out').length, cancelled: bookings.filter((booking) => booking.status === 'cancelled').length }), [bookings])
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase(); const tab = tabStatus[activeTab]
    return bookings.filter((booking) => {
      const queryMatch = !query || `${booking.guestName} ${booking.propertyName} ${booking.unitLabel} ${booking.id}`.toLowerCase().includes(query)
      return queryMatch && (status === 'all' || booking.status === status) && (property === 'all' || booking.unitId === property) && (!tab || booking.status === tab)
    }).sort((left, right) => {
      if (sort === 'checkin_latest') return new Date(right.checkInAt) - new Date(left.checkInAt)
      if (sort === 'checkout_soonest') return new Date(left.checkOutAt) - new Date(right.checkOutAt)
      if (sort === 'guest') return String(left.guestName).localeCompare(String(right.guestName))
      return new Date(left.checkInAt) - new Date(right.checkInAt)
    })
  }, [activeTab, bookings, property, search, sort, status])
  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize])
  useEffect(() => { setPage(1) }, [activeTab, property, search, status, sort])
  const activeFilters = Boolean(search || status !== 'all' || property !== 'all' || activeTab !== 'all')
  const clearFilters = () => { setSearch(''); setStatus('all'); setProperty('all'); setActiveTab('all') }

  return <main className="mx-auto w-full max-w-[1600px] px-3 py-3 sm:px-5 lg:px-7"><div className="space-y-4 pb-8">
    <BookingsHeader metrics={metrics} canManage={canManage} onNewBooking={() => setDrawer({ type: 'new' })} />
    {error ? <p className="rounded-xl border border-[#f2c6c6] bg-[#fff7f7] p-3 text-sm text-[#9f3131]">{error}</p> : null}
    {!scope.organisationId ? <p className="rounded-xl border border-[#f4d7a9] bg-[#fffaf0] p-3 text-sm text-[#7a4b05]">Choose an agency workspace to load Short-Term bookings.</p> : null}
    <section className="overflow-hidden rounded-[20px] border border-[#e4ebf0] bg-white shadow-[0_10px_28px_rgba(15,23,42,.035)]"><BookingFilters search={search} setSearch={setSearch} status={status} setStatus={setStatus} property={property} setProperty={setProperty} properties={enabledUnits} activeFilters={activeFilters} onClear={clearFilters} /><BookingTabs activeTab={activeTab} setActiveTab={setActiveTab} counts={counts} sort={sort} setSort={setSort} /><BookingList bookings={paged} loading={loading} canManage={canManage} updatingId={updatingId} onChangeStatus={changeStatus} onOpen={(booking) => setDrawer({ type: 'detail', booking })} onNewBooking={() => setDrawer({ type: 'new' })} /><BookingPagination page={page} setPage={setPage} total={filtered.length} pageSize={pageSize} setPageSize={setPageSize} /></section>
    <BookingDrawer open={Boolean(drawer)} onClose={closeDrawer} booking={drawer?.booking || null} form={form} set={set} enabledUnits={enabledUnits} saving={saving} onSubmit={submit} canManage={canManage} onChangeStatus={changeStatus} updatingId={updatingId} />
  </div></main>
}
