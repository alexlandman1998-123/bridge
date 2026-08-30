import { useState } from 'react'

function getInitials(name = '') {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 'A'
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase()
}

export default function AgencyBrandMark({
  name = 'Agency',
  logoUrl = '',
  inverse = false,
  imageClassName = 'max-h-14 max-w-[190px]',
  compact = false,
}) {
  const [failedUrl, setFailedUrl] = useState('')
  const showLogo = Boolean(logoUrl && failedUrl !== logoUrl)

  if (showLogo) {
    return (
      <img
        src={logoUrl}
        alt={`${name || 'Agency'} logo`}
        className={`${imageClassName} object-contain object-left`}
        onError={() => setFailedUrl(logoUrl)}
      />
    )
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-3" aria-label={`${name || 'Agency'} brand`}>
      <span
        className={`${compact ? 'h-10 w-10 text-xs' : 'h-12 w-12 text-sm'} inline-flex shrink-0 items-center justify-center rounded-[14px] border font-bold tracking-[0.04em] shadow-sm`}
        style={{
          borderColor: inverse ? 'rgba(255,255,255,0.2)' : 'color-mix(in srgb, var(--portal-primary) 18%, white)',
          background: inverse ? 'rgba(255,255,255,0.12)' : 'color-mix(in srgb, var(--portal-primary) 10%, white)',
          color: inverse ? 'var(--portal-on-primary, #ffffff)' : 'var(--portal-primary, #152432)',
        }}
        aria-hidden="true"
      >
        {getInitials(name)}
      </span>
      <strong className={`${compact ? 'text-sm' : 'text-lg'} min-w-0 truncate font-semibold tracking-[-0.03em]`}>{name || 'Agency'}</strong>
    </span>
  )
}
