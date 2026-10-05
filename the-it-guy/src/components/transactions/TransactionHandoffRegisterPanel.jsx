import { useEffect, useState } from 'react'
import { readTransactionHandoffRegister, recoverTransactionHandoff } from '../../services/transactionHandoffRegisterService'
import { buildTransactionHandoffRegisterItems } from '../../core/transactions/transactionHandoffRegister'

export default function TransactionHandoffRegisterPanel({ transactionId, refreshKey = '' }) {
  const [snapshot, setSnapshot] = useState(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!transactionId) return undefined
    let active = true
    readTransactionHandoffRegister(transactionId).then(
      (data) => { if (active) setSnapshot({ transactionId, refreshKey, retry, data }) },
      (error) => { if (active) setSnapshot({ transactionId, refreshKey, retry, error: error.message || 'Unable to load partner handoffs.' }) },
    )
    return () => { active = false }
  }, [transactionId, refreshKey, retry])
  const current = snapshot?.transactionId === transactionId && snapshot?.refreshKey === refreshKey && snapshot?.retry === retry ? snapshot : null
  const items = buildTransactionHandoffRegisterItems(current?.data?.items || [])
  const hasPendingDelivery = Boolean(current?.data?.items?.some((item) => item.required &&
    (item.dispatch_status === 'pending' || item.dispatch_status === 'failed' && item.next_delivery_attempt_at)))
  useEffect(() => {
    if (!transactionId || !hasPendingDelivery) return undefined
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') setRetry((value) => value + 1)
    }, 30000)
    return () => window.clearInterval(timer)
  }, [transactionId, hasPendingDelivery])
  useEffect(() => {
    if (!transactionId) return undefined
    const refresh = () => { if (document.visibilityState !== 'hidden') setRetry((value) => value + 1) }
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [transactionId])
  if (!transactionId) return null

  return <section aria-label="Organisation handoffs" className="rounded-[20px] border border-[#dfe9f4] bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h4 className="text-sm font-semibold text-[#18324b]">Organisation handoffs</h4>
      <button type="button" className="min-h-11 rounded-lg border px-3 text-sm" onClick={() => setRetry((value) => value + 1)}>Refresh handoffs</button>
    </div>
    {!current ? <p role="status" className="mt-3 text-sm">Loading partner handoffs…</p> : current.error ? <p role="alert" className="mt-3 text-sm text-red-700">{current.error}</p> : !items.length ? <p className="mt-3 text-sm">No required handoffs are visible for this matter. Confirm your matter access with your workspace administrator.</p> :
      <div className="mt-3 grid gap-3 md:grid-cols-2">{items.map((item) => <article key={item.id} className="rounded-xl border border-[#e2ebf4] p-4">
        <h5 className="font-semibold text-[#18324b]">{item.role}</h5>
        <p className="mt-1 text-sm">{item.destination} · {item.nomination}</p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
          <dt>Readiness</dt><dd>{item.readiness}</dd><dt>Invitation</dt><dd>{item.invitation}</dd>
          <dt>Delivery</dt><dd>{item.delivery}</dd><dt>Receipt</dt><dd>{item.acceptance}</dd>
          {item.cleanup ? <><dt>Previous handoff</dt><dd>{item.cleanup}</dd></> : null}
          {item.dispatch ? <><dt>Dispatch</dt><dd>{item.dispatch}</dd><dt>Partner matter</dt><dd>{item.workspace}</dd></> : null}
        </dl>
        {item.lastRecovery ? <p className="mt-3 text-sm">Last recovery review: {item.lastRecovery.reason}</p> : null}
        {item.recoveryActions.length ? <HandoffRecovery key={`${transactionId}:${item.id}:${item.generation}`} item={item} onRecovered={() => setRetry((value) => value + 1)} /> : null}
        {item.nextAttempt ? <p className="mt-3 text-sm">Next background attempt: {item.nextAttempt} SAST</p> : null}
        {item.actions.length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-800">{item.actions.map((action, index) => <li key={`${index}:${action}`}>{action}</li>)}</ul> : null}
      </article>)}</div>}
  </section>
}


function HandoffRecovery({ item, onRecovered }) {
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [request, setRequest] = useState(null)
  async function recover(action) {
    const decision = request?.action === action && request?.reason === reason ? request : { action, reason, requestId: crypto.randomUUID() }
    setRequest(decision)
    setPending(true)
    setError('')
    try {
      await recoverTransactionHandoff({ handoffId: item.id, generation: item.generation, ...decision })
      onRecovered()
    } catch (failure) { setError(failure.message || 'Recovery could not be confirmed.') }
    finally { setPending(false) }
  }
  return <div className="mt-3 border-t pt-3">
    <p className="text-sm">Recovery queues eligible work for background delivery. Check earlier delivery and the organisation owning any existing bond work before releasing a hold.</p>
    <label className="mt-2 block text-sm" htmlFor={`recovery-${item.id}`}>Review reason</label>
    <textarea id={`recovery-${item.id}`} className="mt-1 w-full rounded border p-2 text-sm" maxLength={1000} value={reason} disabled={pending} onChange={(event) => setReason(event.target.value)} />
    {item.recoveryActions.map(action => <button key={action} type="button" className="mr-2 mt-2 min-h-11 rounded border px-3 text-sm" disabled={pending || reason.trim().length < 10} onClick={() => recover(action)}>{pending ? 'Queueing…' : action === 'release_review' ? 'Release reviewed handoff' : 'Retry eligible delivery'}</button>)}
    {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
  </div>
}
