/* eslint-disable react-refresh/only-export-components */
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Download,
  Eye,
  Clock3,
  Pencil,
  FileText,
  Network,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
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

const FALLBACK_ORGANISATION_TABS = Object.freeze([
  { key: 'overview', label: 'Overview' },
  { key: 'regions', label: 'Regions' },
  { key: 'branches', label: 'Branches' },
  { key: 'consultants', label: 'Consultants' },
  { key: 'partners', label: 'Partners' },
])

const VALID_ORGANISATION_VIEWS = Object.freeze([
  'overview',
  'regions',
  'branches',
  'consultants',
  'applications',
  'partners',
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
})
const REGION_MANAGER_UI_ROLES = new Set(['regional_manager', 'hq_manager', 'manager', 'director', 'owner'])
const BRANCH_MANAGER_UI_ROLES = new Set(['branch_manager', 'regional_manager', 'manager', 'director', 'owner'])
const CONSULTANT_ROLE_OPTIONS = Object.freeze([
  { value: 'consultant', label: 'Consultant' },
  { value: 'bond_originator', label: 'Bond Originator' },
  { value: 'processor', label: 'Processor' },
  { value: 'admin_staff', label: 'Admin Staff' },
])

function normalizeText(value) {
  return String(value || '').trim()
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

function scopeCanManage(snapshot = {}) {
  return Boolean(snapshot?.visibleScope?.canManageOrganisation)
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

function CommandButton({ children, icon: Icon, variant = 'secondary', onClick = () => {} }) {
  const className = variant === 'primary'
    ? 'border-[#143250] bg-[#143250] text-white hover:bg-[#183b5e]'
    : 'border-[#d9e4ef] bg-white text-[#24384d] hover:border-[#bfd0e1] hover:bg-[#fbfdff]'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-2 rounded-[12px] border px-3.5 text-sm font-semibold shadow-[0_6px_16px_rgba(15,23,42,0.035)] transition ${className}`}
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
  navigate = () => {},
}) {
  const canManage = scopeCanManage(snapshot)
  const actions = buildCommandActions({
    view,
    canManage,
    navigate,
    regionSelected: Boolean(regionTitle),
    branchSelected: Boolean(branchTitle),
  })
  const title = consultantTitle || branchTitle || regionTitle || (
    view === 'regions'
      ? 'Regions'
      : view === 'branches'
        ? 'Branches'
        : view === 'consultants'
          ? 'Consultants'
          : 'Organisation'
  )
  const subtitle = consultantTitle
    ? 'Review this consultant’s workload, assigned applications, and current operating momentum.'
    : branchTitle
    ? 'Review branch pressure, the consultant roster, and file flow for this branch.'
    : regionTitle
      ? 'Monitor the region structure, branch coverage, and high-level performance.'
      : view === 'consultants'
        ? 'Manage consultant workload, application ownership, and performance.'
        : view === 'branches'
          ? 'Manage branch capacity, consultant allocation, and branch application performance.'
          : view === 'regions'
            ? 'Manage regional coverage, branch grouping, and regional application performance.'
        : 'Manage your bond origination network, branch structure, consultant workload, and application performance.'

  return (
    <section className="rounded-[26px] border border-[#dbe5f0] bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#75879b]">{snapshot?.visibleScope?.label || 'Organisation'}</p>
          <h1 className="mt-2 text-[1.75rem] font-semibold tracking-[-0.03em] text-[#142132]">{title}</h1>
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

function OrganisationOverviewDashboard({ snapshot = {}, navigate = () => {}, canManage = false }) {
  const overview = snapshot.overview || {}
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

function RegionWorkspaceRoute({ workspace = null, onBack = () => {} }) {
  if (!workspace) {
    return (
      <HierarchySelectionUnavailable
        title="Region no longer available."
        description="This region could not be found in the current organisation scope."
        onBack={onBack}
        backLabel="Back to Regions"
      />
    )
  }
  const region = workspace.region || {}
  const metrics = workspace.metrics || {}
  const noManager = !normalizeText(region.managerUserId || region.manager_user_id)
  const noBranches = !Number(metrics.branches || 0)
  return (
    <div className="space-y-6">
      <SectionShell
        eyebrow="Region Workspace"
        title={region.name || 'Region'}
        description="Regional Manager, status, structure metrics, and regional application performance."
        action={<BreadcrumbButton onClick={onBack}>Back to Regions</BreadcrumbButton>}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryMetric label="Regional Manager" value={region.manager || region.managerName || 'Unassigned'} emphasis />
          <SummaryMetric label="Status" value={region.status || 'active'} emphasis />
          <SummaryMetric label="Code" value={region.code || 'No code'} emphasis />
          <SummaryMetric label="Notes" value={region.notes || region.description || 'No notes'} />
        </div>
      </SectionShell>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label="Branches" value={metrics.branches || 0} emphasis />
        <SummaryMetric label="Consultants" value={metrics.consultants || 0} emphasis />
        <SummaryMetric label="Active Applications" value={metrics.activeApplications || 0} emphasis />
        <SummaryMetric label="Submitted Applications" value={metrics.submittedApplications || 0} emphasis />
        <SummaryMetric label="Pending Documents" value={metrics.pendingDocuments || 0} emphasis />
        <SummaryMetric label="Approval Rate" value={formatPercent(metrics.approvalRate)} emphasis />
        <SummaryMetric label="Average Turnaround" value={formatLeadTime(metrics.averageTurnaround)} emphasis />
      </section>
      {noManager ? <BondEmptyState compact title="No regional manager assigned" description="Assign a manager so this region has clear ownership." /> : null}
      {noBranches ? <BondEmptyState compact title="No branches in this region yet" description="Branches will be added in Phase 4. Once branches exist, they will roll up into this region." /> : null}
      <SectionShell eyebrow="Workspace Tabs" title="Region Workspace">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {(workspace.tabs || []).map((tab) => (
            <article key={tab} className="rounded-[16px] border border-[#e1e9f2] bg-[#fbfdff] p-4">
              <p className="text-sm font-semibold text-[#142132]">{tab}</p>
              <p className="mt-2 text-xs leading-5 text-[#60758d]">{tab === 'Overview' ? 'Showing real regional data.' : 'Coming in a later phase.'}</p>
            </article>
          ))}
        </div>
      </SectionShell>
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
                <option value="">Select region</option>
                {regionOptions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
              </select>
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
          <CommandButton icon={isMove ? ArrowRight : isAssign ? UserCheck : Plus} variant="primary" onClick={onSubmit}>
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
              <option value="">Select branch</option>
              {branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
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
          <CommandButton icon={isAssign ? Building2 : Plus} variant="primary" onClick={onSubmit}>
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

function ConsultantWorkspaceRoute({ workspace = null, onBack = () => {} }) {
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
        action={<BreadcrumbButton onClick={onBack}>Back to Consultants</BreadcrumbButton>}
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
  const [reassignModal, setReassignModal] = useState({ open: false, consultant: null, values: {}, fieldErrors: {}, error: '', submitting: false })
  const [notice, setNotice] = useState('')

  const loadOrganisation = useCallback(async () => {
    if (!workspaceId) {
      setState({ loading: false, error: 'missing_workspace_context', snapshot: null })
      return
    }
    setState((previous) => ({ ...previous, loading: true, error: '' }))
    try {
      const snapshot = await service.getBondOrganisationSnapshot(workspaceContext, workspaceId, { includeDemoRows: false })
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
  const tabs = snapshot?.tabs || FALLBACK_ORGANISATION_TABS
  const regionWorkspaceId = normalizeText(routeParams.regionId)
  const branchWorkspaceId = normalizeText(routeParams.branchId)
  const consultantWorkspaceId = normalizeText(routeParams.consultantId)
  const selectedView = consultantWorkspaceId ? 'consultants' : branchWorkspaceId ? 'branches' : regionWorkspaceId ? 'regions' : resolveRouteView(location)
  const params = useMemo(() => new URLSearchParams(location.search), [location.search])
  const selectedRegionId = regionWorkspaceId || normalizeText(params.get('regionId'))
  const selectedBranchId = branchWorkspaceId || normalizeText(params.get('branchId'))
  const selectedConsultantId = consultantWorkspaceId || normalizeText(params.get('consultantId'))
  const canManageOrganisation = scopeCanManage(snapshot)
  const canManageRegions = Boolean(snapshot?.capabilities?.canManageRegions)
  const canManageBranches = Boolean(snapshot?.capabilities?.canManageBranches)
  const canMoveBranches = Boolean(snapshot?.capabilities?.canMoveBranches)
  const canManageConsultants = Boolean(snapshot?.capabilities?.canManageConsultants)
  const canRenderSelectedView = canAccessOrganisationView(selectedView, snapshot)

  const selectedRegion = useMemo(
    () => resolveSelectedHierarchyRow(selectedRegionId, snapshot?.regionPerformance || [], ['region', 'name']),
    [selectedRegionId, snapshot?.regionPerformance],
  )
  const selectedBranch = useMemo(
    () => resolveSelectedHierarchyRow(selectedBranchId, snapshot?.branchPerformance || [], ['branch', 'name']),
    [selectedBranchId, snapshot?.branchPerformance],
  )
  const selectedConsultant = useMemo(
    () => resolveSelectedHierarchyRow(selectedConsultantId, snapshot?.consultantPerformance || [], ['consultant', 'name', 'email']),
    [selectedConsultantId, snapshot?.consultantPerformance],
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
  }, [selectedBranch, selectedConsultant, selectedRegion, selectedView, snapshot])

  const regionManagerOptions = useMemo(() => {
    return (snapshot?.consultants || [])
      .map((user) => {
        const id = normalizeText(user.user_id || user.userId || user.id)
        const role = normalizeText(user.workspaceRole || user.workspace_role || user.role)
        return {
          id,
          name: normalizeText(user.name || user.email) || 'Team member',
          role,
        }
      })
      .filter((user) => user.id && REGION_MANAGER_UI_ROLES.has(user.role.toLowerCase()))
  }, [snapshot?.consultants])

  const branchManagerOptions = useMemo(() => {
    return (snapshot?.consultants || [])
      .map((user) => {
        const id = normalizeText(user.user_id || user.userId || user.id)
        const role = normalizeText(user.workspaceRole || user.workspace_role || user.role)
        return {
          id,
          name: normalizeText(user.name || user.email) || 'Team member',
          role,
        }
      })
      .filter((user) => user.id && BRANCH_MANAGER_UI_ROLES.has(user.role.toLowerCase()))
  }, [snapshot?.consultants])

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

  function openSettings() {
    navigate('/settings/organisation')
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
      await loadOrganisation()
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
      await loadOrganisation()
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
      await loadOrganisation()
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
      await loadOrganisation()
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
      await loadOrganisation()
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
      <OrganisationCommandHeader
        snapshot={snapshot}
        view={selectedView}
        regionTitle={selectedView === 'regions' ? selectedRegion?.region || '' : ''}
        branchTitle={selectedView === 'branches' ? selectedBranch?.branch || '' : ''}
        consultantTitle={selectedView === 'consultants' ? selectedConsultant?.consultant || '' : ''}
        navigate={navigate}
      />

      {snapshot ? (
        <>
          {notice ? (
            <section className="rounded-[16px] border border-[#ccebd8] bg-[#eefbf3] px-4 py-3 text-sm font-semibold text-[#1f7a4d]">
              {notice}
            </section>
          ) : null}
          {selectedView !== 'overview' && canRenderSelectedView ? <OrganisationKpiStrip kpis={viewKpis} /> : null}
          {!regionWorkspaceId && !branchWorkspaceId && !consultantWorkspaceId ? <BondViewTabs tabs={tabs} value={selectedView} counts={snapshot?.counts || {}} onChange={handleViewChange} /> : null}

          {!canRenderSelectedView ? (
            <OrganisationViewUnavailable view={selectedView} />
          ) : null}

          {canRenderSelectedView && selectedView === 'overview' ? (
            <OrganisationOverviewDashboard snapshot={snapshot} navigate={navigate} canManage={canManageOrganisation} />
          ) : null}

          {canRenderSelectedView && selectedView === 'regions' && regionWorkspaceId ? (
            <RegionWorkspaceRoute
              workspace={snapshot.regionWorkspaces?.[regionWorkspaceId]}
              onBack={() => navigate(getBondOrganisationRouteForTab('regions'))}
            />
          ) : null}

          {canRenderSelectedView && selectedView === 'regions' && !regionWorkspaceId ? (
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

          {canRenderSelectedView && selectedView === 'branches' && !branchWorkspaceId ? (
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
            />
          ) : null}

          {canRenderSelectedView && selectedView === 'consultants' && !consultantWorkspaceId ? (
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

          {canRenderSelectedView && selectedView === 'partners' ? (
            <SectionShell eyebrow="Partners" title="Partners" description="Partner management remains read-only for this phase.">
              <BondEmptyState compact title="Partner controls are coming in a later phase." description="Regions management is the functional organisation layer in Phase 3." />
            </SectionShell>
          ) : null}

          {selectedView === 'permissions' ? (
            <PermissionsTable
              rows={snapshot.consultants}
              showBranchColumn={snapshot.showBranchColumn}
              showRegionColumn={snapshot.showRegionColumn}
            />
          ) : null}

          {selectedView === 'settings' ? (
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
