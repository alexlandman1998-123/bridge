import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { unzipSync, strFromU8 } from 'fflate'
import { buildBondApplicationDownloadPlan, createBondApplicationDownload, resolveBondSignedDocumentId } from '../exports/bondApplicationDownloadPack.js'
import { renderBondApplicationPackPdf, flattenBondAnswers } from '../exports/bondApplicationPackPdf.js'
import { hashBondApplicationSnapshot } from '../submission/bondApplicationSnapshotHash.js'
import { buildBondApplicationSubmissionSnapshot } from '../submission/buildBondApplicationSubmissionSnapshot.js'
import { readBoundedDownload } from '../../../../services/bondApplicationDownloadService.js'

const fontBytes = new Uint8Array(await readFile(new URL('../../../../assets/fonts/DejaVuSans.ttf', import.meta.url)))
const person = {
  personal: { first_name: 'Zoë', surname: 'Mokoena', identity_number: 'TEST-IDENTITY', marital_status: 'single', dependants: 0 },
  contact: { email: 'zoe@example.test', phone: '0000000000' },
  address: { street: '1 Sample Street', city: 'Cape Town', country: 'South Africa' },
  employment: { employer: 'Example employer', occupation: 'Analyst', months: 0 },
  incomeSources: [{ type: 'salary', monthlyAmount: 50000 }, { type: 'rental', monthlyAmount: 3000 }],
  expenses: { groceries: 4000, rent: 0, maintenance: false },
  monthlyCommitments: [{ creditor: 'Example bank', amount: 1200 }],
  bankAccounts: [{ bankName: 'Example bank', accountNumber: 'TEST-ACCOUNT', accountType: 'Cheque' }],
  assets: [{ name: 'Vehicle', value: 100000 }], liabilities: [{ lender: 'Example lender', balance: 25000 }],
  existingProperties: [{ address: 'A sample property', value: 500000, bondBalance: 0 }],
  credit: { arrears: false, explanation: 'A long explanation for pagination. '.repeat(100) },
}
const snapshot = {
  transaction: { id: 'test-transaction' }, submissionVersion: 2, applicationIntent: 'bond_application',
  property: { address: '12 Sample Avenue', purchasePrice: 1500000 },
  finance: { purchasePrice: 1500000, depositAmount: 0, requestedBondAmount: 1500000, preferredTerm: 240 },
  purchaserEntity: { entityType: 'trust', name: 'Example Family Trust', registrationNumber: 'TEST-TRUST', trustees: [{ name: 'Zoë Mokoena', identity: 'TEST-IDENTITY' }] },
  selectedBanks: ['Example Bank'],
  participants: [{ participantRole: 'primary_applicant', answers: person }, { participantRole: 'co_applicant', answers: { ...person, personal: { first_name: 'André', surname: 'Example' } } }],
  signerManifest: [{ participantRole: 'primary_applicant', fullName: 'Zoë Mokoena', email: 'zoe@example.test', identityReference: 'TEST-IDENTITY' }],
  signatureEvidence: { method: 'html_canvas', signerName: 'Zoë Mokoena', signedAt: '2026-09-13T10:00:00.000Z', confirmed: true, dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwI/4BvG8wAAAABJRU5ErkJggg==' },
  declarations: [{ key: 'accuracy', title: 'Accuracy of information', text: 'I confirm that these sample answers are accurate.', version: 'test-v1', accepted: true, acceptedAt: '2026-09-13T10:00:00Z', participantRole: 'primary_applicant' }, { key: 'marketing', title: 'Marketing preference', text: 'Optional sample marketing consent.', version: 'test-v1', accepted: false, participantRole: 'primary_applicant' }],
  documentManifest: [{ title: 'Bank statements', requirementKey: 'statements', documents: [{ id: 'statement1', filePath: 'test/one.pdf' }, { id: 'statement2', filePath: 'test/two.pdf' }] }],
}
const submission = { id: 'submission-2', transaction_id: 'test-transaction', status: 'submitted', signed_at: '2026-09-13T10:00:00Z', signed_document_id: 'signed', snapshot_json: snapshot, submission_version: 2, snapshot_hash: await hashBondApplicationSnapshot(snapshot) }
const documents = [
  { id: 'signed', transaction_id: 'test-transaction', name: 'Signed application.pdf', file_path: 'test/signed.pdf', status: 'accepted' },
  { id: 'statement1', name: '../../statement.pdf', file_path: 'test/one.pdf', status: 'accepted' },
  { id: 'statement2', name: '../../statement.pdf', file_path: 'test/two.pdf', status: 'accepted' },
  { id: 'later', name: 'Deposit proof.pdf', file_path: 'test/later.pdf', status: 'accepted' },
]
const context = { mode: 'final', transactionId: 'test-transaction', submission, readiness: { stage: 'bank_submission', ready: true, issues: [] }, documents, documentChecklist: { items: [{ requirement: { title: 'Deposit proof', active: true }, documents: [documents[3]] }] } }
const plan = buildBondApplicationDownloadPlan(context)
assert.equal(plan.files.length, 4)
assert.equal(new Set(plan.files.map((file) => file.archivePath)).size, 4)
assert.ok(plan.files.every((file) => !file.archivePath.includes('../')))
assert.equal(plan.files.find((file) => file.id === 'later').source, 'collected_after_signing')
assert.throws(() => buildBondApplicationDownloadPlan({ ...context, readiness: { ready: false } }), /readiness/)
assert.throws(() => buildBondApplicationDownloadPlan({ ...context, submission: { ...submission, signed_document_id: null } }), /original signed/)
assert.throws(() => buildBondApplicationDownloadPlan({ ...context, documents: documents.slice(0, 2) }), /referenced file/)
assert.throws(() => buildBondApplicationDownloadPlan({ ...context, documents: documents.map((file) => file.id === 'statement1' ? { ...file, file_path: 'changed' } : file) }), /version changed/)
const original = new TextEncoder().encode('%PDF-1.4\nSYNTHETIC SIGNED EVIDENCE FOR ARCHIVE TEST ONLY\n%%EOF')
const renderPdf = (input) => renderBondApplicationPackPdf({ ...input, fontBytes })
const result = await createBondApplicationDownload({ plan, brand: { name: 'Example Home Loans', logoData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAAA8CAIAAABuCSZCAAADMElEQVR4nO3ba0hTYRjA8edss3RKH6JU1DTzEqKVmq0majMVZRkVgV0sKc36IFamYRlisWaFGWJ2wULLbmYfpAuESNlEnLe2eU2dFZMkwvKepW2niCMiCuaHzeDp+X06Ozt73/fw57yDwRhr361A8OL96wUQ06LAyFFg5CgwchQYOQqMHAVGjgIjR4GRo8DIUWDkKDByFBg5CowcBUaOAiNHgZGjwMhRYOQoMHIUGDmBEcfSVZeoWrTccVllXce77pgd4QdSLgDAShfH3IxE6f5UA8tGbwu7ePKwj/Rgb98AAHQrS8oq6+NTs7gPXjuXFBkidhRHTRnwl0DAT88u0LRqtYoHbhv3zDLpjXtPjHhHCBgz8PhP/fZDp6eeidu1WezrqVS1ypJj07JuGVgWAMKD1t0sfh4asPbh05cAMDaud3Wy5/N4BpZlGGa5g+3YuH7agB6uTjkZieH7UuYyKZm/LfrM5cL0IzGRIeKPn3rfNHcAgIX5QqGF+f3S8rBAv8nLmtrfe3u6AYCXu3ObVjdznLddOid7G5MuFSvTBu7S9ahaOmXJcbLcIu5MsNjnVbWqS9ezzM7azGxi/6hQqoPFPty7FUr1zHECRatbOj6YdKlYGXOLXmAmKM2Xc8fyvKKGpj+PrJWlUK83WArN+weHASBCIvJyX7El1N926WJ/Xy9FrQYAXivVsVHSS/nFAaJVhY9fTBuQYWB4ZDRJljf3Sck8fQeL1ngsshKmyK9nnoiPOZ7J5/FcHO037T7GPaxhQX5c4IGhEZZl7WyWAMDwt9FZBpzLpGSetmgBny9Ljj2bc1tRq9EbDBGS9SJvj9bOiZ22Rt0m2eA9eXFFtTotYW9lbaPp1vN/MtUW3dDc/rV/SFHXqOv5DADp2QWPrmYoahqr6pu5C77/GPvSN+jm7MC9LK9qOJUQLdl59K9TPCs4zx3XadpluXemTSq/cteId4QAQ/8uxI1+yUKOAiNHgZGjwMhRYOQoMHIUGDkKjBwFRo4CI0eBkaPAyFFg5CgwchQYOQqMHAVGjgIjR4GRo8DIUWDkKDByFBg5CowcBUaOAiNHgZGjwMhRYMDtNzK0EojW9WuVAAAAAElFTkSuQmCC' }, renderPdf, loadFile: async () => original, generatedAt: '2026-09-13T11:00:00Z' })
const archive = unzipSync(result.zip)
assert.deepEqual(archive['signed-evidence/original-signed-application.pdf'], original)
assert.deepEqual(JSON.parse(strFromU8(archive['application-data.json'])), snapshot)
assert.equal(JSON.parse(strFromU8(archive['document-index.json'])).files.length, 4)
assert.ok(strFromU8(archive['READ-ME.txt']).includes('collected_after_signing'))
assert.equal(new TextDecoder().decode(result.pdf.slice(0, 5)), '%PDF-')
assert.ok(flattenBondAnswers({ count: 0, consent: false }).some(([key, value]) => key === 'Count' && value === '0'))
assert.ok(flattenBondAnswers({ count: 0, consent: false }).some(([key, value]) => key === 'Consent' && value === 'No'))
await assert.rejects(createBondApplicationDownload({ plan, renderPdf, loadFile: async () => { throw new Error('Denied') } }), /could not be downloaded/)
await assert.rejects(createBondApplicationDownload({ plan, renderPdf, loadFile: async () => new Uint8Array() }), /empty/)
await assert.rejects(createBondApplicationDownload({ plan: { ...plan, submission: { ...submission, snapshot_hash: 'wrong' } }, renderPdf, loadFile: async () => original }), /verified/)
const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(5)); controller.close() } })
await assert.rejects(readBoundedDownload('https://example.test', { maximumBytes: 3, fetchFile: async () => new Response(stream) }), /size limit/)
const multi = buildBondApplicationSubmissionSnapshot({ documentChecklist: { items: [{ requirement: { key: 'bank', title: 'Bank statements' }, documents: documents.slice(1, 3) }] } })
assert.equal(multi.documentManifest[0].documents.length, 2)
if (process.env.BOND_PDF_PREVIEW_PATH) await writeFile(process.env.BOND_PDF_PREVIEW_PATH, result.pdf)
console.log('Bond download pack: complete PDF, immutable snapshot, all attachments, safe filenames, original evidence, missing-file failures and bounded downloads passed')

