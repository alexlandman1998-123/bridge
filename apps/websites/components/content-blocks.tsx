import { LeadForm } from '@/components/lead-form'
import { PropertyCard } from '@/components/property-card'
import type { PublicPage, PublicProperty, WebsiteBlock } from '@/lib/types'

function Block({ block, page, properties }: { block: WebsiteBlock; page: PublicPage; properties: PublicProperty[] }) {
  if (block.type === 'hero') return <section className="campaign-hero"><div><p className="eyebrow">{block.eyebrow || 'PROPERTY, SIMPLIFIED'}</p><h1>{block.heading}</h1>{block.body && <p>{block.body}</p>}{block.ctaLabel && block.ctaHref && <a className="header-cta" href={block.ctaHref}>{block.ctaLabel}</a>}</div></section>
  if (block.type === 'rich_text') return <section className="editorial-block"><div>{block.heading && <h2>{block.heading}</h2>}<p>{block.body}</p>{block.ctaLabel && block.ctaHref && <a href={block.ctaHref}>{block.ctaLabel} →</a>}</div></section>
  if (block.type === 'property_collection') { const selected = properties.filter((property) => !block.transactionType || property.transactionType === block.transactionType).slice(0, Math.min(Math.max(block.maxItems || 3, 1), 6)); return <section className="section"><div className="section-heading"><div><p className="eyebrow">CURATED LISTINGS</p><h2>{block.heading || 'Featured properties'}</h2></div><a href="/properties">View all properties →</a></div><div className="property-grid">{selected.map((property) => <PropertyCard key={property.id} property={property} />)}</div></section> }
  if (block.type === 'benefits') return <section className="benefits-block"><div><p className="eyebrow">WHY THIS AGENCY</p><h2>{block.heading || 'A better property experience.'}</h2></div><div className="benefit-grid">{block.items.slice(0, 6).map((item) => <article key={item.title}><h3>{item.title}</h3><p>{item.body}</p></article>)}</div></section>
  if (block.type === 'faq') return <section className="faq-block"><h2>{block.heading || 'Questions, answered.'}</h2>{block.items.slice(0, 12).map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</section>
  if (block.type === 'lead_form') return <section className="enquiry-section"><div><p className="eyebrow">LET’S TALK</p><h2>{block.heading || 'Start your next move.'}</h2>{block.body && <p>{block.body}</p>}</div><LeadForm pageId={page.id} purpose={block.purpose || (page.kind === 'campaign' ? 'campaign_enquiry' : 'general_enquiry')} /></section>
  return <section className="cta-block"><h2>{block.heading}</h2>{block.body && <p>{block.body}</p>}<a className="header-cta" href={block.ctaHref}>{block.ctaLabel}</a></section>
}

export function ContentBlocks({ page, properties }: { page: PublicPage; properties: PublicProperty[] }) {
  return <>{page.blocks.map((block, index) => <Block key={`${block.type}-${index}`} block={block} page={page} properties={properties} />)}</>
}
