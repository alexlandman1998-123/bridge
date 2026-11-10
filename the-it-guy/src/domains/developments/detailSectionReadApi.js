import { requireClient } from '../../lib/api/shared/readHelpers.js'
import { getAttorneyMockDevelopmentDetail } from '../../core/transactions/attorneyMockData'
import { fetchDevelopmentDetail, fetchDevelopmentAlterations, fetchDevelopmentProductCatalogue, fetchDevelopmentStructureNodes } from './detailReadApi.js'
import { fetchDevelopmentDocuments, fetchDevelopmentFinancials, fetchDevelopmentMarketingEvents } from './readApi.js'
import { normalizeMarketingBoolean } from './profileNormalization.js'

// Only the requested section is read. Absence from the core payload means
// "not loaded", rather than an authoritative empty library or zero balance.
export async function fetchDevelopmentDetailSection(developmentId, section, { organisationId } = {}) {
  const mock = getAttorneyMockDevelopmentDetail(developmentId)
  switch (section) {
    case 'channelStatistics': {
      if (!developmentId) throw new Error('Development is required.')
      if (mock) {
        const configuration = mock.profile?.marketingContent?.listingConfiguration || {}
        return { channelStatisticsListings: mock.listings || [], channelStatisticsWebsitePublished: normalizeMarketingBoolean(configuration.publicVisibility) && String(configuration.marketingStatus || '').trim() === 'live' }
      }
      const client = requireClient()
      const listings = []
      for (let offset = 0; ; offset += 1000) {
        const result = await client.from('private_listings')
          .select('id,organisation_id,listing_status,is_active,updated_at')
          .eq('development_id', developmentId).order('id').range(offset, offset + 999)
        if (result.error) throw result.error
        for (const row of result.data || []) {
          const status = String(row.listing_status || 'draft').toLowerCase()
          if (['archived', 'deleted'].includes(status) || (row.is_active === false && !['seller_lead', 'draft', 'listing_review'].includes(status))) continue
          listings.push({ id: row.id, organisationId: row.organisation_id, updatedAt: row.updated_at })
        }
        if ((result.data || []).length < 1000) break
      }
      const profile = await client.from('development_profiles')
        .select('configuration:marketing_content->listingConfiguration,legacy_configuration:marketing_content->listing_configuration')
        .eq('development_id', developmentId).maybeSingle()
      if (profile.error) throw profile.error
      const configuration = profile.data?.configuration || profile.data?.legacy_configuration || {}
      return { channelStatisticsListings: listings, channelStatisticsWebsitePublished: normalizeMarketingBoolean(configuration.publicVisibility) && String(configuration.marketingStatus || '').trim() === 'live' }
    }
    case 'marketingEvents': {
      return { marketingEvents: mock?.marketingEvents || await fetchDevelopmentMarketingEvents(developmentId, organisationId) }
    }
    case 'inventory': {
      const detail = mock || await fetchDevelopmentDetail(developmentId, { deferOptionalData: true })
      if (!detail) throw new Error('Development inventory could not be loaded.')
      return { rows: detail.rows, transactionRows: detail.transactionRows, listings: detail.listings, profile: detail.profile, inventoryLoaded: true }
    }
    case 'documents': {
      return { documents: mock ? mock.documents || [] : await fetchDevelopmentDocuments(developmentId) }
    }
    case 'financials': {
      if (mock) return { financials: mock.financials, alterations: mock.alterations || [] }
      const [financials, alterations] = await Promise.all([
        fetchDevelopmentFinancials(developmentId),
        fetchDevelopmentAlterations(requireClient(), developmentId),
      ])
      return { financials, alterations }
    }
    case 'catalogue': {
      if (mock) return { productCatalogue: mock.productCatalogue, structureNodes: mock.structureNodes || [] }
      const client = requireClient()
      const [productCatalogue, structureNodes] = await Promise.all([
        fetchDevelopmentProductCatalogue(client, developmentId),
        fetchDevelopmentStructureNodes(client, developmentId),
      ])
      return { productCatalogue, structureNodes }
    }
    default:
      throw new Error(`Unknown development detail section: ${section}`)
  }
}

export function developmentDetailSectionsForTab(tab) {
  switch (tab) {
    case 'performance': return ['inventory', 'financials']
    case 'availability': return ['inventory', 'catalogue', 'documents']
    case 'configuration':
    case 'marketing':
    case 'documents': return ['inventory', 'documents']
    case 'overview': return []
    default: return ['inventory']
  }
}
