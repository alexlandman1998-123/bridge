import { Building2 } from 'lucide-react'
import { useState } from 'react'

export default function BranchCoverImage({ src, name = 'Branch', className = '', position = 'relative' }) {
  const [failedSource, setFailedSource] = useState('')
  const showImage = Boolean(src && failedSource !== src)

  return (
    <div className={`${position} overflow-hidden bg-[#123d36] ${className}`}>
      {showImage ? (
        <img src={src} alt={`${name} cover`} loading="lazy" className="h-full w-full object-cover" onError={() => setFailedSource(src)} />
      ) : (
        <div className="absolute inset-0 bg-[linear-gradient(125deg,#123d36_0%,#236858_60%,#7fa99b_100%)]" aria-hidden="true">
          <div className="absolute -right-8 -top-16 h-64 w-64 rounded-full border-[32px] border-white/10" />
          <div className="absolute -bottom-24 left-8 h-56 w-56 rotate-45 rounded-[32px] border border-white/15 bg-white/5" />
          <Building2 size={56} strokeWidth={1} className="absolute bottom-5 left-5 text-white/40" />
        </div>
      )}
    </div>
  )
}
