import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createPrivatePropertySandboxFixture, createPrivatePropertyArch9ListingPreview } from '../server/services/privatePropertyListingPreviewService.js'
import { createPrivatePropertyListingPlan } from '../server/services/privatePropertyListingMapper.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const scriptPath = path.join(appRoot, 'scripts', 'private-property-run-rental-follow-up.mjs')
const source = fs.readFileSync(scriptPath, 'utf8')
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch9-private-property-rental-follow-up-'))
const baselinePath = path.join(outputDir, 'baseline.json')
const output = path.join(outputDir, 'rental-follow-up.json')

assert.match(source, /rental-residential-per-week-hide-address/)
assert.match(source, /rental-commercial-add-agent-images/)
assert.match(source, /rental-commercial-to-residential/)
assert.match(source, /apply_requires_exactly_one_rental_action/)
assert.match(source, /private-property-controlled-publish-rehearsal\.mjs/)
assert.match(source, /retryAttempted: false/)

const fixture = createPrivatePropertySandboxFixture('rental-commercial-m2')
const weeklyFixture = createPrivatePropertySandboxFixture('rental-residential')
const weeklyPlan = createPrivatePropertyListingPlan({
  ...weeklyFixture,
  agentMapping: { agentIds: 'ARCH9-SANDBOX-USER-1' },
  options: {
    ...weeklyFixture.options,
    propertyId: 'PP-SANDBOX-RENTAL-RES-001',
    branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F',
    suburbId: '140',
    listingType: 'Rental',
    rentalPriceType: 'PerWeek',
    hideStreetName: 'true',
    hideStreetNo: 'true',
    hideComplexName: 'true',
    hideUnitNo: 'true',
  },
})
assert.equal(weeklyPlan.canPreview, true)
assert.match(weeklyPlan.listingXml, /<RentalPriceType>PerWeek<\/RentalPriceType>/)
assert.match(weeklyPlan.listingXml, /<HideStreetName>true<\/HideStreetName>/)
assert.match(weeklyPlan.listingXml, /<HideStreetNo>true<\/HideStreetNo>/)
assert.match(weeklyPlan.listingXml, /<HideComplexName>true<\/HideComplexName>/)
assert.match(weeklyPlan.listingXml, /<HideUnitNumber>true<\/HideUnitNumber>/)

const preview = createPrivatePropertyArch9ListingPreview({
  ...fixture,
  agentMapping: { agentIds: 'ARCH9-SANDBOX-USER-1,ARCH9-SANDBOX-USER-2' },
  options: {
    ...fixture.options,
    propertyId: 'PP-SANDBOX-RENTAL-COM-M2-001',
    branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F',
    suburbId: '140',
    additionalPhotoUrls: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1600&q=80',
  },
})
assert.equal(preview.canPreview, true)
assert.match(preview.listingXml, /<AgentId>ARCH9-SANDBOX-USER-1,ARCH9-SANDBOX-USER-2<\/AgentId>/)
assert.match(preview.listingXml, /photo-1493809842364-78817add7ffb/)

const residentialPreview = createPrivatePropertyArch9ListingPreview({
  ...fixture,
  agentMapping: { agentIds: 'ARCH9-SANDBOX-USER-1' },
  options: {
    ...fixture.options,
    category: 'Residential',
    propertyType: 'Apartment',
    bedrooms: '2',
    bathrooms: '1',
    propertyId: 'PP-SANDBOX-RENTAL-COM-DAY-001',
    branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F',
    suburbId: '140',
  },
})
assert.equal(residentialPreview.canPreview, true)
assert.match(residentialPreview.listingXml, /<Category><Category>Residential<\/Category><\/Category>/)
assert.match(residentialPreview.listingXml, /<AttributeType>Bedrooms<\/AttributeType><Value>2<\/Value>/)
assert.match(residentialPreview.listingXml, /<AttributeType>HomeType<\/AttributeType><Value>Apartment<\/Value>/)

fs.writeFileSync(baselinePath, `${JSON.stringify({
  phase: 'private-property-sandbox-phase1-baseline',
  status: 'CAPTURED',
  baseline: {
    listings: [
      { propertyId: 'PP-SANDBOX-RENTAL-RES-001', captureStatus: 'CAPTURED', privatePropertyReference: 'rr2755973' },
      { propertyId: 'PP-SANDBOX-RENTAL-COM-M2-001', captureStatus: 'CAPTURED', privatePropertyReference: 'rr2755974' },
      { propertyId: 'PP-SANDBOX-RENTAL-COM-DAY-001', captureStatus: 'CAPTURED', privatePropertyReference: 'rr2755975' },
    ],
  },
}, null, 2)}\n`)
const result = spawnSync(process.execPath, [scriptPath, '--action=all', `--baseline=${baselinePath}`, `--output=${output}`], {
  cwd: appRoot,
  encoding: 'utf8',
})
assert.equal(result.status, 0, result.stderr)
const report = JSON.parse(fs.readFileSync(output, 'utf8'))
assert.equal(report.status, 'DRY_RUN')
assert.equal(report.baseline.ready, true)
assert.equal(report.actions.length, 3)
assert.equal(report.safety.privatePropertyApiCalled, false)
assert.equal(report.safety.listingOrAgentChanged, false)

fs.rmSync(outputDir, { recursive: true, force: true })
console.log('Private Property rental follow-up contract passed')
