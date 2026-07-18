import assert from 'node:assert/strict'
import fs from 'node:fs'

const config = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8'))
const source = fs.readFileSync('scripts/legal-document-phase4-cohort-readiness.mjs', 'utf8')
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

assert.equal(config.enabled, false, 'A1 must leave production generation disabled.')
assert.ok(config.cohortPreparation?.candidateOrganisationIds?.length, 'A1 must record at least one candidate organisation UUID.')
assert.ok(config.cohortPreparation.candidateOrganisationIds.every((id) => uuid.test(id)), 'A1 candidate IDs must be UUIDs.')
assert.ok(config.cohortPreparation.candidateOrganisationIds.length <= config.limits.maxOrganisations, 'A1 cohort exceeds its safety limit.')
assert.ok(config.organisationIds.every((id) => config.cohortPreparation.candidateOrganisationIds.includes(id)), 'The effective allowlist must remain within the A1 candidate cohort.')
assert.deepEqual([...config.cohortPreparation.requiredPacketTypes].sort(), ['mandate', 'otp'])
assert.equal(config.cohortPreparation.requirePreferredTransferAttorney, true)
assert.match(source, /ACTIVE_AGENT_MISSING/)
assert.match(source, /PREFERRED_TRANSFER_ATTORNEY_MISSING/)
assert.match(source, /TEMPLATE_MISSING/)
assert.match(source, /mutatedData: false/)
assert.doesNotMatch(source, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)

console.log('Legal document Phase A1 cohort-preparation contract passed')
