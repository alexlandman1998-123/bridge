import { createElement, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, Bath, BedDouble, Building2, CarFront, ChevronLeft, ChevronRight, Expand, MapPin, MessageCircle, Plus, Ruler, Search, Share2, X } from 'lucide-react'
import './revoPropertyExperience.css'

const PAGE_SIZE = 9
const emptyFilters = { transactionType: '', location: '', propertyType: '', bedrooms: '', maxPrice: '', sort: 'updated_desc', offset: 0 }
const privacyWording = 'I agree that Revo Properties may use my details to respond to this property enquiry.'
const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })
const priceOf = (property) => `${property.price ? money.format(property.price) : 'Price on request'}${property.transactionType === 'rental' ? ' / month' : ''}`
const placeOf = (property) => [property.location?.suburb, property.location?.city].filter(Boolean).join(', ')
const labelOf = (property) => ['sold', 'rented', 'let'].includes(property.status) ? property.status.toUpperCase() : property.transactionType === 'rental' ? 'TO LET' : 'FOR SALE'

function PropertyFacts({ property, detailed = false }) {
  const facts = [[BedDouble, property.bedrooms, 'Bedrooms'], [Bath, property.bathrooms, 'Bathrooms'], [CarFront, property.parking, 'Parking']]
  if (detailed && property.size?.floor != null) facts.push([Ruler, property.size.floor, 'm² floor area'])
  return <dl className={`revo-facts${detailed ? ' revo-facts--large' : ''}`} aria-label={detailed ? 'Property highlights' : undefined}>{facts.map(([icon, value, label]) => <div key={label}>{createElement(icon, { size: detailed ? 24 : 17, 'aria-hidden': true })}<dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}</dl>
}

function PropertyCard({ property, href, onOpen }) {
  const photo = property.photos?.[0]
  return <article className="revo-property-card">
    <a className="revo-card-photo" href={href} onClick={onOpen} aria-label={`View ${property.title}`}>
      {photo ? <img src={photo.url} alt={photo.caption || property.title} loading="lazy" decoding="async" /> : <span className="revo-photo-placeholder"><Building2 size={36} />Photography coming soon</span>}
      <span className="revo-property-badge">{labelOf(property)}</span>
      {property.photos?.length > 1 ? <span className="revo-photo-count">{property.photos.length} photos</span> : null}
    </a>
    <div className="revo-card-copy"><p className="revo-card-place"><MapPin size={13} aria-hidden="true" />{placeOf(property)}</p><h2><a href={href} onClick={onOpen}>{property.title}</a></h2><p className="revo-card-price">{priceOf(property)}</p><PropertyFacts property={property} /><a className="revo-card-link" href={href} onClick={onOpen}><span className="revo-card-link-text">Explore this property</span><ArrowUpRight size={21} aria-hidden="true" /></a></div>
  </article>
}

function SearchFilters({ filters, onSearch }) {
  const [draft, setDraft] = useState(filters)
  const update = (key, value) => setDraft((previous) => ({ ...previous, [key]: value }))
  return <form className="revo-search" onSubmit={(event) => { event.preventDefault(); onSearch({ ...draft, offset: 0 }) }}>
    <label className="revo-search-location"><span>Where would you like to live?</span><div><MapPin size={17} aria-hidden="true" /><input value={draft.location} onChange={(event) => update('location', event.target.value)} placeholder="Suburb or city" maxLength={160} /></div></label>
    <label><span>Property type</span><select value={draft.propertyType} onChange={(event) => update('propertyType', event.target.value)}><option value="">Any property</option><option>House</option><option>Apartment</option><option>Townhouse</option></select></label>
    <label><span>Bedrooms</span><select value={draft.bedrooms} onChange={(event) => update('bedrooms', event.target.value)}><option value="">Any bedrooms</option>{[1,2,3,4,5].map((value) => <option value={value} key={value}>{value}+</option>)}</select></label>
    <label><span>Maximum price</span><input type="number" min="0" max="999999999999" step="1" value={draft.maxPrice} onChange={(event) => update('maxPrice', event.target.value)} placeholder="No maximum" /></label>
    <button className="revo-primary-button" type="submit"><Search size={18} aria-hidden="true" />Find properties</button>
  </form>
}

function PropertyGallery({ property }) {
  const images = property.photos || []
  const dialog = useRef(null)
  const trigger = useRef(null)
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const element = dialog.current
    if (open && element && !element.open) element.showModal()
    if (!open && element?.open) element.close()
  }, [open])
  const show = (event, imageIndex) => { trigger.current = event.currentTarget; setIndex(imageIndex); setOpen(true) }
  const close = () => { setOpen(false); trigger.current?.focus() }
  const move = (delta) => setIndex((previous) => (previous + delta + images.length) % images.length)
  if (!images.length) return <div className="revo-empty-gallery"><Building2 size={44} /><p>Photography coming soon</p></div>
  return <>
    <div className="revo-gallery-stage">
      <div className={`revo-gallery revo-gallery--${Math.min(images.length, 3)}`}>
        {images.slice(0,3).map((_, tileIndex) => {
          const imageIndex = (index + tileIndex) % images.length
          const photo = images[imageIndex]
          return <button type="button" key={tileIndex} onClick={(event) => show(event, imageIndex)} aria-label={`Open photo ${imageIndex + 1} of ${images.length}`}><img src={photo.url} alt={photo.caption || `${property.title}, photograph ${imageIndex + 1}`} loading={tileIndex ? 'lazy' : 'eager'} />{tileIndex === 0 ? <span className="revo-gallery-open"><Expand size={16} aria-hidden="true" />View all {images.length} photos</span> : null}</button>
        })}
      </div>
      <div className="revo-gallery-toolbar"><p>{images.length} photos</p><div className="revo-gallery-stepper"><button type="button" onClick={() => move(-1)} disabled={images.length < 2} aria-label="Previous property photo"><ArrowLeft size={18} aria-hidden="true" /></button><span aria-live="polite">{String(index + 1).padStart(2, '0')} / {String(images.length).padStart(2, '0')}</span><button type="button" onClick={() => move(1)} disabled={images.length < 2} aria-label="Next property photo"><ArrowRight size={18} aria-hidden="true" /></button></div></div>
    </div>
    <dialog ref={dialog} className="revo-gallery-dialog" aria-label={`${property.title} photo gallery`} onCancel={close} onClose={close} onKeyDown={(event) => { if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) } if (event.key === 'ArrowRight') { event.preventDefault(); move(1) } }}>
      <div className="revo-dialog-top"><span>{index + 1} / {images.length}</span><button type="button" onClick={close} aria-label="Close photo gallery"><X size={24} /></button></div>
      <div className="revo-dialog-image"><img src={images[index].url} alt={images[index].caption || `${property.title}, photograph ${index + 1}`} />{images.length > 1 ? <><button type="button" className="revo-gallery-prev" onClick={() => move(-1)} aria-label="Previous photo"><ChevronLeft size={25} /></button><button type="button" className="revo-gallery-next" onClick={() => move(1)} aria-label="Next photo"><ChevronRight size={25} /></button></> : null}</div>
      <p>{images[index].caption || property.title}</p><div className="revo-dialog-thumbnails">{images.map((photo, imageIndex) => <button key={`${photo.url}-${imageIndex}`} type="button" aria-label={`Show photo ${imageIndex + 1}`} aria-pressed={index === imageIndex} onClick={() => setIndex(imageIndex)}><img src={photo.url} alt="" /></button>)}</div>
    </dialog>
  </>
}

