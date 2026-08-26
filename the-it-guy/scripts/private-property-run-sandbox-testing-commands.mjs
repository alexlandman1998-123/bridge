import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

function parseArgs(argv = []) {
  const options = {
    apply: false,
    workspace: 'produktive',
    outputDir: path.join(appRoot, 'outputs', 'private-property-sandbox-testing-commands'),
    suburbId: '140',
  }
  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true
      continue
    }
    const match = String(arg).match(/^--([^=]+)=(.*)$/)
    if (!match) throw new Error(`Unknown option: ${arg}`)
    const key = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    options[key] = match[2]
  }
  return options
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function runScript(scriptName, args = [], outputPath) {
  const fullArgs = [path.join(appRoot, 'scripts', scriptName), ...args]
  if (outputPath) fullArgs.push(`--output=${outputPath}`)
  const result = spawnSync(process.execPath, fullArgs, {
    cwd: appRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status !== 0) {
    throw new Error([
      `${scriptName} failed with exit code ${result.status}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'))
  }
  return outputPath && fs.existsSync(outputPath) ? readJson(outputPath) : { stdout: result.stdout }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const TEST_ROWS = [
  {
    row: 2,
    label: 'Rental - Create New Residential',
    listingReference: 'PP-SANDBOX-RENTAL-RES-001',
    listingType: 'Rental',
    category: 'Residential',
    mandateType: 'Rental',
    price: '18500',
    availableFrom: '2026-09-01',
    streetNumber: '18',
    streetName: 'Sandbox Rental Avenue',
  },
  {
    row: 3,
    label: 'Rental - Create New Commercial, Price Per M2',
    listingReference: 'PP-SANDBOX-RENTAL-COM-M2-001',
    listingType: 'Rental',
    category: 'Commercial',
    mandateType: 'Rental',
    price: '220',
    rentalPriceType: 'PerM2',
    availableFrom: '2026-09-01',
    streetNumber: '22',
    streetName: 'Sandbox Commercial M2 Road',
  },
  {
    row: 4,
    label: 'Rental - Create New Commercial, Price Type Per Day',
    listingReference: 'PP-SANDBOX-RENTAL-COM-DAY-001',
    listingType: 'Rental',
    category: 'Commercial',
    mandateType: 'Rental',
    price: '2500',
    rentalPriceType: 'PerDay',
    availableFrom: '2026-09-01',
    streetNumber: '24',
    streetName: 'Sandbox Commercial Day Road',
  },
  {
    row: 5,
    label: 'Sale - Create New Residential, Add Video',
    listingReference: 'PP-SANDBOX-SALE-RES-VIDEO-001',
    listingType: 'Sale',
    category: 'Residential',
    mandateType: 'OpenMandate',
    price: '2500000',
    streetNumber: '12',
    streetName: 'Sandbox Sale Street',
    afterPublish: 'video',
  },
  {
    row: 6,
    label: 'Sale - Create New Commercial, Add Show Day',
    listingReference: 'PP-SANDBOX-SALE-COM-SHOWDAY-001',
    listingType: 'Sale',
    category: 'Commercial',
    mandateType: 'OpenMandate',
    price: '3850000',
    streetNumber: '30',
    streetName: 'Sandbox Showday Boulevard',
    afterPublish: 'showday',
  },
  {
    row: 7,
    label: 'Sale - Create New Farm, Auction Listing, Add 2 Agents, Add Farm Name',
    listingReference: 'PP-SANDBOX-SALE-FARM-AUCTION-001',
    listingType: 'Sale',
    category: 'Farms',
    mandateType: 'AuctionOnly',
    price: '4500000',
    streetNumber: '44',
    streetName: 'Sandbox Farm Road',
    farmName: 'Arch9 Test Farm',
    agentIds: 'ARCH9-SANDBOX-USER-1,ARCH9-SANDBOX-USER-2',
    afterPublish: 'auction',
  },
  {
    row: 8,
    label: 'Sale - Create New Land, Add Land Area, Rates and Levies',
    listingReference: 'PP-SANDBOX-SALE-LAND-001',
    listingType: 'Sale',
    category: 'Land',
    mandateType: 'OpenMandate',
    price: '1450000',
    streetNumber: '52',
    streetName: 'Sandbox Land Crescent',
  },
]

function publishArgs(row, listingId, suburbId) {
  return [
    '--apply',
    '--record-sync',
    `--listing-id=${listingId}`,
    '--environment=sandbox',
    `--property-id=${row.listingReference}`,
    `--suburb-id=${suburbId}`,
    `--street-number=${row.streetNumber}`,
    `--street-name=${row.streetName}`,
    `--category=${row.category}`,
    `--listing-type=${row.listingType}`,
    `--mandate-type=${row.mandateType}`,
    `--price=${row.price}`,
    ...(row.availableFrom ? [`--available-from=${row.availableFrom}`] : []),
    ...(row.rentalPriceType ? [`--rental-price-type=${row.rentalPriceType}`] : []),
    ...(row.farmName ? [`--farm-name=${row.farmName}`] : []),
    ...(row.agentIds ? [`--agent-ids=${row.agentIds}`] : []),
  ]
}

function monitorArgs(row, listingId, suburbId) {
  return [
    '--record-sync',
    `--listing-id=${listingId}`,
    '--environment=sandbox',
    `--property-id=${row.listingReference}`,
    `--suburb-id=${suburbId}`,
    `--street-number=${row.streetNumber}`,
    `--street-name=${row.streetName}`,
    `--category=${row.category}`,
    `--listing-type=${row.listingType}`,
    `--mandate-type=${row.mandateType}`,
    `--price=${row.price}`,
    ...(row.availableFrom ? [`--available-from=${row.availableFrom}`] : []),
    ...(row.rentalPriceType ? [`--rental-price-type=${row.rentalPriceType}`] : []),
    ...(row.farmName ? [`--farm-name=${row.farmName}`] : []),
    ...(row.agentIds ? [`--agent-ids=${row.agentIds}`] : []),
  ]
}

function extractReference(publishReport = {}, monitorReport = {}) {
  return monitorReport.statusProbe?.privatePropertyRef ||
    publishReport.apiResponse?.privatePropertyReference ||
    publishReport.apiResponse?.summary?.resultText ||
    ''
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  fs.mkdirSync(options.outputDir, { recursive: true })

  if (!options.apply) {
    const output = path.join(options.outputDir, 'private-property-sandbox-testing-commands.json')
    const report = {
      phase: 'private-property-sandbox-testing-commands',
      generatedAt: new Date().toISOString(),
      status: 'DRY_RUN',
      apply: false,
      rows: TEST_ROWS.map((row) => ({
        row: row.row,
        label: row.label,
        propertyId: row.listingReference,
        expectedActions: ['UpdateListing', row.afterPublish].filter(Boolean),
      })),
      nextStep: 'Re-run with --apply during the Private Property sandbox window.',
    }
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
    console.log(JSON.stringify({ status: report.status, output }, null, 2))
    return
  }

  const agentImage = 'https://picsum.photos/id/1005/600/600.jpg'
  const agents = [
    runScript('private-property-create-agent.mjs', [
      '--apply',
      '--sandbox-user=1',
      '--email=alex+privatepropertytest@arch9.co.za',
      '--mobile=0676125009',
      `--image-url=${agentImage}`,
    ], path.join(options.outputDir, 'agent-1.json')),
    runScript('private-property-create-agent.mjs', [
      '--apply',
      '--sandbox-user=2',
      '--email=alex+privatepropertytest2@arch9.co.za',
      '--mobile=0686439449',
      '--image-url=https://picsum.photos/id/1011/600/600.jpg',
    ], path.join(options.outputDir, 'agent-2.json')),
  ]

  const seedReport = runScript('private-property-seed-test-listings.mjs', [
    '--apply',
    `--workspace=${options.workspace}`,
  ], path.join(options.outputDir, 'seed-listings.json'))
  const listingsByReference = new Map(
    seedReport.result.map((item) => [item.listing.listing_reference, item.listing.id]),
  )

  const rows = []
  for (const row of TEST_ROWS) {
    const listingId = listingsByReference.get(row.listingReference)
    if (!listingId) throw new Error(`No seeded listing found for ${row.listingReference}`)

    const publishReport = runScript('private-property-controlled-publish-rehearsal.mjs',
      publishArgs(row, listingId, options.suburbId),
      path.join(options.outputDir, `publish-row-${row.row}.json`),
    )

    let monitorReport = null
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      monitorReport = runScript('private-property-post-submit-monitor.mjs',
        monitorArgs(row, listingId, options.suburbId),
        path.join(options.outputDir, `monitor-row-${row.row}-attempt-${attempt}.json`),
      )
      if (monitorReport.status === 'ACTIVATED' || monitorReport.status === 'ATTENTION_REQUIRED') break
      await sleep(10000)
    }

    if (row.listingType === 'Sale' && monitorReport?.status !== 'ACTIVATED') {
      runScript('private-property-status-update.mjs', [
        '--apply',
        `--property-id=${row.listingReference}`,
        '--listing-type=Sale',
        '--property-status=ForSale',
      ], path.join(options.outputDir, `status-update-row-${row.row}.json`))
      monitorReport = runScript('private-property-post-submit-monitor.mjs',
        monitorArgs(row, listingId, options.suburbId),
        path.join(options.outputDir, `monitor-row-${row.row}-final.json`),
      )
    }

    let specialReport = null
    if (row.afterPublish === 'video') {
      specialReport = runScript('private-property-listing-video.mjs', [
        '--apply',
        `--property-id=${row.listingReference}`,
        '--listing-type=Sale',
        '--youtube-video-id=dQw4w9WgXcQ',
      ], path.join(options.outputDir, `video-row-${row.row}.json`))
    }
    if (row.afterPublish === 'showday') {
      specialReport = runScript('private-property-showday-update.mjs', [
        '--apply',
        `--property-id=${row.listingReference}`,
        '--start-date=2026-08-29T10:00:00',
        '--end-date=2026-08-29T12:00:00',
        '--description=Arch9 sandbox show day',
      ], path.join(options.outputDir, `showday-row-${row.row}.json`))
    }
    if (row.afterPublish === 'auction') {
      specialReport = runScript('private-property-auction-update.mjs', [
        '--apply',
        `--property-id=${row.listingReference}`,
        '--reserve-price=4200000',
        '--start-price=4000000',
        '--start-date=2026-08-29T10:00:00',
        '--end-date=2026-09-05T12:00:00',
        '--show-price=true',
        '--same-as-address=true',
        '--auction-venue-id=0',
      ], path.join(options.outputDir, `auction-row-${row.row}.json`))
    }

    rows.push({
      row: row.row,
      label: row.label,
      listingId,
      propertyId: row.listingReference,
      listingType: row.listingType,
      category: row.category,
      referenceNumber: extractReference(publishReport, monitorReport),
      publishStatus: publishReport.status,
      monitorStatus: monitorReport?.status || '',
      externalStatus: monitorReport?.externalStatus || '',
      specialAction: row.afterPublish || '',
      specialStatus: specialReport?.status || '',
      agentIds: row.agentIds || 'ARCH9-SANDBOX-USER-1',
    })
  }

  const output = path.join(options.outputDir, 'private-property-sandbox-testing-commands.json')
  const report = {
    phase: 'private-property-sandbox-testing-commands',
    generatedAt: new Date().toISOString(),
    status: rows.every((row) => row.referenceNumber && row.publishStatus === 'SUBMITTED') ? 'PASS' : 'ATTENTION_REQUIRED',
    apply: true,
    agents: agents.map((report) => ({
      status: report.summary?.status || report.status,
      agentId: report.agent?.agentId || report.agentId,
      email: report.agent?.email || '',
      imageUpdated: report.checks?.some((check) => check.name === 'UpdateAgentImage SOAP write' && check.status === 'PASS') || false,
    })),
    rows,
  }
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({
    status: report.status,
    output,
    referenceNumbers: rows.map((row) => ({ row: row.row, propertyId: row.propertyId, referenceNumber: row.referenceNumber })),
  }, null, 2))
  if (report.status !== 'PASS') process.exitCode = 1
}

run().catch((error) => {
  console.error(JSON.stringify({
    status: 'FAILED',
    name: error.name || 'Error',
    message: error.message,
  }, null, 2))
  process.exitCode = 1
})
