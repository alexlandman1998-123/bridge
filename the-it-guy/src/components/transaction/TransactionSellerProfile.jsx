import { useEffect, useState } from 'react'
import { loadTransactionSellerProfile } from '../../services/transactionSellerProfileService.js'

const unavailable = {
  restricted: 'The full seller profile is restricted by your current access.',
  capture_required: 'Seller information has not been captured on the linked listing.',
  relationship_review_required: 'The seller relationship needs review before a current profile can be shown.',
  transaction_capture: 'This transaction has no linked listing profile. Its earlier seller capture needs review.',
}

export default function TransactionSellerProfile({ transactionId, refreshKey }) {
  const [loaded, setLoaded] = useState(null)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let active = true
    loadTransactionSellerProfile({ transactionId }).then((data) => { if (active) setLoaded({ transactionId, refreshKey, refresh, result: data }) })
      .catch((failure) => { if (active) setLoaded({ transactionId, refreshKey, refresh, error: failure.message }) })
    return () => { active = false }
  }, [transactionId, refreshKey, refresh])
  const current = loaded?.transactionId === transactionId && loaded?.refreshKey === refreshKey && loaded?.refresh === refresh ? loaded : null
  const result = current?.result
  const error = current?.error
  return <section aria-label="Current seller profile" className="mt-5 border-t border-borderDefault pt-5">
    <div className="flex items-center justify-between gap-3">
      <h4 className="font-semibold text-textStrong">Saved seller profile</h4>
      <button type="button" onClick={() => setRefresh((value) => value + 1)} className="rounded-control border border-borderDefault px-3 py-2 text-sm">Refresh profile</button>
    </div>
    {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : !result ? <p role="status" className="mt-3 text-sm text-textMuted">Loading seller profile…</p> : !result.model ? <p role="status" className="mt-3 text-sm text-textMuted">{unavailable[result.status] || 'Seller profile unavailable.'}</p> : <>
      <p className="mt-2 text-sm text-textMuted">{result.status === 'current' ? 'Current saved details from the linked listing.' : 'Saved details captured for this transaction.'}</p>
      {result.model.pendingReview ? <p role="status" className="mt-2 text-sm text-warning">Changes are awaiting review. Saved details remain shown.</p> : null}
      {result.model.requiresPersonReview ? <p role="status" className="mt-2 text-sm text-warning">Some saved person references need review before linking people across the journey.</p> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2">{result.model.groups.map((group) => <div key={group.key}>
        <h5 className="text-sm font-semibold text-textStrong">{group.title}</h5>
        <dl className="mt-2 space-y-2">{group.rows.map((row) => <div key={row.key} className="grid grid-cols-2 gap-3 text-sm">
          <dt className="text-textMuted">{row.label}</dt><dd className="break-words text-textStrong">{row.displayValue}</dd>
        </div>)}</dl>
      </div>)}</div>
    </>}
  </section>
}
