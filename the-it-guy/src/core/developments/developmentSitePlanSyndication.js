function text(value) {
  return String(value || '').trim()
}

function validCoordinates(sitePlanMap = {}) {
  return Object.fromEntries(
    Object.entries(sitePlanMap || {}).filter(([, position]) =>
      Number.isFinite(Number(position?.x)) && Number.isFinite(Number(position?.y)),
    ),
  )
}

/**
 * Build the site-plan portion of a development syndication payload.
 *
 * Portal integrations are asset-only by default. This protects the canonical
 * Arch9 marker map from being sent to destinations that cannot render it.
 */
export function buildDevelopmentSitePlanSyndicationPayload({ mediaLibrary = {}, destination = {} } = {}) {
  const assetUrl = text(mediaLibrary.sitePlanUrl) || text(mediaLibrary.masterplanUrl)
  const supportsInteractiveSitePlan = destination.supportsInteractiveSitePlan === true
  const mappedUnits = validCoordinates(mediaLibrary.sitePlanMap)
  const payload = {
    version: 1,
    mode: supportsInteractiveSitePlan ? 'interactive_map' : 'asset_only',
    sitePlanAsset: assetUrl
      ? {
          type: 'site_plan',
          url: assetUrl,
        }
      : null,
  }

  if (supportsInteractiveSitePlan && Object.keys(mappedUnits).length) {
    payload.interactiveMap = {
      coordinateUnit: 'percent',
      units: mappedUnits,
    }
  }

  return payload
}
