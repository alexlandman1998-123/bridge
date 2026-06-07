/* eslint-disable react-refresh/only-export-components */
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Building2,
  DollarSign,
  Download,
  Eye,
  Clock3,
  Medal,
  Pencil,
  FileText,
  Network,
  Plus,
  RefreshCw,
  Route,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import BondEmptyState from '../../components/bond/BondEmptyState'
import BondPageShell from '../../components/bond/BondPageShell'
import BondSectionCard from '../../components/bond/BondSectionCard'
import BondTransactionStatusBadge from '../../components/bond/BondTransactionStatusBadge'
import BondViewTabs from '../../components/bond/BondViewTabs'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  assignBondRegionManager,
  assignBondBranchManager,
  assignConsultantToBranch,
  createBondBranch,
  createBondConsultant,
  createBondRegion,
  getBondBranchWorkspaceRoute,
  getBondConsultantWorkspaceRoute,
  getBondRegionWorkspaceRoute,
  getBondOrganisationRouteForTab,
  getBondOrganisationSnapshot,
  deactivateConsultant,
  moveBondBranchToRegion,
  reassignApplications,
  updateBondBranch,
  updateBondConsultant,
  updateBondRegion,
} from '../../services/bondOrganisationService'
import {
  createBondPartner,
  getBondPartnerWorkspaceRoute,
  inviteBondPartner,
  resendBondPartnerInvite,
  setPartnerRoutingDefaults,
  updateBondPartner,
} from '../../services/bondPartnerManagementService'
import {
  createRoutingRule,
  disableRoutingRule,
  updateRoutingRule,
} from '../../services/bondRoutingRulesService'
import { buildRegionalCommandCentreViewModel } from '../../modules/bond/utils/regionalCommandCentreViewModel'

const FALLBACK_ORGANISATION_TABS = Object.freeze([
  { key: 'overview', label: 'Overview' },
  { key: 'regions', label: 'Regions' },
  { key: 'branches', label: 'Branches' },
  { key: 'consultants', label: 'Consultants' },
  { key: 'partners', label: 'Partners' },
  { key: 'routing-rules', label: 'Routing Rules' },
])

const VALID_ORGANISATION_VIEWS = Object.freeze([
  'overview',
  'regions',
  'branches',
  'consultants',
  'applications',
  'partners',
  'routing-rules',
  'permissions',
  'settings',
])

const DEFAULT_BOND_ORGANISATION_SERVICE = Object.freeze({
  getBondOrganisationSnapshot,
  createBondRegion,
  updateBondRegion,
  assignBondRegionManager,
  createBondBranch,
  updateBondBranch,
  assignBondBranchManager,
  moveBondBranchToRegion,
  createBondConsultant,
  updateBondConsultant,
  assignConsultantToBranch,
  reassignApplications,
  deactivateConsultant,
  createRoutingRule,
  updateRoutingRule,
  disableRoutingRule,
  createBondPartner,
  updateBondPartner,
  inviteBondPartner,
  resendBondPartnerInvite,
  setPartnerRoutingDefaults,
})

const ORGANISATION_SNAPSHOT_CACHE_TTL_MS = 90 * 1000
const organisationSnapshotCache = new Map()

function getOrganisationSnapshotCacheKey(workspaceId = '') {
  return normalizeText(workspaceId) || 'default'
}

function getCachedOrganisationSnapshot(workspaceId = '') {
  const key = getOrganisationSnapshotCacheKey(workspaceId)
  const entry = organisationSnapshotCache.get(key)
  if (!entry || entry.expiresAt <= Date.now()) {
    organisationSnapshotCache.delete(key)
    return null
  }
  return entry.snapshot
}

function setCachedOrganisationSnapshot(workspaceId = '', snapshot = null) {
  if (!snapshot) return
  organisationSnapshotCache.set(getOrganisationSnapshotCacheKey(workspaceId), {
    snapshot,
    expiresAt: Date.now() + ORGANISATION_SNAPSHOT_CACHE_TTL_MS,
  })
}

function clearCachedOrganisationSnapshot(workspaceId = '') {
  organisationSnapshotCache.delete(getOrganisationSnapshotCacheKey(workspaceId))
}

const REGION_MANAGER_UI_ROLES = new Set(['regional_manager', 'hq_manager', 'manager', 'director', 'owner'])
const BRANCH_MANAGER_UI_ROLES = new Set(['branch_manager', 'team_lead', 'regional_manager', 'hq_manager', 'manager', 'director', 'owner'])
const CONSULTANT_ROLE_OPTIONS = Object.freeze([
  { value: 'consultant', label: 'Consultant' },
  { value: 'bond_originator', label: 'Bond Originator' },
  { value: 'processor', label: 'Processor' },
  { value: 'admin_staff', label: 'Admin Staff' },
])
const PARTNER_TYPE_OPTIONS = Object.freeze([
  { value: 'agency', label: 'Agency' },
  { value: 'development', label: 'Development' },
  { value: 'referral_partner', label: 'Referral Partner' },
  { value: 'developer', label: 'Developer' },
  { value: 'attorney', label: 'Attorney' },
  { value: 'internal_source', label: 'Internal Source' },
])
const PARTNER_STATUS_OPTIONS = Object.freeze([
  { value: 'draft', label: 'Draft' },
  { value: 'invited', label: 'Invited' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'disabled', label: 'Disabled' },
])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function toRouteSlug(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function resolveWorkspaceId(workspaceContext = {}) {
  return normalizeText(
    workspaceContext.workspaceId ||
      workspaceContext.currentWorkspace?.id ||
      workspaceContext.workspace?.id ||
      workspaceContext.currentMembership?.workspaceId ||
      workspaceContext.currentMembership?.organisation_id ||
      workspaceContext.currentMembership?.organisationId,
  )
}

function formatApplicationReference(row = {}) {
  const raw = normalizeText(row.applicationReference || row.transactionReference || row.transactionId || row.key)
  if (!raw) return 'APP'
  if (/^app-/i.test(raw)) return raw.toUpperCase()
  const numeric = raw.match(/\d+$/)?.[0]
  return numeric ? `APP-${numeric}` : `APP-${raw}`.toUpperCase()
}

function formatLeadTime(value) {
  const number = Number(value || 0)
  if (!number) return 'Tracking'
  return `${Number.isInteger(number) ? number : number.toFixed(1)} days`
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-ZA').format(Number(value || 0))
}

function formatNullablePercent(value) {
  if (value === null || value === undefined || value === '') return 'Not enough data'
  return `${Math.round(Number(value || 0))}%`
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0)
}

function formatCompactCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount)) return 'R0'
  if (Math.abs(amount) >= 1000000000) return `R ${(amount / 1000000000).toFixed(amount >= 10000000000 ? 0 : 1)}bn`
  if (Math.abs(amount) >= 1000000) return `R ${(amount / 1000000).toFixed(amount >= 10000000 ? 0 : 1)}m`
  if (Math.abs(amount) >= 1000) return `R ${(amount / 1000).toFixed(amount >= 100000 ? 0 : 1)}k`
  return formatCurrency(amount)
}

function formatNullableCurrency(value) {
  if (value === null || value === undefined || value === '') return 'Not configured'
  return formatCurrency(value)
}

function scopeCanManage(snapshot = {}) {
  return Boolean(snapshot?.visibleScope?.canManageOrganisation)
}

function isHqOrganisationScope(snapshot = {}) {
  const scopeLevel = normalizeText(snapshot?.organisationScope?.scopeLevel || snapshot?.visibleScope?.scopeLevel)
  const permissionScopeLevel = normalizeText(snapshot?.organisationScope?.permissionScopeLevel)
  return scopeLevel === 'hq' || scopeLevel === 'workspace_hq' || permissionScopeLevel === 'workspace_hq'
}

export function resolveRouteView(location) {
  if (location.pathname.endsWith('/applications')) return 'applications'
  const params = new URLSearchParams(location.search)
  const requestedView = normalizeText(params.get('view') || params.get('tab') || 'overview')
  return VALID_ORGANISATION_VIEWS.includes(requestedView) ? requestedView : 'overview'
}

export function canAccessOrganisationView(view = 'overview', snapshot = null) {
  if (!snapshot) return false
  if (view === 'overview') return snapshot?.organisationScope?.scopeLevel !== 'consultant'
  if (view === 'applications') return true
  if (view === 'regions') return Boolean(snapshot?.capabilities?.canViewRegions)
  if (view === 'branches') return Boolean(snapshot?.capabilities?.canViewBranches)
  if (view === 'consultants') return Boolean(snapshot?.capabilities?.canViewConsultants)
  if (view === 'partners') return Boolean(snapshot?.capabilities?.canViewPartners)
  if (view === 'routing-rules') return Boolean(snapshot?.capabilities?.canViewRoutingRules)
  if (view === 'permissions') return Boolean(snapshot?.capabilities?.canSetUpStructure)
  if (view === 'settings') return isHqOrganisationScope(snapshot) && Boolean(snapshot?.capabilities?.canSetUpStructure)
  return false
}

function getUnavailableStateCopy(view = 'overview') {
  if (view === 'regions') {
    return {
      title: 'Organisation access required',
      description: 'Your current workspace scope does not include region management access.',
    }
  }
  if (view === 'branches') {
    return {
      title: 'Organisation access required',
      description: 'Your current workspace scope does not include branch management access.',
    }
  }
  if (view === 'consultants') {
    return {
      title: 'Organisation access required',
      description: 'Your current workspace scope does not include consultant management access.',
    }
  }
  if (view === 'partners') {
    return {
      title: 'Organisation access required',
      description: 'Your current workspace scope does not include partner management access.',
    }
  }
  if (view === 'routing-rules') {
    return {
      title: 'Organisation access required',
      description: 'Your current workspace scope does not include routing rules access.',
    }
  }
  return {
    title: 'Organisation access required',
    description: 'Your current workspace scope does not include access to this organisation workspace.',
  }
}

export function resolveSelectedHierarchyRow(selectedId = '', rows = [], candidateKeys = []) {
  const normalizedSelectedId = normalizeText(selectedId)
  if (!normalizedSelectedId) return null

  const exactMatch = rows.find((row) => normalizeText(row?.id) === normalizedSelectedId)
  if (exactMatch) return exactMatch

  const derivedMatch = rows.find((row) =>
    candidateKeys.some((key) => {
      const value = row?.[key]
      return value && normalizedSelectedId.endsWith(toRouteSlug(value))
    }),
  )
  if (derivedMatch) return derivedMatch

  if (rows.length === 1) return rows[0]
  return null
}

export function hasStaleHierarchySelection(selectedId = '', selectedRow = null) {
  return Boolean(normalizeText(selectedId) && !selectedRow)
}

function normalizeManagerRole(value = '') {
  const normalized = normalizeText(value).toLowerCase().replaceAll(' ', '_')
  if (normalized === 'bond_branch_manager') return 'branch_manager'
  if (normalized === 'bond_team_lead') return 'team_lead'
  if (normalized === 'bond_hq_manager' || normalized === 'bond_hq_admin') return 'hq_manager'
  if (normalized === 'bond_regional_manager') return 'regional_manager'
  return normalized
}

function buildManagerOptionsFromRows(rows = [], allowedRoles = new Set()) {
  return (rows || [])
    .map((user) => {
      const id = normalizeText(user.user_id || user.userId || user.id)
      const role = normalizeManagerRole(user.workspaceRole || user.workspace_role || user.organisationRole || user.organisation_role || user.role)
      return {
        id,
        name: normalizeText(user.name || user.email) || 'Team member',
        role,
      }
    })
    .filter((user) => user.id && allowedRoles.has(user.role))
}

export function getRegionManagerOptions(snapshot = null) {
  const source = Array.isArray(snapshot?.eligibleRegionManagers) ? snapshot.eligibleRegionManagers : snapshot?.consultants || []
  return buildManagerOptionsFromRows(source, REGION_MANAGER_UI_ROLES)
}

export function getBranchManagerOptions(snapshot = null) {
  const source = Array.isArray(snapshot?.eligibleBranchManagers) ? snapshot.eligibleBranchManagers : snapshot?.consultants || []
  return buildManagerOptionsFromRows(source, BRANCH_MANAGER_UI_ROLES)
}

function HeaderCell({ children, className = '' }) {
  return (
    <th className={`bg-[#f8fbff] px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[#7d90a5] ${className}`.trim()}>
      {children}
    </th>
  )
}

function StatusPill({ status = 'Healthy' }) {
  const normalized = normalizeText(status).toLowerCase()
  const tone = normalized.includes('attention') || normalized.includes('overloaded')
    ? 'border-[#fed7aa] bg-[#fff7ed] text-[#b45309]'
    : normalized.includes('inactive')
      ? 'border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]'
      : 'border-[#ccebd8] bg-[#eefbf3] text-[#1f7a4d]'
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {status}
    </span>
  )
}

function CommandButton({ children, disabled = false, icon: Icon, variant = 'secondary', onClick = () => {} }) {
  const className = variant === 'primary'
    ? 'border-[#143250] bg-[#143250] text-white hover:bg-[#183b5e]'
    : 'border-[#d9e4ef] bg-white text-[#24384d] hover:border-[#bfd0e1] hover:bg-[#fbfdff]'
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] border px-3.5 text-sm font-semibold shadow-[0_6px_16px_rgba(15,23,42,0.035)] transition disabled:cursor-not-allowed disabled:opacity-55 ${className}`}
    >
      {Icon ? <Icon size={16} strokeWidth={2.1} /> : null}
      {children}
    </button>
  )
}

function SectionShell({ eyebrow = '', title = '', description = '', action = null, children = null, className = '' }) {
  return (
    <section className={`rounded-[24px] border border-[#dbe5f0] bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.035)] ${className}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {eyebrow ? <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#7d90a5]">{eyebrow}</p> : null}
          {title ? <h2 className="mt-2 text-[1.15rem] font-semibold text-[#142132]">{title}</h2> : null}
          {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758d]">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function BreadcrumbButton({ children, onClick = () => {} }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 text-sm font-semibold text-[#24518a] transition hover:text-[#17324d]">
      <ArrowLeft size={15} />
      {children}
    </button>
  )
}

function buildCommandActions({ view, canManage, navigate, regionSelected = false, branchSelected = false }) {
  if (!canManage) return []

  const settingsRoute = '/settings/organisation'
  if (view === 'overview') {
    return [
      { label: 'Add Region', icon: Plus, to: `${settingsRoute}?intent=add-bond-region`, variant: 'primary' },
      { label: 'Add Branch', icon: Building2, to: `${settingsRoute}?intent=add-bond-branch` },
      { label: 'Add Consultant', icon: UserPlus, to: `${settingsRoute}?intent=invite-bond-user` },
    ]
  }
  if (view === 'regions') {
    return [
      { label: 'Add Region', icon: Plus, to: `${settingsRoute}?intent=add-bond-region` },
      { label: 'Assign Regional Manager', icon: UserPlus, to: `${settingsRoute}?intent=assign-bond-regional-manager` },
      { label: regionSelected ? 'Add Branch To Region' : 'Add Branch', icon: Building2, to: `${settingsRoute}?intent=add-bond-branch`, variant: 'primary' },
    ]
  }
  if (view === 'branches') {
    return [
      { label: 'Add Branch', icon: Plus, to: `${settingsRoute}?intent=add-bond-branch`, variant: 'primary' },
      { label: 'Assign Branch Manager', icon: UserPlus, to: `${settingsRoute}?intent=assign-bond-branch-manager` },
      { label: branchSelected ? 'Invite Consultant' : 'Invite Team Member', icon: Users, to: `${settingsRoute}?intent=invite-bond-user` },
    ]
  }
  if (view === 'consultants') {
    return [
      { label: 'Invite Consultant', icon: UserPlus, to: `${settingsRoute}?intent=invite-bond-user`, variant: 'primary' },
      { label: 'Assign Branch', icon: Building2, to: `${settingsRoute}?intent=assign-bond-user-branch` },
      { label: 'Scope Permissions', icon: Settings, to: `${settingsRoute}?intent=review-bond-scopes` },
    ]
  }
  if (view === 'partners') {
    return [
      { label: 'Add Partner', icon: Plus, to: `${settingsRoute}?intent=add-bond-partner`, variant: 'primary' },
      { label: 'Invite Partner', icon: UserPlus, to: `${settingsRoute}?intent=invite-bond-partner` },
      { label: 'Routing Defaults', icon: Route, to: `${settingsRoute}?intent=review-bond-partner-defaults` },
    ]
  }
  if (view === 'routing-rules') {
    return [
      { label: 'Add Routing Rule', icon: Plus, to: `${settingsRoute}?intent=add-bond-routing-rule`, variant: 'primary' },
      { label: 'Partner Defaults', icon: Route, to: `${settingsRoute}?intent=review-bond-partner-defaults` },
      { label: 'Company Fallback', icon: SlidersHorizontal, to: `${settingsRoute}?intent=company-fallback-branch` },
    ]
  }
  return [
    { label: 'Add Branch', icon: Plus, to: `${settingsRoute}?intent=add-bond-branch` },
    { label: 'Invite User', icon: UserPlus, to: `${settingsRoute}?intent=invite-bond-user`, variant: 'primary' },
    { label: 'Organisation Settings', icon: Settings, to: settingsRoute },
  ].map((item) => ({ ...item, onClick: () => navigate(item.to) }))
}

function OrganisationCommandHeader({
  snapshot = null,
  view = 'overview',
  regionTitle = '',
  branchTitle = '',
  consultantTitle = '',
  partnerTitle = '',
  navigate = () => {},
  onAddRegion = null,
  onAddBranch = null,
  onAddConsultant = null,
  onAssignBranchManager = null,
  onInviteConsultant = null,
  onAssignConsultant = null,
  onExport = null,
}) {
  const canManage = scopeCanManage(snapshot)
  const isHqOverview = view === 'overview' && isHqOrganisationScope(snapshot)
  const isHqBranches = view === 'branches' && !branchTitle && isHqOrganisationScope(snapshot)
  const isHqConsultants = view === 'consultants' && !consultantTitle && isHqOrganisationScope(snapshot)
  const actions = buildCommandActions({
    view,
    canManage,
    navigate,
    regionSelected: Boolean(regionTitle),
    branchSelected: Boolean(branchTitle),
  })
  const title = partnerTitle || consultantTitle || branchTitle || regionTitle || (
    view === 'regions'
      ? 'Regions'
      : view === 'branches'
        ? 'Branches'
        : view === 'consultants'
          ? 'Consultants'
          : view === 'partners'
            ? 'Partners'
          : view === 'routing-rules'
            ? 'Routing Rules'
          : 'Organisation'
  )
  const subtitle = partnerTitle
    ? 'Review this partner relationship, routing defaults, applications, and performance.'
    : consultantTitle
      ? 'Review this consultant’s workload, assigned applications, and current operating momentum.'
    : branchTitle
    ? 'Review branch pressure, the consultant roster, and file flow for this branch.'
    : regionTitle
      ? 'Monitor the region structure, branch coverage, and high-level performance.'
        : view === 'partners'
          ? 'Manage agency, development, and referral partners that send bond applications.'
        : view === 'consultants'
        ? 'Manage consultant workload, application ownership, and performance.'
        : view === 'routing-rules'
          ? 'Define partner, development, regional, overflow, and company fallback routing defaults.'
        : view === 'branches'
          ? 'Manage branch capacity, consultant allocation, and branch application performance.'
          : view === 'regions'
            ? 'Manage regional coverage, branch grouping, and regional application performance.'
        : 'Manage your bond origination network, branch structure, consultant workload, and application performance.'

  if (isHqOverview) {
    if (!canManage) return null
    return (
      <header className="flex justify-end">
        {canManage ? (
          <div className="grid w-full gap-3 sm:grid-cols-3 xl:w-auto xl:flex xl:justify-end">
            <CommandButton icon={Plus} variant="primary" onClick={onAddRegion || (() => navigate('/settings/organisation?intent=add-bond-region'))}>Add Region</CommandButton>
            <CommandButton icon={Plus} onClick={onAddBranch || (() => navigate('/settings/organisation?intent=add-bond-branch'))}>Add Branch</CommandButton>
            <CommandButton icon={Plus} onClick={onAddConsultant || (() => navigate('/settings/organisation?intent=invite-bond-user'))}>Add Consultant</CommandButton>
          </div>
        ) : null}
      </header>
    )
  }

  if (isHqBranches) {
    return (
      <header className="flex justify-end">
        <div className="flex w-full items-center gap-3 overflow-x-auto pb-1 sm:w-auto sm:justify-end">
          {canManage ? <CommandButton icon={Plus} variant="primary" onClick={onAddBranch || (() => navigate('/settings/organisation?intent=add-bond-branch'))}>Add Branch</CommandButton> : null}
          {canManage ? <CommandButton icon={UserCheck} onClick={onAssignBranchManager || (() => navigate('/settings/organisation?intent=assign-bond-branch-manager'))}>Assign Branch Manager</CommandButton> : null}
          {canManage ? <CommandButton icon={UserPlus} onClick={onInviteConsultant || (() => navigate('/settings/organisation?intent=invite-bond-user'))}>Invite Consultant</CommandButton> : null}
          <CommandButton icon={Download} onClick={onExport || (() => {})}>Export</CommandButton>
        </div>
      </header>
    )
  }

  if (isHqConsultants) {
    return (
      <header className="flex justify-end">
        <div className="flex w-full items-center gap-3 overflow-x-auto pb-1 sm:w-auto sm:justify-end">
          {canManage ? <CommandButton icon={Plus} variant="primary" onClick={onAddConsultant || (() => navigate('/settings/organisation?intent=invite-bond-user'))}>Add Consultant</CommandButton> : null}
          {canManage ? <CommandButton icon={Building2} onClick={onAssignConsultant || (() => navigate('/settings/organisation?intent=assign-bond-user-branch'))}>Assign Consultant</CommandButton> : null}
          <CommandButton icon={Download} onClick={onExport || (() => {})}>Export Performance</CommandButton>
        </div>
      </header>
    )
  }

  return (
    <section className="rounded-[26px] border border-[#dbe5f0] bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#75879b]">{snapshot?.visibleScope?.label || 'Organisation'}</p>
          <h1 className="mt-2 text-[1.75rem] font-semibold tracking-normal text-[#142132]">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5f7287]">{subtitle}</p>
        </div>
        {actions.length ? (
          <div className="flex flex-wrap items-center gap-3">
            {actions.map((action) => (
              <CommandButton
                key={action.label}
                icon={action.icon}
                variant={action.variant}
                onClick={action.onClick || (() => navigate(action.to))}
              >
                {action.label}
              </CommandButton>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function OrganisationKpiStrip({ kpis = {} }) {
  const items = kpis.items || []

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <article key={item.key} className="rounded-[22px] border border-[rgba(15,23,42,0.06)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eef5ff] text-[#24518a]">
              <Icon size={18} strokeWidth={2.1} />
            </span>
            <p className="mt-4 text-2xl font-semibold leading-none text-[#142132]">{item.value}</p>
            <p className="mt-2 text-sm font-medium text-[#64748b]">{item.label}</p>
          </article>
        )
      })}
    </section>
  )
}

function OrganisationViewUnavailable({ view = 'overview' }) {
  const copy = getUnavailableStateCopy(view)
  return (
    <SectionShell eyebrow="Organisation Scope" title={copy.title} description={copy.description}>
      <BondEmptyState compact title={copy.title} description={copy.description} />
    </SectionShell>
  )
}

function OrganisationManagementPlaceholder({ type = 'regions' }) {
  const copy = type === 'branches'
    ? {
        title: 'Add your first branch',
        description: 'Branches sit inside regions and hold consultants and applications.',
      }
    : type === 'consultants'
      ? {
          title: 'Add consultants',
          description: 'Consultants own applications and manage buyer finance progress.',
        }
      : {
          title: 'Set up your organisation structure',
          description: 'Start by creating your first region. After that, you can add branches, assign managers, and add consultants.',
        }
  return (
    <SectionShell eyebrow="Organisation Setup" title={copy.title} description={copy.description}>
      <BondEmptyState compact title={copy.title} description={copy.description} />
    </SectionShell>
  )
}

function getSettingsIntentRoute(intent = '') {
  const safeIntent = normalizeText(intent)
  return safeIntent ? `/settings/organisation?intent=${encodeURIComponent(safeIntent)}` : '/settings/organisation'
}

function OrganisationSetupState({ setupState = null, navigate = () => {}, canManage = false }) {
  if (!setupState) return null
  return (
    <SectionShell
      eyebrow="Next Setup Step"
      title={setupState.title}
      description={setupState.description}
      action={canManage ? (
        <CommandButton icon={Plus} variant="primary" onClick={() => navigate(getSettingsIntentRoute(setupState.actionIntent))}>
          {setupState.actionLabel}
        </CommandButton>
      ) : null}
    >
      <div className="rounded-[18px] border border-[#dbe5f0] bg-[#fbfdff] px-4 py-4 text-sm leading-6 text-[#60758d]">
        {setupState.description}
      </div>
    </SectionShell>
  )
}

function OverviewSummaryCards({ cards = [] }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <article key={card.key} className="rounded-[22px] border border-[#dbe5f0] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <p className="text-sm font-semibold text-[#64748b]">{card.label}</p>
          <p className="mt-3 text-3xl font-semibold leading-none text-[#142132]">{card.value}</p>
          <p className="mt-3 min-h-[2.5rem] text-sm leading-5 text-[#60758d]">{card.description}</p>
          <p className="mt-4 border-t border-[#edf2f7] pt-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#91a3b5]">{card.trend || 'Trend coming soon'}</p>
        </article>
      ))}
    </section>
  )
}

function OrganisationStructureSnapshot({ structure = {}, navigate = () => {} }) {
  const regions = structure.regions || []
  const directBranches = structure.directBranches || []
  if (!regions.length && !directBranches.length) {
    return (
      <SectionShell eyebrow="Structure" title="Organisation Structure" description="Create your first region to start shaping the network.">
        <BondEmptyState compact title="No organisation structure yet." description="Regions, branches, consultants, and application workload will appear here." />
      </SectionShell>
    )
  }

  return (
    <SectionShell eyebrow="Structure" title="Organisation Structure" description="A quick hierarchy view of regions, branches, consultants, and active application load.">
      <div className="space-y-4">
        {regions.map((region) => (
          <article key={region.id || region.name} className="rounded-[20px] border border-[#dbe5f0] bg-[#fbfdff] p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-base font-semibold text-[#142132]">{region.name}</p>
                <p className="mt-1 text-sm text-[#60758d]">{region.consultants} consultants · {region.activeApplications} active applications</p>
              </div>
              <button type="button" onClick={() => navigate(region.href)} className="inline-flex items-center gap-2 text-sm font-semibold text-[#24518a]">
                View <ArrowRight size={14} />
              </button>
            </div>
            <div className="mt-4 space-y-2 border-l border-[#dbe5f0] pl-4">
              {(region.branches || []).map((branch) => (
                <div key={branch.id || branch.name} className="flex flex-col gap-2 rounded-[16px] border border-[#e1e9f2] bg-white px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#142132]">{branch.name}</p>
                    <p className="mt-1 text-xs text-[#71869d]">{branch.consultants} consultants · {branch.activeApplications} active applications</p>
                  </div>
                  <button type="button" onClick={() => navigate(branch.href)} className="inline-flex items-center gap-2 text-sm font-semibold text-[#24518a]">
                    View <ArrowRight size={14} />
                  </button>
                </div>
              ))}
              {!region.branches?.length ? <BondEmptyState compact title="No branches in this region." description="Add a branch to start building this regional network." /> : null}
            </div>
          </article>
        ))}
        {directBranches.map((branch) => (
          <article key={branch.id || branch.name} className="flex flex-col gap-2 rounded-[18px] border border-[#dbe5f0] bg-[#fbfdff] p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#142132]">{branch.name}</p>
              <p className="mt-1 text-xs text-[#71869d]">{branch.consultants} consultants · {branch.activeApplications} active applications</p>
            </div>
            <button type="button" onClick={() => navigate(branch.href)} className="inline-flex items-center gap-2 text-sm font-semibold text-[#24518a]">
              View <ArrowRight size={14} />
            </button>
          </article>
        ))}
      </div>
    </SectionShell>
  )
}

function NeedsAttention({ alerts = [], navigate = () => {}, canManage = false }) {
  return (
    <SectionShell eyebrow="Operational Gaps" title="Needs Attention" description="Setup and workload issues that HQ should resolve next.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {alerts.map((alert) => (
          <article key={alert.key} className="rounded-[18px] border border-[#fed7aa] bg-[#fffaf4] p-4">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#fed7aa] bg-white text-[#d97706]">
              <AlertTriangle size={17} />
            </span>
            <p className="mt-4 text-sm font-semibold text-[#142132]">{alert.title}</p>
            <p className="mt-2 text-sm leading-5 text-[#8a5b2b]">{alert.description}</p>
            {canManage ? (
              <button
                type="button"
                onClick={() => navigate(alert.actionIntent ? getSettingsIntentRoute(alert.actionIntent) : alert.href)}
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#9a5b13]"
              >
                {alert.actionLabel}
                <ArrowRight size={14} />
              </button>
            ) : null}
          </article>
        ))}
        {!alerts.length ? <BondEmptyState compact title="No immediate organisation gaps." description="Manager assignments, workload pressure, and setup gaps will appear here." /> : null}
      </div>
    </SectionShell>
  )
}

