import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { HIGH_LEVEL_MILESTONES } from '../src/core/transactions/highLevelJourneyRules.js'
const source = readFileSync('src/pages/AttorneyTransactionDetail.jsx', 'utf8')
const progress = readFileSync('src/components/transaction/TransactionOverviewProgress.jsx', 'utf8')
const start = source.indexOf('function AgentTransactionCommandCenter(')
const end = source.indexOf('function MatterOverviewHeader(', start)
assert.ok(start > 0 && end > start, 'the current operator overview must be extractable')
const overview = source.slice(start, end)
assert.match(source, /<AgentTransactionCommandCenter/)
assert.match(overview, /<TransactionJourneyTracker/)
assert.match(overview, /<TransactionOverviewProgress/)
assert.match(overview, /onClick=\{\(\) => onOpenWorkspace\?\.\('transfer'\)\}>View full journey/)
assert.match(overview, /Record historical progress/)
assert.match(overview, /View all parties/)
assert.match(overview, /View documents/)
assert.doesNotMatch(overview, /Recent Activity|Next Best Action|Financial Snapshot/)
assert.match(progress, /Current progress/i)
assert.match(progress, /Deal Summary/)
assert.match(source, /contact: buyerDisplayName/)
assert.match(source, /email: buyerEmail/)
assert.deepEqual(HIGH_LEVEL_MILESTONES.map(item => item.id), ['otp_signed', 'finance', 'transfer', 'lodgement', 'registration'])
console.log('Agent overview: shared milestones, immediate progress, canonical contacts, deal summary and navigation passed')

// Execute the actual overview prop expression against the canonical finance normalizer.
const { normalizeFinanceType, financeTypeLabel: describeFinanceType } = await import('../src/core/transactions/financeType.js')
const financeExpression = source.match(/financeDescription=\{([^\n]+)\}/)?.[1]
assert.ok(financeExpression, 'attorney overview finance description must be present')
const describeOverviewFinance = new Function('normalizedFinanceType', 'describeFinanceType', `return (${financeExpression})`)
for (const input of ['cash', 'bond', 'hybrid', 'combination', 'developer']) {
  const normalized = normalizeFinanceType(input, { allowUnknown: true })
  assert.equal(describeOverviewFinance(normalized, describeFinanceType), describeFinanceType(input), `${input} must display its captured finance route`)
}
assert.equal(describeOverviewFinance('unknown', describeFinanceType), 'Finance type not captured')
console.log('Attorney overview: cash, bond, hybrid alias, combination, developer and unknown finance labels passed')
