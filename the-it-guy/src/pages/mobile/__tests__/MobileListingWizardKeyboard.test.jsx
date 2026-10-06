// @vitest-environment jsdom
import React, { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WizardFooter } from '../../AgentListings.jsx'
afterEach(cleanup)
it('Continue cannot turn into a submit action during the same click event', () => {
  const submitted = vi.fn()
  function Harness() {
    const [review, setReview] = useState(false)
    return <form onSubmit={(event) => { event.preventDefault(); submitted() }}><WizardFooter isFinalStep={review} showSaveDraft={false} onCancel={() => {}} onContinue={() => setReview(true)} /></form>
  }
  render(<Harness />)
  const continueButton = screen.getByRole('button', { name: 'Continue' })
  fireEvent.click(continueButton)
  const submitButton = screen.getByRole('button', { name: 'Create listing' })
  expect(continueButton.isConnected).toBe(false)
  expect(submitButton).not.toBe(continueButton)
  expect(submitted).not.toHaveBeenCalled()
  fireEvent.click(submitButton)
  expect(submitted).toHaveBeenCalledTimes(1)
})
