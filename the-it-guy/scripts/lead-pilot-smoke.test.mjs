import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {
  buildInboundSmokePayload,
  buildOutboundSmokePayload,
  isAllowedSmokeRecipient,
  normalizeSource,
  parseArgs,
} from './lead-pilot-smoke.mjs'

assert.equal(normalizeSource('Website'), 'Website')
assert.equal(normalizeSource('PrivateProperty'), 'Private Property')
assert.equal(normalizeSource('property 24'), 'Property24')
assert.equal(normalizeSource('fb'), 'Facebook')

assert.deepEqual(parseArgs(['--source', 'Website']).source, 'Website')
assert.equal(parseArgs(['--source=PrivateProperty', '--live']).live, true)
assert.equal(parseArgs(['--source=Website', '--delivery=email', '--live']).delivery, 'email')
assert.equal(parseArgs(['--source=Website', '--via-email', '--live']).delivery, 'email')
assert.equal(parseArgs(['--source=Website', '--no-review-case']).reviewCase, 'none')
assert.equal(parseArgs(['--source=Website', '--review-case=unmatched']).reviewCase, 'unmatched')
assert.equal(parseArgs(['--outbound-email', '--to=pilot@arch9.co.za']).outboundEmail, true)
assert.throws(() => parseArgs([]), /Choose at least one smoke path/)
assert.throws(() => parseArgs(['--source=Unknown']), /Unsupported source/)
assert.throws(() => parseArgs(['--source=Website', '--delivery=email']), /requires --live/)

const websiteSmoke = buildInboundSmokePayload({
  source: 'Website',
  aliasEmail: 'website-agent@leads.arch9.co.za',
  token: 'pilot-web',
})
assert.equal(websiteSmoke.expectedParser, 'website_email')
assert.equal(websiteSmoke.expectedSource, 'Website')
assert.equal(websiteSmoke.payload.provider, 'mailgun')
assert.equal(websiteSmoke.payload.recipient, 'website-agent@leads.arch9.co.za')
assert.match(websiteSmoke.payload['body-plain'], /First Name: Pilot/)
assert.match(websiteSmoke.payload['body-plain'], /Budget: R 1850000/)
assert.doesNotMatch(websiteSmoke.payload['body-plain'], /Listing Ref/i)

const property24Smoke = buildInboundSmokePayload({
  source: 'Property24',
  aliasEmail: 'property24-agent@leads.arch9.co.za',
  token: 'pilot-p24',
})
assert.equal(property24Smoke.expectedParser, 'property24_email')
assert.match(property24Smoke.payload.sender, /property24\.com/)
assert.match(property24Smoke.payload['body-plain'], /Enquiry By: Pilot Property24/)

const privatePropertySmoke = buildInboundSmokePayload({
  source: 'Private Property',
  aliasEmail: 'private-agent@leads.arch9.co.za',
  token: 'pilot-pp',
})
assert.equal(privatePropertySmoke.expectedParser, 'private_property_email')
assert.match(privatePropertySmoke.payload.sender, /privateproperty\.co\.za/)

const facebookSmoke = buildInboundSmokePayload({
  source: 'Facebook',
  aliasEmail: 'facebook-agent@leads.arch9.co.za',
  token: 'pilot-fb',
})
assert.equal(facebookSmoke.expectedParser, 'generic_email')
assert.equal(facebookSmoke.expectedSource, 'Facebook')

const lowConfidenceSmoke = buildInboundSmokePayload({
  source: 'Website',
  aliasEmail: 'website-agent@leads.arch9.co.za',
  token: 'review-web',
  lowConfidence: true,
})
assert.match(lowConfidenceSmoke.payload['body-plain'], /Name: Pilot Review/)
assert.doesNotMatch(lowConfidenceSmoke.payload['body-plain'], /Phone:/)
assert.doesNotMatch(lowConfidenceSmoke.payload['body-plain'], /Message:/)

const unmatchedSmoke = buildInboundSmokePayload({
  source: 'Website',
  token: 'unmatched-web',
  unmatched: true,
})
assert.equal(unmatchedSmoke.payload.recipient, 'unmatched-unmatched-web@leads.arch9.co.za')
assert.equal(unmatchedSmoke.expectedParser, null)

const outboundSmoke = buildOutboundSmokePayload({
  recipient: 'pilot@arch9.co.za',
  token: 'outbound-web',
})
assert.equal(outboundSmoke.payload.type, 'lead_property_share')
assert.equal(outboundSmoke.payload.to, 'pilot@arch9.co.za')
assert.match(outboundSmoke.payload.subject, /Lead module email smoke outbound-web/)
assert.match(outboundSmoke.payload.html, /Lead module property-share email path/)

assert.equal(isAllowedSmokeRecipient('pilot@arch9.co.za', ['arch9.co.za']), true)
assert.equal(isAllowedSmokeRecipient('pilot@app.arch9.co.za', ['arch9.co.za']), true)
assert.equal(isAllowedSmokeRecipient('client@example.com', ['arch9.co.za']), false)

const packageJson = await fs.readFile(new URL('../package.json', import.meta.url), 'utf8')
assert.match(packageJson, /test:lead-pilot-smoke/)

const readme = await fs.readFile(new URL('../README.md', import.meta.url), 'utf8')
assert.match(readme, /lead-pilot-smoke\.mjs --source Website/)
assert.match(readme, /--outbound-email --to pilot@arch9\.co\.za/)
assert.match(readme, /--review-case=unmatched --live/)

const envExample = await fs.readFile(new URL('../.env.example', import.meta.url), 'utf8')
assert.match(envExample, /LEAD_PILOT_INBOUND_WEBHOOK_SECRET=/)
assert.match(envExample, /LEAD_PILOT_SMOKE_TO_EMAIL=/)
assert.match(envExample, /LEAD_PILOT_SMOKE_ALLOWED_EMAIL_DOMAINS=/)

console.log('lead pilot smoke contract tests passed')