function EnquiryForm({ property, client, preview, sourcePageUrl }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const submission = useRef(null)
  const compose = useRef(null)
  const formRef = useRef(null)
  const agentName = property.agent?.name || 'Revo property team'
  const initials = agentName.split(' ').map((name) => name[0]).slice(0, 2).join('')
  function requestViewing() {
    compose.current.open = true
    formRef.current.elements.message.value = `I would like to arrange a viewing of ${property.title}.`
    formRef.current.elements.name.focus()
  }
  async function submit(event) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const name = String(values.get('name') || '').trim(), email = String(values.get('email') || '').trim(), phone = String(values.get('phone') || '').trim()
    if (name.length < 2 || (!email && !phone)) { setResult({ error: true, message: 'Please give your name and an email address or telephone number.' }); return }
    if (values.get('privacy') !== 'on') { setResult({ error: true, message: 'Please agree to being contacted about this enquiry.' }); return }
    if (preview) { setResult({ preview: true, message: 'The form is ready. This design preview does not send or store enquiries.' }); return }
    const payload = { name, email, phone, message: String(values.get('message') || '').trim(), listingId: property.id, sourcePageUrl: sourcePageUrl || window.location.href,
      ...(property.development?.id ? { developmentId: property.development.id } : {}),
      consent: { privacyAccepted: true, marketingConsent: values.get('marketing') === 'on', wording: privacyWording, wordingVersion: 'revo-property-enquiry-v1' }, utm: {} }
    let campaign
    try { campaign = new URL(payload.sourcePageUrl).searchParams }
    catch { setResult({ error: true, message: 'This page’s enquiry connection is unavailable. Please contact the Revo team.' }); return }
    for (const [query, key] of [['utm_source','utmSource'],['utm_medium','utmMedium'],['utm_campaign','utmCampaign'],['utm_term','utmTerm'],['utm_content','utmContent']]) if (campaign.has(query)) payload.utm[key] = campaign.get(query).slice(0,160)
    const fingerprint = JSON.stringify(payload)
    if (submission.current?.fingerprint !== fingerprint) submission.current = { fingerprint, key: `revo-${crypto.randomUUID()}` }
    payload.idempotencyKey = submission.current.key
    setBusy(true); setResult(null)
    try {
      const response = await client.enquiry(payload)
      if (!response?.accepted || !response.leadId) throw new Error('We could not confirm your enquiry. Please try again.')
      setResult({ message: 'Your enquiry has reached the Revo team. We will be in touch.' }); submission.current = null; form.reset()
    } catch (error) { setResult({ error: true, message: error.message || 'Your enquiry could not be sent. Please try again.' }) }
    finally { setBusy(false) }
  }
  return <section className="revo-enquiry" id="revo-enquire" aria-label="Your property agent">
    <h2 className="revo-agent-card-title">Contact the agent</h2>
    <div className="revo-agent"><span aria-hidden="true">{initials}</span><div><h3>{agentName}</h3><p>Revo Properties</p><small>{preview ? 'Demo agent · ' : ''}{placeOf(property) || 'Your property consultant'}</small></div></div>
    <p className="revo-agent-intro">Ask a question or arrange a viewing.</p>
    {!preview && (property.agent?.phone || property.agent?.email) ? <div className="revo-agent-contact">{property.agent.phone ? <a href={`tel:${encodeURIComponent(property.agent.phone)}`}>{property.agent.phone}</a> : null}{property.agent.email ? <a href={`mailto:${encodeURIComponent(property.agent.email)}`}>Email your agent<ArrowUpRight size={14} aria-hidden="true" /></a> : null}</div> : null}
    <button className="revo-viewing-button" type="button" onClick={requestViewing}>Arrange a viewing<ArrowUpRight size={19} aria-hidden="true" /></button>
    <details className="revo-enquiry-compose" ref={compose} open={preview ? undefined : true}><summary><MessageCircle size={16} aria-hidden="true" />Send a message<Plus size={17} aria-hidden="true" /></summary>
    <form ref={formRef} onSubmit={submit} aria-label="Property enquiry"><label>Your name<input name="name" required minLength={2} maxLength={160} autoComplete="name" placeholder="Full name" /></label><div className="revo-form-pair"><label>Email address<input name="email" type="email" maxLength={254} autoComplete="email" placeholder="you@example.com" /></label><label>Phone number<input name="phone" type="tel" maxLength={64} autoComplete="tel" placeholder="Your phone number" /></label></div><label>Your message<textarea name="message" maxLength={4000} rows={3} defaultValue={`I would like to know more about ${property.title}.`} /></label><label className="revo-consent"><input name="privacy" type="checkbox" required />{privacyWording}</label><label className="revo-consent"><input name="marketing" type="checkbox" />I would also like to receive property news and marketing from Revo. (Optional)</label>
      {result ? <p className={`revo-form-result${result.error ? ' revo-form-result--error' : ''}`} role={result.error ? 'alert' : 'status'}>{result.message}</p> : null}
      <button className="revo-primary-button" type="submit" disabled={busy}>{busy ? 'Sending enquiry…' : preview ? 'Try the enquiry form' : 'Send enquiry'}<ArrowUpRight size={18} aria-hidden="true" /></button>{preview ? <small className="revo-preview-form-note">Preview only · enquiries are not sent</small> : <small>We’ll use your details to respond to your enquiry.</small>}
    </form></details>
  </section>
}

function applicationUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null }
  catch { return null }
}

function ApplicationCard({ property, preview, bondApplicationUrl, rentalApplicationUrl }) {
  const rental = property.transactionType === 'rental'
  const url = applicationUrl(rental ? rentalApplicationUrl : bondApplicationUrl)
  const dialog = useRef(null)
  const trigger = useRef(null)
  const close = () => { dialog.current.close(); trigger.current?.focus() }
  if (!preview && !url) return null
  if (['sold', 'rented', 'let'].includes(property.status)) return null
  const action = rental ? 'Apply to rent' : 'Apply for a bond'
  const title = rental ? 'Rental application' : 'Home finance'
  return <>
    <section className="revo-application-card" aria-label={rental ? 'Rental application' : 'Home finance'}>
      <h2>{title}</h2><p>{rental ? 'Ready to make your move? Start your rental application.' : 'Explore finance options for this property.'}</p>
      {preview ? <button type="button" ref={trigger} onClick={() => dialog.current.showModal()}>{action}<ArrowUpRight size={19} aria-hidden="true" /></button> : <a href={url} target="_blank" rel="noopener noreferrer">{action}<ArrowUpRight size={19} aria-hidden="true" /></a>}
      <small>{preview ? 'Demo application journey' : 'Continue to the secure application'}</small>
    </section>
    {preview ? <dialog ref={dialog} className="revo-application-dialog" aria-labelledby="revo-application-title" onCancel={(event) => { event.preventDefault(); close() }}>
      <button className="revo-application-close" type="button" onClick={close} aria-label="Close application preview"><X size={22} /></button><p className="revo-eyebrow">{rental ? 'RENTAL APPLICATION' : 'HOME FINANCE'}</p><h2 id="revo-application-title">{rental ? 'Your new chapter starts here.' : 'A home of your own starts here.'}</h2><p>{rental ? 'This is where the secure rental application will begin.' : 'This is where Revo’s approved bond partner will guide you through your finance application.'}</p>
      <ol><li><span>01</span><div><strong>{rental ? 'Introduce yourself' : 'Explore your options'}</strong><p>{rental ? 'Start with your contact details and preferred move-in date.' : 'Discuss the property and your finance needs.'}</p></div></li><li><span>02</span><div><strong>Complete your application</strong><p>Provide your information and documents through the secure application.</p></div></li><li><span>03</span><div><strong>{rental ? 'Plan your next move' : 'Get help with the next step'}</strong><p>{rental ? 'Your agent will guide you through the outcome and next steps.' : 'The bond partner will guide you through the outcome and next steps.'}</p></div></li></ol>
      <p className="revo-application-preview-note">Design preview only. No application is submitted or personal information collected here.</p><button className="revo-primary-button" type="button" onClick={close}>Back to the property<ArrowRight size={17} aria-hidden="true" /></button>
    </dialog> : null}
  </>
}

