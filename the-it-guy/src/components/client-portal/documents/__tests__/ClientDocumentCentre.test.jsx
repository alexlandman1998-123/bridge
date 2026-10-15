// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ClientDocumentCentre, { buildDocumentCentreSections } from '../ClientDocumentCentre.jsx'
import { buildSellerDocumentExperienceModel } from '../../../../lib/sellerDocumentExperienceModel.js'
import { buildCanonicalSellerDocumentCenter } from '../../../../services/clientPortalWorkspaceService.js'

afterEach(cleanup)

const bankConfirmation = {
  key: 'seller_bank_account_confirmation',
  label: 'Seller Bank Account Confirmation',
  description: 'Bank-issued account confirmation for secure payment of sale proceeds.',
  status: 'required',
  is_required: false,
}

for (const format of ['legacy', 'typed']) {
  it(`keeps an optional bank confirmation uploadable without marking it required (${format})`, async () => {
    const documentCenter = format === 'legacy'
      ? { requiredDocuments: [bankConfirmation] }
      : { items: [{ ...bankConfirmation, id: 'required_bank', sourceId: bankConfirmation.key,
          sourceType: 'required_document', title: bankConfirmation.label,
          uploadKey: bankConfirmation.key, isCoreRequirement: true,
          uploadSpec: { type: 'requirement', requirementKey: bankConfirmation.key } }] }
    const sections = buildDocumentCentreSections(documentCenter, 'selling')
    expect(sections.allRequired[0].required).toBe(false)
    expect(buildSellerDocumentExperienceModel({ requirements: sections.allRequired }).summary.total).toBe(0)

    const onUpload = vi.fn(async (spec) => {
      expect(spec.requirementKey).toBe(bankConfirmation.key)
      return { ok: true, document: { id: 'saved-bank-confirmation' } }
    })
    const view = render(<ClientDocumentCentre documentCenter={documentCenter} workspace="selling" onUpload={onUpload} />)
    const row = screen.getByRole('heading', { name: bankConfirmation.label }).closest('article')
    expect(within(row).getByText('Optional upload')).toBeTruthy()
    expect(within(row).queryByText('Required')).toBeNull()
    expect(within(row).queryByText('Upload required')).toBeNull()
    expect(within(row).getByText('You can upload this document if available.')).toBeTruthy()
    expect(row.querySelector('input[type="file"]').disabled).toBe(false)

    await act(async () => fireEvent.change(view.container.querySelector('input[type="file"]'), {
      target: { files: [new File(['diagnostic'], 'bank.pdf', { type: 'application/pdf' })] },
    }))
    expect(onUpload).toHaveBeenCalledTimes(1)
    expect(within(row).getByText('Received and awaiting review by your transaction team.')).toBeTruthy()
  })
}

it('keeps required documents marked required and included in progress', () => {
  const documentCenter = { requiredDocuments: [{ ...bankConfirmation, is_required: true }] }
  const sections = buildDocumentCentreSections(documentCenter, 'selling')
  expect(buildSellerDocumentExperienceModel({ requirements: sections.allRequired }).summary.total).toBe(1)
  render(<ClientDocumentCentre documentCenter={documentCenter} workspace="selling" onUpload={vi.fn()} />)
  const row = screen.getByRole('heading', { name: bankConfirmation.label }).closest('article')
  expect(within(row).getByText('Upload required')).toBeTruthy()
  expect(within(row).getByText('Required')).toBeTruthy()
})

it('legacy fallback cannot display an approved file belonging to another request', () => {
  const requirement = { ...bankConfirmation, id: 'request-A', is_required: true }
  const wrong = { id: 'wrong-file', requirement_id: 'request-B', document_type: bankConfirmation.key,
    status: 'approved', file_path: 'synthetic/wrong.pdf', visibility: 'seller_visible' }
  for (const embedded of [false, true]) {
    const sections = buildDocumentCentreSections({ requiredDocuments: [{ ...requirement, ...(embedded ? { uploadedDocument: wrong } : {}) }],
      uploadedDocuments: [wrong] }, 'selling')
    expect(sections.allRequired[0]).toMatchObject({ status: 'required', linkedDocument: null, hasUploadedDocument: false })
  }
})

for (const level of ['optional', 'recommended']) {
  it(`keeps a canonical ${level} seller request uploadable and outside required progress`, () => {
    const documentCenter = buildCanonicalSellerDocumentCenter({ requirements: [{
      id: 'seller-extra', document_definition_key: 'seller_extra', requirement_level: level,
      pack_key: 'seller_identity_fica', status: 'requested', uploadable_by_roles: ['seller'],
      document_definitions: { display_label: 'Extra seller letter' },
    }], documents: [] }, {})
    const sections = buildDocumentCentreSections(documentCenter, 'selling')
    expect(sections.allRequired[0]).toMatchObject({ required: false, uploadSpec: { requirementInstanceId: 'seller-extra' } })
    expect(buildSellerDocumentExperienceModel({ requirements: sections.allRequired }).summary.total).toBe(0)
    render(<ClientDocumentCentre documentCenter={documentCenter} workspace="selling" onUpload={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^FICA Documents/ }))
    const row = screen.getByRole('heading', { name: 'Extra seller letter' }).closest('article')
    expect(within(row).getByText('Optional upload')).toBeTruthy()
    expect(row.querySelector('input[type="file"]').disabled).toBe(false)
  })
}

it('recognizes an exact canonical signed FICA declaration as an agent-managed pack', () => {
  const documentCenter = buildCanonicalSellerDocumentCenter({ requirements: [{
    id: 'signed-fica', document_definition_key: 'signed_fica_declaration', requirement_level: 'required',
    pack_key: 'seller_identity_fica', status: 'requested', uploadable_by_roles: ['seller'],
    document_definitions: { display_label: 'Signed FICA Declaration' },
  }], documents: [] }, {})
  render(<ClientDocumentCentre documentCenter={documentCenter} workspace="selling" onUpload={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /^Signed Seller Pack/ }))
  const row = screen.getByRole('heading', { name: 'Signed FICA Declaration' }).closest('article')
  expect(row.querySelector('input[type="file"]')).toBeNull()
  expect(within(row).getByText('Your agent manages this signed Seller Pack document outside the seller portal.')).toBeTruthy()
})
