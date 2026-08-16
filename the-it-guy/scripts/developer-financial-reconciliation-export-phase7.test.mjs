import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const developmentDetail = await readFile(new URL('../src/pages/DevelopmentDetail.jsx', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const phase7Doc = await readFile(new URL('../docs/developer-module-phase7-financial-reconciliation.md', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:developer-module-phase7'],
  'node scripts/developer-financial-reconciliation-export-phase7.test.mjs',
)
assert.match(
  packageJson.scripts?.['verify:developer-module'] || '',
  /test:developer-module-phase7/,
  'developer module verification should include the Phase 7 reconciliation export contract',
)

assert(
  developmentDetail.includes('function buildCsvDownloadName') &&
    developmentDetail.includes('function escapeCsvCell') &&
    developmentDetail.includes('function buildCsvContent'),
  'DevelopmentDetail should define CSV helpers for generated reconciliation exports',
)

assert(
  developmentDetail.includes('function handleDownloadDeveloperFinancialReconciliation') &&
    developmentDetail.includes('new Blob([buildCsvContent(csvRows)]') &&
    developmentDetail.includes('financial-reconciliation') &&
    developmentDetail.includes('Developer financial reconciliation exported.'),
  'DevelopmentDetail should generate and download the developer financial reconciliation CSV',
)

assert(
  developmentDetail.includes("'Reservation Deposit'") &&
    developmentDetail.includes("'Alteration'") &&
    developmentDetail.includes("'Amount Inc VAT'") &&
    developmentDetail.includes("'Practical Action'"),
  'reconciliation export should include reservation and alteration detail rows with practical action columns',
)

assert(
  developmentDetail.includes('Deduct credited deposits from buyer purchase price balances') &&
    developmentDetail.includes('Confirm included alterations in sale documents') &&
    developmentDetail.includes('Track invoices outside the purchase price balance') &&
    developmentDetail.includes('Include ${currency.format(amount || 0)} in purchase price'),
  'reconciliation export should preserve the practical accounting treatment for deposits and alterations',
)

assert(
  developmentDetail.includes('Download reconciliation') &&
    developmentDetail.includes('handleDownloadDeveloperFinancialReconciliation') &&
    developmentDetail.includes('<Download size={15} />'),
  'commercial dashboard should expose a download action for the reconciliation export',
)

assert(
  phase7Doc.includes('Developer Module Phase 7 Financial Reconciliation Export') &&
    phase7Doc.includes('reservation deposits and alteration charges') &&
    phase7Doc.includes('Download reconciliation') &&
    phase7Doc.includes('npm run test:developer-module-phase7') &&
    !/client_portal_token|seller_portal_token|signing_token|access_token|service_role/i.test(phase7Doc),
  'Phase 7 runbook should document the reconciliation export without credential material',
)

console.log('Developer financial reconciliation export Phase 7 contract passed.')
