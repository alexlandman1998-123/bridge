import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Download,
  FileBarChart2,
  LayoutGrid,
  Plus,
  Search,
  SlidersHorizontal,
  Table2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import BondEmptyState from '../../components/bond/BondEmptyState'
import BondPageHeader from '../../components/bond/BondPageHeader'
import BondPageShell from '../../components/bond/BondPageShell'
import BondSectionCard from '../../components/bond/BondSectionCard'
import BondViewTabs from '../../components/bond/BondViewTabs'
import { useWorkspace } from '../../context/WorkspaceContext'
import * as bondCommandCenterService from '../../services/bondCommandCenterService'
import { filterAndSortDevelopments } from './bondDevelopmentsPortfolioUtils'

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

const LIST_TABS = [
  { key: 'current', label: 'Portfolio' },
  { key: 'developers', label: 'Developers' },
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

function formatCurrency(value) {
  return `R ${formatNumber(Math.round(Number(value || 0)))}`
}

function formatDate(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return 'No recent activity'
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })
}

function formatRelativeDate(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return 'No recent activity'
  const days = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  return formatDate(value)
}

function formatApprovalRate(value) {
  return value === null || value === undefined ? '—' : `${Math.round(Number(value || 0))}%`
}

function getRiskLabel(value = 'low') {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'high') return 'High'
  if (normalized === 'medium') return 'Medium'
  return 'Low'
}

function getRiskClasses(value = 'low') {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'high') return 'border-[#efcfd3] bg-[#fff7f8] text-[#9b2f3f]'
  if (normalized === 'medium') return 'border-[#ead7ad] bg-[#fffaf0] text-[#875b16]'
  return 'border-[#cce7d8] bg-[#f7fcf9] text-[#1f6b45]'
}

function RiskPill({ level = 'low' }) {
  return (
    <span className={`inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-semibold ${getRiskClasses(level)}`}>
      {getRiskLabel(level)}
    </span>
  )
}

function ApprovalMeter({ value }) {
  const hasValue = value !== null && value !== undefined
  const percent = Math.max(0, Math.min(100, Number(value || 0)))
  return (
    <div className="min-w-[92px]">
      <div className="text-sm font-semibold text-[#20364c]">{formatApprovalRate(value)}</div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#edf3f8]">
        <div className={`h-full rounded-full ${hasValue ? 'bg-[#315f8c]' : 'bg-transparent'}`} style={{ width: `${hasValue ? percent : 0}%` }} />
      </div>
    </div>
  )
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
      <p className="mt-1 text-2xl font-semibold tracking-normal">{value}</p>
    </div>
  )
}

function DevelopmentCard({ development }) {
  return (
    <article className="rounded-[20px] border border-[#dbe5f0] bg-white p-5 shadow-[0_14px_32px_rgba(15,23,42,0.045)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold tracking-normal text-[#142132]">{development.name}</p>
          <p className="mt-1 text-sm text-[#60758d]">{development.developerName || 'Developer not linked'} · {development.location || 'Location pending'}</p>
        </div>
        <span className="rounded-full border border-[#dbe5f0] bg-[#f8fbfe] px-3 py-1 text-xs font-semibold text-[#49657d]">
          {development.status}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
        <CompactMetric label="Pipeline" value={development.pipelineValueLabel} />
        <CompactMetric label="Applications" value={formatNumber(development.activeApplications)} />
        <CompactMetric label="Approval" value={formatApprovalRate(development.approvalRate)} />
        <CompactMetric label="Registered" value={formatNumber(development.registeredThisMonth)} />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#edf2f7] pt-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-[#60758d]">
          <RiskPill level={development.riskLevel} />
          <span>Awaiting Docs: {formatNumber(development.awaitingDocs)}</span>
          <span>Last Activity: {formatRelativeDate(development.lastActivityAt)}</span>
        </div>
        <Link to={development.href} className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#17324d] px-4 text-sm font-semibold text-white">
          Open Development <ArrowRight size={15} />
        </Link>
      </div>
    </article>
  )
}

function CompactMetric({ label, value }) {
  return (
    <div>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7b8da0]">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-normal text-[#172b42]">{value}</p>
    </div>
  )
}

function SummaryMetric({ label, value, helper = '' }) {
  return (
    <div className="min-w-0 rounded-[18px] border border-[#dfe8f2] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.035)]">
      <p className="truncate text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#71859a]">{label}</p>
      <p className="mt-2 truncate text-xl font-semibold tracking-normal text-[#142132]">{value}</p>
      {helper ? <p className="mt-1 truncate text-xs text-[#6b7f94]">{helper}</p> : null}
    </div>
  )
}

