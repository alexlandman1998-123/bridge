import { AlertTriangle, ArrowUpRight, Clock3, FileWarning, PieChart, TrendingUp } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { normalizeStageLabel } from '../lib/stages'
import { getOverviewMilestoneIndex } from '../core/transactions/selectors'
import { financeTypeShortLabel, normalizeFinanceType as normalizeCanonicalFinanceType } from '../core/transactions/financeType'
import { getReportNextAction } from '../core/transactions/reportNextAction'

const SCREEN_PANEL_CLASS = 'rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]'

function getRiskStatusClassName(status = 'On Track') {
  const normalized = String(status || '').toLowerCase()
  if (normalized.includes('blocked')) return 'border-[#f1c7c7] bg-[#fff1f1] text-[#b42318]'
  if (normalized.includes('delay')) return 'border-[#f3d7a8] bg-[#fff8ed] text-[#9a5b0f]'
  if (normalized.includes('track')) return 'border-[#d8f0de] bg-[#edfdf3] text-[#1e7a46]'
  return 'border-[#dde4ee] bg-[#f7f9fc] text-[#66758b]'
}

function getMilestoneClasses(state) {
  if (state === 'complete') {
    return {
      wrap: 'border-[#cde7d7] bg-[#edfdf3]',
      dot: 'bg-[#1e7a46]',
    }
  }
  if (state === 'current') {
    return {
      wrap: 'border-[#cfe1f7] bg-[#eff6ff]',
      dot: 'bg-[#35546c]',
    }
  }
  return {
    wrap: 'border-[#e5ebf3] bg-[#f8fafc]',
    dot: 'bg-[#c0ccd9]',
  }
}

function formatDate(value) {
  if (!value) {
    return '-'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '-'
  }

  return parsed.toLocaleDateString()
}

function trimText(value, maxLength = 120) {
  if (!value) {
    return '-'
  }

  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 1)}…`
}

function formatCurrency(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return '-'
  }

  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(numeric)
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return '0%'
  }

  return `${Math.round(value)}%`
}

function formatRatio(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0.0x'
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)}x`
}

function getPurchasePrice(row) {
  return row.transaction?.sales_price ?? row.report?.purchasePrice ?? row.unit?.price ?? null
}

function getDevelopmentPhase(row) {
  return row.unit?.phase || row.report?.developmentPhase || '-'
}

const MAIN_STAGE_ORDER = ['AVAIL', 'DEP', 'OTP', 'FIN', 'ATTY', 'XFER', 'REG']
const MAIN_STAGE_LABELS = {
  AVAIL: 'Available',
  DEP: 'Deposit',
  OTP: 'OTP',
  FIN: 'Finance',
  ATTY: 'Transfer Preparation',
  XFER: 'Transfer',
  REG: 'Registered',
}
const STAGE_SLA_DAYS = {
  AVAIL: 30,
  DEP: 10,
  OTP: 12,
  FIN: 18,
  ATTY: 20,
  XFER: 14,
  REG: 0,
}
const FINANCE_COLOR_MAP = {
  cash: '#37576f',
  bond: '#22c55e',
  combination: '#2563eb',
  unknown: '#cbd5e1',
}
const BUYER_AGE_GROUPS = ['Under 30', '30-40', '40-50', '50+', 'Unknown']

function normalizeMainStageKey(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()

  if (MAIN_STAGE_ORDER.includes(normalized)) {
    return normalized
  }

  const text = normalizeStageLabel(value).toLowerCase()
  if (text.includes('available')) return 'AVAIL'
  if (text.includes('deposit')) return 'DEP'
  if (text.includes('otp') || text.includes('reserved') || text.includes('sign')) return 'OTP'
  if (text.includes('finance') || text.includes('bank') || text.includes('bond')) return 'FIN'
  if (text.includes('attorney') || text.includes('tuckers')) return 'ATTY'
  if (text.includes('transfer') || text.includes('lodg')) return 'XFER'
  if (text.includes('registered')) return 'REG'
  return 'AVAIL'
}

function getMainStageKey(row) {
  return normalizeMainStageKey(row?.transaction?.current_main_stage || row?.report?.currentMainStage || row?.stage)
}

function getMainStageIndex(row) {
  return MAIN_STAGE_ORDER.indexOf(getMainStageKey(row))
}

function getStageStartedAt(row) {
  return row?.report?.stageDate || row?.transaction?.updated_at || row?.transaction?.created_at || null
}

function getDaysInCurrentPhase(row) {
  return daysSince(getStageStartedAt(row))
}

function daysSince(dateLike) {
  if (!dateLike) return 0
  const parsed = new Date(dateLike)
  if (Number.isNaN(parsed.getTime())) return 0
  const diffMs = Date.now() - parsed.getTime()
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 0
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

function normalizeFinanceType(raw) {
  return normalizeCanonicalFinanceType(raw, { allowUnknown: true })
}

function getBuyerAgeGroup(row) {
  const rawAge = Number(row?.buyer?.age)
  if (!Number.isFinite(rawAge) || rawAge <= 0) return 'Unknown'
  if (rawAge < 30) return 'Under 30'
  if (rawAge <= 40) return '30-40'
  if (rawAge <= 50) return '40-50'
  return '50+'
}

function getRiskBand(days, slaDays) {
  if (!slaDays) return 'ok'
  if (days > slaDays * 1.4) return 'high'
  if (days > slaDays) return 'watch'
  return 'ok'
}

function buildDonutGradient(segments) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0)
  if (!total) return `conic-gradient(#cbd5e1 0 100%)`
  let running = 0
  const slices = segments.map((segment) => {
    const start = (running / total) * 100
    running += segment.count
    const end = (running / total) * 100
    return `${segment.color} ${start}% ${end}%`
  })
  return `conic-gradient(${slices.join(', ')})`
}

const OVERVIEW_MILESTONES = [
  { key: 'avail', label: 'Available / no active deal', shortLabel: 'AVAIL' },
  { key: 'dep', label: 'Deposit paid / confirmed', shortLabel: 'DEP' },
  { key: 'otp', label: 'OTP signed / deal initiated', shortLabel: 'OTP' },
  { key: 'fin', label: 'Finance / funding in progress', shortLabel: 'FIN' },
  { key: 'bond', label: 'Bond approved / proof of funds secured', shortLabel: 'BOND' },
  { key: 'atty', label: 'Transfer preparation active', shortLabel: 'ATTY' },
  { key: 'xfer', label: 'Transfer lodged / actively underway', shortLabel: 'XFER' },
  { key: 'reg', label: 'Registered', shortLabel: 'REG' },
]

function getMilestoneIndex(row) {
  const fromRow = Number(row?.report?.milestoneIndex)
  if (Number.isFinite(fromRow)) {
    return fromRow
  }

  return getOverviewMilestoneIndex({
    currentMainStage: row?.report?.currentMainStage || row?.transaction?.current_main_stage,
    detailedStage: normalizeStageLabel(row?.stage),
    financeSummary: row?.report?.financeSummary || row?.report?.subprocess?.finance?.summary || null,
  })
}

function toShortOperationalComment(value, maxLength = 78) {
  if (!value) {
    return ''
  }

  const condensed = String(value).replace(/\s+/g, ' ').trim()
  if (!condensed) {
    return ''
  }

  const sentenceBreak = condensed.search(/[.!?](\s|$)/)
  const firstSentence =
    sentenceBreak > 20 && sentenceBreak < maxLength
      ? condensed.slice(0, sentenceBreak + 1)
      : condensed

  if (firstSentence.length <= maxLength) {
    return firstSentence
  }

  return `${firstSentence.slice(0, maxLength - 1)}…`
}

function getStageFallbackComment(stage) {
  const normalized = normalizeStageLabel(stage)

  if (normalized === 'Available') {
    return 'Open for sale.'
  }
  if (normalized === 'Reserved') {
    return 'Waiting for deposit confirmation.'
  }
  if (normalized === 'OTP Signed') {
    return 'OTP signed; preparing funding checks.'
  }
  if (normalized === 'Deposit Paid') {
    return 'Deposit received; waiting for OTP signature.'
  }
  if (normalized === 'Finance Pending') {
    return 'Funding verification in progress.'
  }
  if (normalized === 'Bond Approved / Proof of Funds') {
    return 'Funds secured; attorney instruction pending.'
  }
  if (normalized === 'Proceed to Attorneys') {
    return 'Transfer preparation with attorneys.'
  }
  if (['Transfer in Progress', 'Transfer Lodged', 'Transfer'].includes(normalized)) {
    return 'Transfer processing at deeds office.'
  }
  if (normalized === 'Registered') {
    return 'Registration complete.'
  }

  return 'Transaction in progress.'
}

