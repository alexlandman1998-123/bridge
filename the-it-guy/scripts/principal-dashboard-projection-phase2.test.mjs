import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serviceSource = readFileSync(
  path.join(PROJECT_ROOT, 'src/services/principalDashboardService.js'),
  'utf8',
)
const KNOWN_UNAVAILABLE_TRANSACTION_COLUMNS = [
  'seller_names',
  'owner_name',
  'owner_names',
  'tenant_name',
  'landlord_name',
  'property_image_url',
  'listing_image_url',
  'primary_image_url',
  'cover_image_url',
  'image_url',
  'photo_url',
  'entered_stage_at',
  'stage_entered_at',
  'current_stage_entered_at',
  'stage_changed_at',
  'last_stage_changed_at',
]

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    PRINCIPAL_DASHBOARD_TRANSACTION_SELECT_VARIANTS,
    PRINCIPAL_DASHBOARD_ORGANISATION_USER_SELECT_VARIANTS,
  } = await server.ssrLoadModule('/src/services/principalDashboardService.js')

  assert.equal(PRINCIPAL_DASHBOARD_TRANSACTION_SELECT_VARIANTS.length, 2, 'transactions should retain a compact fallback projection')
  assert.equal(PRINCIPAL_DASHBOARD_ORGANISATION_USER_SELECT_VARIANTS.length, 2, 'organisation users should retain a compact fallback projection')
  assert.match(
    serviceSource,
    /safeSelect\(\s*'transactions',\s*PRINCIPAL_DASHBOARD_TRANSACTION_SELECT_VARIANTS,/,
    'transactions must use the production-compatible projection contract',
  )
  assert.match(
    serviceSource,
    /safeSelect\(\s*'organisation_users',\s*PRINCIPAL_DASHBOARD_ORGANISATION_USER_SELECT_VARIANTS,/,
    'organisation users must use the production-compatible projection contract',
  )

  const transactionFields = PRINCIPAL_DASHBOARD_TRANSACTION_SELECT_VARIANTS
    .flatMap((variant) => variant.split(',').map((field) => field.trim()).filter(Boolean))

  for (const field of KNOWN_UNAVAILABLE_TRANSACTION_COLUMNS) {
    assert.equal(
      transactionFields.includes(field),
      false,
      `transactions projection must not request unavailable column ${field}`,
    )
  }

  const primaryTransactionFields = PRINCIPAL_DASHBOARD_TRANSACTION_SELECT_VARIANTS[0]
    .split(',')
    .map((field) => field.trim())
  for (const field of [
    'id',
    'organisation_id',
    'assigned_branch_id',
    'assigned_user_id',
    'current_main_stage',
    'sales_price',
    'gross_commission_amount',
    'updated_at',
  ]) {
    assert.equal(primaryTransactionFields.includes(field), true, `primary transactions projection must retain ${field}`)
  }

  const primaryOrganisationUserFields = PRINCIPAL_DASHBOARD_ORGANISATION_USER_SELECT_VARIANTS[0]
    .split(',')
    .map((field) => field.trim())
  assert.equal(primaryOrganisationUserFields.includes('avatar_url'), false, 'organisation_users avatar URLs must be resolved from profiles')
  for (const field of ['id', 'organisation_id', 'user_id', 'branch_id', 'workspace_role', 'organisation_role']) {
    assert.equal(primaryOrganisationUserFields.includes(field), true, `primary organisation_users projection must retain ${field}`)
  }

  console.log('principal dashboard Phase 2 projection tests passed')
} finally {
  await server.close()
}
