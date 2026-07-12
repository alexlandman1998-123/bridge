import { createClient } from '@supabase/supabase-js'
import { DEFAULT_DOCUMENT_GENERATOR_TRANSACTION_ID } from './document-generator-launch-gate.mjs'

const FIXTURE_SOURCE = 'canonical_packet_fixture_v1'
const CLEANUP_SOURCE = 'document_generator_fixture_document_link_cleanup'
const CLEANUP_VERSION = 'document_generator_fixture_document_link_cleanup_v1'
const WRITE_ENV_FLAG = 'DOCUMENT_GENERATOR_FIXTURE_DOCUMENT_LINK_WRITE'

function hasArg(name) {
  return process.argv.includes(name)
}

function normalizeText(value) {
  return String(value || '').trim()
}

function compact(value) {
  return value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined))
    : value
}

function filenameFromPath(filePath = '') {
  const normalized = normalizeText(filePath)
  if (!normalized) return 'generated-document.pdf'
  return normalized.split('/').filter(Boolean).at(-1) || normalized
}

function getSupabaseConfig() {
  const url = normalizeText(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL)
  const serviceKey = normalizeText(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SERVICE_ROLE_KEY ||
      process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  )
  if (!url || !serviceKey) {
    throw new Error('Supabase URL and service role key are required for fixture document link cleanup.')
  }
  return { url, serviceKey }
}

async function fetchFixtureRows(client, transactionId) {
  const packetResult = await client
    .from('document_packets')
    .select('id, transaction_id, packet_type, title, source_context_json, canonical_requirement_instance_id')
    .eq('transaction_id', transactionId)
  if (packetResult.error) throw packetResult.error

  const packets = (packetResult.data || []).filter((packet) =>
    packet?.source_context_json?.fixture === FIXTURE_SOURCE
  )
  const packetIds = packets.map((packet) => packet.id).filter(Boolean)
  if (!packetIds.length) {
    return { packets: [], versions: [], documents: [] }
  }

  const [versionResult, documentResult] = await Promise.all([
    client
      .from('document_packet_versions')
      .select('id, packet_id, rendered_document_id, rendered_file_path, rendered_file_name, rendered_file_url, final_signed_file_path, final_signed_document_id, canonical_requirement_instance_id')
      .in('packet_id', packetIds),
    client
      .from('documents')
      .select('*')
      .eq('transaction_id', transactionId),
  ])
  if (versionResult.error) throw versionResult.error
  if (documentResult.error) throw documentResult.error

  return {
    packets,
    versions: versionResult.data || [],
    documents: documentResult.data || [],
  }
}

function buildPlan({ transactionId, packets = [], versions = [], documents = [] } = {}) {
  const packetsById = new Map(packets.map((packet) => [packet.id, packet]))
  const documentsById = new Map(documents.map((document) => [document.id, document]))
  const documentsByPath = new Map(
    documents
      .filter((document) => normalizeText(document.file_path))
      .map((document) => [normalizeText(document.file_path), document]),
  )

  const items = versions.map((version) => {
    const packet = packetsById.get(version.packet_id) || {}
    const renderedPath = normalizeText(version.rendered_file_path)
    const existingLinkedDocument = documentsById.get(normalizeText(version.rendered_document_id)) || null
    const existingPathDocument = documentsByPath.get(renderedPath) || null
    const targetDocument = existingLinkedDocument || existingPathDocument || null
    const definitionKey = normalizeText(
      packet.source_context_json?.documentDefinitionKey ||
        packet.source_context_json?.templateKey ||
        packet.source_context_json?.template_key ||
        packet.packet_type ||
        'generated_document',
    )
    const fileName = normalizeText(version.rendered_file_name) || filenameFromPath(renderedPath)
    const needsDocumentCreate = Boolean(renderedPath && !targetDocument)
    const needsVersionLink = Boolean(targetDocument && !normalizeText(version.rendered_document_id))

    return compact({
      packetId: packet.id,
      packetVersionId: version.id,
      canonicalRequirementInstanceId: normalizeText(version.canonical_requirement_instance_id || packet.canonical_requirement_instance_id),
      definitionKey,
      renderedFilePath: renderedPath,
      renderedFileName: fileName,
      existingRenderedDocumentId: normalizeText(version.rendered_document_id) || null,
      targetDocumentId: targetDocument?.id || null,
      needsDocumentCreate,
      needsVersionLink,
      skippedReason: renderedPath ? '' : 'missing_rendered_file_path',
      documentPayload: needsDocumentCreate
        ? {
            transaction_id: transactionId,
            name: fileName,
            document_name: fileName,
            file_name: fileName,
            file_path: renderedPath,
            category: 'generated_documents',
            document_type: definitionKey,
            status: 'uploaded',
            visibility_scope: 'internal',
            is_client_visible: false,
            uploaded_by_role: 'system',
            uploaded_by_party: 'system',
            bucket_key: 'documents',
            file_bucket: 'documents',
            source: CLEANUP_SOURCE,
            source_document_id: version.id,
            related_entity_type: 'document_packet_version',
            related_entity_id: version.id,
            canonical_requirement_instance_id: normalizeText(version.canonical_requirement_instance_id || packet.canonical_requirement_instance_id) || null,
            metadata: {
              fixture: FIXTURE_SOURCE,
              cleanup_source: CLEANUP_SOURCE,
              cleanup_version: CLEANUP_VERSION,
              packet_id: packet.id,
              packet_version_id: version.id,
              document_definition_key: definitionKey,
              rendered_file_path: renderedPath,
              safe_to_delete: true,
            },
          }
        : null,
    })
  })

  return {
    transactionId,
    fixtureSource: FIXTURE_SOURCE,
    cleanupSource: CLEANUP_SOURCE,
    cleanupVersion: CLEANUP_VERSION,
    packetCount: packets.length,
    versionCount: versions.length,
    existingDocumentCount: documents.length,
    items,
    summary: {
      alreadyLinked: items.filter((item) => item.existingRenderedDocumentId).length,
      documentCreates: items.filter((item) => item.needsDocumentCreate).length,
      versionLinks: items.filter((item) => item.needsVersionLink).length,
      skipped: items.filter((item) => item.skippedReason).length,
    },
  }
}

