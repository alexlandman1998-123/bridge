import { ArrowRight, ArrowUpRight, Bath, BedDouble, Car, MapPin } from 'lucide-react'
import './HomeSeekersFeaturedHomes.css'

function FeaturedCard({ home, index }) {
  return <article className="hs-featured-card">
    <div className="hs-featured-card__image">
      {home.image ? <img src={home.image} alt={`${home.place} property`} loading="lazy" /> : <div className="hs-featured-card__image-placeholder" aria-hidden="true" />}
      <span>FOR SALE</span>
      <b>{String(index + 1).padStart(2, '0')}</b>
    </div>
    <div className="hs-featured-card__body">
      <p className="hs-featured-card__place"><MapPin size={14} aria-hidden="true" /> {home.place}</p>
      <h3>{home.price}</h3>
      <div className="hs-featured-card__facts">
        {home.beds && <span><BedDouble size={16} aria-hidden="true" /> {home.beds} beds</span>}
        {home.baths && <span><Bath size={16} aria-hidden="true" /> {home.baths} baths</span>}
        {home.cars && <span><Car size={16} aria-hidden="true" /> {home.cars} parking</span>}
      </div>
      <a href={`/demo/homeseekers/properties/${home.id}`}>
        View this home <ArrowUpRight size={16} aria-hidden="true" />
      </a>
    </div>
  </article>
}

export default function HomeSeekersFeaturedHomes({ listings = [], loading = false, error = '' }) {
  const homes = loading || error ? [] : listings.slice(0, 9)

  return <section className="hs-featured" id="featured-homes" aria-labelledby="hs-featured-title">
    <div className="hs-featured__heading">
      <div>
        <p className="hs-featured__eyebrow">❯ FEATURED <strong>HOMES</strong></p>
        <h2 id="hs-featured-title">Homes for the<br /><em>next move.</em></h2>
      </div>
      <div className="hs-featured__heading-side">
        <p>A closer look at homes currently available through Home Seekers.</p>
        <a href="/demo/homeseekers/buying">Browse all homes <ArrowRight size={17} aria-hidden="true" /></a>
      </div>
    </div>
    {!homes.length && <p className="hs-featured__notice" role={error ? 'alert' : 'status'}>{loading ? 'Loading current homes…' : error ? 'The current homes could not be loaded. Please try again shortly.' : 'No homes are available online right now.'} {!loading && <a href="/demo/homeseekers/contact">Contact us to find your next home.</a>}</p>}
    {homes.length > 0 && <div className="hs-featured__grid">
      {homes.map((home, index) => <FeaturedCard home={home} index={index} key={home.id} />)}
    </div>}
  </section>
}
