import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validateSupabaseBrowserKey } from '../src/config/productionValidation.js'

const [viteConfig, vercelConfig, appSource] = await Promise.all([
  readFile(new URL('../vite.config.js', import.meta.url), 'utf8'),
  readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
  readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
])

assert.match(viteConfig, /arch9-release-integrity/, 'Vite must emit the Arch9 release manifest.')
assert.match(viteConfig, /arch9-production-environment-guard/, 'Production builds must validate browser auth environment.')
assert.match(viteConfig, /validateSupabaseBrowserKey/, 'Production builds must reject unsupported Supabase browser keys.')
assert.match(viteConfig, /release-manifest\.json/, 'Vite must publish a release manifest.')
assert.match(viteConfig, /AgentListingDetail/, 'The critical manifest set must include the listing-detail chunk.')
assert.match(viteConfig, /arch9-release/, 'The HTML must carry its release marker.')
assert.match(vercelConfig, /"source": "\/index\.html"/, 'The app shell needs explicit cache control.')
assert.match(vercelConfig, /"source": "\/release-manifest\.json"/, 'The release manifest needs explicit cache control.')
assert.match(vercelConfig, /"source": "\/assets\/:path\*"/, 'Hashed assets need immutable cache control.')
assert.match(appSource, /scope="agent-listing-detail"/, 'Listing detail must remain isolated from the app-shell error boundary.')

function createJwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`
}

assert.equal(validateSupabaseBrowserKey('sb_publishable_example').ok, false, 'Publishable keys must not be accepted for browser auth.')
assert.equal(validateSupabaseBrowserKey(createJwt({ role: 'service_role' })).ok, false, 'Service-role keys must not be accepted for browser auth.')
assert.equal(validateSupabaseBrowserKey(createJwt({ role: 'anon' })).ok, true, 'JWT anon keys must be accepted for browser auth.')

console.log('Release integrity contract checks passed.')
