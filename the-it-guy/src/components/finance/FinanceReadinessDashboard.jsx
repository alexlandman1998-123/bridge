import {
  AlertTriangle,
  ArrowRight,
  Banknote,
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

function FinanceReadinessDashboard({ readiness = null, onViewIssues }) {
  if (!readiness) return null
  const scoreTone = getTone(readiness.scoreState?.tone)
  const submissionTone = readiness.submissionStatus?.ready ? getTone('success') : getTone('danger')

  return (
    <section className="space-y-7">
      <section className="rounded-[18px] border border-borderDefault bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.045)]">
        <header>
          <h2 className="text-lg font-semibold tracking-[-0.025em] text-textStrong">Finance Readiness</h2>
          <p className="mt-1 text-sm text-textMuted">
            Pre-submission health check based on the buyer application form, captured onboarding facts, documents, and transaction values.
          </p>
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

    </section>
  )
}

export default FinanceReadinessDashboard
