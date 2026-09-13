import Image from 'next/image'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ResourceShell, resourceSite } from '@/components/resource-shell'
import { getPublicBlogPost, getPublicBlogPosts, getPublicBlogRedirect, getPublicProperties, propertySlug } from '@/lib/site-repository'
import styles from '@/components/resources.module.css'
export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }> }
function readingMinutes(body: string) {
  return Math.max(1, Math.ceil(body.split(/\s+/).filter(Boolean).length / 200))
}
async function load(params: Props['params']) {
  const [site, { slug }] = await Promise.all([resourceSite(), params])
  const article = await getPublicBlogPost(site, slug)
  if (!article) {
    const target = await getPublicBlogRedirect(site, slug)
    if (target) redirect(`/blog/${target}`)
    notFound()
  }
  return { site, article }
}
export async function generateMetadata({ params }: Props) {
  const { site, article } = await load(params)
  return {
    title: article.seoTitle || `${article.title} | ${site.name}`,
    description: article.seoDescription || article.summary,
    alternates: { canonical: `/blog/${article.slug}` },
    openGraph: {
      type: 'article' as const,
      title: article.seoTitle || article.title,
      description: article.seoDescription || article.summary,
      publishedTime: article.publishedAt,
      images: [{ url: article.coverImageUrl || `/blog/${article.slug}/opengraph-image`, alt: article.coverImageAlt || article.title }],
    },
  }
}
export default async function ArticlePage({ params }: Props) {
  const { site, article } = await load(params)
  const [allPosts, properties] = await Promise.all([getPublicBlogPosts(site), getPublicProperties(site)])
  const related = allPosts.filter(item => item.slug !== article.slug).slice(0, 2)
  const propertiesById = new Map(properties.map((property) => [property.id, property]))
  const blocks = article.contentBlocks.length ? article.contentBlocks : article.body.split(/\n{2,}/).map((text, index) => ({ id: `legacy-${index}`, type: 'paragraph' as const, text: text.trim() })).filter(block => block.text)
  return <ResourceShell site={site} href="/blog"><article><header className={`${styles.intro} ${styles.articleIntro}`}><Link href="/blog" className={styles.back}>← Back to the journal</Link><p className={styles.eyebrow}>{article.authorName || site.name} · {readingMinutes(article.body)} min read</p><h1>{article.title}</h1><p>{article.summary}</p><time dateTime={article.publishedAt}>{new Date(article.publishedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' })}</time></header>{article.coverImageUrl ? <div className={styles.articleHero}><Image src={article.coverImageUrl} alt={article.coverImageAlt || ''} fill priority sizes="(max-width: 1240px) 100vw, 1240px" /></div> : null}<div className={styles.prose}>{blocks.length ? blocks.map((block) => {
    if (block.type === 'heading_2') return <h2 key={block.id}>{block.text}</h2>
    if (block.type === 'heading_3') return <h3 key={block.id}>{block.text}</h3>
    if (block.type === 'quote') return <blockquote key={block.id}>{block.text}</blockquote>
    if (block.type === 'divider') return <hr key={block.id} />
    if (block.type === 'bullet_list') return <ul key={block.id}>{block.text?.split('\n').filter(Boolean).map(item => <li key={item}>{item}</li>)}</ul>
    if (block.type === 'numbered_list') return <ol key={block.id}>{block.text?.split('\n').filter(Boolean).map(item => <li key={item}>{item}</li>)}</ol>
    if (block.type === 'image' && block.imageUrl) return <figure className={styles.articleImage} key={block.id}><Image src={block.imageUrl} alt={block.imageAlt || ''} width={1200} height={800} sizes="(max-width: 820px) 100vw, 760px" />{block.caption ? <figcaption>{block.caption}</figcaption> : null}</figure>
    if (block.type === 'tip') return <aside className={styles.articleTip} key={block.id}><p className={styles.eyebrow}>{block.tipRole === 'seller' ? 'SELLER TIP' : 'BUYER TIP'}</p><p>{block.text}</p></aside>
    if (block.type === 'listing_card') { const property = block.listingId ? propertiesById.get(block.listingId) : null; return property ? <Link className={styles.articleProperty} key={block.id} href={`/properties/${propertySlug(property)}`}>{property.media[0]?.url ? <Image src={property.media[0].url} alt="" width={260} height={180} /> : null}<span><p className={styles.eyebrow}>FEATURED PROPERTY</p><h3>{property.title}</h3><p>{property.suburb}{property.price ? ` · R ${property.price.toLocaleString('en-ZA')}` : ''}</p><b>View property ↗</b></span></Link> : null }
    return <p key={block.id}>{block.text}</p>
  }) : <p>{article.summary}</p>}<aside className={styles.articleCta}><p className={styles.eyebrow}>MAKE IT PERSONAL</p><h2>Let’s talk about your next move.</h2><p>Bring your questions to the team. We’re here to help.</p><Link className={styles.button} href="/contact">Start a conversation ↗</Link></aside></div></article>{related.length > 0 && <section className={styles.container}><h2>Keep exploring.</h2><div className={styles.related}>{related.map(item => <Link key={item.slug} href={`/blog/${item.slug}`}><p className={styles.eyebrow}>{item.authorName || site.name}</p><h3>{item.title} ↗</h3><p>{item.summary}</p></Link>)}</div></section>}</ResourceShell>
}
