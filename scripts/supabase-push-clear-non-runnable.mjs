#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MANIFEST_PATH = path.join('docs', 'supabase-phase-5-application-manifest.json')
const CLEARANCE_DIR = path.join('docs', 'non-runnable-clearance')
const CORRECTIVE_PACKET_DIR = path.join('docs', 'corrective-migration-packets')
const MANUAL_REVIEW_DIR = path.join('docs', 'manual-review')
const JSON_REPORT_PATH = path.join('docs', 'supabase-push-non-runnable-clearance.json')
const MARKDOWN_REPORT_PATH = path.join('docs', 'supabase-push-non-runnable-clearance-report.md')
const TARGET_ACTIONS = new Set(['corrective_migration_required', 'manual_data_review'])
const RUNNABLE_CLEARANCE_DECISIONS = new Set([
  'apply_original_after_dependency_check',
  'repair_only_after_smoke',
  'apply_corrective_after_dependency_check',
])

function findRepoRoot(startDir) {
  let current = startDir
  while (current && current !== path.dirname(current)) {
    if (existsSync(path.join(current, 'supabase', 'migrations'))) return current
    current = path.dirname(current)
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

function parseArgs(argv) {
  const options = { verifyLive: true, json: false }
  for (const arg of argv) {
    if (arg === '--local-only' || arg === '--plan') options.verifyLive = false
    else if (arg === '--verify-live') options.verifyLive = true
    else if (arg === '--json') options.json = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function normalizeIdentifier(value = '') {
  return String(value || '').replace(/"/g, '').trim()
}

function sqlLiteral(value = '') {
  return `'${String(value ?? '').replace(/'/g, "''")}'`
}

function matchAll(source, pattern, onMatch) {
  let match = pattern.exec(source)
  while (match) {
    onMatch(match)
    match = pattern.exec(source)
  }
}

function extractObjects(row, repoRoot) {
  const migrationPath = path.join(repoRoot, 'supabase', 'migrations', row.file)
  if (!existsSync(migrationPath)) return []
  const source = readFileSync(migrationPath, 'utf8')
  const objects = []
  const add = (objectType, objectName, relationName = '') => {
    const normalizedName = normalizeIdentifier(objectName)
    const normalizedRelation = normalizeIdentifier(relationName)
    if (!normalizedName) return
    objects.push({
      migrationVersion: row.version,
      migrationFile: row.file,
      stream: row.stream,
      action: row.action,
      objectType,
      objectName: normalizedName,
      relationName: normalizedRelation,
    })
  }

  matchAll(source, /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z_][\w]*)/gi, ([, name]) => add('table', name))
  matchAll(source, /\bcreate\s+(?:or\s+replace\s+)?view\s+(?:public\.)?([a-zA-Z_][\w]*)/gi, ([, name]) => add('view', name))
  matchAll(source, /\bcreate\s+(?:or\s+replace\s+)?materialized\s+view\s+(?:public\.)?([a-zA-Z_][\w]*)/gi, ([, name]) => add('view', name))
  matchAll(source, /\bcreate\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-zA-Z_][\w]*)\s*\(/gi, ([, name]) => add('function', name))
  matchAll(source, /\bcreate\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-zA-Z_][\w]*)/gi, ([, name]) => add('index', name))
  matchAll(source, /\badd\s+constraint\s+([a-zA-Z_][\w]*)/gi, ([, name]) => add('constraint', name))
  matchAll(source, /\bcreate\s+trigger\s+([a-zA-Z_][\w]*)/gi, ([, name]) => add('trigger', name))
  matchAll(source, /\bcreate\s+policy\s+([a-zA-Z_][\w]*)\s+on\s+(?:public\.)?([a-zA-Z_][\w]*)/gi, ([, name, table]) => add('policy', name, table))
  matchAll(source, /\bcreate\s+type\s+(?:public\.)?([a-zA-Z_][\w]*)/gi, ([, name]) => add('type', name))

  const unique = new Map()
  for (const object of objects) {
    unique.set([object.migrationVersion, object.objectType, object.objectName, object.relationName].join('|'), object)
  }
  return [...unique.values()]
}

