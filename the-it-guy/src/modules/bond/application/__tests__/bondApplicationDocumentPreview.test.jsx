// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import BondApplicationDocumentPreview from '../guided/BondApplicationDocumentPreview.jsx'
import { buildBondApplicationDocumentPresentation } from '../exports/bondApplicationDocumentPresentation.js'
afterEach(cleanup)
it('uses the shared PDF labels and values and identifies an unsigned draft', () => {
  const presentation = buildBondApplicationDocumentPresentation({ finance: { requestedBondAmount: 2000000 }, declarations: [{ key: 'authority', title: 'Bank authority', text: 'Exact permission text', required: true, accepted: false }] })
  render(<BondApplicationDocumentPreview presentation={presentation} />)
  expect(screen.getByText('Draft / unsigned')).toBeTruthy()
  for (const row of presentation.sections[0].rows) {
    expect(screen.getByText(row.label)).toBeTruthy()
    expect(screen.getAllByText(row.value.replace(/\s/g, ' ')).length).toBeGreaterThan(0)
  }
  expect(screen.getByText('Exact permission text')).toBeTruthy()
})
