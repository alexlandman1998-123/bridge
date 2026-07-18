import fs from 'node:fs'
import { buildLegalDocumentReviewSnapshot, sha256, stableJson } from './legal-document-review-fingerprint.mjs'

const manifestPath = 'config/legal-document-review-manifest.json'
const blockers = []
let manifest = null
let snapshot = null
try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch (error) { blockers.push({ code: 'B1_REVIEW_MANIFEST_MISSING', detail: error.message }) }
try { snapshot = await buildLegalDocumentReviewSnapshot() } catch (error) { blockers.push({ code: 'B1_FINGERPRINT_UNAVAILABLE', detail: error.message }) }

if (manifest && snapshot) {
  const expectedManifestDigest = `sha256:${sha256(stableJson({ ...manifest, generatedAt: undefined, manifestDigest: undefined }))}`
  if (manifest.manifestDigest !== expectedManifestDigest) blockers.push({ code: 'B1_MANIFEST_DIGEST_MISMATCH', expectedDigest: expectedManifestDigest, actualDigest: manifest.manifestDigest || null })
  if (manifest.status !== 'frozen_for_counsel_review') blockers.push({ code: 'B1_MANIFEST_NOT_FROZEN' })
  if (manifest.projectRef !== snapshot.projectRef) blockers.push({ code: 'B1_PROJECT_REF_MISMATCH' })
  if ([...(manifest.candidateOrganisationIds || [])].sort().join(',') !== snapshot.candidateOrganisationIds.join(',')) blockers.push({ code: 'B1_COHORT_DRIFT' })
  const expected = new Map((manifest.templates || []).map((row) => [row.templateId, row]))
  const actual = new Map(snapshot.templates.map((row) => [row.templateId, row]))
  for (const [templateId, row] of expected) {
    if (!actual.has(templateId)) blockers.push({ code: 'B1_FROZEN_TEMPLATE_MISSING', templateId })
    else if (actual.get(templateId).contentDigest !== row.contentDigest) blockers.push({ code: 'B1_TEMPLATE_CONTENT_DRIFT', templateId, expectedDigest: row.contentDigest, actualDigest: actual.get(templateId).contentDigest })
  }
  for (const templateId of actual.keys()) if (!expected.has(templateId)) blockers.push({ code: 'B1_UNREVIEWED_ROUTABLE_TEMPLATE', templateId })
  for (const row of snapshot.templates) if (!row.sourceAvailable) blockers.push({ code: 'B1_TEMPLATE_SOURCE_UNREADABLE', templateId: row.templateId, detail: row.sourceError })
}

const solutionByCode = {
  B1_REVIEW_MANIFEST_MISSING: 'Generate the B1 snapshot, review it, and commit the approved manifest.',
  B1_MANIFEST_DIGEST_MISMATCH: 'Reject the edited manifest and regenerate it from the live template sources.',
  B1_PROJECT_REF_MISMATCH: 'Regenerate the manifest against the exact staging project used for release evidence.',
  B1_COHORT_DRIFT: 'Review the changed cohort and deliberately regenerate the manifest.',
  B1_FROZEN_TEMPLATE_MISSING: 'Restore the frozen version or replace it with a newly reviewed version and regenerate the manifest.',
  B1_TEMPLATE_CONTENT_DRIFT: 'Stop counsel review, inspect the change, and regenerate the manifest only if the new wording is intentional.',
  B1_UNREVIEWED_ROUTABLE_TEMPLATE: 'Add the new route to the counsel review set and regenerate the manifest.',
  B1_TEMPLATE_SOURCE_UNREADABLE: 'Restore the exact DOCX object or publish a new renderable version, then regenerate the manifest before counsel approval.',
}

console.log(JSON.stringify({
  phase: 'B1',
  status: blockers.length ? 'NO_GO' : 'FROZEN',
  blockerCount: blockers.length,
  blockers: blockers.map((item) => ({ ...item, solution: solutionByCode[item.code] || 'Resolve the B1 evidence failure and regenerate the review manifest.' })),
  manifestDigest: manifest?.manifestDigest || null,
  templates: snapshot?.templates.map((row) => ({ templateId: row.templateId, packetType: row.packetType, organisationId: row.organisationId, contentDigest: row.contentDigest })) || [],
  checkedAt: new Date().toISOString(),
  mutatedData: false,
}, null, 2))
if (blockers.length) process.exitCode = 1