function getOverviewComment(row) {
  const workflowComment = toShortOperationalComment(row.report?.workflowComment, 84)
  const latestOperationalNote = toShortOperationalComment(row.report?.latestOperationalNote, 82)
  const notesSummary = toShortOperationalComment(row.report?.notesSummary, 72)
  const nextAction = toShortOperationalComment(row.transaction?.next_action, 72)
  const fallback = getStageFallbackComment(row.stage)

  return workflowComment || latestOperationalNote || notesSummary || nextAction || fallback
}

function OverviewReportTable({ rows, reportType, onReportTypeChange }) {
  return (
    <section className={SCREEN_PANEL_CLASS}>
      <div className="mb-5 flex flex-col gap-4 border-b border-[#edf2f7] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h4 className="text-[1.04rem] font-semibold tracking-[-0.025em] text-[#142132]">Overview Table</h4>
          <p className="mt-2 text-sm leading-6 text-[#6b7d93]">Milestone-level snapshot across the selected transaction set.</p>
        </div>
        <ReportTypeToggle reportType={reportType} onChange={onReportTypeChange} />
      </div>
      <div className="overflow-x-auto rounded-[18px] border border-[#e6edf5] bg-white">
        <table className="ui-data-table min-w-[1280px]">
        <thead>
          <tr>
            <th>Unit</th>
            <th>Buyer</th>
            <th>Finance Type</th>
            <th>Purchase Price</th>
            <th>Phase</th>
            {OVERVIEW_MILESTONES.map((milestone) => (
              <th key={milestone.key} className="stage-col" title={milestone.label}>
                <span className="stage-label-full">{milestone.shortLabel}</span>
                <span className="stage-label-short" title={milestone.label}>
                  {milestone.shortLabel}
                </span>
              </th>
            ))}
            <th>Comment</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const milestoneIndex = getMilestoneIndex(row)

            return (
              <tr key={row.unit.id}>
                <td title={`${row.development?.name || ''} - ${row.unit.unit_number}`}>{row.unit.unit_number}</td>
                <td>{row.buyer?.name || '-'}</td>
                <td>{financeTypeShortLabel(row.transaction?.finance_type) || '-'}</td>
                <td>{formatCurrency(getPurchasePrice(row))}</td>
                <td>{getDevelopmentPhase(row)}</td>

                {OVERVIEW_MILESTONES.map((milestone, index) => {
                  const state = index < milestoneIndex ? 'complete' : index === milestoneIndex ? 'current' : 'future'
                  const milestoneClasses = getMilestoneClasses(state)

                  return (
                    <td key={milestone.key} className="stage-col">
                      <div className="flex items-center justify-center">
                        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${milestoneClasses.wrap}`}>
                          <span className={`h-2.5 w-2.5 rounded-full ${milestoneClasses.dot}`} />
                        </span>
                      </div>
                    </td>
                  )
                })}

                <td>{trimText(getReportNextAction(row), 56)}</td>
                <td className="comment-cell">{getOverviewComment(row)}</td>
              </tr>
            )
          })}

          {!rows.length ? (
            <tr>
              <td colSpan={15}>No transactions found for selected filters.</td>
            </tr>
          ) : null}
        </tbody>
        </table>
      </div>
    </section>
  )
}

function UnitViewReportList({ rows, reportType, onReportTypeChange }) {
  return (
    <section className={SCREEN_PANEL_CLASS}>
      <div className="mb-5 flex flex-col gap-4 border-b border-[#edf2f7] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h4 className="text-[1.04rem] font-semibold tracking-[-0.025em] text-[#142132]">Unit Detail Report</h4>
          <p className="mt-2 text-sm leading-6 text-[#6b7d93]">Operational summaries, key dates, and next actions for each live transaction.</p>
        </div>
        <ReportTypeToggle reportType={reportType} onChange={onReportTypeChange} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
      {rows.map((row) => {
        const lastCompletedDate = row.report?.stageDate || row.transaction?.updated_at || row.transaction?.created_at
        const nextTargetDate = row.report?.nextTargetDate

        return (
          <article
            key={row.unit.id}
            className="rounded-[22px] border border-[#dde4ee] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
          >
            <header className="flex flex-col gap-4 border-b border-[#edf2f7] pb-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h4 className="text-[1.02rem] font-semibold tracking-[-0.025em] text-[#142132]">
                  Unit {row.unit.unit_number} <span className="text-[#6b7d93]">{row.development?.name || '-'}</span>
                </h4>
                <p className="mt-2 text-sm leading-6 text-[#5f7287]">
                  Buyer: {row.buyer?.name || '-'} • Finance: {financeTypeShortLabel(row.transaction?.finance_type)} • Stage: {row.stage}
                </p>
              </div>
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.76rem] font-semibold ${getRiskStatusClassName(
                  row.report?.riskStatus || 'On Track',
                )}`}
              >
                {row.report?.riskStatus || 'On Track'}
              </span>
            </header>

            <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div>
                <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">What Happened Last</dt>
                <dd className="mt-2 text-sm font-semibold text-[#142132]">{row.report?.lastCompletedStep || row.stage}</dd>
              </div>
              <div>
                <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Last Completed Date</dt>
                <dd className="mt-2 text-sm font-semibold text-[#142132]">{formatDate(lastCompletedDate)}</dd>
              </div>
              <div>
                <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">What Happens Next</dt>
                <dd className="mt-2 text-sm font-semibold text-[#142132]">{getReportNextAction(row)}</dd>
              </div>
              <div>
                <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Purchase Price</dt>
                <dd className="mt-2 text-sm font-semibold text-[#142132]">{formatCurrency(getPurchasePrice(row))}</dd>
              </div>
              <div>
                <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Development Phase</dt>
                <dd className="mt-2 text-sm font-semibold text-[#142132]">{getDevelopmentPhase(row)}</dd>
              </div>
              <div>
                <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Next Target Date</dt>
                <dd className="mt-2 text-sm font-semibold text-[#142132]">{formatDate(nextTargetDate)}</dd>
              </div>
              <div>
                <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Attorney</dt>
                <dd className="mt-2 text-sm font-semibold text-[#142132]">{row.transaction?.attorney || '-'}</dd>
              </div>
              <div>
                <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Bond Originator</dt>
                <dd className="mt-2 text-sm font-semibold text-[#142132]">{row.transaction?.bond_originator || '-'}</dd>
              </div>
              <div className="sm:col-span-2 xl:col-span-3">
                <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Notes Summary</dt>
                <dd className="mt-2 text-sm leading-6 text-[#5f7287]">
                  {trimText(row.report?.workflowComment || row.report?.latestOperationalNote || row.report?.notesSummary || row.transaction?.next_action || '-')}
                </dd>
              </div>
            </dl>
          </article>
        )
      })}

      {!rows.length ? <p className="text-sm text-[#6b7d93]">No transactions found for selected filters.</p> : null}
      </div>
    </section>
  )
}

function MarketingPerformanceSection({ marketingSummary }) {
  const hasRows = (marketingSummary?.sourceRows || []).length > 0
  const spendModeLabel = marketingSummary?.actualSpend ? 'Actual spend mode' : 'Estimated spend mode'
  const roas = marketingSummary?.spendUsed ? (marketingSummary.attributedRevenue || 0) / marketingSummary.spendUsed : 0
  const sourceRows = (marketingSummary?.sourceRows || []).slice(0, 6)
  const topSourceRow = sourceRows[0] || null

  return (
    <section className={SCREEN_PANEL_CLASS}>
      <header className="flex flex-col gap-4 border-b border-[#edf2f7] pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h4 className="text-[1.04rem] font-semibold tracking-[-0.025em] text-[#142132]">Marketing Performance</h4>
          <p className="mt-2 text-sm leading-6 text-[#6b7d93]">See which channels are feeding the pipeline, converting cleanly, and actually turning spend into secured revenue.</p>
        </div>
        <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.76rem] font-semibold text-[#66758b]">
          {spendModeLabel}
        </span>
      </header>

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <article className="rounded-[18px] border border-[#dce6f1] bg-[#fbfcfe] px-4 py-3.5 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
          <span className="block text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Total Leads</span>
          <strong className="mt-2 block text-[1.45rem] font-semibold tracking-[-0.03em] text-[#142132]">{marketingSummary?.totalLeads || 0}</strong>
          <p className="mt-1.5 text-sm leading-5 text-[#6b7d93]">Visible in this report.</p>
        </article>
        <article className="rounded-[18px] border border-[#dce6f1] bg-[#fbfcfe] px-4 py-3.5 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
          <span className="block text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Conversions</span>
          <strong className="mt-2 block text-[1.45rem] font-semibold tracking-[-0.03em] text-[#1e7a46]">{marketingSummary?.totalConverted || 0}</strong>
          <p className="mt-1.5 text-sm leading-5 text-[#6b7d93]">{formatPercent(marketingSummary?.conversionRate || 0)} conversion.</p>
        </article>
        <article className="rounded-[18px] border border-[#dce6f1] bg-[#fbfcfe] px-4 py-3.5 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
          <span className="block text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Spend Used</span>
          <strong className="mt-2 block text-[1.45rem] font-semibold tracking-[-0.03em] text-[#142132]">{formatCurrency(marketingSummary?.spendUsed || 0)}</strong>
          <p className="mt-1.5 text-sm leading-5 text-[#6b7d93]">{spendModeLabel}.</p>
        </article>
        <article className="rounded-[18px] border border-[#dce6f1] bg-[#fbfcfe] px-4 py-3.5 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
          <span className="block text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Attributed Revenue</span>
          <strong className="mt-2 block text-[1.45rem] font-semibold tracking-[-0.03em] text-[#142132]">{formatCurrency(marketingSummary?.attributedRevenue || 0)}</strong>
          <p className="mt-1.5 text-sm leading-5 text-[#6b7d93]">Revenue secured.</p>
        </article>
        <article className="rounded-[18px] border border-[#dce6f1] bg-[#fbfcfe] px-4 py-3.5 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
          <span className="block text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Cost per Lead</span>
          <strong className="mt-2 block text-[1.45rem] font-semibold tracking-[-0.03em] text-[#142132]">{formatCurrency(marketingSummary?.costPerLead || 0)}</strong>
          <p className="mt-1.5 text-sm leading-5 text-[#6b7d93]">Acquisition efficiency.</p>
        </article>
        <article className="rounded-[18px] border border-[#dce6f1] bg-[#fbfcfe] px-4 py-3.5 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
          <span className="block text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">ROAS</span>
          <strong className="mt-2 block text-[1.45rem] font-semibold tracking-[-0.03em] text-[#1e7a46]">{formatRatio(roas)}</strong>
          <p className="mt-1.5 text-sm leading-5 text-[#6b7d93]">Revenue versus spend.</p>
        </article>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-[22px] border border-[#dce6f1] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h5 className="text-[0.98rem] font-semibold tracking-[-0.02em] text-[#142132]">Source Performance</h5>
              <p className="mt-2 text-sm leading-6 text-[#6b7d93]">Which channels are feeding the pipeline and what quality they are producing.</p>
            </div>
            <span className="inline-flex shrink-0 whitespace-nowrap items-center rounded-full bg-[#eef4f9] px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#5d7287]">
              {sourceRows.length} sources
            </span>
          </div>

          {hasRows ? (
            <div className="mt-5 grid gap-4">
              {sourceRows.map((source, index) => {
                const revenueShare = marketingSummary?.attributedRevenue ? (source.revenue / marketingSummary.attributedRevenue) * 100 : 0
                const sourceRoas = source.estimatedSpend ? source.revenue / source.estimatedSpend : 0
                return (
                  <article key={source.key} className="rounded-[20px] border border-[#dce6f1] bg-[#fbfcfe] px-5 py-5 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-[#eef4f9] px-2 text-xs font-semibold text-[#35546c]">
                            {index + 1}
                          </span>
                          <div>
                            <h5 className="text-[0.98rem] font-semibold tracking-[-0.02em] text-[#142132]">{source.label}</h5>
                            <p className="mt-1 text-sm text-[#6b7d93]">
                              {source.leads} leads • {source.converted} registered • {formatPercent(source.conversionRate)} conversion
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[320px]">
                        <div className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-3">
                          <span className="text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Revenue</span>
                          <strong className="mt-1 block text-sm font-semibold text-[#142132]">{formatCurrency(source.revenue)}</strong>
                        </div>
                        <div className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-3">
                          <span className="text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Spend Model</span>
                          <strong className="mt-1 block text-sm font-semibold text-[#142132]">{formatCurrency(source.estimatedSpend)}</strong>
                        </div>
                        <div className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-3">
                          <span className="text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">ROAS</span>
                          <strong className="mt-1 block text-sm font-semibold text-[#1e7a46]">{formatRatio(sourceRoas)}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="flex items-center justify-between gap-3 text-xs font-medium text-[#6b7d93]">
                          <span>Lead Share</span>
                          <span>{formatPercent(source.leadShare)}</span>
                        </div>
                        <div className="mt-2 h-2.5 rounded-full bg-[#e8eef5]" aria-hidden>
                          <span className="block h-full rounded-full bg-[linear-gradient(90deg,#35546c_0%,#7ea5c8_100%)]" style={{ width: `${Math.max(source.leadShare, 3)}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between gap-3 text-xs font-medium text-[#6b7d93]">
                          <span>Revenue Share</span>
                          <span>{formatPercent(revenueShare)}</span>
                        </div>
                        <div className="mt-2 h-2.5 rounded-full bg-[#e8eef5]" aria-hidden>
                          <span className="block h-full rounded-full bg-[linear-gradient(90deg,#1d7b52_0%,#57c785_100%)]" style={{ width: `${Math.max(revenueShare, 3)}%` }} />
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <p className="mt-4 text-sm text-[#6b7d93]">No marketing source data available for the selected filters.</p>
          )}
        </article>

        <section className="space-y-4">
          <article className="rounded-[22px] border border-[#dce6f1] bg-[#fbfcfe] p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
            <span className="inline-flex whitespace-nowrap items-center rounded-full bg-[#eef4f9] px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#5d7287]">
              Top Performing Source
            </span>
            <h5 className="mt-3 text-[1.18rem] font-semibold tracking-[-0.03em] text-[#142132]">{marketingSummary?.topSource || 'Unknown'}</h5>
            <p className="mt-1 text-sm leading-5 text-[#6b7d93]">
              {topSourceRow
                ? `${topSourceRow.leads} leads • ${topSourceRow.converted} registered • ${formatPercent(topSourceRow.conversionRate)} conversion`
                : 'No source data available in this report slice.'}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-3.5">
                <span className="text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Cost per Lead</span>
                <strong className="mt-2 block text-[1.25rem] font-semibold text-[#142132]">{formatCurrency(marketingSummary?.costPerLead || 0)}</strong>
              </div>
              <div className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-3.5">
                <span className="text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Cost per Conversion</span>
                <strong className="mt-2 block text-[1.25rem] font-semibold text-[#142132]">{formatCurrency(marketingSummary?.costPerConversion || 0)}</strong>
              </div>
              <div className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-3.5">
                <span className="text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">ROAS</span>
                <strong className="mt-2 block text-[1.25rem] font-semibold text-[#1e7a46]">{formatRatio(roas)}</strong>
              </div>
              <div className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-3.5">
                <span className="text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Estimated Spend</span>
                <strong className="mt-2 block text-[1.25rem] font-semibold text-[#142132]">{formatCurrency(marketingSummary?.estimatedSpend || 0)}</strong>
              </div>
            </div>
          </article>

          <article className="rounded-[22px] border border-[#dce6f1] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
            <h5 className="text-[0.98rem] font-semibold tracking-[-0.02em] text-[#142132]">Source Conversion Ladder</h5>
            <p className="mt-2 text-sm leading-6 text-[#6b7d93]">Use this to decide where to keep spending and which channels need quality intervention.</p>
            {hasRows ? (
              <ul className="mt-4 space-y-3">
                {sourceRows.map((source) => (
                  <li key={`${source.key}-ladder`}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-[#4f647a]">{source.label}</span>
                      <strong className="font-semibold text-[#142132]">{formatPercent(source.conversionRate)}</strong>
                    </div>
                    <div className="mt-2 h-2.5 rounded-full bg-[#e8eef5]" aria-hidden>
                      <span className="block h-full rounded-full bg-[linear-gradient(90deg,#1d7b52_0%,#57c785_100%)]" style={{ width: `${Math.max(source.conversionRate, 3)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 text-sm text-[#6b7d93]">No conversion data available for the selected filters.</p>
            )}
          </article>
        </section>
      </div>
    </section>
  )
}

function ExecutivePrintPage({ title, transactionScopeLabel, generatedAt, summary, rows, marketingSummary }) {
  const totalUnits = rows.length
  const activeRows = rows.filter((row) => !['AVAIL', 'REG'].includes(getMainStageKey(row)))
  const completedRows = rows.filter((row) => getMainStageKey(row) === 'REG')
  const availableRows = rows.filter((row) => getMainStageKey(row) === 'AVAIL')
  const pipelineValue = activeRows.reduce((sum, row) => sum + (Number(getPurchasePrice(row)) || 0), 0)
  const delayedRows = rows.filter((row) => ['Delayed', 'Blocked'].includes(row.report?.riskStatus || '') || daysSince(getLastUpdatedAt(row)) >= 10)

  const financeMixBase = [
    { key: 'cash', label: 'Cash', count: 0, value: 0, color: FINANCE_COLOR_MAP.cash },
    { key: 'bond', label: 'Bond', count: 0, value: 0, color: FINANCE_COLOR_MAP.bond },
    { key: 'combination', label: 'Hybrid', count: 0, value: 0, color: FINANCE_COLOR_MAP.combination },
    { key: 'unknown', label: 'Unknown', count: 0, value: 0, color: FINANCE_COLOR_MAP.unknown },
  ]

  rows.forEach((row) => {
    const key = normalizeFinanceType(row?.transaction?.finance_type)
    const target = financeMixBase.find((item) => item.key === key)
    if (target) {
      target.count += 1
      target.value += Number(getPurchasePrice(row)) || 0
    }
  })

  const financeMix = financeMixBase.map((segment) => ({
    ...segment,
    share: totalUnits ? (segment.count / totalUnits) * 100 : 0,
  }))
  const financeDonut = buildDonutGradient(financeMix)

  const stageRows = MAIN_STAGE_ORDER.map((stageKey) => ({
    key: stageKey,
    label: MAIN_STAGE_LABELS[stageKey],
    count: rows.filter((row) => getMainStageKey(row) === stageKey).length,
  }))
    .filter((stage) => stage.count > 0)
    .sort((left, right) => right.count - left.count)

  const topSources = (marketingSummary?.sourceRows || []).slice(0, 5)
  const developmentMap = new Map()
  rows.forEach((row) => {
    const developmentName = row?.development?.name || 'Unknown development'
    const current = developmentMap.get(developmentName) || {
      label: developmentName,
      total: 0,
      active: 0,
      completed: 0,
    }
    current.total += 1
    if (!['AVAIL', 'REG'].includes(getMainStageKey(row))) current.active += 1
    if (getMainStageKey(row) === 'REG') current.completed += 1
    developmentMap.set(developmentName, current)
  })
  const developmentRows = [...developmentMap.values()].sort((left, right) => right.total - left.total).slice(0, 5)

  return (
    <section className="investor-print-page report-page-one">
      <header className="report-doc-head">
        <div>
          <p className="report-doc-eyebrow">bridge.</p>
          <h1>Bridge Portfolio Report</h1>
          <p className="report-doc-subtitle">{title} • {transactionScopeLabel}</p>
        </div>
        <div className="report-doc-head-meta">
          <span>Generated</span>
          <strong>{generatedAt}</strong>
        </div>
      </header>

      <div className="report-doc-body">
        <section className="report-doc-kpis">
          <article><span>Total Units</span><strong>{totalUnits}</strong></article>
          <article><span>Units in Transaction</span><strong>{activeRows.length}</strong></article>
          <article><span>Completed</span><strong>{completedRows.length}</strong></article>
          <article><span>Available</span><strong>{availableRows.length}</strong></article>
          <article><span>Pipeline Value</span><strong>{formatCurrency(pipelineValue)}</strong></article>
          <article><span>Conversion Rate</span><strong>{formatPercent(summary.totalTransactions ? ((summary.totalTransactions - availableRows.length) / summary.totalTransactions) * 100 : 0)}</strong></article>
        </section>

        <section className="report-doc-grid report-doc-grid-primary">
          <article className="report-doc-card">
            <header>
              <h3>Marketing & Lead Sources</h3>
              <span>{marketingSummary?.actualSpend ? 'Actual spend' : 'Estimated spend'}</span>
            </header>
            <div className="report-doc-mini-kpis">
              <div><span>Total Leads</span><strong>{marketingSummary?.totalLeads || 0}</strong></div>
              <div><span>Conversions</span><strong>{marketingSummary?.totalConverted || 0}</strong></div>
              <div><span>Cost per Lead</span><strong>{formatCurrency(marketingSummary?.costPerLead || 0)}</strong></div>
              <div><span>ROAS</span><strong>{formatRatio(marketingSummary?.spendUsed ? (marketingSummary.attributedRevenue || 0) / marketingSummary.spendUsed : 0)}</strong></div>
            </div>
            <div className="report-doc-source-list">
              {topSources.length ? (
                topSources.map((source) => (
                  <div key={source.key} className="report-doc-source-row">
                    <div>
                      <strong>{source.label}</strong>
                      <span>{source.leads} leads • {formatPercent(source.conversionRate)} conversion</span>
                    </div>
                    <div className="report-doc-source-bar">
                      <em style={{ width: `${Math.max(source.leadShare, 4)}%` }} />
                    </div>
                  </div>
                ))
              ) : (
                <p className="report-doc-empty">No lead-source data in the selected scope.</p>
              )}
            </div>
          </article>

          <article className="report-doc-card">
            <header>
              <h3>Portfolio Mix</h3>
              <span>{delayedRows.length} delayed / stuck</span>
            </header>
            <div className="report-doc-mix">
              <div className="report-doc-donut" style={{ background: financeDonut }} aria-hidden>
                <div />
              </div>
              <div className="report-doc-finance-list">
                {financeMix.map((segment) => (
                  <div key={segment.key} className="report-doc-finance-row">
                    <span className="swatch" style={{ backgroundColor: segment.color }} />
                    <div>
                      <strong>{segment.label}</strong>
                      <span>{segment.count} deals • {formatPercent(segment.share)}</span>
                    </div>
                    <em>{formatCurrency(segment.value)}</em>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </section>

        <section className="report-doc-grid report-doc-grid-secondary">
          <article className="report-doc-card">
            <header>
              <h3>Transaction Status Summary</h3>
              <span>{activeRows.length} live deals</span>
            </header>
            <div className="report-doc-stage-list">
              {stageRows.slice(0, 6).map((stage) => (
                <div key={stage.key} className="report-doc-stage-row">
                  <span>{stage.label}</span>
                  <div className="track"><em style={{ width: `${Math.max(totalUnits ? (stage.count / totalUnits) * 100 : 0, 4)}%` }} /></div>
                  <strong>{stage.count}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="report-doc-card">
            <header>
              <h3>Development Snapshot</h3>
              <span>Current portfolio spread</span>
            </header>
            <table className="report-doc-mini-table">
              <thead>
                <tr>
                  <th>Development</th>
                  <th>Total</th>
                  <th>Active</th>
                  <th>Done</th>
                </tr>
              </thead>
              <tbody>
                {developmentRows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{row.total}</td>
                    <td>{row.active}</td>
                    <td>{row.completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        </section>
      </div>

      <footer className="report-doc-foot">
        <span>Executive Summary</span>
        <span>Bridge Portfolio Report</span>
      </footer>
    </section>
  )
}

function PrintTransactionProgress({ row }) {
  const currentIndex = Math.max(getMainStageIndex(row), 0)

  return (
    <div className="report-doc-progress" aria-label="Transaction progress">
      {MAIN_STAGE_ORDER.map((stageKey, index) => {
        const state = index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'future'
        return (
          <div key={stageKey} className={`report-doc-progress-node ${state}`}>
            <span className="dot" />
            {index < MAIN_STAGE_ORDER.length - 1 ? <span className="line" /> : null}
          </div>
        )
      })}
    </div>
  )
}

function PrintTransactionsTable({ rows }) {
  return (
    <table className="report-doc-table">
      <thead>
        <tr>
          <th>Unit / Property</th>
          <th>Buyer</th>
          <th>Finance</th>
          <th>Current Stage</th>
          <th>Progress</th>
          <th>Latest Update</th>
          <th>Last Updated</th>
        </tr>
      </thead>
      <tbody>
        {rows.length ? (
          rows.map((row) => (
            <tr key={row.unit.id}>
              <td>
                <strong>{row.development?.name || 'Unknown development'}</strong>
                <span>Unit {row.unit?.unit_number || '-'}</span>
              </td>
              <td>{row.buyer?.name || 'No buyer linked'}</td>
              <td>{financeTypeShortLabel(row.transaction?.finance_type) || '-'}</td>
              <td>
                <strong>{normalizeStageLabel(row.stage)}</strong>
                <span>{getReportNextAction(row)}</span>
              </td>
              <td>
                <PrintTransactionProgress row={row} />
              </td>
              <td className="comment-cell">{getOverviewComment(row)}</td>
              <td>{formatShortDate(getLastUpdatedAt(row))}</td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={7}>No active transactions in the selected reporting scope.</td>
          </tr>
        )}
      </tbody>
    </table>
  )
}

function TransactionDetailPrintPage({ rows, generatedAt, title, transactionScopeLabel }) {
  return (
    <section className="investor-print-page report-page-two">
      <header className="report-doc-head">
        <div>
          <p className="report-doc-eyebrow">bridge.</p>
          <h1>Transaction Overview</h1>
          <p className="report-doc-subtitle">{title} • {transactionScopeLabel}</p>
        </div>
        <div className="report-doc-head-meta">
          <span>Generated</span>
          <strong>{generatedAt}</strong>
        </div>
      </header>

      <div className="report-doc-body report-doc-body-table">
        <section className="report-doc-card report-doc-card-table">
          <header>
            <h3>Active Transactions</h3>
            <span>{rows.length} live deals</span>
          </header>
          <PrintTransactionsTable rows={rows} />
        </section>
      </div>

      <footer className="report-doc-foot">
        <span>Transaction Overview</span>
        <span>Bridge Portfolio Report</span>
      </footer>
    </section>
  )
}

function formatCompactNumber(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return '0'
  }

  return new Intl.NumberFormat('en-ZA', {
    notation: Math.abs(numeric) >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(numeric) >= 1000 ? 1 : 0,
  }).format(numeric)
}

function formatRelativeDate(value) {
  if (!value) return 'No recent update'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'No recent update'
  const diffMs = Date.now() - parsed.getTime()
  const diffDays = Math.max(Math.floor(diffMs / (1000 * 60 * 60 * 24)), 0)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return '1 day ago'
  if (diffDays < 30) return `${diffDays} days ago`
  return parsed.toLocaleDateString()
}

function getLastUpdatedAt(row) {
  return row?.report?.stageDate || row?.transaction?.updated_at || row?.transaction?.created_at || null
}

function getCompletionDate(row) {
  if (getMainStageKey(row) !== 'REG') return null
  return row?.report?.stageDate || row?.transaction?.updated_at || row?.transaction?.created_at || null
}

function getCycleTimeDays(row) {
  const startedAt = row?.transaction?.created_at
  const completedAt = getCompletionDate(row)
  if (!startedAt || !completedAt) return null
  const start = new Date(startedAt).getTime()
  const end = new Date(completedAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  return Math.max(Math.round((end - start) / (1000 * 60 * 60 * 24)), 0)
}

function formatShortDate(value) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'
  return parsed.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })
}

function getProgressState(index, currentIndex) {
  if (index < currentIndex) return 'complete'
  if (index === currentIndex) return 'current'
  return 'future'
}

function KpiCard({ label, value, helper = '', trend = '', tone = 'default' }) {
  const toneClass =
    tone === 'warning'
      ? 'text-[#9a5b0f]'
      : tone === 'success'
        ? 'text-[#1e7a46]'
        : 'text-[#142132]'
  const valueSizeClass = String(value ?? '').length > 10 ? 'text-[clamp(1.75rem,2vw,2.35rem)]' : 'text-[clamp(2rem,2.4vw,2.65rem)]'

  return (
    <article className="rounded-[20px] border border-[#e5ebf3] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
      <span className="text-[0.82rem] font-semibold tracking-[-0.01em] text-[#72839a]">{label}</span>
      <strong className={`mt-3 block ${valueSizeClass} font-semibold leading-none tracking-[-0.05em] ${toneClass}`}>{value}</strong>
      {helper ? <p className="mt-2 min-h-[44px] text-[0.88rem] leading-6 text-[#6f8298]">{helper}</p> : null}
      {trend ? <p className="mt-2 text-xs font-medium text-[#5c738d]">{trend}</p> : null}
    </article>
  )
}

function ReportTypeToggle({ reportType, onChange }) {
  return (
    <div className="inline-flex flex-wrap items-center gap-2 rounded-[16px] border border-[#dde4ee] bg-[#f8fafc] p-1.5">
      {[
        { value: 'overview', label: 'Overview Table' },
        { value: 'unit_view', label: 'Unit View' },
      ].map((option) => (
        <button
          key={option.value}
          type="button"
          className={[
            'inline-flex min-h-[40px] items-center justify-center rounded-[12px] px-4 py-2 text-sm font-semibold transition duration-150 ease-out',
            reportType === option.value ? 'bg-[#35546c] text-white shadow-[0_10px_20px_rgba(15,23,42,0.08)]' : 'text-[#5f7288] hover:bg-white hover:text-[#162334]',
          ].join(' ')}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function StageProgressBar({ row }) {
  const currentIndex = Math.max(getMainStageIndex(row), 0)

  return (
    <div className="flex min-w-[180px] items-center gap-1" title={MAIN_STAGE_LABELS[getMainStageKey(row)] || row.stage}>
      {MAIN_STAGE_ORDER.map((stageKey, index) => {
        const state = getProgressState(index, currentIndex)
        const dotClass =
          state === 'complete'
            ? 'bg-[#35546c] ring-[#35546c]'
            : state === 'current'
              ? 'bg-[#24445d] ring-[#24445d]'
              : 'bg-[#d5dde7] ring-[#d5dde7]'
        const lineClass = index < currentIndex ? 'bg-[#35546c]' : 'bg-[#dbe4ee]'

        return (
          <div key={stageKey} className="flex flex-1 items-center gap-1 last:flex-none" title={MAIN_STAGE_LABELS[stageKey]}>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-white ${dotClass}`} />
            {index < MAIN_STAGE_ORDER.length - 1 ? <span className={`h-0.5 flex-1 rounded-full ${lineClass}`} /> : null}
          </div>
        )
      })}
    </div>
  )
}

function Sparkline({ values = [], stroke = '#35546c', fill = 'rgba(53,84,108,0.12)' }) {
  const safeValues = values.length ? values : [0]
  const max = Math.max(...safeValues, 1)
  const points = safeValues
    .map((value, index) => {
      const x = safeValues.length === 1 ? 100 : (index / (safeValues.length - 1)) * 100
      const y = 40 - (Number(value || 0) / max) * 32
      return `${x},${y}`
    })
    .join(' ')
  const areaPoints = `0,40 ${points} 100,40`

  return (
    <svg viewBox="0 0 100 40" className="h-14 w-full" preserveAspectRatio="none" aria-hidden>
      <polyline fill={fill} stroke="none" points={areaPoints} />
      <polyline fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={points} />
    </svg>
  )
}

function PipelineOverviewSection({ stageRows, bottleneckKey }) {
  const total = stageRows.reduce((sum, stage) => sum + stage.count, 0)

  return (
    <section className={SCREEN_PANEL_CLASS}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h4 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Pipeline Overview</h4>
          <p className="mt-2 text-sm leading-6 text-[#6b7d93]">See where active deals are sitting and which stage is absorbing the most volume.</p>
        </div>
        <span className="inline-flex shrink-0 whitespace-nowrap items-center rounded-full bg-[#f7f9fc] px-3 py-1 text-xs font-semibold text-[#5c738d] ring-1 ring-[#dde4ee]">
          {total} active deals in pipeline
        </span>
      </div>

      <div className="mt-6 rounded-[18px] bg-[#f8fafc] p-5 ring-1 ring-[#e6edf5]">
        <div className="flex h-4 overflow-hidden rounded-full bg-[#e6edf3]">
          {stageRows.map((stage, index) => {
            const width = total ? Math.max((stage.count / total) * 100, stage.count ? 6 : 0) : 0
            const active = stage.key === bottleneckKey
            return (
              <span
                key={stage.key}
                className="block h-full"
                style={{
                  width: `${width}%`,
                  backgroundColor: active ? '#d6a94d' : `rgba(53, 84, 108, ${Math.max(0.22, 0.92 - index * 0.12)})`,
                }}
                title={`${stage.label}: ${stage.count}`}
              />
            )
          })}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {stageRows.map((stage) => {
            const active = stage.key === bottleneckKey
            return (
              <div
                key={stage.key}
                className={`rounded-[16px] px-3.5 py-3.5 ring-1 ${
                  active ? 'bg-[#fff8ed] ring-[#f3d7a8]' : 'bg-white ring-[#e5ebf3]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[0.84rem] font-semibold leading-5 text-[#142132]">{stage.label}</span>
                  <strong className={`shrink-0 text-base font-semibold ${active ? 'text-[#9a5b0f]' : 'text-[#35546c]'}`}>{stage.count}</strong>
                </div>
                <p className="mt-2 text-[0.8rem] leading-5 text-[#6b7d93]">{total ? formatPercent((stage.count / total) * 100) : '0%'} of active pipeline</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function AttentionRequiredPanel({ items, onOpen }) {
  return (
    <section className={SCREEN_PANEL_CLASS}>
      <div className="flex flex-col gap-2">
        <h4 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Attention Required</h4>
        <p className="text-sm leading-6 text-[#6b7d93]">The highest-friction deals that need a decision or follow-up now.</p>
      </div>

      <div className="mt-6 space-y-3">
        {items.length ? (
          items.map((item) => (
            <button
              key={`${item.row.unit.id}-${item.kind}`}
              type="button"
              className="flex w-full items-center gap-4 rounded-[18px] bg-[#fffaf1] px-4 py-4 text-left ring-1 ring-[#f3d7a8] transition duration-150 ease-out hover:bg-[#fff5e3]"
              onClick={() => onOpen(item.row)}
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#fff1d6] text-[#b17017]">
                {item.kind === 'docs' ? <FileWarning size={18} /> : item.kind === 'stale' ? <Clock3 size={18} /> : <AlertTriangle size={18} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#142132]">
                  {item.row.development?.name} • Unit {item.row.unit?.unit_number}
                </p>
                <p className="mt-1 text-sm text-[#6b7d93]">{item.message}</p>
              </div>
              <span className="text-sm font-semibold text-[#9a5b0f]">View</span>
            </button>
          ))
        ) : (
          <div className="rounded-[18px] bg-[#f8fafc] px-4 py-5 text-sm text-[#6b7d93] ring-1 ring-[#e5ebf3]">
            No urgent issues in the current filter set.
          </div>
        )}
      </div>
    </section>
  )
}

function ActiveTransactionsSection({ rows, onOpen }) {
  return (
    <section className={SCREEN_PANEL_CLASS}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h4 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Active Transactions</h4>
          <p className="mt-2 text-sm leading-6 text-[#6b7d93]">Detailed operational view with stage progress, last touchpoint, and next action.</p>
        </div>
        <span className="inline-flex shrink-0 whitespace-nowrap items-center rounded-full bg-[#f7f9fc] px-3 py-1 text-xs font-semibold text-[#5c738d] ring-1 ring-[#dde4ee]">
          {rows.length} active rows
        </span>
      </div>

      <div className="mt-6 rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] p-3 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
        <div className="xl:hidden divide-y divide-[#edf2f7]">
          {rows.length ? (
            rows.map((row) => (
              <button
                key={row.unit.id}
                type="button"
                className="flex w-full flex-col gap-4 px-4 py-4 text-left transition duration-150 ease-out hover:bg-[#f8fafc]"
                onClick={() => onOpen(row)}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <strong className="block text-sm font-semibold text-[#142132]">{row.development?.name || 'Unknown development'}</strong>
                    <p className="mt-1 text-sm text-[#6b7d93]">Unit {row.unit?.unit_number} • {row.buyer?.name || 'No buyer linked'}</p>
                  </div>
                  <span className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold ${getRiskStatusClassName(row.report?.riskStatus || 'On Track')}`}>
                    {row.stage}
                  </span>
                </div>

                <div className="min-w-0">
                  <StageProgressBar row={row} />
                </div>

                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <div>
                    <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Status</span>
                    <p className="mt-1 text-sm leading-6 text-[#51657b]">
                      {trimText(getReportNextAction(row) || row.transaction?.next_action || row.report?.workflowComment || '-', 110)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                    <div className="text-sm text-[#142132]">
                      <div>{formatRelativeDate(getLastUpdatedAt(row))}</div>
                      <div className="mt-1 text-xs text-[#8aa0b8]">{formatShortDate(getLastUpdatedAt(row))}</div>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-[12px] bg-[#f7f9fc] px-3 py-2 text-sm font-semibold text-[#35546c] ring-1 ring-[#dde4ee]">
                      View
                      <ArrowUpRight size={14} />
                    </span>
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="px-4 py-10 text-center text-sm text-[#6b7d93]">No active transactions for the selected filters.</div>
          )}
        </div>

        <div className="hidden overflow-x-auto rounded-[18px] border border-[#e5edf5] bg-white xl:block">
          <table className="min-w-[1480px] text-left">
            <thead>
              <tr className="border-b border-[#edf2f7] text-xs uppercase tracking-[0.08em] text-[#7b8ca2]">
                <th className="min-w-[250px] px-6 py-5 font-semibold">Property / Unit</th>
                <th className="min-w-[180px] px-6 py-5 font-semibold">Buyer</th>
                <th className="min-w-[150px] px-6 py-5 font-semibold">Stage</th>
                <th className="min-w-[250px] px-6 py-5 font-semibold">Progress</th>
                <th className="min-w-[320px] px-6 py-5 font-semibold">Status</th>
                <th className="min-w-[130px] px-6 py-5 font-semibold">Last Updated</th>
                <th className="min-w-[120px] px-6 py-5 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.unit.id}
                  className="cursor-pointer border-b border-[#f1f5f9] transition duration-150 ease-out hover:bg-[#f8fafc]"
                  onClick={() => onOpen(row)}
                >
                  <td className="px-6 py-5 align-top">
                    <div>
                      <strong className="text-sm font-semibold text-[#142132]">{row.development?.name || 'Unknown development'}</strong>
                      <p className="mt-1 text-sm text-[#6b7d93]">Unit {row.unit?.unit_number}</p>
                    </div>
                  </td>
                  <td className="px-6 py-5 align-top text-sm text-[#142132]">{row.buyer?.name || 'No buyer linked'}</td>
                  <td className="px-6 py-5 align-top">
                    <span className={`inline-flex whitespace-nowrap items-center rounded-full border px-3 py-1 text-xs font-semibold ${getRiskStatusClassName(row.report?.riskStatus || 'On Track')}`}>
                      {row.stage}
                    </span>
                  </td>
                  <td className="px-6 py-5 align-top">
                    <StageProgressBar row={row} />
                  </td>
                  <td className="px-6 py-5 align-top text-sm leading-6 text-[#51657b]">
                    {trimText(getReportNextAction(row) || row.transaction?.next_action || row.report?.workflowComment || '-', 96)}
                  </td>
                  <td className="px-6 py-5 align-top">
                    <div className="text-sm text-[#142132]">{formatRelativeDate(getLastUpdatedAt(row))}</div>
                    <div className="mt-1 text-xs text-[#8aa0b8]">{formatShortDate(getLastUpdatedAt(row))}</div>
                  </td>
                  <td className="px-6 py-5 align-top">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-[12px] bg-[#f7f9fc] px-3 py-2 text-sm font-semibold text-[#35546c] ring-1 ring-[#dde4ee] transition duration-150 ease-out hover:bg-white"
                      onClick={(event) => {
                        event.stopPropagation()
                        onOpen(row)
                      }}
                    >
                      View
                      <ArrowUpRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-[#6b7d93]">
                    No active transactions for the selected filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function FunnelAndFinanceSection({ funnelRows, financeMix, financeDonut, totalRows }) {
  const totalFinanceValue = financeMix.reduce((sum, segment) => sum + (Number(segment.value) || 0), 0)
  const cashShare = Math.round(financeMix.find((segment) => segment.key === 'cash')?.share || 0)
  const bondShare = Math.round(financeMix.find((segment) => segment.key === 'bond')?.share || 0)
  const hybridDeals = financeMix.find((segment) => segment.key === 'combination')?.count || 0
  const averageDealValue = totalRows ? totalFinanceValue / totalRows : 0

  return (
    <section className="grid items-stretch gap-4 xl:grid-cols-2">
      <article className="flex h-full flex-col rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h4 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Transaction Funnel</h4>
            <p className="mt-2 text-[0.96rem] leading-7 text-[#6b7d93]">Track deal compression through the operating stages so drop-off becomes visible before revenue slips.</p>
          </div>
          <span className="inline-flex shrink-0 whitespace-nowrap items-center gap-2 rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]">
            <TrendingUp size={12} />
            {totalRows} tracked rows
          </span>
        </div>

        <div className="flex flex-1 flex-col divide-y divide-[#edf2f7]">
          {funnelRows.map((stage) => (
            <div key={stage.stageKey} className="grid gap-3 py-4 md:grid-cols-[170px_minmax(0,1fr)_96px] md:items-center">
              <div className="min-w-0">
                <div className="text-[0.98rem] font-medium tracking-[-0.02em] text-[#23384d]">{stage.label}</div>
                <p className="mt-1 text-[0.88rem] text-[#6b7d93]">
                  {stage.count} deals • {formatPercent(stage.share)} of total
                </p>
              </div>
              <div className="h-3 w-full rounded-full bg-[#e7eef6]" aria-hidden>
                <span className="block h-full rounded-full bg-[#5c82a3]" style={{ width: `${Math.max(stage.share, stage.count ? 3 : 0)}%` }} />
              </div>
              <div className="flex flex-col items-end text-right">
                <div className="flex items-baseline gap-2 leading-none">
                  <strong className="text-[0.98rem] font-semibold text-[#142132]">{stage.count}</strong>
                  <em className="text-[0.78rem] not-italic font-medium text-[#6b7d93]">{formatPercent(stage.share)}</em>
                </div>
                <small className="mt-1 text-[0.74rem] leading-none text-[#8da0b5]">
                  {stage.dropOff > 0 ? `${formatPercent(stage.dropOff)} drop` : 'No drop'}
                </small>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="flex h-full flex-col rounded-[22px] border border-[#dde4ee] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h4 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Cash vs Bond</h4>
            <p className="mt-1.5 text-[0.88rem] leading-5 text-[#6b7d93]">Read the portfolio funding mix at a glance to understand where cash exposure and bank-dependency are building.</p>
          </div>
          <span className="inline-flex shrink-0 whitespace-nowrap items-center gap-2 rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-2.5 py-1 text-[0.72rem] font-semibold text-[#66758b]">
            <PieChart size={12} />
            {totalRows} active deals
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-[152px_minmax(0,1fr)] lg:items-center">
          <div className="relative mx-auto h-[152px] w-[152px] rounded-full" style={{ background: financeDonut }} aria-hidden="true">
            <div className="absolute inset-[30px] rounded-full bg-white" />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <strong className="text-[1.55rem] font-semibold tracking-[-0.04em] text-[#142132]">{totalRows}</strong>
              <span className="mt-1 text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Active</span>
            </div>
          </div>

          <ul className="grid gap-2">
            {financeMix.map((segment) => (
              <li key={segment.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-3.5 py-2">
                <span className="h-3 w-3 rounded-full" style={{ background: segment.color }} />
                <div className="min-w-0">
                  <strong className="block text-[0.9rem] font-semibold text-[#142132]">{segment.label}</strong>
                  <small className="block text-[0.78rem] text-[#7c8ea4]">{formatCurrency(segment.value || 0)}</small>
                </div>
                <div className="text-right">
                  <em className="block text-[0.94rem] not-italic font-semibold text-[#35546c]">{segment.count}</em>
                  <small className="block text-[0.76rem] text-[#8aa0b8]">{formatPercent(segment.share)}</small>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <section className="mt-4 rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-3.5">
          <div className="mb-2.5">
            <strong className="block text-[0.92rem] font-semibold text-[#142132]">Finance Snapshot</strong>
            <span className="text-[0.78rem] text-[#7c8ea4]">Current funding mix at a glance</span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <article className="rounded-[16px] border border-[#e3ebf4] bg-white px-3.5 py-3">
              <span className="block text-[0.76rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Cash Share</span>
              <strong className="mt-1.5 block text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">{cashShare}%</strong>
            </article>
            <article className="rounded-[16px] border border-[#e3ebf4] bg-white px-3.5 py-3">
              <span className="block text-[0.76rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Bond Share</span>
              <strong className="mt-1.5 block text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">{bondShare}%</strong>
            </article>
            <article className="rounded-[16px] border border-[#e3ebf4] bg-white px-3.5 py-3">
              <span className="block text-[0.76rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Hybrid Deals</span>
              <strong className="mt-1.5 block text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">{hybridDeals}</strong>
            </article>
            <article className="rounded-[16px] border border-[#e3ebf4] bg-white px-3.5 py-3">
              <span className="block text-[0.76rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Avg Deal Value</span>
              <strong className="mt-1.5 block text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">{formatCurrency(averageDealValue || 0)}</strong>
            </article>
          </div>
        </section>
      </article>
    </section>
  )
}

function RankedBars({ items, valueLabel, emptyText }) {
  const max = Math.max(...items.map((item) => item.value), 1)

  return items.length ? (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-[#4f647a]">{item.label}</span>
            <strong className="font-semibold text-[#142132]">{valueLabel(item.value, item)}</strong>
          </div>
          <div className="mt-2 h-2 rounded-full bg-[#e8eef5]" aria-hidden>
            <span className="block h-full rounded-full bg-[linear-gradient(90deg,#35546c_0%,#7fa7cc_100%)]" style={{ width: `${Math.max((item.value / max) * 100, item.value ? 6 : 0)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-[#6b7d93]">{emptyText}</p>
  )
}

function PerformanceSnapshotSection({ developmentRows, ownerRows }) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <section className={SCREEN_PANEL_CLASS}>
        <h4 className="text-[1.04rem] font-semibold tracking-[-0.025em] text-[#142132]">Performance Snapshot</h4>
        <p className="mt-2 text-sm leading-6 text-[#6b7d93]">Quick breakdown of transaction volume by development.</p>
        <div className="mt-6">
          <RankedBars
            items={developmentRows}
            valueLabel={(value, item) => `${value} deals${item.revenue ? ` • ${formatCurrency(item.revenue)}` : ''}`}
            emptyText="No development activity for the selected filters."
          />
        </div>
      </section>

      <section className={SCREEN_PANEL_CLASS}>
        <h4 className="text-[1.04rem] font-semibold tracking-[-0.025em] text-[#142132]">Team Load</h4>
        <p className="mt-2 text-sm leading-6 text-[#6b7d93]">Transactions currently associated with agents, attorneys, or bond originators.</p>
        <div className="mt-6">
          <RankedBars
            items={ownerRows}
            valueLabel={(value) => `${value} deals`}
            emptyText="No team assignment data available in this slice."
          />
        </div>
      </section>
    </section>
  )
}

function TrendsSection({ closedSeries, cycleSeries }) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <section className={SCREEN_PANEL_CLASS}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-[1.04rem] font-semibold tracking-[-0.025em] text-[#142132]">Deals Closed Over Time</h4>
            <p className="mt-2 text-sm leading-6 text-[#6b7d93]">Monthly registered transactions across the visible report set.</p>
          </div>
          <TrendingUp className="text-[#35546c]" size={18} />
        </div>
        <div className="mt-6">
          <Sparkline values={closedSeries.map((item) => item.value)} />
          <div className="mt-3 flex justify-between text-xs text-[#8aa0b8]">
            {closedSeries.map((item) => (
              <span key={item.label}>{item.label}</span>
            ))}
          </div>
        </div>
      </section>

      <section className={SCREEN_PANEL_CLASS}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-[1.04rem] font-semibold tracking-[-0.025em] text-[#142132]">Average Time to Close Trend</h4>
            <p className="mt-2 text-sm leading-6 text-[#6b7d93]">Average close cycle in days for registered transactions by month.</p>
          </div>
          <Clock3 className="text-[#35546c]" size={18} />
        </div>
        <div className="mt-6">
          <Sparkline values={cycleSeries.map((item) => item.value)} stroke="#1d7b52" fill="rgba(29,123,82,0.12)" />
          <div className="mt-3 flex justify-between text-xs text-[#8aa0b8]">
            {cycleSeries.map((item) => (
              <span key={item.label}>{item.label}</span>
            ))}
          </div>
        </div>
      </section>
    </section>
  )
}

function DocumentInsightsSection({ completionRate, averageMissing, topMissing }) {
  return (
    <section className={SCREEN_PANEL_CLASS}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h4 className="text-[1.04rem] font-semibold tracking-[-0.025em] text-[#142132]">Document Insights</h4>
          <p className="mt-2 text-sm leading-6 text-[#6b7d93]">Where document friction is showing up most often in the current portfolio.</p>
        </div>
        <FileWarning className="text-[#35546c]" size={18} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-[18px] bg-[#fbfcfe] px-4 py-4 ring-1 ring-[#e3ebf4]">
          <span className="block text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Checklist Completion</span>
          <strong className="mt-2 block text-[1.2rem] font-semibold text-[#142132]">{formatPercent(completionRate)}</strong>
        </article>
        <article className="rounded-[18px] bg-[#fbfcfe] px-4 py-4 ring-1 ring-[#e3ebf4]">
          <span className="block text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Avg Missing Docs</span>
          <strong className="mt-2 block text-[1.2rem] font-semibold text-[#142132]">{averageMissing.toFixed(1)}</strong>
        </article>
        <article className="rounded-[18px] bg-[#fbfcfe] px-4 py-4 ring-1 ring-[#e3ebf4] md:col-span-2 xl:col-span-1">
          <span className="block text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Most Frequent Gap</span>
          <strong className="mt-2 block text-[1.2rem] font-semibold text-[#142132]">{topMissing[0]?.label || 'No missing documents'}</strong>
        </article>
      </div>

      <div className="mt-6">
        <RankedBars
          items={topMissing.map((item) => ({ ...item, value: item.count }))}
          valueLabel={(value) => `${value} missing`}
          emptyText="No missing document trends available."
        />
      </div>
    </section>
  )
}

function ReportView({ reportType, reportTypeLabel, title, transactionScopeLabel, generatedAt, summary, rows, marketingSummary, onReportTypeChange, filtersPanel = null }) {
  const navigate = useNavigate()
  const activeRows = useMemo(() => rows.filter((row) => !['AVAIL', 'REG'].includes(getMainStageKey(row))), [rows])

  const dashboardData = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const stuckThresholdDays = 10
    const registeredRows = rows.filter((row) => getMainStageKey(row) === 'REG')
    const completedMtd = registeredRows.filter((row) => {
      const completedAt = getCompletionDate(row)
      if (!completedAt) return false
      return new Date(completedAt) >= monthStart
    }).length
    const stuckRows = activeRows.filter((row) => daysSince(getLastUpdatedAt(row)) >= stuckThresholdDays)
    const cycleTimes = registeredRows.map(getCycleTimeDays).filter((value) => Number.isFinite(value))
    const avgTimeToClose = cycleTimes.length ? Math.round(cycleTimes.reduce((sum, value) => sum + value, 0) / cycleTimes.length) : 0
    const conversionRate = rows.length ? ((rows.length - rows.filter((row) => getMainStageKey(row) === 'AVAIL').length) / rows.length) * 100 : 0
    const pipelineValue = activeRows.reduce((sum, row) => sum + (Number(getPurchasePrice(row)) || 0), 0)

    const activeStageRows = MAIN_STAGE_ORDER.filter((stageKey) => !['AVAIL', 'REG'].includes(stageKey)).map((stageKey) => ({
      key: stageKey,
      label: MAIN_STAGE_LABELS[stageKey],
      count: activeRows.filter((row) => getMainStageKey(row) === stageKey).length,
    }))
    const bottleneck = [...activeStageRows].sort((left, right) => right.count - left.count)[0]?.key || ''

    const attentionRows = rows
      .map((row) => {
        const daysSinceUpdate = daysSince(getLastUpdatedAt(row))
        const missingCount = Number(row?.checklistSummary?.missingCount || 0)
        const riskStatus = String(row?.report?.riskStatus || '').toLowerCase()

        if (riskStatus.includes('blocked')) {
          return { row, severity: 3, kind: 'risk', message: `Blocked stage with ${missingCount} missing documents.` }
        }
        if (daysSinceUpdate >= stuckThresholdDays) {
          return { row, severity: 2, kind: 'stale', message: `No update for ${daysSinceUpdate} days.` }
        }
        if (missingCount > 0 && getMainStageKey(row) !== 'AVAIL') {
          return { row, severity: 1, kind: 'docs', message: `${missingCount} required documents still missing.` }
        }
        return null
      })
      .filter(Boolean)
      .sort((left, right) => right.severity - left.severity)
      .slice(0, 6)

    const developmentMap = new Map()
    const ownerMap = new Map()
    rows.forEach((row) => {
      const developmentName = row?.development?.name || 'Unknown development'
      const currentDevelopment = developmentMap.get(developmentName) || { label: developmentName, value: 0, revenue: 0 }
      currentDevelopment.value += 1
      currentDevelopment.revenue += Number(getPurchasePrice(row)) || 0
      developmentMap.set(developmentName, currentDevelopment)

      const ownerCandidates = [
        row?.transaction?.agent,
        row?.transaction?.attorney,
        row?.transaction?.bond_originator,
      ].filter(Boolean)
      ownerCandidates.forEach((name) => {
        const owner = ownerMap.get(name) || { label: name, value: 0 }
        owner.value += 1
        ownerMap.set(name, owner)
      })
    })

    const developmentRows = [...developmentMap.values()].sort((left, right) => right.value - left.value).slice(0, 5)
    const ownerRows = [...ownerMap.values()].sort((left, right) => right.value - left.value).slice(0, 5)

    const funnelRows = MAIN_STAGE_ORDER.map((stageKey, index) => {
      const count = rows.filter((row) => getMainStageKey(row) === stageKey).length
      const share = rows.length ? (count / rows.length) * 100 : 0
      const previousCount = index > 0 ? rows.filter((row) => getMainStageKey(row) === MAIN_STAGE_ORDER[index - 1]).length : count
      const dropOff = index > 0 && previousCount ? ((previousCount - count) / previousCount) * 100 : 0
      return {
        stageKey,
        label: MAIN_STAGE_LABELS[stageKey],
        count,
        share,
        dropOff,
      }
    })

    const financeMixBase = [
      { key: 'cash', label: 'Cash', count: 0, value: 0, color: FINANCE_COLOR_MAP.cash },
      { key: 'bond', label: 'Bond', count: 0, value: 0, color: FINANCE_COLOR_MAP.bond },
      { key: 'combination', label: 'Combination', count: 0, value: 0, color: FINANCE_COLOR_MAP.combination },
      { key: 'unknown', label: 'Unknown', count: 0, value: 0, color: FINANCE_COLOR_MAP.unknown },
    ]
    rows.forEach((row) => {
      const key = normalizeFinanceType(row?.transaction?.finance_type)
      const target = financeMixBase.find((item) => item.key === key)
      if (target) {
        target.count += 1
        target.value += Number(getPurchasePrice(row)) || 0
      }
    })
    const financeMix = financeMixBase.map((segment) => ({
      ...segment,
      share: rows.length ? (segment.count / rows.length) * 100 : 0,
    }))
    const financeDonut = buildDonutGradient(financeMix)

    const closedSeries = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1)
      const nextDate = new Date(date.getFullYear(), date.getMonth() + 1, 1)
      const value = registeredRows.filter((row) => {
        const completedAt = getCompletionDate(row)
        if (!completedAt) return false
        const completedDate = new Date(completedAt)
        return completedDate >= date && completedDate < nextDate
      }).length
      return {
        label: date.toLocaleDateString('en-ZA', { month: 'short' }),
        value,
      }
    })

    const cycleSeries = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1)
      const nextDate = new Date(date.getFullYear(), date.getMonth() + 1, 1)
      const matchingRows = registeredRows.filter((row) => {
        const completedAt = getCompletionDate(row)
        if (!completedAt) return false
        const completedDate = new Date(completedAt)
        return completedDate >= date && completedDate < nextDate
      })
      const seriesCycleTimes = matchingRows.map(getCycleTimeDays).filter((value) => Number.isFinite(value))
      return {
        label: date.toLocaleDateString('en-ZA', { month: 'short' }),
        value: seriesCycleTimes.length ? Math.round(seriesCycleTimes.reduce((sum, value) => sum + value, 0) / seriesCycleTimes.length) : 0,
      }
    })

    const totalRequired = rows.reduce((sum, row) => sum + Number(row?.checklistSummary?.totalRequired || 0), 0)
    const totalUploaded = rows.reduce((sum, row) => sum + Number(row?.checklistSummary?.uploadedCount || 0), 0)
    const totalMissing = rows.reduce((sum, row) => sum + Number(row?.checklistSummary?.missingCount || 0), 0)
    const missingMap = new Map()
    rows.forEach((row) => {
      ;(row?.requiredChecklist || []).forEach((item) => {
        if (!item.complete) {
          const current = missingMap.get(item.label) || 0
          missingMap.set(item.label, current + 1)
        }
      })
    })
    const topMissing = [...missingMap.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 5)

    return {
      completedMtd,
      stuckRows,
      avgTimeToClose,
      conversionRate,
      pipelineValue,
      activeStageRows,
      bottleneck,
      attentionRows,
      funnelRows,
      financeMix,
      financeDonut,
      developmentRows,
      ownerRows,
      closedSeries,
      cycleSeries,
      documentInsights: {
        completionRate: totalRequired ? (totalUploaded / totalRequired) * 100 : 0,
        averageMissing: rows.length ? totalMissing / rows.length : 0,
        topMissing,
      },
    }
  }, [activeRows, rows])

  function openRow(row) {
    navigate(`/units/${row.unit.id}`)
  }

  return (
    <section className="space-y-6">
      <section className="report-export-shell investor-print-book hidden print:block">
        <ExecutivePrintPage
          title={title}
          transactionScopeLabel={transactionScopeLabel}
          generatedAt={generatedAt}
          summary={summary}
          rows={rows}
          marketingSummary={marketingSummary}
        />
        <TransactionDetailPrintPage rows={activeRows} generatedAt={generatedAt} title={title} transactionScopeLabel={transactionScopeLabel} />
      </section>

      <div className="space-y-5 print:hidden">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <KpiCard label="Active Transactions" value={formatCompactNumber(activeRows.length)} helper="Live deals currently in motion" />
          <KpiCard label="Completed (MTD)" value={formatCompactNumber(dashboardData.completedMtd)} helper="Registered this month" tone="success" />
          <KpiCard label="Deals Stuck" value={formatCompactNumber(dashboardData.stuckRows.length)} helper="No update in 10+ days" tone={dashboardData.stuckRows.length ? 'warning' : 'default'} />
          <KpiCard label="Avg Time to Close" value={`${dashboardData.avgTimeToClose || 0}d`} helper="Average cycle time for closed deals" />
          <KpiCard label="Conversion Rate" value={formatPercent(dashboardData.conversionRate)} helper="Transactions moved beyond available" />
          <KpiCard label="Pipeline Value" value={formatCurrency(dashboardData.pipelineValue)} helper="Value still sitting in the active pipeline" />
        </section>

        <section className="space-y-5">
          {filtersPanel}
          <PipelineOverviewSection stageRows={dashboardData.activeStageRows} bottleneckKey={dashboardData.bottleneck} />
          <FunnelAndFinanceSection
            funnelRows={dashboardData.funnelRows}
            financeMix={dashboardData.financeMix}
            financeDonut={dashboardData.financeDonut}
            totalRows={rows.length}
          />
          <ActiveTransactionsSection rows={activeRows} onOpen={openRow} />
          <MarketingPerformanceSection marketingSummary={marketingSummary} />
        </section>
      </div>

      <footer className="text-center text-sm text-[#7b8ca2] print:hidden">Generated by bridge. Sales Platform</footer>
    </section>
  )
}

export default ReportView
