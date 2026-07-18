import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const reviewQueuePath = path.join(repoRoot, 'src/core/attorneyAccounting/matterAccountReviewQueue.js')
const apiPath = path.join(repoRoot, 'src/lib/api.js')
const attorneyPanelPath = path.join(repoRoot, 'src/components/AttorneyMatterAccountsPanel.jsx')

const reviewQueueSource = fs.readFileSync(reviewQueuePath, 'utf8')
const apiSource = fs.readFileSync(apiPath, 'utf8')
const attorneyPanelSource = fs.readFileSync(attorneyPanelPath, 'utf8')

assert.match(
  reviewQueueSource,
  /export function buildMatterFinancialReviewQueue/,
  'Phase 9 must expose a matter finance review queue builder.',
)
assert.match(
  reviewQueueSource,
  /export function summarizeMatterFinancialReviewQueue/,
  'Phase 9 must expose a matter finance review queue summary helper.',
)
assert.match(reviewQueueSource, /kind: 'proof_review'/, 'Review queue must include POPs that need reconciliation.')
assert.match(
  reviewQueueSource,
  /request_review/,
  'Review queue must include submitted or awaiting-review client submissions.',
)
assert.match(
  reviewQueueSource,
  /accepted_request/,
  'Review queue must include accepted request submissions that still need completion.',
)
assert.match(reviewQueueSource, /overdue_request/, 'Review queue must include overdue client requests.')
assert.match(reviewQueueSource, /rejected_request/, 'Review queue must include rejected requests waiting on a client.')
assert.match(reviewQueueSource, /open_request/, 'Review queue must include open requests waiting on a client.')
assert.match(
  reviewQueueSource,
  /actionRequiredBy: \['request_review', 'accepted_request'\]\.includes\(kind\) \? 'attorney' : 'client'/,
  'Request queue items must distinguish attorney action from client action.',
)
assert.match(reviewQueueSource, /canPostPayment: true/, 'POP review items must expose a post-payment action.')

assert.match(apiSource, /buildMatterFinancialReviewQueue/, 'The matter accounts API must build the review queue.')
assert.match(apiSource, /summarizeMatterFinancialReviewQueue/, 'The matter accounts API must summarize the review queue.')
assert.match(
  apiSource,
  /reviewQueueSummary: summarizeMatterFinancialReviewQueue\(reviewQueue\)/,
  'fetchMatterFinancialAccounts must return a review queue summary.',
)
assert.match(
  apiSource,
  /reviewQueueAttorneyAction/,
  'Matter account summary must expose attorney-action review queue counts.',
)
assert.match(
  apiSource,
  /reviewQueueClientAction/,
  'Matter account summary must expose client-action review queue counts.',
)

assert.match(attorneyPanelSource, /Attorney finance review queue/, 'Attorney panel must render the review queue.')
assert.match(attorneyPanelSource, /reviewQueue\.slice\(0, 12\)/, 'Attorney review queue must be bounded in the UI.')
assert.match(
  attorneyPanelSource,
  /handleUpdateRequestStatus\(item\.request, 'accepted'/,
  'Attorney review queue must support accepting submitted request documents.',
)
assert.match(
  attorneyPanelSource,
  /handleUpdateRequestStatus\(item\.request, 'rejected'/,
  'Attorney review queue must support rejecting submitted request documents.',
)
assert.match(
  attorneyPanelSource,
  /handleUpdateRequestStatus\(item\.request, 'complete'/,
  'Attorney review queue must support completing accepted request documents.',
)
assert.match(
  attorneyPanelSource,
  /handleUpdateRequestStatus\(item\.request, 'cancelled'/,
  'Attorney review queue must support cancelling stale client requests.',
)
assert.match(
  attorneyPanelSource,
  /handlePostProofPayment\(account, item\.document\)/,
  'Attorney review queue must support posting reviewed POPs.',
)
assert.match(
  attorneyPanelSource,
  /No finance review items are waiting right now/,
  'Attorney review queue must include an empty state.',
)

console.log('Attorney accounting Phase 9 review queue contract checks passed.')
