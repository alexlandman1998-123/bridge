import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import Button from '../ui/Button'
import Field from '../ui/Field'
import Modal from '../ui/Modal'
import { summarizeListingPortalError } from '../../services/listings/listingChannelUpdateState'

export default function ListingChannelManageDialog({ channelName, listingStatus, expiryDate = '', minExpiryDate, isSale = true, canUpdateExpiry = true, initialResults = [], onClose, onSave, onFix }) {
  const [status, setStatus] = useState(listingStatus)
  const [expiry, setExpiry] = useState(expiryDate)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialResults.length ? 'Some updates need attention. Your saved changes are kept.' : '')
  const [results, setResults] = useState(initialResults)
  const supportsExpiry = channelName === 'Property24' && canUpdateExpiry
  const failed = results.filter((result) => result.status === 'failed')
  const retryable = failed.some((result) => result.channel !== 'Activity')
  const changed = status !== listingStatus || supportsExpiry && expiry !== expiryDate
  async function save() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const outcome = await onSave({ listingStatus: status, expiryDate: expiry, retryResults: results.length ? failed : [] })
      if (outcome?.ok) onClose()
      else {
        setResults(outcome?.results || [])
        setError(outcome?.error || 'Some updates need attention. Your saved changes are kept.')
      }
    } catch (saveError) {
      setError(saveError?.message || 'The listing could not be updated. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return <Modal open title="Manage listing" subtitle={channelName} className="!max-w-lg" onClose={busy ? undefined : onClose}
    footer={<div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
      {!results.length || retryable ? <Button type="button" disabled={busy || !changed && !retryable} onClick={() => void save()}>{busy ? <Loader2 size={15} className="animate-spin" /> : null}{busy ? 'Updating…' : retryable ? 'Retry failed updates' : 'Save changes'}</Button> : null}
    </div>}>
    <div className="grid gap-5">
      {supportsExpiry ? <label className="grid gap-2 text-sm font-semibold text-[#243d56]">Listing expiry date<Field type="date" min={minExpiryDate} value={expiry} disabled={busy || results.length > 0} onChange={(event) => setExpiry(event.target.value)} /></label> : null}
      {isSale ? <label className="grid gap-2 text-sm font-semibold text-[#243d56]">Listing status<Field as="select" value={status} disabled={busy || results.length > 0} onChange={(event) => setStatus(event.target.value)}>
        {listingStatus === 'withdrawn' ? <option value="withdrawn">Withdrawn</option> : null}
        <option value={['under_offer', 'sold', 'withdrawn'].includes(listingStatus) ? 'active' : listingStatus} disabled={['under_offer', 'sold', 'withdrawn'].includes(listingStatus)}>For sale</option>
        <option value="under_offer" disabled={['sold', 'withdrawn'].includes(listingStatus)}>Under offer</option>
        <option value="sold" disabled={listingStatus === 'withdrawn'}>Sold</option>
      </Field></label> : null}
      <p className="text-sm leading-6 text-[#607387]">{isSale ? 'Sold and Under offer update all active channels. ' : ''}{supportsExpiry ? 'The expiry date applies only to Property24. ' : ''}Publish listing content from listing setup.</p>
      {error ? <div role="alert" className="rounded-xl border border-[#f3c9c9] bg-[#fff5f5] p-3 text-sm text-[#a43d35]">
        <p>{summarizeListingPortalError(error)}</p>
        {failed.length ? <ul className="mt-2 space-y-2">{failed.map((result) => <li key={result.channel}><strong>{result.channel}:</strong> {summarizeListingPortalError(result.detail)}</li>)}</ul> : null}
        {!results.length && onFix ? <button type="button" onClick={onFix} className="mt-2 font-semibold underline">Edit listing details</button> : null}
      </div> : null}
    </div>
  </Modal>
}
