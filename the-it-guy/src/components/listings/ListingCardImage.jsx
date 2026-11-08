import { useState } from 'react'
import { ImagePlus } from 'lucide-react'

export default function ListingCardImage({ src = '', fallbackSrc = '', alt = '', priority = false }) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [usingFallback, setUsingFallback] = useState(false)
  const displayedSrc = usingFallback ? fallbackSrc : src
  return (
    <div className="relative h-full w-full bg-[#eaf0f6]">
      {!loaded && displayedSrc && !failed ? <div className="absolute inset-0 animate-pulse bg-[#e1eaf3]" aria-hidden="true" /> : null}
      {(!displayedSrc || failed) ? <ImagePlus size={24} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[#8da2b5]" aria-hidden="true" /> : null}
      {displayedSrc && !failed ? (
        <img
          src={displayedSrc}
          alt={alt}
          width="480"
          height="264"
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (!usingFallback && fallbackSrc && fallbackSrc !== src) {
              setUsingFallback(true)
            } else {
              setFailed(true)
            }
          }}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      ) : null}
    </div>
  )
}

