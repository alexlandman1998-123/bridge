import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const clientPortalSource = await readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8')
const demoPortalSource = await readFile(new URL('../src/pages/ProspectBuyerDemo.jsx', import.meta.url), 'utf8')
const mobileChromeSource = await readFile(new URL('../src/components/client-portal/BuyerMobileChrome.jsx', import.meta.url), 'utf8')

test('demo and live buyer portals consume the shared mobile chrome contract', () => {
  for (const primitive of ['BuyerMobileHeader', 'BuyerMobilePropertyHero', 'BuyerMobilePageIntro', 'BuyerMobileBottomNavigation']) {
    assert.match(mobileChromeSource, new RegExp(`export function ${primitive}`))
    assert.match(clientPortalSource, new RegExp(`\\b${primitive}\\b`))
    assert.match(demoPortalSource, new RegExp(`\\b${primitive}\\b`))
  }
})

test('mobile branding is contrast-aware and the persistent navigation stays focused', () => {
  assert.match(clientPortalSource, /const buyerPortalLogoLightUrl = pickFirstText\(/)
  assert.match(clientPortalSource, /brandLogoUrl=\{buyerPortalLogoLightUrl\}/)
  assert.match(demoPortalSource, /logoUrl=\{config\.logoLightUrl \|\| config\.logoDarkUrl\}/)
  assert.match(demoPortalSource, /\['overview', 'progress', 'documents', 'finance', 'team'\]/)
  assert.match(mobileChromeSource, /min-h-\[48px\]/)
  assert.match(mobileChromeSource, /safe-area-inset-bottom/)
})

test('phase 3 upload interactions retain accessibility and live upload safety', () => {
  assert.match(mobileChromeSource, /role="dialog" aria-modal="true"/)
  assert.match(demoPortalSource, /<BuyerMobileActionSheet/)
  assert.match(demoPortalSource, /aria-live="polite"/)
  assert.match(clientPortalSource, /capture="environment"/)
  assert.match(clientPortalSource, /onUploadBuyerDocument\(target\.uploadSpec, file\)/)
  assert.match(clientPortalSource, /selectedBuyerDocument \? \(/)
})

test('each buyer destination keeps an intent-first composition in both paths', () => {
  for (const label of ['Journey', 'Documents', 'Finance']) {
    assert.match(clientPortalSource, new RegExp(`BuyerMobilePageIntro\\s+eyebrow="${label}"`))
    assert.match(demoPortalSource, new RegExp(`BuyerMobilePageIntro\\s+eyebrow="${label}"`))
  }
  assert.match(demoPortalSource, /<BuyerMobilePriorityAction/)
})
