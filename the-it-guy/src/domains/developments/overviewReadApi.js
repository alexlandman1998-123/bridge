import { requireClient, isMissingTableError, isPermissionDeniedError } from '../../lib/api/shared/readHelpers.js'
import { normalizeDevelopmentProfile } from './profileNormalization.js'
import { normalizeDevelopmentUnitRow } from './unitReadApi.js'
import { ensureDevelopmentSettings, fetchDevelopmentAttorneyConfig, fetchDevelopmentBondConfig } from './configurationApi.js'
import { getAttorneyMockDevelopmentDetail } from '../../core/transactions/attorneyMockData'
import { refreshDevelopmentMedia } from '../../lib/developmentMediaStorage.js'

export const DEVELOPMENT_OVERVIEW_PAGE_SIZE = 25

const developmentFields = 'id, organisation_id, name, planned_units, code, location, address, formatted_address, street_address, suburb, city, province, country, postal_code, latitude, longitude, google_place_id, description, status, developer_company, total_units_expected, launch_date, expected_completion_date, assigned_attorney_id, handover_enabled, snag_tracking_enabled, alterations_enabled, onboarding_enabled'
// Marketing media, floorplan lists and site-plan state belong to opened sections.
const profileFields = 'development_id, code, location, suburb, city, province, country, address, formatted_address, street_address, postal_code, latitude, longitude, google_place_id, description, status, developer_company, launch_date, expected_completion_date, seller_details'
const coverFields = 'overview_cover:marketing_content->mediaLibrary->>coverImageUrl,overview_hero:marketing_content->mediaLibrary->>heroImageUrl,overview_legacy_cover:marketing_content->media_library->>cover_image_url,overview_legacy_hero:marketing_content->media_library->>hero_image_url,overview_logo:marketing_content->mediaLibrary->>developmentLogoUrl,overview_light_logo:marketing_content->mediaLibrary->>developmentLogoLightUrl,overview_dark_logo:marketing_content->mediaLibrary->>developmentLogoDarkUrl,overview_gallery:marketing_content->mediaLibrary->galleryImageUrls->>0,overview_legacy_gallery:marketing_content->media_library->gallery_image_urls->>0,overview_first_image:image_links->0'

function normalizeOverviewRow(row) {
  return { ...row, unit: { ...row.unit, ...normalizeDevelopmentUnitRow(row.unit) }, stage: row.transaction?.stage || row.unit?.status || 'Available' }
}

export async function fetchDevelopmentOverviewPage(developmentId, { client = requireClient(), afterUnitId = null } = {}) {
  if (!developmentId) throw new Error('Development is required.')
  const { data, error } = await client.rpc('bridge_development_overview_summary', {
    p_development_id: developmentId, p_after_unit_id: afterUnitId,
  })
  if (error) {
    if (['PGRST202', '42883'].includes(error.code)) {
      throw new Error('The development overview needs the latest database update. Please retry after it is available.')
    }
    throw error
  }
  if (!data) return null
  if (data.contract !== 'development-overview-v1' || data.developmentId !== developmentId ||
      !data.summary || !Number.isInteger(data.summary.totalUnits) || data.summary.totalUnits < 0 ||
      !Array.isArray(data.rows) || data.rows.length > DEVELOPMENT_OVERVIEW_PAGE_SIZE ||
      !Array.isArray(data.attentionRows) || data.attentionRows.length > 3 ||
      !Array.isArray(data.recentRows) || data.recentRows.length > 4 ||
      [...data.rows, ...data.attentionRows, ...data.recentRows].some(row => !row.unit?.id || row.unit.development_id !== developmentId)) {
    throw new Error('The development overview could not be confirmed. Please refresh and retry.')
  }
  return {
    overviewSummary: data.summary,
    overviewAttentionRows: data.attentionRows.map(normalizeOverviewRow),
    overviewRecentRows: data.recentRows.map(normalizeOverviewRow),
    rows: data.rows.map(normalizeOverviewRow),
    unitPage: { pageSize: DEVELOPMENT_OVERVIEW_PAGE_SIZE, nextCursor: data.nextCursor || null, total: data.summary.totalUnits },
  }
}

export async function fetchDevelopmentOverview(developmentId) {
  const mock = getAttorneyMockDevelopmentDetail(developmentId)
  // Existing small demonstration workspaces have no hosted data source.
  if (mock) return mock
  const client = requireClient()
  // Authorize the scoped overview before starting any supporting reads.
  const page = await fetchDevelopmentOverviewPage(developmentId, { client })
  if (!page) return null
  const [development, profile, settings, attorneyConfig, bondConfig] = await Promise.all([
    client.from('developments').select(developmentFields).eq('id', developmentId).maybeSingle(),
    client.from('development_profiles').select(`${profileFields},${coverFields}`).eq('development_id', developmentId).maybeSingle(),
    ensureDevelopmentSettings(client, developmentId, { createIfMissing: false }),
    fetchDevelopmentAttorneyConfig(developmentId), fetchDevelopmentBondConfig(developmentId),
  ])
  if (development.error) throw development.error
  if (profile.error && !isMissingTableError(profile.error, 'development_profiles') && !isPermissionDeniedError(profile.error)) throw profile.error
  if (!development.data) return null
  const raw = profile.data || {}
  const firstImage = raw.overview_first_image
  const firstImageUrl = typeof firstImage === 'string' ? firstImage : firstImage?.url || firstImage?.src || firstImage?.imageUrl || firstImage?.image_url || ''
  const [viewingProfile] = await refreshDevelopmentMedia(client, [{
    ...raw,
    image_links: firstImageUrl ? [firstImageUrl] : [],
    marketing_content: { mediaLibrary: {
      coverImageUrl: raw.overview_cover || raw.overview_legacy_cover || '',
      heroImageUrl: raw.overview_hero || raw.overview_legacy_hero || '',
      developmentLogoUrl: raw.overview_logo || '', developmentLogoLightUrl: raw.overview_light_logo || '',
      developmentLogoDarkUrl: raw.overview_dark_logo || '',
      galleryImageUrls: raw.overview_gallery || raw.overview_legacy_gallery || '',
    } },
  }])
  const summary = page.overviewSummary
  return {
    ...page, development: development.data, profile: normalizeDevelopmentProfile(viewingProfile),
    settings, attorneyConfig, bondConfig,
    stats: { totalUnits: summary.totalUnits, available: summary.available,
      registered: summary.registered, inTransfer: summary.inTransfer, soldActive: summary.totalUnits - summary.available },
  }
}
