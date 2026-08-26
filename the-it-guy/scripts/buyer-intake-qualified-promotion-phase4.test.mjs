import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const functionSource = await readFile(new URL('../../supabase/functions/buyer-viewing-preferences/index.ts', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:buyer-intake-qualified-promotion-phase4'],
  'node scripts/buyer-intake-qualified-promotion-phase4.test.mjs',
  'package.json should expose the buyer intake qualified promotion Phase 4 contract.',
)

for (const token of [
  /qualificationComplete = nextIntake\.qualification\?\.complete === true/,
  /leadPatch\.stage = "Viewing"/,
  /leadPatch\.status = "Viewing"/,
  /Qualification complete:/,
  /Buyer qualified and viewing times received/,
  /Qualification progress:/,
]) {
  assert.match(functionSource, token, `buyer viewing preference edge function should include ${token}`)
}

console.log('buyer intake qualified promotion Phase 4 contract passed')
