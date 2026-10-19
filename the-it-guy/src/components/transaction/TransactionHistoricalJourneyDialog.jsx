import { useState } from 'react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import { HIGH_LEVEL_MILESTONES } from '../../core/transactions/highLevelJourneyRules.js'

export default function TransactionHistoricalJourneyDialog({ history, onSave, onClose }) {
  const [milestones, setMilestones] = useState(() => history?.milestones || {})
  const [expectedRevision] = useState(() => history?.recordRevision || 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const today = new Date().toLocaleDateString('en-CA')
  async function save() {
    if (busy) return
    setBusy(true)
    setError('')
    try { await onSave(milestones, expectedRevision); onClose() }
    catch (failure) { setError(failure.message || 'Progress could not be saved.') }
    finally { setBusy(false) }
  }
  return <Modal open title="Record historical progress" onClose={busy ? undefined : onClose} className="max-w-xl" footer={
    <div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save progress'}</Button></div>
  }>
    <p className="mb-4 text-sm leading-6 text-slate-600">Confirm the milestones already reached. Add dates where known. Unconfirmed milestones stay unknown unless the workflow has confirmed them.</p>
    <div className="divide-y divide-slate-100">
      {HIGH_LEVEL_MILESTONES.map(item => {
        const confirmed = Object.hasOwn(milestones, item.id)
        return <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 py-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 font-medium text-slate-800"><input type="checkbox" className="size-4 accent-emerald-700" checked={confirmed} disabled={busy} onChange={event => setMilestones(previous => {
            const next = { ...previous }
            if (event.target.checked) next[item.id] = { completedOn: null }
            else delete next[item.id]
            return next
          })} />{item.label}</label>
          {confirmed ? <label className="grid gap-1 text-xs text-slate-500">Date (optional)<input aria-label={`${item.label} date`} type="date" max={today} value={milestones[item.id].completedOn || ''} disabled={busy} onChange={event => setMilestones(previous => ({ ...previous, [item.id]: { completedOn: event.target.value || null } }))} className="min-w-0 rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-800 focus:outline-emerald-700" /></label> : <span className="text-sm text-slate-400">Unconfirmed</span>}
        </div>
      })}
    </div>
    <p className="mt-4 text-xs leading-5 text-slate-500">Saved as historical confirmations. Buyer onboarding, document checks and legal tasks stay as they are. No invitations or messages are sent.</p>
    {error ? <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
  </Modal>
}
