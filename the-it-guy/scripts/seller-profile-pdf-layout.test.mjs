import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(repoRoot, 'src/pages/AgentListingDetail.jsx'), 'utf8')

function assertContains(needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label} is missing: ${needle}`)
  }
}

function assertNotContains(needle, label) {
  if (source.includes(needle)) {
    throw new Error(`${label} should not be present: ${needle}`)
  }
}

assertContains("drawText('SELLER MANDATE WORKSPACE'", 'mandate-style seller PDF header')
assertContains("drawText('Seller Profile'", 'seller profile PDF title')
assertContains("drawSectionBand('Profile Summary')", 'seller PDF summary table section')
assertContains('const drawTableSection =', 'seller PDF table section renderer')
assertContains('const drawTableRow =', 'seller PDF table row renderer')
assertContains("drawText('FIELD'", 'seller PDF field column header')
assertContains("drawText('DETAILS'", 'seller PDF details column header')
assertContains('Page ${index + 1} of ${pages.length}', 'seller PDF footer page numbering')
assertContains('const stream = pageLines.join', 'seller PDF command stream rendering')
assertNotContains('summary.forEach((row) => addLine', 'old plain summary line renderer')
assertNotContains('section.rows.forEach((row) => addLine', 'old plain section line renderer')

console.log('Seller profile PDF table layout wiring verified.')
