import { Check } from 'lucide-react'

const STAGES = ['Details', 'Documents', 'Review', 'Submission']

export default function BondApplicationStageProgress({ activeIndex = 0, completed = [], percent = 0 }) {
  const progress = Math.min(100, Math.max(0, Number(percent) || 0))
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3 text-xs font-medium text-[#61748a]">
        <span>Application progress</span><span>{progress}% complete</span>
      </div>
      <div role="progressbar" aria-label="Application completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-1.5 overflow-hidden rounded-full bg-[#e4ebf3]">
        <div className="h-full rounded-full bg-[#123f3a] transition-all" style={{ width: `${progress}%` }} />
      </div>
      <ol aria-label="Application stages" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STAGES.map((label, index) => (
          <li key={label} aria-current={index === activeIndex ? 'step' : undefined} className={`flex min-w-0 items-center gap-2 text-xs font-semibold ${index === activeIndex || completed.includes(index) ? 'text-[#123f3a]' : 'text-[#718196]'}`}>
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${completed.includes(index) || index === activeIndex ? 'bg-[#123f3a] text-white' : 'bg-[#edf2f7]'}`}>
              {completed.includes(index) ? <Check size={14} aria-hidden="true" /> : index + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>
    </div>
  )
}