export function PortfolioSummary({ summary = {} }) {
  return (
    <section className="grid gap-3 md:grid-cols-3 2xl:grid-cols-6">
      <SummaryMetric label="Total Pipeline Value" value={formatCurrency(summary.totalPipelineValue)} helper="Active linked applications" />
      <SummaryMetric label="Active Applications" value={formatNumber(summary.activeApplications)} helper="Excludes completed/cancelled files" />
      <SummaryMetric label="Approval Rate" value={formatApprovalRate(summary.approvalRate)} helper={summary.approvalRate === null || summary.approvalRate === undefined ? 'No decision data' : 'Submitted and decisioned files'} />
      <SummaryMetric label="Registered This Month" value={formatNumber(summary.registeredThisMonth)} helper="Calendar month registrations" />
      <SummaryMetric label="Commission Forecast" value={summary.commissionForecast === null || summary.commissionForecast === undefined ? 'Not configured' : formatCurrency(summary.commissionForecast)} helper="Existing commission fields only" />
      <SummaryMetric label="Developments At Risk" value={formatNumber(summary.developmentsAtRisk)} helper="Files with risk signals" />
    </section>
  )
}

function PortfolioHeader({ onExport, onReports, onAdd }) {
  return (
    <section className="rounded-[24px] border border-[#dfe8f2] bg-white px-5 py-5 shadow-[0_14px_32px_rgba(15,23,42,0.055)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-[1.65rem] font-semibold tracking-normal text-[#142132]">Developments</h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#60758d]">
            Manage development performance, bond applications, developer relationships, and portfolio risk.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onExport}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] border border-[#dce6f2] bg-white px-4 text-sm font-semibold text-[#17324b] shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-[#c9d8e8]"
          >
            <Download size={16} />
            Export Portfolio
          </button>
          <button
            type="button"
            onClick={onReports}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] border border-[#dce6f2] bg-white px-4 text-sm font-semibold text-[#17324b] shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-[#c9d8e8]"
          >
            <FileBarChart2 size={16} />
            Reports
          </button>
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] bg-[#102448] px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(16,36,72,0.22)] transition hover:-translate-y-0.5 hover:bg-[#17315c]"
          >
            <Plus size={16} />
            Add Development
          </button>
        </div>
      </div>
    </section>
  )
}

function buildDeveloperPortfolio(developments = []) {
  const groups = new Map()
  for (const development of developments) {
    const developerName = normalizeText(development.developerName) || 'Unassigned Developer'
    const group = groups.get(developerName) || {
      id: developerName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: developerName,
      developments: [],
      developmentCount: 0,
      activeFiles: 0,
      pipelineValue: 0,
      atRiskFiles: 0,
      pendingDocuments: 0,
      approvalScore: 0,
    }
    const activeFiles = Number(development.activeFiles || 0)
    group.developments.push(development)
    group.developmentCount += 1
    group.activeFiles += activeFiles
    group.pipelineValue += Number(development.pipelineValue || 0)
    group.atRiskFiles += Number(development.atRiskFiles || 0)
    group.pendingDocuments += Number(development.pendingDocuments || 0)
    group.approvalScore += Number(development.approvalRate || 0) * Math.max(activeFiles, 1)
    groups.set(developerName, group)
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      approvalRate: group.developments.length
        ? Math.round(group.approvalScore / group.developments.reduce((total, item) => total + Math.max(Number(item.activeFiles || 0), 1), 0))
        : 0,
    }))
    .sort((left, right) => Number(right.pipelineValue || 0) - Number(left.pipelineValue || 0))
}

