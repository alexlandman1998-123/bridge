import assert from 'node:assert/strict'
import {
  buildPrivatePropertyAgentXml,
  createPrivatePropertyClient,
  createPrivatePropertyToken,
  extractPrivatePropertyXmlTag,
} from '../server/services/privatePropertyClient.js'

const agent = {
  branchId: 'CA167B18-C6DC-49AD-B018-2B72B187918F',
  agentId: 'ARCH9-SANDBOX-USER-1',
  firstName: 'User',
  lastName: 'One',
  email: 'privateproperty.sandbox+user1@arch9.co.za',
  telCell: '+27676125009',
  telWork: '+27108241285',
  telHome: '',
  active: true,
  privysealAlias: '',
}

const agentXml = buildPrivatePropertyAgentXml(agent)
assert.match(agentXml, /<Agent>/)
assert.match(agentXml, /<BranchId>CA167B18-C6DC-49AD-B018-2B72B187918F<\/BranchId>/)
assert.match(agentXml, /<AgentId>ARCH9-SANDBOX-USER-1<\/AgentId>/)
assert.match(agentXml, /<FirstName>User<\/FirstName>/)
assert.match(agentXml, /<LastName>One<\/LastName>/)
assert.match(agentXml, /<Email>privateproperty\.sandbox\+user1@arch9\.co\.za<\/Email>/)
assert.match(agentXml, /<TelCell>\+27676125009<\/TelCell>/)
assert.match(agentXml, /<TelWork>\+27108241285<\/TelWork>/)
assert.match(agentXml, /<Active>true<\/Active>/)

const escapedXml = buildPrivatePropertyAgentXml({
  ...agent,
  firstName: 'A&B',
  lastName: '<One>',
})
assert.match(escapedXml, /<FirstName>A&amp;B<\/FirstName>/)
assert.match(escapedXml, /<LastName>&lt;One&gt;<\/LastName>/)

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
          <UpdateAgentResponse xmlns="http://tempuri.org/">
            <UpdateAgentResult>Successful</UpdateAgentResult>
          </UpdateAgentResponse>
        </soap:Body>
      </soap:Envelope>`,
  }
}

const client = createPrivatePropertyClient({
  username: 'Arch9User',
  password: 'secret',
  fetchImpl: fakeFetch,
  tokenFactory: (input) => createPrivatePropertyToken({
    ...input,
    uid: 'agentuid',
    stampTime: '2026-08-24T08:00:00Z',
    expires: '2026-08-24T08:30:00Z',
  }),
})

const updateResult = await client.updateAgent(agent)
assert.equal(updateResult.summary.resultText, 'Successful')
assert.match(calls[0].options.body, /<UpdateAgent xmlns="http:\/\/tempuri\.org\/">/)
assert.match(calls[0].options.body, /<AgentId>ARCH9-SANDBOX-USER-1<\/AgentId>/)
assert.match(calls[0].options.body, /<UserName>Arch9User<\/UserName>/)
assert.match(calls[0].options.body, /<UID>agentuid<\/UID>/)
assert.doesNotMatch(calls[0].options.body, /secret/)
assert.equal(extractPrivatePropertyXmlTag(updateResult.data, 'UpdateAgentResult'), 'Successful')

await client.updateAgentImage({
  agent,
  imageUrl: 'https://example.com/agent.jpg',
})
assert.match(calls[1].options.body, /<UpdateAgentImage xmlns="http:\/\/tempuri\.org\/">/)
assert.match(calls[1].options.body, /<imgurl>https:\/\/example\.com\/agent\.jpg<\/imgurl>/)
assert.match(calls[1].options.body, /<AgentId>ARCH9-SANDBOX-USER-1<\/AgentId>/)

assert.throws(() => client.updateAgentImage({ agent, imageUrl: '' }), /agent image URL is required/)

console.log('Private Property phase 2 agent setup contract passed')
