import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createProperty24MigrationMappingPlan,
  mapProperty24ListingStatus,
} from '../server/property24/migrationMappingService.js'
import {
  parseProperty24MigrationMappingArgs,
  runProperty24MigrationMapping,
} from './property24-migration-data-map.mjs'

const organisationId = '11111111-1111-4111-8111-111111111111'
const jonUserId = '22222222-2222-4222-8222-222222222222'
const paulyUserId = '33333333-3333-4333-8333-333333333333'

const agentsCsv = `AgencyId,AgentId,Firstname,Lastname,Status,SourceReference,CountryId,MobileNumber,EmailAddress,Qualification,About,Property24ProfilePictureURL,Published,ReceiveStatsMail,ReceiveGroupListingEmail
31382,77969,Jon,Snow,Active,ARCH9-VET-JON-SNOW,1,0600001123,jon@example.com,NQF4,Sale agent,https://images.example.com/jon.jpg,1,1,0
31382,77970,Pauly,Shore,Active,ARCH9-VET-PAULY-SHORE,1,0600000002,pauly@example.com,NQF4,Rental agent,https://images.example.com/pauly.jpg,1,0,1
`

const listingsCsv = `AgencyId,ContactAgentIds,ListingNumber,ListingType,Status,Price,ListingVisibility,OccupationDate,ExpiryDate,Description,DescriptionHeader,SuburbId,StreetNumber,StreetName,SourceReference,Longitude,Latitude,ErfSize,ErfAreaUnit,FloorArea,FloorAreaAreaUnit,PropertyTypeId,Bedrooms,Bathrooms,Garages,NumberOfParkingSpaces,MunicipalRatesAndTaxes,MonthlyLevy,Garden,Pool,Flatlet,PetsAllowed,Furnished,DepositRequirementsComments,LeasePeriod,RentalRate
31382,77969,100314819,Rental,Active,22000,Public,2026-09-01,2027-08-31,"A two bedroom apartment.",Newlands apartment,8679,10,Main Road,ARCH9-VET-PHASE2-RENT-NEWLANDS,18.46,-33.97,0,SquareMetres,82,SquareMetres,5,2,2,1,1,1200,2500,1,1,0,Yes,No,"Deposit of R 44,000 required",12 months,Monthly
31382,77970,100314820,Sale,Active,4950000,Public,,2027-08-31,Sandton family home,Sandton house,5864,25,Rivonia Road,ARCH9-VET-PHASE2-SALE-SANDTON,28.06,-26.10,950,SquareMetres,220,SquareMetres,4,4,3,2,4,3200,0,1,1,1,Yes,No,,, 
`

const imagesCsv = `ListingNumber,Caption,Ordinal,Prop24ImageUrl
100314819,Interior,2,https://images.example.com/rental-2.jpg
100314819,Exterior,1,https://images.example.com/rental-1.jpg
100314820,Exterior,1,https://images.example.com/sale-1.jpg
`

const catalog = {
  suburbs: [
    { property24Id: 8679, name: 'Newlands', cityName: 'Cape Town', provinceName: 'Western Cape', countryName: 'South Africa' },
    { property24Id: 5864, name: 'Sandton', cityName: 'Johannesburg', provinceName: 'Gauteng', countryName: 'South Africa' },
  ],
  propertyTypes: [
    { property24Id: 4, name: 'House', arch9PropertyType: 'house', propertyCategory: 'residential' },
    { property24Id: 5, name: 'Apartment', arch9PropertyType: 'apartment', propertyCategory: 'residential' },
  ],
}

const arch9Agents = [
  {
    user_id: jonUserId,
    organisation_id: organisationId,
    first_name: 'Jon',
    last_name: 'Snow',
    email: 'jon@example.com',
    property24_source_reference: 'ARCH9-VET-JON-SNOW',
    status: 'active',
  },
  {
    user_id: paulyUserId,
    organisation_id: organisationId,
    first_name: 'Pauly',
    last_name: 'Shore',
    email: 'pauly@example.com',
    property24_source_reference: 'ARCH9-VET-PAULY-SHORE',
    status: 'active',
  },
]

assert.throws(() => parseProperty24MigrationMappingArgs(['--apply']), /does not support --apply/)
assert.throws(() => parseProperty24MigrationMappingArgs([]), /--agents/)

const generatedAt = '2026-08-31T12:00:00.000Z'
const ready = createProperty24MigrationMappingPlan({
  agents: { path: 'agents.csv', text: agentsCsv },
  listings: { path: 'listings.csv', text: listingsCsv },
  images: { path: 'images.csv', text: imagesCsv },
  expectedAgencyId: 31382,
  organisationId,
  environment: 'exdev',
  arch9Agents,
  catalog,
  generatedAt,
})

