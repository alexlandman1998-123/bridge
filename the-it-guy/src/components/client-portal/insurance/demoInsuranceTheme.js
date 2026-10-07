import { createBuyerPortalTheme } from '../buyerPortalTheme'

function foregroundFor(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map(value => {
    const channel = Number.parseInt(value, 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  return luminance > 0.179 ? '#000000' : '#ffffff'
}

export function demoInsuranceBrandStyle(themeInput) {
  const theme = createBuyerPortalTheme(themeInput?.primary ? {
    primaryColour: themeInput.primary, secondaryColour: themeInput.secondary, accentColour: themeInput.accent,
  } : themeInput)
  return {
    '--insurance-primary': theme.primary,
    '--insurance-on-primary': foregroundFor(theme.primary),
    '--insurance-secondary': theme.secondary,
    '--insurance-on-secondary': foregroundFor(theme.secondary),
    '--insurance-accent': theme.accent,
  }
}
