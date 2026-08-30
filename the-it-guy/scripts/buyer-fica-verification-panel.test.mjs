import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const component = await readFile(new URL('../src/components/compliance/SellerFicaVerification.jsx', import.meta.url), 'utf8')
const buyerProfile = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

assert.match(component, /data-testid="buyer-fica-verification"/)
assert.match(component, /What is checked\?/) 
assert.match(component, /Additional information required/)
assert.match(component, /Ready for FICA verification/)
assert.match(component, /Verification in progress/)
assert.match(component, /FICA verification complete/)
assert.match(component, /Review required/)
assert.match(component, /Verification unsuccessful/)
assert.match(component, /Not run/)
assert.match(component, /Verify with \{resolvedProviderLabel\}/)
assert.match(component, /getComplianceProvider\(providerKey\)/)
assert.match(component, /startClientComplianceVerification\(\{ organisationId, clientContactId, entityType, subject, providerKey, rerun \}\)/)
assert.match(component, /buyerState\.key === 'unavailable'/)
assert.match(component, /Buyer CDD may include/)
assert.match(buyerProfile, /<BuyerFicaVerification/)
assert.match(buyerProfile, /missingFields=\{selectedLeadBuyerFicaVerificationModel\.missingFields\}/)
assert.match(buyerProfile, /onAuditActivity=/)

console.log('buyer FICA verification panel checks passed')
