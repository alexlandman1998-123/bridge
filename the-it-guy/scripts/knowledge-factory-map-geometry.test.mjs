import assert from 'node:assert/strict'
import { parseWktPolygon } from '../api/knowledge-factory/map.js'

const polygon = 'POLYGON ((28.1000 -26.1000, 28.1004 -26.1000, 28.1004 -26.1004, 28.1000 -26.1000))'
const polygonWithSridAndHole = 'SRID=4326;POLYGON ((28.1000 -26.1000, 28.1004 -26.1000, 28.1004 -26.1004, 28.1000 -26.1000), (28.1001 -26.1001, 28.1002 -26.1001, 28.1001 -26.1002, 28.1001 -26.1001))'
const multiPolygon = 'MULTIPOLYGON (((28.1000 -26.1000, 28.1004 -26.1000, 28.1004 -26.1004, 28.1000 -26.1000)))'

for (const wkt of [polygon, polygonWithSridAndHole, multiPolygon]) {
  const boundary = parseWktPolygon(wkt)
  assert.equal(boundary.length, 4, 'a supplier parcel boundary should keep its first exterior ring')
  assert.deepEqual(boundary[0], { longitude: 28.1, latitude: -26.1 })
}

assert.deepEqual(parseWktPolygon('POINT (28.1 -26.1)'), [], 'non-boundary geometry should be handled by the coordinate fallback')

console.log('Knowledge Factory map geometry checks passed')
