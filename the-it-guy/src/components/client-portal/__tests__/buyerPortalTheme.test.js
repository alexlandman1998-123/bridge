import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buyerPortalHexToRgba,
  createBuyerPortalTheme,
  normalizeBuyerPortalColour,
} from '../buyerPortalTheme.js'

test('normalizes six- and three-digit portal colours', () => {
  assert.equal(normalizeBuyerPortalColour('#A1B2C3'), '#a1b2c3')
  assert.equal(normalizeBuyerPortalColour('#abc'), '#aabbcc')
  assert.equal(normalizeBuyerPortalColour('not-a-colour', '#123456'), '#123456')
})
test('creates one immutable theme contract for demo and production shells', () => {
  const theme = createBuyerPortalTheme({
    primaryColour: '#123456',
    secondaryColour: '#345678',
    accentColour: '#f0c040',
  })

  assert.equal(theme.primary, '#123456')
  assert.equal(theme.secondary, '#345678')
  assert.equal(theme.accent, '#f0c040')
  assert.match(theme.sidebarStyle.backgroundImage, /#123456/)
  assert.match(theme.sidebarStyle.backgroundImage, /#345678/)
  assert.match(theme.activeNavigationStyle.boxShadow, /#f0c040/)
  assert.match(theme.heroOverlayStyle.background, /rgba\(18, 52, 86, 0\.9\)/)
  assert.equal(Object.isFrozen(theme), true)
  assert.equal(Object.isFrozen(theme.sidebarStyle), true)
})

test('converts portal colours to rgba without per-page implementations', () => {
  assert.equal(buyerPortalHexToRgba('#0a141e', 0.25), 'rgba(10, 20, 30, 0.25)')
})
