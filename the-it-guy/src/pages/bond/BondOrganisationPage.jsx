import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Clock3,
  FileText,
  Network,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import BondEmptyState from '../../components/bond/BondEmptyState'
import BondPageShell from '../../components/bond/BondPageShell'
import BondSectionCard from '../../components/bond/BondSectionCard'
import BondTransactionStatusBadge from '../../components/bond/BondTransactionStatusBadge'
import BondViewTabs from '../../components/bond/BondViewTabs'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  getBondOrganisationRouteForTab,
  getBondOrganisationSnapshot,
} from '../../services/bondOrganisationService'

const FALLBACK_ORGANISATION_TABS = Object.freeze([
  { key: 'overview', label: 'Overview' },
  { key: 'regions', label: 'Regions' },
  { key: 'branches', label: 'Branches' },
  { key: 'consultants', label: 'Consultants' },
  { key: 'applications', label: 'Applications' },
])

const DEFAULT_BOND_ORGANISATION_SERVICE = Object.freeze({ getBondOrganisationSnapshot })

function normalizeText(value) {
  return String(value || '').trim()
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

function resolveRouteView(location, tabs = []) {
  if (location.pathname.endsWith('/applications')) return 'applications'
  const params = new URLSearchParams(location.search)
  const requestedView = normalizeText(params.get('view') || params.get('tab') || 'overview')
  return tabs.some((tab) => tab.key === requestedView) ? requestedView : 'overview'
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
  const title = branchTitle || regionTitle || 'Organisation'
  const subtitle = branchTitle
    ? 'Review branch pressure, the consultant roster, and file flow for this branch.'
    : regionTitle
      ? 'Monitor the region structure, branch coverage, and high-level performance.'
      : view === 'consultants'
        ? 'Monitor consultant workload, branch alignment, and operational activity.'
        : 'Manage your national structure, branch performance, and operational activity.'

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
  const items = [
    { key: 'regions', label: 'Regions', value: kpis.regions || 0, icon: Network },
    { key: 'branches', label: 'Branches', value: kpis.branches || 0, icon: Building2 },
    { key: 'consultants', label: 'Consultants', value: kpis.consultants || 0, icon: Users },
    { key: 'activeApplications', label: 'Active Applications', value: kpis.activeApplications || 0, icon: FileText },
    { key: 'approvalRate', label: 'Approval Rate', value: formatPercent(kpis.approvalRate), icon: ShieldCheck },
    { key: 'avgLeadTime', label: 'Avg Lead Time', value: formatLeadTime(kpis.avgLeadTime), icon: Clock3 },
  ]

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

function RegionsWorkspace({
  rows = [],
  selectedRegion = null,
  branchRows = [],
  onSelectRegion = () => {},
  onSelectBranch = () => {},
  onBack = () => {},
}) {
  if (!rows.length) {
    return (
      <SectionShell eyebrow="Regions" title="Regional Footprint" description="Regions will appear here once the hierarchy has been configured.">
        <BondEmptyState compact title="No regions configured yet." description="Add a region and assign a regional manager to start building a national structure." />
      </SectionShell>
    )
  }

  if (selectedRegion) {
    return (
      <SectionShell
        eyebrow="Region Workspace"
        title={selectedRegion.region}
        description="High-level stats for the selected region, followed by every branch inside that region."
        action={<BreadcrumbButton onClick={onBack}>Back to all regions</BreadcrumbButton>}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <SummaryMetric label="Regional Manager" value={selectedRegion.manager || 'Unassigned'} emphasis />
          <SummaryMetric label="Branches" value={selectedRegion.branches} emphasis />
          <SummaryMetric label="Consultants" value={selectedRegion.consultants} emphasis />
          <SummaryMetric label="Active Files" value={selectedRegion.activeApplications} emphasis />
          <SummaryMetric label="Lead Time" value={formatLeadTime(selectedRegion.avgLeadTime)} emphasis />
        </div>
        <div className="mt-5 space-y-4">
          {branchRows.map((branch) => (
            <SummaryCard
              key={branch.id}
              eyebrow="Branch"
              title={branch.branch}
              status={branch.status}
              detail={`${branch.manager || 'Unassigned'} leads this branch. ${branch.bottleneck} is the main operational bottleneck.`}
              stats={[
                { label: 'Consultants', value: branch.consultants, emphasis: true },
                { label: 'Active Files', value: branch.activeApplications, emphasis: true },
                { label: 'Approval', value: formatPercent(branch.approvalRate), emphasis: true },
                { label: 'Lead Time', value: formatLeadTime(branch.avgLeadTime), emphasis: true },
              ]}
              onClick={() => onSelectBranch(branch)}
              ctaLabel="Open branch"
            />
          ))}
        </div>
      </SectionShell>
    )
  }

  return (
    <SectionShell eyebrow="Regions" title="Regional Footprint" description="Each region shows the manager, branch spread, consultant coverage, and top-line operating health.">
      <div className="space-y-4">
        {rows.map((row) => (
          <SummaryCard
            key={row.id}
            eyebrow="Region"
            title={row.region}
            status={row.status}
            detail={`${row.manager || 'Unassigned'} manages this region. ${row.bottleneck} is the current hotspot.`}
            stats={[
              { label: 'Branches', value: row.branches, emphasis: true },
              { label: 'Consultants', value: row.consultants, emphasis: true },
              { label: 'Active Files', value: row.activeApplications, emphasis: true },
              { label: 'Approval', value: formatPercent(row.approvalRate), emphasis: true },
            ]}
            onClick={() => onSelectRegion(row)}
            ctaLabel="Open region"
          />
        ))}
      </div>
    </SectionShell>
  )
}

function BranchesWorkspace({
  rows = [],
  selectedBranch = null,
  consultantRows = [],
  applicationRows = [],
  showRegionColumn = false,
  onSelectBranch = () => {},
  onBack = () => {},
}) {
  if (!rows.length) {
    return (
      <SectionShell eyebrow="Branches" title="Branch Footprint" description="Branches will appear here once the hierarchy has been configured.">
        <BondEmptyState compact title="No branches configured yet." description="Add a branch and assign a manager to bring this workspace structure to life." />
      </SectionShell>
    )
  }

  if (selectedBranch) {
    return (
      <div className="space-y-6">
        <SectionShell
          eyebrow="Branch Workspace"
          title={selectedBranch.branch}
          description="A branch detail view showing the manager, consultant roster, and file activity for this branch."
          action={<BreadcrumbButton onClick={onBack}>Back to all branches</BreadcrumbButton>}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {showRegionColumn ? <SummaryMetric label="Region" value={selectedBranch.region || 'Unassigned'} emphasis /> : null}
            <SummaryMetric label="Manager" value={selectedBranch.manager || 'Unassigned'} emphasis />
            <SummaryMetric label="Consultants" value={selectedBranch.consultants} emphasis />
            <SummaryMetric label="Active Files" value={selectedBranch.activeApplications} emphasis />
            <SummaryMetric label="Approval" value={formatPercent(selectedBranch.approvalRate)} emphasis />
          </div>
        </SectionShell>

        <SectionShell eyebrow="Consultant Roster" title="Branch Consultants" description="Everyone currently aligned to this branch.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {consultantRows.map((consultant) => (
              <article key={consultant.id} className="rounded-[18px] border border-[#e1e9f2] bg-[#fbfdff] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#142132]">{consultant.consultant}</p>
                    <p className="mt-1 text-xs text-[#71869d]">{consultant.email || 'No email captured'}</p>
                  </div>
                  <StatusPill status={consultant.status} />
                </div>
                <div className="mt-4 grid gap-2">
                  <SummaryMetric label="Active Files" value={consultant.activeApplications} emphasis />
                  <SummaryMetric label="Approval" value={formatPercent(consultant.approvalRate)} emphasis />
                  <SummaryMetric label="Lead Time" value={formatLeadTime(consultant.avgLeadTime)} />
                </div>
              </article>
            ))}
            {!consultantRows.length ? <BondEmptyState compact title="No consultants assigned yet." description="Invite or assign consultants to start managing branch flow here." /> : null}
          </div>
        </SectionShell>

        <OrganisationApplicationsTable rows={applicationRows} showBranchColumn showRegionColumn={showRegionColumn} />
      </div>
    )
  }

  return (
    <SectionShell eyebrow="Branches" title="Branch Network" description="Branches show operational load, branch manager ownership, and the state of the current book.">
      <div className="space-y-4">
        {rows.map((row) => (
          <SummaryCard
            key={row.id}
            eyebrow={showRegionColumn ? row.region || 'Branch' : 'Branch'}
            title={row.branch}
            status={row.status}
            detail={`${row.manager || 'Unassigned'} leads this branch. ${row.bottleneck} is the biggest current pressure point.`}
            stats={[
              { label: 'Consultants', value: row.consultants, emphasis: true },
              { label: 'Active Files', value: row.activeApplications, emphasis: true },
              { label: 'Pending Docs', value: row.pendingDocs, emphasis: true },
              { label: 'Lead Time', value: formatLeadTime(row.avgLeadTime), emphasis: true },
            ]}
            onClick={() => onSelectBranch(row)}
            ctaLabel="Open branch"
          />
        ))}
      </div>
    </SectionShell>
  )
}

