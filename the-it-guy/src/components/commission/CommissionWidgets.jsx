import {
  BadgePercent,
  ChevronRight,
  CircleDollarSign,
  Handshake,
  Target,
  TrendingUp,
  UsersRound,
} from 'lucide-react'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

const compactCurrency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

function toNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function formatCurrency(value, { compact = false } = {}) {
  const amount = toNumber(value)
  return compact ? compactCurrency.format(amount).replace('ZAR', 'R') : currency.format(amount)
}

function formatPercent(value) {
  const numeric = toNumber(value)
  return `${numeric.toFixed(numeric % 1 ? 1 : 0)}%`
}

function getStatusClasses(tone = 'slate') {
  if (tone === 'green') return 'border-[#bfe8ce] bg-[#eefaf3] text-[#147a41]'
  if (tone === 'orange') return 'border-[#f0d9ae] bg-[#fff8ec] text-[#a35f06]'
  if (tone === 'red') return 'border-[#f1c8c8] bg-[#fff3f3] text-[#b42318]'
  return 'border-[#d8e3ee] bg-[#f7fafc] text-[#52657a]'
}

function getProgressTone(tone = 'green') {
  if (tone === 'orange') return 'bg-[#d88a16]'
  if (tone === 'red') return 'bg-[#d04444]'
  if (tone === 'purple') return 'bg-[#7c5cff]'
  return 'bg-[#108847]'
}

export function CommissionStatusBadge({ status, tone = 'slate' }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClasses(tone)}`}>
      {status || 'No status'}
    </span>
  )
}

export function CommissionProgressBar({ value = 0, tone = 'green', label = '' }) {
  const safeValue = Math.max(0, Math.min(100, Math.round(toNumber(value))))
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold text-[#52657a]">
        <span>{label || `${safeValue}% achieved`}</span>
        <span>{safeValue}%</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#e5edf5]">
        <span className={`block h-full rounded-full ${getProgressTone(tone)}`} style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  )
}

function SummaryCard({ icon: Icon, title, value, subtitle, rows = [], tone = 'green', actionLabel = 'Edit', onAction }) {
  const bubbleTone =
    tone === 'orange'
      ? 'bg-[#fff4e5] text-[#d87907]'
      : tone === 'purple'
        ? 'bg-[#f3efff] text-[#7657d8]'
        : tone === 'blue'
          ? 'bg-[#edf5ff] text-[#1769d1]'
          : 'bg-[#ecfdf3] text-[#16894f]'

  return (
    <article className="flex min-h-[184px] flex-col rounded-[16px] border border-[#dfe7f0] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.045)]">
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-11 w-11 place-items-center rounded-[15px] ${bubbleTone}`}>
          <Icon size={20} />
        </span>
      </div>
      <h3 className="mt-4 text-sm font-semibold text-[#101828]">{title}</h3>
      {value ? <p className="mt-2 text-[1.55rem] font-semibold leading-none tracking-[-0.01em] text-[#101828]">{value}</p> : null}
      {subtitle ? <p className="mt-2 text-sm leading-5 text-[#52657a]">{subtitle}</p> : null}
      {rows.length ? (
        <dl className="mt-3 grid gap-1.5">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-[#52657a]">{row.label}</dt>
              <dd className="font-semibold text-[#101828]">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="mt-auto border-t border-[#edf2f7] pt-3">
        <button type="button" onClick={onAction} className="inline-flex w-full items-center justify-between rounded-[10px] px-1 py-1 text-sm font-semibold text-[#0f7f4f]">
          <span>{actionLabel}</span>
          <ChevronRight size={16} />
        </button>
      </div>
    </article>
  )
}

export function CommissionOverviewCards({ overview = {}, onSelectTab }) {
  const listingRow = overview.listingRows?.[0]
  const defaultLevel = overview.defaultLevel || overview.levels?.[0] || {}
  const referralRules = Array.isArray(overview.referralRules) ? overview.referralRules : []
  const tracker = overview.companyTracker || {}
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        icon={BadgePercent}
        title="Listing Commission"
        value={listingRow?.defaultCommission || '7.5%'}
        subtitle={listingRow?.category || 'Residential Sales'}
        tone="green"
        onAction={() => onSelectTab?.('overview')}
      />
      <SummaryCard
        icon={CircleDollarSign}
        title="Agent Split Default"
        value={`${formatPercent(defaultLevel.agentPercentage || 60)} / ${formatPercent(defaultLevel.agencyPercentage || 40)}`}
        subtitle="Agent / Agency"
        tone="blue"
        onAction={() => onSelectTab?.('levels')}
      />
      <SummaryCard
        icon={UsersRound}
        title="Referral Rules"
        tone="purple"
        rows={referralRules.slice(0, 3).map((rule) => ({
          label: rule.name.replace(' referral', '').replace('Same branch', 'Same branch'),
          value: formatPercent(rule.percentage),
        }))}
        onAction={() => onSelectTab?.('overview')}
      />
      <SummaryCard
        icon={Target}
        title="Monthly Company Target"
        value={formatCurrency(tracker.targetAmount || 0)}
        subtitle="Minimum company commission"
        tone="orange"
        actionLabel="View tracker"
        onAction={() => onSelectTab?.('targets')}
      />
    </div>
  )
}

