import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const appSource = await fs.readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const listSource = await fs.readFile(new URL('../src/modules/commercial/pages/CommercialLeadsPage.jsx', import.meta.url), 'utf8')
const detailSource = await fs.readFile(new URL('../src/modules/commercial/pages/CommercialLeadDetailPage.jsx', import.meta.url), 'utf8')

assert.match(appSource, /CommercialLeadDetailPage/, 'commercial detail page should be lazy loaded')
assert.match(appSource, /path="leasing\/leads\/:leadId"/, 'leasing lead detail route should be registered')
assert.match(appSource, /path="sales\/leads\/:leadId"/, 'sales lead detail route should be registered')

assert.match(listSource, /useNavigate/, 'commercial lead list should navigate instead of opening the drawer by default')
assert.match(listSource, /\/commercial\/leasing\/leads/, 'leasing list rows should route to the leasing detail workspace')
assert.match(listSource, /\/commercial\/sales\/leads/, 'sales list rows should route to the sales detail workspace')
assert.doesNotMatch(listSource, /function openDrawer\(lead\) \{\s*setDrawerLead/s, 'default row open action should not open the legacy drawer')

for (const fallback of ['Asset class pending', 'Contact pending', 'Area pending', 'No broker assigned', 'Source pending', 'No activity yet.']) {
  assert.match(detailSource, new RegExp(fallback.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `detail page should render fallback: ${fallback}`)
}

for (const tab of ['Overview', 'Profile', 'Property', 'Requirement', 'Appointments', 'Documents', 'Activity', 'Conversion History']) {
  assert.match(detailSource, new RegExp(tab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `detail tabs should include ${tab}`)
}

assert.match(detailSource, /detailTab/, 'detail tabs should be URL-addressable without clobbering list tab params')
assert.match(detailSource, /Lead Captured/, 'generic journey should include Lead Captured')
assert.match(detailSource, /Onboarding Sent/, 'generic journey should include Onboarding Sent')
assert.match(detailSource, /Converted/, 'generic journey should include Converted')

console.log('commercial lead detail foundation tests passed')
