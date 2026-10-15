// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import BuyerDocumentWorkspace from '../BuyerDocumentWorkspace.jsx'
import { buildBuyerDocumentPresentationModel } from '../../../../core/clientPortal/buyerDocumentPresentationModel.js'
import { buildCanonicalBuyerDocumentCenter } from '../../../../services/clientPortalWorkspaceService.js'

afterEach(cleanup)

test.each(['optional', 'recommended'])('%s canonical request stays visible and uploadable without an action banner', async level => {
  const center = buildCanonicalBuyerDocumentCenter({ requirements: [{
    id: 'supporting-letter', document_definition_key: 'buyer_supporting_letter', requirement_level: level,
    pack_key: 'buyer_finance', status: 'requested', uploadable_by_roles: ['buyer'],
    document_definitions: { display_label: 'Supporting letter' },
  }], documents: [] })
  const model = buildBuyerDocumentPresentationModel({ items: center.items, source: 'canonical_projection' })
  const onUpload = vi.fn(async () => ({ ok: true, document: { id: 'received-letter' } }))
  const view = render(<BuyerDocumentWorkspace model={model} onUpload={onUpload} />)
  expect(model.counts.action).toBe(0)
  expect(screen.getByText("You're all caught up")).toBeTruthy()
  expect(view.container.querySelector('[data-document-status="optional"]')).toBeTruthy()
  expect(screen.getAllByText('Optional upload')).toHaveLength(2)
  expect(screen.queryByText('Replace document')).toBeNull()
  const input = screen.getByLabelText('Upload document')
  expect(input.disabled).toBe(false)
  const file = new File(['synthetic letter'], 'letter.pdf', { type: 'application/pdf' })
  await act(async () => fireEvent.change(input, { target: { files: [file] } }))
  expect(onUpload).toHaveBeenCalledWith(expect.objectContaining({ requirementInstanceId: 'supporting-letter' }), file, expect.any(Object))
  expect(screen.getByText('Received and awaiting review by your transaction team.')).toBeTruthy()
})
