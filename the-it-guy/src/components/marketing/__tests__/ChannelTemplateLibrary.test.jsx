// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ChannelTemplateLibrary, { ChannelTemplateEditor } from '../ChannelTemplateLibrary'
afterEach(cleanup)
const templates = [
  { id: 'email', name: 'Valuation email', channel: 'email', visibility: 'agency', created_by: 'manager', title: 'Your property value', body: 'Hello [first name]' },
  { id: 'whatsapp', name: 'Viewing follow-up', channel: 'whatsapp', visibility: 'personal', created_by: 'me', body: 'How did you find the viewing?' },
  { id: 'hidden', name: 'Private colleague template', channel: 'meta', visibility: 'personal', created_by: 'other', body: 'Private' },
]
function mount(props = {}) {
  const callbacks = { onRetry: vi.fn(), onCreate: vi.fn(), onEdit: vi.fn(), onDuplicate: vi.fn(), onUse: vi.fn() }
  render(<ChannelTemplateLibrary templates={templates} userId="me" {...callbacks} {...props} />)
  return callbacks
}
it('combines channel, visibility and text filters without exposing private colleague content', () => {
  mount()
  expect(screen.queryByText('Private colleague template')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'WhatsApp', exact: true }))
  expect(screen.getByRole('heading', { name: 'Viewing follow-up' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Valuation email' })).toBeNull()
  fireEvent.change(screen.getByLabelText('Channel template collection'), { target: { value: 'agency' } })
  expect(screen.getByRole('heading', { name: 'No matching templates' })).toBeTruthy()
})
it('previews copy, allows use and duplication, and keeps agency editing for managers', () => {
  const callbacks = mount()
  expect(screen.getAllByRole('button', { name: 'Edit template' })).toHaveLength(1)
  fireEvent.click(screen.getAllByText('Preview content')[0])
  expect(screen.getByText('Hello [first name]')).toBeTruthy()
  fireEvent.click(screen.getAllByRole('button', { name: 'Use in campaign' })[0])
  expect(callbacks.onUse).toHaveBeenCalledWith(templates[0])
  fireEvent.click(screen.getAllByRole('button', { name: 'Duplicate' })[0])
  expect(callbacks.onDuplicate).toHaveBeenCalledWith(templates[0])
})
it('makes duplicate agency templates personal and preserves unsaved edits after a failed save', async () => {
  const onSave = vi.fn().mockRejectedValue(new Error('Storage unavailable'))
  render(<ChannelTemplateEditor template={templates[0]} duplicate userId="me" onSave={onSave} onCancel={vi.fn()} />)
  expect(screen.getByLabelText('Who can use this template?').value).toBe('personal')
  expect(screen.queryByRole('option', { name: 'Everyone in this agency' })).toBeNull()
  fireEvent.change(screen.getByLabelText('Message content'), { target: { value: 'Keep this wording' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save channel template' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('Message content').value).toBe('Keep this wording')
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Valuation email (copy)', visibility: 'personal', body: 'Keep this wording' }))
})
it('reports a load failure without presenting a false empty library', () => {
  const callbacks = mount({ error: 'Templates unavailable' })
  expect(screen.getByRole('alert').textContent).toContain('Templates unavailable')
  expect(screen.queryByRole('heading', { name: 'Create your first channel template' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retry channel templates' }))
  expect(callbacks.onRetry).toHaveBeenCalledOnce()
})
it('keeps one row of email starters usable while saved storage is unavailable', () => {
  const onStart = vi.fn()
  mount({ fixedChannel: 'email', templates: [], error: 'Channel template storage is not enabled in this environment yet.', onStart })
  const row = screen.getByRole('region', { name: 'Ready-made email starters' })
  expect(row.querySelectorAll('button')).toHaveLength(4)
  fireEvent.click(screen.getByRole('button', { name: 'Customise Property showcase' }))
  expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ channel: 'email', title: 'Your next chapter in [area]' }))
  expect(screen.getByRole('alert').textContent).toContain('You can still customise a ready-made starter')
})
it('passes edited starter copy to a campaign without saving to shared storage', async () => {
  const onUse = vi.fn().mockResolvedValue(undefined)
  const onSave = vi.fn()
  render(<ChannelTemplateEditor template={templates[0]} userId="me" onUse={onUse} onSave={onSave} onCancel={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Message content'), { target: { value: 'My tailored invitation' } })
  fireEvent.click(screen.getByRole('button', { name: 'Use in campaign' }))
  expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ body: 'My tailored invitation' }))
  expect(onSave).not.toHaveBeenCalled()
})
