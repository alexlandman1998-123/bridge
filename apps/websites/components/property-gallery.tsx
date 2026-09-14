'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import type { PublicProperty } from '@/lib/types'

function isWebsiteImage(url: string): boolean {
  if (url.startsWith('/')) return true
  try { return new URL(url).hostname.endsWith('.supabase.co') } catch { return false }
}

export function PropertyGallery({ property }: { property: PublicProperty }) {
  const images = property.media.filter((media) => media.type === 'image' && media.url)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const count = images.length
  useEffect(() => { const close = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false); document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close) }, [])
  const show = (index = 0) => { setActive(index); setOpen(true) }
  const image = (media: PublicProperty['media'][number], sizes: string, priority = false) => isWebsiteImage(media.url)
    ? <Image src={media.url} alt={media.caption || property.title} fill priority={priority} sizes={sizes} />
    : <span>{media.caption || property.propertyType}</span>

  return <>
    <div className="listing-gallery">
      <button className="listing-gallery-main" type="button" onClick={() => show(0)} aria-label="Open property photo gallery">{images[0] ? image(images[0], '(max-width: 760px) 100vw, 66vw', true) : <span>Gallery ready for listing media</span>}</button>
      {count > 1 ? <div className="listing-gallery-side">{images.slice(1, 3).map((media, index) => <button key={`${media.url}-${index}`} className="listing-gallery-thumbnail" type="button" onClick={() => show(index + 1)} aria-label={`Open photo ${index + 2}`}>{image(media, '(max-width: 760px) 50vw, 34vw')}</button>)}</div> : null}
      {count ? <button type="button" className="listing-gallery-count" onClick={() => show(0)}>View all {count} photo{count === 1 ? '' : 's'} <span aria-hidden="true">→</span></button> : null}
    </div>
    {open && count ? <div className="listing-lightbox" role="dialog" aria-modal="true" aria-label="Property photo gallery" onClick={() => setOpen(false)}>
      <button className="listing-lightbox-close" type="button" onClick={() => setOpen(false)}>Close <span aria-hidden="true">×</span></button>
      <button className="listing-lightbox-previous" type="button" aria-label="Previous photo" onClick={(event) => { event.stopPropagation(); setActive((active + count - 1) % count) }}>←</button>
      <div className="listing-lightbox-image" onClick={(event) => event.stopPropagation()}>{image(images[active], '92vw')}</div>
      <button className="listing-lightbox-next" type="button" aria-label="Next photo" onClick={(event) => { event.stopPropagation(); setActive((active + 1) % count) }}>→</button><p>{active + 1} / {count}</p>
    </div> : null}
  </>
}
