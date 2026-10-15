import { useEffect, useId, useRef, useState } from 'react'
import { CalendarDays, CheckCircle2, ExternalLink, Eye, History, Home, Loader2, Pencil, RefreshCw, Send, TriangleAlert, X } from 'lucide-react'
import Button from '../ui/Button'
import { listingExpiryError } from '../../services/listings/listingExpiryModel.js'
import Field from '../ui/Field'
import Modal from '../ui/Modal'
import { summarizeListingPortalError } from '../../services/listings/listingChannelUpdateState'
import { normalizeListingChannelPublicUrl, validateListingPortalPublicUrl } from '../../services/listings/listingMarketingChannelPresentation'

function timestamp(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not recorded'
  return new Date(value).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'medium', timeStyle: 'short' })
}

function ErrorDetail({ message }) {
  const summary = summarizeListingPortalError(message)
  return <div className="min-w-0 break-words"><p>{summary}</p>{summary !== message ? <details className="mt-2 text-xs"><summary className="cursor-pointer font-semibold">Technical details</summary><pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-white/60 p-2 [overflow-wrap:anywhere]">{message}</pre></details> : null}</div>
}

export default function ListingChannelManageDialog({
  channelName, listingStatus, listing = {}, portal = {}, expiryDate = '', minExpiryDate,
  isSale = true, canUpdateExpiry = false, initialResults = [], externalBusy = false,
  canUpdate = false, canPublish = false, canRelist = false, canWithdraw = false, expirySetting, activeExpiryChannels = [], preparationMessage = '',
  onClose, onSave, onFix, onRefresh, onPreview, onUpdate, onPublish, onRetry, onRelist, onWithdraw, onSaveExpiry, onVerify, onSavePublicUrl,
  renderChannelSettings, confirmWithdrawal = false, updateUnavailableMessage = '',
}) {
  const id = useId()
  const operationRef = useRef(false)
  const feedbackRef = useRef(null)
  const [tab, setTab] = useState('overview')
  const [action, setAction] = useState('')
  const [status, setStatus] = useState(listingStatus)
  const [expiry, setExpiry] = useState(expiryDate)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [publicUrlDraft, setPublicUrlDraft] = useState(portal.publicUrl || '')
  const [results, setResults] = useState(initialResults)
  const disabled = busy || externalBusy
  const supportsExpiry = Boolean(onSaveExpiry)
  const isPortal = ['Property24', 'Private Property'].includes(channelName)
  const failed = results.filter(row => row.status === 'failed')
  const saleRetry = failed.some(row => ['sold', 'under_offer', 'expiry'].includes(row.action))
  const publicUrl = normalizeListingChannelPublicUrl(portal.publicUrl)
  const issues = [...new Set([...(portal.issues || []), portal.publicationState?.failureDetail].filter(message => message && message !== error))]
  const warnings = portal.warnings || []
  const changes = portal.publicationState?.changes || []
  const stage = portal.publicationState?.stage
  const canChangeSale = isSale && !['sold', 'withdrawn', 'expired', 'archived', 'transaction_created', 'deleted'].includes(listingStatus)

  useEffect(() => {
    if (progress || error || notice) feedbackRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [progress, error, notice])

  async function run(callback, success, progressMessage = 'Working…') {
    if (operationRef.current || externalBusy) return
    operationRef.current = true
    setBusy(true)
    setProgress(progressMessage)
    setError('')
    setNotice('')
    try {
      const outcome = await callback()
      if (outcome?.deferred) { onClose(); return }
      if (outcome?.results) setResults(outcome.results)
      if (outcome?.ok === false) {
        setError(outcome.error || 'Some updates need attention. Your saved changes are kept.')
      } else {
        setAction('')
        setNotice(outcome?.message || success)
      }
    } catch (failure) {
      setError(failure?.message || 'This action could not be completed. Check the channel before trying again.')
    } finally {
      operationRef.current = false
      setBusy(false)
      setProgress('')
    }
  }

  function begin(nextAction) {
    setAction(nextAction)
    setError('')
    setNotice('')
    setStatus(listingStatus)
    setExpiry(expiryDate)
  }

  async function saveExpiry(applyToAllChannels) {
    await run(() => onSaveExpiry({ expiryDate: expiry, applyToAllChannels }), 'Listing expiry saved.', 'Saving listing expiry…')
  }

  async function save() {
    await run(() => onSave({
      listingStatus: action === 'expiry' ? listingStatus : status,
      expiryDate: action === 'status' ? expiryDate : expiry,
      retryResults: saleRetry ? failed : [],
    }), action === 'expiry' ? 'Property24 expiry update accepted. Check the advert to confirm it.' : 'Listing status saved. Channel results are shown below.', 'Saving listing status and updating active channels…')
  }

  return <Modal open title={`Manage ${channelName} listing`} subtitle="Listing · Marketing" className="!max-w-3xl" onClose={disabled ? undefined : onClose}
    footer={<div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[#607387]">Content updates and withdrawal apply to {channelName}.{supportsExpiry ? ' Expiry can apply to all active channels.' : ''}</p><Button type="button" variant="secondary" disabled={disabled} onClick={onClose}>Done</Button></div>}>
    <div className="grid gap-5" aria-busy={disabled}>
      <div className="flex items-center gap-3">
        {listing.imageUrl ? <img src={listing.imageUrl} alt="" className="h-16 w-20 shrink-0 rounded-xl object-cover" /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#eaf6f0] text-[#176f52]"><Home size={24} /></span>}
        <div className="min-w-0"><h3 className="break-words font-semibold text-[#142132]">{listing.address || listing.title || 'Property listing'}</h3><p className="text-sm text-[#607387]">{listing.priceLabel || 'Price not recorded'}{listing.reference ? ` · ${listing.reference}` : ''}</p><p className="mt-1 text-xs text-[#607387]">Arch9 listing status: <strong className="font-semibold text-[#243d56]">{listing.statusLabel || listingStatus?.replace(/_/g, ' ')}</strong></p></div>
      </div>
      <div ref={feedbackRef}>
        {disabled ? <p role="status" aria-live="polite" className="flex items-center gap-2 rounded-xl border border-[#dbe6f2] bg-[#eef5fc] p-3 text-sm text-[#315b82]"><Loader2 size={16} className="shrink-0 animate-spin" />{progress || 'A channel update is in progress…'}</p> : null}
        {error ? <div role="alert" className="rounded-xl border border-[#efc4c4] bg-[#fff5f5] p-3 text-sm text-[#a43d35]"><ErrorDetail message={error} /></div> : null}
        {notice ? <p role="status" aria-live="polite" className="rounded-xl border border-[#cfe7d7] bg-[#eef9f2] p-3 text-sm text-[#257044]">{notice}</p> : null}
      </div>
      <div role="tablist" aria-label={`${channelName} listing sections`} className="flex gap-5 border-b border-[#e3ebf2]">
        {[['overview', 'Overview'], ['activity', 'Recent activity']].map(([key, label]) => <button key={key} id={`${id}-${key}-tab`} type="button" role="tab" aria-selected={tab === key} aria-controls={`${id}-${key}`} className={`pb-3 text-sm font-semibold ${tab === key ? 'border-b-2 border-[#176f52] text-[#176f52]' : 'text-[#607387]'}`} onClick={() => setTab(key)}>{key === 'activity' ? <History size={14} className="mr-1.5 inline" /> : null}{label}</button>)}
      </div>
      <div id={`${id}-overview`} role="tabpanel" aria-labelledby={`${id}-overview-tab`} hidden={tab !== 'overview'}>
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_190px]">
          <div className="min-w-0 space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-[#e3ebf2] p-4 text-sm">
              <div><p className="text-xs text-[#607387]">Portal status</p><p className="mt-1 font-semibold text-[#243d56]">{portal.statusLabel || 'Not checked yet'}</p></div>
              <div><p className="text-xs text-[#607387]">Advert reference</p><p className="mt-1 break-all font-semibold text-[#243d56]">{portal.reference || 'Not assigned'}</p></div>
              <div><p className="text-xs text-[#607387]">Last sent</p><p className="mt-1 text-xs text-[#243d56]">{timestamp(portal.publicationState?.submittedAt)}</p></div>
              <div><p className="text-xs text-[#607387]">Last status check</p><p className="mt-1 text-xs text-[#243d56]">{timestamp(portal.checkedAt)}</p></div>
            </div>
            {expiryDate ? <div className="rounded-xl bg-[#f6f9fb] p-3 text-sm text-[#243d56]"><p>Listing expiry: <strong>{expiryDate}</strong></p>{expirySetting?.message ? <p className="mt-1 text-xs text-[#607387]">{expirySetting.message}</p> : null}{['update_failed', 'update_uncertain', 'expiry_failed', 'expiry_uncertain'].includes(expirySetting?.state) ? <p role="alert" className="mt-2 text-xs text-[#a43d35]">Expiry needs attention on this channel. Check the latest status before trying again.</p> : null}</div> : null}
            {onSavePublicUrl ? <details className="rounded-xl border border-[#e3ebf2] p-3" open={!publicUrl}><summary className="cursor-pointer text-sm font-semibold text-[#243d56]">{publicUrl ? 'Edit live portal link' : 'Add live portal link'}</summary><label className="mt-3 grid gap-2 text-sm font-semibold text-[#243d56]">Live portal link<Field type="url" value={publicUrlDraft} placeholder={channelName === 'Property24' ? 'https://www.property24.com/for-sale/…' : 'https://www.privateproperty.co.za/for-sale/…'} disabled={disabled} onChange={event => setPublicUrlDraft(event.target.value)} /></label><p className="mt-2 text-xs leading-5 text-[#607387]">Paste this advert’s public {channelName} URL. Saving the link does not publish the advert or confirm it is live.</p><Button type="button" variant="secondary" size="sm" className="mt-3" disabled={disabled || !publicUrlDraft.trim() || publicUrlDraft.trim() === publicUrl} onClick={() => void run(() => onSavePublicUrl(validateListingPortalPublicUrl(channelName === 'Property24' ? 'property24' : 'private_property', publicUrlDraft)), 'Live portal link saved.', 'Saving live portal link…')}>Save link</Button></details> : null}
            <div className="flex flex-wrap gap-2">{onRefresh ? <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => void run(onRefresh, 'Latest channel status checked.', `Checking ${channelName} status…`)}><RefreshCw size={14} className={busy && progress === `Checking ${channelName} status…` ? 'animate-spin' : ''} />Check latest status</Button> : null}{publicUrl ? <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-[#dbe6f2] px-3 py-2 text-sm font-semibold text-[#35546c]">View advert<ExternalLink size={14} /></a> : <p className="self-center text-xs text-[#607387]">Public listing link unavailable</p>}</div>
            {['submitted', 'accepted'].includes(stage) ? <p className="rounded-xl bg-[#eef5fc] p-3 text-sm text-[#315b82]">{stage === 'submitted' ? 'Submission recorded. The final portal response is not confirmed; check status before sending again.' : 'The portal accepted the last submission. Check the public advert to confirm its content.'}</p> : null}
            {issues.length ? <div role="alert" className="rounded-xl border border-[#f0d6af] bg-[#fff8eb] p-3 text-sm text-[#8a5711]"><h4 className="mb-2 flex items-center gap-2 font-semibold"><TriangleAlert size={16} />{channelName} needs attention</h4><div className="space-y-2">{issues.map(message => <ErrorDetail key={message} message={message} />)}</div><div className="mt-3 flex flex-wrap gap-2">{onFix ? <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={onFix}>Edit listing details</Button> : null}{onRetry ? <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => begin('retry')}>Retry failed update</Button> : null}</div></div> : null}
            {preparationMessage ? <p className="rounded-xl border border-[#dbe6f2] bg-[#eef5fc] p-3 text-sm leading-6 text-[#315b82]">{preparationMessage}</p> : null}
            {warnings.length ? <details className="rounded-xl bg-[#f7f9fc] p-3 text-sm text-[#607387]" open><summary className="cursor-pointer font-semibold">Warnings ({warnings.length})</summary><ul className="mt-2 space-y-1 pl-4 list-disc">{warnings.map(message => <li key={message}>{summarizeListingPortalError(message)}</li>)}</ul></details> : null}
            {renderChannelSettings?.({ disabled, run })}
            <div className="rounded-xl bg-[#f6f9fb] p-4"><h4 className="text-sm font-semibold text-[#243d56]">Saved changes</h4>{changes.length ? <><p className="mt-1 text-xs text-[#607387]">Different from the last accepted submission.</p><details className="mt-2 text-sm text-[#243d56]"><summary className="cursor-pointer font-semibold">Review changes ({changes.length})</summary><ul className="mt-3 space-y-3">{changes.map(change => <li key={change.key}><strong>{change.label}</strong><p className="mt-1 break-words text-xs text-[#607387]">{change.previousValue} → {change.currentValue}</p></li>)}</ul></details></> : <p className="mt-1 text-xs text-[#607387]">{portal.publicationState?.publishedSnapshot ? 'No changes since the last accepted submission.' : 'No earlier submission snapshot is available for comparison.'}</p>}</div>
            {onVerify && publicUrl ? <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => begin('verify')}><CheckCircle2 size={14} />Confirm public advert is current</Button> : null}
          </div>
          <aside className="grid content-start gap-2 border-t border-[#e3ebf2] pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0 [&_button]:h-auto [&_button]:min-h-10 [&_button]:whitespace-normal [&_button]:px-3 [&_button]:py-2 [&_button]:text-xs"><h4 className="mb-1 text-sm font-semibold text-[#142132]">Advert actions</h4>
            {onPublish ? <Button type="button" className="justify-start" disabled={disabled || !canPublish} onClick={() => begin('publish')}><Send size={15} />{isPortal ? 'Publish advert' : 'Publish to website'}</Button> : null}
            {onUpdate ? <Button type="button" className="justify-start" disabled={disabled || !canUpdate} onClick={() => begin('update')}><Send size={15} />Update advert</Button> : null}
            {onFix ? <Button type="button" variant="secondary" className="justify-start" disabled={disabled} onClick={onFix}><Pencil size={15} />{portal.reference ? 'Edit listing details' : 'Set up advert'}</Button> : null}
            {onPreview ? <Button type="button" variant="secondary" className="justify-start" disabled={disabled} onClick={() => void run(onPreview, 'Listing requirements checked. Review any issues above.', `Checking ${channelName} requirements…`)}><Eye size={15} />Check requirements</Button> : null}
            {onRelist ? <Button type="button" variant="secondary" className="justify-start" disabled={disabled || !canRelist} onClick={onRelist}><RefreshCw size={15} />Relist / reactivate</Button> : null}
            {supportsExpiry ? <Button type="button" variant="secondary" className="justify-start" disabled={disabled || !canUpdateExpiry} onClick={() => begin('expiry')}><CalendarDays size={15} />Listing expiry</Button> : null}
            {onWithdraw ? <Button type="button" variant="secondary" className="justify-start text-[#a43d35]" disabled={disabled || !canWithdraw} onClick={confirmWithdrawal ? () => begin('withdraw') : onWithdraw}><X size={15} />Withdraw advert</Button> : null}
            {isSale ? <><h4 className="mt-4 text-sm font-semibold text-[#142132]">Whole listing</h4><p className="mb-1 text-xs leading-5 text-[#607387]">Sold and Under offer update all active channels.</p><Button type="button" variant="secondary" className="justify-start" disabled={disabled || !canChangeSale} onClick={() => begin('status')}>Change listing status</Button></> : null}
            {onUpdate && !canUpdate && portal.reference ? <p className="text-xs leading-5 text-[#607387]">{updateUnavailableMessage || (onRelist ? 'An inactive advert may need relisting before content updates can be sent.' : 'Publish this advert from listing setup before sending an update.')}</p> : null}
          </aside>
        </div>
      </div>
      <div id={`${id}-activity`} role="tabpanel" aria-labelledby={`${id}-activity-tab`} hidden={tab !== 'activity'}>
        {portal.activityUnavailable ? <p role="alert" className="text-sm text-[#8a5711]">Recent activity could not be loaded. Check latest status before sending again.</p> : portal.activity?.length ? <ul className="divide-y divide-[#e3ebf2]">{portal.activity.map((event, index) => <li key={event.id || index} className="py-3 text-sm"><p className="font-semibold text-[#243d56]">{event.title}</p><p className="mt-1 text-xs text-[#607387]">{timestamp(event.at)}{event.by ? ` · ${event.by}` : ''}</p>{event.detail ? <div className="mt-1 text-xs text-[#607387]"><ErrorDetail message={event.detail} /></div> : null}</li>)}</ul> : <p className="text-sm text-[#607387]">No activity recorded for this channel yet.</p>}
      </div>
      {action ? <section className="rounded-xl border border-[#dbe6f2] bg-[#fbfdff] p-4">
        {action === 'withdraw' ? <><h4 className="font-semibold text-[#243d56]">Withdraw from {channelName}?</h4><p className="mt-2 text-sm leading-6 text-[#607387]">Remove this rental advert from {channelName}. Other channels and the saved listing remain available.</p></> : null}
        {action === 'status' ? <><h4 className="font-semibold text-[#243d56]">Change whole-listing status</h4><label className="mt-3 grid gap-2 text-sm font-semibold text-[#243d56]">Listing status<Field as="select" value={status} disabled={disabled || saleRetry} onChange={event => setStatus(event.target.value)}><option value={listingStatus}>{listing.statusLabel || listingStatus?.replace(/_/g, ' ')}</option>{listingStatus !== 'under_offer' ? <option value="under_offer">Under offer</option> : null}<option value="sold">Sold</option></Field></label><p className="mt-2 text-sm text-[#607387]">This changes the listing in Arch9 and updates every active channel, including websites. Results will be shown separately.</p></> : null}
        {action === 'expiry' ? <><h4 className="font-semibold text-[#243d56]">Listing expiry</h4><label className="mt-3 grid gap-2 text-sm font-semibold text-[#243d56]">Listing expiry date<Field type="date" min={minExpiryDate} value={expiry} disabled={disabled} onChange={event => setExpiry(event.target.value)} /></label><p className="mt-2 text-sm text-[#607387]">Choose the last day this advert should be advertised. Removal follows the selected platform; websites are removed at the end of this day in South African time.</p></> : null}
        {action === 'expiry_scope' ? <><h4 className="font-semibold text-[#243d56]">Apply this expiry to all other active channels?</h4><p className="mt-2 text-sm text-[#607387]">Expiry date: <strong>{expiry}</strong></p><p className="mt-2 text-sm text-[#607387]">{activeExpiryChannels.join(', ') || channelName}. Inactive adverts will stay inactive.</p><div className="mt-4 flex flex-wrap gap-2"><Button type="button" disabled={disabled} onClick={() => void saveExpiry(true)}>Apply to all active channels</Button><Button type="button" variant="secondary" disabled={disabled} onClick={() => void saveExpiry(false)}>Only {channelName}</Button></div></> : null}
        {['publish', 'update', 'retry', 'verify'].includes(action) ? <><h4 className="font-semibold text-[#243d56]">{action === 'publish' ? `Publish to ${channelName}?` : action === 'verify' ? 'Confirm public advert' : action === 'retry' ? `Retry ${channelName} update?` : `Update ${channelName} advert?`}</h4><p className="mt-2 text-sm leading-6 text-[#607387]">{action === 'publish' ? isPortal ? `Submit the saved listing details and photos to ${channelName}. Check latest status after sending to confirm the public advert.` : `Make this listing visible on ${channelName}. Arch9 saves its public details and prepares website copies of the photos automatically. Other channels stay as they are.` : action === 'verify' ? `Confirm that you opened the ${channelName} public advert and checked that the latest submitted details are visible.` : `Send the saved ${action === 'retry' ? 'failed change' : 'listing details and photos'} to this existing advert. Other channels will not receive a content update.`}</p></> : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={disabled} onClick={() => setAction(action === 'expiry_scope' ? 'expiry' : '')}>{action === 'expiry_scope' ? 'Back' : 'Cancel'}</Button>{action !== 'expiry_scope' ? <Button type="button" disabled={disabled || action === 'status' && status === listingStatus && !saleRetry || action === 'expiry' && Boolean(listingExpiryError(expiry))} onClick={() => void (action === 'expiry' ? setAction('expiry_scope') : action === 'status' ? save() : run(action === 'publish' ? onPublish : action === 'update' ? onUpdate : action === 'retry' ? onRetry : action === 'withdraw' ? onWithdraw : onVerify, action === 'publish' ? isPortal ? 'Listing submitted to the portal. Check latest status to confirm it.' : 'Listing published to the website.' : action === 'verify' ? 'Public advert verification saved.' : action === 'withdraw' ? 'Withdrawal request accepted. Check latest status to confirm removal.' : 'Update accepted. Check the public advert to confirm it.', action === 'publish' ? isPortal ? `Submitting listing details and photos to ${channelName}…` : 'Preparing listing details and photos, then publishing to the website…' : action === 'verify' ? 'Saving public advert verification…' : action === 'withdraw' ? `Withdrawing ${channelName} advert…` : `Sending ${channelName} update…`))}>{busy ? <Loader2 size={15} className="animate-spin" /> : null}{busy ? 'Working…' : action === 'publish' ? 'Publish listing' : action === 'expiry' ? 'Next' : action === 'verify' ? 'Confirm verification' : action === 'retry' ? 'Retry on this channel' : action === 'update' ? 'Send update' : action === 'withdraw' ? 'Confirm withdrawal' : 'Save changes'}</Button> : null}</div>
      </section> : null}
      {saleRetry ? <div className="rounded-xl bg-[#fff8eb] p-3 text-sm text-[#8a5711]"><p>Earlier listing-status updates need attention. Retry only the failed channels.</p><Button type="button" size="sm" variant="secondary" className="mt-2" disabled={disabled} onClick={() => void save()}>Retry failed status updates</Button></div> : null}
      {results.length ? <div role="status" aria-live="polite" className="grid gap-2"><h4 className="text-sm font-semibold text-[#243d56]">Update results</h4>{results.map(row => <div key={row.channel} className="rounded-lg border border-[#e3ebf2] p-3 text-sm"><p className="font-semibold text-[#243d56]">{row.channel} · {row.status === 'failed' ? 'Needs attention' : row.status === 'sent' ? 'Accepted · check advert' : 'Saved'}</p><ErrorDetail message={row.detail || ''} /></div>)}</div> : null}
    </div>
  </Modal>
}
