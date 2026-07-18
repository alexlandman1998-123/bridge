import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { assessGeneratedDraftVersion } from '../src/core/documents/draftGenerationAssurance.js'

const runJson = (script, timeout = 300_000) => {
  const result = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 })
  try { return JSON.parse(result.stdout) } catch { return null }
}
const c3 = runJson('scripts/legal-document-phase-c3-verify.mjs')
const b3 = runJson('scripts/legal-document-phase-b3-verify.mjs')
const blockers = []
const evidence = []
if (c3?.status !== 'READY_FOR_B2') blockers.push({ code: 'D1_C3_NOT_READY' })
if (b3?.status !== 'READY_FOR_RELEASE_GATES') blockers.push({ code: 'D1_B3_NOT_READY' })

if (!blockers.length) {
  const config = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8'))
  const manifest = JSON.parse(fs.readFileSync('config/legal-document-review-manifest.json', 'utf8'))
  const organisationIds = [...new Set(config.cohortPreparation?.candidateOrganisationIds || [])]
  const templateIds = manifest.templates.map((row) => row.templateId)
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase URL and service role key are required for D1.')
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const client = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const [templatesResult, packetsResult] = await Promise.all([
    client.from('document_packet_templates').select('id, packet_type, metadata_json').in('id', templateIds),
    client.from('document_packets').select('id, organisation_id, packet_type, template_id, status, updated_at').in('organisation_id', organisationIds).in('packet_type', ['otp', 'mandate']).in('template_id', templateIds).order('updated_at', { ascending: false }).limit(200),
  ])
  if (templatesResult.error) throw templatesResult.error
  if (packetsResult.error) throw packetsResult.error
  const packets = packetsResult.data || []
  const packetIds = packets.map((row) => row.id)
  const versionsResult = packetIds.length
    ? await client.from('document_packet_versions').select('id, packet_id, render_status, rendered_document_id, rendered_file_path, rendered_file_url, placeholders_missing_json, validation_summary_json, generated_by, generated_at, created_at').in('packet_id', packetIds).eq('render_status', 'generated').order('generated_at', { ascending: false }).limit(500)
    : { data: [], error: null }
  if (versionsResult.error) throw versionsResult.error
  const templateById = new Map((templatesResult.data || []).map((row) => [row.id, row]))
  const packetById = new Map(packets.map((row) => [row.id, row]))
  const assessments = (versionsResult.data || []).map((version) => {
    const packet = packetById.get(version.packet_id) || {}
    const template = templateById.get(packet.template_id) || {}
    return assessGeneratedDraftVersion({ packet, template, version })
  })
  for (const packetType of ['otp', 'mandate']) {
    const candidates = assessments.filter((row) => row.packetType === packetType)
    const passing = candidates.find((row) => row.ready)
    evidence.push({ packetType, status: passing ? 'passed' : 'failed', packetId: passing?.packetId || candidates[0]?.packetId || null, versionId: passing?.versionId || candidates[0]?.versionId || null, templateId: passing?.templateId || candidates[0]?.templateId || null, generatedAt: passing?.generatedAt || candidates[0]?.generatedAt || null, reasons: passing ? [] : candidates[0]?.reasons || ['D1_CONTROLLED_DRAFT_MISSING'] })
    if (!passing) blockers.push({ code: candidates.length ? 'D1_CURRENT_PROVENANCE_DRAFT_MISSING' : 'D1_CONTROLLED_DRAFT_MISSING', packetType })
  }
}

const solutionByCode = {
  D1_C3_NOT_READY: 'Complete the governed C1-C3 source and review-cycle restart before generating acceptance drafts.',
  D1_B3_NOT_READY: 'Complete genuine B2 counsel review and atomic B3 runtime promotion first.',
  D1_CONTROLLED_DRAFT_MISSING: 'Generate one controlled post-approval draft for this document type through the normal user workflow.',
  D1_CURRENT_PROVENANCE_DRAFT_MISSING: 'Regenerate the controlled draft after D1 deployment so it carries current B1/B2/B3 and render provenance.',
}
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.packetType || ''}`, row])).values()]
console.log(JSON.stringify({ phase: 'D1', status: unique.length ? 'NO_GO' : 'READY_FOR_D2', blockerCount: unique.length, blockers: unique.map((row) => ({ ...row, solution: solutionByCode[row.code] })), c3Status: c3?.status || 'UNAVAILABLE', b3Status: b3?.status || 'UNAVAILABLE', evidence, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
