import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  CalendarDays,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import RentalStockReviewPanel from './RentalStockReviewPanel'
import { useWorkspace } from '../../context/WorkspaceContext'
import FinalListingModuleOverview from '../../components/listings/FinalListingModuleOverview'
import RentalListingIndexCard from '../../components/listings/RentalListingIndexCard'
import useListingWebsitePublications from '../../hooks/useListingWebsitePublications'
import { getListingLiveChannels } from '../../services/listings/listingMarketingChannelPresentation'
import { buildFinalListingModuleOverview } from '../../services/listings/finalListingModuleModel'
import { listRentalListingsForAgent } from '../../services/rentals/rentalListingDraftService'
import { deleteRentalListing, inspectRentalListingDeletion } from '../../services/rentals/rentalListingDeletionService'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import {
  buildRentalListingIndexRows,
  filterRentalListingIndexRows,
  RENTAL_LISTING_STATUS_TABS,
  summarizeRentalListingIndexRows,
} from '../../services/rentals/rentalListingIndexModel'
import {
  buildRentalListingQueryOptions,
  resolveRentalWorkspaceScope,
} from '../../services/rentals/rentalWorkspaceScope'

export default function RentalListingsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const workspaceContext = useWorkspace()
  const rentalScope = useMemo(() => resolveRentalWorkspaceScope(workspaceContext), [workspaceContext])
  const organisationId = rentalScope.organisationId
  const assignedAgentId = rentalScope.assignedAgentId
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [statusTab, setStatusTab] = useState('current')
  const [menuId, setMenuId] = useState('')
  const [pendingDeletion, setPendingDeletion] = useState(null)
  const [deletionState, setDeletionState] = useState(null)
  const [deletionError, setDeletionError] = useState('')
  const [checkingDeletion, setCheckingDeletion] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const rentalRows = useMemo(() => buildRentalListingIndexRows(listings), [listings])
  const summary = useMemo(() => summarizeRentalListingIndexRows(rentalRows), [rentalRows])
  const finalListingModuleOverview = useMemo(
    () => buildFinalListingModuleOverview({
      activeType: 'rentals',
      salesCount: null,
      rentalCount: summary.total,
      developmentCount: null,
    }),
    [summary.total],
  )
  const filteredRows = useMemo(
    () => filterRentalListingIndexRows(rentalRows, { status: statusTab }),
    [rentalRows, statusTab],
  )
  const websitePublications = useListingWebsitePublications(filteredRows, assignedAgentId && organisationId ? `${assignedAgentId}:${organisationId}` : '')

  const loadListings = useCallback(async () => {
    if (!assignedAgentId || !organisationId) {
      setListings([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError('')
      const rows = await listRentalListingsForAgent(assignedAgentId, { ...buildRentalListingQueryOptions(rentalScope), includeWithdrawnListings: true, includePreviousListings: true })
      setListings(rows)
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load rental listings.')
      setListings([])
    } finally {
      setLoading(false)
    }
  }, [assignedAgentId, organisationId, rentalScope])

  useEffect(() => {
    void loadListings()
  }, [loadListings])

  useEffect(() => {
    if (!menuId) return undefined
    const close = event => {
      if (event.type === 'click' || event.key === 'Escape') setMenuId('')
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [menuId])

  useEffect(() => {
    let cancelled = false
    setDeletionState(null)
    setDeletionError('')
    if (!pendingDeletion) return undefined
    setCheckingDeletion(true)
    void inspectRentalListingDeletion(pendingDeletion.id, buildRentalListingQueryOptions(rentalScope))
      .then(state => { if (!cancelled) setDeletionState(state) })
      .catch(error => { if (!cancelled) setDeletionError(error.message || 'Unable to check this listing.') })
      .finally(() => { if (!cancelled) setCheckingDeletion(false) })
    return () => { cancelled = true }
  }, [pendingDeletion, rentalScope])

  const openWithdrawal = row => {
    setMenuId('')
    setPendingDeletion(null)
    navigate(`/agent/rentals/listings/${encodeURIComponent(row.id)}/marketing`)
  }

  async function confirmDeletion() {
    if (deleting || checkingDeletion || !deletionState?.canDelete) return
    setDeleting(true)
    setDeletionError('')
    try {
      await deleteRentalListing(pendingDeletion.id, buildRentalListingQueryOptions(rentalScope))
      setListings(rows => rows.filter(row => row.id !== pendingDeletion.id))
      setSuccessMessage(`“${pendingDeletion.title}” was permanently deleted.`)
      setPendingDeletion(null)
      window.dispatchEvent(new Event('itg:listings-updated'))
    } catch (error) {
      setDeletionError(error.message || 'Unable to delete this rental listing.')
      if (error.deletionState) setDeletionState(error.deletionState)
    } finally {
      setDeleting(false)
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search || '')
    if (params.get('create') === 'rental') {
      navigate('/agent/rentals/listings/new', { replace: true })
    }
  }, [location.search, navigate])

  useEffect(() => {
    const createdTitle = location.state?.rentalListingCreatedTitle
    if (createdTitle) {
      setSuccessMessage(`${createdTitle} was captured as a rental listing draft.`)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, location.state, navigate])

  return (
    <section className="page-content">
      <div className="ui-section-stack">
        <FinalListingModuleOverview
          overview={finalListingModuleOverview}
          onNavigate={(path) => path && navigate(path)}
        />

        {error ? <p className="rounded-[8px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">{error}</p> : null}
        {successMessage ? (
          <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#cfe8dc] bg-[#f2fbf5] px-4 py-3 text-sm font-semibold text-[#286b43]">
            <CheckCircle2 size={16} aria-hidden="true" />
            {successMessage}
          </p>
        ) : null}

        <RentalStockReviewPanel
          key={`${organisationId}:${assignedAgentId}:${rentalScope.listingBranchId}:${rentalScope.includeAllOrganisationListings}`}
          scope={rentalScope}
          onOpen={(id) => navigate(`/agent/rentals/listings/${encodeURIComponent(id)}/marketing`)}
        />

        <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-[1.02rem] font-semibold text-[#142132]">Rental Listings</h2>
              <p className="mt-1 text-sm text-[#607387]">
                Rental stock, landlord readiness, applications, and Property24 rental preparation.
              </p>
            </div>

          </div>

          <div className="mb-5 grid gap-2 rounded-[18px] border border-[#dbe6f2] bg-[#f5f9fd] p-1.5 sm:grid-cols-2" aria-label="Rental listing collections">
            {RENTAL_LISTING_STATUS_TABS.map((tab) => {
              const count = summary[tab.key] || 0
              const active = statusTab === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStatusTab(tab.key)}
                  className={`rounded-[12px] border px-3 py-2.5 text-left transition ${active
                    ? 'border-[#1f4f78] bg-[#1f4f78] text-white shadow-[0_8px_16px_rgba(31,79,120,0.2)]'
                    : 'border-[#d8e3ef] bg-white text-[#35546c] hover:border-[#b7c8db]'}`}
                >
                  <span className="flex items-center justify-between gap-3 text-sm font-semibold">
                    {tab.label}
                    <span className={`rounded-full px-2 py-0.5 text-xs ${active ? 'bg-white/18 text-white' : 'bg-[#edf4fa] text-[#4e6983]'}`}>{count}</span>
                  </span>
                  <span className={`mt-1 block text-xs ${active ? 'text-white/80' : 'text-[#7b8ca2]'}`}>{tab.description}</span>
                </button>
              )
            })}
          </div>

          {loading ? (
            <div className="flex items-center gap-3 rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-6 text-sm font-semibold text-[#6c7f95]">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Loading rental listings
            </div>
          ) : filteredRows.length ? (
            <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredRows.map((row) => (
                <RentalListingIndexCard
                  key={row.id}
                  row={row}
                  liveChannels={getListingLiveChannels({ ...row, bridgeListingStatus: row.websiteStatus }, websitePublications[row.id])}
                  onOpen={() => navigate(`/agent/rentals/listings/${encodeURIComponent(row.id)}`)}
                  menuOpen={menuId === row.id}
                  onMenu={() => setMenuId(previous => previous === row.id ? '' : row.id)}
                  onDelete={() => { setMenuId(''); setPendingDeletion(row) }}
                  onWithdraw={() => openWithdrawal(row)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-[#d3deea] bg-[#fbfcfe] px-5 py-10 text-center">
              <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-[8px] border border-[#dbe6f2] bg-[#f8fafc] text-[#42617f]">
                <CalendarDays size={22} aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-lg font-semibold text-[#18324b]">{statusTab === 'previous' ? 'No previous rental listings' : 'No current rental listings'}</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm text-[#607891]">
                {statusTab === 'previous' ? 'Past rental listings and historical imports will appear here.' : 'Create a rental listing draft to add to your current stock.'}
              </p>
              <button type="button" className="ui-pill-button ui-pill-button-active mx-auto mt-4" onClick={() => navigate('/agent/rentals/listings/new')}>
                <Plus size={16} aria-hidden="true" />
                Create Rental Listing
              </button>
            </div>
          )}
        </section>
      </div>
      <Modal
        open={Boolean(pendingDeletion)}
        onClose={() => { if (!deleting) setPendingDeletion(null) }}
        title="Delete rental listing?"
        footer={(
          <div className="flex w-full flex-wrap items-center justify-end gap-3">
            <Button type="button" variant="secondary" disabled={deleting} onClick={() => setPendingDeletion(null)}>Cancel</Button>
            {deletionState && !deletionState.canDelete ? (
              <Button type="button" onClick={() => openWithdrawal(pendingDeletion)}>Manage withdrawal</Button>
            ) : null}
            <Button
              type="button"
              disabled={deleting || checkingDeletion || !deletionState?.canDelete}
              onClick={confirmDeletion}
              className="!bg-[#a13b35] !border-[#a13b35]"
            >
              {deleting ? 'Deleting…' : 'Delete listing'}
            </Button>
          </div>
        )}
      >
        <p>Permanently delete “{pendingDeletion?.title}”? This cannot be undone.</p>
        {checkingDeletion ? <p role="status" className="mt-3">Checking publishing status…</p> : null}
        {deletionState?.liveChannels.length ? <p role="alert" className="mt-3">Withdraw this listing from {deletionState.liveChannels.join(', ')} before deleting it.</p> : null}
        {deletionState?.unconfirmedChannels.length ? <p role="alert" className="mt-3">Confirm removal from {deletionState.unconfirmedChannels.join(', ')} before deleting it.</p> : null}
        {deletionError ? <p role="alert" className="mt-3 text-[#a13b35]">{deletionError}</p> : null}
      </Modal>
    </section>
  )
}
