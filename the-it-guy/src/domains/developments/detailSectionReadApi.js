import { requireClient } from '../../lib/api/shared/readHelpers.js'
import { getAttorneyMockDevelopmentDetail } from '../../core/transactions/attorneyMockData'
import { fetchDevelopmentDetail, fetchDevelopmentAlterations, fetchDevelopmentProductCatalogue, fetchDevelopmentStructureNodes } from './detailReadApi.js'
import { fetchDevelopmentDocuments, fetchDevelopmentFinancials } from './readApi.js'

// Only the requested section is read. Absence from the core payload means
// "not loaded", rather than an authoritative empty library or zero balance.
export async function fetchDevelopmentDetailSection(developmentId, section) {
  const mock = getAttorneyMockDevelopmentDetail(developmentId)
  switch (section) {
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