function buildObjectCheckSql(objects) {
  const rows = objects.map((object) => `    (${[
    object.migrationVersion,
    object.migrationFile,
    object.stream,
    object.action,
    object.objectType,
    object.objectName,
    object.relationName,
  ].map(sqlLiteral).join(', ')})`)

  return `with expected(migration_version, migration_file, stream, action, object_type, object_name, relation_name) as (
  values
${rows.join(',\n')}
)
select
  migration_version,
  migration_file,
  stream,
  action,
  object_type,
  object_name,
  relation_name,
  case object_type
    when 'table' then to_regclass('public.' || object_name) is not null
    when 'view' then to_regclass('public.' || object_name) is not null
    when 'index' then to_regclass('public.' || object_name) is not null
    when 'type' then exists (
      select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typname = object_name
    )
    when 'function' then exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = object_name
    )
    when 'policy' then exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.policyname = object_name
        and (relation_name = '' or p.tablename = relation_name)
    )
    when 'constraint' then exists (select 1 from pg_constraint c where c.conname = object_name)
    when 'trigger' then exists (
      select 1 from pg_trigger t where t.tgname = object_name and not t.tgisinternal
    )
    else false
  end as live_exists
from expected
order by migration_version, object_type, object_name;
`
}

function parseJsonLoose(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return null
  try { return JSON.parse(trimmed) } catch {
    const offset = Math.min(...[trimmed.indexOf('{'), trimmed.indexOf('[')].filter((index) => index >= 0))
    if (!Number.isFinite(offset)) return null
    try { return JSON.parse(trimmed.slice(offset)) } catch { return null }
  }
}

function rowsFromSupabaseJson(stdout) {
  const parsed = parseJsonLoose(stdout)
  return Array.isArray(parsed?.rows) ? parsed.rows : (Array.isArray(parsed) ? parsed : [])
}

function runSupabase(repoRoot, args) {
  const result = spawnSync('npx', ['--yes', 'supabase@latest', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  })
  return {
    ok: result.status === 0 && !result.error,
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error?.message || '',
  }
}

function liveObjectRows(repoRoot, objects, verifyLive) {
  if (!verifyLive || !objects.length) return []
  const tempSqlPath = path.join(os.tmpdir(), `supabase-non-runnable-clearance-${process.pid}.sql`)
  writeFileSync(tempSqlPath, buildObjectCheckSql(objects))
  const result = runSupabase(repoRoot, ['db', 'query', '--linked', '--file', tempSqlPath, '--output-format', 'json'])
  if (!result.ok) throw new Error(`Could not read live object state: ${result.stderr || result.error}`)
  return rowsFromSupabaseJson(result.stdout).map((row) => ({
    migrationVersion: String(row.migration_version),
    migrationFile: String(row.migration_file),
    stream: String(row.stream),
    action: String(row.action),
    objectType: String(row.object_type),
    objectName: String(row.object_name),
    relationName: String(row.relation_name || ''),
    liveExists: row.live_exists === true,
  }))
}

