import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(repoRoot, 'src/pages/AgentListingDetail.jsx'), 'utf8')

function assertContains(needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label} is missing: ${needle}`)
  }
}

function assertNotContains(needle, label) {
  if (source.includes(needle)) {
    throw new Error(`${label} should not be present: ${needle}`)
  }
}

assertContains('const SELLER_PROFILE_SECTION_FIELDS', 'seller profile editable section schema')
assertContains('function openSellerSectionEditor', 'seller section editor opener')
assertContains('function handleSaveSellerSection', 'seller section save handler')
assertContains('updatePrivateListingOnboardingFormData(listingRecord.id, nextFormData', 'seller onboarding data persistence')
assertContains('function handleSellerDocumentUpload', 'seller document upload handler')
assertContains('uploadPrivateListingDocument(listingRecord.id, file', 'shared document upload persistence')
assertContains('window.history.replaceState(window.history.state', 'non-routing seller tab URL update')
assertContains('nextUrl.searchParams.set(\'tab\', tab)', 'seller tab URL search param update')
assertContains('aria-label={`Edit ${section.title}`}', 'seller card edit action')
assertContains('onChange={(event) => void handleSellerDocumentUpload(doc, event)}', 'document row upload input')
assertNotContains('<h3 className="text-base font-semibold text-[#142132]">Notification delivery</h3>', 'notification delivery container')
assertNotContains("navigate(`${location.pathname}?tab=${encodeURIComponent(tab)}`", 'seller tab router navigation refresh')
assertNotContains('window.scrollTo({ top: 0', 'seller tab forced viewport reset')

console.log('Listing workspace seller edit wiring verified.')
