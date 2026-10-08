import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Banknote,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Clock3,
  Copy,
  FileCheck2,
  Grid2X2,
  Mail,
  MapPin,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react'
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import AddressAutocomplete from '../../components/location/AddressAutocomplete'
import BranchExecutiveOverview, { BranchOverviewSkeleton } from '../../components/agency/BranchExecutiveOverview'
import BranchCoverImage from '../../components/agency/BranchCoverImage'
import BranchFicTraining from '../../components/agency/BranchFicTraining'
import BranchTopPerformers from '../../components/agency/BranchTopPerformers'
import AgentTransactionsTable from '../../components/AgentTransactionsTable'
import { LeadSourceBrand, PropertyThumbnail, StagePill } from './LeadListPage'
import { getPropertyImageUrl } from './agencyLeadListModel'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import InlineCommissionStructure from '../../components/commission/InlineCommissionStructure'
import {
  AGENT_ROLE_OPTIONS,
  buildAgentInviteLink,
} from '../../lib/agentInviteService'
import {
  fetchOrganisationSettings,
  listOrganisationCommissionStructures,
  listOrganisationPreferredPartners,
  uploadOrganisationBrandingAsset,
} from '../../lib/settingsApi'
import { upsertAreaFromAddress } from '../../lib/location/upsertArea'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import RecruitmentJoiningDialog from '../recruitment/RecruitmentJoiningDialog'
import { captureBranchRecruitmentLead } from '../../services/recruitmentService'
import RecruitmentJoiningList from '../recruitment/RecruitmentJoiningList'
import { navigateToRecruitment } from '../recruitment/recruitmentEntryModel'
import { createWorkspaceUserInvite, resendWorkspaceUserInvite } from '../../services/workspaceUserInviteService'
import { updateBranch } from '../../services/agencyBranchService'
import { getBranchDashboardData } from '../../services/branchDashboardDataService'
import { buildBranchDashboard, BRANCH_REPORTING_PERIODS, isOpenBranchTransaction } from '../../services/branchDashboardModel'
import { buildBranchWorkspacePerformance } from '../../services/branchWorkspacePerformanceService'

const TABS = [
  { key: 'overview', label: 'Overview', icon: Grid2X2 },
  { key: 'staff', label: 'Staff', icon: Users },
  { key: 'listings', label: 'Listings', icon: Building2 },
  { key: 'leads', label: 'Leads', icon: Users },
  { key: 'transactions', label: 'Transactions', icon: BriefcaseBusiness },
  { key: 'performance', label: 'Performance', icon: TrendingUp },
  { key: 'compliance', label: 'FIC Training', icon: ShieldCheck },
  { key: 'settings', label: 'Settings', icon: Settings },
]

const BRANCH_AGENT_ROLE_VALUES = new Set([
  'agent',
  'assistant',
  'transaction_coordinator',
  'listing_coordinator',
  'admin_coordinator',
])

function normalizeText(value) {
  return String(value || '').trim()
}

function buildBranchAddressValue(branch = {}) {
  const formattedAddress = String(
    branch.formattedAddress ||
      [branch.address, branch.suburb, branch.city, branch.province].filter(Boolean).join(', '),
  ).trim()
  if (!formattedAddress) return null

  return {
    formattedAddress,
    streetAddress: String(branch.address || '').trim(),
    suburb: String(branch.suburb || '').trim(),
    city: String(branch.city || '').trim(),
    province: String(branch.province || '').trim(),
    country: String(branch.country || 'South Africa').trim(),
    postalCode: String(branch.postalCode || '').trim(),
    latitude: typeof branch.latitude === 'number' ? branch.latitude : Number(branch.latitude) || undefined,
    longitude: typeof branch.longitude === 'number' ? branch.longitude : Number(branch.longitude) || undefined,
    placeId: String(branch.googlePlaceId || '').trim(),
  }
}

function mergeBranchAddress(previous = {}, value = null) {
  if (!value) {
    return {
      ...previous,
      address: '',
      formattedAddress: '',
      suburb: '',
      city: '',
      province: '',
      country: 'South Africa',
      postalCode: '',
      latitude: null,
      longitude: null,
      googlePlaceId: '',
      location: '',
    }
  }

  return {
    ...previous,
    address: value.streetAddress || value.formattedAddress || '',
    formattedAddress: value.formattedAddress || '',
    suburb: value.suburb || '',
    city: value.city || '',
    province: value.province || '',
    country: value.country || 'South Africa',
    postalCode: value.postalCode || '',
    latitude: value.latitude ?? null,
    longitude: value.longitude ?? null,
    googlePlaceId: value.placeId || '',
    location: [value.city, value.province].filter(Boolean).join(', ') || value.formattedAddress || '',
  }
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'R 0'
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount)
}

function formatPercent(value) {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return '0%'
  return `${Math.round(numeric)}%`
}

function normalizeAgentInviteRole(value) {
  const normalized = normalizeText(value).toLowerCase()
  if (['assistant', 'transaction_coordinator', 'listing_coordinator', 'admin_coordinator'].includes(normalized)) return normalized
  return 'agent'
}

function formatRoleLabel(value) {
  const normalized = normalizeText(value).toLowerCase()
  const matched = AGENT_ROLE_OPTIONS.find((option) => option.value === normalized)
  if (matched) return matched.label
  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ') || 'Agent'
}

function getBranchAgentRoleOptions() {
  return AGENT_ROLE_OPTIONS.filter((option) => BRANCH_AGENT_ROLE_VALUES.has(option.value))
}

function formatDateShort(value) {
  if (!value) return 'No recent update'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No recent update'
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getInitials(value = '') {
  const parts = normalizeText(value).split(/\s+/).filter(Boolean)
  if (!parts.length) return 'BR'
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function KpiCard({ label, value, helper, icon, tone = 'blue' }) {
  const toneClass = {
    blue: 'bg-[#edf5ff] text-[#315f8f]',
    green: 'bg-[#effaf3] text-[#26724c]',
    gold: 'bg-[#fff7e8] text-[#8a641d]',
    slate: 'bg-[#f5f8fc] text-[#405b75]',
    navy: 'bg-[#edf2f6] text-[#163247]',
  }[tone] || 'bg-[#f5f8fc] text-[#405b75]'

  return (
    <article className="rounded-[18px] border border-[#dfe8f1] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(24,45,68,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">{label}</span>
        <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] ${toneClass}`}>
          {icon ? createElement(icon, { size: 14 }) : null}
        </span>
      </div>
      <strong className="mt-3 block text-[1.45rem] font-semibold leading-none tracking-[-0.04em] text-[#102236] tabular-nums">
        {value}
      </strong>
      <p className="mt-2 text-[0.78rem] font-medium leading-5 text-[#667b92]">{helper}</p>
    </article>
  )
}

function EmptyState({ title, copy, icon = Building2, action = null }) {
  return (
    <div className="rounded-[20px] border border-dashed border-[#d6e2ef] bg-[#fbfdff] px-6 py-8 text-center">
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-[16px] bg-[#edf4fb] text-[#35546c]">
        {createElement(icon, { size: 20 })}
      </div>
      <h4 className="mt-4 text-[1rem] font-semibold tracking-[-0.02em] text-[#142132]">{title}</h4>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#60758b]">{copy}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  )
}

function SectionTitle({ eyebrow, title, copy }) {
  return (
    <div>
      {eyebrow ? <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">{eyebrow}</p> : null}
      <h2 className="mt-1 text-[1.18rem] font-semibold tracking-[-0.03em] text-[#142132]">{title}</h2>
      {copy ? <p className="mt-1 text-sm leading-6 text-[#60758b]">{copy}</p> : null}
    </div>
  )
}

function SimpleTable({ columns, rows }) {
  return (
    <div className="overflow-x-auto rounded-[18px] border border-[#dfe8f1] bg-white">
      <table className="min-w-[760px] w-full text-sm">
        <thead className="bg-[#f7faff] text-left text-[0.68rem] uppercase tracking-[0.12em] text-[#6f839a]">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-4 py-3 font-semibold">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf2f7] bg-white text-[#223449]">
          {rows.map((row, index) => {
            const rowConfig = Array.isArray(row) ? { cells: row } : row
            const cells = rowConfig?.cells || []
            const clickable = typeof rowConfig?.onClick === 'function'
            return (
            <tr
              key={rowConfig?.key || `${index}-${cells.map((cell) => (typeof cell === 'string' || typeof cell === 'number' ? cell : cellIndexLabel(cell))).join('|')}`}
              className={`transition hover:bg-[#f8fbff] ${clickable ? 'cursor-pointer focus-within:bg-[#f8fbff]' : ''}`}
              onClick={rowConfig?.onClick}
              onKeyDown={(event) => {
                if (!clickable) return
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  rowConfig.onClick()
                }
              }}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
            >
              {cells.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3">{cell}</td>
              ))}
            </tr>
          )})}
        </tbody>
      </table>
    </div>
  )
}

function cellIndexLabel(cell) {
  if (cell == null) return ''
  if (typeof cell === 'string' || typeof cell === 'number') return String(cell)
  return 'cell'
}

