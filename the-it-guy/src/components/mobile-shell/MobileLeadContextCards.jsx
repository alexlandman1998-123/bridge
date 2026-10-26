import { useEffect, useState } from 'react'
import { ArrowUpRight, Check, ClipboardList, Home, MapPin } from 'lucide-react'
import Modal from '../ui/Modal.jsx'
import { getPrivateListing, getPrivateListingCoverImageUrls } from '../../services/privateListingService.js'
import { getMobileBuyerQualification, getMobileEnquiryListing } from '../../services/mobileLeadContextModel.js'
import './mobile-lead-context-cards.css'

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg' }).format(date)
}

export default function MobileLeadContextCards({ lead, contact = {}, organisationId }) {
  const [listingState, setListingState] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [open, setOpen] = useState(false)
  const [failedImage, setFailedImage] = useState('')
  const listingId = lead.enquiredListingId || lead.enquired_listing_id || lead.listingId || lead.listing_id || ''
  const listingKey = `${organisationId}:${listingId}`
  useEffect(() => {
    let active = true
    if (!listingId || !organisationId) return undefined
    getPrivateListing(listingId, { includeRelatedData: false }).then(async listing => {
      if (!active) return
      if (!listing || listing.organisationId !== organisationId) throw new Error('Listing unavailable')
      setListingState({ key: listingKey, listing })
      try {
        const covers = await getPrivateListingCoverImageUrls([listingId])
        if (active) setListingState({ key: listingKey, listing, image: covers[listingId] || '' })
      } catch {
        if (active) setListingState({ key: listingKey, listing, imageError: true })
      }
    }).catch(() => {
      if (active) setListingState({ key: listingKey, error: true })
    })
    return () => { active = false }
  }, [listingId, listingKey, organisationId, attempt])

  const current = listingState?.key === listingKey ? listingState : null
  const property = getMobileEnquiryListing(lead, current?.listing)
  const qualification = getMobileBuyerQualification(lead)
  const name = contact.fullName || [contact.firstName, contact.lastName].filter(Boolean).join(' ') || lead.name || 'Buyer'
  const image = current?.image || ''
  const qualificationTitle = qualification.kind === 'tenant' ? 'Tenant qualification' : 'Buyer qualification'
  const submitted = qualification.status === 'Submitted'
  const retryListing = () => { setFailedImage(''); setListingState(null); setAttempt(value => value + 1) }
  return <>
    <section className="mobile-lead-context-track" aria-label={qualification.kind === 'tenant' ? 'Enquiry and tenant qualification' : 'Enquiry and buyer qualification'} tabIndex={0}>
      <article className="mobile-lead-context-card mobile-lead-enquiry" aria-label="Enquired listing">
        <div className="mobile-lead-enquiry-cover">
          {image && failedImage !== image ? <img src={image} alt={property.address} onError={() => setFailedImage(image)} /> : <div className="mobile-lead-enquiry-no-image"><Home size={28} aria-hidden="true" /><span>{listingId && !current ? 'Loading listing…' : 'Cover image unavailable'}</span></div>}
          <span className="mobile-lead-enquiry-label">Enquired listing</span>
        </div>
        <div className="mobile-lead-enquiry-copy">
          <h2><MapPin size={15} aria-hidden="true" /><span>{property.address}</span></h2>
          {property.location && <p>{property.location}</p>}
          <strong>{property.price}{property.rental && ' / month'}</strong>
          {(current?.error || current?.imageError || (image && failedImage === image)) && <button className="mobile-lead-context-retry" type="button" onClick={retryListing}>Retry listing details</button>}
        </div>
      </article>
      <button type="button" className="mobile-lead-context-card mobile-lead-qualification" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="mobile-lead-qualification-top"><span className="mobile-lead-qualification-icon"><ClipboardList size={22} aria-hidden="true" /></span><ArrowUpRight size={18} aria-hidden="true" /></span>
        <span className={`mobile-lead-qualification-status${submitted ? ' is-submitted' : ''}`}>{submitted && <Check size={13} aria-hidden="true" />}{qualification.status}</span>
        <h2>{qualificationTitle}</h2>
        <p>{qualification.captured ? `${qualification.captured} answers captured` : 'No qualification answers received yet.'}</p>
        {qualification.submittedAt && <small>{formatDate(qualification.submittedAt)}</small>}
        <span className="mobile-lead-qualification-link">View qualification <ArrowUpRight size={15} aria-hidden="true" /></span>
      </button>
    </section>
    <Modal open={open} onClose={() => setOpen(false)} title={qualificationTitle} subtitle={name} className="mobile-buyer-qualification-modal">
      <p className="mobile-buyer-qualification-summary">{qualification.status}{qualification.submittedAt ? ` · ${formatDate(qualification.submittedAt)}` : ''}</p>
      <dl className="mobile-buyer-qualification-answers">{qualification.rows.map(row => <div key={row.key}><dt>{row.label}</dt><dd className={row.value === 'Not captured' ? 'is-empty' : ''}>{row.value}</dd></div>)}</dl>
      {(Array.isArray(qualification.viewing.availabilityWindows) && qualification.viewing.availabilityWindows.length > 0 || qualification.viewing.attendeeNotes || qualification.viewing.responseNotes) && <section className="mobile-buyer-qualification-viewing"><h4>Preferred viewing times</h4>{Array.isArray(qualification.viewing.availabilityWindows) && qualification.viewing.availabilityWindows.length ? <ul>{qualification.viewing.availabilityWindows.map((value, index) => <li key={`${index}:${value}`}>{value}</li>)}</ul> : <p>Not captured</p>}{qualification.viewing.attendeeNotes && <p>{qualification.viewing.attendeeNotes}</p>}{qualification.viewing.responseNotes && <p>{qualification.viewing.responseNotes}</p>}<small>Preferences only; appointments need confirmation.</small></section>}
    </Modal>
  </>
}
