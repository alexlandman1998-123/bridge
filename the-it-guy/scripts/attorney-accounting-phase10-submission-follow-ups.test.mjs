import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  buildMatterFinancialSubmissionFollowUps,
  summarizeMatterFinancialSubmissionFollowUps,
} from '../src/core/attorneyAccounting/matterAccountSubmissionFollowUps.js'

const repoRoot = process.cwd()
const followUpsPath = path.join(repoRoot, 'src/core/attorneyAccounting/matterAccountSubmissionFollowUps.js')
const apiPath = path.join(repoRoot, 'src/lib/api.js')
const attorneyPanelPath = path.join(repoRoot, 'src/components/AttorneyMatterAccountsPanel.jsx')

const followUpsSource = fs.readFileSync(followUpsPath, 'utf8')
const apiSource = fs.readFileSync(apiPath, 'utf8')
const attorneyPanelSource = fs.readFileSync(attorneyPanelPath, 'utf8')

const sampleFollowUps = buildMatterFinancialSubmissionFollowUps(
  [
    {
      id: 'buyer-account',
      transactionId: 'transaction-1',
      partyRole: 'buyer',
      partyLabel: 'Buyer Example',
      partyEmail: 'buyer@example.test',
      currencyCode: 'ZAR',
      portalEnabled: true,
      requests: [
        {
          id: 'overdue-pop',
          requestType: 'proof_of_payment',
          requestStatus: 'requested',
          title: 'Upload transfer cost POP',
          dueOn: '2026-07-15',
          amountDue: 12000,
          currencyCode: 'ZAR',
          description: 'Please upload the EFT confirmation.',
        },
        {
          id: 'due-soon-statement',
          requestType: 'statement',
          requestStatus: 'requested',
          title: 'Upload bond cancellation statement',
          dueOn: '2026-07-20',
        },
      ],
    },
    {
      id: 'seller-account',
      transactionId: 'transaction-1',
      partyRole: 'seller',
      partyLabel: 'Seller Example',
      portalEnabled: false,
      requests: [
        {
          id: 'rejected-invoice',
          requestType: 'invoice',
          requestStatus: 'rejected',
          title: 'Upload corrected levy clearance invoice',
          dueOn: '2026-07-22',
          reviewNotes: 'The uploaded document was unreadable.',
        },
        {
          id: 'already-submitted',
          requestType: 'invoice',
          requestStatus: 'submitted',
          title: 'Already submitted invoice',
        },
      ],
    },
  ],
  { today: new Date('2026-07-18T10:00:00Z') },
)

assert.equal(sampleFollowUps.length, 3, 'Phase 10 must only create follow-ups for client-action requested/rejected items.')
assert.equal(sampleFollowUps[0].urgency, 'overdue', 'Overdue follow-ups must sort first.')
assert.equal(sampleFollowUps[1].urgency, 'resubmission', 'Rejected requests must become resubmission follow-ups.')
assert.equal(sampleFollowUps[2].urgency, 'due_soon', 'Requests due within two days must be marked due soon.')
assert.match(sampleFollowUps[0].copyText, /Upload transfer cost POP/, 'Follow-up copy must mention the requested item.')
assert.match(sampleFollowUps[0].copyText, /overdue by 3 days/, 'Follow-up copy must explain overdue timing.')
assert.match(sampleFollowUps[1].portalWarning, /Portal visibility is paused/, 'Follow-ups must warn when the client portal is paused.')

const summary = summarizeMatterFinancialSubmissionFollowUps(sampleFollowUps)
assert.equal(summary.total, 3, 'Follow-up summary must count all generated follow-ups.')
assert.equal(summary.overdue, 1, 'Follow-up summary must count overdue reminders.')
assert.equal(summary.dueSoon, 1, 'Follow-up summary must count due-soon reminders.')
assert.equal(summary.resubmissions, 1, 'Follow-up summary must count resubmission reminders.')
assert.equal(summary.portalPaused, 1, 'Follow-up summary must count portal-paused warnings.')

assert.match(
  followUpsSource,
  /export function buildMatterFinancialSubmissionFollowUps/,
  'Phase 10 must expose a submission follow-up builder.',
)
assert.match(
  followUpsSource,
  /export function summarizeMatterFinancialSubmissionFollowUps/,
  'Phase 10 must expose a submission follow-up summary helper.',
)
assert.match(apiSource, /buildMatterFinancialSubmissionFollowUps/, 'The matter accounts API must build submission follow-ups.')
assert.match(apiSource, /followUps,/, 'fetchMatterFinancialAccounts must return submission follow-ups.')
assert.match(
  apiSource,
  /followUpSummary: summarizeMatterFinancialSubmissionFollowUps\(followUps\)/,
  'fetchMatterFinancialAccounts must return a submission follow-up summary.',
)
assert.match(apiSource, /followUpOverdue/, 'Matter account summary must expose overdue follow-up counts.')
assert.match(attorneyPanelSource, /Submission follow-up pack/, 'Attorney panel must render the follow-up pack.')
assert.match(attorneyPanelSource, /followUps\.slice\(0, 8\)/, 'Attorney follow-up pack must be bounded in the UI.')
assert.match(attorneyPanelSource, /handleCopyFollowUp/, 'Attorney follow-up pack must support copying reminder text.')
assert.match(
  attorneyPanelSource,
  /Paste it into your normal email or WhatsApp workflow/,
  'Follow-up copy action must keep sending inside the firm’s normal external workflow.',
)
assert.match(
  attorneyPanelSource,
  /No buyer\/seller submission follow-ups are needed right now/,
  'Follow-up pack must include an empty state.',
)

console.log('Attorney accounting Phase 10 submission follow-up contract checks passed.')
