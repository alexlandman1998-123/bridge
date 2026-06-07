import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  BriefcaseBusiness,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  ShieldCheck,
  Wallet,
} from 'lucide-react'

const TONE_CLASSES = {
  success: {
    text: 'text-success',
    bg: 'bg-successSoft',
    border: 'border-success/25',
    icon: 'bg-successSoft text-success',
  },
  warning: {
    text: 'text-warning',
    bg: 'bg-warningSoft',
    border: 'border-warning/25',
    icon: 'bg-warningSoft text-warning',
  },
  danger: {
    text: 'text-danger',
    bg: 'bg-dangerSoft',
    border: 'border-danger/25',
    icon: 'bg-dangerSoft text-danger',
  },
  info: {
    text: 'text-primary',
    bg: 'bg-primarySoft',
    border: 'border-primary/20',
    icon: 'bg-primarySoft text-primary',
  },
  neutral: {
    text: 'text-textMuted',
    bg: 'bg-surfaceAlt',
    border: 'border-borderSoft',
    icon: 'bg-surfaceAlt text-textMuted',
  },
}

function getTone(tone = '') {
  return TONE_CLASSES[tone] || TONE_CLASSES.neutral
}

function getBreakdownProgress(items = [], key = '') {
  const match = items.find((item) => item?.key === key)
  return Math.max(0, Math.min(100, Math.round(Number(match?.progress || 0))))
}

function ScoreRing({ score = 0, label = 'Pending', color = '#f59e0b' }) {
  const value = Math.max(0, Math.min(100, Math.round(Number(score || 0))))
  return (
    <div className="flex flex-col items-center justify-center">
      <div
        className="relative flex size-44 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(${color} ${value * 3.6}deg, #e9eef5 0deg)` }}
        aria-label={`Finance readiness score ${value}%`}
      >
        <div className="flex size-36 flex-col items-center justify-center rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(215,224,234,0.9)]">
          <strong className="text-[2.35rem] font-bold tracking-[-0.05em] text-textStrong">{value}%</strong>
          <span className="mt-1 text-sm font-semibold" style={{ color }}>{label}</span>
        </div>
      </div>
    </div>
  )
}

function ConfidenceGauge({ confidence = {} }) {
  const value = Math.max(0, Math.min(100, Math.round(Number(confidence.score || 0))))
  const color = value >= 68 ? '#16a34a' : value >= 45 ? '#f59e0b' : '#ef4444'
  return (
    <article className="flex h-full min-h-[320px] flex-col rounded-[18px] border border-borderDefault bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.045)]">
      <h3 className="text-base font-semibold tracking-[-0.02em] text-textStrong">Estimated Approval Confidence</h3>
      <div className="mt-5 flex flex-1 flex-col items-center justify-center">
        <div
          className="relative h-32 w-full max-w-[320px] overflow-hidden"
          aria-label={`Estimated approval confidence ${value}%`}
        >
          <div
            className="absolute inset-x-0 top-0 h-[320px] rounded-full"
            style={{ background: `conic-gradient(from 270deg, ${color} ${value * 1.8}deg, #e9eef5 0deg 180deg, transparent 180deg)` }}
          />
          <div className="absolute inset-x-10 top-10 h-[230px] rounded-full bg-white" />
          <div className="absolute inset-x-0 bottom-1 text-center">
            <strong className="block text-[2.55rem] font-bold tracking-[-0.05em] text-textStrong">{value}%</strong>
            <span className="text-sm font-semibold" style={{ color }}>{confidence.label || 'Pending'}</span>
          </div>
        </div>
        <p className="mt-3 max-w-[280px] text-center text-xs leading-5 text-textMuted">
          {confidence.note || 'Based on information provided and current criteria.'}
        </p>
        <p className="mt-1 text-center text-xs font-semibold text-textMuted">{confidence.disclaimer || 'This is not a final approval guarantee.'}</p>
      </div>
    </article>
  )
}

function getCreditRiskBand(score = 0) {
  if (score >= 800) return { label: 'Excellent', color: '#166534', gradient: ['#16a34a', '#166534'] }
  if (score >= 700) return { label: 'Strong', color: '#16a34a', gradient: ['#84cc16', '#16a34a'] }
  if (score >= 600) return { label: 'Good', color: '#2563EB', gradient: ['#fb923c', '#facc15'] }
  if (score >= 500) return { label: 'Watch', color: '#f97316', gradient: ['#ef4444', '#f97316'] }
  return { label: 'High Risk', color: '#ef4444', gradient: ['#ef4444', '#dc2626'] }
}

