const DEFAULT_PRIMARY = '#152432'

export function normalizeBuyerPortalColour(value = '', fallback = DEFAULT_PRIMARY) {
  const candidate = String(value || '').trim()
  if (/^#[0-9a-f]{6}$/i.test(candidate)) return candidate.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(candidate)) {
    return `#${candidate.slice(1).split('').map((character) => `${character}${character}`).join('')}`.toLowerCase()
  }
  return fallback
}
export function buyerPortalHexToRgba(value = DEFAULT_PRIMARY, alpha = 1) {
  const safeHex = normalizeBuyerPortalColour(value, DEFAULT_PRIMARY).slice(1)
  const numeric = Number.parseInt(safeHex, 16)
  const red = (numeric >> 16) & 255
  const green = (numeric >> 8) & 255
  const blue = numeric & 255
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export function createBuyerPortalTheme({
  primaryColour = DEFAULT_PRIMARY,
  secondaryColour = primaryColour,
  accentColour = primaryColour,
} = {}) {
  const primary = normalizeBuyerPortalColour(primaryColour, DEFAULT_PRIMARY)
  const secondary = normalizeBuyerPortalColour(secondaryColour, primary)
  const accent = normalizeBuyerPortalColour(accentColour, primary)

  return Object.freeze({
    primary,
    secondary,
    accent,
    sidebarStyle: Object.freeze({
      backgroundColor: primary,
      backgroundImage: `radial-gradient(circle at 18% -6%, ${buyerPortalHexToRgba(accent, 0.24)} 0%, transparent 34%), linear-gradient(180deg, ${primary} 0%, ${secondary} 100%)`,
    }),
    activeNavigationStyle: Object.freeze({
      borderColor: buyerPortalHexToRgba(accent, 0.52),
      backgroundColor: buyerPortalHexToRgba(accent, 0.18),
      boxShadow: `inset 3px 0 0 ${accent}, 0 12px 24px rgba(2,6,23,0.16)`,
    }),
    heroOverlayStyle: Object.freeze({
      background: `linear-gradient(135deg, ${buyerPortalHexToRgba(primary, 0.9)} 0%, ${buyerPortalHexToRgba(primary, 0.7)} 48%, ${buyerPortalHexToRgba(secondary, 0.88)} 100%)`,
    }),
  })
}