function PerformanceSnapshot({ performance = {} }) {
  const statuses = performance.applicationsByStatus || []
  const maxStatus = Math.max(1, ...statuses.map((item) => Number(item.value || 0)))
  return (
    <SectionShell eyebrow="Performance" title="Performance Snapshot" description="Lightweight indicators for application distribution, branch performance, and consultant workload.">
      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <div className="space-y-3">
          <p className="text-sm font-semibold text-[#142132]">Applications by status</p>
          {statuses.map((item) => (
            <div key={item.label} className="grid grid-cols-[minmax(120px,180px)_1fr_auto] items-center gap-3">
              <span className="text-sm text-[#60758d]">{item.label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-[#e7eef6]">
                <span className="block h-full rounded-full bg-[#24518a]" style={{ width: `${Math.max(6, (Number(item.value || 0) / maxStatus) * 100)}%` }} />
              </span>
              <span className="text-sm font-semibold text-[#142132]">{item.value}</span>
            </div>
          ))}
          {!statuses.length ? <BondEmptyState compact title="No application status data yet." description="Status spread will appear as applications enter the workflow." /> : null}
        </div>
        <div className="grid gap-3">
          <SummaryMetric label="Top Performing Branch" value={performance.topPerformingBranch?.branch || 'No branch data'} emphasis />
          <SummaryMetric label="Lowest Performing Branch" value={performance.lowestPerformingBranch?.branch || 'No branch data'} emphasis />
          <SummaryMetric label="Consultant Workload Spread" value={performance.consultantWorkloadSpread || 'No workload yet'} emphasis />
          <SummaryMetric label="Average Approval Rate" value={`${Math.round(Number(performance.averageApprovalRate || 0))}%`} emphasis />
          <SummaryMetric label="Average Turnaround" value={performance.averageTurnaround ? `${performance.averageTurnaround} days` : 'Tracking'} emphasis />
        </div>
      </div>
    </SectionShell>
  )
}

function RecentOrganisationActivity({ rows = [] }) {
  return (
    <SectionShell eyebrow="Activity" title="Recent Organisation Activity" description="Recent structure, assignment, and application ownership changes.">
      <div className="divide-y divide-[#edf2f7] overflow-hidden rounded-[18px] border border-[#e1e9f2]">
        {rows.map((row) => (
          <a key={row.id} href={row.href} className="flex flex-col gap-2 bg-white px-4 py-4 transition hover:bg-[#fbfdff] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#142132]">{row.description}</p>
              <p className="mt-1 text-xs text-[#71869d]">{row.actor} · {row.branch} · {row.region}</p>
            </div>
            <span className="text-xs font-semibold text-[#60758d]">{row.timestamp}</span>
          </a>
        ))}
        {!rows.length ? (
          <BondEmptyState compact title="No organisation activity yet." description="Changes to regions, branches, consultants and assignments will appear here." />
        ) : null}
      </div>
    </SectionShell>
  )
}

function CompactEmptyState({ title = '', description = '', action = null }) {
  return (
    <div className="flex min-h-[118px] flex-col items-center justify-center rounded-[18px] border border-dashed border-[#d7e3ee] bg-[#fbfdff] px-4 py-5 text-center">
      <p className="text-sm font-semibold text-[#142132]">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm leading-5 text-[#60758d]">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

function HqSnapshotRow({ cards = [] }) {
  const iconMap = {
    regions: Network,
    branches: Building2,
    consultants: Users,
    activeApplications: FileText,
  }
  return (
    <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
      {(cards || []).map((card) => {
        const Icon = iconMap[card.key] || FileText
        return (
          <article key={card.key} className="flex min-h-[154px] flex-col rounded-[22px] border border-[#dbe5f0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.035)]">
            <div className="flex items-start justify-between gap-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[#eef5ff] text-[#24518a]">
                <Icon size={20} strokeWidth={2.1} />
              </span>
              {card.statusLine ? <span className="rounded-full border border-[#dce7f2] bg-[#fbfdff] px-2.5 py-1 text-[0.68rem] font-semibold text-[#60758d]">{card.statusLine}</span> : null}
            </div>
            <p className="mt-5 text-sm font-semibold text-[#51657b]">{card.label}</p>
            <p className="mt-2 text-3xl font-semibold leading-none text-[#142132]">{card.value}</p>
            <p className="mt-3 text-sm leading-5 text-[#60758d]">{card.description}</p>
          </article>
        )
      })}
    </section>
  )
}

function HqSetupGuidance({ setupState = null, canManage = false, navigate = () => {} }) {
  if (!setupState) return null
  const copy = setupState.key === 'regions'
    ? {
        title: 'Create your first region',
        description: 'Start the national structure by adding the first region, then add branches and consultants under it.',
      }
    : setupState.key === 'branches'
      ? {
          title: 'Add your first branch',
          description: 'Branches sit inside regions and carry managers, consultants, applications, and capacity reporting.',
        }
      : {
          title: 'Add your first consultant',
          description: 'Consultants own applications and make workload, ownership, and capacity reporting useful.',
        }
  return (
    <section className="rounded-[22px] border border-[#cfe2f7] bg-[#f7fbff] px-5 py-4 shadow-[0_10px_26px_rgba(15,23,42,0.025)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#48739d]">Setup Guidance</p>
          <h2 className="mt-1 text-base font-semibold text-[#142132]">{copy.title}</h2>
          <p className="mt-1 text-sm leading-5 text-[#60758d]">{copy.description}</p>
        </div>
        {canManage ? (
          <CommandButton icon={Plus} variant="primary" onClick={() => navigate(getSettingsIntentRoute(setupState.actionIntent))}>
            {setupState.actionLabel}
          </CommandButton>
        ) : null}
      </div>
    </section>
  )
}

function HqOrganisationStructure({ structure = {}, canManage = false, navigate = () => {} }) {
  const regions = structure.regions || []
  const directBranches = structure.directBranches || []
  if (!regions.length && !directBranches.length) {
    return (
      <SectionShell title="Organisation Structure" description="Visual view of your organisation hierarchy.">
        <CompactEmptyState
          title="No regions created yet."
          description="Create a region to start building HQ, branch, and consultant visibility."
          action={canManage ? <CommandButton icon={Plus} variant="primary" onClick={() => navigate(getSettingsIntentRoute('add-bond-region'))}>Create First Region</CommandButton> : null}
        />
      </SectionShell>
    )
  }

  return (
    <SectionShell
      title="Organisation Structure"
      description="Visual view of HQ, regions, branches, branch managers, and consultant counts."
      action={<button type="button" onClick={() => navigate(getBondOrganisationRouteForTab('branches'))} className="inline-flex items-center gap-2 text-sm font-semibold text-[#24518a]">View full structure <ArrowRight size={14} /></button>}
    >
      <div className="space-y-5">
        <div className="mx-auto flex w-fit items-center gap-3 rounded-[16px] border border-[#dbe5f0] bg-[#fbfdff] px-5 py-3 shadow-[0_8px_22px_rgba(15,23,42,0.035)]">
          <Building2 size={18} className="text-[#24518a]" />
          <span className="text-sm font-semibold text-[#142132]">HQ</span>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {regions.map((region) => (
            <article key={region.id || region.name} className="rounded-[20px] border border-[#dbe5f0] bg-[#fbfdff] p-4">
              <button type="button" onClick={() => navigate(region.href)} className="flex w-full items-start justify-between gap-3 text-left">
                <span>
                  <span className="block text-sm font-semibold text-[#142132]">{region.name}</span>
                  <span className="mt-1 block text-xs text-[#71869d]">{region.branches?.length || 0} branches · {region.consultants || 0} consultants · {region.activeApplications || 0} active files</span>
                </span>
                <ArrowRight size={14} className="mt-1 text-[#24518a]" />
              </button>
              <div className="mt-4 grid gap-2">
                {(region.branches || []).slice(0, 4).map((branch) => (
                  <button key={branch.id || branch.name} type="button" onClick={() => navigate(branch.href)} className="rounded-[14px] border border-[#e1e9f2] bg-white px-3 py-3 text-left transition hover:border-[#bfd0e1]">
                    <span className="block text-sm font-semibold text-[#142132]">{branch.name}</span>
                    <span className="mt-1 block text-xs text-[#71869d]">{branch.consultants || 0} consultants · Manager: {branch.manager || 'Unassigned'}</span>
                  </button>
                ))}
                {(region.branches || []).length > 4 ? <p className="text-xs font-semibold text-[#60758d]">+ {(region.branches || []).length - 4} more branches</p> : null}
                {!region.branches?.length ? <CompactEmptyState title="No branches in this region." description="Add a branch to activate this regional group." /> : null}
              </div>
            </article>
          ))}
          {directBranches.map((branch) => (
            <button key={branch.id || branch.name} type="button" onClick={() => navigate(branch.href)} className="rounded-[20px] border border-[#dbe5f0] bg-[#fbfdff] p-4 text-left transition hover:border-[#bfd0e1]">
              <span className="block text-sm font-semibold text-[#142132]">{branch.name}</span>
              <span className="mt-1 block text-xs text-[#71869d]">Unassigned region · {branch.consultants || 0} consultants · Manager: {branch.manager || 'Unassigned'}</span>
            </button>
          ))}
        </div>
      </div>
    </SectionShell>
  )
}

function HqOrganisationHealth({ cards = [], navigate = () => {} }) {
  return (
    <SectionShell title="Organisation Health" description="Operational exceptions that need ownership, capacity, or setup attention.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {(cards || []).map((card) => (
          <article key={card.key} className="rounded-[18px] border border-[#e1e9f2] bg-white p-4">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#fff7ed] text-[#d97706]">
              <AlertTriangle size={18} />
            </span>
            <p className="mt-4 text-2xl font-semibold leading-none text-[#142132]">{card.count ?? 'Not enough data'}</p>
            <p className="mt-2 text-sm font-semibold text-[#142132]">{card.label}</p>
            <p className="mt-1 text-xs leading-5 text-[#60758d]">{card.description}</p>
            <button type="button" onClick={() => navigate(card.href)} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#24518a]">
              {card.actionLabel || 'View'} <ArrowRight size={14} />
            </button>
          </article>
        ))}
      </div>
    </SectionShell>
  )
}

function riskTone(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized.includes('risk') || normalized.includes('attention') || normalized.includes('overloaded') || normalized.includes('inactive')) return 'border-[#fecaca] bg-[#fff5f5] text-[#b42318]'
  if (normalized.includes('busy') || normalized.includes('review')) return 'border-[#fed7aa] bg-[#fff7ed] text-[#b45309]'
  return 'border-[#ccebd8] bg-[#eefbf3] text-[#1f7a4d]'
}

function HqBranchPerformance({ rows = [], navigate = () => {} }) {
  return (
    <SectionShell title="Branch Performance" description="Branch workload, consultant coverage, approval performance, and risk." className="min-w-0">
      {!rows.length ? (
        <CompactEmptyState title="No branch data yet." description="Branch performance appears once branches and applications exist." />
      ) : (
        <div className="overflow-x-auto rounded-[18px] border border-[#e1e9f2]">
          <table className="min-w-[760px] border-collapse">
            <thead>
              <tr>
                <HeaderCell>Branch</HeaderCell>
                <HeaderCell>Region</HeaderCell>
                <HeaderCell>Active Applications</HeaderCell>
                <HeaderCell>Consultants</HeaderCell>
                <HeaderCell>Approval Rate</HeaderCell>
                <HeaderCell>Average Turnaround</HeaderCell>
                <HeaderCell>Risk</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id || row.branch} className="cursor-pointer border-t border-[#edf2f7] bg-white transition hover:bg-[#fbfdff]" onClick={() => row.href && navigate(row.href)}>
                  <td className="px-4 py-4 text-sm font-semibold text-[#142132]">{row.branch}</td>
                  <td className="px-4 py-4 text-sm text-[#60758d]">{row.region || 'Unassigned'}</td>
                  <td className="px-4 py-4 text-sm font-semibold text-[#17324d]">{row.activeApplications || 0}</td>
                  <td className="px-4 py-4 text-sm text-[#17324d]">{row.consultants || 0}</td>
                  <td className="px-4 py-4 text-sm font-semibold text-[#17324d]">{formatPercent(row.approvalRate)}</td>
                  <td className="px-4 py-4 text-sm text-[#17324d]">{formatLeadTime(row.averageTurnaround)}</td>
                  <td className="px-4 py-4"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${riskTone(row.risk)}`}>{row.risk || 'Healthy'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionShell>
  )
}

function HqConsultantCapacity({ rows = [], navigate = () => {} }) {
  return (
    <SectionShell title="Consultant Capacity" description="Consultant workload distribution and ownership pressure." className="min-w-0">
      {!rows.length ? (
        <CompactEmptyState title="No consultants yet." description="Consultant capacity appears once consultants are added." />
      ) : (
        <div className="overflow-x-auto rounded-[18px] border border-[#e1e9f2]">
          <table className="min-w-[720px] border-collapse">
            <thead>
              <tr>
                <HeaderCell>Consultant</HeaderCell>
                <HeaderCell>Branch</HeaderCell>
                <HeaderCell>Active Files</HeaderCell>
                <HeaderCell>Ready For Review</HeaderCell>
                <HeaderCell>Awaiting Docs</HeaderCell>
                <HeaderCell>Capacity Status</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id || row.consultant} className="cursor-pointer border-t border-[#edf2f7] bg-white transition hover:bg-[#fbfdff]" onClick={() => row.id && navigate(getBondConsultantWorkspaceRoute(row.id))}>
                  <td className="px-4 py-4 text-sm font-semibold text-[#142132]">{row.consultant}</td>
                  <td className="px-4 py-4 text-sm text-[#60758d]">{row.branch || 'Unassigned'}</td>
                  <td className="px-4 py-4 text-sm font-semibold text-[#17324d]">{row.activeFiles || 0}</td>
                  <td className="px-4 py-4 text-sm text-[#17324d]">{row.readyForReview || 0}</td>
                  <td className="px-4 py-4 text-sm text-[#17324d]">{row.awaitingDocs || 0}</td>
                  <td className="px-4 py-4"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${riskTone(row.capacityStatus)}`}>{row.capacityStatus || 'Healthy'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionShell>
  )
}

function CommandMetricCard({ item = {} }) {
  const Icon = item.icon || FileText
  return (
    <article className="flex min-h-[158px] flex-col justify-between rounded-[22px] border border-[#dbe5f0] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <span className={`flex h-11 w-11 items-center justify-center rounded-[16px] ${item.tone || 'bg-[#eef5ff] text-[#24518a]'}`}>
          <Icon size={20} strokeWidth={2.1} />
        </span>
        {item.badge ? <span className="rounded-full border border-[#dce7f2] bg-[#fbfdff] px-2.5 py-1 text-[0.68rem] font-semibold text-[#60758d]">{item.badge}</span> : null}
      </div>
      <div>
        <p className="mt-5 text-sm font-semibold text-[#51657b]">{item.label}</p>
        <p className="mt-2 text-[1.85rem] font-semibold leading-none tracking-normal text-[#142132]">{item.value}</p>
        <p className="mt-3 text-sm leading-5 text-[#60758d]">{item.description}</p>
      </div>
    </article>
  )
}

function OrganisationExecutiveMetricStrip({ commandCentre = {} }) {
  const scopeLabel = commandCentre.scopeLabel || 'Organisation'
  const summary = commandCentre.summary || {}
  const isNational = normalizeLower(scopeLabel) === 'national'
  const items = [
    {
      key: 'pipeline',
      label: isNational ? 'National Pipeline' : 'Pipeline',
      value: formatCurrency(summary.pipelineValue),
      description: 'Open application value in scope.',
      badge: summary.activeApplications ? `${summary.activeApplications} active` : 'No active files',
      icon: BarChart3,
    },
    {
      key: 'activeApplications',
      label: 'Active Applications',
      value: summary.activeApplications ?? 0,
      description: 'Live files excluding closed, archived, and cancelled work.',
      badge: `${summary.submittedApplications || 0} submitted`,
      icon: FileText,
    },
    {
      key: 'approvalRate',
      label: 'Approval Rate',
      value: summary.approvalRate === null || summary.approvalRate === undefined ? '—' : formatPercent(summary.approvalRate),
      description: summary.approvalRate === null || summary.approvalRate === undefined ? 'Needs decisioned applications.' : 'Approved files over decisioned files.',
      badge: summary.approvalRate === null || summary.approvalRate === undefined ? 'Not enough data' : 'Decisioned',
      icon: ShieldCheck,
    },
    {
      key: 'registrations',
      label: 'Registrations This Month',
      value: summary.registrationsThisMonth ?? 0,
      description: 'Registered transactions detected this month.',
      badge: 'This month',
      icon: UserCheck,
    },
    {
      key: 'health',
      label: 'Organisation Health',
      value: summary.organisationHealthScore === null || summary.organisationHealthScore === undefined ? 'Needs setup' : `${summary.organisationHealthScore}%`,
      description: 'Ownership, capacity, SLA, and setup health.',
      badge: summary.organisationHealthLabel || 'Setup health',
      icon: TrendingUp,
      tone: 'bg-[#eefbf3] text-[#1f7a4d]',
    },
  ]

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => <CommandMetricCard key={item.key} item={item} />)}
    </section>
  )
}

