export { FINANCE_MANAGED_BY_OPTIONS, TRANSACTION_ROLE_LABELS } from '../core/transactions/roleConfig'
export const ONBOARDING_STATUSES = ['Not Started', 'In Progress', 'Submitted', 'Reviewed', 'Approved']

const WORKFLOW_COMMENT_META_PREFIX = '[[workflow-meta]]'

export function parseWorkflowStepComment(value) {
  const raw = String(value || '')
  const trimmed = raw.trim()
  if (!trimmed.startsWith(WORKFLOW_COMMENT_META_PREFIX)) return { note: trimmed, checklist: {} }
  const newline = trimmed.indexOf('\n')
  const source = (newline >= 0 ? trimmed.slice(WORKFLOW_COMMENT_META_PREFIX.length, newline) : trimmed.slice(WORKFLOW_COMMENT_META_PREFIX.length)).trim()
  try {
    const parsed = JSON.parse(source || '{}')
    return { note: newline >= 0 ? trimmed.slice(newline + 1).trim() : '', checklist: parsed?.checklist && typeof parsed.checklist === 'object' ? parsed.checklist : {} }
  } catch {
    return { note: raw.replace(WORKFLOW_COMMENT_META_PREFIX, '').trim(), checklist: {} }
  }
}

export function buildWorkflowStepComment({ note = '', checklist = {} } = {}) {
  const normalizedNote = String(note || '').trim()
  const normalizedChecklist = Object.fromEntries(Object.entries(checklist || {}).map(([key, checked]) => [key, Boolean(checked)]))
  if (!Object.keys(normalizedChecklist).length) return normalizedNote
  return `${WORKFLOW_COMMENT_META_PREFIX}${JSON.stringify({ checklist: normalizedChecklist })}${normalizedNote ? `\n${normalizedNote}` : ''}`
}

const workflowLoaders = {
  addTransactionDiscussionComment: () => import('../domains/transactions/discussionApi.js'),
  completeTransactionSubprocess: () => import('../domains/transactions/subprocessApi.js'),
  createTransactionDocumentRequests: () => import('../domains/documents/requestApi.js'),
  createWorkspaceAlteration: () => import('../domains/clientPortal/residentApi.js'),
  deleteTransactionEverywhere: () => import('../domains/transactions/deletionApi.js'),
  resendTransactionDocumentRequest: () => import('../domains/documents/requestApi.js'),
  resolveBuyerAppointedBondOriginatorRequest: () => import('../domains/transactions/detailApi.js'),
  updateTransactionDocumentRequestStatus: () => import('../domains/documents/requestApi.js'),
  getTransactionRollup: () => import('../domains/transactions/progressApi.js'),
  fetchUnitDetail: () => import('../domains/developments/unitWorkspaceApi.js'),
  fetchUnitWorkspaceShell: () => import('../domains/developments/unitWorkspaceApi.js'),
  getOrCreateTransactionOnboarding: () => import('../domains/onboarding/workflow.js'),
  getOrCreateClientPortalLink: () => import('../domains/clientPortal/accessApi.js'),
  archiveTransactionLifecycle: () => import('../domains/transactions/lifecycleActions.js'),
  recordBuyerOnboardingSent: () => import('../domains/onboarding/workflow.js'),
  recordTransactionProxyUpdate: () => import('../domains/transactions/discussionApi.js'),
  saveTransaction: () => import('../domains/transactions/saveWorkflow.js'),
  saveTransactionClientInformation: () => import('../domains/transactions/actionApi.js'),
  sendReservationDepositRequest: () => import('../domains/transactions/reservationApi.js'),
  signOffClientIssue: () => import('../domains/clientPortal/residentApi.js'),
  runWorkflowAction: () => import('../domains/transactions/actionApi.js'),
  updateDocumentClientVisibility: () => import('../domains/documents/workspaceApi.js'),
  updateOtpDocumentWorkflowState: () => import('../domains/clientPortal/signingApi.js'),
  updateTransactionRequiredDocumentStatus: () => import('../domains/documents/workspaceApi.js'),
  updateTransactionSubprocessStep: () => import('../domains/transactions/subprocessApi.js'),
  uploadDocument: () => import('../domains/documents/uploadWorkflow.js'),
}

async function call(method, ...args) {
  const api = await workflowLoaders[method]()
  return api[method](...args)
}

const METHODS = [
  'addTransactionDiscussionComment', 'completeTransactionSubprocess', 'createTransactionDocumentRequests',
  'createWorkspaceAlteration', 'deleteTransactionEverywhere', 'resendTransactionDocumentRequest',
  'resolveBuyerAppointedBondOriginatorRequest', 'updateTransactionDocumentRequestStatus', 'getTransactionRollup',
  'fetchUnitDetail', 'fetchUnitWorkspaceShell', 'getOrCreateTransactionOnboarding', 'getOrCreateClientPortalLink',
  'archiveTransactionLifecycle', 'recordBuyerOnboardingSent', 'recordTransactionProxyUpdate', 'saveTransaction',
  'saveTransactionClientInformation', 'sendReservationDepositRequest', 'signOffClientIssue', 'runWorkflowAction',
  'updateDocumentClientVisibility', 'updateOtpDocumentWorkflowState', 'updateTransactionRequiredDocumentStatus',
  'updateTransactionSubprocessStep', 'uploadDocument',
]
const operations = Object.fromEntries(METHODS.map((method) => [method, (...args) => call(method, ...args)]))
export const {
  addTransactionDiscussionComment, completeTransactionSubprocess, createTransactionDocumentRequests,
  createWorkspaceAlteration, deleteTransactionEverywhere, resendTransactionDocumentRequest,
  resolveBuyerAppointedBondOriginatorRequest, updateTransactionDocumentRequestStatus, getTransactionRollup,
  fetchUnitDetail, fetchUnitWorkspaceShell, getOrCreateTransactionOnboarding, getOrCreateClientPortalLink,
  archiveTransactionLifecycle, recordBuyerOnboardingSent, recordTransactionProxyUpdate, saveTransaction,
  saveTransactionClientInformation, sendReservationDepositRequest, signOffClientIssue, runWorkflowAction,
  updateDocumentClientVisibility, updateOtpDocumentWorkflowState, updateTransactionRequiredDocumentStatus,
  updateTransactionSubprocessStep, uploadDocument,
} = operations
