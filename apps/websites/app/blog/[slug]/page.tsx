import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ResourceShell, resourceSite } from '@/components/resource-shell'
import { publicArticles, readingMinutes } from '@/lib/articles'
import styles from '@/components/resources.module.css'
export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }> }
async function load(params: Props['params']) {
  const [site, { slug }] = await Promise.all([resourceSite(), params])
  const article = publicArticles(site.id).find(item => item.slug === slug)
  if (!article) notFound()
  return { site, article }
}
export async function generateMetadata({ params }: Props) {
  const { site, article } = await load(params)
  return { title: `${article.title} | ${site.name}`, description: article.excerpt, alternates: { canonical: `/blog/${article.slug}` }, openGraph: { type: 'article' as const, title: article.title, description: article.excerpt, publishedTime: article.publishedAt, images: [{ url: article.image, alt: article.imageAlt }] } }
}
export default async function ArticlePage({ params }: Props) {
  const { site, article } = await load(params)
  const related = publicArticles(site.id).filter(item => item.slug !== article.slug).slice(0, 2)
  return <ResourceShell site={site} href="/blog"><article><header className={`${styles.intro} ${styles.articleIntro}`}><Link href="/blog" className={styles.back}>← Back to the journal</Link><p className={styles.eyebrow}>{article.category} · {readingMinutes(article)} min read</p><h1>{article.title}</h1><p>{article.excerpt}</p><time dateTime={article.publishedAt}>{new Date(article.publishedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' })}</time></header><div className={styles.articleHero}><Image src={article.image} alt={article.imageAlt} fill priority sizes="(max-width: 1240px) 100vw, 1240px" /></div><div className={styles.prose}>{article.sections.map(section => <section key={section.heading}><h2>{section.heading}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}{section.points && <ul>{section.points.map(point => <li key={point}>{point}</li>)}</ul>}</section>)}<aside className={styles.articleCta}><p className={styles.eyebrow}>MAKE IT PERSONAL</p><h2>Let’s talk about your next move.</h2><p>Bring your questions to the team. We’re here to help.</p><Link className={styles.button} href="/contact">Start a conversation ↗</Link></aside></div></article>{related.length > 0 && <section className={styles.container}><h2>Keep exploring.</h2><div className={styles.related}>{related.map(item => <Link key={item.slug} href={`/blog/${item.slug}`}><p className={styles.eyebrow}>{item.category}</p><h3>{item.title} ↗</h3><p>{item.excerpt}</p></Link>)}</div></section>}</ResourceShell>
}
