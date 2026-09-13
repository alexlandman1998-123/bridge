import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ResourceShell, resourceSite } from '@/components/resource-shell'
import { getPublicBlogPost, getPublicBlogPosts } from '@/lib/site-repository'
import styles from '@/components/resources.module.css'
export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }> }
function readingMinutes(body: string) {
  return Math.max(1, Math.ceil(body.split(/\s+/).filter(Boolean).length / 200))
}
async function load(params: Props['params']) {
  const [site, { slug }] = await Promise.all([resourceSite(), params])
  const article = await getPublicBlogPost(site, slug)
  if (!article) notFound()
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
  const related = (await getPublicBlogPosts(site)).filter(item => item.slug !== article.slug).slice(0, 2)
  const paragraphs = article.body.split(/\n{2,}/).map(item => item.trim()).filter(Boolean)
  return <ResourceShell site={site} href="/blog"><article><header className={`${styles.intro} ${styles.articleIntro}`}><Link href="/blog" className={styles.back}>← Back to the journal</Link><p className={styles.eyebrow}>{article.authorName || site.name} · {readingMinutes(article.body)} min read</p><h1>{article.title}</h1><p>{article.summary}</p><time dateTime={article.publishedAt}>{new Date(article.publishedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' })}</time></header>{article.coverImageUrl ? <div className={styles.articleHero}><Image src={article.coverImageUrl} alt={article.coverImageAlt || ''} fill priority sizes="(max-width: 1240px) 100vw, 1240px" /></div> : null}<div className={styles.prose}>{paragraphs.length ? paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>) : <p>{article.summary}</p>}<aside className={styles.articleCta}><p className={styles.eyebrow}>MAKE IT PERSONAL</p><h2>Let’s talk about your next move.</h2><p>Bring your questions to the team. We’re here to help.</p><Link className={styles.button} href="/contact">Start a conversation ↗</Link></aside></div></article>{related.length > 0 && <section className={styles.container}><h2>Keep exploring.</h2><div className={styles.related}>{related.map(item => <Link key={item.slug} href={`/blog/${item.slug}`}><p className={styles.eyebrow}>{item.authorName || site.name}</p><h3>{item.title} ↗</h3><p>{item.summary}</p></Link>)}</div></section>}</ResourceShell>
}
