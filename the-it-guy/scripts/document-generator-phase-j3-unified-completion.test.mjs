import assert from 'node:assert/strict'
import fs from 'node:fs'

const portal = fs.readFileSync('src/pages/SignerPortal.jsx', 'utf8')
for (const token of [
  'SigningCompleteScreen',
  'buildSigningCompletion',
  'Open completed PDF',
  'Reopening this link will continue to show this confirmation',
  'result?.completion',
]) assert.match(portal, new RegExp(token.replace(/[?.()]/g, '\\$&')))

const api = fs.readFileSync('src/lib/api.js', 'utf8')
for (const token of [
  'resolveLatestSignedOtpDocumentForTransaction',
  'OTP_DOCUMENT_TYPES.signedFinal',
  'buildSigningCompletion',
  'signedOtpPdfUrl',
]) assert.match(api, new RegExp(token.replace(/[.]/g, '\\.')))

const resolver = fs.readFileSync('../supabase/functions/resolve-signer-token/index.ts', 'utf8')
assert.match(resolver, /\["sent", "viewed", "signed"\]/)
assert.match(resolver, /if \(!signerAlreadyCompleted\)/)
assert.match(resolver, /SIGNING_COMPLETION_CONTRACT/)
assert.match(resolver, /finalSignedUrl/)
assert.match(resolver, /completion,/)

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.ok(pkg.scripts?.['test:document-generator-phase-j3'])

console.log('Document generator J3 unified completion contract passed.')