function getCreditScoreModel(readiness = {}) {
  return {
    creditScore: Number(readiness.creditScore || 620),
    creditProvider: readiness.creditProvider || 'Experian',
    creditRiskBand: readiness.creditRiskBand || '',
    creditLastUpdated: readiness.creditLastUpdated || null,
    creditConsentProvided: readiness.creditConsentProvided ?? true,
  }
}

function CreditScoreGauge({ score = 620, riskBand = '' }) {
  const value = Math.max(0, Math.round(Number(score || 0)))
  const progress = Math.max(0, Math.min(100, Math.round((value / 950) * 100)))
  const fillDegrees = progress * 1.8
  const band = riskBand ? { ...getCreditRiskBand(value), label: riskBand } : getCreditRiskBand(value)
  const gradientStops = band.gradient.length === 3
    ? `${band.gradient[0]} 0deg, ${band.gradient[1]} ${fillDegrees * 0.58}deg, ${band.gradient[2]} ${fillDegrees}deg`
    : `${band.gradient[0]} 0deg, ${band.gradient[1]} ${fillDegrees}deg`

  return (
    <div
      className="relative h-24 w-52 overflow-hidden"
      aria-label={`Credit score ${value}`}
    >
      <div
        className="absolute inset-x-0 top-0 h-52 rounded-full"
        style={{ background: `conic-gradient(from 270deg, ${gradientStops}, #e9eef5 ${fillDegrees}deg 180deg, transparent 180deg)` }}
      />
      <div className="absolute inset-x-8 top-8 h-36 rounded-full bg-white" />
      <div className="absolute inset-x-0 bottom-[-10px] text-center">
        <strong className="block text-[2rem] font-bold tracking-[-0.05em] text-textStrong">{value}</strong>
        <span className="text-sm font-semibold" style={{ color: band.color }}>{band.label}</span>
      </div>
    </div>
  )
}

function CreditScoreCard({ credit = {} }) {
  const band = getCreditRiskBand(credit.creditScore)
  const statusLabel = credit.creditRiskBand || band.label
  const scorePosition = Math.max(0, Math.min(100, Math.round((Number(credit.creditScore || 0) / 950) * 100)))
  const lastChecked = credit.creditLastUpdated || (credit.creditConsentProvided ? 'Awaiting bureau refresh' : 'Consent required')

  return (
    <article className="flex h-full min-h-[320px] flex-col rounded-[18px] border border-borderDefault bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.045)]">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-base font-semibold tracking-[-0.02em] text-textStrong">Credit Score</h3>
        <span className="rounded-full border border-borderSoft bg-surfaceAlt px-2.5 py-1 text-[0.68rem] font-semibold uppercase text-textMuted">
          Demo
        </span>
      </div>
      <div className="mt-4 flex flex-1 flex-col items-center">
        <CreditScoreGauge score={credit.creditScore} riskBand={statusLabel} />
        <div className="mt-4 w-full max-w-[300px]">
          <div className="flex items-center justify-between text-[0.68rem] font-semibold uppercase text-textMuted">
            <span>Higher risk</span>
            <span>Lower risk</span>
          </div>
          <div className="relative mt-2 h-2 rounded-full bg-gradient-to-r from-danger via-warning to-success">
            <span
              className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-white bg-textStrong shadow-[0_2px_8px_rgba(15,23,42,0.25)]"
              style={{ left: `calc(${scorePosition}% - 6px)` }}
            />
          </div>
        </div>
        <div className="mt-4 grid w-full gap-2 rounded-[14px] border border-borderSoft bg-surfaceAlt px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-textMuted">Risk band</span>
            <strong className="text-textStrong">{statusLabel}</strong>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-textMuted">Approval impact</span>
            <strong className="text-primary">Positive signal</strong>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-textMuted">Last checked</span>
            <strong className="text-right text-textStrong">{lastChecked}</strong>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-center gap-3">
          <span className="text-label font-semibold uppercase text-textMuted">Powered by</span>
          <span className="rounded-full border border-borderSoft bg-white px-3 py-1 text-sm font-bold tracking-[-0.01em] text-[#233c8f] shadow-[0_4px_12px_rgba(15,23,42,0.04)]">{credit.creditProvider || 'Experian'}</span>
        </div>
      </div>
    </article>
  )
}

