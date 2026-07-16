import { BellRing, Check, ClipboardCheck, Loader2, ShieldAlert, UsersRound, X } from 'lucide-react'
import { useEffect, useState } from 'react'

function shortId(value = '') {
  const normalized = String(value || '').trim()
  return normalized ? normalized.slice(0, 8) : ''
}

export function ReviewFollowUpPanel({ assurance, followUp, onPlan, onApply }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const plan = followUp?.plan
  const needsAction = Number(assurance?.summary?.criticalPackets || 0) + Number(assurance?.summary?.warningPackets || 0) > 0

  useEffect(() => {
    if (!confirmOpen || followUp?.applying) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setConfirmOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [confirmOpen, followUp?.applying])

  if (!assurance?.auditRun || (!needsAction && !plan)) return null

  const preparePlan = () => {
    void onPlan().catch(() => {})
  }

  const applyPlan = async () => {
    try {
      await onApply()
      setConfirmOpen(false)
    } catch {
      // The hook retains the safe, user-facing failure and invalidates the reviewed plan.
    }
  }

  const planPrepared = Boolean(plan)
  const notificationsApplied = Boolean(plan && plan.dryRun === false)
  const steps = [
    { key: 'audit', label: 'Audit current evidence', complete: assurance.dataComplete },
    { key: 'plan', label: 'Review notification plan', complete: planPrepared },
    { key: 'notify', label: 'Confirm notifications', complete: notificationsApplied },
  ]

  return (
    <>
      <section className="rounded-[18px] border border-[#e4dccb] bg-[#fffdf8] p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]" aria-labelledby="review-follow-up-title">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[#dfcfaa] bg-white text-[#8b641b]">
              <BellRing className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#8b7650]">Controlled human follow-up</p>
              <h2 id="review-follow-up-title" className="mt-1 text-lg font-semibold text-[#142033]">Direct the findings to the right reviewers</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[#687b90]">Preview every agency and attorney notification before anything is created. Confirmation re-runs the audit and rejects the plan if any evidence or routing action changed.</p>
            </div>
          </div>
          {!plan || plan.dryRun === false ? (
            <button
              type="button"
              onClick={preparePlan}
              disabled={!followUp?.permission?.allowed || !assurance.dataComplete || followUp?.planning || followUp?.applying}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-[#d7c28f] bg-white px-4 text-sm font-semibold text-[#86601a] transition hover:border-[#bd9c54] hover:bg-[#fffaf0] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {followUp?.planning ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ClipboardCheck className="h-4 w-4" aria-hidden="true" />}
              {followUp?.planning ? 'Preparing plan…' : notificationsApplied ? 'Prepare fresh plan' : 'Prepare notification plan'}
            </button>
          ) : null}
        </div>

        <ol className="mt-5 grid gap-2 sm:grid-cols-3" aria-label="Review follow-up steps">
          {steps.map((step, index) => (
            <li key={step.key} className={`flex items-center gap-2 rounded-[11px] border px-3 py-2.5 text-xs font-semibold ${step.complete ? 'border-[#cfe5d7] bg-[#f4faf6] text-[#237047]' : 'border-[#e4dccb] bg-white text-[#718397]'}`}>
              <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${step.complete ? 'bg-[#16804d] text-white' : 'border border-[#d8c9aa] text-[#8b7650]'}`}>
                {step.complete ? <Check className="h-3 w-3" aria-hidden="true" /> : index + 1}
              </span>
              {step.label}
            </li>
          ))}
        </ol>

        {!followUp?.permission?.allowed ? <p className="mt-4 text-xs leading-5 text-[#718397]">{followUp?.permission?.reason}</p> : null}
        {followUp?.error ? <p className="mt-4 rounded-[10px] border border-[#edc9c2] bg-[#fff6f4] px-3 py-2 text-xs leading-5 text-[#923f31]" role="alert">{followUp.error}</p> : null}

        {plan ? (
          <div className={`mt-5 rounded-[14px] border p-4 ${plan.dryRun ? 'border-[#e4d2ac] bg-[#fffaf1]' : plan.applySummary?.failed ? 'border-[#edc9c2] bg-[#fff6f4]' : 'border-[#cfe5d7] bg-[#f4faf6]'}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#30455b]">{plan.dryRun ? 'Review notification plan' : 'Notification plan applied'}</h3>
                <p className="mt-1 text-xs leading-5 text-[#687b90]">{plan.dryRun ? 'Nothing has been sent. Review the target roles and actions below.' : 'The evidence was re-audited and matched the reviewed plan immediately before notification.'}</p>
              </div>
              <span className="rounded-full border border-[#d8c9aa] bg-white px-2.5 py-1 font-mono text-[10px] font-semibold text-[#725d35]">Plan {plan.planFingerprint}</span>
            </div>

            <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ['Findings', plan.summary?.totalActions || 0],
                ['Can notify', plan.summary?.executableActions || 0],
                ['Cannot route', plan.summary?.skippedActions || 0],
                ['Attorney', plan.summary?.attorneyActions || 0],
                ['Critical', plan.summary?.criticalActions || 0],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[10px] border border-[#e4dccb] bg-white px-3 py-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7b6f5b]">{label}</dt>
                  <dd className="mt-1 text-lg font-semibold text-[#30455b]">{value}</dd>
                </div>
              ))}
            </dl>

            {plan.actions?.length ? (
              <ul className="mt-4 divide-y divide-[#e5d8bf] text-sm">
                {plan.actions.slice(0, 12).map((action) => (
                  <li key={action.actionKey} className="grid gap-2 py-3 md:grid-cols-[minmax(0,1fr)_140px_minmax(0,1.5fr)]">
                    <span className="font-semibold text-[#30455b]">
                      {action.title}
                      {action.canonicalTemplateVersionId ? <small className="mt-1 block font-mono text-[10px] font-normal text-[#8796a6]">Master {shortId(action.canonicalTemplateVersionId)}</small> : null}
                    </span>
                    <span className="capitalize text-[#52677e]">{action.targetRoles.join(', ')}</span>
                    <span className="text-[#63768a]">{action.executable ? action.message : action.skipReason}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-4 rounded-[10px] border border-[#cfe5d7] bg-white px-3 py-2 text-xs text-[#237047]">No review notifications are required for the current audit.</p>}

            {plan.dryRun && plan.canApply ? (
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={() => setConfirmOpen(true)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] bg-[#93691c] px-4 text-sm font-semibold text-white transition hover:bg-[#7f5916]">
                  <UsersRound className="h-4 w-4" aria-hidden="true" />
                  Review and notify
                </button>
              </div>
            ) : null}

            {!plan.dryRun ? (
              <p className="mt-4 text-sm font-semibold text-[#47634f]" role="status">
                {plan.applySummary?.notified || 0} action{plan.applySummary?.notified === 1 ? '' : 's'} notified · {plan.applySummary?.noActiveRecipients || 0} without active recipients · {plan.applySummary?.failed || 0} failed
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {confirmOpen && plan?.dryRun ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#102033]/45 px-4 py-8" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !followUp?.applying) setConfirmOpen(false) }}>
          <section className="w-full max-w-2xl rounded-[22px] border border-[#ead9b9] bg-white p-6 shadow-[0_28px_60px_rgba(15,23,42,0.24)]" role="dialog" aria-modal="true" aria-labelledby="review-notification-confirm-title">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b641b]">Human follow-up only</p>
                <h2 id="review-notification-confirm-title" className="mt-2 text-xl font-semibold text-[#102033]">Notify the assigned reviewers?</h2>
              </div>
              <button type="button" aria-label="Close notification confirmation" onClick={() => setConfirmOpen(false)} disabled={followUp?.applying} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#dce5ed] text-[#65788c] hover:bg-[#f7f9fb] disabled:opacity-50">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-4 text-sm leading-7 text-[#6b7c93]">Bridge will re-run the operational audit first. If any packet, generated version, master-version evidence, state or routing action changed, nothing will be sent and a fresh plan will be required.</p>
            <div className="mt-5 rounded-[13px] border border-[#ead9b9] bg-[#fffaf1] p-4 text-sm leading-6 text-[#6f5b35]">
              <strong className="text-[#4d4028]">{plan.summary?.executableActions || 0} notification action{plan.summary?.executableActions === 1 ? '' : 's'}</strong> will target assigned agency and/or attorney roles. Duplicate unread notifications for the same evidence state are suppressed.
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-[11px] border border-[#edc9c2] bg-[#fff6f4] px-3 py-3 text-xs font-semibold leading-5 text-[#923f31]">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              This cannot approve an OTP, clear legal review, change or lock wording, create signing links, repair evidence or trigger recovery.
            </div>
            {followUp?.error ? <p className="mt-4 text-xs leading-5 text-[#923f31]" role="alert">{followUp.error}</p> : null}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setConfirmOpen(false)} disabled={followUp?.applying} className="inline-flex min-h-10 items-center justify-center rounded-[10px] border border-[#d7e1ea] bg-white px-4 text-sm font-semibold text-[#50657b] disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void applyPlan()} disabled={followUp?.applying} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] bg-[#93691c] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                {followUp?.applying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UsersRound className="h-4 w-4" aria-hidden="true" />}
                {followUp?.applying ? 'Re-auditing and notifying…' : 'Confirm notifications'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