function StatusPill({ children, tone = 'slate' }) {
  const className = {
    invited: 'border-[#e7ddf7] bg-[#f7f1ff] text-[#5c3a9d]',
    active: 'border-[#d7e7dd] bg-[#edf9f1] text-[#1d7d45]',
    slate: 'border-[#dce6f1] bg-[#f7f9fc] text-[#53677f]',
  }[tone] || 'border-[#dce6f1] bg-[#f7f9fc] text-[#53677f]'

  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${className}`}>
      {children}
    </span>
  )
}

export function BranchLeadsTable({ leads, listings = [], onOpenLead, assignedAgentName, canViewFinancials = false }) {
  const listingById = new Map(listings.map((listing) => [listing.id, listing]))
  const rows = leads.map((lead) => {
    const listing = listingById.get(lead.enquired_listing_id || lead.listing_id) || {}
    return {
      id: lead.lead_id || lead.id,
      name: lead.name || lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unnamed lead',
      contact: lead.phone || lead.mobile || lead.email || 'No contact details',
      propertyTitle: lead.enquired_property_title || listing.title || lead.seller_property_address || lead.property_interest || 'No property address yet',
      propertySubtitle: lead.enquired_property_address || listing.formatted_address || listing.address || lead.area_interest || 'Property details pending',
      propertyImageUrl: getPropertyImageUrl(lead) || getPropertyImageUrl(listing),
      source: lead.lead_source || lead.source || 'Unknown source',
      stage: String(lead.stage || lead.status || 'New').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      agent: assignedAgentName(lead),
      updated: formatDateShort(lead.updated_at || lead.created_at),
      value: lead.budget || lead.estimated_value || 0,
    }
  })
  return (
    <article className="overflow-hidden rounded-[18px] border border-[rgba(15,23,42,0.06)] bg-white shadow-[0_16px_42px_rgba(15,23,42,0.045)]">
      <header className="border-b border-[rgba(15,23,42,0.06)] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex items-center gap-2"><h2 className="text-[1.45rem] font-medium tracking-[-0.04em] text-[#142132]">Branch leads</h2><span className="rounded-full border border-[#dce7f2] bg-[#f8fbff] px-3 py-1 text-sm font-medium text-[#35546c]">{leads.length}</span></div>
        <p className="mt-1.5 text-sm text-[#60758b]">Leads currently assigned to this branch.</p>
      </header>
      <div className="hidden overflow-x-auto lg:block">
        {rows.length ? <table className="w-full min-w-[1000px] table-fixed text-left"><thead className="h-11 bg-[#fbfdff] text-[0.7rem] font-semibold uppercase tracking-[0.04em] text-[#7890a8]"><tr><th className="w-[25%] px-5 py-3">Property</th><th className="w-[20%] px-4 py-3">Lead</th><th className="w-[13%] px-4 py-3">Source</th><th className="w-[16%] px-4 py-3">Stage</th><th className="w-[16%] px-4 py-3">Assigned agent</th>{canViewFinancials ? <th className="w-[10%] px-4 py-3">Value</th> : null}<th className="w-[12%] px-4 py-3">Updated</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} tabIndex={0} aria-label={`Open lead ${row.name}`} className="cursor-pointer border-t border-[#edf2f7] transition-colors duration-150 hover:bg-[#f8fbfe] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#176b50]" onClick={() => onOpenLead(row.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenLead(row.id) } }}>
          <td className="px-5 py-3"><div className="flex min-w-0 items-center gap-3"><PropertyThumbnail row={row} /><div className="min-w-0"><div className="truncate text-sm font-semibold text-[#142132]" title={row.propertyTitle}>{row.propertyTitle}</div><div className="mt-1 truncate text-xs text-[#60758b]">{row.propertySubtitle}</div></div></div></td>
          <td className="px-4 py-3"><div className="truncate text-sm font-semibold text-[#142132]">{row.name}</div><div className="mt-1 truncate text-xs text-[#60758b]">{row.contact}</div></td>
          <td className="px-4 py-3"><LeadSourceBrand source={row.source} /></td><td className="px-4 py-3"><StagePill stage={row.stage} /></td><td className="px-4 py-3"><div className="truncate text-sm font-medium text-[#20364c]">{row.agent}</div></td>
          {canViewFinancials ? <td className="px-4 py-3 text-sm font-medium text-[#20364c]">{formatCurrency(row.value)}</td> : null}<td className="px-4 py-3 text-sm text-[#60758b]">{row.updated}<ArrowRight size={14} className="mt-1 text-[#7890a8]" /></td>
        </tr>)}</tbody></table> : <EmptyState title="No leads match these filters" copy="Try clearing a filter to show the leads assigned to this branch." icon={Users} />}
      </div>
      <div className="space-y-3 p-4 lg:hidden">{rows.length ? rows.map((row) => <button key={row.id} type="button" className="w-full rounded-[18px] border border-[#e1e8f0] bg-white p-4 text-left shadow-sm hover:bg-[#f8fbfe]" onClick={() => onOpenLead(row.id)}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-semibold text-[#142132]">{row.name}</h3><p className="mt-1 truncate text-sm text-[#60758b]">{row.contact}</p></div><StagePill stage={row.stage} /></div><div className="mt-4 flex min-w-0 items-center gap-3"><PropertyThumbnail row={row} /><div className="min-w-0"><strong className="block truncate text-sm text-[#142132]">{row.propertyTitle}</strong><span className="mt-1 block truncate text-xs text-[#60758b]">{row.propertySubtitle}</span></div></div><div className="mt-4 flex items-center justify-between gap-3 border-t border-[#edf2f7] pt-3"><LeadSourceBrand source={row.source} /><span className="truncate text-xs text-[#60758b]">{row.agent}</span></div><div className="mt-3 flex items-center justify-between text-xs text-[#60758b]">{canViewFinancials ? <span>{formatCurrency(row.value)}</span> : <span />}<span>{row.updated}</span><ArrowRight size={15} /></div></button>) : <EmptyState title="No leads match these filters" copy="Try clearing a filter to show the leads assigned to this branch." icon={Users} />}</div>
    </article>
  )
}

function StaffRosterCard({ agent, onOpen, canViewFinancials = false }) {
  const statusLabel = agent.isPendingInvite ? 'Invite pending' : agent.status || 'Active'
  const statusClass = agent.statusTone === 'active'
    ? 'border-[#cfe8dc] bg-[#effaf3] text-[#26724c]'
    : agent.statusTone === 'invited'
      ? 'border-[#efdcb7] bg-[#fff9ec] text-[#8a641d]'
      : 'border-[#dbe6f1] bg-[#f8fbff] text-[#4d6782]'

  return (
    <button type="button" className="group w-full rounded-[20px] border border-[#e1eaf3] bg-white p-5 text-left shadow-[0_10px_26px_rgba(24,45,68,0.045)] transition hover:-translate-y-0.5 hover:border-[#bcd5c8] hover:shadow-[0_16px_32px_rgba(24,45,68,0.09)]" onClick={onOpen}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[16px] bg-[#edf4fb] text-sm font-bold text-[#315f8f]">
            {agent.avatarUrl ? <img src={agent.avatarUrl} alt="" className="h-full w-full object-cover" /> : getInitials(agent.name)}
          </div>
          <div className="min-w-0"><h3 className="truncate text-[1rem] font-semibold text-[#142132]">{agent.name}</h3><p className="mt-0.5 truncate text-sm text-[#60758b]">{agent.role}</p></div>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass}`}>{statusLabel}</span>
      </div>
      <p className="mt-4 truncate text-sm text-[#60758b]">{agent.email || 'No email address recorded'}</p>
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[#edf2f7] pt-4">
        <div className="rounded-[12px] bg-[#f8fbff] px-3 py-2.5"><p className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Current listings</p><p className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[#142132]">{agent.listings ?? '—'}</p></div>
        <div className="rounded-[12px] bg-[#f8fbff] px-3 py-2.5"><p className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">In progress</p><p className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[#142132]">{agent.transactions ?? '—'}</p></div>
      </div>
      {!agent.isPendingInvite && (agent.listings == null || agent.transactions == null) ? <p className="mt-3 text-xs text-[#71849a]">Some figures could not be loaded.</p> : null}
      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-[#71849a]"><span>{agent.isPendingInvite ? 'Waiting for acceptance' : `Updated ${formatDateShort(agent.lastActive)}`}</span>{canViewFinancials && !agent.isPendingInvite ? <span className="text-right"><span className="block">{agent.revenueLabel}</span><span className="font-semibold text-[#26724c]">{agent.revenue == null ? '—' : formatCurrency(agent.revenue)}</span></span> : null}</div>
    </button>
  )
}

function BranchListingImage({ listing, alt }) {
  const imageUrl = normalizeText(listing?.image_url || listing?.cover_image_url || listing?.imageUrl || listing?.coverImageUrl)
  if (imageUrl) return <img src={imageUrl} alt={alt} className="h-full w-full object-cover" />
  return <div className="relative h-full w-full bg-[linear-gradient(140deg,#1f4f78_0%,#4a7da8_55%,#a8c2dc_100%)]"><div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_22%,rgba(255,255,255,0.24),transparent_52%)]" /><span className="absolute bottom-3 left-3 rounded-full border border-white/35 bg-white/20 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-white">Listing image</span></div>
}

