import fs from 'node:fs'
import { inspectDocx, inspectStoredSource, loadC1Context, normalizeIds } from './legal-document-phase-c1-source.mjs'

const WRITE_FLAG = 'LEGAL_DOCUMENT_PHASE_C1_WRITE'
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
const apply = process.argv.includes('--apply')
const candidatePath = arg('candidate')
const { manifest, mandateEntries, projectRef, client, templates } = await loadC1Context()
const targetBucket = arg('target-bucket') || mandateEntries[0]?.storageBucket || ''
const targetPath = arg('target-path') || mandateEntries[0]?.storagePath || ''
const targetEntries = mandateEntries.filter((row) => row.storageBucket === targetBucket && row.storagePath === targetPath)
const targetTemplateIds = normalizeIds(targetEntries.map((row) => row.templateId))
const liveById = new Map(templates.map((row) => [row.id, row]))
const blockers = []
let candidate = null

if (!candidatePath) blockers.push({ code: 'C1_CANDIDATE_REQUIRED', detail: 'Supply --candidate=<local-approved-mandate.docx>.' })
else if (!fs.existsSync(candidatePath)) blockers.push({ code: 'C1_CANDIDATE_NOT_FOUND', detail: candidatePath })
else {
  try { candidate = inspectDocx(fs.readFileSync(candidatePath)) } catch (error) { blockers.push({ code: 'C1_CANDIDATE_INVALID_DOCX', detail: error.message }) }
}
if (!targetEntries.length) blockers.push({ code: 'C1_TARGET_NOT_FROZEN', detail: `${targetBucket}/${targetPath}` })
for (const row of targetEntries) {
  const live = liveById.get(row.templateId)
  if (!live || live.packet_type !== 'mandate' || live.status !== 'published' || live.is_active === false) blockers.push({ code: 'C1_TARGET_TEMPLATE_NOT_ROUTABLE', templateId: row.templateId })
  if (live && (live.template_storage_bucket !== targetBucket || live.template_storage_path !== targetPath)) blockers.push({ code: 'C1_TARGET_ROUTE_DRIFT', templateId: row.templateId })
}
const stored = targetBucket && targetPath ? await inspectStoredSource(client, targetBucket, targetPath) : { available: false, error: 'Target bucket/path missing.' }
if (stored.available && candidate && stored.sha256 !== candidate.sha256) blockers.push({ code: 'C1_TARGET_ALREADY_EXISTS_DIFFERENT', detail: 'C1 refuses to overwrite an existing source object.' })
if (apply && process.env[WRITE_FLAG] !== 'true') blockers.push({ code: 'C1_WRITE_FLAG_MISSING' })
if (apply && arg('confirm-project-ref') !== projectRef) blockers.push({ code: 'C1_PROJECT_CONFIRMATION_MISMATCH' })
if (apply && arg('confirm-bucket') !== targetBucket) blockers.push({ code: 'C1_BUCKET_CONFIRMATION_MISMATCH' })
if (apply && arg('confirm-path') !== targetPath) blockers.push({ code: 'C1_PATH_CONFIRMATION_MISMATCH' })
if (apply && normalizeIds(arg('confirm-template-ids')).join(',') !== targetTemplateIds.join(',')) blockers.push({ code: 'C1_TEMPLATE_CONFIRMATION_MISMATCH' })
if (apply && arg('confirm-sha256') !== candidate?.sha256) blockers.push({ code: 'C1_DIGEST_CONFIRMATION_MISMATCH' })
if (apply && !arg('applied-by')) blockers.push({ code: 'C1_OPERATOR_MISSING' })
if (apply && !arg('reference')) blockers.push({ code: 'C1_REFERENCE_MISSING' })

const base = { phase: 'C1', mode: apply ? 'apply' : 'dry-run', projectRef, target: { bucket: targetBucket, path: targetPath, templateIds: targetTemplateIds }, candidate: candidate ? { path: candidatePath, ...candidate } : null, stored, blockers, mutatedData: false }
if (!apply || blockers.length) {
  console.log(JSON.stringify({ ...base, status: blockers.length ? 'BLOCKED' : stored.available ? 'ALREADY_RESTORED' : 'READY_TO_APPLY' }, null, 2))
  if (blockers.length) process.exitCode = 1
} else if (stored.available && stored.sha256 === candidate.sha256) {
  console.log(JSON.stringify({ ...base, status: 'ALREADY_RESTORED' }, null, 2))
} else {
  const bytes = fs.readFileSync(candidatePath)
  const upload = await client.storage.from(targetBucket).upload(targetPath, bytes, { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', upsert: false })
  if (upload.error) throw upload.error
  const verified = await inspectStoredSource(client, targetBucket, targetPath)
  if (!verified.available || verified.sha256 !== candidate.sha256 || verified.valid === false) throw new Error('C1 upload verification failed; stop and investigate the stored object.')
  console.log(JSON.stringify({ ...base, status: 'RESTORED_READY_FOR_B1_REFREEZE', stored: verified, operator: { appliedBy: arg('applied-by'), reference: arg('reference') }, mutatedData: true }, null, 2))
}
