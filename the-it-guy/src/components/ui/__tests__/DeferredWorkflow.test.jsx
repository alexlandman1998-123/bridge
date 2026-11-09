// @vitest-environment jsdom
import React, { lazy, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import DeferredWorkflow from '../DeferredWorkflow.jsx'
import Modal from '../Modal.jsx'

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  const load = vi.fn(() => promise)
  return { Component: lazy(load), load, resolve }
}

afterEach(cleanup)

it('requests a workflow only on opening and retains its form state across closes', async () => {
  const workflow = deferred()
  const Workflow = workflow.Component
  function Form({ open }) {
    const [value, setValue] = useState('')
    return open ? <input aria-label="Draft" value={value} onChange={event => setValue(event.target.value)} /> : null
  }
  const view = render(<DeferredWorkflow active={false} keepMounted fallback={<p role="status">Loading form…</p>}><Workflow open={false} /></DeferredWorkflow>)
  expect(workflow.load).not.toHaveBeenCalled()
  view.rerender(<DeferredWorkflow active keepMounted fallback={<p role="status">Loading form…</p>}><Workflow open /></DeferredWorkflow>)
  expect(workflow.load).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('status').textContent).toBe('Loading form…')
  await act(async () => workflow.resolve({ default: Form }))
  fireEvent.change(await screen.findByLabelText('Draft'), { target: { value: 'Unsaved work' } })
  view.rerender(<DeferredWorkflow active={false} keepMounted><Workflow open={false} /></DeferredWorkflow>)
  expect(screen.queryByLabelText('Draft')).toBeNull()
  view.rerender(<DeferredWorkflow active keepMounted><Workflow open /></DeferredWorkflow>)
  expect(screen.getByLabelText('Draft').value).toBe('Unsaved work')
  expect(workflow.load).toHaveBeenCalledTimes(1)
})

it('allows cancelling a pending modal and does not reopen after its download completes', async () => {
  const workflow = deferred()
  const Workflow = workflow.Component
  function Dialog({ open, onClose }) { return <Modal open={open} onClose={onClose} title="Ready form">Ready</Modal> }
  function Host() {
    const [open, setOpen] = useState(false)
    return <><button onClick={() => setOpen(true)}>Open</button><DeferredWorkflow active={open} keepMounted fallback={<Modal open onClose={() => setOpen(false)} title="Loading form"><p role="status">Loading…</p></Modal>}><Workflow open={open} onClose={() => setOpen(false)} /></DeferredWorkflow></>
  }
  render(<Host />)
  const trigger = screen.getByRole('button', { name: 'Open' })
  trigger.focus()
  fireEvent.click(trigger)
  expect(screen.getByRole('dialog', { name: 'Loading form' })).toBeTruthy()
  await waitFor(() => expect(document.activeElement).not.toBe(trigger))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
  await act(async () => workflow.resolve({ default: Dialog }))
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(trigger)
  expect(await screen.findByRole('dialog', { name: 'Ready form' })).toBeTruthy()
  expect(workflow.load).toHaveBeenCalledTimes(1)
})

it('keeps the surrounding page visible while a requested panel loads', async () => {
  const workflow = deferred()
  const Workflow = workflow.Component
  const view = render(<><h1>Development</h1><DeferredWorkflow active={false} fallback={<p role="status">Loading panel…</p>}><Workflow /></DeferredWorkflow></>)
  expect(workflow.load).not.toHaveBeenCalled()
  view.rerender(<><h1>Development</h1><DeferredWorkflow fallback={<p role="status">Loading panel…</p>}><Workflow /></DeferredWorkflow></>)
  expect(screen.getByRole('heading', { name: 'Development' })).toBeTruthy()
  expect(screen.getByRole('status')).toBeTruthy()
  view.rerender(<><h1>Development</h1><DeferredWorkflow active={false}><Workflow /></DeferredWorkflow></>)
  await act(async () => workflow.resolve({ default: () => <p>Optional panel</p> }))
  expect(screen.queryByText('Optional panel')).toBeNull()
  view.rerender(<><h1>Development</h1><DeferredWorkflow><Workflow /></DeferredWorkflow></>)
  expect(await screen.findByText('Optional panel')).toBeTruthy()
})
