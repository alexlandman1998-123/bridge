import type { PublicBlogPost } from '@/lib/types'

type BlogRow = Record<string, unknown>

function text(value: unknown): string {
  return String(value || '').trim()
}

function secureUrl(value: unknown): string | undefined {
  const url = text(value)
  return /^https:\/\/[^\s]+$/i.test(url) ? url : undefined
}
function contentBlocks(value: unknown): PublicBlogPost['contentBlocks'] {
  const allowed = new Set(['paragraph', 'heading_2', 'heading_3', 'bullet_list', 'numbered_list', 'quote', 'divider', 'image', 'tip', 'listing_card'])
  return Array.isArray(value) ? value.flatMap((block, index) => {
    if (!block || typeof block !== 'object' || !allowed.has(String(block.type))) return []
    const row = block as Record<string, unknown>
    const type = String(row.type) as PublicBlogPost['contentBlocks'][number]['type']
    const assetId = text(row.assetId || row.asset_id)
    const listingId = text(row.listingId || row.listing_id)
    if (type === 'image' && !assetId) return []
    if (type === 'listing_card' && !listingId) return []
    return [{ id: text(row.id) || `block-${index}`, type, text: text(row.text) || undefined, assetId: assetId || undefined, caption: text(row.caption) || undefined, tipRole: text(row.tipRole || row.tip_role) === 'seller' ? 'seller' : 'buyer', listingId: listingId || undefined }]
  }) : []
}

export function mapPublishedBlogPost(row: BlogRow): PublicBlogPost | null {
  const publishedAt = text(row.published_at)
  const timestamp = Date.parse(publishedAt)
  const title = text(row.title)
  const slug = text(row.slug)
  if (!title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !Number.isFinite(timestamp)) return null
  const coverImageUrl = secureUrl(row.cover_image_url)
  return {
    id: text(row.id),
    title,
    slug,
    summary: text(row.summary),
    body: text(row.body),
    contentBlocks: contentBlocks(row.content_blocks),
    authorName: text(row.author_name) || undefined,
    coverImageUrl,
    coverImageAlt: coverImageUrl ? text(row.cover_image_alt) || undefined : undefined,
    publishedAt,
    seoTitle: text(row.seo_title) || undefined,
    seoDescription: text(row.seo_description) || undefined,
  }
}

/** A defensive second check for server-side data before it reaches a public route. */
export function visiblePublishedBlogPosts(rows: BlogRow[], siteId: string, organisationId: string, revisionId: string, now = new Date()): PublicBlogPost[] {
  return rows
    .filter((row) => text(row.website_site_id) === siteId && text(row.organisation_id) === organisationId && text(row.revision_id) === revisionId && text(row.status) === 'published' && text(row.lifecycle_status) !== 'archived' && (text(row.lifecycle_status) !== 'scheduled' || Date.parse(text(row.scheduled_for)) <= now.getTime()) && Date.parse(text(row.published_at)) <= now.getTime())
    .flatMap((row) => {
      const post = mapPublishedBlogPost(row)
      return post ? [post] : []
    })
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt) || left.title.localeCompare(right.title))
}
