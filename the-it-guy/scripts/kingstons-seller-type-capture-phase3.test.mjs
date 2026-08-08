import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const repoRoot = process.cwd()
const agencyPagePath = path.join(repoRoot, 'src/pages/agency/AgencyPipelinePage.jsx')
const source = fs.readFileSync(agencyPagePath, 'utf8')

function assertIncludes(snippet, message) {
  assert.ok(source.includes(snippet), message)
}

assertIncludes('const KINGSTONS_FICA_SELLER_TYPE_OPTIONS = Object.freeze', 'Kingstons must define explicit FICA seller type options.')
assertIncludes("{ value: 'natural', label: 'Natural person' }", 'Natural person must be a first-class FICA seller type.')
assertIncludes("{ value: 'juristic', label: 'Juristic person' }", 'Juristic person must be a first-class FICA seller type.')
assertIncludes('function isValidKingstonsFicaSellerType', 'Seller type capture must validate allowed options.')
assertIncludes('function getKingstonsFicaSellerTypeLabel', 'Seller type capture must expose a human-readable label.')
assertIncludes('sellerTypeCaptured', 'Seller Pack summary must track whether FICA seller type is captured.')
assertIncludes("complete: documentsComplete && sellerTypeCaptured", 'Seller Pack completion must require documents plus FICA seller type.')
assertIncludes("...(sellerTypeCaptured ? [] : ['FICA seller type'])", 'Missing Seller Pack labels must include FICA seller type when it is absent.')
assertIncludes("key === 'signed_fica_form' && !isValidKingstonsFicaSellerType(selectedKingstonsSellerPack.sellerType)", 'Signed FICA upload must be blocked until seller type is selected.')
assertIncludes('Capture the seller details before uploading the signed FICA form.', 'FICA upload blocker must explain the missing seller details.')
assertIncludes('openKingstonsSellerPackWizard', 'Seller Pack cards must open the wizard flow.')
assertIncludes('Capture seller pack details', 'Wizard must expose the details step title.')
assertIncludes('KINGSTONS_FICA_NATURAL_SETUP_OPTIONS', 'Wizard must define the natural-person setup choices.')
assertIncludes('KINGSTONS_FICA_JURISTIC_ENTITY_OPTIONS', 'Wizard must define the juristic entity choices.')
assertIncludes('Capture the seller type, marital setup, and any company or trust authority details before uploading the signed FICA form.', 'FICA card must explain the details capture step.')
assertIncludes('Capture details first', 'FICA upload button must point to the new capture step when details are missing.')
assertIncludes('Complete the Kingston Seller Pack before creating the listing. Still needed: ${selectedKingstonsSellerPackSummary.missingLabels.join(\', \')}.', 'Listing creation must name missing Seller Pack or seller type requirements.')

console.log('Kingstons seller type capture phase 3 guard passed.')
