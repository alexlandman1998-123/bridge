import { normalizeBondApplicationDocumentStatus } from './bondApplicationDocumentStatus.js'
import { buildBuyerDocumentPresentationModel } from '../../../../core/clientPortal/buyerDocumentPresentationModel.js'

export function isBondStatementHandoff(requirement = {}) {
  return /bank_statements?/.test([requirement.canonicalDocumentType, requirement.key, requirement.baseRequirementKey].filter(Boolean).join(' '))
}

export function presentBondDocument(item) {
  const approved = item.status === 'satisfied' && (item.documents || []).filter(doc => normalizeBondApplicationDocumentStatus(doc.review_status || doc.status) === 'accepted').length >= item.requiredCount
  const status = approved ? 'approved' : ['satisfied', 'uploaded_pending_review'].includes(item.status) ? 'review' : 'action'
  return { ...item, presentationStatus: status, presentationStatusLabel: approved ? 'Approved' : status === 'review' ? 'Being reviewed' : item.status === 'rejected' ? 'Needs replacement' : item.status === 'partially_satisfied' ? 'More files needed' : 'Upload needed' }
}

export function buildBondDocumentWorkspace(checklist = {}) {
  const items = (checklist.items || []).map(presentBondDocument).map(item => ({ ...item, id: item.requirement.key, title: item.requirement.title, description: item.requirement.description, category: item.requirement.category, buyerCategoryKey: item.requirement.source === 'external' ? 'additional' : undefined, status: item.presentationStatus === 'approved' ? 'approved' : item.presentationStatus === 'review' ? 'under_review' : item.status === 'rejected' ? 'rejected' : 'missing' }))
  const model = buildBuyerDocumentPresentationModel({ items, source: 'bond_application_documents' })
  return { ...model, categories: model.categories.filter(category => category.items.length) }
}
