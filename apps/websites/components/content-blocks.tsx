import { LeadForm } from '@/components/lead-form'
import { Fragment } from 'react'
import { FeaturedPropertyCarousel } from '@/components/featured-property-carousel'
import { PropertyCard } from '@/components/property-card'
import { HomeSearch } from '@/components/home-search'
import { PropertySearch } from '@/components/property-search'
import { isHomeSeekersTemplate } from '@/lib/site-templates'
import type { PublicPage, PublicProperty, ResolvedSite, WebsiteBlock, WebsiteTemplateKey } from '@/lib/types'

function Block({ block, page, properties, templateKey, site }: { block: WebsiteBlock; page: PublicPage; properties: PublicProperty[]; templateKey: WebsiteTemplateKey; site: ResolvedSite }) {
  if (block.type === 'hero') return <section className={page.kind === 'home' ? 'hero' : 'campaign-hero'}><div className="content-shell"><p className="eyebrow">{block.eyebrow || 'PROPERTY, SIMPLIFIED'}</p><h1>{block.heading}</h1>{block.body && <p>{block.body}</p>}{page.kind === 'home' ? isHomeSeekersTemplate(templateKey) ? <HomeSearch areas={Array.from(new Set(properties.map(property => property.suburb).filter((area): area is string => Boolean(area))))} /> : <PropertySearch /> : block.ctaLabel && block.ctaHref ? <a className="header-cta" href={block.ctaHref}>{block.ctaLabel}</a> : null}</div></section>
  if (block.type === 'rich_text') return <section className="editorial-block"><div>{block.heading && <><p className="eyebrow">{page.kind === 'about' ? 'OUR APPROACH' : 'OUR PEOPLE'}</p><h2>{block.heading}</h2></>}<p>{block.body}</p>{block.ctaLabel && block.ctaHref && <a href={block.ctaHref}>{block.ctaLabel} <span aria-hidden="true">→</span></a>}</div></section>
  if (block.type === 'property_collection') { const selected = properties.filter((property) => !block.transactionType || property.transactionType === block.transactionType).slice(0, Math.min(Math.max(block.maxItems || 3, 1), 12)); return isHomeSeekersTemplate(templateKey) ? <FeaturedPropertyCarousel heading={block.heading || 'Featured properties'} properties={selected} /> : <section className="section"><div className="content-shell"><div className="section-heading"><div><h2>{block.heading || 'Featured properties'}</h2></div><a href="/properties">View all properties <span aria-hidden="true">→</span></a></div><div className="property-grid">{selected.map((property) => <PropertyCard key={property.id} property={property} />)}</div></div></section> }
  if (block.type === 'benefits') return <section className="benefits-block"><div><p className="eyebrow">WHY {site.name.toUpperCase()}</p><h2>{block.heading || 'A better property experience.'}</h2></div><div className="benefit-grid">{block.items.slice(0, 6).map((item) => <article key={item.title}><h3>{item.title}</h3><p>{item.body}</p></article>)}</div></section>
  if (block.type === 'faq') return <section className="faq-block"><h2>{block.heading || 'Questions, answered.'}</h2>{block.items.slice(0, 12).map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</section>
  if (block.type === 'lead_form') return page.kind === 'home' && isHomeSeekersTemplate(templateKey) ? null : <section className="enquiry-section" id="enquire"><div className="content-shell enquiry-shell"><div><p className="eyebrow">LET’S TALK</p><h2>{block.heading || 'Start your next move.'}</h2>{block.body && <p>{block.body}</p>}</div><LeadForm pageId={page.id} purpose={block.purpose || (page.kind === 'campaign' ? 'campaign_enquiry' : 'general_enquiry')} /></div></section>
  return <section className="cta-block"><h2>{block.heading}</h2>{block.body && <p>{block.body}</p>}<a className="header-cta" href={block.ctaHref}>{block.ctaLabel}</a></section>
}

function Neighbourhoods() {
  const areas = [
    { name: 'Waterkloof', image: '/images/kingdom-neighbourhood-v1.png' },
    { name: 'Brooklyn', image: '/images/kingdom-showcase-apartment-v1.png' },
    { name: 'Lynnwood', image: '/images/kingdom-showcase-lynnwood-v1.png' },
  ]
  return <section className="neighbourhoods-section" id="neighbourhoods"><div className="content-shell"><div className="section-heading"><div><h2>Find your neighbourhood</h2><p>Explore some of Pretoria’s most loved addresses.</p></div><a href="/properties">View all areas <span aria-hidden="true">→</span></a></div><div className="neighbourhood-grid">{areas.map((area) => <a href={`/properties?q=${encodeURIComponent(area.name)}`} key={area.name} className="neighbourhood-card"><img src={area.image} alt="" /><span>{area.name}<b aria-hidden="true">→</b></span></a>)}</div></div></section>
}

export function ContentBlocks({ page, properties, templateKey, site }: { page: PublicPage; properties: PublicProperty[]; templateKey: WebsiteTemplateKey; site: ResolvedSite }) {
  const homeSeekers = isHomeSeekersTemplate(templateKey)
  return <>
    {page.blocks.filter((block) => !block.hidden).map((block, index) => <Fragment key={`${block.type}-${index}`}><Block block={block} page={page} properties={properties} site={site} templateKey={templateKey} />{page.kind === 'home' && homeSeekers && block.type === 'rich_text' && <Neighbourhoods />}</Fragment>)}
    {page.kind === 'home' && <section className="newsletter-section"><div><p className="eyebrow">STAY IN TOUCH</p><h2>Stay close to the market.</h2><p>Get the latest properties, local market insights and neighbourhood news.</p></div><LeadForm pageId={page.id} purpose="newsletter_signup" privacyPolicyUrl={site.privacyPolicyUrl} /></section>}
  </>
}
