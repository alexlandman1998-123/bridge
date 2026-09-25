import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const listingDetailSource = fs.readFileSync(path.join(repoRoot, 'src/pages/AgentListingDetail.jsx'), 'utf8')
const portalSource = fs.readFileSync(path.join(repoRoot, 'src/pages/ClientPortal.jsx'), 'utf8')
const workspaceServiceSource = fs.readFileSync(path.join(repoRoot, 'src/services/clientPortalWorkspaceService.js'), 'utf8')
const performanceServiceSource = fs.readFileSync(path.join(repoRoot, 'src/services/listings/listingOverviewPerformanceService.js'), 'utf8')

function assertContains(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label} is missing: ${needle}`)
  }
}

function assertNotContains(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`${label} should not be present: ${needle}`)
  }
}

assertContains(listingDetailSource, 'getListingOverviewAnalytics({', 'verified overview analytics load')
assertContains(listingDetailSource, 'buildListingOverviewPerformance({', 'canonical overview performance builder')
assertContains(listingDetailSource, "listingPerformance.viewsAvailable", 'honest unavailable views state')
assertContains(listingDetailSource, "'PP views unavailable'", 'Private Property analytics limitation')
assertNotContains(listingDetailSource, 'function openListingPerformanceEditor', 'listing performance editor opener')
assertNotContains(listingDetailSource, 'Edit Listing Performance', 'listing performance edit modal')
assertNotContains(listingDetailSource, 'Edit Stats', 'listing performance edit button')
assertNotContains(listingDetailSource, 'Manual seller-facing stats are active.', 'manual performance override notice')
assertNotContains(listingDetailSource, 'border-t-[4px]', 'performance card top accent rails')
assertContains(listingDetailSource, 'bg-[#f7fbff] text-[#42617f]', 'neutral performance card icon treatment')
assertContains(listingDetailSource, "label: 'Days on market'", 'performance days-on-market card')
assertNotContains(listingDetailSource, 'Buyer Interest Funnel', 'duplicate buyer interest funnel')
assertNotContains(listingDetailSource, '<h2 className="text-base font-semibold text-[#142132]">Listing Follow-Ups</h2>', 'listing follow-ups overview block')
assertNotContains(listingDetailSource, '<h3 className="text-base font-semibold text-[#142132]">Recent Activity</h3>', 'recent activity overview block')

assertContains(workspaceServiceSource, 'function buildSellerPortalListingPerformance', 'seller portal performance payload builder')
assertContains(workspaceServiceSource, 'listingPerformance,', 'seller portal listing performance payload')
assertContains(workspaceServiceSource, 'leadRows = []', 'seller portal performance should accept agent listing lead rows')
assertContains(workspaceServiceSource, 'const sellerLeadRows = collectSellerPortalLeadRows(context, listing, listing?.marketing)', 'seller portal should collect synced lead rows from the token payload')

assertContains(performanceServiceSource, "supabase.rpc('listing_overview_performance'", 'scoped listing analytics RPC')
assertContains(performanceServiceSource, 'const totalViews = availableViewChannels.length', 'verified view aggregation')
assertContains(performanceServiceSource, ': null\n  const comparableChannels', 'unavailable analytics must not become a fabricated zero')

assertContains(portalSource, 'function SellerListingPerformance', 'seller portal listing performance component')
assertContains(portalSource, '<SellerListingPerformance performance={sellerListingPerformance} />', 'seller portal overview performance render')
assertContains(portalSource, 'normalizeSellerListingPerformancePayload', 'seller portal performance payload normalization')

console.log('Listing overview canonical performance wiring verified.')
