import Button from '../ui/Button'
import { summarizeListingPortalError } from '../../services/listings/listingChannelUpdateState'

const labels = { publishing: 'Sending…', submitted: 'Submitted', needs_attention: 'Could not publish', uncertain: 'Not confirmed' }

export default function ListingPublicationProgress({ results = [], busy = false, onRetry, onCheckStatus, onViewListing }) {
  if (!results.length) return null
  const failed = results.some(row => row.retryable)
  const pending = results.some(row => row.status === 'publishing')
  const uncertain = results.some(row => row.status === 'uncertain')
  return <section aria-label="Publishing progress" className="rounded-xl border border-[#dce6f2] bg-white p-4 text-sm">
    <p className="font-semibold text-[#243d56]">Publishing</p>
    <div role="status" aria-live="polite" className="mt-3 space-y-3">
      {results.map(row => <div key={row.key}>
        <p><strong>{row.label}</strong> · {labels[row.status] || 'Not confirmed'}</p>
        {row.message ? <p className="mt-1 text-[#607387]">{summarizeListingPortalError(row.message)}</p> : null}
      </div>)}
    </div>
    {failed || uncertain ? <p className="mt-3 text-[#607387]">Your listing is saved. {uncertain ? 'Check status before sending again; the channel may have accepted it.' : 'Fix any details above, then retry the failed channels. Successful channels will not be resent.'}</p> : null}
    <div className="mt-4 flex flex-wrap gap-2">
      {failed ? <Button type="button" disabled={busy || pending} onClick={onRetry}>Retry failed channels</Button> : null}
      {onCheckStatus ? <Button type="button" variant="secondary" disabled={busy} onClick={onCheckStatus}>{busy ? 'Checking…' : 'Check status'}</Button> : null}
      {onViewListing ? <Button type="button" variant="secondary" onClick={onViewListing}>View listing</Button> : null}
    </div>
  </section>
}
