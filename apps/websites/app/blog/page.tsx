import Image from 'next/image'
import Link from 'next/link'
import { ResourceShell, resourceSite } from '@/components/resource-shell'
import { publicArticles, readingMinutes } from '@/lib/articles'
import styles from '@/components/resources.module.css'
export const dynamic = 'force-dynamic'
export async function generateMetadata() {
  const site = await resourceSite()
  return { title: `Property journal | ${site.name}`, description: 'Ideas and practical guides for your next property move.', alternates: { canonical: '/blog' } }
}
export default async function BlogPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const site = await resourceSite()
  const query = await searchParams
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 120) : ''
  const category = typeof query.category === 'string' ? query.category : ''
  const all = publicArticles(site.id)
  const categories = [...new Set(all.map(article => article.category))]
  const articles = all.filter(article => (!category || article.category === category) && `${article.title} ${article.excerpt} ${article.category}`.toLowerCase().includes(q.toLowerCase()))
  return <ResourceShell site={site} href="/blog"><header className={styles.intro}><p className={styles.eyebrow}>THE PROPERTY JOURNAL</p><h1>A little perspective.<br />For your next chapter.</h1><p>Useful ideas, thoughtful advice, and a closer look at the places we call home.</p></header><section className={styles.container}>
    <form action="/blog" className={styles.search}><label>Search the journal<input type="search" name="q" defaultValue={q} placeholder="What would you like to explore?" maxLength={120} /></label><label>Topic<select name="category" defaultValue={category}><option value="">All topics</option>{categories.map(item => <option key={item}>{item}</option>)}</select></label><button type="submit">Find articles ↗</button></form>
    <p className={styles.note}>{articles.length} {articles.length === 1 ? 'article' : 'articles'}{q ? ` matching “${q}”` : ''}</p>
    <div className={styles.articleGrid}>{articles.map(article => <Link className={styles.articleCard} href={`/blog/${article.slug}`} key={article.slug}><div className={styles.cardImage}><Image src={article.image} alt={article.imageAlt} fill sizes="(max-width: 760px) 100vw, 33vw" /></div><p className={styles.eyebrow}>{article.category} <span>· {readingMinutes(article)} min read</span></p><h2>{article.title}</h2><p>{article.excerpt}</p><span className={styles.readMore}>Read the story <span aria-hidden="true">↗</span></span></Link>)}</div>
    {!articles.length && <div className={styles.empty}><h2>{all.length ? 'No stories found.' : 'Our next stories are taking shape.'}</h2><p>{all.length ? 'Try another phrase or browse all topics.' : 'Explore our calculators or speak with the team while we prepare new articles.'}</p><Link className={styles.button} href={all.length ? '/blog' : '/calculators'}>{all.length ? 'Clear filters' : 'Explore calculators'} ↗</Link></div>}
  </section></ResourceShell>
}
