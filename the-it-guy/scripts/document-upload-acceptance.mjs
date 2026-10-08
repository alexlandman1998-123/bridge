import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises'
import { resolve, dirname, relative, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import { DOCUMENT_UPLOAD_RELEASE_MATRIX, DOCUMENT_UPLOAD_RELEASE_SCENARIOS, buildDocumentUploadReleaseReadiness } from '../src/services/documents/documentUploadReleaseReadinessService.js'

// Local evidence preparation/validation only. This script has no Supabase
// client, credentials, browser sessions, remote writes or deployment behavior.
const args = process.argv.slice(2)
const value = (flag) => { const index = args.indexOf(flag); return index < 0 ? '' : args[index + 1] || '' }
const target = { environment: value('--environment'), projectId: value('--project'), buildId: value('--build'), runId: value('--run') }
const output = value('--output')
if (!output || (!args.includes('--prepare') && !value('--evidence'))) throw new Error('Use --prepare --output <file>, or --evidence <file> --environment <name> --project <id> --build <id> --run <id> --output <file>.')
let packet
if (args.includes('--prepare')) {
  packet = {
    schemaVersion: 1, target, appliedMigrationVersions: [], malwareScan: { scanned: false },
    evidenceBySurface: Object.fromEntries(DOCUMENT_UPLOAD_RELEASE_MATRIX.map((surface) => [surface.id, Object.fromEntries(surface.variants.map((variant) => [variant, Object.fromEntries(DOCUMENT_UPLOAD_RELEASE_SCENARIOS.map((scenario) => [scenario, {
      ...target, surfaceId: surface.id, variant, scenario, mode: 'hosted', status: 'not_run', checkedAt: '', artifact: '', artifactSha256: '', observation: {},
    }]))]))])),
  }
} else {
  if (Object.values(target).some((item) => !item)) throw new Error('Verification requires the exact environment, project, deployed build and run.')
  const input = resolve(value('--evidence'))
  if (input === resolve(output)) throw new Error('Keep the evidence packet separate from the validation report.')
  packet = JSON.parse(await readFile(input, 'utf8'))
  if (packet.schemaVersion !== 1) throw new Error('Unsupported evidence schema.')
  const base = await realpath(dirname(input))
  const artifactErrors = []
  for (const surface of DOCUMENT_UPLOAD_RELEASE_MATRIX) for (const variant of surface.variants) for (const scenario of DOCUMENT_UPLOAD_RELEASE_SCENARIOS) {
    const receipt = packet.evidenceBySurface?.[surface.id]?.[variant]?.[scenario]
    if (receipt?.status !== 'passed') continue
    try {
      if (!receipt.artifact || isAbsolute(receipt.artifact)) throw new Error('Artifact must be a relative file inside the evidence directory.')
      const path = await realpath(resolve(base, receipt.artifact))
      const rel = relative(base, path)
      if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Artifact escapes the evidence directory.')
      const digest = createHash('sha256').update(await readFile(path)).digest('hex')
      if (digest !== receipt.artifactSha256) throw new Error('Artifact hash mismatch.')
    } catch (error) {
      receipt.status = 'invalid_artifact'
      artifactErrors.push({ surface: surface.id, variant, scenario, message: error.message })
    }
  }
  // Evidence cannot supply the verification clock or widen its own lifetime.
  packet = { ...buildDocumentUploadReleaseReadiness({ evidenceBySurface: packet.evidenceBySurface, appliedMigrationVersions: packet.appliedMigrationVersions, malwareScan: packet.malwareScan, target }), artifactErrors }
  if (!packet.ready) process.exitCode = 1
}
await mkdir(dirname(resolve(output)), { recursive: true })
await writeFile(output, `${JSON.stringify(packet, null, 2)}\n`)
console.log(args.includes('--prepare') ? 'Prepared 27-area document acceptance packet. All scenarios are marked not_run.' : `Document acceptance ${packet.ready ? 'passed' : 'blocked'}: ${packet.summary.readySurfaces}/${packet.summary.surfaces} areas have complete hosted evidence.`)
