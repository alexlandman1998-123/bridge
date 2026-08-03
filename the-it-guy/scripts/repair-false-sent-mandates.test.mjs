import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./repair-false-sent-mandates.mjs', import.meta.url), 'utf8')

for (const token of [
  '--apply',
  '--allow-non-staging',
  'isdowlnollckzvltkasn',
  'This repair is restricted to canonical staging unless --allow-non-staging is provided.',
  'hasConfirmedSendJob',
  'hasSignerDeliveryEvidence',
  'hasDeliveryEvidence',
  'Data Repair',
  'False mandate sent state repaired',
  'remainingCandidateCount',
]) {
  assert.ok(source.includes(token), `Repair script must include guardrail token: ${token}`)
}

assert.match(
  source,
  /mode: args\.apply \? 'apply' : 'dry-run'/,
  'Repair script should report dry-run mode by default and apply mode only behind --apply.',
)
assert.match(
  source,
  /if \(!args\.allowNonStaging\) \{[\s\S]+supabaseUrl\.includes\('isdowlnollckzvltkasn'\)/,
  'Repair script should refuse non-staging targets unless explicitly overridden.',
)
assert.match(
  source,
  /function isFalseSentCandidate\(\{ lead, packet, signers, jobs, listings \}\) \{[\s\S]+if \(!packet\?\.id \|\| hasDeliveryEvidence\(\{ packet, signers, jobs \}\)\) return false/,
  'Candidate detection should reject rows that already have confirmed delivery evidence.',
)
assert.match(
  source,
  /function hasDeliveryEvidence\(\{ packet, signers, jobs \}\) \{[\s\S]+packet\?\.sent_at[\s\S]+sourceContext\.mandateSentAt[\s\S]+signers\.some\(hasSignerDeliveryEvidence\)[\s\S]+jobs\.some\(hasConfirmedSendJob\)/,
  'Delivery evidence should require durable packet, signer, source-context, or confirmed send-job proof.',
)
assert.match(
  source,
  /const nextLead = generated[\s\S]+\? \{ stage: 'Mandate Sent', status: 'Draft' \}[\s\S]+: \{ stage: 'Seller Onboarding Submitted', status: 'Submitted' \}/,
  'Repair plan should distinguish generated packets from still-draft packets.',
)
assert.match(
  source,
  /const nextPacketStatus = generated \? 'generated' : 'draft'[\s\S]+const listingMandateStatus = generated \? 'generated' : 'in_progress'/,
  'Repair plan should keep packet and listing states aligned with generated versus draft reality.',
)
assert.match(
  source,
  /if \(args\.apply\) \{[\s\S]+await applyPlan\(client, plan\)[\s\S]+\}/,
  'Repair script should only mutate data inside the explicit --apply branch.',
)

console.log('False sent mandate repair contract passed.')
