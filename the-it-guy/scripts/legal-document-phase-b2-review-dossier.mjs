import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const manifest = JSON.parse(fs.readFileSync('config/legal-document-review-manifest.json', 'utf8'))
const review = JSON.parse(fs.readFileSync('config/legal-document-counsel-review.json', 'utf8'))
const b1Run = spawnSync(process.execPath, ['scripts/legal-document-phase-b1-verify.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024 })
let b1 = null
try { b1 = JSON.parse(b1Run.stdout) } catch {}
const reviewByTemplateId = new Map((review.reviews || []).map((row) => [row.templateId, row]))

console.log(JSON.stringify({
  phase: 'B2',
  status: b1?.status === 'FROZEN' ? 'READY_FOR_COUNSEL' : 'BLOCKED_BY_B1',
  projectRef: manifest.projectRef,
  b1ManifestDigest: manifest.manifestDigest,
  instructions: [
    'Review the exact source identified by sourceMode: storageBucket/storagePath for legacy DOCX templates, or the frozen native section set for native structured templates.',
    'Do not approve a missing legacy DOCX source when sourceAvailable is false.',
    'Record approved, changes_requested, or rejected against the exact contentDigest.',
    'Any template change invalidates this dossier and requires a new B1 freeze.',
  ],
  reviewItems: (manifest.templates || []).map((template) => ({
    templateId: template.templateId,
    packetType: template.packetType,
    organisationId: template.organisationId,
    templateKey: template.templateKey,
    versionTag: template.versionTag,
    storageBucket: template.storageBucket,
    storagePath: template.storagePath,
    sourceMode: template.sourceMode || (template.storagePath ? 'legacy_storage_object' : null),
    sourceAvailable: template.sourceAvailable,
    sourceSha256: template.sourceSha256,
    sectionsSha256: template.sectionsSha256,
    contentDigest: template.contentDigest,
    currentDecision: reviewByTemplateId.get(template.templateId)?.decision || 'missing',
  })),
  blockers: b1?.blockers || [{ code: 'B2_B1_VERIFICATION_UNAVAILABLE' }],
  generatedAt: new Date().toISOString(),
  mutatedData: false,
}, null, 2))
if (b1?.status !== 'FROZEN') process.exitCode = 1
