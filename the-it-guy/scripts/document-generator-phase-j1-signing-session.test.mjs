import assert from 'node:assert/strict'
import fs from 'node:fs'

const contract = fs.readFileSync('src/core/documents/signingSessionContract.js', 'utf8')
for (const token of [
  'arch9-signing-session-v1',
  'exact-pdf-version-v1',
  'normalizeSigningRole',
  'buildCanonicalSigningSession',
  'assertCanonicalSigningSession',
  'exactVersionBound',
  'bindingKey',
  'fieldSummary',
  'signingOrder',
]) assert.match(contract, new RegExp(token))

const edge = fs.readFileSync('../supabase/functions/resolve-signer-token/index.ts', 'utf8')
for (const token of [
  'SIGNING_SESSION_CONTRACT',
  'SIGNING_DOCUMENT_BINDING_CONTRACT',
  'signingSession',
  'sessionId',
  'exactVersionBound: true',
  'pdfPath',
  'pdfSha256',
  'signingOrderResult',
]) assert.match(edge, new RegExp(token))
assert.match(edge, /signingSession,[\s\S]+session:/)
assert.match(edge, /versionId: String\(version\.id/)
assert.match(edge, /documentId: normalizeText\(version\.rendered_document_id\)/)

const api = fs.readFileSync('src/lib/api.js', 'utf8')
const otpStart = api.indexOf('export async function fetchClientOtpSigningByToken')
const otpEnd = api.indexOf('export async function submitClientOtpSignature', otpStart)
const otpSigning = api.slice(otpStart, otpEnd)
assert.match(otpSigning, /buildCanonicalSigningSession/)
assert.match(otpSigning, /type: 'otp'/)
assert.match(otpSigning, /role: 'purchaser_1'/)
assert.match(otpSigning, /exactVersionBound: true/)
assert.match(otpSigning, /signingSession,/)

const client = fs.readFileSync('src/lib/externalSigningApi.js', 'utf8')
assert.match(client, /assertCanonicalSigningSession/)
assert.match(client, /data\?\.signingSession \|\| data\?\.signing_session/)
assert.match(client, /return \{[\s\S]+signingSession,/)

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.ok(pkg.scripts?.['test:document-generator-phase-j1'])

console.log('Document generator J1 canonical signing-session contract passed.')
