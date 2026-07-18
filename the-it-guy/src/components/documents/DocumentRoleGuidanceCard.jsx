import { Check, ChevronRight, UserRound } from 'lucide-react'

export default function DocumentRoleGuidanceCard({ guidance = null, compact = false }) {
  if (guidance?.contract !== 'arch9-document-role-guidance-v1') return null
  const tone = guidance.tone === 'success'
    ? 'border-[#cfe8d9] bg-[#f3fbf6] text-[#1d5b3c]'
    : guidance.tone === 'danger'
      ? 'border-[#f1d2ce] bg-[#fff5f3] text-[#8e2f22]'
      : guidance.tone === 'info'
        ? 'border-[#cfdeed] bg-[#f5f9fd] text-[#294f73]'
        : 'border-[#dce5ef] bg-white text-[#35546c]'
  return (
    <section data-testid="document-role-guidance" className={`rounded-[18px] border p-4 ${tone}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/90"><UserRound size={17} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] opacity-75">{guidance.audienceLabel}</p>
          <h3 className="mt-1 text-base font-semibold">{guidance.title}</h3>
          <p className="mt-1 text-sm leading-5 opacity-90">{guidance.summary}</p>
        </div>
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-[12px] bg-white/75 px-3 py-2.5 text-sm font-semibold">
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{guidance.nextAction}</span>
      </div>
      {!compact ? (
        <ol className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
          {guidance.steps.map((step) => <li key={step} className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{step}</span></li>)}
        </ol>
      ) : null}
    </section>
  )
}
