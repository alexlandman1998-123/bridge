import { useState } from 'react'
import { acceptSellerOnboardingDraftAnswer } from '../../services/listings/sellerOnboardingDraftReviewService.js'

export default function SellerOnboardingDraftDifferences({ listing, comparison, onSaved, onRequestCorrection, onReload, disabled = false }) {
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  if (!comparison?.differences?.length) return null
  const decisionsDisabled = disabled || comparison.awaitingResubmission || Boolean(saving)

  async function accept(key) {
    setSaving(key)
    setError('')
    try {
      const receipt = await acceptSellerOnboardingDraftAnswer({ listing, key })
      await onSaved(receipt)
    } catch (failure) {
      setError(failure.message || 'The decision could not be saved. Reload the seller details.')
    } finally {
      setSaving('')
    }
  }

  async function requestClarification(item) {
    setSaving(item.key)
    setError('')
    try {
      await onRequestCorrection(`Please confirm ${item.label.toLowerCase()}: the listing draft says ${item.draftValue}, and your onboarding says ${item.sellerValue}.`)
    } catch (failure) {
      setError(failure.message || 'Clarification could not be requested. Reload the seller details.')
    } finally {
      setSaving('')
    }
  }

  async function reload() {
    setSaving('reload')
    setError('')
    try { await onReload() } catch (failure) { setError(failure.message || 'The latest details could not be loaded.') }
    finally { setSaving('') }
  }

  return <section aria-label="Differences from the listing draft" className="rounded-[14px] border border-[#f2dfbd] bg-[#fff9ec] p-4">
    <h4 className="font-semibold text-[#243d56]">Seller answers differ from the listing draft</h4>
    <p className="mt-1 text-[#607387]">Check each difference before approving onboarding or publishing. Accept the seller’s answer, or ask the seller to clarify it.</p>
    {comparison.awaitingResubmission ? <p role="status" className="mt-2 text-[#76551a]">Waiting for the seller to resubmit. Review the updated answers when they return.</p> : null}
    {error ? <div role="alert" className="mt-3 text-[#b42318]"><p>{error}</p>{onReload ? <button type="button" disabled={Boolean(saving)} onClick={() => void reload()} className="mt-2 rounded-lg border border-[#dce6f2] bg-white px-3 py-2 text-xs font-semibold text-[#243d56]">Load latest seller details</button> : null}</div> : null}
    <ul className="mt-3 space-y-3">
      {comparison.differences.map(item => <li key={item.key} className="rounded-xl border border-[#e5dfd1] bg-white p-3">
        <p className="font-semibold text-[#243d56]">{item.label}</p>
        <dl className="mt-2 grid grid-cols-2 gap-3">
          <div><dt className="text-xs text-[#607387]">Agent’s draft</dt><dd className="mt-1 break-words font-medium">{String(item.draftValue)}</dd></div>
          <div><dt className="text-xs text-[#607387]">Seller’s answer</dt><dd className="mt-1 break-words font-medium">{item.sellerValue === '' ? 'Not supplied' : String(item.sellerValue)}</dd></div>
        </dl>
        {item.status === 'accepted' ? <p className="mt-3 text-xs text-[#176842]">Seller’s answer accepted</p> : <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={decisionsDisabled || !onSaved || item.sellerValue === ''} onClick={() => void accept(item.key)} className="rounded-lg bg-[#243d56] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving === item.key ? 'Saving…' : `Accept seller’s answer for ${item.label.toLowerCase()}`}</button>
          <button type="button" disabled={decisionsDisabled || !onRequestCorrection} onClick={() => void requestClarification(item)} className="rounded-lg border border-[#dce6f2] px-3 py-2 text-xs font-semibold text-[#243d56] disabled:opacity-50">Request clarification for {item.label.toLowerCase()}</button>
        </div>}
      </li>)}
    </ul>
  </section>
}