function PropertyDetail({ property, client, preview, sourcePageUrl, onBack, showEnquiry, bondApplicationUrl, rentalApplicationUrl }) {
  const [shareMessage, setShareMessage] = useState('')
  const [showMobileContact, setShowMobileContact] = useState(false)
  const galleryArea = useRef(null)
  const contactArea = useRef(null)
  useEffect(() => {
    if (!showEnquiry || typeof IntersectionObserver === 'undefined') return
    let galleryHasPassed = false
    let contactIsVisible = true
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === galleryArea.current) galleryHasPassed = !entry.isIntersecting && entry.boundingClientRect.top < 0
        if (entry.target === contactArea.current) contactIsVisible = entry.isIntersecting
      }
      setShowMobileContact(galleryHasPassed && !contactIsVisible)
    })
    observer.observe(galleryArea.current)
    observer.observe(contactArea.current)
    return () => observer.disconnect()
  }, [showEnquiry])
  async function share() { try { await navigator.clipboard.writeText(window.location.href); setShareMessage('Property link copied.') } catch { setShareMessage('Copy this page’s address to share the property.') } }
  return <div className="revo-detail">
    <div className="revo-detail-navigation"><button type="button" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />Back to properties</button><span>{property.reference}</span><button type="button" onClick={share}><Share2 size={16} aria-hidden="true" />Share property</button></div>
    {shareMessage ? <p className="revo-share-status" role="status">{shareMessage}</p> : null}
    <div ref={galleryArea}><PropertyGallery property={property} /></div>
    <div className="revo-detail-layout">
      <div className="revo-detail-information">
        <section className="revo-property-overview" aria-label="Property overview">
          <header className="revo-detail-heading">
            <p className="revo-heading-meta"><span>{labelOf(property)}</span>{property.propertyType}</p>
            <h1>{property.title}</h1>
            <p className="revo-detail-place"><MapPin size={16} aria-hidden="true" />{placeOf(property)}{property.location?.province ? ` · ${property.location.province}` : ''}</p>
          </header>
          <PropertyFacts property={property} detailed />
        </section>
        <section className="revo-description" id="revo-about"><h2>About this property</h2><p>{property.description || 'Contact the Revo team for more information about this property.'}</p></section>
        <section className="revo-property-details" id="revo-details"><h2>Property details</h2><dl>{[['Property type',property.propertyType],['Floor size',property.size?.floor != null ? `${property.size.floor} m²` : null],['Land size',property.size?.land != null ? `${property.size.land} m²` : null],['Garages',property.garages],['Development',property.development?.name],['Reference',property.reference]].filter(([,value])=>value != null && value !== '').map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
        {property.media?.length ? <section className="revo-public-media"><h2>Take a closer look</h2>{property.media.map((media,index)=><a key={`${media.url}-${index}`} href={media.url} target="_blank" rel="noopener noreferrer">{media.caption || ({ floor_plan: 'View floor plan', video: 'Watch property video', virtual_tour: 'Explore the virtual tour' }[media.type] || 'View property media')}<ArrowUpRight size={17} aria-hidden="true" /></a>)}</section> : null}
      </div>
      <aside ref={contactArea} className="revo-detail-sidebar" aria-label={showEnquiry ? 'Property price, enquiries and applications' : 'Property price'}>
        <div className="revo-heading-price"><p>{property.transactionType === 'rental' ? 'MONTHLY RENTAL' : 'PROPERTY PRICE'}</p><strong>{property.price ? money.format(property.price) : 'Price on request'}</strong>{property.transactionType === 'rental' ? <span>per month</span> : null}</div>
        {showEnquiry ? <><EnquiryForm key={property.id} property={property} client={client} preview={preview} sourcePageUrl={sourcePageUrl} /><ApplicationCard property={property} preview={preview} bondApplicationUrl={bondApplicationUrl} rentalApplicationUrl={rentalApplicationUrl} /></> : null}
      </aside>
    </div>
    {showEnquiry ? <a className="revo-mobile-contact" data-visible={showMobileContact} href="#revo-enquire">Enquire about this property<ArrowUpRight size={19} aria-hidden="true" /></a> : null}
  </div>
}

