import { Mail, MapPin, Phone, UserRound } from 'lucide-react'
import { createElement, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContextBase'
import { readAgencyLeadCoreCache } from './agencyLeadCoreCache'
import { resolveAgencyLeadWorkspaceTab } from './agencyLeadWorkspaceRouteState'

const BUYER_TABS = Object.freeze(['Overview', 'Buyer Profile', 'Transaction Setup / Offer', 'Properties', 'Appointments', 'Documents', 'Activity'])
const SELLER_TABS = Object.freeze(['Overview', 'Seller Profile', 'Property', 'Appointments', 'Documents', 'Activity'])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function resolveOrganisationId({ currentWorkspace, currentMembership, workspace } = {}) {
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

function LoadingLine({ className = '' }) {
  return <span className={`block animate-pulse rounded-full bg-[#e7edf3] ${className}`} aria-hidden="true" />
}

export default function LeadWorkspaceHydrationShell({ search = '' }) {
  const { leadId = '' } = useParams()
  const workspaceContext = useWorkspace()
  const organisationId = resolveOrganisationId(workspaceContext)
  const [core, setCore] = useState(() => readAgencyLeadCoreCache(organisationId, leadId))

  useEffect(() => {
    let cancelled = false
    if (!organisationId || !leadId || core) return undefined
    void import('./agencyLeadListReadRepository')
      .then((repository) => repository.preloadAgencyLeadCoreRecord(organisationId, leadId))
      .then((result) => {
        if (!cancelled && result) setCore(result)
      })
      .catch(() => null)
    return () => { cancelled = true }
  }, [core, leadId, organisationId])

  const lead = core?.lead || {}
  const contact = core?.contact || {}
  const seller = isSellerLead(lead)
  const tabs = seller ? SELLER_TABS : BUYER_TABS
  const activeTab = resolveAgencyLeadWorkspaceTab(search)
  const name = normalizeText(
    [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') ||
    lead?.name || lead?.buyerName || lead?.sellerName,
  )
  const property = normalizeText(
    lead?.sellerPropertyAddress || lead?.formattedAddress || lead?.propertyInterest ||
    lead?.enquiredPropertyTitle || lead?.areaInterest,
  )
  const stage = normalizeText(lead?.stage || lead?.status)
  const details = useMemo(() => [
    { key: 'phone', Icon: Phone, value: contact?.phone || lead?.phone },
    { key: 'email', Icon: Mail, value: contact?.email || lead?.email },
    { key: 'property', Icon: MapPin, value: property },
  ].filter((item) => normalizeText(item.value)), [contact?.email, contact?.phone, lead?.email, lead?.phone, property])

  return (
    <section
      className="min-w-0 space-y-5"
      aria-busy="true"
      aria-label={`Loading ${activeTab === 'overview' ? 'lead workspace' : activeTab.replaceAll('_', ' ')}`}
      data-testid="lead-workspace-hydration-shell"
    >
      <header className="overflow-hidden rounded-[24px] border border-[#dbe7f2] bg-white shadow-[0_16px_42px_rgba(15,23,42,0.05)]">
        <div className="grid min-h-52 gap-5 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6d839b]">{seller ? 'Seller lead' : 'Buyer lead'}</span>
              {stage ? <span className="rounded-full border border-[#d7e6f2] bg-[#f5f9fc] px-2.5 py-1 text-xs font-semibold text-[#526b82]">{stage}</span> : <LoadingLine className="h-6 w-24" />}
            </div>
            {name ? <h1 className="mt-4 truncate text-3xl font-semibold tracking-[-0.04em] text-[#102033]">{name}</h1> : <LoadingLine className="mt-4 h-9 w-72 max-w-full" />}
            {details.length ? (
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-sm font-medium text-[#60758b]">
                {details.map(({ key, Icon, value }) => <span key={key} className="inline-flex min-w-0 items-center gap-2">{createElement(Icon, { className: 'h-4 w-4 shrink-0' })}<span className="truncate">{value}</span></span>)}
              </div>
            ) : (
              <div className="mt-6 flex gap-3"><LoadingLine className="h-4 w-36" /><LoadingLine className="h-4 w-48" /></div>
            )}
          </div>
          <span className="grid h-14 w-14 place-items-center rounded-[18px] bg-[#edf6fb] text-[#236787]" aria-hidden="true"><UserRound className="h-6 w-6" /></span>
        </div>
        <nav className="overflow-hidden border-t border-[#edf3f8] bg-[#fbfdff] p-2" aria-label="Lead workspace sections">
          <div className="flex min-w-max gap-2">
            {tabs.map((label) => {
              const key = label.toLowerCase().replaceAll(' ', '_').replaceAll('/', '_')
              const selected = activeTab === 'overview' ? label === 'Overview' : key.includes(activeTab)
              return <span key={label} className={`grid min-h-11 min-w-32 place-items-center rounded-[13px] px-4 text-sm font-semibold ${selected ? 'bg-white text-[#123955] shadow-sm ring-1 ring-[#d9e6f2]' : 'text-[#7890a7]'}`}>{label}</span>
            })}
          </div>
        </nav>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.65fr)_minmax(320px,0.35fr)]" aria-hidden="true">
        <article className="min-h-72 rounded-[20px] border border-[#dbe7f2] bg-white p-5 shadow-[0_12px_34px_rgba(31,54,78,0.04)]">
          <LoadingLine className="h-3 w-36" /><LoadingLine className="mt-4 h-6 w-64" />
          <div className="mt-6 space-y-4">{[0, 1, 2, 3].map((item) => <LoadingLine key={item} className="h-10 w-full" />)}</div>
        </article>
        <div className="space-y-5">
          <article className="min-h-32 rounded-[20px] border border-[#dbe7f2] bg-white p-5"><LoadingLine className="h-3 w-24" /><LoadingLine className="mt-4 h-6 w-52" /></article>
          <article className="min-h-32 rounded-[20px] border border-[#dbe7f2] bg-white p-5"><LoadingLine className="h-3 w-32" /><LoadingLine className="mt-4 h-12 w-full" /></article>
        </div>
      </div>
    </section>
  )
}
