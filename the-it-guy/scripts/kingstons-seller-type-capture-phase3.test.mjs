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
assertIncludes('function resolveKingstonsFicaDeclarationPhysicalUploadContext', 'Physical FICA declaration uploads must resolve structured seller context.')
assertIncludes('hasKingstonsSellerPackDetailsCompletionSignal(pack)', 'Physical FICA declaration context must require saved seller-pack details.')
assertIncludes('normalizeSellerBasePackKey(key) === SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION', 'Signed FICA declaration upload must be blocked until seller type is selected.')
assertIncludes('SELLER_BASE_PACK_COMPLETION_ROUTES.PHYSICAL_UPLOAD_WITH_CONTEXT', 'Signed FICA declaration upload must use the contextual physical-upload completion route.')
assertIncludes('physicalUploadContextRequired: isFicaDeclarationUpload', 'Signed FICA declaration uploads must mark that physical-upload context was required.')
assertIncludes('ficaDeclarationContext: ficaDeclarationUploadContext?.context || null', 'Signed FICA declaration uploads must persist the resolved seller context.')
assertIncludes('uploadContext: uploadedDocument.uploadContext', 'Listing document links must carry the FICA upload context downstream.')
assertIncludes('sellerPackDetailsCaptured ? getKingstonsSellerPackCaptureSummaryLabel(selectedKingstonsSellerPack) :', 'FICA upload UI must distinguish saved seller-pack context from seller type only.')
assertIncludes('Capture the seller details before uploading FICA or authority documents.', 'FICA upload blocker must explain the missing seller details.')
assertIncludes('openKingstonsSellerPackWizard', 'Seller Pack cards must open the wizard flow.')
assertIncludes('Capture seller pack details', 'Wizard must expose the details step title.')
assertIncludes('KINGSTONS_FICA_NATURAL_SETUP_OPTIONS', 'Wizard must define the natural-person setup choices.')
assertIncludes('KINGSTONS_FICA_JURISTIC_ENTITY_OPTIONS', 'Wizard must define the juristic entity choices.')
assertIncludes('function normalizeKingstonsSellerPackOwnerDraft', 'Natural person owner capture must normalize structured owner rows.')
assertIncludes('function buildKingstonsSellerPackOwnerRecords', 'Natural person owner capture must save structured owner records.')
assertIncludes('sellerPackProfile', 'Natural person owner capture must reload from the saved Seller Pack profile.')
assertIncludes('Registered owners', 'Wizard must show a structured registered owners section.')
assertIncludes('First name', 'Wizard must capture owner first names.')
assertIncludes('Surname', 'Wizard must capture owner surnames.')
assertIncludes('Add owner', 'Wizard must allow multiple registered owners.')
assertIncludes('Complete first name, surname and email for owner', 'Wizard validation must require complete owner contact details.')
assertIncludes('FICA declaration pack signed by the correct seller type.', 'FICA card must explain the declaration capture step.')
assertIncludes('Capture details', 'FICA upload button must point to the new capture step when details are missing.')
assertIncludes('Complete the Kingston Seller Pack before creating the listing. Still needed: ${selectedKingstonsSellerPackSummary.missingLabels.join(\', \')}.', 'Listing creation must name missing Seller Pack or seller type requirements.')

console.log('Kingstons seller type capture phase 3 guard passed.')