export default function RevoPropertyExperience({ client, propertyId = null, onNavigate, propertyHref = (id) => `?property=${encodeURIComponent(id)}`, preview = false, sourcePageUrl, showBrandFrame = true, showCollectionIntro = true, showEnquiry = true, bondApplicationUrl, rentalApplicationUrl }) {
  const [filters, setFilters] = useState(emptyFilters)
  const [collection, setCollection] = useState({ loading: true, data: [], total: 0, error: '' })
  const [detail, setDetail] = useState({ loading: true, property: null, error: '' })
  const [reload, setReload] = useState(0)
  const [filterReset, setFilterReset] = useState(0)
  useEffect(() => {
    if (propertyId) return
    let active = true
    const controller = new AbortController()
    setCollection((previous) => ({ ...previous, loading: true, error: '' }))
    client.listings({ ...filters, limit: PAGE_SIZE }, { signal: controller.signal }).then((response) => {
      if (active) setCollection({ loading: false, data: response.data || [], total: response.pagination?.total || 0, error: '' })
    }).catch((error) => { if (active) setCollection({ loading: false, data: [], total: 0, error: error.message }) })
    return () => { active = false; controller.abort() }
  }, [client, filters, propertyId, reload])
  useEffect(() => {
    if (!propertyId) return
    let active = true
    const controller = new AbortController()
    setDetail({ loading: true, property: null, error: '' })
    client.property(propertyId, { signal: controller.signal }).then((property) => { if (active) setDetail({ loading: false, property, error: '' }) }).catch((error) => { if (active) setDetail({ loading: false, property: null, error: error.message }) })
    return () => { active = false; controller.abort() }
  }, [client, propertyId, reload])
  const navigate = (id) => onNavigate?.(id)
  const open = (event, id) => { if (onNavigate && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) { event.preventDefault(); navigate(id) } }
  const changeType = (type) => { setFilters((previous) => ({ ...previous, transactionType: type, offset: 0 })); navigate(null) }
  return <main className={`revo-property-experience${showCollectionIntro ? '' : ' revo-property-experience--listings-only'}`}>
    {preview ? <div className="revo-preview-banner"><span>{showCollectionIntro ? 'DESIGN PREVIEW' : 'LISTING DEMO'}</span>{showCollectionIntro ? 'Sample properties · for UX/UI review · enquiries are not sent' : 'Sample properties'}</div> : null}
    {showBrandFrame ? <header className="revo-property-header"><a className="revo-wordmark" href="?" onClick={(event) => { if(onNavigate) { event.preventDefault(); navigate(null) } }} aria-label="Revo Properties home">REVO<span>PROPERTIES</span></a><nav aria-label="Property collection"><button type="button" onClick={() => changeType('sale')}>For sale</button><button type="button" onClick={() => changeType('rental')}>To rent</button><span>PROPERTY. PEOPLE. POSSIBILITY.</span></nav></header> : null}
    {propertyId ? <>{detail.loading ? <div className="revo-loading" role="status">Loading this property…</div> : detail.property ? <PropertyDetail key={propertyId} property={detail.property} client={client} preview={preview} sourcePageUrl={sourcePageUrl} onBack={() => navigate(null)} showEnquiry={showEnquiry} bondApplicationUrl={bondApplicationUrl} rentalApplicationUrl={rentalApplicationUrl} /> : <section className="revo-unavailable"><p className="revo-eyebrow">REVO PROPERTIES</p><h1>{detail.error ? 'A little pause in your property search.' : 'This property has moved on.'}</h1><p role={detail.error ? 'alert' : 'status'}>{detail.error || 'It is no longer available online. Explore the properties currently available with Revo.'}</p><button className="revo-primary-button" type="button" onClick={() => detail.error ? setReload((previous) => previous + 1) : navigate(null)}>{detail.error ? 'Try again' : 'Browse current properties'}<ArrowRight size={18} /></button></section>}</> : <>
      {showCollectionIntro ? <section className="revo-collection-intro"><p className="revo-eyebrow">YOUR NEXT CHAPTER STARTS HERE</p><h1>Find a place<br />that feels like <em>you.</em></h1><p>Thoughtfully chosen properties. People who understand what matters.<br />Let’s find your next place, together.</p><div className="revo-collection-tabs" aria-label="Listing type">{[['','All properties'],['sale','For sale'],['rental','To rent']].map(([type,label])=><button key={label} type="button" aria-pressed={filters.transactionType===type} onClick={()=>changeType(type)}>{label}</button>)}</div><SearchFilters key={`${filters.transactionType}-${filterReset}`} filters={filters} onSearch={setFilters} /></section> : null}
      <section className="revo-results" aria-label="Available properties" aria-busy={collection.loading}><div className="revo-results-heading"><div>{showCollectionIntro ? <><p className="revo-eyebrow">THE PROPERTY COLLECTION</p><h2>{filters.transactionType === 'rental' ? 'A fresh start. A new address.' : 'Good places. Great possibilities.'}</h2></> : <h1>Properties</h1>}<p>{collection.loading ? 'Finding your next place…' : `${collection.total} ${collection.total===1 ? 'property' : 'properties'}${filters.location ? ` matching “${filters.location}”` : ' to explore'}`}</p></div><label>Sort by<select value={filters.sort} onChange={(event)=>setFilters((previous)=>({...previous,sort:event.target.value,offset:0}))}><option value="updated_desc">Recently updated</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select></label></div>
        {collection.error ? <div className="revo-results-notice"><p role="alert">{collection.error}</p><button type="button" onClick={()=>setReload((previous)=>previous+1)}>Try again</button></div> : collection.loading ? <div className="revo-card-grid" role="status" aria-label="Loading properties">{[1,2,3].map((index)=><div className="revo-card-skeleton" key={index} />)}</div> : collection.data.length ? <><div className="revo-card-grid">{collection.data.map((property)=><PropertyCard key={property.id} property={property} href={propertyHref(property.id)} onOpen={(event)=>open(event,property.id)} />)}</div><div className="revo-pagination"><p>Showing {Number(filters.offset)+1}–{Number(filters.offset)+collection.data.length} of {collection.total}</p><div><button type="button" disabled={!Number(filters.offset)} onClick={()=>setFilters((previous)=>({...previous,offset:Math.max(0,Number(previous.offset)-PAGE_SIZE)}))}><ChevronLeft size={18} />Previous</button><button type="button" disabled={Number(filters.offset)+collection.data.length>=collection.total} onClick={()=>setFilters((previous)=>({...previous,offset:Number(previous.offset)+PAGE_SIZE}))}>Next<ChevronRight size={18} /></button></div></div></> : <div className="revo-results-notice"><Building2 size={30} /><h3>Let’s try a different search.</h3><p>No properties match these filters right now.</p><button type="button" onClick={()=>{setFilters({...emptyFilters});setFilterReset((previous)=>previous+1)}}>Clear filters</button></div>}
      </section>
    </>}
    {showBrandFrame ? <footer className="revo-property-footer"><p>REVO <span>PROPERTIES</span></p><span>{preview ? 'A preview of your next property experience.' : 'Your next chapter starts with the right people.'}</span></footer> : null}
  </main>
}
