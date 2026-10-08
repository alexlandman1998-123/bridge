import { validateDocumentUploadFile } from '../../lib/documentUploadPolicy.js'
import { uploadRentalApplicationEvidence } from './rentalApplicationEvidenceService.js'
import { uploadRentalApplicationFile } from './rentalApplicationFileUpload.js'
import { requestRentalLandlordOnboarding } from './rentalLandlordOnboardingService.js'
import { getRentalApplicationDocumentUrl, recordRentalApplicationReview } from './rentalApplicationRepository.js'
import { rentalListingRequirementState } from './rentalListingDocumentMatrixModel.js'

export function rentalListingCanUpload(kind, section, row) {
  if (kind === 'landlord') return section.onboarding?.status === 'draft'
  const status = section.application?.status
  return ['draft', 'submitted', 'under_review'].includes(status) && (status === 'draft' || rentalListingRequirementState(row) !== 'accepted')
}

export function rentalListingCanReview(kind, section) {
  return kind === 'landlord' ? Boolean(section.onboarding) : ['submitted', 'under_review'].includes(section.application?.status)
}

export async function uploadRentalListingRequirement(kind, section, row, files, dependencies = {}) {
  const api = { uploadRentalApplicationEvidence, uploadRentalApplicationFile, requestRentalLandlordOnboarding, ...dependencies }
  if (!rentalListingCanUpload(kind, section, row)) throw new Error('This evidence is locked. Refresh the matrix before making a correction.')
  if (!files.length || (kind === 'landlord' && files.length !== 1)) throw new Error('Choose a file for this requirement.')
  files.forEach((file) => validateDocumentUploadFile(file, { surface: 'rental_application' }))
  const slot = { ...row, requirementId: row.requirementId || row.id }
  if (!slot.requirementId || !Number.isInteger(slot.generation)) throw new Error('The saved requirement is unavailable. Refresh the matrix.')
  const source = kind === 'landlord' ? section.onboarding : section.application
  const requirement = source.requirements?.find((item) => item.id === slot.requirementId && item.generation === slot.generation && item.active && item.subjectId === slot.subjectId && item.purpose === slot.purpose)
  if (!requirement || !Number.isInteger(source.version)) throw new Error('The saved requirement changed. Refresh the matrix before uploading.')
  let savedCount = 0
  try {
    if (kind === 'landlord') {
      const result = await api.uploadRentalApplicationFile(files[0], slot, section.onboarding.version, (body) => api.requestRentalLandlordOnboarding(section.id, 'POST', body))
      savedCount = 1
      if (!result.onboarding?.requirements) throw new Error('The file was saved, but the checklist could not refresh.')
    } else {
      let current = section.application
      for (const [index, file] of files.entries()) {
        const result = await api.uploadRentalApplicationEvidence(current, file, { ...slot, appendToPack: index > 0 })
        savedCount += 1
        current = result.application
        if (!current?.requirements || !Number.isInteger(current.version)) throw new Error('The file was saved, but the checklist could not refresh.')
      }
    }
    return { savedCount }
  } catch (cause) {
    const error = new Error(`${savedCount ? `${savedCount} of ${files.length} files saved. ` : ''}${cause.message} Refresh the matrix before retrying.`)
    error.savedCount = savedCount
    throw error
  }
}

export async function reviewRentalListingDocument(kind, section, document, review, dependencies = {}) {
  const api = { requestRentalLandlordOnboarding, recordRentalApplicationReview, ...dependencies }
  if (!rentalListingCanReview(kind, section)) throw new Error('Submit the application before reviewing its evidence.')
  const row = section.rows.find((item) => item.documents.some((file) => file.id === document.id))
  if (!row) throw new Error('This file is not current evidence in this matrix.')
  if (!['accepted', 'rejected'].includes(review.status) || !review.note?.trim()) throw new Error('Choose an outcome and record a review note.')
  if (kind === 'landlord' && row.purpose === 'property_disclosure' && review.status === 'accepted' && review.completedSigned !== true) throw new Error('Confirm that the prescribed disclosure is completed and signed.')
  if (kind === 'landlord') return api.requestRentalLandlordOnboarding(section.id, 'POST', { action: 'review_document', version: section.onboarding.version, patch: { documentId: document.id, ...review } })
  return api.recordRentalApplicationReview({ applicationId: section.id, expectedVersion: section.application.version, command: 'review_document', payload: { documentId: document.id, status: review.status, note: review.note } })
}

export async function getRentalListingDocumentUrl(kind, section, document, dependencies = {}) {
  const api = { requestRentalLandlordOnboarding, getRentalApplicationDocumentUrl, ...dependencies }
  if (kind === 'landlord') {
    const result = await api.requestRentalLandlordOnboarding(section.id, 'POST', { action: 'document_url', version: section.onboarding.version, documentId: document.id })
    return result.url
  }
  return api.getRentalApplicationDocumentUrl(section.id, document.id)
}

export async function downloadRentalListingDocument(url, fileName) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Unable to download this file. Please retry.')
  const objectUrl = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName || 'rental-document'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
