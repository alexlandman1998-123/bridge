import { Check, ChevronRight } from 'lucide-react'
import { HIGH_LEVEL_MILESTONES } from '../../core/transactions/highLevelJourneyRules.js'

const MILESTONES = HIGH_LEVEL_MILESTONES

// Render explicit rule outcomes without the legacy index-based normalizer.
export default function DeveloperOverviewJourney({ model, loading = false, onOpenWorkspace, title = 'Transaction Journey', action = null }) {
  const steps = model?.highLevelJourney?.ruleVersion === 1 ? model.highLevelJourney.milestones : []
  return (
    <section data-developer-overview-journey aria-label="Transaction journey" aria-busy={loading} className="min-w-0 rounded-[20px] border border-borderDefault bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-textStrong">{title}</h2>
        {action || (onOpenWorkspace ? <button type="button" onClick={() => onOpenWorkspace('transfer')} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
          View full journey <ChevronRight size={16} aria-hidden="true" />
        </button> : null)}
      </div>
      <nav aria-label="Transaction milestones" tabIndex={0} className="mt-4 overflow-x-auto pb-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
        <ol className="relative grid min-w-[640px] grid-cols-5 gap-3 py-3" style={{ backgroundImage: 'linear-gradient(#e2e8f0, #e2e8f0)', backgroundSize: '80% 1px', backgroundPosition: 'center 36px', backgroundRepeat: 'no-repeat' }}>
          {MILESTONES.map(milestone => {
            const Item = onOpenWorkspace ? 'button' : 'div'
            const step = steps.find(item => (item.id || item.key) === milestone.id || (milestone.alternate && (item.id || item.key) === milestone.alternate))
            const complete = !loading && Boolean(step?.isComplete)
            const current = !loading && ['in_progress', 'waiting', 'blocked'].includes(step?.status)
            const status = loading ? 'Loading…' : ({ complete: 'Completed', blocked: 'Needs attention', waiting: 'Waiting', in_progress: 'In progress', pending: 'Pending' }[step?.status] || 'Not available')
            return <li key={milestone.id} className="relative">
              <Item type={onOpenWorkspace ? 'button' : undefined} data-milestone={milestone.id} data-milestone-status={loading ? 'loading' : step?.status || 'unknown'} data-target={onOpenWorkspace ? milestone.target : undefined} onClick={onOpenWorkspace ? () => onOpenWorkspace(milestone.target) : undefined} aria-current={current ? 'step' : undefined} className="flex w-full flex-col items-center rounded-xl px-2 py-1 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
                <span aria-hidden="true" className={`inline-flex size-10 items-center justify-center rounded-full border-2 ${complete ? 'border-emerald-700 bg-emerald-700 text-white' : current ? 'border-emerald-700 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-400'}`}>
                  {complete ? <Check size={18} /> : <span className="size-2 rounded-full bg-current" />}
                </span>
                <span className="mt-3 text-sm font-semibold text-textStrong">{milestone.label}</span>
                <span className="mt-1 text-xs text-textMuted">{status}</span>
              </Item>
            </li>
          })}
        </ol>
      </nav>
    </section>
  )
}
