import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createProperty24MigrationDryRun,
  parseProperty24ContactAgentIds,
  resolveProperty24ListingSourceReference,
} from '../server/property24/migrationImportService.js'
import {
  parseProperty24MigrationDryRunArgs,
  runProperty24MigrationDryRun,
} from './property24-migration-import-dry-run.mjs'

const agentsCsv = `AgencyId,AgentId,Firstname,Lastname,Status,SourceReference,CountryId,MobileNumber,EmailAddress,Property24ProfilePictureURL,Published
31382,77969,Jon,Snow,Active,ARCH9-VET-JON-SNOW,1,0600001123,jon@example.com,https://images.example.com/jon.jpg,1
31382,77970,Pauly,Shore,Active,ARCH9-VET-PAULY-SHORE,1,0600000002,pauly@example.com,,1
`

const listingsCsv = `AgencyId,ContactAgentIds,ListingNumber,ListingType,Status,Price,ListingVisibility,ExpiryDate,Description,DescriptionHeader,SuburbId,SourceReference,FloorArea,FloorAreaAreaUnit,PropertyTypeId,Bedrooms,Bathrooms
31382,77969,100314819,Rental,Active,22000,Public,2026-11-30 00:00:00.000,"Line one,
line two",Newlands apartment,8679,ARCH9-VET-PHASE2-RENT-NEWLANDS,82,SquareMetres,5,2,2
31382,77970,100314820,Sale,Active,4950000,Public,2026-11-30 00:00:00.000,Sandton family home,Sandton house,5864,ARCH9-VET-PHASE2-SALE-SANDTON,220,SquareMetres,4,4,3
`

const imagesCsv = `ListingNumber,Caption,Ordinal,Prop24ImageUrl
100314819,Exterior,1,https://images.example.com/rental-1.jpg
100314819,Interior,2,https://images.example.com/rental-2.jpg
100314820,Exterior,1,https://images.example.com/sale-1.jpg
`

assert.deepEqual(parseProperty24ContactAgentIds('77969, 77970'), { valid: true, ids: [77969, 77970] })
assert.deepEqual(parseProperty24ContactAgentIds('[77969;77970]'), { valid: true, ids: [77969, 77970] })
assert.equal(parseProperty24ContactAgentIds('not-an-id').valid, false)
assert.equal(resolveProperty24ListingSourceReference({ agencyId: 40067, listingNumber: 116560913, sourceReference: '' }), 'P24-40067-116560913')
assert.equal(resolveProperty24ListingSourceReference({ agencyId: 40067, listingNumber: 116560913, sourceReference: 'ARCH9-EXISTING' }), 'ARCH9-EXISTING')
assert.throws(() => parseProperty24MigrationDryRunArgs(['--apply']), /dry-run-only/)
assert.throws(() => parseProperty24MigrationDryRunArgs([]), /--agents/)

const generatedAt = '2026-08-31T10:00:00.000Z'
const ready = createProperty24MigrationDryRun({
  agents: { path: 'agents.csv', text: agentsCsv },
  listings: { path: 'listings.csv', text: listingsCsv },
  images: { path: 'images.csv', text: imagesCsv },
  expectedAgencyId: 31382,
  generatedAt,
})
assert.equal(ready.status, 'READY')
assert.equal(ready.generatedAt, generatedAt)
assert.equal(ready.summary.agentCount, 2)
assert.equal(ready.summary.agentProfilePictureCount, 1)
assert.equal(ready.summary.listingCount, 2)
assert.equal(ready.summary.saleListingCount, 1)
assert.equal(ready.summary.rentalListingCount, 1)
assert.equal(ready.summary.imageCount, 3)
assert.equal(ready.summary.matchedListingAgentLinkCount, 2)
assert.equal(ready.inputs.listings.rowCount, 2, 'Quoted multiline descriptions must remain one CSV record.')
assert.equal(ready.relationships.imageCounts['100314819'], 2)
assert.equal(ready.safety.property24WritesPerformed, false)
assert.equal(ready.safety.databaseWritesPerformed, false)
assert.equal(ready.safety.imageDownloadsPerformed, false)
assert.equal(ready.issues.length, 0)

