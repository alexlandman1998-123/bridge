import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, Copy, ExternalLink, Eye, MapPin, Search, UserRound } from 'lucide-react'
import { useOrganisation } from '../../context/OrganisationContext'
import { getOrganisationPrivateListings } from '../../services/privateListingService'
import { useMarketingEvents } from '../../lib/marketingEventStore'
import { showDays } from '../../data/showDays'

const STEPS = ['Setup', 'Registration & promotion', 'Review']

function text(value) { return String(value || '').trim() }
function money(value) { const amount = Number(value || 0); return amount ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount) : 'Price on request' }
function listingTitle(listing) { return text(listing?.listingTitle || listing?.title || listing?.headline || listing?.propertyAddress) || 'Untitled listing' }
function listingAddress(listing) { return text(listing?.formattedAddress || listing?.propertyAddress || listing?.address || [listing?.suburb, listing?.city].filter(Boolean).join(', ')) || 'Address to be confirmed' }
function listingImage(listing) { return text(listing?.coverImageUrl || listing?.coverImage || listing?.images?.[0]?.url || listing?.images?.[0] || listing?.imageUrl) }
function listingPrice(listing) { return listing?.askingPrice || listing?.price || listing?.estimatedValue || 0 }
function listingIsPublic(listing) { return ['active', 'published', 'live', 'active_with_warning'].includes(text(listing?.listingStatus || listing?.status).toLowerCase()) }

function listingSnapshot(listing) {
  return {
    id: listing?.id || '', title: listingTitle(listing), address: listingAddress(listing), image: listingImage(listing),
    price: listingPrice(listing), agentName: text(listing?.assignedAgentName || listing?.assignedAgent),
    agentId: listing?.assignedAgentId || listing?.assigned_agent_id || null, status: text(listing?.listingStatus || listing?.status),
  }
}

function ListingPicker({ listings, selected, query, setQuery, onSelect, loading, error }) {
  const visible = useMemo(() => {
    const needle = query.toLowerCase().trim()
    return listings.filter((listing) => !needle || `${listingTitle(listing)} ${listingAddress(listing)} ${listing?.assignedAgentName || ''} ${listing?.listingReference || ''}`.toLowerCase().includes(needle)).slice(0, 8)
  }, [listings, query])
  if (selected) {
    const snapshot = listingSnapshot(selected)
    return <div className="show-create-selected-listing"><img src={snapshot.image || ''} alt="" /><div><strong>{snapshot.title}</strong><b>{money(snapshot.price)}</b><span><MapPin size={14} /> {snapshot.address}</span><small><UserRound size={14} /> {snapshot.agentName || 'No listing agent assigned'}</small></div><button type="button" className="wa-secondary-button" onClick={() => onSelect(null)}>Change listing</button></div>
  }
  return <div className="show-create-picker"><label className="wa-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search listing, address, reference or agent" /></label>{loading ? <p>Loading the listings you can access…</p> : error ? <p className="show-create-error">{error}</p> : !visible.length ? <p>No accessible listings match that search.</p> : <div className="show-create-listing-options">{visible.map((listing) => { const snapshot = listingSnapshot(listing); return <button key={listing.id} type="button" onClick={() => onSelect(listing)}><img src={snapshot.image || ''} alt="" /><span><strong>{snapshot.title}</strong><small>{money(snapshot.price)} · {snapshot.address}</small><em>{snapshot.agentName || 'No agent assigned'}</em></span><ChevronRight size={18} /></button> })}</div>}</div>
}

function EventPreview({ listing, values }) {
  const snapshot = listing ? listingSnapshot(listing) : null
  return <aside className="show-create-preview"><h2>Show day preview</h2>{snapshot ? <><img src={snapshot.image || ''} alt="" /><h3>{snapshot.title}</h3><strong>{money(snapshot.price)}</strong><p><MapPin size={15} /> {snapshot.address}</p><hr /><p><CalendarDays size={15} /> {values.date || 'Choose a date'}</p><p><Clock3 size={15} /> {values.startTime || 'Start'} – {values.endTime || 'End'}</p><p><UserRound size={15} /> Hosted by {values.hostName || snapshot.agentName || 'Choose a host'}</p><p><Eye size={15} /> {values.visibility === 'public' ? 'Public registration' : 'Private invitation'}</p></> : <p className="show-create-muted">Choose a listing to see the actual property details here.</p>}</aside>
}

function Field({ label, children, hint }) { return <label className="show-create-field"><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label> }

