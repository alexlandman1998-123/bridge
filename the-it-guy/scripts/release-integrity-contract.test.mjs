import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [viteConfig, vercelConfig, appSource] = await Promise.all([
  readFile(new URL('../vite.config.js', import.meta.url), 'utf8'),
  readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
  readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
])

assert.match(viteConfig, /arch9-release-integrity/, 'Vite must emit the Arch9 release manifest.')
assert.match(viteConfig, /release-manifest\.json/, 'Vite must publish a release manifest.')
assert.match(viteConfig, /AgentListingDetail/, 'The critical manifest set must include the listing-detail chunk.')
assert.match(viteConfig, /arch9-release/, 'The HTML must carry its release marker.')
assert.match(vercelConfig, /"source": "\/index\.html"/, 'The app shell needs explicit cache control.')
assert.match(vercelConfig, /"source": "\/release-manifest\.json"/, 'The release manifest needs explicit cache control.')
assert.match(vercelConfig, /"source": "\/assets\/:path\*"/, 'Hashed assets need immutable cache control.')
assert.match(appSource, /scope="agent-listing-detail"/, 'Listing detail must remain isolated from the app-shell error boundary.')

console.log('Release integrity contract checks passed.')
