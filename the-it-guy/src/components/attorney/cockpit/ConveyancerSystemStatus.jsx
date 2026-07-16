import { ArrowRight, BellRing, Files, PlugZap } from 'lucide-react'
import Button from '../../ui/Button'

const ICONS = { reminders: BellRing, documents: Files, providers: PlugZap }
const TONES = { success: 'bg-successSoft text-success', warning: 'bg-warningSoft text-warning', neutral: 'bg-surfaceAlt text-textMuted' }

export function ConveyancerSystemStatus({ systems, fallback, onNavigate }) {
  return (
    <details className="rounded-[16px] border border-borderDefault bg-white shadow-surface">
      <summary className="cursor-pointer list-none rounded-[16px] px-4 py-4 text-sm font-semibold text-textStrong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Systems and manual fallback <span className="ml-2 text-xs font-normal text-textMuted">Optional detail</span></summary>
      <div className="border-t border-borderSoft px-4 py-4">
        <ul className="grid gap-3 lg:grid-cols-3">
          {systems.map((system) => { const Icon = ICONS[system.id] || PlugZap; return <li key={system.id} className="rounded-[13px] border border-borderSoft p-3"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-primarySoft text-primary" aria-hidden="true"><Icon size={16} /></span><div className="min-w-0 flex-1"><strong className="text-sm text-textStrong">{system.label}</strong><p className="mt-1 text-xs leading-5 text-textMuted">{system.detail}</p><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[system.tone] || TONES.neutral}`}>{system.statusLabel}</span>{system.action ? <Button type="button" variant="ghost" size="sm" className="mt-2 h-8 px-2" onClick={() => onNavigate?.(system.action)}>Open <ArrowRight size={13} /></Button> : null}</div></div></li> })}
        </ul>
        <p className="mt-4 rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-2 text-xs leading-5 text-textMuted">{fallback}</p>
      </div>
    </details>
  )
}
