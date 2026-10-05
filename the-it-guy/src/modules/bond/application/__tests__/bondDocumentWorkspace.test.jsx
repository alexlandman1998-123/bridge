// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import DocumentsChecklistScreen from '../guided/DocumentsChecklistScreen.jsx'
import { buildBondDocumentWorkspace } from '../documents/bondDocumentWorkspacePresentation.js'
import { buildBondApplicationDocumentChecklist } from '../documents/buildBondApplicationDocumentChecklist.js'
import { useBondApplicationDocuments } from '../guided/hooks/useBondApplicationDocuments.js'
import { createEmptyBondApplicationState } from '../bondApplicationState.js'
import { buildDocumentCentreSections } from '../../../../components/client-portal/documents/ClientDocumentCentre.jsx'
afterEach(cleanup)
it('keeps newly reconciled bond requests visible alongside the Document Centre snapshot without duplicating shared ID', () => {
  const result = buildDocumentCentreSections({ items: [{ id: 'existing-id', sourceType: 'required_document', sourceId: 'buyer_id_document', title: 'ID', status: 'required' }], requiredDocuments: [{ key: 'bond_application_identity', document_key: 'bond_application_identity', canonicalDocumentType: 'buyer_id_document', document_label: 'ID', status: 'missing' }, { key: 'bond_application_deposit', document_key: 'bond_application_deposit', canonicalDocumentType: 'proof_of_funds', document_label: 'Proof of deposit', status: 'missing' }] }, 'buying')
  expect(result.allRequired.map(item => item.title)).toEqual(['ID', 'Proof of deposit'])
})
const identity = { key: 'bond_application_identity', title: 'ID / Passport', category: 'Identity documents', description: 'A clear copy of your identity document.', active: true, required: true, minimumFileCount: 1, canonicalDocumentType: 'buyer_id_document', matching: { canonicalTypes: ['buyer_id_document'] } }
const income = { ...identity, key: 'bond_application_payslips', title: 'Payslips', description: 'Your recent payslips to verify income.', category: 'Income documents', canonicalDocumentType: 'payslips', matching: { canonicalTypes: ['payslips'] } }
const controller = checklist => ({ checklist, uploadState: {}, uploadDocument: vi.fn(), retryUpload: vi.fn(), refresh: vi.fn().mockResolvedValue({ ok: true }) })
it('uses a Document Centre identity link once and separates received from approved', () => {
  const checklist = buildBondApplicationDocumentChecklist({ activeRequirements: [identity, income], existingRequiredDocuments: [{ document_key: 'buyer_id_document', uploaded_document_id: 'id-file', is_required: true }, { document_key: 'reservation_deposit_pop', is_required: true }, { document_key: 'manual_originator_request', document_label: 'Consultant request', is_required: true }], existingDocuments: [{ id: 'id-file', document_type: 'custom', name: 'ID.pdf', status: 'uploaded' }] })
  expect(checklist.items).toHaveLength(3)
  expect(checklist.items.some(item => item.requirement.key === 'reservation_deposit_pop')).toBe(false)
  expect(checklist.items[0].documents[0].id).toBe('id-file')
  const model = buildBondDocumentWorkspace(checklist)
  expect(model.counts.review).toBe(1)
  expect(model.counts.approved).toBe(0)
  expect(model.categories.map(category => category.label)).toEqual(['Identity & Compliance', 'Finance Documents', 'Additional Requests'])
  expect(buildBondDocumentWorkspace(buildBondApplicationDocumentChecklist({ activeRequirements: [identity], existingDocuments: [{ id: 'approved', document_type: 'buyer_id_document', review_status: 'approved' }] })).counts.approved).toBe(1)
})
it('shows category tabs, all files, inline upload and file viewing', () => {
  const documents = [{ id: 'id-file', document_type: 'buyer_id_document', name: 'ID.pdf', status: 'approved' }, { id: 'p1', document_type: 'payslips', name: 'June.pdf', status: 'under_review' }, { id: 'p2', document_type: 'payslips', name: 'July.pdf', status: 'under_review' }]
  const control = controller(buildBondApplicationDocumentChecklist({ activeRequirements: [identity, { ...income, minimumFileCount: 3, allowMultipleFiles: true }], existingDocuments: documents }))
  const open = vi.fn()
  const centre = vi.fn()
  render(<DocumentsChecklistScreen documentsController={control} onOpenDocument={open} onOpenDocuments={centre} />)
  fireEvent.click(screen.getByRole('button', { name: /Finance Documents/ }))
  expect(screen.getByText('June.pdf')).toBeTruthy()
  expect(screen.getByText('July.pdf')).toBeTruthy()
  expect(screen.getByText(/2 of 3 files received/, { selector: 'p' })).toBeTruthy()
  fireEvent.click(screen.getAllByRole('button', { name: 'View file' })[0])
  expect(open).toHaveBeenCalledWith(documents[1])
  const file = new File(['test'], 'August.pdf')
  fireEvent.change(screen.getByLabelText('Upload document: Payslips'), { target: { files: [file] } })
  expect(control.uploadDocument).toHaveBeenCalledWith(expect.objectContaining({ requirement: expect.objectContaining({ key: income.key }) }), file)
  fireEvent.click(screen.getByRole('button', { name: 'Document Centre' }))
  expect(centre).toHaveBeenCalledOnce()
})
it('keeps bank statements local and blocks the shared uploader', async () => {
  const requirement = { ...income, key: 'bond_application_bank_statements', title: 'Bank statements', canonicalDocumentType: 'bank_statements', evidencePeriodMonths: 6, matching: { canonicalTypes: ['bank_statements'] } }
  const control = controller(buildBondApplicationDocumentChecklist({ activeRequirements: [requirement] }))
  render(<DocumentsChecklistScreen documentsController={control} />)
  fireEvent.change(screen.getByLabelText('Choose statements: Bank statements'), { target: { files: [new File(['private'], 'Statement.pdf')] } })
  expect(screen.getByText(/Statement.pdf · Selected, not sent/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Send to bond consultant' }).disabled).toBe(true)
  expect(control.uploadDocument).not.toHaveBeenCalled()
  const upload = vi.fn()
  const { result } = renderHook(() => useBondApplicationDocuments({ applicationState: createEmptyBondApplicationState(), onUploadRequiredDocument: upload }))
  await act(async () => { expect((await result.current.uploadDocument(requirement, new File(['private'], 'Statement.pdf'))).ok).toBe(false) })
  expect(upload).not.toHaveBeenCalled()
})
it('refreshes on entry and focus without repeated reconciliation or saving on focus', async () => {
  const saved = vi.fn().mockResolvedValue({})
  const reconcile = vi.fn().mockResolvedValue([])
  const refresh = vi.fn().mockResolvedValue({ documents: [], requiredDocuments: [] })
  const state = createEmptyBondApplicationState()
  const { rerender } = renderHook(({ active }) => useBondApplicationDocuments({ applicationState: state, active, saveLatestApplication: saved, onReconcileDocumentRequirements: reconcile, onRefreshDocuments: refresh }), { initialProps: { active: false } })
  expect(refresh).not.toHaveBeenCalled()
  rerender({ active: true })
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  await act(async () => { window.dispatchEvent(new Event('focus')) })
  expect(refresh).toHaveBeenCalledTimes(2)
  expect(saved).toHaveBeenCalledTimes(1)
  expect(reconcile).toHaveBeenCalledTimes(1)
})
it('preserves a rejected file and displays its replacement feedback', () => {
  const control = controller(buildBondApplicationDocumentChecklist({ activeRequirements: [identity], existingDocuments: [{ id: 'rejected', document_type: 'buyer_id_document', name: 'Blurred.pdf', status: 'rejected', rejection_reason: 'Please upload a clearer copy' }] }))
  render(<DocumentsChecklistScreen documentsController={control} />)
  expect(within(screen.getByRole('complementary')).getByText('Please upload a clearer copy')).toBeTruthy()
  expect(screen.getByText('Replace document')).toBeTruthy()
})