function BranchListingCard({ listing, onOpen, assignedAgentName, canViewFinancials = false }) {
  const title = listing.listing_title || listing.title || listing.formatted_address || listing.id
  const status = listing.listing_status || listing.stage || 'Active'
  const statusKey = normalizeLower(status)
  const statusDotClass = statusKey.includes('sold') ? 'bg-[#60758b]' : statusKey.includes('offer') ? 'bg-[#d79d32]' : statusKey.includes('withdrawn') ? 'bg-[#c65b51]' : 'bg-[#39a269]'
  const agentName = assignedAgentName(listing)
  const location = [listing.suburb, listing.city, listing.province].filter(Boolean).join(', ') || 'Location pending'

  return (
    <article onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen() } }} role="button" tabIndex={0} className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-[8px] border border-[#dce6f2] bg-white shadow-[0_6px_16px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,23,42,0.09)]">
      <div className="relative h-[132px] w-full overflow-hidden border-b border-[#e5edf6]"><BranchListingImage listing={listing} alt={title} /><div className="absolute left-3 top-3 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-full border border-white/25 bg-[#091322]/58 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_8px_18px_rgba(9,19,34,0.18)] backdrop-blur"><span className={`h-2 w-2 rounded-full ${statusDotClass}`} /><span className="truncate">{formatRoleLabel(status)}</span></div></div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div><h3 className="truncate text-[1.02rem] font-semibold leading-6 text-[#142132]" title={title}>{title}</h3><p className="mt-1 truncate text-sm text-[#60758b]">{location}</p><p className="mt-2 text-[1.05rem] font-semibold text-[#1f4f78]">{canViewFinancials ? formatCurrency(listing.asking_price || listing.estimated_value || 0) : 'Price restricted'}</p></div>
        <div className="grid grid-cols-2 gap-2 rounded-[12px] border border-[#dbe6f2] bg-[#f9fbfe] px-3 py-2 text-center text-[0.76rem] font-semibold text-[#35546c]"><span className="truncate">{formatRoleLabel(status)}</span><span className="truncate">Updated {formatDateShort(listing.updated_at || listing.created_at)}</span></div>
        <div className="mt-auto flex min-w-0 items-center gap-3 border-t border-[#eef3f8] pt-3"><span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d7e2ee] bg-[#eef4fa] text-[0.72rem] font-bold text-[#1f4f78]">{getInitials(agentName)}</span><div className="min-w-0"><p className="truncate text-[0.84rem] font-semibold text-[#20364d]">{agentName}</p><p className="mt-0.5 truncate text-[0.72rem] text-[#6d8095]">Assigned agent</p></div></div>
        <button type="button" onClick={(event) => { event.stopPropagation(); onOpen() }} className="inline-flex min-h-9 w-full min-w-0 items-center justify-center gap-1.5 rounded-full border border-[#c6d8ea] bg-white px-3 text-[0.76rem] font-semibold text-[#1f4f78] transition hover:border-[#9fb7d1] hover:bg-[#f6faff]"><span className="truncate">Open</span><ArrowRight size={14} className="shrink-0" /></button>
      </div>
    </article>
  )
}

function ActionButton({ children, icon, variant = 'default', ...props }) {
  const Icon = icon
  const className = variant === 'danger'
    ? 'border-[#ead5d2] bg-[#fff8f8] text-[#8a3a33] hover:bg-[#fff3f1]'
    : 'border-[#dce6f1] bg-white text-[#263f58] hover:border-[#c7d6e5] hover:bg-[#f8fbff]'

  return (
    <button
      type="button"
      className={`inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[14px] border px-3 text-sm font-semibold transition ${className}`}
      {...props}
    >
      {Icon ? <Icon size={15} /> : null}
      {children}
    </button>
  )
}

