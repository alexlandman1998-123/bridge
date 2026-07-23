import assert from 'node:assert/strict'
import fs from 'node:fs'

const app = fs.readFileSync('src/App.jsx', 'utf8')
assert.match(app, /path="\/client\/:token\/otp-signing"[\s\S]{0,300}<LegacyOtpSigningRedirect/)
assert.match(app, /function LegacyOtpSigningRedirect\(\)[\s\S]{0,300}\/client\/\$\{encodeURIComponent\(safeToken\)\}\/documents/)
assert.doesNotMatch(app, /<SignerPortal sessionSource="legacy-otp"/)
assert.doesNotMatch(app, /const ClientOtpSigning = lazy/)

const portal = fs.readFileSync('src/pages/SignerPortal.jsx', 'utf8')
for (const token of [
  'fetchClientOtpSigningByToken',
  'adaptCanonicalSigningSessionToPortal',
  'submitClientOtpSignature',
  'legacyOtpSignatureDataUrl',
  'completePortalSessionField',
  'legacyOtpMode',
  'sessionSource',
]) assert.doesNotMatch(portal, new RegExp(token.replace(/[()]/g, '\\$&')))
assert.match(portal, /resolveExternalSignerSession\(\{ token \}\)/)
assert.match(portal, /completeSignerSigning\(\{ token \}\)/)

const adapter = fs.readFileSync('src/core/documents/signingSessionPortalAdapter.js', 'utf8')
for (const token of [
  'adaptCanonicalSigningSessionToPortal',
  'assertCanonicalSigningSession',
  'canonicalSigningSession',
  'documentPreviewUrl',
  'sessionBinding',
  'completePortalSessionField',
]) assert.match(adapter, new RegExp(token))

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.ok(pkg.scripts?.['test:document-generator-phase-j2'])

console.log('Document generator legacy OTP signer containment passed.')
