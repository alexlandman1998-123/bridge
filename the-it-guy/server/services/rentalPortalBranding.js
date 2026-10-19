import { resolveOnboardingBranding } from '../../src/lib/onboardingBranding.js'

// Call only after portal access has resolved the property's organisation.
export async function loadRentalPortalBranding(db, organisationId) {
  if (!organisationId) throw new Error('The rental agency is unavailable.')
  const [organisation, settings, brand] = await Promise.all([
    db.from('organisations').select('id,name,display_name,logo_url').eq('id', organisationId).maybeSingle(),
    db.from('organisation_settings').select('settings_json').eq('organisation_id', organisationId).maybeSingle(),
    loadBrandingRow(db, organisationId),
  ])
  if (organisation.error) throw organisation.error
  if (settings.error) throw settings.error
  const config = settings.data?.settings_json || {}
  const onboarding = config.agencyOnboarding || {}
  const assets = onboarding.branding || {}
  const resolved = resolveOnboardingBranding(
    assets, brand, config.branding || {}, config,
    { organisationName: onboarding.agencyInformation?.tradingName || onboarding.agencyInformation?.agencyName },
    organisation.data || {},
  )
  const sign = async (kind) => {
    const bucket = assets[`${kind}Bucket`]
    const path = assets[`${kind}Path`]
    if (bucket && path) {
      const result = await db.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 7)
      if (!result.error && result.data?.signedUrl) return result.data.signedUrl
    }
    return resolved[`${kind}Url`]
  }
  const [logoLightUrl, logoDarkUrl, logoIconUrl] = await Promise.all(['logoLight', 'logoDark', 'logoIcon'].map(sign))
  // Return public identity only; never send organisation settings to the portal.
  return {
    organisationId, agencyName: resolved.organisationName,
    logoUrl: logoDarkUrl || logoLightUrl || logoIconUrl,
    logoLightUrl, logoDarkUrl, logoIconUrl,
    primaryColour: resolved.primaryColour,
    secondaryColour: resolved.secondaryColour,
    accentColour: resolved.accentColour,
  }
}

async function loadBrandingRow(db, organisationId) {
  let result = await db.from('organisation_branding')
    .select('organisation_display_name,logo_light_url,logo_dark_url,logo_icon_url,primary_brand_color,secondary_brand_color,accent_brand_color')
    .eq('organisation_id', organisationId).maybeSingle()
  if (['42703', 'PGRST204'].includes(result.error?.code)) {
    result = await db.from('organisation_branding')
      .select('logo_light_url,logo_dark_url,primary_color,secondary_color,metadata_json')
      .eq('organisation_id', organisationId).maybeSingle()
  }
  // Older installations can still resolve CI from agency onboarding settings.
  if (['42P01', 'PGRST205'].includes(result.error?.code)) return {}
  if (result.error) throw result.error
  return result.data || {}
}
