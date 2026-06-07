import { getOrganisationDisplayLogo, getOrganisationInitials } from './organisationAvatarUtils'

const SIZE_CLASSES = {
  xs: 'h-6 w-6 min-w-6 rounded-[7px] text-[0.58rem]',
  sm: 'h-8 w-8 min-w-8 rounded-[9px] text-[0.66rem]',
  md: 'h-10 w-10 min-w-10 rounded-[11px] text-xs',
  lg: 'h-14 w-14 min-w-14 rounded-[14px] text-sm',
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

export default function OrganisationAvatar({
  organisation = {},
  size = 'md',
  showName = false,
  smallFormat,
  className = '',
  imageClassName = '',
  nameClassName = '',
}) {
  const resolvedSmallFormat = smallFormat ?? ['xs', 'sm', 'md'].includes(size)
  const logoUrl = getOrganisationDisplayLogo(organisation, { smallFormat: resolvedSmallFormat })
  const name = normalizeText(organisation.name || organisation.displayName || organisation.companyName || organisation.label || organisation.bankName || organisation.shortName || 'Organisation')
  const initials = getOrganisationInitials({ ...organisation, name })
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md
  const avatar = (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-[#dfe8f3] bg-[#f6f9fc] font-bold leading-none text-[#35546c] ring-1 ring-white/70 ${sizeClass} ${className}`}
      title={name}
      aria-label={`${name} logo`}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className={`h-full w-full object-contain p-1 ${imageClassName}`}
          loading="lazy"
        />
      ) : (
        <span>{initials}</span>
      )}
    </span>
  )

  if (!showName) return avatar

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {avatar}
      <span className={`truncate text-sm font-semibold text-[#10243a] ${nameClassName}`}>{name}</span>
    </span>
  )
}
