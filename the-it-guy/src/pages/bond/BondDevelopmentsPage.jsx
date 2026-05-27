import { AlertTriangle, ArrowRight, BarChart3, Building2, FileText, Network, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import BondEmptyState from '../../components/bond/BondEmptyState'
import BondPageHeader from '../../components/bond/BondPageHeader'
import BondPageShell from '../../components/bond/BondPageShell'
import BondSectionCard from '../../components/bond/BondSectionCard'
import BondViewTabs from '../../components/bond/BondViewTabs'
import { useWorkspace } from '../../context/WorkspaceContext'
import * as bondCommandCenterService from '../../services/bondCommandCenterService'

const DETAIL_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'transactions', label: 'Applications' },
  { key: 'clients', label: 'Clients' },
  { key: 'partners', label: 'Partners' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'documents', label: 'Documents' },
]

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

function formatNumber(value) {
  return new Intl.NumberFormat('en-ZA').format(Number(value || 0))
}

function formatDate(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return 'No recent activity'
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })
}

function Metric({ label, value, tone = 'slate' }) {
  const toneClasses = {
    slate: 'border-[#dce6f2] bg-white text-[#172b42]',
    green: 'border-[#cce7d8] bg-[#f7fcf9] text-[#1f6b45]',
    amber: 'border-[#ead7ad] bg-[#fffaf0] text-[#875b16]',
    red: 'border-[#efcfd3] bg-[#fff7f8] text-[#9b2f3f]',
    blue: 'border-[#c9d9ef] bg-[#f7fbff] text-[#245d94]',
  }
  return (
    <div className={`rounded-[18px] border px-4 py-3 ${toneClasses[tone] || toneClasses.slate}`}>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#6f849a]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{value}</p>
    </div>
  )
}

function DevelopmentCard({ development }) {
  return (
    <article className="rounded-[24px] border border-[#dbe5f0] bg-white p-5 shadow-[0_16px_42px_rgba(20,33,50,0.07)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_56px_rgba(20,33,50,0.11)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold tracking-[-0.02em] text-[#142132]">{development.name}</p>
          <p className="mt-1 text-sm text-[#60758d]">{development.developerName} · {development.location}</p>
        </div>
        <span className="rounded-full border border-[#dbe5f0] bg-[#f8fbfe] px-3 py-1 text-xs font-semibold text-[#49657d]">
          {development.status}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Metric label="Application Pipeline Value" value={development.pipelineValueLabel} tone="blue" />
        <Metric label="Active Applications" value={formatNumber(development.activeFiles)} />
        <Metric label="Approval Rate" value={`${development.approvalRate}%`} tone={development.approvalRate >= 70 ? 'green' : 'amber'} />
        <Metric label="Awaiting Docs" value={formatNumber(development.pendingDocuments)} tone={development.pendingDocuments ? 'amber' : 'green'} />
        <Metric label="Registered Month" value={formatNumber(development.registeredThisMonth)} tone="green" />
        <Metric label="At Risk" value={formatNumber(development.atRiskFiles)} tone={development.atRiskFiles ? 'red' : 'green'} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link to={development.href} className="inline-flex h-10 items-center gap-2 rounded-[14px] bg-[#17324d] px-4 text-sm font-semibold text-white">
          View Development <ArrowRight size={15} />
        </Link>
        <Link to={development.transactionsHref} className="inline-flex h-10 items-center rounded-[14px] border border-[#dbe5f0] px-4 text-sm font-semibold text-[#24415d]">
          View Applications
        </Link>
        <Link to={development.reportsHref} className="inline-flex h-10 items-center rounded-[14px] border border-[#dbe5f0] px-4 text-sm font-semibold text-[#24415d]">
          View Reports
        </Link>
      </div>
    </article>
  )
}

