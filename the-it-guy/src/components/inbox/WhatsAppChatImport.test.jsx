// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import WhatsAppChatImport from './WhatsAppChatImport'
const mocks = vi.hoisted(() => ({ org: 'one', admin: true, request: vi.fn() }))
vi.mock('../../hooks/useMetaWorkspace', () => ({ useMetaWorkspace: () => ({ organisationId: mocks.org, canManage: mocks.admin, senders: [{ id: 'sender', onboarding_mode: 'coexistence', connection_status: 'connected', display_phone_number: '+27686439449' }] }) }))
vi.mock('../../services/metaIntegrationService', () => ({ metaIntegrationRequest: mocks.request }))
const source = '[03/10/2026, 14:02:11] Samlin: Hello\n[03/10/2026, 14:03:15] Customer: Thanks'
beforeEach(() => { mocks.org = 'one'; mocks.admin = true; mocks.request.mockReset(); mocks.request.mockResolvedValue({ imported: 1, duplicates: 1 }) })
afterEach(cleanup)
async function setupReview() {
  fireEvent.click(screen.getByRole('button', { name: 'Import WhatsApp chat' }))
  fireEvent.change(screen.getByLabelText('Business WhatsApp number'), { target: { value: 'sender' } })
  fireEvent.change(screen.getByLabelText('Customer WhatsApp number'), { target: { value: '+27821234567' } })
  fireEvent.change(screen.getByLabelText('WhatsApp text export'), { target: { files: [{ name: 'Chat.txt', size: source.length, text: async () => source }] } })
  fireEvent.change(await screen.findByLabelText('Your business appears in this export as'), { target: { value: 'Samlin' } })
  fireEvent.click(screen.getByRole('button', { name: 'Review import' }))
  await screen.findByRole('region', { name: 'Review chat import' })
}
it('keeps uploaded content local until reviewed and explicitly confirmed, then reports duplicates', async () => {
  const done = vi.fn(); render(<WhatsAppChatImport onImported={done} />); await setupReview()
  expect(mocks.request).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Import reviewed messages' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: 'Import reviewed messages' }))
  await screen.findByText('1 messages imported. 1 duplicates skipped.')
  expect(mocks.request).toHaveBeenCalledWith('one', 'import_chat_export', expect.objectContaining({ source, businessAuthor: 'Samlin', senderId: 'sender' }))
  expect(done).toHaveBeenCalledOnce()
})
it('invalidates reviewed directions when fields change and clears personal data on organisation change', async () => {
  const view = render(<WhatsAppChatImport />); await setupReview()
  fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
  fireEvent.change(screen.getByLabelText('Customer WhatsApp number'), { target: { value: '+27821234568' } })
  expect(screen.queryByRole('button', { name: 'Import reviewed messages' })).toBeNull()
  mocks.org = 'two'; view.rerender(<WhatsAppChatImport />)
  expect(screen.queryByRole('dialog')).toBeNull(); expect(mocks.request).not.toHaveBeenCalled()
})
it('ignores an old organisation’s late import response', async () => {
  let resolve; mocks.request.mockImplementation(() => new Promise(done => { resolve = done }))
  const done = vi.fn(), view = render(<WhatsAppChatImport onImported={done} />); await setupReview()
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Import reviewed messages' }))
  mocks.org = 'two'; view.rerender(<WhatsAppChatImport onImported={done} />)
  resolve({ imported: 2, duplicates: 0 }); await waitFor(() => expect(done).not.toHaveBeenCalled())
  expect(screen.queryByRole('status')).toBeNull()
})
it('requires an original text export and hides import for non-admin staff', async () => {
  const view = render(<WhatsAppChatImport />)
  fireEvent.click(screen.getByRole('button', { name: 'Import WhatsApp chat' }))
  fireEvent.change(screen.getByLabelText('WhatsApp text export'), { target: { files: [{ name: 'Chat.zip', size: 200 }] } })
  await screen.findByText(/Extract a ZIP first/)
  expect(mocks.request).not.toHaveBeenCalled()
  mocks.admin = false; view.rerender(<WhatsAppChatImport />)
  expect(screen.queryByRole('button')).toBeNull()
})
