import { AlertTriangle, ChevronDown, CircleHelp, RefreshCw } from 'lucide-react'
import Button from '../ui/Button'

export default function DocumentHelpRecoveryCard({ model = null, busy = false, compact = false, onAction = null }) {
  if (model?.contract !== 'arch9-document-help-recovery-v1') return null
  const content = (
    <>
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${model.hasIssue ? 'bg-[#ffe8e3] text-[#963326]' : 'bg-[#edf4fb] text-[#355f87]'}`}>
          {model.hasIssue ? <AlertTriangle size={17} /> : <CircleHelp size={17} />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[#142132]">{model.title}</h3>
          <p className="mt-1 text-xs leading-5 text-[#607387]">{model.summary}</p>
        </div>
      </div>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-5 text-[#526b83]">
        {model.steps?.map((step) => <li key={step}>{step}</li>)}
      </ol>
      {model.action ? (
        <Button type="button" size="sm" variant={model.hasIssue ? 'primary' : 'secondary'} className="mt-3 w-full" disabled={busy} onClick={() => onAction?.(model.action.id)}>
          <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> {model.action.label}
        </Button>
      ) : null}
    </>
  )

  if (!model.hasIssue) {
    return (
      <details data-testid="document-help-recovery" className="group rounded-[18px] border border-[#dce5ef] bg-white p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-[#35546c]">
          <span className="flex items-center gap-2"><CircleHelp size={16} />{model.title}</span>
          <ChevronDown size={16} className="transition group-open:rotate-180" />
        </summary>
        <div className="mt-4">{content}</div>
      </details>
    )
  }
  return <section data-testid="document-help-recovery" role="alert" className={`rounded-[18px] border border-[#f1d2ce] bg-[#fff6f3] p-4 ${compact ? '' : 'shadow-sm'}`}>{content}</section>
}
