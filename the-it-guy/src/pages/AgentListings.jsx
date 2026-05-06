import { ArrowRight, Building2, FolderKanban, Plus, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import SectionHeader from '../components/ui/SectionHeader'
import { buildAgentDemoRows } from '../core/transactions/attorneyMockData'
import { getTransactionScopeForRow } from '../core/transactions/transactionScope'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  fetchAssignedDevelopmentIdsForRole,
  fetchDevelopmentOptions,
  fetchTransactionsByParticipantSummary,
} from '../lib/api'
import { startRouteTransitionTrace } from '../lib/performanceTrace'
import { invokeEdgeFunction } from '../lib/supabaseClient'
import {
  buildSellerOnboardingLink,
  createAgentSellerLead,
  createListingDraftFromSellerLead,
  generateId,
  generateSellerOnboardingToken,
  LISTING_STATUS,
  OFFER_STATUS,
  readAgentPrivateListings,
  SELLER_ONBOARDING_STATUS,
} from '../lib/agentListingStorage'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { formatSouthAfricanWhatsAppNumber, sendWhatsAppNotification } from '../lib/whatsapp'

const LISTINGS_VIEW_STORAGE_KEY = 'itg:agent-listings:view-mode:v1'
const TRANSFER_ATTORNEY_OPTIONS = ['Tuckers Attorneys', 'Van Breda Conveyancers', 'Ndlovu Legal Transfers']
const BOND_ATTORNEY_OPTIONS = ['Bond & Co Attorneys', 'HomeLoan Legal Desk', 'Mokoena Bond Attorneys']
const BOND_ORIGINATOR_OPTIONS = ['Bridge Bond Desk', 'Prime Originators', 'Urban Finance Originators']

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'Price on request'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function normalizeStatusKey(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'active'
  if (normalized.includes('offer')) return 'under_offer'
  if (normalized.includes('sold') || normalized.includes('register')) return 'sold'
  return 'active'
}

function getListingStatusLabel(key) {
  if (key === 'under_offer') return 'Under Offer'
  if (key === 'sold') return 'Sold'
  return 'Active'
}

function getPrivateListingStatus(listing) {
  const explicitStatus = normalizeStatusKey(listing?.status)
  if (explicitStatus !== 'active') return explicitStatus
  const offers = Array.isArray(listing?.offers) ? listing.offers : []
  const hasAccepted = offers.some((offer) => String(offer?.status || '').toLowerCase() === OFFER_STATUS.ACCEPTED)
  if (hasAccepted) return 'under_offer'
  return 'active'
}

function getMandateStatus(listing) {
  const endDate = String(listing?.mandateEndDate || '').trim()
  if (!endDate) return 'Active'
  const parsed = new Date(endDate)
  if (Number.isNaN(parsed.getTime())) return 'Active'
  return parsed.getTime() < Date.now() ? 'Expired' : 'Active'
}

function statusPillClass(statusKey) {
  if (statusKey === 'under_offer') return 'border-[#f5dbb0] bg-[#fff8ec] text-[#9a5b13]'
  if (statusKey === 'sold') return 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]'
  return 'border-[#dbe6f2] bg-[#f5f9fd] text-[#35546c]'
}

function ListingCardImage({ src = '', alt = '' }) {
  if (src) {
    return <img src={src} alt={alt} className="h-full w-full object-cover" />
  }

  return (
    <div className="relative h-full w-full bg-[linear-gradient(140deg,#1f4f78_0%,#4a7da8_55%,#a8c2dc_100%)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_22%,rgba(255,255,255,0.24),transparent_52%)]" />
      <div className="absolute bottom-3 left-3 rounded-full border border-white/35 bg-white/20 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-white">
        Listing image
      </div>
    </div>
  )
}

function readListingsViewMode() {
  if (typeof window === 'undefined') return 'private'
  const stored = String(window.localStorage.getItem(LISTINGS_VIEW_STORAGE_KEY) || '').trim().toLowerCase()
  return stored === 'developments' ? 'developments' : 'private'
}

function formatRelativeDate(value) {
  if (!value) return 'No recent activity'
  const delta = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(delta) || delta < 0) return 'Updated today'
  const days = Math.floor(delta / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'Updated today'
  if (days === 1) return 'Updated 1 day ago'
  if (days < 30) return `Updated ${days} days ago`
  const months = Math.floor(days / 30)
  return months <= 1 ? 'Updated 1 month ago' : `Updated ${months} months ago`
}

