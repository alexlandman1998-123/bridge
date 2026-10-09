import { transformSync } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getComplianceProvider, isMockComplianceRun } from '../src/services/complianceProviderRegistry.js'

const page = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const component = await readFile(new URL('../src/components/compliance/SellerFicaVerification.jsx', import.meta.url), 'utf8')
const service = await readFile(new URL('../src/services/clientComplianceService.js', import.meta.url), 'utf8')
const migration = await readFile(new URL('../../supabase/migrations/202608290002_client_compliance_verification.sql', import.meta.url), 'utf8')

assert.match(page, /<SellerFicaVerification/, 'Seller Profile should mount the FICA verification experience.')
assert.match(page, /ficaScope\.subjects\.length > 1/, 'The extra scope panel should appear only when multiple parties need assessment.')
assert.doesNotMatch(page, /FICA collection scope/, 'The profile should not repeat the missing-information panel.')
assert.match(page, /selectedSellerProfileDefectRows\.length \? \(/, 'The defects card should depend on captured defects, not general lead notes.')
assert.match(page, /getSellerProfileNarrativeNotes\(onboarding\?\.agentNotes, onboarding\?\.agent_notes, lead\?\.notes\)/)
assert.doesNotMatch(page.slice(page.indexOf('async function handleSaveSellerLeadEditDetails'), page.indexOf('async function handleMovePipelineCard')), /notes: formData\.agentNotes/, 'Saving seller notes must not overwrite lead provenance notes.')
assert.doesNotMatch(page.slice(page.indexOf("key: 'tax'"), page.indexOf("key: 'ownership'")), /FICA Status/, 'Tax & Compliance must not expose an editable FICA status row.')
assert.match(component, /Additional information required/)
assert.match(component, /Verification in progress/)
assert.match(component, /FICA verification completed/)
assert.match(component, /Review required/)
assert.match(component, /Verification could not be completed/)
assert.match(component, /Re-run Verification/)
assert.doesNotMatch(component, /Verify with TPN Report/)
assert.match(component, /sellerProviderUnavailable/)
assert.match(component, /ignoredMockSellerRun/)
assert.match(service, /partyType === 'seller' && provider\.key === 'mock'/)
assert.doesNotMatch(component, /FICA verification storage is being activated/)
assert.match(service, /recordComplianceAuditEvent/)
assert.match(service, /COMPLIANCE_STORAGE_TABLES/)
assert.match(service, /complianceStorageUnavailable/)
assert.match(service, /clearComplianceStorageAvailabilityCache/)
assert.match(migration, /client_contact_id uuid not null references public\.contacts/)
assert.match(migration, /compliance_verification_checks/)

const result = await getComplianceProvider('mock').startVerification({ subject: { clientContactId: 'client-1' } })
assert.equal(result.status, 'verified')
assert.equal(result.riskRating, 'low')
assert.deepEqual(result.checks.map((check) => check.type), ['identity', 'address', 'sanctions', 'pep', 'risk'])
assert.equal(isMockComplianceRun(result), true)
assert.equal(isMockComplianceRun({ provider: 'configured provider', providerReference: result.providerReference, reportReference: result.reportReference }), true)
assert.equal(isMockComplianceRun({ provider: 'Knowledge Factory', providerReference: 'KF-123' }), false)

console.log('seller profile FICA verification contract passed')


// Render the actual panel markup with fixtures, without loading live data.
const panelMarker = page.indexOf('data-testid="seller-fica-scope"')
const panelStart = page.lastIndexOf('<section', panelMarker)
const panelEnd = page.indexOf('</section>', panelMarker) + '</section>'.length
assert.ok(panelStart >= 0 && panelEnd > panelStart)
const panelCode = transformSync(`function ScopePanel({ scope }) {
  const selectedSellerProfileWorkspace = { ficaScope: scope };
  const openSellerLeadEditModal = () => {};
  return (${page.slice(panelStart, panelEnd)});
}`, { loader: 'jsx', jsxFactory: 'React.createElement' }).code
const Button = ({ children }) => createElement('button', { type: 'button' }, children)
const ScopePanel = new Function('React', 'Button', `${panelCode}; return ScopePanel`)({ createElement }, Button)
const missingPanel = renderToStaticMarkup(createElement(ScopePanel, { scope: {
  subjects: [
    { type: 'entity', label: 'Example Company', roles: ['Company'], complete: true, missing: [] },
    { type: 'person', label: 'Captured Director', roles: ['Director', 'Authorised representative'], complete: false, missing: ['ID or passport number', 'residential address', 'nationality / jurisdiction'] },
  ],
  missing: ['Captured Director: ID or passport number', 'Captured Director: residential address', 'Captured Director: nationality / jurisdiction', 'Beneficial ownership / control declaration'],
} }))
for (const field of ['ID or passport number', 'residential address', 'nationality / jurisdiction', 'Beneficial ownership / control declaration']) assert.ok(missingPanel.includes(field))
assert.ok(missingPanel.includes('Review information'))
assert.ok(!missingPanel.includes('3 missing'), 'A missing count cannot replace the actual missing fields.')
assert.equal((missingPanel.match(/Captured Director/g) || []).length, 1, 'One identified person has one row listing their roles.')
assert.ok(missingPanel.includes('Verification results are shown above.') && !missingPanel.includes('verified'), 'Captured facts must not imply completed verification.')
console.log('seller FICA scope missing-field rendering regression: ok')