function OrganisationSetupGuidancePanel({ commandCentre = {}, canManage = false, navigate = () => {} }) {
  const structure = commandCentre.structure || {}
  if (structure.hasHierarchy || Number(structure.consultantsCount || 0) > 0) return null
  return (
    <section className="rounded-[22px] border border-[#cfe2f7] bg-[#f7fbff] p-5 shadow-[0_10px_26px_rgba(15,23,42,0.025)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#48739d]">Setup Guidance</p>
          <h2 className="mt-1 text-base font-semibold text-[#142132]">Your organisation structure is not set up yet.</h2>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-[#60758d]">Create a region, add a branch, or add your first consultant to start building operating visibility.</p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-3">
            <CommandButton icon={Plus} variant="primary" onClick={() => navigate(getSettingsIntentRoute('add-bond-region'))}>Create Region</CommandButton>
            <CommandButton icon={Building2} onClick={() => navigate(getSettingsIntentRoute('add-bond-branch'))}>Add Branch</CommandButton>
            <CommandButton icon={UserPlus} onClick={() => navigate(getSettingsIntentRoute('invite-bond-user'))}>Add Consultant</CommandButton>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function OrganisationHealthCommandList({ items = [], navigate = () => {} }) {
  const healthItems = items || []
  const issueCount = healthItems.reduce((total, item) => total + Number(item.count || 0), 0)
  const highPriorityItems = healthItems.filter((item) => item.severity === 'high' && Number(item.count || 0) > 0)
  const clearItems = healthItems.filter((item) => Number(item.count || 0) === 0)
  const highestPriority = highPriorityItems[0] || healthItems.find((item) => Number(item.count || 0) > 0)
  const toneForSeverity = (severity = '') => {
    if (severity === 'high') return 'border-[#fecaca] bg-[#fff5f5] text-[#b42318]'
    if (severity === 'medium') return 'border-[#fed7aa] bg-[#fffaf3] text-[#b45309]'
    return 'border-[#ccebd8] bg-[#f7fdf9] text-[#1f7a4d]'
  }
  return (
    <SectionShell eyebrow="Executive Control" title="Organisation Health" description="Ownership, capacity, routing, and SLA signals across the operating network." className="overflow-hidden">
      {!healthItems.length ? (
        <CompactEmptyState title="Organisation health is still building." description="Health signals will appear once branches, consultants, and applications are active." />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[0.78fr_1.72fr]">
          <aside className="relative overflow-hidden rounded-[24px] bg-[#10233a] p-5 text-white shadow-[0_20px_48px_rgba(16,35,58,0.18)] sm:p-6">
            <span className="pointer-events-none absolute right-[-56px] top-[-64px] h-40 w-40 rounded-full bg-white/10" />
            <span className="pointer-events-none absolute bottom-[-80px] left-[-64px] h-44 w-44 rounded-full bg-[#3e7197]/30" />
            <div className="relative">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#a7c0d9]">Operating pulse</p>
              <p className="mt-4 text-5xl font-semibold leading-none tracking-normal text-white">{issueCount}</p>
              <p className="mt-3 max-w-sm text-sm leading-6 text-[#c9d8e7]">
                {issueCount > 0 ? 'Priority items need leadership attention across ownership, workload, or routing.' : 'No critical operating issues detected in the current scope.'}
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <div className="rounded-[18px] border border-white/[0.12] bg-white/[0.08] p-4">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[#c9d8e7]">High priority</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{highPriorityItems.length}</p>
                </div>
                <div className="rounded-[18px] border border-white/[0.12] bg-white/[0.08] p-4">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[#c9d8e7]">Controls clear</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{clearItems.length}</p>
                </div>
              </div>
              {highestPriority ? (
                <button type="button" onClick={() => highestPriority.href && navigate(highestPriority.href)} className="mt-5 inline-flex w-full items-center justify-between gap-3 rounded-[18px] border border-white/[0.14] bg-white px-4 py-3 text-left text-sm font-semibold text-[#10233a] shadow-[0_14px_30px_rgba(0,0,0,0.12)] transition hover:bg-[#f7fbff]">
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#60758d]">Next intervention</span>
                    <span className="mt-1 block truncate">{highestPriority.label}</span>
                  </span>
                  <ArrowRight size={16} />
                </button>
              ) : null}
            </div>
          </aside>
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {healthItems.map((item) => (
              <button key={item.key} type="button" onClick={() => item.href && navigate(item.href)} className="group flex min-h-[128px] items-start gap-3 rounded-[20px] border border-[#e1e9f2] bg-[#fbfdff] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#bfd0e1] hover:bg-white hover:shadow-[0_16px_32px_rgba(15,23,42,0.055)]">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] ${Number(item.count || 0) > 0 ? 'bg-[#fff1df] text-[#c26a17]' : 'bg-[#e7f8ef] text-[#1f7a4d]'}`}>
                  {Number(item.count || 0) > 0 ? <AlertTriangle size={18} /> : <ShieldCheck size={18} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[#142132]">{item.label}</span>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${toneForSeverity(item.severity)}`}>{item.count ?? 0}</span>
                  </span>
                  <span className="mt-2 block text-xs leading-5 text-[#60758d]">{item.description}</span>
                  <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#24518a]">{item.actionLabel || 'View'} <ArrowRight size={13} className="transition group-hover:translate-x-0.5" /></span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </SectionShell>
  )
}

function BranchPerformanceCommandTable({ rows = [], navigate = () => {} }) {
  return (
    <SectionShell
      eyebrow="Branches"
      title="Branch Performance"
      description="Top branches by pipeline, workload, approvals, registrations, and risk."
      className="min-w-0"
      action={<button type="button" onClick={() => navigate(getBondOrganisationRouteForTab('branches'))} className="inline-flex items-center gap-2 text-sm font-semibold text-[#24518a]">View all branches <ArrowRight size={14} /></button>}
    >
      {!rows.length ? (
        <CompactEmptyState title="No branch performance yet." description="Branch performance appears once branches or applications exist." />
      ) : (
        <div className="overflow-hidden rounded-[20px] border border-[#dbe5f0] bg-white shadow-[0_18px_38px_rgba(15,23,42,0.035)]">
          <div className="overflow-x-auto">
            <table className="min-w-[1120px] border-collapse">
              <thead className="bg-[#f6f9fc]">
                <tr className="border-b border-[#dbe5f0]">
                  <th className="w-[70px] px-5 py-4 text-left text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-[#7d90a5]">Rank</th>
                  <th className="px-5 py-4 text-left text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-[#7d90a5]">Branch</th>
                  <th className="px-5 py-4 text-left text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-[#7d90a5]">Manager</th>
                  <th className="px-5 py-4 text-left text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-[#7d90a5]">Pipeline</th>
                  <th className="px-5 py-4 text-left text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-[#7d90a5]">Applications</th>
                  <th className="px-5 py-4 text-left text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-[#7d90a5]">Approval</th>
                  <th className="px-5 py-4 text-left text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-[#7d90a5]">Registrations</th>
                  <th className="px-5 py-4 text-left text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-[#7d90a5]">Risk</th>
                  <th className="px-5 py-4 text-right text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-[#7d90a5]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2f7]">
                {rows.map((row, index) => (
                  <tr key={row.id || row.branch || row.name} className="group cursor-pointer bg-white transition hover:bg-[#fbfdff]" onClick={() => row.href && navigate(row.href)}>
                    <td className="px-5 py-5 align-middle">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#dbe5f0] bg-[#f8fbff] text-xs font-semibold text-[#60758d]">
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-5 py-5 align-middle">
                      <button type="button" onClick={(event) => { event.stopPropagation(); row.href && navigate(row.href) }} className="text-left">
                        <span className="block text-sm font-semibold text-[#142132]">{row.branch || row.name}</span>
                        <span className="mt-1 block text-xs text-[#71869d]">{row.region || 'Unassigned region'}</span>
                      </button>
                    </td>
                    <td className="px-5 py-5 align-middle text-sm text-[#31475d]">{row.manager || 'Unassigned'}</td>
                    <td className="px-5 py-5 align-middle text-sm font-semibold text-[#142132]">{formatCurrency(row.pipelineValue)}</td>
                    <td className="px-5 py-5 align-middle">
                      <span className="block text-sm font-semibold text-[#142132]">{row.activeApplications || 0}</span>
                      <span className="mt-1 block text-xs text-[#71869d]">active files</span>
                    </td>
                    <td className="px-5 py-5 align-middle text-sm font-semibold text-[#142132]">{formatNullablePercent(row.approvalRate)}</td>
                    <td className="px-5 py-5 align-middle text-sm font-semibold text-[#142132]">{row.registrationsThisMonth || 0}</td>
                    <td className="px-5 py-5 align-middle">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${riskTone(row.riskLevel || row.risk)}`}>{row.riskLevel || row.risk || 'Healthy'}</span>
                    </td>
                    <td className="px-5 py-5 align-middle text-right">
                      <button type="button" onClick={(event) => { event.stopPropagation(); row.href && navigate(row.href) }} className="inline-flex items-center gap-1.5 rounded-[12px] border border-[#d9e4ef] bg-white px-3 py-2 text-xs font-semibold text-[#24518a] shadow-[0_8px_18px_rgba(15,23,42,0.035)] transition hover:border-[#b9cadd] hover:bg-[#f7fbff]">
                        View <ArrowRight size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SectionShell>
  )
}

function HqOrganisationCommandCentre({ snapshot = {}, navigate = () => {}, canManage = false }) {
  const commandCentre = snapshot.organisationCommandCentre || {}
  return (
    <>
      <OrganisationExecutiveMetricStrip commandCentre={commandCentre} />
      <OrganisationSetupGuidancePanel commandCentre={commandCentre} navigate={navigate} canManage={canManage} />
      <OrganisationHealthCommandList items={commandCentre.health?.items || []} navigate={navigate} />
      <BranchPerformanceCommandTable rows={commandCentre.branchPerformance || []} navigate={navigate} />
    </>
  )
}

function HqBranchSnapshotRow({ cards = [] }) {
  const iconMap = {
    branches: Building2,
    branchManagers: UserCheck,
    consultants: Users,
    activeApplications: FileText,
  }
  return (
    <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
      {(cards || []).map((card) => {
        const Icon = iconMap[card.key] || Building2
        return (
          <article key={card.key} className="flex min-h-[144px] flex-col rounded-[22px] border border-[#dbe5f0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.035)]">
            <div className="flex items-start justify-between gap-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[#eef5ff] text-[#24518a]">
                <Icon size={20} strokeWidth={2.1} />
              </span>
              {card.statusLine ? <span className="rounded-full border border-[#dce7f2] bg-[#fbfdff] px-2.5 py-1 text-[0.68rem] font-semibold text-[#60758d]">{card.statusLine}</span> : null}
            </div>
            <p className="mt-4 text-sm font-semibold text-[#51657b]">{card.label}</p>
            <p className="mt-2 text-3xl font-semibold leading-none text-[#142132]">{card.value}</p>
            <p className="mt-3 text-sm leading-5 text-[#60758d]">{card.description}</p>
          </article>
        )
      })}
    </section>
  )
}

function HqBranchHealthStrip({ cards = [], navigate = () => {} }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
      {(cards || []).map((card) => {
        const hasIssue = Number(card.count || 0) > 0
        return (
          <article key={card.key} className={`rounded-[20px] border p-4 shadow-[0_10px_24px_rgba(15,23,42,0.025)] ${hasIssue ? 'border-[#fed7aa] bg-[#fffaf3]' : 'border-[#ccebd8] bg-[#f7fdf9]'}`}>
            <div className="flex items-start gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] ${hasIssue ? 'bg-[#fff1df] text-[#c26a17]' : 'bg-[#e7f8ef] text-[#1f7a4d]'}`}>
                {hasIssue ? <AlertTriangle size={18} /> : <ShieldCheck size={18} />}
              </span>
              <div className="min-w-0">
                <p className="text-2xl font-semibold leading-none text-[#142132]">{card.count ?? 0}</p>
                <p className="mt-2 text-sm font-semibold text-[#142132]">{card.label}</p>
                <p className="mt-1 text-xs leading-5 text-[#60758d]">{card.description}</p>
                <button type="button" onClick={() => navigate(card.href)} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#24518a]">
                  {card.actionLabel || (hasIssue ? 'Fix' : 'View')} <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </article>
        )
      })}
    </section>
  )
}

function BranchWarningPill({ children, tone = 'warning' }) {
  const className = tone === 'danger'
    ? 'border-[#fecaca] bg-[#fff5f5] text-[#b42318]'
    : tone === 'neutral'
      ? 'border-[#dbe5f0] bg-[#fbfdff] text-[#60758d]'
      : 'border-[#fed7aa] bg-[#fff7ed] text-[#b45309]'
  return <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>{children}</span>
}

function HqBranchDirectory({
  rows = [],
  canManage = false,
  onView = () => {},
  onAssign = () => {},
  onEdit = () => {},
  onAddConsultant = () => {},
}) {
  return (
    <SectionShell title="Branch Directory" description="All branches across the national bond origination network.">
      {!rows.length ? (
        <CompactEmptyState title="No branches yet." description="Create a region first, then add branches under it." />
      ) : (
        <div className="overflow-x-auto rounded-[18px] border border-[#e1e9f2]">
          <table className="min-w-[1180px] border-collapse">
            <thead>
              <tr>
                <HeaderCell>Branch</HeaderCell>
                <HeaderCell>Region</HeaderCell>
                <HeaderCell>Manager</HeaderCell>
                <HeaderCell>Consultants</HeaderCell>
                <HeaderCell>Active Applications</HeaderCell>
                <HeaderCell>Approval Rate</HeaderCell>
                <HeaderCell>Avg Turnaround</HeaderCell>
                <HeaderCell>Risk</HeaderCell>
                <HeaderCell>Status</HeaderCell>
                <HeaderCell>Actions</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const noManager = !row.hasManager && normalizeLower(row.manager) === 'unassigned'
                const noRegion = !normalizeText(row.regionId) || normalizeLower(row.region) === 'unassigned'
                const noConsultants = !Number(row.consultants || 0)
                return (
                  <tr key={row.id || row.name} className="border-t border-[#edf2f7] bg-white align-top transition hover:bg-[#fbfdff]">
                    <td className="px-4 py-4">
                      <button type="button" onClick={() => onView(row)} className="text-left text-sm font-semibold text-[#142132] hover:text-[#24518a]">{row.name || row.branch}</button>
                      <p className="mt-1 text-xs text-[#71869d]">{row.code || 'No code'}</p>
                    </td>
                    <td className="px-4 py-4 text-sm text-[#17324d]">
                      {noRegion ? <BranchWarningPill>No region</BranchWarningPill> : row.region}
                    </td>
                    <td className="px-4 py-4 text-sm text-[#17324d]">
                      {noManager ? <BranchWarningPill>Unassigned manager</BranchWarningPill> : row.manager}
                    </td>
                    <td className="px-4 py-4">
                      {noConsultants ? <BranchWarningPill>No consultants</BranchWarningPill> : <span className="text-sm font-semibold text-[#17324d]">{row.consultants}</span>}
                    </td>
                    <td className="px-4 py-4 text-sm font-semibold text-[#17324d]">{row.activeApplications || 0}</td>
                    <td className="px-4 py-4 text-sm font-semibold text-[#17324d]">{formatPercent(row.approvalRate)}</td>
                    <td className="px-4 py-4 text-sm text-[#17324d]">{formatLeadTime(row.averageTurnaround || row.avgLeadTime)}</td>
                    <td className="px-4 py-4"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${riskTone(row.riskLevel || row.risk)}`}>{row.riskLevel || row.risk || 'Healthy'}</span></td>
                    <td className="px-4 py-4"><StatusPill status={row.status || 'active'} /></td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => onView(row)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#d9e4ef] px-2.5 py-1.5 text-xs font-semibold text-[#24518a]"><Eye size={13} /> View</button>
                        {canManage ? (
                          <>
                            <button type="button" onClick={() => onAssign(row)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#d9e4ef] px-2.5 py-1.5 text-xs font-semibold text-[#31475d]"><UserCheck size={13} /> Assign</button>
                            <button type="button" onClick={() => onAddConsultant(row)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#d9e4ef] px-2.5 py-1.5 text-xs font-semibold text-[#31475d]"><UserPlus size={13} /> Add</button>
                            <button type="button" onClick={() => onEdit(row)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#d9e4ef] px-2.5 py-1.5 text-xs font-semibold text-[#31475d]"><Pencil size={13} /> Edit</button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionShell>
  )
}

function BranchCapacityList({ title = '', description = '', rows = [], emptyTitle = '', navigate = () => {} }) {
  return (
    <SectionShell title={title} description={description} className="min-w-0">
      {!rows.length ? (
        <CompactEmptyState title={emptyTitle} description="Branch capacity appears once branches carry applications and consultants." />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <button key={row.id || row.name} type="button" onClick={() => navigate(row.href)} className="w-full rounded-[16px] border border-[#e1e9f2] bg-[#fbfdff] px-4 py-3 text-left transition hover:border-[#bfd0e1] hover:bg-white">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#142132]">{row.name || row.branch}</p>
                  <p className="mt-1 text-xs text-[#71869d]">{row.region || 'Unassigned'} · {row.consultants || 0} consultants</p>
                </div>
                <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${riskTone(row.riskLevel || row.risk)}`}>{row.riskLevel || row.risk || 'Healthy'}</span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <SummaryMetric label="Active Files" value={row.activeApplications || 0} emphasis />
                <SummaryMetric label="Utilisation" value={row.utilisationLabel || 'Not enough data'} />
              </div>
            </button>
          ))}
        </div>
      )}
    </SectionShell>
  )
}

function HqBranchStructure({ structure = {}, canManage = false, navigate = () => {} }) {
  const regions = structure.regions || []
  const directBranches = structure.directBranches || []
  if (!regions.length && !directBranches.length) {
    return (
      <SectionShell title="Branch Structure" description="Region to branch network structure.">
        <CompactEmptyState
          title="No branch structure yet."
          description="Create a region first, then add branches under it."
          action={canManage ? <CommandButton icon={Plus} variant="primary" onClick={() => navigate(getSettingsIntentRoute('add-bond-region'))}>Add Region</CommandButton> : null}
        />
      </SectionShell>
    )
  }

  return (
    <SectionShell title="Branch Structure" description="Region to branch structure with manager, consultant, and workload visibility.">
      <div className="grid gap-4 xl:grid-cols-2">
        {regions.map((region) => (
          <article key={region.id || region.name} className="rounded-[18px] border border-[#e1e9f2] bg-[#fbfdff] p-4">
            <button type="button" onClick={() => region.href && navigate(region.href)} className="flex w-full items-start justify-between gap-3 text-left">
              <span>
                <span className="block text-sm font-semibold text-[#142132]">{region.name}</span>
                <span className="mt-1 block text-xs text-[#71869d]">{region.branches?.length || 0} branches</span>
              </span>
              <ArrowRight size={14} className="mt-1 text-[#24518a]" />
            </button>
            <div className="mt-4 space-y-2">
              {(region.branches || []).map((branch) => (
                <button key={branch.id || branch.name} type="button" onClick={() => navigate(branch.href)} className="w-full rounded-[14px] border border-[#dfe8f2] bg-white px-3 py-3 text-left transition hover:border-[#bfd0e1]">
                  <span className="block text-sm font-semibold text-[#142132]">{branch.name}</span>
                  <span className="mt-1 block text-xs leading-5 text-[#71869d]">Manager: {branch.manager || 'Unassigned'} · {branch.consultants || 0} consultants · {branch.activeApplications || 0} active files</span>
                </button>
              ))}
              {!region.branches?.length ? <CompactEmptyState title="No branches in this region." description="Add a branch to activate this region." /> : null}
            </div>
          </article>
        ))}
        {directBranches.length ? (
          <article className="rounded-[18px] border border-[#fed7aa] bg-[#fffaf3] p-4">
            <p className="text-sm font-semibold text-[#142132]">Branches Without Region</p>
            <p className="mt-1 text-xs text-[#71869d]">Assign these branches to a region to complete the structure.</p>
            <div className="mt-4 space-y-2">
              {directBranches.map((branch) => (
                <button key={branch.id || branch.name} type="button" onClick={() => navigate(branch.href)} className="w-full rounded-[14px] border border-[#fed7aa] bg-white px-3 py-3 text-left transition hover:bg-[#fffaf3]">
                  <span className="block text-sm font-semibold text-[#142132]">{branch.name}</span>
                  <span className="mt-1 block text-xs leading-5 text-[#71869d]">Manager: {branch.manager || 'Unassigned'} · {branch.consultants || 0} consultants · {branch.activeApplications || 0} active files</span>
                </button>
              ))}
            </div>
          </article>
        ) : null}
      </div>
    </SectionShell>
  )
}

function formatBranchRisk(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) return '—'
  return normalized.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatCapacity(value) {
  if (value === null || value === undefined || value === '') return '—'
  return `${Math.round(Number(value || 0))}%`
}

function HqBranchExecutiveKpiStrip({ summary = {}, rows = [] }) {
  const branchRows = rows || []
  const sparkSets = {
    totalBranches: branchRows.map((row) => Number(row.consultantsCount || row.consultants || 0)),
    activeApplications: branchRows.map((row) => Number(row.activeApplications || 0)),
    pipeline: branchRows.map((row) => Number(row.pipelineValue || 0)),
    approval: branchRows.map((row) => Number(row.approvalRate || 0)),
  }
  const cards = [
    { key: 'totalBranches', label: 'Total Branches', value: summary.totalBranches || 0, trend: summary.totalBranchesTrend, icon: Building2, tone: 'bg-[#eef5ff] text-[#24518a]' },
    { key: 'activeApplications', label: 'Active Applications', value: summary.activeApplications || 0, trend: summary.activeApplicationsTrend, icon: FileText, tone: 'bg-[#e9f8ef] text-[#1f7a4d]' },
    { key: 'pipeline', label: 'Pipeline Value', value: formatCompactCurrency(summary.pipelineValue), trend: summary.pipelineTrend, icon: BarChart3, tone: 'bg-[#f2edff] text-[#6c4cc2]' },
    { key: 'approval', label: 'Approval Rate', value: summary.approvalRate === null || summary.approvalRate === undefined ? '—' : formatPercent(summary.approvalRate), trend: summary.approvalRateTrend, icon: ShieldCheck, tone: 'bg-[#fff4e5] text-[#c26a17]' },
  ]
  return (
    <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <article key={card.key} className="flex min-h-[142px] flex-col justify-between overflow-hidden rounded-[18px] border border-[#dbe5f0] bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.035)]">
            <div className="flex items-center justify-between gap-4">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] ${card.tone}`}>
                <Icon size={18} strokeWidth={2.1} />
              </span>
              <BranchMiniSparkline values={sparkSets[card.key] || []} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7d90a5]">{card.label}</p>
              <p className="mt-2 truncate text-[clamp(1.85rem,2.25vw,36px)] font-bold leading-none tracking-normal text-[#142132]">{card.value}</p>
              <p className="mt-2 truncate text-sm text-[#64748b]">{card.trend || 'Trend pending'}</p>
            </div>
          </article>
        )
      })}
    </section>
  )
}

function BranchMiniSparkline({ values = [] }) {
  if (!values.length) {
    return <span className="h-8 w-20 rounded-full bg-[#f1f5f9]" />
  }
  const max = Math.max(1, ...values.map((value) => Number(value || 0)))
  return (
    <span className="flex h-8 w-20 items-end gap-1">
      {values.map((value, index) => (
        <span
          key={`${value}-${index}`}
          className="w-2 rounded-full bg-[#24518a]/30"
          style={{ height: `${Math.max(6, (Number(value || 0) / max) * 30)}px` }}
        />
      ))}
    </span>
  )
}

function getBranchStatusLabel(row = {}) {
  const risk = normalizeLower(row.riskLevel || row.risk)
  if (risk === 'high') return 'At Risk'
  if (risk === 'medium') return 'Watch'
  return 'Healthy'
}

function branchStatusTone(row = {}) {
  const label = getBranchStatusLabel(row)
  if (label === 'At Risk') return 'border-[#fecaca] bg-[#fff5f5] text-[#b42318]'
  if (label === 'Watch') return 'border-[#fed7aa] bg-[#fff7ed] text-[#b45309]'
  return 'border-[#ccebd8] bg-[#eefbf3] text-[#1f7a4d]'
}

function branchRankTone(rank = 0) {
  if (rank === 1) return 'border-[#f3cf74] bg-[#f3c84b] text-white shadow-[0_10px_24px_rgba(214,158,46,0.22)]'
  if (rank === 2) return 'border-[#cfd8e3] bg-[#eef3f8] text-[#52667a]'
  if (rank === 3) return 'border-[#d6a16f] bg-[#a96b3a] text-white'
  return 'border-[#d9e4ef] bg-[#f7fbff] text-[#60758d]'
}

function HqBranchLeaderboard({ command = {}, navigate = () => {} }) {
  const rows = command.leaderboards?.pipeline || command.leaderboard || []
  return (
    <SectionShell
      eyebrow="National Standings"
      title="National Branch Leaderboard"
      description="Top branches ranked by pipeline value, with ownership and performance signals visible at a glance."
      action={<button type="button" onClick={() => navigate(getBondOrganisationRouteForTab('branches'))} className="inline-flex items-center gap-2 text-sm font-semibold text-[#24518a]">View full leaderboard <ArrowRight size={14} /></button>}
      className="min-w-0 rounded-[16px]"
    >
      {!rows.length ? (
        <CompactEmptyState title="Branch performance will appear once branches are created." description="Create a region and branch to start routing applications and measuring performance." />
      ) : (
        <div className="-mx-1 overflow-x-auto px-1 pb-2">
          <div className="flex min-w-max gap-4">
          {rows.map((row) => (
            <button
              key={row.branchId || row.id}
              type="button"
              onClick={() => row.href && navigate(row.href)}
              className={`flex min-h-[246px] w-[286px] shrink-0 flex-col rounded-[18px] border bg-white p-5 text-left shadow-[0_14px_34px_rgba(15,23,42,0.035)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(15,23,42,0.07)] ${row.rank === 1 ? 'border-[#efca6d]' : 'border-[#dbe5f0]'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className={`inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-full border px-2 text-sm font-bold ${branchRankTone(row.rank)}`}>
                  {row.rank <= 3 ? <Medal size={15} /> : null}<span>{row.rank}</span>
                </span>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${branchStatusTone(row)}`}>{getBranchStatusLabel(row)}</span>
              </div>
              <div className="mt-4">
                <p className="truncate text-lg font-bold leading-tight text-[#142132]">{row.branchName || row.name}</p>
                <p className="mt-1 text-sm text-[#64748b]">{row.regionName || 'Region not assigned'}</p>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-y border-[#edf2f7] py-4">
                <BranchCardMetric label="Pipeline" value={formatCompactCurrency(row.pipelineValue)} />
                <BranchCardMetric label="Apps" value={row.activeApplications || 0} />
                <BranchCardMetric label="Approval" value={formatNullablePercent(row.approvalRate)} />
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs font-semibold text-[#64748b]">
                  <span>Capacity</span>
                  <span>{formatCapacity(row.capacityPercent)}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-[#e8eef6]">
                  <div className="h-full rounded-full bg-[#24518a]" style={{ width: `${Math.min(100, Math.max(0, Number(row.capacityPercent || 0)))}%` }} />
                </div>
              </div>
              <div className="mt-auto flex items-center gap-3 pt-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#dbe5f0] bg-[#f8fbff] text-xs font-bold text-[#60758d]">
                  {getInitials(row.managerName || row.manager || 'Unassigned')}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-[#142132]">{row.managerName || row.manager || 'Unassigned'}</span>
                  <span className="mt-0.5 block text-xs text-[#64748b]">Branch manager</span>
                </span>
              </div>
            </button>
          ))}
          </div>
        </div>
      )}
    </SectionShell>
  )
}

function BranchCardMetric({ label = '', value = '' }) {
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#7d90a5]">{label}</p>
      <p className="mt-1 text-base font-bold text-[#142132]">{value}</p>
    </div>
  )
}

function buildBranchAttentionItems(rows = []) {
  const items = []
  ;(rows || []).forEach((row) => {
    if (!row.hasManager || !normalizeText(row.managerName || row.manager) || normalizeLower(row.managerName || row.manager) === 'unassigned') {
      items.push({
        key: `${row.branchId || row.id}-manager`,
        branch: row.branchName || row.name,
        title: 'No Manager Assigned',
        description: 'Assign a manager to ensure ownership and escalation control.',
        cta: 'Assign Manager',
        icon: UserCheck,
        tone: 'amber',
        row,
        action: 'assign',
      })
    }
    if (row.approvalRate !== null && row.approvalRate !== undefined && Number(row.approvalRate || 0) < 70) {
      items.push({
        key: `${row.branchId || row.id}-approval`,
        branch: row.branchName || row.name,
        title: 'Approval Rate Below Threshold',
        description: `Approval rate is ${formatNullablePercent(row.approvalRate)} and needs review.`,
        cta: 'Review Performance',
        icon: ShieldCheck,
        tone: 'red',
        row,
      })
    }
    if (normalizeLower(row.workloadStatus) === 'over' || normalizeLower(row.workloadStatus) === 'high' || normalizeLower(row.capacityStatus).includes('over')) {
      items.push({
        key: `${row.branchId || row.id}-capacity`,
        branch: row.branchName || row.name,
        title: 'Capacity Risk Detected',
        description: `${formatCapacity(row.capacityPercent)} capacity across ${row.consultantsCount || row.consultants || 0} consultants.`,
        cta: 'Review Capacity',
        icon: TrendingUp,
        tone: 'amber',
        row,
      })
    }
    if (Number(row.pendingDocuments || row.pendingDocs || 0) > 0) {
      items.push({
        key: `${row.branchId || row.id}-documents`,
        branch: row.branchName || row.name,
        title: 'Missing Required Documents',
        description: `${row.pendingDocuments || row.pendingDocs || 0} active files have document blockers.`,
        cta: 'Review Documents',
        icon: FileText,
        tone: 'red',
        row,
      })
    }
  })
  return items.slice(0, 4)
}

function attentionIconTone(tone = 'amber') {
  if (tone === 'red') return 'bg-[#fff0f0] text-[#b42318]'
  return 'bg-[#fff4e5] text-[#c26a17]'
}

function HqBranchHealthPanel({ command = {}, canManage = false, navigate = () => {}, onAdd = () => {}, onAssign = () => {} }) {
  const items = buildBranchAttentionItems(command.directory || [])
  if (!command.setup?.hasBranches) {
    return (
      <SectionShell title="Branches Requiring Attention" description="Set up branch coverage before routing work." className="min-w-0">
        <CompactEmptyState
          title="Build your branch structure"
          description="Create your first region and branch to start routing applications, assigning consultants, and measuring performance."
          action={canManage ? <CommandButton icon={Plus} variant="primary" onClick={onAdd}>Add Branch</CommandButton> : null}
        />
      </SectionShell>
    )
  }
  return (
    <SectionShell
      eyebrow="Interventions"
      title="Branches Requiring Attention"
      description="Branches that need immediate ownership, performance, capacity, or document action."
      className="min-w-0 rounded-[16px]"
      action={<button type="button" onClick={() => navigate(getBondOrganisationRouteForTab('branches'))} className="inline-flex items-center gap-2 text-sm font-semibold text-[#24518a]">View all issues <ArrowRight size={14} /></button>}
    >
      {!items.length ? (
        <CompactEmptyState title="No branch interventions right now." description="Manager, approval, capacity, and document risks will appear here when they need HQ attention." />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => {
            const Icon = item.icon
            const handleClick = () => {
              if (item.action === 'assign' && canManage) {
                onAssign(item.row)
                return
              }
              item.row?.href && navigate(item.row.href)
            }
            return (
              <button key={item.key} type="button" onClick={handleClick} className="min-h-[190px] rounded-[16px] border border-[#dbe5f0] bg-white p-6 text-left shadow-[0_18px_40px_rgba(15,23,42,0.035)] transition hover:-translate-y-0.5 hover:border-[#bfd0e1] hover:shadow-[0_24px_54px_rgba(15,23,42,0.07)]">
                <span className={`flex h-11 w-11 items-center justify-center rounded-[12px] ${attentionIconTone(item.tone)}`}>
                  <Icon size={18} strokeWidth={2.1} />
                </span>
                <p className="mt-5 text-base font-bold text-[#142132]">{item.branch}</p>
                <p className="mt-2 text-sm font-semibold text-[#142132]">{item.title}</p>
                <p className="mt-3 text-sm leading-5 text-[#64748b]">{item.description}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#24518a]">{item.cta} <ArrowRight size={14} /></span>
              </button>
            )
          })}
        </div>
      )}
    </SectionShell>
  )
}

function HqBranchExecutiveDirectory({
  rows = [],
  regions = [],
  canManage = false,
  onView = () => {},
  onAssign = () => {},
  onEdit = () => {},
  onAdd = () => {},
}) {
  const [search, setSearch] = useState('')
  const [regionId, setRegionId] = useState('all')
  const [manager, setManager] = useState('all')
  const [status, setStatus] = useState('all')
  const [risk, setRisk] = useState('all')
  const regionOptions = useMemo(
    () => [{ value: 'all', label: 'All Regions' }, ...regions.map((region) => ({ value: normalizeText(region.id), label: region.name || region.region || 'Region' }))],
    [regions],
  )
  const managerOptions = useMemo(() => {
    const managers = [...new Set(rows.map((row) => normalizeText(row.managerName || row.manager)).filter(Boolean))]
    return [{ value: 'all', label: 'All Managers' }, ...managers.map((item) => ({ value: item, label: item }))]
  }, [rows])
  const filteredRows = useMemo(() => {
    const query = normalizeLower(search)
    return rows.filter((row) => {
      const matchesSearch = !query || [row.branchName, row.name, row.regionName, row.managerName].some((value) => normalizeLower(value).includes(query))
      const matchesRegion = regionId === 'all' || normalizeText(row.regionId) === regionId
      const matchesManager = manager === 'all' || normalizeText(row.managerName || row.manager) === manager
      const matchesStatus = status === 'all' || normalizeLower(getBranchStatusLabel(row)) === status
      const matchesRisk = risk === 'all' || normalizeLower(row.riskLevel) === risk
      return matchesSearch && matchesRegion && matchesManager && matchesStatus && matchesRisk
    })
  }, [manager, regionId, risk, rows, search, status])

  return (
    <SectionShell
      title="Branch Directory"
      description="Search and manage all branches in the organisation."
      className="rounded-[16px]"
      action={canManage ? <CommandButton icon={Plus} variant="primary" onClick={onAdd}>Add Branch</CommandButton> : null}
    >
      {!rows.length ? (
        <CompactEmptyState
          title="No branches yet."
          description="Create a region first, then add branches under it."
          action={canManage ? <CommandButton icon={Plus} variant="primary" onClick={onAdd}>Add Branch</CommandButton> : null}
        />
      ) : (
        <>
          <FilterBar
            searchPlaceholder="Search branch..."
            searchValue={search}
            onSearchChange={setSearch}
            filters={[
              { key: 'region', label: 'Region', value: regionId, onChange: setRegionId, options: regionOptions },
              { key: 'manager', label: 'Manager', value: manager, onChange: setManager, options: managerOptions },
              {
                key: 'status',
                label: 'Status',
                value: status,
                onChange: setStatus,
                options: [
                  { value: 'all', label: 'All Statuses' },
                  { value: 'healthy', label: 'Healthy' },
                  { value: 'watch', label: 'Watch' },
                  { value: 'at risk', label: 'At Risk' },
                ],
              },
              {
                key: 'risk',
                label: 'Risk',
                value: risk,
                onChange: setRisk,
                options: [
                  { value: 'all', label: 'All Risk' },
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                ],
              },
            ]}
          />
          {!filteredRows.length ? (
            <CompactEmptyState title="No branches match these filters." description="Try a broader region, manager, risk, or status filter." />
          ) : (
            <div className="grid gap-4">
              {filteredRows.map((row) => (
                <BranchDirectoryVisualRow
                  key={row.branchId || row.id}
                  row={row}
                  canManage={canManage}
                  onView={onView}
                  onAssign={onAssign}
                  onEdit={onEdit}
                />
              ))}
            </div>
          )}
        </>
      )}
    </SectionShell>
  )
}

function BranchDirectoryVisualRow({ row = {}, canManage = false, onView = () => {}, onAssign = () => {}, onEdit = () => {} }) {
  const managerName = row.managerName || row.manager || 'Unassigned'
  const capacity = Math.min(100, Math.max(0, Number(row.capacityPercent || 0)))
  const isUnassigned = normalizeLower(managerName) === 'unassigned'
  return (
    <article className="group overflow-hidden rounded-[18px] border border-[#dbe5f0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.03)] transition hover:border-[#bfd0e1] hover:shadow-[0_20px_48px_rgba(15,23,42,0.06)]">
      <div className="grid gap-0 xl:grid-cols-[minmax(260px,1.1fr)_minmax(430px,1.6fr)_minmax(220px,0.8fr)]">
        <button type="button" onClick={() => onView(row)} className="relative min-w-0 border-b border-[#edf2f7] p-5 text-left xl:border-b-0 xl:border-r">
          <span className={`absolute inset-y-0 left-0 w-1.5 ${getBranchStatusLabel(row) === 'At Risk' ? 'bg-[#ef4444]' : getBranchStatusLabel(row) === 'Watch' ? 'bg-[#f59e0b]' : 'bg-[#2f9d62]'}`} />
          <div className="pl-2">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-base font-bold text-[#142132]">{row.branchName || row.name}</span>
                <span className="mt-1 block text-sm text-[#64748b]">{row.regionName || 'Region not assigned'} · {row.code || 'No code'}</span>
              </span>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${branchStatusTone(row)}`}>{getBranchStatusLabel(row)}</span>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${isUnassigned ? 'bg-[#fff7ed] text-[#b45309]' : 'bg-[#eef5ff] text-[#24518a]'}`}>
                {getInitials(managerName)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[#142132]">{managerName}</span>
                <span className="mt-0.5 block text-xs text-[#71869d]">Branch manager</span>
              </span>
            </div>
          </div>
        </button>

        <div className="grid gap-3 border-b border-[#edf2f7] p-5 sm:grid-cols-2 xl:border-b-0 xl:border-r">
          <BranchDirectoryMetric label="Applications" value={row.activeApplications || 0} helper={`${row.submittedApplications || 0} submitted`} />
          <BranchDirectoryMetric label="Pipeline" value={formatCompactCurrency(row.pipelineValue)} helper={formatCurrency(row.pipelineValue)} />
          <BranchDirectoryMetric label="Approval" value={formatNullablePercent(row.approvalRate)} helper={`${formatLeadTime(row.averageTurnaround || row.avgLeadTime)} avg turnaround`} />
          <div className="rounded-[14px] bg-[#f8fbff] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7d90a5]">Capacity</p>
              <p className="text-sm font-bold text-[#142132]">{formatCapacity(row.capacityPercent)}</p>
            </div>
            <div className="mt-3 h-2 rounded-full bg-[#e3ebf5]">
              <div className="h-full rounded-full bg-[#24518a]" style={{ width: `${capacity}%` }} />
            </div>
            <p className="mt-2 text-xs text-[#64748b]">{row.consultantsCount || row.consultants || 0} consultants</p>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-4 p-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7d90a5]">Operational Focus</p>
            <p className="mt-2 text-sm font-semibold text-[#142132]">{isUnassigned ? 'Assign manager' : getBranchStatusLabel(row) === 'At Risk' ? 'Review performance' : 'Monitor branch health'}</p>
            <p className="mt-1 text-xs leading-5 text-[#64748b]">{row.pendingDocuments || row.pendingDocs || 0} document blockers · {formatBranchRisk(row.riskLevel || row.risk)} risk</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onView(row)} className="inline-flex items-center gap-1.5 rounded-[12px] bg-[#071942] px-3 py-2 text-xs font-semibold text-white shadow-[0_12px_24px_rgba(7,25,66,0.18)] transition hover:bg-[#10285b]">
              Open <ArrowRight size={13} />
            </button>
            {canManage ? (
              <>
                <button type="button" onClick={() => onAssign(row)} className="inline-flex items-center gap-1.5 rounded-[12px] border border-[#d9e4ef] bg-white px-3 py-2 text-xs font-semibold text-[#31475d] transition hover:bg-[#f8fbff]">
                  <UserCheck size={13} /> Assign
                </button>
                <button type="button" onClick={() => onEdit(row)} className="inline-flex items-center gap-1.5 rounded-[12px] border border-[#d9e4ef] bg-white px-3 py-2 text-xs font-semibold text-[#31475d] transition hover:bg-[#f8fbff]">
                  <Pencil size={13} /> Edit
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}

function BranchDirectoryMetric({ label = '', value = '', helper = '' }) {
  return (
    <div className="rounded-[14px] bg-[#f8fbff] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7d90a5]">{label}</p>
      <p className="mt-2 truncate text-lg font-bold text-[#142132]">{value}</p>
      <p className="mt-1 truncate text-xs text-[#64748b]">{helper}</p>
    </div>
  )
}

function HqBranchCommandCentre({
  snapshot = {},
  canManage = false,
  navigate = () => {},
  onView = () => {},
  onAssign = () => {},
  onEdit = () => {},
}) {
  const command = snapshot.overview?.branchCommandCentre || {}
  const directoryRows = command.directory || []
  return (
    <div className="mx-auto grid w-full max-w-[1600px] gap-8">
      <HqBranchExecutiveKpiStrip summary={command.summary || {}} rows={directoryRows} />
      <HqBranchLeaderboard command={command} navigate={navigate} />
      <HqBranchExecutiveDirectory
        rows={directoryRows}
        regions={snapshot.regions || []}
        canManage={canManage}
        onView={onView}
        onAssign={onAssign}
        onEdit={onEdit}
        onAdd={() => navigate(getSettingsIntentRoute('add-bond-branch'))}
      />
      <HqBranchHealthPanel command={command} canManage={canManage} navigate={navigate} onAdd={() => navigate(getSettingsIntentRoute('add-bond-branch'))} onAssign={onAssign} />
    </div>
  )
}

function getInitials(value = '') {
  const parts = normalizeText(value).split(/\s+/).filter(Boolean)
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'C'
}

function formatRoleLabel(value = '') {
  return normalizeText(value || 'consultant').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

const CONSULTANT_LEADERBOARD_MODES = Object.freeze([
  { key: 'pipeline', label: 'By Pipeline' },
  { key: 'volume', label: 'By Volume' },
  { key: 'revenue', label: 'By Revenue' },
  { key: 'approvalRate', label: 'By Approval Rate' },
  { key: 'registrations', label: 'By Registrations' },
])

function consultantRankTone(rank = 0) {
  if (rank === 1) return 'border-[#f8d98a] bg-[#fff9e6] text-[#8a5a00]'
  if (rank === 2) return 'border-[#d9e2ec] bg-[#f8fafc] text-[#52667a]'
  if (rank === 3) return 'border-[#eac0a7] bg-[#fff5ef] text-[#8f4b27]'
  return 'border-[#d9e4ef] bg-white text-[#5f7287]'
}

function getLeaderboardModeValue(row = {}, mode = 'pipeline') {
  if (mode === 'volume') return `${row.activeApplications || 0}`
  if (mode === 'revenue') return formatNullableCurrency(row.forecastRevenue)
  if (mode === 'approvalRate') return formatNullablePercent(row.approvalRate)
  if (mode === 'registrations') return `${row.registrations || 0}`
  return formatCurrency(row.pipelineValue)
}

function getConsultantAvatarUrl(row = {}) {
  return normalizeText(row.avatarUrl || row.avatar_url || row.profilePhotoUrl || row.profile_photo_url || row.photoUrl || row.photo_url || row.imageUrl || row.image_url)
}

function HqConsultantExecutiveKpiStrip({ summary = {}, rows = [] }) {
  const activeConsultants = rows.filter((row) => normalizeLower(row.status) !== 'inactive').length
  const totalConsultants = Number(summary.totalConsultants ?? summary.consultants ?? summary.activeConsultants ?? rows.length)
  const activeApplications = Number(summary.activeApplications ?? rows.reduce((sum, row) => sum + Number(row.activeApplications || 0), 0))
  const approvals = Number(summary.approvals ?? summary.approvedApplications ?? summary.approvedCount ?? rows.reduce((sum, row) => {
    if (row.approvalRate === null || row.approvalRate === undefined) return sum
    return sum + Math.round((Number(row.approvalRate || 0) / 100) * Number(row.decisionedApplications || 0))
  }, 0))
  const readyForReview = Number(summary.readyForReview ?? summary.readyForReviewApplications ?? rows.reduce((sum, row) => sum + Number(row.readyForReview || 0), 0))
  const overloadedConsultants = Number(summary.overloadedConsultants ?? summary.consultantsOverCapacity ?? rows.filter((row) => normalizeLower(row.capacityStatus) === 'overloaded').length)
  const averageApprovals = totalConsultants ? Number((approvals / totalConsultants).toFixed(1)) : null
  const averageActiveFiles = totalConsultants ? Number((activeApplications / totalConsultants).toFixed(1)) : null
  const cards = [
    { key: 'consultants', label: 'Total Consultants', value: totalConsultants, helper: `${summary.activeConsultants ?? activeConsultants} active in the visible network`, icon: Users },
    { key: 'avg-approvals', label: 'Avg Approvals / Consultant', value: averageApprovals === null ? '-' : averageApprovals, helper: 'Approved applications per consultant', icon: ShieldCheck },
    { key: 'avg-active-files', label: 'Active Files / Consultant', value: averageActiveFiles === null ? '-' : averageActiveFiles, helper: `${activeApplications} active consultant-owned files`, icon: FileText },
    { key: 'ready-review', label: 'Ready For Review', value: readyForReview, helper: `${overloadedConsultants} consultants currently overloaded`, icon: UserCheck },
  ]
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <article key={card.key} className="min-h-[132px] rounded-[20px] border border-[#dbe5f0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.035)]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7d90a5]">{card.label}</p>
                <p className="mt-3 text-2xl font-semibold leading-tight text-[#142132]">{card.value}</p>
              </div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#eef5ff] text-[#24518a]">
                <Icon size={18} strokeWidth={2.1} />
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-[#60758d]">{card.helper}</p>
          </article>
        )
      })}
    </section>
  )
}

function HqConsultantLeaderboard({ leaderboards = {}, navigate = () => {} }) {
  const [mode, setMode] = useState('pipeline')
  const [viewMode, setViewMode] = useState('table')
  const rows = leaderboards[mode] || leaderboards.pipeline || []
  return (
    <SectionShell
      title="Top Consultants Leaderboard"
      description="Rank consultants by production, approvals, registrations, and forecast contribution."
      action={(
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
            {CONSULTANT_LEADERBOARD_MODES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setMode(item.key)}
                className={`h-9 shrink-0 rounded-full border px-3 text-xs font-semibold transition ${mode === item.key ? 'border-[#143250] bg-[#143250] text-white' : 'border-[#d9e4ef] bg-white text-[#31475d] hover:border-[#bfd0e1]'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-[12px] border border-[#d9e4ef] bg-[#f8fbff] p-1">
            {[
              { key: 'table', label: 'Table' },
              { key: 'cards', label: 'Cards' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setViewMode(item.key)}
                className={`h-8 rounded-[9px] px-3 text-xs font-semibold transition ${viewMode === item.key ? 'bg-white text-[#143250] shadow-[0_5px_12px_rgba(15,23,42,0.08)]' : 'text-[#60758d] hover:text-[#143250]'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
      className="min-w-0"
    >
      {!rows.length ? (
        <CompactEmptyState title="Performance metrics will appear once consultants begin processing applications." description="Add consultants and assign applications to unlock rankings." />
      ) : (
        <>
          <div className={`${viewMode === 'table' ? 'block' : 'hidden'} overflow-x-auto rounded-[18px] border border-[#e1e9f2]`}>
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr>
                  <HeaderCell className="w-20">Rank</HeaderCell>
                  <HeaderCell>Consultant</HeaderCell>
                  <HeaderCell>Branch</HeaderCell>
                  <HeaderCell>Pipeline</HeaderCell>
                  <HeaderCell>Applications</HeaderCell>
                  <HeaderCell>Approval</HeaderCell>
                  <HeaderCell>Registrations</HeaderCell>
                  <HeaderCell>Forecast Revenue</HeaderCell>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id || row.consultant} className="h-[68px] border-t border-[#edf2f7] bg-white transition hover:bg-[#fbfdff]">
                    <td className="px-4 py-3">
                      <span className={`inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-full border px-2 text-xs font-semibold ${consultantRankTone(row.rank)}`}>
                        {row.rank <= 3 ? <Medal size={14} /> : null}{row.rank}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => row.href && navigate(row.href)} className="text-left">
                        <span className="block text-sm font-semibold text-[#142132]">{row.consultant}</span>
                        <span className="mt-1 block text-xs text-[#71869d]">{row.email || 'No email captured'}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#31475d]">{row.branch || 'Unassigned'}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-[#142132]">{formatCurrency(row.pipelineValue)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-[#142132]">{row.activeApplications || 0}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-[#142132]">{formatNullablePercent(row.approvalRate)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-[#142132]">{row.registrations || 0}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-[#142132]">{formatNullableCurrency(row.forecastRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={`${viewMode === 'cards' ? 'grid' : 'hidden'} gap-3 md:grid-cols-2 xl:grid-cols-3`}>
            {rows.map((row) => (
              <button key={row.id || row.consultant} type="button" onClick={() => row.href && navigate(row.href)} className="rounded-[18px] border border-[#e1e9f2] bg-white p-4 text-left">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#142132]">{row.consultant}</p>
                    <p className="mt-1 text-xs text-[#71869d]">{row.branch || 'Unassigned'} · {row.activeApplications || 0} applications</p>
                  </div>
                  <span className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-xs font-semibold ${consultantRankTone(row.rank)}`}>{row.rank}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <SummaryMetric label="Selected" value={getLeaderboardModeValue(row, mode)} emphasis />
                  <SummaryMetric label="Approval" value={formatNullablePercent(row.approvalRate)} emphasis />
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </SectionShell>
  )
}

function HqConsultantHealthPanel({ rows = [], navigate = () => {} }) {
  return (
    <SectionShell title="Consultant Health" description="Executive exceptions that need assignment, capacity, or ownership attention." className="min-w-0">
      <div className="grid gap-3">
        {(rows || []).map((row) => (
          <button key={row.key} type="button" onClick={() => row.href && navigate(row.href)} className="rounded-[16px] border border-[#e1e9f2] bg-[#fbfdff] p-4 text-left transition hover:border-[#bfd0e1] hover:bg-white">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#142132]">{row.label}</p>
                <p className="mt-1 text-xs leading-5 text-[#60758d]">{row.description}</p>
              </div>
              <span className="text-2xl font-semibold leading-none text-[#142132]">{row.count ?? 0}</span>
            </div>
            <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#24518a]">{row.actionLabel || 'View'} <ArrowRight size={13} /></span>
          </button>
        ))}
      </div>
    </SectionShell>
  )
}

function HqConsultantDistributionPanel({ title = '', description = '', rows = [], total = 0, mode = 'workload' }) {
  return (
    <SectionShell title={title} description={description} className="min-w-0">
      <div className="grid gap-4">
        {(rows || []).map((row) => {
          const percentValue = total ? Math.round((Number(row.count || 0) / total) * 100) : 0
          const tone = mode === 'workload' && row.key === 'over-capacity'
            ? 'bg-[#d9534f]'
            : mode === 'workload' && row.key === 'high-utilisation'
              ? 'bg-[#d89a32]'
              : 'bg-[#2f7d56]'
          return (
            <article key={row.key} className="rounded-[16px] border border-[#e1e9f2] bg-[#fbfdff] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[#142132]">{row.label}</p>
                  <p className="mt-1 text-xs leading-5 text-[#60758d]">{row.description}</p>
                </div>
                <span className="text-xl font-semibold leading-none text-[#142132]">{row.count || 0}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e8eef5]">
                <span className={`block h-full rounded-full ${tone}`} style={{ width: `${percentValue}%` }} />
              </div>
            </article>
          )
        })}
      </div>
    </SectionShell>
  )
}

function capacityBarTone(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'overloaded' || normalized.includes('over')) return 'bg-[#d9534f]'
  if (normalized === 'busy' || normalized === 'high') return 'bg-[#d89a32]'
  if (normalized === 'low') return 'bg-[#6f91b4]'
  return 'bg-[#2f7d56]'
}

function HqConsultantWorkloadHeatmap({ rows = [], navigate = () => {} }) {
  return (
    <SectionShell title="Workload Heatmap" description="Capacity pressure by consultant, sorted by utilisation.">
      {!rows.length ? (
        <CompactEmptyState title="No workload data yet." description="Capacity appears once applications are assigned." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <button key={row.id || row.consultant} type="button" onClick={() => row.href && navigate(row.href)} className="rounded-[16px] border border-[#e1e9f2] bg-[#fbfdff] p-4 text-left transition hover:border-[#bfd0e1] hover:bg-white">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#142132]">{row.consultant}</p>
                  <p className="mt-1 truncate text-xs text-[#71869d]">{row.branch || 'Unassigned'} · {row.activeApplications || 0} files</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${riskTone(row.capacityStatus)}`}>{row.capacityStatus || 'Light'}</span>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs font-semibold text-[#60758d]">
                  <span>Capacity</span>
                  <span>{row.capacityPercent || 0}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e8eef5]">
                  <span className={`block h-full rounded-full ${capacityBarTone(row.capacityStatus)}`} style={{ width: `${Math.min(100, Number(row.capacityPercent || 0))}%` }} />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </SectionShell>
  )
}

function MiniRankingTable({ title = '', rows = [], valueResolver = () => '' }) {
  return (
    <article className="rounded-[18px] border border-[#e1e9f2] bg-[#fbfdff] p-4">
      <p className="text-sm font-semibold text-[#142132]">{title}</p>
      <div className="mt-4 space-y-3">
        {!rows.length ? <p className="text-sm text-[#60758d]">Not enough data</p> : null}
        {rows.map((row) => (
          <div key={row.id || row.consultant} className="flex items-center justify-between gap-4 rounded-[14px] bg-white px-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#142132]">{row.consultant}</p>
              <p className="mt-1 truncate text-xs text-[#71869d]">{row.branch || 'Unassigned'}</p>
            </div>
            <p className="shrink-0 text-sm font-semibold text-[#24518a]">{valueResolver(row)}</p>
          </div>
        ))}
      </div>
    </article>
  )
}

function HqConsultantRankings({ rankings = {} }) {
  return (
    <SectionShell title="Executive Rankings" description="Revenue, conversion, and registration leaders at a glance.">
      <div className="grid gap-4 lg:grid-cols-3">
        <MiniRankingTable title="Revenue Ranking" rows={rankings.revenue || []} valueResolver={(row) => formatNullableCurrency(row.forecastRevenue)} />
        <MiniRankingTable title="Conversion Ranking" rows={rankings.conversion || []} valueResolver={(row) => formatNullablePercent(row.approvalRate)} />
        <MiniRankingTable title="Registration Ranking" rows={rankings.registrations || []} valueResolver={(row) => `${row.registrations || 0}`} />
      </div>
    </SectionShell>
  )
}

function HqConsultantDirectory({
  rows = [],
  regions = [],
  branches = [],
  canManage = false,
  onView = () => {},
  onAssignBranch = () => {},
  onReassign = () => {},
  onEdit = () => {},
  onDeactivate = () => {},
  onAdd = () => {},
}) {
  const [search, setSearch] = useState('')
  const [regionId, setRegionId] = useState('all')
  const [branchId, setBranchId] = useState('all')
  const [status, setStatus] = useState('all')
  const [workload, setWorkload] = useState('all')
  const [role, setRole] = useState('all')
  const [showFilters, setShowFilters] = useState(false)

  const roleOptions = useMemo(() => {
    const roles = [...new Set(rows.map((row) => normalizeText(row.role)).filter(Boolean))]
    return [{ value: 'all', label: 'All Roles' }, ...roles.map((item) => ({ value: item, label: formatRoleLabel(item) }))]
  }, [rows])
  const regionOptions = useMemo(
    () => [{ value: 'all', label: 'All Regions' }, ...regions.map((region) => ({ value: normalizeText(region.id), label: region.name || region.region || 'Region' }))],
    [regions],
  )
  const branchOptions = useMemo(
    () => [{ value: 'all', label: 'All Branches' }, ...branches.map((branch) => ({ value: normalizeText(branch.id), label: branch.name || branch.branch || 'Branch' }))],
    [branches],
  )
  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ]
  const workloadOptions = [
    { value: 'all', label: 'All Workloads' },
    { value: 'light', label: 'Light' },
    { value: 'normal', label: 'Normal' },
    { value: 'busy', label: 'Busy' },
    { value: 'overloaded', label: 'Overloaded' },
  ]
  const activeFilterCount = [regionId, branchId, status, workload, role].filter((value) => value !== 'all').length
  const filteredRows = useMemo(() => {
    const query = normalizeLower(search)
    return rows.filter((row) => {
      const matchesSearch = !query || [
        row.consultant,
        row.email,
        row.branch,
        row.region,
        row.role,
      ].some((value) => normalizeLower(value).includes(query))
      const matchesRegion = regionId === 'all' || normalizeText(row.regionId) === regionId
      const matchesBranch = branchId === 'all' || normalizeText(row.branchId) === branchId
      const matchesStatus = status === 'all' || normalizeLower(row.status) === status
      const matchesWorkload = workload === 'all' || normalizeLower(row.capacityStatus) === workload
      const matchesRole = role === 'all' || normalizeText(row.role) === role
      return matchesSearch && matchesRegion && matchesBranch && matchesStatus && matchesWorkload && matchesRole
    })
  }, [branchId, regionId, role, rows, search, status, workload])

  return (
    <SectionShell
      title="Consultant Directory"
      description="Operational roster kept secondary to performance, with branch, workload, pipeline, and status controls."
      action={canManage ? <CommandButton icon={Plus} variant="primary" onClick={onAdd}>Add Consultant</CommandButton> : null}
    >
      {!rows.length ? (
        <CompactEmptyState
          title="Build Your Consultant Team"
          description="Add your first consultant to begin assigning applications and tracking performance."
          action={canManage ? <CommandButton icon={Plus} variant="primary" onClick={onAdd}>Add Consultant</CommandButton> : null}
        />
      ) : (
        <>
          <div className="mb-4 rounded-[18px] border border-[#e1e9f2] bg-[#fbfdff] p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <label className="relative block min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8da1b6]" size={18} />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search consultant, email, branch or region..."
                  className="h-12 w-full rounded-[14px] border border-[#d9e4ef] bg-white pl-12 pr-4 text-sm font-medium text-[#17324d] outline-none transition placeholder:text-[#8da1b6] focus:border-[#24518a] focus:ring-4 focus:ring-[#24518a]/10"
                />
              </label>
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden text-xs font-semibold text-[#71869d] sm:inline">{filteredRows.length} of {rows.length} consultants</span>
                <button
                  type="button"
                  onClick={() => setShowFilters((value) => !value)}
                  className={`inline-flex h-12 items-center gap-2 rounded-[14px] border px-4 text-sm font-semibold transition ${showFilters || activeFilterCount ? 'border-[#143250] bg-[#143250] text-white' : 'border-[#d9e4ef] bg-white text-[#31475d] hover:border-[#bfd0e1]'}`}
                >
                  <SlidersHorizontal size={16} />
                  Filters
                  {activeFilterCount ? <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{activeFilterCount}</span> : null}
                </button>
              </div>
            </div>
            {showFilters ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {[
                  { key: 'region', label: 'Region', value: regionId, onChange: setRegionId, options: regionOptions },
                  { key: 'branch', label: 'Branch', value: branchId, onChange: setBranchId, options: branchOptions },
                  { key: 'status', label: 'Status', value: status, onChange: setStatus, options: statusOptions },
                  { key: 'workload', label: 'Workload', value: workload, onChange: setWorkload, options: workloadOptions },
                  { key: 'role', label: 'Role', value: role, onChange: setRole, options: roleOptions },
                ].map((filter) => (
                  <label key={filter.key} className="grid gap-1.5">
                    <span className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7d90a5]">{filter.label}</span>
                    <select
                      value={filter.value}
                      onChange={(event) => filter.onChange(event.target.value)}
                      className="h-11 rounded-[13px] border border-[#d9e4ef] bg-white px-3 text-sm font-semibold text-[#17324d] outline-none transition focus:border-[#24518a] focus:ring-4 focus:ring-[#24518a]/10"
                    >
                      {filter.options.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
          {!filteredRows.length ? (
            <CompactEmptyState title="No consultants match these filters." description="Try a broader region, branch, workload, role, or status filter." />
          ) : (
            <div className="-mx-1 overflow-x-auto px-1 pb-2">
              <div className="flex min-w-max gap-4">
              {filteredRows.map((row) => {
                const noBranch = !normalizeText(row.branchId) || normalizeLower(row.branch) === 'unassigned'
                const inactive = normalizeLower(row.status) === 'inactive'
                const avatarUrl = getConsultantAvatarUrl(row)
                const capacityPercent = Math.min(100, Number(row.capacityPercent || 0))
                return (
                  <article
                    key={row.id || row.email || row.consultant}
                    className={`group flex min-h-[320px] w-[min(86vw,390px)] shrink-0 flex-col rounded-[22px] border border-[#dbe5f0] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.035)] transition hover:-translate-y-0.5 hover:border-[#bfd0e1] hover:shadow-[0_18px_42px_rgba(15,23,42,0.07)] ${inactive ? 'opacity-75' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <button type="button" onClick={() => onView(row)} className="flex min-w-0 items-center gap-4 text-left">
                        <span className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[22px] bg-[linear-gradient(145deg,#eef5ff,#f8fbff)] text-lg font-bold text-[#24518a] ring-1 ring-[#dbe7f2]">
                          {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : getInitials(row.consultant || row.name)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-base font-semibold text-[#142132]">{row.consultant || row.name || 'Unnamed consultant'}</span>
                          <span className="mt-1 block truncate text-xs font-medium text-[#71869d]">{row.email || 'No email captured'}</span>
                          <span className="mt-2 inline-flex rounded-full bg-[#f4f8fc] px-2.5 py-1 text-[11px] font-semibold text-[#52677f]">{formatRoleLabel(row.role)}</span>
                        </span>
                      </button>
                      <StatusPill status={row.status || 'active'} />
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[16px] bg-[#f8fbff] p-3">
                        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-[#7d90a5]">Region</p>
                        <p className="mt-1 truncate text-sm font-semibold text-[#17324d]">{row.region || 'Unassigned'}</p>
                      </div>
                      <div className="rounded-[16px] bg-[#f8fbff] p-3">
                        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-[#7d90a5]">Branch</p>
                        <div className="mt-1 min-w-0">
                          {noBranch ? <BranchWarningPill>Unassigned</BranchWarningPill> : <p className="truncate text-sm font-semibold text-[#17324d]">{row.branch}</p>}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <SummaryMetric label="Applications" value={row.activeApplications || 0} emphasis />
                      <SummaryMetric label="Pipeline" value={formatCurrency(row.pipelineValue)} emphasis />
                      <SummaryMetric label="Approval" value={formatNullablePercent(row.approvalRate)} emphasis />
                      <SummaryMetric label="Registrations" value={row.registrations || 0} emphasis />
                    </div>

                    <div className="mt-4 rounded-[16px] bg-[#fbfdff] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-[#17324d]">Capacity</p>
                          <p className="mt-0.5 text-xs text-[#71869d]">{row.awaitingDocs || 0} awaiting docs</p>
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${riskTone(row.capacityStatus)}`}>{row.capacityStatus || 'Light'}</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e8eef5]">
                        <span className={`block h-full rounded-full ${capacityBarTone(row.capacityStatus)}`} style={{ width: `${capacityPercent}%` }} />
                      </div>
                    </div>

                    <div className="mt-auto flex flex-wrap gap-2 pt-5">
                      <button type="button" onClick={() => onView(row)} className="inline-flex h-9 items-center gap-1.5 rounded-[11px] border border-[#d9e4ef] px-3 text-xs font-semibold text-[#24518a] transition hover:border-[#bfd0e1] hover:bg-[#f8fbff]"><Eye size={13} /> View</button>
                      {canManage ? (
                        <>
                          <button type="button" onClick={() => onAssignBranch(row)} className="inline-flex h-9 items-center gap-1.5 rounded-[11px] border border-[#d9e4ef] px-3 text-xs font-semibold text-[#31475d] transition hover:border-[#bfd0e1] hover:bg-[#f8fbff]"><Building2 size={13} /> Assign</button>
                          <button type="button" onClick={() => onReassign(row)} className="inline-flex h-9 items-center gap-1.5 rounded-[11px] border border-[#d9e4ef] px-3 text-xs font-semibold text-[#31475d] transition hover:border-[#bfd0e1] hover:bg-[#f8fbff]"><ArrowRight size={13} /> Reassign</button>
                          <button type="button" onClick={() => onEdit(row)} className="inline-flex h-9 items-center gap-1.5 rounded-[11px] border border-[#d9e4ef] px-3 text-xs font-semibold text-[#31475d] transition hover:border-[#bfd0e1] hover:bg-[#f8fbff]"><Pencil size={13} /> Edit</button>
                          <button type="button" onClick={() => onDeactivate(row)} className="inline-flex h-9 items-center rounded-[11px] border border-[#f3d4d4] px-3 text-xs font-semibold text-[#8f2f2f] transition hover:bg-[#fff7f7]">Deactivate</button>
                        </>
                      ) : null}
                    </div>
                  </article>
                )
              })}
              </div>
            </div>
          )}
        </>
      )}
    </SectionShell>
  )
}

function HqConsultantCommandCentre({
  snapshot = {},
  canManage = false,
  navigate = () => {},
  onView = () => {},
  onAdd = () => {},
  onAssignBranch = () => {},
  onReassign = () => {},
  onEdit = () => {},
  onDeactivate = () => {},
}) {
  const command = snapshot.overview?.consultantCommandCentre || {}
  const directoryRows = command.directory || []
  return (
    <>
      <HqConsultantExecutiveKpiStrip summary={command.summary || {}} rows={directoryRows} />
      <HqConsultantLeaderboard leaderboards={command.leaderboards || {}} navigate={navigate} />
      <HqConsultantWorkloadHeatmap rows={command.workloadHeatmap || []} navigate={navigate} />
      <HqConsultantDirectory
        rows={directoryRows}
        regions={snapshot.regions || []}
        branches={snapshot.branches || []}
        canManage={canManage}
        onView={onView}
        onAdd={onAdd}
        onAssignBranch={onAssignBranch}
        onReassign={onReassign}
        onEdit={onEdit}
        onDeactivate={onDeactivate}
      />
    </>
  )
}

function OrganisationOverviewDashboard({ snapshot = {}, navigate = () => {}, canManage = false }) {
  const overview = snapshot.overview || {}
  if (isHqOrganisationScope(snapshot)) {
    return <HqOrganisationCommandCentre snapshot={snapshot} navigate={navigate} canManage={canManage} />
  }
  return (
    <>
      <OverviewSummaryCards cards={overview.summaryCards || []} />
      <OrganisationSetupState setupState={overview.setupState} navigate={navigate} canManage={canManage} />
      <OrganisationStructureSnapshot structure={overview.structure || {}} navigate={navigate} />
      <NeedsAttention alerts={overview.alerts || []} navigate={navigate} canManage={canManage} />
      <PerformanceSnapshot performance={overview.performance || {}} />
      <RecentOrganisationActivity rows={overview.recentActivity || []} />
    </>
  )
}

function HierarchySelectionUnavailable({ title = '', description = '', onBack = () => {}, backLabel = 'Back' }) {
  return (
    <SectionShell eyebrow="Selection unavailable" title={title} description={description} action={<BreadcrumbButton onClick={onBack}>{backLabel}</BreadcrumbButton>}>
      <BondEmptyState compact title={title} description={description} />
    </SectionShell>
  )
}

function FilterBar({
  searchPlaceholder = 'Search organisation...',
  searchValue = '',
  onSearchChange = () => {},
  filters = [],
  action = null,
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="relative min-w-0 xl:w-80">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8aa0b6]" />
        <input
          type="search"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          className="h-10 w-full rounded-[12px] border border-[#d9e4ef] bg-white pl-9 pr-3 text-sm text-[#142132] outline-none transition placeholder:text-[#91a3b5] focus:border-[#9fb8d1]"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((filter) => (
          <label key={filter.key} className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[#d9e4ef] bg-white px-3 text-sm font-semibold text-[#31475d]">
            {filter.icon || <SlidersHorizontal size={15} />}
            {filter.label}
            <select value={filter.value} onChange={(event) => filter.onChange(event.target.value)} className="bg-transparent text-sm font-semibold outline-none">
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ))}
        {action}
      </div>
    </div>
  )
}

function SummaryMetric({ label = '', value = '', emphasis = false }) {
  return (
    <div className="rounded-[16px] border border-[#e1e9f2] bg-[#fbfdff] px-4 py-3">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7d90a5]">{label}</p>
      <p className={`mt-2 text-sm ${emphasis ? 'font-semibold text-[#142132]' : 'text-[#5f7287]'}`}>{value}</p>
    </div>
  )
}

function SummaryCard({
  title = '',
  eyebrow = '',
  status = '',
  detail = '',
  stats = [],
  onClick = null,
  ctaLabel = 'Open',
}) {
  const clickable = typeof onClick === 'function'
  return (
    <article
      className={`rounded-[20px] border border-[#dbe5f0] bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.035)] transition ${clickable ? 'cursor-pointer hover:border-[#bfd0e1] hover:bg-[#fbfdff]' : ''}`.trim()}
      onClick={clickable ? onClick : undefined}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {eyebrow ? <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7d90a5]">{eyebrow}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-[#142132]">{title}</h3>
            {status ? <StatusPill status={status} /> : null}
          </div>
          {detail ? <p className="mt-2 text-sm leading-6 text-[#60758d]">{detail}</p> : null}
        </div>
        {clickable ? (
          <button type="button" className="inline-flex items-center gap-2 text-sm font-semibold text-[#24518a]">
            {ctaLabel}
            <ArrowRight size={15} />
          </button>
        ) : null}
      </div>
      {stats.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => <SummaryMetric key={stat.label} label={stat.label} value={stat.value} emphasis={stat.emphasis} />)}
        </div>
      ) : null}
    </article>
  )
}

function OrganisationApplicationsTable({ rows = [], showBranchColumn = false, showRegionColumn = false }) {
  const navigate = useNavigate()
  const colSpan = 8 + (showRegionColumn ? 1 : 0)

  return (
    <BondSectionCard
      eyebrow="Scoped Management View"
      title="Organisation Applications"
      description="This reuses the active Applications tracker and limits records to the scope this user can access."
      padded={false}
      contentClassName="mt-0"
    >
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <HeaderCell>Buyer</HeaderCell>
              {showRegionColumn ? <HeaderCell>Region</HeaderCell> : null}
              <HeaderCell>Branch</HeaderCell>
              <HeaderCell>Consultant</HeaderCell>
              <HeaderCell>Stage</HeaderCell>
              <HeaderCell>Bank</HeaderCell>
              <HeaderCell>Status</HeaderCell>
              <HeaderCell>Last Updated</HeaderCell>
              <HeaderCell>Next Action</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className="cursor-pointer border-t border-[#edf2f7] transition hover:bg-[#fbfdff]"
                onClick={() => row.transactionId && navigate(`/bond/files/${row.transactionId}`)}
              >
                <td className="px-4 py-4 align-top">
                  <p className="text-sm font-semibold text-[#142132]">{row.client || 'Buyer pending'}</p>
                  <p className="mt-1 text-xs text-[#71869d]">{formatApplicationReference(row)}</p>
                </td>
                {showRegionColumn ? <td className="px-4 py-4 align-top text-sm text-[#17324d]">{row.region || 'Unassigned'}</td> : null}
                <td className="px-4 py-4 align-top text-sm text-[#17324d]">{showBranchColumn ? row.branch || 'Unassigned' : row.branch || 'Own book'}</td>
                <td className="px-4 py-4 align-top text-sm text-[#17324d]">{row.consultant || 'Unassigned consultant'}</td>
                <td className="px-4 py-4 align-top text-sm font-semibold text-[#17324d]">{row.financeStageLabel || 'Pipeline Review'}</td>
                <td className="px-4 py-4 align-top text-sm text-[#17324d]">{row.bank || 'Bank pending'}</td>
                <td className="px-4 py-4 align-top">
                  <BondTransactionStatusBadge status={row.status} label={row.registrationStatus || row.financeStageLabel || 'In progress'} />
                </td>
                <td className="px-4 py-4 align-top text-sm text-[#60758d]">{row.lastActivityLabel || 'No activity'}</td>
                <td className="px-4 py-4 align-top text-sm text-[#17324d]">{row.nextAction || 'No next action set'}</td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-6">
                  <BondEmptyState compact title="No applications found." description="Applications in your allowed scope will appear here as they move beyond intake." />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </BondSectionCard>
  )
}

function OperationalHealth({ items = [] }) {
  const toneMap = {
    amber: 'border-[#fed7aa] bg-[#fff7ed] text-[#d97706]',
    blue: 'border-[#cfe2f7] bg-[#eef6ff] text-[#2368b3]',
    green: 'border-[#cdeed9] bg-[#eefbf3] text-[#20814f]',
  }
  return (
    <SectionShell eyebrow="Intelligence" title="Operational Health" description="Organisation-wide pressure points and performance signals.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <article key={item.key} className="rounded-[18px] border border-[#e1e9f2] bg-[#fbfdff] p-4">
            <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full border ${toneMap[item.tone] || toneMap.blue}`}>
              {item.tone === 'green' ? <ShieldCheck size={18} /> : <AlertTriangle size={18} />}
            </span>
            <p className="mt-4 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7d90a5]">{item.label}</p>
            <p className="mt-2 text-base font-semibold text-[#142132]">{item.title}</p>
            <p className="mt-1 text-sm leading-5 text-[#60758d]">{item.detail}</p>
          </article>
        ))}
      </div>
    </SectionShell>
  )
}

function HierarchyNode({ node = {}, depth = 0, canManage = false }) {
  const hasChildren = Array.isArray(node.children) && node.children.length > 0
  return (
    <div className={`${depth ? 'ml-5 border-l border-[#e3ebf4] pl-4' : ''}`}>
      <article className="mb-3 rounded-[18px] border border-[#e1e9f2] bg-[#fbfdff] p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-[#142132]">{node.name}</p>
              <span className="rounded-full border border-[#d9e4ef] bg-white px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#71869d]">{node.type}</span>
              <StatusPill status={node.status} />
            </div>
            <p className="mt-2 text-sm text-[#60758d]">
              {node.activeApplications} active files · {formatPercent(node.approvalRate)} approval · {formatLeadTime(node.avgLeadTime)} lead time · {node.bottleneck}
            </p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              {['Add child', 'Invite', 'Assign manager', 'View performance'].map((label) => (
                <button key={label} type="button" className="rounded-[10px] border border-[#d9e4ef] bg-white px-3 py-2 text-xs font-semibold text-[#31475d] transition hover:border-[#bfd0e1]">
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </article>
      {hasChildren ? node.children.map((child) => <HierarchyNode key={child.id || child.name} node={child} depth={depth + 1} canManage={canManage} />) : null}
    </div>
  )
}

function OrganisationHierarchy({ tree = null, canManage = false }) {
  if (!tree) return <BondEmptyState compact title="No hierarchy yet." description="Add your first branch to start building your organisation structure." />
  return (
    <SectionShell
      eyebrow="Structure"
      title="Organisation Hierarchy"
      description="A scoped command tree showing HQ, regions, branches, consultants, and operational pressure."
    >
      <HierarchyNode node={tree} canManage={canManage} />
    </SectionShell>
  )
}

function RecentActivity({ rows = [] }) {
  return (
    <SectionShell eyebrow="Live Activity" title="Recent Activity" description="Latest scoped movement across branches, consultants, documents, and applications.">
      <div className="divide-y divide-[#edf2f7] overflow-hidden rounded-[18px] border border-[#e1e9f2]">
        {rows.map((row) => (
          <a key={row.id} href={row.href} className="flex flex-col gap-2 bg-white px-4 py-4 transition hover:bg-[#fbfdff] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#142132]">{row.description}</p>
              <p className="mt-1 text-xs text-[#71869d]">{row.actor} · {row.branch} · {row.region}</p>
            </div>
            <span className="text-xs font-semibold text-[#60758d]">{row.timestamp}</span>
          </a>
        ))}
        {!rows.length ? <BondEmptyState compact title="No recent organisation activity." description="Activity appears here as applications, documents, and team assignments move." /> : null}
      </div>
    </SectionShell>
  )
}

function PermissionsTable({ rows = [], showRegionColumn = false, showBranchColumn = false }) {
  return (
    <SectionShell eyebrow="Access Control" title="Permissions & Scope" description="A clear view of who can see and manage each part of the bond organisation.">
      <div className="overflow-x-auto">
        <table className="min-w-[900px] border-collapse">
          <thead>
            <tr>
              <HeaderCell>User</HeaderCell>
              <HeaderCell>Role</HeaderCell>
              <HeaderCell>Scope</HeaderCell>
              {showRegionColumn ? <HeaderCell>Region</HeaderCell> : null}
              {showBranchColumn ? <HeaderCell>Branch</HeaderCell> : null}
              <HeaderCell>Permissions</HeaderCell>
              <HeaderCell>Status</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id || row.email || row.name} className="border-t border-[#edf2f7]">
                <td className="px-4 py-4">
                  <p className="text-sm font-semibold text-[#142132]">{row.name}</p>
                  <p className="mt-1 text-xs text-[#71869d]">{row.email}</p>
                </td>
                <td className="px-4 py-4 text-sm text-[#17324d]">{row.workspaceRole || row.role || 'Viewer'}</td>
                <td className="px-4 py-4 text-sm text-[#17324d]">{row.scope_level || row.scopeLevel || row.scope || 'Assigned'}</td>
                {showRegionColumn ? <td className="px-4 py-4 text-sm text-[#17324d]">{row.region || row.regionId || 'Scoped'}</td> : null}
                {showBranchColumn ? <td className="px-4 py-4 text-sm text-[#17324d]">{row.branch || row.workspaceUnitId || 'Scoped'}</td> : null}
                <td className="px-4 py-4 text-sm text-[#60758d]">{row.workspaceRole === 'consultant' ? 'Own applications only' : 'Scoped management'}</td>
                <td className="px-4 py-4"><StatusPill status={row.status || 'Active'} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionShell>
  )
}

function OrganisationSettingsPanel({ canManage = false, onOpenSettings = () => {} }) {
  if (!canManage) {
    return (
      <SectionShell eyebrow="Settings" title="Organisation Settings">
        <BondEmptyState compact title="You do not have permission to manage organisation settings." description="Ask an HQ administrator to update structure, permissions, or workspace settings." />
      </SectionShell>
    )
  }
  return (
    <SectionShell eyebrow="Settings" title="Organisation Settings" description="Structure, invitation, branch, and permission controls for HQ administrators.">
      <div className="grid gap-4 md:grid-cols-3">
        {['Branch structure', 'User invitations', 'Permission scopes'].map((label) => (
          <article key={label} className="rounded-[18px] border border-[#e1e9f2] bg-[#fbfdff] p-4">
            <p className="text-sm font-semibold text-[#142132]">{label}</p>
            <p className="mt-2 text-sm leading-5 text-[#60758d]">Manage this workspace control from the command centre.</p>
            <button type="button" onClick={onOpenSettings} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#24518a]">
              Open <ArrowRight size={15} />
            </button>
          </article>
        ))}
      </div>
    </SectionShell>
  )
}

function FieldError({ message = '' }) {
  return message ? <p className="mt-1 text-xs font-semibold text-[#b42318]">{message}</p> : null
}

function RegionFormModal({
  modal = null,
  managerOptions = [],
  onChange = () => {},
  onClose = () => {},
  onSubmit = () => {},
}) {
  if (!modal?.mode) return null
  const isAssign = modal.mode === 'assign'
  const isEdit = modal.mode === 'edit'
  const title = isAssign ? 'Assign Regional Manager' : isEdit ? 'Edit Region' : 'Add Region'
  const description = isAssign
    ? 'Choose the user who should own this region.'
    : isEdit
      ? 'Update the regional record for this bond origination network.'
      : 'Create a new region for this bond origination network.'
  const submitLabel = isAssign ? 'Assign Manager' : isEdit ? 'Save Region' : 'Create Region'
  const values = modal.values || {}
  const fieldErrors = modal.fieldErrors || {}

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
      <div className="max-h-[calc(100dvh-32px)] w-full max-w-2xl overflow-y-auto rounded-[24px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#7d90a5]">Regions</p>
            <h2 className="mt-2 text-xl font-semibold text-[#142132]">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#60758d]">{description}</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d9e4ef] text-[#60758d] transition hover:bg-[#f8fbff]">
            <X size={16} />
          </button>
        </div>

        {modal.error ? (
          <p className="mt-4 rounded-[14px] border border-[#fecaca] bg-[#fff5f5] px-4 py-3 text-sm font-semibold text-[#9f2a2a]">{modal.error}</p>
        ) : null}

        <div className="mt-5 grid gap-4">
          {!isAssign ? (
            <>
              <label className="block">
                <span className="text-sm font-semibold text-[#31475d]">Region Name</span>
                <input
                  value={values.name || ''}
                  onChange={(event) => onChange('name', event.target.value)}
                  className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]"
                />
                <FieldError message={fieldErrors.name} />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold text-[#31475d]">Region Code</span>
                  <input
                    value={values.code || ''}
                    onChange={(event) => onChange('code', event.target.value.toUpperCase())}
                    className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] px-3 text-sm uppercase text-[#142132] outline-none focus:border-[#9fb8d1]"
                  />
                  <FieldError message={fieldErrors.code} />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-[#31475d]">Status</span>
                  <select
                    value={values.status || 'active'}
                    onChange={(event) => onChange('status', event.target.value)}
                    className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] bg-white px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <FieldError message={fieldErrors.status} />
                </label>
              </div>
            </>
          ) : null}
          <label className="block">
            <span className="text-sm font-semibold text-[#31475d]">Regional Manager</span>
            <select
              value={values.managerUserId || ''}
              onChange={(event) => onChange('managerUserId', event.target.value)}
              className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] bg-white px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]"
            >
              <option value="">No manager assigned</option>
              {managerOptions.map((manager) => (
                <option key={manager.id} value={manager.id}>{manager.name} · {manager.role}</option>
              ))}
            </select>
            <FieldError message={fieldErrors.managerUserId} />
          </label>
          {!isAssign ? (
            <label className="block">
              <span className="text-sm font-semibold text-[#31475d]">Description / Notes</span>
              <textarea
                value={values.notes || ''}
                onChange={(event) => onChange('notes', event.target.value)}
                rows={4}
                className="mt-2 w-full rounded-[12px] border border-[#d9e4ef] px-3 py-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]"
              />
              <FieldError message={fieldErrors.notes} />
            </label>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <CommandButton onClick={onClose}>Cancel</CommandButton>
          <CommandButton icon={isAssign ? UserCheck : Plus} variant="primary" onClick={onSubmit}>
            {modal.submitting ? 'Saving...' : submitLabel}
          </CommandButton>
        </div>
      </div>
    </div>
  )
}

function RegionsWorkspace({
  rows = [],
  canManage = false,
  derived = false,
  onView = () => {},
  onAdd = () => {},
  onEdit = () => {},
  onAssign = () => {},
  onRefresh = () => {},
  onExport = () => {},
}) {
  if (!rows.length) {
    return (
      <SectionShell
        eyebrow="Regions"
        title="Regions"
        description="Manage the regional structure of your bond origination network."
        action={canManage ? <CommandButton icon={Plus} variant="primary" onClick={onAdd}>Add Region</CommandButton> : null}
      >
        <BondEmptyState compact title="No regions yet" description="Create your first region to start building your branch and consultant structure." />
      </SectionShell>
    )
  }

  return (
    <SectionShell
      eyebrow="Regions"
      title="Regions"
      description="Manage the regional structure of your bond origination network."
      action={(
        <div className="flex flex-wrap gap-2">
          {canManage ? <CommandButton icon={Plus} variant="primary" onClick={onAdd}>Add Region</CommandButton> : null}
          <CommandButton icon={Download} onClick={onExport}>Export</CommandButton>
          <CommandButton icon={RefreshCw} onClick={onRefresh}>Refresh</CommandButton>
        </div>
      )}
    >
      {derived ? (
        <p className="mb-4 rounded-[16px] border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-sm text-[#92400e]">
          No configured regions found. Showing regions inferred from current applications.
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-[18px] border border-[#e1e9f2]">
        <table className="min-w-[1180px] border-collapse">
          <thead>
            <tr>
              <HeaderCell>Region</HeaderCell>
              <HeaderCell>Regional Manager</HeaderCell>
              <HeaderCell>Branches</HeaderCell>
              <HeaderCell>Consultants</HeaderCell>
              <HeaderCell>Active Applications</HeaderCell>
              <HeaderCell>Submitted Applications</HeaderCell>
              <HeaderCell>Pending Documents</HeaderCell>
              <HeaderCell>Approval Rate</HeaderCell>
              <HeaderCell>Avg Turnaround</HeaderCell>
              <HeaderCell>Status</HeaderCell>
              <HeaderCell>Action</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-[#edf2f7] bg-white align-top transition hover:bg-[#fbfdff]">
                <td className="px-4 py-4">
                  <p className="text-sm font-semibold text-[#142132]">{row.region || row.name}</p>
                  <p className="mt-1 text-xs text-[#71869d]">{row.code || 'No code'}</p>
                </td>
                <td className="px-4 py-4 text-sm text-[#17324d]">{row.manager || 'Unassigned'}</td>
                <td className="px-4 py-4 text-sm font-semibold text-[#17324d]">{row.branches}</td>
                <td className="px-4 py-4 text-sm font-semibold text-[#17324d]">{row.consultants}</td>
                <td className="px-4 py-4 text-sm font-semibold text-[#17324d]">{row.activeApplications}</td>
                <td className="px-4 py-4 text-sm font-semibold text-[#17324d]">{row.submittedApplications || 0}</td>
                <td className="px-4 py-4 text-sm font-semibold text-[#17324d]">{row.pendingDocuments || row.pendingDocs || 0}</td>
                <td className="px-4 py-4 text-sm font-semibold text-[#17324d]">{formatPercent(row.approvalRate)}</td>
                <td className="px-4 py-4 text-sm text-[#17324d]">{formatLeadTime(row.averageTurnaround || row.avgLeadTime)}</td>
                <td className="px-4 py-4"><StatusPill status={row.status || 'active'} /></td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => onView(row)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#d9e4ef] px-2.5 py-1.5 text-xs font-semibold text-[#24518a]">
                      <Eye size={13} /> View
                    </button>
                    {canManage ? (
                      <>
                        <button type="button" onClick={() => onEdit(row)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#d9e4ef] px-2.5 py-1.5 text-xs font-semibold text-[#31475d]">
                          <Pencil size={13} /> Edit
                        </button>
                        <button type="button" onClick={() => onAssign(row)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#d9e4ef] px-2.5 py-1.5 text-xs font-semibold text-[#31475d]">
                          <UserCheck size={13} /> Assign
                        </button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionShell>
  )
}

const REGIONAL_COMMAND_TABS = Object.freeze([
  { key: 'overview', label: 'Overview', icon: Network },
  { key: 'applications', label: 'Applications', icon: FileText },
  { key: 'consultants', label: 'Consultants', icon: Users },
  { key: 'partners', label: 'Partners', icon: Route },
  { key: 'performance', label: 'Performance', icon: BarChart3 },
])

function RegionWorkspaceRoute({ workspace = null, snapshot = null, regionId = '', onBack = () => {} }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [applicationFilters, setApplicationFilters] = useState({ branch: 'all', consultant: 'all', stage: 'all', bank: 'all', attention: false })
  const [consultantSort, setConsultantSort] = useState('value')
  const viewModel = useMemo(
    () => buildRegionalCommandCentreViewModel(regionId || workspace?.id, snapshot || {}),
    [regionId, snapshot, workspace?.id],
  )

  if (!workspace && !viewModel) {
    return (
      <HierarchySelectionUnavailable
        title="Region no longer available."
        description="This region could not be found in the current organisation scope."
        onBack={onBack}
        backLabel="Back to Regions"
      />
    )
  }

  const regionCommand = viewModel || buildRegionalCommandCentreViewModel(workspace?.id, snapshot || {}) || null
  if (!regionCommand) {
    return (
      <HierarchySelectionUnavailable
        title="Region no longer available."
        description="This region could not be found in the current organisation scope."
        onBack={onBack}
        backLabel="Back to Regions"
      />
    )
  }

  const branchOptions = regionCommand.branches.map((branch) => ({ value: normalizeText(branch.id || branch.branchId), label: branch.branchName || branch.branch || branch.name }))
  const consultantOptions = regionCommand.consultants.map((consultant) => ({ value: normalizeText(consultant.id), label: consultant.consultant || consultant.name }))
  const stageOptions = [...new Set(regionCommand.applications.map((application) => application.stage).filter(Boolean))].map((stage) => ({ value: stage, label: stage }))
  const bankOptions = [...new Set(regionCommand.applications.map((application) => application.bankName).filter(Boolean))].map((bank) => ({ value: bank, label: bank }))
  const filteredApplications = regionCommand.applications.filter((application) => (
    (applicationFilters.branch === 'all' || normalizeText(application.branchId) === applicationFilters.branch) &&
    (applicationFilters.consultant === 'all' || normalizeText(application.consultantId) === applicationFilters.consultant || normalizeText(application.consultant) === applicationFilters.consultant) &&
    (applicationFilters.stage === 'all' || application.stage === applicationFilters.stage) &&
    (applicationFilters.bank === 'all' || application.bankName === applicationFilters.bank) &&
    (!applicationFilters.attention || application.attentionNeeded)
  ))
  const sortedConsultants = [...regionCommand.consultants].sort((left, right) => {
    if (consultantSort === 'volume') return Number(right.activeApplications || 0) - Number(left.activeApplications || 0)
    if (consultantSort === 'approval') return Number(right.approvalRate || 0) - Number(left.approvalRate || 0)
    if (consultantSort === 'turnaround') return Number(left.averageTurnaround || 999) - Number(right.averageTurnaround || 999)
    return Number(right.revenueContribution || 0) - Number(left.revenueContribution || 0)
  })

  function updateApplicationFilter(key, value) {
    setApplicationFilters((previous) => ({ ...previous, [key]: value }))
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[24px] border border-[#dfe8f2] bg-white px-5 py-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)] sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#60758d]">
              <button type="button" onClick={onBack} className="transition hover:text-[#17324d]">Organisation</button>
              <ArrowRight size={14} />
              <button type="button" onClick={onBack} className="transition hover:text-[#17324d]">Regions</button>
              <ArrowRight size={14} />
              <span className="text-[#142132]">{regionCommand.region.name}</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h1 className="text-[clamp(1.9rem,3vw,3rem)] font-bold leading-none tracking-[-0.03em] text-[#07142b]">{regionCommand.region.name}</h1>
              <StatusPill status={regionCommand.region.status || 'active'} />
            </div>
            <p className="mt-2 text-base font-medium text-[#60758d]">Regional Command Centre</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CommandButton icon={Download} onClick={() => {}}>Download Report</CommandButton>
            <CommandButton icon={SlidersHorizontal} variant="primary" onClick={() => {}}>Actions</CommandButton>
          </div>
        </div>
      </section>

      <RegionalCommandTabs value={activeTab} onChange={setActiveTab} />

      {regionCommand.thinDataMessage ? (
        <section className="rounded-[18px] border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-sm font-semibold text-[#92400e]">
          {regionCommand.thinDataMessage}
        </section>
      ) : null}

      {activeTab === 'overview' ? <RegionalOverviewTab regionCommand={regionCommand} /> : null}
      {activeTab === 'applications' ? (
        <RegionalApplicationsTab
          rows={filteredApplications}
          filters={applicationFilters}
          branchOptions={branchOptions}
          consultantOptions={consultantOptions}
          stageOptions={stageOptions}
          bankOptions={bankOptions}
          onFilterChange={updateApplicationFilter}
        />
      ) : null}
      {activeTab === 'consultants' ? <RegionalConsultantsTab rows={sortedConsultants} sort={consultantSort} onSort={setConsultantSort} /> : null}
      {activeTab === 'partners' ? <RegionalPartnersTab regionCommand={regionCommand} /> : null}
      {activeTab === 'performance' ? <RegionalPerformanceTab regionCommand={regionCommand} /> : null}
    </div>
  )
}

function RegionalCommandTabs({ value = 'overview', onChange = () => {} }) {
  return (
    <section className="overflow-x-auto rounded-[20px] border border-[#dfe8f2] bg-white px-4 shadow-[0_12px_34px_rgba(15,23,42,0.045)] [scrollbar-width:thin]">
      <div className="flex min-w-max gap-2">
        {REGIONAL_COMMAND_TABS.map((tab) => {
          const Icon = tab.icon
          const active = value === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={`relative inline-flex min-h-16 items-center gap-2 px-4 text-sm font-bold transition ${
                active ? 'text-[#07142b]' : 'text-[#526178] hover:text-[#17324d]'
              }`}
            >
              <Icon size={16} />
              {tab.label}
              <span className={`absolute inset-x-2 bottom-0 h-0.5 rounded-full transition ${active ? 'bg-[#07142b]' : 'bg-transparent'}`} />
            </button>
          )
        })}
      </div>
    </section>
  )
}

function RegionalOverviewTab({ regionCommand }) {
  const { metrics } = regionCommand
  const kpis = [
    { label: 'Active Applications', value: formatNumber(metrics.activeApplications), trend: '+12% vs last month', tone: '#2f9e62', icon: FileText, spark: [44, 48, 47, 55, 62, 58, 70, 84] },
    { label: 'Submitted Applications', value: formatNumber(metrics.submittedApplications), trend: '+8% vs last month', tone: '#2563eb', icon: Users, spark: [32, 35, 46, 42, 55, 50, 62, 66] },
    { label: 'Pending Documents', value: formatNumber(metrics.pendingDocuments), trend: '+15% vs last month', tone: '#f97316', icon: AlertTriangle, spark: [16, 17, 24, 25, 18, 27, 32, 30] },
    { label: 'Approval Rate', value: formatPercent(metrics.approvalRate), trend: '+5pp vs last month', tone: '#7c3aed', icon: ShieldCheck, spark: [52, 58, 61, 55, 66, 63, metrics.approvalRate || 68] },
    { label: 'Avg Turnaround', value: formatLeadTime(metrics.averageTurnaround), trend: '-2.1 days vs last month', tone: '#2f9e62', icon: Clock3, spark: [34, 31, 33, 29, 28, 30, metrics.averageTurnaround || 27] },
    { label: 'Revenue Forecast', value: formatCompactCurrency(metrics.revenueForecast), trend: '+18% vs last month', tone: '#4f46e5', icon: DollarSign, spark: [20, 24, 29, 26, 34, 39, 37, 42] },
  ]

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {kpis.map((kpi) => <RegionalKpiCard key={kpi.label} item={kpi} />)}
      </section>

      <RegionalSummaryStrip metrics={metrics} />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.8fr)_minmax(300px,0.95fr)]">
        <RegionalPanel title="Top Performing Branches" action="View all branches">
          <RegionalCommandTable
            minWidth="720px"
            columns={[
              { key: 'branchName', label: 'Branch' },
              { key: 'activeApplications', label: 'Active Apps', render: (row) => formatNumber(row.activeApplications) },
              { key: 'approvalRate', label: 'Approval Rate', render: (row) => formatNullablePercent(row.approvalRate) },
              { key: 'averageTurnaround', label: 'Avg Turnaround', render: (row) => formatLeadTime(row.averageTurnaround) },
              { key: 'revenueForecast', label: 'Revenue Forecast', render: (row) => formatCompactCurrency(row.revenueForecast) },
            ]}
            rows={regionCommand.branches.slice(0, 5)}
          />
        </RegionalPanel>

        <RegionalPanel title="Applications Needing Attention" action="View all">
          <div className="space-y-3">
            {[
              { label: 'Waiting on documents', value: regionCommand.attention.waitingOnDocuments, tone: 'text-[#f97316] bg-[#fff7ed]' },
              { label: 'Overdue applications (>30 days)', value: regionCommand.attention.overdue, tone: 'text-[#b42318] bg-[#fff1f0]' },
              { label: 'Conditions outstanding', value: regionCommand.attention.conditionsOutstanding, tone: 'text-[#24518a] bg-[#eef5ff]' },
              { label: 'Stalled applications', value: regionCommand.attention.stalled, tone: 'text-[#b42318] bg-[#fff1f0]' },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 rounded-[14px] border border-[#edf2f7] bg-white px-4 py-3">
                <span className="flex min-w-0 items-center gap-3 text-sm font-bold text-[#17324d]">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${row.tone}`}>
                    <AlertTriangle size={15} />
                  </span>
                  <span className="truncate">{row.label}</span>
                </span>
                <span className="text-sm font-bold text-[#07142b]">{formatNumber(row.value)}</span>
              </div>
            ))}
          </div>
        </RegionalPanel>

        <RegionalPanel title="Consultant Capacity">
          <CapacityDonut rows={regionCommand.consultantCapacity} total={regionCommand.metrics.consultants} />
        </RegionalPanel>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.15fr)_minmax(320px,0.9fr)]">
        <RegionalPanel title="Bank Approval Mix" action="View full breakdown">
          <BankMixCard rows={regionCommand.bankMix} />
        </RegionalPanel>
        <RegionalPanel title="Approval Rate Trend" action="Last 6 months">
          <ApprovalTrendChart rows={regionCommand.trend} />
        </RegionalPanel>
        <RegionalPanel title="Risk Alerts" action="View all alerts">
          <RiskAlertList rows={regionCommand.riskAlerts} />
        </RegionalPanel>
      </section>
    </div>
  )
}

function RegionalApplicationsTab({ rows = [], filters = {}, branchOptions = [], consultantOptions = [], stageOptions = [], bankOptions = [], onFilterChange = () => {} }) {
  return (
    <RegionalPanel title="Regional Applications" action={`${rows.length} visible`}>
      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <RegionalFilterSelect label="Branch" value={filters.branch} options={[{ value: 'all', label: 'All Branches' }, ...branchOptions]} onChange={(value) => onFilterChange('branch', value)} />
        <RegionalFilterSelect label="Consultant" value={filters.consultant} options={[{ value: 'all', label: 'All Consultants' }, ...consultantOptions]} onChange={(value) => onFilterChange('consultant', value)} />
        <RegionalFilterSelect label="Stage" value={filters.stage} options={[{ value: 'all', label: 'All Stages' }, ...stageOptions]} onChange={(value) => onFilterChange('stage', value)} />
        <RegionalFilterSelect label="Bank" value={filters.bank} options={[{ value: 'all', label: 'All Banks' }, ...bankOptions]} onChange={(value) => onFilterChange('bank', value)} />
        <label className="flex min-h-[62px] items-center gap-3 rounded-[14px] border border-[#dfe8f2] bg-[#fbfdff] px-3 text-sm font-bold text-[#17324d]">
          <input type="checkbox" checked={Boolean(filters.attention)} onChange={(event) => onFilterChange('attention', event.target.checked)} className="h-4 w-4 rounded border-[#b8c7d8] text-[#24518a]" />
          Attention Needed
        </label>
      </div>
      <RegionalCommandTable
        minWidth="1120px"
        columns={[
          { key: 'client', label: 'Buyer / Client' },
          { key: 'branch', label: 'Branch' },
          { key: 'consultant', label: 'Consultant' },
          { key: 'stage', label: 'Stage', render: (row) => <StatusPill status={row.stage} /> },
          { key: 'bankStatus', label: 'Bank Status' },
          { key: 'documentStatus', label: 'Documents' },
          { key: 'ageDays', label: 'Age', render: (row) => `${row.ageDays}d` },
          { key: 'lastActivityLabel', label: 'Last Activity' },
          { key: 'nextAction', label: 'Next Action' },
        ]}
        rows={rows}
      />
    </RegionalPanel>
  )
}

function RegionalConsultantsTab({ rows = [], sort = 'value', onSort = () => {} }) {
  return (
    <RegionalPanel
      title="Regional Consultant Performance"
      action={(
        <select value={sort} onChange={(event) => onSort(event.target.value)} className="h-10 rounded-[12px] border border-[#d9e4ef] bg-white px-3 text-sm font-bold text-[#17324d] outline-none">
          <option value="value">By value</option>
          <option value="volume">By volume</option>
          <option value="approval">By approval rate</option>
          <option value="turnaround">By turnaround</option>
        </select>
      )}
    >
      <RegionalCommandTable
        minWidth="1080px"
        columns={[
          { key: 'consultant', label: 'Consultant' },
          { key: 'branch', label: 'Branch' },
          { key: 'activeApplications', label: 'Active Apps', render: (row) => formatNumber(row.activeApplications) },
          { key: 'submittedApplications', label: 'Submitted', render: (row) => formatNumber(row.submittedApplications) },
          { key: 'approvalRate', label: 'Approval Rate', render: (row) => formatNullablePercent(row.approvalRate) },
          { key: 'averageTurnaround', label: 'Avg Turnaround', render: (row) => formatLeadTime(row.averageTurnaround) },
          { key: 'pendingDocuments', label: 'Pending Docs', render: (row) => formatNumber(row.pendingDocuments) },
          { key: 'overdueApplications', label: 'Overdue', render: (row) => formatNumber(row.overdueApplications) },
          { key: 'revenueContribution', label: 'Est. Revenue', render: (row) => formatCompactCurrency(row.revenueContribution) },
          { key: 'capacityStatus', label: 'Capacity', render: (row) => <StatusPill status={row.capacityStatus} /> },
        ]}
        rows={rows}
      />
    </RegionalPanel>
  )
}

function RegionalPartnersTab({ regionCommand }) {
  const partners = regionCommand.partners
  const topPartner = partners[0]
  const partnerRevenue = partners.reduce((sum, row) => sum + Number(row.revenueContribution || 0), 0)
  const conversion = partners.length ? Math.round(partners.reduce((sum, row) => sum + Number(row.conversionRate || 0), 0) / partners.length) : 0
  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label="Active Partners" value={partners.length} emphasis />
        <SummaryMetric label="Top Partner" value={topPartner?.partnerName || 'Pending'} emphasis />
        <SummaryMetric label="Partner Conversion" value={formatPercent(conversion)} emphasis />
        <SummaryMetric label="Partner Revenue" value={formatCompactCurrency(partnerRevenue)} emphasis />
      </section>
      <RegionalPanel title="Regional Partner Performance">
        <RegionalCommandTable
          minWidth="980px"
          columns={[
            { key: 'partnerName', label: 'Partner' },
            { key: 'partnerType', label: 'Type' },
            { key: 'applicationsContributed', label: 'Applications', render: (row) => formatNumber(row.applicationsContributed) },
            { key: 'conversionRate', label: 'Conversion', render: (row) => formatPercent(row.conversionRate) },
            { key: 'activeApplications', label: 'Active Apps', render: (row) => formatNumber(row.activeApplications) },
            { key: 'revenueContribution', label: 'Revenue', render: (row) => formatCompactCurrency(row.revenueContribution) },
            { key: 'lastActivity', label: 'Last Activity' },
            { key: 'healthStatus', label: 'Health', render: (row) => <StatusPill status={row.healthStatus} /> },
          ]}
          rows={partners}
        />
      </RegionalPanel>
    </div>
  )
}

function RegionalPerformanceTab({ regionCommand }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <RegionalPanel title="Regional Approval Trend">
        <ApprovalTrendChart rows={regionCommand.trend} />
      </RegionalPanel>
      <RegionalPanel title="Revenue Forecast Trend">
        <RevenueTrend rows={regionCommand.trend} />
      </RegionalPanel>
      <RegionalPanel title="Branch Comparison">
        <RegionalBarComparison rows={regionCommand.branches.slice(0, 6)} labelKey="branchName" valueKey="activeApplications" />
      </RegionalPanel>
      <RegionalPanel title="Consultant Comparison">
        <RegionalBarComparison rows={regionCommand.consultants.slice(0, 6)} labelKey="consultant" valueKey="activeApplications" />
      </RegionalPanel>
      <RegionalPanel title="Bank Lead Time Comparison">
        <RegionalBarComparison rows={regionCommand.bankMix} labelKey="bank" valueKey="avgLeadTime" suffix="d" />
      </RegionalPanel>
      <RegionalPanel title="Bottleneck Breakdown">
        <RiskAlertList rows={regionCommand.riskAlerts} />
      </RegionalPanel>
    </div>
  )
}

