import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'

export function DocumentOutcomeNotice({ model = null, onDismiss = null }) {
  if (model?.contract !== 'arch9-document-outcome-feedback-v1') return null
  const attention = model.tone === 'attention'
  const info = model.tone === 'info'
  const tone = attention
    ? 'border-[#f1d2ce] bg-[#fff5f3] text-[#8e2f22]'
    : info
      ? 'border-[#cfdeed] bg-[#f5f9fd] text-[#294f73]'
      : 'border-[#cfe8d9] bg-[#f1faf5] text-[#1d6842]'
  const Icon = attention ? AlertTriangle : info ? Info : CheckCircle2
  return (
    <section data-testid="document-outcome-notice" role="status" aria-live="polite" aria-atomic="true" className={`rounded-[18px] border px-4 py-3 ${tone}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold">{model.title}</h3>
          <p className="mt-1 text-sm leading-5 opacity-90">{model.message}</p>
          <p className="mt-2 text-xs font-semibold">Next: {model.nextStep}</p>
        </div>
        {onDismiss ? (
          <button type="button" onClick={onDismiss} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current" aria-label="Dismiss status message">
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </section>
  )
}
