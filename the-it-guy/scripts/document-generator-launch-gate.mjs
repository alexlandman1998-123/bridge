import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import { loadCanonicalVerificationSnapshot } from './canonical-document-verification-snapshot.mjs'
import {
  hasGeneratedDocumentRecord,
  summarizeSinglePacketGenerationHealth,
} from '../src/core/documents/packetGenerationChecks.js'

export const DEFAULT_DOCUMENT_GENERATOR_TRANSACTION_ID = '5db513ad-5736-46fe-bd8f-6b298d1d791d'
export const DEFAULT_DOCUMENT_GENERATOR_SNAPSHOT_BUDGET_MS = 12_000

export const DOCUMENT_GENERATOR_LAUNCH_REQUIREMENTS = Object.freeze([
  {
    key: 'generated_mandate',
    label: 'Generated Mandate',
    packetType: 'mandate',
    legacyKey: 'generated_mandate',
    signed: false,
  },
  {
    key: 'signed_mandate',
    label: 'Signed Mandate',
    packetType: 'mandate',
    legacyKey: 'mandate_signature',
    signed: true,
  },
  {
    key: 'generated_otp',
    label: 'Generated OTP',
    packetType: 'otp',
    legacyKey: 'generated_otp',
    signed: false,
  },
  {
    key: 'signed_otp',
    label: 'Signed OTP',
    packetType: 'otp',
    legacyKey: 'otp',
    signed: true,
  },
])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseBoolean(value, fallback = false) {
  const normalized = normalizeKey(value)
  if (!normalized) return fallback
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false
  return fallback
}

function sameId(left, right) {
  return Boolean(normalizeText(left) && normalizeText(left) === normalizeText(right))
}

function rowMatchesTransaction(row = {}, transactionId = '') {
  return sameId(row.transaction_id, transactionId) || (
    normalizeKey(row.context_type) === 'transaction' &&
    sameId(row.context_id, transactionId)
  )
}

function findScopedRequirements(requirements = [], spec = {}, transactionId = '') {
  return requirements.filter((requirement) =>
    normalizeKey(requirement.document_definition_key) === normalizeKey(spec.key) &&
    rowMatchesTransaction(requirement, transactionId)
  )
}

function findLegacyProjection(legacyRequirements = [], spec = {}, transactionId = '') {
  return legacyRequirements.find((row) =>
    sameId(row.transaction_id, transactionId) &&
    normalizeKey(row.document_key) === normalizeKey(spec.legacyKey)
  ) || null
}

function issue(code, message, details = {}) {
  return {
    code,
    message,
    ...details,
  }
}

function summarizeRows(snapshot = {}) {
  return {
    documentRequirementInstances: Array.isArray(snapshot.document_requirement_instances)
      ? snapshot.document_requirement_instances.length
      : 0,
    transactionRequiredDocuments: Array.isArray(snapshot.transaction_required_documents)
      ? snapshot.transaction_required_documents.length
      : 0,
    documentPackets: Array.isArray(snapshot.document_packets) ? snapshot.document_packets.length : 0,
    documentPacketVersions: Array.isArray(snapshot.document_packet_versions)
      ? snapshot.document_packet_versions.length
      : 0,
  }
}

