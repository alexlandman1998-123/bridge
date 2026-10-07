import { readRentalSavedChecklist } from './rentalSavedChecklist.js'
import { publicRentalApplicationData } from '../../src/services/rentals/rentalApplicationFieldContract.js'
export function personRentalApplication(row, subjectId, requirements) {
  const person = row.application_data?.people?.find((item) => item.id === subjectId)
  if (!person) throw new Error('This person is no longer on the application. Contact your agent.')
  return { id: row.id, status: row.status, version: row.version, submittedAt: row.submitted_at, data: { people: [person], documentLinks: publicRentalApplicationData(row.application_data).documentLinks?.filter((link) => link.subjectId === subjectId && !link.invalidated && (!requirements || requirements.some((r) => r.active && (r.documentId === link.documentId || r.id === link.requirementId && r.generation === link.generation)))) || [] }, personName: [person.firstName, person.lastName].filter(Boolean).join(' '), portalType: 'person', subjectId }
}
export async function rentalApplicantDocumentUrl(db, application, documentId, subjectId = '') {
  const result = await db.from('rental_application_documents').select('id,storage_path,intake_requirement_id,intake_generation').eq('application_id', application.id).eq('organisation_id', application.organisation_id).eq('id', documentId).maybeSingle()
  const document = result.data
  if (result.error || !document || !document.storage_path?.startsWith(`${application.organisation_id}/${application.id}/`)) throw new Error('Document unavailable.')
  if (subjectId && !(application.application_data?.documentLinks || []).some((link) => link.documentId === documentId && link.subjectId === subjectId && !link.invalidated)) throw new Error('Document unavailable for this person.')
  if (subjectId) { const requirements = await readRentalSavedChecklist(db, application); if (!requirements.some((r) => r.active && r.subjectId === subjectId && (r.documentId === document.id || r.id === document.intake_requirement_id && r.generation === document.intake_generation))) throw new Error('This evidence is no longer current for this person.') }
  const signed = await db.storage.from('rental-application-documents').createSignedUrl(document.storage_path, 60)
  if (signed.error) throw signed.error
  return { url: signed.data.signedUrl }
}
