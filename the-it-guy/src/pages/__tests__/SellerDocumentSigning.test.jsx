// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

const html = '<html><body><header class="doc-header"><span class="agency-brand"><img src="https://example.test/agency-logo.png" alt="Test Agency logo" /></span></header><div class="document"><p class="declaration-opening">I declare my answers are true and complete.</p>Disclosure for review</div></body></html>'
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

test.each(['individual', 'company', 'trust', 'deceased_estate'])('FICA editor separates %s questions and explains the identity dropdown', async ficaProfileType => {
  api.view.mockResolvedValue({ documentKey: 'signed_fica_declaration', signerName: 'Taylor Seller', signerRole: 'Seller',
    versionDigest: 'source-version', reviewedHtml: html, canEdit: true,
    editData: { common: { sellerName: 'Taylor Seller', propertyAddress: '1 Main Road' }, ficaProfileType,
      fica: { idType: 'passport', occupation: '', employer: '', jobTitle: '', industryOfBusiness: '', countriesOfTrade: '', dualUseGoods: '', armsWeapons: '', heirInEstate: '', sourceOfIncome: '', politicallyInfluentialPerson: '' } } })
  render(<SellerDocumentSigning />)
  const dropdown = await screen.findByRole('combobox', { name: 'Identity document type' })
  expect(dropdown.value).toBe('passport')
  expect(within(dropdown).getByRole('option', { name: 'South African identity document' })).toBeTruthy()
  expect(screen.queryByLabelText('Industry of business') !== null).toBe(ficaProfileType === 'company')
  expect(screen.queryByLabelText('Employer') !== null).toBe(ficaProfileType === 'individual')
  expect(screen.queryByLabelText('Heir in an estate') !== null).toBe(ficaProfileType === 'deceased_estate')
  fireEvent.change(dropdown, { target: { value: 'sa_id' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save and review changes' }))
  await waitFor(() => expect(api.correct).toHaveBeenCalled())
  expect(api.correct.mock.calls[0][2].fica.idType).toBe('sa_id')
})

async function enterSignature({ loadPreview = false } = {}) {
  if (loadPreview) {
    // jsdom does not render srcDoc; supply the reviewed document before load.
    const preview = screen.getByTitle('Seller Mandate')
    preview.contentDocument.open()
    preview.contentDocument.write(html)
    preview.contentDocument.close()
    await act(async () => { fireEvent.load(preview) })
  }
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.change(screen.getByLabelText('Place of signature'), { target: { value: 'Cape Town' } })
  const canvas = screen.getByLabelText('Signature box for Taylor Seller')
  fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 })
  fireEvent.pointerMove(canvas, { clientX: 50, clientY: 50 })
  fireEvent.pointerUp(canvas, { clientX: 50, clientY: 50 })
}

function answerAll(answer = 'No') {
  for (const group of screen.getAllByRole('group', { name: /^Question \d+: Answer$/ })) {
    fireEvent.click(within(group).getByRole('button', { name: answer, exact: true }))
  }
}

test('seller chooses buttons and signs without a separate save or loading a preview', async () => {
  render(<SellerDocumentSigning />)
  await screen.findByText('Complete your property disclosure')
  expect(screen.getByRole('img', { name: 'Test Agency logo' }).getAttribute('src')).toBe('https://example.test/agency-logo.png')
  expect(screen.queryByLabelText('Seller name')).toBeNull()
  expect(screen.queryByRole('combobox')).toBeNull()
  expect(screen.queryByText('Current document for review')).toBeNull()
  expect(screen.queryByTitle('Mandatory Disclosure / Defects Form')).toBeNull()
  expect(screen.getByText('I declare my answers are true and complete.')).toBeTruthy()
  answerAll()
  fireEvent.change(screen.getByLabelText('Other disclosures or comments'), { target: { value: 'Seller explanation to retain.' } })
  await enterSignature()
  expect(screen.getByRole('button', { name: 'Sign this document' }).disabled).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Sign this document' }))
  await screen.findByRole('heading', { name: 'Signature received' })
  expect(api.correct.mock.calls[0][2].disclosure.comments).toBe('Seller explanation to retain.')
  expect(Object.values(api.correct.mock.calls[0][2].disclosure.responses)).toHaveLength(20)
  expect(api.correct.mock.invocationCallOrder[0]).toBeLessThan(api.sign.mock.invocationCallOrder[0])
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

test('failed answer saving retains the entries and prevents signature submission', async () => {
  api.correct.mockRejectedValue(new Error('Answers could not be saved.'))
  render(<SellerDocumentSigning />)
  await screen.findByText('Complete your property disclosure')
  answerAll('Unsure')
  await enterSignature()
  fireEvent.click(screen.getByRole('button', { name: 'Sign this document' }))
  await screen.findByRole('alert')
  expect(screen.getAllByRole('button', { name: 'Unsure', exact: true }).every(button => button.getAttribute('aria-pressed') === 'true')).toBe(true)
  expect(api.sign).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Sign this document' }).disabled, screen.getByRole('status').textContent).toBe(false))
})

test('missing questions, consent, signature, name, date and place are explained', async () => {
  render(<SellerDocumentSigning />)
  await screen.findByText('Complete your property disclosure')
  expect(screen.getByText(/20 remaining/)).toBeTruthy()
  answerAll('Yes')
  expect(screen.getAllByRole('button', { name: 'Yes', exact: true }).every(button => button.getAttribute('aria-pressed') === 'true')).toBe(true)
  await enterSignature()
  fireEvent.change(screen.getByLabelText('Confirm your full name'), { target: { value: 'Another person' } })
  expect(screen.getByText('Enter your full name as shown: Taylor Seller.')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Sign this document' }).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Confirm your full name'), { target: { value: 'Taylor Seller' } })
  fireEvent.change(screen.getByLabelText('Date of signature'), { target: { value: '' } })
  expect(screen.getByText('Choose the date of signature.')).toBeTruthy()
  expect(api.sign).not.toHaveBeenCalled()
})

test('changing a saved answer requires a fresh declaration and drawn signature', async () => {
  const data = editData()
  data.disclosure.responses = Object.fromEntries(PROPERTY_DISCLOSURE_QUESTIONS.map(question => [question.key, { answer: 'no', note: '' }]))
  api.view.mockResolvedValue({ documentKey: 'signed_disclosure_form', signerName: 'Taylor Seller', signerRole: 'Seller', versionDigest: 'answered-version', reviewedHtml: html, canEdit: true, disclosureAnswersComplete: true, editData: data })
  render(<SellerDocumentSigning />)
  await screen.findByText('Complete your property disclosure')
  await enterSignature()
  expect(screen.getByRole('button', { name: 'Sign this document' }).disabled).toBe(false)
  fireEvent.click(within(screen.getByRole('group', { name: 'Question 1: Answer', exact: true })).getByRole('button', { name: 'Yes', exact: true }))
  expect(screen.getByRole('checkbox').checked).toBe(false)
  expect(screen.getByText('Draw your signature in the signature box.')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Sign this document' }).disabled).toBe(true)
})

test('a saved disclosure can retry a failed signature using the confirmed new version', async () => {
  api.sign.mockRejectedValueOnce(new Error('Signature could not be saved.'))
  render(<SellerDocumentSigning />)
  await screen.findByText('Complete your property disclosure')
  answerAll()
  await enterSignature()
  fireEvent.click(screen.getByRole('button', { name: 'Sign this document' }))
  await screen.findByRole('alert')
  expect(screen.getByRole('button', { name: 'Sign this document' }).disabled).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Sign this document' }))
  await screen.findByRole('heading', { name: 'Signature received' })
  expect(api.correct).toHaveBeenCalledOnce()
  expect(api.sign.mock.calls.every(([, payload]) => payload.versionDigest === 'answered-version')).toBe(true)
})

test('an unconfirmed answer save cannot submit a signature', async () => {
  api.correct.mockResolvedValue({ versionDigest: 'unexpected-version', reviewedHtml: html, disclosureAnswersComplete: false })
  render(<SellerDocumentSigning />)
  await screen.findByText('Complete your property disclosure')
  answerAll()
  await enterSignature()
  fireEvent.click(screen.getByRole('button', { name: 'Sign this document' }))
  await screen.findByRole('alert')
  expect(api.sign).not.toHaveBeenCalled()
})

test('the full signing copy is available only when the seller asks to view it', async () => {
  render(<SellerDocumentSigning />)
  await screen.findByText('Complete your property disclosure')
  fireEvent.click(screen.getByRole('button', { name: 'View signing copy' }))
  expect(screen.getByTitle('Mandatory Disclosure / Defects Form')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Hide signing copy' }))
  expect(screen.queryByTitle('Mandatory Disclosure / Defects Form')).toBeNull()
})

test('mandates retain their complete-document preview and save requirements', async () => {
  api.view.mockResolvedValue({ documentKey: 'signed_mandate', signerName: 'Taylor Seller', signerRole: 'Seller', versionDigest: 'mandate-version', reviewedHtml: html, canEdit: false, editData: null, requiresReplacementForChanges: true })
  render(<SellerDocumentSigning />)
  await screen.findByText(/These details are frozen into the mandate/)
  await enterSignature()
  expect(screen.getByRole('button', { name: 'Sign this document' }).disabled).toBe(true)
  // Loading the complete mandate is still required for this document type.
  const preview = screen.getByTitle('Seller Mandate')
  preview.contentDocument.open()
  preview.contentDocument.write(html)
  preview.contentDocument.close()
  await act(async () => { fireEvent.load(preview) })
  if (!screen.getByRole('checkbox').checked) fireEvent.click(screen.getByRole('checkbox'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Sign this document' }).disabled, screen.getByRole('status').textContent).toBe(false))
})
