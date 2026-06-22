import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../src/modules/commercial/pages/CommercialLeadsPage.jsx', import.meta.url), 'utf8')

assert.match(source, /LEAD_MODAL_ROLE_SPECIFIC_KEYS/, 'lead modal should define role-specific switch guard keys')
assert.match(source, /hasMeaningfulRoleSpecificDraftValues/, 'lead modal should use a meaningful-value guard before warning on role switch')
assert.match(source, /mode === 'edit' \? \{\} : buildInitialDraft\(null, selectedBroker\)/, 'new lead role switch should compare against a clean baseline')

const landlordKeys = source.match(/landlord: \[([\s\S]*?)\],\n  tenant:/)?.[1] || ''
assert.ok(landlordKeys, 'landlord role-specific switch keys should be defined')
assert.doesNotMatch(landlordKeys, /fundingStatus/, 'landlord switch guard should not count buyer-only funding status as typed landlord data')
assert.doesNotMatch(landlordKeys, /propertyCategory/, 'landlord switch guard should not count default asset class as typed landlord data')

const tenantKeys = source.match(/tenant: \[([\s\S]*?)\],\n  seller:/)?.[1] || ''
assert.ok(tenantKeys, 'tenant role-specific switch keys should be defined')
assert.match(tenantKeys, /preferredArea/, 'tenant switch guard should still protect entered tenant requirement fields')

console.log('commercial lead type switch tests passed')
