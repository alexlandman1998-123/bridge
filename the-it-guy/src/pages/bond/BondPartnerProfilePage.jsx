import { ArrowLeft, Building2, ChartNoAxesColumn, Eye, FileText, ImageIcon, LockKeyhole, Mail, Phone, Search, ShieldCheck, TrendingUp, X, Users } from 'lucide-react'
import { createElement, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useOrganisation } from '../../context/OrganisationContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { getPartnerTypeLabel } from '../../lib/partnersRepository'
import {
  listUserPreferredPartnerRoutingRules,
  removeUserPreferredPartnerRoutingRule,
  saveUserPreferredPartnerRoutingRule,
} from '../../lib/settingsApi'
import { bondPerfLog } from '../../lib/performanceTrace'
import {
  createBondPartnerFinanceCampaign,
  getBondPartnerApplications,
  getBondPartnerCampaignCentre,
  getBondPartnerListings,
  getBondPartnerPeople,
  getBondPartnerPerformance,
  getBondPartnerProfileOverview,
  PARTNER_PROFILE_NOT_ACCEPTED_MESSAGE,
} from '../../services/bondPartnerProfileService'
import {
  getCampaignPerformance,
  getListingAttribution,
  getPartnerAttributionSummary,
  trackAttributionEvent,
} from '../../services/partnerAttributionService'

const PROFILE_TABS = [
  { key: 'overview', label: 'Overview', enabled: true },
  { key: 'people', label: 'People', enabled: true },
  { key: 'listings', label: 'Listings', enabled: true },
  { key: 'applications', label: 'Applications', enabled: true },
  { key: 'performance', label: 'Performance', enabled: true },
  { key: 'campaigns', label: 'Campaigns', enabled: true },
  { key: 'attribution', label: 'Attribution', enabled: true },
  { key: 'permissions', label: 'Permissions', enabled: false },
]

function normalizeText(value = '') {
  return String(value || '').trim()
}

function formatDate(value) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not recorded'
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' }).format(date)
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(Number(value || 0))
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'Price on request'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatMoneyValue(value) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0)
}

function statusLabel(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'accepted') return 'Accepted'
  if (normalized === 'preferred') return 'Preferred'
  if (!normalized) return 'Not recorded'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).replace(/_/g, ' ')
}

function initials(value = '') {
  return normalizeText(value || 'Partner')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'P'
}

function getCurrentOrganisationId({ organisation, workspace, currentMembership }) {
  return (
    normalizeText(organisation?.partnerOrganisationId) ||
    normalizeText(organisation?.organisationId) ||
    normalizeText(workspace?.organisationId) ||
    normalizeText(organisation?.id) ||
    normalizeText(workspace?.id) ||
    normalizeText(currentMembership?.organisation_id) ||
    normalizeText(currentMembership?.organisationId) ||
    normalizeText(currentMembership?.workspaceId)
  )
}

function publicationStatusLabel(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (['live', 'published'].includes(normalized)) return 'Live'
  if (['draft', 'pending', 'ready'].includes(normalized)) return 'Pending'
  return 'Not Published'
}

function publicationStatusClass(value = '') {
  const label = publicationStatusLabel(value)
  if (label === 'Live') return 'border-[#cdebd8] bg-[#f1fbf6] text-[#17613d]'
  if (label === 'Pending') return 'border-[#f0dfb8] bg-[#fff8ea] text-[#8a5b16]'
  return 'border-[#dbe5f0] bg-[#f7fafc] text-[#60758d]'
}

function HeaderButton({ children, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-[#dbe5f0] bg-white px-4 text-sm font-semibold text-[#27445f] shadow-[0_8px_18px_rgba(15,23,42,0.05)] transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-55"
    >
      {children}
    </button>
  )
}

function PageCard({ children, className = '' }) {
  return (
    <section className={`rounded-[16px] border border-[#dce6f1] bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)] ${className}`}>
      {children}
    </section>
  )
}

function SummaryCard({ label, value, description, icon: Icon = ChartNoAxesColumn }) {
  return (
    <PageCard>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b8fa7]">{label}</p>
          <strong className="mt-3 block text-3xl font-semibold tracking-[-0.01em] text-[#10243a]">{value}</strong>
          <p className="mt-2 text-sm leading-6 text-[#60758d]">{description}</p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#f3f7fb] text-[#2f5573]">
          {createElement(Icon, { size: 20 })}
        </span>
      </div>
    </PageCard>
  )
}

function PeopleSummaryCard({ label, count, allowed }) {
  return (
    <PageCard>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b8fa7]">{label}</p>
          <strong className="mt-3 block text-3xl font-semibold tracking-[-0.01em] text-[#10243a]">
            {allowed ? `${formatNumber(count)} visible` : 'Locked'}
          </strong>
          <p className="mt-2 text-sm leading-6 text-[#60758d]">
            {allowed ? 'Visible through relationship permissions.' : 'Requires partner people permissions.'}
          </p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#f3f7fb] text-[#2f5573]">
          {allowed ? <Users size={20} /> : <LockKeyhole size={20} />}
        </span>
      </div>
    </PageCard>
  )
}

function ContactLine({ icon: Icon, children }) {
  if (!children) return null
  return (
    <span className="inline-flex items-center gap-2 text-sm text-[#60758d]">
      {createElement(Icon, { size: 15 })} {children}
    </span>
  )
}

function PersonRole({ value }) {
  return <span>{normalizeText(value).replace(/_/g, ' ') || 'Partner user'}</span>
}

function PeopleLockedState() {
  return (
    <PageCard>
      <div className="flex max-w-3xl flex-col gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#f3f7fb] text-[#60758d]">
          <LockKeyhole size={20} />
        </span>
        <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">People visibility has not been granted for this partner relationship.</h2>
        <p className="text-sm leading-6 text-[#60758d]">Partner people data will only appear once the agency grants visibility permission.</p>
      </div>
    </PageCard>
  )
}

