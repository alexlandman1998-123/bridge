import { resolveOnboardingBranding } from '../../lib/onboardingBranding.js'

function brandStyle(primaryColour) {
  const primary = /^#[0-9a-f]{6}$/i.test(primaryColour) ? primaryColour
    : /^#[0-9a-f]{3}$/i.test(primaryColour) ? `#${primaryColour.slice(1).split('').map(channel => channel + channel).join('')}`
      : '#0b2c23'
  const channels = [1, 3, 5].map(index => parseInt(primary.slice(index, index + 2), 16) / 255)
    .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
  const luminance = .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2]
  const darkInk = luminance > .179
  return {
    '--mobile-home-card-primary': primary,
    '--mobile-home-card-ink': darkInk ? '#000000' : '#ffffff',
    '--mobile-home-card-divider': darkInk ? 'rgba(0, 0, 0, .16)' : 'rgba(255, 255, 255, .24)',
  }
}

export function getMobileBrandStyle(organisationContext = {}, workspace = {}) {
  const branding = resolveOnboardingBranding(
    organisationContext?.onboarding,
    organisationContext?.organisationSettings,
    organisationContext?.branding,
    organisationContext?.organisation,
    workspace.currentWorkspace,
    workspace.currentWorkspace?.raw,
    workspace.workspace,
  )
  return brandStyle(branding.primaryColour)
}
