// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { PROPERTY_DISCLOSURE_QUESTIONS } from '../../lib/propertyDisclosure.js'

const api = vi.hoisted(() => ({ view: vi.fn(), correct: vi.fn(), sign: vi.fn() }))
vi.mock('react-router-dom', () => ({ useParams: () => ({ token: 'private-seller-token' }) }))
vi.mock('../../services/sellerPortalDocumentSigningService', () => ({
  viewSellerDocumentForSignature: api.view,
  correctSellerDocumentInPortal: api.correct,
  signSellerDocumentInPortal: api.sign,
}))
vi.mock('../../lib/sellerMandateReviewPreview.js', () => ({ prepareSellerMandateReviewPreview: vi.fn() }))
import SellerDocumentSigning from '../SellerDocumentSigning.jsx'

const html = '<html><body><div class="document">Disclosure for review</div></body></html>'
const editData = () => ({ common: { sellerName: 'Taylor Seller', propertyAddress: '1 Main Road' },
  questions: PROPERTY_DISCLOSURE_QUESTIONS.map(question => ({ ...question, label: question.text })),
  disclosure: { responses: {}, comments: '', remoteControlsQuantity: '' } })

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('PointerEvent', MouseEvent)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ setTransform() {}, fillRect() {}, beginPath() {}, moveTo() {}, quadraticCurveTo() {}, stroke() {} })
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,' + 'a'.repeat(150))
  api.view.mockResolvedValue({ documentKey: 'signed_disclosure_form', signerName: 'Taylor Seller', signerRole: 'Seller', versionDigest: 'source-version', reviewedHtml: html, canEdit: true, disclosureAnswersComplete: false, editData: editData() })
  api.correct.mockImplementation(async (_token, _digest, data) => ({ reviewedHtml: html + '<!-- saved answers -->', versionDigest: 'answered-version', signerName: 'Taylor Seller', editData: data, disclosureAnswersComplete: true }))
  api.sign.mockResolvedValue({ success: true })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

async function enterSignature() {
  // jsdom does not render srcDoc; supply the reviewed document before its load event.
  const preview = screen.getByTitle('Mandatory Disclosure / Defects Form')
  preview.contentDocument.open()
  preview.contentDocument.write(html)
  preview.contentDocument.close()
  await act(async () => { fireEvent.load(preview) })
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.change(screen.getByLabelText('Place of signature'), { target: { value: 'Cape Town' } })
  const canvas = screen.getByLabelText('Signature box for Taylor Seller')
  fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 })
  fireEvent.pointerMove(canvas, { clientX: 50, clientY: 50 })
  fireEvent.pointerUp(canvas, { clientX: 50, clientY: 50 })
}

test('seller completes answers on the private link, saves the copy and signs its new version', async () => {
  render(<SellerDocumentSigning />)
  await screen.findByText('Complete your property disclosure')
  expect(screen.queryByLabelText('Seller name')).toBeNull()
  await enterSignature()
  expect(screen.getByRole('button', { name: 'Sign this document' }).disabled).toBe(true)
  for (const answer of screen.getAllByRole('combobox', { name: /^Question \d+: Answer$/ })) fireEvent.change(answer, { target: { value: 'no' } })
  fireEvent.change(screen.getByLabelText('Other disclosures or comments'), { target: { value: 'Seller explanation to retain.' } })
  expect(screen.getByRole('button', { name: 'Sign this document' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Save answers and review' }))
  await waitFor(() => expect(api.correct).toHaveBeenCalledOnce())
  await screen.findByText('Save answers and review')
  await enterSignature()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Sign this document' }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Sign this document' }))
  await screen.findByRole('heading', { name: 'Signature received' })
  expect(api.correct.mock.calls[0][2].disclosure.comments).toBe('Seller explanation to retain.')
  expect(Object.values(api.correct.mock.calls[0][2].disclosure.responses)).toHaveLength(20)
  expect(api.sign).toHaveBeenCalledWith('private-seller-token', expect.objectContaining({ versionDigest: 'answered-version', signedName: 'Taylor Seller' }))
})

test('another required seller can sign completed answers after editing has locked', async () => {
  api.view.mockResolvedValue({ documentKey: 'signed_disclosure_form', signerName: 'Taylor Seller', signerRole: 'Owner 2', versionDigest: 'answered-version', reviewedHtml: html, canEdit: false, editData: null, disclosureAnswersComplete: true })
  render(<SellerDocumentSigning />)
  await screen.findByText('Shared document details are locked because a signer has signed.')
  await enterSignature()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Sign this document' }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Sign this document' }))
  await screen.findByRole('heading', { name: 'Signature received' })
  expect(api.correct).not.toHaveBeenCalled()
})

test('failed answer saving retains the entries and blocks signing', async () => {
  api.correct.mockRejectedValue(new Error('Answers could not be saved.'))
  render(<SellerDocumentSigning />)
  await screen.findByText('Complete your property disclosure')
  for (const answer of screen.getAllByRole('combobox', { name: /^Question \d+: Answer$/ })) fireEvent.change(answer, { target: { value: 'unsure' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save answers and review' }))
  await screen.findByRole('alert')
  expect(screen.getAllByRole('combobox', { name: /^Question \d+: Answer$/ }).every(answer => answer.value === 'unsure')).toBe(true)
  await enterSignature()
  expect(screen.getByRole('button', { name: 'Sign this document' }).disabled).toBe(true)
  expect(api.sign).not.toHaveBeenCalled()
})
