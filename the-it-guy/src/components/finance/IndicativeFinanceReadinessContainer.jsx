import { AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react'

const TONE_CLASSES = {
  success: {
    shell: 'border-[#cde4d5] bg-[#f4fbf6]',
    badge: 'border-[#cde4d5] bg-white text-[#2f7a51]',
    icon: 'border-[#cde4d5] bg-white text-[#2f7a51]',
  },
  warning: {
    shell: 'border-[#f3ddb8] bg-[#fffaf0]',
    badge: 'border-[#f3ddb8] bg-white text-[#9a6500]',
    icon: 'border-[#f3ddb8] bg-white text-[#9a6500]',
  },
  danger: {
    shell: 'border-[#f1cbc7] bg-[#fff7f6]',
    badge: 'border-[#f1cbc7] bg-white text-[#b42318]',
    icon: 'border-[#f1cbc7] bg-white text-[#b42318]',
  },
  neutral: {
    shell: 'border-[#dbe5ef] bg-[#fbfdff]',
    badge: 'border-[#dbe5ef] bg-white text-[#61758a]',
    icon: 'border-[#dbe5ef] bg-white text-[#61758a]',
  },
}

function getToneClasses(tone = '') {
  return TONE_CLASSES[tone] || TONE_CLASSES.neutral
}

function uniqueItems(items = []) {
  return [...new Set((Array.isArray(items) ? items : []).map((item) => String(item || '').trim()).filter(Boolean))]
}

function ReadinessStat({ label, value }) {
  return (
    <article className="rounded-[8px] border border-[#e5ecf4] bg-white px-3 py-3">
      <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[#8ca0b6]">{label}</span>
      <strong className="mt-1 block text-sm font-semibold leading-5 text-[#142132]">{value}</strong>
    </article>
  )
}

function ChipList({ label, items = [], tone = 'neutral', empty = '' }) {
  const values = uniqueItems(items).slice(0, 5)
  if (!values.length && !empty) return null
  const toneClasses = getToneClasses(tone)
  return (
    <div>
      <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[#8ca0b6]">{label}</span>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.length ? (
          values.map((item) => (
            <span key={item} className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${toneClasses.badge}`}>
              {item}
            </span>
          ))
        ) : (
          <span className="text-xs font-medium text-[#6f8299]">{empty}</span>
        )}
      </div>
    </div>
  )
}

function IndicativeFinanceReadinessContainer({ handoff = null, className = '' }) {
  if (!handoff) return null
  const toneClasses = getToneClasses(handoff.statusTone)
  const blockers = uniqueItems([...(handoff.topMissingItems || []), ...(handoff.topRiskFlags || [])])
  const stats = [
    { label: 'Readiness', value: handoff.scoreLabel || 'Not captured' },
    { label: 'Affordability Range', value: handoff.affordabilityRangeLabel || 'Range pending' },
    { label: 'Repayment Estimate', value: handoff.repaymentEstimateLabel || 'Repayment pending' },
    { label: 'Deposit', value: handoff.depositStrengthLabel || 'Deposit position pending' },
  ]

  return (
    <section className={`rounded-[8px] border p-3.5 shadow-[0_10px_22px_rgba(15,23,42,0.045)] ${toneClasses.shell} ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${toneClasses.icon}`}>
            <ShieldCheck size={17} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[1rem] font-semibold tracking-[-0.02em] text-[#142132]">Indicative Finance Readiness</h3>
            <p className="mt-1 text-sm leading-5 text-[#61758a]">{handoff.summaryLine || 'Captured readiness data for originator review.'}</p>
          </div>
        </div>
        <span className={`inline-flex rounded-full border px-3 py-1 text-[0.72rem] font-semibold ${toneClasses.badge}`}>
          {handoff.statusLabel || 'Readiness captured'}
        </span>
      </header>

      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <ReadinessStat key={item.label} label={item.label} value={item.value} />
        ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <article className="rounded-[8px] border border-[#e5ecf4] bg-white px-3 py-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[#2f7a51]" />
            <div>
              <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[#8ca0b6]">Recommended Action</span>
              <strong className="mt-1 block text-sm font-semibold leading-5 text-[#142132]">
                {handoff.recommendedAction || 'Review readiness details with the buyer.'}
              </strong>
            </div>
          </div>
        </article>
        <article className="rounded-[8px] border border-[#e5ecf4] bg-white px-3 py-3">
          <ChipList label="Originator Watch Items" items={blockers} tone={blockers.length ? 'warning' : 'success'} empty="No readiness blockers captured." />
        </article>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <ChipList label="Strengths" items={handoff.topStrengths || []} tone="success" empty="No strengths captured yet." />
        <ChipList label="Checklist" items={(handoff.handoffChecklist || []).map((item) => `${item.label}: ${item.detail}`)} tone="neutral" />
      </div>

      {handoff.disclaimer ? (
        <p className="mt-3 flex items-start gap-2 rounded-[8px] border border-[#e5ecf4] bg-white px-3 py-2.5 text-xs leading-5 text-[#61758a]">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-[#6f8299]" />
          <span>{handoff.disclaimer}</span>
        </p>
      ) : null}
    </section>
  )
}

export default IndicativeFinanceReadinessContainer