const namedDocument = buildBondApplicationDownloadPlan({ ...context, documents: documents.map((file) => file.id === 'later' ? { ...file, name: 'Deposit proof' } : file) }).files.find((file) => file.id === 'later')
assert.ok(namedDocument.archivePath.endsWith('Deposit-proof.pdf'))
const unsupported = structuredClone(snapshot)
unsupported.participants[0].answers.personal.first_name = 'Unsupported \u{1f680}'
await assert.rejects(renderPdf({ snapshot: unsupported, manifest: result.manifest, brand: { name: 'Example' }, submission }), /font cannot render/)
const draftPdf = await renderPdf({ snapshot, manifest: { ...result.manifest, mode: 'draft' }, brand: { name: 'Example' } })
assert.equal(new TextDecoder().decode(draftPdf.slice(0, 5)), '%PDF-')

const olderSubmission = { generated_document_id: 'version-1', signing_request_id: 'packet-1' }
const exactVersion = { id: 'version-1', packet_id: 'packet-1', finalised_at: '2026-09-13T10:00:00Z', final_signed_document_id: 'signed-file' }
assert.equal(resolveBondSignedDocumentId(olderSubmission, exactVersion), 'signed-file')
assert.equal(resolveBondSignedDocumentId(olderSubmission, { ...exactVersion, id: 'newer-version' }), null)
assert.equal(resolveBondSignedDocumentId(olderSubmission, { ...exactVersion, packet_id: 'another-packet' }), null)
assert.equal(resolveBondSignedDocumentId(olderSubmission, { ...exactVersion, finalised_at: null }), null)
