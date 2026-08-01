import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'

const apiSource = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')
const onboardingPageSource = await readFile(new URL('../src/pages/ClientOnboarding.jsx', import.meta.url), 'utf8')
const migrationsDirectory = new URL('../../supabase/migrations/', import.meta.url)
const migrationFiles = (await readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort()
const migrations = await Promise.all(
  migrationFiles.map(async (file) => ({
    file,
    source: await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'),
  })),
)

function getFunctionDefinitions(source = '') {
  const starts = [...source.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)\s*\(/gi)]
  return starts.map((match, index) => ({
    name: match[1],
    source: source.slice(match.index, starts[index + 1]?.index),
  }))
}

const functions = migrations.flatMap(({ file, source }) =>
  getFunctionDefinitions(source).map((definition) => ({ ...definition, file })),
)

function findSingleRpc(label, predicate) {
  const matches = functions.filter(predicate)
  assert.equal(
    matches.length,
    1,
    `${label} must be defined once so the frontend and database stay on one access contract; found ${matches.map((item) => item.name).join(', ') || 'none'}`,
  )
  return matches[0]
}

function functionBody(source, name) {
  const start = source.search(new RegExp(`(?:export\\s+)?async\\s+function\\s+${name}\\s*\\(`))
  assert.notEqual(start, -1, `expected ${name} in api.js`)
  const next = source.slice(start + 1).search(/\n(?:export\s+)?async function\s+|\nfunction\s+/)
  return source.slice(start, next === -1 ? undefined : start + next + 1)
}

const portalRpc = findSingleRpc(
  'buyer onboarding portal bridge RPC',
  ({ name, source }) =>
    /onboarding/i.test(name) &&
    /portal|client/i.test(name) &&
    /client_portal_links/i.test(source) &&
    /security\s+definer/i.test(source),
)

const snapshotRpc = findSingleRpc(
  'buyer onboarding snapshot save RPC',
  ({ name, source }) =>
    /onboarding/i.test(name) &&
    /save|snapshot|persist/i.test(name) &&
    /onboarding_form_data/i.test(source) &&
    /security\s+definer/i.test(source),
)

const snapshotTokenFenceMigration = migrations.find(
  ({ file }) => file === '202607230007_buyer_onboarding_snapshot_token_fence.sql',
)
assert.ok(
  snapshotTokenFenceMigration,
  'the snapshot RPC must have a follow-up token-response fence for already-migrated databases',
)
const snapshotTokenFenceFacade = getFunctionDefinitions(snapshotTokenFenceMigration.source).find(
  ({ name }) => name === 'bridge_save_buyer_onboarding_snapshot',
)
assert.ok(
  snapshotTokenFenceFacade,
  'the token-response fence must recreate the public snapshot RPC with its existing signature',
)

assert.match(
  portalRpc.source,
  /from\s+public\.transaction_onboarding/i,
  'portal bridge must resolve the transaction through transaction_onboarding',
)
assert.match(
  portalRpc.source,
  /bridge_onboarding_request_token\s*\(\s*\)|p_[a-z_]*onboarding[a-z_]*token|p_token\b|current_setting\s*\([^)]*x-bridge-onboarding-token/i,
  'portal bridge must bind the onboarding bearer token to its own transaction before resolving a portal link',
)
assert.match(
  portalRpc.source,
  /is_active\s*(?:=|is\s+true)/i,
  'portal bridge must reject inactive onboarding links',
)
assert.match(
  portalRpc.source,
  /insert\s+into\s+public\.client_portal_links/i,
  'portal bridge must create a missing portal link inside the server-side token boundary',
)
assert.doesNotMatch(
  portalRpc.source,
  /to_jsonb\s*\(\s*v_transaction\s*\)/i,
  'portal bridge must return an allowlisted payload rather than a raw transaction row',
)