export default function ShowDayCreate({ onBack, onCreated }) {
  const { organisation } = useOrganisation()
  const organisationId = organisation?.organisationId || organisation?.id || ''
  const { createEvent, updateEvent } = useMarketingEvents('showDays', showDays, { organisationId })
  const [step, setStep] = useState(0)
  const [listings, setListings] = useState([])
  const [loadingListings, setLoadingListings] = useState(true)
  const [listingError, setListingError] = useState('')
  const [query, setQuery] = useState('')
  const [listing, setListing] = useState(null)
  const [eventId, setEventId] = useState('')
  const [saveState, setSaveState] = useState('')
  const [error, setError] = useState('')
  const [values, setValues] = useState({ date: '', startTime: '10:00', endTime: '14:00', hostName: '', hostUserId: '', visibility: 'public', registrationEnabled: true, registrationMessage: '', attendeeCheckInEnabled: true, createLeadsForRegistrations: true })

  useEffect(() => {
    let cancelled = false
    if (!organisationId) { setLoadingListings(false); setListingError('Choose an organisation before creating a show day.'); return undefined }
    getOrganisationPrivateListings(organisationId, { includeRequirementsAndDocuments: false })
      .then((rows) => { if (!cancelled) setListings(rows) })
      .catch((loadError) => { if (!cancelled) setListingError(loadError?.message || 'Could not load accessible listings.') })
      .finally(() => { if (!cancelled) setLoadingListings(false) })
    return () => { cancelled = true }
  }, [organisationId])

  const update = (field) => (event) => setValues((current) => ({ ...current, [field]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }))
  const chooseListing = (next) => {
    setListing(next)
    if (next) { const snapshot = listingSnapshot(next); setValues((current) => ({ ...current, hostName: current.hostName || snapshot.agentName, hostUserId: current.hostUserId || snapshot.agentId || '' })) }
  }
  const snapshot = listing ? listingSnapshot(listing) : null
  const registrationPath = eventId ? `/marketing/rsvp/${eventId.publicToken || eventId}` : ''
  const validTime = values.date && values.startTime && values.endTime && values.endTime > values.startTime
  const publicReady = values.visibility !== 'public' || listingIsPublic(listing)
  const canSave = Boolean(snapshot && validTime && values.hostName)
  const canPublish = canSave && publicReady

  async function persist(publish = false) {
    setError('')
    if (!canSave) { setError('Choose a listing, date, valid time range and host before saving.'); setStep(0); return }
    if (publish && !canPublish) { setError('A public show day needs an active listing before it can be published.'); setStep(0); return }
    const payload = {
      title: snapshot.title, subjectId: snapshot.id, subjectLabel: snapshot.title, address: snapshot.address, image: snapshot.image,
      startDate: values.date, startTime: values.startTime, endTime: values.endTime, hostUserId: values.hostUserId, hostName: values.hostName,
      visibility: values.visibility, registrationEnabled: values.registrationEnabled, registrationMessage: values.registrationMessage,
      attendeeCheckInEnabled: values.attendeeCheckInEnabled, createLeadsForRegistrations: values.createLeadsForRegistrations,
      listingSnapshot: snapshot, status: publish ? 'upcoming' : 'draft', description: values.registrationMessage,
    }
    try {
      setSaveState(publish ? 'Publishing…' : 'Saving draft…')
      const saved = eventId ? await updateEvent(eventId.id || eventId, { ...payload, metadata: { ...payload } }) : await createEvent(payload)
      setEventId(saved)
      setSaveState(publish ? 'Published' : 'Saved just now')
      if (publish) onCreated(saved.id)
    } catch (saveError) { setSaveState(''); setError(saveError?.message || 'Unable to save this show day.') }
  }
  const copyRegistrationLink = async () => { if (!registrationPath) return; await navigator.clipboard?.writeText(`${window.location.origin}${registrationPath}`); setSaveState('Registration link copied') }

  return <div className="wa-page show-days-page show-create-page">
    <header className="show-create-header"><div><button type="button" className="wa-back-link" onClick={onBack}><ArrowLeft size={16} /> Show days</button><h1>Create show day</h1><p>Link a listing, invite the right people and follow up after every viewing.</p></div><div><span className="show-create-save-state" aria-live="polite">{saveState}</span><button type="button" className="wa-secondary-button" onClick={() => void persist(false)}>Save draft</button><button type="button" className="wa-primary-button" onClick={() => void persist(true)}>Publish show day <ChevronRight size={16} /></button></div></header>
    <nav className="show-create-steps" aria-label="Show day creation steps">{STEPS.map((label, index) => <button key={label} type="button" className={step === index ? 'show-create-step-active' : index < step ? 'show-create-step-complete' : ''} onClick={() => (index <= step || (index === 1 && canSave) || (index === 2 && canSave)) && setStep(index)}><i>{index < step ? <Check size={14} /> : index + 1}</i>{label}</button>)}</nav>
    <div className="show-create-layout"><main>
      {step === 0 ? <><section className="show-create-card"><div className="show-create-section-heading"><div><h2>Choose a listing</h2><p>Property details pull through from the listing and stay linked to it.</p></div></div><ListingPicker listings={listings} selected={listing} query={query} setQuery={setQuery} onSelect={chooseListing} loading={loadingListings} error={listingError} /></section><section className="show-create-card"><h2>Event details</h2><div className="show-create-fields"><Field label="Date"><input type="date" min={new Date().toISOString().slice(0, 10)} value={values.date} onChange={update('date')} /></Field><Field label="Start time"><input type="time" value={values.startTime} onChange={update('startTime')} /></Field><Field label="End time"><input type="time" value={values.endTime} onChange={update('endTime')} /></Field><Field label="Host agent" hint="Defaults to the assigned listing agent."><input value={values.hostName} onChange={update('hostName')} placeholder="Host agent" /></Field></div><div className="show-create-visibility"><button type="button" className={values.visibility === 'public' ? 'show-create-choice-active' : ''} onClick={() => setValues((current) => ({ ...current, visibility: 'public' }))}><CheckCircle2 size={18} /><span><strong>Public</strong><small>Visible via the listing registration link.</small></span></button><button type="button" className={values.visibility === 'private' ? 'show-create-choice-active' : ''} onClick={() => setValues((current) => ({ ...current, visibility: 'private' }))}><Eye size={18} /><span><strong>Private</strong><small>For invitation-only attendance.</small></span></button></div>{values.visibility === 'public' && listing && !listingIsPublic(listing) ? <p className="show-create-warning">This listing is not active yet. You can save a draft, but it cannot be published publicly.</p> : null}</section><section className="show-create-card"><h2>Guest experience</h2><div className="show-create-toggles"><Field label="Enable registration form"><input type="checkbox" checked={values.registrationEnabled} onChange={update('registrationEnabled')} /></Field><Field label="Enable attendee check-in"><input type="checkbox" checked={values.attendeeCheckInEnabled} onChange={update('attendeeCheckInEnabled')} /></Field><Field label="Create leads for new registrations"><input type="checkbox" checked={values.createLeadsForRegistrations} onChange={update('createLeadsForRegistrations')} /></Field></div><Field label="Registration message" hint={`${values.registrationMessage.length}/300`}><textarea maxLength="300" value={values.registrationMessage} onChange={update('registrationMessage')} placeholder="Add a short message for potential attendees…" /></Field></section></> : null}
      {step === 1 ? <section className="show-create-card"><h2>Registration & promotion</h2>{eventId && values.registrationEnabled ? <div className="show-create-registration"><p><CheckCircle2 size={17} /> Registration link is ready for this show day.</p><code>{window.location.origin}{registrationPath}</code><div><button type="button" className="wa-secondary-button" onClick={() => void copyRegistrationLink()}><Copy size={15} /> Copy registration link</button><a className="wa-secondary-button" href={registrationPath} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Preview registration page</a></div></div> : <p className="show-create-muted">Save a valid draft with registration enabled to generate the real registration link.</p>}<div className="show-create-automation"><h3>Automations</h3><p>Confirmation emails are sent after successful registrations. The existing reminder service schedules the event-morning reminder when the show day is published.</p></div></section> : null}
      {step === 2 ? <section className="show-create-card"><h2>Review and publish</h2><dl className="show-create-review"><div><dt>Listing</dt><dd>{snapshot?.title || 'Choose a listing'}</dd></div><div><dt>When</dt><dd>{values.date || 'Choose a date'} · {values.startTime} – {values.endTime}</dd></div><div><dt>Host</dt><dd>{values.hostName || 'Choose a host'}</dd></div><div><dt>Registration</dt><dd>{values.registrationEnabled ? `${values.visibility === 'public' ? 'Public' : 'Private'} registration enabled` : 'Internal/manual attendance only'}</dd></div></dl>{!canPublish ? <p className="show-create-warning">Complete the missing event details and make sure a public listing is active before publishing.</p> : <p className="show-create-success"><CheckCircle2 size={17} /> Ready to publish. The registration page and existing RSVP workflow will activate with this show day.</p>}</section> : null}
      {error ? <p className="show-create-error" role="alert">{error}</p> : null}
      <footer className="show-create-footer"><button type="button" className="wa-secondary-button" onClick={() => step ? setStep((current) => current - 1) : onBack()}>{step ? 'Back' : 'Cancel'}</button>{step < 2 ? <button type="button" className="wa-primary-button" disabled={!canSave && step === 0} onClick={() => setStep((current) => current + 1)}>Continue <ChevronRight size={16} /></button> : <button type="button" className="wa-primary-button" onClick={() => void persist(true)}>Publish show day <ChevronRight size={16} /></button>}</footer>
    </main><EventPreview listing={listing} values={values} /></div>
  </div>
}
