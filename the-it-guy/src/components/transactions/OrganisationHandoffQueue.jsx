import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { readOrganisationHandoffQueue, readOrganisationHandoffQueueAccess } from '../../services/transactionHandoffRegisterService'
import { buildTransactionHandoffRegisterItems } from '../../core/transactions/transactionHandoffRegister'
import TransactionHandoffRegisterPanel from './TransactionHandoffRegisterPanel'

const BUCKETS = { all: 'All outstanding', data_gap: 'Missing evidence', attention: 'Needs attention', invitation: 'Awaiting partner signup', receipt: 'Awaiting organisation receipt', delivery: 'Delivery in progress', waiting: 'Awaiting readiness' }
const GAPS = {
  register_missing: 'The matter handoff register is missing. Ask your workspace administrator to investigate.',
  handoff_owner_mismatch: 'The handoff owner differs from the matter owner. Review the organisation assignment.',
  dispatch_job_missing: 'A ready handoff has no saved delivery job. Ask your workspace administrator to investigate.',
  native_matter_missing: 'Preparation is recorded, but the partner matter or preparation evidence is missing.',
  partner_assignment_missing: 'Preparation is recorded, but the partner workspace assignment is missing.',
  delivery_intent_missing: 'Preparation is recorded, but no instruction delivery is queued.',
  provider_receipt_missing: 'Delivery is marked sent without a provider receipt. Confirm the earlier result before sending again.',
  frozen_payload_missing: 'Earlier delivery has no saved email payload. Confirm its result before arranging further delivery.',
}
function waitingSince(value) {
  const date = new Date(value)
  return value && Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'medium' }) : 'Date unavailable'
}

export default function OrganisationHandoffQueue({ organisationId }) {
  const [bucket, setBucket] = useState('all')
  const [offset, setOffset] = useState(0)
  const [reload, setReload] = useState(0)
  const [snapshot, setSnapshot] = useState(null)
  const [selected, setSelected] = useState(null)
  const key = `${organisationId}:${bucket}:${offset}:${reload}`
  useEffect(() => {
    if (!organisationId) return undefined
    let active = true
    readOrganisationHandoffQueueAccess(organisationId).then(async allowed => {
      if (!active) return
      if (!allowed) { setSnapshot({ key, denied: true }); return }
      try {
        const data = await readOrganisationHandoffQueue(organisationId, { bucket, offset })
        if (active) setSnapshot({ key, data })
      } catch (error) {
        if (active) setSnapshot({ key, error: error.message || 'Unable to load organisation handoffs.' })
      }
    },
      error => { if (active) setSnapshot({ key, error: error.message || 'Unable to load organisation handoffs.' }) },
    )
    return () => { active = false }
  }, [organisationId, bucket, offset, key])
  useEffect(() => {
    if (!organisationId) return undefined
    const refresh = () => { if (document.visibilityState !== 'hidden') setReload(value => value + 1) }
    const timer = window.setInterval(refresh, 60000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [organisationId])
  if (!organisationId) return null
  const current = snapshot?.key === key ? snapshot : null
  if (current?.denied) return null
  if (!current) return <p role="status" className="text-sm text-slate-600">Checking handoff queue access…</p>
  return <section aria-label="Organisation handoff queue" className="rounded-[18px] border border-[#dfe9f4] bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Organisation handoff queue</h2>
      <button type="button" className="min-h-11 rounded border px-3 text-sm" onClick={() => { setOffset(0); setReload(value => value + 1) }}>Refresh queue</button>
    </div>
    <p className="mt-2 text-sm">Outstanding attorney and bond handoffs across your agency. Signup, instruction delivery and organisation receipt are tracked separately.</p>
    <label className="mt-3 block text-sm" htmlFor="handoff-queue-filter">Show handoffs</label>
    <select id="handoff-queue-filter" className="mt-1 min-h-11 rounded border px-3 text-sm" value={bucket} onChange={event => { setBucket(event.target.value); setOffset(0); setSelected(null) }}>
      {Object.entries(BUCKETS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
    {!current ? <p role="status" className="mt-3">Loading organisation handoffs…</p> : current.error ? <p role="alert" className="mt-3 text-red-700">{current.error}</p> : <>
      <p className="mt-3 text-sm">{current.data.total} outstanding {current.data.total === 1 ? 'handoff' : 'handoffs'} in this view.</p>
      <p className="mt-1 text-sm">Missing evidence: {current.data.counts.data_gap || 0} · Needs attention: {current.data.counts.attention || 0} · Awaiting signup: {current.data.counts.invitation || 0} · Awaiting receipt: {current.data.counts.receipt || 0}</p>
      {!current.data.items.length ? <p className="mt-3">{current.data.total ? 'No handoffs on this page. Return to the previous page or refresh the queue.' : 'No outstanding handoffs in this view.'}</p> : <ul className="mt-3 space-y-3">{current.data.items.map(row => {
        const item = buildTransactionHandoffRegisterItems([{ ...row, id: row.handoff_id, required: true }])[0]
        return <li key={row.queue_id} className="rounded border p-3 text-sm">
          <p className="font-semibold">{row.matter_label} · {row.role_type === 'register' ? 'Matter handoff register' : item.role}</p>
          <p className="mt-1">{BUCKETS[row.bucket]} · {item.destination}</p>
          <p className="mt-1">Pending since {waitingSince(row.pending_since)}</p>
          {GAPS[row.queue_reason] ? <p className="mt-2 text-amber-900">{GAPS[row.queue_reason]}</p> : <p className="mt-2">{item.actions[0] || (row.bucket === 'receipt' ? item.acceptance : row.bucket === 'invitation' ? item.invitation : item.readiness)}</p>}
          <div className="mt-2 flex flex-wrap gap-3">
            <Link className="inline-flex min-h-11 items-center underline" to={`/transactions/${row.transaction_id}`}>Open matter</Link>
            {row.handoff_id ? <button type="button" className="min-h-11 rounded border px-3" onClick={() => setSelected({ organisationId, transactionId: row.transaction_id, label: row.matter_label })}>Review handoffs</button> : null}
          </div>
        </li>
      })}</ul>}
      <div className="mt-3 flex gap-3">
        <button type="button" className="min-h-11 rounded border px-3 text-sm" disabled={offset === 0} onClick={() => { setOffset(value => Math.max(0, value - 25)); setSelected(null) }}>Previous handoffs</button>
        <button type="button" className="min-h-11 rounded border px-3 text-sm" disabled={!current.data.hasMore} onClick={() => { setOffset(value => value + 25); setSelected(null) }}>Next handoffs</button>
      </div>
    </>}
    {selected?.organisationId === organisationId ? <div className="mt-4 border-t pt-4">
      <div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-semibold">Review {selected.label}</h3><button className="min-h-11 rounded border px-3 text-sm" type="button" onClick={() => { setSelected(null); setReload(value => value + 1) }}>Close review</button></div>
      <TransactionHandoffRegisterPanel key={selected.transactionId} transactionId={selected.transactionId} />
    </div> : null}
  </section>
}
