import SharedLegalJourney from './SharedLegalJourney'
import { useState } from 'react'

// Observe the persisted journey; never reconstruct tasks from a fallback template.
export default function AgentConveyancingJourney({ result, loading = false, onOpenActivity, partnerOptions = [], canAssignPartner = false, partnerPending = false, assignedPartner = '', onAssignPartner }) {
  const [partnerId, setPartnerId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const hasJourney = result?.status === 'ready' && result.snapshot?.lanes?.length > 0

  async function assignPartner(event) {
    event.preventDefault()
    const option = partnerOptions.find((item) => item.id === partnerId)
    if (!option || !onAssignPartner) return
    setSaving(true); setError(''); setMessage('')
    try {
      await onAssignPartner(option)
      setMessage('Transfer firm nominated. The firm can accept the instruction and allocate its attorney before legal work appears here.')
    } catch (saveError) { setError(saveError.message || 'Transfer partner could not be allocated.') }
    finally { setSaving(false) }
  }

  return <section className="space-y-4" data-agent-conveyancing>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold text-textStrong">Conveyancing</h2>
      <button type="button" onClick={onOpenActivity} className="rounded-lg border border-borderDefault bg-white px-4 py-2 text-sm font-semibold text-textStrong focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">View updates</button>
    </header>
    {!loading && !hasJourney && canAssignPartner ? <form onSubmit={assignPartner} className="space-y-3 rounded-xl border border-borderDefault bg-white p-4">
      <h3 className="font-semibold text-textStrong">Allocate a transfer partner</h3>
      <p className="text-sm text-textMuted">Use this when the transaction was imported partway through the process. The partner can be allocated before buyer onboarding.</p>
      {assignedPartner ? <p className="text-sm text-textMuted">Current partner: <strong className="text-textStrong">{assignedPartner}</strong></p> : null}
      <div className="flex flex-wrap gap-2">
        <label className="min-w-[16rem] flex-1 text-sm font-medium text-textMuted">Transfer partner<select value={partnerId} onChange={(event) => setPartnerId(event.target.value)} disabled={saving} className="mt-1 w-full rounded-control border border-borderDefault bg-white p-2"><option value="">Select a partner…</option>{partnerOptions.map((option) => <option key={option.id} value={option.id}>{option.companyName || option.contactPerson || option.email}</option>)}</select></label>
        <button type="submit" disabled={!partnerId || saving} className="self-end rounded-control bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Allocating…' : 'Allocate partner'}</button>
      </div>
      {!partnerOptions.length ? <p className="text-sm text-textMuted">No transfer partners are available. Add one in Partners, then return here.</p> : null}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {message ? <p role="status" className="text-sm text-success">{message}</p> : null}
    </form> : null}
    {!loading && !hasJourney && partnerPending ? <p role="status" className="rounded-xl border border-borderDefault bg-white p-4 text-sm text-textMuted">Transfer partner: {assignedPartner || 'Nominated firm'}. The legal workflow is still pending; check the firm’s instruction status in Roleplayers.</p> : null}
    {loading && result?.status !== 'ready'
      ? <p role="status" className="rounded-xl border border-borderDefault bg-white p-4 text-sm text-textMuted">Loading legal journey…</p>
      : <SharedLegalJourney result={result} showConversation={false} />}
  </section>
}
