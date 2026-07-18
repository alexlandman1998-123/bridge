import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  buildMatterFinancialSubmissionPackCsv,
  buildMatterFinancialSubmissionPackFileName,
  summarizeMatterFinancialSubmissionPack,
} from '../src/core/attorneyAccounting/matterAccountSubmissionPack.js'

const repoRoot = process.cwd()
const submissionPackPath = path.join(repoRoot, 'src/core/attorneyAccounting/matterAccountSubmissionPack.js')
const apiPath = path.join(repoRoot, 'src/lib/api.js')
const attorneyPanelPath = path.join(repoRoot, 'src/components/AttorneyMatterAccountsPanel.jsx')

const submissionPackSource = fs.readFileSync(submissionPackPath, 'utf8')
const apiSource = fs.readFileSync(apiPath, 'utf8')
const attorneyPanelSource = fs.readFileSync(attorneyPanelPath, 'utf8')

const sampleAccounts = [
  {
    id: 'buyer-account',
    transactionId: 'transaction-1',
    partyRole: 'buyer',
    partyLabel: 'Buyer Example',
    partyEmail: 'buyer@example.test',
    currencyCode: 'ZAR',
    portalEnabled: true,
    balance: {
      balanceDue: 12000,
    },
    readiness: {
      label: 'Needs attention',
    },
    requests: [
      {
        id: 'request-1',
        requestType: 'proof_of_payment',
        requestStatus: 'requested',
        title: 'Upload transfer cost POP',
        externalReference: 'TC-001',
        amountDue: 12000,
        dueOn: '2026-07-15',
      },
      {
        id: 'request-2',
        requestType: 'statement',
        requestStatus: 'submitted',
        title: 'Upload bond statement',
        linkedDocumentId: 'document-2',
        dueOn: '2026-07-18',
      },
    ],
    documents: [
      {
        id: 'document-1',
        documentType: 'proof_of_payment',
        documentStatus: 'published',
        audienceRole: 'buyer',
        title: 'Transfer cost POP',
        externalReference: 'POP-001',
        amountTotal: 12000,
        amountDue: 0,
        issuedOn: '2026-07-16',
        fileName: 'pop.pdf',
        metadata: {
          requiresAttorneyReview: true,
          reviewStatus: 'awaiting_review',
        },
      },
      {
        id: 'document-2',
        documentType: 'statement',
        documentStatus: 'draft',
        audienceRole: 'buyer',
        title: 'Bond statement',
        externalReference: 'BOND-001',
        amountTotal: 0,
        amountDue: 0,
        fileName: 'statement.pdf',
      },
    ],
    entries: [
      {
        id: 'entry-1',
        entryType: 'charge',
        entryStatus: 'posted',
        entryVisibility: 'client_visible',
        amount: 12000,
        description: 'Transfer costs',
        occurredOn: '2026-07-14',
        financialDocumentId: 'document-1',
      },
    ],
  },
]

const summary = summarizeMatterFinancialSubmissionPack(sampleAccounts, { today: new Date('2026-07-18T10:00:00Z') })
assert.equal(summary.accountCount, 1, 'Phase 11 handover summary must count matter accounts.')
assert.equal(summary.documentCount, 2, 'Phase 11 handover summary must count uploaded documents.')
assert.equal(summary.draftDocuments, 1, 'Phase 11 handover summary must count draft documents.')
assert.equal(summary.requestCount, 2, 'Phase 11 handover summary must count client submission requests.')
assert.equal(summary.openRequests, 1, 'Phase 11 handover summary must count requests waiting on the buyer/seller.')
assert.equal(summary.awaitingReviewRequests, 1, 'Phase 11 handover summary must count requests awaiting attorney review.')
assert.equal(summary.proofsNeedingReview, 1, 'Phase 11 handover summary must count POPs needing reconciliation.')
assert.equal(summary.postedEntries, 1, 'Phase 11 handover summary must count posted ledger entries.')

const csv = buildMatterFinancialSubmissionPackCsv(sampleAccounts, {
  matterLabel: 'Matter ABC',
  today: new Date('2026-07-18T10:00:00Z'),
})
assert.match(csv, /Bridge attorney finance handover pack/, 'Phase 11 CSV must identify itself as the finance handover pack.')
assert.match(csv, /Client submission requests/, 'Phase 11 CSV must include client submission requests.')
assert.match(csv, /Uploaded financial documents/, 'Phase 11 CSV must include uploaded financial documents.')
assert.match(csv, /Attorney review queue/, 'Phase 11 CSV must include attorney review queue items.')
assert.match(csv, /Follow-up pack/, 'Phase 11 CSV must include the follow-up pack.')
assert.match(csv, /Ledger summary/, 'Phase 11 CSV must include ledger summary rows.')
assert.match(csv, /Upload transfer cost POP/, 'Phase 11 CSV must include outstanding buyer\\/seller request titles.')
assert.match(csv, /Attorney POP reconciliation required/, 'Phase 11 CSV must flag POPs requiring attorney reconciliation.')

const fileName = buildMatterFinancialSubmissionPackFileName({ matterLabel: 'Matter ABC' })
assert.match(fileName, /^bridge-matter-abc-finance-handover-pack-\d{4}-\d{2}-\d{2}\.csv$/, 'Phase 11 must produce a stable handover file name.')

assert.match(
  submissionPackSource,
  /export function buildMatterFinancialSubmissionPackCsv/,
  'Phase 11 must expose a CSV handover pack builder.',
)
assert.match(
  submissionPackSource,
  /export function downloadMatterFinancialSubmissionPack/,
  'Phase 11 must expose a browser download helper.',
)
assert.match(apiSource, /summarizeMatterFinancialSubmissionPack/, 'The matter accounts API must expose handover pack summary data.')
assert.match(apiSource, /submissionPackSummary/, 'fetchMatterFinancialAccounts must return handover pack summary data.')
assert.match(attorneyPanelSource, /Finance handover pack/, 'Attorney panel must render the handover pack section.')
assert.match(attorneyPanelSource, /handleDownloadSubmissionPack/, 'Attorney panel must support handover pack downloads.')
assert.match(attorneyPanelSource, /Download handover pack/, 'Attorney panel must expose a clear handover pack download action.')
assert.match(
  attorneyPanelSource,
  /Submission manifest for internal or accountant review/,
  'Attorney panel must explain that the handover pack supports accountant review.',
)

console.log('Attorney accounting Phase 11 handover pack contract checks passed.')
