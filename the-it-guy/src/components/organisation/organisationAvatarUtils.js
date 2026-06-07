function normalizeText(value = '') {
  return String(value || '').trim()
}

export function getOrganisationInitials(organisation = {}) {
  const name = normalizeText(organisation.name || organisation.displayName || organisation.companyName || organisation.label || organisation.bankName || organisation.shortName || 'Organisation')
  const compact = name.replace(/[^A-Za-z0-9]/g, '')
  if (compact && compact.length <= 4 && compact === compact.toUpperCase()) return compact.slice(0, 3)
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'O'
}

export function getOrganisationDisplayLogo(organisation = {}, { smallFormat = true } = {}) {
  const iconUrl = normalizeText(
    organisation.logoIconUrl ||
      organisation.logo_icon_url ||
      organisation.iconLogoUrl ||
      organisation.icon_logo_url ||
      organisation.avatarUrl ||
      organisation.avatar_url ||
      organisation.branding?.logoIcon ||
      organisation.branding?.logoIconUrl ||
      organisation.settings?.logoIconUrl ||
      organisation.settings_json?.logoIconUrl,
  )
  const logoUrl = normalizeText(
    organisation.logoUrl ||
      organisation.logo_url ||
      organisation.primaryLogoUrl ||
      organisation.primary_logo_url ||
      organisation.branding?.logoUrl ||
      organisation.branding?.logoLight ||
      organisation.settings?.logoUrl ||
      organisation.settings_json?.logoUrl,
  )
  if (smallFormat && iconUrl) return iconUrl
  return logoUrl || iconUrl
}
