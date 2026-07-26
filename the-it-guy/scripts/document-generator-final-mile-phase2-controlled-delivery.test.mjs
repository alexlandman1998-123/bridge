import assert from 'node:assert/strict'
import fs from 'node:fs'

const detectorPath = '../supabase/functions/send-email/utils/controlledTestRecipient.ts'
const dispatchPath = '../supabase/functions/dispatch-final-signed-document/index.ts'
const detector = fs.readFileSync(detectorPath, 'utf8')
const dispatch = fs.readFileSync(dispatchPath, 'utf8')
const audit = fs.readFileSync('docs/audits/document-generator-final-mile-phase-2.md', 'utf8')

for (const reference of [
  'domain === "example.com"',
  'domain === "example.net"',
  'domain === "example.org"',
  'domain === "example.test"',
  'domain.endsWith(".test")',
  'normalizedEmail.endsWith(".invalid")',
]) {
  assert.ok(detector.includes(reference), `controlled recipient detector should keep ${reference}`)
}

assert.match(dispatch, /if \(recipientSafety\.suppressed\) \{/)
assert.match(dispatch, /status = "sent";/)
assert.match(dispatch, /providerMessageId = `suppressed:\$\{recipientSafety\.reason\}:\$\{signerId\}`;/)
assert.match(dispatch, /errorCode = "";/)

const suppressedBlock = dispatch.slice(
  dispatch.indexOf('if (recipientSafety.suppressed) {'),
  dispatch.indexOf('} else {', dispatch.indexOf('if (recipientSafety.suppressed) {')),
)
assert.doesNotMatch(suppressedBlock, /handleSellerMandateSignedEmail/, 'suppressed recipients must not call the provider email handler')
assert.match(dispatch, /suppressed: providerMessageId\.startsWith\("suppressed:"\)/)

for (const reference of [
  'Smoke tests must not send real email',
  "`status='sent'`",
  'suppressed:controlled_test_recipient:<signer-id>',
  'Real recipients still require provider-accepted email evidence.',
]) {
  assert.ok(audit.includes(reference), `Phase 2 audit should keep: ${reference}`)
}

console.log('document-generator final-mile Phase 2 controlled delivery passed.')
