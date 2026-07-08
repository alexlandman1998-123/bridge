import {
  BriefcaseBusiness,
  Landmark,
  PieChart,
  WalletCards,
} from 'lucide-react'

const PARTNER_COLORS = ['#1769d1', '#16894f', '#df7b14', '#7657d8', '#0f766e', '#b42318']
const FINANCE_COLORS = {
  cash: '#1769d1',
  bond: '#16894f',
  hybrid: '#df7b14',
  unknown: '#94a3b8',
}

const countFormatter = new Intl.NumberFormat('en-ZA')
const compactCurrencyFormatter = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

function toNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function formatCount(value) {
  return countFormatter.format(Math.max(0, Math.round(toNumber(value))))
}

function formatCurrencyCompact(value) {
  const numeric = toNumber(value)
  if (numeric <= 0) return 'R0'
  return compactCurrencyFormatter.format(numeric).replace('ZAR', 'R')
}

function formatCountWithShare(count, share) {
  return `${formatCount(count)} (${Math.round(toNumber(share))}%)`
}

function getDistributionItems(section = {}, colorMap = null) {
  return (Array.isArray(section?.items) ? section.items : [])
    .map((item, index) => ({
      ...item,
      count: toNumber(item.count ?? item.value),
      percentage: toNumber(item.percentage),
      color: item.isUnassigned
        ? '#94a3b8'
        : colorMap?.[item.key] || PARTNER_COLORS[index % PARTNER_COLORS.length],
    }))
    .filter((item) => item.count > 0)
}

function buildConicGradient(items = []) {
  const total = items.reduce((sum, item) => sum + item.count, 0)
  if (!total) return '#edf2f7'

  let cursor = 0
  const stops = items.map((item) => {
    const start = cursor
    const share = (item.count / total) * 100
    cursor += share
    return `${item.color} ${start}% ${cursor}%`
  })
  return `conic-gradient(${stops.join(', ')})`
}

function getTopLabel(section = {}) {
  if (section?.topPartner?.label) return section.topPartner.label
  const firstAssigned = (Array.isArray(section?.rawItems) ? section.rawItems : []).find((item) => !item.isUnassigned)
  return firstAssigned?.label || 'None yet'
}

function getConcentrationLabel(section = {}) {
  const share = toNumber(section?.topPartnerSharePercent)
  if (!share) return 'No leader yet'
  if (share >= 50) return `High (${share}%)`
  if (share >= 30) return `Moderate (${share}%)`
  return `Balanced (${share}%)`
}

function getDominantFinanceLabel(section = {}) {
  const dominant = section?.dominantBucket
  if (!dominant?.label) return 'None yet'
  return `${dominant.label} (${toNumber(section?.dominantBucketSharePercent)}%)`
}

function StatChip({ label, value }) {
  return (
    <div className="min-w-0 rounded-[14px] border border-[#e3ebf5] bg-[#fbfdff] px-3 py-2">
      <p className="truncate text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#75889f]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[#10243a]" title={String(value || '-')}>{value || '-'}</p>
    </div>
  )
}

function PanelSummaryMetric({ label, value, tone = 'default' }) {
  const toneClass = tone === 'attention'
    ? 'border-[#f4d3a4] bg-[#fff8ef] text-[#8a4b0f]'
    : tone === 'good'
      ? 'border-[#c8ead5] bg-[#f2fbf5] text-[#0d7540]'
      : 'border-[#dbe6f2] bg-white text-[#10243a]'
  return (
    <div className={`min-w-0 rounded-[14px] border px-3 py-2 ${toneClass}`}>
      <p className="truncate text-[0.68rem] font-semibold uppercase tracking-[0.1em] opacity-70">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold" title={String(value || '-')}>{value || '-'}</p>
    </div>
  )
}

function DistributionDonut({ title, items = [], total = 0, emptyLabel = 'No deals' }) {
  const hasItems = items.length && total > 0
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center xl:grid-cols-1 2xl:grid-cols-[158px_minmax(0,1fr)]">
      <div
        className="mx-auto grid h-36 w-36 shrink-0 place-items-center rounded-full shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)]"
        style={{ background: hasItems ? buildConicGradient(items) : '#edf2f7' }}
        role="img"
        aria-label={`${title}: ${formatCount(total)} deals`}
      >
        <div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center shadow-[0_8px_20px_rgba(15,23,42,0.08)]">
          <span>
            <span className="block text-2xl font-semibold tracking-[-0.04em] text-[#10243a]">{formatCount(total)}</span>
            <span className="block text-[0.68rem] font-semibold text-[#6f839a]">{hasItems ? 'Deals' : emptyLabel}</span>
          </span>
        </div>
      </div>

      <div className="min-w-0 space-y-2.5">
        {hasItems ? items.map((item) => (
          <div key={item.key || item.label} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-[#405870]">
              <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="min-w-0 truncate" title={item.label}>{item.label}</span>
            </span>
            <span className="shrink-0 text-right text-sm font-semibold text-[#10243a]">
              {formatCount(item.count)}
              <span className="ml-1 text-xs font-medium text-[#7890a8]">{Math.round(item.percentage)}%</span>
            </span>
          </div>
        )) : (
          <div className="rounded-[14px] border border-dashed border-[#d4dfeb] bg-[#fbfdff] px-4 py-5 text-sm font-medium text-[#647a92]">
            No partner distribution data yet.
          </div>
        )}
      </div>
    </div>
  )
}

