import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  buildProperty24BasicAuthHeader,
  createProperty24Client,
  summarizeProperty24Payload,
} from '../server/services/property24Client.js'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const expectedHeader = `Basic ${Buffer.from('user@example.test:secret', 'utf8').toString('base64')}`
assert.equal(buildProperty24BasicAuthHeader(' user@example.test ', ' secret '), expectedHeader)

const calls = []
const fakeFetch = async (url, options) => {
  calls.push({ url: String(url), options })
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: {
      get: () => 'application/json',
    },
    json: async () => [{ id: 31382, name: 'Arch9 ExDev Agency', emailAddress: 'ops@example.test' }],
    text: async () => '',
  }
}

const client = createProperty24Client({
  baseUrl: 'https://api.exdev.property24-test.com/',
  username: 'user@example.test',
  password: 'secret',
  userGroupId: 31382,
  fetchImpl: fakeFetch,
})

const result = await client.fetchAgencyAgents(31382)
assert.equal(result.status, 200)
assert.equal(calls[0].url, 'https://api.exdev.property24-test.com/listing/v53/agencies/31382/agents')
assert.equal(calls[0].options.headers.Authorization, expectedHeader)
assert.equal(calls[0].options.headers.Accept, 'application/json')
assert.equal(calls[0].options.headers['P24-UserGroupId'], '31382')

await client.echoAuthenticated('hello')
assert.equal(calls[1].url, 'https://api.exdev.property24-test.com/listing/v53/echo-authenticated?stringToEcho=hello')

await client.findSuburb({
  countryName: 'South Africa',
  provinceName: 'Gauteng',
  cityName: 'Johannesburg',
  suburbName: 'Sandton',
})
assert.equal(
  calls[2].url,
  'https://api.exdev.property24-test.com/listing/v53/suburbs/find?countryName=South+Africa&provinceName=Gauteng&cityName=Johannesburg&suburbName=Sandton',
)

const summary = summarizeProperty24Payload([
  {
    id: 1,
    name: 'Visible',
    password: 'should not appear',
    token: 'should not appear',
  },
])
assert.deepEqual(summary, {
  type: 'array',
  count: 1,
  sample: [{ id: 1, name: 'Visible' }],
})

const smokeScript = read('scripts/property24-phase1-smoke.mjs')
assert.match(smokeScript, /PROPERTY24_BASIC_AUTH_USERNAME/)
assert.match(smokeScript, /PROPERTY24_BASIC_AUTH_PASSWORD/)
assert.match(smokeScript, /property24-phase1-smoke\.json/)
assert.doesNotMatch(smokeScript, /31382@arch9\.co\.za/i)

const findSuburbScript = read('scripts/property24-find-suburb.mjs')
assert.match(findSuburbScript, /findSuburb/)
assert.match(findSuburbScript, /property24-find-suburb\.json/)
assert.doesNotMatch(findSuburbScript, /31382@arch9\.co\.za/i)

const envExample = read('.env.example')
for (const marker of [
  'PROPERTY24_BASE_URL=',
  'PROPERTY24_BASIC_AUTH_USERNAME=',
  'PROPERTY24_BASIC_AUTH_PASSWORD=',
  'PROPERTY24_DEFAULT_AGENCY_ID=31382',
  'PROPERTY24_USER_GROUP_ID=',
  'PROPERTY24_SYNDICATION_ENABLED=false',
]) {
  assert.match(envExample, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.scripts['property24:phase1'], 'node scripts/property24-phase1-smoke.mjs')
assert.equal(packageJson.scripts['property24:find-suburb'], 'node scripts/property24-find-suburb.mjs')
assert.equal(packageJson.scripts['test:property24-phase1'], 'node scripts/property24-phase1-smoke.test.mjs')

console.log('Property24 Phase 1 smoke test contract passed')
