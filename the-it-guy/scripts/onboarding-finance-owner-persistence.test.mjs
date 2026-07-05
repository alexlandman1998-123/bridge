import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { deriveFinanceManagedBy } from '../src/core/transactions/financeType.js'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const readProjectFile = (relativePath) => readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8')

const apiSource = readProjectFile('src/lib/api.js')
const clientOnboardingSource = readProjectFile('src/pages/ClientOnboarding.jsx')

assert.equal(
  deriveFinanceManagedBy({
    financeType: 'cash',
    financeManagedBy: 'bond_originator',
    formData: { bond_help_requested: 'yes' },
  }),
  'client',
  'cash buyers must remain client-managed even if stale originator fields are present',
)

assert.equal(
  deriveFinanceManagedBy({
    financeType: 'bond',
    formData: { bond_help_requested: 'no' },
  }),
  'client',
  'bond buyers who decline originator help must be client-managed',
)

assert.equal(
  deriveFinanceManagedBy({
    financeType: 'combination',
    formData: { finance: { bond_help_requested: 'yes' } },
  }),
  'bond_originator',
  'combination buyers who request originator help must be originator-managed',
)

assert.match(
  clientOnboardingSource,
  /import \{ deriveFinanceManagedBy, normalizeFinanceType \} from '\.\.\/core\/transactions\/financeType'/,
  'client onboarding should import the shared finance owner derivation helper',
)
assert.match(
  clientOnboardingSource,
  /const financeManagedBy = deriveFinanceManagedBy\(\{[\s\S]*?formData: cleaned,[\s\S]*?\}\)/,
  'client onboarding should derive finance owner from sanitized form data',
)
assert.match(
  clientOnboardingSource,
  /cleaned\.finance_managed_by = financeManagedBy/,
  'sanitized onboarding data should store top-level snake_case finance owner',
)
assert.match(
  clientOnboardingSource,
  /cleaned\.finance\.finance_managed_by = financeManagedBy/,
  'sanitized onboarding data should store nested finance owner',
)

assert.match(
  apiSource,
  /import \{[\s\S]*deriveFinanceManagedBy,[\s\S]*\} from '\.\.\/core\/transactions\/financeType'/,
  'API should import the shared finance owner derivation helper',
)
assert.match(
  apiSource,
  /function deriveOnboardingFinanceManagedBy\(\{ formData = \{\}, transaction = null \} = \{\}\) \{[\s\S]*?deriveFinanceManagedBy\(\{[\s\S]*?formData,[\s\S]*?\}\)[\s\S]*?\}/,
  'API should recompute onboarding finance owner server-side from the submitted form and transaction',
)
assert.match(
  apiSource,
  /const financeManagedBy = deriveOnboardingFinanceManagedBy\(\{ formData, transaction \}\)[\s\S]*?finance_managed_by: financeManagedBy,/,
  'transaction finance snapshot sync should persist finance_managed_by',
)
assert.match(
  apiSource,
  /formDataForPersistence = \{[\s\S]*?finance_managed_by: financeManagedBy,[\s\S]*?finance:\s*\{[\s\S]*?finance_managed_by: financeManagedBy,/,
  'onboarding token persistence should stamp top-level and nested finance owner values',
)
assert.match(
  apiSource,
  /const formDataForPersistence = \{[\s\S]*?finance_managed_by: financeManagedBy,[\s\S]*?funding_sources: fundingSources,[\s\S]*?\}/,
  'client portal persistence should stamp finance owner before saving funding sources',
)
assert.match(
  apiSource,
  /await syncOnboardingTransactionFinanceSnapshot\(client, \{[\s\S]*?formData: formDataForPersistence,/,
  'onboarding sync should use the enriched persistence payload',
)

console.log('onboarding finance owner persistence tests passed')