async function findDocumentByPath(client, transactionId, filePath) {
  const result = await client
    .from('documents')
    .select('*')
    .eq('transaction_id', transactionId)
    .eq('file_path', filePath)
    .maybeSingle()
  if (result.error) throw result.error
  return result.data || null
}

async function writePlan(client, plan, { write = false } = {}) {
  const results = []
  if (!write) {
    return {
      dryRun: true,
      createdDocuments: 0,
      linkedVersions: 0,
      results,
    }
  }

  for (const item of plan.items) {
    if (item.skippedReason) {
      results.push({ packetVersionId: item.packetVersionId, skipped: true, reason: item.skippedReason })
      continue
    }

    let documentId = item.targetDocumentId || null
    if (!documentId && item.needsDocumentCreate) {
      const existing = await findDocumentByPath(client, plan.transactionId, item.renderedFilePath)
      if (existing?.id) {
        documentId = existing.id
      } else {
        const insertResult = await client
          .from('documents')
          .insert(item.documentPayload)
          .select('id')
          .single()
        if (insertResult.error) throw insertResult.error
        documentId = insertResult.data.id
      }
    }

    if (documentId && item.canonicalRequirementInstanceId) {
      const documentUpdate = await client
        .from('documents')
        .update({ canonical_requirement_instance_id: item.canonicalRequirementInstanceId })
        .eq('id', documentId)
      if (documentUpdate.error) throw documentUpdate.error
    }

    if (documentId && !item.existingRenderedDocumentId) {
      const versionUpdate = await client
        .from('document_packet_versions')
        .update({ rendered_document_id: documentId })
        .eq('id', item.packetVersionId)
      if (versionUpdate.error) throw versionUpdate.error
    }

    results.push({
      packetVersionId: item.packetVersionId,
      documentId,
      createdDocument: Boolean(item.needsDocumentCreate && documentId),
      linkedVersion: Boolean(documentId && !item.existingRenderedDocumentId),
    })
  }

  return {
    dryRun: false,
    createdDocuments: results.filter((item) => item.createdDocument).length,
    linkedVersions: results.filter((item) => item.linkedVersion).length,
    results,
  }
}

async function main() {
  const write = hasArg('--write')
  const confirmed = hasArg('--confirm-staging') && process.env[WRITE_ENV_FLAG] === 'true'
  if (write && !confirmed) {
    throw new Error(`Write mode requires --confirm-staging and ${WRITE_ENV_FLAG}=true.`)
  }

  const transactionId = normalizeText(process.env.DOCUMENT_GENERATOR_LAUNCH_TRANSACTION_ID) || DEFAULT_DOCUMENT_GENERATOR_TRANSACTION_ID
  const { url, serviceKey } = getSupabaseConfig()
  const client = createClient(url, serviceKey, { auth: { persistSession: false } })
  const before = await fetchFixtureRows(client, transactionId)
  const plan = buildPlan({ transactionId, ...before })
  const writeResult = await writePlan(client, plan, { write })
  const after = write ? buildPlan({ transactionId, ...(await fetchFixtureRows(client, transactionId)) }) : null

  console.log(JSON.stringify({
    mode: write ? 'write' : 'dry_run',
    mutatedData: Boolean(write),
    transactionId,
    fixtureSource: FIXTURE_SOURCE,
    cleanupSource: CLEANUP_SOURCE,
    cleanupVersion: CLEANUP_VERSION,
    before: {
      packetCount: plan.packetCount,
      versionCount: plan.versionCount,
      existingDocumentCount: plan.existingDocumentCount,
      summary: plan.summary,
    },
    writeResult,
    after: after
      ? {
          packetCount: after.packetCount,
          versionCount: after.versionCount,
          existingDocumentCount: after.existingDocumentCount,
          summary: after.summary,
        }
      : null,
    preview: plan.items.map((item) => ({
      packetVersionId: item.packetVersionId,
      definitionKey: item.definitionKey,
      renderedFilePath: item.renderedFilePath,
      existingRenderedDocumentId: item.existingRenderedDocumentId,
      targetDocumentId: item.targetDocumentId,
      needsDocumentCreate: item.needsDocumentCreate,
      needsVersionLink: item.needsVersionLink,
      skippedReason: item.skippedReason || undefined,
    })),
    controlledWriteCommand: `${WRITE_ENV_FLAG}=true npm run cleanup:document-generator-fixture-links -- --write --confirm-staging`,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
