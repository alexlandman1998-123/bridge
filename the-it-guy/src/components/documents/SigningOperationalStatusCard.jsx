import { AlertTriangle, CheckCircle2, Clock3, FileCheck2, UsersRound } from 'lucide-react'

const TONES = {
  success: 'border-[#c8e5d4] bg-[#effaf4] text-[#1d5b3c]',
  warning: 'border-[#f1dfb9] bg-[#fff9ec] text-[#7d520d]',
  danger: 'border-[#f1d2ce] bg-[#fff4f3] text-[#8e1f15]',
  info: 'border-[#cfe0f1] bg-[#f1f7fd] text-[#244f76]',
  neutral: 'border-[#dce5ef] bg-[#f8fbfd] text-[#49627d]',
}

function StatusIcon({ state = '' }) {
  if (state === 'completed') return <CheckCircle2 className="h-5 w-5" />
  if (state === 'attention_required') return <AlertTriangle className="h-5 w-5" />
  if (['awaiting_signers', 'partially_signed'].includes(state)) return <UsersRound className="h-5 w-5" />
  if (['finalising', 'publishing'].includes(state)) return <Clock3 className="h-5 w-5" />
  return <FileCheck2 className="h-5 w-5" />
}

export default function SigningOperationalStatusCard({ status = null, compact = false }) {
  if (!status?.state) return null
  const progress = status.progress || {}
  return (
    <section
      data-testid="signing-operational-status"
      className={`rounded-[18px] border px-4 py-3 ${TONES[status.tone] || TONES.neutral}`}
      aria-label="Document signing status"
      role="status"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5"><StatusIcon state={status.state} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{status.title}</p>
            {progress.total > 0 ? <span className="text-xs font-semibold">{progress.signed}/{progress.total} signed</span> : null}
          </div>
          <p className="mt-1 text-sm leading-5 opacity-90">{status.summary}</p>
          {!compact ? <p className="mt-2 text-xs font-semibold">Next: {status.nextAction}</p> : null}
          {progress.total > 0 ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10">
              <div className="h-full rounded-full bg-current transition-all" style={{ width: `${Math.max(0, Math.min(100, Number(progress.percent) || 0))}%` }} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
