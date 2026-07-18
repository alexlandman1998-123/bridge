import { Check, Clock3, Eye, FileCheck2, Mail, RefreshCw } from 'lucide-react'
import { useMemo } from 'react'
import { buildSigningActivityHistory } from '../../core/documents/signingActivityHistory'

function formatDate(value) {
  const date = new Date(value || '')
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-ZA')
}

function ActivityIcon({ type }) {
  if (['signed', 'all_signed', 'finalised', 'published', 'delivered'].includes(type)) return <Check className="h-4 w-4" />
  if (type === 'viewed') return <Eye className="h-4 w-4" />
  if (['reminder_sent', 'link_resent'].includes(type)) return <RefreshCw className="h-4 w-4" />
  if (['invitation_sent', 'invitation_prepared'].includes(type)) return <Mail className="h-4 w-4" />
  if (type === 'declined') return <FileCheck2 className="h-4 w-4" />
  return <Clock3 className="h-4 w-4" />
}

export default function SigningActivityHistory({ signers = [], events = [], history: providedHistory = null, limit = 8 }) {
  const builtHistory = useMemo(() => buildSigningActivityHistory({ signers, events, limit }), [events, limit, signers])
  const history = providedHistory?.contract === 'arch9-signing-activity-v1'
    ? { ...providedHistory, rows: (providedHistory.rows || []).slice(0, limit), hasMore: providedHistory.totalCount > limit }
    : builtHistory
  if (!history.rows.length) return null

  return (
    <section data-testid="signing-activity-history" className="rounded-[18px] border border-[#dce5ef] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#142132]">Signing activity</p>
          <p className="mt-0.5 text-xs text-[#607387]">Verified document events, newest first</p>
        </div>
        <span className="text-xs font-semibold text-[#35546c]">{history.totalCount} event{history.totalCount === 1 ? '' : 's'}</span>
      </div>
      <ol className="mt-3 space-y-2">
        {history.rows.map((row) => (
          <li key={row.id} className="flex items-start gap-3 rounded-[12px] border border-[#e1e9f2] bg-[#f9fbfd] px-3 py-2.5">
            <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${row.type === 'declined' ? 'bg-[#fff0ee] text-[#9a3125]' : ['signed', 'all_signed', 'finalised', 'published', 'delivered'].includes(row.type) ? 'bg-[#e4f5eb] text-[#237047]' : 'bg-[#eaf2fa] text-[#315d86]'}`}>
              <ActivityIcon type={row.type} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#142132]">{row.label}{row.roleLabel ? ` · ${row.roleLabel}` : ''}</p>
              <p className="mt-0.5 text-xs text-[#607387]">{formatDate(row.occurredAt)}{row.deliveryConfirmed ? ' · delivery confirmed' : ''}</p>
            </div>
          </li>
        ))}
      </ol>
      {history.hasMore ? <p className="mt-2 text-xs text-[#607387]">Showing the latest {history.rows.length} events.</p> : null}
    </section>
  )
}
