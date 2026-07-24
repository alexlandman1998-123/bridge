import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const doc = await readFile(new URL('../../docs/legal-template-platform-defaults-phase1.md', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:legal-template-platform-defaults-phase1'],
  'node scripts/legal-template-platform-defaults-phase1.test.mjs',
  'package.json should expose the Phase 1 platform-defaults contract.',
)

for (const token of [
  'Ultron provides platform-owned, legally approved default legal templates',
  'without first uploading, editing, publishing, or approving their own OTP or mandate template',
  '`otp_default_v1`',
  '`mandate_default_v1`',
  'must not override the approved platform default',
  'Mandate smart logic is seller and agency focused',
  'OTP smart logic is transaction-party focused',
]) {
  assert.ok(doc.includes(token), `Phase 1 decision record should include: ${token}`)
}

console.log('Legal template platform defaults Phase 1 contract passed.')
