import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const developmentDetail = await readFile(new URL('../src/pages/DevelopmentDetail.jsx', import.meta.url), 'utf8')

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

console.log('Developer financial reconciliation export Phase 7 contract passed.')
