// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import SellerDisclosurePreparation from '../SellerDisclosurePreparation.jsx'
import { normalizePropertyDisclosure } from '../../../lib/propertyDisclosure.js'

afterEach(cleanup)

test('disclosure comments survive editing another answer and flow into the saved form', () => {
  let captured
  function Capture() {
    const [disclosure, setDisclosure] = useState({})
    return <SellerDisclosurePreparation disclosure={disclosure} onChange={(next) => {
      captured = next
      setDisclosure(next)
    }} />
  }
  render(<Capture />)
  const comments = screen.getByRole('textbox', { name: '21. Comments or explanation for any of the above' })
  fireEvent.change(comments, { target: { value: 'Known roof leak - seller explanation' } })
  fireEvent.click(screen.getByRole('radio', { name: 'Question 1: Unsure' }))
  expect(comments.value).toBe('Known roof leak - seller explanation')
  expect(normalizePropertyDisclosure(captured).comments).toBe('Known roof leak - seller explanation')
  expect(normalizePropertyDisclosure(captured).otherDisclosure).toBe('Known roof leak - seller explanation')
})
