import { useEffect, useMemo, useState } from 'react'
import { MoreVertical } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { fetchAssignedDevelopmentIdsForRole, fetchDevelopmentOptions } from '../../lib/api'
import { getPrivateListingCoverImageUrls, getListingCardImageSource } from '../../services/privateListingService'
import { buildRentalListingIndexRows } from '../../services/rentals/rentalListingIndexModel'
import { getListingLiveChannels } from '../../services/listings/listingMarketingChannelPresentation'
import useListingWebsitePublications from '../../hooks/useListingWebsitePublications'
import SalesListingIndexCard from '../listings/SalesListingIndexCard'
import RentalListingIndexCard from '../listings/RentalListingIndexCard'
import DevelopmentListingIndexCard from '../listings/DevelopmentListingIndexCard'
import { EmptyWorkspaceState, PrincipalAgentTabShell } from './AgentWorkspaceUi'
import { agentListingFallbackImage, agentSalesListingCard, agentWorkspaceListingScope, buildAgentDevelopmentCards, splitAgentListings } from './agentWorkspaceListingsModel'

const currency = (value) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(Number(value || 0))
const MODES = [['sales', 'Sales'], ['rentals', 'Rentals'], ['developments', 'Developments']]
export default function AgentWorkspaceListings({ agent }) {
  const navigate = useNavigate()
  const [mode, setMode] = useState('sales')
  const [openMenu, setOpenMenu] = useState('')
  const [covers, setCovers] = useState({})
  const [imageError, setImageError] = useState('')
  const [retry, setRetry] = useState(0)
  const [developments, setDevelopments] = useState({ loaded: false, loading: false, error: '', options: [], assignedIds: [] })
  useEffect(() => {
    if (!openMenu) return undefined
    const close = () => setOpenMenu('')
    const key = (event) => { if (event.key === 'Escape') close() }
    window.addEventListener('click', close)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', key) }
  }, [openMenu])
  const groups = useMemo(() => splitAgentListings(agent), [agent])
  const scope = agentWorkspaceListingScope(agent)
  const visibleListings = mode === 'rentals' ? groups.rentals : mode === 'sales' ? groups.sales : []
  const websitePublications = useListingWebsitePublications(visibleListings, scope)
  const imageKey = JSON.stringify(visibleListings.map((row) => [row.id, row.updatedAt || row.updated_at || '']))
  const organisationId = agent.organisationId || agent.organisation_id
  const userId = agent.userId || agent.user_id || agent.id
  const email = agent.email || ''
  const developmentCards = useMemo(() => buildAgentDevelopmentCards(agent, developments.options, developments.assignedIds), [agent, developments.options, developments.assignedIds])
  useEffect(() => {
    let cancelled = false
    const ids = JSON.parse(imageKey).map(([id]) => id)
    if (!ids.length || !organisationId) return undefined
    getPrivateListingCoverImageUrls(ids).then((urls) => {
      if (!cancelled) { setCovers((current) => ({ ...current, ...Object.fromEntries(ids.map((id) => [id, urls[id] || ''])) })); setImageError('') }
    }).catch(() => { if (!cancelled) setImageError('Listing photos could not be loaded.') })
    return () => { cancelled = true }
  }, [imageKey, organisationId, retry])
  useEffect(() => {
    if (mode !== 'developments' || developments.loaded || !organisationId || !userId) return undefined
    let cancelled = false
    Promise.resolve().then(async () => {
      if (cancelled) return
      setDevelopments((current) => ({ ...current, loading: true, error: '' }))
      const [assignedIds, organisationOptions] = await Promise.all([
        fetchAssignedDevelopmentIdsForRole({ userId, participantEmail: email, roleType: 'agent' }),
        fetchDevelopmentOptions({ organisationId }),
      ])
      const missing = assignedIds.filter((id) => !organisationOptions.some((row) => row.id === id))
      const assignedOptions = missing.length ? await fetchDevelopmentOptions({ developmentIds: missing }) : []
      if (!cancelled) setDevelopments({ loaded: true, loading: false, error: '', options: [...organisationOptions, ...assignedOptions], assignedIds })
    }).catch(() => { if (!cancelled) setDevelopments((current) => ({ ...current, loading: false, error: 'Assigned developments could not be loaded.' })) })
    return () => { cancelled = true }
  }, [mode, developments.loaded, organisationId, userId, email, retry])
  const openListing = (listing) => navigate(mode === 'rentals' ? `/agent/rentals/listings/${encodeURIComponent(listing.id)}` : `/agent/listings/${encodeURIComponent(listing.id)}`)
  const action = (listing) => <button type="button" role="menuitem" onClick={() => openListing(listing)} className="flex min-h-10 w-full items-center px-3 text-left text-sm font-semibold text-[#1f4f78] hover:bg-[#f5f9fd]">Open listing</button>
  return <PrincipalAgentTabShell title="Listings" description="Sales, rentals and developments assigned to this agent.">
    <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Listing type">
      {MODES.map(([key, label]) => <button key={key} type="button" aria-pressed={mode === key} onClick={() => { setMode(key); setOpenMenu('') }} className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-4 text-sm font-semibold transition ${mode === key ? 'border-[#1f4f78] bg-[#1f4f78] text-white' : 'border-[#dce6f2] bg-white text-[#35546c] hover:bg-[#f8fbff]'}`}>{label}</button>)}
    </div>
    {imageError && mode !== 'developments' ? <p role="alert" className="mb-4 text-sm text-[#a13b35]">{imageError} <button type="button" onClick={() => setRetry((value) => value + 1)} className="underline">Retry photos</button></p> : null}
    {mode === 'developments' ? <>
      {developments.loading ? <p role="status" className="mb-4 text-sm text-[#60758c]">Loading assigned developments…</p> : null}
      {developments.error ? <p role="alert" className="mb-4 text-sm text-[#a13b35]">{developments.error} <button type="button" onClick={() => setRetry((value) => value + 1)} className="underline">Retry</button></p> : null}
      {developmentCards.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{developmentCards.map((card) => <DevelopmentListingIndexCard key={card.id} card={card} onOpen={() => navigate(`/developments/${encodeURIComponent(card.id)}`)} />)}</div> : !developments.loading && !developments.error ? <EmptyWorkspaceState>No developments assigned to this agent.</EmptyWorkspaceState> : null}
    </> : visibleListings.length ? <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {mode === 'sales' ? groups.sales.map((listing, index) => {
        const card = { ...agentSalesListingCard(listing, agent), liveChannels: getListingLiveChannels(listing, websitePublications[listing.id]) }
        return <SalesListingIndexCard key={listing.id} card={card} imageSource={getListingCardImageSource(covers[listing.id] || agentListingFallbackImage(listing))} priceLabel={currency(card.price)} priority={index < 4} onOpen={() => openListing(listing)} actions={<div className="absolute right-3 top-3 z-10" onClick={(event) => event.stopPropagation()}><button type="button" aria-label={`Open actions for ${card.title}`} aria-expanded={openMenu === listing.id} aria-haspopup="menu" onClick={() => setOpenMenu(openMenu === listing.id ? '' : listing.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/45 bg-white/90 text-[#607387] shadow-[0_8px_18px_rgba(9,19,34,0.14)] transition hover:bg-white"><MoreVertical size={16} /></button>{openMenu === listing.id ? <div role="menu" className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-[12px] border border-[#dce6f2] bg-white py-1 shadow-[0_14px_30px_rgba(15,23,42,0.16)]">{action(listing)}</div> : null}</div>} />
      }) : buildRentalListingIndexRows(groups.rentals).map((row) => <RentalListingIndexCard key={row.id} row={{ ...row, imageUrl: covers[row.id] || row.imageUrl || agentListingFallbackImage(groups.rentals.find((listing) => listing.id === row.id)), assignedAgentName: row.assignedAgentName || agent.name || agent.fullName || [agent.firstName, agent.lastName].filter(Boolean).join(' '), assignedAgentContact: row.assignedAgentContact || agent.email }} liveChannels={getListingLiveChannels({ ...row, bridgeListingStatus: row.websiteStatus }, websitePublications[row.id])} onOpen={() => openListing(row)} menuOpen={openMenu === row.id} onMenu={() => setOpenMenu(openMenu === row.id ? '' : row.id)} actions={action(row)} />)}
    </div> : <EmptyWorkspaceState>No {mode === 'rentals' ? 'rental' : 'sales'} listings assigned to this agent.</EmptyWorkspaceState>}
  </PrincipalAgentTabShell>
}