function DeveloperPortfolioCard({ developer }) {
  return (
    <article className="rounded-[24px] border border-[#dbe5f0] bg-white p-5 shadow-[0_16px_42px_rgba(20,33,50,0.07)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold tracking-normal text-[#142132]">{developer.name}</p>
          <p className="mt-1 text-sm text-[#60758d]">{formatNumber(developer.developmentCount)} linked developments</p>
        </div>
        <span className="rounded-full border border-[#dbe5f0] bg-[#f8fbfe] px-3 py-1 text-xs font-semibold text-[#49657d]">
          {formatCurrency(developer.pipelineValue)}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Active Applications" value={formatNumber(developer.activeFiles)} />
        <Metric label="Approval Rate" value={`${developer.approvalRate}%`} tone={developer.approvalRate >= 70 ? 'green' : 'amber'} />
        <Metric label="Awaiting Docs" value={formatNumber(developer.pendingDocuments)} tone={developer.pendingDocuments ? 'amber' : 'green'} />
        <Metric label="At Risk" value={formatNumber(developer.atRiskFiles)} tone={developer.atRiskFiles ? 'red' : 'green'} />
      </div>

      <div className="mt-5 space-y-2">
        {developer.developments.slice(0, 5).map((development) => (
          <Link
            key={development.id}
            to={development.href}
            className="flex items-center justify-between gap-3 rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3 text-sm transition hover:border-[#bdd0e4] hover:bg-white"
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold text-[#20364c]">{development.name}</span>
              <span className="mt-1 block text-xs text-[#71879d]">{development.location} · {formatNumber(development.activeFiles)} active applications</span>
            </span>
            <ArrowRight size={15} className="shrink-0 text-[#6f849a]" />
          </Link>
        ))}
      </div>
    </article>
  )
}

function DevelopersWorkspace({ developments = [] }) {
  const developers = useMemo(() => buildDeveloperPortfolio(developments), [developments])
  if (!developers.length) {
    return <BondEmptyState compact title="No developers linked yet." description="Developer relationships will appear once bond applications are linked to developments." />
  }
  return (
    <section className="grid gap-5 xl:grid-cols-2">
      {developers.map((developer) => <DeveloperPortfolioCard key={developer.id} developer={developer} />)}
    </section>
  )
}

function uniqueOptions(rows = [], key = '') {
  return [...new Set(rows.map((row) => normalizeText(row[key])).filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function PortfolioToolbar({
  developments = [],
  filters = {},
  onFiltersChange,
  layout = 'table',
  onLayoutChange,
}) {
  const developerOptions = uniqueOptions(developments, 'developerName').filter((item) => item !== 'Developer not linked')
  const branchOptions = uniqueOptions(developments, 'branchName')

  const updateFilter = (key, value) => {
    onFiltersChange?.({ ...filters, [key]: value })
  }

  return (
    <section className="rounded-[20px] border border-[#dfe8f2] bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_repeat(5,minmax(140px,180px))_auto]">
        <label className="flex h-11 min-w-0 items-center gap-2 rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] px-3 text-sm text-[#6f849a]">
          <Search size={16} />
          <input
            value={filters.search}
            onChange={(event) => updateFilter('search', event.target.value)}
            placeholder="Search developments..."
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[#20364c] outline-none placeholder:text-[#9aaabc]"
          />
        </label>
        <FilterSelect label="Status" value={filters.status} onChange={(value) => updateFilter('status', value)} options={['all', 'Active', 'Unassigned']} />
        <FilterSelect label="Developer" value={filters.developer} onChange={(value) => updateFilter('developer', value)} options={['all', ...developerOptions]} />
        <FilterSelect label="Branch" value={filters.branch} onChange={(value) => updateFilter('branch', value)} options={['all', ...branchOptions]} />
        <FilterSelect label="Risk" value={filters.risk} onChange={(value) => updateFilter('risk', value)} options={['all', 'high', 'medium', 'low']} />
        <FilterSelect label="Sort by" value={filters.sort} onChange={(value) => updateFilter('sort', value)} options={['Last Activity', 'Pipeline Value', 'Most Applications', 'Highest Risk', 'Lowest Approval Rate', 'Newest']} />
        <div className="flex h-11 items-center justify-end gap-1 rounded-[14px] border border-[#dce6f2] bg-[#f8fbfe] p-1">
          <LayoutButton active={layout === 'table'} label="Table" icon={Table2} onClick={() => onLayoutChange?.('table')} />
          <LayoutButton active={layout === 'cards'} label="Cards" icon={LayoutGrid} onClick={() => onLayoutChange?.('cards')} />
        </div>
      </div>
    </section>
  )
}

function FilterSelect({ label, value, options = [], onChange }) {
  return (
    <label className="relative flex h-11 items-center gap-2 rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] px-3 text-sm">
      <SlidersHorizontal size={15} className="shrink-0 text-[#7f91a4]" />
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        className="min-w-0 flex-1 appearance-none bg-transparent pr-4 text-sm font-semibold text-[#20364c] outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option === 'all' ? label : option.charAt(0).toUpperCase() + option.slice(1)}
          </option>
        ))}
      </select>
    </label>
  )
}

function LayoutButton({ active = false, label, icon, onClick }) {
  const IconComponent = icon
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-[10px] transition ${
        active ? 'bg-white text-[#17324d] shadow-[0_6px_14px_rgba(15,23,42,0.08)]' : 'text-[#7890a6] hover:bg-white/70'
      }`}
    >
      <IconComponent size={16} />
    </button>
  )
}

export function PortfolioTable({ developments = [] }) {
  if (!developments.length) {
    return null
  }

  return (
    <section className="overflow-hidden rounded-[22px] border border-[#dbe5f0] bg-white shadow-[0_16px_34px_rgba(15,23,42,0.045)]">
      <div className="hidden overflow-x-auto xl:block">
        <table className="min-w-[1180px] w-full text-left text-sm">
          <thead className="border-b border-[#e5edf5] bg-[#f7fafc] text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#6f849a]">
            <tr>
              {['Development', 'Location', 'Pipeline Value', 'Applications', 'Approval Rate', 'Registered', 'Risk', 'Lead Consultant / Branch', 'Last Activity', 'Actions'].map((heading) => (
                <th key={heading} className="px-5 py-3.5">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf2f7]">
            {developments.map((development) => (
              <tr key={development.id} className="align-middle transition hover:bg-[#fbfdff]">
                <td className="px-5 py-4">
                  <div className="min-w-[210px]">
                    <Link to={development.href} className="font-semibold text-[#142132] hover:text-[#315f8c]">{development.name}</Link>
                    <p className="mt-1 text-xs text-[#6b7f94]">{development.developerName || 'Developer not linked'}</p>
                  </div>
                </td>
                <td className="px-5 py-4 text-[#60758d]">{development.location || 'Location pending'}</td>
                <td className="px-5 py-4 font-semibold text-[#172b42]">{development.pipelineValueLabel}</td>
                <td className="px-5 py-4">
                  <p className="font-semibold text-[#20364c]">{formatNumber(development.activeApplications)} active</p>
                  <p className="mt-1 text-xs text-[#71879d]">{formatNumber(development.awaitingDocs)} awaiting docs</p>
                </td>
                <td className="px-5 py-4"><ApprovalMeter value={development.approvalRate} /></td>
                <td className="px-5 py-4 text-[#20364c]">{formatNumber(development.registeredThisMonth)} this month</td>
                <td className="px-5 py-4"><RiskPill level={development.riskLevel} /></td>
                <td className="px-5 py-4">
                  <p className="font-medium text-[#20364c]">{development.consultantName || 'Unassigned'}</p>
                  <p className="mt-1 text-xs text-[#71879d]">{development.branchName || 'No branch assigned'}</p>
                </td>
                <td className="px-5 py-4 text-[#60758d]">{formatRelativeDate(development.lastActivityAt)}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <Link to={development.href} className="inline-flex h-9 items-center rounded-[11px] bg-[#17324d] px-3 text-xs font-semibold text-white">Open</Link>
                    <Link to={development.transactionsHref} className="inline-flex h-9 items-center rounded-[11px] border border-[#dbe5f0] px-3 text-xs font-semibold text-[#24415d]">Applications</Link>
                    <Link to={development.reportsHref} className="inline-flex h-9 items-center rounded-[11px] border border-[#dbe5f0] px-3 text-xs font-semibold text-[#24415d]">Reports</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-0 divide-y divide-[#edf2f7] xl:hidden">
        {developments.map((development) => (
          <article key={development.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link to={development.href} className="block truncate font-semibold text-[#142132]">{development.name}</Link>
                <p className="mt-1 text-sm text-[#60758d]">{development.developerName || 'Developer not linked'} · {development.location || 'Location pending'}</p>
              </div>
              <RiskPill level={development.riskLevel} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <CompactMetric label="Pipeline" value={development.pipelineValueLabel} />
              <CompactMetric label="Active" value={formatNumber(development.activeApplications)} />
              <CompactMetric label="Approval" value={formatApprovalRate(development.approvalRate)} />
              <CompactMetric label="Registered" value={formatNumber(development.registeredThisMonth)} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to={development.href} className="inline-flex h-9 items-center rounded-[11px] bg-[#17324d] px-3 text-xs font-semibold text-white">Open</Link>
              <Link to={development.transactionsHref} className="inline-flex h-9 items-center rounded-[11px] border border-[#dbe5f0] px-3 text-xs font-semibold text-[#24415d]">Applications</Link>
              <Link to={development.reportsHref} className="inline-flex h-9 items-center rounded-[11px] border border-[#dbe5f0] px-3 text-xs font-semibold text-[#24415d]">Reports</Link>
            </div>
          </article>
        ))}
      </div>
    </section>
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
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    developer: 'all',
    branch: 'all',
    risk: 'all',
    sort: 'Last Activity',
  })
  const selectedTab = searchParams.get('tab') || 'overview'
  const selectedListView = searchParams.get('view') || 'current'
  const selectedLayout = searchParams.get('layout') === 'cards' ? 'cards' : 'table'

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
  const portfolioSummary = snapshot?.portfolio?.summary || {}
  const portfolioDevelopments = useMemo(
    () => snapshot?.portfolio?.developments || snapshot?.developments || [],
    [snapshot],
  )
  const filteredDevelopments = useMemo(
    () => filterAndSortDevelopments(portfolioDevelopments, filters),
    [filters, portfolioDevelopments],
  )
  const hasPortfolioFilters = Object.entries(filters).some(([key, value]) => key !== 'sort' && normalizeText(value) && value !== 'all')
  const tabValue = DETAIL_TABS.some((tab) => tab.key === selectedTab) ? selectedTab : 'overview'
  const listViewValue = LIST_TABS.some((tab) => tab.key === selectedListView) ? selectedListView : 'current'
  const pageTitle = detail?.name || 'Developments'
  const pageDescription = detail
    ? `${detail.developerName} · ${detail.location}`
    : 'Track development performance, linked applications, partner activity, and bond origination results.'

  const handleTabChange = (key) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', key)
    setSearchParams(nextParams, { replace: true })
  }

  const handleListViewChange = (key) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('view', key)
    nextParams.delete('tab')
    setSearchParams(nextParams, { replace: true })
  }

  const handleLayoutChange = (key) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('layout', key)
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <BondPageShell>
      {detail ? (
        <BondPageHeader
          title={pageTitle}
          description={pageDescription}
          primaryLabel="View Applications"
          secondaryLabel="Back to Developments"
          onPrimary={() => navigate(detail.transactionsHref)}
          onSecondary={() => navigate('/bond/developments?view=current')}
        />
      ) : (
        <PortfolioHeader
          onExport={() => navigate('/bond/reports?view=developments')}
          onReports={() => navigate('/bond/reports')}
          onAdd={() => navigate('/settings/developments')}
        />
      )}

      {state.loading ? <BondEmptyState title="Loading development workspace…" description="We are assembling project-level bond intelligence now." /> : null}
      {!state.loading && state.error ? <BondEmptyState title="Could not load developments" description="Please refresh or try again." /> : null}

      {!state.loading && snapshot && !detail ? (
        <>
          <BondViewTabs tabs={LIST_TABS} value={listViewValue} onChange={handleListViewChange} />
          <PortfolioSummary summary={portfolioSummary} />
          {listViewValue === 'developers' ? (
            <DevelopersWorkspace developments={portfolioDevelopments} />
          ) : (
            <>
              <PortfolioToolbar
                developments={portfolioDevelopments}
                filters={filters}
                onFiltersChange={setFilters}
                layout={selectedLayout}
                onLayoutChange={handleLayoutChange}
              />
              {portfolioDevelopments.length ? (
                filteredDevelopments.length ? (
                  selectedLayout === 'cards' ? (
                    <section className="grid gap-5 xl:grid-cols-2">
                      {filteredDevelopments.map((development) => <DevelopmentCard key={development.id} development={development} />)}
                    </section>
                  ) : (
                    <PortfolioTable developments={filteredDevelopments} />
                  )
                ) : (
                  <BondEmptyState
                    title="No matching developments"
                    description="Try adjusting your filters or search term."
                    icon={Search}
                  />
                )
              ) : (
                <BondEmptyState
                  title="No developments yet"
                  description="Add your first development to start tracking applications, developer relationships, and bond performance."
                  icon={Building2}
                  action={
                    <button
                      type="button"
                      onClick={() => navigate('/settings/developments')}
                      className="inline-flex h-10 items-center rounded-[12px] bg-[#17324d] px-4 text-sm font-semibold text-white"
                    >
                      Add Development
                    </button>
                  }
                />
              )}
              {hasPortfolioFilters && filteredDevelopments.length ? (
                <p className="text-sm text-[#60758d]">{formatNumber(filteredDevelopments.length)} of {formatNumber(portfolioDevelopments.length)} developments shown</p>
              ) : null}
            </>
          )}
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
