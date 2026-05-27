import { Building2, Network, ShieldUser, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import BondEmptyState from '../../components/bond/BondEmptyState'
import BondPageHeader from '../../components/bond/BondPageHeader'
import BondPageShell from '../../components/bond/BondPageShell'
import BondRiskBadge from '../../components/bond/BondRiskBadge'
import BondSectionCard from '../../components/bond/BondSectionCard'
import BondTransactionStatusBadge from '../../components/bond/BondTransactionStatusBadge'
import BondViewTabs from '../../components/bond/BondViewTabs'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  BOND_ORGANISATION_STRUCTURE_TYPES,
  getBondOrganisationRouteForTab,
  getBondOrganisationSnapshot,
} from '../../services/bondOrganisationService'

const FALLBACK_ORGANISATION_TABS = Object.freeze([
  { key: 'overview', label: 'Overview' },
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

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'R0'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function HeaderCell({ children, className = '' }) {
  return (
    <th className={`bg-[#f8fbff] px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[#7d90a5] ${className}`.trim()}>
      {children}
    </th>
  )
}

function StatCard({ label, value, helper, icon: Icon }) {
  return (
    <article className="rounded-[18px] border border-[#dbe5f0] bg-[#fbfdff] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7d90a5]">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#142132]">{value}</p>
        </div>
        {Icon ? (
          <span className="rounded-[14px] border border-[#dbe5f0] bg-white p-2 text-[#60758d]">
            <Icon size={18} />
          </span>
        ) : null}
      </div>
      {helper ? <p className="mt-2 text-sm leading-5 text-[#60758d]">{helper}</p> : null}
    </article>
  )
}

function StructureTable({ title, description, rows = [], type = 'structure', canSetUpStructure = false }) {
  const emptyTitle = type === 'regions'
    ? 'Set up your first region'
    : type === 'branches'
      ? 'Set up your first branch'
      : type === 'teams'
        ? 'Set up your first team'
        : 'Invite your first consultant'

  return (
    <BondSectionCard eyebrow="Structure" title={title} description={description} padded={false} contentClassName="mt-0">
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr>
                <HeaderCell>Name</HeaderCell>
                <HeaderCell>Scope</HeaderCell>
                <HeaderCell>Status</HeaderCell>
                <HeaderCell>Updated</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id || row.user_id || row.email || row.name} className="border-t border-[#edf2f7]">
                  <td className="px-4 py-4 align-top">
                    <p className="text-sm font-semibold text-[#142132]">{row.name}</p>
                    {row.email ? <p className="mt-1 text-xs text-[#71869d]">{row.email}</p> : null}
                  </td>
                  <td className="px-4 py-4 align-top text-sm text-[#17324d]">
                    {row.workspaceRole || row.unit_type || row.unitType || row.code || row.description || 'Workspace'}
                  </td>
                  <td className="px-4 py-4 align-top text-sm text-[#17324d]">{row.status || (row.active === false ? 'Inactive' : 'Active')}</td>
                  <td className="px-4 py-4 align-top text-sm text-[#60758d]">{normalizeText(row.updated_at || row.updatedAt || row.created_at || row.createdAt) || 'Not recorded'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : canSetUpStructure ? (
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          <BondEmptyState compact title={emptyTitle} description="Admins can add hierarchy data here once the workspace is ready for deeper reporting." />
        </div>
      ) : null}
    </BondSectionCard>
  )
}

function OrganisationApplicationsTable({ rows = [], showBranchColumn = false, showRegionColumn = false }) {
  const navigate = useNavigate()
  const colSpan = 9 + (showBranchColumn ? 1 : 0) + (showRegionColumn ? 1 : 0)

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
              <HeaderCell>Application ID</HeaderCell>
              <HeaderCell>Client</HeaderCell>
              <HeaderCell>Development</HeaderCell>
              <HeaderCell>Consultant</HeaderCell>
              {showBranchColumn ? <HeaderCell>Branch</HeaderCell> : null}
              {showRegionColumn ? <HeaderCell>Region</HeaderCell> : null}
              <HeaderCell>Status</HeaderCell>
              <HeaderCell>Bank</HeaderCell>
              <HeaderCell>Pipeline Value</HeaderCell>
              <HeaderCell>Last Activity</HeaderCell>
              <HeaderCell>Risk</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className="cursor-pointer border-t border-[#edf2f7] transition hover:bg-[#fbfdff]"
                onClick={() => row.transactionId && navigate(`/bond/files/${row.transactionId}`)}
              >
                <td className="px-4 py-4 align-top text-sm font-semibold text-[#142132]">{formatApplicationReference(row)}</td>
                <td className="px-4 py-4 align-top text-sm text-[#17324d]">{row.client || 'Client pending'}</td>
                <td className="px-4 py-4 align-top text-sm text-[#17324d]">{row.developmentName || row.property || 'Development pending'}</td>
                <td className="px-4 py-4 align-top text-sm text-[#17324d]">{row.consultant || 'Unassigned consultant'}</td>
                {showBranchColumn ? <td className="px-4 py-4 align-top text-sm text-[#17324d]">{row.branch || 'Unassigned'}</td> : null}
                {showRegionColumn ? <td className="px-4 py-4 align-top text-sm text-[#17324d]">{row.region || 'Unassigned'}</td> : null}
                <td className="px-4 py-4 align-top">
                  <BondTransactionStatusBadge status={row.status} label={row.registrationStatus || row.financeStageLabel || 'In progress'} />
                </td>
                <td className="px-4 py-4 align-top text-sm text-[#17324d]">{row.bank || 'Bank pending'}</td>
                <td className="px-4 py-4 align-top text-sm font-semibold text-[#142132]">{formatCurrency(row.bondAmount)}</td>
                <td className="px-4 py-4 align-top text-sm text-[#60758d]">{row.lastActivityLabel || 'No activity'}</td>
                <td className="px-4 py-4 align-top">
                  <BondRiskBadge
                    status={row.status === 'at_risk' ? 'overdue' : 'healthy'}
                    label={row.status === 'at_risk' ? row.riskStatus : 'On track'}
                  />
                </td>
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

export default function BondOrganisationPage({
  service = DEFAULT_BOND_ORGANISATION_SERVICE,
}) {
  const workspaceContext = useWorkspace()
  const workspaceId = resolveWorkspaceId(workspaceContext)
  const location = useLocation()
  const navigate = useNavigate()
  const routeTab = location.pathname.endsWith('/applications')
    ? 'applications'
    : normalizeText(new URLSearchParams(location.search).get('tab')) || 'overview'
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
  const selectedTab = useMemo(
    () => tabs.some((tab) => tab.key === routeTab) ? routeTab : 'overview',
    [routeTab, tabs],
  )
  const isIndependent = snapshot?.structureType === BOND_ORGANISATION_STRUCTURE_TYPES.independent && snapshot?.isIndependentWorkspace

  function handleTabChange(nextTab) {
    navigate(getBondOrganisationRouteForTab(nextTab))
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
      <BondPageHeader
        title={isIndependent ? 'Your Workspace' : 'Organisation'}
        description={isIndependent ? 'Track your applications, clients, and performance.' : 'Manage your business structure, team performance, and application activity.'}
      />

      <BondViewTabs tabs={tabs} value={selectedTab} counts={snapshot?.counts || {}} onChange={handleTabChange} />

      {snapshot ? (
        <>
          {selectedTab === 'overview' ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Structure" value={snapshot.structureLabel} helper="Organisation depth is adapted to the business type and visible data." icon={Network} />
                <StatCard label="Applications" value={snapshot.counts.applications} helper="Active operational bond files in your scope." icon={ShieldUser} />
                <StatCard label="Consultants" value={snapshot.counts.consultants} helper="Visible consultants for this workspace scope." icon={Users} />
                <StatCard label="Branches" value={snapshot.counts.branches} helper="Hidden when the business has no branch layer." icon={Building2} />
              </div>
              <BondSectionCard
                eyebrow="Scope"
                title={isIndependent ? 'Independent workspace' : 'Flexible organisation hierarchy'}
                description={
                  isIndependent
                    ? 'This workspace stays intentionally simple and does not show empty regions, branches, teams, or consultants.'
                    : 'Regions, branches, teams, consultants, and applications appear only when they are relevant to the organisation and allowed by the user scope.'
                }
              />
            </>
          ) : null}

          {selectedTab === 'regions' ? (
            <StructureTable
              title="Regions"
              description="Regional and national rollups for workspaces that manage multiple geographic scopes."
              rows={snapshot.regions}
              type="regions"
              canSetUpStructure={snapshot.capabilities.canSetUpStructure}
            />
          ) : null}

          {selectedTab === 'branches' ? (
            <StructureTable
              title={snapshot.capabilities.scopeLevel === 'branch' ? 'My Branch' : 'Branches'}
              description="Branch-level structure appears for branch-based, regional, national, and enterprise workspaces."
              rows={snapshot.branches}
              type="branches"
              canSetUpStructure={snapshot.capabilities.canSetUpStructure}
            />
          ) : null}

          {selectedTab === 'consultants' ? (
            <StructureTable
              title="Consultants"
              description="Consultant visibility follows the current user scope and existing workspace permissions."
              rows={snapshot.consultants}
              type="consultants"
              canSetUpStructure={snapshot.capabilities.canSetUpStructure}
            />
          ) : null}

          {selectedTab === 'teams' ? (
            <StructureTable
              title="Teams"
              description="Team structure is shown only when teams exist or an admin is setting up a team-based workspace."
              rows={snapshot.teams}
              type="teams"
              canSetUpStructure={snapshot.capabilities.canSetUpStructure}
            />
          ) : null}

          {selectedTab === 'applications' ? (
            <OrganisationApplicationsTable
              rows={snapshot.applications}
              showBranchColumn={snapshot.showBranchColumn}
              showRegionColumn={snapshot.showRegionColumn}
            />
          ) : null}
        </>
      ) : null}

      {state.loading ? (
        <BondEmptyState title="Loading organisation workspace..." description="We are assembling your hierarchy, scope, and applications view now." />
      ) : null}
    </BondPageShell>
  )
}
