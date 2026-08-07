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
assertIncludes('Choose whether the FICA seller is a natural person or juristic person before uploading the signed FICA form.', 'FICA upload blocker must explain the missing seller type.')
assertIncludes('Choose natural person or juristic person for the FICA seller type.', 'Seller type selection must reject invalid values.')
assertIncludes('kingstons-fica-seller-type-status', 'Overview tab must display FICA seller type status.')
assertIncludes('kingstons-documents-fica-seller-type-status', 'Documents tab must display FICA seller type status.')
assertIncludes('FICA seller type: {selectedKingstonsSellerPackSummary.sellerTypeLabel}', 'Seller Pack UI must show the selected FICA seller type label.')
assertIncludes('Required before signed FICA upload and listing creation.', 'FICA card must explain when seller type is required.')
assertIncludes('Complete the Kingston Seller Pack before creating the listing. Still needed: ${selectedKingstonsSellerPackSummary.missingLabels.join(\', \')}.', 'Listing creation must name missing Seller Pack or seller type requirements.')

console.log('Kingstons seller type capture phase 3 guard passed.')
