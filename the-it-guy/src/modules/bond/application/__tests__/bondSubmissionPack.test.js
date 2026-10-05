// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { buildBondSubmissionPackPlan, createBondSubmissionPack } from '../exports/bondSubmissionPack.js'
import { hashBondApplicationSnapshot } from '../submission/bondApplicationSnapshotHash.js'
import { createBondSubmissionPackService } from '../../../../services/bondSubmissionPackService.js'
const originalBytes = new TextEncoder().encode('%PDF-1.7\nunchanged signed original')
const sha = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('')
async function fixture() {
  const snapshot = { transaction: { id: 'tx' }, submissionVersion: 2, documentManifest: [{ requirementKey: 'bank_statements', documents: [{ id: 'bank' }] }] }
  const submission = { id: 'sub', transaction_id: 'tx', submission_version: 2, signed_at: '2026-10-03T10:00:00Z', status: 'submitted', signed_document_id: 'signed', snapshot_json: snapshot, snapshot_hash: await hashBondApplicationSnapshot(snapshot), metadata: { signingMethod: 'wet_ink_upload' } }
  const doc = (id, status = 'accepted') => ({ id, transaction_id: 'tx', name: `${id}.pdf`, file_path: `tx/${id}.pdf`, file_bucket: 'documents', status })
  const documents = [doc('signed', 'uploaded'), doc('id'), doc('pending', 'uploaded'), doc('bank'), doc('bond'), { ...doc('foreign'), transaction_id: 'other' }]
  const item = (key, ids, minimumFileCount = 1) => ({ requirement: { key, title: key.replaceAll('_', ' '), minimumFileCount }, documents: ids.map(id => documents.find(d => d.id === id)) })
  return { transactionId: 'tx', submission, documents, originalEvidence: { documentId: 'signed', submissionId: 'sub', filePath: 'tx/signed.pdf', status: 'accepted', sha256: await sha(originalBytes), bytes: originalBytes.length }, readiness: { stage: 'bank_submission', ready: true, issues: [] }, documentChecklist: { items: [item('identity', ['id', 'pending', 'bank', 'foreign']), item('bank_statements', ['bank']), item('existing_property_bond_statement', ['bond']), item('payslips', ['pending'], 3)] } }
}
const renderChecklist = vi.fn(async () => new TextEncoder().encode('%PDF-1.7\nchecklist'))
it('includes only approved current documents and never includes statements through another requirement', async () => {
  const plan = buildBondSubmissionPackPlan(await fixture())
  expect(plan.files.map(f => f.id)).toEqual(['id', 'bond'])
  expect(plan.ready).toBe(false)
  expect(plan.rows.find(row => row.key === 'bank_statements')).toMatchObject({ external: true, outstanding: true, included: [] })
  expect(plan.rows.find(row => row.key === 'payslips').required).toBe(3)
})
it('preserves the accepted signed original byte for byte and rejects altered original evidence', async () => {
  const context = await fixture(), plan = buildBondSubmissionPackPlan(context)
  expect((await createBondSubmissionPack({ plan, output: 'application', loadFile: async () => originalBytes })).bytes).toEqual(originalBytes)
  await expect(createBondSubmissionPack({ plan, output: 'application', loadFile: async () => new TextEncoder().encode('%PDF-1.7\nchanged') })).rejects.toThrow('could not be verified')
  expect(() => buildBondSubmissionPackPlan({ ...context, originalEvidence: null })).toThrow('evidence')
  expect(() => buildBondSubmissionPackPlan({ ...context, originalEvidence: { ...context.originalEvidence, submissionId: 'old' } })).toThrow('evidence')
})
it('makes supporting-only ZIP with checklist, file hashes and explicit incomplete status', async () => {
  const plan = buildBondSubmissionPackPlan(await fixture()), loadFile = vi.fn(async () => originalBytes)
  const pack = await createBondSubmissionPack({ plan, output: 'supporting', loadFile, renderChecklist })
  const archive = unzipSync(pack.bytes)
  expect(Object.keys(archive).filter(key => key.startsWith('supporting-documents/'))).toHaveLength(2)
  expect(Object.keys(archive).some(key => key.includes('signed') || key.includes('bank.pdf'))).toBe(false)
  const index = JSON.parse(strFromU8(archive['document-index.json']))
  expect(index).toMatchObject({ submissionId: 'sub', ready: false, statementHandoff: 'not_connected' })
  expect(index.files[0].sha256).toBe(await sha(originalBytes))
  expect(strFromU8(archive['READ-ME.txt'])).toContain('INCOMPLETE')
  expect(loadFile.mock.calls.map(([doc]) => doc.id)).toEqual(['id', 'bond'])
})
it('does not fetch any files for a checklist; verifies signed snapshot before all outputs', async () => {
  const context = await fixture(), loadFile = vi.fn()
  await createBondSubmissionPack({ plan: buildBondSubmissionPackPlan(context), output: 'checklist', loadFile, renderChecklist })
  expect(loadFile).not.toHaveBeenCalled()
  context.submission.snapshot_json.changed = true
  await expect(createBondSubmissionPack({ plan: buildBondSubmissionPackPlan(context), output: 'checklist', loadFile, renderChecklist })).rejects.toThrow('version')
})
it('fails closed for inaccessible originals, transaction mismatch, or legacy canvas without original PDF', async () => {
  const context = await fixture()
  expect(() => buildBondSubmissionPackPlan({ ...context, transactionId: 'other' })).toThrow('version')
  expect(() => buildBondSubmissionPackPlan({ ...context, documents: context.documents.filter(doc => doc.id !== 'signed') })).toThrow('not accessible')
  context.submission.signed_document_id = null
  context.submission.metadata.signingMethod = 'html_canvas'
  expect(() => buildBondSubmissionPackPlan(context)).toThrow('not accessible')
})
it('rechecks access and refuses a partial download if approval changes mid-export', async () => {
  const context = await fixture(), changed = structuredClone(context)
  changed.documents.find(doc => doc.id === 'id').status = 'rejected'
  const save = vi.fn()
  const service = createBondSubmissionPackService({ fetchContext: vi.fn().mockResolvedValueOnce(context).mockResolvedValueOnce(changed), loadFile: async () => originalBytes, renderChecklist, save })
  await expect(service.download('tx', 'supporting')).rejects.toThrow('changed during preparation')
  expect(save).not.toHaveBeenCalled()
})
it('never saves when access is revoked or an approved attachment cannot be downloaded', async () => {
  const context = await fixture(), save = vi.fn()
  const service = createBondSubmissionPackService({ fetchContext: vi.fn().mockResolvedValueOnce(context).mockRejectedValueOnce(new Error('not accessible')), loadFile: async () => originalBytes, renderChecklist, save })
  await expect(service.download('tx', 'application')).rejects.toThrow('not accessible')
  expect(save).not.toHaveBeenCalled()
  await expect(createBondSubmissionPack({ plan: buildBondSubmissionPackPlan(context), output: 'supporting', loadFile: async () => { throw new Error('Access revoked') }, renderChecklist })).rejects.toThrow('Access revoked')
})

it('refuses consultant review for an incomplete pack or a version changed since the screen was loaded', async () => {
  const context = await fixture(), recordReview = vi.fn()
  context.reviewContext = { contextHash: 'current' }
  const service = createBondSubmissionPackService({ fetchContext: async () => context, recordReview })
  await expect(service.review('tx', { submissionId: 'sub', contextHash: 'stale', checks: {} })).rejects.toThrow('changed')
  await expect(service.review('tx', { submissionId: 'sub', contextHash: 'current', checks: {} })).rejects.toThrow('Resolve')
  expect(recordReview).not.toHaveBeenCalled()
})
