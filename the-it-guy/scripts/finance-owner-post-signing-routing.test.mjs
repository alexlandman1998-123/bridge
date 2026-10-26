import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apiSource = readFileSync(path.join(PROJECT_ROOT, 'src/lib/api.js'), 'utf8')
const notificationSource = readFileSync(path.join(PROJECT_ROOT, 'src/services/bondIntakeNotificationService.js'), 'utf8')
const selectorSource = readFileSync(path.join(PROJECT_ROOT, 'src/core/transactions/bondIntakeSelectors.js'), 'utf8')

assert.match(
  apiSource,
  /const financeManagedBy = deriveOnboardingFinanceManagedBy\(\{[\s\S]*?formData: onboardingFormData,[\s\S]*?\}\)/,
  'signed OTP handoff should derive finance owner from persisted onboarding data',
)
assert.match(
  apiSource,
  /const originatorManagedFinance = bondFinance && financeManagedBy === 'bond_originator'/,
  'signed OTP handoff should distinguish originator-managed bond from client-managed bond',
)
assert.match(
  apiSource,
  /const targetMainStage = originatorManagedFinance \? 'FIN' : 'ATT'/,
  'only originator-managed finance should route to the finance main stage after signed OTP',
)
assert.match(apiSource, /if \(originatorManagedFinance && !durableDispatch\)/, 'only unmanaged legacy dispatches may notify the originator directly')
assert.match(apiSource, /readTransactionHandoffDispatchMode/, 'signed OTP handoff should have durable recipient-aware dispatch')
assert.match(
  apiSource,
  /if \(originatorManagedFinance && !durableDispatch\) \{[\s\S]*?await checkAndNotifyBondOtpReady/,
  'bond OTP-ready notification should only fire for originator-managed finance',
)
assert.match(
  apiSource,
  /reason: isBondFinanceType\(financeType \|\| transaction\?\.finance_type\)[\s\S]{0,40}\? 'finance_not_originator_managed'[\s\S]{0,40}: 'not_bond_finance'/,
  'originator activation should explicitly skip client-managed bond finance',
)
assert.match(
  apiSource,
  /isBondFinanceType\(financeSnapshot\.financeType \|\| transaction\.finance_type\)\s*&&\s*financeManagedBy === 'bond_originator'/,
  'client portal bond application notifications should be owner-gated',
)

assert.match(
  notificationSource,
  /function resolveBondNotificationFinanceContext\(transaction = \{\}, metadata = \{\}\) \{/,
  'bond notification service should resolve finance ownership centrally',
)
assert.match(
  notificationSource,
  /if \(!financeContext\.originatorManaged\) \{[\s\S]*?finance_not_originator_managed/,
  'bond notification service should suppress client-managed bond notifications',
)

assert.match(
  selectorSource,
  /export function isOriginatorManagedBondFinance\(transaction = \{\}, onboardingFormData = null\) \{/,
  'bond intake selectors should expose an originator-managed finance predicate',
)
assert.match(
  selectorSource,
  /if \(!isOriginatorManagedBondFinance\(transaction, input\.onboardingFormData\)\) \{[\s\S]*?NOT_BOND_RELEVANT/,
  'originator intake queue should hide client-managed bond finance',
)

console.log('finance owner post-signing routing tests passed')
