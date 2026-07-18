import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { assessPersistedDraftArtifact } from '../src/core/documents/draftArtifactAssurance.js'
import { inspectDocx } from './legal-document-phase-c1-source.mjs'

const d1Run = spawnSync(process.execPath, ['scripts/legal-document-phase-d1-verify.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 300_000, maxBuffer: 10 * 1024 * 1024 })
let d1 = null
try { d1 = JSON.parse(d1Run.stdout) } catch {}
const blockers = []
const evidence = []
if (d1?.status !== 'READY_FOR_D2') blockers.push({ code: 'D2_D1_NOT_READY' })

if (!blockers.length) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase URL and service role key are required for D2.')
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const client = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  for (const draft of d1.evidence || []) {
    const versionResult = await client.from('document_packet_versions').select('id, packet_id, rendered_file_path, validation_summary_json, generated_at').eq('id', draft.versionId).maybeSingle()
    if (versionResult.error) throw versionResult.error
    if (!versionResult.data) {
      blockers.push({ code: 'D2_VERSION_MISSING', packetType: draft.packetType })
      continue
    }
    const assessment = assessPersistedDraftArtifact({ version: versionResult.data, packetType: draft.packetType })
    if (!assessment.ready) {
      blockers.push({ code: 'D2_ARTIFACT_EVIDENCE_INVALID', packetType: draft.packetType, reasons: assessment.reasons })
      evidence.push({ packetType: draft.packetType, versionId: draft.versionId, status: 'failed', reasons: assessment.reasons })
      continue
    }
    const stored = assessment.provenance
    const download = await client.storage.from(stored.bucket).download(stored.path)
    if (download.error || !download.data) {
      blockers.push({ code: 'D2_ARTIFACT_UNREADABLE', packetType: draft.packetType, detail: download.error?.message || 'Object not found' })
      evidence.push({ packetType: draft.packetType, versionId: draft.versionId, status: 'failed', reasons: ['D2_ARTIFACT_UNREADABLE'] })
      continue
    }
    const bytes = Buffer.from(await download.data.arrayBuffer())
    const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
    const reasons = []
    if (bytes.length !== stored.byteLength) reasons.push('D2_ARTIFACT_SIZE_MISMATCH')
    if (digest !== stored.sha256) reasons.push('D2_ARTIFACT_DIGEST_MISMATCH')
    if (stored.mediaType === 'application/pdf') {
      if (bytes.subarray(0, 4).toString() !== '%PDF' || !bytes.subarray(Math.max(0, bytes.length - 1024)).toString().includes('%%EOF')) reasons.push('D2_ARTIFACT_PDF_INVALID')
    } else {
      try { inspectDocx(bytes) } catch { reasons.push('D2_ARTIFACT_DOCX_INVALID') }
    }
    if (reasons.length) blockers.push({ code: 'D2_STORED_ARTIFACT_MISMATCH', packetType: draft.packetType, reasons })
    evidence.push({ packetType: draft.packetType, packetId: draft.packetId, versionId: draft.versionId, status: reasons.length ? 'failed' : 'passed', mediaType: stored.mediaType, byteLength: bytes.length, sha256: digest, reasons })
  }
}

const solutionByCode = {
  D2_D1_NOT_READY: 'Generate current D1-compliant OTP and mandate drafts before artifact verification.',
  D2_VERSION_MISSING: 'Regenerate the controlled draft; its packet version no longer exists.',
  D2_ARTIFACT_EVIDENCE_INVALID: 'Regenerate after D2 deployment so bucket, path, media type, size, and digest are recorded.',
  D2_ARTIFACT_UNREADABLE: 'Restore or regenerate the missing controlled draft artifact.',
  D2_STORED_ARTIFACT_MISMATCH: 'Quarantine the changed artifact and regenerate it from the approved template and source data.',
}
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.packetType || ''}`, row])).values()]
console.log(JSON.stringify({ phase: 'D2', status: unique.length ? 'NO_GO' : 'READY_FOR_D3', blockerCount: unique.length, blockers: unique.map((row) => ({ ...row, solution: solutionByCode[row.code] })), d1Status: d1?.status || 'UNAVAILABLE', evidence, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