export function ListingCommissionTable({ rows = [], onEdit }) {
  return (
    <section className="rounded-[16px] border border-[#dfe7f0] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.045)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-[15px] bg-[#ecfdf3] text-[#16894f]">
            <BadgePercent size={20} />
          </span>
          <div>
            <h3 className="text-base font-semibold text-[#101828]">Listing Commission</h3>
            <p className="mt-1 text-sm leading-6 text-[#667085]">Default commission terms by listing category.</p>
          </div>
        </div>
        {onEdit ? (
          <button type="button" onClick={onEdit} className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#d9e3ef] bg-white px-4 text-sm font-semibold text-[#24364b]">
            Edit
          </button>
        ) : null}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#e7eef6] text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">
              <th className="py-3 pr-4">Category</th>
              <th className="py-3 pr-4">Default Commission</th>
              <th className="py-3 pr-4">Commission Level</th>
              <th className="py-3">Applies To</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((row) => (
              <tr key={row.key || row.category} className="border-b border-[#edf2f7] last:border-b-0">
                <td className="py-3 pr-4 font-semibold text-[#101828]">{row.category}</td>
                <td className="py-3 pr-4 font-semibold text-[#0f7f4f]">{row.defaultCommission}</td>
                <td className="py-3 pr-4">
                  <span className="inline-flex rounded-full border border-[#d7eadf] bg-[#f2fbf5] px-2.5 py-1 text-xs font-semibold text-[#167a45]">
                    {row.commissionLevel}
                  </span>
                </td>
                <td className="py-3 text-[#52657a]">{row.appliesTo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function AgentSplitLevelsCard({ levels = [], onEdit, onAdd }) {
  return (
    <section className="rounded-[16px] border border-[#dfe7f0] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.045)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-[15px] bg-[#edf5ff] text-[#1769d1]">
            <CircleDollarSign size={20} />
          </span>
          <div>
            <h3 className="text-base font-semibold text-[#101828]">Commission Levels</h3>
            <p className="mt-1 text-sm leading-6 text-[#667085]">Agent and agency split levels used for payout projections.</p>
          </div>
        </div>
        {onAdd ? (
          <button type="button" onClick={onAdd} className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#d9e3ef] bg-white px-4 text-sm font-semibold text-[#24364b]">
            Add level
          </button>
        ) : null}
      </div>
      <div className="mt-4 grid gap-2">
        {(levels || []).map((level) => (
          <div key={level.id || level.name} className="grid gap-3 rounded-[12px] border border-[#e4edf6] bg-[#fbfdff] px-3.5 py-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#16894f]" />
                <p className="font-semibold text-[#101828]">{level.name}</p>
                {level.isDefault ? <CommissionStatusBadge status="Default" tone="green" /> : null}
                {!level.isActive ? <CommissionStatusBadge status="Inactive" tone="slate" /> : null}
              </div>
              <p className="mt-1 text-xs text-[#667085]">
                {level.assignedAgentsCount || 0} assigned agent{Number(level.assignedAgentsCount || 0) === 1 ? '' : 's'}
              </p>
            </div>
            <p className="text-sm font-semibold text-[#101828]">{formatPercent(level.agentPercentage)} / {formatPercent(level.agencyPercentage)}</p>
            {onEdit ? (
              <button type="button" onClick={() => onEdit(level)} className="justify-self-start rounded-[10px] border border-[#d9e3ef] bg-white px-3 py-2 text-sm font-semibold text-[#24364b] md:justify-self-end">
                Edit
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}

export function ReferralRulesCard({ rules = [], onEdit }) {
  return (
    <section className="rounded-[16px] border border-[#dfe7f0] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.045)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-[15px] bg-[#f3efff] text-[#7657d8]">
            <Handshake size={20} />
          </span>
          <div>
            <h3 className="text-base font-semibold text-[#101828]">Referral Rules</h3>
            <p className="mt-1 text-sm leading-6 text-[#667085]">Default referral percentages and basis.</p>
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {(rules || []).filter((rule) => rule.isActive !== false).slice(0, 5).map((rule) => (
          <article key={rule.id || rule.referralType} className="rounded-[14px] border border-[#e4edf6] bg-[#fbfdff] p-4 text-center">
            <p className="text-sm font-semibold text-[#101828]">{rule.name.replace(' referral', '')}</p>
            <p className="mt-2 text-[1.5rem] font-semibold text-[#7657d8]">{formatPercent(rule.percentage)}</p>
            <p className="mt-1 text-xs text-[#667085]">{String(rule.basis || 'gross_commission').replaceAll('_', ' ')}</p>
            {onEdit ? (
              <button type="button" onClick={() => onEdit(rule)} className="mt-3 text-xs font-semibold text-[#4f46e5]">
                Edit
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}

export function CompanyTargetTracker({ tracker = {}, onEdit, compact = false }) {
  return (
    <section className={`rounded-[16px] border border-[#dfe7f0] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.045)] ${compact ? 'p-4' : 'p-4 sm:p-5'}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-[15px] bg-[#fff4e5] text-[#d87907]">
            <Target size={20} />
          </span>
          <div>
            <h3 className="text-base font-semibold text-[#101828]">{tracker.title || 'Company Commission'}</h3>
            <p className="mt-1 text-sm leading-6 text-[#667085]">Monthly minimum company commission target.</p>
          </div>
        </div>
        <CommissionStatusBadge status={tracker.statusLabel || 'No target'} tone={tracker.statusTone || 'slate'} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          <p className="text-[1.6rem] font-semibold leading-none text-[#0f7f4f]">
            {formatCurrency(tracker.currentAmount || 0)} <span className="text-[#8a9aac]">/ {formatCurrency(tracker.targetAmount || 0)}</span>
          </p>
          <p className="mt-2 text-sm text-[#52657a]">Company commission earned this month</p>
          <div className="mt-4">
            <CommissionProgressBar value={tracker.progressPercent || tracker.percentageAchieved || 0} tone={tracker.statusTone || 'green'} label={`${tracker.percentageAchieved || 0}% of monthly target`} />
          </div>
          <p className="mt-3 text-xs text-[#667085]">{tracker.daysLeftInMonth ?? 0} days left in month</p>
        </div>
        <div className="grid gap-2 rounded-[14px] border border-[#e4edf6] bg-[#fbfdff] p-3">
          <Metric label="Projected" value={formatCurrency(tracker.projectedCommission || 0, { compact: true })} />
          <Metric label="Pending" value={formatCurrency(tracker.pendingAmount || 0, { compact: true })} />
          <Metric label="Registered / paid" value={formatCurrency(tracker.registeredPaidAmount || 0, { compact: true })} />
          <Metric label="Active deals" value={tracker.activeDealsCount || 0} />
          {onEdit ? (
            <button type="button" onClick={onEdit} className="mt-1 rounded-[10px] border border-[#d9e3ef] bg-white px-3 py-2 text-sm font-semibold text-[#24364b]">
              Edit target
            </button>
          ) : null}
        </div>
      </div>
      {!compact && tracker.topContributors?.length ? (
        <div className="mt-4 grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Top contributing agents</p>
          <div className="grid gap-2 md:grid-cols-3">
            {tracker.topContributors.slice(0, 3).map((agent) => (
              <div key={agent.id || agent.name} className="rounded-[12px] border border-[#e4edf6] bg-[#fbfdff] px-3 py-2">
                <p className="truncate text-sm font-semibold text-[#101828]">{agent.name}</p>
                <p className="text-xs text-[#667085]">{formatCurrency(agent.amount, { compact: true })} • {agent.deals} deals</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function Metric({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-[#667085]">{label}</span>
      <strong className="text-[#101828]">{value}</strong>
    </div>
  )
}

export function AgentCommissionTracker({ tracker = {}, compact = false }) {
  return (
    <section className={`rounded-[16px] border border-[#dfe7f0] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.045)] ${compact ? 'p-4' : 'p-4 sm:p-5'}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-[15px] bg-[#ecfdf3] text-[#16894f]">
            <TrendingUp size={20} />
          </span>
          <div>
            <h3 className="text-base font-semibold text-[#101828]">{tracker.title || 'My Commission'}</h3>
            <p className="mt-1 text-sm leading-6 text-[#667085]">Personal commission progress for this month.</p>
          </div>
        </div>
        <CommissionStatusBadge status={tracker.statusLabel || 'No target'} tone={tracker.statusTone || 'slate'} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          <p className="text-[1.6rem] font-semibold leading-none text-[#0f7f4f]">
            {formatCurrency(tracker.currentAmount || 0)} <span className="text-[#8a9aac]">/ {formatCurrency(tracker.targetAmount || 0)}</span>
          </p>
          <p className="mt-2 text-sm text-[#52657a]">{tracker.percentageAchieved || 0}% of monthly target</p>
          <div className="mt-4">
            <CommissionProgressBar value={tracker.progressPercent || tracker.percentageAchieved || 0} tone={tracker.statusTone || 'green'} />
          </div>
        </div>
        <div className="grid gap-2 rounded-[14px] border border-[#e4edf6] bg-[#fbfdff] p-3">
          <Metric label="Level" value={tracker.commissionLevel || 'Standard'} />
          <Metric label="Agent split" value={`${formatPercent(tracker.agentSplit || 60)} / ${formatPercent(tracker.agencySplit || 40)}`} />
          <Metric label="Pending" value={formatCurrency(tracker.pendingAmount || 0, { compact: true })} />
          <Metric label="Projected" value={formatCurrency(tracker.projectedAmount || 0, { compact: true })} />
          <Metric label="Active deals" value={tracker.activeDealsCount || 0} />
        </div>
      </div>
      {!compact ? (
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <Breakdown label="Registered / paid" value={tracker.registeredPaidAmount || 0} />
          <Breakdown label="Pending commission" value={tracker.pendingAmount || 0} />
          <Breakdown label="Projected pipeline" value={tracker.projectedAmount || 0} />
        </div>
      ) : null}
    </section>
  )
}

function Breakdown({ label, value }) {
  return (
    <div className="rounded-[12px] border border-[#e4edf6] bg-[#fbfdff] px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#101828]">{formatCurrency(value, { compact: true })}</p>
    </div>
  )
}

export function CommissionHelperNote() {
  return (
    <div className="rounded-[14px] border border-[#d8e8f6] bg-[#f5faff] px-4 py-3 text-sm leading-6 text-[#33546f]">
      Commission settings are used for projections and reporting. Final payouts can be reconciled by the principal.
    </div>
  )
}

export { formatCurrency as formatCommissionCurrency, formatPercent as formatCommissionPercent }
