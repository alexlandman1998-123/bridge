import { ImageResponse } from 'next/og'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getPublicBlogPost, resolveSite } from '@/lib/site-repository'

export const alt = 'Property journal article'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const [host, { slug }] = await Promise.all([(await headers()).get('host'), params])
  const site = await resolveSite(host)
  if (!site) notFound()
  const post = await getPublicBlogPost(site, slug)
  if (!post) notFound()
  return new ImageResponse(
    <div style={{ background: site.primaryColor, color: '#ffffff', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between', padding: '70px', width: '100%' }}>
      <div style={{ display: 'flex', fontSize: 28, letterSpacing: 4, opacity: 0.8 }}>{site.name.toUpperCase()} · PROPERTY JOURNAL</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 980 }}>
        <div style={{ display: 'flex', fontSize: 68, fontWeight: 700, letterSpacing: -3, lineHeight: 1.06 }}>{post.title}</div>
        {post.summary ? <div style={{ display: 'flex', fontSize: 30, lineHeight: 1.35, opacity: 0.84 }}>{post.summary.slice(0, 180)}</div> : null}
      </div>
      <div style={{ display: 'flex', fontSize: 24, opacity: 0.8 }}>{post.authorName || site.name}</div>
    </div>,
    size,
  )
}