function RegionalKpiCard({ item }) {
  const Icon = item.icon
  return (
    <article className="flex min-h-[170px] flex-col rounded-[18px] border border-[#dfe8f2] bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.055)]">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-[15px] ring-1" style={{ color: item.tone, backgroundColor: `${item.tone}12`, borderColor: `${item.tone}22` }}>
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-4 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#71869d]">{item.label}</p>
      <p className="mt-2 text-[clamp(1.7rem,2.6vw,2.45rem)] font-bold leading-none tracking-[-0.02em] text-[#07142b]">{item.value}</p>
      <p className="mt-2 text-xs font-bold" style={{ color: item.tone }}>{item.trend}</p>
      <RegionSparkline values={item.spark} color={item.tone} />
    </article>
  )
}

function RegionSparkline({ values = [], color = '#2563eb' }) {
  const safeValues = values.length ? values : [10, 14, 12, 18, 22, 21]
  const max = Math.max(...safeValues, 1)
  const min = Math.min(...safeValues, 0)
  const range = Math.max(max - min, 1)
  const points = safeValues.map((value, index) => {
    const x = safeValues.length === 1 ? 0 : (index / (safeValues.length - 1)) * 100
    const y = 88 - ((Number(value || 0) - min) / range) * 68
    return `${x},${y}`
  })
  return (
    <svg className="mt-auto h-10 w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="2.8" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function RegionalSummaryStrip({ metrics }) {
  const rows = [
    { label: 'Branches', value: metrics.branches, icon: Building2 },
    { label: 'Consultants', value: metrics.consultants, icon: Users },
    { label: 'Active Partners', value: metrics.activePartners, icon: Network },
    { label: 'Banks Active', value: metrics.banksActive, icon: ShieldCheck },
    { label: 'Top Performing Bank', value: metrics.topPerformingBank, helper: `${formatPercent(metrics.topPerformingBankShare)} of approvals`, icon: Medal },
  ]
  return (
    <section className="grid overflow-hidden rounded-[18px] border border-[#dfe8f2] bg-white shadow-[0_12px_34px_rgba(15,23,42,0.045)] md:grid-cols-2 xl:grid-cols-5">
      {rows.map((row) => {
        const Icon = row.icon
        return (
          <div key={row.label} className="flex items-center gap-4 border-b border-[#edf2f7] px-5 py-4 last:border-b-0 md:border-r md:last:border-r-0 xl:border-b-0">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-[#eef5ff] text-[#24518a]">
              <Icon size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#71869d]">{row.label}</p>
              <p className="mt-1 truncate text-lg font-bold text-[#07142b]">{typeof row.value === 'number' ? formatNumber(row.value) : row.value}</p>
              {row.helper ? <p className="text-xs font-semibold text-[#60758d]">{row.helper}</p> : null}
            </div>
          </div>
        )
      })}
    </section>
  )
}

function RegionalPanel({ title, children, action = null }) {
  return (
    <section className="min-w-0 rounded-[20px] border border-[#dfe8f2] bg-white shadow-[0_14px_38px_rgba(15,23,42,0.05)]">
      <div className="flex min-h-[60px] flex-wrap items-center justify-between gap-3 border-b border-[#edf2f7] px-5 py-4">
        <h2 className="text-base font-bold tracking-[-0.01em] text-[#07142b]">{title}</h2>
        {typeof action === 'string' ? <span className="text-xs font-bold text-[#24518a]">{action}</span> : action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

function RegionalCommandTable({ columns = [], rows = [], minWidth = '900px' }) {
  if (!rows.length) {
    return <BondEmptyState compact title="No regional records yet." description="More detail will appear as applications, branches, consultants, and partners are assigned to this region." />
  }
  return (
    <div className="overflow-x-auto [scrollbar-width:thin]">
      <table className="w-full border-collapse" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-[#edf2f7]">
            {columns.map((column) => <HeaderCell key={column.key}>{column.label}</HeaderCell>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || row.key || `${row.branchName || row.consultant || row.partnerName || 'row'}-${index}`} className="border-b border-[#f0f4f8] last:border-b-0">
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-3.5 text-sm font-semibold text-[#17324d]">
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RegionalFilterSelect({ label, value, options = [], onChange = () => {} }) {
  return (
    <label className="block">
      <span className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#71869d]">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] bg-white px-3 text-sm font-bold text-[#17324d] outline-none focus:border-[#9fb8d1]">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

function CapacityDonut({ rows = [], total = 0 }) {
  const safeTotal = Math.max(1, rows.reduce((sum, row) => sum + Number(row.count || 0), 0) || total)
  const gradient = rows.reduce((accumulator, row) => {
    const start = accumulator.cursor
    const end = start + (Number(row.count || 0) / safeTotal) * 100
    return {
      cursor: end,
      parts: [...accumulator.parts, `${row.color} ${start}% ${end}%`],
    }
  }, { cursor: 0, parts: [] }).parts.join(', ')
  return (
    <div className="grid gap-5 md:grid-cols-[180px_minmax(0,1fr)] md:items-center xl:grid-cols-1 2xl:grid-cols-[180px_minmax(0,1fr)]">
      <div className="relative mx-auto flex h-40 w-40 items-center justify-center rounded-full" style={{ background: `conic-gradient(${gradient || '#e2e8f0 0% 100%'})` }}>
        <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white text-center shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
          <strong className="text-2xl font-bold text-[#07142b]">{formatNumber(total)}</strong>
          <span className="text-xs font-semibold text-[#60758d]">Consultants</span>
        </div>
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-bold text-[#17324d]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
              {row.label}
            </span>
            <span className="text-sm font-bold text-[#07142b]">{formatNumber(row.count)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BankMixCard({ rows = [] }) {
  const colors = ['#2f9e62', '#63b377', '#f59e0b', '#3b82f6', '#cbd5e1']
  return (
    <div className="space-y-3">
      {rows.slice(0, 5).map((row, index) => (
        <div key={row.bank}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-sm font-bold text-[#17324d]">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
              {row.bank}
            </span>
            <span>{formatPercent(row.approvalRate)} ({formatNumber(row.count)})</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#e7eef6]">
            <span className="block h-full rounded-full" style={{ width: `${Math.min(100, row.share || row.approvalRate)}%`, backgroundColor: colors[index % colors.length] }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function ApprovalTrendChart({ rows = [] }) {
  const values = rows.map((row) => Number(row.approvalRate || 0))
  const max = Math.max(100, ...values)
  const points = rows.map((row, index) => {
    const x = rows.length === 1 ? 0 : (index / (rows.length - 1)) * 100
    const y = 92 - (Number(row.approvalRate || 0) / max) * 74
    return `${x},${y}`
  })
  return (
    <div>
      <svg className="h-52 w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {[25, 50, 75].map((line) => <line key={line} x1="0" x2="100" y1={line} y2={line} stroke="#e2e8f0" strokeWidth="0.5" />)}
        <polyline points={points.join(' ')} fill="none" stroke="#2f9e62" strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="mt-2 grid grid-cols-6 text-xs font-bold text-[#71869d]">
        {rows.map((row) => <span key={row.month}>{row.month}</span>)}
      </div>
    </div>
  )
}

function RevenueTrend({ rows = [] }) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.month} className="grid grid-cols-[44px_minmax(0,1fr)_88px] items-center gap-3">
          <span className="text-xs font-bold text-[#71869d]">{row.month}</span>
          <div className="h-2 overflow-hidden rounded-full bg-[#e7eef6]">
            <span className="block h-full rounded-full bg-[#24518a]" style={{ width: `${Math.min(100, Math.max(8, (row.revenue / Math.max(...rows.map((item) => item.revenue || 1))) * 100))}%` }} />
          </div>
          <span className="text-right text-sm font-bold text-[#17324d]">{formatCompactCurrency(row.revenue)}</span>
        </div>
      ))}
    </div>
  )
}

function RiskAlertList({ rows = [] }) {
  return (
    <div className="divide-y divide-[#edf2f7]">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
          <span className="flex min-w-0 items-center gap-3 text-sm font-bold text-[#17324d]">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${row.count ? 'bg-[#fff1f0] text-[#b42318]' : 'bg-[#ecfdf3] text-[#027a48]'}`}>
              <AlertTriangle size={15} />
            </span>
            <span className="min-w-0">{row.label}</span>
          </span>
          <StatusPill status={row.severity} />
        </div>
      ))}
    </div>
  )
}

function RegionalBarComparison({ rows = [], labelKey = 'label', valueKey = 'value', suffix = '' }) {
  const max = Math.max(1, ...rows.map((row) => Number(row[valueKey] || 0)))
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const value = Number(row[valueKey] || 0)
        return (
          <div key={row.id || row[labelKey]} className="grid grid-cols-[minmax(110px,0.6fr)_minmax(0,1fr)_64px] items-center gap-3">
            <span className="truncate text-sm font-bold text-[#17324d]">{row[labelKey]}</span>
            <div className="h-2 overflow-hidden rounded-full bg-[#e7eef6]">
              <span className="block h-full rounded-full bg-[#24518a]" style={{ width: `${Math.max(6, (value / max) * 100)}%` }} />
            </div>
            <span className="text-right text-sm font-bold text-[#07142b]">{formatNumber(value)}{suffix}</span>
          </div>
        )
      })}
    </div>
  )
}

function BranchesWorkspace({
  rows = [],
  canManage = false,
  canMove = false,
  derived = false,
  onView = () => {},
  onAdd = () => {},
  onEdit = () => {},
  onAssign = () => {},
  onMove = () => {},
  onRefresh = () => {},
  onExport = () => {},
}) {
  if (!rows.length) {
    return (
      <SectionShell
        eyebrow="Branches"
        title="Branches"
        description="Manage the branch structure of your bond origination network."
        action={canManage ? <CommandButton icon={Plus} variant="primary" onClick={onAdd}>Add Branch</CommandButton> : null}
      >
        <BondEmptyState compact title="No branches yet" description="Create your first branch and assign it to a region." />
      </SectionShell>
    )
  }

  return (
    <SectionShell
      eyebrow="Branches"
      title="Branches"
      description="Manage the branch structure of your bond origination network."
      action={(
        <div className="flex flex-wrap gap-2">
          {canManage ? <CommandButton icon={Plus} variant="primary" onClick={onAdd}>Add Branch</CommandButton> : null}
          <CommandButton icon={Download} onClick={onExport}>Export</CommandButton>
          <CommandButton icon={RefreshCw} onClick={onRefresh}>Refresh</CommandButton>
        </div>
      )}
    >
      {derived ? (
        <p className="mb-4 rounded-[16px] border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-sm text-[#92400e]">
          No configured branches found. Showing branches inferred from current applications.
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-[18px] border border-[#e1e9f2]">
        <table className="min-w-[1180px] border-collapse">
          <thead>
            <tr>
              <HeaderCell>Branch</HeaderCell>
              <HeaderCell>Region</HeaderCell>
              <HeaderCell>Branch Manager</HeaderCell>
              <HeaderCell>Consultants</HeaderCell>
              <HeaderCell>Active Applications</HeaderCell>
              <HeaderCell>Submitted Applications</HeaderCell>
              <HeaderCell>Pending Documents</HeaderCell>
              <HeaderCell>Approval Rate</HeaderCell>
              <HeaderCell>Average Turnaround</HeaderCell>
              <HeaderCell>Status</HeaderCell>
              <HeaderCell>Action</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-[#edf2f7] bg-white align-top transition hover:bg-[#fbfdff]">
                <td className="px-4 py-4">
                  <p className="text-sm font-semibold text-[#142132]">{row.branch || row.name}</p>
                  <p className="mt-1 text-xs text-[#71869d]">{row.code || 'No code'}</p>
                </td>
                <td className="px-4 py-4 text-sm text-[#17324d]">{row.region || 'Unassigned'}</td>
                <td className="px-4 py-4 text-sm text-[#17324d]">{row.manager || 'Unassigned'}</td>
                <td className="px-4 py-4 text-sm font-semibold text-[#17324d]">{row.consultants}</td>
                <td className="px-4 py-4 text-sm font-semibold text-[#17324d]">{row.activeApplications}</td>
                <td className="px-4 py-4 text-sm font-semibold text-[#17324d]">{row.submittedApplications || 0}</td>
                <td className="px-4 py-4 text-sm font-semibold text-[#17324d]">{row.pendingDocuments || row.pendingDocs || 0}</td>
                <td className="px-4 py-4 text-sm font-semibold text-[#17324d]">{formatPercent(row.approvalRate)}</td>
                <td className="px-4 py-4 text-sm text-[#17324d]">{formatLeadTime(row.averageTurnaround || row.avgLeadTime)}</td>
                <td className="px-4 py-4"><StatusPill status={row.status || 'active'} /></td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => onView(row)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#d9e4ef] px-2.5 py-1.5 text-xs font-semibold text-[#24518a]">
                      <Eye size={13} /> View
                    </button>
                    {canManage ? (
                      <>
                        <button type="button" onClick={() => onEdit(row)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#d9e4ef] px-2.5 py-1.5 text-xs font-semibold text-[#31475d]">
                          <Pencil size={13} /> Edit
                        </button>
                        <button type="button" onClick={() => onAssign(row)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#d9e4ef] px-2.5 py-1.5 text-xs font-semibold text-[#31475d]">
                          <UserCheck size={13} /> Assign
                        </button>
                        {canMove ? (
                          <button type="button" onClick={() => onMove(row)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#d9e4ef] px-2.5 py-1.5 text-xs font-semibold text-[#31475d]">
                            <ArrowRight size={13} /> Move
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionShell>
  )
}

function getPartnerWorkspaceApplicationReference(row = {}) {
  return formatApplicationReference(row)
}

function PartnersWorkspace({
  rows = [],
  canManage = false,
  onView = () => {},
  onAdd = () => {},
  onEdit = () => {},
  onRouting = () => {},
  onInvite = () => {},
  onDisable = () => {},
  onRefresh = () => {},
  onExport = () => {},
}) {
  return (
    <div className="space-y-6">
      <SectionShell
        eyebrow="Partners"
        title="Partners"
        description="Manage agency, development, and referral partners that send bond applications."
        action={(
          <div className="flex flex-wrap gap-2">
            {canManage ? <CommandButton icon={Plus} variant="primary" onClick={onAdd}>Add Partner</CommandButton> : null}
            {canManage && rows.length ? <CommandButton icon={UserPlus} onClick={() => onInvite(rows[0])}>Invite Partner</CommandButton> : null}
            <CommandButton icon={RefreshCw} onClick={onRefresh}>Refresh</CommandButton>
            <CommandButton icon={Download} onClick={onExport}>Export</CommandButton>
          </div>
        )}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <SummaryMetric label="Partners" value={rows.length} emphasis />
          <SummaryMetric label="Applications Sent" value={rows.reduce((sum, row) => sum + Number(row.applicationsSent || 0), 0)} emphasis />
          <SummaryMetric label="Active Applications" value={rows.reduce((sum, row) => sum + Number(row.activeApplications || 0), 0)} />
          <SummaryMetric label="Approval Rate" value={formatPercent(rows.length ? rows.reduce((sum, row) => sum + Number(row.approvalRate || 0), 0) / rows.length : 0)} />
          <SummaryMetric label="Routing Defaults" value={rows.filter((row) => row.defaultBranchId || row.defaultConsultantId).length} />
        </div>
      </SectionShell>

      <SectionShell eyebrow="Management" title="Partner Management">
        {!rows.length ? (
          <BondEmptyState
            compact
            title="No partners yet"
            description="Add your first agency, development, or referral partner to start tracking where bond applications come from."
            action={canManage ? <CommandButton icon={Plus} variant="primary" onClick={onAdd}>Add Partner</CommandButton> : null}
          />
        ) : (
          <div className="overflow-x-auto rounded-[18px] border border-[#e1e9f2]">
            <table className="min-w-[1180px] border-collapse">
              <thead>
                <tr>
                  <HeaderCell>Partner</HeaderCell>
                  <HeaderCell>Type</HeaderCell>
                  <HeaderCell>Status</HeaderCell>
                  <HeaderCell>Default Region</HeaderCell>
                  <HeaderCell>Default Branch</HeaderCell>
                  <HeaderCell>Default Consultant</HeaderCell>
                  <HeaderCell>Applications Sent</HeaderCell>
                  <HeaderCell>Active Applications</HeaderCell>
                  <HeaderCell>Approval Rate</HeaderCell>
                  <HeaderCell>Avg Turnaround</HeaderCell>
                  <HeaderCell>Last Activity</HeaderCell>
                  <HeaderCell>Action</HeaderCell>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-[#edf2f7] bg-white align-top transition hover:bg-[#fbfdff]">
                    <td className="px-4 py-4">
                      <p className="text-sm font-semibold text-[#142132]">{row.name}</p>
                      <p className="mt-1 text-xs text-[#71869d]">{row.primaryContactEmail || row.primaryContactName || 'No primary contact'}</p>
                    </td>
                    <td className="px-4 py-4 text-sm text-[#17324d]">{row.typeLabel || row.type}</td>
                    <td className="px-4 py-4"><StatusPill status={row.statusLabel || row.status} /></td>
                    <td className="px-4 py-4 text-sm text-[#17324d]">{row.defaultRegion || 'Fallback'}</td>
                    <td className="px-4 py-4 text-sm text-[#17324d]">{row.defaultBranch || 'Fallback'}</td>
                    <td className="px-4 py-4 text-sm text-[#17324d]">{row.defaultConsultant || 'Workload balanced'}</td>
                    <td className="px-4 py-4 text-sm font-semibold text-[#17324d]">{row.applicationsSent || 0}</td>
                    <td className="px-4 py-4 text-sm text-[#17324d]">{row.activeApplications || 0}</td>
                    <td className="px-4 py-4 text-sm text-[#17324d]">{formatPercent(row.approvalRate)}</td>
                    <td className="px-4 py-4 text-sm text-[#17324d]">{formatLeadTime(row.averageTurnaround)}</td>
                    <td className="px-4 py-4 text-sm text-[#60758d]">{row.lastActivity || 'No activity yet'}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => onView(row)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#d9e4ef] px-2.5 py-1.5 text-xs font-semibold text-[#31475d]">
                          <Eye size={13} /> View
                        </button>
                        {canManage ? (
                          <>
                            <button type="button" onClick={() => onEdit(row)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#d9e4ef] px-2.5 py-1.5 text-xs font-semibold text-[#31475d]">
                              <Pencil size={13} /> Edit
                            </button>
                            <button type="button" onClick={() => onRouting(row)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#d9e4ef] px-2.5 py-1.5 text-xs font-semibold text-[#31475d]">
                              <Route size={13} /> Set Routing
                            </button>
                            <button type="button" onClick={() => onInvite(row)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#d9e4ef] px-2.5 py-1.5 text-xs font-semibold text-[#31475d]">
                              <UserPlus size={13} /> Invite
                            </button>
                            {row.status !== 'disabled' ? (
                              <button type="button" onClick={() => onDisable(row)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#f1d0d0] px-2.5 py-1.5 text-xs font-semibold text-[#9f2a2a]">
                                <X size={13} /> Disable
                              </button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionShell>
    </div>
  )
}

function PartnerWorkspaceRoute({
  workspace = null,
  canManage = false,
  onBack = () => {},
  onEdit = () => {},
  onRouting = () => {},
  onInvite = () => {},
}) {
  if (!workspace) {
    return (
      <SectionShell eyebrow="Partner" title="Partner workspace">
        <BondEmptyState compact title="Partner not found." description="This partner is outside your current scope or no longer exists." action={<CommandButton icon={ArrowLeft} onClick={onBack}>Back to Partners</CommandButton>} />
      </SectionShell>
    )
  }
  const partner = workspace.partner || {}
  const metrics = workspace.metrics || {}
  const routing = workspace.routingDefaults || {}
  return (
    <div className="space-y-6">
      <SectionShell
        eyebrow="Partner Workspace"
        title={partner.name}
        description={`${partner.typeLabel || partner.type} partner · ${partner.statusLabel || partner.status}`}
        action={(
          <div className="flex flex-wrap gap-2">
            <CommandButton icon={ArrowLeft} onClick={onBack}>Back</CommandButton>
            {canManage ? <CommandButton icon={Pencil} onClick={() => onEdit(partner)}>Edit Partner</CommandButton> : null}
            {canManage ? <CommandButton icon={Route} onClick={() => onRouting(partner)}>Set Routing</CommandButton> : null}
            {canManage ? <CommandButton icon={UserPlus} onClick={() => onInvite(partner)}>Invite</CommandButton> : null}
          </div>
        )}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryMetric label="Applications Sent" value={metrics.applicationsSent || 0} emphasis />
          <SummaryMetric label="Active Applications" value={metrics.activeApplications || 0} emphasis />
          <SummaryMetric label="Applications Submitted" value={metrics.submittedApplications || 0} />
          <SummaryMetric label="Approvals" value={metrics.approvals || 0} />
          <SummaryMetric label="Approval Rate" value={formatPercent(metrics.approvalRate)} />
          <SummaryMetric label="Avg Turnaround" value={formatLeadTime(metrics.averageTurnaround)} />
          <SummaryMetric label="Bank Response" value={formatLeadTime(metrics.averageBankResponseTime)} />
          <SummaryMetric label="Last Application" value={metrics.lastApplicationDate || 'No applications yet'} />
        </div>
      </SectionShell>

      <SectionShell eyebrow="Routing" title="Default Routing">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryMetric label="Region" value={routing.defaultRegion || 'Fallback'} emphasis />
          <SummaryMetric label="Branch" value={routing.defaultBranch || 'Fallback'} emphasis />
          <SummaryMetric label="Consultant" value={routing.defaultConsultant || 'Workload balanced'} />
          <SummaryMetric label="Routing Rule" value={routing.routingRuleLabel || 'Fallback path'} />
        </div>
        {!routing.defaultBranchId && !routing.defaultConsultantId ? (
          <div className="mt-4">
            <BondEmptyState compact title="No routing default set" description="Applications from this partner will use the routing rules fallback path." action={canManage ? <CommandButton icon={Route} onClick={() => onRouting(partner)}>Set Routing Default</CommandButton> : null} />
          </div>
        ) : null}
      </SectionShell>

      <SectionShell eyebrow="Applications" title="Partner Applications">
        {!workspace.applications?.length ? (
          <BondEmptyState compact title="No applications from this partner yet" description="Once this partner starts sending buyers, their applications will appear here." />
        ) : (
          <div className="overflow-x-auto rounded-[18px] border border-[#e1e9f2]">
            <table className="min-w-[920px] border-collapse">
              <thead>
                <tr>
                  <HeaderCell>Buyer</HeaderCell>
                  <HeaderCell>Property</HeaderCell>
                  <HeaderCell>Application Reference</HeaderCell>
                  <HeaderCell>Consultant</HeaderCell>
                  <HeaderCell>Branch</HeaderCell>
                  <HeaderCell>Status</HeaderCell>
                  <HeaderCell>Submitted Date</HeaderCell>
                  <HeaderCell>Last Activity</HeaderCell>
                  <HeaderCell>Action</HeaderCell>
                </tr>
              </thead>
              <tbody>
                {workspace.applications.map((row) => (
                  <tr key={row.key || row.id || row.transactionId} className="border-t border-[#edf2f7] bg-white align-top">
                    <td className="px-4 py-4 text-sm font-semibold text-[#142132]">{row.client || row.buyerName || row.buyer?.name || 'Buyer pending'}</td>
                    <td className="px-4 py-4 text-sm text-[#17324d]">{row.property || row.address || row.propertyAddress || 'Property pending'}</td>
                    <td className="px-4 py-4 text-sm text-[#17324d]">{getPartnerWorkspaceApplicationReference(row)}</td>
                    <td className="px-4 py-4 text-sm text-[#17324d]">{row.consultant || row.assignedConsultantId || row.assignedUserId || 'Unassigned'}</td>
                    <td className="px-4 py-4 text-sm text-[#17324d]">{row.branch || row.branchId || 'Unassigned'}</td>
                    <td className="px-4 py-4"><BondTransactionStatusBadge status={row.status} label={row.financeStageLabel || row.status || 'In progress'} /></td>
                    <td className="px-4 py-4 text-sm text-[#60758d]">{row.submittedAt || row.submitted_at || row.createdAt || 'Not submitted'}</td>
                    <td className="px-4 py-4 text-sm text-[#60758d]">{row.lastActivityLabel || row.lastActivityAt || 'No activity'}</td>
                    <td className="px-4 py-4">
                      {row.transactionId ? (
                        <a href={`/bond/files/${row.transactionId}`} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#d9e4ef] px-2.5 py-1.5 text-xs font-semibold text-[#31475d]">
                          <Eye size={13} /> Open
                        </a>
                      ) : (
                        <span className="text-xs font-semibold text-[#71869d]">Read-only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionShell>

      <SectionShell eyebrow="Activity" title="Partner Activity">
        {!workspace.recentActivity?.length ? (
          <BondEmptyState compact title="No partner activity yet" description="Invites, acceptance, routing defaults, and partner changes will appear here." />
        ) : (
          <div className="divide-y divide-[#edf2f7] overflow-hidden rounded-[18px] border border-[#e1e9f2]">
            {workspace.recentActivity.map((event) => (
              <div key={event.id} className="bg-white px-4 py-4">
                <p className="text-sm font-semibold text-[#142132]">{event.eventType || event.event_type}</p>
                <p className="mt-1 text-xs text-[#71869d]">{event.createdAt || event.created_at}</p>
              </div>
            ))}
          </div>
        )}
      </SectionShell>
    </div>
  )
}

function RoutingRulesTable({ title = '', sourceLabel = 'Source', rows = [], canManage = false, onEdit = () => {}, onDisable = () => {} }) {
  return (
    <SectionShell eyebrow="Routing" title={title}>
      {!rows.length ? (
        <BondEmptyState compact title={`No ${title.toLowerCase()} yet`} description="Create routing defaults so applications can flow without manual ownership decisions." />
      ) : (
        <div className="overflow-x-auto rounded-[18px] border border-[#e1e9f2]">
          <table className="min-w-[900px] border-collapse">
            <thead>
              <tr>
                <HeaderCell>{sourceLabel}</HeaderCell>
                <HeaderCell>Branch</HeaderCell>
                <HeaderCell>Consultant</HeaderCell>
                <HeaderCell>Applications Routed</HeaderCell>
                <HeaderCell>Priority</HeaderCell>
                <HeaderCell>Status</HeaderCell>
                <HeaderCell>Action</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[#edf2f7] bg-white align-top transition hover:bg-[#fbfdff]">
                  <td className="px-4 py-4">
                    <p className="text-sm font-semibold text-[#142132]">{row.sourceName || row.name || 'Routing source'}</p>
                    <p className="mt-1 text-xs text-[#71869d]">{row.sourceId || row.ruleType}</p>
                  </td>
                  <td className="px-4 py-4 text-sm text-[#17324d]">{row.branch || row.branchId || 'Unassigned'}</td>
                  <td className="px-4 py-4 text-sm text-[#17324d]">{row.consultant || row.consultantId || 'Workload balanced'}</td>
                  <td className="px-4 py-4 text-sm font-semibold text-[#17324d]">{row.applicationsRouted || 0}</td>
                  <td className="px-4 py-4 text-sm text-[#17324d]">{row.priority || 100}</td>
                  <td className="px-4 py-4"><StatusPill status={row.status || 'active'} /></td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      {canManage ? (
                        <>
                          <button type="button" onClick={() => onEdit(row)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#d9e4ef] px-2.5 py-1.5 text-xs font-semibold text-[#31475d]">
                            <Pencil size={13} /> Edit
                          </button>
                          {row.status !== 'disabled' ? (
                            <button type="button" onClick={() => onDisable(row)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#f1d0d0] px-2.5 py-1.5 text-xs font-semibold text-[#9f2a2a]">
                              <X size={13} /> Disable
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-xs font-semibold text-[#71869d]">Read-only</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionShell>
  )
}

function RoutingRulesWorkspace({
  dashboard = {},
  canManage = false,
  onAdd = () => {},
  onEdit = () => {},
  onDisable = () => {},
  onRefresh = () => {},
}) {
  const fallback = dashboard.companyFallback || null
  const performance = dashboard.performance || {}
  return (
    <div className="space-y-6">
      <SectionShell
        eyebrow="Routing Rules"
        title="Partner Routing Rules"
        description="Control agency, development, regional, overflow, and company fallback routing defaults."
        action={(
          <div className="flex flex-wrap gap-2">
            {canManage ? <CommandButton icon={Plus} variant="primary" onClick={onAdd}>Add Routing Rule</CommandButton> : null}
            <CommandButton icon={RefreshCw} onClick={onRefresh}>Refresh</CommandButton>
          </div>
        )}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryMetric label="Agency Rules" value={dashboard.agencyRules?.length || 0} emphasis />
          <SummaryMetric label="Development Rules" value={dashboard.developmentRules?.length || 0} emphasis />
          <SummaryMetric label="Regional Rules" value={dashboard.regionalRules?.length || 0} emphasis />
          <SummaryMetric label="Company Fallback" value={fallback?.fallbackBranch || 'Not set'} emphasis />
          <SummaryMetric label="Fallback Capacity" value={fallback ? fallback.currentCapacity || 0 : 0} />
        </div>
      </SectionShell>
      <RoutingRulesTable title="Agency Rules" sourceLabel="Agency" rows={dashboard.agencyRules || []} canManage={canManage} onEdit={onEdit} onDisable={onDisable} />
      <RoutingRulesTable title="Development Rules" sourceLabel="Development" rows={dashboard.developmentRules || []} canManage={canManage} onEdit={onEdit} onDisable={onDisable} />
      <RoutingRulesTable title="Regional Rules" sourceLabel="Region" rows={dashboard.regionalRules || []} canManage={canManage} onEdit={onEdit} onDisable={onDisable} />
      <SectionShell eyebrow="Reporting" title="Routing Effectiveness">
        {(performance.routingEffectiveness || []).length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {(performance.routingEffectiveness || []).map((row) => (
              <SummaryMetric key={row.method} label={`${row.method} · ${row.approvalRate || 0}% approval`} value={row.volume || 0} emphasis />
            ))}
          </div>
        ) : (
          <BondEmptyState compact title="No routing performance yet" description="Routing effectiveness appears once applications are assigned through routing rules." />
        )}
      </SectionShell>
    </div>
  )
}

function PartnerFormModal({
  modal = null,
  regionOptions = [],
  branchOptions = [],
  consultantOptions = [],
  onChange = () => {},
  onClose = () => {},
  onSubmit = () => {},
}) {
  if (!modal?.mode) return null
  const values = modal.values || {}
  const fieldErrors = modal.fieldErrors || {}
  const isEdit = modal.mode === 'edit'
  const isRouting = modal.mode === 'routing'
  const isInvite = modal.mode === 'invite'
  const title = isInvite ? 'Invite Partner' : isRouting ? 'Set Routing Default' : isEdit ? 'Edit Partner' : 'Add Partner'
  const description = isInvite
    ? 'Send a partnership invitation to the primary contact.'
    : isRouting
      ? 'Choose where applications from this partner should enter the bond origination network.'
      : isEdit
        ? 'Update partner details, relationship status, and contact information.'
        : 'Create an agency, development, or referral partner for this bond organisation.'
  const submitLabel = isInvite ? 'Send Invite' : isRouting ? 'Save Routing Default' : isEdit ? 'Save Partner' : 'Create Partner'
  const selectedBranch = branchOptions.find((branch) => normalizeText(branch.id) === normalizeText(values.defaultBranchId))
  const selectedConsultant = consultantOptions.find((consultant) => normalizeText(consultant.id) === normalizeText(values.defaultConsultantId))
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
      <div className="max-h-[calc(100dvh-32px)] w-full max-w-2xl overflow-y-auto rounded-[24px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#7d90a5]">Partners</p>
            <h2 className="mt-2 text-xl font-semibold text-[#142132]">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#60758d]">{description}</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d9e4ef] text-[#60758d] transition hover:bg-[#f8fbff]">
            <X size={16} />
          </button>
        </div>

        {modal.error ? (
          <div className="mt-4 rounded-[14px] border border-[#f1d0d0] bg-[#fff5f5] px-4 py-3 text-sm font-semibold text-[#9f2a2a]">
            {modal.error}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4">
          {isInvite ? (
            <label className="text-sm font-semibold text-[#31475d]">
              Invitation Email *
              <input value={values.invitedEmail || ''} onChange={(event) => onChange('invitedEmail', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] px-3 text-sm font-medium outline-none focus:border-[#9fb8d1]" />
              <FieldError message={fieldErrors.invitedEmail} />
            </label>
          ) : null}

          {!isInvite && !isRouting ? (
            <>
              <label className="text-sm font-semibold text-[#31475d]">
                Partner Name *
                <input value={values.name || ''} onChange={(event) => onChange('name', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] px-3 text-sm font-medium outline-none focus:border-[#9fb8d1]" />
                <FieldError message={fieldErrors.name} />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-semibold text-[#31475d]">
                  Partner Type *
                  <select value={values.type || 'agency'} onChange={(event) => onChange('type', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] bg-white px-3 text-sm font-medium outline-none focus:border-[#9fb8d1]">
                    {PARTNER_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <FieldError message={fieldErrors.type} />
                </label>
                <label className="text-sm font-semibold text-[#31475d]">
                  Status
                  <select value={values.status || 'draft'} onChange={(event) => onChange('status', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] bg-white px-3 text-sm font-medium outline-none focus:border-[#9fb8d1]">
                    {PARTNER_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-semibold text-[#31475d]">
                  Primary Contact Name
                  <input value={values.primaryContactName || ''} onChange={(event) => onChange('primaryContactName', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] px-3 text-sm font-medium outline-none focus:border-[#9fb8d1]" />
                </label>
                <label className="text-sm font-semibold text-[#31475d]">
                  Primary Contact Email
                  <input value={values.primaryContactEmail || ''} onChange={(event) => onChange('primaryContactEmail', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] px-3 text-sm font-medium outline-none focus:border-[#9fb8d1]" />
                  <FieldError message={fieldErrors.primaryContactEmail} />
                </label>
              </div>
              <label className="text-sm font-semibold text-[#31475d]">
                Primary Contact Number
                <input value={values.primaryContactNumber || ''} onChange={(event) => onChange('primaryContactNumber', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] px-3 text-sm font-medium outline-none focus:border-[#9fb8d1]" />
                <FieldError message={fieldErrors.primaryContactNumber} />
              </label>
            </>
          ) : null}

          {!isInvite ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="text-sm font-semibold text-[#31475d]">
                  Default Region
                  <select value={values.defaultRegionId || ''} onChange={(event) => onChange('defaultRegionId', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] bg-white px-3 text-sm font-medium outline-none focus:border-[#9fb8d1]">
                    <option value="">Fallback</option>
                    {regionOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                  <FieldError message={fieldErrors.defaultRegionId} />
                </label>
                <label className="text-sm font-semibold text-[#31475d]">
                  Default Branch
                  <select value={values.defaultBranchId || ''} onChange={(event) => onChange('defaultBranchId', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] bg-white px-3 text-sm font-medium outline-none focus:border-[#9fb8d1]">
                    <option value="">Fallback</option>
                    {branchOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                  <FieldError message={fieldErrors.defaultBranchId} />
                </label>
                <label className="text-sm font-semibold text-[#31475d]">
                  Default Consultant
                  <select value={values.defaultConsultantId || ''} onChange={(event) => onChange('defaultConsultantId', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] bg-white px-3 text-sm font-medium outline-none focus:border-[#9fb8d1]">
                    <option value="">Workload balanced</option>
                    {consultantOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                  <FieldError message={fieldErrors.defaultConsultantId} />
                </label>
              </div>
              <div className="rounded-[16px] border border-[#e1e9f2] bg-[#fbfdff] p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7d90a5]">Routing Preview</p>
                <p className="mt-2 text-sm text-[#142132]">{selectedBranch?.name || 'Fallback branch'} → {selectedConsultant?.name || 'Workload balanced consultant'}</p>
                <p className="mt-1 text-sm text-[#60758d]">Saving this default will create or update the partner routing rule used by the assignment engine.</p>
              </div>
            </>
          ) : null}

          {!isInvite && !isRouting ? (
            <label className="text-sm font-semibold text-[#31475d]">
              Notes
              <textarea value={values.notes || ''} onChange={(event) => onChange('notes', event.target.value)} rows={4} className="mt-2 w-full rounded-[12px] border border-[#d9e4ef] px-3 py-3 text-sm font-medium outline-none focus:border-[#9fb8d1]" />
            </label>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {isRouting ? (
            <button type="button" onClick={() => {
              onChange('defaultRegionId', '')
              onChange('defaultBranchId', '')
              onChange('defaultConsultantId', '')
            }} className="rounded-[12px] border border-[#d9e4ef] bg-white px-4 py-2.5 text-sm font-semibold text-[#31475d] transition hover:bg-[#f8fbff]">
              Clear Default
            </button>
          ) : null}
          <button type="button" onClick={onClose} className="rounded-[12px] border border-[#d9e4ef] bg-white px-4 py-2.5 text-sm font-semibold text-[#31475d] transition hover:bg-[#f8fbff]">
            Cancel
          </button>
          <button type="button" onClick={onSubmit} disabled={modal.submitting} className="rounded-[12px] border border-[#143250] bg-[#143250] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183b5e] disabled:cursor-not-allowed disabled:opacity-60">
            {modal.submitting ? 'Saving...' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function RoutingRuleModal({
  modal = null,
  regionOptions = [],
  branchOptions = [],
  consultantOptions = [],
  consultantRows = [],
  onChange = () => {},
  onClose = () => {},
  onSubmit = () => {},
}) {
  if (!modal?.mode) return null
  const values = modal.values || {}
  const isEdit = modal.mode === 'edit'
  const selectedBranch = branchOptions.find((branch) => normalizeText(branch.id) === normalizeText(values.branchId))
  const selectedConsultant = consultantOptions.find((consultant) => normalizeText(consultant.id) === normalizeText(values.consultantId))
  const consultantPerformance = consultantRows.find((row) => normalizeText(row.id) === normalizeText(values.consultantId))
  const fieldErrors = modal.fieldErrors || {}
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
      <div className="max-h-[calc(100dvh-32px)] w-full max-w-2xl overflow-y-auto rounded-[24px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#7d90a5]">Routing Rules</p>
            <h2 className="mt-2 text-xl font-semibold text-[#142132]">{isEdit ? 'Edit Routing Rule' : 'Add Routing Rule'}</h2>
            <p className="mt-2 text-sm leading-6 text-[#60758d]">Define how partner and development applications should enter the organisation hierarchy.</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d9e4ef] text-[#60758d] transition hover:bg-[#f8fbff]">
            <X size={16} />
          </button>
        </div>
        {modal.error ? <p className="mt-4 rounded-[14px] border border-[#fecaca] bg-[#fff5f5] px-4 py-3 text-sm font-semibold text-[#9f2a2a]">{modal.error}</p> : null}
        <div className="mt-5 grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-[#31475d]">Rule Type</span>
              <select value={values.ruleType || 'agency'} onChange={(event) => onChange('ruleType', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] bg-white px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]">
                <option value="agency">Agency</option>
                <option value="development">Development</option>
                <option value="region">Region</option>
                <option value="company">Company</option>
              </select>
              <FieldError message={fieldErrors.ruleType} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[#31475d]">Status</span>
              <select value={values.status || 'active'} onChange={(event) => onChange('status', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] bg-white px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
          </div>
          {values.ruleType !== 'company' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-[#31475d]">Partner / Source</span>
                <input value={values.sourceName || ''} onChange={(event) => onChange('sourceName', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]" />
                <FieldError message={fieldErrors.sourceName} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-[#31475d]">Source ID</span>
                <input value={values.sourceId || ''} onChange={(event) => onChange('sourceId', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]" />
              </label>
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="text-sm font-semibold text-[#31475d]">Region</span>
              <select value={values.regionId || ''} onChange={(event) => onChange('regionId', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] bg-white px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]">
                <option value="">Select region</option>
                {regionOptions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[#31475d]">Branch</span>
              <select value={values.branchId || ''} onChange={(event) => onChange('branchId', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] bg-white px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]">
                <option value="">Select branch</option>
                {branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
              <FieldError message={fieldErrors.branchId} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[#31475d]">Consultant</span>
              <select value={values.consultantId || ''} onChange={(event) => onChange('consultantId', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] bg-white px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]">
                <option value="">Workload balanced</option>
                {consultantOptions.map((consultant) => <option key={consultant.id} value={consultant.id}>{consultant.name}</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-semibold text-[#31475d]">Priority</span>
            <input type="number" value={values.priority || 100} onChange={(event) => onChange('priority', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]" />
          </label>
          <section className="rounded-[16px] border border-[#e1e9f2] bg-[#fbfdff] p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#7d90a5]">Routing Preview</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <SummaryMetric label="Partner" value={values.ruleType === 'company' ? 'Company Fallback' : values.sourceName || 'Not set'} emphasis />
              <SummaryMetric label="Rule" value={selectedBranch?.name || 'Select branch'} emphasis />
              <SummaryMetric label="Consultant" value={selectedConsultant?.name || 'Workload balanced'} emphasis />
              <SummaryMetric label="Current Capacity" value={consultantPerformance?.activeApplications || 0} emphasis />
            </div>
          </section>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <CommandButton onClick={onClose}>Cancel</CommandButton>
          <CommandButton icon={Route} variant="primary" onClick={onSubmit}>
            {modal.submitting ? 'Saving...' : isEdit ? 'Save Rule' : 'Create Rule'}
          </CommandButton>
        </div>
      </div>
    </div>
  )
}

function BranchFormModal({
  modal = null,
  managerOptions = [],
  regionOptions = [],
  onChange = () => {},
  onClose = () => {},
  onSubmit = () => {},
}) {
  if (!modal?.mode) return null
  const isAssign = modal.mode === 'assign'
  const isMove = modal.mode === 'move'
  const isEdit = modal.mode === 'edit'
  const title = isAssign ? 'Assign Branch Manager' : isMove ? 'Move Branch' : isEdit ? 'Edit Branch' : 'Add Branch'
  const description = isAssign
    ? 'Choose the user who should own this branch.'
    : isMove
      ? 'Move this branch into another region.'
      : isEdit
        ? 'Update the branch record and operating details.'
        : 'Create a branch within a region.'
  const submitLabel = isAssign ? 'Assign Manager' : isMove ? 'Move Branch' : isEdit ? 'Save Branch' : 'Create Branch'
  const values = modal.values || {}
  const fieldErrors = modal.fieldErrors || {}
  const noRegions = !isAssign && !regionOptions.length
  const noManagers = !isMove && !managerOptions.length
  const submitDisabled = Boolean(modal.submitting || noRegions)

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
      <div className="max-h-[calc(100dvh-32px)] w-full max-w-2xl overflow-y-auto rounded-[24px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#7d90a5]">Branches</p>
            <h2 className="mt-2 text-xl font-semibold text-[#142132]">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#60758d]">{description}</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d9e4ef] text-[#60758d] transition hover:bg-[#f8fbff]">
            <X size={16} />
          </button>
        </div>
        {modal.error ? <p className="mt-4 rounded-[14px] border border-[#fecaca] bg-[#fff5f5] px-4 py-3 text-sm font-semibold text-[#9f2a2a]">{modal.error}</p> : null}
        <div className="mt-5 grid gap-4">
          {!isAssign && !isMove ? (
            <label className="block">
              <span className="text-sm font-semibold text-[#31475d]">Branch Name</span>
              <input value={values.name || ''} onChange={(event) => onChange('name', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]" />
              <FieldError message={fieldErrors.name} />
            </label>
          ) : null}
          {!isAssign ? (
            <label className="block">
              <span className="text-sm font-semibold text-[#31475d]">Region</span>
              <select value={values.regionId || ''} onChange={(event) => onChange('regionId', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] bg-white px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]">
                <option value="">{regionOptions.length ? 'Select region' : 'No regions found'}</option>
                {regionOptions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
              </select>
              {noRegions ? <p className="mt-2 text-xs font-semibold text-[#9a5b13]">No regions found. Create a region first.</p> : null}
              <FieldError message={fieldErrors.regionId} />
            </label>
          ) : null}
          {!isMove ? (
            <label className="block">
              <span className="text-sm font-semibold text-[#31475d]">Branch Manager</span>
              <select value={values.managerUserId || ''} onChange={(event) => onChange('managerUserId', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] bg-white px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]">
                <option value="">No manager assigned</option>
                {managerOptions.map((manager) => <option key={manager.id} value={manager.id}>{manager.name} · {manager.role}</option>)}
              </select>
              {noManagers ? <p className="mt-2 text-xs font-semibold text-[#60758d]">No eligible branch managers found. Invite or assign a user first.</p> : null}
              <FieldError message={fieldErrors.managerUserId} />
            </label>
          ) : null}
          {!isAssign && !isMove ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold text-[#31475d]">Office Location</span>
                  <input value={values.officeLocation || ''} onChange={(event) => onChange('officeLocation', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]" />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-[#31475d]">Branch Code</span>
                  <input value={values.code || ''} onChange={(event) => onChange('code', event.target.value.toUpperCase())} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] px-3 text-sm uppercase text-[#142132] outline-none focus:border-[#9fb8d1]" />
                  <FieldError message={fieldErrors.code} />
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold text-[#31475d]">Contact Email</span>
                  <input value={values.contactEmail || ''} onChange={(event) => onChange('contactEmail', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]" />
                  <FieldError message={fieldErrors.contactEmail} />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-[#31475d]">Contact Number</span>
                  <input value={values.contactNumber || ''} onChange={(event) => onChange('contactNumber', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]" />
                  <FieldError message={fieldErrors.contactNumber} />
                </label>
              </div>
              <label className="block">
                <span className="text-sm font-semibold text-[#31475d]">Status</span>
                <select value={values.status || 'active'} onChange={(event) => onChange('status', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] bg-white px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <FieldError message={fieldErrors.status} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-[#31475d]">Notes</span>
                <textarea value={values.notes || ''} onChange={(event) => onChange('notes', event.target.value)} rows={4} className="mt-2 w-full rounded-[12px] border border-[#d9e4ef] px-3 py-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]" />
              </label>
            </>
          ) : null}
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <CommandButton onClick={onClose}>Cancel</CommandButton>
          <CommandButton disabled={submitDisabled} icon={isMove ? ArrowRight : isAssign ? UserCheck : Plus} variant="primary" onClick={onSubmit}>
            {modal.submitting ? 'Saving...' : submitLabel}
          </CommandButton>
        </div>
      </div>
    </div>
  )
}

function BranchWorkspaceRoute({ workspace = null, onBack = () => {} }) {
  if (!workspace) {
    return (
      <HierarchySelectionUnavailable
        title="Branch no longer available."
        description="This branch could not be found in the current organisation scope."
        onBack={onBack}
        backLabel="Back to Branches"
      />
    )
  }
  const branch = workspace.branch || {}
  const metrics = workspace.metrics || {}
  const branchCapacity = workspace.branchCapacity || {}
  return (
    <div className="space-y-6">
      <SectionShell
        eyebrow="Branch Workspace"
        title={branch.name || branch.branch || 'Branch'}
        description="Branch summary, ownership, workload, and operating health."
        action={<BreadcrumbButton onClick={onBack}>Back to Branches</BreadcrumbButton>}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryMetric label="Region" value={branch.region || 'Unassigned'} emphasis />
          <SummaryMetric label="Branch Manager" value={branch.manager || 'Unassigned'} emphasis />
          <SummaryMetric label="Status" value={branch.status || 'active'} emphasis />
          <SummaryMetric label="Branch Code" value={branch.code || 'No code'} />
        </div>
      </SectionShell>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label="Consultants" value={metrics.consultants || 0} emphasis />
        <SummaryMetric label="Active Applications" value={metrics.activeApplications || 0} emphasis />
        <SummaryMetric label="Submitted Applications" value={metrics.submittedApplications || 0} emphasis />
        <SummaryMetric label="Pending Documents" value={metrics.pendingDocuments || 0} emphasis />
        <SummaryMetric label="Approval Rate" value={formatPercent(metrics.approvalRate)} emphasis />
        <SummaryMetric label="Average Turnaround" value={formatLeadTime(metrics.averageTurnaround)} emphasis />
        <SummaryMetric label="Branch Health" value={metrics.branchHealth || 'Healthy'} emphasis />
        <SummaryMetric label="Submitted This Month" value={metrics.applicationsSubmittedThisMonth || 0} emphasis />
        <SummaryMetric label="Waiting For Documents" value={metrics.applicationsWaitingForDocuments || 0} />
        <SummaryMetric label="Without Consultant" value={metrics.applicationsWithoutConsultant || 0} />
      </section>
      {!normalizeText(branch.managerUserId || branch.manager_user_id) ? <BondEmptyState compact title="No branch manager assigned" description="Assign ownership to improve accountability." /> : null}
      {!Number(metrics.consultants || 0) ? <BondEmptyState compact title="No consultants assigned" description="Consultants will be added during Phase 5." /> : null}
      <SectionShell eyebrow="Capacity" title="Branch Capacity">
        {(branchCapacity.consultants || []).length ? (
          <div className="overflow-x-auto rounded-[18px] border border-[#e1e9f2]">
            <table className="min-w-[720px] border-collapse">
              <thead>
                <tr>
                  <HeaderCell>Consultant</HeaderCell>
                  <HeaderCell>Applications</HeaderCell>
                  <HeaderCell>Submitted</HeaderCell>
                  <HeaderCell>Pending Documents</HeaderCell>
                  <HeaderCell>Status</HeaderCell>
                </tr>
              </thead>
              <tbody>
                {(branchCapacity.consultants || []).map((row) => (
                  <tr key={row.consultantId} className="border-t border-[#edf2f7] bg-white">
                    <td className="px-4 py-4">
                      <p className="text-sm font-semibold text-[#142132]">{row.consultant}</p>
                      <p className="mt-1 text-xs text-[#71869d]">{row.status || 'active'}</p>
                    </td>
                    <td className="px-4 py-4 text-sm font-semibold text-[#17324d]">{row.activeApplications || 0}</td>
                    <td className="px-4 py-4 text-sm text-[#17324d]">{row.submittedApplications || 0}</td>
                    <td className="px-4 py-4 text-sm text-[#17324d]">{row.pendingDocuments || 0}</td>
                    <td className="px-4 py-4"><StatusPill status={row.capacityStatus || 'Light'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <BondEmptyState compact title="No consultant workload yet" description="Consultant capacity will appear once consultants are assigned to this branch." />
        )}
      </SectionShell>
      <RecentOrganisationActivity rows={workspace.recentActivity || []} />
      <SectionShell eyebrow="Workspace Tabs" title="Branch Workspace">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {(workspace.tabs || []).map((tab) => (
            <article key={tab} className="rounded-[16px] border border-[#e1e9f2] bg-[#fbfdff] p-4">
              <p className="text-sm font-semibold text-[#142132]">{tab}</p>
              <p className="mt-2 text-xs leading-5 text-[#60758d]">{tab === 'Overview' ? 'Showing real branch data.' : 'Coming in a later phase.'}</p>
            </article>
          ))}
        </div>
      </SectionShell>
    </div>
  )
}

function ConsultantFormModal({
  modal = null,
  branchOptions = [],
  onChange = () => {},
  onClose = () => {},
  onSubmit = () => {},
}) {
  if (!modal?.mode) return null
  const isAssign = modal.mode === 'assign'
  const isEdit = modal.mode === 'edit'
  const title = isAssign ? 'Assign Consultant' : isEdit ? 'Edit Consultant' : 'Add Consultant'
  const description = isAssign
    ? 'Move this consultant to a new branch.'
    : isEdit
      ? 'Update consultant details, branch assignment and operating status.'
      : 'Create a consultant and assign them to a branch.'
  const submitLabel = isAssign ? 'Assign Branch' : isEdit ? 'Save Consultant' : 'Create Consultant'
  const values = modal.values || {}
  const fieldErrors = modal.fieldErrors || {}
  const noBranches = !branchOptions.length
  const submitDisabled = Boolean(modal.submitting || noBranches)

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
      <div className="max-h-[calc(100dvh-32px)] w-full max-w-2xl overflow-y-auto rounded-[24px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#7d90a5]">Consultants</p>
            <h2 className="mt-2 text-xl font-semibold text-[#142132]">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#60758d]">{description}</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d9e4ef] text-[#60758d] transition hover:bg-[#f8fbff]">
            <X size={16} />
          </button>
        </div>
        {modal.error ? <p className="mt-4 rounded-[14px] border border-[#fecaca] bg-[#fff5f5] px-4 py-3 text-sm font-semibold text-[#9f2a2a]">{modal.error}</p> : null}
        <div className="mt-5 grid gap-4">
          {!isAssign ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold text-[#31475d]">First Name</span>
                  <input value={values.firstName || ''} onChange={(event) => onChange('firstName', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]" />
                  <FieldError message={fieldErrors.firstName} />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-[#31475d]">Last Name</span>
                  <input value={values.lastName || ''} onChange={(event) => onChange('lastName', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]" />
                  <FieldError message={fieldErrors.lastName} />
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold text-[#31475d]">Email</span>
                  <input value={values.email || ''} onChange={(event) => onChange('email', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]" />
                  <FieldError message={fieldErrors.email} />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-[#31475d]">Mobile Number</span>
                  <input value={values.mobileNumber || ''} onChange={(event) => onChange('mobileNumber', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]" />
                  <FieldError message={fieldErrors.mobileNumber} />
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold text-[#31475d]">Role</span>
                  <select value={values.role || 'consultant'} onChange={(event) => onChange('role', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] bg-white px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]">
                    {CONSULTANT_ROLE_OPTIONS.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                  </select>
                  <FieldError message={fieldErrors.role} />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-[#31475d]">Employee Number</span>
                  <input value={values.employeeNumber || ''} onChange={(event) => onChange('employeeNumber', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]" />
                </label>
              </div>
            </>
          ) : null}
          <label className="block">
            <span className="text-sm font-semibold text-[#31475d]">Branch</span>
            <select value={values.branchId || ''} onChange={(event) => onChange('branchId', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] bg-white px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]">
              <option value="">{branchOptions.length ? 'Select branch' : 'No branches found'}</option>
              {branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            {noBranches ? <p className="mt-2 text-xs font-semibold text-[#b45309]">No branches found. Create a branch before adding or assigning consultants.</p> : null}
            <FieldError message={fieldErrors.branchId} />
          </label>
          {!isAssign ? (
            <label className="block">
              <span className="text-sm font-semibold text-[#31475d]">Status</span>
              <select value={values.status || 'active'} onChange={(event) => onChange('status', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] bg-white px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <FieldError message={fieldErrors.status} />
            </label>
          ) : null}
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <CommandButton onClick={onClose}>Cancel</CommandButton>
          <CommandButton icon={isAssign ? Building2 : Plus} variant="primary" disabled={submitDisabled} onClick={onSubmit}>
            {modal.submitting ? 'Saving...' : submitLabel}
          </CommandButton>
        </div>
      </div>
    </div>
  )
}

function ReassignApplicationsModal({
  modal = null,
  consultantOptions = [],
  onChange = () => {},
  onClose = () => {},
  onSubmit = () => {},
}) {
  if (!modal?.open) return null
  const source = modal.consultant || {}
  const values = modal.values || {}
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[24px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#7d90a5]">Application Ownership</p>
            <h2 className="mt-2 text-xl font-semibold text-[#142132]">Reassign Applications</h2>
            <p className="mt-2 text-sm leading-6 text-[#60758d]">Move active applications from {source.consultant || source.name || 'this consultant'} to another consultant.</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d9e4ef] text-[#60758d] transition hover:bg-[#f8fbff]">
            <X size={16} />
          </button>
        </div>
        {modal.error ? <p className="mt-4 rounded-[14px] border border-[#fecaca] bg-[#fff5f5] px-4 py-3 text-sm font-semibold text-[#9f2a2a]">{modal.error}</p> : null}
        <div className="mt-5 grid gap-4">
          <SummaryMetric label="From" value={source.consultant || source.name || 'Consultant'} emphasis />
          <label className="block">
            <span className="text-sm font-semibold text-[#31475d]">To Consultant</span>
            <select value={values.toId || ''} onChange={(event) => onChange('toId', event.target.value)} className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e4ef] bg-white px-3 text-sm text-[#142132] outline-none focus:border-[#9fb8d1]">
              <option value="">Select consultant</option>
              {consultantOptions.filter((consultant) => normalizeText(consultant.id) !== normalizeText(source.id)).map((consultant) => (
                <option key={consultant.id} value={consultant.id}>{consultant.name} · {consultant.branch || 'Unassigned branch'}</option>
              ))}
            </select>
            <FieldError message={modal.fieldErrors?.toId} />
          </label>
          <label className="inline-flex items-center gap-3 text-sm font-semibold text-[#31475d]">
            <input type="checkbox" checked={values.allActive !== false} onChange={(event) => onChange('allActive', event.target.checked)} />
            Reassign all active applications
          </label>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <CommandButton onClick={onClose}>Cancel</CommandButton>
          <CommandButton icon={ArrowRight} variant="primary" onClick={onSubmit}>
            {modal.submitting ? 'Saving...' : 'Reassign Applications'}
          </CommandButton>
        </div>
      </div>
    </div>
  )
}

function ConsultantWorkspaceRoute({ workspace = null, onBack = () => {}, onOpenPerformance = () => {} }) {
  if (!workspace) {
    return (
      <HierarchySelectionUnavailable
        title="Consultant no longer available."
        description="This consultant could not be found in the current organisation scope."
        onBack={onBack}
        backLabel="Back to Consultants"
      />
    )
  }
  const consultant = workspace.consultant || {}
  const metrics = workspace.metrics || {}
  return (
    <div className="space-y-6">
      <SectionShell
        eyebrow="Consultant Workspace"
        title={consultant.name || consultant.consultant || 'Consultant'}
        description="Assigned applications, workload, activity, and consultant performance."
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <CommandButton icon={ShieldCheck} onClick={() => onOpenPerformance(consultant.id)}>Performance Centre</CommandButton>
            <BreadcrumbButton onClick={onBack}>Back to Consultants</BreadcrumbButton>
          </div>
        )}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <SummaryMetric label="Role" value={consultant.role || 'consultant'} emphasis />
          <SummaryMetric label="Branch" value={consultant.branch || 'Unassigned'} emphasis />
          <SummaryMetric label="Region" value={consultant.region || 'Unassigned'} emphasis />
          <SummaryMetric label="Status" value={consultant.status || 'active'} emphasis />
          <SummaryMetric label="Capacity Status" value={metrics.capacityStatus || 'Light'} emphasis />
        </div>
      </SectionShell>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label="Active Applications" value={metrics.activeApplications || 0} emphasis />
        <SummaryMetric label="Applications Submitted" value={metrics.submittedApplications || 0} emphasis />
        <SummaryMetric label="Pending Documents" value={metrics.pendingDocuments || 0} emphasis />
        <SummaryMetric label="Approval Rate" value={formatPercent(metrics.approvalRate)} emphasis />
        <SummaryMetric label="Decline Rate" value={formatPercent(metrics.declineRate)} />
        <SummaryMetric label="Average Turnaround" value={formatLeadTime(metrics.averageTurnaround)} emphasis />
        <SummaryMetric label="Bank Response" value={formatLeadTime(metrics.averageBankResponseTime)} />
        <SummaryMetric label="Quote Acceptance" value={formatPercent(metrics.quoteAcceptanceRate)} />
      </section>
      <SectionShell eyebrow="Workload" title="Workload Breakdown">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {(workspace.workloadBreakdown || []).map((item) => <SummaryMetric key={item.key} label={item.label} value={item.value} emphasis />)}
        </div>
      </SectionShell>
      <OrganisationApplicationsTable rows={workspace.applications || []} showBranchColumn showRegionColumn />
      <RecentOrganisationActivity rows={workspace.recentActivity || []} />
      <SectionShell eyebrow="Workspace Tabs" title="Consultant Workspace">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {(workspace.tabs || []).map((tab) => (
            <article key={tab} className="rounded-[16px] border border-[#e1e9f2] bg-[#fbfdff] p-4">
              <p className="text-sm font-semibold text-[#142132]">{tab}</p>
              <p className="mt-2 text-xs leading-5 text-[#60758d]">{tab === 'Overview' ? 'Showing real consultant data.' : 'Coming in a later phase.'}</p>
            </article>
          ))}
        </div>
      </SectionShell>
    </div>
  )
}

function ConsultantsWorkspace({
  rows = [],
  branches = [],
  regions = [],
  derived = false,
  canManage = false,
  onView = () => {},
  onAdd = () => {},
  onEdit = () => {},
  onAssignBranch = () => {},
  onReassign = () => {},
  onDeactivate = () => {},
  onRefresh = () => {},
  onExport = () => {},
}) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [regionId, setRegionId] = useState('all')
  const [branchId, setBranchId] = useState('all')

  const filteredRows = useMemo(() => {
    const query = normalizeText(search).toLowerCase()
    return rows.filter((row) => {
      const matchesSearch = !query || [
        row.consultant,
        row.email,
        row.branch,
        row.region,
        row.role,
      ].some((value) => normalizeText(value).toLowerCase().includes(query))
      const matchesStatus = status === 'all' || normalizeText(row.status) === status
      const matchesRegion = regionId === 'all' || normalizeText(row.regionId) === regionId
      const matchesBranch = branchId === 'all' || normalizeText(row.branchId) === branchId
      return matchesSearch && matchesStatus && matchesRegion && matchesBranch
    })
  }, [branchId, regionId, rows, search, status])

  const regionOptions = useMemo(
    () => [{ value: 'all', label: 'All Regions' }, ...regions.map((region) => ({ value: normalizeText(region.id), label: region.name || region.region || 'Region' }))],
    [regions],
  )
  const branchOptions = useMemo(
    () => [{ value: 'all', label: 'All Branches' }, ...branches.map((branch) => ({ value: normalizeText(branch.id), label: branch.name || branch.branch || 'Branch' }))],
    [branches],
  )

  if (!rows.length) {
    return (
      <SectionShell
        eyebrow="Consultants"
        title="Consultants"
        description="Manage consultant assignments, workload, ownership and performance."
        action={canManage ? <CommandButton icon={Plus} variant="primary" onClick={onAdd}>Add Consultant</CommandButton> : null}
      >
        <BondEmptyState compact title="Add consultants" description="Consultants own applications and manage buyer finance progress." />
      </SectionShell>
    )
  }

  return (
    <SectionShell
      eyebrow="Consultants"
      title="Consultants"
      description="Manage consultant assignments, workload, ownership and performance."
      action={(
        <div className="flex flex-wrap gap-2">
          {canManage ? <CommandButton icon={Plus} variant="primary" onClick={onAdd}>Add Consultant</CommandButton> : null}
          <CommandButton icon={Download} onClick={onExport}>Export</CommandButton>
          <CommandButton icon={RefreshCw} onClick={onRefresh}>Refresh</CommandButton>
        </div>
      )}
    >
      {derived ? (
        <p className="mb-4 rounded-[16px] border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-sm text-[#92400e]">
          No configured consultants found. Showing consultants inferred from current applications.
        </p>
      ) : null}
      <FilterBar
        searchPlaceholder="Search consultants..."
        searchValue={search}
        onSearchChange={setSearch}
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: status,
            onChange: setStatus,
            options: [
              { value: 'all', label: 'All Statuses' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ],
          },
          {
            key: 'region',
            label: 'Region',
            value: regionId,
            onChange: setRegionId,
            options: regionOptions,
          },
          {
            key: 'branch',
            label: 'Branch',
            value: branchId,
            onChange: setBranchId,
            options: branchOptions,
          },
        ]}
      />
      <div className="overflow-x-auto rounded-[18px] border border-[#e1e9f2]">
        <table className="min-w-[1320px] border-collapse">
          <thead>
            <tr>
              <HeaderCell>Consultant</HeaderCell>
              <HeaderCell>Branch</HeaderCell>
              <HeaderCell>Region</HeaderCell>
              <HeaderCell>Role</HeaderCell>
              <HeaderCell>Status</HeaderCell>
              <HeaderCell>Active Applications</HeaderCell>
              <HeaderCell>Submitted Applications</HeaderCell>
              <HeaderCell>Pending Documents</HeaderCell>
              <HeaderCell>Approval Rate</HeaderCell>
              <HeaderCell>Average Turnaround</HeaderCell>
              <HeaderCell>Last Activity</HeaderCell>
              <HeaderCell>Action</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.id} className="border-t border-[#edf2f7] bg-white align-top transition hover:bg-[#fbfdff]">
                <td className="px-4 py-4">
                  <p className="text-sm font-semibold text-[#142132]">{row.consultant || row.name}</p>
                  <p className="mt-1 text-xs text-[#71869d]">{row.email || 'No email captured'}</p>
                </td>
                <td className="px-4 py-4 text-sm text-[#17324d]">{row.branch || 'Unassigned'}</td>
                <td className="px-4 py-4 text-sm text-[#17324d]">{row.region || 'Unassigned'}</td>
                <td className="px-4 py-4 text-sm text-[#17324d]">{row.role || 'consultant'}</td>
                <td className="px-4 py-4"><StatusPill status={row.status || 'active'} /></td>
                <td className="px-4 py-4 text-sm font-semibold text-[#17324d]">{row.activeApplications || 0}</td>
                <td className="px-4 py-4 text-sm font-semibold text-[#17324d]">{row.submittedApplications || 0}</td>
                <td className="px-4 py-4 text-sm font-semibold text-[#17324d]">{row.pendingDocuments || row.pendingDocs || 0}</td>
                <td className="px-4 py-4 text-sm font-semibold text-[#17324d]">{formatPercent(row.approvalRate)}</td>
                <td className="px-4 py-4 text-sm text-[#17324d]">{formatLeadTime(row.averageTurnaround || row.avgLeadTime)}</td>
                <td className="px-4 py-4 text-sm text-[#60758d]">{row.lastActivity || 'No recent activity'}</td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => onView(row)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#d9e4ef] px-2.5 py-1.5 text-xs font-semibold text-[#24518a]">
                      <Eye size={13} /> View
                    </button>
                    {canManage ? (
                      <>
                        <button type="button" onClick={() => onEdit(row)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#d9e4ef] px-2.5 py-1.5 text-xs font-semibold text-[#31475d]">
                          <Pencil size={13} /> Edit
                        </button>
                        <button type="button" onClick={() => onAssignBranch(row)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#d9e4ef] px-2.5 py-1.5 text-xs font-semibold text-[#31475d]">
                          <Building2 size={13} /> Assign Branch
                        </button>
                        <button type="button" onClick={() => onReassign(row)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#d9e4ef] px-2.5 py-1.5 text-xs font-semibold text-[#31475d]">
                          <ArrowRight size={13} /> Reassign
                        </button>
                        <button type="button" onClick={() => onDeactivate(row)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#f3d4d4] px-2.5 py-1.5 text-xs font-semibold text-[#8f2f2f]">
                          Deactivate
                        </button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {!filteredRows.length ? (
              <tr>
                <td colSpan={12} className="px-4 py-6">
                  <BondEmptyState compact title="No consultants match these filters." description="Try a wider region or branch filter." />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </SectionShell>
  )
}

export default function BondOrganisationPage({
  service = DEFAULT_BOND_ORGANISATION_SERVICE,
}) {
  const workspaceContext = useWorkspace()
  const workspaceId = resolveWorkspaceId(workspaceContext)
  const location = useLocation()
  const navigate = useNavigate()
  const routeParams = useParams()
  const [state, setState] = useState({
    loading: true,
    error: '',
    snapshot: null,
  })
  const [regionModal, setRegionModal] = useState({ mode: '', region: null, values: {}, fieldErrors: {}, error: '', submitting: false })
  const [branchModal, setBranchModal] = useState({ mode: '', branch: null, values: {}, fieldErrors: {}, error: '', submitting: false })
  const [consultantModal, setConsultantModal] = useState({ mode: '', consultant: null, values: {}, fieldErrors: {}, error: '', submitting: false })
  const [routingModal, setRoutingModal] = useState({ mode: '', rule: null, values: {}, fieldErrors: {}, error: '', submitting: false })
  const [partnerModal, setPartnerModal] = useState({ mode: '', partner: null, values: {}, fieldErrors: {}, error: '', submitting: false })
  const [reassignModal, setReassignModal] = useState({ open: false, consultant: null, values: {}, fieldErrors: {}, error: '', submitting: false })
  const [notice, setNotice] = useState('')

  const loadOrganisation = useCallback(async ({ force = false } = {}) => {
    if (!workspaceId) {
      setState({ loading: false, error: 'missing_workspace_context', snapshot: null })
      return
    }
    if (!force && service === DEFAULT_BOND_ORGANISATION_SERVICE) {
      const cachedSnapshot = getCachedOrganisationSnapshot(workspaceId)
      if (cachedSnapshot) {
        setState({ loading: false, error: '', snapshot: cachedSnapshot })
        return
      }
    }
    if (force && service === DEFAULT_BOND_ORGANISATION_SERVICE) {
      clearCachedOrganisationSnapshot(workspaceId)
    }
    setState((previous) => ({ ...previous, loading: true, error: '' }))
    try {
      const snapshot = await service.getBondOrganisationSnapshot(workspaceContext, workspaceId, { includeDemoRows: false })
      if (service === DEFAULT_BOND_ORGANISATION_SERVICE) {
        setCachedOrganisationSnapshot(workspaceId, snapshot)
      }
      setState({ loading: false, error: '', snapshot })
    } catch (error) {
      setState({
        loading: false,
        error: String(error?.message || 'bond_organisation_load_failed'),
        snapshot: null,
      })
    }
  }, [service, workspaceContext, workspaceId])

  useEffect(() => {
    void loadOrganisation()
  }, [loadOrganisation])

  const snapshot = state.snapshot
  const rawTabs = snapshot?.tabs || FALLBACK_ORGANISATION_TABS
  const tabs = isHqOrganisationScope(snapshot)
    ? rawTabs
        .filter((tab) => tab.key !== 'regions')
        .map((tab) => (tab.key === 'branches' ? { ...tab, label: 'Branches / Regions' } : tab))
    : rawTabs
  const regionWorkspaceId = normalizeText(routeParams.regionId)
  const branchWorkspaceId = normalizeText(routeParams.branchId)
  const consultantWorkspaceId = normalizeText(routeParams.consultantId)
  const partnerWorkspaceId = normalizeText(routeParams.partnerId)
  const selectedView = partnerWorkspaceId ? 'partners' : consultantWorkspaceId ? 'consultants' : branchWorkspaceId ? 'branches' : regionWorkspaceId ? 'regions' : resolveRouteView(location)
  const params = useMemo(() => new URLSearchParams(location.search), [location.search])
  const selectedRegionId = regionWorkspaceId || normalizeText(params.get('regionId')) || normalizeText(params.get('region'))
  const selectedBranchId = branchWorkspaceId || normalizeText(params.get('branchId'))
  const selectedConsultantId = consultantWorkspaceId || normalizeText(params.get('consultantId'))
  const selectedPartnerId = partnerWorkspaceId || normalizeText(params.get('partnerId'))
  const canManageOrganisation = scopeCanManage(snapshot)
  const canManageRegions = Boolean(snapshot?.capabilities?.canManageRegions)
  const canManageBranches = Boolean(snapshot?.capabilities?.canManageBranches)
  const canMoveBranches = Boolean(snapshot?.capabilities?.canMoveBranches)
  const canManageConsultants = Boolean(snapshot?.capabilities?.canManageConsultants)
  const canManagePartners = Boolean(snapshot?.capabilities?.canManagePartners)
  const canManageRoutingRules = Boolean(snapshot?.capabilities?.canManageRoutingRules)
  const isHqBranchCommandView = selectedView === 'branches' && !branchWorkspaceId && isHqOrganisationScope(snapshot)
  const isHqConsultantCommandView = selectedView === 'consultants' && !consultantWorkspaceId && isHqOrganisationScope(snapshot)
  const isRegionCommandView = selectedView === 'regions' && Boolean(selectedRegionId)
  const canRenderSelectedView = isRegionCommandView || canAccessOrganisationView(selectedView, snapshot)

  const selectedRegion = useMemo(
    () => resolveSelectedHierarchyRow(selectedRegionId, snapshot?.regionPerformance || [], ['region', 'name']),
    [selectedRegionId, snapshot?.regionPerformance],
  )
  const selectedRegionWorkspace = useMemo(() => {
    if (!snapshot || !selectedRegionId) return null
    if (snapshot.regionWorkspaces?.[selectedRegionId]) return snapshot.regionWorkspaces[selectedRegionId]
    const selectedSlug = toRouteSlug(selectedRegionId)
    const region = (snapshot.regions || []).find((row) => (
      normalizeText(row.id) === selectedRegionId ||
      normalizeText(row.name || row.region) === selectedRegionId ||
      toRouteSlug(row.id) === selectedSlug ||
      toRouteSlug(row.name || row.region) === selectedSlug
    )) || selectedRegion
    const regionKey = normalizeText(region?.id)
    return regionKey ? snapshot.regionWorkspaces?.[regionKey] || null : null
  }, [selectedRegion, selectedRegionId, snapshot])
  const selectedBranch = useMemo(
    () => resolveSelectedHierarchyRow(selectedBranchId, snapshot?.branchPerformance || [], ['branch', 'name']),
    [selectedBranchId, snapshot?.branchPerformance],
  )
  const selectedConsultant = useMemo(
    () => resolveSelectedHierarchyRow(selectedConsultantId, snapshot?.consultantPerformance || [], ['consultant', 'name', 'email']),
    [selectedConsultantId, snapshot?.consultantPerformance],
  )
  const selectedPartner = useMemo(
    () => resolveSelectedHierarchyRow(selectedPartnerId, snapshot?.partnerPerformance || [], ['name', 'primaryContactEmail']),
    [selectedPartnerId, snapshot?.partnerPerformance],
  )
  const viewKpis = useMemo(() => {
    if (!snapshot) return { items: [] }
    if (selectedView === 'regions') {
      const subject = selectedRegion || snapshot?.kpis || {}
      return {
        items: [
          { key: 'regions', label: 'Regions', value: selectedRegion ? 1 : (snapshot?.kpis?.regions || 0), icon: Network },
          { key: 'branches', label: 'Branches', value: selectedRegion ? subject.branches || 0 : (snapshot?.kpis?.branches || 0), icon: Building2 },
          { key: 'consultants', label: 'Consultants', value: selectedRegion ? subject.consultants || 0 : (snapshot?.kpis?.consultants || 0), icon: Users },
          { key: 'activeApplications', label: 'Active Applications', value: selectedRegion ? subject.activeApplications || 0 : (snapshot?.kpis?.activeApplications || 0), icon: FileText },
        ],
      }
    }
    if (selectedView === 'branches') {
      const subject = selectedBranch || snapshot?.kpis || {}
      return {
        items: [
          { key: 'branches', label: 'Branches', value: selectedBranch ? 1 : (snapshot?.kpis?.branches || 0), icon: Building2 },
          { key: 'consultants', label: 'Consultants', value: selectedBranch ? subject.consultants || 0 : (snapshot?.kpis?.consultants || 0), icon: Users },
          { key: 'activeApplications', label: 'Active Applications', value: selectedBranch ? subject.activeApplications || 0 : (snapshot?.kpis?.activeApplications || 0), icon: FileText },
          { key: 'avgLeadTime', label: 'Avg Lead Time', value: formatLeadTime(selectedBranch ? subject.avgLeadTime : snapshot?.kpis?.avgLeadTime), icon: Clock3 },
        ],
      }
    }
    if (selectedView === 'consultants') {
      const subject = selectedConsultant || snapshot?.kpis || {}
      return {
        items: [
          { key: 'consultants', label: 'Consultants', value: selectedConsultant ? 1 : (snapshot?.kpis?.consultants || 0), icon: Users },
          { key: 'activeApplications', label: 'Active Applications', value: selectedConsultant ? subject.activeApplications || 0 : (snapshot?.kpis?.activeApplications || 0), icon: FileText },
          { key: 'approvalRate', label: 'Approval Rate', value: formatPercent(selectedConsultant ? subject.approvalRate : snapshot?.kpis?.approvalRate), icon: ShieldCheck },
          { key: 'avgLeadTime', label: 'Avg Lead Time', value: formatLeadTime(selectedConsultant ? subject.avgLeadTime : snapshot?.kpis?.avgLeadTime), icon: Clock3 },
        ],
      }
    }
    if (selectedView === 'routing-rules') {
      const routing = snapshot?.routingDashboard || {}
      return {
        items: [
          { key: 'agencyRules', label: 'Agency Rules', value: routing.agencyRules?.length || 0, icon: Route },
          { key: 'developmentRules', label: 'Development Rules', value: routing.developmentRules?.length || 0, icon: Building2 },
          { key: 'regionalRules', label: 'Regional Rules', value: routing.regionalRules?.length || 0, icon: Network },
          { key: 'fallback', label: 'Fallback Branch', value: routing.companyFallback ? 1 : 0, icon: SlidersHorizontal },
        ],
      }
    }
    if (selectedView === 'partners') {
      const subject = selectedPartner || {}
      return {
        items: [
          { key: 'partners', label: 'Partners', value: selectedPartner ? 1 : (snapshot?.counts?.partners || 0), icon: Building2 },
          { key: 'applicationsSent', label: 'Applications Sent', value: selectedPartner ? subject.applicationsSent || 0 : (snapshot?.partnerPerformance || []).reduce((sum, row) => sum + Number(row.applicationsSent || 0), 0), icon: FileText },
          { key: 'activeApplications', label: 'Active Applications', value: selectedPartner ? subject.activeApplications || 0 : (snapshot?.partnerPerformance || []).reduce((sum, row) => sum + Number(row.activeApplications || 0), 0), icon: Users },
          { key: 'approvalRate', label: 'Approval Rate', value: formatPercent(selectedPartner ? subject.approvalRate : 0), icon: ShieldCheck },
        ],
      }
    }
    return {
      items: [
        { key: 'regions', label: 'Regions', value: snapshot?.kpis?.regions || 0, icon: Network },
        { key: 'branches', label: 'Branches', value: snapshot?.kpis?.branches || 0, icon: Building2 },
        { key: 'consultants', label: 'Consultants', value: snapshot?.kpis?.consultants || 0, icon: Users },
        { key: 'activeApplications', label: 'Active Applications', value: snapshot?.kpis?.activeApplications || 0, icon: FileText },
        { key: 'approvalRate', label: 'Approval Rate', value: formatPercent(snapshot?.kpis?.approvalRate), icon: ShieldCheck },
        { key: 'avgLeadTime', label: 'Avg Lead Time', value: formatLeadTime(snapshot?.kpis?.avgLeadTime), icon: Clock3 },
      ],
    }
  }, [selectedBranch, selectedConsultant, selectedPartner, selectedRegion, selectedView, snapshot])

  const regionManagerOptions = useMemo(() => getRegionManagerOptions(snapshot), [snapshot])

  const branchManagerOptions = useMemo(() => getBranchManagerOptions(snapshot), [snapshot])

  const branchRegionOptions = useMemo(
    () => (snapshot?.regions || []).map((region) => ({ id: normalizeText(region.id), name: normalizeText(region.name || region.region) || 'Region' })),
    [snapshot?.regions],
  )
  const consultantBranchOptions = useMemo(
    () => (snapshot?.branches || []).map((branch) => ({ id: normalizeText(branch.id), name: normalizeText(branch.name || branch.branch) || 'Branch' })),
    [snapshot?.branches],
  )
  const consultantOptions = useMemo(
    () => (snapshot?.consultants || []).map((consultant) => ({
      id: normalizeText(consultant.id || consultant.user_id || consultant.userId),
      name: normalizeText(consultant.name || consultant.email) || 'Consultant',
      branch: normalizeText(consultant.branch || consultant.branchId || consultant.workspaceUnitId),
    })).filter((consultant) => consultant.id),
    [snapshot?.consultants],
  )

  function handleViewChange(nextView) {
    navigate(getBondOrganisationRouteForTab(nextView))
  }

  function openRegion(region) {
    navigate(getBondRegionWorkspaceRoute(region.id))
  }

  function openBranch(branch) {
    navigate(getBondBranchWorkspaceRoute(branch.id))
  }

  function openConsultant(consultant) {
    navigate(getBondConsultantWorkspaceRoute(consultant.id))
  }

  function openPartner(partner) {
    navigate(getBondPartnerWorkspaceRoute(partner.id))
  }

  function openSettings() {
    navigate('/settings/organisation')
  }

  function openRoutingRuleForm(mode = 'create', rule = null) {
    setNotice('')
    setRoutingModal({
      mode,
      rule,
      values: {
        ruleType: rule?.ruleType || 'agency',
        sourceId: rule?.sourceId || '',
        sourceName: rule?.sourceName || '',
        regionId: rule?.regionId || '',
        branchId: rule?.branchId || '',
        consultantId: rule?.consultantId || '',
        priority: rule?.priority || 100,
        status: rule?.status || 'active',
      },
      fieldErrors: {},
      error: '',
      submitting: false,
    })
  }

  function updateRoutingModalValue(field, value) {
    setRoutingModal((previous) => ({
      ...previous,
      values: {
        ...previous.values,
        [field]: value,
      },
      fieldErrors: {
        ...previous.fieldErrors,
        [field]: '',
      },
      error: '',
    }))
  }

  async function submitRoutingRuleModal() {
    if (!routingModal.mode || routingModal.submitting) return
    setRoutingModal((previous) => ({ ...previous, submitting: true, error: '', fieldErrors: {} }))
    try {
      if (routingModal.mode === 'create') {
        await service.createRoutingRule(routingModal.values, workspaceContext, workspaceId)
        setNotice('Routing rule created.')
      } else {
        await service.updateRoutingRule(routingModal.rule?.id, routingModal.values, workspaceContext, workspaceId)
        setNotice('Routing rule updated.')
      }
      setRoutingModal({ mode: '', rule: null, values: {}, fieldErrors: {}, error: '', submitting: false })
      await loadOrganisation({ force: true })
    } catch (error) {
      setRoutingModal((previous) => ({
        ...previous,
        submitting: false,
        error: String(error?.message || 'Could not save this routing rule.'),
        fieldErrors: error?.fieldErrors || {},
      }))
    }
  }

  async function handleDisableRoutingRule(rule) {
    setNotice('')
    try {
      await service.disableRoutingRule(rule.id, workspaceContext, workspaceId)
      setNotice('Routing rule disabled.')
      await loadOrganisation({ force: true })
    } catch (error) {
      setNotice(String(error?.message || 'Could not disable routing rule.'))
    }
  }

  function openPartnerForm(mode = 'create', partner = null) {
    setNotice('')
    setPartnerModal({
      mode,
      partner,
      values: {
        name: partner?.name || '',
        type: partner?.type || partner?.partnerType || 'agency',
        primaryContactName: partner?.primaryContactName || '',
        primaryContactEmail: partner?.primaryContactEmail || '',
        primaryContactNumber: partner?.primaryContactNumber || '',
        defaultRegionId: partner?.defaultRegionId || '',
        defaultBranchId: partner?.defaultBranchId || '',
        defaultConsultantId: partner?.defaultConsultantId || '',
        invitedEmail: partner?.primaryContactEmail || '',
        status: normalizeText(partner?.status) || 'draft',
        notes: partner?.notes || '',
      },
      fieldErrors: {},
      error: '',
      submitting: false,
    })
  }

  function updatePartnerModalValue(field, value) {
    setPartnerModal((previous) => ({
      ...previous,
      values: {
        ...previous.values,
        [field]: value,
      },
      fieldErrors: {
        ...previous.fieldErrors,
        [field]: '',
      },
      error: '',
    }))
  }

  async function submitPartnerModal() {
    if (!partnerModal.mode || partnerModal.submitting) return
    setPartnerModal((previous) => ({ ...previous, submitting: true, error: '', fieldErrors: {} }))
    try {
      if (partnerModal.mode === 'create') {
        await service.createBondPartner(partnerModal.values, workspaceContext, workspaceId)
        setNotice('Partner created.')
      } else if (partnerModal.mode === 'edit') {
        await service.updateBondPartner(partnerModal.partner?.id, partnerModal.values, workspaceContext, workspaceId)
        setNotice('Partner updated.')
      } else if (partnerModal.mode === 'routing') {
        await service.setPartnerRoutingDefaults(partnerModal.partner?.id, partnerModal.values, workspaceContext, workspaceId)
        setNotice('Partner routing default updated.')
      } else if (partnerModal.mode === 'invite') {
        await service.inviteBondPartner(partnerModal.partner?.id, partnerModal.values.invitedEmail, workspaceContext, workspaceId)
        setNotice('Partner invitation sent.')
      }
      setPartnerModal({ mode: '', partner: null, values: {}, fieldErrors: {}, error: '', submitting: false })
      await loadOrganisation({ force: true })
    } catch (error) {
      setPartnerModal((previous) => ({
        ...previous,
        submitting: false,
        error: String(error?.message || 'Could not save this partner.'),
        fieldErrors: error?.fieldErrors || {},
      }))
    }
  }

  async function handleDisablePartner(partner) {
    setNotice('')
    try {
      await service.updateBondPartner(partner.id, { ...partner, status: 'disabled' }, workspaceContext, workspaceId)
      setNotice('Partner disabled.')
      await loadOrganisation({ force: true })
    } catch (error) {
      setNotice(String(error?.message || 'Could not disable partner.'))
    }
  }

  function openRegionForm(mode = 'create', region = null) {
    setNotice('')
    setRegionModal({
      mode,
      region,
      values: {
        name: region?.name || region?.region || '',
        code: region?.code || '',
        managerUserId: region?.managerUserId || '',
        notes: region?.notes || '',
        status: normalizeText(region?.status) || 'active',
      },
      fieldErrors: {},
      error: '',
      submitting: false,
    })
  }

  function updateRegionModalValue(field, value) {
    setRegionModal((previous) => ({
      ...previous,
      values: {
        ...previous.values,
        [field]: value,
      },
      fieldErrors: {
        ...previous.fieldErrors,
        [field]: '',
      },
      error: '',
    }))
  }

  async function submitRegionModal() {
    if (!regionModal.mode || regionModal.submitting) return
    setRegionModal((previous) => ({ ...previous, submitting: true, error: '', fieldErrors: {} }))
    try {
      if (regionModal.mode === 'create') {
        await service.createBondRegion(regionModal.values, workspaceContext, workspaceId)
        setNotice('Region created.')
      } else if (regionModal.mode === 'edit') {
        await service.updateBondRegion(regionModal.region?.id, regionModal.values, workspaceContext, workspaceId)
        setNotice('Region updated.')
      } else if (regionModal.mode === 'assign') {
        await service.assignBondRegionManager(regionModal.region?.id, regionModal.values.managerUserId, workspaceContext, workspaceId)
        setNotice('Regional manager assigned.')
      }
      setRegionModal({ mode: '', region: null, values: {}, fieldErrors: {}, error: '', submitting: false })
      await loadOrganisation({ force: true })
    } catch (error) {
      setRegionModal((previous) => ({
        ...previous,
        submitting: false,
        error: String(error?.message || 'Could not save this region.'),
        fieldErrors: error?.fieldErrors || {},
      }))
    }
  }

  function openBranchForm(mode = 'create', branch = null) {
    setNotice('')
    setBranchModal({
      mode,
      branch,
      values: {
        name: branch?.name || branch?.branch || '',
        regionId: branch?.regionId || (mode === 'create' && branchRegionOptions.length === 1 ? branchRegionOptions[0].id : ''),
        code: branch?.code || '',
        managerUserId: branch?.managerUserId || '',
        officeLocation: branch?.officeLocation || '',
        contactEmail: branch?.contactEmail || '',
        contactNumber: branch?.contactNumber || '',
        notes: branch?.notes || '',
        status: normalizeText(branch?.status) || 'active',
      },
      fieldErrors: {},
      error: '',
      submitting: false,
    })
  }

  function updateBranchModalValue(field, value) {
    setBranchModal((previous) => ({
      ...previous,
      values: {
        ...previous.values,
        [field]: value,
      },
      fieldErrors: {
        ...previous.fieldErrors,
        [field]: '',
      },
      error: '',
    }))
  }

  async function submitBranchModal() {
    if (!branchModal.mode || branchModal.submitting) return
    setBranchModal((previous) => ({ ...previous, submitting: true, error: '', fieldErrors: {} }))
    try {
      if (branchModal.mode === 'create') {
        await service.createBondBranch(branchModal.values, workspaceContext, workspaceId)
        setNotice('Branch created.')
      } else if (branchModal.mode === 'edit') {
        await service.updateBondBranch(branchModal.branch?.id, branchModal.values, workspaceContext, workspaceId)
        setNotice('Branch updated.')
      } else if (branchModal.mode === 'assign') {
        await service.assignBondBranchManager(branchModal.branch?.id, branchModal.values.managerUserId, workspaceContext, workspaceId)
        setNotice('Branch manager assigned.')
      } else if (branchModal.mode === 'move') {
        await service.moveBondBranchToRegion(branchModal.branch?.id, branchModal.values.regionId, workspaceContext, workspaceId)
        setNotice('Branch moved.')
      }
      setBranchModal({ mode: '', branch: null, values: {}, fieldErrors: {}, error: '', submitting: false })
      await loadOrganisation({ force: true })
    } catch (error) {
      setBranchModal((previous) => ({
        ...previous,
        submitting: false,
        error: String(error?.message || 'Could not save this branch.'),
        fieldErrors: error?.fieldErrors || {},
      }))
    }
  }

  function openConsultantForm(mode = 'create', consultant = null) {
    setNotice('')
    const nameParts = normalizeText(consultant?.consultant || consultant?.name).split(/\s+/)
    setConsultantModal({
      mode,
      consultant,
      values: {
        firstName: consultant?.firstName || nameParts[0] || '',
        lastName: consultant?.lastName || nameParts.slice(1).join(' ') || '',
        email: consultant?.email || '',
        mobileNumber: consultant?.mobileNumber || '',
        role: normalizeText(consultant?.role) || 'consultant',
        branchId: consultant?.branchId || (mode === 'create' && consultantBranchOptions.length === 1 ? consultantBranchOptions[0].id : ''),
        employeeNumber: consultant?.employeeNumber || '',
        status: normalizeText(consultant?.status) || 'active',
      },
      fieldErrors: {},
      error: '',
      submitting: false,
    })
  }

  function updateConsultantModalValue(field, value) {
    setConsultantModal((previous) => ({
      ...previous,
      values: {
        ...previous.values,
        [field]: value,
      },
      fieldErrors: {
        ...previous.fieldErrors,
        [field]: '',
      },
      error: '',
    }))
  }

  async function submitConsultantModal() {
    if (!consultantModal.mode || consultantModal.submitting) return
    setConsultantModal((previous) => ({ ...previous, submitting: true, error: '', fieldErrors: {} }))
    try {
      if (consultantModal.mode === 'create') {
        await service.createBondConsultant(consultantModal.values, workspaceContext, workspaceId)
        setNotice('Consultant created.')
      } else if (consultantModal.mode === 'edit') {
        await service.updateBondConsultant(consultantModal.consultant?.id, consultantModal.values, workspaceContext, workspaceId)
        setNotice('Consultant updated.')
      } else if (consultantModal.mode === 'assign') {
        await service.assignConsultantToBranch(consultantModal.consultant?.id, consultantModal.values.branchId, workspaceContext, workspaceId)
        setNotice('Consultant assigned to branch.')
      }
      setConsultantModal({ mode: '', consultant: null, values: {}, fieldErrors: {}, error: '', submitting: false })
      await loadOrganisation({ force: true })
    } catch (error) {
      setConsultantModal((previous) => ({
        ...previous,
        submitting: false,
        error: String(error?.message || 'Could not save this consultant.'),
        fieldErrors: error?.fieldErrors || {},
      }))
    }
  }

  function openReassignApplications(consultant) {
    setNotice('')
    setReassignModal({
      open: true,
      consultant,
      values: { toId: '', allActive: true },
      fieldErrors: {},
      error: '',
      submitting: false,
    })
  }

  function updateReassignModalValue(field, value) {
    setReassignModal((previous) => ({
      ...previous,
      values: {
        ...previous.values,
        [field]: value,
      },
      fieldErrors: {
        ...previous.fieldErrors,
        [field]: '',
      },
      error: '',
    }))
  }

  async function submitReassignApplications() {
    if (!reassignModal.open || reassignModal.submitting) return
    setReassignModal((previous) => ({ ...previous, submitting: true, error: '', fieldErrors: {} }))
    try {
      await service.reassignApplications(reassignModal.consultant?.id, reassignModal.values.toId, [], workspaceContext, workspaceId)
      setNotice('Applications reassigned.')
      setReassignModal({ open: false, consultant: null, values: {}, fieldErrors: {}, error: '', submitting: false })
      await loadOrganisation({ force: true })
    } catch (error) {
      setReassignModal((previous) => ({
        ...previous,
        submitting: false,
        error: String(error?.message || 'Could not reassign applications.'),
        fieldErrors: error?.fieldErrors || {},
      }))
    }
  }

  async function handleDeactivateConsultant(consultant) {
    setNotice('')
    try {
      await service.deactivateConsultant(consultant.id, workspaceContext, workspaceId)
      setNotice('Consultant deactivated.')
      await loadOrganisation({ force: true })
    } catch (error) {
      if (error?.fieldErrors?.activeApplications) {
        setReassignModal({
          open: true,
          consultant,
          values: { toId: '', allActive: true },
          fieldErrors: {},
          error: String(error?.message || 'Reassign active applications before deactivation.'),
          submitting: false,
        })
        return
      }
      setNotice(String(error?.message || 'Could not deactivate consultant.'))
    }
  }

  function openFirstBranchManagerAssignment() {
    const rows = snapshot?.overview?.branchCommandCentre?.directory || snapshot?.branchPerformance || []
    const target = rows.find((row) => !row.hasManager || normalizeLower(row.manager) === 'unassigned') || rows[0]
    if (!target) {
      setNotice('Create a branch before assigning a branch manager.')
      return
    }
    openBranchForm('assign', target)
  }

  function openFirstConsultantBranchAssignment() {
    const rows = snapshot?.overview?.consultantCommandCentre?.directory || snapshot?.consultantPerformance || []
    const target = rows.find((row) => !normalizeText(row.branchId) || normalizeLower(row.branch) === 'unassigned') || rows[0]
    if (!target) {
      setNotice('Create a consultant before assigning a consultant to a branch.')
      return
    }
    openConsultantForm('assign', target)
  }

  if (!workspaceId) {
    return (
      <section className="rounded-[18px] border border-[#f1d0d0] bg-[#fff5f5] px-4 py-4">
        <p className="text-sm font-semibold text-[#8f2f2f]">We could not load your Bond workspace context.</p>
        <p className="mt-1 text-sm text-[#9d4d4d]">Please switch workspace or try again.</p>
      </section>
    )
  }

  if (!state.loading && state.error) {
    return (
      <section className="rounded-[18px] border border-[#f1d0d0] bg-[#fff5f5] px-4 py-4">
        <p className="text-sm font-semibold text-[#8f2f2f]">We could not load the organisation workspace.</p>
        <p className="mt-1 text-sm text-[#9d4d4d]">Please refresh or try another workspace.</p>
      </section>
    )
  }

  return (
    <BondPageShell>
      {!isRegionCommandView ? (
        <OrganisationCommandHeader
          snapshot={snapshot}
          view={selectedView}
          regionTitle={selectedView === 'regions' ? selectedRegion?.region || '' : ''}
          branchTitle={selectedView === 'branches' ? selectedBranch?.branch || '' : ''}
          consultantTitle={selectedView === 'consultants' ? selectedConsultant?.consultant || '' : ''}
          partnerTitle={selectedView === 'partners' ? selectedPartner?.name || '' : ''}
          navigate={navigate}
          onAddRegion={() => openRegionForm('create')}
          onAddBranch={() => openBranchForm('create')}
          onAddConsultant={() => openConsultantForm('create')}
          onAssignBranchManager={openFirstBranchManagerAssignment}
          onInviteConsultant={() => openConsultantForm('create')}
          onAssignConsultant={openFirstConsultantBranchAssignment}
          onExport={() => setNotice('Consultant export will be available in a later phase.')}
        />
      ) : null}

      {snapshot ? (
        <>
          {notice ? (
            <section className="rounded-[16px] border border-[#ccebd8] bg-[#eefbf3] px-4 py-3 text-sm font-semibold text-[#1f7a4d]">
              {notice}
            </section>
          ) : null}
          {selectedView !== 'overview' && canRenderSelectedView && !isHqBranchCommandView && !isHqConsultantCommandView && !isRegionCommandView ? <OrganisationKpiStrip kpis={viewKpis} /> : null}
          {selectedView !== 'overview' && !isHqBranchCommandView && !isHqConsultantCommandView && !isRegionCommandView && !branchWorkspaceId && !consultantWorkspaceId && !partnerWorkspaceId ? <BondViewTabs tabs={tabs} value={selectedView} counts={snapshot?.counts || {}} onChange={handleViewChange} /> : null}

          {!canRenderSelectedView ? (
            <OrganisationViewUnavailable view={selectedView} />
          ) : null}

          {canRenderSelectedView && selectedView === 'overview' ? (
            <OrganisationOverviewDashboard snapshot={snapshot} navigate={navigate} canManage={canManageOrganisation} />
          ) : null}

          {canRenderSelectedView && isRegionCommandView ? (
            <RegionWorkspaceRoute
              workspace={selectedRegionWorkspace}
              snapshot={snapshot}
              regionId={selectedRegionId}
              onBack={() => navigate(getBondOrganisationRouteForTab('regions'))}
            />
          ) : null}

          {canRenderSelectedView && selectedView === 'regions' && !isRegionCommandView ? (
            <RegionsWorkspace
              rows={snapshot.regionPerformance || []}
              canManage={canManageRegions}
              derived={Boolean(snapshot?.derivedSources?.regions)}
              onView={openRegion}
              onAdd={() => openRegionForm('create')}
              onEdit={(row) => openRegionForm('edit', row)}
              onAssign={(row) => openRegionForm('assign', row)}
              onRefresh={loadOrganisation}
              onExport={() => setNotice('Region export will be available in a later phase.')}
            />
          ) : null}

          {canRenderSelectedView && selectedView === 'branches' && branchWorkspaceId ? (
            <BranchWorkspaceRoute
              workspace={snapshot.branchWorkspaces?.[branchWorkspaceId]}
              onBack={() => navigate(getBondOrganisationRouteForTab('branches'))}
            />
          ) : null}

          {canRenderSelectedView && isHqBranchCommandView ? (
            <HqBranchCommandCentre
              snapshot={snapshot}
              canManage={canManageBranches}
              navigate={navigate}
              onView={openBranch}
              onAssign={(row) => openBranchForm('assign', row)}
              onEdit={(row) => openBranchForm('edit', row)}
              onAddConsultant={() => openConsultantForm('create')}
            />
          ) : null}

          {canRenderSelectedView && selectedView === 'branches' && !branchWorkspaceId && !isHqBranchCommandView ? (
            <BranchesWorkspace
              rows={snapshot.branchPerformance || []}
              canManage={canManageBranches}
              canMove={canMoveBranches}
              derived={Boolean(snapshot?.derivedSources?.branches)}
              onView={openBranch}
              onAdd={() => openBranchForm('create')}
              onEdit={(row) => openBranchForm('edit', row)}
              onAssign={(row) => openBranchForm('assign', row)}
              onMove={(row) => openBranchForm('move', row)}
              onRefresh={loadOrganisation}
              onExport={() => setNotice('Branch export will be available in a later phase.')}
            />
          ) : null}

          {canRenderSelectedView && selectedView === 'consultants' && consultantWorkspaceId ? (
            <ConsultantWorkspaceRoute
              workspace={snapshot.consultantWorkspaces?.[consultantWorkspaceId]}
              onBack={() => navigate(getBondOrganisationRouteForTab('consultants'))}
              onOpenPerformance={(consultantId) => navigate(`/bond/organisation/consultants/${encodeURIComponent(consultantId)}`)}
            />
          ) : null}

          {canRenderSelectedView && isHqConsultantCommandView ? (
            <HqConsultantCommandCentre
              snapshot={snapshot}
              canManage={canManageConsultants}
              navigate={navigate}
              onView={openConsultant}
              onAdd={() => openConsultantForm('create')}
              onEdit={(row) => openConsultantForm('edit', row)}
              onAssignBranch={(row) => openConsultantForm('assign', row)}
              onReassign={openReassignApplications}
              onDeactivate={handleDeactivateConsultant}
            />
          ) : null}

          {canRenderSelectedView && selectedView === 'consultants' && !consultantWorkspaceId && !isHqConsultantCommandView ? (
            <ConsultantsWorkspace
              rows={snapshot.consultantPerformance || []}
              branches={snapshot.branches || []}
              regions={snapshot.regions || []}
              derived={Boolean(snapshot?.derivedSources?.consultants)}
              canManage={canManageConsultants}
              onView={openConsultant}
              onAdd={() => openConsultantForm('create')}
              onEdit={(row) => openConsultantForm('edit', row)}
              onAssignBranch={(row) => openConsultantForm('assign', row)}
              onReassign={openReassignApplications}
              onDeactivate={handleDeactivateConsultant}
              onRefresh={loadOrganisation}
              onExport={() => setNotice('Consultant export will be available in a later phase.')}
            />
          ) : null}

          {canRenderSelectedView && selectedView === 'applications' ? (
            <OrganisationApplicationsTable
              rows={snapshot.applications}
              showBranchColumn={snapshot.showBranchColumn}
              showRegionColumn={snapshot.showRegionColumn}
            />
          ) : null}

          {canRenderSelectedView && selectedView === 'partners' && partnerWorkspaceId ? (
            <PartnerWorkspaceRoute
              workspace={snapshot.partnerWorkspaces?.[partnerWorkspaceId]}
              canManage={canManagePartners}
              onBack={() => navigate(getBondOrganisationRouteForTab('partners'))}
              onEdit={(row) => openPartnerForm('edit', row)}
              onRouting={(row) => openPartnerForm('routing', row)}
              onInvite={(row) => openPartnerForm('invite', row)}
            />
          ) : null}

          {canRenderSelectedView && selectedView === 'partners' && !partnerWorkspaceId ? (
            <PartnersWorkspace
              rows={snapshot.partnerPerformance || []}
              canManage={canManagePartners}
              onView={openPartner}
              onAdd={() => openPartnerForm('create')}
              onEdit={(row) => openPartnerForm('edit', row)}
              onRouting={(row) => openPartnerForm('routing', row)}
              onInvite={(row) => openPartnerForm('invite', row)}
              onDisable={handleDisablePartner}
              onRefresh={loadOrganisation}
              onExport={() => setNotice('Partner export will be available in a later phase.')}
            />
          ) : null}

          {canRenderSelectedView && selectedView === 'routing-rules' ? (
            <RoutingRulesWorkspace
              dashboard={snapshot.routingDashboard || {}}
              canManage={canManageRoutingRules}
              onAdd={() => openRoutingRuleForm('create')}
              onEdit={(row) => openRoutingRuleForm('edit', row)}
              onDisable={handleDisableRoutingRule}
              onRefresh={loadOrganisation}
            />
          ) : null}

          {canRenderSelectedView && selectedView === 'permissions' ? (
            <PermissionsTable
              rows={snapshot.consultants}
              showBranchColumn={snapshot.showBranchColumn}
              showRegionColumn={snapshot.showRegionColumn}
            />
          ) : null}

          {canRenderSelectedView && selectedView === 'settings' ? (
            <OrganisationSettingsPanel canManage={canManageOrganisation} onOpenSettings={openSettings} />
          ) : null}
        </>
      ) : null}

      {state.loading ? (
        <BondEmptyState title="Loading organisation workspace..." description="We are assembling your hierarchy, scope, and applications view now." />
      ) : null}
      <RegionFormModal
        modal={regionModal}
        managerOptions={regionManagerOptions}
        onChange={updateRegionModalValue}
        onClose={() => setRegionModal({ mode: '', region: null, values: {}, fieldErrors: {}, error: '', submitting: false })}
        onSubmit={submitRegionModal}
      />
      <BranchFormModal
        modal={branchModal}
        managerOptions={branchManagerOptions}
        regionOptions={branchRegionOptions}
        onChange={updateBranchModalValue}
        onClose={() => setBranchModal({ mode: '', branch: null, values: {}, fieldErrors: {}, error: '', submitting: false })}
        onSubmit={submitBranchModal}
      />
      <RoutingRuleModal
        modal={routingModal}
        regionOptions={branchRegionOptions}
        branchOptions={consultantBranchOptions}
        consultantOptions={consultantOptions}
        consultantRows={snapshot?.consultantPerformance || []}
        onChange={updateRoutingModalValue}
        onClose={() => setRoutingModal({ mode: '', rule: null, values: {}, fieldErrors: {}, error: '', submitting: false })}
        onSubmit={submitRoutingRuleModal}
      />
      <PartnerFormModal
        modal={partnerModal}
        regionOptions={branchRegionOptions}
        branchOptions={consultantBranchOptions}
        consultantOptions={consultantOptions}
        onChange={updatePartnerModalValue}
        onClose={() => setPartnerModal({ mode: '', partner: null, values: {}, fieldErrors: {}, error: '', submitting: false })}
        onSubmit={submitPartnerModal}
      />
      <ConsultantFormModal
        modal={consultantModal}
        branchOptions={consultantBranchOptions}
        onChange={updateConsultantModalValue}
        onClose={() => setConsultantModal({ mode: '', consultant: null, values: {}, fieldErrors: {}, error: '', submitting: false })}
        onSubmit={submitConsultantModal}
      />
      <ReassignApplicationsModal
        modal={reassignModal}
        consultantOptions={consultantOptions}
        onChange={updateReassignModalValue}
        onClose={() => setReassignModal({ open: false, consultant: null, values: {}, fieldErrors: {}, error: '', submitting: false })}
        onSubmit={submitReassignApplications}
      />
    </BondPageShell>
  )
}
