import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const repoRoot = process.cwd()
const apiPath = path.join(repoRoot, 'src/lib/api.js')
const portalPath = path.join(repoRoot, 'src/pages/ClientPortal.jsx')
const migrationPath = path.join(repoRoot, '../supabase/migrations/202608100001_seller_portal_matter_account_uploads.sql')

const apiSource = fs.readFileSync(apiPath, 'utf8')
const portalSource = fs.readFileSync(portalPath, 'utf8')
const migrationSource = fs.readFileSync(migrationPath, 'utf8')

assert.match(
  apiSource,
  /function getSellerPortalScopedHeaders/,
  'Client portal account APIs must build seller-scoped headers for seller workspaces',
)
assert.match(
  apiSource,
  /'x-bridge-seller-portal-token': normalizedToken/,
  'Seller account calls must send the stable seller portal token header',
)
assert.match(
  apiSource,
  /'x-bridge-seller-portal-access-token': normalizedAccessToken/,
  'Seller account calls must send the active seller portal access token header',
)
assert.match(
  apiSource,
  /fetchClientPortalMatterFinancialAccounts\(\{ token, workspace = 'buyer', sellerPortalAccessToken = '' \}/,
  'Account read helper must accept a seller portal access token',
)
assert.match(
  apiSource,
  /uploadClientPortalMatterFinancialProof\(\{[\s\S]*sellerPortalAccessToken = ''/,
  'Proof upload helper must accept a seller portal access token',
)
assert.match(
  apiSource,
  /uploadClientPortalMatterFinancialRequestDocument\(\{[\s\S]*sellerPortalAccessToken = ''/,
  'Requested document upload helper must accept a seller portal access token',
)

assert.match(
  portalSource,
  /sellerPortalAccessToken: effectiveWorkspace === 'seller' \? sellerPortalAccessToken : ''/,
  'Seller portal account reads and uploads must pass the active seller session token',
)

assert.match(
  migrationSource,
  /create or replace function public\.bridge_portal_matter_financial_transaction_id/,
  'Migration must add a shared buyer-or-seller transaction resolver',
)
assert.match(
  migrationSource,
  /bridge_private_listing_seller_portal_payload\([\s\S]*v_seller_token,[\s\S]*v_seller_access_token,[\s\S]*true/,
  'Seller account resolver must validate the active seller portal session',
)
assert.match(
  migrationSource,
  /create or replace function public\.bridge_client_portal_matter_financial_accounts/,
  'Migration must replace the account read RPC with seller portal support',
)
assert.match(
  migrationSource,
  /create or replace function public\.bridge_storage_buyer_portal_can_write/,
  'Migration must extend document storage writes for seller matter account uploads',
)
assert.match(
  migrationSource,
  /account\.party_role = 'seller'/,
  'Seller storage fallback must remain scoped to seller financial accounts',
)
assert.match(
  migrationSource,
  /create or replace function public\.bridge_client_portal_upload_matter_financial_proof/,
  'Migration must replace proof upload RPC with seller portal support',
)
assert.match(
  migrationSource,
  /create or replace function public\.bridge_client_portal_submit_matter_financial_request_document/,
  'Migration must replace requested document upload RPC with seller portal support',
)

console.log('Seller portal matter account upload bridge checks passed.')
