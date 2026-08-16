import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const repoRoot = resolve(appRoot, '..')

const apiSource = readFileSync(resolve(appRoot, 'src/lib/api.js'), 'utf8')
const clientOnboardingEmailSource = readFileSync(
  resolve(repoRoot, 'supabase/functions/send-email/handlers/clientOnboarding.ts'),
  'utf8',
)

assert.match(
  apiSource,
  /async function fetchDevelopmentBrandContext\(client, developmentId\)[\s\S]*\.from\('developments'\)[\s\S]*organisation_id/,
  'Buyer onboarding portal context must load the development owner organisation.',
)

assert.match(
  apiSource,
  /developmentOrganisationId && developmentOrganisationId !== normalizedOrganisationId[\s\S]*fetchOrganisationBrandContext\(client, developmentOrganisationId\)/,
  'Buyer onboarding portal branding must prefer development organisation branding when it differs from the transaction organisation.',
)

assert.match(
  apiSource,
  /brandingOrganisation: brandingOrganisation \|\| transactionOrganisation/,
  'Buyer onboarding context must expose the resolved branding organisation.',
)

assert.match(
  apiSource,
  /brandingSource:[\s\S]*'development_organisation'[\s\S]*'transaction_organisation'/,
  'Buyer onboarding context must expose the branding source for diagnostics.',
)

assert.match(
  apiSource,
  /branding: normalizeBuyerOnboardingBranding\(\{[\s\S]*organisation: brandingOrganisation \|\| organisation,[\s\S]*brandingSource,/,
  'Buyer onboarding payload must render from the resolved branding organisation, not always the transaction organisation.',
)

assert.match(
  clientOnboardingEmailSource,
  /async function loadDevelopmentBrandContext\([\s\S]*\.from\("developments"\)[\s\S]*organisation_id/,
  'Buyer onboarding email handler must load the development owner organisation.',
)

assert.match(
  clientOnboardingEmailSource,
  /const developmentOrganisationId = normalizeText\([\s\S]*developmentContext\?\.organisation_id[\s\S]*const organisationId = developmentOrganisationId \|\| transactionOrganisationId/,
  'Buyer onboarding email handler must prefer development organisation id for branding and template lookup.',
)

assert.match(
  clientOnboardingEmailSource,
  /resolveEmailBranding\(\{[\s\S]*organisationId,[\s\S]*organisationName,[\s\S]*supportEmail,[\s\S]*supportPhone,/,
  'Buyer onboarding email branding must resolve against the selected organisation id.',
)

assert.match(
  clientOnboardingEmailSource,
  /brandingSource,[\s\S]*brandingOrganisationId: organisationId \|\| null,[\s\S]*transactionOrganisationId: transactionOrganisationId \|\| null,[\s\S]*developmentOrganisationId: developmentOrganisationId \|\| null,/,
  'Buyer onboarding email delivery metadata must record the branding organisation decision.',
)

console.log('developer transaction routing phase 5 test passed')