assert.equal(ready.status, 'READY')
assert.equal(ready.generatedAt, generatedAt)
assert.equal(ready.validation.status, 'READY')
assert.equal(ready.context.organisationId, organisationId)
assert.equal(ready.context.agencyId, 31382)
assert.deepEqual(ready.summary, {
  agentPlanCount: 2,
  mappedArch9AgentCount: 2,
  agentResolutionRequiredCount: 0,
  listingPlanCount: 2,
  saleListingCount: 1,
  rentalListingCount: 1,
  imageRelationshipCount: 3,
  propertyTypeResolvedCount: 2,
  suburbResolvedCount: 2,
  externalAgentRelationshipCount: 2,
  arch9AgentRelationshipCount: 2,
  resolutionRequiredCount: 0,
  errorCount: 0,
})
assert.equal(ready.safety.property24WritesPerformed, false)
assert.equal(ready.safety.databaseWritesPerformed, false)
assert.equal(ready.safety.imageDownloadsPerformed, false)
assert.equal(ready.agentPlans[0].arch9UserId, jonUserId)
assert.equal(ready.agentPlans[0].resolutionStatus, 'mapped')
assert.equal(ready.agentPlans[0].mappingRow.property24_agent_id, 77969)
assert.equal(ready.agentPlans[0].agentDraft.firstName, 'Jon')
assert.equal(ready.agentPlans[0].agentDraft.lastName, 'Snow')
assert.equal(ready.agentPlans[0].agentDraft.fullName, 'Jon Snow')
assert.equal(ready.agentPlans[0].mappingRow.first_name_snapshot, 'Jon')
assert.equal(ready.agentPlans[0].agentDraft.profilePictureSourceUrl, 'https://images.example.com/jon.jpg')

const rental = ready.listingPlans.find((plan) => plan.listingNumber === 100314819)
assert.ok(rental)
assert.equal(rental.privateListing.organisationId, organisationId)
assert.equal(rental.privateListing.assignedAgentId, jonUserId)
assert.equal(rental.privateListing.listingCategory, 'rental')
assert.equal(rental.privateListing.propertyType, 'apartment')
assert.equal(rental.privateListing.propertyCategory, 'residential')
assert.equal(rental.privateListing.suburb, 'Newlands')
assert.equal(rental.privateListing.city, 'Cape Town')
assert.equal(rental.privateListing.listingStatus, 'active')
assert.equal(rental.privateListing.listingVisibility, 'active_market')
assert.equal(rental.privateListing.listingSource, 'imported_stock')
assert.equal(rental.privateListing.mandateStatus, 'signed_external_pending_upload')
assert.match(rental.privateListing.internalListingNotes, /^BRIDGE_QUICK_ADD_METADATA: /)
assert.equal(rental.privateListing.sellerCanonicalFacts.rentalInfo.monthlyRent, 22000)
assert.equal(rental.privateListing.sellerCanonicalFacts.rentalInfo.depositAmount, 44000)
assert.equal(rental.privateListing.sellerCanonicalFacts.rentalInfo.leasePeriodMonths, 12)
assert.equal(rental.publicationData.listingType, 'Rental')
assert.equal(rental.publicationData.floorSize, 82)
assert.equal(rental.publicationData.status, 'Published')
assert.deepEqual(rental.mediaPlan.images.map((image) => [image.sourceOrdinal, image.sortOrder, image.isCover]), [
  [1, 0, true],
  [2, 1, false],
])
assert.equal(rental.property24Sync.listing_number, 100314819)
assert.equal(rental.property24Sync.external_status, 'on_portal')
assert.equal(rental.agentRelationships[0].arch9UserId, jonUserId)

const sale = ready.listingPlans.find((plan) => plan.listingNumber === 100314820)
assert.ok(sale)
assert.equal(sale.privateListing.assignedAgentId, paulyUserId)
assert.equal(sale.privateListing.listingCategory, 'private_sale')
assert.equal(sale.privateListing.propertyType, 'house')
assert.equal(sale.privateListing.suburb, 'Sandton')
assert.equal(sale.privateListing.sellerCanonicalFacts.rentalInfo, undefined)
assert.equal(sale.publicationData.listingType, 'Sale')

const derivedListingReference = createProperty24MigrationMappingPlan({
  agents: { text: agentsCsv },
  listings: { text: listingsCsv.replace(/,ARCH9-VET-PHASE2-(?:RENT-NEWLANDS|SALE-SANDTON),/g, ',,') },
  images: { text: imagesCsv },
  expectedAgencyId: 31382,
  organisationId,
  environment: 'exdev',
  arch9Agents,
  catalog,
})
assert.equal(derivedListingReference.status, 'READY')
assert.equal(derivedListingReference.listingPlans[0].sourceReference, 'P24-31382-100314819')
assert.equal(derivedListingReference.listingPlans[0].privateListing.listingReference, 'P24-31382-100314819')
assert.equal(derivedListingReference.listingPlans[0].property24Sync.privateListingKey, 'P24-31382-100314819')

assert.equal(ready.fieldCoverage.agents.sourceFieldCount, 15)
assert.equal(ready.fieldCoverage.images.preservedOnlyCount, 0)
assert.equal(ready.relationships[0].imageCount, 2)
assert.equal(ready.agentPlans[0].mappingFingerprint.length, 64)
assert.equal(ready.listingPlans[0].mappingFingerprint.length, 64)

