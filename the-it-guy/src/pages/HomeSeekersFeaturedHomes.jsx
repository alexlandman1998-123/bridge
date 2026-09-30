import { ArrowRight, ArrowUpRight, Bath, BedDouble, Car, MapPin } from 'lucide-react'
import './HomeSeekersFeaturedHomes.css'

// Remove this preview set once approved published homes are available.
const sampleHomes = [
  ['Moreleta Park', 'R2 850 000', 4, 3, 2, 'photo-1600585154340-be6161a56a0c'],
  ['Garsfontein', 'R2 390 000', 3, 2, 2, 'photo-1600210492486-724fe5c67fb0'],
  ['Olympus', 'R3 650 000', 4, 3, 2, 'photo-1600607687920-4e2a09cf159d'],
  ['Faerie Glen', 'R1 450 000', 2, 2, 1, 'photo-1600566753086-00f18fb6b3ea'],
  ['Menlyn', 'R1 950 000', 2, 2, 2, 'photo-1600047509807-ba8f99d2cdde'],
  ['Waterkloof', 'R5 750 000', 5, 4, 3, 'photo-1600210491892-03d54c0aaf87'],
  ['Brooklyn', 'R3 895 000', 4, 3, 2, 'photo-1600566753190-17f0baa2a6c3'],
  ['Lynnwood', 'R2 250 000', 3, 2, 2, 'photo-1600607687939-ce8a6c25118c'],
  ['Silver Lakes', 'R4 650 000', 4, 3, 2, 'photo-1600585154340-be6161a56a0c'],
].map(([place, price, beds, baths, cars, photo], index) => ({
  id: `sample-${index + 1}`,
  place,
  price,
  beds,
  baths,
  cars,
  image: `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=1100&q=85`,
  sample: true,
}))

function FeaturedCard({ home, index }) {
  return <article className="hs-featured-card">
    <div className="hs-featured-card__image">
      {home.image ? <img src={home.image} alt={home.sample ? `Illustrative home for ${home.place} design preview` : `${home.place} property`} loading="lazy" /> : <div className="hs-featured-card__image-placeholder" aria-hidden="true" />}
      <span>{home.sample ? 'DESIGN SAMPLE' : 'FOR SALE'}</span>
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
      <a href={home.sample ? '/demo/homeseekers/buying' : `/demo/homeseekers/buying/${home.id}`}>
        {home.sample ? 'Browse real homes' : 'View this home'} <ArrowUpRight size={16} aria-hidden="true" />
      </a>
    </div>
  </article>
}

export default function HomeSeekersFeaturedHomes({ listings, loading, error }) {
  const hasLiveHomes = listings.length > 0
  const homes = hasLiveHomes ? listings.slice(0, 9) : sampleHomes

  return <section className="hs-featured" id="featured-homes" aria-labelledby="hs-featured-title">
    <div className="hs-featured__heading">
      <div>
        <p className="hs-featured__eyebrow">❯ FEATURED <strong>HOMES</strong></p>
        <h2 id="hs-featured-title">Homes for the<br /><em>next move.</em></h2>
      </div>
      <div className="hs-featured__heading-side">
        <p>{hasLiveHomes ? 'A closer look at homes currently published by Home Seekers.' : 'A preview of how featured homes will look once listings are published.'}</p>
        <a href="/demo/homeseekers/buying">Browse all homes <ArrowRight size={17} aria-hidden="true" /></a>
      </div>
    </div>
    {!hasLiveHomes && <p className="hs-featured__notice" role="status">{loading ? 'Loading published homes. Sample cards are shown for the design preview.' : error ? 'Live homes are unavailable in this preview. These are sample cards, not available properties.' : 'No homes are currently published. These are sample cards, not available properties.'}</p>}
    <div className="hs-featured__grid">
      {homes.map((home, index) => <FeaturedCard home={home} index={index} key={home.id} />)}
    </div>
  </section>
}
