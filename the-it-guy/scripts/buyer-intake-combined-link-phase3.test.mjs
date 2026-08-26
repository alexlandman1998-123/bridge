import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const pageSource = await readFile(new URL('../src/pages/BuyerViewingPreferencesPage.jsx', import.meta.url), 'utf8')
const functionSource = await readFile(new URL('../../supabase/functions/buyer-viewing-preferences/index.ts', import.meta.url), 'utf8')
const requestEmailSource = await readFile(new URL('../../supabase/functions/send-email/content/viewingAvailabilityRequest.ts', import.meta.url), 'utf8')
const confirmationEmailSource = await readFile(new URL('../../supabase/functions/send-email/handlers/buyerViewingAvailabilityConfirmation.ts', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:buyer-intake-combined-link-phase3'],
  'node scripts/buyer-intake-combined-link-phase3.test.mjs',
  'package.json should expose the buyer intake combined-link Phase 3 contract.',
)

for (const token of [
  /BUYER_INTAKE_QUALIFICATION_FIELDS/,
  /buildBuyerQualificationIntake/,
  /Quick buyer details/,
  /Share a few details, then choose 3 viewing times/,
  /Send details and 3 viewing times/,
]) {
  assert.match(pageSource, token, `buyer page should include ${token}`)
}

for (const token of [
  /BUYER_INTAKE_QUALIFICATION_FIELDS/,
  /buildBuyerQualificationIntake/,
  /buyerIntake/,
  /qualificationAnswers/,
  /Buyer qualification/,
  /buildBuyerIntakeNotes/,
]) {
  assert.match(functionSource, token, `buyer viewing preference edge function should include ${token}`)
}

for (const token of [
  /Share a few details, then choose 3 viewing times\./,
  /Share details and 3 viewing times/,
  /five minutes/,
  /buyer questions/i,
  /Select 3 viewing times/,
]) {
  assert.match(requestEmailSource, token, `buyer viewing request email should include ${token}`)
}

for (const token of [
  /Thanks, we have your details and viewing times/,
  /Details and Viewing Times Received/,
  /details and preferred viewing times/,
]) {
  assert.match(confirmationEmailSource, token, `buyer confirmation email should include ${token}`)
}

console.log('buyer intake combined link Phase 3 contract passed')