export function evaluateDocumentGeneratorLaunchGate({
  snapshot = {},
  transactionId = DEFAULT_DOCUMENT_GENERATOR_TRANSACTION_ID,
  snapshotDurationMs = 0,
  snapshotBudgetMs = DEFAULT_DOCUMENT_GENERATOR_SNAPSHOT_BUDGET_MS,
  enforceDocumentRecord = false,
  expectedRequirements = DOCUMENT_GENERATOR_LAUNCH_REQUIREMENTS,
} = {}) {
  const requirements = Array.isArray(snapshot.document_requirement_instances)
    ? snapshot.document_requirement_instances
    : []
  const legacyRequirements = Array.isArray(snapshot.transaction_required_documents)
    ? snapshot.transaction_required_documents
    : []
  const packets = Array.isArray(snapshot.document_packets) ? snapshot.document_packets : []
  const versions = Array.isArray(snapshot.document_packet_versions) ? snapshot.document_packet_versions : []

  const packetsById = new Map(packets.map((packet) => [normalizeText(packet.id), packet]))
  const versionsById = new Map(versions.map((version) => [normalizeText(version.id), version]))
  const blockingIssues = []
  const warnings = []

  const packetReports = expectedRequirements.map((spec) => {
    const scopedRequirements = findScopedRequirements(requirements, spec, transactionId)
    const requirement = scopedRequirements[0] || null
    const packet = requirement ? packetsById.get(normalizeText(requirement.satisfied_by_packet_id)) || null : null
    const version = requirement ? versionsById.get(normalizeText(requirement.satisfied_by_packet_version_id)) || null : null
    const legacyProjection = findLegacyProjection(legacyRequirements, spec, transactionId)
    const generationHealth = summarizeSinglePacketGenerationHealth(version, { signed: spec.signed })
    const documentRecordLinked = hasGeneratedDocumentRecord(version)

    const checks = {
      singleCanonicalRequirement: scopedRequirements.length === 1,
      canonicalCompleted: normalizeKey(requirement?.status) === 'completed',
      packetLinkedFromRequirement: Boolean(requirement?.satisfied_by_packet_id),
      versionLinkedFromRequirement: Boolean(requirement?.satisfied_by_packet_version_id),
      packetFound: Boolean(packet),
      versionFound: Boolean(version),
      packetTypeMatches: !packet || normalizeKey(packet.packet_type) === normalizeKey(spec.packetType),
      packetCanonicalBacklink: Boolean(packet && sameId(packet.canonical_requirement_instance_id, requirement?.id)),
      versionCanonicalBacklink: Boolean(version && sameId(version.canonical_requirement_instance_id, requirement?.id)),
      versionBelongsToPacket: Boolean(packet && version && sameId(version.packet_id, packet.id)),
      generatedPreviewAsset: generationHealth.hasGeneratedPreviewAsset,
      generatedDocumentRecord: documentRecordLinked,
      finalSignedArtifact: !spec.signed || generationHealth.hasFinalSignedArtifact,
      legacyProjectionFound: Boolean(legacyProjection),
      legacyProjectionLinked: Boolean(legacyProjection && sameId(legacyProjection.canonical_requirement_instance_id, requirement?.id)),
      legacyProjectionAccepted: normalizeKey(legacyProjection?.status) === 'accepted',
      legacyProjectionUploaded: legacyProjection?.is_uploaded === true,
    }

    const rowIssues = []
    if (!checks.singleCanonicalRequirement) {
      rowIssues.push(issue(
        scopedRequirements.length ? 'DUPLICATE_CANONICAL_REQUIREMENT' : 'MISSING_CANONICAL_REQUIREMENT',
        `${spec.label} should have exactly one canonical requirement for the pilot transaction.`,
        { count: scopedRequirements.length },
      ))
    }
    if (requirement && !checks.canonicalCompleted) {
      rowIssues.push(issue('CANONICAL_NOT_COMPLETED', `${spec.label} canonical requirement is not completed.`, { status: requirement.status }))
    }
    if (!checks.packetLinkedFromRequirement || !checks.versionLinkedFromRequirement) {
      rowIssues.push(issue('MISSING_CANONICAL_SATISFIER', `${spec.label} is not linked to a packet and version.`))
    }
    if (requirement && !checks.packetFound) {
      rowIssues.push(issue('MISSING_PACKET', `${spec.label} packet row could not be found.`, { packetId: requirement.satisfied_by_packet_id }))
    }
    if (requirement && !checks.versionFound) {
      rowIssues.push(issue('MISSING_PACKET_VERSION', `${spec.label} packet version row could not be found.`, { versionId: requirement.satisfied_by_packet_version_id }))
    }
    if (!checks.packetTypeMatches) {
      rowIssues.push(issue('PACKET_TYPE_MISMATCH', `${spec.label} is linked to the wrong packet type.`, { packetType: packet?.packet_type }))
    }
    if (packet && !checks.packetCanonicalBacklink) {
      rowIssues.push(issue('PACKET_BACKLINK_MISSING', `${spec.label} packet does not link back to the canonical requirement.`))
    }
    if (version && !checks.versionCanonicalBacklink) {
      rowIssues.push(issue('VERSION_BACKLINK_MISSING', `${spec.label} version does not link back to the canonical requirement.`))
    }
    if (packet && version && !checks.versionBelongsToPacket) {
      rowIssues.push(issue('VERSION_PACKET_MISMATCH', `${spec.label} version does not belong to the linked packet.`))
    }
    if (version && !checks.generatedPreviewAsset) {
      rowIssues.push(issue('MISSING_GENERATED_PREVIEW_ASSET', `${spec.label} has no saved generated preview file path or URL.`))
    }
    if (version && !checks.finalSignedArtifact) {
      rowIssues.push(issue('MISSING_FINAL_SIGNED_ARTIFACT', `${spec.label} has no final signed artifact reference.`))
    }
    if (!checks.legacyProjectionFound) {
      rowIssues.push(issue('MISSING_LEGACY_PROJECTION', `${spec.label} did not pull through to transaction_required_documents.`, { legacyKey: spec.legacyKey }))
    } else {
      if (!checks.legacyProjectionLinked) {
        rowIssues.push(issue('LEGACY_PROJECTION_NOT_LINKED', `${spec.label} legacy projection is not linked to the canonical requirement.`, { legacyKey: spec.legacyKey }))
      }
      if (!checks.legacyProjectionAccepted) {
        rowIssues.push(issue('LEGACY_PROJECTION_NOT_ACCEPTED', `${spec.label} legacy projection is not accepted.`, { status: legacyProjection.status }))
      }
      if (!checks.legacyProjectionUploaded) {
        rowIssues.push(issue('LEGACY_PROJECTION_NOT_UPLOADED', `${spec.label} legacy projection is not marked uploaded.`))
      }
    }
    if (version && !documentRecordLinked) {
      const documentRecordIssue = issue(
        'GENERATED_DOCUMENT_RECORD_NOT_LINKED',
        `${spec.label} has a saved file reference but no rendered_document_id.`,
      )
      if (enforceDocumentRecord) rowIssues.push(documentRecordIssue)
      else warnings.push(documentRecordIssue)
    }

    blockingIssues.push(...rowIssues)

    return {
      key: spec.key,
      label: spec.label,
      packetType: spec.packetType,
      legacyKey: spec.legacyKey,
      signed: spec.signed,
      requirementId: requirement?.id || null,
      packetId: packet?.id || requirement?.satisfied_by_packet_id || null,
      packetVersionId: version?.id || requirement?.satisfied_by_packet_version_id || null,
      generatedFilePath: version?.rendered_file_path || null,
      finalSignedFilePath: version?.final_signed_file_path || null,
      checks,
      generationHealth,
      ready: rowIssues.length === 0,
      issues: rowIssues,
    }
  })

  const performanceBudget = {
    snapshotDurationMs: Math.round(Number(snapshotDurationMs) || 0),
    budgetMs: parsePositiveInteger(snapshotBudgetMs, DEFAULT_DOCUMENT_GENERATOR_SNAPSHOT_BUDGET_MS),
  }
  performanceBudget.pass = performanceBudget.snapshotDurationMs <= performanceBudget.budgetMs
  if (!performanceBudget.pass) {
    blockingIssues.push(issue(
      'SNAPSHOT_TOO_SLOW',
      `Canonical document verification snapshot took ${performanceBudget.snapshotDurationMs}ms, above the ${performanceBudget.budgetMs}ms launch budget.`,
    ))
  }

  const readyCount = packetReports.filter((report) => report.ready).length
  return {
    verificationScope: 'document_generator_otp_mandate_launch_gate',
    transactionId,
    pass: blockingIssues.length === 0,
    launchReady: blockingIssues.length === 0,
    expectedRequirementCount: expectedRequirements.length,
    readyRequirementCount: readyCount,
    rowCounts: summarizeRows(snapshot),
    performanceBudget,
    packets: packetReports,
    blockingIssueCount: blockingIssues.length,
    blockingIssues,
    warningCount: warnings.length,
    warnings,
  }
}

