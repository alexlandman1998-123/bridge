let settingsPromise = null

export async function listUserPreferredPartnerRoutingRules(...args) {
  settingsPromise ||= import('./settingsApi')
  const settings = await settingsPromise
  return settings.listUserPreferredPartnerRoutingRules(...args)
}
