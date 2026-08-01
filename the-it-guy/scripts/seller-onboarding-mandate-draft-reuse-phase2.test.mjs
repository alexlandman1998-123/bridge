import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pageSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

function assertIncludes(source, needle, label) {
  assert.ok(source.includes(needle), `${label} is missing: ${needle}`)
}

function assertMatches(source, pattern, label) {
  assert.match(source, pattern, `${label} did not match ${pattern}`)
}

assert.equal(
  packageJson.scripts?.['test:seller-onboarding-mandate-draft-reuse-phase2'],
  'node scripts/seller-onboarding-mandate-draft-reuse-phase2.test.mjs',
)

for (const token of [
  'resolvePhase2FrozenMandateDraftReuse',
  'phase2_frozen_draft_reuse',
  'Using prepared mandate draft',
  'Reusing frozen mandate source',
  'phase2DraftReuse',
  'sourceHash',
  'renderFreeze',
]) {
  assertIncludes(pageSource, token, 'Phase 2 agency mandate reuse')
}

assertMatches(
  pageSource,
  /const phase2DraftReuse = resolvePhase2FrozenMandateDraftReuse[\s\S]+manualOverride: providedManualOverride/,
  'Generate mandate should inspect the precreated frozen draft before remapping',
)

assertMatches(
  pageSource,
  /if \(phase2DraftReuse\) \{[\s\S]+templateResolution = \{[\s\S]+source: 'phase2_frozen_draft_reuse'[\s\S]+onProgress\?\.\('Using prepared mandate draft/,
  'A matching frozen draft should skip template resolution and use stored template metadata',
)

assertMatches(
  pageSource,
  /if \(packet\?\.id && !providedRenderFreeze && !phase2DraftReuse && !findEditableMandateSourceVersion/,
  'A reused frozen draft should not create another editable packet when compact packet rows omit versions',
)

assertMatches(
  pageSource,
  /const packetRow = Array\.isArray\(existingPackets\)[\s\S]+fetchDocumentPacket\(packetRow\.id,[\s\S]+includeVersions: true/,
  'Lead-scoped existing packet lookup must hydrate versions before testing editable draft reuse',
)

assertMatches(
  pageSource,
  /draftReadyOnly[\s\S]+Mandate Draft Ready[\s\S]+buildMandateDraftReadyStatus/,
  'A frozen editable draft should be treated as usable when downstream PDF confirmation fails',
)

assertMatches(
  pageSource,
  /let renderFreeze = providedRenderFreeze[\s\S]+phase2DraftReuse\?\.renderFreeze/,
  'Generate mandate should reuse the Phase 1 render freeze',
)

for (const token of [
  'buildPhase2FrozenDraftReusePreparation',
  'phase2DraftReusePreparation',
  'context?.phase2DraftReuse',
  "templateResolutionSource: 'phase2_frozen_draft_reuse'",
]) {
  assertIncludes(packetServiceSource, token, 'Phase 2 packet service frozen draft reuse')
}

assertMatches(
  packetServiceSource,
  /if \(!phase2DraftReusePreparation && \['otp', 'mandate'\]\.includes\(normalizedPacketType\)\)/,
  'Packet service should skip template preflight resolution for a trusted frozen draft',
)

assertMatches(
  packetServiceSource,
  /const prepared = phase2DraftReusePreparation \|\| await savePacketDraft/,
  'Packet service should skip savePacketDraft when Phase 2 reuse is active',
)

console.log('Seller onboarding mandate draft reuse phase 2 contract passed.')
