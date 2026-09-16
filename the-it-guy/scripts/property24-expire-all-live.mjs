import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createProperty24Client, normalizeProperty24Text } from '../server/property24/client.js'
import { resolveProperty24EnvironmentCredentials } from '../server/property24/environmentService.js'
import { fetchOrganisationProperty24Connection } from '../server/property24/organisationConnectionService.js'
import { fetchOrganisationProperty24Credentials } from '../server/property24/organisationCredentialService.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const valueFor = (name) => args[args.indexOf(name) + 1] || ''
const organisationId = normalizeProperty24Text(valueFor('--organisation-id'))
const confirmed = args.includes('--confirm-expire-all-live')

if (!organisationId || !confirmed) {
  throw new Error('Usage: node scripts/property24-expire-all-live.mjs --organisation-id <uuid> --confirm-expire-all-live')
}

function envFile(file) {
  const fullPath = path.join(root, file)
  if (!fs.existsSync(fullPath)) return {}
  return Object.fromEntries(fs.readFileSync(fullPath, 'utf8').split(/\r?\n/)
    .filter((line) => line && !line.trim().startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=')
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')]
    }))
}

// Local developer overrides carry the currently verified service credential;
// production-only Property24 values remain server-side and come from vault.
const env = {
  ...envFile('.env'),
  ...envFile('.env.production.local'),
  ...envFile('.env.local'),
  ...envFile('.env.property24.local'),
  ...envFile('.env.property24.kingdom.local'),
  ...process.env,
}
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
const supabase = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const connection = await fetchOrganisationProperty24Connection({ supabase, organisationId })
if (!connection.configured || !connection.enabled || connection.environment !== 'production') {
  throw new Error('A connected production Property24 configuration is required.')
}
const vault = await fetchOrganisationProperty24Credentials({ supabase, organisationId, environment: 'production' })
const runtime = resolveProperty24EnvironmentCredentials({ env, environment: 'production' })
if (!vault?.username || !vault?.password || !runtime.baseUrl) throw new Error('Production Property24 credentials are unavailable.')
const property24 = createProperty24Client({
  baseUrl: runtime.baseUrl,
  apiVersion: runtime.apiVersion,
  username: vault.username,
  password: vault.password,
  userGroupId: vault.userGroupId,
})
const reconciliation = await property24.fetchListingReconciliation({ agencyId: connection.agencyId })
const listingNumbers = [...new Set((Array.isArray(reconciliation.data) ? reconciliation.data : reconciliation.data?.listings || [])
  .map((listing) => Number(listing.ListingNumber || listing.listingNumber || listing.id))
  .filter((listingNumber) => Number.isFinite(listingNumber) && listingNumber > 0))]
if (!listingNumbers.length) throw new Error('Property24 returned no listings to expire.')

const results = []
for (const listingNumber of listingNumbers) {
  const update = await property24.updateListingStatus(listingNumber, 'Expired')
  const portal = await property24.checkListingOnPortal(listingNumber)
  results.push({ listingNumber, updateStatus: update.status, isOnPortal: Boolean(portal.data) })
}
const stillLive = results.filter((result) => result.isOnPortal).map((result) => result.listingNumber)
console.log(JSON.stringify({
  organisationId,
  agencyId: connection.agencyId,
  expiredCount: results.length,
  verifiedOffPortalCount: results.length - stillLive.length,
  stillLive,
  results,
}, null, 2))
if (stillLive.length) process.exitCode = 2
