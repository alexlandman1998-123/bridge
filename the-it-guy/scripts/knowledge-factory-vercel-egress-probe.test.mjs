import assert from 'node:assert/strict'
import { mayRunSupplierEgressProbe, probeSupplierUat } from '../api/knowledge-factory/map.js'

assert.equal(mayRunSupplierEgressProbe('principal', true), true)
assert.equal(mayRunSupplierEgressProbe('administrator', true), true)
assert.equal(mayRunSupplierEgressProbe('agent', true), false)
assert.equal(mayRunSupplierEgressProbe('principal', false), false)

const requests = []
const result = await probeSupplierUat(async (url, options) => {
  requests.push({ url, options })
  return new Response('Not returned to caller', {
    status: url.includes('propinfoapi') ? 403 : 200,
    headers: { 'content-type': url.includes('propinfoapi') ? 'text/html; charset=utf-8' : 'text/html', server: 'awselb/2.0' },
  })
})

assert.deepEqual(requests.map(({ url }) => url), [
  'https://propinfoapi.co.za/live/uat/graphql/',
  'https://new.propertyintellect.co.za/graphql/portal/',
])
assert.equal(requests[0].options.method, 'POST')
assert.equal(requests[0].options.headers['GraphQL-Cost'], 'validate')
assert.equal(requests[0].options.headers.authorization, undefined)
assert.deepEqual(JSON.parse(requests[0].options.body), {
  operationName: 'FicaDiscoveryProbe',
  query: 'query FicaDiscoveryProbe { __typename }',
})
assert.equal(requests[1].options.method, 'GET')
assert.deepEqual(result, {
  environment: 'uat',
  costMode: 'validate',
  graphql: { httpStatus: 403, contentType: 'text/html', server: 'awselb/2.0' },
  portal: { httpStatus: 200, contentType: 'text/html', server: 'awselb/2.0' },
})
assert.doesNotMatch(JSON.stringify(result), /Not returned to caller/)

const networkFailure = await probeSupplierUat(async () => { throw new Error('secret upstream detail') })
assert.equal(networkFailure.graphql.error, 'network_error')
assert.equal(networkFailure.portal.error, 'network_error')
assert.doesNotMatch(JSON.stringify(networkFailure), /secret upstream detail/)

console.log('Knowledge Factory Vercel egress probe access, request shape, and safe responses passed.')
