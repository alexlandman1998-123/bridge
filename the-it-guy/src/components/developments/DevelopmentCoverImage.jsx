import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { resolveDevelopmentCoverImage } from '../../lib/developmentMediaStorage.js'

export default function DevelopmentCoverImage({ src, developmentId }) {
  return <Cover key={`${developmentId}:${src}`} src={src} developmentId={developmentId} />
}

function Cover({ src, developmentId }) {
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    const width = Math.min(1600, window.innerWidth * Math.min(2, window.devicePixelRatio || 1))
    void resolveDevelopmentCoverImage(supabase, src, developmentId, width).then(value => {
      if (active) setUrl(value)
    })
    return () => { active = false }
  }, [src, developmentId])
  if (!url || failed) return null
  return <img
    src={url}
    alt=""
    className="absolute inset-0 h-full w-full object-cover"
    loading="eager"
    decoding="async"
    onError={() => {
      if (url !== src) setUrl(src)
      else setFailed(true)
    }}
  />
}