const resolutionRequired = createProperty24MigrationMappingPlan({
  agents: { text: agentsCsv },
  listings: { text: listingsCsv },
  images: { text: imagesCsv },
  expectedAgencyId: 31382,
  environment: 'exdev',
})
assert.equal(resolutionRequired.status, 'READY_WITH_RESOLUTION_REQUIRED')
assert.equal(resolutionRequired.summary.agentResolutionRequiredCount, 2)
assert.equal(resolutionRequired.summary.propertyTypeResolvedCount, 0)
assert.equal(resolutionRequired.summary.suburbResolvedCount, 0)
for (const code of [
  'organisation_id_required_before_apply',
  'arch9_agent_resolution_required',
  'property_type_catalog_mapping_required',
  'suburb_catalog_mapping_required',
]) {
  assert.ok(resolutionRequired.resolutionQueue.some((item) => item.code === code), `Expected ${code}`)
}

const invalidAgentIdCandidate = createProperty24MigrationMappingPlan({
  agents: { text: agentsCsv },
  listings: { text: listingsCsv },
  images: { text: imagesCsv },
  expectedAgencyId: 31382,
  organisationId,
  environment: 'exdev',
  arch9Agents: arch9Agents.map((agent, index) => index === 0 ? { ...agent, user_id: 'not-a-uuid' } : agent),
  catalog,
})
assert.equal(invalidAgentIdCandidate.status, 'READY_WITH_RESOLUTION_REQUIRED')
assert.equal(invalidAgentIdCandidate.agentPlans[0].arch9UserId, null)

const vacantStand = createProperty24MigrationMappingPlan({
  agents: { text: agentsCsv },
  listings: { text: listingsCsv.replaceAll(',5,2,2,', ',4,2,2,') },
  images: { text: imagesCsv },
  expectedAgencyId: 31382,
  organisationId,
  environment: 'exdev',
  arch9Agents,
  catalog: {
    ...catalog,
    propertyTypes: [{ property24Id: 4, name: 'Vacant Stand', arch9PropertyType: 'vacant_stand', propertyCategory: 'vacant_land' }],
  },
})
assert.equal(vacantStand.listingPlans[0].privateListing.propertyType, 'vacant_stand')

assert.deepEqual(mapProperty24ListingStatus('Rented', 'Rental'), {
  semanticStatus: 'rented',
  listingStatus: 'withdrawn',
  listingVisibility: 'archived',
  isActive: false,
  property24Status: 'removed',
  publicationStatus: 'Archived',
  syncExternalStatus: 'removed',
  isOnPortal: false,
  mandateStatus: 'not_started',
  mappingNote: 'Arch9 preserves Rented as the rental semantic status and uses the closed shared-listing fallback withdrawn.',
})

const blocked = createProperty24MigrationMappingPlan({
  agents: { text: agentsCsv.replace('jon@example.com', 'not-an-email') },
  listings: { text: listingsCsv },
  images: { text: imagesCsv },
  expectedAgencyId: 31382,
  organisationId,
  catalog,
})
assert.equal(blocked.status, 'BLOCKED')
assert.equal(blocked.agentPlans.length, 0)
assert.equal(blocked.listingPlans.length, 0)

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'property24-migration-data-map-'))
try {
  const agentsPath = path.join(temporaryDirectory, 'agents.csv')
  const listingsPath = path.join(temporaryDirectory, 'listings.csv')
  const imagesPath = path.join(temporaryDirectory, 'images.csv')
  const catalogPath = path.join(temporaryDirectory, 'catalog.json')
  const arch9AgentsPath = path.join(temporaryDirectory, 'arch9-agents.json')
  const outputPath = path.join(temporaryDirectory, 'mapping-plan.json')
  fs.writeFileSync(agentsPath, agentsCsv)
  fs.writeFileSync(listingsPath, listingsCsv)
  fs.writeFileSync(imagesPath, imagesCsv)
  fs.writeFileSync(catalogPath, JSON.stringify(catalog))
  fs.writeFileSync(arch9AgentsPath, JSON.stringify({ agents: arch9Agents }))
  const previousExitCode = process.exitCode
  process.exitCode = undefined
  const cli = await runProperty24MigrationMapping([
    `--agents=${agentsPath}`,
    `--listings=${listingsPath}`,
    `--images=${imagesPath}`,
    '--agency-id=31382',
    `--organisation-id=${organisationId}`,
    '--environment=exdev',
    `--catalog=${catalogPath}`,
    `--arch9-agents=${arch9AgentsPath}`,
    `--output=${outputPath}`,
    '--strict',
  ])
  assert.equal(cli.report.status, 'READY')
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).mode, 'mapping-plan')
  assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600)
  assert.equal(process.exitCode, undefined)
  process.exitCode = previousExitCode
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true })
}

const appPackage = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(appPackage.scripts['property24:migration-data-map'], 'node scripts/property24-migration-data-map.mjs')
assert.equal(appPackage.scripts['test:property24-migration-data-map'], 'node scripts/property24-migration-data-map.test.mjs')

console.log('Property24 migration data mapping tests passed')
