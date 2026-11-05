// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MobileTaskCreateSheet from '../MobileTaskCreateSheet.jsx'

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function fill() {
  fireEvent.change(screen.getByRole('textbox', { name: 'Task title' }), { target: { value: 'Prepare floor plans' } })
  fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-10-22' } })
  fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'High' } })
}

it('saves a standalone task once and keeps Back disabled until the save completes', async () => {
  let finish
  const onCreateTask = vi.fn(() => new Promise(resolve => { finish = resolve }))
  const onClose = vi.fn(), onSaved = vi.fn()
  const { container } = render(<MobileTaskCreateSheet onCreateTask={onCreateTask} onClose={onClose} onSaved={onSaved} />)
  fill()
  fireEvent.submit(container.querySelector('form'))
  fireEvent.submit(container.querySelector('form'))
  expect(onCreateTask).toHaveBeenCalledOnce()
  expect(onCreateTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Prepare floor plans', dueDate: '2026-10-22', priority: 'High', taskId: expect.stringMatching(/^[\da-f-]{36}$/) }))
  expect(screen.getByRole('button', { name: 'Back' }).disabled).toBe(true)
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }))
  expect(onClose).not.toHaveBeenCalled()
  await act(async () => finish({}))
  expect(onSaved).toHaveBeenCalledOnce()
})

it('retains entries and the same save reference after a failure', async () => {
  const onCreateTask = vi.fn().mockRejectedValueOnce(new Error('Please retry')).mockResolvedValueOnce({})
  const { container } = render(<MobileTaskCreateSheet onCreateTask={onCreateTask} onClose={vi.fn()} onSaved={vi.fn()} />)
  fill()
  fireEvent.submit(container.querySelector('form'))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Please retry')
  expect(screen.getByRole('textbox', { name: 'Task title' }).value).toBe('Prepare floor plans')
  fireEvent.submit(container.querySelector('form'))
  await waitFor(() => expect(onCreateTask).toHaveBeenCalledTimes(2))
  expect(onCreateTask.mock.calls[0][0].taskId).toBe(onCreateTask.mock.calls[1][0].taskId)
})

it('dismisses through Back or native cancel and fits the keyboard’s visible viewport', () => {
  const viewport = new EventTarget()
  Object.assign(viewport, { height: 740, offsetTop: 0 })
  vi.stubGlobal('visualViewport', viewport)
  const onClose = vi.fn()
  render(<MobileTaskCreateSheet onCreateTask={vi.fn()} onClose={onClose} />)
  const dialog = screen.getByRole('dialog')
  expect(dialog.style.getPropertyValue('--task-height')).toBe('740px')
  viewport.height = 390
  act(() => viewport.dispatchEvent(new Event('resize')))
  expect(dialog.style.getPropertyValue('--task-height')).toBe('390px')
  screen.getByRole('button', { name: 'Save task' }).focus()
  fireEvent.keyDown(screen.getByRole('button', { name: 'Save task' }), { key: 'Tab' })
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Back' }))
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }))
  expect(onClose).toHaveBeenCalledTimes(2)
})
