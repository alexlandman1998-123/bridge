import { useState } from 'react'
import ListingChannelManageDialog from '../../components/listings/ListingChannelManageDialog'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import { RENTAL_PORTAL_STATUSES } from '../../services/rentals/rentalListingChannelModel'
import { getRentalPortalReadiness } from '../../services/rentals/rentalListingReadinessPresentation'
import { rentalChannelStatus } from '../../services/rentals/rentalChannelStatus'

export default function RentalPortalManagementPanel({ channel, listing = {}, busy, onClose, onRefresh, onChangeStatus, onVerifyLink, onEdit, onCheck, onPublish, onWithdraw, onFix, preview, previewError = '', checking = false, historyError }) {
  const [status, setStatus] = useState(RENTAL_PORTAL_STATUSES[channel.key][0])
  const [url, setUrl] = useState(channel.publicUrl || '')
  const [confirmed, setConfirmed] = useState(false)
  const readiness = getRentalPortalReadiness(channel.key, preview, { error: previewError, checking })
  const canMutate = !channel.loading && !channel.loadError && !channel.requiresReconciliation
  const inactive = ['not_published', 'inactive', 'expired', 'removed', 'withdrawn'].includes(channel.status)
  const hasReference = Boolean(channel.reference)
  const updateExisting = channel.key === 'private_property' && hasReference
  const automaticCheck = updateExisting && !preview && !checking && !previewError
  const edit = () => { onClose(); onEdit?.() }
  const fix = (action) => { onClose(); window.setTimeout(() => onFix?.(action), 0) }

  return <ListingChannelManageDialog
    channelName={channel.label}
    streamlinedUpdate={updateExisting}
    listingStatus={listing.listingStatus || listing.listing_status || 'draft'}
    listing={listing}
    portal={{
      reference: channel.reference,
      publicUrl: channel.publicUrl,
      statusLabel: channel.statusLabel || rentalChannelStatus(channel.status).label,
      checkedAt: channel.lastCheckedAt,
      publicationState: channel.publicationState,
      issues: [...new Set([channel.error, channel.statusDetail].filter(Boolean))],
      activity: (channel.activity || []).map(item => ({ title: item.label, at: item.time })),
      activityUnavailable: Boolean(historyError),
    }}
    isSale={false}
    confirmWithdrawal
    externalBusy={busy || checking}
    canUpdate={canMutate && hasReference && !inactive && (updateExisting || readiness.ready)}
    canPublish={canMutate && !hasReference && readiness.ready}
    canWithdraw={canMutate && hasReference && !inactive}
    updateUnavailableMessage={channel.requiresReconciliation ? 'Reconcile the previous request before sending another change.' : inactive ? 'This advert is inactive. Review its portal status before sending content updates.' : 'Check requirements before updating this advert.'}
    onClose={onClose}
    onFix={onEdit ? edit : undefined}
    onRefresh={onRefresh && (hasReference || channel.requiresReconciliation) ? onRefresh : undefined}
    onPreview={onCheck}
    onUpdate={hasReference && onPublish ? updateExisting ? () => onPublish({ updateExisting: true }) : onPublish : undefined}
    onPublish={!hasReference ? onPublish : undefined}
    onWithdraw={onWithdraw}
    renderChannelSettings={({ disabled, run }) => <>
      {onCheck ? <section aria-label={`${channel.label} requirements`} className="rounded-xl border border-[#e3ebf2] p-4 text-sm">
        <h4 className="font-semibold text-[#243d56]">Listing requirements</h4>
        <p role="status" className="mt-2 font-semibold text-[#243d56]">{automaticCheck ? 'Checked automatically when you update' : readiness.state}</p>
        <p className="mt-1 text-xs leading-5 text-[#607387]">{automaticCheck ? 'Arch9 checks the saved listing and portal setup before sending your update.' : readiness.detail}</p>
        {preview && channel.key === 'property24' ? <p className="mt-2 text-xs text-[#607387]">Photos prepared: {readiness.imagesLoaded}. Photos that failed: {readiness.imagesFailed}.</p> : null}
        {readiness.issues.length ? <ul className="mt-3 space-y-3">{readiness.issues.map(issue => <li key={issue.key}>
          <p className="font-semibold text-[#8a5b13]">{issue.label}</p>
          <p className="mt-1 text-xs leading-5 text-[#607387]">{issue.detail}</p>
          {issue.action && onFix ? <Button type="button" size="sm" variant="secondary" className="mt-2" disabled={disabled} onClick={() => fix(issue.action)}>{issue.action.label}</Button> : null}
        </li>)}</ul> : null}
        {readiness.warnings.length ? <details className="mt-3 text-xs text-[#607387]"><summary className="cursor-pointer font-semibold">Recommendations</summary><ul className="mt-2 space-y-2">{readiness.warnings.map(issue => <li key={issue.key}>{issue.label}</li>)}</ul></details> : null}
      </section> : null}
      {channel.requiresReconciliation && onRefresh ? <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => void run(onRefresh, 'Previous request checked.', 'Reconciling previous request…')}>Reconcile previous request</Button> : null}
      <details className="rounded-xl border border-[#e3ebf2] p-4" open={!channel.publicUrl && !updateExisting}>
        <summary className="cursor-pointer text-sm font-semibold text-[#243d56]">Portal settings</summary>
        <div className="mt-4 grid gap-4 text-sm">
          <label className="grid gap-2 font-semibold text-[#243d56]">Rental portal status
            <Field as="select" value={status} onChange={event => setStatus(event.target.value)} disabled={disabled || !hasReference || !canMutate}>
              {RENTAL_PORTAL_STATUSES[channel.key].map(option => <option key={option}>{option}</option>)}
            </Field>
          </label>
          <Button type="button" size="sm" disabled={disabled || !hasReference || !canMutate || !onChangeStatus} onClick={() => void run(() => onChangeStatus(status), 'Portal status request sent. Check latest status to confirm it.')}>Send status change</Button>
          {!hasReference ? <p className="text-xs text-[#607387]">A portal reference is required before changing its status.</p> : null}
          <label className="grid gap-2 font-semibold text-[#243d56]">Public listing URL
            <Field type="url" value={url} onChange={event => { setUrl(event.target.value); setConfirmed(false) }} placeholder={`https://${channel.key === 'property24' ? 'www.property24.com' : 'www.privateproperty.co.za'}/to-rent/…`} disabled={disabled} />
          </label>
          <label className="flex items-start gap-2 text-xs leading-5 text-[#607387]"><input type="checkbox" className="mt-1" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={disabled} /><span>I have opened this URL and checked it matches the saved rental details.</span></label>
          <Button type="button" size="sm" variant="secondary" disabled={disabled || !confirmed || !url || !hasReference || !canMutate || !onVerifyLink} onClick={() => void run(() => onVerifyLink(url), 'Confirmed public listing link saved.')}>Save confirmed public link</Button>
        </div>
      </details>
    </>}
  />
}
