import { CheckCircle2 } from 'lucide-react'
import './listing-syndication.css'
import Button from '../ui/Button'
import { listingPublicationReceipt } from '../../services/listings/listingChannelUpdateState'
import ListingChannelLogo from './ListingChannelLogo'

export default function ListingSyndicationChannelCard({ channel, selected, onToggle, agencyLogo = '', disabled = false, status = '', needsAttention = '', description = '', layout = 'card', publication = null, busy = false, retryBlocked = false, previousResult = false, unsavedChanges = false, onRetry, onCheckStatus, children }) {
  const internal = Boolean(channel.internalOnly)
  const label = channel.key === 'agency_website' ? channel.availability?.label || 'Agency website' : channel.label
  const channelDescription = description || (internal ? 'Keep your listing in Arch9. External publication is optional.' : channel.key === 'agency_website' ? channel.availability?.hostname ? `Publish on ${channel.availability.hostname}.` : 'Publish on your agency’s property website.' : `Advertise your property on ${label}.`)
  if (layout === 'row') {
    const receipt = publication ? listingPublicationReceipt(publication) : null
    const attention = Boolean(needsAttention || ['needs_attention', 'uncertain'].includes(publication?.status))
    return <article className={`listing-syndication-row ${selected ? 'is-selected' : ''} ${attention ? 'has-attention' : ''}`} aria-label={`${label} advertising`}>
      <div className="listing-syndication-row-identity">
        <ListingChannelLogo channel={channel} agencyLogo={agencyLogo} />
        <div><h4>{label}</h4><p>{channelDescription}</p></div>
      </div>
      <button type="button" className="listing-syndication-row-select" aria-label={label} aria-pressed={selected} disabled={disabled || internal || busy} onClick={() => onToggle?.(channel.key)}>
        <span className="listing-syndication-check" aria-hidden="true">{selected ? <CheckCircle2 size={16} /> : null}</span>
        {internal ? 'Always included' : selected ? 'Selected' : 'Select website'}
      </button>
      <div className="listing-syndication-row-feedback" role="status" aria-live="polite">
        {receipt ? <>
          {previousResult ? <p className="listing-syndication-previous">Previous advertising request</p> : null}
          <span className={`listing-syndication-result ${attention ? 'needs-attention' : ''}`}>{receipt.label}</span>
          <p>{receipt.message}</p>
          {publication.status === 'uncertain' ? <p>Check status before sending again; the website may have accepted this request.</p> : null}
        </> : <p className="listing-syndication-row-state">{status || (internal ? 'Internal only · no public advert' : needsAttention ? 'Needs attention' : selected ? 'Selected for the next publish' : 'No advertising request selected')}</p>}
        {needsAttention ? <p className="listing-syndication-attention">{needsAttention}</p> : null}
        {publication?.retryable ? <p>Fix the details, then retry this website. Successful websites will not be resent.</p> : null}
      </div>
      {children || (publication && onCheckStatus) || (publication?.retryable && onRetry) ? <div className="listing-syndication-row-actions">
        {children}
        {publication && onCheckStatus ? <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onCheckStatus}>Check status</Button> : null}
        {publication?.retryable && onRetry ? <Button type="button" size="sm" disabled={busy || retryBlocked} onClick={onRetry}>{unsavedChanges ? 'Save and retry this website' : 'Retry this website'}</Button> : null}
      </div> : null}
    </article>
  }
  return <article className={`listing-syndication-card ${selected ? 'is-selected' : ''}`}>
    <button type="button" data-rental-control="distribution-channel" aria-label={label} aria-pressed={selected} disabled={disabled || internal} onClick={() => onToggle?.(channel.key)}>
      <span className="listing-syndication-card-top">
        <ListingChannelLogo channel={channel} agencyLogo={agencyLogo} />
        <span className="listing-syndication-check" aria-hidden="true">{selected ? <CheckCircle2 size={16} /> : null}</span>
      </span>
      <span className="listing-syndication-label">{label}</span>
      <span className="listing-syndication-description">{channelDescription}</span>
      <span className={`listing-syndication-status ${needsAttention ? 'needs-attention' : ''}`}>{status || (internal ? 'Always included · internal only' : selected ? needsAttention ? 'Needs attention' : 'Selected' : 'Not selected')}</span>
      {needsAttention ? <span className="listing-syndication-attention">{needsAttention}</span> : null}
    </button>
    {children ? <div className="listing-syndication-card-actions">{children}</div> : null}
  </article>
}
