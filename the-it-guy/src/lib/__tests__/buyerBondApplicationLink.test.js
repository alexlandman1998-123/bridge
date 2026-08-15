import assert from 'node:assert/strict'

import {
  BUYER_BOND_APPLICATION_FALLBACK_PATH,
  buildBuyerBondApplicationLink,
  resolveBuyerBondApplicationLink,
} from '../buyerBondApplicationLink.js'

assert.equal(
  buildBuyerBondApplicationLink({ clientPortalPath: '/client/buyer-token-123' }),
  '/client/buyer-token-123/bond-application',
)

assert.equal(
  buildBuyerBondApplicationLink({ buyerPortalPath: '/client/buyer-token-123/buying' }),
  '/client/buyer-token-123/bond-application',
)

assert.equal(
  buildBuyerBondApplicationLink({ applicationLink: '/client/buyer-token-123/bond-application' }),
  '/client/buyer-token-123/bond-application',
)

assert.equal(
  buildBuyerBondApplicationLink({ clientPortalPath: '/client/buyer-token-123/buying?utm=mail#application' }),
  '/client/buyer-token-123/bond-application?utm=mail#application',
)

assert.equal(
  buildBuyerBondApplicationLink({ portalToken: 'buyer token' }),
  '/client/buyer%20token/bond-application',
)

assert.equal(
  buildBuyerBondApplicationLink({ clientPortalPath: '/client/buyer%20token/buying' }),
  '/client/buyer%20token/bond-application',
)

assert.equal(
  buildBuyerBondApplicationLink({
    clientPortalPath: '/client/buyer-token-123/buying',
    baseUrl: 'https://app.arch9.test/',
  }),
  'https://app.arch9.test/client/buyer-token-123/bond-application',
)

assert.equal(
  buildBuyerBondApplicationLink({ applicationLink: 'https://app.arch9.test/client/buyer-token-123/team?source=email' }),
  'https://app.arch9.test/client/buyer-token-123/bond-application?source=email',
)

assert.equal(
  buildBuyerBondApplicationLink({ applicationPath: '/bond/applications' }),
  BUYER_BOND_APPLICATION_FALLBACK_PATH,
)

const resolved = resolveBuyerBondApplicationLink({ clientPortalPath: '/client/buyer-token-123/documents' })
assert.equal(resolved.link, '/client/buyer-token-123/bond-application')
assert.equal(resolved.path, '/client/buyer-token-123/bond-application')
assert.equal(resolved.source, 'client_portal_path')
assert.equal(resolved.usedFallback, false)
assert.equal(resolved.isAbsolute, false)

const fallback = resolveBuyerBondApplicationLink({})
assert.equal(fallback.link, BUYER_BOND_APPLICATION_FALLBACK_PATH)
assert.equal(fallback.source, 'fallback')
assert.equal(fallback.usedFallback, true)

console.log('Buyer bond application link tests passed')
