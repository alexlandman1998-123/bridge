import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, Eye, House, MapPin, Search, ShieldCheck, UserRound } from 'lucide-react'
import { useOrganisation } from '../../context/OrganisationContext'
import { getOrganisationPrivateListings } from '../../services/privateListingService'
import { useMarketingEvents, formatEventDate } from '../../lib/marketingEventStore'
import { buildListingShowDaySnapshot } from '../../services/listings/listingShowDayModel'
import { showDays } from '../../data/showDays'
import './ShowDayCreate.css'

const STEPS = ['Property & timing', 'Guest experience', 'Review']
function text(value) { return String(value || '').trim() }
function money(value) { const amount = Number(value || 0); return amount ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount) : 'Price on request' }
function localToday() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function listingIsPublic(listing) { return ['active', 'published', 'live', 'active_with_warning'].includes(text(listing?.listingStatus || listing?.status).toLowerCase()) }
function PropertyImage({ snapshot, large = false }) { return snapshot?.image ? <img src={snapshot.image} alt="" /> : <span className={`show-create-image-placeholder ${large ? 'large' : ''}`}><House size={large ? 36 : 24} aria-hidden="true" /></span> }
function Field({ label, children, hint }) { return <label className="show-create-field"><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label> }
function Toggle({ label, hint, checked, onChange, disabled = false }) { return <label className="show-create-setting"><span><strong>{label}</strong><small>{hint}</small></span><input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} /></label> }

function ListingPicker({ listings, selected, query, setQuery, onSelect, loading, error }) {
  const [limit, setLimit] = useState(8)
  const visible = useMemo(() => listings.filter((listing) => {
    const snapshot = buildListingShowDaySnapshot(listing)
    return !query.trim() || `${snapshot.title} ${snapshot.address} ${snapshot.agentName} ${snapshot.reference}`.toLowerCase().includes(query.trim().toLowerCase())
  }), [listings, query])
  if (selected) {
    const snapshot = buildListingShowDaySnapshot(selected)
    return <div className="show-create-selected-listing"><PropertyImage snapshot={snapshot} /><div><small>LINKED PROPERTY</small><strong>{snapshot.title}</strong><b>{money(snapshot.price)}</b><span>{snapshot.address}</span></div><button type="button" className="wa-secondary-button" onClick={() => onSelect(null)}>Change listing</button></div>
  }
  return <div className="show-create-picker"><label className="wa-search"><Search size={17} /><input value={query} onChange={(event) => { setLimit(8); setQuery(event.target.value) }} placeholder="Search address, reference or agent" aria-label="Search listings" /></label>{loading ? <p role="status">Loading accessible listings…</p> : error ? <p className="show-create-error" role="alert">{error}</p> : !visible.length ? <p>No accessible listings match your search.</p> : <><div className="show-create-listing-options">{visible.slice(0, limit).map((listing) => { const snapshot = buildListingShowDaySnapshot(listing); return <button key={listing.id} type="button" onClick={() => onSelect(listing)}><PropertyImage snapshot={snapshot} /><span><strong>{snapshot.title}</strong><small>{snapshot.address}</small><em>{money(snapshot.price)} · {snapshot.agentName || 'Host not assigned'}</em></span><ChevronRight size={18} /></button> })}</div><div className="show-create-picker-footer"><small>{Math.min(limit, visible.length)} of {visible.length} listings</small>{limit < visible.length ? <button type="button" className="wa-secondary-button" onClick={() => setLimit((current) => current + 8)}>Show more listings</button> : null}</div></>}</div>
}

function EventPreview({ snapshot, values, checks }) {
  return <aside className="show-create-preview" aria-label="Show day preview"><div className="show-create-preview-heading"><span>EVENT PREVIEW</span><span className="show-create-draft-pill">Draft</span></div><PropertyImage snapshot={snapshot} large /><div className="show-create-preview-body"><h2>{snapshot?.title || 'Your next show day'}</h2><p className="show-create-muted">{snapshot?.address || 'Choose a property to bring your event to life.'}</p>{snapshot ? <strong>{money(snapshot.price)}</strong> : null}<div className="show-create-preview-facts"><p><CalendarDays size={17} />{values.date ? formatEventDate(values.date) : 'Date to be confirmed'}</p><p><Clock3 size={17} />{values.startTime || 'Start'} – {values.endTime || 'End'}</p><p><UserRound size={17} />{values.hostName || 'Host to be confirmed'}</p><p><Eye size={17} />{values.visibility === 'public' ? 'Public event' : 'Invitation only'}</p></div><div className="show-create-readiness"><div><strong>Ready to publish</strong><span>{checks.filter((item) => item.ready).length}/{checks.length}</span></div>{checks.map((item) => <p key={item.label} className={item.ready ? 'ready' : ''}><CheckCircle2 size={16} />{item.label}</p>)}</div></div></aside>
}

