import { CheckCircle2, CircleAlert, RefreshCw, ShieldAlert } from 'lucide-react'
import Button from '../ui/Button'

const TONES = {
  healthy: { border: 'border-[#cce6d5]', background: 'bg-[#f3fbf6]', text: 'text-[#18713e]', icon: CheckCircle2 },
  watch: { border: 'border-[#f1dfb8]', background: 'bg-[#fffaf0]', text: 'text-[#8a5b13]', icon: CircleAlert },
  hold: { border: 'border-[#f1c6c2]', background: 'bg-[#fff6f5]', text: 'text-[#a13b35]', icon: ShieldAlert },
  not_started: { border: 'border-[#dce6f2]', background: 'bg-[#fbfdff]', text: 'text-[#526a82]', icon: ShieldAlert },
}

export default function ListingMarketingOperationalHealthPanel({ report, onRefresh, refreshing = false, onReviewChanges }) {
  const tone = TONES[report?.status] || TONES.not_started
  const Icon = tone.icon
  const issues = Array.isArray(report?.issues) ? report.issues : []
  return (
    <section data-testid="listing-marketing-operational-health" className={`rounded-[22px] border ${tone.border} ${tone.background} p-5`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border ${tone.border} bg-white ${tone.text}`}><Icon size={19} /></span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-[#142132]">Marketing operational health</h3>
              <span className={`rounded-full border ${tone.border} bg-white px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.06em] ${tone.text}`}>{report?.label || 'Not monitoring yet'}</span>
            </div>
            <p className="mt-1 text-sm leading-6 text-[#607387]">
              {report?.status === 'not_started'
                ? 'Health monitoring starts when a listing has a channel reference or publication activity.'
                : `${report?.trackedChannelCount || 0} channel${report?.trackedChannelCount === 1 ? '' : 's'} monitored · ${report?.issueCount || 0} issue${report?.issueCount === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          Refresh health
        </Button>
      </div>
      {issues.length ? (
        <div className="mt-4 grid gap-2">
          {issues.map((issue) => (
            <div key={issue.id} className="rounded-[14px] border border-white/90 bg-white px-4 py-3 shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[0.64rem] font-semibold uppercase tracking-[0.06em] ${issue.severity === 'high' ? 'bg-[#fff0ef] text-[#a13b35]' : 'bg-[#fff8e8] text-[#8a641d]'}`}>{issue.channel}</span>
                <p className="text-sm font-semibold text-[#243d56]">{issue.title}</p>
              </div>
              <p className="mt-1 text-xs leading-5 text-[#607387]">{issue.detail}</p>
            </div>
          ))}
          {issues.some((issue) => issue.id.endsWith('_unpublished_changes')) && onReviewChanges ? (
            <button type="button" onClick={onReviewChanges} className="mt-1 w-fit text-xs font-semibold text-[#1f4f78] hover:underline">Review unpublished changes</button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
