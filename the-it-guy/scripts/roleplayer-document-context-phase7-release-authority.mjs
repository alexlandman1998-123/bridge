import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const AUTHORITY_CONTRACT = 'roleplayer_document_context_release_authority_v1'
const EVIDENCE_VERSION = 'roleplayer_document_context_phase6_evidence_v1'
const DEFAULT_EVIDENCE_DIR = 'private-evidence/roleplayer-document-context-phase6'
const DEFAULT_MAX_EVIDENCE_AGE_MINUTES = 120

function arg(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function sha256(value = '') {
  return createHash('sha256').update(value).digest('hex')
}

function readText(file) {
  return fs.readFileSync(file, 'utf8')
}

function readJson(file) {
  return JSON.parse(readText(file))
}

function canonicalJson(value) {
  return JSON.stringify(value, Object.keys(value || {}).sort())
}

function evidenceAgeMinutes(generatedAt = '', nowMs = Date.now()) {
  const generatedMs = Date.parse(generatedAt)
  if (!Number.isFinite(generatedMs)) return Number.POSITIVE_INFINITY
  return Math.max(0, Math.round((nowMs - generatedMs) / 60000))
}

function resolveEvidencePaths() {
  const evidenceDir = path.resolve(arg('evidence-dir') || process.env.ROLEPLAYER_CONTEXT_EVIDENCE_DIR || DEFAULT_EVIDENCE_DIR)
  return {
    evidenceDir,
    evidencePath: path.join(evidenceDir, 'roleplayer-document-context-phase6-evidence.json'),
    manifestPath: path.join(evidenceDir, 'roleplayer-document-context-phase6-manifest.json'),
  }
}

function getManifestDigest(manifest = {}, fileName = '') {
  return manifest.files?.find((file) => file.name === fileName)?.sha256 || ''
}

function buildAuthority({ checkedAt, evidencePath, manifestPath, evidenceDigest, manifestDigest, evidence, ageMinutes, maxAgeMinutes }) {
  const payload = {
    contract: AUTHORITY_CONTRACT,
    status: 'authorized',
    authorizedAt: checkedAt,
    sourceEvidenceSha256: evidenceDigest,
    sourceManifestSha256: manifestDigest,
    sourceEvidencePath: evidencePath,
    sourceManifestPath: manifestPath,
    evidenceGeneratedAt: evidence.generatedAt,
    evidenceAgeMinutes: ageMinutes,
    evidenceAgeLimitMinutes: maxAgeMinutes,
    releaseScope: {
      documents: ['seller_annexure_a', 'seller_mandate'],
      surfaces: ['seller_source_of_truth', 'seller_portal', 'mandate_packet'],
      assurance: ['branding_context', 'roleplayer_context', 'document_key_consistency', 'production_build'],
    },
    requiredNextPhases: [],
    mutatedData: false,
  }
  return {
    ...payload,
    authorityDigest: sha256(canonicalJson(payload)),
  }
}

function validateEvidence({ evidencePath, manifestPath, maxAgeMinutes, checkedAtMs }) {
  const blockers = []
  if (!fs.existsSync(evidencePath)) {
    blockers.push({ code: 'phase6_evidence_missing', detail: `Missing evidence file: ${evidencePath}` })
  }
  if (!fs.existsSync(manifestPath)) {
    blockers.push({ code: 'phase6_manifest_missing', detail: `Missing manifest file: ${manifestPath}` })
  }
  if (blockers.length) return { blockers, evidence: null, manifest: null, evidenceDigest: '', manifestDigest: '', ageMinutes: null }

  const evidenceText = readText(evidencePath)
  const manifestText = readText(manifestPath)
  const evidenceDigest = sha256(evidenceText)
  const manifestDigest = sha256(manifestText)
  const evidence = JSON.parse(evidenceText)
  const manifest = JSON.parse(manifestText)
  const manifestEvidenceDigest = getManifestDigest(manifest, path.basename(evidencePath))
  const ageMinutes = evidenceAgeMinutes(evidence.generatedAt, checkedAtMs)

  if (manifest.evidenceVersion !== EVIDENCE_VERSION) {
    blockers.push({ code: 'phase6_manifest_version_invalid', detail: `Expected ${EVIDENCE_VERSION}; received ${manifest.evidenceVersion || 'missing'}.` })
  }
  if (manifest.mutatedData !== false) {
    blockers.push({ code: 'phase6_manifest_mutation_flag_invalid', detail: 'Manifest must declare mutatedData=false.' })
  }
  if (manifestEvidenceDigest !== evidenceDigest) {
    blockers.push({ code: 'phase6_evidence_digest_mismatch', detail: 'Manifest digest does not match the Phase 6 evidence artifact.' })
  }
  if (evidence.version !== EVIDENCE_VERSION) {
    blockers.push({ code: 'phase6_evidence_version_invalid', detail: `Expected ${EVIDENCE_VERSION}; received ${evidence.version || 'missing'}.` })
  }
  if (evidence.status !== 'exported' || evidence.readyForRelease !== true) {
    blockers.push({ code: 'phase6_evidence_not_release_ready', detail: `Evidence status is ${evidence.status || 'missing'}, readyForRelease=${Boolean(evidence.readyForRelease)}.` })
  }
  if (evidence.mutatedData !== false || evidence.operationalReadiness?.mutatedData !== false) {
    blockers.push({ code: 'phase6_evidence_mutation_flag_invalid', detail: 'Evidence and operational readiness must declare mutatedData=false.' })
  }
  if (evidence.operationalReadiness?.status !== 'OPERATIONAL' || evidence.operationalReadiness?.ok !== true) {
    blockers.push({ code: 'phase5_operational_readiness_invalid', detail: `Operational status is ${evidence.operationalReadiness?.status || 'missing'}.` })
  }
  if (evidence.operationalReadiness?.gates?.releaseGate?.skippedBuild === true) {
    blockers.push({ code: 'phase4_build_verification_skipped', detail: 'Release authority requires Phase 4 evidence with production build included.' })
  }
  if (Number(evidence.operationalReadiness?.gates?.releaseGate?.summary?.failedStepCount || 0) !== 0) {
    blockers.push({ code: 'phase4_release_gate_failed_steps', detail: 'Release gate evidence includes failed steps.' })
  }
  for (const key of ['sellerNames', 'sellerIdNumbers', 'signatures', 'documentHtml', 'generatedPdfFiles']) {
    if (evidence.privacy?.[key] !== 'omitted') {
      blockers.push({ code: 'phase6_privacy_marker_missing', detail: `Privacy marker ${key}=omitted is required.` })
    }
  }
  if (!Number.isFinite(ageMinutes) || ageMinutes > maxAgeMinutes) {
    blockers.push({ code: 'phase6_evidence_stale', detail: `Evidence age is ${ageMinutes} minutes; limit is ${maxAgeMinutes} minutes.` })
  }

  return { blockers, evidence, manifest, evidenceDigest, manifestDigest, ageMinutes }
}

function main() {
  const configuredMaxAge = Number(arg('max-age-minutes') || process.env.ROLEPLAYER_CONTEXT_RELEASE_MAX_EVIDENCE_AGE_MINUTES || DEFAULT_MAX_EVIDENCE_AGE_MINUTES)
  const maxAgeMinutes = Number.isInteger(configuredMaxAge) && configuredMaxAge > 0 ? configuredMaxAge : DEFAULT_MAX_EVIDENCE_AGE_MINUTES
  const checkedAt = new Date().toISOString()
  const checkedAtMs = Date.parse(checkedAt)
  const { evidenceDir, evidencePath, manifestPath } = resolveEvidencePaths()
  const validation = validateEvidence({ evidencePath, manifestPath, maxAgeMinutes, checkedAtMs })
  const ready = validation.blockers.length === 0
  const authority = ready
    ? buildAuthority({
      checkedAt,
      evidencePath,
      manifestPath,
      evidenceDigest: validation.evidenceDigest,
      manifestDigest: validation.manifestDigest,
      evidence: validation.evidence,
      ageMinutes: validation.ageMinutes,
      maxAgeMinutes,
    })
    : null

  console.log(JSON.stringify({
    phase: '7',
    contract: AUTHORITY_CONTRACT,
    status: ready ? 'READY_FOR_DEMO_RELEASE' : 'RELEASE_HOLD',
    authorized: ready,
    blockerCount: validation.blockers.length,
    blockers: validation.blockers,
    authority,
    evidence: {
      evidenceDir,
      evidencePath,
      manifestPath,
      evidenceVersion: validation.evidence?.version || null,
      operationalStatus: validation.evidence?.operationalReadiness?.status || null,
      releaseGateStatus: validation.evidence?.operationalReadiness?.gates?.releaseGate?.status || null,
      evidenceAgeMinutes: validation.ageMinutes,
      evidenceAgeLimitMinutes: maxAgeMinutes,
    },
    checkedAt,
    mutatedData: false,
  }, null, 2))

  if (!ready) process.exitCode = 1
}

main()
