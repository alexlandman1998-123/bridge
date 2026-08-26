import fs from 'node:fs/promises'
import path from 'node:path'
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool'

const inputPath = '/Users/alexanderlandman/Downloads/Arch9 Sandbox Testing Commands-2.xlsx'
const outputDir = '/Users/alexanderlandman/the-it-guy/outputs/private-property-sandbox-testing-reply'
const outputPath = path.join(outputDir, 'Arch9 Sandbox Testing Commands - Completed All Actions With Agents.xlsx')
const previewPath = path.join(outputDir, 'Arch9 Sandbox Testing Commands - Completed All Actions With Agents.png')

await fs.mkdir(outputDir, { recursive: true })

const input = await FileBlob.load(inputPath)
const workbook = await SpreadsheetFile.importXlsx(input)
const sheet = workbook.worksheets.getItem('Sheet1')

// Add response notes without changing the original command columns.
sheet.getRange('G1').values = [['Arch9 Note']]

sheet.getRange('C2:C8').values = [
  ['rr2755973'],
  ['rr2755974'],
  ['rr2755975'],
  ['T2870290'],
  ['T2870291'],
  ['T2870292'],
  ['T2870293'],
]

sheet.getRange('D2:F8').values = [
  ['User 1', 'Create User and add image', 'ARCH9-SANDBOX-USER-1'],
  ['User 2', 'Create User and add image', 'ARCH9-SANDBOX-USER-2'],
  ['User 1', 'Created earlier; assigned to listing', 'ARCH9-SANDBOX-USER-1'],
  ['User 1', 'Created earlier; assigned to listing', 'ARCH9-SANDBOX-USER-1'],
  ['User 1', 'Created earlier; assigned to listing', 'ARCH9-SANDBOX-USER-1'],
  ['User 1 + User 2', 'Created earlier; assigned to listing', 'ARCH9-SANDBOX-USER-1, ARCH9-SANDBOX-USER-2'],
  ['User 1', 'Created earlier; assigned to listing', 'ARCH9-SANDBOX-USER-1'],
]

sheet.getRange('G2:G8').values = [
  ['Activated in sandbox. UniqueId: PP-SANDBOX-RENTAL-RES-001.'],
  ['Activated in sandbox with RentalPriceType PerM2. UniqueId: PP-SANDBOX-RENTAL-COM-M2-001.'],
  ['Activated in sandbox with RentalPriceType PerDay. UniqueId: PP-SANDBOX-RENTAL-COM-DAY-001. Agent User 1 assigned.'],
  ['Activated in sandbox and UpdateListingVideoOrMatterport passed. UniqueId: PP-SANDBOX-SALE-RES-VIDEO-001. Agent User 1 assigned.'],
  ['Activated in sandbox and ListingShowdayUpdate passed. UniqueId: PP-SANDBOX-SALE-COM-SHOWDAY-001. Agent User 1 assigned.'],
  ['Activated in sandbox with 2 agents; ListingAuctionDetailsUpdate passed. UniqueId: PP-SANDBOX-SALE-FARM-AUCTION-001. AgentIds: ARCH9-SANDBOX-USER-1, ARCH9-SANDBOX-USER-2.'],
  ['Activated in sandbox with LandArea, Rates and Levies attributes. UniqueId: PP-SANDBOX-SALE-LAND-001. Agent User 1 assigned.'],
]

const header = sheet.getRange('A1:G1')
header.format.fill.color = '#1F4E78'
header.format.font.color = '#FFFFFF'
header.format.font.bold = true
header.format.horizontalAlignment = 'center'

const used = sheet.getRange('A1:G8')
used.format.borders = { preset: 'all', style: 'thin', color: '#D9E2F3' }
used.format.verticalAlignment = 'top'
used.format.wrapText = true

sheet.getRange('A:A').format.columnWidth = 16
sheet.getRange('B:B').format.columnWidth = 44
sheet.getRange('C:C').format.columnWidth = 24
sheet.getRange('D:D').format.columnWidth = 20
sheet.getRange('E:E').format.columnWidth = 34
sheet.getRange('F:F').format.columnWidth = 42
sheet.getRange('G:G').format.columnWidth = 64
sheet.getRange('1:8').format.autofitRows()

const xlsx = await SpreadsheetFile.exportXlsx(workbook)
await xlsx.save(outputPath)

const preview = await workbook.render({ sheetName: 'Sheet1', autoCrop: 'all', scale: 1, format: 'png' })
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()))

const verification = await workbook.inspect({
  kind: 'workbook,sheet,table,formula',
  tableMaxRows: 12,
  tableMaxCols: 8,
  tableMaxCellChars: 120,
  maxChars: 12000,
})

console.log(verification.ndjson)
console.log(JSON.stringify({ outputPath, previewPath }, null, 2))
