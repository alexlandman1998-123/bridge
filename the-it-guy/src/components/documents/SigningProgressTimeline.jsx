import { AlertTriangle, Check, Clock3, Eye, Mail } from 'lucide-react'
import { useMemo } from 'react'
import { buildSigningProgressTimeline } from '../../core/documents/signingProgressTimeline'
import Button from '../ui/Button'

function formatDate(value) {
  const date = new Date(value || '')
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-ZA')
}

function StatusIcon({ status }) {
  if (status === 'signed') return <Check className="h-4 w-4" />
  if (status === 'viewed') return <Eye className="h-4 w-4" />
  if (['expired', 'declined'].includes(status)) return <AlertTriangle className="h-4 w-4" />
  if (status === 'sent') return <Mail className="h-4 w-4" />
  return <Clock3 className="h-4 w-4" />
}

export default function SigningProgressTimeline({ signers = [], canManage = false, canRemind = canManage, busy = false, onSignerAction = null, compact = false }) {
  const timeline = useMemo(() => buildSigningProgressTimeline({ signers }), [signers])
  if (!timeline.rows.length) return null
  return (
    <section data-testid="signing-progress-timeline" className="rounded-[18px] border border-[#dce5ef] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#142132]">Signer progress</p>
          <p className="mt-0.5 text-xs text-[#607387]">{timeline.completedCount}/{timeline.totalCount} complete{timeline.attentionCount ? ` · ${timeline.attentionCount} needs attention` : ''}</p>
        </div>
        {timeline.nextSigner ? <span className="text-xs font-semibold text-[#35546c]">Next: {timeline.nextSigner.roleLabel}</span> : null}
      </div>
      <ol className="mt-3 space-y-2">
        {timeline.rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-3 rounded-[12px] border border-[#e1e9f2] bg-[#f9fbfd] px-3 py-2.5">
            <span className={`flex h-7 w-7 items-center justify-center rounded-full ${row.status === 'signed' ? 'bg-[#e4f5eb] text-[#237047]' : ['expired', 'declined'].includes(row.status) ? 'bg-[#fff0ee] text-[#9a3125]' : 'bg-[#eaf2fa] text-[#315d86]'}`}><StatusIcon status={row.status} /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[#142132]">{row.name} · {row.roleLabel}</p>
              <p className="text-xs capitalize text-[#607387]">
                {row.status.replace(/_/g, ' ')}
                {!compact && row.lastActivityAt ? ` · ${formatDate(row.lastActivityAt)}` : ''}
                {row.expired && row.expiresAt ? ` · expired ${formatDate(row.expiresAt)}` : ''}
              </p>
            </div>
            {canManage && ['send', 'resend'].includes(row.action.key) ? (
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onSignerAction?.(row.action.key, row)}>{busy ? 'Working…' : row.action.label}</Button>
            ) : null}
            {canRemind && row.action.key === 'remind' ? (
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onSignerAction?.('remind', row)}>{busy ? 'Working…' : row.action.label}</Button>
            ) : null}
            {!canRemind && row.action.key === 'remind' ? <span className="text-xs font-semibold text-[#9a640f]">Reminder due in signing workspace</span> : null}
            {row.action.key === 'review' ? <span className="text-xs font-semibold text-[#9a3125]">Review required</span> : null}
            {row.action.key === 'wait' ? <span className="text-xs font-semibold text-[#607387]">{row.action.label}{row.followUpDueAt ? ` until ${formatDate(row.followUpDueAt)}` : ''}</span> : null}
          </li>
        ))}
      </ol>
    </section>
  )
}
