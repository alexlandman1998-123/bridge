import { Activity, AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react'
import { createElement } from 'react'
import { formatLeadDate } from '../../../lib/adminIntakeLeadPresentation'

const STATUS_CONFIG = {
  healthy: { label: 'Pipeline healthy', icon: CheckCircle2, classes: 'border-[#bfe3d2] bg-[#f1faf6] text-[#176149]' },
  degraded: { label: 'Delivery delayed', icon: Clock3, classes: 'border-[#ead8b8] bg-[#fff9ef] text-[#80591e]' },
  attention: { label: 'Delivery needs attention', icon: AlertTriangle, classes: 'border-[#e8c8c4] bg-[#fff5f4] text-[#92352f]' },
}

export function LeadPipelineHealth({ health }) {
  if (!health) return null
  const config = STATUS_CONFIG[health.status] || STATUS_CONFIG.degraded

  return (
    <section className={`mt-4 flex flex-col gap-4 rounded-[16px] border px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between ${config.classes}`} aria-label="Intake pipeline health">
      <div className="flex items-start gap-3">
        {createElement(config.icon, { className: 'mt-0.5 h-5 w-5 shrink-0', 'aria-hidden': true })}
        <div>
          <p className="text-sm font-semibold">{config.label}</p>
          <p className="mt-0.5 text-xs opacity-75">Last checked {formatLeadDate(health.checkedAt)}</p>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-5 text-center lg:text-left">
        <div><dt className="text-[0.66rem] font-semibold uppercase tracking-[0.06em] opacity-70">24h intake</dt><dd className="mt-0.5 text-base font-semibold">{health.submissions24h || 0}</dd></div>
        <div><dt className="text-[0.66rem] font-semibold uppercase tracking-[0.06em] opacity-70">Pending</dt><dd className="mt-0.5 text-base font-semibold">{health.pendingNotifications || 0}</dd></div>
        <div><dt className="text-[0.66rem] font-semibold uppercase tracking-[0.06em] opacity-70">Failed</dt><dd className="mt-0.5 text-base font-semibold">{health.failedNotifications || 0}</dd></div>
      </dl>
      <span className="hidden items-center gap-1.5 text-xs font-semibold opacity-70 xl:inline-flex"><Activity className="h-3.5 w-3.5" aria-hidden="true" />Monitored from the database</span>
    </section>
  )
}
