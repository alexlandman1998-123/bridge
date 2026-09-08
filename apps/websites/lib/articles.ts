import catalogue from '../content/articles.json' with { type: 'json' }
export type Article = {
  slug: string; title: string; excerpt: string; category: string; publishedAt: string;
  status: string; audience: string; siteIds?: string[]; image: string; imageAlt: string;
  sections: { heading: string; paragraphs: string[]; points?: string[] }[];
}
/** Only explicit shared guides or articles assigned to this resolved site may be public. */
export function publicArticles(siteId: string, now = new Date()): Article[] {
  return visibleArticles(catalogue as Article[], siteId, now)
}

export function visibleArticles(articles: Article[], siteId: string, now: Date): Article[] {
  return articles.filter(article => article.status === 'published' &&
    (article.audience === 'shared' || (article.audience === 'site' && article.siteIds?.includes(siteId))) &&
    Number.isFinite(Date.parse(article.publishedAt)) && Date.parse(article.publishedAt) <= now.getTime())
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.title.localeCompare(b.title))
}
export function readingMinutes(article: Article) {
  const text = article.sections.flatMap(section => [section.heading, ...section.paragraphs, ...(section.points || [])]).join(' ')
  return Math.max(1, Math.ceil(text.split(/\s+/).length / 200))
}
