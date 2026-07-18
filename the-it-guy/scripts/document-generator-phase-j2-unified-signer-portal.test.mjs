import assert from 'node:assert/strict'
import fs from 'node:fs'

const app = fs.readFileSync('src/App.jsx', 'utf8')
assert.match(app, /path="\/client\/:token\/otp-signing"[\s\S]{0,300}<SignerPortal sessionSource="legacy-otp"/)
assert.doesNotMatch(app, /const ClientOtpSigning = lazy/)

const portal = fs.readFileSync('src/pages/SignerPortal.jsx', 'utf8')
for (const token of [
  "sessionSource = 'packet'",
  "sessionSource === 'legacy-otp'",
  'fetchClientOtpSigningByToken',
  'adaptCanonicalSigningSessionToPortal',
  'submitClientOtpSignature',
  'legacyOtpSignatureDataUrl',
  'completePortalSessionField',
  'confirmationAccepted: true',
]) assert.match(portal, new RegExp(token.replace(/[()]/g, '\\$&')))
assert.match(portal, /if \(legacyOtpMode\)[\s\S]+fetchClientOtpSigningByToken\(token\)/)
assert.match(portal, /if \(legacyOtpMode\)[\s\S]+submitClientOtpSignature/)
assert.match(portal, /else \{[\s\S]+completeSignerSigning\(\{ token \}\)/)

const adapter = fs.readFileSync('src/core/documents/signingSessionPortalAdapter.js', 'utf8')
for (const token of [
  'adaptCanonicalSigningSessionToPortal',
  'assertCanonicalSigningSession',
  'canonicalSigningSession',
  'documentPreviewUrl',
  'sessionBinding',
  'completePortalSessionField',
]) assert.match(adapter, new RegExp(token))

const legacyOtp = fs.readFileSync('src/pages/ClientOtpSigning.jsx', 'utf8')
assert.match(legacyOtp, /function ClientOtpSigning/)

const api = fs.readFileSync('src/lib/api.js', 'utf8')
const otpStart = api.indexOf('export async function fetchClientOtpSigningByToken')
const otpEnd = api.indexOf('export async function submitClientOtpSignature', otpStart)
const otpSession = api.slice(otpStart, otpEnd)
for (const token of ['x: 72', 'y: 700', 'width: 180', 'height: 48']) assert.match(otpSession, new RegExp(token))

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.ok(pkg.scripts?.['test:document-generator-phase-j2'])

console.log('Document generator J2 unified SignerPortal contract passed.')