function buildInitialListingLeadForm(profile, workspace) {
  return {
    sellerName: '',
    sellerSurname: '',
    sellerEmail: '',
    sellerPhone: '',
    propertyAddress: '',
    suburb: '',
    propertyType: 'House',
    leadSource: 'Referral',
    assignedAgent: String(profile?.fullName || profile?.name || profile?.email || '').trim(),
    agencyOrganisation: String(profile?.agencyName || profile?.company || workspace?.name || '').trim(),
    listingCategory: 'private_sale',
    estimatedAskingPrice: '',
    transferAttorney: '',
    bondAttorney: '',
    bondOriginator: '',
    notes: '',
  }
}

function AgentListings() {
  const navigate = useNavigate()
  const location = useLocation()
  const { workspace, profile } = useWorkspace()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [workflowMessage, setWorkflowMessage] = useState('')
  const [listingsTab, setListingsTab] = useState(() => readListingsViewMode())
  const [showNewListingModal, setShowNewListingModal] = useState(false)
  const [developmentRows, setDevelopmentRows] = useState([])
  const [developmentOptions, setDevelopmentOptions] = useState([])
  const [assignedDevelopmentIds, setAssignedDevelopmentIds] = useState([])
  const [privateListings, setPrivateListings] = useState([])
  const [filters, setFilters] = useState({
    status: 'all',
    search: '',
  })

  const [form, setForm] = useState(() => buildInitialListingLeadForm(profile, workspace))

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      let participantRows = []
      let options = []
      let assignedIds = []
      if (isSupabaseConfigured) {
        ;[participantRows, assignedIds] = await Promise.all([
          profile?.id
            ? fetchTransactionsByParticipantSummary({ userId: profile.id, roleType: 'agent' })
            : Promise.resolve([]),
          fetchAssignedDevelopmentIdsForRole({
            userId: profile?.id || null,
            participantEmail: profile?.email || '',
            roleType: 'agent',
          }),
        ])

        options = assignedIds.length
          ? await fetchDevelopmentOptions({ developmentIds: assignedIds })
          : await fetchDevelopmentOptions()
      }
      const agentRows = buildAgentDemoRows(Array.isArray(participantRows) ? participantRows : [])
      setDevelopmentRows(agentRows.filter((row) => getTransactionScopeForRow(row) === 'development'))
      setDevelopmentOptions(Array.isArray(options) ? options : [])
      setAssignedDevelopmentIds(Array.isArray(assignedIds) ? assignedIds : [])
      setPrivateListings(readAgentPrivateListings())
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load listings at the moment.')
      setDevelopmentRows([])
      setDevelopmentOptions([])
      setAssignedDevelopmentIds([])
      setPrivateListings(readAgentPrivateListings())
    } finally {
      setLoading(false)
    }
  }, [profile?.email, profile?.id])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    function refresh() {
      void loadData()
    }
    window.addEventListener('itg:developments-changed', refresh)
    window.addEventListener('itg:listings-updated', refresh)
    return () => {
      window.removeEventListener('itg:developments-changed', refresh)
      window.removeEventListener('itg:listings-updated', refresh)
    }
  }, [loadData])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(LISTINGS_VIEW_STORAGE_KEY, listingsTab)
  }, [listingsTab])

  useEffect(() => {
    if (!location.state?.openNewListing) return
    setShowNewListingModal(true)
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, location.state, navigate])

  function updateForm(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  function resetForm() {
    setForm(buildInitialListingLeadForm(profile, workspace))
  }

  async function handleSaveListing(event) {
    event.preventDefault()

    if (!form.sellerName.trim() || !form.sellerSurname.trim() || !form.sellerEmail.trim() || !form.sellerPhone.trim() || !form.propertyAddress.trim() || !form.propertyType.trim()) {
      setError('Seller name, surname, email, phone, property address, and property type are required.')
      return
    }

    const token = generateSellerOnboardingToken()
    const onboardingLink = buildSellerOnboardingLink(token)
    const estimatedPrice = Number(form.estimatedAskingPrice || 0)
    const listingTitle = [form.propertyType.trim(), form.suburb.trim()].filter(Boolean).join(' - ') || form.propertyAddress.trim()
    const lead = createAgentSellerLead({
      id: generateId('seller_lead'),
      sellerName: form.sellerName.trim(),
      sellerSurname: form.sellerSurname.trim(),
      sellerEmail: form.sellerEmail.trim(),
      sellerPhone: form.sellerPhone.trim(),
      propertyAddress: [form.propertyAddress.trim(), form.suburb.trim()].filter(Boolean).join(', '),
      propertyType: form.propertyType,
      estimatedPrice,
      leadSource: form.leadSource.trim() || 'Referral',
      agentId: String(profile?.email || profile?.id || '').trim().toLowerCase(),
      assignedAgentName: form.assignedAgent.trim() || String(profile?.fullName || profile?.name || profile?.email || '').trim(),
      assignedAgentEmail: String(profile?.email || '').trim(),
      agencyId: profile?.agencyId || '',
      assignedAgent: form.assignedAgent.trim() || String(profile?.fullName || profile?.name || profile?.email || '').trim(),
      agencyOrganisation: form.agencyOrganisation.trim() || String(profile?.agencyName || profile?.company || workspace?.name || '').trim(),
      listingCategory: form.listingCategory,
      propertyData: {
        listingTitle,
        propertyAddress: form.propertyAddress.trim(),
        suburb: form.suburb.trim(),
        city: '',
        province: '',
      },
      rolePlayers: {
        transferAttorney: form.transferAttorney.trim(),
        bondAttorney: form.bondAttorney.trim(),
        bondOriginator: form.bondOriginator.trim(),
      },
      notes: form.notes.trim(),
      listingStatus: LISTING_STATUS.SELLER_ONBOARDING_SENT,
      sellerOnboarding: {
        token,
        link: onboardingLink,
        status: SELLER_ONBOARDING_STATUS.NOT_STARTED,
        startedAt: null,
        submittedAt: null,
        completedAt: null,
        reviewedAt: null,
        formData: {},
      },
    })
    createListingDraftFromSellerLead(lead, { stage: LISTING_STATUS.SELLER_ONBOARDING_SENT })

    // Do not block lead creation on notification issues.
    if (isSupabaseConfigured) {
      const sellerDisplayName = [form.sellerName.trim(), form.sellerSurname.trim()].filter(Boolean).join(' ') || 'Seller'
      const propertyLabel = listingTitle || form.propertyAddress.trim() || 'your property'
      const agentDisplayName = form.assignedAgent.trim() || String(profile?.fullName || profile?.name || '').trim() || 'your agent'
      const normalizedSellerPhone = formatSouthAfricanWhatsAppNumber(form.sellerPhone)

      try {
        const { error: emailError } = await invokeEdgeFunction('send-email', {
          body: {
            type: 'seller_onboarding',
            to: form.sellerEmail.trim(),
            sellerName: sellerDisplayName,
            propertyTitle: propertyLabel,
            onboardingLink,
          },
        })
        if (emailError) {
          console.error('[Seller Onboarding] email notification failed', {
            sellerEmail: form.sellerEmail.trim(),
            error: emailError,
          })
        } else {
          console.log('[Seller Onboarding] email notification sent', {
            sellerEmail: form.sellerEmail.trim(),
          })
        }
      } catch (emailInvokeError) {
        console.error('[Seller Onboarding] email notification failed', emailInvokeError)
      }

      try {
        const whatsappResult = await sendWhatsAppNotification({
          to: normalizedSellerPhone,
          role: 'seller',
          message: `Hi ${sellerDisplayName},\n\nYour agent has started your seller onboarding for ${propertyLabel}.\n\nPlease complete your onboarding here:\n${onboardingLink}\n\nAgent: ${agentDisplayName}\n\n- Bridge`,
        })
        if (!whatsappResult?.ok) {
          console.error('[Seller Onboarding] WhatsApp notification failed', {
            sellerPhone: normalizedSellerPhone,
            result: whatsappResult,
          })
        }
      } catch (whatsappError) {
        console.error('[Seller Onboarding] WhatsApp notification failed', whatsappError)
      }
    }

    setShowNewListingModal(false)
    resetForm()
    setError('')
    setWorkflowMessage('Seller lead created. Onboarding link generated. The listing now appears in Listings in Progress under seller onboarding pending.')
  }

  const privateListingCards = useMemo(() => {
    const agentName = String(profile?.fullName || profile?.name || profile?.email || 'Assigned Agent').trim()
    return privateListings.map((listing) => {
      const statusKey = getPrivateListingStatus(listing)
      return {
        id: String(listing.id || ''),
        typeLabel: 'Private Sale',
        title: listing.listingTitle || 'Untitled listing',
        suburb: [listing.suburb, listing.city].filter(Boolean).join(', ') || 'Location pending',
        price: Number(listing.askingPrice || 0),
        listingStatusKey: statusKey,
        listingStatusLabel: getListingStatusLabel(statusKey),
        mandateStatusLabel: getMandateStatus(listing),
        imageUrl: String(listing?.marketing?.mediaUrl || '').trim(),
        agentName,
      }
    })
  }, [privateListings, profile?.email, profile?.fullName, profile?.name])

  const filteredPrivateCards = useMemo(() => {
    const query = String(filters.search || '').trim().toLowerCase()
    return privateListingCards.filter((card) => {
      const statusMatch = filters.status === 'all' ? true : card.listingStatusKey === filters.status
      const searchMatch = query
        ? [card.title, card.suburb, card.typeLabel, card.agentName].join(' ').toLowerCase().includes(query)
        : true
      return statusMatch && searchMatch
    })
  }, [filters.search, filters.status, privateListingCards])

  const developmentCards = useMemo(() => {
    const grouped = new Map()
    const normalizedProfileEmail = String(profile?.email || '').trim().toLowerCase()
    const normalizedProfileName = String(profile?.fullName || profile?.name || '').trim().toLowerCase()

    for (const option of developmentOptions) {
      const developmentId = String(option?.id || '').trim()
      if (!developmentId) continue

      const teams = option?.stakeholder_teams && typeof option.stakeholder_teams === 'object' ? option.stakeholder_teams : {}
      const assignedAgents = Array.isArray(teams.agents) ? teams.agents : []
      const assignedDevelopers = Array.isArray(teams.developers) ? teams.developers : []
      const includesCurrentAgent =
        assignedAgents.some((agent) => {
          const email = String(agent?.email || agent?.contactEmail || '').trim().toLowerCase()
          return email && email === normalizedProfileEmail
        }) ||
        assignedAgents.some((agent) => {
          const name = String(agent?.name || agent?.contactName || '').trim().toLowerCase()
          return name && name === normalizedProfileName
        })

      const assignedByParticipantAccess = assignedDevelopmentIds.includes(developmentId)
      if (!includesCurrentAgent && !assignedByParticipantAccess && normalizedProfileEmail) {
        continue
      }

      grouped.set(developmentId, {
        id: developmentId,
        name: option?.name || 'Development',
        location: option?.location || 'Location pending',
        developer:
          assignedDevelopers.find((developer) => String(developer?.company || '').trim())?.company ||
          assignedDevelopers.find((developer) => String(developer?.name || '').trim())?.name ||
          'Developer pending',
        status: assignedDevelopers.some((developer) => String(developer?.status || '').trim().toLowerCase() === 'invited')
          ? 'developer_pending_access'
          : 'draft',
        assignedAgent:
          assignedAgents.find((agent) => String(agent?.email || agent?.contactEmail || '').trim().toLowerCase() === normalizedProfileEmail)?.name ||
          assignedAgents.find((agent) => String(agent?.email || agent?.contactEmail || '').trim().toLowerCase() === normalizedProfileEmail)?.contactName ||
          profile?.fullName ||
          profile?.name ||
          'Assigned Agent',
        totalUnits: Number(option?.planned_units || 0) || 0,
        unitsAvailable: Number(option?.planned_units || 0) || 0,
        unitsSoldOrReserved: 0,
        activeTransactionsCount: 0,
        registeredTransactionsCount: 0,
        buyerCount: 0,
        lastUpdatedAt: null,
      })
    }

    const scopedRows = developmentRows.filter((row) => {
      return workspace.id === 'all'
        ? true
        : String(row?.development?.id || row?.unit?.development_id || '') === String(workspace.id)
    })

    for (const row of scopedRows) {
      const developmentId = String(row?.development?.id || row?.unit?.development_id || '').trim()
      if (!developmentId) continue

      if (!grouped.has(developmentId)) {
        grouped.set(developmentId, {
          id: developmentId,
          name: row?.development?.name || 'Development',
          location: row?.development?.location || row?.transaction?.suburb || 'Location pending',
          developer: row?.development?.developerCompany || 'Developer pending',
          status: String(row?.development?.status || 'active').trim().toLowerCase(),
          assignedAgent: row?.transaction?.assigned_agent || profile?.fullName || profile?.name || 'Assigned Agent',
          totalUnits: 0,
          unitsAvailable: 0,
          unitsSoldOrReserved: 0,
          activeTransactionsCount: 0,
          registeredTransactionsCount: 0,
          buyerCount: 0,
          lastUpdatedAt: null,
        })
      }

      const current = grouped.get(developmentId)
      const stage = String(row?.stage || row?.transaction?.stage || '').trim().toLowerCase()
      const isRegistered = stage.includes('registered') || Boolean(row?.transaction?.registered_at)
      current.totalUnits += 1
      current.activeTransactionsCount += isRegistered ? 0 : 1
      current.registeredTransactionsCount += isRegistered ? 1 : 0
      current.buyerCount += row?.buyer?.name ? 1 : 0
      current.unitsSoldOrReserved += stage === 'available' ? 0 : 1
      current.unitsAvailable += stage === 'available' ? 1 : 0

      const updatedAt = row?.transaction?.updated_at || row?.transaction?.created_at || row?.unit?.updated_at || row?.unit?.created_at || null
      if (!current.lastUpdatedAt || new Date(updatedAt || 0) > new Date(current.lastUpdatedAt || 0)) {
        current.lastUpdatedAt = updatedAt
      }
    }

    return Array.from(grouped.values()).map((card) => {
      let status = String(card.status || '').trim().toLowerCase() || 'draft'
      if (status === 'draft' && card.totalUnits > 0) {
        status = 'active'
      }
      if (card.totalUnits > 0 && card.unitsSoldOrReserved >= card.totalUnits) {
        status = 'sold_out'
      } else if (card.unitsSoldOrReserved > 0 && status !== 'developer_pending_access') {
        status = 'partially_sold'
      }

      const nextAction =
        status === 'developer_pending_access'
          ? 'Awaiting developer access acceptance'
          : card.totalUnits <= 0
            ? 'Add unit stock'
            : card.activeTransactionsCount > 0
              ? 'Monitor active deals'
              : 'Start deal from available unit'

      return {
        ...card,
        status,
        nextAction,
      }
    }).sort((left, right) => {
      if (right.activeTransactionsCount !== left.activeTransactionsCount) {
        return right.activeTransactionsCount - left.activeTransactionsCount
      }
      return left.name.localeCompare(right.name)
    })
  }, [assignedDevelopmentIds, developmentOptions, developmentRows, profile?.email, profile?.fullName, profile?.name, workspace.id])

  const filteredDevelopmentCards = useMemo(() => {
    const query = String(filters.search || '').trim().toLowerCase()
    return developmentCards.filter((card) =>
      query
        ? [card.name, card.location, card.developer, card.assignedAgent, card.status, card.nextAction, card.activeTransactionsCount, card.registeredTransactionsCount]
            .join(' ')
            .toLowerCase()
            .includes(query)
        : true,
    )
  }, [developmentCards, filters.search])

  const listingTabCounts = useMemo(
    () => ({
      private: privateListingCards.length,
      developments: developmentCards.length,
    }),
    [developmentCards.length, privateListingCards.length],
  )

  function handleOpenDevelopmentWorkspace(card) {
    const developmentId = card?.id
    if (!developmentId) return

    startRouteTransitionTrace({
      from: location.pathname,
      to: `/developments/${developmentId}`,
      label: 'agent-listings-to-development-workspace',
    })
    navigate(`/developments/${developmentId}`)
  }

  return (
    <section className="space-y-5">
      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className={`grid flex-1 gap-3 ${listingsTab === 'private' ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-1 xl:grid-cols-2'}`}>
            {listingsTab === 'private' ? (
              <label className="grid gap-2">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Status</span>
                <Field as="select" value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}>
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="under_offer">Under Offer</option>
                  <option value="sold">Sold</option>
                </Field>
              </label>
            ) : null}

            <label className={`grid gap-2 ${listingsTab === 'private' ? 'md:col-span-1 xl:col-span-3' : ''}`}>
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Search</span>
              <div className="flex h-[44px] items-center gap-2 rounded-[14px] border border-[#dce6f2] bg-white px-3">
                <Search size={15} className="text-[#7b8ca2]" />
                <input
                  value={filters.search}
                  onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                  className="w-full border-0 bg-transparent p-0 text-sm text-[#142132] outline-none"
                  placeholder={
                    listingsTab === 'private'
                      ? 'Search property, suburb, listing type...'
                      : 'Search developments, locations, activity...'
                  }
                />
              </div>
            </label>
          </div>

          {listingsTab === 'private' ? (
            <Button type="button" onClick={() => setShowNewListingModal(true)} className="shrink-0">
              <Plus size={16} />
              New Listing
            </Button>
          ) : (
            <Button type="button" onClick={() => window.dispatchEvent(new Event('itg:open-new-development'))} className="shrink-0">
              <Plus size={16} />
              New Development
            </Button>
          )}
        </div>

        {error ? <p className="mt-3 rounded-[14px] border border-[#f6d4d4] bg-[#fff5f5] px-4 py-2 text-sm text-[#b42318]">{error}</p> : null}
        {workflowMessage ? <p className="mt-3 rounded-[14px] border border-[#d8ecdf] bg-[#eefbf3] px-4 py-2 text-sm text-[#1f7d44]">{workflowMessage}</p> : null}
      </section>

      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-[1.02rem] font-semibold text-[#142132]">
              {listingsTab === 'private' ? 'Private Listings Workspace' : 'Development Listings Workspace'}
            </h2>
            <p className="mt-1 text-sm text-[#607387]">
              {listingsTab === 'private'
                ? 'Agent-owned listings, seller onboarding, offers, and deal preparation.'
                : 'Assigned developments, live buyer activity, and structured workspace access.'}
            </p>
          </div>

          <div className="inline-grid grid-cols-2 gap-2 rounded-[22px] border border-[#dbe6f2] bg-[#f5f9fd] p-2">
            {[
              { key: 'private', label: 'Private Listings', count: listingTabCounts.private || 0 },
              { key: 'developments', label: 'Developments', count: listingTabCounts.developments || 0 },
            ].map((tab) => {
              const active = listingsTab === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setListingsTab(tab.key)}
                  className={`min-w-[180px] rounded-[18px] border px-4 py-3 text-left transition ${
                    active
                      ? 'border-[#1f4f78] bg-[#1f4f78] text-white shadow-[0_12px_22px_rgba(31,79,120,0.2)]'
                      : 'border-[#d8e3ef] bg-white text-[#35546c] hover:border-[#b7c8db]'
                  }`}
                >
                  <span className="block text-[0.96rem] font-semibold">{tab.label}</span>
                  <span className={`mt-1 block text-[0.76rem] font-medium ${active ? 'text-white/82' : 'text-[#7b8ca2]'}`}>
                    {tab.count} item{tab.count === 1 ? '' : 's'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {loading ? (
          <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-6 text-sm text-[#6c7f95]">Loading listings…</div>
        ) : null}

        {!loading && listingsTab === 'private' ? (
          filteredPrivateCards.length ? (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredPrivateCards.map((card) => (
                <article
                  key={card.id}
                  onClick={() => navigate(`/agent/listings/${encodeURIComponent(card.id)}`)}
                  className="group cursor-pointer overflow-hidden rounded-[20px] border border-[#dce6f2] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(15,23,42,0.1)]"
                >
                  <div className="h-[170px] w-full overflow-hidden border-b border-[#e5edf6]">
                    <ListingCardImage src={card.imageUrl} alt={card.title} />
                  </div>

                  <div className="space-y-4 p-4">
                    <div>
                      <h3 className="line-clamp-2 text-[1.02rem] font-semibold leading-6 text-[#142132]">{card.title}</h3>
                      <p className="mt-1 text-sm text-[#607387]">{card.suburb}</p>
                      <p className="mt-2 text-[1.05rem] font-semibold text-[#1f4f78]">{formatCurrency(card.price)}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-[0.74rem] font-semibold ${statusPillClass(card.listingStatusKey)}`}>
                        {card.listingStatusLabel}
                      </span>
                      <span className="inline-flex rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-3 py-1 text-[0.74rem] font-semibold text-[#35546c]">
                        Mandate: {card.mandateStatusLabel}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[0.8rem] text-[#6b7d93]">
                      <span className="truncate">{card.agentName || 'Assigned Agent'}</span>
                      <span className="rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 font-semibold text-[#3a5672]">
                        {card.typeLabel}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-[#d3deea] bg-[#fbfcfe] px-5 py-10 text-center">
              <Building2 className="mx-auto text-[#8da0b5]" size={24} />
              <p className="mt-3 text-base font-semibold text-[#142132]">No private listings yet.</p>
              <p className="mt-1 text-sm text-[#6b7d93]">Start a seller workflow. Listings become active here once onboarding, mandate, and required documents are complete.</p>
              <div className="mt-4">
                <Button type="button" onClick={() => setShowNewListingModal(true)}>
                  <Plus size={16} />
                  New Listing
                </Button>
              </div>
            </div>
          )
        ) : null}

        {!loading && listingsTab === 'developments' ? (
          filteredDevelopmentCards.length ? (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredDevelopmentCards.map((card) => (
                <article
                  key={card.id}
                  onClick={() => handleOpenDevelopmentWorkspace(card)}
                  className="group cursor-pointer overflow-hidden rounded-[20px] border border-[#dce6f2] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(15,23,42,0.1)]"
                >
                  <div className="relative h-[170px] overflow-hidden border-b border-[#e5edf6] bg-[linear-gradient(135deg,#113350_0%,#1f4f78_38%,#6e9fc6_100%)]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.2),transparent_46%)]" />
                    <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/12 px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-white/90">
                      <FolderKanban size={14} />
                      Development Workspace
                    </div>
                    <div className="absolute bottom-4 left-4 right-4">
                      <p className="text-[1.08rem] font-semibold text-white">{card.name}</p>
                      <p className="mt-1 text-sm text-white/78">{card.location}</p>
                    </div>
                  </div>

                  <div className="space-y-4 p-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] p-3">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Units</p>
                        <p className="mt-2 text-lg font-semibold text-[#142132]">{card.totalUnits}</p>
                      </div>
                      <div className="rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] p-3">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Available</p>
                        <p className="mt-2 text-lg font-semibold text-[#142132]">{card.unitsAvailable}</p>
                      </div>
                      <div className="rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] p-3">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Sold / Reserved</p>
                        <p className="mt-2 text-lg font-semibold text-[#142132]">{card.unitsSoldOrReserved}</p>
                      </div>
                    </div>

                    <div className="space-y-2 rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] p-3 text-[0.8rem] text-[#51657b]">
                      <p>
                        <span className="font-semibold text-[#35546c]">Developer:</span> {card.developer || 'Developer pending'}
                      </p>
                      <p>
                        <span className="font-semibold text-[#35546c]">Assigned agent:</span> {card.assignedAgent || 'Assigned Agent'}
                      </p>
                      <p>
                        <span className="font-semibold text-[#35546c]">Status:</span>{' '}
                        {String(card.status || 'draft').replace(/_/g, ' ')}
                      </p>
                      <p>
                        <span className="font-semibold text-[#35546c]">Next action:</span> {card.nextAction}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[0.8rem] text-[#6b7d93]">
                      <span>{formatRelativeDate(card.lastUpdatedAt)}</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-[#1f4f78]">
                        Open workspace
                        <ArrowRight size={14} />
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-[#d3deea] bg-[#fbfcfe] px-5 py-10 text-center">
              <Building2 className="mx-auto text-[#8da0b5]" size={24} />
              <p className="mt-3 text-base font-semibold text-[#142132]">No developments assigned yet.</p>
              <p className="mt-1 text-sm text-[#6b7d93]">Assigned developments will appear here once this agent is linked into active development workflows.</p>
              <div className="mt-4">
                <Button type="button" onClick={() => window.dispatchEvent(new Event('itg:open-new-development'))}>
                  <Plus size={16} />
                  New Development
                </Button>
              </div>
            </div>
          )
        ) : null}
      </section>

      {showNewListingModal ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-[#091322]/40 p-5 backdrop-blur-[1.5px]">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[24px] border border-[#dce4ef] bg-white p-6 shadow-[0_22px_56px_rgba(15,23,42,0.24)]">
            <SectionHeader
              title="New Seller Lead"
              copy="Capture only lead setup details, assign role players, and trigger seller onboarding. Full property details are completed by the seller in onboarding."
            />

            <form className="mt-5 space-y-5" onSubmit={handleSaveListing}>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Seller name</span>
                  <Field value={form.sellerName} onChange={(event) => updateForm('sellerName', event.target.value)} placeholder="First name" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Seller surname</span>
                  <Field value={form.sellerSurname} onChange={(event) => updateForm('sellerSurname', event.target.value)} placeholder="Surname" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Seller email</span>
                  <Field type="email" value={form.sellerEmail} onChange={(event) => updateForm('sellerEmail', event.target.value)} placeholder="seller@email.com" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Seller phone</span>
                  <Field value={form.sellerPhone} onChange={(event) => updateForm('sellerPhone', event.target.value)} placeholder="082..." />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="grid gap-2 xl:col-span-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Property address</span>
                  <Field value={form.propertyAddress} onChange={(event) => updateForm('propertyAddress', event.target.value)} placeholder="Street address" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Suburb</span>
                  <Field value={form.suburb} onChange={(event) => updateForm('suburb', event.target.value)} placeholder="Suburb" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Property type</span>
                  <Field as="select" value={form.propertyType} onChange={(event) => updateForm('propertyType', event.target.value)}>
                    <option>House</option>
                    <option>Apartment</option>
                    <option>Townhouse</option>
                    <option>Sectional Title</option>
                    <option>Commercial</option>
                    <option>Agricultural</option>
                  </Field>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Lead source</span>
                  <Field as="select" value={form.leadSource} onChange={(event) => updateForm('leadSource', event.target.value)}>
                    <option value="Referral">Referral</option>
                    <option value="Website">Website</option>
                    <option value="Property24">Property24</option>
                    <option value="Private Property">Private Property</option>
                    <option value="Walk-In">Walk-In</option>
                  </Field>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Assigned agent</span>
                  <Field value={form.assignedAgent} onChange={(event) => updateForm('assignedAgent', event.target.value)} placeholder="Assigned agent" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Agency / organisation</span>
                  <Field value={form.agencyOrganisation} onChange={(event) => updateForm('agencyOrganisation', event.target.value)} placeholder="Agency / organisation" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Listing category</span>
                  <Field as="select" value={form.listingCategory} onChange={(event) => updateForm('listingCategory', event.target.value)}>
                    <option value="private_sale">Private sale</option>
                    <option value="development_listing">Developer stock / development listing</option>
                  </Field>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Estimated asking price (optional)</span>
                  <Field type="number" value={form.estimatedAskingPrice} onChange={(event) => updateForm('estimatedAskingPrice', event.target.value)} placeholder="2500000" min="0" step="1000" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Transferring attorney</span>
                  <Field as="select" value={form.transferAttorney} onChange={(event) => updateForm('transferAttorney', event.target.value)}>
                    <option value="">Select transferring attorney</option>
                    {TRANSFER_ATTORNEY_OPTIONS.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </Field>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Bond attorney (optional)</span>
                  <Field as="select" value={form.bondAttorney} onChange={(event) => updateForm('bondAttorney', event.target.value)}>
                    <option value="">Not assigned</option>
                    {BOND_ATTORNEY_OPTIONS.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </Field>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Bond originator (optional)</span>
                  <Field as="select" value={form.bondOriginator} onChange={(event) => updateForm('bondOriginator', event.target.value)}>
                    <option value="">Not assigned</option>
                    {BOND_ORIGINATOR_OPTIONS.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </Field>
                </label>
              </div>

              <div className="grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Notes (optional)</span>
                  <Field as="textarea" value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} placeholder="Internal notes for onboarding and mandate setup" />
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#e6edf5] pt-4">
                <Button type="button" variant="secondary" onClick={() => setShowNewListingModal(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save Seller Lead &amp; Send Onboarding</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default AgentListings
