import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getSellerLeadProfileEditChanges } from '../src/lib/sellerLeadManualCaptureModel.js'
import { buildListingSellerInformationModel } from '../src/services/listings/listingSellerInformationModel.js'

const wrapper = await readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
const source = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
assert.ok(wrapper.includes('<AgencyPipelinePage initialViewMode="leads" sellerProcessPanelModel={sellerProcessPanelModel}'), 'The lead route must delegate to the current pipeline workspace.')
const start = source.indexOf('const selectedSellerProfileWorkspace = useMemo')
const end = source.indexOf('const activeSellerProfileRoleplayer =', start)
assert.ok(start >= 0 && end > start, 'The current seller workspace must exist.')
const workspace = source.slice(start, end)
assert.ok(workspace.includes('buildListingSellerInformationModel('), 'Lead and listing profiles must use the same field model.')
assert.ok(source.includes('selectedSellerProfileWorkspace.profileModel.groups.map'), 'Lead cards must render the shared profile groups.')
assert.ok(source.includes('selectedSellerProfileCards.map'), 'The current lead profile must render its cards.')
assert.ok(source.includes('const listingSnapshot = baseline.listing'), 'Saving must use the editor baseline rather than a background refresh.')
assert.ok(source.includes("source: 'seller_lead_profile_editor'"), 'The lead editor must use the guarded canonical save.')

const form = { ownerStructureType: 'individual', sellerFirstName: 'Sam', sellerSurname: 'Seller', residentialAddress: '1 Home Road', phone: 'old-phone' }
const model = buildListingSellerInformationModel({ sellerOnboarding: { formData: form } })
assert.equal(model.draft.sellerFirstName, 'Sam')
assert.equal(model.draft.residentialAddress, '1 Home Road')
assert.deepEqual(getSellerLeadProfileEditChanges(form, { ...form, phone: '' }), ['phone'], 'An explicit blank must remain a change to save.')
assert.deepEqual(getSellerLeadProfileEditChanges({ parking: '2', askingPrice: '10' }, { parking: '0', askingPrice: '' }), ['parking', 'askingPrice'], 'Zero and blank property values must remain changes.')
assert.deepEqual(getSellerLeadProfileEditChanges(form, { ...form }), [], 'An unchanged form must not issue a save.')
console.log('Agent leads current seller profile workspace regression checks passed.')
