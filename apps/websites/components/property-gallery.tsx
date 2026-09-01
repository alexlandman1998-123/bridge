import Image from 'next/image'
import type { PublicProperty } from '@/lib/types'

function isSupabaseImage(url: string): boolean {
  try { return new URL(url).hostname.endsWith('.supabase.co') } catch { return false }
}

export function PropertyGallery({ property }: { property: PublicProperty }) {
  const images = property.media.filter((media) => media.type === 'image' && media.url)
  const primary = images[0]
  const secondary = images.slice(1, 3)
  return <div className="gallery">
    <div className="gallery-main">
      {primary && isSupabaseImage(primary.url)
        ? <Image src={primary.url} alt={primary.caption || property.title} fill priority sizes="(max-width: 780px) 100vw, 66vw" />
        : <><span>{property.propertyType}</span><strong>{primary ? primary.caption || 'Property image' : 'Gallery ready for listing media'}</strong></>}
    </div>
    <div className="gallery-side">
      {secondary.map((media) => <div className="gallery-thumbnail" key={media.url}>
        {isSupabaseImage(media.url)
          ? <Image src={media.url} alt={media.caption || property.title} fill sizes="(max-width: 780px) 50vw, 25vw" />
          : <span>{media.caption || media.type}</span>}
      </div>)}
    </div>
  </div>
}
