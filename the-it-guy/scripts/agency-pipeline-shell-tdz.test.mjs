import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('Kingstons buyer pipeline signal does not read selectedLeadLinkedListing before initialization', () => {
  const linkedListingIndex = source.indexOf('const selectedLeadLinkedListing = useMemo')
  const kingstonsBuyerSignalIndex = source.indexOf('const selectedLeadHasKingstonsBuyerSignal = useMemo')

  assert.notEqual(linkedListingIndex, -1)
  assert.notEqual(kingstonsBuyerSignalIndex, -1)
  assert.ok(
    linkedListingIndex < kingstonsBuyerSignalIndex,
    'selectedLeadLinkedListing must be declared before selectedLeadHasKingstonsBuyerSignal uses it.',
  )
})

test('pipeline shell TDZ regression is exposed as a package script', () => {
  assert.equal(
    packageJson.scripts?.['test:agency-pipeline-shell-tdz'],
    'node scripts/agency-pipeline-shell-tdz.test.mjs',
  )
})

console.log('agency pipeline shell TDZ regression passed')
