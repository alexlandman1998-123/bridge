import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

const [app, navigation, landing, syndication, privateProperty] = await Promise.all([
  read('../src/App.jsx'),
  read('../src/pages/settings/settingsNavigation.js'),
  read('../src/pages/settings/SettingsLanding.jsx'),
  read('../src/pages/settings/SettingsSyndicationPage.jsx'),
  read('../src/pages/settings/SettingsPrivatePropertyPage.jsx'),
])

assert.match(navigation, /label: 'Third-party integrations'/)
assert.match(navigation, /to: '\/settings\/integrations'/)
assert.match(landing, /Portals, Meta \+ WhatsApp/)

assert.match(app, /path="integrations"[\s\S]*<SettingsSyndicationPage \/>/)
assert.match(app, /path="syndication" element=\{<Navigate to="\/settings\/integrations" replace \/>\}/)
assert.match(app, /path="syndication\/property24"/)
assert.match(app, /path="syndication\/private-property"/)
assert.match(app, /path="property24"[\s\S]*Navigate to="\/settings\/syndication\/property24"/)

assert.match(syndication, /lead-sources\/property24\.png/)
assert.match(syndication, /lead-sources\/private-property\.jpeg/)
assert.match(syndication, /Meta Lead Ads/)
assert.match(syndication, /WhatsApp/)
assert.match(syndication, /Managed by Arch9/)
assert.match(privateProperty, /Private Property settings saved\./)
assert.match(privateProperty, /Save Private Property/)

console.log('settings syndication navigation checks passed')
