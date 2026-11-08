import assert from 'node:assert/strict'
import {
  createPrivatePropertyClient,
  createPrivatePropertyToken,
  extractPrivatePropertyXmlTag,
  PRIVATE_PROPERTY_TOKEN_TTL_MS,
  summarizePrivatePropertySoapResponse,
} from '../server/services/privatePropertyClient.js'

const token = createPrivatePropertyToken({
  username: 'Arch9User',
  password: 'mypassword',
  uid: '1738906',
  stampTime: '2016-04-26T00:04:33Z',
  expires: '2016-04-27T00:04:33Z',
})

assert.equal(token.digest, 'ZrQYLN0HV+XAd4uil/E9Z0whYqM=')
assert.equal(token.userName, 'Arch9User')
assert.equal(token.uid, '1738906')

const productionCompatibleToken = createPrivatePropertyToken({
  username: 'Arch9User',
  password: 'secret',
})
assert.match(productionCompatibleToken.uid, /^\d{7}$/)
assert.equal(
  Date.parse(productionCompatibleToken.expires) - Date.parse(productionCompatibleToken.stampTime),
  PRIVATE_PROPERTY_TOKEN_TTL_MS,
)

const calls = []
const fakeFetch = async (url, options) => {
  calls.push({ url: String(url), options })
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => `<?xml version="1.0" encoding="utf-8"?>
      <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body>
          <GetCountriesResponse xmlns="http://tempuri.org/">
            <GetCountriesResult>
              <CountryModel><Id>1</Id><Name>South Africa</Name></CountryModel>
            </GetCountriesResult>
          </GetCountriesResponse>
        </soap:Body>
      </soap:Envelope>`,
  }
}

const client = createPrivatePropertyClient({
  baseUrl: 'https://services.sandbox.pp.co.za/AgentImport/AgentImport.asmx',
  username: 'Arch9User',
  password: 'secret',
  fetchImpl: fakeFetch,
  tokenFactory: (input) => createPrivatePropertyToken({
    ...input,
    uid: 'phase1uid',
    stampTime: '2026-08-23T10:00:00Z',
    expires: '2026-08-23T10:30:00Z',
  }),
})

const countries = await client.getCountries()
assert.equal(countries.ok, true)
assert.equal(calls[0].url, 'https://services.sandbox.pp.co.za/AgentImport/AgentImport.asmx')
assert.equal(calls[0].options.method, 'POST')
assert.equal(calls[0].options.headers['Content-Type'], 'application/soap+xml; charset=utf-8')
assert.match(calls[0].options.body, /<GetCountries xmlns="http:\/\/tempuri\.org\/">/)
assert.match(calls[0].options.body, /<UserName>Arch9User<\/UserName>/)
assert.match(calls[0].options.body, /<UID>phase1uid<\/UID>/)
assert.doesNotMatch(calls[0].options.body, /secret/)
assert.equal(extractPrivatePropertyXmlTag(countries.data, 'Name'), 'South Africa')

await client.getListingEventFeedByBranch({
  branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F',
  continuationKey: '0',
})
assert.match(calls[1].options.body, /<GetListingEventFeedByBranch xmlns="http:\/\/tempuri\.org\/">/)
assert.match(calls[1].options.body, /<UniqueBranchId>CA167B18-C6DC-49AD-B018-2B72B187918F<\/UniqueBranchId>/)
assert.match(calls[1].options.body, /<continuationKey>0<\/continuationKey>/)
assert.match(calls[1].options.body, /<startDateTime xsi:nil="true" \/>/)

const summary = summarizePrivatePropertySoapResponse('GetListingEventFeedByBranch', `
  <ContinuationKey>cursor-2</ContinuationKey>
  <LisitngEventFeedData><ListingFeedEventType>Activated</ListingFeedEventType></LisitngEventFeedData>
`)
assert.equal(summary.continuationKey, 'cursor-2')
assert.equal(summary.listingEventCount, 1)

const faultClient = createPrivatePropertyClient({
  username: 'Arch9User',
  password: 'secret',
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => '<soap:Fault><faultcode>PP100</faultcode><faultstring>UnauthorisedToken</faultstring></soap:Fault>',
  }),
})

await assert.rejects(() => faultClient.getCountries(), {
  name: 'PrivatePropertySoapError',
  faultCode: 'PP100',
  faultString: 'UnauthorisedToken',
})

const connectionFailureClient = createPrivatePropertyClient({
  username: 'Arch9User',
  password: 'secret',
  fetchImpl: async () => {
    const error = new TypeError('fetch failed')
    error.cause = { code: 'UND_ERR_CONNECT_TIMEOUT', message: 'Connect Timeout Error' }
    throw error
  },
})

await assert.rejects(() => connectionFailureClient.getCountries(), {
  name: 'PrivatePropertySoapError',
  message: /UND_ERR_CONNECT_TIMEOUT/,
})

console.log('Private Property phase 1 SOAP client contract passed')

// An interrupted body is not an empty, successful status observation.
for (const failure of [new DOMException('Body read timed out', 'AbortError'), new Error('Connection closed while reading the response')]) {
 let requests = 0
 const interrupted = createPrivatePropertyClient({username:'fixture',password:'fixture',fetchImpl:async()=>{
  requests++
  return {ok:true,status:200,text:async()=>{throw failure}}
 }})
 await assert.rejects(interrupted.callSoap('GetListingStatus'), /timed out|Connection closed/)
 assert.equal(requests,1)
}

// HTTP 200 alone must not turn a rejected show day into a successful sync.
for (const answer of ['false','Error: The show day end date is before its start date.','']) {
 const rejectedShowday=createPrivatePropertyClient({username:'fixture',password:'fixture',fetchImpl:async()=>({ok:true,status:200,text:async()=>`<ListingShowdayUpdateResult>${answer}</ListingShowdayUpdateResult>`})})
 await assert.rejects(rejectedShowday.listingShowdayUpdate({branchGuid:'branch',propertyId:'property',startDate:'2099-12-01',endDate:'2099-12-02'}),/did not acknowledge ListingShowdayUpdate/)
}
const acceptedShowday=createPrivatePropertyClient({username:'fixture',password:'fixture',fetchImpl:async()=>({ok:true,status:200,text:async()=>'<ListingShowdayUpdateResult>Successful</ListingShowdayUpdateResult>'})})
assert.equal((await acceptedShowday.listingShowdayUpdate({branchGuid:'branch',propertyId:'property',startDate:'2099-12-01',endDate:'2099-12-02'})).ok,true)
