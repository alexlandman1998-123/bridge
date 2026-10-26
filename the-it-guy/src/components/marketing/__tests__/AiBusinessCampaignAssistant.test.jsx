// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
const runtime = vi.hoisted(() => ({ action: vi.fn(), persist: vi.fn() }))
vi.mock('../../../services/aiCampaignService', () => ({ aiCampaignAction: runtime.action }))
import AiBusinessCampaignAssistant from '../AiBusinessCampaignAssistant'
const builder = { template: 'client-check-in', source: { language: 'en-ZA' }, details: { area: 'Brooklyn' } }
const original = { email: { title: 'Manual title', body: 'Manual introduction.\n\nKeep my terms and destination.', timing: 'Manual' }, whatsapp: { title: 'Keep WhatsApp', body: 'Manual WhatsApp', timing: '' } }
const proposed = { ...original, email: { ...original.email, title: 'Proposed title', body: 'A proposed introduction.\n\nKeep my terms and destination.' } }
function Harness() {
  const [content, setContent] = useState(original)
  return <><label>Manual email title<input value={content.email.title} onChange={(event) => setContent({ ...content, email: { ...content.email, title: event.target.value } })} /></label><output>{content.email.body}</output><AiBusinessCampaignAssistant organisationId="agency" builder={builder} content={content} persist={runtime.persist} onApply={setContent} /></>
}
const result = { campaignId: 'saved', revision: 2, applicability: 'current', content: proposed, usageId: 'usage', plan: { approach: 'A voluntary personal check-in.' } }
beforeEach(() => { vi.clearAllMocks(); runtime.persist.mockResolvedValue({ id: 'saved', revision: 2 }); runtime.action.mockResolvedValue(result) })
afterEach(cleanup)
it('keeps manual copy until explicit apply and provides guarded undo', async () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: 'Generate proposal' }))
  await screen.findByRole('button', { name: 'Apply proposed wording' })
  expect(screen.getByLabelText('Manual email title').value).toBe('Manual title')
  fireEvent.click(screen.getByRole('button', { name: 'Apply proposed wording' }))
  expect(screen.getByLabelText('Manual email title').value).toBe('Proposed title')
  fireEvent.click(screen.getByRole('button', { name: 'Undo applied AI wording' }))
  expect(screen.getByLabelText('Manual email title').value).toBe('Manual title')
})
it('rejects a late response after a manual edit without replacing newer work', async () => {
  let resolve
  runtime.action.mockImplementation(() => new Promise((done) => { resolve = done }))
  render(<Harness />); fireEvent.click(screen.getByRole('button', { name: 'Generate proposal' }))
  await waitFor(() => expect(runtime.action).toHaveBeenCalled())
  fireEvent.change(screen.getByLabelText('Manual email title'), { target: { value: 'Newer manual title' } })
  resolve(result)
  await screen.findByRole('alert')
  expect(screen.getByLabelText('Manual email title').value).toBe('Newer manual title')
  expect(screen.queryByRole('button', { name: 'Apply proposed wording' })).toBeNull()
})
it('budget or provider failure retains current content and makes manual editing available', async () => {
  runtime.action.mockRejectedValue(new Error('Agency AI spending limit reached.'))
  render(<Harness />); fireEvent.click(screen.getByRole('button', { name: 'Generate proposal' }))
  expect((await screen.findByRole('alert')).textContent).toContain('spending limit')
  expect(screen.getByLabelText('Manual email title').value).toBe('Manual title')
})
it('discarding the proposed wording leaves the existing draft unchanged', async () => {
  render(<Harness />); fireEvent.click(screen.getByRole('button', { name: 'Generate proposal' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Keep current wording' }))
  expect(screen.getByLabelText('Manual email title').value).toBe('Manual title')
  expect(screen.queryByRole('button', { name: 'Apply proposed wording' })).toBeNull()
})