function mandateReview(repoRoot, verifyLive) {
  if (!verifyLive) return { checked: false, decision: 'manual_review_required', blockers: ['live_data_not_checked'] }
  const sql = `with candidates as (
  select
    template.id,
    row_number() over (
      order by
        case when lower(coalesce(template.status, '')) = 'published' then 0 else 1 end,
        case when template.is_active then 0 else 1 end,
        (select count(*) from public.document_template_sections section where section.template_id = template.id) desc,
        template.updated_at desc nulls last,
        template.created_at desc nulls last,
        template.id
    ) as rank
  from public.document_packet_templates template
  where template.organisation_id is null
    and lower(coalesce(template.module_type, '')) = 'agency'
    and lower(coalesce(template.packet_type, '')) = 'mandate'
    and template.template_key = 'mandate_default_v1'
    and lower(coalesce(template.template_format, '')) in ('structured', 'json')
    and lower(coalesce(template.metadata_json->>'render_mode', template.metadata_json->>'renderMode', '')) = 'native_structured'
),
selected as (
  select * from candidates where rank = 1
)
select
  (select count(*) from candidates) as candidate_count,
  (select count(*) from public.document_packet_templates template
   where template.organisation_id is null
     and lower(coalesce(template.module_type, '')) = 'agency'
     and lower(coalesce(template.packet_type, '')) = 'mandate'
     and template.template_key = 'mandate_default_v1'
     and lower(coalesce(template.status, '')) = 'published'
     and template.is_active
     and template.is_default
     and lower(coalesce(template.template_format, '')) = 'structured'
     and lower(coalesce(template.metadata_json->>'render_mode', template.metadata_json->>'renderMode', '')) = 'native_structured'
     and coalesce((template.metadata_json->>'platform_default_document')::boolean, false)) as compliant_active_defaults,
  selected.id as selected_template_id,
  (select count(*) from public.document_template_sections section where section.template_id = selected.id) as selected_section_count,
  (select count(*) from public.document_template_sections section where section.template_id = selected.id and lower(coalesce(section.section_type, '')) = 'signature_zone') as selected_signature_count,
  (select count(*) from public.document_template_sections section where section.template_id = selected.id
    and (nullif(btrim(coalesce(section.legal_text, '')), '') is null
      or section.legal_text ~* '(update this clause|lorem ipsum|todo|tbd|insert (clause|text)|placeholder copy)')) as selected_bad_wording_count
from selected;`
  const tempSqlPath = path.join(os.tmpdir(), `supabase-global-mandate-clearance-${process.pid}.sql`)
  writeFileSync(tempSqlPath, sql)
  const result = runSupabase(repoRoot, ['db', 'query', '--linked', '--file', tempSqlPath, '--output-format', 'json'])
  if (!result.ok) return { checked: true, decision: 'manual_review_required', blockers: ['live_data_query_failed'], error: result.stderr || result.error }
  const row = rowsFromSupabaseJson(result.stdout)[0] || {}
  const candidateCount = Number(row.candidate_count || 0)
  const compliantActiveDefaults = Number(row.compliant_active_defaults || 0)
  const selectedSectionCount = Number(row.selected_section_count || 0)
  const selectedSignatureCount = Number(row.selected_signature_count || 0)
  const selectedBadWordingCount = Number(row.selected_bad_wording_count || 0)
  const blockers = []
  if (candidateCount < 1) blockers.push('global_mandate_candidate_missing')
  if (selectedSectionCount < 10) blockers.push('selected_template_section_count_below_10')
  if (selectedSignatureCount < 1) blockers.push('selected_template_signature_section_missing')
  if (selectedBadWordingCount > 0) blockers.push('selected_template_has_placeholder_wording')
  const decision = compliantActiveDefaults === 1
    ? 'repair_only_after_smoke'
    : blockers.length
      ? 'manual_review_required'
      : 'apply_original_after_dependency_check'
  return {
    checked: true,
    decision,
    blockers,
    candidateCount,
    compliantActiveDefaults,
    selectedTemplateId: row.selected_template_id || null,
    selectedSectionCount,
    selectedSignatureCount,
    selectedBadWordingCount,
  }
}

function markdownTable(headers, rows) {
  const line = (cells) => `| ${cells.join(' | ')} |`
  return [
    line(headers),
    line(headers.map(() => '---')),
    ...rows.map(line),
  ].join('\n')
}

function packetPath(row) {
  if (row.action === 'manual_data_review') return path.join(MANUAL_REVIEW_DIR, `${row.version}-${row.stream}.md`)
  return path.join(CORRECTIVE_PACKET_DIR, `${row.version}-${row.stream}.md`)
}

function clearancePath(row) {
  return path.join(CLEARANCE_DIR, `${row.version}-${row.stream}.json`)
}

function migrationVersionFromFile(filePath = '') {
  return path.basename(String(filePath || '')).match(/^(\d{12,})_/)?.[1] || ''
}

