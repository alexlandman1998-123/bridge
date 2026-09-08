import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, envFile: false, logLevel: 'silent', server: { middlewareMode: true } })
try {
  const { mapMatterToActiveMatterCard } = await server.ssrLoadModule('/src/services/attorneyDashboard.js')
  const label = (transaction) => mapMatterToActiveMatterCard({
    summary: { transactionId: 'matter', roles: new Set(['transfer']), transaction },
    primaryUnit: { unit_number: 'assignment-not-property' },
  }).propertyAddress
  const address = { property_address_line_1: '99 Leith Road' }
  assert.equal(label({ ...address, property_unit: { unit_number: '007' } }), '99 Leith Road · Unit 007')
  assert.equal(label({ ...address, unit_number: '12B' }), '99 Leith Road · Unit 12B')
  assert.equal(label({ ...address, propertyUnit: { unitLabel: 'Unit 002' } }), '99 Leith Road · Unit 002')
  assert.equal(label(address), '99 Leith Road')
  assert.equal(label({ ...address, unit_number: ' ' }), '99 Leith Road')
  assert.equal(label({ property_address_line_1: '99 Leith Road · Unit 7', unit_number: '007' }), '99 Leith Road · Unit 7')
  assert.equal(label({ property_address_line_1: '99 Leith Road · Unit 007', unit_number: '007' }), '99 Leith Road · Unit 007')
  assert.equal(label({ unit_number: '007', development_address: '99 Leith Road' }), '99 Leith Road · Unit 007')
  assert.equal(label({ ...address, unit_number: '007', property_tenure: 'sectional_title', development_name: 'Junoah Estate' }), 'Unit 007 | Junoah Estate')
  console.log('Attorney dashboard unit label: 9 cases passed')
} finally {
  await server.close()
}
