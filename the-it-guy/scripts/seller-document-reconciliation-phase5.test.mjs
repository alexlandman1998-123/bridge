import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const diagnosticsPage = readFileSync(new URL('../src/pages/PlatformDiagnosticsPage.jsx', import.meta.url), 'utf8')
const sourceOfTruthContract = readFileSync(new URL('../docs/seller-lead-listing-source-of-truth.md', import.meta.url), 'utf8')
const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')

assert.match(diagnosticsPage, /runSellerDocumentRequirementReconciliation/)
assert.match(diagnosticsPage, /function SellerDocumentReconciliationResult/)
assert.match(diagnosticsPage, /const \[sellerDocumentReconciliation, setSellerDocumentReconciliation\] = useState\(null\)/)
assert.match(diagnosticsPage, /const sellerDocumentReconciliationPlannedIds = useMemo/)
assert.match(diagnosticsPage, /runSellerDocumentReconciliationDryRun/)
assert.match(diagnosticsPage, /applySellerDocumentReconciliation/)
assert.match(diagnosticsPage, /dryRun:\s*true/)
assert.match(diagnosticsPage, /dryRun:\s*false/)
assert.match(diagnosticsPage, /listingIds:\s*sellerDocumentReconciliationPlannedIds/)
assert.match(diagnosticsPage, /window\.confirm\(`Apply seller document requirement sync/)
assert.match(diagnosticsPage, /Seller document reconciliation/)
assert.match(diagnosticsPage, /Dry-run document reconciliation/)
assert.match(diagnosticsPage, /Apply requirement sync/)
assert.match(diagnosticsPage, /Missing:\s*\{\(row\.missingRequirementKeys/)
assert.match(diagnosticsPage, /Stale:\s*\{\(row\.staleRequirementKeys/)

assert.match(sourceOfTruthContract, /Phase 5 surfaces the same reconciliation in Platform Diagnostics/)
assert.match(sourceOfTruthContract, /applies only the listing ids from that reviewed\s+dry-run plan/)
assert.match(sourceOfTruthContract, /syncPrivateListingRequirements\(\)/)

assert.match(
  packageSource,
  /"test:seller-document-reconciliation-phase5": "node scripts\/seller-document-reconciliation-phase5\.test\.mjs"/,
)

console.log('seller document reconciliation phase 5 tests passed')
