const DEFAULT_PRIMARY = '#152432'
const PORTAL_SEMANTIC_COLOURS = Object.freeze({
  success: '#087443',
  warning: '#b54708',
  error: '#b42318',
  information: '#175cd3',
  focus: '#2563eb',
})

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

function hexToRgb(value = DEFAULT_PRIMARY) {
  const safeHex = normalizeBuyerPortalColour(value, DEFAULT_PRIMARY).slice(1)
  const numeric = Number.parseInt(safeHex, 16)
  return {
    red: (numeric >> 16) & 255,
    green: (numeric >> 8) & 255,
    blue: numeric & 255,
  }
}

function relativeLuminance(value = DEFAULT_PRIMARY) {
  const { red, green, blue } = hexToRgb(value)
  const channel = (component) => {
    const normalized = component / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }
  return (0.2126 * channel(red)) + (0.7152 * channel(green)) + (0.0722 * channel(blue))
}

export function getPortalAccessibleForeground(background = DEFAULT_PRIMARY) {
  return relativeLuminance(background) > 0.42 ? '#101828' : '#ffffff'
}

export function createBuyerPortalTheme({
  primaryColour = DEFAULT_PRIMARY,
  secondaryColour = primaryColour,
  accentColour = primaryColour,
} = {}) {
  const primary = normalizeBuyerPortalColour(primaryColour, DEFAULT_PRIMARY)
  const secondary = normalizeBuyerPortalColour(secondaryColour, primary)
  const accent = normalizeBuyerPortalColour(accentColour, primary)
  const onPrimary = getPortalAccessibleForeground(primary)
  const onSecondary = getPortalAccessibleForeground(secondary)
  const onAccent = getPortalAccessibleForeground(accent)
  const semantic = PORTAL_SEMANTIC_COLOURS

  return Object.freeze({
    primary,
    secondary,
    accent,
    onPrimary,
    onSecondary,
    onAccent,
    semantic,
    cssVariables: Object.freeze({
      '--portal-primary': primary,
      '--portal-secondary': secondary,
      '--portal-accent': accent,
      '--portal-on-primary': onPrimary,
      '--portal-on-secondary': onSecondary,
      '--portal-on-accent': onAccent,
      '--portal-success': semantic.success,
      '--portal-warning': semantic.warning,
      '--portal-error': semantic.error,
      '--portal-information': semantic.information,
      '--portal-focus': semantic.focus,
      '--portal-canvas': '#f5f7fb',
      '--portal-surface': '#ffffff',
      '--portal-surface-muted': '#f8fafc',
      '--portal-border': '#dbe5ef',
      '--portal-text': '#142132',
      '--portal-text-muted': '#52657b',
      '--portal-radius-card': '20px',
      '--portal-shadow-card': '0 16px 40px rgba(15, 23, 42, 0.07)',
    }),
    sidebarStyle: Object.freeze({
      backgroundColor: primary,
      backgroundImage: `radial-gradient(circle at 18% -6%, ${buyerPortalHexToRgba(accent, 0.24)} 0%, transparent 34%), linear-gradient(180deg, ${primary} 0%, ${secondary} 100%)`,
      color: onPrimary,
    }),
    activeNavigationStyle: Object.freeze({
      borderColor: buyerPortalHexToRgba(accent, 0.52),
      backgroundColor: buyerPortalHexToRgba(accent, 0.18),
      boxShadow: `inset 3px 0 0 ${accent}, 0 12px 24px rgba(2,6,23,0.16)`,
    }),
    heroOverlayStyle: Object.freeze({
      background: `linear-gradient(135deg, ${buyerPortalHexToRgba(primary, 0.9)} 0%, ${buyerPortalHexToRgba(primary, 0.7)} 48%, ${buyerPortalHexToRgba(secondary, 0.88)} 100%)`,
    }),
    primaryActionStyle: Object.freeze({
      backgroundColor: primary,
      color: onPrimary,
      boxShadow: `0 12px 28px ${buyerPortalHexToRgba(primary, 0.22)}`,
    }),
    accentActionStyle: Object.freeze({
      backgroundColor: accent,
      color: onAccent,
      boxShadow: `0 12px 28px ${buyerPortalHexToRgba(accent, 0.22)}`,
    }),
  })
}

export const createAgencyPortalTheme = createBuyerPortalTheme
