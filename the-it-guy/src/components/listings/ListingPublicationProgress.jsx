import Button from '../ui/Button'
import { summarizeListingPortalError } from '../../services/listings/listingChannelUpdateState'

const labels = { publishing: 'Sending…', submitted: 'Request accepted', needs_attention: 'Needs attention', uncertain: 'Not confirmed' }

export default function ListingPublicationProgress({ results = [], busy = false, saved = false, title = '', listingStatus = '', channels = null, changesNotSent = false, unsavedChanges = false, retrySavesChanges = false, onRetry, onCheckStatus, onViewListing, onReview, onDismissChanges, onFollowUp, onDocuments, followUpLabel = 'Seller details' }) {
  if (!saved && !results.length) return null
  const failed = results.some(row => row.retryable)
  const pending = results.some(row => row.status === 'publishing')
  const uncertain = results.some(row => row.status === 'uncertain')
  const draft = listingStatus === 'draft'
  return <section aria-label="Saved listing and advertising" className="rounded-xl border border-[#dce6f2] bg-white p-4 text-sm">
    <h2 className="font-semibold text-[#243d56]">Listing saved</h2>
    {title ? <p className="mt-1 break-words font-medium text-[#243d56]">{title}</p> : null}
    <div role="status" aria-live="polite" className="mt-3 space-y-3 text-[#607387]">
      {draft ? <p>Saved as a draft. Finish the details before sending adverts.</p> : null}
      {unsavedChanges ? <p>Changes in this form have not been saved or sent. The results below are for the previous request.</p>
        : changesNotSent ? <p>Changes saved. This save did not update your public adverts. Review the advertising controls to send them.</p> : null}
      {!results.length && !draft && !changesNotSent ? <p>{channels?.some(key => ['property24', 'private_property', 'agency_website'].includes(key)) ? 'No advertising request is confirmed here. Review the saved listing before sending.' : channels ? 'Saved in Arch9. No websites selected.' : 'Saved in Arch9. Review advertising to choose websites and send when ready.'}</p> : null}
      {results.length ? <p className="font-semibold text-[#243d56]">{changesNotSent || unsavedChanges ? 'Previous advertising request' : 'Advertising results'}</p> : null}
      {results.map(row => <div key={row.key}>
        <p><strong>{row.label}</strong> · {row.jobState === 'queued' ? 'Queued' : row.status === 'publishing' && !row.jobId ? 'Confirming request…' : labels[row.status] || 'Not confirmed'}</p>
        <p className="mt-1">{row.status === 'submitted' ? 'The request was accepted. Check the public advert before treating it as live.' : row.status === 'publishing' && !row.jobId ? 'Waiting to confirm that your advertising request is saved. Keep this page open.' : row.jobState === 'queued' ? 'The request is saved and waiting to send. You can leave this page.' : row.status === 'publishing' ? 'The request is being sent. Wait for the result before sending again.' : summarizeListingPortalError(row.message) || 'Check status for the latest result.'}</p>
      </div>)}
      {pending && results.every(row => row.status !== 'publishing' || row.jobId) ? <p>Publishing continues after you leave this page.</p> : null}
      {failed ? <p>Your listing and successful channels are kept. Fix the details, then retry the failed channels. Successful channels will not be resent.</p> : null}
      {uncertain ? <p>Check status before sending again; the channel may have accepted it. An unconfirmed request will not be retried.</p> : null}
    </div>
    {changesNotSent && !unsavedChanges && onDismissChanges ? <button type="button" className="mt-2 text-[#35546c] underline" onClick={onDismissChanges}>Dismiss saved notice</button> : null}
    <div className="mt-4 flex flex-wrap gap-2">
      {failed && onRetry ? <Button type="button" disabled={busy || pending || (unsavedChanges && !retrySavesChanges)} onClick={onRetry}>{unsavedChanges && retrySavesChanges ? 'Save and retry failed channels' : 'Retry failed channels'}</Button> : null}
      {onCheckStatus ? <Button type="button" variant="secondary" disabled={busy} onClick={onCheckStatus}>{busy ? 'Checking…' : 'Check status'}</Button> : null}
      {onViewListing ? <Button type="button" variant="secondary" disabled={busy} onClick={onViewListing}>View listing</Button> : null}
      {onReview ? <Button type="button" variant="secondary" disabled={busy} onClick={onReview}>{draft ? 'Continue draft' : 'Review advertising'}</Button> : null}
    </div>
    {onFollowUp || onDocuments ? <div className="mt-4 border-t border-[#dce6f2] pt-3 text-[#607387]"><p>Owner details, invitations and documents are separate follow-ups. Check their progress separately from advertising.</p><div className="mt-2 flex flex-wrap gap-2">{onFollowUp ? <Button type="button" variant="secondary" disabled={busy} onClick={onFollowUp}>{followUpLabel}</Button> : null}{onDocuments ? <Button type="button" variant="secondary" disabled={busy} onClick={onDocuments}>Documents</Button> : null}</div></div> : null}
  </section>
}