export function BranchSettingsForm({ branch, onSaved }) {
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState('')
  const [form, setForm] = useState({
    name: '',
    city: '',
    province: '',
    address: '',
    formattedAddress: '',
    suburb: '',
    country: 'South Africa',
    postalCode: '',
    latitude: null,
    longitude: null,
    googlePlaceId: '',
    location: '',
    managerName: '',
    principalUserId: '',
    email: '',
    phone: '',
    coverImageUrl: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const managerOptions = [...new Map((branch?.members || []).filter((member) => normalizeLower(member.status) === 'active' && member.user_id).map((member) => [member.user_id, { id: member.user_id, name: [member.first_name, member.last_name].filter(Boolean).join(' ') || member.email || 'Branch team member' }])).values()].sort((a, b) => a.name.localeCompare(b.name))

  useEffect(() => {
    if (!branch) return
    setForm({
      name: branch.name || '',
      city: branch.city || '',
      province: branch.province || '',
      address: branch.address || '',
      formattedAddress: branch.formattedAddress || '',
      suburb: branch.suburb || '',
      country: branch.country || 'South Africa',
      postalCode: branch.postalCode || '',
      latitude: branch.latitude ?? null,
      longitude: branch.longitude ?? null,
      googlePlaceId: branch.googlePlaceId || '',
      location: branch.location || '',
      managerName: branch.managerName || (branch.principalName === 'Principal pending' ? '' : branch.principalName) || '',
      principalUserId: branch.principalUserId || '',
      email: branch.email || '',
      phone: branch.phone || '',
      coverImageUrl: branch.coverImageUrl || '',
    })
    setCoverFile(null)
    setError('')
  }, [branch])

  useEffect(() => {
    if (!coverFile) {
      setCoverPreview('')
      return
    }
    const url = URL.createObjectURL(coverFile)
    setCoverPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [coverFile])

  function selectCover(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Choose a JPG, PNG, or WebP image up to 5 MB.')
      return
    }
    setError('')
    setCoverFile(file)
    setSaved(false)
  }

  function updateField(key, value) {
    setSaved(false)
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  async function handleSave() {
    if (!normalizeText(form.name)) {
      setError('Branch name is required.')
      return
    }

    try {
      setSaving(true)
      setSaved(false)
      setError('')
      let coverImageUrl = form.coverImageUrl
      if (coverFile) {
        const upload = await uploadOrganisationBrandingAsset({ file: coverFile, variant: `branch-${branch.id}-cover` })
        coverImageUrl = upload.publicUrl
        if (upload.bucket !== 'organisation-branding') throw new Error('Branch covers require the organisation branding bucket. The image has not been applied.')
        if (!coverImageUrl) throw new Error('The cover image could not be saved. Please try again.')
        setForm((previous) => ({ ...previous, coverImageUrl }))
        setCoverFile(null)
      }
      const updated = await updateBranch(branch.id, { ...form, coverImageUrl })
      if (!updated || updated.name !== normalizeText(form.name) || updated.coverImageUrl !== normalizeText(coverImageUrl) || updated.principalUserId !== normalizeText(form.principalUserId) || updated.address !== normalizeText(form.address) || updated.email !== normalizeText(form.email) || updated.phone !== normalizeText(form.phone)) throw new Error('The branch changes could not be confirmed. Please reload and try again.')
      void upsertAreaFromAddress(buildBranchAddressValue(form), { incrementListingCount: false }).catch(() => {})
      onSaved?.(updated)
      setSaved(true)
    } catch (saveError) {
      setError(saveError?.message || 'Unable to update this branch right now.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-[#dfe8f1] bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-semibold text-[#142132]">Branch Settings</h2>
      <p className="mt-1 text-sm text-[#60758b]">Update the branch cover image, profile, and contact details.</p>
      <form className="mt-6" onSubmit={(event) => { event.preventDefault(); if (!saving) void handleSave() }}>
      <fieldset disabled={saving}>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-8">
        <section className="min-w-0 lg:border-r lg:border-[#e4ebf2] lg:pr-8" aria-label="Branch cover image">
          <p className="mb-2 text-sm font-semibold text-[#142132]">Cover image</p>
          <BranchCoverImage src={coverPreview || form.coverImageUrl} name={form.name} className="aspect-video w-full rounded-xl" />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className={`inline-flex cursor-pointer items-center rounded-lg border border-[#dbe4ee] px-3 py-2 text-sm font-semibold text-[#1f3448] focus-within:ring-2 focus-within:ring-[#176b50] ${saving ? 'pointer-events-none opacity-50' : 'hover:bg-[#f8fafc]'}`}>
              {coverPreview || form.coverImageUrl ? 'Replace cover image' : 'Upload cover image'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={saving} onChange={selectCover} />
            </label>
            {coverFile || form.coverImageUrl ? <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => { setCoverFile(null); updateField('coverImageUrl', '') }}>Remove image</Button> : null}
          </div>
          <p className="mt-2 text-xs text-[#60758b]">JPG, PNG, or WebP, up to 5 MB. A wide landscape image works best. Changes apply when you save the branch.</p>
        </section>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 sm:col-span-2">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Branch Name</span>
          <Field value={form.name} onChange={(event) => updateField('name', event.target.value)} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">City</span>
          <Field value={form.city} onChange={(event) => updateField('city', event.target.value)} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Province</span>
          <Field value={form.province} onChange={(event) => updateField('province', event.target.value)} />
        </label>
        <div className="sm:col-span-2">
          <AddressAutocomplete
            label="Branch address"
            value={buildBranchAddressValue(form)}
            onChange={(nextAddress) => { setSaved(false); setForm((previous) => mergeBranchAddress(previous, nextAddress)) }}
            placeholder="12 Main Road Bedfordview"
            description="Used for branch reporting, routing, local search, and support context."
          />
        </div>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Suburb</span>
          <Field value={form.suburb} onChange={(event) => updateField('suburb', event.target.value)} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Postal Code</span>
          <Field value={form.postalCode} onChange={(event) => updateField('postalCode', event.target.value)} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Display Location</span>
          <Field value={form.location} onChange={(event) => updateField('location', event.target.value)} placeholder="e.g. Benoni, Gauteng" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Branch Manager</span>
          <select value={form.principalUserId} onChange={(event) => { const selected = managerOptions.find((person) => person.id === event.target.value); setSaved(false); setForm((previous) => ({ ...previous, principalUserId: selected?.id || '', managerName: selected?.name || '' })) }} className="min-h-11 rounded-xl border border-[#dbe6f1] bg-white px-3 text-sm text-[#142132]">
            <option value="">{form.managerName && !form.principalUserId ? `Current: ${form.managerName} — select a person` : 'Not assigned'}</option>
            {form.principalUserId && !managerOptions.some((person) => person.id === form.principalUserId) ? <option value={form.principalUserId}>{form.managerName || 'Current manager'}</option> : null}
            {managerOptions.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
          <span className="text-xs text-[#60758b]">Select an active member of this branch. Add people through the Staff tab.</span>
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Branch Email</span>
          <Field type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Branch Phone</span>
          <Field value={form.phone} onChange={(event) => updateField('phone', event.target.value)} />
        </label>
        <p className="rounded-[14px] border border-[#e1e8f2] bg-[#fbfcfe] px-4 py-3 text-sm leading-6 text-[#60758b] sm:col-span-2">Trading status is managed separately in the confirmed Branch trading status section so active transactions cannot be orphaned.</p>
        </div>
      </div>
      {error ? <p className="mt-4 rounded-[12px] border border-[#f2d7d7] bg-[#fff6f6] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
      </fieldset>
      {saved ? <p role="status" className="mt-4 text-sm font-medium text-[#087b55]">Branch settings saved.</p> : null}
      <div className="mt-6 flex justify-end border-t border-[#e4ebf2] pt-4"><Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Branch'}</Button></div>
      </form>
    </section>
  )
}

export function BranchAgentInviteModal({
  open,
  branch,
  organisation,
  profile,
  commissionStructures = [],
  onCommissionStructureCreated,
  onClose,
  onSent,
}) {
  const defaultCommissionStructure = commissionStructures.find((structure) => structure?.isDefault) || null
  const [commissionSaving, setCommissionSaving] = useState(false)
  const branchAgentRoleOptions = useMemo(() => getBranchAgentRoleOptions(), [])
  const [form, setForm] = useState({
    firstName: '',
    surname: '',
    email: '',
    mobile: '',
    role: 'agent',
    commissionStructureId: '',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm({
      firstName: '',
      surname: '',
      email: '',
      mobile: '',
      role: 'agent',
      commissionStructureId: '',
      notes: '',
    })
    setError('')
  }, [open])

  function updateField(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (commissionSaving) return
    if (!normalizeText(form.firstName) || !normalizeText(form.surname) || !normalizeText(form.email) || !normalizeText(form.mobile)) {
      setError('First name, surname, email, and mobile number are required.')
      return
    }
    const selectedCommissionStructure =
      form.commissionStructureId === '__unassigned__' ? null :
      commissionStructures.find((structure) => structure.id === form.commissionStructureId) || defaultCommissionStructure

    try {
      setSubmitting(true)
      setError('')
      const resolvedWorkspaceRole = normalizeAgentInviteRole(form.role)
      const resolvedRoleLabel = formatRoleLabel(resolvedWorkspaceRole)
      const inviteResult = await createWorkspaceUserInvite({
        workspaceId: organisation?.id || branch?.organisationId,
        organisationName: organisation?.name || 'Arch9 Organisation',
        role: resolvedWorkspaceRole,
        roleLabel: resolvedRoleLabel,
        branchId: branch?.id,
        branchName: branch?.name || '',
        email: form.email,
        mobile: form.mobile,
        firstName: form.firstName,
        lastName: form.surname,
        commissionStructureId: selectedCommissionStructure?.id || '',
        commissionStructureName: selectedCommissionStructure?.name || '',
        notes: form.notes,
        invitedByName: profile?.fullName || profile?.name || profile?.email || '',
        source: 'branch_workspace_agent_invite',
        metadata: {
          access_purpose: 'existing_staff',
          branch_id: branch?.id || '',
        },
      })
      const invite = inviteResult.invite
      onSent?.(invite)
      onClose?.()
    } catch (inviteError) {
      setError(inviteError?.message || 'Unable to send agent invite.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title="Existing staff access"
      subtitle={`Invite an agent already working for ${branch?.name || 'this branch'}. New agents start in Recruitment.`}
      className="max-w-4xl"
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting || commissionSaving}>Cancel</Button>
          <Button type="submit" form="branch-agent-invite-form" disabled={submitting || commissionSaving}>{submitting ? 'Sending Invite...' : 'Send Invite'}</Button>
        </div>
      )}
    >
      <form id="branch-agent-invite-form" className="space-y-5" onSubmit={handleSubmit}>
        <section className="rounded-[16px] border border-[#e1e8f2] bg-[#fbfcfe] p-4">
          <p className="text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#7a8ca2]">Agent Details</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">First Name</span>
              <Field value={form.firstName} onChange={(event) => updateField('firstName', event.target.value)} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Surname</span>
              <Field value={form.surname} onChange={(event) => updateField('surname', event.target.value)} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Email Address</span>
              <Field type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Mobile Number</span>
              <Field value={form.mobile} onChange={(event) => updateField('mobile', event.target.value)} />
            </label>
          </div>
        </section>

        <section className="rounded-[16px] border border-[#e1e8f2] bg-[#fbfcfe] p-4">
          <p className="text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#7a8ca2]">Organisation Details</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Organisation</span>
              <Field value={organisation?.name || 'Arch9 Organisation'} disabled />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Branch</span>
              <Field value={branch?.name || 'Selected branch'} disabled />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Role / Permission</span>
              <Field as="select" value={form.role} onChange={(event) => updateField('role', event.target.value)}>
                {branchAgentRoleOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Field>
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Commission Structure (Optional)</span>
              <Field as="select" value={form.commissionStructureId} onChange={(event) => updateField('commissionStructureId', event.target.value)}>
                <option value="">{defaultCommissionStructure ? `Use agency default: ${defaultCommissionStructure.name}` : 'Assign later'}</option>
                {defaultCommissionStructure ? <option value="__unassigned__">Save agent without a commission structure</option> : null}
                {commissionStructures.map((structure) => (
                  <option key={structure.id} value={structure.id}>
                    {structure.name} ({formatPercent(structure.agentSplitPercentage)} agent / {formatPercent(structure.agencySplitPercentage)} agency)
                  </option>
                ))}
              </Field>
            </label>
          </div>
          {!commissionStructures.length ? (
            <div className="mt-3 rounded-[12px] border border-[#d8e4f0] bg-[#f5f9fd] px-3 py-2 text-sm text-[#48627f]">
              No commission structure is configured yet. You can invite this agent now and assign one later before creating a commissionable transaction.
            </div>
          ) : null}
          <InlineCommissionStructure disabled={submitting} onSavingChange={setCommissionSaving} onCreated={(structure) => {
            onCommissionStructureCreated?.(structure)
            updateField('commissionStructureId', structure.id)
          }} />
        </section>

        <section className="rounded-[16px] border border-[#e1e8f2] bg-[#fbfcfe] p-4">
          <p className="text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#7a8ca2]">Notes</p>
          <label className="mt-3 grid gap-1.5">
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Internal Notes (optional)</span>
            <Field as="textarea" value={form.notes} onChange={(event) => updateField('notes', event.target.value)} placeholder="Add context for this invite" />
          </label>
        </section>

        {error ? <p className="rounded-[12px] border border-[#f2d7d7] bg-[#fff6f6] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
      </form>
    </Modal>
  )
}

async function listPendingBranchInvites(branchId) {
  const safeBranchId = normalizeText(branchId)
  if (!safeBranchId || !isSupabaseConfigured || !supabase) return []

  const query = await supabase
    .from('invites')
    .select('id, token, invite_type, status, email, phone, target_workspace_id, target_branch_id, target_workspace_role, metadata, created_at, expires_at')
    .eq('target_branch_id', safeBranchId)
    .in('invite_type', ['branch_invite', 'workspace_invite'])
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (query.error) {
    const code = String(query.error.code || '').toUpperCase()
    const message = String(query.error.message || '').toLowerCase()
    if (code === '42P01' || message.includes('invites')) return []
    throw query.error
  }

  return (query.data || []).map((invite) => {
    const metadata = invite.metadata && typeof invite.metadata === 'object' ? invite.metadata : {}
    const firstName = normalizeText(metadata.first_name || metadata.firstName)
    const lastName = normalizeText(metadata.last_name || metadata.surname || metadata.lastName)
    const displayName = [firstName, lastName].filter(Boolean).join(' ') || normalizeText(invite.email) || 'Invited agent'
    return {
      id: invite.id,
      token: invite.token,
      raw: invite,
      name: displayName,
      role: formatRoleLabel(metadata.role || invite.target_workspace_role || 'agent'),
      listings: 0,
      transactions: 0,
      registered: 0,
      revenue: 0,
      conversionRate: 0,
      status: 'Invited',
      statusTone: 'invited',
      lastActive: invite.created_at,
      createdAt: invite.created_at,
      expiresAt: invite.expires_at,
      email: normalizeText(invite.email),
      phone: normalizeText(invite.phone || metadata.mobile),
      commissionStructureName: normalizeText(metadata.commission_structure_name),
      notes: normalizeText(metadata.notes),
      isPendingInvite: true,
    }
  })
}

function BranchInviteDetailModal({
  invite,
  branch,
  organisation,
  open,
  onClose,
  onResent,
}) {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const inviteLink = buildAgentInviteLink(invite?.token)
  const canResend = Boolean(invite?.isPendingInvite && invite?.email && inviteLink)

  useEffect(() => {
    if (!open) return
    setSaving(false)
    setMessage('')
    setError('')
  }, [open, invite?.id])

  async function handleCopyLink() {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setMessage('Invite link copied.')
      setError('')
    } catch {
      setError('Unable to copy the invite link from this browser.')
    }
  }

  async function handleResend() {
    if (saving || !canResend) return
    try {
      setSaving(true)
      setError('')
      setMessage('')
      await resendWorkspaceUserInvite({
        ...invite,
        organisationName: organisation?.name || invite?.organisationName || 'Arch9 Organisation',
      })
      setMessage(`Invite resent to ${invite.email}.`)
      onResent?.()
    } catch (resendError) {
      setError(resendError?.message || 'Unable to resend this invite.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title={invite?.isPendingInvite ? 'Agent Invite' : 'Agent'}
      subtitle={invite?.isPendingInvite ? 'Review or resend this branch invite.' : 'Open this agent workspace.'}
      className="max-w-2xl"
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Close</Button>
          {invite?.isPendingInvite ? (
            <Button type="button" onClick={handleResend} disabled={saving || !canResend}>
              {saving ? 'Resending...' : 'Resend Invite'}
            </Button>
          ) : null}
        </div>
      )}
    >
      <div className="space-y-4">
        <section className="rounded-[18px] border border-[#dfe8f1] bg-[#fbfdff] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Invitee</p>
              <h3 className="mt-1 text-lg font-semibold text-[#142132]">{invite?.name || 'Invited agent'}</h3>
              <p className="mt-1 text-sm text-[#60758b]">{invite?.role || 'Agent'} · {branch?.name || 'Branch'}</p>
            </div>
            <StatusPill tone={invite?.statusTone || 'invited'}>{invite?.status || 'Invited'}</StatusPill>
          </div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Email</p>
              <p className="mt-1 break-all font-medium text-[#223449]">{invite?.email || 'Not captured'}</p>
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Created</p>
              <p className="mt-1 font-medium text-[#223449]">{formatDateShort(invite?.createdAt || invite?.lastActive)}</p>
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Commission</p>
              <p className="mt-1 font-medium text-[#223449]">{invite?.commissionStructureName || 'Not assigned'}</p>
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Expires</p>
              <p className="mt-1 font-medium text-[#223449]">{formatDateShort(invite?.expiresAt)}</p>
            </div>
          </div>
        </section>

        {invite?.isPendingInvite ? (
          <section className="rounded-[18px] border border-[#dfe8f1] bg-white p-4">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Invite Link</p>
            <p className="mt-2 break-all rounded-[12px] border border-[#e2eaf3] bg-[#f8fbff] px-3 py-2 text-sm text-[#35546c]">
              {inviteLink || 'Invite link unavailable'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton icon={Copy} onClick={handleCopyLink} disabled={saving || !inviteLink}>Copy Link</ActionButton>
              <ActionButton icon={Mail} onClick={handleResend} disabled={saving || !canResend}>
                {saving ? 'Resending...' : 'Resend Email'}
              </ActionButton>
            </div>
          </section>
        ) : null}

        {invite?.isPendingInvite && !inviteLink ? <p role="alert" className="rounded-[12px] border border-[#f2d7d7] bg-[#fff6f6] px-3 py-2 text-sm text-[#b42318]">The invitation link is unavailable. Reload the branch before trying to copy or resend it.</p> : null}
        {message ? <p role="status" className="rounded-[12px] border border-[#cfe8d7] bg-[#f3fbf5] px-3 py-2 text-sm text-[#1d7d45]">{message}</p> : null}
        {error ? <p role="alert" className="rounded-[12px] border border-[#f2d7d7] bg-[#fff6f6] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
      </div>
    </Modal>
  )
}

export default function AgencyBranchWorkspacePage() {
  const { branchId = '', tab = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [branch, setBranch] = useState(null)
  const loadRequestRef = useRef(0)
  const [branchTransactions, setBranchTransactions] = useState([])
  const [branchListings, setBranchListings] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [pendingInvites, setPendingInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiveSaving, setArchiveSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [branchJoiningOpen, setBranchJoiningOpen] = useState(false)
  const [joiningRefresh, setJoiningRefresh] = useState(0)
  const [agentInviteOpen, setAgentInviteOpen] = useState(false)
  const [selectedAgentRow, setSelectedAgentRow] = useState(null)
  const [organisationContext, setOrganisationContext] = useState({ organisation: null, profile: null })
  const [commissionStructures, setCommissionStructures] = useState([])
  const [preferredPartners, setPreferredPartners] = useState([])
  const [financialMonths, setFinancialMonths] = useState(12)
  const period = BRANCH_REPORTING_PERIODS.some((item) => item.value === searchParams.get('period')) ? searchParams.get('period') : '30_days'
  const workspaceOverview = useMemo(() => buildBranchDashboard(branch || {}, { period, financialMonths }), [branch, period, financialMonths])
  const workspacePerformance = useMemo(() => buildBranchWorkspacePerformance(branch || {}, { period }), [branch, period])
  const activeTab = TABS.some((item) => item.key === tab) ? tab : 'overview'

  useEffect(() => {
    if (tab && !TABS.some((item) => item.key === tab)) {
      navigate(`/agency/branches/${branchId}`, { replace: true, state: location.state })
    }
  }, [branchId, location.state, navigate, tab])

  function navigateToTab(nextTab, updates = {}) {
    const nextSearch = new URLSearchParams(searchParams)
    ;['from', 'to'].forEach((key) => nextSearch.delete(key))
    Object.entries(updates).forEach(([key, value]) => {
      if (value == null || value === '') nextSearch.delete(key)
      else nextSearch.set(key, value)
    })
    navigate(
      {
        pathname: nextTab === 'overview' ? `/agency/branches/${branchId}` : `/agency/branches/${branchId}/${nextTab}`,
        search: nextSearch.toString() ? `?${nextSearch.toString()}` : '',
      },
      { state: location.state },
    )
  }

  function updateTabFilters(updates = {}) {
    const nextSearch = new URLSearchParams(searchParams)
    Object.entries(updates).forEach(([key, value]) => {
      if (value == null || value === '') nextSearch.delete(key)
      else nextSearch.set(key, value)
    })
    setSearchParams(nextSearch)
  }

  const loadWorkspace = useCallback(async ({ background = false } = {}) => {
    const request = ++loadRequestRef.current
    if (!background) setLoading(true)
    setError('')
    try {
      const branchRow = await getBranchDashboardData(branchId)
      if (request !== loadRequestRef.current) return
      setBranch(branchRow)
      setBranchTransactions(branchRow.transactions)
      setBranchListings(branchRow.listings)
      const agents = buildBranchDashboard(branchRow).agents
      setLeaderboard(agents.map((agent) => ({ ...agent, transactions: agent.deals, revenue: agent.commission })))

      const [settingsContext, structures, branchInvites, partners] = await Promise.all([
        fetchOrganisationSettings().catch(() => null),
        listOrganisationCommissionStructures().catch(() => []),
        listPendingBranchInvites(branchId).catch((inviteError) => {
          console.warn('[Branch Workspace] pending invites unavailable', inviteError)
          return []
        }),
        listOrganisationPreferredPartners().catch(() => []),
      ])
      if (request !== loadRequestRef.current) return
      setOrganisationContext({
        organisation: settingsContext?.organisation || null,
        profile: settingsContext?.profile || null,
        membershipRole: settingsContext?.membershipRole || '',
      })
      setCommissionStructures(Array.isArray(structures) ? structures.filter((structure) => structure?.isActive !== false) : [])
      setPendingInvites(branchInvites)
      setPreferredPartners(Array.isArray(partners) ? partners.filter((partner) => partner?.isActive !== false) : [])
    } catch (loadError) {
      if (request !== loadRequestRef.current) return
      setError(loadError?.message || 'Unable to load branch workspace right now.')
    } finally {
      if (request === loadRequestRef.current) setLoading(false)
    }
  }, [branchId])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  const activeDeals = useMemo(() => branchTransactions.filter((row) => isOpenBranchTransaction(row)).length, [branchTransactions])
  const branchName = branch?.name || 'Branch Workspace'
  const branchLocation = normalizeText(branch?.location) || [branch?.city, branch?.province].map(normalizeText).filter(Boolean).join(', ') || 'Location pending'
  const branchManager = normalizeText(branch?.managerName) || 'Not assigned'
  const activeSalesAgents = Number(branch?.kpis?.activeSalesAgents ?? branch?.kpis?.activeAgents ?? leaderboard.length ?? 0)
  const membershipRole = normalizeLower(organisationContext.membershipRole || organisationContext.profile?.role)
  const canViewFinancials = ['owner', 'principal'].includes(membershipRole)
  const canViewCompliance = ['owner', 'principal', 'branch_manager', 'compliance'].includes(membershipRole)
  const canManageBranch = ['owner', 'principal', 'branch_manager'].includes(membershipRole)
  const limitedJoining = membershipRole === 'branch_manager'
  const canManageRecruitment = ['owner','principal','admin','super_admin'].includes(membershipRole)
  const recruitmentOrganisationId = organisationContext.organisation?.id || branch?.organisationId || ''
  const startRecruitment = () => limitedJoining ? setBranchJoiningOpen(true) : navigateToRecruitment(navigate, { entryPoint: 'branch', organisationId: recruitmentOrganisationId, branchId, returnTo: `/agency/branches/${branchId}/staff` })
  const openBranchAgentInvite = useCallback(() => { setAgentInviteOpen(true) }, [])

  const handleBranchSaved = useCallback((updatedBranch) => {
    if (updatedBranch) {
      setBranch(updatedBranch)
    }
  }, [])

  const branchStaffRows = useMemo(() => {
    const performanceByKey = new Map()
    workspaceOverview.staff.forEach((agent) => {
      ;[agent.id, agent.membershipId, agent.email].map(normalizeLower).filter(Boolean).forEach((key) => performanceByKey.set(key, agent))
    })
    const members = Array.isArray(branch?.members) ? branch.members : []
    const memberRows = members.map((member) => {
      const performance = [member.id, member.user_id, member.email].map(normalizeLower).filter(Boolean).map((key) => performanceByKey.get(key)).find(Boolean) || {}
      const name = normalizeText([member.first_name, member.last_name].filter(Boolean).join(' ')) || normalizeText(member.name) || normalizeText(member.email) || 'Staff member'
      return {
        id: member.id || member.user_id || member.email,
        routeId: member.user_id || member.id || member.email,
        name,
        role: formatRoleLabel(member.role || member.workspace_role || 'staff'),
        listings: performance.listings ?? null,
        transactions: performance.transactions ?? null,
        revenue: performance.commission ?? null,
        revenueLabel: `Commission · ${workspaceOverview.range.label}`,
        status: member.status || 'Active',
        statusTone: normalizeLower(member.status) === 'invited' ? 'invited' : normalizeLower(member.status) === 'active' ? 'active' : 'slate',
        lastActive: member.last_active_at || member.updated_at || member.created_at,
        email: member.email || '',
        avatarUrl: member.avatar_url || member.profile_photo_url || member.photo_url || member.profile?.avatar_url || '',
        isPendingInvite: false,
      }
    })
    const memberEmails = new Set(memberRows.map((member) => normalizeLower(member.email)).filter(Boolean))
    const invites = pendingInvites.filter((invite) => !memberEmails.has(normalizeLower(invite.email))).map((invite) => ({
      ...invite,
      id: invite.id || invite.email,
      name: invite.name || invite.email || 'Pending invitation',
      role: formatRoleLabel(invite.role || 'agent'),
      listings: null,
      transactions: null,
      revenue: null,
      status: 'Invited',
      statusTone: 'invited',
      lastActive: invite.createdAt || invite.lastActive,
      email: invite.email || '',
      avatarUrl: '',
      isPendingInvite: true,
    }))
    return [...invites, ...memberRows]
  }, [branch?.members, workspaceOverview, pendingInvites])

  const branchLeads = useMemo(() => Array.isArray(branch?.leads) ? branch.leads : [], [branch?.leads])
  const staffSearch = normalizeLower(searchParams.get('staffSearch'))
  const staffRole = normalizeLower(searchParams.get('staffRole') || (searchParams.get('filter') === 'agents' ? 'agent' : ''))
  const staffStatus = normalizeLower(searchParams.get('staffStatus'))
  const listingSearch = normalizeLower(searchParams.get('listingSearch'))
  const listingStatus = normalizeLower(searchParams.get('listingStatus') || (searchParams.get('filter') === 'active' ? 'active' : ''))
  const listingAttention = normalizeLower(searchParams.get('attention')) === 'unassigned_listings'
  const leadSearch = normalizeLower(searchParams.get('leadSearch'))
  const leadStage = normalizeLower(searchParams.get('leadStage') || searchParams.get('stage'))
  const leadAttention = normalizeLower(searchParams.get('attention')) === 'unassigned_leads'

  const filteredStaffRows = useMemo(() => branchStaffRows.filter((agent) => {
    const haystack = normalizeLower(`${agent.name} ${agent.email} ${agent.role}`)
    return (!staffSearch || haystack.includes(staffSearch))
      && (!staffRole || normalizeLower(agent.role).includes(staffRole))
      && (!staffStatus || normalizeLower(agent.status) === staffStatus)
  }), [branchStaffRows, staffRole, staffSearch, staffStatus])

  const leadAgentNames = useMemo(() => new Map(
    branchStaffRows.flatMap((agent) => [
      [normalizeText(agent.routeId || agent.id), agent.name],
      [normalizeLower(agent.email), agent.name],
    ]).filter(([key]) => key),
  ), [branchStaffRows])

  const getLeadAssignedAgent = useCallback((lead) => {
    const assignedId = normalizeText(lead?.assigned_agent_id || lead?.assignedAgentId)
    const assignedEmail = normalizeLower(lead?.assigned_agent_email || lead?.assignedAgentEmail)
    return normalizeText(lead?.assigned_agent_name || lead?.assignedAgentName) || leadAgentNames.get(assignedId) || leadAgentNames.get(assignedEmail) || assignedId || 'Unassigned'
  }, [leadAgentNames])

  const getListingAssignedAgent = useCallback((listing) => {
    const assignedId = normalizeText(listing?.assigned_agent_id || listing?.assignedAgentId)
    const assignedEmail = normalizeLower(listing?.assigned_agent_email || listing?.assignedAgentEmail)
    return normalizeText(listing?.assigned_agent_name || listing?.assignedAgentName) || leadAgentNames.get(assignedId) || leadAgentNames.get(assignedEmail) || assignedId || 'Unassigned'
  }, [leadAgentNames])

  const filteredListings = useMemo(() => branchListings.filter((listing) => {
    const status = normalizeLower(listing.listing_status || listing.stage || 'active')
    const haystack = normalizeLower(`${listing.listing_title || listing.title || ''} ${listing.assigned_agent_name || listing.assigned_agent_email || ''}`)
    return (!listingSearch || haystack.includes(listingSearch))
      && (!listingStatus || status.includes(listingStatus))
      && (!listingAttention || !normalizeText(listing.assigned_agent_id || listing.assigned_agent_email))
  }), [branchListings, listingAttention, listingSearch, listingStatus])

  const filteredLeads = useMemo(() => branchLeads.filter((lead) => {
    const stage = normalizeLower(lead.stage || lead.status)
    const haystack = normalizeLower(`${lead.lead_id || ''} ${lead.name || lead.full_name || ''} ${lead.phone || ''} ${lead.email || ''} ${lead.enquired_property_title || lead.seller_property_address || lead.property_interest || ''} ${lead.lead_source || ''} ${lead.lead_category || ''} ${lead.assigned_agent_id || ''} ${lead.status || ''} ${lead.stage || ''}`)
    return (!leadSearch || haystack.includes(leadSearch))
      && (!leadStage || stage.includes(leadStage))
      && (!leadAttention || !normalizeText(lead.assigned_agent_id))
  }), [branchLeads, leadAttention, leadSearch, leadStage])

  const branchTransactionRows = useMemo(() => branchTransactions.map((transaction) => ({
    transaction: {
      ...transaction,
      id: transaction.id,
      transaction_reference: transaction.transaction_reference || transaction.reference || transaction.id,
      current_main_stage: transaction.current_main_stage || transaction.main_stage || '',
      property_address_line_1: transaction.property_address_line_1 || transaction.property_address || transaction.listing_title || '',
      property_description: transaction.property_description || transaction.listing_title || '',
    },
    buyer: {
      name: transaction.buyer_name || transaction.buyer_full_name || transaction.client_name || '',
      email: transaction.buyer_email || transaction.client_email || '',
      phone: transaction.buyer_phone || transaction.client_phone || '',
    },
    development: transaction.development || null,
    unit: transaction.unit || null,
    stage: transaction.stage || transaction.lifecycle_state || '',
    mainStage: transaction.current_main_stage || transaction.main_stage || '',
  })), [branchTransactions])

  function handleAgentRowClick(agent) {
    if (!agent) return
    if (agent.isPendingInvite) {
      setSelectedAgentRow(agent)
      return
    }
    const routeId = normalizeText(agent.routeId || agent.id)
    if (routeId) {
      navigate(`/agency/agents/${encodeURIComponent(routeId)}`, { state: { returnTo: `${location.pathname}${location.search}` } })
    }
  }

  if (loading || branch && branch.id !== branchId) return <BranchOverviewSkeleton />

  if (error) {
    return <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">{error}</p>
  }

  return (
    <section className="flex flex-col gap-4">
      {actionError ? <p role="alert" className="text-sm text-red-700">{actionError}</p> : null}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm font-medium text-[#60758d]">
        <button type="button" onClick={() => navigate('/agency')} className="transition hover:text-[#163247]">Organisation</button>
        <span aria-hidden="true">/</span>
        <button type="button" onClick={() => navigate(location.state?.returnTo || '/agency/branches')} className="transition hover:text-[#163247]">Branches</button>
        <span aria-hidden="true">/</span>
        <span className="truncate font-semibold text-[#142132]" aria-current="page">{branchName}</span>
      </nav>
      <header className="relative min-h-[240px] sm:min-h-[260px] overflow-hidden rounded-2xl bg-[#123d36]">
        <BranchCoverImage src={branch?.coverImageUrl} name={branchName} position="absolute" className="inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#071d2c]/85 via-[#071d2c]/45 to-[#071d2c]/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#071d2c]/65 to-transparent" />
        <div className="relative flex min-h-[240px] sm:min-h-[260px] flex-col justify-between gap-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">

            {(canManageBranch || canManageRecruitment) ? <div className="ml-auto flex flex-wrap gap-2">{(canManageRecruitment || limitedJoining) && <button type="button" disabled={!recruitmentOrganisationId} onClick={startRecruitment} className="rounded-lg border border-white/50 bg-white/95 px-3.5 py-2.5 text-sm font-semibold text-[#163247]">Invite new agent</button>}{canManageBranch && <button type="button" onClick={openBranchAgentInvite} className="inline-flex items-center gap-2 rounded-lg border border-white/50 bg-white/95 px-3.5 py-2.5 text-sm font-semibold text-[#163247]"><UserPlus size={16} />Existing staff access</button>}{canManageBranch && <button type="button" onClick={() => navigateToTab('settings')} className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-[#087b55] px-3.5 py-2.5 text-sm font-semibold text-white"><Settings size={16} />Edit Branch</button>}</div> : null}
          </div>
          <div className="min-w-0 text-white">
            <h1 className="text-3xl font-medium leading-tight tracking-[-0.025em] text-white sm:text-[2.25rem]">{branchName}{branch?.city && !branchName.toLowerCase().includes(branch.city.toLowerCase()) ? ` — ${branch.city}` : ''}</h1>
            <p className="mt-1 text-base font-medium text-white/95">{branchLocation}</p>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-white/85"><span>Branch Manager: {branchManager}</span><span>· {activeSalesAgents} agents</span><span>· {workspaceOverview.portfolio.active ?? '—'} active listings</span>{branch?.isActive === false ? <span>· Suspended</span> : null}</p>
          </div>
        </div>
      </header>

      <nav className="min-w-0 max-w-full overflow-x-auto rounded-2xl border border-[#dde6f1] bg-white p-2 shadow-sm" aria-label="Branch workspace sections">
        <div className="flex min-w-max items-center gap-1 lg:min-w-full" role="tablist">
          {TABS.map((tabItem) => {
            const Icon = tabItem.icon
            return <button
              key={tabItem.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tabItem.key}
              onClick={() => navigateToTab(tabItem.key)}
              className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-sm font-semibold transition lg:flex-1 ${
                activeTab === tabItem.key
                  ? 'bg-[#087b55] text-white shadow-sm'
                  : 'text-[#405870] hover:bg-[#f6f9fc] hover:text-[#10243a]'
              }`}
            >
              <Icon size={15} />
              {tabItem.label}
            </button>
          })}
        </div>
      </nav>

      <section>
        {activeTab === 'overview' ? <BranchExecutiveOverview data={workspaceOverview} financialMonths={financialMonths} onFinancialMonthsChange={setFinancialMonths} canViewFinancials={canViewFinancials} onViewAgents={() => navigateToTab('performance')} onOpenAgent={(agent) => handleAgentRowClick({ ...agent, routeId: agent.id })} /> : null}

        {activeTab === 'staff' ? (
          <section className="space-y-4">
            <p className="text-sm text-[#60758b]">Current listings include sales, rentals and drafts. In progress shows open transactions. Commission follows the selected reporting period.</p>
            <div className="rounded-[16px] border border-[#e4ebf2] bg-white/90 p-2.5 shadow-[0_10px_26px_rgba(24,45,68,0.045)] backdrop-blur">
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                <label className="flex min-h-[38px] min-w-0 flex-1 items-center gap-2.5 rounded-[12px] border border-[#dbe6f1] bg-[#f8fbfe] px-3 focus-within:border-[#9db7cf] focus-within:bg-white"><Search size={16} className="shrink-0 text-[#7f92a6]" /><input value={searchParams.get('staffSearch') || ''} onChange={(event) => updateTabFilters({ staffSearch: event.target.value })} placeholder="Search staff" className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium text-[#162334] outline-none placeholder:text-[#97a7b8]" /></label>
                <select value={searchParams.get('staffRole') || (searchParams.get('filter') === 'agents' ? 'agent' : '')} onChange={(event) => updateTabFilters({ staffRole: event.target.value, filter: '' })} className="min-h-[38px] rounded-[12px] border border-[#dbe6f1] bg-white px-3 text-[0.82rem] font-semibold text-[#2b4056]"><option value="">All roles</option><option value="agent">Agents</option><option value="principal">Principals</option><option value="admin">Administrators</option></select>
                <select value={searchParams.get('staffStatus') || ''} onChange={(event) => updateTabFilters({ staffStatus: event.target.value })} className="min-h-[38px] rounded-[12px] border border-[#dbe6f1] bg-white px-3 text-[0.82rem] font-semibold text-[#2b4056]"><option value="">All statuses</option><option value="active">Active</option><option value="invited">Invited</option><option value="inactive">Inactive</option></select>
              </div>
            </div>
            {branchJoiningOpen && limitedJoining && <RecruitmentJoiningDialog key={`${recruitmentOrganisationId}/${branchId}`} limitedBranch receipt organisationId={recruitmentOrganisationId} context={{entryPoint:'branch',branchId}} onClose={() => setBranchJoiningOpen(false)} onCreate={async (draft) => { const result=await captureBranchRecruitmentLead(recruitmentOrganisationId,branchId,draft); setJoiningRefresh((value) => value+1); return result }} />}
            {(canManageRecruitment || limitedJoining) && <RecruitmentJoiningList limitedBranch={limitedJoining} refresh={joiningRefresh} organisationId={recruitmentOrganisationId} branchId={branchId} search={searchParams.get('staffSearch') || ''} returnTo={`/agency/branches/${branchId}/staff`} />}
            {filteredStaffRows.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredStaffRows.map((agent) => <StaffRosterCard key={agent.isPendingInvite ? `invite-${agent.id}` : `agent-${agent.id}`} agent={agent} canViewFinancials={canViewFinancials} onOpen={() => handleAgentRowClick(agent)} />)}</div>
            ) : <EmptyState title="No staff match these filters" copy="Try clearing a filter or invite a member to this branch." icon={Users} action={canManageBranch ? <ActionButton icon={UserPlus} onClick={openBranchAgentInvite}>Existing staff access</ActionButton> : null} />}
          </section>
        ) : null}

        {activeTab === 'listings' ? (
          <section className="space-y-4">
            <div className="rounded-[16px] border border-[#e4ebf2] bg-white/90 p-2.5 shadow-[0_10px_26px_rgba(24,45,68,0.045)] backdrop-blur">
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                <label className="flex min-h-[38px] min-w-0 flex-1 items-center gap-2.5 rounded-[12px] border border-[#dbe6f1] bg-[#f8fbfe] px-3 focus-within:border-[#9db7cf] focus-within:bg-white"><Search size={16} className="shrink-0 text-[#7f92a6]" /><input value={searchParams.get('listingSearch') || ''} onChange={(event) => updateTabFilters({ listingSearch: event.target.value })} placeholder="Search listings" className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium text-[#162334] outline-none placeholder:text-[#97a7b8]" /></label>
                <select value={searchParams.get('listingStatus') || (searchParams.get('filter') === 'active' ? 'active' : '')} onChange={(event) => updateTabFilters({ listingStatus: event.target.value, filter: '' })} className="min-h-[38px] rounded-[12px] border border-[#dbe6f1] bg-white px-3 text-[0.82rem] font-semibold text-[#2b4056]"><option value="">All statuses</option><option value="active">Active</option><option value="offer">Under offer</option><option value="sold">Sold</option><option value="withdrawn">Withdrawn</option></select>
              </div>
            </div>
            {filteredListings.length ? <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{filteredListings.map((listing) => <BranchListingCard key={listing.id} listing={listing} canViewFinancials={canViewFinancials} assignedAgentName={getListingAssignedAgent} onOpen={() => navigate(`/agent/listings/${encodeURIComponent(listing.id)}`, { state: { returnTo: `${location.pathname}${location.search}` } })} />)}</div> : <EmptyState title="No listings match these filters" copy="This branch has no visible listings for the selected filters." icon={Building2} />}
          </section>
        ) : null}

        {activeTab === 'transactions' ? (
          <AgentTransactionsTable rows={branchTransactionRows} title="Transactions" description="Manage the active deals and transaction progress assigned to this branch." isPrincipalView compactLayout searchValue={searchParams.get('transactionSearch') || ''} onSearchChange={(value) => updateTabFilters({ transactionSearch: value })} onRowClick={(row) => navigate(`/transactions/${encodeURIComponent(row.transaction.id)}`, { state: { returnTo: `${location.pathname}${location.search}` } })} />
        ) : null}

        {activeTab === 'leads' ? (
          <section className="space-y-4">
            <div className="rounded-[16px] border border-[#e4ebf2] bg-white/90 p-2.5 shadow-[0_10px_26px_rgba(24,45,68,0.045)] backdrop-blur">
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                <label className="flex min-h-[38px] min-w-0 flex-1 items-center gap-2.5 rounded-[12px] border border-[#dbe6f1] bg-[#f8fbfe] px-3 focus-within:border-[#9db7cf] focus-within:bg-white"><Search size={16} className="shrink-0 text-[#7f92a6]" /><input value={searchParams.get('leadSearch') || ''} onChange={(event) => updateTabFilters({ leadSearch: event.target.value })} placeholder="Search leads, clients, listings..." className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium text-[#162334] outline-none placeholder:text-[#97a7b8]" /></label>
                <select value={searchParams.get('leadStage') || searchParams.get('stage') || ''} onChange={(event) => updateTabFilters({ leadStage: event.target.value, stage: '' })} className="min-h-[38px] rounded-[12px] border border-[#dbe6f1] bg-white px-3 text-[0.82rem] font-semibold text-[#2b4056]"><option value="">All stages</option><option value="new">New</option><option value="qualified">Qualified</option><option value="view">Viewings</option></select>
              </div>
            </div>
            <BranchLeadsTable leads={filteredLeads} listings={branch?.listings || []} canViewFinancials={canViewFinancials} assignedAgentName={getLeadAssignedAgent} onOpenLead={(leadId) => navigate(`/pipeline/leads/${encodeURIComponent(leadId)}`, { state: { returnTo: `${location.pathname}${location.search}` } })} />
          </section>
        ) : null}

        {activeTab === 'performance' ? (
          <section className="space-y-5">
            <section className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_28px_rgba(24,45,68,0.05)] sm:p-6">
              <SectionTitle eyebrow="Performance" title="Branch operating trends" copy="Listings, transactions, and registrations are grouped across the selected period." />
              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                {Object.entries(workspacePerformance?.trends || {}).map(([key, values]) => {
                  const label = key === 'transactions' ? 'Transactions opened' : key === 'registrations' ? 'Registrations completed' : 'Listings created'
                  const peak = Math.max(...values, 1)
                  return <article key={key} className="rounded-[18px] border border-[#e3edf5] bg-[#fbfdff] p-4"><p className="text-sm font-semibold text-[#142132]">{label}</p><div className="mt-5 flex h-24 items-end gap-1.5" aria-label={`${label} trend`}>{values.map((value, index) => <span key={index} className="min-w-0 flex-1 rounded-t-sm bg-[#08784b]" style={{ height: `${Math.max(value ? 12 : 4, Math.round(value / peak * 100))}%`, opacity: 0.45 + index / 20 }} />)}</div><p className="mt-3 text-xs text-[#71849a]">{values.reduce((total, value) => total + value, 0)} events in this period</p></article>
                })}
              </div>
            </section>

            <BranchTopPerformers agents={workspacePerformance?.agentPerformance || []} canViewFinancials={canViewFinancials} onOpenAgent={handleAgentRowClick} />

            <section className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_28px_rgba(24,45,68,0.05)] sm:p-6">
              <SectionTitle eyebrow="Conversion funnel" title="From enquiry to registration" copy="Each stage follows the canonical lead and transaction lifecycle values already recorded for this branch." />
              <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {(workspacePerformance?.funnel || []).map((stage) => {
                  const tab = ['leads', 'qualified', 'viewings'].includes(stage.key) ? 'leads' : 'transactions'
                  const filter = stage.key === 'leads' ? {} : { stage: stage.key === 'transactions' ? 'active' : stage.key }
                  return <button key={stage.key} type="button" onClick={() => navigateToTab(tab, filter)} className="rounded-[16px] border border-[#e1eaf3] bg-[#fbfdff] p-4 text-left transition hover:border-[#9ecbb7] hover:bg-white"><p className="text-sm font-semibold text-[#405b75]">{stage.label}</p><div className="mt-2 flex items-end justify-between gap-3"><strong className="text-2xl tracking-[-0.04em] text-[#142132]">{stage.count ?? '—'}</strong><span className="text-xs font-semibold text-[#08784b]">{stage.rate == null ? 'Starting point' : `${stage.rate}% through`}</span></div></button>
                })}
              </div>
            </section>

            <section className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_28px_rgba(24,45,68,0.05)] sm:p-6">
              <SectionTitle eyebrow="Agent comparison" title="Production by agent" copy="Counts reflect branch records created or updated during the selected period." />
              {(workspacePerformance?.agentPerformance || []).length ? <div className="mt-5"><SimpleTable columns={['Agent', 'Active listings', 'Registered deals', canViewFinancials ? 'Agent commission' : null].filter(Boolean)} rows={workspacePerformance.agentPerformance.map((agent) => [agent.name, agent.listings ?? '—', agent.transactions ?? '—', ...(canViewFinancials ? [agent.commission == null ? '—' : formatCurrency(agent.commission)] : [])])} /></div> : <div className="mt-5"><EmptyState title="No agent performance for this period" copy="Performance will appear when branch agents own listings or transactions in the selected date range." icon={Users} /></div>}
            </section>

            {canViewFinancials ? <section className="grid gap-3 sm:grid-cols-2"><KpiCard label="Projected commission" value={workspacePerformance?.financials?.projectedCommission == null ? '—' : formatCurrency(workspacePerformance.financials.projectedCommission)} helper="Active transactions" icon={Banknote} tone="green" /><KpiCard label="Registered commission" value={workspacePerformance?.financials?.registeredCommission == null ? '—' : formatCurrency(workspacePerformance.financials.registeredCommission)} helper="Registered during the selected period" icon={Banknote} tone="blue" /></section> : <p className="rounded-[16px] border border-[#dfe8f1] bg-[#fbfdff] px-4 py-3 text-sm text-[#60758b]">Financial performance is restricted to roles with commission visibility.</p>}
          </section>
        ) : null}

        {activeTab === 'compliance' ? <BranchFicTraining key={branch.id} branch={branch} userId={organisationContext.profile?.id} canManage={canViewCompliance} canPublish={['owner', 'principal'].includes(membershipRole)} /> : null}

        {activeTab === 'settings' ? (
          canManageBranch ? <section className="space-y-5">
            <BranchSettingsForm branch={branch} onSaved={handleBranchSaved} />

            <section className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_28px_rgba(24,45,68,0.05)] sm:p-6">
              <SectionTitle eyebrow="Connections and partners" title="Organisation services available to this branch" copy="Connections remain organisation-managed; this branch view shows only the available configuration, not credentials." />
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <article className="rounded-[18px] border border-[#e4ebf4] bg-[#fbfdff] p-5"><p className="text-sm font-semibold text-[#1f3348]">Portal and lead channels</p><p className="mt-2 text-sm leading-6 text-[#6b7d93]">Property portals, website forms, social channels, WhatsApp, and email are configured at organisation level. Branch routing is applied only where a saved rule exists.</p></article>
                <article className="rounded-[18px] border border-[#e4ebf4] bg-[#fbfdff] p-5"><p className="text-sm font-semibold text-[#1f3348]">Preferred transaction partners</p><p className="mt-2 text-sm leading-6 text-[#6b7d93]">{preferredPartners.length ? preferredPartners.slice(0, 3).map((partner) => partner.companyName || partner.name || partner.partnerType).filter(Boolean).join(', ') : 'No active preferred partners are configured.'}</p></article>
              </div>
            </section>

            <section className="rounded-[22px] border border-[#f0d8d4] bg-[#fffafa] p-5 shadow-[0_12px_28px_rgba(24,45,68,0.04)] sm:p-6">
              <SectionTitle eyebrow="Danger zone" title="Branch trading status" copy={branch?.isActive === false ? 'This branch is inactive. Reactivation restores it to normal branch lists.' : activeDeals ? `${activeDeals} active transaction${activeDeals === 1 ? '' : 's'} must be resolved or reassigned before this branch can be archived.` : 'Archiving keeps historical records but removes this branch from active operations.'} />
              <div className="mt-5"><ActionButton variant="danger" onClick={() => setArchiveOpen(true)}>{branch?.isActive === false ? 'Reactivate branch' : 'Archive branch'}</ActionButton></div>
            </section>
          </section> : <EmptyState title="Branch settings are restricted" copy="Only authorised owners, principals, and branch managers can change branch administration settings." icon={Settings} />
        ) : null}
      </section>
      <ConfirmDialog open={archiveOpen} title={branch?.isActive === false ? 'Reactivate branch?' : 'Archive branch?'}
        description={branch?.isActive === false ? 'This restores the branch to active operations. Existing records remain unchanged.' : activeDeals ? 'This branch has active transactions and cannot be archived until they are resolved or reassigned.' : 'This archives the branch without deleting its historical staff or transactions. You can reactivate it later.'}
        confirming={archiveSaving} onCancel={() => setArchiveOpen(false)} onConfirm={async () => {
          setArchiveSaving(true)
          setActionError('')
          try {
            if (branch?.isActive !== false && activeDeals > 0) {
              throw new Error('Resolve or reassign active transactions before archiving this branch.')
            }
            const updated = await updateBranch(branchId, { isActive: branch?.isActive === false })
            setBranch(updated)
            setArchiveOpen(false)
          } catch (saveError) { setActionError(saveError.message || 'Unable to change branch status.') }
          finally { setArchiveSaving(false) }
        }} />
      <BranchInviteDetailModal
        open={Boolean(selectedAgentRow)}
        invite={selectedAgentRow}
        branch={branch}
        organisation={organisationContext.organisation}
        onClose={() => setSelectedAgentRow(null)}
        onResent={() => void loadWorkspace({ background: true })}
      />
      <BranchAgentInviteModal
        open={agentInviteOpen}
        branch={branch}
        organisation={organisationContext.organisation}
        profile={organisationContext.profile}
        commissionStructures={commissionStructures}
        onCommissionStructureCreated={(structure) => setCommissionStructures((previous) => [...previous.filter((item) => item.id !== structure.id), structure])}
        onClose={() => setAgentInviteOpen(false)}
        onSent={() => {
          setAgentInviteOpen(false)
          navigateToTab('staff')
          void loadWorkspace()
        }}
      />
    </section>
  )
}