function PartnerDistributionCard({ title, icon: Icon, section = {}, helper }) {
  const items = getDistributionItems(section)
  const totalDeals = toNumber(section?.totalDeals)
  return (
    <article className="min-w-0 rounded-[18px] border border-[#dfe7f0] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.045)] sm:p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold tracking-[-0.025em] text-[#10243a]">{title}</h3>
          {helper ? <p className="mt-1 truncate text-sm text-[#667085]">{helper}</p> : null}
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#eef6ff] text-[#1769d1]">
          <Icon size={18} />
        </span>
      </div>

      <div className="mt-5">
        <DistributionDonut title={title} items={items} total={totalDeals} />
      </div>

      <div className="mt-5 grid min-w-0 gap-2 sm:grid-cols-2">
        <StatChip label="Coverage" value={`${toNumber(section?.assignmentCoveragePercent)}%`} />
        <StatChip label="Assigned" value={formatCount(section?.assignedDeals)} />
        <StatChip label="Unassigned" value={formatCountWithShare(section?.unassignedDeals, section?.unassignedPercent)} />
        <StatChip label="Value" value={formatCurrencyCompact(section?.totalDealValue)} />
        <StatChip label="Top" value={getTopLabel(section)} />
        <StatChip label="Top Share" value={getConcentrationLabel(section)} />
      </div>
    </article>
  )
}

function FinanceMixCard({ section = {} }) {
  const items = getDistributionItems(section, FINANCE_COLORS)
  const totalDeals = toNumber(section?.totalDeals)
  return (
    <article className="min-w-0 rounded-[18px] border border-[#dfe7f0] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.045)] sm:p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold tracking-[-0.025em] text-[#10243a]">Finance Mix</h3>
          <p className="mt-1 truncate text-sm text-[#667085]">Cash, bond and hybrid split.</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#fff7ea] text-[#df7b14]">
          <WalletCards size={18} />
        </span>
      </div>

      <div className="mt-5">
        <DistributionDonut title="Finance Mix" items={items} total={totalDeals} />
      </div>

      <div className="mt-5 grid min-w-0 gap-2 sm:grid-cols-2">
        <StatChip label="Cash" value={formatCountWithShare(section?.cashDeals, section?.cashSharePercent)} />
        <StatChip label="Bond" value={formatCountWithShare(section?.bondDeals, section?.bondSharePercent)} />
        <StatChip label="Hybrid" value={formatCountWithShare(section?.hybridDeals, section?.hybridSharePercent)} />
        <StatChip label="Unknown" value={formatCountWithShare(section?.unknownDeals, section?.unknownSharePercent)} />
        <StatChip label="Value" value={formatCurrencyCompact(section?.totalDealValue)} />
        <StatChip label="Dominant" value={getDominantFinanceLabel(section)} />
      </div>
    </article>
  )
}

export default function PartnerBusinessDistributionPanel({ distribution = {}, scope = 'principal', className = '' }) {
  const totalTransactions = toNumber(distribution?.meta?.totalTransactions || distribution?.financeMix?.totalDeals)
  const scopeLabel = scope === 'agent' ? 'Agent' : 'Company'
  const attorneyUnassigned = toNumber(distribution?.attorneys?.unassignedDeals)
  const originatorUnassigned = toNumber(distribution?.bondOriginators?.unassignedDeals)

  return (
    <section className={`min-w-0 rounded-[20px] border border-[#dfe7f0] bg-[#f8fbff] p-4 shadow-[0_18px_44px_rgba(15,23,42,0.045)] sm:p-5 ${className}`}>
      <div className="flex min-w-0 flex-col gap-3 border-b border-[#e5edf6] pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#dbe6f2] bg-white px-3 py-1 text-xs font-semibold text-[#526981]">
            <PieChart size={14} />
            {scopeLabel} distribution
          </div>
          <h2 className="mt-3 text-[1.08rem] font-semibold tracking-[-0.025em] text-[#10243a]">Partner Business Distribution</h2>
          <p className="mt-1 text-sm text-[#667085]">
            Deals sent to attorneys and bond originators across the selected dashboard scope.
          </p>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-[repeat(5,minmax(112px,1fr))] lg:max-w-[720px]">
          <PanelSummaryMetric label="Deals Analysed" value={formatCount(totalTransactions)} />
          <PanelSummaryMetric label="Attorney Cover" value={`${toNumber(distribution?.attorneys?.assignmentCoveragePercent)}%`} tone={attorneyUnassigned ? 'attention' : 'good'} />
          <PanelSummaryMetric label="Originator Cover" value={`${toNumber(distribution?.bondOriginators?.assignmentCoveragePercent)}%`} tone={originatorUnassigned ? 'attention' : 'good'} />
          <PanelSummaryMetric label="Hybrid Share" value={`${toNumber(distribution?.financeMix?.hybridSharePercent)}%`} />
          <PanelSummaryMetric label="Deal Value" value={formatCurrencyCompact(distribution?.financeMix?.totalDealValue)} />
        </div>
      </div>

      <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-3">
        <PartnerDistributionCard
          title="Attorney Distribution"
          helper="Transfer attorney allocation."
          icon={BriefcaseBusiness}
          section={distribution?.attorneys}
        />
        <PartnerDistributionCard
          title="Bond Originator Distribution"
          helper="Bond partner allocation."
          icon={Landmark}
          section={distribution?.bondOriginators}
        />
        <FinanceMixCard section={distribution?.financeMix} />
      </div>

      {!totalTransactions ? (
        <div className="mt-4 rounded-[16px] border border-dashed border-[#d4dfeb] bg-white px-4 py-5 text-sm font-medium text-[#647a92]">
          Partner distribution will populate as transactions are assigned.
        </div>
      ) : null}
    </section>
  )
}
