import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const LAUNCH_LOCK_CONTRACT = 'roleplayer_document_context_launch_lock_v1'
const HANDOFF_CONTRACT = 'roleplayer_document_context_launch_handoff_v1'
const AUTHORITY_CONTRACT = 'roleplayer_document_context_release_authority_v1'
const DEFAULT_HANDOFF_DIR = 'private-evidence/roleplayer-document-context-phase8'
const DEFAULT_MAX_HANDOFF_AGE_MINUTES = 120

function arg(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function sha256(value = '') {
  return createHash('sha256').update(value).digest('hex')
}

function readText(file) {
  return fs.readFileSync(file, 'utf8')
}

function getManifestDigest(manifest = {}, fileName = '') {
  return manifest.files?.find((file) => file.name === fileName)?.sha256 || ''
}

function ageMinutes(value = '', nowMs = Date.now()) {
  const valueMs = Date.parse(value)
  if (!Number.isFinite(valueMs)) return Number.POSITIVE_INFINITY
  return Math.max(0, Math.round((nowMs - valueMs) / 60000))
}

function canonicalHandoffDigest(handoff = {}) {
  const { handoffDigest, ...payload } = handoff
  return sha256(JSON.stringify(payload))
}

function resolveHandoffPaths() {
  const handoffDir = path.resolve(arg('handoff-dir') || process.env.ROLEPLAYER_CONTEXT_HANDOFF_DIR || DEFAULT_HANDOFF_DIR)
  return {
    handoffDir,
    handoffPath: path.join(handoffDir, 'roleplayer-document-context-phase8-handoff.json'),
    manifestPath: path.join(handoffDir, 'roleplayer-document-context-phase8-manifest.json'),
    summaryPath: path.join(handoffDir, 'roleplayer-document-context-phase8-summary.md'),
  }
}

function validateHandoff({ handoffPath, manifestPath, summaryPath, maxAgeMinutes, checkedAtMs }) {
  const blockers = []
  if (!fs.existsSync(handoffPath)) {
    blockers.push({ code: 'phase8_handoff_missing', detail: `Missing handoff file: ${handoffPath}` })
  }
  if (!fs.existsSync(manifestPath)) {
    blockers.push({ code: 'phase8_manifest_missing', detail: `Missing manifest file: ${manifestPath}` })
  }
  if (!fs.existsSync(summaryPath)) {
    blockers.push({ code: 'phase8_summary_missing', detail: `Missing summary file: ${summaryPath}` })
  }
  if (blockers.length) return { blockers, handoff: null, releaseAuthority: null, manifest: null, handoffAgeMinutes: null }

  const handoffText = readText(handoffPath)
  const manifestText = readText(manifestPath)
  const summaryText = readText(summaryPath)
  const handoffFileDigest = sha256(handoffText)
  const manifestFileDigest = sha256(manifestText)
  const summaryFileDigest = sha256(summaryText)
  const handoffPayload = JSON.parse(handoffText)
  const manifest = JSON.parse(manifestText)
  const handoff = handoffPayload.handoff || {}
  const releaseAuthority = handoffPayload.releaseAuthority || {}
  const authority = releaseAuthority.authority || {}
  const handoffAgeMinutes = ageMinutes(handoff.handedOffAt, checkedAtMs)

  if (manifest.handoffContract !== HANDOFF_CONTRACT) {
    blockers.push({ code: 'phase8_manifest_contract_invalid', detail: `Expected ${HANDOFF_CONTRACT}; received ${manifest.handoffContract || 'missing'}.` })
  }
  if (manifest.mutatedData !== false) {
    blockers.push({ code: 'phase8_manifest_mutation_flag_invalid', detail: 'Manifest must declare mutatedData=false.' })
  }
  if (getManifestDigest(manifest, path.basename(handoffPath)) !== handoffFileDigest) {
    blockers.push({ code: 'phase8_handoff_digest_mismatch', detail: 'Manifest digest does not match the Phase 8 handoff artifact.' })
  }
  if (getManifestDigest(manifest, path.basename(summaryPath)) !== summaryFileDigest) {
    blockers.push({ code: 'phase8_summary_digest_mismatch', detail: 'Manifest digest does not match the Phase 8 summary artifact.' })
  }
  if (manifestFileDigest.length !== 64) {
    blockers.push({ code: 'phase8_manifest_digest_invalid', detail: 'Manifest digest could not be calculated.' })
  }
  if (handoff.contract !== HANDOFF_CONTRACT || handoff.status !== 'handed_off') {
    blockers.push({ code: 'phase8_handoff_contract_invalid', detail: `Handoff status is ${handoff.status || 'missing'} for contract ${handoff.contract || 'missing'}.` })
  }
  if (handoff.mutatedData !== false) {
    blockers.push({ code: 'phase8_handoff_mutation_flag_invalid', detail: 'Handoff must declare mutatedData=false.' })
  }
  if (handoff.handoffDigest !== manifest.handoffDigest || handoff.handoffDigest !== canonicalHandoffDigest(handoff)) {
    blockers.push({ code: 'phase8_handoff_digest_invalid', detail: 'Handoff digest is missing, stale, or hand-edited.' })
  }
  if (releaseAuthority.contract !== AUTHORITY_CONTRACT || releaseAuthority.authorized !== true || releaseAuthority.status !== 'READY_FOR_DEMO_RELEASE') {
    blockers.push({ code: 'phase7_authority_invalid', detail: `Release authority status is ${releaseAuthority.status || 'missing'}, authorized=${Boolean(releaseAuthority.authorized)}.` })
  }
  if (!authority.authorityDigest || handoff.sourceAuthorityDigest !== authority.authorityDigest || manifest.sourceAuthorityDigest !== authority.authorityDigest) {
    blockers.push({ code: 'phase8_authority_binding_invalid', detail: 'Handoff, manifest, and Phase 7 authority digest must match exactly.' })
  }
  if (handoff.sourceEvidenceSha256 !== authority.sourceEvidenceSha256 || handoff.sourceManifestSha256 !== authority.sourceManifestSha256) {
    blockers.push({ code: 'phase8_evidence_binding_invalid', detail: 'Handoff must bind to the same Phase 6 evidence and manifest digests authorized by Phase 7.' })
  }
  for (const [key, value] of Object.entries(handoff.demoReadiness || {})) {
    if (value !== true) blockers.push({ code: 'phase8_demo_readiness_incomplete', detail: `Demo readiness ${key} must be true.` })
  }
  for (const key of ['refreshEvidence', 'verifyAuthority', 'rerunOperationalGate', 'fastPreflight']) {
    if (!handoff.operatorCommands?.[key]) blockers.push({ code: 'phase8_operator_command_missing', detail: `Missing operator command: ${key}.` })
  }
  if (
    handoff.rollbackPosture?.mutatedApplicationData !== false ||
    handoff.rollbackPosture?.databaseRollbackRequired !== false ||
    handoff.rollbackPosture?.templateRollbackRequired !== false
  ) {
    blockers.push({ code: 'phase8_rollback_posture_invalid', detail: 'Launch lock requires no application-data, database, or template rollback obligation.' })
  }
  if (!Number.isFinite(handoffAgeMinutes) || handoffAgeMinutes > maxAgeMinutes) {
    blockers.push({ code: 'phase8_handoff_stale', detail: `Handoff age is ${handoffAgeMinutes} minutes; limit is ${maxAgeMinutes} minutes.` })
  }

  return {
    blockers,
    handoff,
    releaseAuthority,
    manifest,
    digests: {
      handoffFileSha256: handoffFileDigest,
      manifestFileSha256: manifestFileDigest,
      summaryFileSha256: summaryFileDigest,
    },
    handoffAgeMinutes,
  }
}

function main() {
  const configuredMaxAge = Number(arg('max-age-minutes') || process.env.ROLEPLAYER_CONTEXT_LAUNCH_LOCK_MAX_HANDOFF_AGE_MINUTES || DEFAULT_MAX_HANDOFF_AGE_MINUTES)
  const maxAgeMinutes = Number.isInteger(configuredMaxAge) && configuredMaxAge > 0 ? configuredMaxAge : DEFAULT_MAX_HANDOFF_AGE_MINUTES
  const checkedAt = new Date().toISOString()
  const checkedAtMs = Date.parse(checkedAt)
  const paths = resolveHandoffPaths()
  const validation = validateHandoff({ ...paths, maxAgeMinutes, checkedAtMs })
  const locked = validation.blockers.length === 0
  const launchLock = locked
    ? {
      contract: LAUNCH_LOCK_CONTRACT,
      status: 'locked',
      lockedAt: checkedAt,
      sourceHandoffDigest: validation.handoff.handoffDigest,
      sourceAuthorityDigest: validation.handoff.sourceAuthorityDigest,
      sourceEvidenceSha256: validation.handoff.sourceEvidenceSha256,
      sourceManifestSha256: validation.handoff.sourceManifestSha256,
      handoffAgeMinutes: validation.handoffAgeMinutes,
      handoffAgeLimitMinutes: maxAgeMinutes,
      releaseScope: validation.handoff.releaseScope,
      demoReadiness: validation.handoff.demoReadiness,
      operatorCommands: validation.handoff.operatorCommands,
      rollbackPosture: validation.handoff.rollbackPosture,
      mutatedData: false,
    }
    : null
  if (launchLock) launchLock.lockDigest = sha256(JSON.stringify(launchLock))

  console.log(JSON.stringify({
    phase: '9',
    contract: LAUNCH_LOCK_CONTRACT,
    status: locked ? 'LAUNCH_LOCKED' : 'LAUNCH_HOLD',
    locked,
    blockerCount: validation.blockers.length,
    blockers: validation.blockers,
    launchLock,
    evidence: {
      handoffDir: paths.handoffDir,
      handoffPath: paths.handoffPath,
      manifestPath: paths.manifestPath,
      summaryPath: paths.summaryPath,
      handoffContract: validation.handoff?.contract || null,
      authorityStatus: validation.releaseAuthority?.status || null,
      handoffAgeMinutes: validation.handoffAgeMinutes,
      handoffAgeLimitMinutes: maxAgeMinutes,
      digests: validation.digests || null,
    },
    checkedAt,
    mutatedData: false,
  }, null, 2))

  if (!locked) process.exitCode = 1
}

main()
