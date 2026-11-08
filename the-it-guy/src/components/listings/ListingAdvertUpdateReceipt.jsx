import { listingPublicationReceipt } from '../../services/listings/listingChannelUpdateState'

// Render inside the existing channel row, never as another saved-listing card.
export default function ListingAdvertUpdateReceipt({ result, busy = false, dirty = false, onRetry, onCheck, onFix }) {
  if (!result) return null
  const receipt = result.notSent ? { label: 'Not sent', message: result.message } : result.status === 'skipped' ? { label: 'Not updated', message: result.message } : listingPublicationReceipt(result)
  return <div className="basis-full space-y-2 text-sm" aria-label={`${result.label} update`}>
    {result.previous ? <p className="text-xs">Previous advertising request</p> : null}
    <p role="status"><strong>{receipt.label}</strong>{receipt.message ? ` · ${receipt.message}` : ''}</p>
    {result.jobId && ['needs_attention', 'uncertain'].includes(result.status) ? <p className="text-xs">Support reference: <code>{result.jobId}</code></p> : null}
    <div className="flex flex-wrap gap-3">
      {result.retryable && onRetry ? <button type="button" disabled={busy} className="font-semibold underline disabled:opacity-50" onClick={onRetry}>{dirty ? 'Save & retry' : 'Retry'} {result.label}</button> : null}
      {['uncertain', 'publishing'].includes(result.status) && onCheck ? <button type="button" disabled={busy} className="font-semibold underline disabled:opacity-50" onClick={onCheck}>Check {result.label} status</button> : null}
      {result.status === 'needs_attention' && onFix ? <button type="button" disabled={busy} className="font-semibold underline disabled:opacity-50" onClick={onFix}>Fix {result.label} details</button> : null}
    </div>
  </div>
}
