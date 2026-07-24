import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const sidebarSource = await fs.readFile(new URL('../src/components/Sidebar.jsx', import.meta.url), 'utf8')

assert.match(
  sidebarSource,
  /const logoLoadFailed = currentLogoLoadStatus === 'failed'/,
  'Sidebar should track failed organisation logo loads.',
)
assert.match(
  sidebarSource,
  /const showOrganisationBranding = Boolean\(branding\.logoUrl\) && !logoLoadFailed/,
  'Sidebar should stop rendering the organisation logo after an image load failure.',
)
assert.match(
  sidebarSource,
  /const showBrandPlaceholder = organisationLoading && !logoLoadFailed/,
  'Failed organisation logos must not leave the loading placeholder hanging.',
)
assert.doesNotMatch(
  sidebarSource,
  /Boolean\(branding\.logoUrl\) && logoLoadFailed/,
  'Failed organisation logos should fall through to the text fallback instead of the loading placeholder.',
)
assert.match(
  sidebarSource,
  /window\.setTimeout\(\(\) => \{\s*setLogoLoadState\(\(previous\) => \{\s*if \(previous\.url === logoUrl && \['loaded', 'failed'\]\.includes\(previous\.status\)\) return previous\s*return \{ url: logoUrl, status: 'failed' \}/s,
  'Logo requests that never complete should time out to the fallback state.',
)

console.log('sidebar logo fallback tests passed')
