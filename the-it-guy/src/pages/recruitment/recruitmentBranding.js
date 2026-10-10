import { resolveDocumentBrandPalette } from '../../lib/onboardingBranding.js'

function foreground(colour) {
  const [red, green, blue] = [1, 3, 5].map(index => parseInt(colour.slice(index, index + 2), 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
  return luminance > 0.179 ? '#000000' : '#ffffff'
}

export function getRecruitmentBrandStyle(organisationContext = {}, workspace = {}) {
  const palette = resolveDocumentBrandPalette(
    organisationContext?.onboarding,
    organisationContext?.organisationSettings,
    organisationContext?.branding,
    organisationContext?.organisation,
    workspace.currentWorkspace,
    workspace.currentWorkspace?.raw,
    workspace.workspace,
  )
  return {
    '--recruitment-primary': palette.primaryColour,
    '--recruitment-primary-contrast': foreground(palette.primaryColour),
    '--recruitment-primary-ink': palette.primaryInk,
    '--recruitment-primary-tint': palette.primaryTint,
    '--recruitment-accent': palette.accentColour,
    '--recruitment-accent-contrast': foreground(palette.accentColour),
    '--recruitment-accent-ink': palette.accentInk,
    '--recruitment-accent-tint': palette.accentTint,
  }
}