const blankListingReferences = createProperty24MigrationDryRun({
  agents: { text: agentsCsv },
  listings: { text: listingsCsv.replace(/,ARCH9-VET-PHASE2-(?:RENT-NEWLANDS|SALE-SANDTON),/g, ',,') },
  images: { text: imagesCsv },
  expectedAgencyId: 31382,
})
assert.equal(blankListingReferences.status, 'READY')
assert.deepEqual(
  blankListingReferences.inventory.listings.map((record) => record.sourceReference),
  ['P24-31382-100314819', 'P24-31382-100314820'],
)

const warning = createProperty24MigrationDryRun({
  agents: { text: agentsCsv },
  listings: { text: listingsCsv },
  images: { text: imagesCsv.replace('100314820,Exterior,1,https://images.example.com/sale-1.jpg\n', '') },
  expectedAgencyId: 31382,
})
assert.equal(warning.status, 'READY_WITH_WARNINGS')
assert.ok(warning.issues.some((issue) => issue.code === 'listing_without_images'))

const blocked = createProperty24MigrationDryRun({
  agents: { text: agentsCsv.replace('31382,77970', '31383,77969') },
  listings: { text: listingsCsv.replace('31382,77970,100314820', '31382,99999,100314819') },
  images: { text: `${imagesCsv}999999999,Orphan,1,not-a-url\n100314819,Duplicate,1,https://images.example.com/rental-1.jpg\n` },
  expectedAgencyId: 31382,
})
assert.equal(blocked.status, 'BLOCKED')
for (const code of [
  'duplicate_agent_id',
  'agency_id_mismatch_between_files',
  'unexpected_agency_id',
  'duplicate_listing_number',
  'listing_agent_not_found',
  'orphan_image',
  'invalid_image_url',
  'duplicate_image_ordinal',
  'duplicate_listing_image_url',
]) {
  assert.ok(blocked.issues.some((issue) => issue.code === code), `Expected ${code}`)
}

const malformed = createProperty24MigrationDryRun({
  agents: { text: `${agentsCsv}"unclosed` },
  listings: { text: listingsCsv },
  images: { text: imagesCsv },
})
assert.equal(malformed.status, 'BLOCKED')
assert.ok(malformed.issues.some((issue) => issue.code === 'unclosed_quoted_field'))

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'property24-migration-dry-run-'))
try {
  const agentsPath = path.join(temporaryDirectory, 'agents.csv')
  const listingsPath = path.join(temporaryDirectory, 'listings.csv')
  const imagesPath = path.join(temporaryDirectory, 'images.csv')
  const outputPath = path.join(temporaryDirectory, 'report.json')
  fs.writeFileSync(agentsPath, agentsCsv)
  fs.writeFileSync(listingsPath, listingsCsv)
  fs.writeFileSync(imagesPath, imagesCsv)
  const previousExitCode = process.exitCode
  process.exitCode = undefined
  const cli = await runProperty24MigrationDryRun([
    `--agents=${agentsPath}`,
    `--listings=${listingsPath}`,
    `--images=${imagesPath}`,
    '--agency-id=31382',
    `--output=${outputPath}`,
  ])
  assert.equal(cli.report.status, 'READY')
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).mode, 'dry-run')
  assert.equal(process.exitCode, undefined)
  process.exitCode = previousExitCode
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true })
}

const appPackage = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(appPackage.scripts['property24:migration-import-dry-run'], 'node scripts/property24-migration-import-dry-run.mjs')
assert.equal(appPackage.scripts['test:property24-migration-import-dry-run'], 'node scripts/property24-migration-import-dry-run.test.mjs')

console.log('Property24 migration import dry-run tests passed')
