import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const TEMPLATE_SELECT = 'id, organisation_id, module_type, packet_type, template_key, template_label, template_format, template_storage_bucket, template_storage_path, template_file_name, version_tag, status, is_default, is_active, metadata_json, updated_at'
const SECTION_SELECT = 'template_id, section_key, section_label, section_type, sort_order, is_required, is_repeatable, condition_json, placeholder_keys, legal_text, metadata_json'
const EXCLUDED_METADATA_KEYS = new Set([
  'legal_review',
  'legalReview',
  'legal_review_status',
  'legalApprovalStatus',
  'legal_approved_at',
  'legalApprovedAt',
  'legal_approval_reference',
  'legalApprovalReference',
  'legal_approved_by',
  'legal_approval_content_digest',
  'legal_counsel_review_evidence_digest',
  'legal_b1_manifest_digest',
  'legal_b3_applied_at',
  'legal_b3_applied_by',
  'legal_b3_application_reference',
  'legal_phase4_b3_release_contract',
  'legal_c3_restarted_at',
  'legal_c3_restarted_by',
  'legal_c3_restart_reference',
  'legal_c3_previous_manifest_digest',
  'legalPhase4B3ReleaseContract',
  'legal_revoked_at',
  'legalRevokedAt',
  'legal_revocation_reason',
  'legal_approval_history',
  'last_render_validation',
])

export function envFile(file) {
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')]
  }))
}

export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value))
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function reviewMetadata(metadata = {}) {
  return Object.fromEntries(Object.entries(metadata && typeof metadata === 'object' ? metadata : {}).filter(([key]) => !EXCLUDED_METADATA_KEYS.has(key)))
}

function canonicalSection(section = {}) {
  return {
    sectionKey: section.section_key,
    sectionLabel: section.section_label,
    sectionType: section.section_type,
    sortOrder: section.sort_order,
    isRequired: section.is_required,
    isRepeatable: section.is_repeatable,
    condition: section.condition_json || {},
    placeholderKeys: section.placeholder_keys || [],
    legalText: section.legal_text || null,
    metadata: reviewMetadata(section.metadata_json),
  }
}

async function storageDigest(client, template) {
  const bucket = String(template.template_storage_bucket || '').trim()
  const objectPath = String(template.template_storage_path || '').trim()
  if (!bucket || !objectPath) return { digest: null, available: false, error: 'Template storage bucket/path is missing.' }
  const result = await client.storage.from(bucket).download(objectPath)
  if (result.error || !result.data) return { digest: null, available: false, error: result.error?.message || 'Template storage object is missing.' }
  return { digest: sha256(Buffer.from(await result.data.arrayBuffer())), available: true, error: null }
}

export async function buildLegalDocumentReviewSnapshot({ configPath = 'config/legal-document-pilot.json' } = {}) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const candidateOrganisationIds = [...new Set(config.cohortPreparation?.candidateOrganisationIds || [])].sort()
  if (!candidateOrganisationIds.length) throw new Error('The pilot cohort has no B1 candidate organisations.')
  const env = { ...envFile('.env'), ...envFile('.env.staging.local'), ...process.env }
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase URL and service role key are required for B1 fingerprinting.')
  const projectRef = new URL(url).hostname.split('.')[0]
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const templatesResult = await client.from('document_packet_templates').select(TEMPLATE_SELECT).in('packet_type', ['otp', 'mandate']).eq('status', 'published').neq('is_active', false)
  if (templatesResult.error) throw templatesResult.error
  const templates = (templatesResult.data || []).filter((row) => row.organisation_id === null || candidateOrganisationIds.includes(row.organisation_id))
  const templateIds = templates.map((row) => row.id)
  const sectionsResult = templateIds.length
    ? await client.from('document_template_sections').select(SECTION_SELECT).in('template_id', templateIds).order('sort_order').order('section_key')
    : { data: [], error: null }
  if (sectionsResult.error) throw sectionsResult.error

  const entries = []
  for (const template of templates.sort((left, right) => left.id.localeCompare(right.id))) {
    const sections = (sectionsResult.data || []).filter((row) => row.template_id === template.id).map(canonicalSection)
    const source = await storageDigest(client, template)
    const sourceSha256 = source.digest
    const sectionsSha256 = sha256(stableJson(sections))
    const reviewDefinition = {
      id: template.id,
      organisationId: template.organisation_id,
      moduleType: template.module_type,
      packetType: template.packet_type,
      templateKey: template.template_key,
      templateLabel: template.template_label,
      templateFormat: template.template_format,
      versionTag: template.version_tag,
      storageBucket: template.template_storage_bucket,
      storagePath: template.template_storage_path,
      fileName: template.template_file_name,
      isDefault: template.is_default,
      metadata: reviewMetadata(template.metadata_json),
      sourceSha256,
      sourceAvailable: source.available,
      sectionsSha256,
    }
    entries.push({
      templateId: template.id,
      organisationId: template.organisation_id,
      packetType: template.packet_type,
      templateKey: template.template_key,
      versionTag: template.version_tag,
      templateFormat: template.template_format,
      storageBucket: template.template_storage_bucket,
      storagePath: template.template_storage_path,
      sourceSha256,
      sourceAvailable: source.available,
      sourceError: source.error,
      sectionsSha256,
      sectionCount: sections.length,
      contentDigest: `sha256:${sha256(stableJson(reviewDefinition))}`,
      sourceUpdatedAt: template.updated_at,
    })
  }
  return { projectRef, candidateOrganisationIds, templates: entries }
}
