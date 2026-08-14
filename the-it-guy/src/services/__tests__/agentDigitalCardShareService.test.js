import assert from 'node:assert/strict'
import {
  __agentDigitalCardShareServiceTestUtils,
  buildAgentDigitalCardFileBaseName,
  buildAgentDigitalCardShareKit,
  buildAgentDigitalCardShareKitCsv,
  buildAgentDigitalCardShareText,
  buildAgentDigitalCardVcard,
  createAgentDigitalCardQrDataUrl,
} from '../agentDigitalCardShareService.js'

const { escapeCsvCell, escapeVcardValue, splitAgentName, normalizeFileName } = __agentDigitalCardShareServiceTestUtils

assert.equal(escapeCsvCell('John, Smith'), '"John, Smith"')
assert.equal(escapeCsvCell('John "The Agent" Smith'), '"John ""The Agent"" Smith"')
assert.equal(escapeVcardValue('John; Smith, Esq\\Agent'), 'John\\; Smith\\, Esq\\\\Agent')
assert.deepEqual(splitAgentName('John Ronald Smith'), { firstName: 'John Ronald', lastName: 'Smith' })
assert.equal(normalizeFileName('Kingstons / John Smith!'), 'kingstons-john-smith')

assert.equal(
  buildAgentDigitalCardFileBaseName({ organisationName: 'Produktive Realty', agentName: 'John Smith' }),
  'produktive-realty-john-smith',
)

assert.equal(
  buildAgentDigitalCardShareText({
    agentName: 'John Smith',
    organisationName: 'Kingstons',
    shareUrl: 'https://app.arch9.co.za/intake/kingstons-john-smith',
  }),
  'John Smith at Kingstons\nhttps://app.arch9.co.za/intake/kingstons-john-smith',
)

const shareKit = buildAgentDigitalCardShareKit({
  agentName: 'John Smith',
  agentEmail: 'john@kingstons.test',
  agentPhone: '082 123 4567',
  agentJobTitle: 'Property Practitioner',
  organisationName: 'Kingstons',
  shareUrl: 'https://app.arch9.co.za/card/kingstons-john-smith',
})

assert.equal(shareKit.fileBaseName, 'kingstons-john-smith')
assert.equal(shareKit.vcardFileName, 'kingstons-john-smith.vcf')
assert.equal(shareKit.qrFileName, 'kingstons-john-smith-qr.png')
assert.equal(shareKit.shareText, 'John Smith at Kingstons\nhttps://app.arch9.co.za/card/kingstons-john-smith')
assert.match(shareKit.vcard, /URL:https:\/\/app\.arch9\.co\.za\/card\/kingstons-john-smith\r\n/)

const rolloutCsv = buildAgentDigitalCardShareKitCsv([
  {
    agentName: 'John Smith',
    agentEmail: 'john@kingstons.test',
    agentPhone: '082 123 4567',
    agentJobTitle: 'Property Practitioner',
    organisationName: 'Kingstons',
    cardUrl: 'https://app.arch9.co.za/card/kingstons-john-smith',
    intakeUrl: 'https://app.arch9.co.za/intake/kingstons-john-smith',
    buyerUrl: 'https://app.arch9.co.za/intake/kingstons-john-smith?intent=buy&source=card',
    sellerUrl: 'https://app.arch9.co.za/intake/kingstons-john-smith?intent=sell&source=card',
  },
])

assert.match(rolloutCsv, /^agent_name,agent_email,agent_phone,job_title,organisation,card_url,intake_url,buyer_url,seller_url,share_text,qr_file_name,vcf_file_name\r\n/)
assert.match(rolloutCsv, /John Smith,john@kingstons\.test,082 123 4567,Property Practitioner,Kingstons,https:\/\/app\.arch9\.co\.za\/card\/kingstons-john-smith/)
assert.match(rolloutCsv, /"John Smith at Kingstons\nhttps:\/\/app\.arch9\.co\.za\/card\/kingstons-john-smith"/)
assert.match(rolloutCsv, /kingstons-john-smith-qr\.png,kingstons-john-smith\.vcf\r\n$/)

const vcard = buildAgentDigitalCardVcard({
  agentName: 'John Smith',
  agentEmail: 'john@kingstons.test',
  agentPhone: '082 123 4567',
  agentJobTitle: 'Property Practitioner',
  organisationName: 'Kingstons',
  shareUrl: 'https://app.arch9.co.za/intake/kingstons-john-smith',
})

assert.match(vcard, /^BEGIN:VCARD\r\nVERSION:3\.0\r\n/)
assert.match(vcard, /N:Smith;John;;;\r\n/)
assert.match(vcard, /FN:John Smith\r\n/)
assert.match(vcard, /ORG:Kingstons\r\n/)
assert.match(vcard, /URL:https:\/\/app\.arch9\.co\.za\/intake\/kingstons-john-smith\r\n/)
assert.match(vcard, /END:VCARD\r\n$/)

const dataUrl = await createAgentDigitalCardQrDataUrl('https://app.arch9.co.za/intake/kingstons-john-smith', {
  width: 120,
})
assert.equal(dataUrl.startsWith('data:image/png;base64,'), true)

await assert.rejects(
  () => createAgentDigitalCardQrDataUrl(''),
  /digital card link is required/i,
)