export async function runDocumentGeneratorLaunchGate({
  transactionId = process.env.DOCUMENT_GENERATOR_LAUNCH_TRANSACTION_ID || DEFAULT_DOCUMENT_GENERATOR_TRANSACTION_ID,
  snapshotBudgetMs = parsePositiveInteger(
    process.env.DOCUMENT_GENERATOR_LAUNCH_SNAPSHOT_BUDGET_MS,
    DEFAULT_DOCUMENT_GENERATOR_SNAPSHOT_BUDGET_MS,
  ),
  enforceDocumentRecord = parseBoolean(process.env.DOCUMENT_GENERATOR_REQUIRE_DOCUMENT_RECORD, false),
} = {}) {
  const server = await createServer({
    root: process.cwd(),
    logLevel: 'silent',
    server: { middlewareMode: true },
  })

  try {
    const { supabase, isSupabaseConfigured } = await server.ssrLoadModule('/src/lib/supabaseClient.js')
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase is not configured. Cannot run document generator launch gate.')
    }

    const startedAt = performance.now()
    const snapshot = await loadCanonicalVerificationSnapshot(supabase)
    const snapshotDurationMs = performance.now() - startedAt
    return evaluateDocumentGeneratorLaunchGate({
      snapshot,
      transactionId,
      snapshotDurationMs,
      snapshotBudgetMs,
      enforceDocumentRecord,
    })
  } finally {
    await server.close()
  }
}

async function main() {
  const report = await runDocumentGeneratorLaunchGate()
  console.log(JSON.stringify(report, null, 2))
  if (!report.pass) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