function BarList({ items = [], labelKey = 'label', valueKey = 'count' }) {
  const max = Math.max(...items.map((item) => Number(item[valueKey] || 0)), 1)
  if (!items.length) return <p className="text-sm text-[#71879d]">No data yet.</p>
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item[labelKey]} className="space-y-1">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-[#20364c]">{item[labelKey]}</span>
            <span className="text-[#60758d]">{formatNumber(item[valueKey])}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#edf3f8]">
            <div className="h-full rounded-full bg-[#315f8c]" style={{ width: `${Math.max(8, (Number(item[valueKey] || 0) / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function DetailOverview({ detail }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <BondSectionCard title="Performance Summary" description="Development-level origination movement and file health.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Metric label="Application Pipeline Value" value={detail.metrics.pipelineValueLabel} tone="blue" />
          <Metric label="Approval Rate" value={`${detail.metrics.approvalRate}%`} tone="green" />
          <Metric label="Avg Approval Days" value={detail.metrics.avgApprovalDays || '—'} />
          <Metric label="At Risk Applications" value={detail.metrics.atRiskFiles} tone={detail.metrics.atRiskFiles ? 'red' : 'green'} />
        </div>
      </BondSectionCard>
      <BondSectionCard title="Bank Breakdown" description="Applications grouped by current or preferred bank.">
        <BarList items={detail.overview.bankDistribution.slice(0, 6)} labelKey="bank" valueKey="count" />
      </BondSectionCard>
      <BondSectionCard title="Recent Activity" description="Latest movement linked to this development.">
        <div className="space-y-3">
          {detail.overview.recentActivity.map((item) => (
            <div key={item.id} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#1b344d]">{item.label}</p>
                  <p className="mt-1 text-xs text-[#71879d]">{item.detail}</p>
                </div>
                <span className="text-xs font-semibold text-[#7890a6]">{formatDate(item.date)}</span>
              </div>
            </div>
          ))}
        </div>
      </BondSectionCard>
      <BondSectionCard title="Outstanding Issues" description="Bottlenecks that need operational attention.">
        {detail.overview.issues.length ? (
          <div className="space-y-3">
            {detail.overview.issues.map((issue) => (
              <div key={issue.id} className="flex items-start gap-3 rounded-[16px] border border-[#f0d4d8] bg-[#fff8f9] px-4 py-3">
                <AlertTriangle size={16} className="mt-0.5 text-[#b5475a]" />
                <div>
                  <p className="text-sm font-semibold text-[#7f2c3a]">{issue.title}</p>
                  <p className="mt-1 text-xs text-[#9b5360]">{issue.detail}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#60758d]">No major bottlenecks are flagged for this development.</p>
        )}
      </BondSectionCard>
    </div>
  )
}

function SimpleRows({ rows = [], columns = [] }) {
  if (!rows.length) return <p className="text-sm text-[#71879d]">No records in this view yet.</p>
  return (
    <div className="overflow-hidden rounded-[18px] border border-[#dbe5f0]">
      <table className="min-w-full divide-y divide-[#e5edf5] text-sm">
        <thead className="bg-[#f7fafc] text-left text-xs font-semibold uppercase tracking-[0.08em] text-[#6f849a]">
          <tr>{columns.map((column) => <th key={column.key} className="px-4 py-3">{column.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-[#edf2f7] bg-white">
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => <td key={column.key} className="px-4 py-3 text-[#20364c]">{column.render ? column.render(row) : row[column.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DetailTabContent({ detail, tab }) {
  if (tab === 'overview') return <DetailOverview detail={detail} />
  if (tab === 'pipeline') {
    return (
      <BondSectionCard title="Development Pipeline" description="Open the filtered pipeline view for incoming and preparing files.">
        <Link to={detail.pipelineHref} className="inline-flex h-11 items-center gap-2 rounded-[14px] bg-[#17324d] px-4 text-sm font-semibold text-white">
          Open Filtered Pipeline <ArrowRight size={15} />
        </Link>
      </BondSectionCard>
    )
  }
  if (tab === 'transactions') {
    return (
      <BondSectionCard title="Development Applications" description="Open active operational applications for this development.">
        <Link to={detail.transactionsHref} className="inline-flex h-11 items-center gap-2 rounded-[14px] bg-[#17324d] px-4 text-sm font-semibold text-white">
          Open Filtered Applications <ArrowRight size={15} />
        </Link>
      </BondSectionCard>
    )
  }
  if (tab === 'clients') {
    return (
      <BondSectionCard title="Linked Clients" description="Buyers and applicants linked to this development.">
        <SimpleRows
          rows={detail.clients}
          columns={[
            { key: 'name', label: 'Client Name' },
            { key: 'property', label: 'Unit / Property' },
            { key: 'financeType', label: 'Finance Type' },
            { key: 'applicationStatus', label: 'Application Status' },
            { key: 'consultant', label: 'Consultant' },
            { key: 'nextAction', label: 'Next Action' },
          ]}
        />
      </BondSectionCard>
    )
  }
  if (tab === 'partners') {
    return (
      <BondSectionCard title="Connected Partners" description="Developers, agents, consultants, attorneys, and banks linked to this project.">
        <SimpleRows rows={detail.partners} columns={[
          { key: 'name', label: 'Organisation / Person' },
          { key: 'role', label: 'Role' },
          { key: 'linkedFiles', label: 'Linked Applications' },
        ]} />
      </BondSectionCard>
    )
  }
  if (tab === 'marketing') {
    const sourceItems = Object.entries(detail.marketing.sourceBreakdown || {}).map(([label, count]) => ({ label, count }))
    return (
      <BondSectionCard title="Marketing Intelligence" description="Lead source and campaign performance for this development.">
        {detail.marketing.hasData ? (
          <BarList items={sourceItems} />
        ) : (
          <BondEmptyState
            title="Marketing data will appear here once leads are linked to this development."
            description="Lead source, campaign source, and drop-off reporting can be attached when the intake source data is available."
          />
        )}
      </BondSectionCard>
    )
  }
  if (tab === 'analytics') {
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <BondSectionCard title="Approval Rate By Bank" description="Readable bank performance from linked applications.">
          <BarList items={detail.overview.bankDistribution.map((item) => ({ label: item.bank, count: item.approved }))} />
        </BondSectionCard>
        <BondSectionCard title="Submission Volume" description="Current workflow distribution across bond stages.">
          <BarList items={detail.overview.stageMix} />
        </BondSectionCard>
      </div>
    )
  }
  return (
    <BondSectionCard title="Development Documents" description="Development-specific documents and enablement material.">
      <SimpleRows rows={detail.documents.map((item) => ({ id: item.type, ...item }))} columns={[
        { key: 'type', label: 'Document Type' },
        { key: 'status', label: 'Status' },
      ]} />
    </BondSectionCard>
  )
}

export default function BondDevelopmentsPage({ service = bondCommandCenterService, initialState = null }) {
  const workspaceContext = useWorkspace()
  const workspaceId = resolveWorkspaceId(workspaceContext)
  const navigate = useNavigate()
  const { developmentId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [state, setState] = useState(initialState || { loading: true, error: '', snapshot: null })
  const selectedTab = searchParams.get('tab') || 'overview'

  const loadDevelopments = useCallback(async () => {
    if (!workspaceId) {
      setState({ loading: false, error: 'missing_workspace_context', snapshot: null })
      return
    }
    setState((previous) => ({ ...previous, loading: true, error: '' }))
    try {
      const snapshot = await service.getBondDevelopmentsWorkspaceSnapshot(workspaceContext, workspaceId, {
        developmentId,
      })
      setState({ loading: false, error: '', snapshot })
    } catch (error) {
      setState({ loading: false, error: String(error?.message || 'developments_load_failed'), snapshot: null })
    }
  }, [developmentId, service, workspaceContext, workspaceId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDevelopments()
  }, [loadDevelopments])

  const snapshot = state.snapshot
  const detail = snapshot?.detail
  const tabValue = DETAIL_TABS.some((tab) => tab.key === selectedTab) ? selectedTab : 'overview'
  const pageTitle = detail?.name || 'Developments'
  const pageDescription = detail
    ? `${detail.developerName} · ${detail.location}`
    : 'Track development performance, linked applications, partner activity, and bond origination results.'

  const handleTabChange = (key) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', key)
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <BondPageShell>
      <BondPageHeader
        title={pageTitle}
        description={pageDescription}
        primaryLabel={detail ? 'View Applications' : 'Export Developments'}
        secondaryLabel={detail ? 'Back to Developments' : 'View Reports'}
        onPrimary={() => navigate(detail?.transactionsHref || '/bond/reports?view=developments')}
        onSecondary={() => navigate(detail ? '/bond/developments' : '/bond/reports')}
      />

      {state.loading ? <BondEmptyState title="Loading development workspace…" description="We are assembling project-level bond intelligence now." /> : null}
      {!state.loading && state.error ? <BondEmptyState title="Could not load developments" description="Please refresh or try again." /> : null}

      {!state.loading && snapshot && !detail ? (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <BondSectionCard title="Project Pipeline" description="Development and unassigned deal performance." icon={Building2}>
              <p className="text-3xl font-semibold tracking-[-0.04em] text-[#172b42]">{formatNumber(snapshot.developments.length)}</p>
            </BondSectionCard>
            <BondSectionCard title="Relationship Workspace" description="Developers, agents, attorneys, and banks connected to each project." icon={Network}>
              <p className="text-3xl font-semibold tracking-[-0.04em] text-[#172b42]">{formatNumber(snapshot.developments.reduce((total, item) => total + item.activeFiles, 0))}</p>
            </BondSectionCard>
            <BondSectionCard title="Project Risk" description="Files requiring document, bank, or instruction attention." icon={BarChart3}>
              <p className="text-3xl font-semibold tracking-[-0.04em] text-[#172b42]">{formatNumber(snapshot.developments.reduce((total, item) => total + item.atRiskFiles, 0))}</p>
            </BondSectionCard>
          </section>
          <section className="grid gap-5 xl:grid-cols-2">
            {snapshot.developments.map((development) => <DevelopmentCard key={development.id} development={development} />)}
          </section>
        </>
      ) : null}

      {!state.loading && detail ? (
        <>
          <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Metric label="Application Pipeline Value" value={detail.metrics.pipelineValueLabel} tone="blue" />
            <Metric label="Active Applications" value={formatNumber(detail.metrics.activeFiles)} />
            <Metric label="Approval Rate" value={`${detail.metrics.approvalRate}%`} tone="green" />
            <Metric label="Avg Approval Days" value={detail.metrics.avgApprovalDays || '—'} />
            <Metric label="Registered Month" value={formatNumber(detail.metrics.registeredThisMonth)} tone="green" />
            <Metric label="At Risk" value={formatNumber(detail.metrics.atRiskFiles)} tone={detail.metrics.atRiskFiles ? 'red' : 'green'} />
          </section>
          <BondViewTabs tabs={DETAIL_TABS} value={tabValue} onChange={handleTabChange} />
          <DetailTabContent detail={detail} tab={tabValue} />
        </>
      ) : null}
    </BondPageShell>
  )
}
