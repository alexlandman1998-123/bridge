import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const homepage = await fs.readFile(new URL('../src/pages/BridgeLanding.jsx', import.meta.url), 'utf8')
const router = await fs.readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')

assert.match(homepage, /Power your business\./, 'hero should lead with the new business-focused headline')
assert.match(homepage, /Deliver every transaction with confidence\./, 'hero should position Arch9 around transaction confidence')
assert.match(homepage, /One connected platform to manage, communicate and move every deal forward/, 'hero should describe the connected transaction platform')
assert.match(homepage, /\{ label: 'Buy', to: '\/bridge\/buy', dropdown: true \}/, 'top navigation should include Buy as the property gateway')
assert.match(homepage, /Residential Properties/, 'Buy dropdown should expose residential properties')
assert.match(homepage, /Commercial Properties/, 'Buy dropdown should expose commercial properties')
assert.match(homepage, /New Developments/, 'Buy dropdown should expose new developments')
assert.match(homepage, /Affordability Calculator/, 'Buy dropdown should expose buyer calculators')
assert.match(homepage, /Where are you on your property journey\?/, 'homepage should include the choose-your-path section')
assert.match(homepage, /Find\. Explore\. Decide with confidence\./, 'homepage should move buyer discovery content below the hero')
assert.match(homepage, /Everything you need to run better transactions\./, 'homepage should include the professionals section')
assert.match(homepage, /One transaction\. Every stakeholder\./, 'homepage should include the stakeholder journey section')
assert.match(homepage, /Every agency deserves a world-class client experience\./, 'homepage should include enterprise-level positioning')
assert.match(homepage, /Ready to modernise your property business\?/, 'homepage should include the final CTA')
assert.doesNotMatch(homepage, /For Sale \/ To Rent|Search properties, tenants, deals|Search form/, 'homepage hero should not include property-search controls')

for (const route of ['/bridge/buy', '/bridge/tools', '/bridge/resources', '/bridge/pricing', '/bridge/about']) {
  assert.match(router, new RegExp(`path="${route.replaceAll('/', '\\/')}"`), `${route} should be wired into the router`)
}

console.log('arch9 homepage refactor tests passed')
