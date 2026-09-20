import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { resolveSite } from '@/lib/site-repository'
import { templateClassName } from '@/lib/site-templates'

export const dynamic = 'force-dynamic'

const areas = [
  { name: 'Kyalami', number: '01', note: 'Space, schools and an established sense of home.' },
  { name: 'Waterfall', number: '02', note: 'Connected living, contemporary estates and everyday ease.' },
  { name: 'Midrand', number: '03', note: 'The place where Gauteng’s best connections meet.' },
  { name: 'Sandton', number: '04', note: 'A sharper rhythm, with quieter pockets worth knowing.' },
  { name: 'Centurion', number: '05', note: 'Room to settle in, with the city still within reach.' },
]

export default async function AreasPage() {
  const site = await resolveSite((await headers()).get('host'))
  if (!site) notFound()
  const lwp = site.name === 'LWP Properties'

  return <main className={`${templateClassName(site.templateKey)} areas-page${lwp ? ' lwp-areas-page' : ''}`} style={{ '--primary': site.primaryColor, '--secondary': site.secondaryColor, '--accent': site.accentColor } as React.CSSProperties}>
    <SiteHeader site={site} currentHref="/areas" />
    <section className="areas-hero"><div className="areas-shell"><p className="eyebrow">LOCAL, PROPERLY LOCAL</p><div><h1>{lwp ? 'More than a pin on a map.' : 'Find a place that feels right.'}</h1><p>{lwp ? 'Every move is made neighbourhood by neighbourhood. We bring a closer view of the places shaping life across Midrand and beyond.' : 'Explore the places, streets and lifestyles that make a neighbourhood feel like home.'}</p></div><p className="areas-index">01—05 / THE LWP LOCAL EDIT</p></div></section>
    <section className="areas-collection" aria-label="Areas we know"><div className="areas-collection-header"><div><p className="eyebrow">THE LOCAL COLLECTION</p><h2>Know the place<br />before the move.</h2></div><p>Good property advice starts with context: the commute, the coffee, the schools, the streets and the pace of a place.</p></div><p className="lwp-swipe-cue" aria-hidden="true"><span>Swipe through the collection</span><b>→</b></p><div className="areas-grid">{areas.map((area) => <a className={`area-card area-card-${area.number}`} href={`/properties?type=sale&q=${encodeURIComponent(area.name)}`} key={area.name}><span>{area.number}</span><div><h3>{area.name}</h3><p>{area.note}</p></div><b aria-hidden="true">↗</b></a>)}<a className="areas-all" href="/properties?type=sale"><p>NOT SURE WHERE TO START?</p><strong>Explore every<br />available home.</strong><b aria-hidden="true">↗</b></a></div></section>
    <section className="areas-guidance"><div><p className="eyebrow">A CLOSER WAY TO SEARCH</p><h2>Tell us how you want to live.</h2></div><p>We will help you narrow the neighbourhoods, spot the right opportunities and find the home that makes sense for your day-to-day.</p><a href="/contact">Start a local search <span aria-hidden="true">↗</span></a></section>
    <SiteFooter site={site} />
  </main>
}