function correctiveStatus(repoRoot, row, existingClearance) {
  const correctiveMigrationFile = String(existingClearance.correctiveMigrationFile || '').trim()
  const definitionDiffReviewedBy = String(existingClearance.definitionDiffReviewedBy || '').trim()
  const correctiveMigrationReviewedBy = String(existingClearance.correctiveMigrationReviewedBy || '').trim()
  const correctiveApprovedBy = String(existingClearance.approvedBy || '').trim()
  const correctiveApprovedAt = String(existingClearance.approvedAt || '').trim()
  const blockers = []
  if (!correctiveMigrationFile) blockers.push('corrective_migration_not_written')
  else if (!correctiveMigrationFile.startsWith('supabase/migrations/')) blockers.push('corrective_migration_file_outside_migrations')
  else if (!existsSync(path.join(repoRoot, correctiveMigrationFile))) blockers.push('corrective_migration_file_missing')
  if (!definitionDiffReviewedBy) blockers.push('definition_diff_review_pending')
  if (!correctiveMigrationReviewedBy) blockers.push('corrective_migration_review_pending')
  if (!correctiveApprovedBy) blockers.push('corrective_clearance_approval_pending')
  if (!correctiveApprovedAt) blockers.push('corrective_clearance_approval_time_pending')

  const correctiveVersion = migrationVersionFromFile(correctiveMigrationFile)
  if (correctiveMigrationFile && !correctiveVersion) blockers.push('corrective_migration_version_unparseable')
  if (correctiveVersion && correctiveVersion <= row.version) blockers.push('corrective_migration_version_not_newer_than_source')

  return {
    clearanceDecision: blockers.length ? 'pending_corrective_migration' : 'apply_corrective_after_dependency_check',
    correctiveMigrationFile,
    correctiveVersion: correctiveVersion || null,
    definitionDiffReviewedBy,
    correctiveMigrationReviewedBy,
    blockers,
  }
}

function manualStatus(existingClearance, fallbackReview) {
  const decision = String(existingClearance.clearanceDecision || '').trim()
  const approved = String(existingClearance.approvedBy || '').trim() && String(existingClearance.approvedAt || '').trim()
  const existingBlockers = Array.isArray(existingClearance.blockers) ? existingClearance.blockers : []
  if (RUNNABLE_CLEARANCE_DECISIONS.has(decision) && approved && existingBlockers.length === 0) {
    return {
      decision,
      review: existingClearance.manualReview || { checked: true, decision, blockers: [] },
      blockers: [],
    }
  }
  return {
    decision: fallbackReview.decision,
    review: fallbackReview,
    blockers: [
      ...fallbackReview.blockers,
      ...(RUNNABLE_CLEARANCE_DECISIONS.has(fallbackReview.decision) && !approved
        ? ['manual_clearance_approval_pending']
        : []),
    ],
  }
}

