// @vitest-environment jsdom
import React, { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WizardFooter } from '../../AgentListings.jsx'
afterEach(cleanup)
it('offers Save only without submitting and Save & update adverts as the primary submit action', () => {
  const savedOnly = vi.fn(), updated = vi.fn()
  render(<form onSubmit={event => { event.preventDefault(); updated() }}><WizardFooter isFinalStep onCancel={() => {}} onSaveDraft={savedOnly} saveDraftLabel="Save only" finalLabel="Save & update adverts" /></form>)
  fireEvent.click(screen.getByRole('button', { name: 'Save only' }))
  expect(savedOnly).toHaveBeenCalledTimes(1)
  expect(updated).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save & update adverts' }))
  expect(updated).toHaveBeenCalledTimes(1)
})
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
