import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publicWebsiteHref, selectWebsiteLogo } from './website-brand.ts'

const site = {
  logoLightUrl: 'https://assets.example/light-logo.svg',
  logoDarkUrl: 'https://assets.example/dark-logo.svg',
  logoUrl: 'https://assets.example/fallback-logo.svg',
}

test('uses the studio standard logo on light surfaces and alternate logo on dark surfaces', () => {
  assert.equal(selectWebsiteLogo(site), site.logoLightUrl)
  assert.equal(selectWebsiteLogo(site, true), site.logoDarkUrl)
  assert.equal(selectWebsiteLogo({ logoLightUrl: site.logoLightUrl }, true), site.logoLightUrl)
})

test('only exposes safe external website links', () => {
  assert.equal(publicWebsiteHref('https://kingdomrealestate.co.za'), 'https://kingdomrealestate.co.za/')
  assert.equal(publicWebsiteHref('http://example.test/path'), 'http://example.test/path')
  assert.equal(publicWebsiteHref('javascript:alert(1)'), undefined)
  assert.equal(publicWebsiteHref('not a URL'), undefined)
})