function ConsultantsWorkspace({ rows = [], branches = [], regions = [] }) {
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

  return (
    <SectionShell eyebrow="Consultants" title="Consultant Directory" description="Card view with quick filtering by region, branch, and workload state.">
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
              { value: 'Healthy', label: 'Healthy' },
              { value: 'Needs Attention', label: 'Needs Attention' },
              { value: 'Inactive', label: 'Inactive' },
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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredRows.map((row) => (
          <article key={row.id} className="rounded-[20px] border border-[#dbe5f0] bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.035)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-[#142132]">{row.consultant}</p>
                <p className="mt-1 text-sm text-[#60758d]">{row.email || 'No email captured'}</p>
              </div>
              <StatusPill status={row.status} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#7d90a5]">
              <span className="rounded-full border border-[#d9e4ef] bg-[#fbfdff] px-2.5 py-1">{row.region || 'Unassigned region'}</span>
              <span className="rounded-full border border-[#d9e4ef] bg-[#fbfdff] px-2.5 py-1">{row.branch || 'Unassigned branch'}</span>
              <span className="rounded-full border border-[#d9e4ef] bg-[#fbfdff] px-2.5 py-1">{row.role || 'Consultant'}</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <SummaryMetric label="Active Files" value={row.activeApplications} emphasis />
              <SummaryMetric label="New This Month" value={row.newThisMonth} emphasis />
              <SummaryMetric label="Pending Docs" value={row.pendingDocs} emphasis />
              <SummaryMetric label="Approval" value={formatPercent(row.approvalRate)} emphasis />
            </div>
            <p className="mt-4 text-sm text-[#60758d]">Last activity: {row.lastActivity}</p>
          </article>
        ))}
        {!filteredRows.length ? <BondEmptyState compact title="No consultants match these filters." description="Try a wider region or branch filter." /> : null}
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
  const [state, setState] = useState({
    loading: true,
    error: '',
    snapshot: null,
  })

  const loadOrganisation = useCallback(async () => {
    if (!workspaceId) {
      setState({ loading: false, error: 'missing_workspace_context', snapshot: null })
      return
    }
    setState((previous) => ({ ...previous, loading: true, error: '' }))
    try {
      const snapshot = await service.getBondOrganisationSnapshot(workspaceContext, workspaceId)
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadOrganisation()
  }, [loadOrganisation])

  const snapshot = state.snapshot
  const tabs = snapshot?.tabs || FALLBACK_ORGANISATION_TABS
  const selectedView = resolveRouteView(location, tabs)
  const params = useMemo(() => new URLSearchParams(location.search), [location.search])
  const selectedRegionId = normalizeText(params.get('regionId'))
  const selectedBranchId = normalizeText(params.get('branchId'))
  const canManageOrganisation = scopeCanManage(snapshot)

  const selectedRegion = useMemo(
    () => (snapshot?.regionPerformance || []).find((row) => normalizeText(row.id) === selectedRegionId) || null,
    [selectedRegionId, snapshot?.regionPerformance],
  )
  const selectedBranch = useMemo(
    () => (snapshot?.branchPerformance || []).find((row) => normalizeText(row.id) === selectedBranchId) || null,
    [selectedBranchId, snapshot?.branchPerformance],
  )
  const regionBranches = useMemo(
    () => (!selectedRegion ? [] : (snapshot?.branchPerformance || []).filter((row) => normalizeText(row.regionId) === normalizeText(selectedRegion.id))),
    [selectedRegion, snapshot?.branchPerformance],
  )
  const branchConsultants = useMemo(
    () => (!selectedBranch ? [] : (snapshot?.consultantPerformance || []).filter((row) => normalizeText(row.branchId) === normalizeText(selectedBranch.id))),
    [selectedBranch, snapshot?.consultantPerformance],
  )
  const branchApplications = useMemo(
    () => (!selectedBranch ? [] : (snapshot?.applications || []).filter((row) => normalizeText(row.branchId || row.workspaceUnitId) === normalizeText(selectedBranch.id))),
    [selectedBranch, snapshot?.applications],
  )

  function handleViewChange(nextView) {
    navigate(getBondOrganisationRouteForTab(nextView))
  }

  function openRegion(region) {
    navigate(getBondOrganisationRouteForTab('regions', { regionId: region.id }))
  }

  function openBranch(branch) {
    navigate(getBondOrganisationRouteForTab('branches', { branchId: branch.id }))
  }

  function openSettings() {
    navigate('/settings/organisation')
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
        navigate={navigate}
      />

      {snapshot ? (
        <>
          <OrganisationKpiStrip kpis={snapshot.kpis} />
          <BondViewTabs tabs={tabs} value={selectedView} counts={snapshot?.counts || {}} onChange={handleViewChange} />

          {selectedView === 'overview' ? (
            <>
              <OperationalHealth items={snapshot.operationalHealth} />
              <OrganisationHierarchy tree={snapshot.hierarchyTree} canManage={canManageOrganisation} />
              <RecentActivity rows={snapshot.recentActivity} />
            </>
          ) : null}

          {selectedView === 'regions' ? (
            <RegionsWorkspace
              rows={snapshot.regionPerformance || []}
              selectedRegion={selectedRegion}
              branchRows={regionBranches}
              onSelectRegion={openRegion}
              onSelectBranch={openBranch}
              onBack={() => handleViewChange('regions')}
            />
          ) : null}

          {selectedView === 'branches' ? (
            <BranchesWorkspace
              rows={snapshot.branchPerformance || []}
              selectedBranch={selectedBranch}
              consultantRows={branchConsultants}
              applicationRows={branchApplications}
              showRegionColumn={snapshot.showRegionColumn}
              onSelectBranch={openBranch}
              onBack={() => handleViewChange('branches')}
            />
          ) : null}

          {selectedView === 'consultants' ? (
            <ConsultantsWorkspace
              rows={snapshot.consultantPerformance || []}
              branches={snapshot.branches || []}
              regions={snapshot.regions || []}
            />
          ) : null}

          {selectedView === 'applications' ? (
            <OrganisationApplicationsTable
              rows={snapshot.applications}
              showBranchColumn={snapshot.showBranchColumn}
              showRegionColumn={snapshot.showRegionColumn}
            />
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
    </BondPageShell>
  )
}
