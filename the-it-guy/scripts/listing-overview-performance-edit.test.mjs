import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const listingDetailSource = fs.readFileSync(path.join(repoRoot, 'src/pages/AgentListingDetail.jsx'), 'utf8')
const portalSource = fs.readFileSync(path.join(repoRoot, 'src/pages/ClientPortal.jsx'), 'utf8')
const workspaceServiceSource = fs.readFileSync(path.join(repoRoot, 'src/services/clientPortalWorkspaceService.js'), 'utf8')

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

assertContains(listingDetailSource, 'const LISTING_PERFORMANCE_OVERRIDE_FIELDS', 'listing performance override schema')
assertContains(listingDetailSource, 'function openListingPerformanceEditor', 'listing performance editor opener')
assertContains(listingDetailSource, 'function handleSaveListingPerformance', 'listing performance save handler')
assertContains(listingDetailSource, 'updatePrivateListingOnboardingFormData(listingRecord.id, nextFormData', 'seller portal shared performance persistence')
assertContains(listingDetailSource, 'listingPerformanceOverrides: overrides', 'local listing performance override patch')
assertContains(listingDetailSource, 'Edit Listing Performance', 'listing performance edit modal')
assertContains(listingDetailSource, 'Edit Stats', 'listing performance edit button')
assertContains(listingDetailSource, `<section>
                <article className="flex h-full flex-col rounded-[24px]`, 'seller communication full width row')
assertNotContains(listingDetailSource, '<h2 className="text-base font-semibold text-[#142132]">Listing Follow-Ups</h2>', 'listing follow-ups overview block')
assertNotContains(listingDetailSource, '<h3 className="text-base font-semibold text-[#142132]">Recent Activity</h3>', 'recent activity overview block')

assertContains(workspaceServiceSource, 'function buildSellerPortalListingPerformance', 'seller portal performance payload builder')
assertContains(workspaceServiceSource, 'formData.listingPerformanceOverrides', 'seller portal override source')
assertContains(workspaceServiceSource, 'listingPerformance,', 'seller portal listing performance payload')

assertContains(portalSource, 'function SellerListingPerformance', 'seller portal listing performance component')
assertContains(portalSource, '<SellerListingPerformance performance={sellerListingPerformance} />', 'seller portal overview performance render')
assertContains(portalSource, 'normalizeSellerListingPerformancePayload', 'seller portal performance payload normalization')

console.log('Listing overview performance edit wiring verified.')
