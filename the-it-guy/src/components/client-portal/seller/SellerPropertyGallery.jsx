import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Home } from 'lucide-react'

export default function SellerPropertyGallery({ images = [], propertyTitle = 'Property listing', showThumbnails = false }) {
  const track = useRef(null)
  const [index, setIndex] = useState(0)
  const [failedImages, setFailedImages] = useState([])
  const photos = images.filter((url) => !failedImages.includes(url))
  const current = Math.min(index, Math.max(0, photos.length - 1))
  const selectPhoto = (next) => {
    setIndex(next)
    track.current?.scrollTo({ left: next * track.current.clientWidth, behavior: 'smooth' })
  }
  const move = (direction) => selectPhoto((current + direction + photos.length) % photos.length)

  if (!photos.length) return (
    <div className={`absolute inset-0 grid place-items-center ${showThumbnails ? 'bg-[#eef3f1]' : 'bg-[linear-gradient(135deg,#0b2e2a_0%,#173f55_58%,#f3f8f5_58%,#f3f8f5_100%)]'}`}>
      <div className={showThumbnails ? 'max-w-sm px-6 py-5 text-center' : 'rounded-[16px] border border-white/20 bg-white/85 px-4 py-3 text-center shadow-[0_12px_28px_rgba(15,23,42,0.16)]'}>
        <Home size={26} className="mx-auto text-[#063f37]" />
        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#41566c]">Property image pending</p>
        {showThumbnails ? <p className="mt-2 text-sm leading-6 text-[#64748b]">Listing photos will appear here once your agent adds them.</p> : null}
      </div>
    </div>
  )

  return (
    <div role="region" aria-label="Listing photos" className="absolute inset-0 flex flex-col">
      <div className="relative min-h-0 flex-1 overflow-hidden">
      <div
        ref={track}
        tabIndex={photos.length > 1 ? 0 : undefined}
        aria-label="Scroll through listing photos"
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white"
        onScroll={(event) => setIndex(Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth))}
        onKeyDown={(event) => {
          if (photos.length > 1 && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
            event.preventDefault()
            move(event.key === 'ArrowRight' ? 1 : -1)
          }
        }}
      >
        {photos.map((url, photoIndex) => (
          <img key={url} src={url} alt={`${propertyTitle || 'Property listing'} — photo ${photoIndex + 1} of ${photos.length}`} loading={photoIndex === 0 ? 'eager' : 'lazy'} className="h-full w-full shrink-0 snap-center object-cover" onError={() => setFailedImages((failed) => [...new Set([...failed, url])])} />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#071f22]/65 to-transparent" />
      {photos.length > 1 ? (
        <div className="absolute inset-x-4 bottom-4 flex items-center justify-between">
          <button type="button" aria-label="Previous listing photo" onClick={() => move(-1)} className="grid h-11 w-11 place-items-center rounded-full bg-white/95 text-[#123f3a] shadow hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><ChevronLeft size={21} /></button>
          <span aria-live="polite" aria-atomic="true" className="rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white">{current + 1} / {photos.length}</span>
          <button type="button" aria-label="Next listing photo" onClick={() => move(1)} className="grid h-11 w-11 place-items-center rounded-full bg-white/95 text-[#123f3a] shadow hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><ChevronRight size={21} /></button>
        </div>
      ) : null}
      </div>
      {showThumbnails ? (
        <div aria-label="Choose listing photo" className="flex shrink-0 gap-2 overflow-x-auto bg-white p-3">
          {photos.map((url, photoIndex) => (
            <button key={url} type="button" aria-label={`Show listing photo ${photoIndex + 1}`} aria-pressed={current === photoIndex} onClick={() => selectPhoto(photoIndex)} className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123f3a] ${current === photoIndex ? 'border-[#123f3a]' : 'border-transparent opacity-65 hover:opacity-100'}`}>
              <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
