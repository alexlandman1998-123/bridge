import assert from 'node:assert/strict'
import {
  buildAgentCardShareDocument,
  buildAgentCardShareImageSvg,
  createPublicAgentCardImageResponse,
  createPublicAgentCardShareResponse,
} from '../services/publicAgentCardShareApi.js'

const intake = {
  slug: 'kingstons-john-smith',
  card: {
    enabled: true,
    agent: { name: 'John Smith', jobTitle: 'Property Practitioner' },
  },
  agency: { name: 'Kingstons Atlantic', primaryColour: '#064537', secondaryColour: '#125b4b', accentColour: '#f5b83c' },
  intake: { introduction: 'Helping buyers and sellers make their next move.' },
}

const html = buildAgentCardShareDocument({ intake, host: 'https://app.arch9.co.za' })
assert.match(html, /<meta property="og:title" content="John Smith \| Kingstons Atlantic" \/>/)
assert.match(html, /<meta property="og:image" content="https:\/\/app\.arch9\.co\.za\/api\/public\/agent-card-image\?slug=kingstons-john-smith" \/>/)
assert.match(html, /https:\/\/app\.arch9\.co\.za\/card\/kingstons-john-smith/)

const attributedHtml = buildAgentCardShareDocument({ intake, host: 'https://app.arch9.co.za', search: '?source=qr&utm_campaign=show-day' })
assert.match(attributedHtml, /https:\/\/app\.arch9\.co\.za\/card\/kingstons-john-smith\?source=qr&amp;utm_campaign=show-day/)

const svg = buildAgentCardShareImageSvg({ intake })
assert.match(svg, /width="1200" height="630"/)
assert.match(svg, />John Smith<\/text>/)
assert.match(svg, />Kingstons Atlantic<\/text>/)

const dependencies = {
  createIntakeResponse: async () => ({ status: 200, body: { intake } }),
}
const shareResponse = await createPublicAgentCardShareResponse({
  method: 'GET',
  url: '/api/public/agent-card-share?slug=kingstons-john-smith',
  headers: { host: 'app.arch9.co.za' },
  dependencies,
})
assert.equal(shareResponse.status, 200)
assert.equal(shareResponse.headers['Content-Type'], 'text/html; charset=utf-8')
assert.match(shareResponse.body, /twitter:card/)

const imageResponse = await createPublicAgentCardImageResponse({
  method: 'GET',
  url: '/api/public/agent-card-image?slug=kingstons-john-smith',
  headers: { host: 'app.arch9.co.za' },
  dependencies,
})
assert.equal(imageResponse.status, 200)
assert.equal(imageResponse.headers['Content-Type'], 'image/png')
assert.equal(Buffer.isBuffer(imageResponse.body), true)
assert.equal(imageResponse.body.subarray(1, 4).toString('ascii'), 'PNG')

console.log('publicAgentCardShareApi tests passed')
