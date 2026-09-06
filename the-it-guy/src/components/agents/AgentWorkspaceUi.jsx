import { createElement } from 'react'
import { Grid2X2, ShieldCheck } from 'lucide-react'

export function DetailInfoRow({ label, value }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(86px,0.42fr)_minmax(0,1fr)] gap-3 border-b border-[#edf2f7] py-2.5 last:border-0 sm:grid-cols-[118px_minmax(0,1fr)]">
      <span className="min-w-0 truncate text-xs font-semibold text-[#6f839a]">{label}</span>
      <span className="min-w-0 truncate text-sm font-semibold text-[#20364d]" title={String(value || '—')}>{value || '—'}</span>
    </div>
  )
}

export function AgentManagementCard({ title, actionLabel, onAction, actionUnavailableReason = '', children, className = '' }) {
  return (
    <article className={`min-w-0 overflow-hidden rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-sm ${className}`}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-[#edf2f7] pb-3">
        <h3 className="min-w-0 text-base font-semibold tracking-[-0.025em] text-[#10243a]">{title}</h3>
        {actionLabel && onAction ? (
          <button type="button" onClick={onAction} className="shrink-0 text-xs font-semibold text-[#1769d1] hover:text-[#0f4f9f]">{actionLabel}</button>
        ) : actionLabel ? (
          <span className="shrink-0 rounded-full border border-[#dbe6f2] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#60758d]" title={actionUnavailableReason || undefined} aria-label={actionUnavailableReason ? `${actionLabel}: ${actionUnavailableReason}` : undefined}>{actionLabel}</span>
        ) : null}
      </div>
      <div className="mt-3">{children}</div>
    </article>
  )
}

export function PrincipalAgentTabShell({ title, description, actionLabel, onAction, actionUnavailableReason = '', children }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-[-0.03em] text-[#10243a]">{title}</h2>
          <p className="mt-1 text-sm text-[#61778f]">{description}</p>
        </div>
        {actionLabel && onAction ? (
          <button type="button" onClick={onAction} className="inline-flex min-h-10 shrink-0 items-center rounded-xl border border-[#d9e3ef] bg-white px-4 text-sm font-semibold text-[#0f2742] shadow-sm transition hover:bg-[#f7fafc]">{actionLabel}</button>
        ) : actionLabel ? (
          <button type="button" disabled title={actionUnavailableReason || 'Unavailable'} className="inline-flex min-h-10 shrink-0 cursor-not-allowed items-center rounded-xl border border-[#e1e7ee] bg-[#f7f9fb] px-4 text-sm font-semibold text-[#8392a5]">{actionLabel} — unavailable</button>
        ) : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

export function WorkspaceCard({ title, actionLabel = '', children, className = '' }) {
  return (
    <article className={`min-w-0 overflow-hidden rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.04)] sm:p-5 ${className}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <h3 className="min-w-0 truncate text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#6b7f97]">{title}</h3>
        {actionLabel ? <span className="shrink-0 text-xs font-semibold text-[#1769d1]">{actionLabel}</span> : null}
      </div>
      <div className="mt-4">{children}</div>
    </article>
  )
}

export function AgentWorkspaceKpiCard({ label, value, helper = '', icon = Grid2X2, tone = 'bg-[#edf8f0] text-[#16894f]' }) {
  return (
    <article className="min-w-0 rounded-2xl border border-[#dfe7f1] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[0.74rem] font-semibold text-[#526981]" title={label}>{label}</p>
          <p className="mt-2 truncate text-[1.45rem] font-semibold tracking-[-0.035em] text-[#10243a]" title={String(value ?? '—')}>{value ?? '—'}</p>
          {helper ? <p className="mt-1 truncate text-xs font-semibold text-[#60758d]" title={helper}>{helper}</p> : null}
        </div>
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone}`}>{createElement(icon, { size: 18 })}</span>
      </div>
    </article>
  )
}

export function LockedAgentFilterChip({ label }) {
  return <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-[#cfe3d7] bg-[#f2fbf5] px-3 py-1 text-xs font-semibold text-[#16894f]"><ShieldCheck size={13} /><span className="min-w-0 truncate">Agent: {label}</span></span>
}

export function EmptyWorkspaceState({ children }) {
  return <div className="rounded-2xl border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#647a92]">{children}</div>
}
