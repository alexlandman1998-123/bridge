import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const portal = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')
const dock = await readFile(new URL('../src/components/documents/DocumentMobileActionDock.jsx', import.meta.url), 'utf8')

assert.match(portal, /grid-cols-\[minmax\(0,1fr\)_auto\]/, 'The signer header must use a compact two-column mobile layout.')
assert.match(portal, /Current step/, 'Mobile signers must see an immediate next-step summary above the document.')
assert.match(portal, /hidden space-y-4 lg:block/, 'Desktop administration panels must stay out of the mobile signing path.')
assert.match(portal, /Math\.max\(76, numberOr\(field\?\.width/, 'Signing fields need a practical mobile touch width.')
assert.match(portal, /Math\.max\(44, numberOr\(field\?\.height/, 'Signing fields need a 44px minimum mobile touch height.')
assert.match(portal, /md:sticky md:top-0/, 'The document toolbar must not create a competing sticky layer on phones.')
assert.match(portal, /aria-label="Zoom out"/, 'Document zoom controls must have accessible names.')
assert.match(portal, /aria-label="Close signature capture"/, 'Signature capture must have an accessible close control.')
assert.match(dock, /grid-cols-\[minmax\(0,1fr\)_auto\]/, 'The persistent mobile action must reserve stable space for its primary action.')
assert.match(dock, /min-h-\[52px\]/, 'The mobile primary action must meet an ergonomic touch target.')

console.log('Signer mobile experience contract passed')