assert.match(
  snapshotRpc.source,
  /from\s+public\.transaction_onboarding/i,
  'snapshot save must resolve the linked transaction through transaction_onboarding',
)
assert.match(
  snapshotRpc.source,
  /bridge_onboarding_request_token\s*\(\s*\)|p_[a-z_]*onboarding[a-z_]*token|p_token\b|current_setting\s*\([^)]*x-bridge-onboarding-token/i,
  'snapshot save must validate the onboarding bearer token server-side',
)
assert.match(
  snapshotRpc.source,
  /insert\s+into\s+public\.onboarding_form_data/i,
  'snapshot save must persist onboarding form data through the token-bound RPC',
)
assert.match(
  snapshotRpc.source,
  /public\.transactions/i,
  'snapshot save must own the linked transaction snapshot update instead of relying on bearer-token table updates',
)
assert.match(
  snapshotRpc.source,
  /public\.transaction_funding_sources/i,
  'snapshot save must own funding-source persistence inside the token boundary',
)
assert.doesNotMatch(
  snapshotRpc.source,
  /'token'\s*,\s*v_onboarding\.token/i,
  'a fresh snapshot implementation must not return the onboarding bearer token',
)

assert.match(
  snapshotTokenFenceMigration.source,
  /alter\s+function\s+public\.bridge_save_buyer_onboarding_snapshot\s*\([\s\S]*?rename\s+to\s+bridge_save_buyer_onboarding_snapshot_internal/i,
  'the response fence must move the prior implementation behind a non-RPC name',
)
assert.match(
  snapshotTokenFenceMigration.source,
  /revoke\s+all\s+on\s+function\s+public\.bridge_save_buyer_onboarding_snapshot_internal\s*\([\s\S]*?from\s+public\s*,\s*anon\s*,\s*authenticated/i,
  'the internal snapshot implementation must not remain callable by browser roles',
)
assert.match(
  snapshotTokenFenceFacade.source,
  /bridge_save_buyer_onboarding_snapshot_internal\s*\(/i,
  'the public snapshot facade must preserve the existing implementation contract',
)
assert.match(
  snapshotTokenFenceFacade.source,
  /return\s+v_result\s*#-\s*'\{onboarding,token\}'/i,
  'the public snapshot facade must remove the onboarding token for every caller',
)
assert.doesNotMatch(
  snapshotTokenFenceFacade.source,
  /v_onboarding\.token/i,
  'the public snapshot facade must not reconstruct or echo an onboarding token',
)

for (const rpc of [portalRpc, snapshotRpc]) {
  const migration = migrations.find((item) => item.file === rpc.file)
  assert.ok(migration, `missing migration source for ${rpc.name}`)
  assert.match(
    migration.source,
    new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${rpc.name}\\s*\\(`, 'i'),
    `${rpc.name} must start from no public execute grant`,
  )
  assert.match(
    migration.source,
    new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${rpc.name}\\s*\\([\\s\\S]*?\\)\\s+to\\s+anon,\\s*authenticated`, 'i'),
    `${rpc.name} must be callable by the scoped onboarding client only`,
  )
}

const onboardingTransactionSelectPolicy = migrations.find(({ source }) =>
  /create\s+policy\s+[a-z0-9_]+\s+on\s+public\.transactions[\s\S]{0,1600}?for\s+select[\s\S]{0,1600}?to\s+anon\s*,\s*authenticated[\s\S]{0,1600}?bridge_has_onboarding_token_transaction_access\s*\(\s*id\s*\)/i.test(
    source,
  ),
)
assert.ok(
  onboardingTransactionSelectPolicy,
  'transactions must have an anon/authenticated SELECT policy scoped to bridge_has_onboarding_token_transaction_access(id)',
)

assert.match(
  apiSource,
  new RegExp(`\\.rpc\\(\\s*['\"]${portalRpc.name}['\"]`, 'i'),
  'the browser onboarding API must invoke the secure portal bridge RPC',
)
assert.match(
  apiSource,
  new RegExp(`\\.rpc\\(\\s*['\"]${snapshotRpc.name}['\"]`, 'i'),
  'the browser onboarding API must invoke the secure snapshot-save RPC',
)

const fetchOnboardingSource = functionBody(apiSource, 'fetchClientOnboardingByToken')
const saveOnboardingSource = functionBody(apiSource, 'upsertClientOnboardingForm')
const replayProjectionSource = functionBody(apiSource, 'replayBuyerOnboardingProjections')
const snapshotSaveWrapperSource = functionBody(apiSource, 'syncOnboardingTransactionFinanceSnapshot')
const onboardingPortalAccessWrapperSource = functionBody(apiSource, 'getBuyerOnboardingPortalAccess')

assert.match(
  onboardingPortalAccessWrapperSource,
  new RegExp(`\\.rpc\\(\\s*['\"]${portalRpc.name}['\"]`, 'i'),
  'the onboarding portal-access wrapper must invoke the secure portal bridge RPC',
)
assert.doesNotMatch(
  onboardingPortalAccessWrapperSource,
  /\.from\(\s*['\"]client_portal_links['\"]\s*\)/,
  'the onboarding portal-access wrapper must not query client_portal_links directly',
)

assert.match(
  snapshotSaveWrapperSource,
  new RegExp(`\\.rpc\\(\\s*['\"]${snapshotRpc.name}['\"]`, 'i'),
  'the onboarding snapshot wrapper must invoke the token-bound snapshot-save RPC',
)
assert.doesNotMatch(
  snapshotSaveWrapperSource,
  /\.from\(\s*['\"](?:transactions|onboarding_form_data|transaction_funding_sources)['\"]\s*\)/,
  'the onboarding snapshot wrapper must not fall back to direct bearer-token table writes',
)

for (const [label, source] of [
  ['onboarding load', fetchOnboardingSource],
  ['onboarding save', saveOnboardingSource],
]) {
  assert.doesNotMatch(
    source,
    /\.from\(\s*['\"]client_portal_links['\"]\s*\)/,
    `${label} must not query client_portal_links with an onboarding token`,
  )
  assert.doesNotMatch(
    source,
    /getOrCreateClientPortalLinkRecord\s*\(/,
    `${label} must not create portal links client-side with an onboarding token`,
  )
}

assert.match(
  fetchOnboardingSource,
  /getBuyerOnboardingPortalAccess\s*\(/,
  'onboarding load must resolve the client portal through the safe bridge path',
)
assert.match(
  saveOnboardingSource,
  /syncOnboardingTransactionFinanceSnapshot\s*\(/,
  'onboarding save must persist through the guarded snapshot wrapper',
)
const platformFeeValidationIndex = saveOnboardingSource.indexOf("isPlatformFeeConsentAccepted(formDataForPersistence, 'buyer')")
const snapshotSaveIndex = saveOnboardingSource.indexOf('syncOnboardingTransactionFinanceSnapshot')
assert.ok(
  platformFeeValidationIndex !== -1 && platformFeeValidationIndex < snapshotSaveIndex,
  'buyer platform fee consent must be validated before the atomic onboarding snapshot is saved',
)
assert.match(
  saveOnboardingSource,
  /try\s*\{[\s\S]*ensureTransactionRequiredDocuments\s*\([\s\S]*\}\s*catch\s*\(\s*requiredDocumentsError\s*\)/,
  'required-document projection after snapshot save must be best-effort',
)
assert.match(
  saveOnboardingSource,
  /try\s*\{[\s\S]*acceptBuyerPlatformFeeConsent\s*\([\s\S]*\}\s*catch\s*\(\s*platformFeeConsentError\s*\)/,
  'platform-fee consent persistence after snapshot save must be best-effort',
)
assert.match(
  saveOnboardingSource,
  /try\s*\{[\s\S]*document_key['"]\s*,\s*['"]information_sheet[\s\S]*\}\s*catch\s*\(\s*informationSheetError\s*\)/,
  'information-sheet projection after snapshot save must be best-effort',
)
assert.match(
  saveOnboardingSource,
  /try\s*\{[\s\S]*markTransactionAwaitingSignedOtp\s*\([\s\S]*\}\s*catch\s*\(\s*otpProjectionError\s*\)/,
  'awaiting-signed-OTP projection after snapshot save must be best-effort',
)
assert.doesNotMatch(
  saveOnboardingSource,
  /throw\s+(requiredDocumentsError|platformFeeConsentError|informationSheetError|roleplayerRequestError|workflowEvidenceError|otpProjectionError|financeEventError)\b/,
  'post-snapshot buyer onboarding projections must not throw client-facing submit failures',
)
assert.match(
  apiSource,
  /function\s+buildBuyerOnboardingProjectionFailurePayload\s*\([\s\S]*source:\s*'buyer_onboarding_projection_recovery_marker'[\s\S]*errorCategory:[\s\S]*errorCode:/,
  'buyer onboarding projection failures must create sanitized recovery marker payloads',
)
assert.match(
  apiSource,
  /async\s+function\s+recordBuyerOnboardingProjectionFailureMarker\s*\([\s\S]*logTransactionEventIfPossible[\s\S]*catch\s*\(\s*markerError\s*\)/,
  'buyer onboarding recovery marker logging must never create another client-facing failure',
)
for (const eventType of [
  'buyer_onboarding_required_documents_projection_failed',
  'buyer_onboarding_platform_fee_consent_projection_failed',
  'buyer_onboarding_information_sheet_projection_failed',
  'buyer_onboarding_roleplayer_projection_failed',
  'buyer_onboarding_workflow_evidence_projection_failed',
  'buyer_onboarding_awaiting_signed_otp_projection_failed',
  'buyer_onboarding_finance_event_projection_failed',
]) {
  assert.match(
    saveOnboardingSource,
    new RegExp(`eventType:\\s*['"]${eventType}['"]`),
    `${eventType} recovery marker must be recorded when its projection fails`,
  )
}
assert.match(
  apiSource,
  /const\s+BUYER_ONBOARDING_PROJECTION_REPAIR_EVENT_TYPES\s*=\s*\{[\s\S]*required_documents:[\s\S]*platform_fee_consent:[\s\S]*information_sheet:[\s\S]*roleplayer:[\s\S]*workflow_evidence:[\s\S]*awaiting_signed_otp:[\s\S]*finance_event:/,
  'buyer onboarding repair path must define every recovery marker as a replayable projection',
)
assert.match(
  replayProjectionSource,
  /resolveActiveProfileContext\s*\([\s\S]*\['agent', 'agency_admin', 'developer', 'internal_admin', 'admin', 'platform_admin'\]/,
  'buyer onboarding projection replay must be restricted to internal roles',
)
assert.match(
  replayProjectionSource,
  /resolveBuyerOnboardingProjectionRepairTargets\s*\([\s\S]*useRecoveryMarkers/,
  'buyer onboarding projection replay must be able to target projections from recovery markers',
)
for (const marker of [
  'ensureTransactionRequiredDocuments',
  'acceptBuyerPlatformFeeConsent',
  'processBuyerAppointedBondOriginatorRequest',
  'processWorkflowEvidenceIfPossible',
  'markTransactionAwaitingSignedOtp',
  'finance_type_selected',
]) {
  assert.match(
    apiSource,
    new RegExp(marker),
    `buyer onboarding projection replay must reuse ${marker}`,
  )
}
assert.match(
  replayProjectionSource,
  /buyer_onboarding_projection_replay_completed|buyer_onboarding_projection_replay_failed/,
  'buyer onboarding projection replay must record a replay summary event',
)
assert.doesNotMatch(
  saveOnboardingSource,
  /\.from\(\s*['\"]onboarding_form_data['\"]\s*\)\.upsert\s*\(/,
  'onboarding save must not upsert onboarding_form_data directly with a bearer token',
)
assert.doesNotMatch(
  saveOnboardingSource,
  /replaceTransactionFundingSources\s*\(/,
  'onboarding save must not replace funding sources directly with a bearer token',
)
assert.doesNotMatch(
  saveOnboardingSource,
  /\.from\(\s*['\"]transaction_funding_sources['\"]\s*\)/,
  'onboarding save must not write funding sources directly with a bearer token',
)
assert.match(onboardingPageSource, /fetchClientOnboardingByToken\(token\)/, 'the onboarding page must load through the guarded API path')
assert.match(onboardingPageSource, /saveClientOnboardingDraft\(/, 'the onboarding page must save through the guarded API path')
assert.match(onboardingPageSource, /submitClientOnboarding\(/, 'the onboarding page must submit through the guarded API path')

console.log('buyer onboarding token/RLS continuity checks passed')