function packetMarkdown(row) {
  const objectRows = row.objects.map((object) => [
    `\`${object.objectType}\``,
    `\`${object.objectName}\``,
    object.relationName ? `\`${object.relationName}\`` : '',
    object.liveExists === true ? 'Live' : object.liveExists === false ? 'Missing' : 'Not checked',
  ])
  const objectTable = objectRows.length
    ? markdownTable(['Type', 'Object', 'Relation', 'Live State'], objectRows)
    : 'No static objects were extracted from this migration.'
  const decision = row.clearanceDecision ? `\`${row.clearanceDecision}\`` : '`pending_corrective_migration`'
  const notes = row.action === 'manual_data_review'
    ? [
        '- Verify the selected global native mandate starter is the intended platform default.',
        '- If the live outcome is not compliant and the selected template passes section/signature/wording checks, route this row to apply the original data migration in staging.',
        '- If the live outcome is already compliant, route this row to repair-only after smoke evidence.',
      ].join('\n')
    : [
        '- Do not record the historical partially-live version as applied.',
        '- Apply the new timestamped corrective migration only after staging preflight and evidence checks.',
        '- Keep this packet as evidence that the live diff and corrective SQL were reviewed.',
      ].join('\n')
  const reviewState = row.action === 'manual_data_review'
    ? `
## Manual Review Evidence

- Candidate count: \`${row.manualReview?.candidateCount ?? 'not checked'}\`
- Compliant active defaults: \`${row.manualReview?.compliantActiveDefaults ?? 'not checked'}\`
- Selected template: \`${row.manualReview?.selectedTemplateId || 'not checked'}\`
- Selected sections: \`${row.manualReview?.selectedSectionCount ?? 'not checked'}\`
- Selected signature sections: \`${row.manualReview?.selectedSignatureCount ?? 'not checked'}\`
- Selected bad wording count: \`${row.manualReview?.selectedBadWordingCount ?? 'not checked'}\`
- Approved by: \`${row.approvedBy || 'pending'}\`
- Approved at: \`${row.approvedAt || 'pending'}\`
`
    : `
## Corrective Review Evidence

- Corrective migration file: \`${row.correctiveMigrationFile || 'pending'}\`
- Corrective migration version: \`${row.correctiveVersion || 'pending'}\`
- Definition diff reviewed by: \`${row.definitionDiffReviewedBy || 'pending'}\`
- Corrective migration reviewed by: \`${row.correctiveMigrationReviewedBy || 'pending'}\`
- Approved by: \`${row.approvedBy || 'pending'}\`
- Approved at: \`${row.approvedAt || 'pending'}\`
`

  return `# Non-Runnable Migration Clearance Packet

Version: \`${row.version}\`
Stream: \`${row.stream}\`
Original file: \`${row.file}\`
Original action: \`${row.action}\`
Clearance decision: ${decision}

## Object State

${objectTable}

## Required Work

${notes}
${reviewState}

## Blockers

${row.blockers.length ? row.blockers.map((blocker) => `- \`${blocker}\``).join('\n') : '- None'}
`
}

function buildMarkdown(result) {
  const rows = result.rows.map((row) => [
    `\`${row.version}\``,
    `\`${row.stream}\``,
    `\`${row.action}\``,
    `\`${row.clearanceDecision}\``,
    `${row.liveCount}/${row.objectCount}`,
    row.blockers.length ? row.blockers.map((blocker) => `\`${blocker}\``).join('<br>') : 'None',
    `\`${row.packetFile}\``,
  ])
  return `# Supabase Push Non-Runnable Clearance Report

Generated: ${result.generatedAt}

## Scope

This step clears the five non-runnable manifest rows into explicit review packets. It runs read-only live checks when requested and does not apply SQL, record ledgers, relink Supabase, or modify production.

## Summary

${markdownTable(['Field', 'Value'], [
    ['Non-runnable rows', String(result.rows.length)],
    ['Corrective packets', String(result.correctiveCount)],
    ['Manual review packets', String(result.manualCount)],
    ['Rows with a runnable clearance decision', String(result.runnableDecisionCount)],
    ['Rows ready for runner after clearance', String(result.runnerReadyCount)],
    ['Rows still requiring corrective SQL', String(result.correctivePendingCount)],
    ['Live verification performed', result.verifyLive ? 'Yes' : 'No'],
  ])}

## Work Queue

${markdownTable(['Version', 'Stream', 'Original Action', 'Clearance Decision', 'Objects Live', 'Blockers', 'Packet'], rows)}

## Rule

Partial-live rows remain blocked until a reviewed corrective migration exists. Manual data rows can be routed only after the live data outcome and idempotency checks are recorded in the packet.
`
}

