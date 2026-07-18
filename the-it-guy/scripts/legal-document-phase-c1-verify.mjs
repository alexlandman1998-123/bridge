import { inspectStoredSource, loadC1Context } from './legal-document-phase-c1-source.mjs'

const { mandateEntries, projectRef, client, templates } = await loadC1Context()
const templateById = new Map(templates.map((row) => [row.id, row]))
const blockers = []
const sources = []

for (const frozen of mandateEntries) {
  const template = templateById.get(frozen.templateId)
  if (!template) {
    blockers.push({ code: 'C1_TEMPLATE_MISSING', templateId: frozen.templateId })
    continue
  }
  if (template.packet_type !== 'mandate' || template.status !== 'published' || template.is_active === false) blockers.push({ code: 'C1_TEMPLATE_ROUTE_INACTIVE', templateId: frozen.templateId })
  if (template.template_storage_bucket !== frozen.storageBucket || template.template_storage_path !== frozen.storagePath) blockers.push({ code: 'C1_TEMPLATE_SOURCE_ROUTE_DRIFT', templateId: frozen.templateId })
  const source = await inspectStoredSource(client, template.template_storage_bucket, template.template_storage_path)
  sources.push({ templateId: frozen.templateId, bucket: template.template_storage_bucket, path: template.template_storage_path, ...source })
  if (!source.available) blockers.push({ code: 'C1_SOURCE_MISSING', templateId: frozen.templateId, detail: source.error })
  else if (source.valid === false) blockers.push({ code: 'C1_SOURCE_INVALID_DOCX', templateId: frozen.templateId, detail: source.error })
}

const solutionByCode = {
  C1_TEMPLATE_MISSING: 'Restore or deliberately replace the missing template record before source recovery.',
  C1_TEMPLATE_ROUTE_INACTIVE: 'Publish and activate the intended mandate route through template governance before C1.',
  C1_TEMPLATE_SOURCE_ROUTE_DRIFT: 'Stop and regenerate the review manifest only after the source-route change is deliberately reviewed.',
  C1_SOURCE_MISSING: 'Validate and upload the approved mandate DOCX with the guarded C1 recovery operator.',
  C1_SOURCE_INVALID_DOCX: 'Replace the object with a valid Word DOCX package; do not freeze or approve corrupted bytes.',
}
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.templateId || ''}`, row])).values()]
console.log(JSON.stringify({ phase: 'C1', status: unique.length ? 'NO_GO' : 'READY_FOR_B1_REFREEZE', projectRef, blockerCount: unique.length, blockers: unique.map((row) => ({ ...row, solution: solutionByCode[row.code] })), sources, nextStep: unique.length ? 'Resolve C1 source blockers.' : 'Regenerate B1; all previous B1/B2/B3 evidence is intentionally stale after source recovery.', checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
