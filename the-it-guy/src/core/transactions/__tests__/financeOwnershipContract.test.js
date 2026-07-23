import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const financeType = await server.ssrLoadModule('/src/core/transactions/financeType.js')
  const permissions = await server.ssrLoadModule('/src/core/transactions/permissions.js')

  const {
    FINANCE_ASSISTANCE_PREFERENCES,
    deriveFinanceManagedBy,
    isClientManagedFinance,
    isFinanceAssistanceDeclined,
    isFinanceAssistanceRequested,
    hasBondOriginatorContactConsent,
    isOriginatorManagedFinance,
    normalizeFinanceManagedBy,
    resolveFinanceAssistancePreference,
  } = financeType

  assert.equal(normalizeFinanceManagedBy('buyer / attorney'), 'client')
  assert.equal(normalizeFinanceManagedBy('cash'), 'client')
  assert.equal(normalizeFinanceManagedBy('own finance'), 'client')
  assert.equal(normalizeFinanceManagedBy('Ooba Assisted'), 'bond_originator')
  assert.equal(normalizeFinanceManagedBy('developer finance'), 'internal')
  assert.equal(normalizeFinanceManagedBy(''), 'bond_originator')
  assert.equal(normalizeFinanceManagedBy('', { fallback: 'client' }), 'client')

  assert.equal(
    resolveFinanceAssistancePreference({ finance: { bond_help_requested: 'yes' } }),
    FINANCE_ASSISTANCE_PREFERENCES.REQUESTED,
  )
  assert.equal(
    resolveFinanceAssistancePreference({ bond_help_requested: 'no' }),
    FINANCE_ASSISTANCE_PREFERENCES.DECLINED,
  )
  assert.equal(
    resolveFinanceAssistancePreference({ finance: { bond_originator_name: 'Buyer Selected Originator' } }),
    FINANCE_ASSISTANCE_PREFERENCES.REQUESTED,
  )
  assert.equal(resolveFinanceAssistancePreference({}), FINANCE_ASSISTANCE_PREFERENCES.UNKNOWN)
  assert.equal(isFinanceAssistanceRequested({ ooba_assist_requested: 'yes' }), true)
  assert.equal(isFinanceAssistanceDeclined({ ooba_assist_requested: 'no' }), true)
  assert.equal(hasBondOriginatorContactConsent({ finance: { bond_assistance_selection: 'agency_partner', bond_assistance_contact_consent: 'yes' } }), true)
  assert.equal(hasBondOriginatorContactConsent({ finance: { bond_assistance_selection: 'agency_partner', bond_assistance_contact_consent: 'no' } }), false)

  assert.equal(deriveFinanceManagedBy({ financeType: 'cash' }), 'client')
  assert.equal(deriveFinanceManagedBy({ financeType: 'developer' }), 'internal')
  assert.equal(
    deriveFinanceManagedBy({
      financeType: 'bond',
      formData: { finance: { bond_help_requested: 'yes' } },
    }),
    'bond_originator',
  )
  assert.equal(
    deriveFinanceManagedBy({
      financeType: 'combination',
      formData: { finance: { bond_help_requested: 'no' } },
    }),
    'client',
  )
  assert.equal(
    deriveFinanceManagedBy({
      financeType: 'bond',
      financeManagedBy: 'client',
    }),
    'client',
  )
  assert.equal(
    deriveFinanceManagedBy({
      formData: { purchase_finance_type: 'cash' },
      financeManagedBy: 'bond_originator',
    }),
    'client',
  )
  assert.equal(deriveFinanceManagedBy({ financeType: 'bond' }), 'bond_originator')

  assert.equal(isOriginatorManagedFinance({ financeType: 'bond' }), true)
  assert.equal(isClientManagedFinance({ financeType: 'cash', financeManagedBy: 'bond_originator' }), true)
  assert.equal(isClientManagedFinance('own finance'), true)

  assert.equal(permissions.normalizeFinanceManagedBy('buyer attorney managed'), 'client')
  assert.equal(
    permissions.getRolePermissions({
      role: 'bond_originator',
      financeManagedBy: 'client',
    }).canEditFinanceWorkflow,
    false,
  )
  assert.equal(
    permissions.getRolePermissions({
      role: 'bond_originator',
      financeType: 'cash',
      financeManagedBy: 'bond_originator',
    }).canEditFinanceWorkflow,
    false,
  )
  assert.equal(
    permissions.getRolePermissions({
      role: 'bond_originator',
      financeType: 'bond',
      formData: { bond_help_requested: 'yes' },
    }).canEditFinanceWorkflow,
    true,
  )
  assert.equal(
    permissions.getRolePermissions({
      role: 'attorney',
      financeType: 'cash',
    }).canEditAttorneyWorkflow,
    true,
  )

  console.log('finance ownership contract tests passed')
} finally {
  await server.close()
}
