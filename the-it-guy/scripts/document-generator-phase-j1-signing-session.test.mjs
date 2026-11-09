import { assertRetiredDocumentEndpoint } from './helpers/retiredDocumentContracts.mjs'
import { readDomainApiSource } from './helpers/domainApiSource.mjs'
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

// The reusable session contract remains, but public legacy signing is retired.
await assertRetiredDocumentEndpoint('resolve-signer-token')
const otpSigning = readDomainApiSource()
assert.match(otpSigning, /export async function fetchClientOtpSigningByToken[\s\S]*?throw new Error\(PHASE0_LEGACY_OTP_SIGNING_DISABLED\)/)

const client = fs.readFileSync('src/lib/externalSigningApi.js', 'utf8')
assert.match(client, /assertCanonicalSigningSession/)
assert.match(client, /data\?\.signingSession \|\| data\?\.signing_session/)
assert.match(client, /return \{[\s\S]+signingSession,/)

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.ok(pkg.scripts?.['test:document-generator-phase-j1'])

console.log('Document generator J1 canonical signing-session contract passed.')
