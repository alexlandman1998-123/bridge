import { ArrowRight } from 'lucide-react'
import BondApplicationStageProgress from './BondApplicationStageProgress.jsx'

export default function BondApplicationTaskWorkspace({ workspace, onNextAction, onSectionChange, submitted = false }) {
  const sections = workspace.sectionCards || []
  const details = sections.filter((section) => !['documents', 'declarations_consents'].includes(section.key))
  const complete = (section) => section.confirmed || section.state === 'ready_to_confirm'
  const activeKey = workspace.activeSection?.key || sections.find((section) => section.active)?.key || 'summary'
  const completed = []
  if (details.length && details.every(complete)) completed.push(0)
  if (!(workspace.documentBlockers || []).length && sections.some((section) => section.key === 'documents' && complete(section))) completed.push(1)
  if (sections.some((section) => section.key === 'declarations_consents' && complete(section))) completed.push(2)
  if (submitted) completed.push(3)
  const next = workspace.nextAction || {}
  return (
    <section className="rounded-[20px] border border-[#dbe5ef] bg-white p-4 sm:p-5" data-bond-ux-task-workspace="phase-10">
      <BondApplicationStageProgress activeIndex={submitted ? 3 : activeKey === 'documents' ? 1 : activeKey === 'declarations_consents' ? 2 : 0} completed={completed} percent={workspace.progressPercent} />
      <div className="mt-5 grid items-center gap-4 border-t border-[#e6edf5] pt-4 sm:grid-cols-[minmax(0,1fr)_auto]" data-bond-ux-next-action-bar="true">
        <div className="min-w-0">
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[#718196]">Next action</span>
          <p className="mt-1 text-sm leading-6 text-[#40566d]">{next.detail}</p>
        </div>
        <button type="button" onClick={onNextAction} disabled={next.disabled} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#123f3a] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {next.label}<ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>
      <label className="mt-4 block text-xs font-semibold text-[#61748a]" data-bond-ux-section-stepper="true">
        Application section
        <select value={activeKey} onChange={(event) => onSectionChange(event.target.value)} className="mt-2 block min-h-11 w-full rounded-xl border border-[#d1deeb] bg-white px-3 text-sm text-[#142132] sm:max-w-md">
          {sections.map((section) => <option key={section.key} value={section.key}>{section.label} · {section.key === 'documents' && workspace.documentBlockers?.length ? `${workspace.documentBlockers.length} needed` : section.stateLabel}</option>)}
        </select>
      </label>
    </section>
  )
}