function BreakdownRows({ items = [] }) {
  const iconByKey = {
    documents: FileText,
    income: Wallet,
    affordability: Banknote,
    deposit: CircleDollarSign,
    bank_compliance: ShieldCheck,
  }

  return (
    <div className="flex h-full min-h-[260px] flex-col">
      <h4 className="text-sm font-semibold text-textStrong">Readiness Breakdown</h4>
      <div className="flex flex-1 flex-col justify-between gap-4 pt-6">
        {items.map((item) => {
          const Icon = iconByKey[item.key] || CheckCircle2
          return (
            <div key={item.key} className="grid grid-cols-[150px_minmax(0,1fr)_44px] items-center gap-3 max-sm:grid-cols-1">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-textStrong">
                <Icon size={15} className="text-textMuted" />
                {item.label}
              </span>
              <span className="h-2.5 overflow-hidden rounded-full bg-[#eef3f8]">
                <span className="block h-full rounded-full" style={{ width: `${item.progress}%`, backgroundColor: item.color }} />
              </span>
              <strong className="text-sm text-textStrong max-sm:text-right">{item.progress}%</strong>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WatchItems({ items = [], onViewIssues }) {
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-textStrong">Watch Items</h4>
      <div className="space-y-2.5">
        {items.length ? (
          items.slice(0, 5).map((item) => {
            const severe = item.severity === 'High'
            return (
              <article key={item.label} className={`flex items-center justify-between gap-3 rounded-[12px] border px-3 py-3 ${severe ? 'border-warning/25 bg-warningSoft/55' : 'border-borderSoft bg-surfaceAlt'}`}>
                <span className="flex min-w-0 items-center gap-2">
                  <AlertTriangle size={15} className={severe ? 'shrink-0 text-warning' : 'shrink-0 text-textMuted'} />
                  <span className="truncate text-sm font-semibold text-textStrong">{item.label}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${severe ? 'bg-white text-warning' : 'bg-white text-textMuted'}`}>
                  {item.severity}
                </span>
              </article>
            )
          })
        ) : (
          <article className="rounded-[12px] border border-success/25 bg-successSoft px-3 py-3 text-sm font-semibold text-success">
            No readiness blockers captured.
          </article>
        )}
      </div>
      <button type="button" onClick={onViewIssues} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primaryDark">
        View all issues
        <ArrowRight size={14} />
      </button>
    </div>
  )
}

function FinancialSnapshot({ snapshot = {} }) {
  const items = [
    { label: 'Monthly Income', value: snapshot.monthlyIncome, secondary: 'Captured income basis', icon: Wallet, tone: 'success' },
    { label: 'Estimated Repayment', value: snapshot.estimatedRepayment, secondary: 'Indicative instalment', icon: BriefcaseBusiness, tone: 'info' },
    { label: 'Affordable Amount', value: snapshot.affordableAmount, secondary: 'Pre-qualification range', icon: Banknote, tone: 'info' },
    { label: 'Deposit Available', value: snapshot.depositAvailable, secondary: 'Deposit position', icon: CircleDollarSign, tone: 'warning' },
  ]
  return (
    <article className="h-full min-h-[320px] rounded-[18px] border border-borderDefault bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.045)]">
      <h3 className="text-base font-semibold tracking-[-0.02em] text-textStrong">Key Financial Snapshot</h3>
      <div className="mt-5 grid overflow-hidden rounded-[16px] border border-borderSoft sm:grid-cols-2">
        {items.map((item, index) => {
          const Icon = item.icon
          return (
            <article
              key={item.label}
              className={`min-w-0 border-borderSoft px-4 py-4 text-center ${index < items.length - 1 ? 'border-b' : ''} ${index % 2 === 0 ? 'sm:border-r' : ''} ${index === 1 ? 'sm:border-b' : ''} ${index === 2 ? 'sm:border-b-0' : ''}`}
            >
              <span className={`mx-auto inline-flex size-10 items-center justify-center rounded-full ${getTone(item.tone).icon}`}>
                <Icon size={16} />
              </span>
              <span className="mt-2 block text-label font-semibold uppercase text-textMuted">{item.label}</span>
              <strong className="mt-1.5 block text-[1.05rem] font-bold leading-tight text-textStrong">{item.value}</strong>
              <span className="mt-1 block text-xs leading-4 text-textMuted">{item.secondary}</span>
            </article>
          )
        })}
      </div>
    </article>
  )
}

function BuyerReadinessSummary({ readiness = {}, credit = {} }) {
  const documentsProgress = getBreakdownProgress(readiness.breakdown || [], 'documents')
  const items = [
    {
      label: 'Approval Confidence',
      value: `${Math.round(Number(readiness.approvalConfidence?.score || 0))}%`,
      meta: readiness.approvalConfidence?.label || 'Pending',
      tone: 'info',
    },
    {
      label: 'Credit Score',
      value: String(credit.creditScore || 620),
      meta: credit.creditRiskBand || getCreditRiskBand(credit.creditScore).label,
      tone: 'warning',
    },
    {
      label: 'Estimated Affordability',
      value: readiness.financialSnapshot?.affordableAmount || 'Pending',
      meta: 'Pre-qualification range',
      tone: 'success',
    },
    {
      label: 'Document Completion',
      value: `${documentsProgress}%`,
      meta: documentsProgress >= 80 ? 'Ready' : 'Needs documents',
      tone: documentsProgress >= 80 ? 'success' : 'warning',
    },
  ]

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const tone = getTone(item.tone)
        return (
          <article key={item.label} className="rounded-[14px] border border-borderSoft bg-white px-4 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.035)]">
            <span className="block text-label font-semibold uppercase text-textMuted">{item.label}</span>
            <div className="mt-2 flex items-end justify-between gap-3">
              <strong className="text-[1.45rem] font-bold leading-none tracking-[-0.04em] text-textStrong">{item.value}</strong>
              <span className={`rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${tone.bg} ${tone.text}`}>{item.meta}</span>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function FinanceReadinessDashboard({ readiness = null, onViewIssues }) {
  if (!readiness) return null
  const scoreTone = getTone(readiness.scoreState?.tone)
  const submissionTone = readiness.submissionStatus?.ready ? getTone('success') : getTone('danger')
  const creditScore = getCreditScoreModel(readiness)

  return (
    <section className="space-y-7">
      <section className="rounded-[18px] border border-borderDefault bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.045)]">
        <header>
          <h2 className="text-lg font-semibold tracking-[-0.025em] text-textStrong">Finance Readiness</h2>
          <p className="mt-1 text-sm text-textMuted">Pre-submission health check based on buyer onboarding data.</p>
        </header>

        <div className="mt-6 grid gap-6 xl:grid-cols-[220px_minmax(220px,0.75fr)_minmax(320px,1fr)_minmax(300px,0.95fr)] lg:grid-cols-2">
          <ScoreRing score={readiness.score} label={readiness.scoreState?.label} color={readiness.scoreState?.color} />

          <div className="flex flex-col justify-center gap-4">
            <article className={`rounded-[16px] border p-5 ${submissionTone.border} ${submissionTone.bg}`}>
              <div className="flex items-start gap-3">
                <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-white ${submissionTone.text}`}>
                  {readiness.submissionStatus?.ready ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
                </span>
                <div>
                  <h3 className={`text-sm font-bold ${submissionTone.text}`}>{readiness.submissionStatus?.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-textBody">{readiness.submissionStatus?.copy}</p>
                </div>
              </div>
            </article>
            <article className={`rounded-[16px] border p-5 ${scoreTone.border} ${scoreTone.bg}`}>
              <strong className={`block text-xl font-bold ${scoreTone.text}`}>
                {readiness.submissionStatus?.blockerCount || 0} issue{readiness.submissionStatus?.blockerCount === 1 ? '' : 's'} blocking submission
              </strong>
              <p className="mt-2 text-sm leading-6 text-textBody">Improve the areas below to increase your readiness score and submit to banks.</p>
            </article>
          </div>

          <BreakdownRows items={readiness.breakdown || []} />
          <WatchItems items={readiness.watchItems || []} onViewIssues={onViewIssues} />
        </div>
      </section>

      <section className="rounded-[18px] border border-borderDefault bg-surfaceAlt/60 p-6 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-label font-semibold uppercase tracking-[0.14em] text-textMuted">Buyer Readiness Assessment</p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.025em] text-textStrong">Can this buyer obtain finance?</h2>
          </div>
          <span className="rounded-full border border-borderSoft bg-white px-3 py-1 text-xs font-semibold text-textMuted">Demo bureau-ready view</span>
        </header>
        <BuyerReadinessSummary readiness={readiness} credit={creditScore} />
        <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-3">
          <ConfidenceGauge confidence={readiness.approvalConfidence} />
          <CreditScoreCard credit={creditScore} />
          <FinancialSnapshot snapshot={readiness.financialSnapshot} />
        </div>
      </section>
    </section>
  )
}

export default FinanceReadinessDashboard
