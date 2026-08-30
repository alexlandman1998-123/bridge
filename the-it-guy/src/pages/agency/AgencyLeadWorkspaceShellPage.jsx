import { ArrowLeft, Building2, Mail, MapPin, Phone, UserRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import LeadWorkspaceRouteLoadingShell from '../../components/leads/LeadWorkspaceRouteLoadingShell'
import { useWorkspace } from '../../context/WorkspaceContextBase'
import { readAgencyLeadCoreCache } from './agencyLeadCoreCache'
import { resolveAgencyLeadWorkspaceTab } from './agencyLeadWorkspaceRouteState'

const BUYER_TABS = Object.freeze([
  ['overview', 'Overview'],
  ['buyer_profile', 'Buyer Profile'],
  ['onboarding_otp', 'Transaction Setup / Offer'],
  ['properties', 'Properties'],
  ['appointments', 'Appointments'],
  ['documents', 'Documents'],
  ['activity', 'Activity'],
])
const SELLER_TABS = Object.freeze([
  ['overview', 'Overview'],
  ['seller', 'Seller Profile'],
  ['property', 'Property'],
  ['appointments', 'Appointments'],
  ['documents', 'Documents'],
  ['activity', 'Activity'],
])
const LEAD_ROUTE_PATTERN = /^\/pipeline\/leads\/[^/]+\/?$/

function normalizeText(value = '') {
  return String(value || '').trim()
}

function resolveOrganisationId({ currentWorkspace, currentMembership, workspace }) {
  return normalizeText(
    currentWorkspace?.organisationId ||
    currentWorkspace?.organisation_id ||
    currentWorkspace?.raw?.organisation_id ||
    currentMembership?.organisationId ||
    currentMembership?.organisation_id ||
    currentWorkspace?.id ||
    workspace?.id,
  )
}

function isSellerLead(lead = {}) {
  const category = normalizeText(lead?.leadCategory || lead?.lead_category).toLowerCase()
  return category === 'seller' || category === 'vendor'
}

export default function AgencyLeadWorkspaceShellPage({ loadingTab = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { leadId = '' } = useParams()
  const workspaceContext = useWorkspace()
  const organisationId = resolveOrganisationId(workspaceContext)
  const [core, setCore] = useState(() => readAgencyLeadCoreCache(organisationId, leadId))
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!organisationId || !leadId) return undefined
    void import('./agencyLeadListReadRepository')
      .then((repository) => repository.preloadAgencyLeadCoreRecord(organisationId, leadId))
      .then((result) => {
        if (!cancelled && result) setCore(result)
      }).catch((loadError) => {
        if (!cancelled) setError(loadError?.message || 'Unable to load this lead.')
      })
    return () => { cancelled = true }
  }, [leadId, organisationId])

  const lead = core?.lead || {}
  const contact = core?.contact || {}
  const seller = isSellerLead(lead)
  const tabs = seller ? SELLER_TABS : BUYER_TABS
  const requestedTab = resolveAgencyLeadWorkspaceTab(location.search)
  const activeTab = tabs.some(([key]) => key === requestedTab) ? requestedTab : 'overview'
  const name = normalizeText(
    [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') ||
    lead?.name ||
    lead?.buyerName ||
    lead?.sellerName,
  ) || (seller ? 'Seller lead' : 'Buyer lead')
  const property = normalizeText(
    lead?.sellerPropertyAddress ||
    lead?.formattedAddress ||
    lead?.propertyInterest ||
    lead?.enquiredPropertyTitle ||
    lead?.areaInterest,
  )
  const stage = normalizeText(lead?.stage || lead?.status) || 'Captured'

  const selectTab = useCallback((tab) => {
    if (!LEAD_ROUTE_PATTERN.test(location.pathname)) return
    const params = new URLSearchParams(location.search)
    params.set('tab', tab)
    params.delete('sellerWorkspace')
    navigate(`${location.pathname}?${params.toString()}${location.hash}`, { replace: true })
  }, [location.hash, location.pathname, location.search, navigate])

  const detailRows = useMemo(() => [
    { key: 'phone', icon: <Phone size={15} />, label: contact?.phone || lead?.phone || 'No phone captured' },
    { key: 'email', icon: <Mail size={15} />, label: contact?.email || lead?.email || 'No email captured' },
    { key: 'property', icon: <MapPin size={15} />, label: property || 'No property linked' },
  ], [contact?.email, contact?.phone, lead?.email, lead?.phone, property])

  if (!core && !error) return <LeadWorkspaceRouteLoadingShell />

  return (
    <section className="min-w-0 space-y-5">
      <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-[12px] px-2 text-sm font-semibold text-[#526b82] hover:bg-white" onClick={() => navigate('/pipeline/leads')}>
        <ArrowLeft size={16} /> Back to Leads
      </button>

      <header className="overflow-hidden rounded-[24px] border border-[#dbe7f2] bg-white shadow-[0_16px_42px_rgba(15,23,42,0.06)]">
        <div className="grid gap-5 bg-[linear-gradient(135deg,#0c2d49_0%,#123e5c_70%,#17617a_100%)] p-6 text-white lg:grid-cols-[1fr_auto] lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#b9d6e6]">
              <span>{seller ? 'Seller lead' : 'Buyer lead'}</span>
              <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-white">{stage}</span>
            </div>
            <h1 className="mt-3 truncate text-3xl font-semibold tracking-[-0.04em]">{name}</h1>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#dceaf2]">
              {detailRows.map(({ key, icon, label }) => <span key={key} className="inline-flex items-center gap-2">{icon} {label}</span>)}
            </div>
          </div>
          <div className="grid h-14 w-14 place-items-center rounded-[18px] bg-white/12"><UserRound size={25} /></div>
        </div>
        <nav className="overflow-x-auto border-t border-[#dce7f2] bg-[#fbfdff] p-2" role="tablist" aria-label="Lead workspace sections">
          <div className="grid gap-2" style={{ minWidth: seller ? 760 : 940, gridTemplateColumns: `repeat(${tabs.length}, minmax(120px, 1fr))` }}>
            {tabs.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={activeTab === key} onClick={() => selectTab(key)} className={`min-h-[48px] rounded-[14px] px-3 text-sm font-semibold transition ${activeTab === key ? 'bg-white text-[#123955] shadow ring-1 ring-[#d9e6f2]' : 'text-[#60758b] hover:bg-white/80 hover:text-[#163247]'}`}>
                {label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      {error ? <div className="rounded-[18px] border border-[#f2cccc] bg-[#fff5f4] p-5 text-sm text-[#9f3028]">{error}</div> : (
        <div className="grid gap-5 lg:grid-cols-[1.35fr_0.9fr]">
          <article className="rounded-[22px] border border-[#dbe7f2] bg-white p-6 shadow-[0_12px_34px_rgba(15,23,42,0.04)]">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7890a8]">Current journey</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#142132]">{stage}</h2>
            <p className="mt-3 text-sm leading-6 text-[#60758b]">Core lead information is ready. Open a workspace tab when you need documents, appointments, activity, buyer onboarding, OTP or seller workflow tools.</p>
          </article>
          <article className="rounded-[22px] border border-[#dbe7f2] bg-white p-6 shadow-[0_12px_34px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#edf6fb] text-[#236787]"><Building2 size={19} /></span><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7890a8]">Property interest</p><p className="mt-1 font-semibold text-[#20364c]">{property || 'Not captured yet'}</p></div></div>
          </article>
        </div>
      )}

      {loadingTab ? <LeadWorkspaceRouteLoadingShell label={`Loading ${activeTab.replaceAll('_', ' ')}`} /> : null}
    </section>
  )
}