function PeopleSection({ people, loading, error, preferredRoutingRules = [], onTogglePreferred, savingKey = '' }) {
  const isPreferredPerson = (person = {}) =>
    preferredRoutingRules.some(
      (rule) =>
        normalizeText(rule?.targetUserId || rule?.target_user_id) === normalizeText(person?.userId) &&
        Boolean(rule?.isActive !== false),
    )

  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-36 animate-pulse rounded-[16px] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.05)]" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <PageCard>
        <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">Partner relationship not found or access denied.</h2>
        <p className="mt-3 text-sm leading-6 text-[#60758d]">People data can only load through an accepted relationship with granted visibility permissions.</p>
      </PageCard>
    )
  }

  const permissions = people?.permissions || {}
  const groups = people?.groups || {}
  const principal = groups.principal || []
  const branchManagers = groups.branchManagers || []
  const agents = groups.agents || []
  const anyPermission = permissions.canViewPrincipal || permissions.canViewBranchManagers || permissions.canViewAgents
  const anyPeople = principal.length || branchManagers.length || agents.length

  if (!anyPermission) {
    return (
      <div className="flex flex-col gap-6">
        <section className="grid gap-6 md:grid-cols-3">
          <PeopleSummaryCard label="Principal" allowed={false} />
          <PeopleSummaryCard label="Branch Managers" allowed={false} />
          <PeopleSummaryCard label="Agents" allowed={false} />
        </section>
        <PeopleLockedState />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-6 md:grid-cols-3">
        <PeopleSummaryCard label="Principal" count={principal.length} allowed={permissions.canViewPrincipal} />
        <PeopleSummaryCard label="Branch Managers" count={branchManagers.length} allowed={permissions.canViewBranchManagers} />
        <PeopleSummaryCard label="Agents" count={agents.length} allowed={permissions.canViewAgents} />
      </section>

      {!anyPeople ? (
        <PageCard>
          <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">No partner people found yet.</h2>
          <p className="mt-3 text-sm leading-6 text-[#60758d]">People visibility is enabled, but no matching principal, branch manager, or agent records were found.</p>
        </PageCard>
      ) : null}

      {permissions.canViewPrincipal ? (
        <PageCard>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b8fa7]">Principal</p>
            <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">Principal Contact</h2>
          </div>
          {principal.length ? (
            <div className="mt-6 grid gap-4">
              {principal.map((person) => (
                <div key={person.userId || person.email} className="rounded-[16px] bg-[#f7fafc] p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-[#10243a]">{person.fullName}</h3>
                      <p className="mt-1 text-sm capitalize text-[#60758d]"><PersonRole value={person.role} /></p>
                      <p className="mt-1 text-sm text-[#60758d]">{person.branchName || 'Primary branch pending'}</p>
                      <div className="mt-4 flex flex-wrap gap-4">
                        <ContactLine icon={Mail}>{person.email}</ContactLine>
                        <ContactLine icon={Phone}>{person.phone}</ContactLine>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      {person.email ? (
                        <a href={`mailto:${person.email}`} className="inline-flex h-10 items-center justify-center rounded-[12px] bg-[#10243a] px-4 text-sm font-semibold text-white transition hover:bg-[#173a5e]">
                          Contact
                        </a>
                      ) : (
                        <button type="button" disabled className="inline-flex h-10 cursor-not-allowed items-center justify-center rounded-[12px] bg-[#d8e1ea] px-4 text-sm font-semibold text-[#60758d]">
                          Contact
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onTogglePreferred?.(person)}
                        disabled={!person.userId || savingKey === person.userId}
                        className={`inline-flex h-10 items-center justify-center rounded-[12px] px-4 text-sm font-semibold transition ${
                          isPreferredPerson(person)
                            ? 'bg-[#edf7f1] text-[#1f7a45] hover:bg-[#e2f4e8]'
                            : 'border border-[#dbe5f0] bg-white text-[#27445f] hover:bg-[#f8fafc]'
                        } disabled:cursor-not-allowed disabled:opacity-55`}
                      >
                        {savingKey === person.userId ? 'Saving…' : isPreferredPerson(person) ? 'Remove Preferred' : 'Set Preferred'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-sm leading-6 text-[#60758d]">No principal found yet.</p>
          )}
        </PageCard>
      ) : null}

      {permissions.canViewBranchManagers ? (
        <PageCard>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b8fa7]">Branch Managers</p>
            <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">Visible Branch Managers</h2>
          </div>
          {branchManagers.length ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {branchManagers.map((person) => (
                    <div key={person.userId || person.email} className="rounded-[16px] bg-[#f7fafc] p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-[#10243a]">{person.fullName}</h3>
                          <p className="mt-1 text-sm capitalize text-[#60758d]"><PersonRole value={person.role} /></p>
                          <p className="mt-1 text-sm text-[#60758d]">{person.branchName || 'Branch pending'}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onTogglePreferred?.(person)}
                          disabled={!person.userId || savingKey === person.userId}
                          className={`inline-flex h-9 items-center justify-center rounded-[10px] px-3 text-sm font-semibold transition ${
                            isPreferredPerson(person)
                              ? 'bg-[#edf7f1] text-[#1f7a45] hover:bg-[#e2f4e8]'
                              : 'border border-[#dbe5f0] bg-white text-[#27445f] hover:bg-[#f8fafc]'
                          } disabled:cursor-not-allowed disabled:opacity-55`}
                        >
                          {savingKey === person.userId ? 'Saving…' : isPreferredPerson(person) ? 'Remove Preferred' : 'Set Preferred'}
                        </button>
                      </div>
                      <div className="mt-4 flex flex-col gap-2">
                        <ContactLine icon={Mail}>{person.email}</ContactLine>
                        <ContactLine icon={Phone}>{person.phone}</ContactLine>
                      </div>
                    </div>
                  ))}
            </div>
          ) : (
            <p className="mt-6 text-sm leading-6 text-[#60758d]">No branch managers found yet.</p>
          )}
        </PageCard>
      ) : null}

      {permissions.canViewAgents ? (
        <PageCard>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b8fa7]">Agents Directory</p>
            <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">Visible Agents</h2>
          </div>
          {agents.length ? (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-[860px] border-collapse">
                <thead>
                  <tr className="border-b border-[#e3ebf4] text-left">
                    <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Agent</th>
                    <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Branch</th>
                    <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Role</th>
                    <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Contact</th>
                    <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Status</th>
                    <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((person) => (
                    <tr key={person.userId || person.email} className="border-b border-[#edf2f7]">
                      <td className="px-3 py-4">
                        <p className="text-sm font-semibold text-[#10243a]">{person.fullName}</p>
                        <p className="mt-1 text-sm text-[#60758d]">{person.email || 'Email pending'}</p>
                      </td>
                      <td className="px-3 py-4 text-sm text-[#27445f]">{person.branchName || 'Branch pending'}</td>
                      <td className="px-3 py-4 text-sm capitalize text-[#27445f]"><PersonRole value={person.role} /></td>
                      <td className="px-3 py-4 text-sm text-[#60758d]">{person.phone || person.email || 'Contact pending'}</td>
                      <td className="px-3 py-4">
                        <span className="inline-flex rounded-full bg-[#f1fbf6] px-2.5 py-1 text-xs font-semibold text-[#17613d]">Active</span>
                      </td>
                      <td className="px-3 py-4">
                        <button
                          type="button"
                          onClick={() => onTogglePreferred?.(person)}
                          disabled={!person.userId || savingKey === person.userId}
                          className={`inline-flex h-9 items-center justify-center rounded-[10px] px-3 text-sm font-semibold transition ${
                            isPreferredPerson(person)
                              ? 'bg-[#edf7f1] text-[#1f7a45] hover:bg-[#e2f4e8]'
                              : 'border border-[#dbe5f0] bg-white text-[#27445f] hover:bg-[#f8fafc]'
                          } disabled:cursor-not-allowed disabled:opacity-55`}
                        >
                          {savingKey === person.userId ? 'Saving…' : isPreferredPerson(person) ? 'Remove Preferred' : 'Set Preferred'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-6 text-sm leading-6 text-[#60758d]">No agents found yet.</p>
          )}
        </PageCard>
      ) : null}
    </div>
  )
}

function ListingFilterSelect({ label, value, onChange, children }) {
  return (
    <label className="flex min-w-0 flex-col gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8fa7]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 min-w-0 rounded-[12px] border border-[#dbe5f0] bg-white px-3 text-sm font-semibold normal-case tracking-normal text-[#27445f] outline-none transition focus:border-[#2f5573] focus:ring-2 focus:ring-[#2f5573]/10"
      >
        {children}
      </select>
    </label>
  )
}

function PublicationPill({ label, status }) {
  return (
    <span className={`inline-flex items-center justify-between gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${publicationStatusClass(status)}`}>
      {label}
      <span>{publicationStatusLabel(status)}</span>
    </span>
  )
}

function ListingsLockedState() {
  return (
    <PageCard>
      <div className="flex max-w-3xl flex-col gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#f3f7fb] text-[#60758d]">
          <LockKeyhole size={20} />
        </span>
        <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">Listings visibility has not been granted for this relationship.</h2>
        <p className="text-sm leading-6 text-[#60758d]">Partner listings will only appear once the agency grants listing visibility and shares specific listings.</p>
      </div>
    </PageCard>
  )
}

function ListingsSection({ listings, loading, error, campaigns, listingAttribution, onCreateFinanceCampaign, onTrackListingView, campaignCreatingListingId }) {
  const [filters, setFilters] = useState({
    search: '',
    propertyType: 'all',
    status: 'all',
    branch: 'all',
    priceRange: 'all',
  })
  const [selectedListing, setSelectedListing] = useState(null)
  const [campaignListing, setCampaignListing] = useState(null)
  const [campaignForm, setCampaignForm] = useState({
    campaignType: 'listing_finance',
    depositPercent: 10,
    interestRate: 11.75,
    loanTerm: 20,
  })

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-36 animate-pulse rounded-[16px] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.05)]" />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-80 animate-pulse rounded-[16px] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.05)]" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <PageCard>
        <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">Partner relationship not found or access denied.</h2>
        <p className="mt-3 text-sm leading-6 text-[#60758d]">Listings can only load through an accepted relationship with listing visibility and shared listing records.</p>
      </PageCard>
    )
  }

  const canViewListings = listings?.permissions?.canViewListings === true
  const campaignPermissions = campaigns?.permissions || {}
  const canCreateCampaigns = campaignPermissions.canCreateFinanceCampaigns && campaignPermissions.canGenerateFinanceAssets
  const attributionByListingId = listingAttribution?.byListingId || {}
  const canViewListingAttribution = listingAttribution?.permissions?.canViewAttribution === true
  const canViewListingRevenue = listingAttribution?.permissions?.canViewPartnerRevenue === true
  const rows = Array.isArray(listings?.listings) ? listings.listings : []

  if (!canViewListings) {
    return <ListingsLockedState />
  }

  const propertyTypes = Array.from(new Set(rows.map((listing) => listing.propertyType).filter(Boolean))).sort()
  const statuses = Array.from(new Set(rows.map((listing) => statusLabel(listing.status)).filter(Boolean))).sort()
  const branches = Array.from(new Set(rows.map((listing) => listing.branchName).filter(Boolean))).sort()
  const normalizedSearch = normalizeText(filters.search).toLowerCase()
  const filteredRows = rows.filter((listing) => {
    const searchText = [listing.title, listing.suburb, listing.city, listing.agentName, listing.branchName, listing.listingReference].join(' ').toLowerCase()
    const price = Number(listing.price || 0)
    const priceMatch =
      filters.priceRange === 'all' ||
      (filters.priceRange === 'under-2m' && price > 0 && price < 2000000) ||
      (filters.priceRange === '2m-5m' && price >= 2000000 && price <= 5000000) ||
      (filters.priceRange === 'over-5m' && price > 5000000)

    return (
      (!normalizedSearch || searchText.includes(normalizedSearch)) &&
      (filters.propertyType === 'all' || listing.propertyType === filters.propertyType) &&
      (filters.status === 'all' || statusLabel(listing.status) === filters.status) &&
      (filters.branch === 'all' || listing.branchName === filters.branch) &&
      priceMatch
    )
  })

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Shared Listings" value={formatNumber(listings?.summary?.sharedListings)} description="Agency-approved listings only." icon={Building2} />
        <SummaryCard label="Active Listings" value={formatNumber(listings?.summary?.activeListings)} description="Visible active or published stock." icon={ShieldCheck} />
        <SummaryCard label="New This Month" value={formatNumber(listings?.summary?.newThisMonth)} description="Shared listings created this month." />
        <SummaryCard label="Average Price" value={formatCurrency(listings?.summary?.averagePrice)} description="Based on visible shared listings." />
      </section>

      <PageCard>
        <div className="grid gap-4 xl:grid-cols-[minmax(280px,1fr)_repeat(4,minmax(160px,0.45fr))]">
          <label className="flex min-w-0 flex-col gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8fa7]">
            Search
            <span className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8a9db1]" />
              <input
                value={filters.search}
                onChange={(event) => setFilters((previous) => ({ ...previous, search: event.target.value }))}
                placeholder="Search shared listings..."
                className="h-11 w-full rounded-[12px] border border-[#dbe5f0] bg-white pl-10 pr-3 text-sm font-semibold normal-case tracking-normal text-[#27445f] outline-none transition placeholder:text-[#9aacbd] focus:border-[#2f5573] focus:ring-2 focus:ring-[#2f5573]/10"
              />
            </span>
          </label>
          <ListingFilterSelect label="Property Type" value={filters.propertyType} onChange={(value) => setFilters((previous) => ({ ...previous, propertyType: value }))}>
            <option value="all">All types</option>
            {propertyTypes.map((value) => <option key={value} value={value}>{value}</option>)}
          </ListingFilterSelect>
          <ListingFilterSelect label="Status" value={filters.status} onChange={(value) => setFilters((previous) => ({ ...previous, status: value }))}>
            <option value="all">All statuses</option>
            {statuses.map((value) => <option key={value} value={value}>{value}</option>)}
          </ListingFilterSelect>
          <ListingFilterSelect label="Branch" value={filters.branch} onChange={(value) => setFilters((previous) => ({ ...previous, branch: value }))}>
            <option value="all">All branches</option>
            {branches.map((value) => <option key={value} value={value}>{value}</option>)}
          </ListingFilterSelect>
          <ListingFilterSelect label="Price Range" value={filters.priceRange} onChange={(value) => setFilters((previous) => ({ ...previous, priceRange: value }))}>
            <option value="all">All prices</option>
            <option value="under-2m">Under R2m</option>
            <option value="2m-5m">R2m - R5m</option>
            <option value="over-5m">Over R5m</option>
          </ListingFilterSelect>
        </div>
      </PageCard>

      {!rows.length ? (
        <PageCard>
          <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">No listings have been shared yet.</h2>
          <p className="mt-3 text-sm leading-6 text-[#60758d]">Ask your partner agency to share listings.</p>
        </PageCard>
      ) : null}

      {rows.length && !filteredRows.length ? (
        <PageCard>
          <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">No shared listings match these filters.</h2>
          <p className="mt-3 text-sm leading-6 text-[#60758d]">Clear a filter to see the agency-approved listing set.</p>
        </PageCard>
      ) : null}

      {filteredRows.length ? (
        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredRows.map((listing) => {
            const listingStats = attributionByListingId[listing.listingId] || {}
            return (
            <article key={listing.listingId} className="flex min-h-[430px] flex-col overflow-hidden rounded-[16px] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <div className="relative h-48 bg-[#eef4f8]">
                {listing.mainImage ? (
                  <img src={listing.mainImage} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[#8a9db1]">
                    <ImageIcon size={28} />
                  </div>
                )}
                <span className="absolute left-4 top-4 rounded-full bg-white/92 px-3 py-1 text-xs font-semibold text-[#27445f] shadow-[0_8px_18px_rgba(15,23,42,0.08)]">{statusLabel(listing.status)}</span>
              </div>
              <div className="flex flex-1 flex-col gap-4 p-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">{listing.propertyType}</p>
                  <h3 className="mt-2 line-clamp-2 text-xl font-semibold tracking-[-0.01em] text-[#10243a]">{listing.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#60758d]">{[listing.suburb, listing.city].filter(Boolean).join(', ') || 'Location pending'}</p>
                  <p className="mt-3 text-2xl font-semibold text-[#173a5e]">{formatCurrency(listing.price)}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-[12px] bg-[#f7fafc] p-3 text-sm font-semibold text-[#27445f]">
                  <span>{formatNumber(listing.bedrooms)} Bed</span>
                  <span>{formatNumber(listing.bathrooms)} Bath</span>
                  <span>{formatNumber(listing.parking)} Park</span>
                </div>
                <dl className="grid gap-3 text-sm text-[#60758d]">
                  <div>
                    <dt className="font-semibold text-[#10243a]">Agent</dt>
                    <dd>{listing.agentName}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[#10243a]">Branch</dt>
                    <dd>{listing.branchName || 'Branch pending'}</dd>
                  </div>
                </dl>
                {canViewListingAttribution ? (
                  <div className="grid grid-cols-3 gap-2 rounded-[12px] bg-[#f7fafc] p-3 text-xs text-[#60758d]">
                    <div>
                      <p className="font-semibold text-[#10243a]">{formatNumber(listingStats.applicationsGenerated)}</p>
                      <p>Applications</p>
                    </div>
                    <div>
                      <p className="font-semibold text-[#10243a]">{formatNumber(listingStats.approvals)}</p>
                      <p>Approvals</p>
                    </div>
                    <div>
                      <p className="font-semibold text-[#10243a]">{canViewListingRevenue ? formatMoneyValue(listingStats.revenueGenerated) : 'Locked'}</p>
                      <p>Revenue</p>
                    </div>
                  </div>
                ) : null}
                <div className="mt-auto grid gap-2">
                  <PublicationPill label="Bridge" status={listing.publicationStatuses.bridge} />
                  <PublicationPill label="Property24" status={listing.publicationStatuses.property24} />
                  <PublicationPill label="PrivateProperty" status={listing.publicationStatuses.privateProperty} />
                  <PublicationPill label="Website" status={listing.publicationStatuses.website} />
                </div>
                <div className="border-t border-[#edf2f7] pt-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        onTrackListingView?.(listing)
                        setSelectedListing(listing)
                      }}
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[12px] bg-[#10243a] px-4 text-sm font-semibold text-white transition hover:bg-[#173a5e]"
                    >
                      <Eye size={16} /> View Listing
                    </button>
                    <button
                      type="button"
                      disabled={!canCreateCampaigns || campaignCreatingListingId === listing.listingId}
                      onClick={() => {
                        setCampaignListing(listing)
                        setCampaignForm({
                          campaignType: 'listing_finance',
                          depositPercent: 10,
                          interestRate: 11.75,
                          loanTerm: 20,
                        })
                      }}
                      className="inline-flex h-10 w-full items-center justify-center rounded-[12px] border border-[#c6d8ea] px-4 text-sm font-semibold text-[#1f4f78] transition hover:bg-[#f6faff] disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      {campaignCreatingListingId === listing.listingId ? 'Creating...' : 'Create Finance Campaign'}
                    </button>
                  </div>
                </div>
              </div>
            </article>
          )})}
        </section>
      ) : null}

      {selectedListing ? (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-[#07111f]/42 p-4 backdrop-blur-sm md:p-8" role="dialog" aria-modal="true" aria-label="Shared listing details">
          <div className="max-h-[calc(100vh-64px)] w-full max-w-[720px] overflow-y-auto rounded-[16px] bg-white p-6 shadow-[0_26px_80px_rgba(7,17,31,0.28)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b8fa7]">Shared Listing</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">{selectedListing.title}</h2>
                <p className="mt-2 text-sm leading-6 text-[#60758d]">{[selectedListing.suburb, selectedListing.city].filter(Boolean).join(', ') || 'Location pending'}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedListing(null)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[#dbe5f0] text-[#60758d] transition hover:bg-[#f7fafc]"
                aria-label="Close listing details"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <SummaryCard label="Price" value={formatCurrency(selectedListing.price)} description="Shared safe listing price." />
              <SummaryCard label="Status" value={statusLabel(selectedListing.status)} description="Listing status only." icon={ShieldCheck} />
            </div>
            <PageCard className="mt-6 shadow-none">
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Assigned Agent</dt>
                  <dd className="mt-1 text-sm font-semibold text-[#223b54]">{selectedListing.agentName}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Branch</dt>
                  <dd className="mt-1 text-sm font-semibold text-[#223b54]">{selectedListing.branchName || 'Branch pending'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Reference</dt>
                  <dd className="mt-1 text-sm font-semibold text-[#223b54]">{selectedListing.listingReference || 'Reference pending'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Property Info</dt>
                  <dd className="mt-1 text-sm font-semibold text-[#223b54]">{formatNumber(selectedListing.bedrooms)} bed / {formatNumber(selectedListing.bathrooms)} bath / {formatNumber(selectedListing.parking)} parking</dd>
                </div>
              </dl>
            </PageCard>
            <PageCard className="mt-6 shadow-none">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b8fa7]">Publication Visibility</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <PublicationPill label="Bridge" status={selectedListing.publicationStatuses.bridge} />
                <PublicationPill label="Property24" status={selectedListing.publicationStatuses.property24} />
                <PublicationPill label="PrivateProperty" status={selectedListing.publicationStatuses.privateProperty} />
                <PublicationPill label="Website" status={selectedListing.publicationStatuses.website} />
              </div>
            </PageCard>
          </div>
        </div>
      ) : null}

      {campaignListing ? (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-[#07111f]/42 p-4 backdrop-blur-sm md:p-8" role="dialog" aria-modal="true" aria-label="Create finance campaign">
          <div className="max-h-[calc(100vh-64px)] w-full max-w-[680px] overflow-y-auto rounded-[16px] bg-white p-6 shadow-[0_26px_80px_rgba(7,17,31,0.28)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b8fa7]">Campaign Creation Wizard</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">{campaignListing.title}</h2>
                <p className="mt-2 text-sm leading-6 text-[#60758d]">Generate finance visibility for this partner-approved listing.</p>
              </div>
              <button
                type="button"
                onClick={() => setCampaignListing(null)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[#dbe5f0] text-[#60758d] transition hover:bg-[#f7fafc]"
                aria-label="Close campaign wizard"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[#27445f]">Campaign type</span>
                <select
                  value={campaignForm.campaignType}
                  onChange={(event) => setCampaignForm((previous) => ({ ...previous, campaignType: event.target.value }))}
                  className="h-11 rounded-[12px] border border-[#dbe5f0] px-3 text-sm font-semibold text-[#27445f] outline-none focus:border-[#2f5573]"
                >
                  <option value="listing_finance">Finance CTA</option>
                  <option value="preapproval_drive">Pre-Approval CTA</option>
                  <option value="buyer_education">Repayment Example</option>
                  <option value="development_finance">Development Campaign</option>
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#27445f]">Deposit %</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={campaignForm.depositPercent}
                    onChange={(event) => setCampaignForm((previous) => ({ ...previous, depositPercent: event.target.value }))}
                    className="h-11 rounded-[12px] border border-[#dbe5f0] px-3 text-sm font-semibold text-[#27445f] outline-none focus:border-[#2f5573]"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#27445f]">Interest %</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={campaignForm.interestRate}
                    onChange={(event) => setCampaignForm((previous) => ({ ...previous, interestRate: event.target.value }))}
                    className="h-11 rounded-[12px] border border-[#dbe5f0] px-3 text-sm font-semibold text-[#27445f] outline-none focus:border-[#2f5573]"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#27445f]">Term</span>
                  <input
                    type="number"
                    min="1"
                    value={campaignForm.loanTerm}
                    onChange={(event) => setCampaignForm((previous) => ({ ...previous, loanTerm: event.target.value }))}
                    className="h-11 rounded-[12px] border border-[#dbe5f0] px-3 text-sm font-semibold text-[#27445f] outline-none focus:border-[#2f5573]"
                  />
                </label>
              </div>
              <div className="rounded-[16px] bg-[#f7fafc] p-4 text-sm leading-6 text-[#60758d]">
                Bridge will create the campaign, repayment profile, pre-approval link, and starter co-branded asset records. Full attribution stays locked for a later phase.
              </div>
              <button
                type="button"
                disabled={campaignCreatingListingId === campaignListing.listingId}
                onClick={async () => {
                  await onCreateFinanceCampaign?.(campaignListing, campaignForm)
                  setCampaignListing(null)
                }}
                className="inline-flex h-11 items-center justify-center rounded-[12px] bg-[#10243a] px-4 text-sm font-semibold text-white transition hover:bg-[#173a5e] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {campaignCreatingListingId === campaignListing.listingId ? 'Generating Campaign...' : 'Generate Campaign'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ApplicationsLockedState() {
  return (
    <PageCard>
      <div className="flex max-w-3xl flex-col gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#f3f7fb] text-[#60758d]">
          <LockKeyhole size={20} />
        </span>
        <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">Application visibility has not been granted for this partner relationship.</h2>
        <p className="text-sm leading-6 text-[#60758d]">Linked application data will only appear once application visibility permission has been granted.</p>
      </div>
    </PageCard>
  )
}

function PerformanceLockedState() {
  return (
    <PageCard>
      <div className="flex max-w-3xl flex-col gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#f3f7fb] text-[#60758d]">
          <LockKeyhole size={20} />
        </span>
        <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">Partner performance visibility has not been granted for this relationship.</h2>
        <p className="text-sm leading-6 text-[#60758d]">Performance metrics will only appear once aggregate performance visibility permission has been granted.</p>
      </div>
    </PageCard>
  )
}

function applicationStageKey(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized.includes('document') || normalized === 'pending') return 'documents'
  if (normalized.includes('submitted')) return 'submitted'
  if (normalized.includes('feedback') || normalized.includes('quote') || normalized.includes('additional')) return 'bank_feedback'
  if (normalized.includes('approved')) return 'approved'
  if (normalized.includes('instruction') || normalized.includes('buyer_approved')) return 'instruction_sent'
  return 'review'
}

function StageDistributionStrip({ distribution = [] }) {
  const stages = [
    { key: 'documents', label: 'Documents' },
    { key: 'review', label: 'Review' },
    { key: 'submitted', label: 'Submitted' },
    { key: 'bank_feedback', label: 'Bank Feedback' },
    { key: 'approved', label: 'Approved' },
    { key: 'instruction_sent', label: 'Instruction Sent' },
  ]
  const counts = new Map()
  ;(Array.isArray(distribution) ? distribution : []).forEach((item) => {
    counts.set(applicationStageKey(item.key || item.stage || item.label), Number(item.count || 0) || 0)
  })
  const total = stages.reduce((sum, stage) => sum + (counts.get(stage.key) || 0), 0)

  return (
    <PageCard>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b8fa7]">Application Pipeline</p>
        <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">Stage distribution</h2>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stages.map((stage) => {
          const count = counts.get(stage.key) || 0
          const width = total ? Math.max(8, Math.round((count / total) * 100)) : 0
          return (
            <div key={stage.key} className="rounded-[16px] bg-[#f7fafc] p-4">
              <p className="text-sm font-semibold text-[#10243a]">{stage.label}</p>
              <p className="mt-2 text-2xl font-semibold text-[#173a5e]">{formatNumber(count)}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#dfe8f1]">
                <div className="h-full rounded-full bg-[#173a5e]" style={{ width: `${width}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </PageCard>
  )
}

function ApplicationsSection({ applications, loading, error, navigate }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-36 animate-pulse rounded-[16px] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.05)]" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-[16px] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.05)]" />
      </div>
    )
  }

  if (error) {
    return (
      <PageCard>
        <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">Partner relationship not found or access denied.</h2>
        <p className="mt-3 text-sm leading-6 text-[#60758d]">Applications can only load through an accepted relationship with application visibility permission.</p>
      </PageCard>
    )
  }

  const canViewApplications = applications?.permissions?.canViewApplications === true
  const rows = Array.isArray(applications?.applications) ? applications.applications : []

  if (!canViewApplications) return <ApplicationsLockedState />

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Active Applications" value={formatNumber(applications?.summary?.activeApplications)} description="Linked active files only." icon={FileText} />
        <SummaryCard label="Submitted" value={formatNumber(applications?.summary?.submittedApplications)} description="Submitted or lender-feedback files." />
        <SummaryCard label="Approved" value={formatNumber(applications?.summary?.approvedApplications)} description="Approved linked applications." icon={ShieldCheck} />
        <SummaryCard label="Approval Rate" value={`${formatNumber(applications?.summary?.approvalRate)}%`} description="Based on visible linked rows." />
      </section>

      <StageDistributionStrip distribution={applications?.stageDistribution || []} />

      <PageCard>
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b8fa7]">Applications</p>
          <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">Linked Applications</h2>
        </div>

        {!rows.length ? (
          <p className="mt-6 text-sm leading-6 text-[#60758d]">No linked applications found yet.</p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-[1120px] border-collapse">
              <thead>
                <tr className="border-b border-[#e3ebf4] text-left">
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Application</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Buyer</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Property</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Stage</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Assigned Consultant</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Agency Agent</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Status</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Updated</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((application) => (
                  <tr key={application.applicationId} className="border-b border-[#edf2f7]">
                    <td className="px-3 py-4">
                      <p className="text-sm font-semibold text-[#10243a]">{application.applicationReference}</p>
                      <p className="mt-1 text-sm text-[#60758d]">Created {formatDate(application.createdAt)}</p>
                    </td>
                    <td className="px-3 py-4 text-sm text-[#27445f]">{application.buyerDisplayName}</td>
                    <td className="max-w-[240px] px-3 py-4 text-sm text-[#27445f]">
                      <span className="line-clamp-2">{application.propertyDisplayName}</span>
                    </td>
                    <td className="px-3 py-4 text-sm font-semibold capitalize text-[#27445f]">{statusLabel(application.stage)}</td>
                    <td className="px-3 py-4 text-sm text-[#60758d]">{application.assignedConsultantName}</td>
                    <td className="px-3 py-4 text-sm text-[#60758d]">{application.agencyAgentName}</td>
                    <td className="px-3 py-4">
                      <span className="inline-flex rounded-full bg-[#f1fbf6] px-2.5 py-1 text-xs font-semibold capitalize text-[#17613d]">{statusLabel(application.status)}</span>
                    </td>
                    <td className="px-3 py-4 text-sm text-[#60758d]">{formatDate(application.updatedAt)}</td>
                    <td className="px-3 py-4">
                      {application.canOpenInternal ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/bond/applications?transactionId=${encodeURIComponent(application.transactionId)}`)}
                          className="inline-flex h-9 items-center justify-center rounded-[10px] border border-[#c6d8ea] px-3 text-sm font-semibold text-[#1f4f78] transition hover:bg-[#f6faff]"
                        >
                          Open
                        </button>
                      ) : (
                        <button type="button" disabled className="inline-flex h-9 cursor-not-allowed items-center justify-center rounded-[10px] border border-[#dbe5f0] px-3 text-sm font-semibold text-[#7b8fa7]">
                          Restricted
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>
    </div>
  )
}

function PerformanceListCard({ title, items = [], empty = 'No data yet.' }) {
  return (
    <PageCard>
      <h3 className="text-lg font-semibold text-[#10243a]">{title}</h3>
      {items.length ? (
        <div className="mt-5 grid gap-3">
          {items.slice(0, 6).map((item) => (
            <div key={`${item.label}-${item.key}`} className="flex items-center justify-between gap-4 rounded-[14px] bg-[#f7fafc] px-4 py-3">
              <span className="text-sm font-semibold text-[#27445f]">{item.label}</span>
              <span className="text-sm font-semibold text-[#10243a]">{formatNumber(item.count)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-5 text-sm leading-6 text-[#60758d]">{empty}</p>
      )}
    </PageCard>
  )
}

function PerformanceSection({ performance, loading, error }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-36 animate-pulse rounded-[16px] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.05)]" />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-64 animate-pulse rounded-[16px] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.05)]" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <PageCard>
        <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">Partner relationship not found or access denied.</h2>
        <p className="mt-3 text-sm leading-6 text-[#60758d]">Performance can only load through an accepted relationship with performance visibility permission.</p>
      </PageCard>
    )
  }

  const canViewPerformance = performance?.permissions?.canViewPartnerPerformance === true
  const summary = performance?.summary || {}

  if (!canViewPerformance) return <PerformanceLockedState />

  if (!summary.totalApplications) {
    return (
      <div className="flex flex-col gap-6">
        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Pipeline Value" value={formatCurrency(0)} description="No linked value yet." icon={TrendingUp} />
          <SummaryCard label="Approval Rate" value="0%" description="Not enough activity yet." icon={ShieldCheck} />
          <SummaryCard label="Average Approval Time" value="0 days" description="Not enough activity yet." />
          <SummaryCard label="MoM Growth" value="0%" description="Not enough activity yet." />
        </section>
        <PageCard>
          <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">Not enough partner activity to calculate performance yet.</h2>
          <p className="mt-3 text-sm leading-6 text-[#60758d]">Aggregate performance will appear once linked applications are available.</p>
        </PageCard>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Pipeline Value" value={formatCurrency(summary.pipelineValue)} description="Aggregate linked pipeline value." icon={TrendingUp} />
        <SummaryCard label="Approval Rate" value={`${formatNumber(summary.approvalRate)}%`} description={`${formatNumber(summary.approvedApplications)} approved applications.`} icon={ShieldCheck} />
        <SummaryCard label="Average Approval Time" value={`${formatNumber(summary.averageApprovalTime)} days`} description="Average approval turnaround." />
        <SummaryCard label="MoM Growth" value={`${formatNumber(summary.monthOnMonthChange)}%`} description={`${formatNumber(summary.applicationsThisMonth)} this month vs ${formatNumber(summary.applicationsLastMonth)} last month.`} />
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <PerformanceListCard title="Stage Distribution" items={performance?.stageDistribution || []} />
        <PerformanceListCard title="Bank Mix" items={performance?.bankMixSummary || []} />
        <PerformanceListCard title="Monthly Application Trend" items={performance?.monthlyApplicationTrend || []} />
        <PageCard>
          <h3 className="text-lg font-semibold text-[#10243a]">Top Bottleneck</h3>
          <p className="mt-5 text-3xl font-semibold tracking-[-0.01em] text-[#173a5e]">{summary.topStageBottleneck}</p>
          <p className="mt-3 text-sm leading-6 text-[#60758d]">Based on the largest visible stage count for this partner relationship.</p>
        </PageCard>
      </section>

      <PerformanceListCard title="Consultant Distribution" items={performance?.consultantDistribution || []} />
    </div>
  )
}

function CampaignsLockedState() {
  return (
    <PageCard>
      <div className="flex max-w-3xl flex-col gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#f3f7fb] text-[#60758d]">
          <LockKeyhole size={20} />
        </span>
        <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">Campaign visibility has not been granted for this relationship.</h2>
        <p className="text-sm leading-6 text-[#60758d]">Marketing collaboration tools will only appear once campaign permissions have been granted.</p>
      </div>
    </PageCard>
  )
}

function CampaignsSection({ campaigns, loading, error, onCreateFromOpportunity, creatingCampaign }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-36 animate-pulse rounded-[16px] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.05)]" />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-[16px] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.05)]" />
      </div>
    )
  }

  if (error) {
    return (
      <PageCard>
        <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">Partner relationship not found or access denied.</h2>
        <p className="mt-3 text-sm leading-6 text-[#60758d]">Campaign data can only load through an accepted relationship with campaign permissions.</p>
      </PageCard>
    )
  }

  const permissions = campaigns?.permissions || {}
  const canSeeCampaignWorkspace = permissions.canViewCampaigns || permissions.canViewListingOpportunities
  const canCreate = permissions.canCreateFinanceCampaigns && permissions.canGenerateFinanceAssets
  const kpis = campaigns?.kpis || {}
  const rows = Array.isArray(campaigns?.campaigns) ? campaigns.campaigns : []
  const opportunities = Array.isArray(campaigns?.opportunities) ? campaigns.opportunities : []

  if (!canSeeCampaignWorkspace) return <CampaignsLockedState />

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Active Campaigns" value={formatNumber(kpis.activeCampaigns)} description="Relationship-owned campaigns." icon={TrendingUp} />
        <SummaryCard label="Finance Enquiries" value={formatNumber(kpis.financeEnquiries)} description="Reserved for attribution phase." />
        <SummaryCard label="Applications Generated" value={formatNumber(kpis.applicationsGenerated)} description="Reserved for attribution phase." />
        <SummaryCard label="Conversion Rate" value={`${formatNumber(kpis.conversionRate)}%`} description="Basic analytics placeholder." />
      </section>

      <PageCard>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(360px,0.2fr)]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b8fa7]">Opportunity Engine</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.01em] text-[#10243a]">Partner growth opportunities</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#60758d]">Bridge surfaces listings that could benefit from finance visibility. Agent ownership stays intact; campaigns belong to this relationship.</p>
          </div>
          <div className="rounded-[16px] bg-[#f7fafc] p-5">
            <p className="text-sm font-semibold text-[#10243a]">Campaign Analytics</p>
            <dl className="mt-4 grid gap-3 text-sm text-[#60758d]">
              <div className="flex justify-between gap-3"><dt>Campaigns Created</dt><dd className="font-semibold text-[#10243a]">{formatNumber(kpis.campaignsCreated)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Links Generated</dt><dd className="font-semibold text-[#10243a]">{formatNumber(kpis.linksGenerated)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Applications Linked</dt><dd className="font-semibold text-[#10243a]">{formatNumber(kpis.applicationsLinked)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Active Listings Promoted</dt><dd className="font-semibold text-[#10243a]">{formatNumber(kpis.activeListingsPromoted)}</dd></div>
            </dl>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {opportunities.length ? opportunities.map((opportunity) => (
            <div key={opportunity.key} className="flex min-h-[220px] flex-col rounded-[16px] bg-[#f7fafc] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Opportunity</p>
              <h3 className="mt-3 text-xl font-semibold text-[#10243a]">{opportunity.label}</h3>
              <p className="mt-2 text-sm leading-6 text-[#60758d]">{opportunity.description}</p>
              <button
                type="button"
                disabled={!canCreate || !opportunity.listingIds.length || creatingCampaign}
                onClick={() => onCreateFromOpportunity?.(opportunity)}
                className="mt-auto inline-flex h-10 items-center justify-center rounded-[12px] bg-[#10243a] px-4 text-sm font-semibold text-white transition hover:bg-[#173a5e] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {creatingCampaign ? 'Creating...' : opportunity.actionLabel}
              </button>
            </div>
          )) : (
            <div className="rounded-[16px] bg-[#f7fafc] p-5 md:col-span-2 xl:col-span-4">
              <h3 className="text-xl font-semibold text-[#10243a]">No campaign opportunities found yet.</h3>
              <p className="mt-2 text-sm leading-6 text-[#60758d]">Shared listings will appear here once they need finance visibility.</p>
            </div>
          )}
        </div>
      </PageCard>

      <PageCard>
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b8fa7]">Listing Campaigns</p>
          <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">Active Campaign Centre</h2>
        </div>
        {rows.length ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((campaign) => (
              <div key={campaign.id} className="rounded-[16px] bg-[#f7fafc] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">{campaign.campaignType.replace(/_/g, ' ')}</p>
                <h3 className="mt-2 text-lg font-semibold text-[#10243a]">{campaign.campaignName}</h3>
                <p className="mt-2 text-sm leading-6 text-[#60758d]">{campaign.listingTitle || 'Listing campaign'}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-[12px] bg-white p-3">
                    <p className="text-[#7b8fa7]">Repayment</p>
                    <p className="mt-1 font-semibold text-[#10243a]">{formatCurrency(campaign.estimatedRepayment)}</p>
                  </div>
                  <div className="rounded-[12px] bg-white p-3">
                    <p className="text-[#7b8fa7]">Assets</p>
                    <p className="mt-1 font-semibold text-[#10243a]">{formatNumber(campaign.assetCount)}</p>
                  </div>
                </div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-[#17613d]">{statusLabel(campaign.status)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-6 text-sm leading-6 text-[#60758d]">No campaigns created yet.</p>
        )}
      </PageCard>
    </div>
  )
}

function AttributionLockedState() {
  return (
    <PageCard>
      <div className="flex max-w-3xl flex-col gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#f3f7fb] text-[#60758d]">
          <LockKeyhole size={20} />
        </span>
        <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">Attribution visibility has not been granted for this relationship.</h2>
        <p className="text-sm leading-6 text-[#60758d]">Lead, campaign and revenue intelligence will only appear once attribution permissions are enabled.</p>
      </div>
    </PageCard>
  )
}

function AttributionSection({ attribution, campaignPerformance, listingAttribution, loading, error }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-36 animate-pulse rounded-[16px] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.05)]" />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-[16px] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.05)]" />
      </div>
    )
  }

  if (error) {
    return (
      <PageCard>
        <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">Partner relationship not found or access denied.</h2>
        <p className="mt-3 text-sm leading-6 text-[#60758d]">Attribution can only load through an accepted relationship with attribution visibility permission.</p>
      </PageCard>
    )
  }

  const canViewAttribution = attribution?.permissions?.canViewAttribution === true
  const canViewRevenue = attribution?.permissions?.canViewPartnerRevenue === true
  const kpis = attribution?.kpis || {}
  const funnel = Array.isArray(attribution?.funnel) ? attribution.funnel : []
  const roi = attribution?.partnerRoi || {}
  const revenue = attribution?.revenueIntelligence || {}
  const campaigns = Array.isArray(campaignPerformance?.campaigns) ? campaignPerformance.campaigns : []
  const listings = Array.isArray(listingAttribution?.listings) ? listingAttribution.listings : []

  if (!canViewAttribution) return <AttributionLockedState />

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Attributed Leads" value={formatNumber(kpis.attributedLeads)} description="First-touch lead events." icon={TrendingUp} />
        <SummaryCard label="Attributed Applications" value={formatNumber(kpis.attributedApplications)} description="Applications linked to this relationship." icon={FileText} />
        <SummaryCard label="Attributed Revenue" value={canViewRevenue ? formatMoneyValue(kpis.attributedRevenue) : 'Locked'} description="Relationship-scoped revenue only." />
        <SummaryCard label="Conversion Rate" value={`${formatNumber(kpis.conversionRate)}%`} description="Applications from finance CTA clicks." icon={ShieldCheck} />
      </section>

      <PageCard>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b8fa7]">Funnel View</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">Attribution path</h2>
        {funnel.length ? (
          <div className="mt-6 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {funnel.map((stage) => (
              <div key={stage.key} className="rounded-[16px] bg-[#f7fafc] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8fa7]">{stage.label}</p>
                <p className="mt-3 text-3xl font-semibold text-[#173a5e]">{formatNumber(stage.count)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-5 text-sm leading-6 text-[#60758d]">No attribution events recorded yet.</p>
        )}
      </PageCard>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.6fr)_minmax(360px,0.4fr)]">
        <PageCard>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b8fa7]">Partner ROI Dashboard</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">{roi.partnerName || 'Partner'}</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-4">
            <div className="rounded-[16px] bg-[#f7fafc] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8fa7]">Applications</p>
              <p className="mt-2 text-2xl font-semibold text-[#10243a]">{formatNumber(roi.applications)}</p>
            </div>
            <div className="rounded-[16px] bg-[#f7fafc] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8fa7]">Approvals</p>
              <p className="mt-2 text-2xl font-semibold text-[#10243a]">{formatNumber(roi.approvals)}</p>
            </div>
            <div className="rounded-[16px] bg-[#f7fafc] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8fa7]">Revenue</p>
              <p className="mt-2 text-2xl font-semibold text-[#10243a]">{canViewRevenue ? formatMoneyValue(roi.revenue) : 'Locked'}</p>
            </div>
            <div className="rounded-[16px] bg-[#f7fafc] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8fa7]">ROI Score</p>
              <p className="mt-2 text-2xl font-semibold text-[#10243a]">{formatNumber(roi.roiScore)}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-[14px] border border-[#dbe5f0] p-4">
              <p className="text-sm font-semibold text-[#10243a]">Top Revenue Partners</p>
              <p className="mt-2 text-sm leading-6 text-[#60758d]">Ranking foundation scoped to this relationship.</p>
            </div>
            <div className="rounded-[14px] border border-[#dbe5f0] p-4">
              <p className="text-sm font-semibold text-[#10243a]">Top Conversion Partners</p>
              <p className="mt-2 text-sm leading-6 text-[#60758d]">Conversion ranking will expand when network-wide rollups arrive.</p>
            </div>
            <div className="rounded-[14px] border border-[#dbe5f0] p-4">
              <p className="text-sm font-semibold text-[#10243a]">Fastest Growing Partners</p>
              <p className="mt-2 text-sm leading-6 text-[#60758d]">Growth ranking is ready for multi-partner aggregation.</p>
            </div>
          </div>
        </PageCard>

        <PageCard>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b8fa7]">Partner Revenue Intelligence</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">Revenue visibility</h2>
          {canViewRevenue ? (
            <div className="mt-6 grid gap-3">
              <div className="flex justify-between gap-4 rounded-[14px] bg-[#f7fafc] px-4 py-3">
                <span className="text-sm text-[#60758d]">Revenue This Month</span>
                <span className="text-sm font-semibold text-[#10243a]">{formatMoneyValue(revenue.revenueThisMonth)}</span>
              </div>
              <div className="flex justify-between gap-4 rounded-[14px] bg-[#f7fafc] px-4 py-3">
                <span className="text-sm text-[#60758d]">Revenue Last Month</span>
                <span className="text-sm font-semibold text-[#10243a]">{formatMoneyValue(revenue.revenueLastMonth)}</span>
              </div>
              <div className="flex justify-between gap-4 rounded-[14px] bg-[#f7fafc] px-4 py-3">
                <span className="text-sm text-[#60758d]">Growth</span>
                <span className="text-sm font-semibold text-[#10243a]">{formatNumber(revenue.growth)}%</span>
              </div>
              <div className="flex justify-between gap-4 rounded-[14px] bg-[#f7fafc] px-4 py-3">
                <span className="text-sm text-[#60758d]">Projected Revenue</span>
                <span className="text-sm font-semibold text-[#10243a]">{formatMoneyValue(revenue.projectedRevenue)}</span>
              </div>
            </div>
          ) : (
            <p className="mt-5 text-sm leading-6 text-[#60758d]">Partner revenue visibility has not been granted for this relationship.</p>
          )}
        </PageCard>
      </section>

      <PageCard>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b8fa7]">Campaign Performance</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">Campaign value proof</h2>
        {campaigns.length ? (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8fa7]">
                  <th className="px-3 py-2">Campaign</th>
                  <th className="px-3 py-2">Listings Promoted</th>
                  <th className="px-3 py-2">Applications</th>
                  <th className="px-3 py-2">Approvals</th>
                  <th className="px-3 py-2">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.campaignId} className="bg-[#f7fafc] text-sm text-[#27445f]">
                    <td className="rounded-l-[12px] px-3 py-4">
                      <p className="font-semibold text-[#10243a]">{campaign.campaignName}</p>
                      <p className="mt-1 text-xs text-[#60758d]">{campaign.campaignType.replace(/_/g, ' ')}</p>
                    </td>
                    <td className="px-3 py-4">{formatNumber(campaign.listingsPromoted)}</td>
                    <td className="px-3 py-4">{formatNumber(campaign.applicationsGenerated)}</td>
                    <td className="px-3 py-4">{formatNumber(campaign.approvals)}</td>
                    <td className="rounded-r-[12px] px-3 py-4">{canViewRevenue ? formatMoneyValue(campaign.revenueGenerated) : 'Locked'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-5 text-sm leading-6 text-[#60758d]">No campaign attribution recorded yet.</p>
        )}
      </PageCard>

      <PageCard>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b8fa7]">Listing Attribution</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">Listing finance outcomes</h2>
        {listings.length ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {listings.map((listing) => (
              <div key={listing.listingId} className="rounded-[16px] bg-[#f7fafc] p-5">
                <h3 className="line-clamp-2 text-lg font-semibold text-[#10243a]">{listing.title}</h3>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-[#60758d]">Views</dt>
                    <dd className="font-semibold text-[#10243a]">{formatNumber(listing.listingViews)}</dd>
                  </div>
                  <div>
                    <dt className="text-[#60758d]">CTA Clicks</dt>
                    <dd className="font-semibold text-[#10243a]">{formatNumber(listing.financeCtaClicks)}</dd>
                  </div>
                  <div>
                    <dt className="text-[#60758d]">Applications</dt>
                    <dd className="font-semibold text-[#10243a]">{formatNumber(listing.applicationsGenerated)}</dd>
                  </div>
                  <div>
                    <dt className="text-[#60758d]">Revenue</dt>
                    <dd className="font-semibold text-[#10243a]">{canViewRevenue ? formatMoneyValue(listing.revenueGenerated) : 'Locked'}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-5 text-sm leading-6 text-[#60758d]">No listing attribution recorded yet.</p>
        )}
      </PageCard>

      <PageCard>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b8fa7]">Branch Attribution</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">Agency to branch to agent drilldown</h2>
        <p className="mt-3 text-sm leading-6 text-[#60758d]">The attribution ledger is relationship-scoped. Branch, agent, listing and application drilldown stays locked until the matching people and branch permissions are granted.</p>
      </PageCard>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-0 py-8">
      <div className="h-36 animate-pulse rounded-[16px] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.05)]" />
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-36 animate-pulse rounded-[16px] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.05)]" />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-[16px] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.05)]" />
    </div>
  )
}

function StateCard({ title, description, onBack }) {
  return (
    <main className="min-h-full bg-[#f6f8fb] px-0 py-8 text-[#10243a]">
      <div className="mx-auto max-w-[900px]">
        <PageCard>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#7b8fa7]">Partner profile</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.01em] text-[#10243a]">{title}</h1>
          <p className="mt-3 text-base leading-7 text-[#60758d]">{description}</p>
          <div className="mt-6">
            <HeaderButton onClick={onBack}>
              <ArrowLeft size={16} /> Back to Partners
            </HeaderButton>
          </div>
        </PageCard>
      </div>
    </main>
  )
}

export default function BondPartnerProfilePage() {
  const { relationshipId = '' } = useParams()
  const navigate = useNavigate()
  const { organisation } = useOrganisation()
  const { workspace, currentMembership } = useWorkspace()
  const [profile, setProfile] = useState(null)
  const [people, setPeople] = useState(null)
  const [listings, setListings] = useState(null)
  const [applications, setApplications] = useState(null)
  const [performance, setPerformance] = useState(null)
  const [campaigns, setCampaigns] = useState(null)
  const [attribution, setAttribution] = useState(null)
  const [campaignPerformance, setCampaignPerformance] = useState(null)
  const [listingAttribution, setListingAttribution] = useState(null)
  const [loading, setLoading] = useState(true)
  const [peopleLoading, setPeopleLoading] = useState(false)
  const [listingsLoading, setListingsLoading] = useState(false)
  const [applicationsLoading, setApplicationsLoading] = useState(false)
  const [performanceLoading, setPerformanceLoading] = useState(false)
  const [campaignsLoading, setCampaignsLoading] = useState(false)
  const [attributionLoading, setAttributionLoading] = useState(false)
  const [campaignCreatingListingId, setCampaignCreatingListingId] = useState('')
  const [campaignMessage, setCampaignMessage] = useState('')
  const [error, setError] = useState('')
  const [peopleError, setPeopleError] = useState('')
  const [preferredRoutingRules, setPreferredRoutingRules] = useState([])
  const [preferredRoutingSavingKey, setPreferredRoutingSavingKey] = useState('')
  const [listingsError, setListingsError] = useState('')
  const [applicationsError, setApplicationsError] = useState('')
  const [performanceError, setPerformanceError] = useState('')
  const [campaignsError, setCampaignsError] = useState('')
  const [attributionError, setAttributionError] = useState('')
  const [notAccepted, setNotAccepted] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  const currentOrganisationId = useMemo(
    () => getCurrentOrganisationId({ organisation, workspace, currentMembership }),
    [currentMembership, organisation, workspace],
  )

  useEffect(() => {
    let cancelled = false

    async function loadProfile() {
      try {
        setLoading(true)
        setPeopleLoading(true)
        setListingsLoading(true)
        setApplicationsLoading(true)
        setPerformanceLoading(true)
        setCampaignsLoading(true)
        setAttributionLoading(true)
        setError('')
        setPeopleError('')
        setListingsError('')
        setApplicationsError('')
        setPerformanceError('')
        setCampaignsError('')
        setAttributionError('')
        setCampaignMessage('')
        setNotAccepted(false)
        const overviewStartedAt = Date.now()
        const overview = await getBondPartnerProfileOverview(relationshipId, {
          currentOrganisationId,
          currentMembership,
          currentWorkspace: workspace,
        })
        bondPerfLog('partner-profile:overview', overviewStartedAt, { relationshipId })
        const profileRelationshipId = normalizeText(overview?.relationship?.id) || relationshipId
        if (!cancelled) setProfile(overview)
        if (!cancelled) setLoading(false)

        const loadSection = async ({
          label,
          task,
          onSuccess,
          onError,
          onSettled,
          fallbackMessage = 'Partner relationship not found or access denied.',
        }) => {
          const startedAt = Date.now()
          try {
            const result = await task()
            if (!cancelled) onSuccess(result)
          } catch (sectionError) {
            if (!cancelled) onError(sectionError?.message || fallbackMessage)
          } finally {
            bondPerfLog(`partner-profile:${label}`, startedAt, { relationshipId: profileRelationshipId })
            if (!cancelled) onSettled()
          }
        }

        await Promise.all([
          loadSection({
            label: 'people',
            task: () => getBondPartnerPeople(profileRelationshipId),
            onSuccess: setPeople,
            onError: (message) => {
              setPeople(null)
              setPeopleError(message)
            },
            onSettled: () => setPeopleLoading(false),
          }),
          loadSection({
            label: 'preferred-routing',
            task: () => listUserPreferredPartnerRoutingRules(),
            onSuccess: (result) => {
              setPreferredRoutingRules(Array.isArray(result) ? result : [])
            },
            onError: () => {
              setPreferredRoutingRules([])
            },
            onSettled: () => {},
            fallbackMessage: 'Preferred partner routing could not be loaded.',
          }),
          loadSection({
            label: 'listings',
            task: () => getBondPartnerListings(profileRelationshipId),
            onSuccess: setListings,
            onError: (message) => {
              setListings(null)
              setListingsError(message)
            },
            onSettled: () => setListingsLoading(false),
          }),
          loadSection({
            label: 'applications',
            task: () => getBondPartnerApplications(profileRelationshipId),
            onSuccess: setApplications,
            onError: (message) => {
              setApplications(null)
              setApplicationsError(message)
            },
            onSettled: () => setApplicationsLoading(false),
          }),
          loadSection({
            label: 'performance',
            task: () => getBondPartnerPerformance(profileRelationshipId),
            onSuccess: setPerformance,
            onError: (message) => {
              setPerformance(null)
              setPerformanceError(message)
            },
            onSettled: () => setPerformanceLoading(false),
          }),
          loadSection({
            label: 'campaigns',
            task: () => getBondPartnerCampaignCentre(profileRelationshipId),
            onSuccess: setCampaigns,
            onError: (message) => {
              setCampaigns(null)
              setCampaignsError(message)
            },
            onSettled: () => setCampaignsLoading(false),
          }),
          loadSection({
            label: 'attribution',
            task: () => Promise.all([
              getPartnerAttributionSummary(profileRelationshipId),
              getCampaignPerformance(profileRelationshipId),
              getListingAttribution(profileRelationshipId),
            ]),
            onSuccess: ([nextAttribution, nextCampaignPerformance, nextListingAttribution]) => {
              setAttribution(nextAttribution)
              setCampaignPerformance(nextCampaignPerformance)
              setListingAttribution(nextListingAttribution)
            },
            onError: (message) => {
              setAttribution(null)
              setCampaignPerformance(null)
              setListingAttribution(null)
              setAttributionError(message)
            },
            onSettled: () => setAttributionLoading(false),
          }),
        ])
      } catch (loadError) {
        if (cancelled) return
        setProfile(null)
        setPeople(null)
        setListings(null)
        setApplications(null)
        setPerformance(null)
        setCampaigns(null)
        setAttribution(null)
        setCampaignPerformance(null)
        setListingAttribution(null)
        setPreferredRoutingRules([])
        setPeopleLoading(false)
        setListingsLoading(false)
        setApplicationsLoading(false)
        setPerformanceLoading(false)
        setCampaignsLoading(false)
        setAttributionLoading(false)
        setNotAccepted(loadError?.code === 'not_accepted')
        setError(loadError?.message || 'Partner relationship not found or access denied.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadProfile()

    return () => {
      cancelled = true
    }
  }, [currentMembership, currentOrganisationId, relationshipId, workspace])

  function backToPartners() {
    navigate('/bond/partners')
  }

  async function refreshCampaignCentre() {
    const profileRelationshipId = normalizeText(profile?.relationship?.id) || relationshipId
    const [nextCampaigns, nextListings, nextAttribution, nextCampaignPerformance, nextListingAttribution] = await Promise.all([
      getBondPartnerCampaignCentre(profileRelationshipId),
      getBondPartnerListings(profileRelationshipId),
      getPartnerAttributionSummary(profileRelationshipId),
      getCampaignPerformance(profileRelationshipId),
      getListingAttribution(profileRelationshipId),
    ])
    setCampaigns(nextCampaigns)
    setListings(nextListings)
    setAttribution(nextAttribution)
    setCampaignPerformance(nextCampaignPerformance)
    setListingAttribution(nextListingAttribution)
  }

  async function refreshAttributionInsights() {
    const profileRelationshipId = normalizeText(profile?.relationship?.id) || relationshipId
    const [nextAttribution, nextCampaignPerformance, nextListingAttribution] = await Promise.all([
      getPartnerAttributionSummary(profileRelationshipId),
      getCampaignPerformance(profileRelationshipId),
      getListingAttribution(profileRelationshipId),
    ])
    setAttribution(nextAttribution)
    setCampaignPerformance(nextCampaignPerformance)
    setListingAttribution(nextListingAttribution)
  }

  async function handleCreateFinanceCampaign(listing, options = {}) {
    if (!listing?.listingId) return
    try {
      setCampaignCreatingListingId(listing.listingId)
      setCampaignMessage('')
      const profileRelationshipId = normalizeText(profile?.relationship?.id) || relationshipId
      const result = await createBondPartnerFinanceCampaign(profileRelationshipId, listing.listingId, {
        ...options,
        campaignName: `${listing.title} Finance Campaign`,
      })
      await refreshCampaignCentre()
      setCampaignMessage(`Campaign created. Estimated repayment: ${formatCurrency(result.financeProfile?.estimatedRepayment)}. Link: ${result.link?.url || 'generated'}.`)
    } catch (createError) {
      setCampaignMessage(createError?.message || 'Unable to create finance campaign.')
    } finally {
      setCampaignCreatingListingId('')
    }
  }

  async function handlePreferredPersonToggle(person) {
    const partnerOrganisationId = normalizeText(
      profile?.partnerOrganisation?.id ||
        profile?.partnerOrganisationId ||
        profile?.partnerOrganisation_id ||
        profile?.partnerOrganisation?.partnerOrganisationId ||
        '',
    )
    if (!person?.userId || !partnerOrganisationId) {
      setError('Unable to save a preferred partner without a partner organisation and user id.')
      return
    }

    const existingRule = preferredRoutingRules.find(
      (rule) =>
        normalizeText(rule?.targetOrganisationId || rule?.target_organisation_id) === partnerOrganisationId &&
        normalizeText(rule?.targetUserId || rule?.target_user_id) === normalizeText(person.userId),
    )

    try {
      setPreferredRoutingSavingKey(person.userId)
      setError('')
      if (existingRule?.id) {
        await removeUserPreferredPartnerRoutingRule(existingRule.id)
        setPreferredRoutingRules((previous) => previous.filter((rule) => String(rule.id) !== String(existingRule.id)))
        return
      }

      const saved = await saveUserPreferredPartnerRoutingRule({
        id: existingRule?.id || undefined,
        ruleName: `Preferred ${person.fullName || person.role || 'Partner'}`,
        targetOrganisationId: partnerOrganisationId,
        targetScopeType: 'consultant',
        targetUserId: person.userId,
        targetScopeName: person.fullName || person.email || 'Preferred partner',
        targetScopeId: person.userId,
        assignmentMode: 'direct_consultant',
        assignmentPriority: 1,
        isActive: true,
        isDefault: true,
        notes: `Preferred partner set from ${partner?.name || 'partner organisation'}.`,
      })
      if (saved?.id) {
        setPreferredRoutingRules((previous) => {
          const next = previous.filter((rule) => String(rule.id) !== String(saved.id))
          return [...next, saved]
        })
      }
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save preferred partner.')
    } finally {
      setPreferredRoutingSavingKey('')
    }
  }

  async function handleCreateFromOpportunity(opportunity) {
    const listingId = opportunity?.listingIds?.[0]
    if (!listingId) return
    const listing = listings?.listings?.find((item) => item.listingId === listingId) || { listingId, title: opportunity.label }
    await handleCreateFinanceCampaign(listing, {
      campaignType: opportunity.opportunityType === 'preapproval_drive' ? 'preapproval_drive' : 'listing_finance',
    })
  }

  function handleTrackListingView(listing) {
    if (!listing?.listingId) return
    const profileRelationshipId = normalizeText(profile?.relationship?.id) || relationshipId

    void trackAttributionEvent({
      relationshipId: profileRelationshipId,
      listingId: listing.listingId,
      eventType: 'listing_view',
    })
      .then(() => refreshAttributionInsights())
      .catch(() => {})
  }

  if (loading) {
    return (
      <main className="min-h-full bg-[#f6f8fb] text-[#10243a]">
        <LoadingSkeleton />
      </main>
    )
  }

  if (error) {
    return (
      <StateCard
        title={notAccepted ? PARTNER_PROFILE_NOT_ACCEPTED_MESSAGE : 'Partner relationship not found or access denied.'}
        description={notAccepted ? 'This partner relationship needs to be accepted before the profile doorway can open.' : 'The partner profile can only be opened from an accepted relationship connected to your current organisation.'}
        onBack={backToPartners}
      />
    )
  }

  const relationship = profile?.relationship || {}
  const partner = profile?.partnerOrganisation || {}
  const summary = profile?.summary || {}
  const location = normalizeText(partner.location) || 'Location pending'
  const connectedSince = formatDate(relationship.connected_since)
  const relationshipType = statusLabel(relationship.relationship_type)
  const hasActivity = Number(summary.linked_application_count || 0) || Number(summary.linked_transaction_count || 0)
  const peoplePermissions = people?.permissions || {}
  const peopleAvailable = peoplePermissions.canViewPrincipal || peoplePermissions.canViewBranchManagers || peoplePermissions.canViewAgents
  const listingsAvailable = listings?.permissions?.canViewListings === true
  const applicationsAvailable = applications?.permissions?.canViewApplications === true
  const performanceAvailable = performance?.permissions?.canViewPartnerPerformance === true
  const campaignsAvailable = campaigns?.permissions?.canViewCampaigns || campaigns?.permissions?.canViewListingOpportunities
  const attributionAvailable = attribution?.permissions?.canViewAttribution === true
  const relationshipContextSections = (profile?.lockedSections || []).map((section) => (
    section.key === 'people' && peopleAvailable
      ? { ...section, status: 'available', reason: 'Partner people visibility is enabled' }
      : section.key === 'listings' && listingsAvailable
        ? { ...section, status: 'available', reason: 'Listing visibility is enabled for shared listings' }
        : section.key === 'applications' && applicationsAvailable
          ? { ...section, status: 'available', reason: 'Application visibility is enabled for linked files' }
          : section.key === 'performance' && performanceAvailable
            ? { ...section, status: 'available', reason: 'Aggregate partner performance visibility is enabled' }
            : section.key === 'campaigns' && campaignsAvailable
              ? { ...section, status: 'available', reason: 'Marketing collaboration permissions are enabled' }
              : section.key === 'attribution' && attributionAvailable
                ? { ...section, status: 'available', reason: 'Attribution intelligence is enabled for this relationship' }
                : section
  ))

  return (
    <main className="min-h-full bg-[#f6f8fb] text-[#10243a]">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-0 py-8">
        <PageCard>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 gap-4">
              {partner.logo_url ? (
                <img src={partner.logo_url} alt="" className="h-16 w-16 shrink-0 rounded-[16px] object-cover" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[16px] bg-[#eef4f8] text-lg font-semibold text-[#284a63]">
                  {initials(partner.name)}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7b8fa7]">Agency Partner Profile</p>
                <h1 className="mt-3 text-4xl font-semibold tracking-[-0.01em] text-[#10243a]">{partner.name || 'Partner organisation'}</h1>
                <p className="mt-3 max-w-3xl text-base leading-7 text-[#60758d]">Relationship overview and partner network foundation</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <HeaderButton onClick={backToPartners}>
                <ArrowLeft size={16} /> Back to Partners
              </HeaderButton>
              <HeaderButton disabled>
                <LockKeyhole size={16} /> Manage Permissions
              </HeaderButton>
            </div>
          </div>
        </PageCard>

        <nav className="grid gap-2 rounded-[16px] bg-white p-2 shadow-[0_12px_26px_rgba(15,23,42,0.05)] md:grid-cols-3 xl:grid-cols-8" aria-label="Partner profile sections">
          {PROFILE_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              disabled={!tab.enabled}
              onClick={() => tab.enabled && setActiveTab(tab.key)}
              className={`inline-flex h-11 items-center justify-center gap-2 rounded-[12px] px-3 text-sm font-semibold transition ${
                activeTab === tab.key
                  ? 'bg-[#10243a] text-white'
                  : tab.enabled
                    ? 'text-[#52677f] hover:bg-[#f5f8fb]'
                    : 'cursor-not-allowed text-[#9aacbd]'
              }`}
            >
              {!tab.enabled ? <LockKeyhole size={14} /> : null}
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === 'overview' ? (
          <>
        <PageCard>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b8fa7]">Partner Identity</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">{partner.name || 'Partner organisation'}</h2>
              <p className="mt-2 text-base leading-7 text-[#60758d]">{getPartnerTypeLabel(partner.type) || 'Agency Partner'}</p>
            </div>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Location</dt>
                <dd className="mt-1 text-sm font-semibold text-[#223b54]">{location}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Status</dt>
                <dd className="mt-1 text-sm font-semibold text-[#17613d]">{statusLabel(relationship.status)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Relationship Type</dt>
                <dd className="mt-1 text-sm font-semibold text-[#223b54]">{relationshipType}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa7]">Connected Since</dt>
                <dd className="mt-1 text-sm font-semibold text-[#223b54]">{connectedSince}</dd>
              </div>
            </dl>
          </div>
        </PageCard>

        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Branches" value={formatNumber(summary.branch_count)} description="Aggregate branch count only." icon={Building2} />
          <SummaryCard label="Linked Applications" value={formatNumber(summary.linked_application_count)} description={hasActivity ? 'Aggregate linked applications.' : 'No relationship activity yet.'} />
          <SummaryCard label="Linked Transactions" value={formatNumber(summary.linked_transaction_count)} description={hasActivity ? 'Aggregate linked transactions.' : 'No relationship activity yet.'} />
          <SummaryCard label="Relationship Health" value={summary.relationship_health || 'Active'} description="Phase 1 status signal only." icon={ShieldCheck} />
        </section>

        <PageCard>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b8fa7]">Safe Relationship Context</p>
            <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#10243a]">Future workspace areas</h2>
            <p className="max-w-3xl text-sm leading-6 text-[#60758d]">These areas are intentionally locked until the permission model is in place.</p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {relationshipContextSections.map((section) => (
              <div key={section.key} className="rounded-[16px] bg-[#f7fafc] p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[#10243a]">{section.label}</p>
                  {section.status === 'available' ? <ShieldCheck size={16} className="text-[#17613d]" /> : <LockKeyhole size={16} className="text-[#7b8fa7]" />}
                </div>
                <p className={`mt-3 text-xs font-semibold uppercase tracking-[0.12em] ${section.status === 'available' ? 'text-[#17613d]' : 'text-[#7b8fa7]'}`}>
                  {section.status === 'available' ? 'Available' : 'Locked / Coming Soon'}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#60758d]">{section.reason}</p>
              </div>
            ))}
          </div>
        </PageCard>

        <div className="rounded-[16px] bg-[#edf4f8] p-5 text-sm leading-6 text-[#476176]">
          Partner data visibility is controlled by relationship permissions. Detailed people, listings, leads and application data will only appear once sharing permissions have been granted.
        </div>
          </>
        ) : null}

        {activeTab === 'people' ? (
          <PeopleSection
            people={people}
            loading={peopleLoading}
            error={peopleError}
            preferredRoutingRules={preferredRoutingRules}
            onTogglePreferred={handlePreferredPersonToggle}
            savingKey={preferredRoutingSavingKey}
          />
        ) : null}

        {activeTab === 'listings' ? (
          <>
            {campaignMessage ? (
              <div className="rounded-[16px] bg-[#edf4f8] p-5 text-sm font-semibold leading-6 text-[#476176]">{campaignMessage}</div>
            ) : null}
            <ListingsSection
              listings={listings}
              loading={listingsLoading}
              error={listingsError}
              campaigns={campaigns}
              listingAttribution={listingAttribution}
              onCreateFinanceCampaign={handleCreateFinanceCampaign}
              onTrackListingView={handleTrackListingView}
              campaignCreatingListingId={campaignCreatingListingId}
            />
          </>
        ) : null}

        {activeTab === 'applications' ? (
          <ApplicationsSection applications={applications} loading={applicationsLoading} error={applicationsError} navigate={navigate} />
        ) : null}

        {activeTab === 'performance' ? (
          <PerformanceSection performance={performance} loading={performanceLoading} error={performanceError} />
        ) : null}

        {activeTab === 'campaigns' ? (
          <>
            {campaignMessage ? (
              <div className="rounded-[16px] bg-[#edf4f8] p-5 text-sm font-semibold leading-6 text-[#476176]">{campaignMessage}</div>
            ) : null}
            <CampaignsSection
              campaigns={campaigns}
              loading={campaignsLoading}
              error={campaignsError}
              onCreateFromOpportunity={handleCreateFromOpportunity}
              creatingCampaign={Boolean(campaignCreatingListingId)}
            />
          </>
        ) : null}

        {activeTab === 'attribution' ? (
          <AttributionSection
            attribution={attribution}
            campaignPerformance={campaignPerformance}
            listingAttribution={listingAttribution}
            loading={attributionLoading}
            error={attributionError}
          />
        ) : null}
      </div>
    </main>
  )
}