function buildResult(repoRoot, options) {
  const manifest = readJson(path.join(repoRoot, MANIFEST_PATH))
  const targetRows = manifest.rows.filter((row) => TARGET_ACTIONS.has(row.action))
  const extractedObjects = targetRows.flatMap((row) => extractObjects(row, repoRoot))
  const liveRows = liveObjectRows(repoRoot, extractedObjects, options.verifyLive)
  const liveByVersion = new Map()
  for (const object of liveRows.length ? liveRows : extractedObjects.map((object) => ({ ...object, liveExists: null }))) {
    liveByVersion.set(object.migrationVersion, [...(liveByVersion.get(object.migrationVersion) || []), object])
  }
  const manualMandate = mandateReview(repoRoot, options.verifyLive)

  mkdirSync(path.join(repoRoot, CLEARANCE_DIR), { recursive: true })
  mkdirSync(path.join(repoRoot, CORRECTIVE_PACKET_DIR), { recursive: true })
  mkdirSync(path.join(repoRoot, MANUAL_REVIEW_DIR), { recursive: true })

  const rows = targetRows.map((row) => {
    const objects = liveByVersion.get(row.version) || []
    const liveCount = objects.filter((object) => object.liveExists === true).length
    const missingCount = objects.filter((object) => object.liveExists === false).length
    const clearanceFile = clearancePath(row)
    const absoluteClearanceFile = path.join(repoRoot, clearanceFile)
    const existingClearance = existsSync(absoluteClearanceFile) ? readJson(absoluteClearanceFile) : {}
    const corrective = row.action === 'corrective_migration_required'
      ? correctiveStatus(repoRoot, row, existingClearance)
      : null
    const manual = row.action === 'manual_data_review'
      ? manualStatus(existingClearance, manualMandate)
      : null
    const clearanceDecision = row.action === 'manual_data_review'
      ? manual.decision
      : corrective.clearanceDecision
    const correctiveMigrationFile = corrective?.correctiveMigrationFile || existingClearance.correctiveMigrationFile || ''
    const correctiveVersion = corrective?.correctiveVersion || existingClearance.correctiveVersion || null
    const definitionDiffReviewedBy = corrective?.definitionDiffReviewedBy || existingClearance.definitionDiffReviewedBy || ''
    const correctiveMigrationReviewedBy = corrective?.correctiveMigrationReviewedBy || existingClearance.correctiveMigrationReviewedBy || ''
    const blockers = row.action === 'manual_data_review'
      ? manual.blockers
      : corrective.blockers
    const packetFile = packetPath(row)
    const packet = {
      ...row,
      clearanceDecision,
      objectCount: objects.length,
      liveCount,
      missingCount,
      objects,
      manualReview: row.action === 'manual_data_review' ? manual.review : null,
      approvedBy: existingClearance.approvedBy || '',
      approvedAt: existingClearance.approvedAt || '',
      correctiveMigrationFile,
      correctiveVersion,
      definitionDiffReviewedBy,
      correctiveMigrationReviewedBy,
      blockers,
      packetFile,
      clearanceFile,
    }
    writeFileSync(path.join(repoRoot, clearanceFile), `${JSON.stringify(packet, null, 2)}\n`)
    writeFileSync(path.join(repoRoot, packetFile), packetMarkdown(packet))
    return packet
  })

  return {
    generatedAt: new Date().toISOString(),
    verifyLive: options.verifyLive,
    sourceManifest: MANIFEST_PATH,
    rows: rows.map((row) => ({
      version: row.version,
      stream: row.stream,
      file: row.file,
      action: row.action,
      clearanceDecision: row.clearanceDecision,
      objectCount: row.objectCount,
      liveCount: row.liveCount,
      missingCount: row.missingCount,
      blockers: row.blockers,
      packetFile: row.packetFile,
      clearanceFile: row.clearanceFile,
    })),
    correctiveCount: rows.filter((row) => row.action === 'corrective_migration_required').length,
    manualCount: rows.filter((row) => row.action === 'manual_data_review').length,
    runnableDecisionCount: rows.filter((row) => RUNNABLE_CLEARANCE_DECISIONS.has(row.clearanceDecision)).length,
    runnerReadyCount: rows.filter((row) => RUNNABLE_CLEARANCE_DECISIONS.has(row.clearanceDecision) && row.blockers.length === 0).length,
    correctivePendingCount: rows.filter((row) => row.clearanceDecision === 'pending_corrective_migration').length,
  }
}

function usage() {
  console.log('Usage:')
  console.log('  node scripts/supabase-push-clear-non-runnable.mjs [--verify-live] [--json]')
  console.log('  node scripts/supabase-push-clear-non-runnable.mjs --local-only [--json]')
}

try {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) usage()
  else {
    const repoRoot = findRepoRoot(process.cwd())
    const result = buildResult(repoRoot, options)
    writeFileSync(path.join(repoRoot, JSON_REPORT_PATH), `${JSON.stringify(result, null, 2)}\n`)
    writeFileSync(path.join(repoRoot, MARKDOWN_REPORT_PATH), buildMarkdown(result))
    if (options.json) console.log(JSON.stringify(result, null, 2))
    else console.log(`NON_RUNNABLE_CLEARANCE_READY: ${result.rows.length} packets, ${result.runnableDecisionCount} runnable decision(s), ${result.correctivePendingCount} corrective pending.`)
  }
} catch (error) {
  console.error(`Supabase non-runnable clearance failed: ${error.message}`)
  process.exitCode = 1
}
