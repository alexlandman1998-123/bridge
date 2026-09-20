import { LeadForm } from '@/components/lead-form'
import { Fragment } from 'react'
import { FeaturedPropertyCarousel } from '@/components/featured-property-carousel'
import { PropertyCard } from '@/components/property-card'
import { HomeSearch } from '@/components/home-search'
import { PropertySearch } from '@/components/property-search'
import { isHomeSeekersTemplate } from '@/lib/site-templates'
import { RecentlySoldStrip } from '@/components/recently-sold-strip'
import type { PublicBlogPost, PublicPage, PublicProperty, ResolvedSite, WebsiteBlock, WebsiteTemplateKey } from '@/lib/types'

function SwipeCue({ label = 'Swipe to explore' }: { label?: string }) {
  return <p className="lwp-swipe-cue" aria-hidden="true"><span>{label}</span><b>→</b></p>
}

function Block({ block, page, properties, templateKey, site }: { block: WebsiteBlock; page: PublicPage; properties: PublicProperty[]; templateKey: WebsiteTemplateKey; site: ResolvedSite }) {
  if (block.type === 'hero') {
    const lwpHome = page.kind === 'home' && site.name === 'LWP Properties'
    return <section className={`${page.kind === 'home' ? 'hero' : 'campaign-hero'}${lwpHome ? ' lwp-home-hero' : ''}`}><div className="content-shell">
      <p className="eyebrow">{lwpHome ? 'LOCAL PERSPECTIVE · KYALAMI / WATERFALL / MIDRAND' : block.eyebrow || 'PROPERTY, SIMPLIFIED'}</p>
      <h1>{block.heading}</h1>{block.body && <p>{block.body}</p>}
      {page.kind === 'home' ? isHomeSeekersTemplate(templateKey) ? <HomeSearch areas={Array.from(new Set(properties.map(property => property.suburb).filter((area): area is string => Boolean(area))))} /> : <PropertySearch /> : block.ctaLabel && block.ctaHref ? <a className="header-cta" href={block.ctaHref}>{block.ctaLabel}</a> : null}
    </div></section>
  }
  if (block.type === 'rich_text' && page.kind === 'home' && site.name === 'LWP Properties') return <><section className="lwp-proof-row"><div className="lwp-proof-heading"><p className="eyebrow">The LWP difference</p><h2><span>Choose different.</span><strong>Choose LWP.</strong></h2></div><div className="lwp-proof-detail"><p className="lwp-proof-overline">Beyond the sale. Since 2008.</p><p className="lwp-proof-copy">{block.body}</p><a href={block.ctaHref || '/contact'}>{block.ctaLabel || 'Start a conversation'} <span aria-hidden="true">↗</span></a></div><SwipeCue label="Swipe for the numbers" /><div className="lwp-proof-metrics"><div><strong>20<span>+</span></strong><p>Years operating<br />experience</p></div><div><strong>30<span>+</span></strong><p>Property area<br />experts</p></div><div><strong>4.7</strong><p>Google review<br />rating</p></div></div></section><section className="lwp-area-atlas"><div className="lwp-area-intro"><p className="eyebrow">Local, properly local</p><h2>Midrand is more<br />than a midpoint.</h2><p>From Kyalami to Waterfall, LWP brings considered advice to the neighbourhoods shaping your next move.</p></div><SwipeCue label="Swipe through our areas" /><div className="lwp-area-grid">{[['Kyalami', '01'], ['Waterfall', '02'], ['Midrand', '03'], ['Sandton', '04'], ['Centurion', '05']].map(([area, index]) => <a className={`lwp-area-card lwp-area-card-${index}`} href={`/properties?type=sale&q=${encodeURIComponent(area)}`} key={area}><span>{index}</span><strong>{area}</strong><b aria-hidden="true">↗</b></a>)}<a className="lwp-area-all" href="/properties?type=sale"><span>Where next?</span><strong>Explore the<br />local collection.</strong><b aria-hidden="true">↗</b></a></div></section><RecentlySoldStrip properties={properties} /></>
  if (block.type === 'rich_text') return <section className="editorial-block"><div>{block.heading && <><p className="eyebrow">{page.kind === 'about' ? 'OUR APPROACH' : 'OUR PEOPLE'}</p><h2>{block.heading}</h2></>}<p>{block.body}</p>{block.ctaLabel && block.ctaHref && <a href={block.ctaHref}>{block.ctaLabel} <span aria-hidden="true">→</span></a>}</div></section>
  if (block.type === 'property_collection') { const selected = properties.filter((property) => !block.transactionType || property.transactionType === block.transactionType).slice(0, Math.min(Math.max(block.maxItems || 3, 1), 12)); return isHomeSeekersTemplate(templateKey) ? <FeaturedPropertyCarousel heading={site.name === 'LWP Properties' ? 'Homes worth moving for.' : block.heading || 'Featured properties'} properties={selected} showConsultant={site.name === 'LWP Properties'} /> : <section className="section"><div className="content-shell"><div className="section-heading"><div><h2>{block.heading || 'Featured properties'}</h2></div><a href="/properties">View all properties <span aria-hidden="true">→</span></a></div><div className="property-grid">{selected.map((property) => <PropertyCard key={property.id} property={property} />)}</div></div></section> }
  if (block.type === 'benefits') return <section className="benefits-block"><div><p className="eyebrow">WHY {site.name.toUpperCase()}</p><h2>{block.heading || 'A better property experience.'}</h2></div><div className="benefit-grid">{block.items.slice(0, 6).map((item) => <article key={item.title}><h3>{item.title}</h3><p>{item.body}</p></article>)}</div></section>
  if (block.type === 'faq') return <section className="faq-block"><h2>{block.heading || 'Questions, answered.'}</h2>{block.items.slice(0, 12).map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</section>
  if (block.type === 'lead_form') return page.kind === 'home' && isHomeSeekersTemplate(templateKey) ? null : <section className="enquiry-section" id="enquire"><div className="content-shell enquiry-shell"><div><p className="eyebrow">LET’S TALK</p><h2>{block.heading || 'Start your next move.'}</h2>{block.body && <p>{block.body}</p>}</div><LeadForm pageId={page.id} purpose={block.purpose || (page.kind === 'campaign' ? 'campaign_enquiry' : 'general_enquiry')} /></div></section>
  return <section className="cta-block"><h2>{block.heading}</h2>{block.body && <p>{block.body}</p>}<a className="header-cta" href={block.ctaHref}>{block.ctaLabel}</a></section>
}

function LatestBlogPosts({ posts, site }: { posts: PublicBlogPost[]; site: ResolvedSite }) {
  const latestPosts = posts.slice(0, 3)
  if (!latestPosts.length) return null

  return <section className="latest-blog-section" id="blog"><div className="content-shell"><div className="section-heading"><div><h2>Latest from {site.name}</h2></div><a href="/blog">View all articles <span aria-hidden="true">→</span></a></div><div className="latest-blog-grid">{latestPosts.map((post) => <a href={`/blog/${post.slug}`} key={post.id} className="latest-blog-card">{post.coverImageUrl ? <img src={post.coverImageUrl} alt={post.coverImageAlt || ''} /> : null}<div><p>{post.authorName || site.name}</p><h3>{post.title}</h3>{post.summary ? <span>{post.summary}</span> : null}<b>Read article <span aria-hidden="true">→</span></b></div></a>)}</div></div></section>
}

type LwpJournalStory = { id: string; href: string; category: string; title: string; summary: string; imageUrl?: string; imageClass?: string }

function LwpJournal({ posts }: { posts: PublicBlogPost[] }) {
  const published: LwpJournalStory[] = posts.slice(0, 6).map(post => ({ id: post.id, href: `/blog/${post.slug}`, category: 'LWP Journal', title: post.title, summary: post.summary || 'Local insight for your next move.', imageUrl: post.coverImageUrl }))
  const stories: LwpJournalStory[] = published.length ? published : [
    { id: 'midrand', href: '/blog', category: 'Area guide', title: 'The Midrand edit.', summary: 'The places, pockets and practical details worth knowing before your next move.', imageClass: 'midrand' },
    { id: 'waterfall', href: '/blog', category: 'Local perspective', title: 'Life around Waterfall.', summary: 'A considered look at one of Gauteng’s fastest-moving neighbourhoods.', imageClass: 'waterfall' },
    { id: 'kyalami', href: '/blog', category: 'Market note', title: 'Why Kyalami holds its own.', summary: 'Space, schools and a lifestyle that continues to draw people home.', imageClass: 'kyalami' },
    { id: 'sandton', href: '/blog', category: 'Neighbourhood note', title: 'A quieter side of Sandton.', summary: 'Where considered design, established streets and everyday ease meet.', imageClass: 'sandton' },
    { id: 'centurion', href: '/blog', category: 'Area guide', title: 'Centurion, at your pace.', summary: 'A closer look at the space, connection and lifestyle that make it work.', imageClass: 'centurion' },
    { id: 'selling', href: '/blog', category: 'Seller’s guide', title: 'Before your home goes live.', summary: 'The preparation that helps a considered sale begin with confidence.', imageClass: 'selling' },
    { id: 'moving', href: '/blog', category: 'The move', title: 'Making a move, well.', summary: 'Practical perspective for turning a property decision into a next chapter.', imageClass: 'moving' },
  ]
  return <section className="lwp-journal" id="journal"><div className="lwp-journal-header"><div><p className="eyebrow">The LWP journal</p><h2>Local insight.<br /><span>Better moves.</span></h2></div><a href="/blog">Explore the journal <span aria-hidden="true">↗</span></a></div><SwipeCue label="Swipe for more stories" /><div className="lwp-journal-track" aria-label="Latest journal stories">{stories.map((story, index) => <a className="lwp-journal-card" href={story.href} key={story.id}>{story.imageUrl ? <img src={story.imageUrl} alt="" /> : <div className={`lwp-journal-image lwp-journal-image-${story.imageClass || index}`} />}<div><p>{story.category} <span>0{index + 1}</span></p><h3>{story.title}</h3><span>{story.summary}</span><b>Read the story <i aria-hidden="true">↗</i></b></div></a>)}</div></section>
}

export function ContentBlocks({ page, properties, templateKey, site, blogPosts = [] }: { page: PublicPage; properties: PublicProperty[]; templateKey: WebsiteTemplateKey; site: ResolvedSite; blogPosts?: PublicBlogPost[] }) {
  const homeSeekers = isHomeSeekersTemplate(templateKey)
  return <>
    {page.blocks.filter((block) => !block.hidden).map((block, index) => <Fragment key={`${block.type}-${index}`}><Block block={block} page={page} properties={properties} site={site} templateKey={templateKey} />{page.kind === 'home' && homeSeekers && site.name !== 'LWP Properties' && block.type === 'rich_text' && <LatestBlogPosts posts={blogPosts} site={site} />}</Fragment>)}
    {page.kind === 'home' && <section className="newsletter-section"><div><p className="eyebrow">STAY IN TOUCH</p><h2>Stay close to the market.</h2><p>Get the latest properties, local market insights and neighbourhood news.</p></div><LeadForm pageId={page.id} purpose="newsletter_signup" privacyPolicyUrl={site.privacyPolicyUrl} /></section>}
    {page.kind === 'home' && site.name === 'LWP Properties' && <LwpJournal posts={blogPosts} />}
  </>
}
