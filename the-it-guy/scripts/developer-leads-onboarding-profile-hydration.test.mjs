import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const serviceSource = await readFile(new URL('../src/services/developerLeadService.js', import.meta.url), 'utf8')
const pageSource = await readFile(new URL('../src/pages/DeveloperLeadsPage.jsx', import.meta.url), 'utf8')

assert.match(
  serviceSource,
  /const ONBOARDING_FORM_DATA_SELECT = \[/,
  'developer lead service should define an onboarding form-data projection',
)

assert.match(
  serviceSource,
  /\.from\('onboarding_form_data'\)[\s\S]*?\.in\('transaction_id', ids\)/,
  'developer lead service should fetch onboarding form data by converted transaction ids',
)

assert.match(
  serviceSource,
  /onboardingFormData:\s*onboardingByTransactionId\.get\(row\.converted_transaction_id\) \|\| null/,
  'developer lead mapper should attach onboarding form data to lead rows',
)

assert.match(
  pageSource,
  /function getLeadOnboardingFormData\(lead = \{\}\)/,
  'developer lead workspace should read submitted onboarding form data',
)

assert.match(
  pageSource,
  /function buildDeveloperLeadOnboardingProfile\(/,
  'developer lead workspace should build profile sections from onboarding answers',
)

assert.match(
  pageSource,
  /Submitted buyer onboarding/,
  'buyer profile tab should label when fields come from submitted onboarding',
)

assert.match(
  pageSource,
  /These fields are populated from the submitted buyer onboarding\./,
  'buyer profile tab should make the submitted onboarding source visible',
)

assert.match(
  pageSource,
  /Submitted Finance Setup/,
  'transaction setup tab should surface finance answers submitted during onboarding',
)

console.log('developer leads onboarding profile hydration test passed')