export default function ShowDayCreate({ onBack, onCreated }) {
  const { organisation } = useOrganisation()
  const organisationId = organisation?.organisationId || organisation?.id || ''
  const { createEvent, updateEvent, persisted } = useMarketingEvents('showDays', showDays, { organisationId })
  const [step, setStep] = useState(0)
  const [listings, setListings] = useState([])
  const [loadingListings, setLoadingListings] = useState(true)
  const [listingError, setListingError] = useState('')
  const [query, setQuery] = useState('')
  const [listing, setListing] = useState(null)
  const [savedEvent, setSavedEvent] = useState(null)
  const [saveState, setSaveState] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const saveLock = useRef(false)
  const headerRef = useRef(null)
  const [values, setValues] = useState({ date: '', startTime: '10:00', endTime: '14:00', hostName: '', hostUserId: '', visibility: 'public', registrationEnabled: true, registrationMessage: '', attendeeCheckInEnabled: true, createLeadsForRegistrations: true })
  useEffect(() => {
    let cancelled = false
    if (!organisationId) { setLoadingListings(false); setListingError('Choose an organisation before creating a show day.'); return undefined }
    setLoadingListings(true)
    setListingError('')
    getOrganisationPrivateListings(organisationId, { includeRequirementsAndDocuments: false })
      .then((rows) => { if (!cancelled) setListings(rows || []) })
      .catch((loadError) => { if (!cancelled) setListingError(loadError?.message || 'Could not load accessible listings.') })
      .finally(() => { if (!cancelled) setLoadingListings(false) })
    return () => { cancelled = true }
  }, [organisationId])
  const update = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value
    setValues((current) => ({ ...current, [field]: value, ...(field === 'hostName' ? { hostUserId: '' } : {}) }))
    setSaveState('Unsaved changes')
    setError('')
  }
  const chooseListing = (next) => {
    setListing(next)
    const snapshot = next ? buildListingShowDaySnapshot(next) : null
    setValues((current) => ({ ...current, hostName: snapshot?.agentName || '', hostUserId: snapshot?.agentId || '' }))
    setSaveState('Unsaved changes')
    setError('')
  }
  const snapshot = listing ? buildListingShowDaySnapshot(listing) : null
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(values.date) && !Number.isNaN(new Date(`${values.date}T12:00:00`).valueOf()) && values.date >= localToday()
  const validTime = /^\d{2}:\d{2}$/.test(values.startTime) && /^\d{2}:\d{2}$/.test(values.endTime) && values.endTime > values.startTime
  const publicReady = values.visibility !== 'public' || listingIsPublic(listing)
  const checks = [{ label: 'Property selected', ready: Boolean(snapshot?.id) }, { label: 'Date & time confirmed', ready: Boolean(validDate && validTime) }, { label: 'Host confirmed', ready: Boolean(text(values.hostName)) }, { label: values.visibility === 'public' ? 'Listing active for public event' : 'Private event selected', ready: Boolean(snapshot && publicReady) }]
  const canContinue = checks.slice(0, 3).every((item) => item.ready)
  const canPublish = checks.every((item) => item.ready)
  const canSave = Boolean(snapshot?.id && organisationId && listings.some((item) => item.id === snapshot.id))
  const goToStep = (index) => {
    if (saving) return
    if (index > 0 && !canContinue) { setError('Choose a property, a current or future date, an end time after the start time, and a host.'); setStep(0); return }
    setError('')
    setStep(index)
    headerRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }
  async function persist(publish = false) {
    if (saveLock.current) return
    setError('')
    if (!canSave) { setError('Choose a listing before saving your show day.'); setStep(0); return }
    if ((values.date && !validDate) || !validTime) { setError('Choose a current or future date and an end time after the start time.'); setStep(0); return }
    if (publish && (!canPublish || step !== 2)) { setError('Review the event details and complete the publishing checklist first.'); return }
    if (publish && !persisted) { setError('Shared event storage is unavailable. You can save a local draft, but cannot publish a registration page.'); return }
    const payload = { title: snapshot.title, subjectId: snapshot.id, subjectLabel: snapshot.title, address: snapshot.address, image: snapshot.image, startDate: values.date, startTime: values.startTime, endTime: values.endTime, hostUserId: values.hostUserId || null, hostName: text(values.hostName), visibility: values.visibility, registrationEnabled: values.registrationEnabled, registrationMessage: text(values.registrationMessage), attendeeCheckInEnabled: values.attendeeCheckInEnabled, createLeadsForRegistrations: values.registrationEnabled && values.createLeadsForRegistrations, listingSnapshot: snapshot, status: publish ? 'upcoming' : 'draft', description: text(values.registrationMessage) }
    try {
      saveLock.current = true
      setSaving(true)
      setSaveState(publish ? 'Publishing…' : 'Saving draft…')
      const saved = savedEvent?.id && savedEvent.organisationId === organisationId ? await updateEvent(savedEvent.id, { ...payload, metadata: { ...savedEvent.metadata, ...payload } }) : await createEvent(payload)
      const next = { ...savedEvent, ...saved, organisationId }
      if (!next.id) throw new Error('The event could not be confirmed as saved. Please try again.')
      setSavedEvent(next)
      setSaveState(publish ? 'Published' : persisted ? 'Draft saved' : 'Local draft saved')
      if (publish) onCreated?.(next.id)
    } catch (saveError) { setSaveState('Unsaved changes'); setError(saveError?.message || 'Unable to save this show day.') } finally { saveLock.current = false; setSaving(false) }
  }
  return <div className="wa-page show-days-page show-create-page">
    <header ref={headerRef} className="show-create-header"><div><button type="button" className="wa-back-link" disabled={saving} onClick={onBack}><ArrowLeft size={16} /> Show days</button><h1>Create show day</h1><p>A great viewing starts with a well-planned event.</p></div><div><span className="show-create-save-state" role="status">{saveState || 'New event'}</span><button type="button" className="wa-secondary-button" disabled={!canSave || saving} onClick={() => void persist(false)}>Save draft</button></div></header>
    <nav className="show-create-steps" aria-label="Show day creation steps">{STEPS.map((label, index) => <button key={label} type="button" aria-current={step === index ? 'step' : undefined} disabled={saving || (index > 0 && !canContinue)} className={step === index ? 'show-create-step-active' : index < step ? 'show-create-step-complete' : ''} onClick={() => goToStep(index)}><i>{index < step ? <Check size={15} /> : index + 1}</i><span>{label}<small>{['Link your property and choose a host', 'Registration, check-in and welcome message', 'Check the details before publishing'][index]}</small></span></button>)}</nav>
    {error ? <p className="show-create-error" role="alert">{error}</p> : null}
    <div className="show-create-layout"><main inert={saving}>
      {step === 0 ? <><section className="show-create-card"><div className="show-create-section-heading"><div><span className="show-create-eyebrow">THE PROPERTY</span><h2>Where are you hosting?</h2><p>Choose an accessible listing. Its property details stay linked to the event.</p></div></div><ListingPicker listings={listings} selected={listing} query={query} setQuery={setQuery} onSelect={chooseListing} loading={loadingListings} error={listingError} /></section><section className="show-create-card"><span className="show-create-eyebrow">THE PLAN</span><h2>Set the date & host</h2><div className="show-create-fields"><Field label="Date"><input type="date" min={localToday()} value={values.date} onChange={update('date')} /></Field><Field label="Start time"><input type="time" value={values.startTime} onChange={update('startTime')} /></Field><Field label="End time"><input type="time" value={values.endTime} onChange={update('endTime')} /></Field><Field label="Host agent" hint="Defaults to the listing agent. A custom name is saved without assigning their user account."><input value={values.hostName} onChange={update('hostName')} placeholder="Who will welcome your guests?" /></Field></div><div className="show-create-visibility">{['public', 'private'].map((visibility) => <button key={visibility} type="button" aria-pressed={values.visibility === visibility} className={values.visibility === visibility ? 'show-create-choice-active' : ''} onClick={() => { setValues((current) => ({ ...current, visibility })); setSaveState('Unsaved changes') }}><Eye size={19} /><span><strong>{visibility === 'public' ? 'Public event' : 'Invitation only'}</strong><small>{visibility === 'public' ? 'For prospective buyers via the RSVP link.' : 'Share the registration link with invited guests.'}</small></span></button>)}</div>{snapshot && !publicReady ? <p className="show-create-warning">This listing is not active. Save a draft or choose a private event; publish the listing before hosting publicly.</p> : null}</section></> : null}
      {step === 1 ? <><section className="show-create-card"><span className="show-create-eyebrow">GUEST EXPERIENCE</span><h2>Make arriving effortless</h2><p className="show-create-muted">Choose how guests register and how your team welcomes them.</p><div className="show-create-toggles"><Toggle label="Guest registration" hint="Allow guests to RSVP through the event link." checked={values.registrationEnabled} onChange={update('registrationEnabled')} /><Toggle label="Attendee check-in" hint="Record who arrives on the day." checked={values.attendeeCheckInEnabled} onChange={update('attendeeCheckInEnabled')} /><Toggle label="Create leads for new registrations" hint="Send new enquiries into your buyer lead workflow." checked={values.registrationEnabled && values.createLeadsForRegistrations} disabled={!values.registrationEnabled} onChange={update('createLeadsForRegistrations')} /></div><Field label="Welcome message" hint={`${values.registrationMessage.length}/300 characters · Include parking, access details or a short welcome.`}><textarea maxLength={300} value={values.registrationMessage} onChange={update('registrationMessage')} placeholder="We look forward to showing you around. Parking is available…" /></Field></section><section className="show-create-card"><span className="show-create-eyebrow">REGISTRATION & PROMOTION</span><h2>{values.registrationEnabled ? 'Your RSVP link comes next' : 'Manage attendance with your team'}</h2><p className="show-create-muted">{values.registrationEnabled ? 'Publishing activates the registration page. You can then copy its link and use the sharing tools from your show day workspace.' : 'Online registration is off. Your team can manage attendance from the show day workspace.'}</p><div className="show-create-info"><ShieldCheck size={20} /><p>Saving a draft keeps the event unpublished. No invitations are sent from this builder.</p></div></section></> : null}
      {step === 2 ? <section className="show-create-card"><span className="show-create-eyebrow">FINAL CHECK</span><h2>Ready to welcome your guests?</h2><p className="show-create-muted">Review the event and guest settings before making it available.</p><dl className="show-create-review">{[['Property', snapshot?.title], ['Address', snapshot?.address], ['Date', values.date ? formatEventDate(values.date) : 'Not selected'], ['Time', `${values.startTime} – ${values.endTime}`], ['Host', values.hostName], ['Visibility', values.visibility === 'public' ? 'Public event' : 'Invitation only'], ['Online registration', values.registrationEnabled ? 'Enabled' : 'Disabled'], ['Check-in', values.attendeeCheckInEnabled ? 'Enabled' : 'Disabled'], ['New registration leads', values.registrationEnabled && values.createLeadsForRegistrations ? 'Enabled' : 'Disabled'], ['Welcome message', values.registrationMessage || 'No message added']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className={canPublish ? 'show-create-success' : 'show-create-warning'}><CheckCircle2 size={18} />{canPublish ? 'Event details are complete. Publish when you are ready.' : 'Complete the publishing checklist before continuing.'}</p></section> : null}
    </main><EventPreview snapshot={snapshot} values={values} checks={checks} /></div>
    <footer className="show-create-footer"><button type="button" className="wa-secondary-button" disabled={saving} onClick={() => step ? goToStep(step - 1) : onBack()}><ArrowLeft size={16} />{step ? 'Back' : 'Cancel'}</button><span>Step {step + 1} of {STEPS.length}</span>{step < 2 ? <button type="button" className="wa-primary-button" disabled={saving || !canContinue} onClick={() => goToStep(step + 1)}>{step === 0 ? 'Guest experience' : 'Review show day'}<ChevronRight size={16} /></button> : <button type="button" className="wa-primary-button" disabled={saving || !canPublish || !persisted} onClick={() => void persist(true)}>{saving ? 'Publishing…' : 'Publish show day'}<ChevronRight size={16} /></button>}</footer>
    {persisted === false ? <p className="show-create-warning">Shared storage is unavailable. Drafts stay on this device; publishing is disabled.</p> : null}
  </div>
}
