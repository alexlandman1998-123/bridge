import { useEffect, useRef, useState } from 'react'
import { Landmark, Scale } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'

export const ALLOCATION_SLOW_MS = 30_000

function startAllocationSave(pendingSaves, requestKey, roleType, selected, onAllocate) {
  const request = { roleType, optionId: selected.id, startedAt: Date.now(), promise: null }
  pendingSaves.current.set(requestKey, request)
  let operation
  try {
    operation = Promise.resolve(onAllocate(roleType, selected))
  } catch (error) {
    operation = Promise.reject(error)
  }
  request.promise = operation.then(() => ({ ok: true }), error => ({ ok: false, error })).then(result => {
    if (pendingSaves.current.get(requestKey) === request) pendingSaves.current.delete(requestKey)
    return result
  })
  return request
}

export default function TransactionRoleAllocationDialog({ roles, initialRoleType, loading = false, loadError = '', onRetry, onAllocate, onClose, pendingSavesRef, requestKey = 'transaction' }) {
  const ownPendingSaves = useRef(new Map())
  const pendingSaves = pendingSavesRef || ownPendingSaves
  const [attempt, setAttempt] = useState(null)
  const [roleType, setRoleType] = useState(initialRoleType || roles[0]?.key || '')
  const [optionId, setOptionId] = useState('')
  const busy = Boolean(attempt)
  const [delayed, setDelayed] = useState(false)
  const [error, setError] = useState('')
  const role = roles.find((item) => item.key === roleType)
  const options = role?.options || []
  const selected = options.find((option) => option.id === optionId)
  const RoleIcon = roleType === 'bond_originator' ? Landmark : Scale
  const groups = [...new Set(options.map((option) => option.group || 'Available firms'))]

  useEffect(() => {
    const existing = pendingSaves.current.get(requestKey)
    if (existing) {
      // Restore the external in-flight request once when this modal reopens.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAttempt(existing)
      setRoleType(existing.roleType)
      setOptionId(existing.optionId)
    }
  }, [pendingSaves, requestKey])

  useEffect(() => {
    if (!attempt) return undefined
    let mounted = true
    const timeout = setTimeout(() => setDelayed(true), Math.max(0, ALLOCATION_SLOW_MS - (Date.now() - attempt.startedAt)))
    attempt.promise.then(result => {
      if (!mounted) return
      clearTimeout(timeout)
      setAttempt(null)
      setDelayed(false)
      if (result.ok) onClose()
      else setError(result.error?.message || 'The allocation could not be saved. Please try again.')
    })
    return () => { mounted = false; clearTimeout(timeout) }
  }, [attempt, onClose])

  function handleSave() {
    if (busy || !selected) return
    // The parent retains this request across dialog reopening. A slow request
    // is still in flight; closing the window must never start another write.
    const existing = pendingSaves.current.get(requestKey)
    if (existing) { setAttempt(existing); setRoleType(existing.roleType); setOptionId(existing.optionId); return }
    setError('')
    setDelayed(false)
    setAttempt(startAllocationSave(pendingSaves, requestKey, roleType, selected, onAllocate))
  }

  const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:opacity-60'
  return <Modal open title="Allocate transaction professional" onClose={busy && !delayed ? undefined : onClose} className="max-w-xl" footer={
    <div className="flex justify-end gap-3"><Button variant="secondary" onClick={onClose} disabled={busy && !delayed}>{delayed ? 'Close and check transaction' : 'Cancel'}</Button><Button onClick={handleSave} disabled={busy || loading || !selected}>{busy ? delayed ? 'Allocation pending' : 'Saving allocation…' : 'Save allocation'}</Button></div>
  }>
    <div className="space-y-5 p-5">
      <div className="flex items-start gap-3"><span className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><RoleIcon size={22} aria-hidden="true" /></span><div><h4 className="font-semibold text-slate-900">Add the firm handling this transaction</h4><p className="mt-1 text-sm leading-6 text-slate-500">Buyer onboarding stays as it is. No message is sent to the buyer.</p></div></div>
      <label className="grid gap-2 text-sm font-medium text-slate-700">Transaction role<select className={inputClass} value={roleType} disabled={busy} onChange={(event) => { setRoleType(event.target.value); setOptionId(''); setError('') }}>{roles.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-slate-700">Firm<select className={inputClass} value={optionId} disabled={busy || loading} onChange={(event) => { setOptionId(event.target.value); setError('') }}><option value="">{loading ? 'Loading firms…' : 'Choose a firm'}</option>{groups.map((group) => <optgroup key={group} label={group}>{options.filter((option) => (option.group || 'Available firms') === group).map((option) => <option value={option.id} key={option.id}>{option.label || option.companyName || option.contactPerson || option.email}</option>)}</optgroup>)}</select></label>
      {loadError ? <div role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700"><p>{loadError}</p><Button type="button" variant="secondary" className="mt-3" disabled={busy || loading} onClick={onRetry}>Reload firms</Button></div> : null}
      {selected ? <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4"><strong className="text-sm text-slate-800">{selected.companyName || selected.contactPerson}</strong>{selected.contactPerson && selected.companyName !== selected.contactPerson ? <p className="mt-1 text-sm text-slate-600">{selected.contactPerson}</p> : null}{selected.email ? <p className="mt-1 break-words text-sm text-slate-500">{selected.email}</p> : null}</div> : null}
      {!loading && !loadError && !options.length ? <p className="text-sm text-slate-500">Add or connect a firm under Partners, then return to allocate it here.</p> : null}
      {delayed ? <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This allocation is taking longer than expected. You can close this window and check the transaction team. The save may still complete; another allocation cannot be submitted while this request is pending.</p> : null}
      {error ? <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    </div>
  </Modal>
}
