import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../src/modules/commercial/pages/CommercialLeadsPage.jsx', import.meta.url), 'utf8')

assert.match(source, /LEAD_MODAL_ROLE_SPECIFIC_KEYS/, 'lead modal should define role-specific switch guard keys')
assert.match(source, /hasMeaningfulRoleSpecificDraftValues/, 'lead modal should use a meaningful-value guard before warning on role switch')
assert.match(source, /mode === 'edit' \? \{\} : buildInitialDraft\(null, selectedBroker\)/, 'new lead role switch should compare against a clean baseline')
assert.match(source, /createPortal\(/, 'lead row actions menu should render through a portal')
assert.match(source, /document\.body/, 'lead row actions portal should mount on document.body')
assert.match(source, /className="fixed z-\[80\] w-56/, 'lead row actions menu should use fixed viewport positioning')
assert.doesNotMatch(source, /absolute right-0 top-11 z-20 w-56/, 'lead row actions menu should not be clipped by table overflow')
assert.match(source, /\['Lead', 'Type', 'Category \/ Requirement', 'Area', 'Budget \/ Rental', 'Broker', 'Status', 'Actions'\]/, 'leasing leads table should use the simplified eight-column header')
assert.match(source, /colSpan=\{8\}/, 'leasing leads table empty and loading states should span the simplified table')
assert.doesNotMatch(source, /lead\.initials/, 'leasing leads rows and cards should not render lead initials avatars')
assert.doesNotMatch(source, /getLeadStageSecondary/, 'leasing leads status cells should not render duplicated stage subtext')
assert.doesNotMatch(source, /Status \/ Stage/, 'leasing leads table header should label the column as Status only')
assert.doesNotMatch(source, /Client \/ Company/, 'leasing leads table should not render the duplicate Client / Company column')

const landlordKeys = source.match(/landlord: \[([\s\S]*?)\],\n  tenant:/)?.[1] || ''
assert.ok(landlordKeys, 'landlord role-specific switch keys should be defined')
assert.doesNotMatch(landlordKeys, /fundingStatus/, 'landlord switch guard should not count buyer-only funding status as typed landlord data')
assert.doesNotMatch(landlordKeys, /propertyCategory/, 'landlord switch guard should not count default asset class as typed landlord data')

const tenantKeys = source.match(/tenant: \[([\s\S]*?)\],\n  seller:/)?.[1] || ''
assert.ok(tenantKeys, 'tenant role-specific switch keys should be defined')
assert.match(tenantKeys, /preferredArea/, 'tenant switch guard should still protect entered tenant requirement fields')

console.log('commercial lead type switch tests passed')
