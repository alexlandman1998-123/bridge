import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, FileCheck2, FileText, RefreshCw, Workflow } from 'lucide-react'
import Button from '../../ui/Button'

const text = (value = '') => String(value ?? '').trim()

export function ConveyancerActionCard({ item, expanded, busy, onToggle, onIntent, onWait, formatWhen }) {
  const missing = item.evidence?.missing || []
  return (
    <article className="rounded-[15px] border border-borderSoft bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.035)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <button type="button" className="min-w-0 flex-1 rounded-[10px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={onToggle} aria-expanded={expanded} aria-controls={`action-${item.actionKey}`}>
          <span className="flex items-start gap-3">
            <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[11px] ${item.bucket === 'blocked' ? 'bg-dangerSoft text-danger' : item.bucket === 'review' ? 'bg-warningSoft text-warning' : 'bg-primarySoft text-primary'}`} aria-hidden="true">
              {item.bucket === 'blocked' ? <AlertTriangle size={16} /> : item.bucket === 'review' ? <FileCheck2 size={16} /> : <Workflow size={16} />}
            </span>
            <span className="min-w-0 flex-1"><strong className="block text-sm font-semibold text-textStrong">{item.label}</strong><span className="mt-1 block text-xs leading-5 text-textMuted">{item.description}</span></span>
            {expanded ? <ChevronUp size={15} className="mt-1 shrink-0 text-textMuted" /> : <ChevronDown size={15} className="mt-1 shrink-0 text-textMuted" />}
          </span>
        </button>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {item.intent.type !== 'view' ? <Button type="button" size="sm" onClick={() => onIntent(item)} disabled={busy}>{busy ? <RefreshCw size={14} className="animate-spin" /> : item.intent.type === 'open_documents' ? <FileText size={14} /> : <CheckCircle2 size={14} />}{busy ? 'Saving…' : item.intent.label}</Button> : null}
          {['do_now', 'review'].includes(item.bucket) ? <Button type="button" size="sm" variant="secondary" onClick={() => onWait(item)} disabled={busy}>Mark waiting</Button> : null}
        </div>
      </div>
      {expanded ? (
        <div id={`action-${item.actionKey}`} className="mt-4 grid gap-3 border-t border-borderSoft pt-4 text-xs sm:grid-cols-3">
          <div className="rounded-[10px] bg-surfaceAlt px-3 py-2"><span className="block font-semibold uppercase tracking-[0.08em] text-textMuted">Owner</span><strong className="mt-1 block capitalize text-textStrong">{text(item.owner?.role).replaceAll('_', ' ') || 'Unassigned'}</strong></div>
          <div className="rounded-[10px] bg-surfaceAlt px-3 py-2"><span className="block font-semibold uppercase tracking-[0.08em] text-textMuted">Due</span><strong className="mt-1 block text-textStrong">{item.dueAt ? formatWhen(item.dueAt) : 'Not scheduled'}</strong></div>
          <div className="rounded-[10px] bg-surfaceAlt px-3 py-2"><span className="block font-semibold uppercase tracking-[0.08em] text-textMuted">Evidence</span><strong className="mt-1 block text-textStrong">{item.evidence?.satisfied || 0}/{item.evidence?.required || 0} ready</strong></div>
          {item.waitingOn || item.blockerReason ? <p className="sm:col-span-3 rounded-[10px] border border-warning/25 bg-warningSoft px-3 py-2 text-textBody">{item.blockerReason || `Waiting on ${item.waitingOn}`}</p> : null}
          {missing.length ? <p className="sm:col-span-3 text-textMuted">Still needed: {missing.map((entry) => entry.label).join(', ')}</p> : null}
        </div>
      ) : null}
    </article>
  )
}
