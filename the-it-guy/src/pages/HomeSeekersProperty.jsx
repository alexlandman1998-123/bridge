import { ArrowLeft, ArrowRight, ArrowUpRight, Bath, BedDouble, Car, MapPin } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import HomeSeekersFooter from './HomeSeekersFooter'
import { formatHomeSeekersPrice, submitHomeSeekersLead, trackHomeSeekersEvent, useHomeSeekersWebsiteData } from './homeSeekersWebsiteData'
import './HomeSeekersProperty.css'

export default function HomeSeekersProperty() {
  const { propertyId } = useParams()
  const { listings, loading, error } = useHomeSeekersWebsiteData()
  const home = listings.find((listing) => listing.id === propertyId && listing.transactionType === 'sale')
  const [activeImage, setActiveImage] = useState(0)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { if (home?.id) trackHomeSeekersEvent('listing_view', home.id) }, [home?.id])

  if (loading) return <main className="hs-property hs-property--missing"><h1>Loading this home…</h1></main>
  if (!home) return <main className="hs-property hs-property--missing"><p>❯ HOME SEEKERS / PROPERTY</p><h1>{error || <>This home has<br />moved on.</>}</h1><a href="/demo/homeseekers/buying">Browse current homes <ArrowRight size={18} /></a></main>

  const images = home.images || []
  const price = formatHomeSeekersPrice(home.price, home.transactionType)
  const facts = [[BedDouble, home.bedrooms || '—', 'Bedrooms'], [Bath, home.bathrooms || '—', 'Bathrooms'], [Car, home.parkingBays || '—', 'Parking']]
  async function submit(event) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    setSending(true)
    setMessage('')
    try {
      await submitHomeSeekersLead({ type: 'property_enquiry', listingId: home.id, name: form.get('name'), phone: form.get('phone'), email: form.get('email'), message: String(form.get('message') || '').trim() || `Viewing request for ${home.title}`, privacyAccepted: form.get('privacy') === 'on', companyWebsite: form.get('website') })
      setMessage('Thank you. Your viewing request has reached the Home Seekers team.')
      formElement.reset()
    } catch (submitError) {
      setMessage(submitError.message || 'Your request could not be sent. Please try again.')
    } finally { setSending(false) }
  }

  return <main className="hs-property">
    <header className="hs-property__header"><a href="/demo/homeseekers/buying"><ArrowLeft size={18} /> All homes</a><a className="hs-property__brand" href="/demo/homeseekers"><img src="/brand/homeseekers/home-seekers-horizontal-black.svg" alt="Home Seekers" /></a></header>
    <section className="hs-property__hero">
      {images.length ? <img src={images[activeImage]} alt={`${home.title} image ${activeImage + 1}`} /> : <div className="hs-property__image-placeholder" aria-hidden="true" />}
      <div className="hs-property__shade" />
      <div className="hs-property__hero-dossier"><p>❯ FOR SALE <strong>/ HOME SEEKERS</strong></p><span><MapPin size={14} /> {home.address || home.suburb}</span><h1>{home.title}</h1><strong className="hs-property__hero-price">{price}</strong><div className="hs-property__hero-facts"><span><BedDouble size={15} /> {home.bedrooms || '—'} Beds</span><span><Bath size={15} /> {home.bathrooms || '—'} Baths</span><span><Car size={15} /> {home.parkingBays || '—'} Parking</span></div><a href="#enquire">Arrange a private viewing <ArrowRight size={17} /></a></div>
      {images.length > 1 && <div className="hs-property__hero-gallery"><span className="hs-property__count">{String(activeImage + 1).padStart(2, '0')} <i>/ {String(images.length).padStart(2, '0')}</i></span><div className="hs-property__filmstrip" aria-label="Property image gallery">{images.map((image, index) => <button className={index === activeImage ? 'is-active' : ''} type="button" key={image} onClick={() => setActiveImage(index)} aria-label={`View image ${index + 1} of ${images.length}`}><img src={image} alt="" /></button>)}</div></div>}
    </section>
    <section className="hs-property__summary"><div><p>❯ FOR SALE <strong>/ HOME SEEKERS</strong></p><h1>{home.title}</h1></div><aside><span>Asking price</span><strong>{price}</strong><a className="hs-property__viewing-trigger" href="#enquire">Arrange a private viewing <ArrowRight size={18} /></a></aside></section>
    <section className="hs-property__facts">{facts.map(([Icon, value, label]) => <div key={label}><Icon size={21} /><strong>{value}</strong><span>{label}</span></div>)}</section>
    <section className="hs-property__story"><div><p>❯ THE <strong>STORY</strong></p><h2>More than<br />a listing.</h2><p>{home.description || 'Ask our team for the full details of this home.'}</p><a href="#enquire">Request more information <ArrowUpRight size={18} /></a></div>{home.image && <figure><img src={home.image} alt={home.title} /><figcaption>HOME SEEKERS<br />CURATED HOMES</figcaption></figure>}</section>
    <section className="hs-property__enquire" id="enquire"><div><p>❯ MAKE YOUR <strong>NEXT MOVE</strong></p><h2>See it<br />properly.</h2><p>Share a few details and the Home Seekers team will help arrange a viewing.</p></div><form onSubmit={submit}><label>Your name<input required name="name" placeholder="Your name" /></label><label>Mobile number<input required name="phone" type="tel" placeholder="Your mobile number" /></label><label>Email address<input required type="email" name="email" placeholder="you@example.com" /></label><label>Message<textarea name="message" placeholder="Tell us when you would like to view" /></label><label className="hs-property__privacy"><input type="checkbox" name="privacy" required /> I agree to be contacted about this property.</label><input name="website" tabIndex="-1" autoComplete="off" aria-hidden="true" className="hs-property__honeypot" /><p role="status">{message}</p><button type="submit" disabled={sending}>{sending ? 'Sending…' : <>Request a private viewing <ArrowUpRight size={18} /></>}</button></form></section>
    <HomeSeekersFooter />
  </main>
}
